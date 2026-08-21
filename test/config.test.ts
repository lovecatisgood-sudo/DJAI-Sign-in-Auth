import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { exportJWK } from 'jose'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

async function environment(overrides: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = await exportJWK(privateKey)
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    DATABASE_SSL: 'disable',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key-with-enough-entropy',
    SUPABASE_SECRET_KEY: 'secret-key-with-enough-entropy-value',
    OIDC_COOKIE_KEYS: `${'a'.repeat(32)},${'b'.repeat(32)}`,
    AUTH_TRANSACTION_KEY: randomBytes(32).toString('base64'),
    CLIENT_SECRET_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    OIDC_JWKS: JSON.stringify({ keys: [{ ...jwk, alg: 'RS256', kid: 'test', use: 'sig' }] }),
    ...overrides,
  }
}

describe('loadConfig', () => {
  it('accepts an isolated test issuer', async () => {
    const config = loadConfig(await environment({ OIDC_ISSUER: 'http://127.0.0.1:3000' }))
    expect(config.OIDC_ISSUER).toBe('http://127.0.0.1:3000')
    expect(config.OIDC_COOKIE_KEYS).toHaveLength(2)
  })

  it('fails closed on a non-canonical production issuer', async () => {
    const input = await environment({
      NODE_ENV: 'production',
      OIDC_ISSUER: 'https://school.djai.academy',
    })
    expect(() => loadConfig(input)).toThrow('production OIDC_ISSUER must be exactly https://id.djai.academy')
  })

  it('requires a trusted database CA for production TLS', async () => {
    const input = await environment({
      NODE_ENV: 'production',
      OIDC_ISSUER: 'https://id.djai.academy',
      DATABASE_SSL: 'require',
    })
    expect(() => loadConfig(input)).toThrow('DATABASE_CA_CERT')

    const config = loadConfig({
      ...input,
      DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\ncertificate-data\\n-----END CERTIFICATE-----',
    })
    expect(config.DATABASE_CA_CERT).toContain('\ncertificate-data\n')
  })

  it('rejects weak cookie key configuration', async () => {
    const input = await environment({ OIDC_COOKIE_KEYS: 'only-one-key' })
    expect(() => loadConfig(input)).toThrow('at least two')
  })

  it('requires an exact developer allowlist when the console is enabled', async () => {
    const input = await environment({ DEVELOPER_CONSOLE_ENABLED: 'true', DEVELOPER_EMAIL_ALLOWLIST: '' })
    expect(() => loadConfig(input)).toThrow('DEVELOPER_EMAIL_ALLOWLIST')
    const config = loadConfig(await environment({
      DEVELOPER_CONSOLE_ENABLED: 'true',
      DEVELOPER_EMAIL_ALLOWLIST: ' Developer@DJAI.Academy ',
    }))
    expect(config.DEVELOPER_EMAIL_ALLOWLIST).toEqual(['developer@djai.academy'])
  })
})
