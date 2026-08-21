import { cp, copyFile, rm } from 'node:fs/promises'

await rm('dist/server.js', { force: true })

await Promise.all([
  cp('certs', 'dist/certs', { recursive: true }),
  cp('migrations', 'dist/migrations', { recursive: true }),
  copyFile('runtime/server.cjs', 'dist/server.cjs'),
])
