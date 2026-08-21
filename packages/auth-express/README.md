# @djai/auth-express

Mount one router and persist the stable DJAI identity in your application database:

```ts
import { createDjaiAuthRouter } from '@djai/auth-express'

app.use('/auth/djai', createDjaiAuthRouter({
  clientId: process.env.DJAI_CLIENT_ID!,
  clientSecret: process.env.DJAI_CLIENT_SECRET!,
  callbackUrl: process.env.DJAI_CALLBACK_URL!,
  sessionKey: process.env.DJAI_SESSION_KEY!,
  databaseUrl: process.env.DATABASE_URL!,
}))
```

The adapter creates and maintains `djai_external_identities`, uniquely keyed by `(issuer, subject)`. Provide `onSignIn` instead when the application owns a custom identity repository.

Use `/auth/djai/login` for the login button, `/auth/djai/session` for local session state, and `POST /auth/djai/logout` for local logout.
