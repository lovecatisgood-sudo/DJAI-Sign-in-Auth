import { randomUUID } from 'node:crypto'
import { exportJWK, generateKeyPair } from 'jose'

const { privateKey } = await generateKeyPair('RS256', { modulusLength: 3072, extractable: true })
const key = await exportJWK(privateKey)
const jwks = {
  keys: [{ ...key, alg: 'RS256', use: 'sig', kid: randomUUID() }],
}

process.stdout.write(`${JSON.stringify(jwks)}\n`)
process.stderr.write('Store this private JWKS in managed secret storage. Do not write it to the repository.\n')
