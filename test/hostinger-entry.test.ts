import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Hostinger CommonJS entry', () => {
  it('can be required synchronously and starts the ESM graph in order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'djai-hostinger-entry-'))
    temporaryDirectories.push(directory)
    await Promise.all([
      mkdir(join(directory, 'scripts')),
      mkdir(join(directory, 'src')),
      writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' })),
      copyFile(resolve('runtime/server.cjs'), join(directory, 'server.cjs')),
    ])
    const marker = join(directory, 'started.txt')
    await writeFile(join(directory, 'scripts/migrate.js'), "globalThis.migrationFinished = true\n")
    await writeFile(join(directory, 'src/main.js'), `
      import { writeFileSync } from 'node:fs'
      if (!globalThis.migrationFinished) throw new Error('migration did not finish first')
      writeFileSync(process.env.DJAI_TEST_MARKER, 'started')
    `)

    const result = spawnSync(process.execPath, ['-e', "require('./server.cjs')"], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, DJAI_TEST_MARKER: marker },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(await readFile(marker, 'utf8')).toBe('started')
  })
})
