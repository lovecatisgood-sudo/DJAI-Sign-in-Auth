import type { Adapter, AdapterPayload } from 'oidc-provider'
import type { Database } from './database.js'
import type { ClientRegistry } from './client-registry.js'

export function postgresAdapter(database: Database, clients?: Pick<ClientRegistry, 'findActive'>) {
  return class PostgresAdapter implements Adapter {
    constructor(private readonly model: string) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
      const expiresAt = expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1000)
      await database.query(
        `insert into oidc_provider_payloads (model, id, payload, expires_at)
         values ($1, $2, $3::jsonb, $4)
         on conflict (model, id) do update
         set payload = excluded.payload,
             expires_at = excluded.expires_at,
             updated_at = now()`,
        [this.model, id, JSON.stringify(payload), expiresAt],
      )
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
      if (this.model === 'Client' && clients) {
        return await clients.findActive(id) as AdapterPayload | undefined
      }
      const result = await database.query<{ payload: AdapterPayload }>(
        `select payload
         from oidc_provider_payloads
         where model = $1 and id = $2
           and (expires_at is null or expires_at > now())`,
        [this.model, id],
      )
      return result.rows[0]?.payload
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return this.findByPayloadValue('userCode', userCode)
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.findByPayloadValue('uid', uid)
    }

    async consume(id: string): Promise<void> {
      const consumedAt = Math.floor(Date.now() / 1000)
      const result = await database.query(
        `update oidc_provider_payloads
         set payload = jsonb_set(payload, '{consumed}', to_jsonb($3::bigint), true),
             updated_at = now()
         where model = $1 and id = $2
           and not (payload ? 'consumed')
           and (expires_at is null or expires_at > now())`,
        [this.model, id, consumedAt],
      )
      if (result.rowCount !== 1) {
        throw new Error('OIDC artifact was already consumed or expired')
      }
    }

    async destroy(id: string): Promise<void> {
      await database.query('delete from oidc_provider_payloads where model = $1 and id = $2', [this.model, id])
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await database.query(
        `delete from oidc_provider_payloads
         where model = $1
           and payload ->> 'grantId' = $2`,
        [this.model, grantId],
      )
    }

    private async findByPayloadValue(key: 'uid' | 'userCode', value: string): Promise<AdapterPayload | undefined> {
      const result = await database.query<{ payload: AdapterPayload }>(
        `select payload
         from oidc_provider_payloads
         where model = $1 and payload ->> $2 = $3
           and (expires_at is null or expires_at > now())
         limit 1`,
        [this.model, key, value],
      )
      return result.rows[0]?.payload
    }
  }
}
