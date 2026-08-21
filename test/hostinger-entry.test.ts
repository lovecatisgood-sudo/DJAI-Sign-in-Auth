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
  it.each(['server.js', 'server.cjs'])('%s can be required synchronously and starts the ESM application', async (entry) => {
    const directory = await mkdtemp(join(tmpdir(), 'djai-hostinger-entry-'))
    temporaryDirectories.push(directory)
    await Promise.all([
      mkdir(join(directory, 'src')),
      writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' })),
      copyFile(resolve('runtime', entry), join(directory, entry)),
    ])
    const marker = join(directory, 'started.txt')
    await writeFile(join(directory, 'src/main.js'), `
      import { writeFileSync } from 'node:fs'
      writeFileSync(process.env.DJAI_TEST_MARKER, 'started')
    `)

    const result = spawnSync(process.execPath, ['-e', `require('./${entry}')`], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, DJAI_TEST_MARKER: marker },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(await readFile(marker, 'utf8')).toBe('started')
  })
})
