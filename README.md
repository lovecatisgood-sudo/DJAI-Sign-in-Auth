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

## Register the first application

After migrations and configuration:

```bash
npm run client:register -- \
  --id djai-studio-staging \
  --name "DJAI Studio Staging" \
  --environment staging \
  --redirect https://studio-staging.example/auth/callback \
  --home https://studio-staging.example/ \
  --privacy https://studio-staging.example/privacy \
  --terms https://studio-staging.example/terms \
  --owner owner@example.com \
  --security security@example.com \
  --actor operator@example.com
```

The command displays the client secret once. Store it in the application's server-side secret manager and restart provider instances to load the registration.

Follow [the new-app checklist](docs/new-app-checklist.md) for every integration.

## Quality gate

```bash
npm run verify
```

The protocol test performs a real authorization-code exchange, PKCE validation, JWKS signature verification, minimal-claim assertion, and code-replay rejection.

## Deployment status

The repository is deployable but production is not live until the external prerequisites in [docs/production-readiness.md](docs/production-readiness.md) are completed: DNS/TLS, managed PostgreSQL, Supabase redirect configuration, managed secrets/signing keys, the first exact client callback, monitoring, and an authorized production rollout.
