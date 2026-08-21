import { access } from 'node:fs/promises'

const requiredFiles = [
  'dist/server.cjs',
  'dist/scripts/migrate.js',
  'dist/src/main.js',
  'dist/migrations/0001_identity_provider.sql',
  'dist/certs/supabase-root-2021-ca.crt',
]

await Promise.all(requiredFiles.map((file) => access(file)))
process.stdout.write(`DJAI Auth build complete. Hostinger entry point: dist/server.cjs (${requiredFiles.join(', ')})\n`)
