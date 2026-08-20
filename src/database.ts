import pg from 'pg'
import type { AppConfig } from './config.js'

const { Pool } = pg

export type Database = pg.Pool

export function createDatabase(config: Pick<AppConfig, 'DATABASE_URL' | 'DATABASE_SSL'>): Database {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: config.DATABASE_SSL === 'require' ? { rejectUnauthorized: true } : false,
    application_name: 'djai-sign-in',
  })
}

export async function verifyDatabase(database: Database): Promise<void> {
  await database.query('select 1')
}
