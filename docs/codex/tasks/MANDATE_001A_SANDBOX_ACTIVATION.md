# MANDATE-001A: Principal-Controlled Sandbox Mandate Activation

Status: Approved by the project owner and implemented locally on 2026-07-15.
Production Mandates, Offer acceptance, execution, funds, public exposure, and
deployment remain unapproved.

## Context

The durable Tenant Gateway can create, read, and revoke an Agent Mandate, but
every Gateway-created Mandate remains `draft`. CREDIT-001C intentionally allows
a draft Mandate to request a no-funds Credit Intent; it does not allow that
Mandate to accept an Offer or execute an Obligation.

The in-process demo can activate a Mandate through `MandateService`, but that is
not an authenticated durable Tenant operation. Allowing an Agent Runtime to
activate its own authority would be a privilege-escalation path. The accountable
Human Principal/Controller must approve the exact versioned Mandate before the
Agent can progress beyond application.

## Approved Three-Part Permission Change

### 1. Principal-only activation capability

- Add `mandate.activate.owned` only to the Human actor that is the durable
  controller of the exact Agent Subject and Principal.
- Add one idempotent private operation, `pilotActivateSandboxMandate`, against
  an exact owned draft Mandate.
- Do not grant activation to Agent Runtime, Tenant Developer, Operator, Risk,
  Auditor, Provider, anonymous public, HTTP, MCP/A2A, or worker roles.
- The operation has `fundsAuthority = false` and cannot accept an Offer,
  execute an Obligation, spend, repay, or move value.

### 2. Explicit post-application Mandate capabilities

Add these closed Mandate capabilities:

- `accept_credit_offer`;
- `execute_sandbox_credit`.

Existing `request_credit` and `route_repayment` remain separate. Activation
does not grant a Gateway operation that the caller's role bundle does not also
hold. A Mandate capability and an operation capability are both required.

Only `urn:ipo-one:sandbox-asset:usd-cent` may be activated under this issue.
The Mandate must remain `sandboxOnly = true`, `productionAuthority = false`,
and inside the existing per-action and aggregate limits.

### 3. Exact-version Principal acknowledgement

The activation request contains only:

- `expectedMandateHash`;
- `acknowledgedTermsHash`;
- one bounded acknowledgement code,
  `principal_authorizes_sandbox_credit_v1`.

The server locks the Mandate, Agent Subject, Principal, controller binding,
Tenant resource, freeze state, and capacity before transition. It derives the
actor and ownership from trusted Authentication Context. Activation fails if
the hashes do not match the current immutable terms, the validity window is
not current, the Mandate lacks `request_credit`, or the Principal/Subject is not
active and correctly bound.

The acknowledgement hash is Evidence of a sandbox authorization step, not a
legal signature or production lending authorization.

## Approved Operation

| Operation | Kind | Resource | Actor | Capability | Result |
| --- | --- | --- | --- | --- | --- |
| `pilotActivateSandboxMandate` | Idempotent mutation | Exact owned draft Mandate | Human controller | `mandate.activate.owned` | Active sandbox Mandate |

## Atomic Commit

Mandate status, immutable activation acknowledgement, Event, Evidence, outbox,
registry, snapshot, owner-resource version, command replay, and audit commit in
one serializable transaction. Exact replay returns the committed result;
different input under the same idempotency key fails closed.

## Non-Goals

- No Agent self-activation, production Mandate, signature verification,
  wallet transaction, Offer acceptance, Obligation, execution, payment,
  repayment, Provider spend, public endpoint, remote transport, or deployment.
- No change to existing draft Mandates. They must be amended/recreated with the
  new explicit capabilities before activation.

## Likely Files

- `packages/domain/src/enums.js`
- `packages/domain/src/models.js`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `modules/tenant-command-gateway/src/mandate-handlers.js`
- `modules/tenant-command-gateway/src/postgres-live-policy-adapter.js`
- `modules/authorization/src/*`
- `modules/abuse-control/src/*`
- `modules/persistence/src/postgres-core-repository.js`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`

## Acceptance Evidence

- [x] Only the exact authenticated Human controller can activate the owned
  Agent Mandate; Agent Runtime self-activation and cross-Tenant guessing fail.
- [x] Exact current Mandate and terms hashes are acknowledged and persisted;
  stale, amended, expired, frozen, over-cap, or incorrectly bound state fails.
- [x] Activation is atomic, idempotent, restart-safe, RLS-safe, reconciled, and
  visible through the existing owner-only Mandate read.
- [x] Activation alone cannot accept, execute, spend, repay, or move value.

## Approval Gate

- [x] Approve `mandate.activate.owned` only for the bound Human
  Principal/Controller and private `pilotActivateSandboxMandate`.
- [x] Approve the new closed `accept_credit_offer` and
  `execute_sandbox_credit` Mandate capabilities for sandbox-only Mandates.
- [x] Approve the exact-version acknowledgement and fail-closed activation
  policy described above.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Agent Runtime cannot activate, expand, or replace its own Mandate.
- [x] Caller identity and ownership come only from trusted Authentication
  Context and durable bindings.
- [x] Mandate, terms, caps, validity, Principal, Subject, freeze, and capacity
  are locked and revalidated before commit.
- [x] No raw PII, secret, credential, private key, signature, account
  destination, production flag, or real-value authority enters the operation.
