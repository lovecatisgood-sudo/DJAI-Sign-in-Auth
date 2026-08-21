import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/database.js'

const config = loadConfig()
const database = createDatabase(config)

try {
  await database.query(`create table if not exists oidc_schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`)
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url))
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
  for (const filename of files) {
    const exists = await database.query('select 1 from oidc_schema_migrations where filename = $1', [filename])
    if (exists.rowCount) continue
    const sql = await readFile(new URL(filename, new URL('../migrations/', import.meta.url)), 'utf8')
    const client = await database.connect()
    try {
      await client.query(sql)
      await client.query('insert into oidc_schema_migrations (filename) values ($1)', [filename])
      process.stdout.write(`Applied ${filename}\n`)
    } finally {
      client.release()
    }
  }
} finally {
  await database.end()
}
