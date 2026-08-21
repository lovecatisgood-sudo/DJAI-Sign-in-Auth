import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { AppConfig } from './config.js'

const { Pool } = pg

export type Database = pg.Pool

function databaseCertificateAuthority(override: string | undefined): string {
  const bundled = readFileSync(
    fileURLToPath(new URL('../certs/supabase-root-2021-ca.crt', import.meta.url)),
    'utf8',
  )
  if (!override) return bundled

  try {
    const normalized = override.trim().replaceAll('\\n', '\n')
    const bundledCertificate = new X509Certificate(bundled)
    const overrideCertificate = new X509Certificate(normalized)
    if (overrideCertificate.fingerprint256 === bundledCertificate.fingerprint256) return bundled
    return `${bundled.trim()}\n${normalized}\n`
  } catch {
    // Hosting dashboards can turn a PEM into a filename or otherwise corrupt it.
    // Keep the known Supabase CA instead of allowing that value to break startup.
    return bundled
  }
}

export function createDatabase(config: Pick<AppConfig, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_CA_CERT'>): Database {
  const certificate = config.DATABASE_SSL === 'require'
    ? databaseCertificateAuthority(config.DATABASE_CA_CERT)
    : undefined

  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: config.DATABASE_SSL === 'require'
      ? { ca: certificate, rejectUnauthorized: true }
      : false,
    application_name: 'djai-sign-in',
  })
}

export async function verifyDatabase(database: Database): Promise<void> {
  await database.query('select 1')
}
