import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { exportJWK, createRemoteJWKSet, jwtVerify } from 'jose'
import type { Adapter, AdapterPayload, ClientMetadata } from 'oidc-provider'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppConfig } from '../src/config.js'
import type { ConfirmationRepository } from '../src/confirmations.js'
import type { IdentityDirectory } from '../src/identity.js'
import { createLogger } from '../src/logger.js'
import { createProvider } from '../src/provider.js'

const subject = '11111111-1111-4111-8111-111111111111'
const callbackUri = 'https://client.example/callback'
const client: ClientMetadata = {
  client_id: 'test-web',
  client_secret: 'test-secret-with-enough-entropy',
  client_name: 'Test application',
  redirect_uris: [callbackUri],
  response_types: ['code'],
  grant_types: ['authorization_code'],
  token_endpoint_auth_method: 'client_secret_basic',
  id_token_signed_response_alg: 'RS256',
  application_type: 'web',
  subject_type: 'public',
  scope: 'openid email',
}
const publicClient: ClientMetadata = {
  ...client,
  client_id: 'test-public',
  client_secret: undefined,
  token_endpoint_auth_method: 'none',
}

class MemoryAdapter implements Adapter {
  private static readonly stores = new Map<string, Map<string, AdapterPayload>>()
  private readonly store: Map<string, AdapterPayload>

  constructor(model: string) {
    this.store = MemoryAdapter.stores.get(model) ?? new Map<string, AdapterPayload>()
    MemoryAdapter.stores.set(model, this.store)
  }

