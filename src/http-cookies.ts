import type { Request, Response } from 'express'

export function cookiesFrom(request: Pick<Request, 'headers'>): Record<string, string> {
  const result: Record<string, string> = {}
  const header = request.headers.cookie
  if (!header) return result
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=')
    if (index < 1) continue
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    try {
      result[name] = decodeURIComponent(value)
    } catch {
      // Ignore malformed cookies rather than reflecting their content.
    }
  }
  return result
}

export interface CookieOptions {
  httpOnly?: boolean
  maxAgeSeconds?: number
  path?: string
  sameSite?: 'Lax' | 'Strict'
  secure?: boolean
}

export function setCookie(response: Response, name: string, value: string, options: CookieOptions = {}): void {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path ?? '/'}`)
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
  if (options.secure !== false) parts.push('Secure')
  const existing = response.getHeader('Set-Cookie')
  const cookies = Array.isArray(existing) ? existing : existing ? [String(existing)] : []
  response.setHeader('Set-Cookie', [...cookies, parts.join('; ')])
}

export function clearCookie(response: Response, name: string, options: Pick<CookieOptions, 'path' | 'secure'> = {}): void {
  setCookie(response, name, '', { ...options, maxAgeSeconds: 0 })
}
