import { randomBytes } from 'node:crypto'
import type { ClientMetadata } from 'oidc-provider'
import { z } from 'zod'
import type { Database } from './database.js'
import type { SecretBox } from './secret-box.js'

const clientIdPattern = /^[a-z0-9][a-z0-9._-]{2,63}$/

const registrationSchema = z.object({
  clientId: z.string().regex(clientIdPattern),
  displayName: z.string().trim().min(2).max(100),
  environment: z.enum(['development', 'staging', 'production']),
  redirectUris: z.array(z.url()).min(1).max(10),
  homeUrl: z.url(),
  policyUrl: z.url(),
  termsUrl: z.url(),
  ownerEmail: z.email(),
  securityContact: z.email(),
})

export type ClientRegistration = z.infer<typeof registrationSchema>

interface ClientRow {
  client_id: string
  display_name: string
  metadata: ClientMetadata
  secret_ciphertext: string
}

export class ClientRegistry {
  constructor(
    private readonly database: Database,
    private readonly secrets: SecretBox,
  ) {}

  async activeClients(): Promise<ClientMetadata[]> {
    const result = await this.database.query<ClientRow>(
      `select client_id, display_name, metadata, secret_ciphertext
       from oidc_clients
       where active = true and revoked_at is null
       order by client_id`,
    )
    return result.rows.map((row) => ({
      ...row.metadata,
      client_id: row.client_id,
      client_name: row.display_name,
      client_secret: this.secrets.open(row.secret_ciphertext),
    }))
  }

  async register(input: ClientRegistration, actor: string): Promise<{ clientId: string; clientSecret: string }> {
    const registration = registrationSchema.parse(input)
    validateClientUrls(registration)
    const clientSecret = randomBytes(32).toString('base64url')
    const metadata: ClientMetadata = {
      client_id: registration.clientId,
      client_name: registration.displayName,
      client_uri: registration.homeUrl,
      redirect_uris: registration.redirectUris,
      policy_uri: registration.policyUrl,
      tos_uri: registration.termsUrl,
      contacts: [registration.ownerEmail, registration.securityContact],
      application_type: 'web',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'RS256',
      subject_type: 'public',
      scope: 'openid email',
    }

    const connection = await this.database.connect()
    try {
      await connection.query('begin')
      await connection.query(
        `insert into oidc_clients (
           client_id, display_name, environment, metadata, secret_ciphertext,
           owner_email, security_contact
         ) values ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
        [
          registration.clientId,
          registration.displayName,
          registration.environment,
          JSON.stringify(metadata),
          this.secrets.seal(clientSecret),
          registration.ownerEmail,
          registration.securityContact,
        ],
      )
      await connection.query(
        `insert into oidc_client_audit (client_id, action, actor, details)
         values ($1, 'registered', $2, $3::jsonb)`,
        [registration.clientId, actor, JSON.stringify({ environment: registration.environment, redirectUris: registration.redirectUris })],
      )
      await connection.query('commit')
    } catch (error) {
      await connection.query('rollback')
      throw error
    } finally {
      connection.release()
    }
    return { clientId: registration.clientId, clientSecret }
  }

  async rotateSecret(clientId: string, actor: string): Promise<string> {
    const clientSecret = randomBytes(32).toString('base64url')
    const connection = await this.database.connect()
    try {
      await connection.query('begin')
      const updated = await connection.query(
        `update oidc_clients
         set secret_ciphertext = $2, updated_at = now()
         where client_id = $1 and active = true and revoked_at is null`,
        [clientId, this.secrets.seal(clientSecret)],
      )
      if (updated.rowCount !== 1) throw new Error('Active client not found')
      await connection.query(
        `insert into oidc_client_audit (client_id, action, actor)
         values ($1, 'secret_rotated', $2)`,
        [clientId, actor],
      )
      await connection.query('commit')
    } catch (error) {
      await connection.query('rollback')
      throw error
    } finally {
      connection.release()
    }
    return clientSecret
  }

  async revoke(clientId: string, actor: string): Promise<void> {
    const connection = await this.database.connect()
    try {
      await connection.query('begin')
      const updated = await connection.query(
        `update oidc_clients
         set active = false, revoked_at = now(), updated_at = now()
         where client_id = $1 and active = true`,
        [clientId],
      )
      if (updated.rowCount !== 1) throw new Error('Active client not found')
      await connection.query(
        `insert into oidc_client_audit (client_id, action, actor)
         values ($1, 'revoked', $2)`,
        [clientId, actor],
      )
      await connection.query('commit')
    } catch (error) {
      await connection.query('rollback')
      throw error
    } finally {
      connection.release()
    }
  }
}

function validateClientUrls(registration: ClientRegistration): void {
  const urls = [registration.homeUrl, registration.policyUrl, registration.termsUrl, ...registration.redirectUris]
  for (const raw of urls) {
    const url = new URL(raw)
    const localDevelopment = registration.environment === 'development'
      && url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    if (url.username || url.password || url.hash) throw new Error(`Unsafe client URL: ${raw}`)
    if (url.protocol !== 'https:' && !localDevelopment) throw new Error(`Client URL must use HTTPS: ${raw}`)
  }
  if (new Set(registration.redirectUris).size !== registration.redirectUris.length) {
    throw new Error('Redirect URIs must be unique')
  }
}
