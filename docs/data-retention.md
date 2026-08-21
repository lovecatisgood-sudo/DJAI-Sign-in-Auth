# Data retention

| Data | Default retention |
|---|---|
| Authorization interactions and codes | Until expiry, then cleanup within one hour |
| Opaque access-token artifacts | Until expiry, then cleanup within one hour |
| Expired or revoked developer CLI tokens | 90 days after expiry or revocation |
| Developer control-plane audit events | 2 years |
| First-party confirmation | While the client and account relationship remains valid |
| Redacted security events | 90 days |
| Client audit history | 2 years |
| Revoked client record | Retained for security history |

The cleanup SQL is idempotent. Adjust retention only through an approved privacy/security decision. Do not store passwords, raw authorization codes, ID tokens, access tokens, Supabase sessions, PKCE verifiers, or plaintext client secrets in audit/event tables.

Account deletion cascades or cleanup must remove confirmations and subject-linked events as required by DJAI policy while preserving legally required, minimized security evidence.
