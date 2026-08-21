# DJAI Sign In

Central OpenID Connect identity provider for **Sign in with DJAI School**.

The production issuer is permanently fixed to:

```text
https://id.djai.academy
```

Approved first-party applications use Authorization Code flow with PKCE S256. After validation, an application receives a signed ID token containing the stable DJAI/Supabase user UUID and current verified email. It then creates and owns its own local session.

## Product boundary

This is authentication only. It does not grant access to School APIs, membership, billing, staff roles, courses, community data, or other School records. The supported scopes are exactly:

```text
openid email
```

Refresh tokens, UserInfo, delegated API scopes, dynamic registration, global logout, and third-party clients are disabled.

## Repository contents

- `src/`: deployable identity provider and interactions
- `migrations/`: PostgreSQL persistence, registry, confirmation, and audit schema
- `scripts/`: migrations, client registration/revocation, key generation, and health verification
- `packages/auth-express/`: one-router application adapter
- `packages/create-djai-auth/`: self-service registration and scaffolding CLI
- `test/`: protocol, replay, configuration, cryptography, and scope tests
- `examples/`: integration recipes for new applications
- `docs/`: architecture, onboarding, operations, threat model, and incident response

## Local setup

Requirements: Node.js 22+ (Node 24 LTS is used in CI), npm, PostgreSQL, and a non-production Supabase project configured like DJAI School.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run keys:generate
npm run db:migrate
npm run dev
```

Move the generated private JWKS into `OIDC_JWKS` in local `.env`. Generate independent values for the cookie and encryption keys; do not reuse examples in production.

The provider will not start without its database, signing key, Supabase credentials, and secure key configuration. Production startup additionally rejects every issuer except `https://id.djai.academy`.

## Self-service application setup

Enable the developer console with exact approved DJAI School emails:

```text
DEVELOPER_CONSOLE_ENABLED=true
DEVELOPER_EMAIL_ALLOWLIST=developer@djai.academy
```

An approved developer signs in at `https://id.djai.academy/developer`, creates a personal CLI token, then runs:

```bash
export DJAI_DEVELOPER_TOKEN=<token-shown-once>
npx create-djai-auth \
  --name "My App" \
  --environment development \
  --callback http://localhost:3000/auth/djai/callback \
  --home http://localhost:3000/ \
  --privacy http://localhost:3000/privacy \
  --terms http://localhost:3000/terms
```

The CLI registers the exact URLs, writes protected configuration, creates the Express integration module, and adds the secret file to `.gitignore`. The application mounts one router and links its button to `/auth/djai/login`. The adapter owns discovery, PKCE, state, nonce, signature/claim validation, encrypted local sessions, UID/email persistence, and local logout.

Client create, rotation, and revocation are live immediately; provider restarts and database commands are not part of normal onboarding. Operator scripts remain available only for bootstrap and incident recovery.

Follow [the new-app checklist](docs/new-app-checklist.md) for every integration.

## Quality gate

```bash
npm run verify
```

The suites cover the provider protocol, developer authorization/ownership, live client lifecycle, hashed API tokens, CLI safety, reusable Express adapter, encrypted sessions, downstream UID/email persistence, and code replay.

## Deployment status

The repository is deployable but production is not live until the external prerequisites in [docs/production-readiness.md](docs/production-readiness.md) are completed: DNS/TLS, managed PostgreSQL, Supabase redirect configuration, managed secrets/signing keys, the first exact client callback, monitoring, and an authorized production rollout.
