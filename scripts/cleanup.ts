import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/database.js'

const config = loadConfig()
const database = createDatabase(config)
try {
  const result = await database.query('select * from cleanup_expired_oidc_data()')
  process.stdout.write(`${JSON.stringify(result.rows[0] ?? {})}\n`)
} finally {
  await database.end()
}
