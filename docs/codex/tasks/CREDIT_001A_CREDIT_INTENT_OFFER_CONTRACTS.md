# CREDIT-001A: Shared Credit Intent and Offer Contracts

Status: Implemented locally on 2026-07-14; no Gateway operation, persistence,
transport, UI, or real-value capability is added by this increment.

## Context

CREDIT-001 requires one Human/Agent credit lifecycle, but the domain currently
jumps from authority and synthetic risk inputs to `CreditLine`. Product Charter
v1.1 requires explicit, versioned `CreditIntent` and `CreditOffer` objects so
the application, explanation, disclosure, acceptance, and audit boundaries do
not depend on UI conventions.

## Scope

- Add shared Credit Authority, Intent, Offer, and repayment-frequency enums.
- Add deterministic, validated `createCreditIntent` and `createCreditOffer`
  domain constructors.
- Bind Offer terms to stable hashes, reason codes, validity, schedule, risk
  decision, disclosure reference, and no-real-funds flags.
- Publish closed JSON Schema 2020-12 contracts.
- Add Human/Agent shape parity, hash replay, fail-closed validation, and
  runtime/schema alignment tests.

## Non-Goals

- No persistence, Tenant Gateway handler, authorization, decision execution,
  Offer acceptance, Obligation creation, API, SDK, MCP, UI, or deployment.
- No real funds, KYC/PII, production credit, pricing decision, or legal terms.
- No change to current public sandbox behavior.

## Likely Files

- `packages/domain/src/enums.js`
- `packages/domain/src/credit-contracts.js`
- `packages/domain/src/index.js`
- `packages/domain/test/credit-contracts.test.js`
- `schemas/v2/credit-intent.schema.json`
- `schemas/v2/credit-offer.schema.json`
- `scripts/check-schemas.mjs`

## Acceptance Criteria

- [x] Human Consent and Agent Mandate Intents use the same canonical object.
- [x] Intent amount, purpose, term, frequency, and installments are bounded.
- [x] Offer principal, fee, rate, schedule, validity, reasons, disclosure, and
  Risk Decision reference are explicit and hashed.
- [x] Domain constructors always mark the contracts sandbox-only and reject any
  unsafe or malformed inputs.
- [x] Runtime objects have no fields absent from their closed JSON Schemas.
- [x] Existing protocol tests remain green.

## Test Commands

```sh
pnpm run check
git diff --check
```

## Security Checklist

- [x] No caller authority is inferred from `authorityRef`; authorization remains
  future Gateway work.
- [x] Raw PII/KYC and secret-bearing fields are rejected by domain validation.
- [x] Amounts, dates, term, installments, rates, fees, and reason counts are
  bounded.
- [x] No real-value, production fund, endpoint, permission, or deployment
  capability is added.
