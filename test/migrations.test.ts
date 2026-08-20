import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(import.meta.dirname, '../migrations/0001_identity_provider.sql'), 'utf8')

describe('OIDC persistence migration', () => {
  it('has durable provider, client, confirmation, and audit storage', () => {
    expect(migration).toContain('create table if not exists oidc_provider_payloads')
    expect(migration).toContain('create table if not exists oidc_clients')
    expect(migration).toContain('create table if not exists oidc_confirmations')
    expect(migration).toContain('create table if not exists oidc_security_events')
  })

  it('does not create refresh-token or delegated authorization tables', () => {
    expect(migration).not.toMatch(/create table[^;]*refresh/i)
    expect(migration).not.toMatch(/offline_access/i)
  })
})
