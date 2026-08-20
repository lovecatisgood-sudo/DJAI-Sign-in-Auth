# Threat model

## Protected assets

- DJAI account identity and verified email
- authorization codes and ID tokens
- client secrets
- private signing keys
- Supabase server credentials
- provider sessions and authentication transactions
- client registry integrity

## Primary attackers

- an unauthenticated internet attacker;
- a malicious or compromised registered application;
- an attacker controlling an unregistered or abandoned callback domain;
- an attacker with a stolen code, cookie, client secret, or signing key;
- a user attempting cross-client identity substitution;
- an operator or dependency acting outside intended authority.

## Threats and controls

| Threat | Required control |
|---|---|
| Callback exfiltration | Exact registered URI comparison; no wildcard or suffix matching |
| Authorization-code theft | PKCE S256 for every client; 60–120 second code; one-time atomic consumption |
| Login CSRF | Transaction-bound state/nonce/PKCE plus CSRF-protected interaction forms |
| Mix-up/code substitution | Exact issuer, client, audience, redirect URI, nonce and PKCE binding |
| Token forgery | RS256, managed private keys, JWKS verification, stable `kid`, overlap rotation |
| Account enumeration | Generic login/signup errors; no email-existence endpoint |
| Email account takeover | Match `(issuer, sub)`; never silently link by email |
| Suspended account login | Check verified/active identity during login and token exchange |
| Client compromise | Audited deactivation, secret rotation, exact callbacks, provider restart |
| Secret leakage | Server-side storage, encryption at rest, redacted logs, no URL/browser storage |
| Stored or reflected XSS | Escaped client metadata, no scripts, restrictive CSP, external stylesheet |
| Clickjacking | `frame-ancestors 'none'` and frame-denial headers |
| Database race | Conditional artifact consumption and database uniqueness |
| Dependency compromise | Lockfile, automated updates, audit gate, pinned runtime and dependencies |
| Broad token use | Only `openid email`; no resource server; no DJAI API accepts access token |

## Accepted MVP boundaries

- Active status is guaranteed at authentication time. DJAI does not continuously revoke an already-created downstream application session.
- Global logout is not supported.
- Only approved first-party confidential web clients are allowed.
- A user may authenticate separately at `id.djai.academy` even when signed into `school.djai.academy`; broad cross-subdomain cookies are intentionally avoided.

Any public, native, browser-only, partner, agent, or API-authorization use case requires a new threat review.
