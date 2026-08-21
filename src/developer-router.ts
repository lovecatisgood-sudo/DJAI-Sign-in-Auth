import { randomBytes, randomUUID } from 'node:crypto'
import express, { Router, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { AppConfig } from './config.js'
import type { ClientRegistration, ClientRegistry } from './client-registry.js'
import type { CsrfProtection } from './csrf.js'
import type { DeveloperAccess, DeveloperIdentity } from './developer-access.js'
import type { DeveloperSession } from './developer-session.js'
import type { AuthTransactionCookie } from './auth-transaction.js'
import {
  renderCredentialResult,
  renderDeveloperConsole,
  renderDeveloperLogin,
  renderDeveloperMessage,
} from './developer-views.js'
import type { IdentityDirectory } from './identity.js'
import type { SupabaseAuthentication } from './supabase-auth.js'
import { MutableAuthStorage } from './supabase-auth.js'

interface DeveloperRouterDependencies {
  access: DeveloperAccess
  auth: SupabaseAuthentication
  authTransaction: AuthTransactionCookie
  clients: ClientRegistry
  config: AppConfig
  csrf: CsrfProtection
  identity: IdentityDirectory
  session: DeveloperSession
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

export function developerRouter(dependencies: DeveloperRouterDependencies): Router {
  const router = Router()
  router.use('/developer', limiter)
  router.use('/developer', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  router.use('/developer/api', express.json({ limit: '16kb' }))

  if (!dependencies.config.DEVELOPER_CONSOLE_ENABLED) {
    router.use('/developer', (_request, response) => response.status(404).send('Not found'))
    return router
  }

  router.get('/developer/login', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    return response.type('html').send(renderDeveloperLogin(dependencies.csrf.issue(response, 'developer-login')))
  })

  router.post('/developer/login', asyncHandler(async (request, response) => {
    if (!dependencies.csrf.verify(request, field(request, 'csrf'), 'developer-login')) {
      return response.status(403).type('html').send(renderDeveloperMessage('Request expired', 'Reload the developer login and try again.', '/developer/login'))
    }
    const email = text(field(request, 'email'), 320)
    const password = text(field(request, 'password'), 200)
    const user = email && password ? await dependencies.auth.password(email, password) : undefined
    const verified = user ? await dependencies.identity.fromAuthenticatedUser(user) : undefined
    const developer = verified ? await dependencies.access.authorize(verified) : undefined
    if (!developer) {
      const csrf = dependencies.csrf.issue(response, 'developer-login')
      return response.status(401).type('html').send(renderDeveloperLogin(csrf, 'This account is not an approved, active DJAI developer.'))
    }
    dependencies.session.write(response, developer)
    return response.redirect(303, '/developer')
  }))

  router.post('/developer/google', asyncHandler(async (request, response) => {
    if (!dependencies.csrf.verify(request, field(request, 'csrf'), 'developer-login')) {
      return response.status(403).type('html').send(renderDeveloperMessage('Request expired', 'Reload the developer login and try again.', '/developer/login'))
    }
    const storage = new MutableAuthStorage()
    const transactionId = randomUUID()
    const callback = `${dependencies.config.OIDC_ISSUER}/developer/auth/callback?tx=${encodeURIComponent(transactionId)}`
    const destination = await dependencies.auth.startGoogle(storage, callback)
    dependencies.authTransaction.write(response, transactionId, {
      interactionUid: 'developer', kind: 'google', storage: storage.values, createdAt: Date.now(),
    })
    return response.redirect(303, destination)
  }))

  router.get('/developer/auth/callback', asyncHandler(async (request, response) => {
    const transactionId = typeof request.query.tx === 'string' ? request.query.tx : undefined
    const code = typeof request.query.code === 'string' ? request.query.code : undefined
    if (!transactionId || !code) return response.status(400).type('html').send(renderDeveloperMessage('Sign-in expired', 'Return to the developer login and start again.', '/developer/login'))
    const transaction = dependencies.authTransaction.read(request, transactionId)
    dependencies.authTransaction.clear(response, transactionId)
    if (!transaction || transaction.interactionUid !== 'developer') {
      return response.status(400).type('html').send(renderDeveloperMessage('Sign-in expired', 'Return to the developer login and start again.', '/developer/login'))
    }
    const user = await dependencies.auth.exchangeCallback(new MutableAuthStorage(transaction.storage), code)
    const verified = user ? await dependencies.identity.fromAuthenticatedUser(user) : undefined
    const developer = verified ? await dependencies.access.authorize(verified) : undefined
    if (!developer) return response.status(401).type('html').send(renderDeveloperMessage('Access denied', 'This account is not an approved, active DJAI developer.', '/developer/login'))
    dependencies.session.write(response, developer)
    return response.redirect(303, '/developer')
  }))

  router.get('/developer', asyncHandler(async (request, response) => {
    const developer = await sessionDeveloper(dependencies, request, response)
    if (!developer) return response.redirect(303, '/developer/login')
    const [clients, tokens] = await Promise.all([
      dependencies.clients.listForDeveloper(developer.subject),
      dependencies.access.listTokens(developer.subject),
    ])
    response.setHeader('Cache-Control', 'no-store')
    return response.type('html').send(renderDeveloperConsole({
      csrf: dependencies.csrf.issue(response, developer.subject),
      email: developer.email,
      clients,
      tokens,
      canProduction: developer.canProduction,
    }))
  }))

  router.post('/developer/logout', asyncHandler(async (request, response) => {
    const developer = await sessionDeveloper(dependencies, request, response)
    if (!developer || !dependencies.csrf.verify(request, field(request, 'csrf'), developer.subject)) {
      return response.status(403).type('html').send(renderDeveloperMessage('Request expired', 'Reload the console and try again.'))
    }
    dependencies.session.clear(response)
    return response.redirect(303, '/developer/login')
  }))

  router.post('/developer/clients', asyncHandler(async (request, response) => {
    const developer = await requireFormDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      const registration = registrationFrom(request, developer)
      const created = await dependencies.clients.register(registration, actor(developer), developer.subject)
      return response.type('html').send(renderCredentialResult({
        title: 'Application created',
        issuer: dependencies.config.OIDC_ISSUER,
        clientId: created.clientId,
        clientSecret: created.clientSecret,
        callbackUrl: registration.redirectUris[0]!,
      }))
    } catch {
      return response.status(400).type('html').send(renderDeveloperMessage('Unable to create application', 'Check every URL and try a unique application name.'))
    }
  }))

  router.post('/developer/clients/:clientId/rotate', asyncHandler(async (request, response) => {
    const developer = await requireFormDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      const clientId = clientIdFrom(request)
      const secret = await dependencies.clients.rotateSecret(clientId, actor(developer), developer.subject)
      const client = (await dependencies.clients.listForDeveloper(developer.subject)).find((item) => item.clientId === clientId)
      return response.type('html').send(renderCredentialResult({
        title: 'Client secret rotated', issuer: dependencies.config.OIDC_ISSUER, clientId, clientSecret: secret, callbackUrl: client?.redirectUris[0] ?? '',
      }))
    } catch {
      return response.status(404).type('html').send(renderDeveloperMessage('Application not found', 'The application is unavailable or does not belong to this developer.'))
    }
  }))

  router.post('/developer/clients/:clientId/revoke', asyncHandler(async (request, response) => {
    const developer = await requireFormDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      await dependencies.clients.revoke(clientIdFrom(request), actor(developer), developer.subject)
      return response.redirect(303, '/developer')
    } catch {
      return response.status(404).type('html').send(renderDeveloperMessage('Application not found', 'The application is unavailable or does not belong to this developer.'))
    }
  }))

  router.post('/developer/tokens', asyncHandler(async (request, response) => {
    const developer = await requireFormDeveloper(dependencies, request, response)
    if (!developer) return
    const name = text(field(request, 'name'), 80)
    if (!name) return response.status(400).type('html').send(renderDeveloperMessage('Token name required', 'Enter a name for this workstation.'))
    const created = await dependencies.access.createToken(developer.subject, name)
    return response.type('html').send(renderCredentialResult({ title: 'CLI token created', developerToken: created.token }))
  }))

  router.post('/developer/tokens/:tokenId/revoke', asyncHandler(async (request, response) => {
    const developer = await requireFormDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      await dependencies.access.revokeToken(developer.subject, String(request.params.tokenId))
      return response.redirect(303, '/developer')
    } catch {
      return response.status(404).type('html').send(renderDeveloperMessage('Token not found', 'The token is unavailable or already inactive.'))
    }
  }))

  router.get('/developer/api/v1/clients', asyncHandler(async (request, response) => {
    const developer = await apiDeveloper(dependencies, request, response)
    if (!developer) return
    return response.json({ clients: await dependencies.clients.listForDeveloper(developer.subject) })
  }))

  router.post('/developer/api/v1/clients', asyncHandler(async (request, response) => {
    const developer = await apiDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      const registration = registrationFrom(request, developer)
      const created = await dependencies.clients.register(registration, actor(developer), developer.subject)
      return response.status(201).json({
        issuer: dependencies.config.OIDC_ISSUER,
        client_id: created.clientId,
        client_secret: created.clientSecret,
        callback_url: registration.redirectUris[0],
        scope: 'openid email',
        install: 'npm install @djai/auth-express',
      })
    } catch {
      return response.status(400).json({ error: 'invalid_client_registration' })
    }
  }))

  router.post('/developer/api/v1/clients/:clientId/rotate', asyncHandler(async (request, response) => {
    const developer = await apiDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      const clientId = clientIdFrom(request)
      const clientSecret = await dependencies.clients.rotateSecret(clientId, actor(developer), developer.subject)
      return response.json({ client_id: clientId, client_secret: clientSecret })
    } catch {
      return response.status(404).json({ error: 'client_not_found' })
    }
  }))

  router.delete('/developer/api/v1/clients/:clientId', asyncHandler(async (request, response) => {
    const developer = await apiDeveloper(dependencies, request, response)
    if (!developer) return
    try {
      await dependencies.clients.revoke(clientIdFrom(request), actor(developer), developer.subject)
      return response.sendStatus(204)
    } catch {
      return response.status(404).json({ error: 'client_not_found' })
    }
  }))

  return router
}

