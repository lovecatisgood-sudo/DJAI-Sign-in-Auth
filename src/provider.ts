import Provider, { type ClientMetadata, type Configuration } from 'oidc-provider'
import type { AppConfig } from './config.js'
import type { ConfirmationRepository } from './confirmations.js'
import type { IdentityDirectory } from './identity.js'
import type { Logger } from './logger.js'

interface ProviderDependencies {
  clients: ClientMetadata[]
  confirmations: ConfirmationRepository
  identity: IdentityDirectory
  logger: Logger
  adapter: NonNullable<Configuration['adapter']>
}

export function createProvider(config: AppConfig, dependencies: ProviderDependencies): Provider {
  // Assigned after configuration construction; callbacks resolve it only at request time.
  // eslint-disable-next-line prefer-const
  let provider: Provider
  const configuration: Configuration = {
    adapter: dependencies.adapter,
    clients: dependencies.clients,
    jwks: config.OIDC_JWKS,
    scopes: ['openid', 'email'],
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
    },
    responseTypes: ['code'],
    subjectTypes: ['public'],
    clientAuthMethods: ['client_secret_basic', 'none'],
    clientDefaults: {
      application_type: 'web',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'RS256',
      subject_type: 'public',
    },
    enabledJWA: {
      idTokenSigningAlgValues: ['RS256'],
    },
    pkce: { required: () => true },
    issueRefreshToken: () => false,
    conformIdTokenClaims: true,
    allowOmittingSingleRegisteredRedirectUri: false,
    acceptQueryParamAccessTokens: false,
    clockTolerance: 15,
    ttl: {
      AccessToken: config.ACCESS_TOKEN_TTL_SECONDS,
      AuthorizationCode: config.AUTH_CODE_TTL_SECONDS,
      IdToken: config.ID_TOKEN_TTL_SECONDS,
      Interaction: config.INTERACTION_TTL_SECONDS,
      Session: config.SESSION_TTL_SECONDS,
      Grant: 30 * 24 * 60 * 60,
    },
    routes: {
      authorization: '/oauth/authorize',
      token: '/oauth/token',
      jwks: '/oauth/jwks.json',
    },
    cookies: {
      keys: config.OIDC_COOKIE_KEYS,
      long: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV !== 'development',
        signed: true,
      },
      short: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV !== 'development',
        signed: true,
      },
    },
    interactions: {
      url: (_context, interaction) => `/interaction/${encodeURIComponent(interaction.uid)}`,
    },
    features: {
      devInteractions: { enabled: false },
      claimsParameter: { enabled: false },
      clientCredentials: { enabled: false },
      deviceFlow: { enabled: false },
      encryption: { enabled: false },
      introspection: { enabled: false },
      registration: { enabled: false },
      registrationManagement: { enabled: false },
      requestObjects: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      revocation: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
    },
    async findAccount(_context, subject) {
      const identity = await dependencies.identity.bySubject(subject)
      if (!identity) return undefined
      return {
        accountId: identity.subject,
        claims: () => ({
          sub: identity.subject,
          email: identity.email,
          email_verified: true,
        }),
      }
    },
    async loadExistingGrant(context) {
      const accountId = context.oidc.account?.accountId
      const clientId = context.oidc.client?.clientId
      if (!accountId || !clientId) return undefined
      const grantId = await dependencies.confirmations.grantId(accountId, clientId)
      if (!grantId) return undefined
      return provider.Grant.find(grantId)
    },
    renderError(context, out) {
      const description = typeof out.error_description === 'string' ? out.error_description : undefined
      dependencies.logger.warn({
        error: out.error,
        errorDescription: description,
        path: context.path,
      }, 'OIDC request rejected')
      context.type = 'html'
      context.set('Cache-Control', 'no-store')
      context.body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DJAI sign-in error</title><body><main><h1>Unable to continue</h1><p>${escapeHtml(out.error)}</p>${description ? `<p>${escapeHtml(description)}</p>` : ''}<p>Please return to the application and try again.</p></main></body></html>`
    },
  }

  provider = new Provider(config.OIDC_ISSUER, configuration)
  provider.proxy = config.TRUST_PROXY

  provider.on('server_error', (_context, error) => {
    dependencies.logger.error({ err: error }, 'OIDC provider error')
  })
  provider.on('authorization_code.consumed', (code) => {
    dependencies.logger.info({ clientId: code.clientId }, 'authorization code consumed')
  })

  return provider
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
