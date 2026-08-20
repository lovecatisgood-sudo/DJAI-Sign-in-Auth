# Incident response

## Immediate priorities

1. Stop further credential or identity issuance at the narrowest safe boundary.
2. Preserve redacted logs, database audit entries, deployment IDs and timelines.
3. Rotate or revoke the affected credential.
4. Validate discovery/JWKS and every affected client.
5. Notify the authorized security and product owners.

## Client secret or callback compromise

- Deactivate the client registration.
- Restart provider instances to evict loaded client metadata.
- Remove the application's login entry point.
- Rotate the client secret and repair callback ownership before reactivation.
- Review authorization events for the client without exporting tokens or emails.

## Signing-key compromise

- Disable authorization/token issuance if the private key may be usable by an attacker.
- Generate a new managed key and publish its public JWK.
- Remove the compromised key from signing immediately.
- Coordinate rejection of the compromised `kid` with all applications when warranted.
- Treat ID tokens signed during the exposure window as suspect and invalidate downstream sessions according to application capability.

## Supabase server credential compromise

- Disable the identity provider.
- Rotate the Supabase secret through the approved platform process.
- Review privileged Auth/profile access and School audit evidence.
- Redeploy with the new secret and complete staged authentication tests.

## Claim or issuer misconfiguration

- Stop issuance.
- Restore the exact issuer and minimal claim configuration.
- Do not publish two production issuers for the same deployment.
- Determine whether downstream accounts were incorrectly created or linked and repair through an audited migration.

Never paste live credentials, tokens, cookies or private keys into tickets or chat.
