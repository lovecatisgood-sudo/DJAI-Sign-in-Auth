# NestJS API integration

Use the same `openid-client` flow described in the Next.js example, but keep the complete transaction and code exchange in NestJS.

Recommended endpoints:

```text
GET /auth/djai/start
GET /auth/djai/callback
POST /auth/logout
```

`/auth/djai/start` creates the state, nonce and PKCE transaction in a server-side store and redirects to DJAI. `/auth/djai/callback` atomically consumes that transaction, exchanges the code, validates the ID token, upserts `(issuer, sub)`, and creates an API-owned session.

If Next.js is the browser-facing application while NestJS owns sessions, Next.js should redirect to the NestJS start endpoint. Do not send the authorization code, client secret, PKCE verifier or ID token through client-side JavaScript.

Use a Secure, HttpOnly, SameSite cookie and explicit CSRF protection for state-changing API routes. CORS does not replace CSRF protection. Treat email as mutable metadata and never silently link by email alone.
