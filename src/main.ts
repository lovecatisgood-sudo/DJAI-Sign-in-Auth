import { createServer } from 'node:http'
import { createIdentityService } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const service = await createIdentityService(config)
const server = createServer(service.app)

server.listen(config.PORT, () => {
  service.logger.info({ issuer: config.OIDC_ISSUER, port: config.PORT }, 'DJAI identity provider listening')
})

function shutdown(signal: string): void {
  service.logger.info({ signal }, 'shutting down')
  server.close((error) => {
    if (error) service.logger.error({ err: error }, 'HTTP server close failed')
    void service.close().then(() => process.exit(error ? 1 : 0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once('SIGINT', () => { shutdown('SIGINT') })
process.once('SIGTERM', () => { shutdown('SIGTERM') })
