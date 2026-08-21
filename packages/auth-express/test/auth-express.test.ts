import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import express from 'express'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createDjaiAuthRouter, type DjaiIdentity } from '../src/index.js'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => Promise.all(servers.splice(0).map(async (server) => {
  const closed = once(server, 'close')
  server.close()
  server.closeAllConnections()
  await closed
})))

describe('@djai/auth-express', () => {
  it('owns discovery, code + PKCE, signed claims, persistence, encrypted session, and local logout', async () => {
    const issuer = await testIssuer()
    const identities: DjaiIdentity[] = []
    const app = express()
    app.use('/auth/djai', createDjaiAuthRouter({
      issuer: issuer.url,
      clientId: 'express-test-client',
      clientSecret: 'express-test-secret',
      callbackUrl: 'http://localhost:4000/auth/djai/callback',
      sessionKey: randomBytes(32),
      secureCookies: false,
      allowInsecureDevelopmentIssuer: true,
      async onSignIn(identity) { identities.push(identity) },
    }))
    const agent = request.agent(app)
    const login = await agent.get('/auth/djai/login')
    expect(login.status).toBe(302)
    const authorization = new URL(login.headers.location!)
    expect(authorization.searchParams.get('scope')).toBe('openid email')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    issuer.authorization = authorization
    const transactionCookie = login.headers['set-cookie'] as unknown as string[]
    expect(transactionCookie.join(';')).toContain('HttpOnly')
    expect(transactionCookie.join(';')).not.toContain(authorization.searchParams.get('state'))

    const callback = await agent.get(`/auth/djai/callback?code=single-use-code&state=${encodeURIComponent(authorization.searchParams.get('state')!)}`)
    expect(callback.status).toBe(303)
    expect(identities).toEqual([{
      issuer: issuer.url,
      uid: '11111111-1111-4111-8111-111111111111',
      email: 'verified@example.com',
    }])
    expect(issuer.tokenRequest?.challenge).toBe(authorization.searchParams.get('code_challenge'))
    expect(issuer.tokenRequest?.body.get('grant_type')).toBe('authorization_code')
    expect(issuer.tokenRequest?.body.get('redirect_uri')).toBe('http://localhost:4000/auth/djai/callback')

    expect((await agent.get('/auth/djai/session')).body).toEqual({
      authenticated: true,
      user: { uid: '11111111-1111-4111-8111-111111111111', email: 'verified@example.com' },
    })
    expect((await agent.post('/auth/djai/logout').set('origin', 'http://localhost:4000')).status).toBe(204)
    expect((await agent.get('/auth/djai/session')).body).toEqual({ authenticated: false })
  })

  it('rejects non-DJAI issuers unless they are explicit development loopback', () => {
    expect(() => createDjaiAuthRouter({
      issuer: 'https://attacker.example', clientId: 'x', clientSecret: 'x',
      callbackUrl: 'https://app.example/auth/djai/callback', sessionKey: randomBytes(32), async onSignIn() {},
    })).toThrow('DJAI issuer must be')
  })
})

async function testIssuer() {
  const keys = await generateKeyPair('RS256')
  const jwk = await exportJWK(keys.publicKey)
  Object.assign(jwk, { kid: 'test-key', use: 'sig', alg: 'RS256' })
  const fixture: {
    url: string
    authorization?: URL
    tokenRequest?: { body: URLSearchParams; challenge: string }
  } = { url: '' }
  // Test-only HTTP issuer; failures surface through the client request.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const server = createServer(async (req, res) => {
    if (req.url === '/.well-known/openid-configuration') return json(res, {
      issuer: fixture.url,
      authorization_endpoint: `${fixture.url}/oauth/authorize`,
      token_endpoint: `${fixture.url}/oauth/token`,
      jwks_uri: `${fixture.url}/oauth/jwks.json`,
      scopes_supported: ['openid', 'email'], response_types_supported: ['code'], response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code'], subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'],
      code_challenge_methods_supported: ['S256'], claims_supported: ['sub', 'email', 'email_verified'],
    })
    if (req.url === '/oauth/jwks.json') return json(res, { keys: [jwk] })
    if (req.url === '/oauth/token' && req.method === 'POST') {
      const body = new URLSearchParams(await bodyOf(req))
      const verifier = body.get('code_verifier')!
      fixture.tokenRequest = { body, challenge: createHash('sha256').update(verifier).digest('base64url') }
      const now = Math.floor(Date.now() / 1000)
      const idToken = await new SignJWT({ email: 'Verified@Example.com', email_verified: true, nonce: fixture.authorization?.searchParams.get('nonce') })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(fixture.url).setAudience('express-test-client').setSubject('11111111-1111-4111-8111-111111111111')
        .setIssuedAt(now).setExpirationTime(now + 300).sign(keys.privateKey)
      return json(res, { access_token: 'opaque-unused', token_type: 'Bearer', expires_in: 300, id_token: idToken })
    }
    res.statusCode = 404
    res.end()
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing issuer address')
  fixture.url = `http://127.0.0.1:${address.port}`
  return fixture
}

function json(response: ServerResponse, value: unknown): void {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(value))
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
