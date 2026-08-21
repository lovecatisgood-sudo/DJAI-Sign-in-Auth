# Operations

## Routine checks

- `/health/live` proves the HTTP process is running.
- `/health/ready` proves database readiness and reports issuer/discovery metadata.
- `npm run verify:discovery` validates production discovery and JWKS consistency.
- `npm run db:cleanup` deletes expired artifacts and records beyond configured retention defaults.

Run cleanup at least hourly. Monitor cleanup failures, authorization errors by safe category, database saturation, token endpoint latency, provider 5xx rates, callback mismatch attempts and signing-key/JWKS readiness.

Production database connections use verified TLS against the pinned public
Supabase Root 2021 CA in `certs/`. `DATABASE_CA_CERT` can override the bundled
trust anchor during rotation; multiline PEM and a single line containing literal
`\n` sequences are both accepted. Never commit private keys or credentials.

The repository contains an AES-256-GCM encrypted JWKS fallback for hosting
platforms that cannot preserve JSON environment values. Its encryption key is
derived with HKDF from `CLIENT_SECRET_ENCRYPTION_KEY`; plaintext signing keys
remain excluded. Regenerate the encrypted bundle whenever either key rotates.

## Developer access

- Bootstrap exact first-party developer emails through `DEVELOPER_EMAIL_ALLOWLIST`.
- The first successful verified/active login creates the audited developer record.
- Remove a developer by setting `active=false` and `revoked_at=now()` in the reviewed operator workflow; current console sessions and API tokens fail on their next request because School and developer status are rechecked.
- Developer tokens are personal. Never share them between people or CI systems; create a separately named token for each use and revoke it when retired.
- Monitor registration/rotation/revocation volume, token failures, cross-owner denials, and unusual callback-domain changes.

## Signing-key rotation

1. Generate a new RS256 key in the approved key-custody system.
2. Add it as the current signing key while retaining the previous private/public key.
3. Deploy and verify both public `kid` values in JWKS.
4. Confirm newly issued ID tokens use the new `kid`.
5. Wait at least the maximum token lifetime plus clock tolerance and cache margin.
6. Remove the previous private key; retain evidence and required public-key overlap.
7. Run discovery/JWKS and application callback smoke tests.

Never generate production keys on a developer laptop or commit exported private JWKS.

## Backups

Back up the client registry, confirmations, audit history and provider artifacts using encrypted managed PostgreSQL backups. Test restore to an isolated environment. Private signing keys and environment secrets require independent managed backup/rotation; database backup does not contain them in plaintext.

## Deployment order

1. Back up database and current secret versions.
2. Apply forward-compatible migrations.
3. Deploy new instances without removing old signing keys.
4. Pass readiness, discovery, JWKS and protocol smoke checks.
5. Shift traffic gradually.
6. Observe safe metrics and errors.
7. Retire old instances only after active interactions have expired.

Rollback application code without rolling back security/audit migrations. Preserve current and previous signing keys until token overlap is safe.