async function sessionDeveloper(dependencies: DeveloperRouterDependencies, request: Request, response: Response): Promise<DeveloperIdentity | undefined> {
  const session = dependencies.session.read(request)
  if (!session) return undefined
  const verified = await dependencies.identity.bySubject(session.subject)
  const developer = verified ? await dependencies.access.authorize(verified) : undefined
  if (!developer) dependencies.session.clear(response)
  return developer
}

async function requireFormDeveloper(dependencies: DeveloperRouterDependencies, request: Request, response: Response): Promise<DeveloperIdentity | undefined> {
  const developer = await sessionDeveloper(dependencies, request, response)
  if (!developer) {
    response.status(401).type('html').send(renderDeveloperMessage('Sign in required', 'Open the developer console and sign in.', '/developer/login'))
    return undefined
  }
  if (!dependencies.csrf.verify(request, field(request, 'csrf'), developer.subject)) {
    response.status(403).type('html').send(renderDeveloperMessage('Request expired', 'Reload the console and try again.'))
    return undefined
  }
  return developer
}

async function apiDeveloper(dependencies: DeveloperRouterDependencies, request: Request, response: Response): Promise<DeveloperIdentity | undefined> {
  response.setHeader('Cache-Control', 'no-store')
  const authorization = request.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
  const tokenDeveloper = token ? await dependencies.access.authenticateToken(token) : undefined
  const verified = tokenDeveloper ? await dependencies.identity.bySubject(tokenDeveloper.subject) : undefined
  const developer = verified ? await dependencies.access.authorize(verified) : undefined
  if (!developer) response.status(401).json({ error: 'invalid_developer_token' })
  return developer
}

