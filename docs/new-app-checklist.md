# New application checklist

## Registration inputs

- [ ] Permanent application name and owner
- [ ] Security contact
- [ ] Separate development, staging and production client IDs
- [ ] Exact callback URI for each environment
- [ ] HTTPS home, privacy-policy and terms URLs
- [ ] Server-side secret manager available
- [ ] Local application session policy documented

Run `npm run client:register` for each environment. Never reuse a production client secret outside production.

## Required application behavior

- [ ] Discover the issuer from `https://id.djai.academy/.well-known/openid-configuration`
- [ ] Generate high-entropy `state`, `nonce`, and PKCE verifier per attempt
- [ ] Store the transaction in a server-side or encrypted HttpOnly cookie session
- [ ] Request exactly `openid email`
- [ ] Exchange the code from the server with `client_secret_basic`
- [ ] Validate signature through discovery/JWKS
- [ ] Require exact issuer `https://id.djai.academy`
- [ ] Require the application's client ID as audience
- [ ] Validate expiry, issued-at time, nonce, state and PKCE
- [ ] Require a UUID `sub`, a usable email and `email_verified === true`
- [ ] Delete the login transaction after one callback attempt
- [ ] Store a unique `(issuer, sub)` identity
- [ ] Treat email as mutable metadata
- [ ] Create an application-owned Secure, HttpOnly, SameSite session cookie
- [ ] Keep ID/access tokens out of localStorage, logs, analytics and URLs

Do not silently link an existing local account solely because its email matches. Require the existing user to authenticate and explicitly link, or run an approved migration.

## Required staging tests

- [ ] Existing password account
- [ ] Existing Google account
- [ ] New signup and email verification
- [ ] Cancel confirmation
- [ ] Changed email resolves the same subject
- [ ] Unverified and suspended account rejection
- [ ] Wrong state, nonce, verifier, callback, issuer and audience
- [ ] Expired/replayed authorization code
- [ ] Wrong/rotated client secret
- [ ] Local logout leaves other DJAI sessions intact

See the [Next.js](../examples/nextjs-app-router/README.md) and [NestJS](../examples/nestjs-api/README.md) recipes.
