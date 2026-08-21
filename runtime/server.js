// Hostinger may load server.js with CommonJS require() even in an ESM project.
// No top-level await: dynamic import keeps that synchronous require compatible.
import('./scripts/migrate.js')
  .then(() => import('./src/main.js'))
  .catch((error) => {
    console.error('DJAI identity provider failed to start', error)
    process.exitCode = 1
  })
