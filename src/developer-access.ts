import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { AppConfig } from './config.js'
import type { Database } from './database.js'
import type { VerifiedIdentity } from './identity.js'

export interface DeveloperIdentity extends VerifiedIdentity {
  canProduction: boolean
}

interface DeveloperRow {
  subject: string
  email: string
  can_production: boolean
}

export interface DeveloperTokenSummary {
  id: string
  name: string
  expiresAt: Date
  createdAt: Date
  lastUsedAt: Date | null
  active: boolean
}

export class DeveloperAccess {
  private readonly bootstrapEmails: Set<string>

  constructor(
    private readonly database: Database,
    config: Pick<AppConfig, 'DEVELOPER_EMAIL_ALLOWLIST'>,
  ) {
    this.bootstrapEmails = new Set(config.DEVELOPER_EMAIL_ALLOWLIST)
  }

  async authorize(identity: VerifiedIdentity): Promise<DeveloperIdentity | undefined> {
    const existing = await this.findActive(identity.subject)
    if (existing) {
      if (existing.email !== identity.email) {
        await this.database.query(
          'update oidc_developers set email = $2, updated_at = now() where subject = $1::uuid',
          [identity.subject, identity.email],
        )
      }
      return { ...identity, canProduction: existing.can_production }
    }
    if (!this.bootstrapEmails.has(identity.email)) return undefined
    const result = await this.database.query<DeveloperRow>(
      `insert into oidc_developers (subject, email, active, can_production, approved_by)
       values ($1::uuid, $2, true, true, 'environment_allowlist')
       on conflict (subject) do update
       set email = excluded.email, updated_at = now()
       where oidc_developers.revoked_at is null and oidc_developers.active = true
       returning subject::text, email, can_production`,
      [identity.subject, identity.email],
    )
    const row = result.rows[0]
    return row ? { ...identity, email: row.email, canProduction: row.can_production } : undefined
  }

  async bySubject(subject: string): Promise<DeveloperIdentity | undefined> {
    const row = await this.findActive(subject)
    if (!row) return undefined
    return { subject: row.subject, email: row.email, emailVerified: true, canProduction: row.can_production }
  }

  async createToken(subject: string, name: string, ttlDays = 90): Promise<{ token: string; summary: DeveloperTokenSummary }> {
    const developer = await this.findActive(subject)
    if (!developer) throw new Error('Approved developer not found')
    const id = randomUUID()
    const secret = randomBytes(32).toString('base64url')
    const token = `djai_dev_${id.replaceAll('-', '')}_${secret}`
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)
    const result = await this.database.query<{ created_at: Date }>(
      `insert into oidc_developer_tokens (id, developer_subject, name, token_hash, expires_at)
       values ($1::uuid, $2::uuid, $3, $4, $5)
       returning created_at`,
      [id, subject, name, this.hash(token), expiresAt],
    )
    await this.audit(subject, 'token_created', id, { name, expiresAt: expiresAt.toISOString() })
    return {
      token,
      summary: { id, name, expiresAt, createdAt: result.rows[0]!.created_at, lastUsedAt: null, active: true },
    }
  }

  async authenticateToken(token: string): Promise<DeveloperIdentity | undefined> {
    if (!/^djai_dev_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(token)) return undefined
    const result = await this.database.query<DeveloperRow>(
      `update oidc_developer_tokens token
       set last_used_at = now()
       from oidc_developers developer
       where token.token_hash = $1
         and token.developer_subject = developer.subject
         and token.revoked_at is null
         and token.expires_at > now()
         and developer.active = true
         and developer.revoked_at is null
       returning developer.subject::text, developer.email, developer.can_production`,
      [this.hash(token)],
    )
    const row = result.rows[0]
    return row ? { subject: row.subject, email: row.email, emailVerified: true, canProduction: row.can_production } : undefined
  }

  async listTokens(subject: string): Promise<DeveloperTokenSummary[]> {
    const result = await this.database.query<{
      id: string
      name: string
      expires_at: Date
      created_at: Date
      last_used_at: Date | null
      revoked_at: Date | null
    }>(
      `select id::text, name, expires_at, created_at, last_used_at, revoked_at
       from oidc_developer_tokens
       where developer_subject = $1::uuid
       order by created_at desc`,
      [subject],
    )
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      active: row.revoked_at === null && row.expires_at.getTime() > Date.now(),
    }))
  }

  async revokeToken(subject: string, tokenId: string): Promise<void> {
    const result = await this.database.query(
      `update oidc_developer_tokens
       set revoked_at = now()
       where id = $1::uuid and developer_subject = $2::uuid and revoked_at is null`,
      [tokenId, subject],
    )
    if (result.rowCount !== 1) throw new Error('Active developer token not found')
    await this.audit(subject, 'token_revoked', tokenId)
  }

  private async findActive(subject: string): Promise<DeveloperRow | undefined> {
    const result = await this.database.query<DeveloperRow>(
      `select subject::text, email, can_production
       from oidc_developers
       where subject = $1::uuid and active = true and revoked_at is null`,
      [subject],
    )
    return result.rows[0]
  }

  private hash(token: string): Buffer {
    return createHash('sha256').update(token).digest()
  }

  private async audit(subject: string, action: string, targetId?: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.database.query(
      `insert into oidc_developer_audit (developer_subject, action, target_id, details)
       values ($1::uuid, $2, $3, $4::jsonb)`,
      [subject, action, targetId ?? null, JSON.stringify(details)],
    )
  }
}
