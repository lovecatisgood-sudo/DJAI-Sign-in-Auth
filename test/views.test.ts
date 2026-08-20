import { describe, expect, it } from 'vitest'
import { renderConsent, renderLogin } from '../src/views.js'

describe('identity views', () => {
  it('escapes client-controlled display metadata', () => {
    const html = renderLogin({
      uid: 'abc', csrf: 'csrf', clientName: '<script>alert(1)</script>', locale: 'en', allowSignup: true,
    })
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows only the approved identity release', () => {
    const html = renderConsent({
      uid: 'abc', csrf: 'csrf', clientName: 'DJAI Studio', email: 'member@example.com', locale: 'en',
    })
    expect(html).toContain('stable DJAI user ID')
    expect(html).toContain('verified email address')
    expect(html).not.toContain('subscription')
    expect(html).not.toContain('membership')
  })
})
