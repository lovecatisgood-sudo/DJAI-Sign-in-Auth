import type { ClientSummary } from './client-registry.js'
import type { DeveloperTokenSummary } from './developer-access.js'
import { escapeHtml } from './views.js'

export function renderDeveloperLogin(csrf: string, error?: string): string {
  return page('DJAI developer console', `
    <section class="card">
      <div class="brand"><span>DJAI</span><small>Developer</small></div>
      <h1>Build with DJAI Sign In</h1>
      <p class="lede">Sign in with an approved DJAI School developer account.</p>
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="/developer/login">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <label>Email<input required autocomplete="email" name="email" type="email" maxlength="320"></label>
        <label>Password<input required autocomplete="current-password" name="password" type="password" minlength="8" maxlength="200"></label>
        <button class="primary" type="submit">Open developer console</button>
      </form>
      <div class="divider"><span>or</span></div>
      <form method="post" action="/developer/google">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <button class="secondary" type="submit">Continue with Google</button>
      </form>
    </section>`)
}

export function renderDeveloperConsole(input: {
  csrf: string
  email: string
  clients: ClientSummary[]
  tokens: DeveloperTokenSummary[]
  canProduction: boolean
}): string {
  const clients = input.clients.length === 0
    ? '<p class="empty">No applications yet. Create the first one below.</p>'
    : `<div class="app-list">${input.clients.map((client) => `
        <article class="app-row">
          <div><strong>${escapeHtml(client.displayName)}</strong><code>${escapeHtml(client.clientId)}</code></div>
          <div><span class="pill">${escapeHtml(client.environment)}</span><span class="pill ${client.active ? 'live' : 'revoked'}">${client.active ? 'active' : 'revoked'}</span></div>
          ${client.active ? `<div class="row-actions">
            <form method="post" action="/developer/clients/${encodeURIComponent(client.clientId)}/rotate"><input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}"><button class="secondary compact" type="submit">Rotate secret</button></form>
            <form method="post" action="/developer/clients/${encodeURIComponent(client.clientId)}/revoke"><input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}"><button class="danger compact" type="submit">Revoke</button></form>
          </div>` : ''}
        </article>`).join('')}</div>`
  const tokens = input.tokens.length === 0
    ? '<p class="empty">No CLI tokens.</p>'
    : `<div class="token-list">${input.tokens.map((token) => `<div class="token-row"><span><strong>${escapeHtml(token.name)}</strong><small>expires ${token.expiresAt.toISOString().slice(0, 10)}</small></span>${token.active ? `<form method="post" action="/developer/tokens/${encodeURIComponent(token.id)}/revoke"><input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}"><button class="text-button compact" type="submit">Revoke</button></form>` : '<span class="pill revoked">inactive</span>'}</div>`).join('')}</div>`
  return page('DJAI developer console', `
    <header class="console-nav"><div class="brand"><span>DJAI</span><small>Developer</small></div><div><span>${escapeHtml(input.email)}</span><form method="post" action="/developer/logout"><input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}"><button class="text-button compact" type="submit">Sign out</button></form></div></header>
    <section class="console-hero"><p class="kicker">Sign in with DJAI</p><h1>Applications</h1><p class="lede">Register exact callbacks once. The generated adapter handles discovery, PKCE, validation, sessions, and local logout.</p></section>
    <section class="console-grid">
      <div class="panel"><h2>Your applications</h2>${clients}</div>
      <div class="panel"><h2>Create an application</h2>
        <form method="post" action="/developer/clients">
          <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
          <label>Application name<input required name="displayName" maxlength="100" placeholder="DJAI Studio"></label>
          <label>Environment<select name="environment"><option value="development">Development</option><option value="staging">Staging</option>${input.canProduction ? '<option value="production">Production</option>' : ''}</select></label>
          <label>Callback URL<input required name="redirectUri" type="url" placeholder="https://app.example/auth/djai/callback"></label>
          <label>Home URL<input required name="homeUrl" type="url" placeholder="https://app.example/"></label>
          <label>Privacy URL<input required name="policyUrl" type="url" placeholder="https://app.example/privacy"></label>
          <label>Terms URL<input required name="termsUrl" type="url" placeholder="https://app.example/terms"></label>
          <button class="primary" type="submit">Create credentials</button>
        </form>
      </div>
      <div class="panel"><h2>CLI access</h2><p class="muted">Create a personal token, then run the CLI from any new app.</p>${tokens}
        <form class="inline-form" method="post" action="/developer/tokens"><input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}"><input required name="name" maxlength="80" placeholder="My workstation"><button class="secondary" type="submit">Create token</button></form>
      </div>
      <div class="panel"><h2>Three-step integration</h2><ol class="steps"><li>Register the app here or with the CLI.</li><li>Install <code>@djai/auth-express</code>.</li><li>Mount the generated router and add a link to <code>/auth/djai/login</code>.</li></ol></div>
    </section>`)
}

export function renderCredentialResult(input: {
  title: string
  issuer?: string
  clientId?: string
  clientSecret?: string
  developerToken?: string
  callbackUrl?: string
}): string {
  const env = input.clientId && input.clientSecret && input.callbackUrl
    ? `DJAI_ISSUER=${input.issuer ?? 'https://id.djai.academy'}\nDJAI_CLIENT_ID=${input.clientId}\nDJAI_CLIENT_SECRET=${input.clientSecret}\nDJAI_CALLBACK_URL=${input.callbackUrl}\nDJAI_SESSION_KEY=<32-byte-base64-key>`
    : input.developerToken ?? ''
  return page(input.title, `<section class="card result-card"><div class="brand"><span>DJAI</span><small>Developer</small></div><h1>${escapeHtml(input.title)}</h1><div class="warning">Copy this now. It will not be displayed again.</div><pre>${escapeHtml(env)}</pre>${input.clientId ? '<pre>npm install @djai/auth-express</pre>' : '<pre>export DJAI_DEVELOPER_TOKEN=&lt;paste-token&gt;</pre>'}<a class="button-link" href="/developer">Return to console</a></section>`)
}

export function renderDeveloperMessage(title: string, message: string, statusLink = '/developer'): string {
  return page(title, `<section class="card"><div class="brand"><span>DJAI</span><small>Developer</small></div><h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(message)}</p><a class="button-link" href="${escapeHtml(statusLink)}">Continue</a></section>`)
}

function page(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/assets/main.css"></head><body><main class="developer-shell">${content}</main></body></html>`
}
