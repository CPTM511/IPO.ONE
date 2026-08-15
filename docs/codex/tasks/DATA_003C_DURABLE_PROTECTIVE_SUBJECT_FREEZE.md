# DATA-003C: Durable Protective Agent Subject Freeze

Status: Complete locally under the approved SECURITY-001 local non-funds boundary.
This task is stacked on API-002 and grants no activation, unfreeze, credit, or
funds authority.

## Context

The durable Tenant Command Gateway can create Human-controlled Agent Subjects,
manage unsigned Mandate drafts, and provide bounded Agent self-read. A
commercial pilot control plane must also be able to stop an Agent exposure
immediately when credentials, providers, reconciliation, limits, or security
conditions become unsafe.

SEC-D05 already assigns `risk.freeze` to Risk and Operations Operators. SEC-D07
classifies freeze as a protective reduction that one authorized operator may
perform with a reason, while unfreeze remains a dual-control exposure increase.
The authorization and ABUSE-001 policies already classify
`pilotFreezeSubject`; this issue composes that approved policy into the durable
Gateway without adding a public route.

## Scope

- Add `pilotFreezeSubject` as a local in-process Tenant protocol command for
  Risk and Operations Operators only.
- Require recent phishing-resistant Human authentication, active Tenant/client
  membership, `risk.freeze`, exact Tenant ownership, a reviewed protective
  reason, idempotency, privileged admission, and live state revalidation.
- Lock an Agent Subject projection and permit only `pending|active -> suspended`.
- Atomically append one `subject_status_changed` Event, immutable Evidence,
  outbox message, projection snapshot, command response, execution authority,
  authorization audit, and admission completion.
- Recover an exact completed replay before current state checks; reject every
  fresh command after suspension.
- Keep the Subject authorization resource and Actor binding available so the
  Agent can read its own suspended status and operators can reconstruct history.
- Keep draft Mandate revocation available while blocking new draft creation and
  all future economic commands through mandatory freeze/live-state checks.
- Add the operation to the closed request/result/catalog contract, TypeScript
  unions, conformance fixtures, Operator client, and drift gate.

## Non-Goals

- No unfreeze, activation, credit approval, limit increase, provider execution,
  payment, custody, chain transaction, or real funds.
- No cascade rewrite of Mandate, Obligation, Lockbox, Ledger, or Evidence
  history. Subject suspension is an effective deny input to dependent commands.
- No public or authenticated HTTP route, production IdP, production operator
  provisioning, cloud resource, DNS, or deployment change.
- No break-glass activation. Named custodians and review ownership remain a
  production deployment gate.
- No Human lending, KYC/KYP, raw PII, wallet proof, signing key, or secret.

## Likely Files

- `modules/tenant-command-gateway/src/*`
- `modules/tenant-command-gateway/test*/*`
- `packages/api-contract/*`
- `api/tenant-protocol/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `security/test/gateway-security.test.mjs`
- `docs/architecture/ADR-026-durable-protective-subject-freeze.md`
- `README.md` and versioned guidance/security documents

## Acceptance Criteria

- A current Risk or Operations Operator with strong recent authentication can
  suspend an Agent Subject exactly once with a reviewed reason.
- Developer, Agent, stale-MFA, missing-capability, same-ID cross-Tenant, wrong
  resource, missing reason, and uncontracted payload attempts fail closed.
- Subject projection, Event, Evidence, outbox, command response, execution
  authority, audit, and admission commit or roll back together.
- Exact replay returns the original result after suspension; changed or fresh
  commands cannot add another transition.
- Concurrent operators create at most one suspension Event.
- The Agent can read `suspended`; new Mandate creation and all future economic
  handlers reject the frozen Subject.
- Full reconciliation remains clean and the anonymous public sandbox cannot
  address the operation or durable Subject.

## Test Commands

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run smoke:api
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] Work remains inside approved SECURITY-001 SEC-D01 through SEC-D09.
- [x] Freeze is a protective reduction; no exposure increase is added.
- [x] Tenant, Actor, Subject ownership, and live state are trusted/durable facts.
- [x] Reason, idempotency, strong MFA, privileged quota, allow/deny audit, and
  exact replay are mandatory.
- [x] Unfreeze remains absent and dual-control gated.
- [x] No public route, raw PII, token, secret, signature, or funds authority is
  introduced.
- [x] Full local verification evidence recorded; remote CI is required on the
  review branch before merge.

## Verification Evidence

- Frozen install succeeds with pnpm 11.1.3 on the required Node.js 24.18.0
  runtime.
- `pnpm run check`: 162 unit and contract tests pass; all 24 schemas, 21 OpenAPI
  operations, nine migrations, deployment/launch/approval/abuse policies, and
  the six-operation Tenant protocol contract pass their drift gates.
- `pnpm run test:security`: 20 adversarial tests pass.
- `pnpm run test:postgres`: 46 PostgreSQL 17 tests pass, including 28 focused
  Tenant Gateway cases covering cross-Tenant denial, durable replay, Agent
  visibility, post-freeze denial, and concurrent single-transition behavior.
- Live API smoke reaches a settled transfer and fully repaid obligation; the
  vertical-slice demo ends with a balanced Ledger and zero outstanding amount.
- `pnpm audit --prod` reports no known vulnerabilities; bounded secret-pattern
  scan and `git diff --check` pass.
- Remote Quality Gate evidence is required before merge.
