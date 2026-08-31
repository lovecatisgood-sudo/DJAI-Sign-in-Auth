import type { Request, Response } from 'express'
import { clearCookie, cookiesFrom, setCookie } from './http-cookies.js'
import type { SecretBox } from './secret-box.js'

export interface AuthTransaction {
  interactionUid: string
  kind: 'google' | 'signup'
  locale?: 'en' | 'th'
  storage: Record<string, string>
  createdAt: number
}

export class AuthTransactionCookie {
  constructor(
    private readonly secrets: SecretBox,
    private readonly secure: boolean,
  ) {}

  write(response: Response, transactionId: string, value: AuthTransaction): void {
    setCookie(response, this.cookieName(transactionId), this.secrets.seal(JSON.stringify(value)), {
      httpOnly: true,
      maxAgeSeconds: 600,
      path: '/',
      sameSite: 'Lax',
      secure: this.secure,
    })
  }

  read(request: Request, transactionId: string): AuthTransaction | undefined {
    const sealed = cookiesFrom(request)[this.cookieName(transactionId)]
    if (!sealed) return undefined
    try {
      const parsed = JSON.parse(this.secrets.open(sealed)) as Partial<AuthTransaction>
      if (
        typeof parsed.interactionUid !== 'string'
        || (parsed.kind !== 'google' && parsed.kind !== 'signup')
        || (parsed.locale !== undefined && parsed.locale !== 'en' && parsed.locale !== 'th')
        || !parsed.storage
        || typeof parsed.storage !== 'object'
        || typeof parsed.createdAt !== 'number'
        || Date.now() - parsed.createdAt > 10 * 60 * 1000
      ) return undefined
      return parsed as AuthTransaction
    } catch {
      return undefined
    }
  }

  clear(response: Response, transactionId: string): void {
    clearCookie(response, this.cookieName(transactionId), { path: '/', secure: this.secure })
  }

  private cookieName(transactionId: string): string {
    if (!/^[a-f0-9-]{36}$/.test(transactionId)) throw new Error('Invalid authentication transaction')
    return `${this.secure ? '__Host-' : ''}djai-auth-${transactionId}`
  }
}
