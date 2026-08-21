export type Locale = 'en' | 'th'

interface LoginView {
  uid: string
  csrf: string
  clientName: string
  locale: Locale
  allowSignup: boolean
  error?: string
}

interface ConsentView {
  uid: string
  csrf: string
  clientName: string
  clientUri?: string
  policyUri?: string
  tosUri?: string
  email: string
  locale: Locale
}

export function renderLogin(input: LoginView): string {
  const copy = input.locale === 'th'
    ? {
        title: 'เข้าสู่ระบบด้วย DJAI School',
        intro: `${input.clientName} ต้องการยืนยันบัญชี DJAI School ของคุณ`,
        email: 'อีเมล', password: 'รหัสผ่าน', submit: 'ดำเนินการต่อ', google: 'ดำเนินการต่อด้วย Google',
        signup: 'สร้างบัญชี DJAI School', recovery: 'ลืมรหัสผ่าน?', language: 'English',
      }
    : {
        title: 'Sign in with DJAI School',
        intro: `${input.clientName} wants to verify your DJAI School account.`,
        email: 'Email', password: 'Password', submit: 'Continue', google: 'Continue with Google',
        signup: 'Create a DJAI School account', recovery: 'Forgot password?', language: 'ไทย',
      }

  return layout(copy.title, input.locale, `
    <a class="language" href="?lang=${input.locale === 'en' ? 'th' : 'en'}">${copy.language}</a>
    <div class="brand"><span>DJAI</span><small>School identity</small></div>
    <h1>${escapeHtml(copy.title)}</h1>
    <p class="lede">${escapeHtml(copy.intro)}</p>
    ${input.error ? `<div class="error" role="alert">${escapeHtml(input.error)}</div>` : ''}
    <form method="post" action="/interaction/${encodeURIComponent(input.uid)}/login">
      <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
      <input type="hidden" name="lang" value="${input.locale}">
      <label>${copy.email}<input required autocomplete="email" inputmode="email" name="email" type="email" maxlength="320"></label>
      <label>${copy.password}<input required autocomplete="current-password" name="password" type="password" minlength="8" maxlength="200"></label>
      <button class="primary" type="submit">${copy.submit}</button>
    </form>
    <div class="divider"><span>or</span></div>
    <form method="post" action="/interaction/${encodeURIComponent(input.uid)}/google">
      <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
      <button class="secondary" type="submit">${copy.google}</button>
    </form>
    <div class="links">
      ${input.allowSignup ? `<a href="/interaction/${encodeURIComponent(input.uid)}/signup?lang=${input.locale}">${copy.signup}</a>` : ''}
      <a href="https://school.djai.academy/forgot-password">${copy.recovery}</a>
    </div>
  `)
}

export function renderSignup(input: Omit<LoginView, 'allowSignup'>): string {
  const copy = input.locale === 'th'
    ? { title: 'สร้างบัญชี DJAI School', intro: `สร้างบัญชีเพื่อดำเนินการต่อไปยัง ${input.clientName}`, email: 'อีเมล', password: 'รหัสผ่านใหม่', submit: 'สร้างบัญชี', back: 'กลับไปเข้าสู่ระบบ' }
    : { title: 'Create a DJAI School account', intro: `Create an account to continue to ${input.clientName}.`, email: 'Email', password: 'New password', submit: 'Create account', back: 'Back to sign in' }
  return layout(copy.title, input.locale, `
    <div class="brand"><span>DJAI</span><small>School identity</small></div>
    <h1>${copy.title}</h1><p class="lede">${escapeHtml(copy.intro)}</p>
    ${input.error ? `<div class="error" role="alert">${escapeHtml(input.error)}</div>` : ''}
    <form method="post" action="/interaction/${encodeURIComponent(input.uid)}/signup">
      <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
      <input type="hidden" name="lang" value="${input.locale}">
      <label>${copy.email}<input required autocomplete="email" name="email" type="email" maxlength="320"></label>
      <label>${copy.password}<input required autocomplete="new-password" name="password" type="password" minlength="8" maxlength="200"></label>
      <button class="primary" type="submit">${copy.submit}</button>
    </form>
    <div class="links"><a href="/interaction/${encodeURIComponent(input.uid)}?lang=${input.locale}">${copy.back}</a></div>
  `)
}

export function renderConsent(input: ConsentView): string {
  const copy = input.locale === 'th'
    ? { title: `ดำเนินการต่อไปยัง ${input.clientName}`, intro: 'แอปนี้จะได้รับข้อมูลต่อไปนี้', uid: 'รหัสผู้ใช้ DJAI แบบถาวร', email: 'อีเมลที่ยืนยันแล้ว', continue: 'ดำเนินการต่อ', cancel: 'ยกเลิก', account: 'บัญชี DJAI School' }
    : { title: `Continue to ${input.clientName}`, intro: 'This app will receive:', uid: 'Your stable DJAI user ID', email: 'Your verified email address', continue: 'Continue', cancel: 'Cancel', account: 'DJAI School account' }
  return layout(copy.title, input.locale, `
    <div class="brand"><span>DJAI</span><small>School identity</small></div>
    <h1>${escapeHtml(copy.title)}</h1><p class="lede">${copy.intro}</p>
    <ul class="claims"><li>${copy.uid}</li><li>${copy.email}</li></ul>
    <div class="account"><small>${copy.account}</small><strong>${escapeHtml(input.email)}</strong></div>
    <form method="post" action="/interaction/${encodeURIComponent(input.uid)}/confirm">
      <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
      <button class="primary" type="submit">${copy.continue}</button>
    </form>
    <form method="post" action="/interaction/${encodeURIComponent(input.uid)}/cancel">
      <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
      <button class="text-button" type="submit">${copy.cancel}</button>
    </form>
    <div class="legal">
      ${input.clientUri ? `<a href="${escapeHtml(input.clientUri)}">${escapeHtml(input.clientName)}</a>` : ''}
      ${input.policyUri ? `<a href="${escapeHtml(input.policyUri)}">Privacy</a>` : ''}
      ${input.tosUri ? `<a href="${escapeHtml(input.tosUri)}">Terms</a>` : ''}
    </div>
  `)
}

