import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { cookiesFrom, setCookie } from './http-cookies.js'

export class CsrfProtection {
  constructor(
    private readonly secret: Buffer,
    private readonly secure: boolean,
    private readonly name = 'djai-csrf',
  ) {}

  issue(response: Response, interactionUid: string): string {
    const random = randomBytes(24).toString('base64url')
    const signature = this.signature(random, interactionUid)
    const token = `${random}.${signature}`
    setCookie(response, this.cookieName, token, {
      httpOnly: true,
      maxAgeSeconds: 600,
      path: '/',
      sameSite: 'Lax',
      secure: this.secure,
    })
    return token
  }

  verify(request: Request, submitted: unknown, interactionUid: string): boolean {
    if (typeof submitted !== 'string' || submitted.length > 256) return false
    const cookie = cookiesFrom(request)[this.cookieName]
    if (!cookie || cookie !== submitted) return false
    const [random, signature, extra] = submitted.split('.')
    if (!random || !signature || extra) return false
    const expected = this.signature(random, interactionUid)
    const actualBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  }

  private signature(random: string, interactionUid: string): string {
    return createHmac('sha256', this.secret).update(`${random}.${interactionUid}`).digest('base64url')
  }

  private get cookieName(): string {
    return this.secure ? `__Host-${this.name}` : this.name
  }
}
