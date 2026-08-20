import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const IV_BYTES = 12

export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox requires a 32-byte key')
  }

  seal(value: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
  }

  open(sealed: string): string {
    const [version, ivPart, tagPart, encryptedPart, extra] = sealed.split('.')
    if (version !== VERSION || !ivPart || !tagPart || !encryptedPart || extra) {
      throw new Error('Invalid sealed value')
    }
    const iv = Buffer.from(ivPart, 'base64url')
    const tag = Buffer.from(tagPart, 'base64url')
    const encrypted = Buffer.from(encryptedPart, 'base64url')
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('Invalid sealed value')
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }
}