function registrationFrom(request: Request, developer: DeveloperIdentity): ClientRegistration {
  const displayName = required(request, 'displayName', 100)
  const environment = required(request, 'environment', 20)
  if (!['development', 'staging', 'production'].includes(environment)) throw new Error('Invalid environment')
  if (environment === 'production' && !developer.canProduction) throw new Error('Production access denied')
  const redirects = Array.isArray(value(request, 'redirectUris'))
    ? (value(request, 'redirectUris') as unknown[]).map(String)
    : [required(request, 'redirectUri', 2048)]
  const slug = displayName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'djai-app'
  return {
    clientId: `${slug}-${environment}-${randomBytes(3).toString('hex')}`,
    displayName,
    environment: environment as ClientRegistration['environment'],
    redirectUris: redirects,
    homeUrl: required(request, 'homeUrl', 2048),
    policyUrl: required(request, 'policyUrl', 2048),
    termsUrl: required(request, 'termsUrl', 2048),
    ownerEmail: developer.email,
    securityContact: developer.email,
  }
}

function actor(developer: DeveloperIdentity): string {
  return `developer:${developer.subject}`
}

function clientIdFrom(request: Request): string {
  const id = request.params.clientId
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id)) throw new Error('Invalid client')
  return id
}

function field(request: Request, key: string): unknown {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? (request.body as Record<string, unknown>)[key]
    : undefined
}

function value(request: Request, key: string): unknown {
  return field(request, key)
}

function required(request: Request, key: string, max: number): string {
  const result = text(value(request, key), max)
  if (!result) throw new Error(`Missing ${key}`)
  return result
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : undefined
}

function asyncHandler(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: (error?: unknown) => void): void => {
    handler(request, response).catch(next)
  }
}