export function renderMessage(title: string, message: string, locale: Locale = 'en'): string {
  return layout(title, locale, `<div class="brand"><span>DJAI</span><small>School identity</small></div><h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(message)}</p>`)
}

function layout(title: string, locale: Locale, content: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/assets/main.css"></head><body><main class="shell"><section class="card">${content}</section><footer>Secure identity by DJAI School</footer></main></body></html>`
}

export function localeFrom(value: unknown): Locale {
  return value === 'th' ? 'th' : 'en'
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export const stylesheet = `
:root{color-scheme:dark;--bg:#07110f;--panel:#0e1d19;--line:#234139;--text:#f2f6f4;--muted:#a7b8b1;--accent:#6de2ad;--accent-ink:#062217;--danger:#ffb4a9}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 0,#173d31 0,transparent 32%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(100% - 32px,480px);margin:0 auto;padding:8vh 0 32px}.developer-shell{width:min(100% - 32px,1180px);margin:0 auto;padding:36px 0 64px}.card,.panel{position:relative;background:color-mix(in srgb,var(--panel) 94%,transparent);border:1px solid var(--line);border-radius:24px;padding:32px;box-shadow:0 24px 80px #0008}.developer-shell>.card{width:min(100%,520px);margin:6vh auto}.brand{display:flex;align-items:baseline;gap:10px;margin-bottom:36px}.brand span{font-weight:850;letter-spacing:-.04em;font-size:24px;color:var(--accent)}.brand small,.account small,.muted,.empty{color:var(--muted)}h1{font-size:clamp(28px,7vw,48px);letter-spacing:-.045em;line-height:1.05;margin:0 0 16px}h2{font-size:20px;margin:0 0 24px}.lede{color:var(--muted);line-height:1.6;margin:0 0 28px}label{display:grid;gap:8px;margin:0 0 18px;font-size:14px;font-weight:650}input,select{width:100%;border:1px solid var(--line);border-radius:12px;background:#071410;color:var(--text);padding:13px 14px;font:inherit;outline:none}input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px #6de2ad22}button,.button-link{width:100%;border:0;border-radius:12px;padding:14px;font:inherit;font-weight:750;cursor:pointer;text-decoration:none;text-align:center}.primary,.button-link{display:block;background:var(--accent);color:var(--accent-ink)}.secondary{background:transparent;color:var(--text);border:1px solid var(--line)}.danger{background:#4a211e;color:var(--danger);border:1px solid #7d332d}.text-button{background:transparent;color:var(--muted);margin-top:6px}.compact{width:auto;padding:7px 10px;font-size:12px}.divider{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px;margin:20px 0}.divider:before,.divider:after{content:"";height:1px;background:var(--line);flex:1}.links,.legal{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:24px;font-size:14px}.links a,.legal a,.language{color:var(--accent);text-decoration:none}.language{position:absolute;right:32px;top:34px}.error,.warning{border:1px solid #7d332d;background:#321a17;color:var(--danger);padding:12px;border-radius:12px;margin-bottom:20px}.warning{border-color:#665522;background:#2a2715;color:#f2d98c}.claims{padding-left:22px;line-height:1.8;color:var(--text)}.account{display:grid;gap:4px;padding:16px;border:1px solid var(--line);border-radius:12px;margin:22px 0 18px}.account strong{overflow-wrap:anywhere}footer{text-align:center;color:var(--muted);font-size:12px;padding:20px}.console-nav{display:flex;justify-content:space-between;align-items:center;padding-bottom:48px}.console-nav .brand{margin:0}.console-nav>div{display:flex;align-items:center;gap:12px}.console-nav form{margin:0}.console-hero{max-width:720px;padding:36px 0}.kicker{color:var(--accent);font-weight:750;text-transform:uppercase;letter-spacing:.12em;font-size:12px}.console-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.panel{box-shadow:none}.app-row,.token-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 0;border-top:1px solid var(--line)}.app-row>div:first-child{display:grid;gap:5px}.app-row code{color:var(--muted);font-size:11px}.row-actions{display:flex;gap:7px}.row-actions form{margin:0}.pill{display:inline-block;margin-left:6px;padding:5px 8px;border-radius:99px;background:#1b2925;color:var(--muted);font-size:11px}.pill.live{background:#153629;color:#9bf2c9}.pill.revoked{background:#35201e;color:#e3a59d}.token-row small{display:block;color:var(--muted);margin-top:3px}.inline-form{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:18px}.steps{color:var(--muted);line-height:1.8;padding-left:22px}.steps code,pre{color:#a8f3d0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#06100d;border:1px solid var(--line);padding:16px;border-radius:12px;line-height:1.6}.result-card{width:min(100%,760px)!important}.result-card .button-link{margin-top:22px}@media(max-width:800px){.console-grid{grid-template-columns:1fr}.app-row{align-items:flex-start;flex-wrap:wrap}.console-nav>div>span{display:none}}@media(max-width:520px){.shell{padding-top:16px}.card,.panel{padding:24px;border-radius:18px}.language{right:24px;top:26px}.developer-shell{padding-top:18px}.console-nav{padding-bottom:24px}.inline-form{grid-template-columns:1fr}}
`
