import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import * as oidc from 'openid-client'
import pg from 'pg'

const PRODUCTION_ISSUER = 'https://id.djai.academy'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface DjaiIdentity {
  issuer: string
  uid: string
  email: string
}

export interface DjaiAuthOptions {
  clientId: string
  clientSecret: string
  callbackUrl: string
  sessionKey: string | Buffer
  issuer?: string
  successRedirect?: string
  sessionTtlSeconds?: number
  secureCookies?: boolean
  allowInsecureDevelopmentIssuer?: boolean
  databaseUrl?: string
  onSignIn?(identity: DjaiIdentity): Promise<void>
}

interface Transaction {
  state: string
  nonce: string
  verifier: string
  createdAt: number
}

interface Session extends DjaiIdentity {
  createdAt: number
}

export function createDjaiAuthRouter(options: DjaiAuthOptions): Router {
  const issuer = new URL(options.issuer ?? PRODUCTION_ISSUER)
  const callback = new URL(options.callbackUrl)
  const insecure = issuer.protocol === 'http:'
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)
  if (issuer.href.replace(/\/$/, '') !== PRODUCTION_ISSUER && !(options.allowInsecureDevelopmentIssuer && insecure && loopback)) {
    throw new Error(`DJAI issuer must be ${PRODUCTION_ISSUER}; only explicit loopback development issuers are allowed`)
  }
  if (callback.protocol !== 'https:' && !(options.allowInsecureDevelopmentIssuer && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname))) {
    throw new Error('DJAI callback must use HTTPS outside explicit loopback development')
  }
  const key = decodeKey(options.sessionKey)
  if (!options.databaseUrl && !options.onSignIn) throw new Error('Provide databaseUrl or onSignIn to persist DJAI identity')
  const secure = options.secureCookies ?? callback.protocol === 'https:'
  const sessionName = secure ? '__Host-djai-app-session' : 'djai-app-session'
  const transactionName = secure ? '__Host-djai-app-transaction' : 'djai-app-transaction'
  const ttl = options.sessionTtlSeconds ?? 43_200
  const successRedirect = safeLocalPath(options.successRedirect ?? '/')
  let configuration: Promise<oidc.Configuration> | undefined

  function discover(): Promise<oidc.Configuration> {
    configuration ??= oidc.discovery(
      issuer,
      options.clientId,
      { token_endpoint_auth_method: 'client_secret_basic' },
      oidc.ClientSecretBasic(options.clientSecret),
      insecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
    )
    return configuration
  }

  const router = Router()
  router.get('/login', asyncRoute(async (_request, response) => {
    const config = await discover()
    const verifier = oidc.randomPKCECodeVerifier()
    const challenge = await oidc.calculatePKCECodeChallenge(verifier)
    const transaction: Transaction = {
      verifier,
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      createdAt: Date.now(),
    }
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callback.href,
      response_type: 'code',
      scope: 'openid email',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: transaction.state,
      nonce: transaction.nonce,
    })
    setCookie(response, transactionName, seal(transaction, key), 600, secure)
    response.setHeader('Cache-Control', 'no-store')
    response.redirect(302, url.href)
  }))

  router.get('/callback', asyncRoute(async (request, response) => {
    const transaction = open<Transaction>(readCookies(request)[transactionName], key)
    clearCookie(response, transactionName, secure)
    if (!transaction || Date.now() - transaction.createdAt > 600_000) {
      return response.status(400).json({ error: 'expired_login_transaction' })
    }
    const current = new URL(callback)
    current.search = new URL(request.originalUrl, callback.origin).search
    const tokens = await oidc.authorizationCodeGrant(await discover(), current, {
      pkceCodeVerifier: transaction.verifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
    })
    if (tokens.refresh_token) throw new Error('DJAI returned an unexpected refresh token')
    const claims = tokens.claims()
    if (
      !claims
      || claims.iss !== issuer.href.replace(/\/$/, '')
      || !UUID.test(String(claims.sub))
      || typeof claims.email !== 'string'
      || !claims.email.includes('@')
      || claims.email_verified !== true
    ) throw new Error('DJAI returned invalid identity claims')
    const identity: DjaiIdentity = { issuer: claims.iss, uid: claims.sub, email: claims.email.trim().toLowerCase() }
    if (options.databaseUrl) await persistDjaiIdentity(options.databaseUrl, identity)
    if (options.onSignIn) await options.onSignIn(identity)
    setCookie(response, sessionName, seal({ ...identity, createdAt: Date.now() } satisfies Session, key), ttl, secure)
    return response.redirect(303, successRedirect)
  }))

  router.get('/session', (request, response) => {
    const session = open<Session>(readCookies(request)[sessionName], key)
    response.setHeader('Cache-Control', 'no-store')
    if (!session || Date.now() - session.createdAt > ttl * 1000) return response.json({ authenticated: false })
    return response.json({ authenticated: true, user: { uid: session.uid, email: session.email } })
  })

  router.post('/logout', (request, response) => {
    const origin = request.get('origin')
    if (origin && origin !== callback.origin) return response.sendStatus(403)
    clearCookie(response, sessionName, secure)
    return response.sendStatus(204)
  })
  return router
}

export async function persistDjaiIdentity(databaseUrl: string, identity: DjaiIdentity): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'djai-auth-express' })
  await client.connect()
  try {
    await client.query(`create table if not exists djai_external_identities (
      issuer text not null,
      subject uuid not null,
      email_at_last_login text not null,
      first_seen_at timestamptz not null default now(),
      last_login_at timestamptz not null default now(),
      primary key (issuer, subject)
    )`)
    await client.query(
      `insert into djai_external_identities (issuer, subject, email_at_last_login)
       values ($1, $2::uuid, $3)
       on conflict (issuer, subject) do update
       set email_at_last_login = excluded.email_at_last_login, last_login_at = now()`,
      [identity.issuer, identity.uid, identity.email],
    )
  } finally {
    await client.end()
  }
}

function decodeKey(input: string | Buffer): Buffer {
  const key = Buffer.isBuffer(input) ? input : Buffer.from(input, 'base64')
  if (key.length !== 32) throw new Error('DJAI session key must decode to exactly 32 bytes')
  return key
}

function seal(value: unknown, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

function open<T>(value: string | undefined, key: Buffer): T | undefined {
  if (!value) return undefined
  try {
    const [version, ivValue, tagValue, encryptedValue, extra] = value.split('.')
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue || extra) return undefined
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')) as T
  } catch {
    return undefined
  }
}

function readCookies(request: Pick<Request, 'headers'>): Record<string, string> {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').flatMap((part) => {
    const index = part.indexOf('=')
    if (index < 1) return []
    try { return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]] }
    catch { return [] }
  }))
}

function setCookie(response: Response, name: string, value: string, maxAge: number, secure: boolean): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAge)}`]
  if (secure) parts.push('Secure')
  appendCookie(response, parts.join('; '))
}

function clearCookie(response: Response, name: string, secure: boolean): void {
  setCookie(response, name, '', 0, secure)
}

function appendCookie(response: Response, value: string): void {
  const current = response.getHeader('Set-Cookie')
  response.setHeader('Set-Cookie', [...(Array.isArray(current) ? current.map(String) : current ? [String(current)] : []), value])
}

function safeLocalPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) throw new Error('successRedirect must be a local absolute path')
  return value
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: (error?: unknown) => void): void => {
    handler(request, response).catch(next)
  }
}
