import * as oidc from 'openid-client'
import { z } from 'zod'

const ISSUER = new URL('https://id.djai.academy')

export interface LoginTransaction {
  state: string
  nonce: string
  codeVerifier: string
  createdAt: number
}

export interface DjaiIdentity {
  issuer: 'https://id.djai.academy'
  subject: string
  email: string
}

const claimsSchema = z.object({
  iss: z.literal('https://id.djai.academy'),
  sub: z.uuid(),
  email: z.email(),
  email_verified: z.literal(true),
})

async function configuration() {
  const clientId = required('DJAI_OIDC_CLIENT_ID')
  const clientSecret = required('DJAI_OIDC_CLIENT_SECRET')
  return oidc.discovery(
    ISSUER,
    clientId,
    { token_endpoint_auth_method: 'client_secret_basic' },
    oidc.ClientSecretBasic(clientSecret),
  )
}

export async function beginDjaiLogin(callbackUrl: string): Promise<{ url: URL; transaction: LoginTransaction }> {
  const config = await configuration()
  const codeVerifier = oidc.randomPKCECodeVerifier()
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier)
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  return { url, transaction: { state, nonce, codeVerifier, createdAt: Date.now() } }
}

export async function finishDjaiLogin(
  callbackUrl: URL,
  transaction: LoginTransaction,
): Promise<DjaiIdentity> {
  if (Date.now() - transaction.createdAt > 10 * 60 * 1000) throw new Error('DJAI login transaction expired')
  const config = await configuration()
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
  })
  const claims = claimsSchema.parse(tokens.claims())
  if (tokens.refresh_token) throw new Error('Unexpected DJAI refresh token')
  return { issuer: claims.iss, subject: claims.sub, email: claims.email.toLowerCase() }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
