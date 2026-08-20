import type { Request, Response } from 'express'
import { clearCookie, cookiesFrom, setCookie } from './http-cookies.js'
import type { SecretBox } from './secret-box.js'

interface LoginResult {
  interactionUid: string
  subject: string
  createdAt: number
}

export class LoginResultCookie {
  constructor(
    private readonly secrets: SecretBox,
    private readonly secure: boolean,
  ) {}

  write(response: Response, value: Omit<LoginResult, 'createdAt'>): void {
    setCookie(response, this.cookieName, this.secrets.seal(JSON.stringify({ ...value, createdAt: Date.now() })), {
      httpOnly: true,
      maxAgeSeconds: 120,
      path: '/',
      sameSite: 'Lax',
      secure: this.secure,
    })
  }

  consume(request: Request, response: Response, interactionUid: string): string | undefined {
    const sealed = cookiesFrom(request)[this.cookieName]
    clearCookie(response, this.cookieName, { path: '/', secure: this.secure })
    if (!sealed) return undefined
    try {
      const value = JSON.parse(this.secrets.open(sealed)) as Partial<LoginResult>
      if (
        value.interactionUid !== interactionUid
        || typeof value.subject !== 'string'
        || typeof value.createdAt !== 'number'
        || Date.now() - value.createdAt > 120_000
      ) return undefined
      return value.subject
    } catch {
      return undefined
    }
  }

  private get cookieName(): string {
    return this.secure ? '__Host-djai-login-result' : 'djai-login-result'
  }
}
