import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientRegistry } from '../src/client-registry.js'
import { DeveloperAccess } from '../src/developer-access.js'
import { postgresAdapter } from '../src/postgres-adapter.js'
import { SecretBox } from '../src/secret-box.js'
import { persistDjaiIdentity } from '../packages/auth-express/src/index.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const suite = databaseUrl ? describe : describe.skip
const database = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : undefined

suite('PostgreSQL persistence integration', () => {
  beforeAll(async () => {
    const directory = resolve(import.meta.dirname, '../migrations')
    for (const filename of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
      await database!.query(await readFile(resolve(directory, filename), 'utf8'))
    }
  })

  afterAll(async () => {
    await database!.query(`drop table if exists oidc_developer_audit, oidc_developer_tokens, oidc_developers, oidc_security_events, oidc_confirmations, oidc_client_audit, oidc_clients, oidc_provider_payloads cascade`)
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

  it('revokes grant artifacts only from the requested provider model', async () => {
    const Adapter = postgresAdapter(database!)
    const accessToken = new Adapter('AccessToken')
    const interaction = new Adapter('Interaction')
    await accessToken.upsert('access-id', { jti: 'access-id', kind: 'AccessToken', grantId: 'shared-grant' }, 90)
    await interaction.upsert('interaction-id', { jti: 'interaction-id', kind: 'Interaction', grantId: 'shared-grant' }, 90)

    await accessToken.revokeByGrantId('shared-grant')

    expect(await accessToken.find('access-id')).toBeUndefined()
    expect(await interaction.find('interaction-id')).toMatchObject({ grantId: 'shared-grant' })
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

  it('applies register, rotate, ownership, and revoke through the live Client adapter without restart', async () => {
    const owner = '11111111-1111-4111-8111-111111111111'
    const other = '22222222-2222-4222-8222-222222222222'
    const registry = new ClientRegistry(database!, new SecretBox(Buffer.alloc(32, 8)))
    const registration = {
      clientId: 'live-client-test', displayName: 'Live Client Test', environment: 'development' as const,
      redirectUris: ['http://localhost:4000/auth/callback'], homeUrl: 'http://localhost:4000/',
      policyUrl: 'http://localhost:4000/privacy', termsUrl: 'http://localhost:4000/terms',
      ownerEmail: 'owner@example.com', securityContact: 'security@example.com',
    }
    const created = await registry.register(registration, 'developer-owner', owner)
    expect(await registry.listForDeveloper(other)).toEqual([])
    expect(await registry.listForDeveloper(owner)).toHaveLength(1)
    const Adapter = postgresAdapter(database!, registry)
    const adapter = new Adapter('Client')
    expect(await adapter.find(created.clientId)).toMatchObject({ client_id: created.clientId, client_secret: created.clientSecret })
    await expect(registry.rotateSecret(created.clientId, 'developer-other', other)).rejects.toThrow('Active client not found')
    const rotated = await registry.rotateSecret(created.clientId, 'developer-owner', owner)
    expect(await adapter.find(created.clientId)).toMatchObject({ client_secret: rotated })
    expect((await adapter.find(created.clientId))?.client_secret).not.toBe(created.clientSecret)
    await registry.revoke(created.clientId, 'developer-owner', owner)
    expect(await adapter.find(created.clientId)).toBeUndefined()
    const audit = await database!.query<{ action: string; actor: string }>(
      'select action, actor from oidc_client_audit where client_id = $1 order by id',
      [created.clientId],
    )
    expect(audit.rows).toEqual([
      { action: 'registered', actor: 'developer-owner' },
      { action: 'secret_rotated', actor: 'developer-owner' },
      { action: 'revoked', actor: 'developer-owner' },
    ])
  })

  it('hashes, expires, scopes, and revokes developer API tokens', async () => {
    const subject = '33333333-3333-4333-8333-333333333333'
    const access = new DeveloperAccess(database!, { DEVELOPER_EMAIL_ALLOWLIST: ['developer@djai.academy'] })
    const developer = await access.authorize({ subject, email: 'developer@djai.academy', emailVerified: true })
    expect(developer).toMatchObject({ subject, canProduction: true })
    const created = await access.createToken(subject, 'test workstation', 1)
    const stored = await database!.query<{ hash: string }>(
      `select encode(token_hash, 'hex') as hash from oidc_developer_tokens where id = $1::uuid`,
      [created.summary.id],
    )
    expect(stored.rows[0]?.hash).not.toContain(created.token)
    expect(await access.authenticateToken(created.token)).toMatchObject({ subject, email: 'developer@djai.academy' })
    await access.revokeToken(subject, created.summary.id)
    expect(await access.authenticateToken(created.token)).toBeUndefined()
    const expired = await access.createToken(subject, 'already expired', 0)
    expect(await access.authenticateToken(expired.token)).toBeUndefined()
    const audit = await database!.query<{ action: string }>(
      'select action from oidc_developer_audit where developer_subject = $1::uuid order by id',
      [subject],
    )
    expect(audit.rows.map((row) => row.action)).toEqual(['token_created', 'token_revoked', 'token_created'])
  })

  it('lets the reusable adapter persist UID identity while updating mutable email', async () => {
    const identity = {
      issuer: 'https://id.djai.academy',
      uid: '44444444-4444-4444-8444-444444444444',
      email: 'first@example.com',
    }
    await persistDjaiIdentity(databaseUrl!, identity)
    await persistDjaiIdentity(databaseUrl!, { ...identity, email: 'changed@example.com' })
    const result = await database!.query(
      `select issuer, subject::text, email_at_last_login from djai_external_identities
       where issuer = $1 and subject = $2::uuid`,
      [identity.issuer, identity.uid],
    )
    expect(result.rows).toEqual([{
      issuer: identity.issuer,
      subject: identity.uid,
      email_at_last_login: 'changed@example.com',
    }])
    await database!.query('drop table djai_external_identities')
  })
})
