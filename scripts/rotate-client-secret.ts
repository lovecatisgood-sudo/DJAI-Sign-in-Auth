import { parseArgs } from 'node:util'
import { ClientRegistry } from '../src/client-registry.js'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/database.js'
import { SecretBox } from '../src/secret-box.js'

const { values } = parseArgs({ options: { id: { type: 'string' }, actor: { type: 'string' } }, strict: true })
if (!values.id || !values.actor) throw new Error('Usage: npm run client:rotate-secret -- --id <client> --actor <operator>')
const config = loadConfig()
const database = createDatabase(config)
try {
  const registry = new ClientRegistry(database, new SecretBox(config.CLIENT_SECRET_ENCRYPTION_KEY))
  const secret = await registry.rotateSecret(values.id, values.actor)
  process.stdout.write(`client_id=${values.id}\nclient_secret=${secret}\n`)
  process.stderr.write('Restart provider instances after storing this secret in the application secret manager.\n')
} finally {
  await database.end()
}
