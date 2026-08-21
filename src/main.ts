import { createServer } from 'node:http'
import type { IdentityService } from './app.js'

let service: IdentityService | undefined
let startupError = false

const configuredPort = Number.parseInt(process.env.PORT ?? '3000', 10)
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535
  ? configuredPort
  : 3000

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.url === '/health/live') {
    response.statusCode = 200
    response.end(JSON.stringify({ ok: true, service: 'djai-sign-in', state: startupError ? 'failed' : 'starting' }))
    return
  }
  response.statusCode = 503
  response.end(JSON.stringify({ ok: false, state: startupError ? 'failed' : 'starting' }))
})

server.listen(port, () => {
  process.stdout.write(`DJAI identity provider bootstrap listening on port ${port}\n`)
  void initialize()
})

async function initialize(): Promise<void> {
  try {
    await import('../scripts/migrate.js')
    const [{ createIdentityService }, { loadConfig }] = await Promise.all([
      import('./app.js'),
      import('./config.js'),
    ])
    const config = loadConfig()
    service = await createIdentityService(config)
    server.removeAllListeners('request')
    server.on('request', service.app)
    service.logger.info({ issuer: config.OIDC_ISSUER, port: config.PORT }, 'DJAI identity provider ready')
  } catch (error) {
    startupError = true
    console.error('DJAI identity provider failed to initialize', error)
  }
}

function shutdown(signal: string): void {
  if (service) service.logger.info({ signal }, 'shutting down')
  server.close((error) => {
    if (error) console.error('HTTP server close failed', error)
    if (service) {
      void service.close().finally(() => process.exit(error ? 1 : 0))
    } else {
      process.exit(error ? 1 : 0)
    }
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once('SIGINT', () => { shutdown('SIGINT') })
process.once('SIGTERM', () => { shutdown('SIGTERM') })