  static clear(): void { this.stores.clear() }
  async upsert(id: string, payload: AdapterPayload): Promise<void> { this.store.set(id, structuredClone(payload)) }
  async find(id: string): Promise<AdapterPayload | undefined> { return structuredClone(this.store.get(id)) }
  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> { return this.by('userCode', userCode) }
  async findByUid(uid: string): Promise<AdapterPayload | undefined> { return this.by('uid', uid) }
  async consume(id: string): Promise<void> {
    const payload = this.store.get(id)
    if (!payload || payload.consumed) throw new Error('already consumed')
    payload.consumed = Math.floor(Date.now() / 1000)
  }
  async destroy(id: string): Promise<void> { this.store.delete(id) }
  async revokeByGrantId(grantId: string): Promise<void> {
    for (const [id, payload] of this.store) if (payload.grantId === grantId) this.store.delete(id)
  }
  private async by(key: 'uid' | 'userCode', value: string): Promise<AdapterPayload | undefined> {
    for (const payload of this.store.values()) if (payload[key] === value) return structuredClone(payload)
    return undefined
  }
}

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  MemoryAdapter.clear()
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('minimal DJAI OIDC provider', () => {
  it('publishes only the approved protocol capabilities', async () => {
    const fixture = await providerFixture()
    const discovery = await fetch(`${fixture.issuer}/.well-known/openid-configuration`).then((response) => response.json()) as Record<string, unknown>
    expect(discovery.issuer).toBe(fixture.issuer)
    expect(discovery.authorization_endpoint).toBe(`${fixture.issuer}/oauth/authorize`)
    expect(discovery.token_endpoint).toBe(`${fixture.issuer}/oauth/token`)
    expect(discovery.jwks_uri).toBe(`${fixture.issuer}/oauth/jwks.json`)
    expect(discovery.scopes_supported).toEqual(['openid', 'email'])
    expect(discovery.response_types_supported).toEqual(['code'])
    expect(discovery.code_challenge_methods_supported).toEqual(['S256'])
    expect(discovery.token_endpoint_auth_methods_supported).toEqual(expect.arrayContaining(['client_secret_basic', 'none']))
    expect(discovery.userinfo_endpoint).toBeUndefined()
    expect(discovery.registration_endpoint).toBeUndefined()
    expect(discovery.introspection_endpoint).toBeUndefined()
    expect(discovery.revocation_endpoint).toBeUndefined()
  })

  it('completes code + PKCE for an explicitly registered public client without a secret', async () => {
    const fixture = await providerFixture(false, publicClient)
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const authorize = new URL('/oauth/authorize', fixture.issuer)
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: publicClient.client_id, redirect_uri: callbackUri,
      scope: 'openid email', state: 'public-state', nonce: 'public-nonce',
      code_challenge: challenge, code_challenge_method: 'S256',
    }).toString()

    let next = authorize.toString()
    let cookies = ''
    for (let index = 0; index < 16; index += 1) {
      const response = await fetch(next, { redirect: 'manual', headers: cookies ? { cookie: cookies } : {} })
      cookies = mergeCookies(cookies, response.headers.getSetCookie())
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      next = new URL(location!, next).toString()
      if (next.startsWith(callbackUri)) break
    }
    const code = new URL(next).searchParams.get('code')
    expect(code).toBeTruthy()

    const tokenResponse = await fetch(`${fixture.issuer}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: publicClient.client_id,
        code: code!, redirect_uri: callbackUri, code_verifier: verifier,
      }),
    })
    expect(tokenResponse.status).toBe(200)
    const tokens = await tokenResponse.json() as Record<string, unknown>
    expect(tokens.id_token).toEqual(expect.any(String))
    expect(tokens.refresh_token).toBeUndefined()
  })

  it('completes code + PKCE and returns the minimal signed identity', async () => {
    const fixture = await providerFixture()
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const nonce = randomBytes(24).toString('base64url')
    const state = randomBytes(24).toString('base64url')
    const authorize = new URL('/oauth/authorize', fixture.issuer)
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: client.client_id, redirect_uri: callbackUri,
      scope: 'openid email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
    }).toString()

    let next = authorize.toString()
    let cookies = ''
    const history: string[] = []
    for (let index = 0; index < 16; index += 1) {
      const response = await fetch(next, { redirect: 'manual', headers: cookies ? { cookie: cookies } : {} })
      const setCookies = response.headers.getSetCookie()
      history.push(`${response.status} ${new URL(next).pathname} set=${setCookies.map((value) => value.split('=', 1)[0]).join(',')} sent=${cookies.split('; ').map((value) => value.split('=', 1)[0]).join(',')}`)
      cookies = mergeCookies(cookies, setCookies)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      next = new URL(location!, next).toString()
      if (next.startsWith(callbackUri)) break
    }

    const callback = new URL(next)
    expect(callback.origin + callback.pathname, [...history, ...fixture.prompts].join('\n')).toBe(callbackUri)
    expect(callback.searchParams.get('state')).toBe(state)
    const code = callback.searchParams.get('code')
    expect(code).toBeTruthy()

    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')
    const tokenResponse = await fetch(`${fixture.issuer}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: callbackUri, code_verifier: verifier }),
    })
    expect(tokenResponse.status).toBe(200)
    expect(tokenResponse.headers.get('cache-control')).toContain('no-store')
    const tokens = await tokenResponse.json() as Record<string, unknown>
    expect(tokens.access_token).toEqual(expect.any(String))
    expect(tokens.refresh_token).toBeUndefined()
    const { payload } = await jwtVerify(String(tokens.id_token), createRemoteJWKSet(new URL(`${fixture.issuer}/oauth/jwks.json`)), {
      issuer: fixture.issuer,
      audience: client.client_id,
    })
    expect(payload.sub).toBe(subject)
    expect(payload.email).toBe('verified@example.com')
    expect(payload.email_verified).toBe(true)
    expect(payload.nonce).toBe(nonce)
    expect(payload).not.toHaveProperty('profile')
    expect(payload).not.toHaveProperty('membership')

    const replay = await fetch(`${fixture.issuer}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: callbackUri, code_verifier: verifier }),
    })
    expect(replay.status).toBe(400)
    expect(await replay.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('applies dynamic client rotation and revocation without provider restart', async () => {
    const fixture = await providerFixture(true)
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const authorize = new URL('/oauth/authorize', fixture.issuer)
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: client.client_id, redirect_uri: callbackUri,
      scope: 'openid email', state: 'rotation-state', nonce: 'rotation-nonce',
      code_challenge: challenge, code_challenge_method: 'S256',
    }).toString()
    let next = authorize.toString()
    let cookies = ''
    for (let index = 0; index < 16; index += 1) {
      const response = await fetch(next, { redirect: 'manual', headers: cookies ? { cookie: cookies } : {} })
      cookies = mergeCookies(cookies, response.headers.getSetCookie())
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      next = new URL(location!, next).toString()
      if (next.startsWith(callbackUri)) break
    }
    const code = new URL(next).searchParams.get('code')
    expect(code).toBeTruthy()

    const rotatedSecret = 'rotated-secret-with-enough-entropy'
    await new MemoryAdapter('Client').upsert(client.client_id, { ...client, client_secret: rotatedSecret })
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code', code: code!, redirect_uri: callbackUri, code_verifier: verifier,
    })
    const oldSecret = await fetch(`${fixture.issuer}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    expect(oldSecret.status).toBe(401)
    const newSecret = await fetch(`${fixture.issuer}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${client.client_id}:${rotatedSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    expect(newSecret.status).toBe(200)

    await new MemoryAdapter('Client').destroy(client.client_id)
    const revokedAuthorize = await fetch(authorize, { redirect: 'manual' })
    expect(revokedAuthorize.status).toBe(400)
  })
})

async function providerFixture(dynamicClient = false, registeredClient: ClientMetadata = client) {
  const server = createServer()
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server address')
  const issuer = `http://127.0.0.1:${address.port}`
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = await exportJWK(privateKey)
  const config = {
    NODE_ENV: 'development', PORT: address.port, OIDC_ISSUER: issuer,
    DATABASE_URL: 'postgres://unused', DATABASE_SSL: 'disable',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'unused', SUPABASE_SECRET_KEY: 'unused',
    OIDC_COOKIE_KEYS: ['a'.repeat(32), 'b'.repeat(32)], AUTH_TRANSACTION_KEY: Buffer.alloc(32, 1),
    CLIENT_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 2), OIDC_JWKS: { keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] },
    TRUST_PROXY: false, LOG_LEVEL: 'silent', ENABLE_SIGNUP: true,
    DEVELOPER_CONSOLE_ENABLED: false, DEVELOPER_EMAIL_ALLOWLIST: [],
    ACCESS_TOKEN_TTL_SECONDS: 300, ID_TOKEN_TTL_SECONDS: 300, AUTH_CODE_TTL_SECONDS: 90,
    INTERACTION_TTL_SECONDS: 600, SESSION_TTL_SECONDS: 3600,
  } satisfies AppConfig
  const identity = {
    bySubject: async (requested: string) => requested === subject ? { subject, email: 'verified@example.com', emailVerified: true as const } : undefined,
  } as unknown as IdentityDirectory
  const grants = new Map<string, string>()
  const confirmations = { grantId: async (_accountId: string, clientId: string) => grants.get(clientId) } as unknown as ConfirmationRepository
  if (dynamicClient) await new MemoryAdapter('Client').upsert(registeredClient.client_id, registeredClient as AdapterPayload)
  const provider = createProvider(config, {
    clients: dynamicClient ? [] : [registeredClient], confirmations, identity, logger: createLogger(config), adapter: MemoryAdapter,
  })

  const prompts: string[] = []
  server.on('request', (request, response) => { void handleRequest(provider, request, response, prompts, grants) })
  return { issuer, provider, prompts }
}

