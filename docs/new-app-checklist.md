# New application checklist

## Developer path

- [ ] Sign into `https://id.djai.academy/developer`.
- [ ] Create a CLI token for the workstation.
- [ ] Run `npx create-djai-auth` with the exact environment URLs.
- [ ] Move `.env.djai` into the application secret manager.
- [ ] Install `@djai/auth-express` and mount `djaiAuthRouter` at `/auth/djai`.
- [ ] Add “Sign in with DJAI School” linking to `/auth/djai/login`.
- [ ] Ensure the application database URL is present; the adapter stores identity in `djai_external_identities` keyed by `(issuer, subject)`.

The adapter handles discovery, state, nonce, PKCE S256, server-side code exchange, JWKS signature validation, issuer/audience/expiry checks, minimal verified claims, encrypted HttpOnly sessions, and local logout. Do not add ID/access tokens to localStorage, analytics, URLs, or application sessions.

## Staging acceptance

- [ ] Password and Google DJAI accounts
- [ ] New signup plus email verification
- [ ] User cancellation
- [ ] Changed email retains the same UID identity
- [ ] Unverified and suspended accounts rejected
- [ ] Wrong state, nonce, verifier, callback, issuer, audience and secret rejected
- [ ] Expired/replayed authorization code rejected
- [ ] Rotation invalidates the previous secret immediately
- [ ] Local logout leaves other DJAI sessions intact

Never link existing product accounts by email alone.
