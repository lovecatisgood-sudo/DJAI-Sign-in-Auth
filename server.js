// Stable production entry point for hosts that auto-detect a root Node.js file.
// Migrations must finish successfully before the HTTP server starts.
await import('./dist/scripts/migrate.js')
await import('./dist/src/main.js')
