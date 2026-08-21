// Hostinger's LiteSpeed adapter loads the entry file with CommonJS require().
// Dynamic import keeps that synchronous require compatible with the ESM app.
import('./scripts/migrate.js')
  .then(() => import('./src/main.js'))
  .catch((error) => {
    console.error('DJAI identity provider failed to start', error)
    process.exitCode = 1
  })
