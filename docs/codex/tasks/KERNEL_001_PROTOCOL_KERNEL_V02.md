# KERNEL-001: Protocol Kernel v0.2

Status: Complete for the local interactive MVP; production gates remain open.

## Context

The audit in `docs/guidance/IPO_ONE_ARCHITECTURE_REVIEW_v0.2_DRAFT.md`
identified three protocol concepts that were present only implicitly in the
interactive MVP: delegated authority, accounting truth, and portable evidence.
IPO.ONE also needs a plugin boundary that lets KYC, KYP, compliance, payment,
and rail providers integrate without running arbitrary code inside the funds
path.

## Scope

- Add a first-class, revocable Mandate with capability, provider, category,
  asset, time, per-action, and aggregate limits.
- Require an active Mandate for Agent credit decisions and provider spend.
- Add an append-only double-entry ledger with idempotent posting and trial
  balance checks.
- Make Lockbox revenue and repayment debits ledger-backed.
- Produce a versioned evidence envelope for every appended protocol event.
- Add a data-only Plugin Manifest and registry with fail-closed conformance
  checks and no executable plugin payloads or secrets.
- Add JSON Schemas, baseline SQL, tests, documentation, and visible demo state.

## Non-Goals

- No custody, stablecoin transfer, bridge, smart contract, or onchain execution.
- No production KYC/KYP decision, raw PII, credential storage, or remote plugin
  invocation.
- No production underwriting, universal credit score, ML model, or autonomous
  policy promotion.
- No claim that the in-memory runtime is transactionally durable or fully
  event-sourced.

## Likely Files

- `packages/domain/src/*`
- `modules/authorization/*`
- `modules/ledger/*`
- `modules/plugin-registry/*`
- `modules/event-audit/*`
- `modules/lockbox/*`
- `modules/risk/*`
- `modules/spend-policy/*`
- `packages/mvp-flow/*`
- `schemas/v2/*`
- `db/migrations/0001_mvp_foundation.*.sql`
- `apps/web/*`
- `README.md`

## Acceptance Criteria

- A revoked, expired, out-of-scope, or exhausted Mandate cannot authorize
  credit or provider spend.
- Mandate utilization is idempotent and cannot exceed the aggregate limit.
- Every ledger transaction has at least two positive entries and equal debit
  and credit totals for one asset.
- Reusing an idempotency key returns the original transaction only when the
  payload is identical; conflicting reuse fails.
- Lockbox balance is derived from its ledger account after every posting.
- Every credit event has an immutable `evidence_event.v2` envelope with an
  aggregate version and payload hash.
- Plugin manifests reject secrets, executable fields, insecure production
  endpoints, unknown capabilities, and fail-open policies.
- Existing Agent Lockbox behavior remains runnable, with Mandate and ledger
  state visible in the API/UI.
- `npm run check`, `npm run demo`, and browser smoke verification pass.

## Test Command

```sh
npm run check
npm run demo
```

## Security Checklist

- [x] Authorization defaults to deny.
- [x] Revocation and expiry are checked at action time.
- [x] Amounts use unsigned integer minor units and `BigInt` arithmetic.
- [x] Ledger entries are append-only and balanced.
- [x] Idempotency conflicts fail closed.
- [x] Raw PII, secrets, executable plugin code, and plaintext credentials are
      rejected.
- [x] Plugin failures cannot become approval.
- [x] Demo-only hashes and integrations remain labeled as non-production.
- [x] Contracts, custody, funds movement, production permissions, and
      deployment remain gated by human review.
