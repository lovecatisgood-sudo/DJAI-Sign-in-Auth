# Deno Deploy runtime

This repository is a full Node-compatible OpenID Connect provider. The
deployment candidate is Deno Deploy's dynamic runtime, not a Cloudflare
Worker. The existing `server.js` entrypoint starts the built provider from
`dist/server.cjs` after the repository build completes.

`deno.json` contains deployment metadata only:

- install dependencies with the committed npm lockfile;
- run the existing production build;
- start `server.js` as the dynamic runtime entrypoint;
- keep the runtime memory limit explicit.

This PR does not deploy the service, enter secrets, create a database, or
change DNS. The repository's production issuer remains
`https://id.djai.academy`.

## Required platform configuration

Configure the production variables from `.env.example` and
`docs/production-readiness.md` in the hosting dashboard, never in Git. The
minimum set includes the exact production issuer, Node production mode, a TLS
verified PostgreSQL URL, Supabase server credentials, independent cookie and
encryption keys, and the private OIDC JWKS.

## Acceptance gate

Before any DNS change, validate the deployed preview in this order:

1. `/health/live` returns healthy.
2. `/health/ready` confirms database and issuer readiness.
3. OIDC discovery and JWKS match `https://id.djai.academy`.
4. A registered test client completes PKCE login and callback.
5. Negative state, nonce, verifier, issuer, audience, expiry, and replay tests
   remain rejected.

The production rollout still requires an approved review, managed secrets,
database readiness, monitoring, and a separate DNS decision.
