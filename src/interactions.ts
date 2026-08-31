import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type Provider from 'oidc-provider'
import type { AppConfig } from './config.js'
import type { ConfirmationRepository } from './confirmations.js'
import type { CsrfProtection } from './csrf.js'
import type { IdentityDirectory, VerifiedIdentity } from './identity.js'
import type { Logger } from './logger.js'
import type { LoginResultCookie } from './login-result.js'
import type { SecurityEvents } from './security-events.js'
import { MutableAuthStorage, type SupabaseAuthentication } from './supabase-auth.js'
import type { AuthTransactionCookie } from './auth-transaction.js'
import { localeFrom, renderConsent, renderLogin, renderMessage, renderSignup, type Locale } from './views.js'

interface InteractionDependencies {
  auth: SupabaseAuthentication
  authTransaction: AuthTransactionCookie
  config: AppConfig
  confirmations: ConfirmationRepository
  csrf: CsrfProtection
  identity: IdentityDirectory
  logger: Logger
  loginResult: LoginResultCookie
  provider: Provider
  securityEvents: SecurityEvents
}

const interactionRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many sign-in attempts. Please try again shortly.',
})

export function interactionRouter(dependencies: InteractionDependencies): Router {
  const router = Router()
  router.use(interactionRateLimit)

  router.get('/interaction/:uid', asyncHandler(async (request, response) => {
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    const client = await dependencies.provider.Client.find(String(details.params.client_id))
    if (!client) return sendMessage(response, 400, 'Unable to continue', 'The requesting application is not registered.')
    const locale = interactionLocale(request.query.lang, details.params.ui_locales)
    const csrf = dependencies.csrf.issue(response, details.uid)
    response.setHeader('Cache-Control', 'no-store')

    if (details.prompt.name === 'login') {
      if (dependencies.config.ENABLE_SIGNUP && details.params.screen_hint === 'signup') {
        return response.type('html').send(renderSignup({
          uid: details.uid,
          csrf,
          clientName: client.clientName ?? client.clientId,
          locale,
        }))
      }
      const hintedEmail = emailHint(details.params.login_hint)
      return response.type('html').send(renderLogin({
        uid: details.uid,
        csrf,
        clientName: client.clientName ?? client.clientId,
        locale,
        allowSignup: dependencies.config.ENABLE_SIGNUP,
        ...(hintedEmail ? { emailHint: hintedEmail } : {}),
      }))
    }

    if (details.prompt.name === 'consent' && details.session?.accountId) {
      const identity = await dependencies.identity.bySubject(details.session.accountId)
      if (!identity) return sendMessage(response, 403, 'Unable to continue', 'This DJAI School account cannot sign in.')
      return response.type('html').send(renderConsent({
        uid: details.uid,
        csrf,
        clientName: client.clientName ?? client.clientId,
        ...(client.clientUri ? { clientUri: client.clientUri } : {}),
        ...(client.policyUri ? { policyUri: client.policyUri } : {}),
        ...(client.tosUri ? { tosUri: client.tosUri } : {}),
        email: identity.email,
        locale,
      }))
    }

    return sendMessage(response, 400, 'Unable to continue', 'The requested sign-in interaction is not supported.')
  }))

  router.post('/interaction/:uid/login', asyncHandler(async (request, response) => {
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    if (details.prompt.name !== 'login') throw new Error('Unexpected interaction prompt')
    if (!dependencies.csrf.verify(request, bodyField(request, 'csrf'), details.uid)) return sendMessage(response, 403, 'Request expired', 'Return to the application and start sign-in again.')

    const email = stringBody(bodyField(request, 'email'), 320)
    const password = stringBody(bodyField(request, 'password'), 200)
    const user = email && password ? await dependencies.auth.password(email, password) : undefined
    const identity = user ? await dependencies.identity.fromAuthenticatedUser(user) : undefined
    if (!identity) {
      await dependencies.securityEvents.record({ eventType: 'login_failed', clientId: String(details.params.client_id), request })
      const locale = interactionLocale(bodyField(request, 'lang'), details.params.ui_locales)
      const csrf = dependencies.csrf.issue(response, details.uid)
      const hintedEmail = emailHint(email)
      return response.status(401).type('html').send(renderLogin({
        uid: details.uid,
        csrf,
        clientName: String(details.params.client_id),
        locale,
        allowSignup: dependencies.config.ENABLE_SIGNUP,
        ...(hintedEmail ? { emailHint: hintedEmail } : {}),
        error: genericLoginError(locale),
      }))
    }

    await finishLogin(dependencies, request, response, details.uid, identity, 'pwd')
  }))

  router.post('/interaction/:uid/google', asyncHandler(async (request, response) => {
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    if (details.prompt.name !== 'login') throw new Error('Unexpected interaction prompt')
    if (!dependencies.csrf.verify(request, bodyField(request, 'csrf'), details.uid)) return sendMessage(response, 403, 'Request expired', 'Return to the application and start sign-in again.')
    const storage = new MutableAuthStorage()
    const transactionId = randomUUID()
    const callback = `${dependencies.config.OIDC_ISSUER}/auth/callback?tx=${encodeURIComponent(transactionId)}`
    const destination = await dependencies.auth.startGoogle(storage, callback)
    dependencies.authTransaction.write(response, transactionId, {
      interactionUid: details.uid,
      kind: 'google',
      locale: interactionLocale(bodyField(request, 'lang'), details.params.ui_locales),
      storage: storage.values,
      createdAt: Date.now(),
    })
    return response.redirect(303, destination)
  }))

  router.get('/interaction/:uid/signup', asyncHandler(async (request, response) => {
    if (!dependencies.config.ENABLE_SIGNUP) return sendMessage(response, 404, 'Not found', 'Account creation is unavailable.')
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    const client = await dependencies.provider.Client.find(String(details.params.client_id))
    if (!client) return sendMessage(response, 400, 'Unable to continue', 'The requesting application is not registered.')
    const locale = interactionLocale(request.query.lang, details.params.ui_locales)
    response.setHeader('Cache-Control', 'no-store')
    return response.type('html').send(renderSignup({
      uid: details.uid,
      csrf: dependencies.csrf.issue(response, details.uid),
      clientName: client.clientName ?? client.clientId,
      locale,
    }))
  }))

  router.post('/interaction/:uid/signup', asyncHandler(async (request, response) => {
    if (!dependencies.config.ENABLE_SIGNUP) return sendMessage(response, 404, 'Not found', 'Account creation is unavailable.')
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    if (!dependencies.csrf.verify(request, bodyField(request, 'csrf'), details.uid)) return sendMessage(response, 403, 'Request expired', 'Return to the application and start sign-in again.')
    const email = stringBody(bodyField(request, 'email'), 320)
    const password = stringBody(bodyField(request, 'password'), 200)
    const locale = localeFrom(bodyField(request, 'lang'))
    if (!email || !password || password.length < 8) return sendMessage(response, 400, 'Unable to create account', 'Enter a valid email and a password of at least eight characters.')

    const storage = new MutableAuthStorage()
    const transactionId = randomUUID()
    const callback = `${dependencies.config.OIDC_ISSUER}/auth/callback?tx=${encodeURIComponent(transactionId)}`
    try {
      const result = await dependencies.auth.signup(storage, email, password, callback)
      if (result.user && !result.awaitingVerification) {
        const identity = await dependencies.identity.fromAuthenticatedUser(result.user)
        if (identity) return finishLogin(dependencies, request, response, details.uid, identity, 'pwd')
      }
      dependencies.authTransaction.write(response, transactionId, {
        interactionUid: details.uid,
        kind: 'signup',
        locale,
        storage: storage.values,
        createdAt: Date.now(),
      })
      return response.status(202).type('html').send(renderMessage(
        locale === 'th' ? 'ตรวจสอบอีเมลของคุณ' : 'Check your email',
        locale === 'th' ? 'เปิดลิงก์ยืนยันจาก DJAI School เพื่อดำเนินการเข้าสู่ระบบต่อ' : 'Open the verification link from DJAI School to continue signing in.',
        locale,
      ))
    } catch {
      await dependencies.securityEvents.record({ eventType: 'signup_failed', clientId: String(details.params.client_id), request })
      const csrf = dependencies.csrf.issue(response, details.uid)
      return response.status(400).type('html').send(renderSignup({
        uid: details.uid,
        csrf,
        clientName: String(details.params.client_id),
        locale,
        error: locale === 'th' ? 'ไม่สามารถสร้างบัญชีได้ โปรดลองเข้าสู่ระบบหรือติดต่อฝ่ายช่วยเหลือ' : 'Unable to create the account. Try signing in or contact support.',
      }))
    }
  }))

  router.get('/auth/callback', asyncHandler(async (request, response) => {
    const transactionId = typeof request.query.tx === 'string' ? request.query.tx : undefined
    if (!transactionId) return sendMessage(response, 400, 'Sign-in expired', 'Return to the application and start again.')
    const transaction = dependencies.authTransaction.read(request, transactionId)
    const code = typeof request.query.code === 'string' ? request.query.code : undefined
    if (!transaction || !code) return sendMessage(response, 400, 'Sign-in expired', 'Return to the application and start again.')
    const user = await dependencies.auth.exchangeCallback(new MutableAuthStorage(transaction.storage), code)
    const identity = user ? await dependencies.identity.fromAuthenticatedUser(user) : undefined
    dependencies.authTransaction.clear(response, transactionId)
    if (!identity) return sendMessage(
      response,
      403,
      transaction.locale === 'th' ? 'ไม่สามารถดำเนินการต่อได้' : 'Unable to continue',
      transaction.locale === 'th'
        ? 'บัญชี DJAI School ต้องยืนยันอีเมลและอยู่ในสถานะใช้งาน'
        : 'The DJAI School account must be verified and active.',
      transaction.locale ?? 'en',
    )
    dependencies.loginResult.write(response, { interactionUid: transaction.interactionUid, subject: identity.subject })
    return response.redirect(303, `/interaction/${encodeURIComponent(transaction.interactionUid)}/resume?lang=${transaction.locale ?? 'en'}`)
  }))

  router.get('/interaction/:uid/resume', asyncHandler(async (request, response) => {
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    const subject = dependencies.loginResult.consume(request, response, details.uid)
    const identity = subject ? await dependencies.identity.bySubject(subject) : undefined
    if (!identity) return sendMessage(response, 403, 'Sign-in expired', 'Return to the application and start again.')
    await finishLogin(dependencies, request, response, details.uid, identity, 'external')
  }))

  router.post('/interaction/:uid/confirm', asyncHandler(async (request, response) => {
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    if (details.prompt.name !== 'consent' || !details.session?.accountId) throw new Error('Unexpected interaction prompt')
    if (!dependencies.csrf.verify(request, bodyField(request, 'csrf'), details.uid)) return sendMessage(response, 403, 'Request expired', 'Return to the application and start sign-in again.')
    const clientId = String(details.params.client_id)
    let grant = details.grantId ? await dependencies.provider.Grant.find(details.grantId) : undefined
    grant ??= new dependencies.provider.Grant({ accountId: details.session.accountId, clientId })
    const missingScopes = stringArray(details.prompt.details.missingOIDCScope)
    const missingClaims = stringArray(details.prompt.details.missingOIDCClaims)
    if (missingScopes.length > 0) grant.addOIDCScope(missingScopes.join(' '))
    if (missingClaims.length > 0) grant.addOIDCClaims(missingClaims)
    const grantId = await grant.save()
    await dependencies.confirmations.remember(details.session.accountId, clientId, grantId)
    await dependencies.securityEvents.record({ eventType: 'identity_confirmed', clientId, accountId: details.session.accountId, correlationId: randomUUID(), request })
    await dependencies.provider.interactionFinished(request, response, { consent: { grantId } }, { mergeWithLastSubmission: true })
  }))

  router.post('/interaction/:uid/cancel', asyncHandler(async (request, response) => {
    const details = await dependencies.provider.interactionDetails(request, response)
    ensureUid(details.uid, request.params.uid)
    if (!dependencies.csrf.verify(request, bodyField(request, 'csrf'), details.uid)) return sendMessage(response, 403, 'Request expired', 'Return to the application and start sign-in again.')
    await dependencies.securityEvents.record({ eventType: 'identity_cancelled', clientId: String(details.params.client_id), request })
    await dependencies.provider.interactionFinished(request, response, {
      error: 'access_denied',
      error_description: 'The user cancelled DJAI School sign-in.',
    }, { mergeWithLastSubmission: false })
  }))

  router.use((error: unknown, request: Request, response: Response, next: (error?: unknown) => void) => {
    if (response.headersSent) return next(error)

    const reference = randomUUID()
    const expired = isInvalidInteraction(error)
    const logDetails = { err: error, correlationId: reference, method: request.method }
    if (expired) {
      dependencies.logger.warn(logDetails, 'OIDC interaction expired or invalid')
    } else {
      dependencies.logger.error(logDetails, 'OIDC interaction failed')
    }

    const locale = localeFrom(request.query.lang ?? bodyField(request, 'lang'))
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-DJAI-Error-Reference', reference)
    if (expired) {
      return response.status(400).type('html').send(renderMessage(
        locale === 'th' ? 'การเข้าสู่ระบบหมดอายุ' : 'Sign-in expired',
        locale === 'th'
          ? 'กลับไปที่แอปและเริ่มเข้าสู่ระบบอีกครั้ง'
          : 'Return to the application and start sign-in again.',
        locale,
      ))
    }

    return response.status(500).type('html').send(renderMessage(
      locale === 'th' ? 'ไม่สามารถดำเนินการต่อได้' : 'Unable to continue',
      locale === 'th'
        ? `กลับไปที่แอปและลองอีกครั้ง หากปัญหายังคงอยู่ โปรดแจ้งรหัสอ้างอิง ${reference}`
        : `Return to the application and try again. If the problem continues, provide support with reference ${reference}.`,
      locale,
    ))
  })

  return router
}

