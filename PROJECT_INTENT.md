# Project intent — DJAI Auth Developer Kit

## Ultimate goal

Make adding “Sign in with DJAI School” to a future first-party app feel comparable to adding Google OAuth: an approved DJAI developer signs into one console, registers exact app URLs, receives credentials once, installs one adapter, and mounts one auth router. No database commands, provider restart, hand-written OIDC, or repeated operator intervention per app.

## Non-negotiable invariants

- Production issuer remains exactly `https://id.djai.academy`.
- Authentication only: scopes remain exactly `openid email`; claims remain stable `sub`, current verified email, and required OIDC protocol claims.
- No School API access, roles, courses, memberships, billing, UserInfo, refresh tokens, dynamic OIDC registration, delegated scopes, or global logout.
- Only approved first-party developers may create or manage clients; every action is audited.
- Confidential clients, Authorization Code, PKCE S256, `client_secret_basic`, exact callback URLs, and encrypted secrets at rest remain mandatory.
- Client secrets are shown once and never returned by list APIs or logs.
- Downstream identity is keyed by `(iss, sub)`, never email alone.
- Register, rotate, and revoke must take effect without restarting the provider.

## Required user outcomes

- A Google sign-in started inside a DJAI OIDC interaction returns to that exact `id.djai.academy` transaction and then to the requesting app; it must never fall back to the School site or trigger School onboarding.
- An approved developer can sign into a hosted console with a verified, active DJAI School account.
- The console can list, create, rotate, and revoke only that developer’s clients.
- The same lifecycle is available through an authenticated, rate-limited API for a CLI.
- A generated quickstart provides the exact issuer, callback, client ID, one-time secret, install command, and integration code.
- A reusable Express adapter owns discovery, state, nonce, PKCE, callback validation, encrypted app session cookies, and local logout.
- Existing manually registered clients continue to work.
- Provider discovery and identity output do not broaden.

## Explicit exclusions

- Open/public dynamic client registration.
- Third-party developer access.
- Automatic DNS, hosting, privacy-policy, terms-page, or secret-manager provisioning.
- Publishing packages to npm or deploying production infrastructure without separate publishing/deployment authorization.
- Browser or GUI automation.

## Authoritative sources

- User's live 2026-08-21 report: Google sign-in for an existing verified DJAI account still landed in the School survey. Real callback routing is authoritative over configuration-only smoke checks.
- User direction in this thread: future apps should add DJAI login without manual wiring; apps retain DJAI UID and email.
- `AGENTS.md` authentication-only and first-party constraints.
- Existing protocol contract in `src/provider.ts` and `test/provider.test.ts`.
- Existing operational/security constraints in `docs/`.

## Conservative interpretations

- “Self-service” applies after a person is approved as a DJAI first-party developer. That one-time approval preserves the first-party boundary.
- Production apps may be created by approved developers but must still provide exact HTTPS URLs and reviewed legal links.
- Package source and CLI are shipped in this repository; registry publication is an external release action.
