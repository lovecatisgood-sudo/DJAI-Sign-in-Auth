// Self-contained production entry point copied into dist during the build.
// Migrations must finish successfully before the HTTP server starts.
await import('./scripts/migrate.js')
await import('./src/main.js')
