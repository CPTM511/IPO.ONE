# DATA-003B: Durable Draft Mandate Management

Status: Implemented and verified locally under the approved SECURITY-001
non-funds boundary. This task is stacked on DATA-003A and grants no executable
Mandate authority.

## Context

DATA-003A persists a Human-controlled Agent Mandate in `draft` status and lets
the Agent observe a bounded summary. A Developer Control Plane also needs an
integrity-checked Human view and a way to terminate an obsolete or compromised
draft. Leaving drafts irrevocable would create operational debt; activating a
draft would cross the separate AUTH-002 permission gate.

The approved SEC-D05 matrix allows a Developer to manage its own draft
Mandates. SEC-D07 permits immediate protective reductions. This issue therefore
implements read and revocation only, inside the existing local non-funds
Gateway and PostgreSQL transaction boundary.

## Scope

- Add Human-only `pilotReadMandate` for an Actor-bound Mandate resource.
- Add Human-only, reason-coded, idempotent `pilotRevokeDraftMandate`.
- Require the current durable Mandate projection to be integrity-verified and
  `draft`; derive Tenant, Actor, Subject, Principal, and Mandate authority from
  verified context and durable state.
- Transition the Mandate from `draft` to terminal `revoked` with one status
  event, Evidence, outbox record, projection snapshot, command response, and
  authorization audit in the existing serializable transaction.
- Atomically transition the corresponding authorization resource from
  `active` to `closed`, while retaining Actor bindings for historical reads and
  audit reconstruction.
- Keep revocation available even if the Subject is suspended/closed or the
  Principal is no longer active; a protective reduction must not depend on
  mutable exposure-increase prerequisites.
- Preserve exact replay before current resource-state checks. A new command
  against a revoked Mandate must fail closed.
- Classify the read and mutation once in the closed ABUSE-001 policy.

## Non-Goals

- No Mandate activation, signature, typed-data challenge, account ownership
  proof, key rotation, reactivation, suspension, or executable delegation.
- No credit decision, provider execution, spend, payment, Lockbox movement,
  custody, withdrawal, chain transaction, or real funds.
- No public API route, browser persistence, production IdP, production role,
  cloud resource, DNS, or deployment change.
- No Human credit, KYC/KYP, raw PII, arbitrary deletion, or persistent resource
  counter release.

## Likely Files

- `modules/tenant-command-gateway/src/*`
- `modules/tenant-command-gateway/test*/*`
- `modules/authorization/src/*`
- `modules/abuse-control/src/abuse-policy.js`
- `schemas/v2/abuse-control-policy.schema.json`
- `docs/architecture/ADR-024-durable-draft-mandate-management.md`
- `README.md` and versioned guidance/security documents

## Acceptance Criteria

- The Human controller reads its own Mandate with projection integrity checks;
  another Tenant and another same-Tenant Human receive the same bounded denial.
- The Human controller revokes a draft exactly once and the Agent immediately
  observes `revoked` through its existing self-read protocol.
- Mandate state, authorization-resource state, Event, Evidence, outbox,
  projection snapshot, command execution, and audit commit or roll back
  together.
- Exact replay returns the original response after the authorization resource
  is closed. Changed or fresh commands cannot mutate the terminal Mandate.
- Concurrent revocations produce at most one business transition and never
  leave Mandate and authorization-resource state divergent.
- Suspended/closed Subject or inactive Principal state cannot prevent the
  authorized controller from revoking a still-draft Mandate.
- Reconciliation, RLS, append-only controls, abuse classification, and the
  anonymous public sandbox boundary remain intact.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run smoke:api
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] Work remains inside the approved SECURITY-001 local non-funds boundary.
- [x] No command can activate or execute a Mandate.
- [x] Tenant, Actor, Subject, Principal, and ownership authority are not caller
  supplied.
- [x] Read and revoke use exact object authorization and integrity-checked
  durable state.
- [x] Revocation is terminal, reason-coded, idempotent, and atomic with resource
  closure.
- [x] Protective revocation is not blocked by Subject or Principal state.
- [x] Responses, errors, logs, and audit records contain no secrets, signatures,
  raw account proofs, KYC data, or PII.
- [x] AUTH-002 and production deployment remain separate human approval gates.

## Verification Evidence

- Node.js `24.18.0`: repository checks and all `159` unit/contract tests pass.
- Security suite: `18/18` adversarial and ingress tests pass.
- Fresh PostgreSQL database: `41/41` migration, RLS, crash, replay,
  reconciliation, concurrency, and Gateway tests pass; the focused Gateway
  suite is `24/24`.
- Live local SDK/API smoke completes settlement and full repayment with no real
  funds; the standalone vertical slice remains balanced and replayable.
- Production dependency audit reports no known vulnerabilities; secret-pattern
  and whitespace checks pass.
