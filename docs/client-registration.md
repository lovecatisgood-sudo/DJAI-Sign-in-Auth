# Client registration

OIDC dynamic registration is disabled. Approved first-party developers use the authenticated DJAI control plane instead.

## Normal workflow

1. Sign into `/developer` with a verified, active, approved DJAI School account.
2. Create the application in the console, or create a personal CLI token.
3. Run `npx create-djai-auth` with the app name, environment, exact callback, home, privacy, and terms URLs.
4. Store `.env.djai` in the application secret manager before deployment.
5. Install `@djai/auth-express`, mount the generated router at `/auth/djai`, and link the login button to `/auth/djai/login`.

The client secret is returned once. List APIs and console pages never return it again. Client ownership is bound to the developer’s stable DJAI subject, not email.

## Rules enforced automatically

- Confidential web client only
- Authorization Code and PKCE S256
- `client_secret_basic`
- Exactly `openid email`
- Exact callback matching
- HTTPS for staging/production
- HTTP only for explicit development loopback URLs
- Separate client credentials per environment
- Home, privacy, and terms URL metadata

## Rotation and revocation

The console and API rotate or revoke immediately without provider restart. Rotation invalidates the old secret immediately, so update the application secret in the same maintenance operation. Revocation removes the client from authorization and token lookup immediately.

Operator scripts remain available for bootstrap and incident recovery:

```bash
npm run client:register
npm run client:rotate-secret
npm run client:revoke
```

They are not the normal application-onboarding path.
