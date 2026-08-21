# Acceptance gates

- [x] G1: authentication boundary remains minimal.
  - CHECK: `npm test -- test/provider.test.ts`
  - EXPECT: discovery exposes only `openid email`, code + PKCE, no UserInfo/registration/refresh token; ID token contains only approved identity claims.
  - EVIDENCE: `test/provider.test.ts` passed in the 2026-08-21 `npm run verify` run; 24 non-DB tests passed overall.

- [x] G2: existing active clients load through the live Client adapter.
  - CHECK: PostgreSQL integration suite.
  - EXPECT: exact metadata and decrypted secret reach `provider.Client.find`; plaintext is absent from registry storage.
  - EVIDENCE: `test/postgres.integration.test.ts` encrypted-registry and exact-client assertions passed against isolated PostgreSQL.

- [x] G3: register and rotate take effect without process restart.
  - CHECK: PostgreSQL/provider lifecycle integration test.
  - EXPECT: new secret authenticates immediately; rotated old secret fails and new secret succeeds.
  - EVIDENCE: both actual-provider lifecycle test and PostgreSQL live-adapter test passed; old secret rejection and immediate new-secret acceptance are asserted.

- [x] G4: revoke takes effect without process restart.
  - CHECK: PostgreSQL/provider lifecycle integration test.
  - EXPECT: revoked client cannot authorize or exchange tokens immediately.
  - EVIDENCE: provider authorization rejects the revoked client and the live Client adapter returns no client after revocation.

- [x] G5: console requires a verified, active, approved DJAI developer.
  - CHECK: developer router allow/deny and status-recheck tests plus `IdentityDirectory` verified/active account boundary.
  - EXPECT: only the approved active identity receives a console session.
  - EVIDENCE: password and Google login tests pass; unapproved login is denied; every session/API request rechecks the current School account and developer record.

- [x] G6: developers can only view and mutate owned clients.
  - CHECK: developer API authorization tests.
  - EXPECT: cross-owner reads/mutations return 404/403 without metadata disclosure.
  - EVIDENCE: router owner propagation and PostgreSQL cross-owner list/rotation assertions passed.

- [x] G7: client secrets are one-time and lifecycle actions are audited.
  - CHECK: API and database integration tests.
  - EXPECT: create/rotate response contains secret once; list omits it; audit includes actor/action/client.
  - EVIDENCE: API test asserts one-time create response and secret-free list; PostgreSQL test asserts registered/rotated/revoked audit sequence.

- [x] G8: developer API tokens are hashed, scoped to the approved identity, expirable, revocable, and rate-limited.
  - CHECK: token repository/router tests.
  - EXPECT: raw tokens never persist; revoked/expired tokens fail.
  - EVIDENCE: database test asserts no raw-token persistence, valid authentication, immediate expiry, revocation, and audit; developer routes have a dedicated limiter.

- [x] G9: Express adapter completes code + PKCE and validates signed minimal identity.
  - CHECK: package end-to-end test against a temporary conforming issuer.
  - EXPECT: state/nonce/PKCE/signature/issuer/audience verified; callback yields `{issuer, uid, email}`; no refresh token accepted.
  - EVIDENCE: temporary signed issuer E2E passed and asserts discovery, code challenge, token request, UID, verified normalized email, and production issuer lock.

- [x] G10: Express adapter stores transaction/session only in encrypted HttpOnly cookies and performs local logout.
  - CHECK: package cookie and router tests.
  - EXPECT: no credentials/tokens in browser storage; tampering rejected; logout does not call global DJAI logout.
  - EVIDENCE: adapter E2E asserts HttpOnly transaction cookie without plaintext state, authenticated local session, and local session removal.

- [x] G11: CLI scaffolds a working integration without overwriting application files.
  - CHECK: CLI test in a temporary fixture directory.
  - EXPECT: deterministic env/example/module output; existing targets fail safely unless explicit overwrite.
  - EVIDENCE: CLI tests pass for registration, secret-only environment output, preserved `.gitignore`, generated router, and pre-network overwrite refusal; both packages passed `npm pack --dry-run` inspection.

- [x] G12: repository quality gate passes.
  - CHECK: `npm run verify` plus PostgreSQL suite with `TEST_DATABASE_URL`.
  - EXPECT: typecheck, lint, tests, build, and DB tests pass.
  - EVIDENCE: final `npm run verify` passed (typecheck, lint, 24 tests, provider build, both package builds); isolated PostgreSQL suite passed 5/5.

- [x] G13: production dependency audit is clean at high severity.
  - CHECK: `npm audit --omit=dev --audit-level=high`
  - EXPECT: exit 0.
  - EVIDENCE: `npm audit --omit=dev` reported 0 vulnerabilities; production Docker image built successfully.

- [x] G14: final goal reconciliation is fresh.
  - CHECK: compare user request + `PROJECT_INTENT.md` directly to repository; write `RECONCILIATION.md` after final code/config changes.
  - EXPECT: PASS with every invariant/outcome addressed and remaining external release actions explicit.
  - EVIDENCE: `RECONCILIATION.md`, written after the final implementation and verification changes.

- [x] G15: reproduce the live callback failure from production state.
  - CHECK: inspect the production Supabase `auth.flow_state.referrer` and provider security events after the user's Google attempt.
  - EXPECT: evidence identifies the actual callback host instead of inferring from the generated authorization URL.
  - EVIDENCE: the 2026-08-21 user attempt issued a Google auth code with referrer `https://school.djai.academy/`; no provider `login_succeeded` event existed. The earlier completion claim was invalid.

- [x] G16: the dynamic provider callback is accepted by Supabase.
  - CHECK: add the narrow production pattern for `/auth/callback?tx=*`, initiate a fresh live provider Google transaction, and inspect the new `auth.flow_state.referrer`.
  - EXPECT: the stored referrer begins `https://id.djai.academy/auth/callback?tx=` and never uses the School site URL.
  - EVIDENCE: after adding the narrow transaction patterns, a fresh live Google authorization produced a Supabase flow-state referrer on `https://id.djai.academy/auth/callback?tx=...` and continued with HTTP 302 to Google. The School Site URL was not substituted.

- [ ] G17: real existing-account Google completion resumes DJAI OIDC.
  - CHECK: after a fresh real Google attempt, inspect provider security events and the requesting app callback.
  - EXPECT: provider records `login_succeeded` for the existing UID and Canvas receives its callback; School onboarding is not visited.
  - EVIDENCE: pending real-account confirmation.

- [ ] G18: fresh reconciliation after production configuration and live callback evidence.
  - CHECK: compare the user's exact outcome directly with production state and actual event trail.
  - EXPECT: PASS only after G16 and G17; configuration readback or build success alone is insufficient.
  - EVIDENCE: pending.
