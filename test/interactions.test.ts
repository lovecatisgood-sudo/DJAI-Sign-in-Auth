import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { interactionRouter } from '../src/interactions.js'

describe('identity interaction recovery', () => {
  it('renders an expired interaction as a user-safe restart page', async () => {
    const app = interactionApp({
      name: 'SessionNotFound',
      error: 'invalid_request',
      error_description: 'interaction session not found',
      status: 400,
      statusCode: 400,
      expose: true,
    })

    const response = await request(app).get('/interaction/expired')

    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-djai-error-reference']).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.text).toContain('Sign-in expired')
    expect(response.text).toContain('start sign-in again')
    expect(response.text).not.toContain('interaction session not found')
    expect(response.body).not.toEqual({ error: 'server_error' })
  })

  it('renders unexpected interaction failures without exposing exception details', async () => {
    const app = interactionApp(new Error('database password leaked here'))

    const response = await request(app).get('/interaction/broken')

    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-djai-error-reference']).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.text).toContain('Unable to continue')
    expect(response.text).toContain('reference')
    expect(response.text).not.toContain('database password leaked here')
    expect(response.body).not.toEqual({ error: 'server_error' })
  })
})

describe('identity interaction intent', () => {
  it('renders a Thai, prefilled login from standard OIDC hints', async () => {
    const app = interactionViewApp({
      client_id: 'djai-studio-web',
      login_hint: 'operator@example.com',
      ui_locales: 'th en',
    })

    const response = await request(app).get('/interaction/current')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<html lang="th">')
    expect(response.text).toContain('value="operator@example.com"')
  })

  it('routes an explicit signup intent directly to localized account creation', async () => {
    const app = interactionViewApp({
      client_id: 'djai-studio-web',
      screen_hint: 'signup',
      ui_locales: 'en',
    })

    const response = await request(app).get('/interaction/current')

    expect(response.status).toBe(200)
    expect(response.text).toContain('Create a DJAI School account')
    expect(response.text).toContain('action="/interaction/current/signup"')
  })
})

function interactionApp(failure: unknown): express.Express {
  const app = express()
  const provider = {
    interactionDetails: async () => { throw failure },
  }
  const logger = {
    warn() {},
    error() {},
  }
  app.use(interactionRouter({ provider, logger } as unknown as Parameters<typeof interactionRouter>[0]))
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ error: 'server_error' })
  })
  return app
}

function interactionViewApp(params: Record<string, string>): express.Express {
  const app = express()
  const provider = {
    Client: { find: async () => ({ clientId: 'djai-studio-web', clientName: 'DJAI Studio' }) },
    interactionDetails: async () => ({
      uid: 'current',
      params,
      prompt: { name: 'login', details: {}, reasons: [] },
    }),
  }
  const csrf = { issue: () => 'csrf-token' }
  const config = { ENABLE_SIGNUP: true }
  app.use(interactionRouter({ provider, csrf, config } as unknown as Parameters<typeof interactionRouter>[0]))
  return app
}
