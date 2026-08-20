import { parseArgs } from 'node:util'
import { ClientRegistry } from '../src/client-registry.js'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/database.js'
import { SecretBox } from '../src/secret-box.js'

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    environment: { type: 'string' },
    redirect: { type: 'string', multiple: true },
    home: { type: 'string' },
    privacy: { type: 'string' },
    terms: { type: 'string' },
    owner: { type: 'string' },
    security: { type: 'string' },
    actor: { type: 'string' },
  },
  strict: true,
})

for (const required of ['id', 'name', 'environment', 'redirect', 'home', 'privacy', 'terms', 'owner', 'security', 'actor'] as const) {
  if (!values[required] || (Array.isArray(values[required]) && values[required].length === 0)) {
    throw new Error(`Missing required --${required}`)
  }
}

const config = loadConfig()
const database = createDatabase(config)
try {
  const registry = new ClientRegistry(database, new SecretBox(config.CLIENT_SECRET_ENCRYPTION_KEY))
  const result = await registry.register({
    clientId: String(values.id),
    displayName: String(values.name),
    environment: values.environment as 'development' | 'staging' | 'production',
    redirectUris: values.redirect as string[],
    homeUrl: String(values.home),
    policyUrl: String(values.privacy),
    termsUrl: String(values.terms),
    ownerEmail: String(values.owner),
    securityContact: String(values.security),
  }, String(values.actor))
  process.stdout.write(`client_id=${result.clientId}\nclient_secret=${result.clientSecret}\n`)
  process.stderr.write('The client secret is shown once. Move it into the application secret manager now.\n')
} finally {
  await database.end()
}
