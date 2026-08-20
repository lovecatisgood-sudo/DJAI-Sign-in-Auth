# Architecture

## Responsibility map

| Component | Owns |
|---|---|
| Supabase Auth | Password/social authentication, verified email, immutable user UUID |
| DJAI School profile data | Active or suspended account status |
| DJAI Sign In | OIDC protocol, client registry, login interactions, confirmations, signed identity assertions |
| Downstream application | Product account, profile, permissions, billing, data, local sessions and logout |

The provider is a single central service. Downstream applications never deploy provider code and never receive Supabase sessions or administrative credentials.

## Authentication sequence

1. The application discovers `https://id.djai.academy`.
2. It creates `state`, `nonce`, and a PKCE verifier/challenge and stores the transaction server-side.
3. It redirects to `/oauth/authorize` with `scope=openid email`.
4. The provider exact-matches the registered client and callback.
5. The user signs in or creates a DJAI School account using Supabase Auth.
6. The provider requires a verified email and `profiles.account_status = active`.
7. On first use of a client, the user confirms release of UID and email.
8. The provider returns a short-lived, single-use authorization code.
9. The application server exchanges the code using PKCE and `client_secret_basic`.
10. The provider rechecks the account during token issuance and signs the minimal ID token with RS256.
11. The application verifies it, stores `(iss, sub)` plus current email, and creates a local session.

## Persistence

The `oidc-provider` adapter stores protocol artifacts in PostgreSQL. Authorization-code consumption is a conditional database update so concurrent replay cannot succeed twice. The client registry encrypts client secrets at rest with AES-256-GCM and records registration, rotation, and revocation events.

Remembered confirmations point to provider grants. They carry only `openid email` and are not delegated API authorizations.

## Cookies

Provider and interaction cookies are host-only, HttpOnly, Secure in staging/production, and SameSite=Lax. The service never sets a parent-domain `.djai.academy` cookie. Supabase PKCE transaction storage is sealed into a short-lived, transaction-specific cookie and is removed after callback processing.

## Token boundary

The ID token is the identity assertion. An incidental short-lived opaque access token is returned because it is part of the conforming OIDC code response, but no DJAI API accepts it. The ID token is never used as a downstream application session.

## Scaling

Provider instances are stateless apart from secrets and use shared PostgreSQL. Client changes require a controlled rolling restart because active clients are loaded and validated during process startup. Health checks distinguish liveness from database readiness.
