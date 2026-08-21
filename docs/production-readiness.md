# Production readiness

Repository checks alone do not authorize or complete a production deployment.

## External prerequisites

- [ ] `id.djai.academy` DNS and valid TLS
- [ ] Hosting platform with Node 24 LTS, rolling deploys and health probes
- [ ] Managed PostgreSQL with TLS, backups, restore test and least-privilege service account
- [ ] Managed secret storage for cookie, transaction, client-encryption and Supabase keys
- [ ] Managed RS256 signing-key generation, custody, overlap and emergency rotation
- [ ] Supabase production authorization for this service
- [x] Supabase Google and email callback allowlist includes the transaction-aware production patterns `https://id.djai.academy/auth/callback?tx=*` and `https://id.djai.academy/developer/auth/callback?tx=*`. Bare callback paths are insufficient because Supabase otherwise substitutes the School Site URL for callbacks containing `?tx=...`.
- [ ] Exact initial `DEVELOPER_EMAIL_ALLOWLIST` reviewed; developer console login and revocation tested
- [ ] `@djai/auth-express` and `create-djai-auth` published to the approved npm registry
- [ ] Email templates verified to preserve the PKCE callback and transaction query
- [ ] First production application privacy, terms, owner, security contact and exact callback
- [ ] Monitoring, alerting, retention, on-call and incident ownership
- [ ] OIDC conformance run and accepted findings
- [ ] Staging test matrix signed off
- [ ] Deployment and rollback authorization

## Production environment invariants

- `NODE_ENV=production`
- `OIDC_ISSUER=https://id.djai.academy`
- HTTPS terminates only at a trusted proxy; forwarding headers are sanitized
- database SSL verification is enabled
- at least two strong cookie keys are configured
- encryption keys decode to independent 32-byte values
- private JWKS is present only in managed secrets
- no example or staging client is active
- developer console is enabled only with reviewed exact-email bootstrap entries
- logs and tracing redact credentials and email

## Go-live smoke test

1. Verify liveness/readiness, discovery and JWKS.
2. Sign in with a production-authorized test account through the first registered app.
3. Validate exact ID-token issuer, audience, `sub`, email and `email_verified`.
4. Confirm no membership/role claims and no refresh token.
5. Replay the code and confirm rejection.
6. Confirm an unverified and a suspended test account cannot complete login.
7. Confirm local application logout does not globally sign out DJAI.
8. Confirm observability contains no tokens, codes, secrets, passwords or raw email.

Client-secret rotation immediately replaces one active secret. Applications that require overlap must add reviewed versioned credentials before go-live; no provider restart is required.
