import { randomBytes } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/config.js'
import { AuthTransactionCookie } from '../src/auth-transaction.js'
import { CsrfProtection } from '../src/csrf.js'
import { developerRouter } from '../src/developer-router.js'
import { DeveloperSession } from '../src/developer-session.js'
import { SecretBox } from '../src/secret-box.js'
import type { ClientRegistry } from '../src/client-registry.js'
import type { DeveloperAccess, DeveloperIdentity } from '../src/developer-access.js'
import type { IdentityDirectory } from '../src/identity.js'
import type { SupabaseAuthentication } from '../src/supabase-auth.js'

const identity: DeveloperIdentity = {
  subject: '11111111-1111-4111-8111-111111111111',
  email: 'developer@djai.academy',
  emailVerified: true,
  canProduction: true,
}

function fixture(approved = true) {
  const clients = {
    listForDeveloper: vi.fn().mockResolvedValue([]),
    register: vi.fn().mockResolvedValue({ clientId: 'new-app-development-a1b2c3', clientSecret: 'one-time-secret' }),
    rotateSecret: vi.fn().mockResolvedValue('rotated-secret'),
    revoke: vi.fn().mockResolvedValue(undefined),
  }
  const access = {
    authorize: vi.fn().mockResolvedValue(approved ? identity : undefined),
    bySubject: vi.fn().mockResolvedValue(approved ? identity : undefined),
    listTokens: vi.fn().mockResolvedValue([]),
    authenticateToken: vi.fn().mockResolvedValue(approved ? identity : undefined),
    createToken: vi.fn().mockResolvedValue({ token: 'djai_dev_token', summary: {} }),
    revokeToken: vi.fn().mockResolvedValue(undefined),
  }
  const auth = {
    password: vi.fn().mockResolvedValue({ id: identity.subject }),
    startGoogle: vi.fn().mockImplementation(async (_storage, callback: string) => `https://accounts.google.test/auth?redirect_uri=${encodeURIComponent(callback)}`),
    exchangeCallback: vi.fn().mockResolvedValue({ id: identity.subject }),
  }
  const directory = { fromAuthenticatedUser: vi.fn().mockResolvedValue(identity), bySubject: vi.fn().mockResolvedValue(approved ? identity : undefined) }
  const config = { DEVELOPER_CONSOLE_ENABLED: true, OIDC_ISSUER: 'https://id.djai.academy' } as AppConfig
  const csrf = new CsrfProtection(randomBytes(32), false, 'developer-test-csrf')
  const authTransaction = new AuthTransactionCookie(new SecretBox(randomBytes(32)), false)
  const session = new DeveloperSession(new SecretBox(randomBytes(32)), false)
  const app = express()
  app.use(express.urlencoded({ extended: false }))
  app.use(developerRouter({
    access: access as unknown as DeveloperAccess,
    auth: auth as unknown as SupabaseAuthentication,
    authTransaction,
    clients: clients as unknown as ClientRegistry,
    config,
    csrf,
    identity: directory as unknown as IdentityDirectory,
    session,
  }))
  return { access, app, auth, clients, directory }
}

async function login(agent: ReturnType<typeof request.agent>) {
  const page = await agent.get('/developer/login')
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)?.[1]
  expect(csrf).toBeTruthy()
  return agent.post('/developer/login').type('form').send({ csrf, email: identity.email, password: 'correct-password' })
}

describe('approved developer control plane', () => {
  it('creates a console session only for an approved active identity', async () => {
    const approved = fixture(true)
    const approvedAgent = request.agent(approved.app)
    expect((await login(approvedAgent)).status).toBe(303)
    expect((await approvedAgent.get('/developer')).text).toContain('Create an application')

    const denied = fixture(false)
    const deniedAgent = request.agent(denied.app)
    const response = await login(deniedAgent)
    expect(response.status).toBe(401)
    expect(response.text).toContain('not an approved, active DJAI developer')
  })

  it('supports the same Google PKCE login used by DJAI School', async () => {
    const approved = fixture(true)
    const agent = request.agent(approved.app)
    const page = await agent.get('/developer/login')
    const csrf = page.text.match(/name="csrf" value="([^"]+)"/)?.[1]
    const start = await agent.post('/developer/google').type('form').send({ csrf })
    expect(start.status).toBe(303)
    expect(start.headers.location).toContain('https://accounts.google.test/auth')
    const callback = approved.auth.startGoogle.mock.calls[0]?.[1] as string
    const transactionId = new URL(callback).searchParams.get('tx')
    const complete = await agent.get(`/developer/auth/callback?tx=${transactionId}&code=valid-code`)
    expect(complete.status).toBe(303)
    expect(complete.headers.location).toBe('/developer')
    expect(approved.auth.exchangeCallback).toHaveBeenCalledWith(expect.anything(), 'valid-code')
  })

  it('uses bearer developer identity as the client owner and returns a secret once', async () => {
    const { app, clients } = fixture(true)
    const response = await request(app)
      .post('/developer/api/v1/clients')
      .set('authorization', 'Bearer djai_dev_valid')
      .send({
        displayName: 'New App', environment: 'development',
        redirectUris: ['http://localhost:4000/auth/djai/callback'],
        homeUrl: 'http://localhost:4000/', policyUrl: 'http://localhost:4000/privacy', termsUrl: 'http://localhost:4000/terms',
      })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ client_id: 'new-app-development-a1b2c3', client_secret: 'one-time-secret', scope: 'openid email' })
    expect(clients.register).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: identity.email }), `developer:${identity.subject}`, identity.subject)
    const list = await request(app).get('/developer/api/v1/clients').set('authorization', 'Bearer djai_dev_valid')
    expect(list.body).not.toHaveProperty('client_secret')
  })

  it('scopes rotate and revoke to the authenticated owner', async () => {
    const { app, clients } = fixture(true)
    await request(app).post('/developer/api/v1/clients/app-one/rotate').set('authorization', 'Bearer djai_dev_valid')
    await request(app).delete('/developer/api/v1/clients/app-one').set('authorization', 'Bearer djai_dev_valid')
    expect(clients.rotateSecret).toHaveBeenCalledWith('app-one', `developer:${identity.subject}`, identity.subject)
    expect(clients.revoke).toHaveBeenCalledWith('app-one', `developer:${identity.subject}`, identity.subject)
  })

  it('rejects missing or invalid developer tokens', async () => {
    const { app, access } = fixture(false)
    expect((await request(app).get('/developer/api/v1/clients')).status).toBe(401)
    expect((await request(app).get('/developer/api/v1/clients').set('authorization', 'Bearer invalid')).status).toBe(401)
    expect(access.authenticateToken).toHaveBeenCalledWith('invalid')
  })

  it('rechecks current School account status for sessions and API tokens', async () => {
    const fixtureValue = fixture(true)
    const agent = request.agent(fixtureValue.app)
    expect((await login(agent)).status).toBe(303)
    fixtureValue.directory.bySubject.mockResolvedValue(undefined)
    expect((await agent.get('/developer')).status).toBe(303)
    expect((await request(fixtureValue.app).get('/developer/api/v1/clients').set('authorization', 'Bearer djai_dev_valid')).status).toBe(401)
  })
})
