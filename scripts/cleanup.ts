import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/database.js'

const config = loadConfig()
const database = createDatabase(config)
try {
  const [oidc, developer] = await Promise.all([
    database.query('select * from cleanup_expired_oidc_data()'),
    database.query('select * from cleanup_expired_developer_data()'),
  ])
  const oidcResult: unknown = oidc.rows[0]
  const developerResult: unknown = developer.rows[0]
  process.stdout.write(`${JSON.stringify({ oidc: oidcResult ?? {}, developer: developerResult ?? {} })}\n`)
} finally {
  await database.end()
}
