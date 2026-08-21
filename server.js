// Compatibility entry point for Hostinger repository auto-detection.
import('./dist/server.cjs')
  .catch((error) => {
    console.error('DJAI identity provider failed to start', error)
    process.exitCode = 1
  })
