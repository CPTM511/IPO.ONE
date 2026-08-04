# GATE-001 — Current candidate integrity

Status: Completed locally; exact release reseal deferred to RELEASE-001  
Started: 2026-07-31  
Baseline commit: 4b0e41dde352283e0d27228d51d1fb99f04c97a8  
Phase: Product Optimization Phase 1 / L0 local integration

## Context

At the recorded baseline, the source had one real security-gate failure: an
economic Tenant Protocol command could call the authentication-context
provider before the final closed request had been validated.

Non-economic commands validate before authentication. Economic commands first
add a non-authorizing actionConfirmation, but the current client obtains
authentication before it validates that final request.

The local release manifest also predates accepted source changes. It MUST NOT
be resealed while the worktree is dirty or merely to suppress drift.

## Scope

- Construct the final economic or non-economic protocol request.
- Validate the same closed request before authentication, network context or
  Gateway execution.
- Preserve automatic creation of the non-authorizing, request-bound economic
  actionConfirmation.
- Add a regression test proving that malformed economic requests cause zero
  authentication, network-context and Gateway calls.
- Re-run targeted Gateway and security gates.
- Record release-manifest drift accurately; defer resealing until accepted
  source is committed and the complete candidate gate passes.

## Non-goals

- No Schema, Catalog or operation-list change.
- No authentication, authorization or Confirmation semantic change.
- No product-flow, accounting, risk, pricing or permission change.
- No release-manifest rewrite in a dirty worktree.
- No deployment, remote access, signer, chain transaction or funds movement.

## Likely files

- modules/tenant-command-gateway/src/tenant-command-clients.js
- modules/tenant-command-gateway/test/tenant-command-gateway.test.js
- security/test/gateway-security.test.mjs remains unchanged
- deploy/local/release-candidate.v2.json remains unchanged in this subtask

## Acceptance criteria

1. Given a malformed non-economic request, when the client executes it, then
   authentication, network-context and Gateway call counts remain zero.
2. Given a malformed economic request, when the client creates its
   non-authorizing Confirmation and validates the final request, then
   authentication, network-context and Gateway call counts remain zero.
3. Given a valid economic request, when the client executes it, then the
   Confirmation remains bound to operation, resource, business payload and
   request ID.
4. Given an authenticated Actor of a disallowed type, when a valid request is
   executed, then the client still rejects it after authentication.
5. The focused Gateway security test passes without modifying or weakening its
   assertion.
6. The full security suite has no real Gateway failure. Loopback-listener
   failures caused solely by the execution sandbox are reported separately.

## Test commands

node --test --test-name-pattern="Human, Operator, Risk, and Agent clients inject only their verified context into one protocol" modules/tenant-command-gateway/test/tenant-command-gateway.test.js

node --test modules/tenant-command-gateway/test/economic-action-confirmation.test.js modules/tenant-command-gateway/test/tenant-command-gateway.test.js

node --test --test-name-pattern="Tenant protocol contracts are closed, non-authoritative, and private" security/test/gateway-security.test.mjs

pnpm run test:security

git diff --check

## Test-layer selection

Selected: request unit/regression tests, Confirmation tests, the focused
Gateway security invariant, the full security suite and aggregate repository
tests. PostgreSQL/RLS, Worker and browser layers are omitted because this Issue
changes no persistence, background job or user-facing behavior.

## Security checklist

- [x] Final closed-schema validation occurs before authentication lookup.
- [x] Caller cannot inject Authentication Context, Tenant, Actor, role or
      network authority.
- [x] Economic Confirmation remains non-authorizing and exact-request-bound.
- [x] No Schema or test is weakened.
- [x] No new retry, permission, funds or external-call path is introduced.
- [x] Denials remain redacted and non-enumerating.

## Permission boundary

This issue changes validation order only. It does not add or expand a role,
capability, contract, risk control, deployment, credential, signer, data class
or funds path.

## Data and migration impact

No database, migration, durable-state or browser-state change.

## Rollback plan

Do not restore the known unsafe validation order and do not delete the
regression assertion. If a later change breaks this path, keep the candidate
NO-GO and return to the most recent reviewed commit that proves the 33/33
security gate. No durable data rollback is required.

## Required Evidence

- Before: focused security assertion fails because authentication appears
  before final request validation.
- After: targeted Gateway and security tests pass.
- Full security-suite listener failures, if any, are classified separately
  from the Gateway invariant.
- Exact release-candidate reseal remains a later clean-commit gate.

## Completion Evidence

Completed on 2026-07-31:

- focused client regression: 1/1 passed;
- Gateway plus economic Confirmation tests: 19/19 passed;
- focused Gateway security invariant: 1/1 passed;
- full security suite outside the loopback-restricted sandbox: 33/33 passed;
- no Schema, Catalog, role, capability, permission or durable data changed;
- the release manifest was not rewritten because the accepted development
  slice is not yet a clean committed candidate.

Decision: security validation ordering is complete. Exact candidate sealing
remains NO-GO until RELEASE-001 runs against accepted, committed source.