async function finishLogin(
  dependencies: InteractionDependencies,
  request: Request,
  response: Response,
  interactionUid: string,
  identity: VerifiedIdentity,
  method: 'pwd' | 'external',
): Promise<void> {
  await dependencies.securityEvents.record({ eventType: 'login_succeeded', accountId: identity.subject, request })
  await dependencies.provider.interactionFinished(request, response, {
    login: {
      accountId: identity.subject,
      remember: true,
      ts: Math.floor(Date.now() / 1000),
      amr: [method],
      interactionUid,
    },
  }, { mergeWithLastSubmission: false })
}

function ensureUid(actual: string, provided: string | string[] | undefined): void {
  if (typeof provided !== 'string' || actual !== provided) throw new Error('Interaction mismatch')
}

function stringBody(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return undefined
  return value
}

function bodyField(request: Request, field: string): unknown {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return undefined
  return (request.body as Record<string, unknown>)[field]
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function genericLoginError(locale: Locale): string {
  return locale === 'th' ? 'ไม่สามารถเข้าสู่ระบบได้ โปรดตรวจสอบข้อมูลหรือสถานะบัญชีของคุณ' : 'Unable to sign in. Check your details or account status.'
}

function interactionLocale(explicit: unknown, uiLocales: unknown): Locale {
  if (explicit === 'th' || explicit === 'en') return explicit
  if (typeof uiLocales === 'string' && uiLocales.split(/\s+/).includes('th')) return 'th'
  return 'en'
}

function emailHint(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 320) return undefined
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined
}

function isInvalidInteraction(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { error?: unknown; status?: unknown; statusCode?: unknown }
  const status = candidate.statusCode ?? candidate.status
  return candidate.error === 'invalid_request' && status === 400
}

function sendMessage(
  response: Response,
  status: number,
  title: string,
  message: string,
  locale: Locale = 'en',
): Response {
  response.setHeader('Cache-Control', 'no-store')
  return response.status(status).type('html').send(renderMessage(title, message, locale))
}

function asyncHandler(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: (error?: unknown) => void): void => {
    handler(request, response).catch(next)
  }
}
