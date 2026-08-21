import { z } from 'zod'

const base64Key = z.string().min(1).transform((value, context) => {
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32) {
    context.addIssue({ code: 'custom', message: 'must decode to exactly 32 bytes' })
    return z.NEVER
  }
  return decoded
})

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
      return JSON.parse(value) as { keys?: unknown[] }
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
  const parsed = schema.parse(environment)
  const issues: string[] = []

  if (parsed.OIDC_COOKIE_KEYS.length < 2 || parsed.OIDC_COOKIE_KEYS.some((key) => key.length < 32)) {
    issues.push('OIDC_COOKIE_KEYS must contain at least two comma-separated keys of 32 or more characters')
  }

  if (!Array.isArray(parsed.OIDC_JWKS.keys) || parsed.OIDC_JWKS.keys.length === 0) {
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
