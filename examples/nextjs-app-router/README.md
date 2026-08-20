# Next.js App Router integration

Install `openid-client` and `zod`, then copy or package `djai-oidc.ts`.

Configure server-only values:

```text
DJAI_OIDC_CLIENT_ID=<registered-client-id>
DJAI_OIDC_CLIENT_SECRET=<server-secret>
DJAI_OIDC_CALLBACK_URL=https://your-app.example/auth/djai/callback
```

## Login route

Call `beginDjaiLogin(callbackUrl)`. Store the returned transaction in a one-time server-side session keyed by an opaque Secure, HttpOnly, SameSite=Lax cookie, then redirect to the returned URL. Never store the transaction or verifier in `localStorage`.

## Callback route

1. Load and atomically consume the one-time transaction.
2. Call `finishDjaiLogin(new URL(request.url), transaction)`.
3. Upsert the user by the unique pair `(identity.issuer, identity.subject)`.
4. Update `email_at_last_login` from `identity.email`.
5. Create the application's own session cookie.
6. Redirect to an internal allowlisted destination.

Do not link an existing account by email alone. Do not store the returned ID token as the application session. Do not use the incidental access token with any DJAI API.

Suggested identity table:

```sql
create table external_identities (
  id uuid primary key,
  local_user_id uuid not null,
  issuer text not null,
  subject text not null,
  email_at_last_login text not null,
  first_seen_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (issuer, subject)
);
```

The callback URL must exactly match the registered URI, including path, scheme, host and port.
