# Product and delivery plan

## Outcome

Any approved first-party DJAI web application can add **Sign in with DJAI School**, receive a signed stable UID and verified email, and create its own local account/session without receiving a DJAI password or School data.

## Fixed v1 contract

- Issuer: `https://id.djai.academy`
- Flow: Authorization Code + PKCE S256
- Client: confidential web application using `client_secret_basic`
- Scopes: `openid email`
- Identity key: `(iss, sub)` where `sub` is the Supabase UUID
- Mutable metadata: verified email
- ID-token lifetime: five minutes
- Authorization-code lifetime: 90 seconds by default
- Signing: RS256 with JWKS and overlap rotation
- Account gate: authenticated, verified email, active profile
- Session after login: owned by the downstream application

## Delivery phases

1. Repository, architecture, threat model and CI.
2. OIDC provider proof using maintained `oidc-provider`.
3. PostgreSQL provider adapter, client registry, encrypted client credentials and migrations.
4. Supabase password, Google, signup and verification interactions.
5. Minimal claims, confirmation UI, bilingual copy and security controls.
6. Reusable application examples and contract tests.
7. Staging deployment and OIDC/security certification.
8. One-client production rollout with feature flag and rollback.
9. Second-app onboarding proving provider code does not change per application.

## Definition of done

- Discovery/JWKS are consistent with the permanent issuer.
- Existing password/Google users and new verified users can complete login.
- Unverified/suspended users cannot obtain identity.
- The app stores stable UID and verified email safely.
- No delegated data, refresh token, profile or membership claim is released.
- PKCE, state, nonce, exact redirect, client auth, signature, issuer, audience, expiry and replay protections pass.
- Client/key operations, monitoring, incident response, rollout and rollback are documented and tested.
- A second app integrates without provider code changes.
