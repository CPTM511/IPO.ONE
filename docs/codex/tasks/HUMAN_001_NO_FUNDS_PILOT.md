# HUMAN-001: Human No-Real-Funds Pilot

Status: In progress. PRODUCT-001, CREDIT-001A/B/C/D, HUMAN-001A/B/C/D,
MANDATE-001A, and TRANSPORT-001 are complete locally. The shared durable Human
path now reaches a deterministic no-funds Offer and closed Workflow Receipt;
acceptance, Obligation, repayment, servicing, and privacy launch review remain
permission-gated.

## Issue Decomposition

- [x] `HUMAN-001A`: closed, durable, tenant-isolated Human credit Consent with
  immutable scope, expiry/revocation, Human-only references, replay, and
  reconciliation.
- [x] `HUMAN-001B`: durable synthetic KYC/VC Identity Reference bound to live
  Human Consent, with no raw PII or production verification claim.
- [x] `HUMAN-001C`: Human Subject, Consent, and identity-reference Gateway
  operations with audited self-service reads.
- [x] `CREDIT-001C`: one Human/Agent Credit Intent submission operation that
  resolves live Consent or Mandate before writing the shared projection.
- [x] `CREDIT-001D` / `HUMAN-001D`: deterministic Offer explanation and one
  immutable, non-authorizing, copy-safe Human Workflow Receipt.
- [ ] Human Offer acceptance and no-real-funds Obligation/servicing lifecycle.
- [ ] Human privacy/data map and named launch-gate review.

## Context

Product Charter v1.1 makes the Human Pilot a first-class product mode. The
current repository has Human enums and authentication foundations but no
complete Human Subject, Consent, KYC/VC reference, credit application, offer,
servicing, or privacy-safe evidence journey.

## Scope

- Create Human Subject and accountable Principal through the durable Gateway.
- Add versioned, revocable Consent with purpose, scope, expiry, and disclosure
  version.
- Add synthetic KYC/VC references and attestations without raw PII.
- Add Human Credit Intent fields required by the shared lifecycle.
- Add Human-readable decision/Offer explanation paired with canonical reason
  codes.
- Exercise repayment schedule, DPD, cure, default, restructure, repurchase, and
  write-off using sandbox time and synthetic values.
- Add privacy-safe Human self-service reads and support/audit Evidence.

## Non-Goals

- No real identity verification, raw KYC documents, biometric data, credit
  bureau data, bank credentials, actual adverse action, or cash loan.
- No production Human IdP, jurisdiction decision, lender/originator agreement,
  collection activity, or regulatory claim.
- No Human-specific fork of Obligation, Ledger, Event, Evidence, or risk state.

## Likely Files

- `modules/domain/src/*`
- `modules/tenant-command-gateway/src/*`
- `modules/authentication/src/*`
- `modules/authorization/src/*`
- `modules/repository-postgres/src/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `packages/api-contract/*`
- `db/migrations/*`
- `docs/privacy/IPO_ONE_HUMAN_PILOT_DATA_MAP_v0.1.md`

## Acceptance Criteria

- [x] Human Subject, Principal, Consent, and KYC/VC reference are durable,
  tenant-isolated, auditable, and revocable.
- [x] Raw PII/KYC cannot be submitted to or returned by the protocol contract.
- [x] Consent withdrawal blocks new use without corrupting existing legal/audit
  Evidence.
- [ ] A Human fixture completes the shared no-funds lifecycle and servicing
  states with balanced Ledger and reconcilable Evidence.
- [ ] Human and Agent obligations use the same canonical repositories and state
  transition registry.
- [ ] Privacy/data-retention review remains a launch gate.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run demo
git diff --check
```

## Security Checklist

- [ ] No raw PII, KYC document, biometric, bank credential, or secret fixture.
- [ ] Consent is versioned, purpose-bound, expiring, and revocable.
- [ ] Human self-read and operator access are object-authorized and audited.
- [ ] Private-data and production-identity paths remain disabled by default.
- [ ] No real credit or fund movement is enabled.
