import { createDecipheriv, hkdfSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

const base64Key = z.string().min(1).transform((value, context) => {
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32) {
    context.addIssue({ code: 'custom', message: 'must decode to exactly 32 bytes' })
    return z.NEVER
  }
  return decoded
})

function parseJsonEnvironment(value: string): unknown {
  const raw = value.trim()
  const withoutAssignment = raw.startsWith('OIDC_JWKS=') ? raw.slice('OIDC_JWKS='.length).trim() : raw
  const candidates = new Set<string>()
  const add = (candidate: string): void => {
    const trimmed = candidate.trim()
    if (trimmed) candidates.add(trimmed)
  }
  add(withoutAssignment)

  for (let pass = 0; pass < 4; pass += 1) {
    for (const candidate of [...candidates]) {
      const first = candidate.at(0)
      if (first && ['"', "'", '`'].includes(first) && candidate.endsWith(first)) add(candidate.slice(1, -1))
      if (candidate.includes('\\"')) add(candidate.replaceAll('\\"', '"'))
      if (candidate.includes('&quot;') || candidate.includes('&#34;')) {
        add(candidate.replaceAll('&quot;', '"').replaceAll('&#34;', '"'))
      }
      if (candidate.includes('%')) {
        try { add(decodeURIComponent(candidate)) } catch { /* Not URL encoded. */ }
      }
      if (candidate.startsWith('{') && candidate.includes("'")) add(candidate.replaceAll("'", '"'))
      if (!candidate.startsWith('{') && /^[A-Za-z0-9+/_=-]+$/.test(candidate)) {
        const decoded = Buffer.from(candidate, 'base64').toString('utf8')
        if (decoded.includes('{')) add(decoded)
      }
    }
  }

  for (const candidate of candidates) {
    try {
      let parsed = JSON.parse(candidate) as unknown
      for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth += 1) {
        parsed = JSON.parse(parsed) as unknown
      }
      return parsed
    } catch {
      // Try the next known environment-variable representation.
    }
  }
  throw new Error('invalid JSON environment value')
}

function containsPrivateSigningKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('keys' in value)) return false
  const keys = (value as { keys?: unknown }).keys
  return Array.isArray(keys) && keys.some((key) => typeof key === 'object' && key !== null && 'd' in key)
}

function decryptBundledJwks(encryptionKey: string): string {
  const masterKey = Buffer.from(encryptionKey, 'base64')
  if (masterKey.length !== 32) throw new Error('invalid bundle encryption key')
  const derivedKey = Buffer.from(hkdfSync(
    'sha256',
    masterKey,
    Buffer.from('djai-sign-in'),
    Buffer.from('oidc-jwks-bundle-v1'),
    32,
  ))
  const bundle = JSON.parse(readFileSync(
    new URL('../secrets/oidc-jwks.enc.json', import.meta.url),
    'utf8',
  )) as { ciphertext: string; iv: string; tag: string; version: number }
  if (bundle.version !== 1) throw new Error('unsupported JWKS bundle version')
  const decipher = createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(bundle.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(bundle.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(bundle.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function normalizedJwks(environment: NodeJS.ProcessEnv): string | undefined {
  const candidates = [
    environment.OIDC_JWKS_BASE64
      ? Buffer.from(environment.OIDC_JWKS_BASE64.trim(), 'base64').toString('utf8')
      : undefined,
    environment.OIDC_JWKS,
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = parseJsonEnvironment(candidate)
      if (containsPrivateSigningKey(parsed)) return JSON.stringify(parsed)
    } catch {
      // Fall through to the encrypted bundle.
    }
  }
  if (!environment.CLIENT_SECRET_ENCRYPTION_KEY) return environment.OIDC_JWKS
  try {
    return decryptBundledJwks(environment.CLIENT_SECRET_ENCRYPTION_KEY)
  } catch {
    return environment.OIDC_JWKS
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  OIDC_ISSUER: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['disable', 'require']).default('require'),
  DATABASE_CA_CERT: z.string().min(1).optional().transform((value) => value?.replaceAll('\\n', '\n')),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  OIDC_COOKIE_KEYS: z.string().transform((value) => value.split(',').map((key) => key.trim()).filter(Boolean)),
  AUTH_TRANSACTION_KEY: base64Key,
  CLIENT_SECRET_ENCRYPTION_KEY: base64Key,
  OIDC_JWKS: z.string().transform((value, context) => {
    try {
      return parseJsonEnvironment(value) as { keys?: unknown[] }
    } catch {
      context.addIssue({ code: 'custom', message: 'must be valid JSON' })
      return z.NEVER
    }
  }),
  TRUST_PROXY: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ENABLE_SIGNUP: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  DEVELOPER_CONSOLE_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DEVELOPER_EMAIL_ALLOWLIST: z.string().default('').transform((value) => value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  ID_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  AUTH_CODE_TTL_SECONDS: z.coerce.number().int().min(30).max(300).default(90),
  INTERACTION_TTL_SECONDS: z.coerce.number().int().min(120).max(1800).default(600),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3600),
})

export type AppConfig = Omit<z.infer<typeof schema>, 'OIDC_JWKS' | 'DATABASE_CA_CERT'> & {
  DATABASE_CA_CERT?: string
  OIDC_JWKS: { keys: Record<string, unknown>[] }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const normalizedEnvironment = { ...environment, OIDC_JWKS: normalizedJwks(environment) }
  const parsed = schema.parse(normalizedEnvironment)
  const issues: string[] = []

  if (parsed.OIDC_COOKIE_KEYS.length < 2 || parsed.OIDC_COOKIE_KEYS.some((key) => key.length < 32)) {
    issues.push('OIDC_COOKIE_KEYS must contain at least two comma-separated keys of 32 or more characters')
  }

  if (!Array.isArray(parsed.OIDC_JWKS.keys)
    || !parsed.OIDC_JWKS.keys.some((key) => typeof key === 'object' && key !== null && 'd' in key)) {
    issues.push('OIDC_JWKS must contain at least one private signing key')
  }

  if (parsed.NODE_ENV === 'production') {
    if (parsed.OIDC_ISSUER !== 'https://id.djai.academy') {
      issues.push('production OIDC_ISSUER must be exactly https://id.djai.academy')
    }
    if (!parsed.OIDC_ISSUER.startsWith('https://')) {
      issues.push('production issuer must use HTTPS')
    }
  }

  if (parsed.DEVELOPER_CONSOLE_ENABLED && parsed.DEVELOPER_EMAIL_ALLOWLIST.length === 0) {
    issues.push('DEVELOPER_EMAIL_ALLOWLIST must contain at least one exact email when the developer console is enabled')
  }

  if (issues.length > 0) {
    throw new Error(`Invalid identity service configuration:\n- ${issues.join('\n- ')}`)
  }

  return parsed as AppConfig
}
