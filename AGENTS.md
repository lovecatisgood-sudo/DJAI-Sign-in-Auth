# Repository guidance

This repository owns the central **Sign in with DJAI School** identity provider. Preserve the v1 authentication-only boundary:

- issuer is exactly `https://id.djai.academy` in production;
- scopes are exactly `openid email`;
- released identity is stable `sub` plus current verified email;
- no School API access, membership, billing, role, course or profile claims;
- no refresh tokens, UserInfo, dynamic registration or global logout;
- only manually approved confidential first-party web clients;
- downstream applications key identity by `(iss, sub)`, never by email alone;
- the Chrome extension broker is a separate contract and must not be changed here.

Use maintained OIDC client/provider libraries and keep protocol changes covered by end-to-end tests. Never commit or log passwords, Supabase sessions, authorization codes, tokens, client secrets, private JWKs or production cookies.

Before handoff run:

```bash
npm run verify
```

Run PostgreSQL integration tests with `TEST_DATABASE_URL` configured. Production deployment, DNS, Supabase dashboard changes and live client registration require separate authorization.