async function handleRequest(provider: ReturnType<typeof createProvider>, request: IncomingMessage, response: ServerResponse, prompts: string[], grants: Map<string, string>): Promise<void> {
  try {
    if (request.url?.startsWith('/interaction/')) {
      const details = await provider.interactionDetails(request, response)
      prompts.push(`${details.prompt.name}:grant=${details.grantId ?? 'none'}:${details.prompt.reasons.join(',')}:${JSON.stringify(details.prompt.details)}`)
      if (details.prompt.name === 'login') {
        await provider.interactionFinished(request, response, { login: { accountId: subject, amr: ['pwd'] } }, { mergeWithLastSubmission: false })
        return
      }
      if (details.prompt.name === 'consent' && details.session) {
        const grant = new provider.Grant({ accountId: details.session.accountId, clientId: String(details.params.client_id) })
        const scopes = Array.isArray(details.prompt.details.missingOIDCScope) ? details.prompt.details.missingOIDCScope.filter((item): item is string => typeof item === 'string') : []
        const claims = Array.isArray(details.prompt.details.missingOIDCClaims) ? details.prompt.details.missingOIDCClaims.filter((item): item is string => typeof item === 'string') : []
        if (scopes.length) grant.addOIDCScope(scopes)
        if (claims.length) grant.addOIDCClaims(claims)
        const grantId = await grant.save()
        grants.set(String(details.params.client_id), grantId)
        await provider.interactionFinished(request, response, { consent: { grantId } })
        return
      }
    }
    void provider.callback()(request, response)
  } catch (error) {
    response.statusCode = 500
    response.end(error instanceof Error ? error.message : 'error')
  }
}

function mergeCookies(existing: string, setCookies: string[]): string {
  const map = new Map(existing.split('; ').filter(Boolean).map((part) => {
    const index = part.indexOf('=')
    return [part.slice(0, index), part.slice(index + 1)]
  }))
  for (const cookie of setCookies) {
    const pair = cookie.split(';', 1)[0]
    if (!pair) continue
    const index = pair.indexOf('=')
    map.set(pair.slice(0, index), pair.slice(index + 1))
  }
  return [...map].map(([name, value]) => `${name}=${value}`).join('; ')
}
