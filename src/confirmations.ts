import type { Database } from './database.js'

export class ConfirmationRepository {
  constructor(private readonly database: Database) {}

  async grantId(accountId: string, clientId: string): Promise<string | undefined> {
    const result = await this.database.query<{ grant_id: string }>(
      `update oidc_confirmations
       set last_used_at = now()
       where account_id = $1::uuid and client_id = $2
       returning grant_id`,
      [accountId, clientId],
    )
    return result.rows[0]?.grant_id
  }

  async remember(accountId: string, clientId: string, grantId: string): Promise<void> {
    await this.database.query(
      `insert into oidc_confirmations (account_id, client_id, grant_id)
       values ($1::uuid, $2, $3)
       on conflict (account_id, client_id) do update
       set grant_id = excluded.grant_id,
           confirmed_at = now(),
           last_used_at = now()`,
      [accountId, clientId, grantId],
    )
  }
}
