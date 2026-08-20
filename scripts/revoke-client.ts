import { parseArgs } from 'node:util'
import { ClientRegistry } from '../src/client-registry.js'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/database.js'
import { SecretBox } from '../src/secret-box.js'

const { values } = parseArgs({ options: { id: { type: 'string' }, actor: { type: 'string' } }, strict: true })
if (!values.id || !values.actor) throw new Error('Usage: npm run client:revoke -- --id <client> --actor <operator>')
const config = loadConfig()
const database = createDatabase(config)
try {
  const registry = new ClientRegistry(database, new SecretBox(config.CLIENT_SECRET_ENCRYPTION_KEY))
  await registry.revoke(values.id, values.actor)
  process.stdout.write(`Revoked ${values.id}. Restart provider instances to evict the active client cache.\n`)
} finally {
  await database.end()
}
