import { cp, copyFile } from 'node:fs/promises'

await Promise.all([
  cp('certs', 'dist/certs', { recursive: true }),
  cp('migrations', 'dist/migrations', { recursive: true }),
  cp('secrets', 'dist/secrets', { recursive: true }),
  copyFile('runtime/server.cjs', 'dist/server.cjs'),
  copyFile('runtime/server.js', 'dist/server.js'),
])
