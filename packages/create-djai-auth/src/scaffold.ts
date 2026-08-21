import { access, appendFile, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface ScaffoldOptions {
  directory: string
  developerApi: string
  developerToken: string
  displayName: string
  environment: 'development' | 'staging' | 'production'
  callbackUrl: string
  homeUrl: string
  policyUrl: string
  termsUrl: string
  fetch?: typeof globalThis.fetch
}

interface RegistrationResponse {
  issuer: string
  client_id: string
  client_secret: string
  callback_url: string
}

const createdFiles = ['.env.djai', '.env.djai.example', 'djai-auth.mjs']

export async function scaffoldDjaiAuth(options: ScaffoldOptions): Promise<string[]> {
  await Promise.all(createdFiles.map(async (file) => {
    try {
      await access(join(options.directory, file), constants.F_OK)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    throw new Error(`Refusing to overwrite ${file}`)
  }))
  const request = options.fetch ?? globalThis.fetch
  const endpoint = new URL('/developer/api/v1/clients', ensureTrailingSlash(options.developerApi))
  const response = await request(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.developerToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      displayName: options.displayName,
      environment: options.environment,
      redirectUris: [options.callbackUrl],
      homeUrl: options.homeUrl,
      policyUrl: options.policyUrl,
      termsUrl: options.termsUrl,
    }),
  })
  if (!response.ok) throw new Error(`DJAI client registration failed (${response.status})`)
  const registration = await response.json() as Partial<RegistrationResponse>
  if (!registration.issuer || !registration.client_id || !registration.client_secret || !registration.callback_url) {
    throw new Error('DJAI client registration returned an invalid response')
  }
  const sessionKey = randomBytes(32).toString('base64')
  const environment = [
    `DJAI_ISSUER=${registration.issuer}`,
    `DJAI_CLIENT_ID=${registration.client_id}`,
    `DJAI_CLIENT_SECRET=${registration.client_secret}`,
    `DJAI_CALLBACK_URL=${registration.callback_url}`,
    `DJAI_SESSION_KEY=${sessionKey}`,
    '',
  ].join('\n')
  const example = [
    `DJAI_ISSUER=${registration.issuer}`,
    `DJAI_CLIENT_ID=${registration.client_id}`,
    'DJAI_CLIENT_SECRET=<server-secret>',
    `DJAI_CALLBACK_URL=${registration.callback_url}`,
    'DJAI_SESSION_KEY=<base64-encoded-32-byte-key>',
    '',
  ].join('\n')
  const module = `import { createDjaiAuthRouter } from '@djai/auth-express'\n\nexport const djaiAuthRouter = createDjaiAuthRouter({\n  issuer: process.env.DJAI_ISSUER,\n  clientId: process.env.DJAI_CLIENT_ID,\n  clientSecret: process.env.DJAI_CLIENT_SECRET,\n  callbackUrl: process.env.DJAI_CALLBACK_URL,\n  sessionKey: process.env.DJAI_SESSION_KEY,\n  databaseUrl: process.env.DATABASE_URL,\n})\n`
  await writeFile(join(options.directory, '.env.djai'), environment, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await writeFile(join(options.directory, '.env.djai.example'), example, { encoding: 'utf8', mode: 0o644, flag: 'wx' })
  await writeFile(join(options.directory, 'djai-auth.mjs'), module, { encoding: 'utf8', mode: 0o644, flag: 'wx' })
  await ensureIgnored(options.directory)
  return createdFiles
}

async function ensureIgnored(directory: string): Promise<void> {
  const filename = join(directory, '.gitignore')
  let existing = ''
  try { existing = await readFile(filename, 'utf8') } catch { /* A new file is expected in some apps. */ }
  if (existing.split(/\r?\n/).includes('.env.djai')) return
  await appendFile(filename, `${existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''}.env.djai\n`, 'utf8')
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}
