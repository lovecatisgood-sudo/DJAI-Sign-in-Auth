import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createDatabase } from '../src/database.js'

describe('database TLS configuration', () => {
  it('keeps the bundled CA when a hosting dashboard supplies a filename', async () => {
    const database = createDatabase({
      DATABASE_URL: 'postgres://example:example@localhost/example',
      DATABASE_SSL: 'require',
      DATABASE_CA_CERT: 'prod-ca-2021.crt',
    })
    const options = database.options as typeof database.options & {
      ssl: { ca: string; rejectUnauthorized: boolean }
    }
    const bundled = readFileSync(new URL('../certs/supabase-root-2021-ca.crt', import.meta.url), 'utf8')

    expect(options.ssl.rejectUnauthorized).toBe(true)
    expect(options.ssl.ca).toBe(bundled)
    await database.end()
  })
})
