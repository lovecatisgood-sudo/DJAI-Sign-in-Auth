import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import type { AppConfig } from './config.js'

const { Pool } = pg

export type Database = pg.Pool

export function createDatabase(config: Pick<AppConfig, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_CA_CERT'>): Database {
  const certificate = config.DATABASE_SSL === 'require'
    ? config.DATABASE_CA_CERT ?? readFileSync(resolve(process.cwd(), 'certs/supabase-root-2021-ca.crt'), 'utf8')
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
