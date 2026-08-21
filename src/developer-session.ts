import type { Request, Response } from 'express'
import { clearCookie, cookiesFrom, setCookie } from './http-cookies.js'
import type { SecretBox } from './secret-box.js'

interface DeveloperSessionValue {
  subject: string
  email: string
  createdAt: number
}

export class DeveloperSession {
  constructor(
    private readonly secrets: SecretBox,
    private readonly secure: boolean,
  ) {}

  write(response: Response, identity: { subject: string; email: string }): void {
    const value: DeveloperSessionValue = { ...identity, createdAt: Date.now() }
    setCookie(response, this.cookieName, this.secrets.seal(JSON.stringify(value)), {
      httpOnly: true,
      maxAgeSeconds: 8 * 60 * 60,
      path: '/',
      sameSite: 'Lax',
      secure: this.secure,
    })
  }

  read(request: Request): DeveloperSessionValue | undefined {
    const sealed = cookiesFrom(request)[this.cookieName]
    if (!sealed) return undefined
    try {
      const value = JSON.parse(this.secrets.open(sealed)) as Partial<DeveloperSessionValue>
      if (
        typeof value.subject !== 'string'
        || typeof value.email !== 'string'
        || typeof value.createdAt !== 'number'
        || Date.now() - value.createdAt > 8 * 60 * 60 * 1000
      ) return undefined
      return value as DeveloperSessionValue
    } catch {
      return undefined
    }
  }

  clear(response: Response): void {
    clearCookie(response, this.cookieName, { path: '/', secure: this.secure })
  }

  private get cookieName(): string {
    return this.secure ? '__Host-djai-developer-session' : 'djai-developer-session'
  }
}
