import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type Provider from 'oidc-provider'
import type { AppConfig } from './config.js'
import { ConfirmationRepository } from './confirmations.js'
import { CsrfProtection } from './csrf.js'
import { ClientRegistry } from './client-registry.js'
import { createDatabase, verifyDatabase, type Database } from './database.js'
import { AuthTransactionCookie } from './auth-transaction.js'
import { IdentityDirectory } from './identity.js'
import { interactionRouter } from './interactions.js'
import { createLogger, type Logger } from './logger.js'
import { LoginResultCookie } from './login-result.js'
import { postgresAdapter } from './postgres-adapter.js'
import { createProvider } from './provider.js'
import { SecretBox } from './secret-box.js'
import { SecurityEvents } from './security-events.js'
import { SupabaseAuthentication } from './supabase-auth.js'
import { stylesheet } from './views.js'

export interface IdentityService {
  app: express.Express
  database: Database
  logger: Logger
  provider: Provider
  close(): Promise<void>
}

export async function createIdentityService(config: AppConfig): Promise<IdentityService> {
  const logger = createLogger(config)
  const database = createDatabase(config)
  await verifyDatabase(database)

  const clientSecrets = new SecretBox(config.CLIENT_SECRET_ENCRYPTION_KEY)
  const authSecrets = new SecretBox(config.AUTH_TRANSACTION_KEY)
  const registry = new ClientRegistry(database, clientSecrets)
  const clients = await registry.activeClients()
  const identity = new IdentityDirectory(config)
  const confirmations = new ConfirmationRepository(database)
  const provider = createProvider(config, {
    clients,
    confirmations,
    identity,
    logger,
    adapter: postgresAdapter(database),
  })

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false)
  app.use(pinoHttp({ logger }) as RequestHandler)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'none'"],
        styleSrc: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.NODE_ENV === 'production'
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
      : false,
  }))
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 }))

  app.get('/assets/main.css', (_request, response) => {
    response.setHeader('Cache-Control', 'public, max-age=3600')
    response.type('text/css').send(stylesheet)
  })

  app.get('/health/live', (_request, response) => response.json({ ok: true, service: 'djai-sign-in' }))
  app.get('/health/ready', async (request, response) => {
    try {
      await verifyDatabase(database)
      const discovery = new URL('/.well-known/openid-configuration', config.OIDC_ISSUER).toString()
      return response.json({ ok: true, issuer: config.OIDC_ISSUER, discovery, clients: clients.length })
    } catch (error) {
      request.log.error({ err: error }, 'readiness check failed')
      return response.status(503).json({ ok: false })
    }
  })

  const secureCookies = config.NODE_ENV !== 'development'
  const csrf = new CsrfProtection(config.AUTH_TRANSACTION_KEY, secureCookies)
  const securityEvents = new SecurityEvents(database, logger, config.AUTH_TRANSACTION_KEY)
  app.use(interactionRouter({
    auth: new SupabaseAuthentication(config),
    authTransaction: new AuthTransactionCookie(authSecrets, secureCookies),
    config,
    confirmations,
    csrf,
    identity,
    logger,
    loginResult: new LoginResultCookie(authSecrets, secureCookies),
    provider,
    securityEvents,
  }))

  app.use('/oauth', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }))

  const oidcCallback = provider.callback()
  app.use((request, response) => oidcCallback(request, response))

  const errors: ErrorRequestHandler = (error, request, response, _next) => {
    request.log.error({ err: error }, 'request failed')
    if (response.headersSent) return
    response.setHeader('Cache-Control', 'no-store')
    response.status(500).json({ error: 'server_error' })
  }
  app.use(errors)

  return {
    app,
    database,
    logger,
    provider,
    async close() {
      await database.end()
    },
  }
}
