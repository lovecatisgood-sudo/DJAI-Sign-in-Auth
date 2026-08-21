import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rm } from 'node:fs/promises'
import { scaffoldDjaiAuth } from '../src/scaffold.js'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))))

describe('create-djai-auth scaffolder', () => {
  it('registers once, protects the secret, and preserves gitignore content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'create-djai-auth-'))
    directories.push(directory)
    await writeFile(join(directory, '.gitignore'), 'node_modules/\n')
    const calls: URL[] = []
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(new URL(input instanceof Request ? input.url : input))
      return new Response(JSON.stringify({
        issuer: 'https://id.djai.academy', client_id: 'my-app-development-abc123',
        client_secret: 'one-time-secret', callback_url: 'http://localhost:3000/auth/djai/callback',
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    }
    await scaffoldDjaiAuth({
      directory, developerApi: 'https://id.djai.academy', developerToken: 'developer-token',
      displayName: 'My App', environment: 'development', callbackUrl: 'http://localhost:3000/auth/djai/callback',
      homeUrl: 'http://localhost:3000/', policyUrl: 'http://localhost:3000/privacy', termsUrl: 'http://localhost:3000/terms',
      fetch: fakeFetch,
    })
    expect(calls[0]?.pathname).toBe('/developer/api/v1/clients')
    expect(await readFile(join(directory, '.env.djai'), 'utf8')).toContain('DJAI_CLIENT_SECRET=one-time-secret')
    expect(await readFile(join(directory, '.env.djai.example'), 'utf8')).not.toContain('one-time-secret')
    expect(await readFile(join(directory, 'djai-auth.mjs'), 'utf8')).toContain('createDjaiAuthRouter')
    expect(await readFile(join(directory, '.gitignore'), 'utf8')).toBe('node_modules/\n.env.djai\n')
  })

  it('refuses existing targets before registering a client', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'create-djai-auth-'))
    directories.push(directory)
    await writeFile(join(directory, '.env.djai'), 'existing')
    const fakeFetch = vi.fn()
    await expect(scaffoldDjaiAuth({
      directory, developerApi: 'https://id.djai.academy', developerToken: 'developer-token', displayName: 'My App',
      environment: 'development', callbackUrl: 'http://localhost:3000/auth/djai/callback', homeUrl: 'http://localhost:3000/',
      policyUrl: 'http://localhost:3000/privacy', termsUrl: 'http://localhost:3000/terms', fetch: fakeFetch,
    })).rejects.toThrow('Refusing to overwrite .env.djai')
    expect(fakeFetch).not.toHaveBeenCalled()
  })
})
