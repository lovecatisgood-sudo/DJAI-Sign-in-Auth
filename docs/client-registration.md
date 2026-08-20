# Client registration

Client registration is manual and audited. Dynamic registration is disabled.

## Rules

- Use confidential server-rendered web clients only.
- Use Authorization Code, response type `code`, PKCE S256 and `client_secret_basic`.
- Permit only `openid email`.
- Use exact HTTPS callbacks. Development may use explicit HTTP loopback callbacks.
- Keep each environment separate.
- Register application, privacy, terms, owner and security metadata.

## Lifecycle

Register with `npm run client:register`. The secret is displayed once and encrypted in the provider registry. Move it immediately to the application's secret manager.

Rotate with:

```bash
npm run client:rotate-secret -- --id <client-id> --actor <operator>
```

The current implementation performs immediate replacement rather than overlapping client secrets. Coordinate the downstream secret update and provider rolling restart in one maintenance window. If zero-downtime client-secret overlap is required, add versioned credentials through a reviewed migration before production adoption.

Revoke with:

```bash
npm run client:revoke -- --id <client-id> --actor <operator>
```

Restart provider instances after any registration change. Revocation also requires disabling the downstream login entry point and investigating callback/domain compromise.
