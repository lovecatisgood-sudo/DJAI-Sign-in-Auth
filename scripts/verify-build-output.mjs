import { access } from 'node:fs/promises'

const requiredFiles = [
  'dist/scripts/migrate.js',
  'dist/src/main.js',
]

await Promise.all(requiredFiles.map((file) => access(file)))
process.stdout.write(`DJAI Auth build complete. Entry point: server.js (${requiredFiles.join(', ')})\n`)
