import { cp, copyFile } from 'node:fs/promises'

await Promise.all([
  cp('certs', 'dist/certs', { recursive: true }),
  cp('migrations', 'dist/migrations', { recursive: true }),
  copyFile('runtime/server.js', 'dist/server.js'),
])
