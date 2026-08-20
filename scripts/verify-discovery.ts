import { loadConfig } from '../src/config.js'

const config = loadConfig()
const discoveryUrl = new URL('/.well-known/openid-configuration', config.OIDC_ISSUER)
const discoveryResponse = await fetch(discoveryUrl, { headers: { accept: 'application/json' } })
if (!discoveryResponse.ok) throw new Error(`Discovery returned HTTP ${discoveryResponse.status}`)
const discovery = await discoveryResponse.json() as Record<string, unknown>
if (discovery.issuer !== config.OIDC_ISSUER) throw new Error('Discovery issuer mismatch')
if (discovery.authorization_endpoint !== `${config.OIDC_ISSUER}/oauth/authorize`) throw new Error('Authorization endpoint mismatch')
if (discovery.token_endpoint !== `${config.OIDC_ISSUER}/oauth/token`) throw new Error('Token endpoint mismatch')
if (discovery.jwks_uri !== `${config.OIDC_ISSUER}/oauth/jwks.json`) throw new Error('JWKS endpoint mismatch')
if (discovery.userinfo_endpoint !== undefined) throw new Error('UserInfo must not be advertised')
if (discovery.registration_endpoint !== undefined) throw new Error('Dynamic registration must not be advertised')
const scopes = discovery.scopes_supported
if (!Array.isArray(scopes) || scopes.join(' ') !== 'openid email') throw new Error('Unexpected scopes')
const jwksResponse = await fetch(String(discovery.jwks_uri), { headers: { accept: 'application/json' } })
if (!jwksResponse.ok) throw new Error(`JWKS returned HTTP ${jwksResponse.status}`)
const jwks = await jwksResponse.json() as { keys?: unknown[] }
if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('JWKS contains no keys')
process.stdout.write(`Verified ${config.OIDC_ISSUER} discovery and ${jwks.keys.length} signing key(s).\n`)
