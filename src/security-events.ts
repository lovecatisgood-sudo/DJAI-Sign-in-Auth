import { createHash } from 'node:crypto'
import type { Request } from 'express'
import type { Database } from './database.js'
import type { Logger } from './logger.js'

interface SecurityEvent {
  eventType: string
  clientId?: string
  accountId?: string
  correlationId?: string
  details?: Record<string, unknown>
  request?: Request
}

export class SecurityEvents {
  constructor(
    private readonly database: Database,
    private readonly logger: Logger,
    private readonly hashKey: Buffer,
  ) {}

  async record(event: SecurityEvent): Promise<void> {
    const ip = event.request?.ip
    const ipHash = ip ? createHash('sha256').update(this.hashKey).update(ip).digest('base64url') : null
    try {
      await this.database.query(
        `insert into oidc_security_events (
           event_type, client_id, account_id, correlation_id, ip_hash, details
         ) values ($1, $2, $3::uuid, $4, $5, $6::jsonb)`,
        [
          event.eventType,
          event.clientId ?? null,
          event.accountId ?? null,
          event.correlationId ?? null,
          ipHash,
          JSON.stringify(event.details ?? {}),
        ],
      )
    } catch (error) {
      this.logger.error({ err: error, eventType: event.eventType }, 'security event persistence failed')
    }
  }
}
