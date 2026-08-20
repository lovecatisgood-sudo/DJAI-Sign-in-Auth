import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientRegistry } from '../src/client-registry.js'
import { postgresAdapter } from '../src/postgres-adapter.js'
import { SecretBox } from '../src/secret-box.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const suite = databaseUrl ? describe : describe.skip
const database = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : undefined

suite('PostgreSQL persistence integration', () => {
  beforeAll(async () => {
    const sql = await readFile(resolve(import.meta.dirname, '../migrations/0001_identity_provider.sql'), 'utf8')
    await database!.query(sql)
  })

  afterAll(async () => {
    await database!.query(`drop table if exists oidc_security_events, oidc_confirmations, oidc_client_audit, oidc_clients, oidc_provider_payloads cascade`)
    await database!.end()
  })

  it('allows exactly one concurrent authorization-code consumption', async () => {
    const Adapter = postgresAdapter(database!)
    const adapter = new Adapter('AuthorizationCode')
    await adapter.upsert('code-id', { jti: 'code-id', kind: 'AuthorizationCode' }, 90)
    const attempts = await Promise.allSettled([adapter.consume('code-id'), adapter.consume('code-id')])
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    expect((await adapter.find('code-id'))?.consumed).toEqual(expect.any(Number))
  })

  it('encrypts client secrets at rest and loads an exact confidential client', async () => {
    const registry = new ClientRegistry(database!, new SecretBox(Buffer.alloc(32, 7)))
    const created = await registry.register({
      clientId: 'studio-test',
      displayName: 'Studio Test',
      environment: 'development',
      redirectUris: ['http://localhost:3001/auth/callback'],
      homeUrl: 'http://localhost:3001/',
      policyUrl: 'http://localhost:3001/privacy',
      termsUrl: 'http://localhost:3001/terms',
      ownerEmail: 'owner@example.com',
      securityContact: 'security@example.com',
    }, 'test-operator')
    const row = await database!.query<{ secret_ciphertext: string }>('select secret_ciphertext from oidc_clients where client_id = $1', [created.clientId])
    expect(row.rows[0]?.secret_ciphertext).not.toContain(created.clientSecret)
    const [loaded] = await registry.activeClients()
    expect(loaded).toMatchObject({
      client_id: 'studio-test',
      client_secret: created.clientSecret,
      redirect_uris: ['http://localhost:3001/auth/callback'],
      scope: 'openid email',
    })
  })
})
