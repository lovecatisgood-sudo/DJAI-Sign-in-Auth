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

  it.each([
    ['single-quoted', (json: string) => `'${json}'`],
    ['double-encoded', (json: string) => JSON.stringify(json)],
    ['escaped', (json: string) => json.replaceAll('"', '\\"')],
    ['assignment-prefixed', (json: string) => `OIDC_JWKS=${json}`],
    ['single-quoted properties', (json: string) => json.replaceAll('"', "'")],
    ['URL-encoded', (json: string) => encodeURIComponent(json)],
    ['HTML-escaped', (json: string) => json.replaceAll('"', '&quot;')],
    ['base64', (json: string) => Buffer.from(json).toString('base64')],
    ['backtick-wrapped', (json: string) => `\`${json}\``],
  ])('accepts Hostinger %s JWKS formatting', async (_name, format) => {
    const input = await environment()
    const original = input.OIDC_JWKS
    expect(original).toBeTruthy()
    const config = loadConfig({ ...input, OIDC_JWKS: format(original as string) })
    expect(config.OIDC_JWKS.keys).toHaveLength(1)
  })

  it('prefers a dedicated base64 JWKS environment value', async () => {
    const input = await environment()
    const original = input.OIDC_JWKS
    expect(original).toBeTruthy()
    const config = loadConfig({
      ...input,
      OIDC_JWKS: 'Hostinger-corrupted-value',
      OIDC_JWKS_BASE64: Buffer.from(original as string).toString('base64'),
    })
    expect(config.OIDC_JWKS.keys).toHaveLength(1)
  })

  it('rejects malformed or public-only JWKS values', async () => {
    const malformed = await environment({ OIDC_JWKS: 'not-json' })
    const publicOnly = await environment({
      OIDC_JWKS: JSON.stringify({ keys: [{ kty: 'RSA', n: 'public', e: 'AQAB' }] }),
    })
    expect(() => loadConfig(malformed)).toThrow('valid JSON')
    expect(() => loadConfig(publicOnly)).toThrow('private signing key')
  })

  it('fails closed on a non-canonical production issuer', async () => {
    const input = await environment({
      NODE_ENV: 'production',
      OIDC_ISSUER: 'https://school.djai.academy',
    })
    expect(() => loadConfig(input)).toThrow('production OIDC_ISSUER must be exactly https://id.djai.academy')
  })

  it('accepts a newline-encoded database CA override', async () => {
    const input = await environment({
      NODE_ENV: 'production',
      OIDC_ISSUER: 'https://id.djai.academy',
      DATABASE_SSL: 'require',
    })
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
