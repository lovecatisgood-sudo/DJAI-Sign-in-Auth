# Execution plan

## P1 — Goal lock and contracts

- Status: complete
- Owns: `PROJECT_INTENT.md`, `PLAN.md`, `GATES.md`
- Gate: every required outcome maps to an executable or inspection gate.

## P2 — Live client registry

- Status: complete
- Depends on: P1
- Owns: migrations, client registry, provider adapter wiring
- Objective: create/rotate/revoke immediately, retain encrypted secrets and legacy clients.
- Gates: G2, G3, G4

## P3 — Approved developer control plane

- Status: complete
- Depends on: P2
- Owns: developer sessions/access/tokens, console, lifecycle API, audit
- Objective: DJAI-authenticated self-service without open registration.
- Gates: G5, G6, G7, G8

## P4 — Reusable application kit

- Status: complete
- Depends on: P1
- Owns: `packages/auth-express`, `packages/create-djai-auth`, quickstart docs
- Objective: one adapter plus generated configuration replaces hand-written OIDC.
- Gates: G9, G10, G11

## P5 — Integration, security, and reconciliation

- Status: complete
- Depends on: P2, P3, P4
- Owns: full tests, threat model/runbooks, `RECONCILIATION.md`
- Objective: verify no protocol expansion, regressions, secret disclosure, or goal drift.
- Gates: G1, G12, G13, G14

## P6 — Production Google callback correction

- Status: in progress
- Depends on: deployed provider and production Supabase project
- Owns: Supabase redirect allowlist, live callback evidence, acceptance ledger
- Objective: dynamic provider transaction callbacks resolve to `id.djai.academy`, resume the original OIDC interaction, and never enter School onboarding.
- Gates: G15–G18

## Significant decisions

- Approval attaches to developer identities, not each app registration.
- OIDC dynamic registration remains disabled; the developer API is a separate authenticated first-party control plane.
- Provider client lookup moves from startup static clients to an encrypted database-backed Client adapter, enabling immediate lifecycle changes.
- A generated `redirect_to` is not proof of acceptance. Production callback routing is accepted only when Supabase records the provider transaction referrer as `id.djai.academy` and a real Google completion produces a provider `login_succeeded` event.
