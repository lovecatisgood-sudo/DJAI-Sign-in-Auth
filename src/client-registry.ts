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
  environment: 'development' | 'staging' | 'production'
  metadata: ClientMetadata
  secret_ciphertext: string
  active: boolean
  created_by_subject: string | null
  created_at: Date
  updated_at: Date
}

export interface ClientSummary {
  clientId: string
  displayName: string
  environment: 'development' | 'staging' | 'production'
  redirectUris: readonly string[]
  homeUrl: string
  policyUrl: string
  termsUrl: string
  active: boolean
  createdAt: Date
  updatedAt: Date
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

  async findActive(clientId: string): Promise<ClientMetadata | undefined> {
    const result = await this.database.query<ClientRow>(
      `select client_id, display_name, environment, metadata, secret_ciphertext,
              active, created_by_subject, created_at, updated_at
       from oidc_clients
       where client_id = $1 and active = true and revoked_at is null`,
      [clientId],
    )
    const row = result.rows[0]
    if (!row) return undefined
    return {
      ...row.metadata,
      client_id: row.client_id,
      client_name: row.display_name,
      client_secret: this.secrets.open(row.secret_ciphertext),
    }
  }

  async listForDeveloper(subject: string): Promise<ClientSummary[]> {
    const result = await this.database.query<ClientRow>(
      `select client_id, display_name, environment, metadata, secret_ciphertext,
              active, created_by_subject, created_at, updated_at
       from oidc_clients
       where created_by_subject = $1::uuid
       order by created_at desc`,
      [subject],
    )
    return result.rows.map((row) => ({
      clientId: row.client_id,
      displayName: row.display_name,
      environment: row.environment,
      redirectUris: row.metadata.redirect_uris ?? [],
      homeUrl: row.metadata.client_uri ?? '',
      policyUrl: row.metadata.policy_uri ?? '',
      termsUrl: row.metadata.tos_uri ?? '',
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async register(input: ClientRegistration, actor: string, createdBySubject?: string): Promise<{ clientId: string; clientSecret: string }> {
    return this.registerWithMethod(input, actor, 'client_secret_basic', createdBySubject)
  }

  async registerPublic(input: ClientRegistration, actor: string, createdBySubject?: string): Promise<{ clientId: string }> {
    const created = await this.registerWithMethod(input, actor, 'none', createdBySubject)
    return { clientId: created.clientId }
  }

  private async registerWithMethod(
    input: ClientRegistration,
    actor: string,
    tokenEndpointAuthMethod: 'client_secret_basic' | 'none',
    createdBySubject?: string,
  ): Promise<{ clientId: string; clientSecret: string }> {
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
      token_endpoint_auth_method: tokenEndpointAuthMethod,
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
           owner_email, security_contact, created_by_subject
         ) values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::uuid)`,
        [
          registration.clientId,
          registration.displayName,
          registration.environment,
          JSON.stringify(metadata),
          this.secrets.seal(clientSecret),
          registration.ownerEmail,
          registration.securityContact,
          createdBySubject ?? null,
        ],
      )
      await connection.query(
        `insert into oidc_client_audit (client_id, action, actor, details)
         values ($1, 'registered', $2, $3::jsonb)`,
        [registration.clientId, actor, JSON.stringify({
          environment: registration.environment,
          redirectUris: registration.redirectUris,
          tokenEndpointAuthMethod,
        })],
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

  async rotateSecret(clientId: string, actor: string, ownerSubject?: string): Promise<string> {
    const clientSecret = randomBytes(32).toString('base64url')
    const connection = await this.database.connect()
    try {
      await connection.query('begin')
      const updated = await connection.query(
        `update oidc_clients
         set secret_ciphertext = $2, updated_at = now()
         where client_id = $1 and active = true and revoked_at is null
           and ($3::uuid is null or created_by_subject = $3::uuid)`,
        [clientId, this.secrets.seal(clientSecret), ownerSubject ?? null],
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

  async revoke(clientId: string, actor: string, ownerSubject?: string): Promise<void> {
    const connection = await this.database.connect()
    try {
      await connection.query('begin')
      const updated = await connection.query(
        `update oidc_clients
         set active = false, revoked_at = now(), updated_at = now()
         where client_id = $1 and active = true
           and ($2::uuid is null or created_by_subject = $2::uuid)`,
        [clientId, ownerSubject ?? null],
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
