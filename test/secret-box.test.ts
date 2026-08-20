import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SecretBox } from '../src/secret-box.js'

describe('SecretBox', () => {
  it('round trips a secret without exposing plaintext', () => {
    const box = new SecretBox(randomBytes(32))
    const sealed = box.seal('client-secret-value')
    expect(sealed).not.toContain('client-secret-value')
    expect(box.open(sealed)).toBe('client-secret-value')
  })

  it('rejects tampering', () => {
    const box = new SecretBox(randomBytes(32))
    const sealed = box.seal('identity')
    const parts = sealed.split('.')
    parts[3] = `${parts[3]![0] === 'A' ? 'B' : 'A'}${parts[3]!.slice(1)}`
    expect(() => box.open(parts.join('.'))).toThrow()
  })
})
