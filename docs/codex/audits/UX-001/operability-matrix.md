# UX-001 User-manual operability audit

Date: 2026-07-30

This audit treats the user manual as an executable product contract. A feature
is marked operable only when its entry point, required role, required exact
reference, next action, success state, and no-funds boundary are visible or
documented.

## Result matrix

| Product flow | Current entry | Verified behavior | Operability result |
| --- | --- | --- | --- |
| Authentication and sign-out | 8787-8790 header | Signed-out state hides private surfaces; sign-in restores the role-scoped workspace | Operable |
| Human credit | 8787 `Credit` | Subject, Consent, Request, Decision, Offer, Obligation, execution, repayment, and Evidence use the shared kernel | Operable |
| Agent account proof | Principal `Credit` plus local Agent host | Five-minute request stays credential-free in the browser; the local Agent signs and submits out of band | Operable |
| Agent application | `Agent Console` application handoff | `pnpm run local:agent:application -- <handoff>` completes Request, Decision, and Offer and stores a receipt | Operable after UX-001 |
| Agent runtime | `Agent Console` runtime handoff | `pnpm run local:agent:runtime -- <handoff>` resolves the matching Offer receipt, creates and executes the Obligation, posts full synthetic repayment, and reads owned Evidence | Operable after UX-001 |
| Agent reference acceptance | local CLI | `pnpm run local:agent:acceptance` composes Human draft/activation with Agent application/runtime against PostgreSQL | Operable after UX-001 |
| Obligations and repayment | 8787 `Obligations`, `Repay & Settle` | Exact owned resource recovery, schedule, synthetic repayment, and trusted-time servicing are visible | Operable |
| Credit Passport | 8787 `Credit Passport` | Owner issues a bounded proof for an exact verifier; reads and revocation remain authorization-bound | Operable |
| Credit Track Record | 8787 `Credit Track Record` | Evidence-derived factors and outcomes are shown without inventing a universal score | Operable |
| Capital Partner | 8790 invited workspace | Exact borrower-authorized Passport values create a synthetic bilateral Offer; no borrower catalog is exposed | Operable with authorized handoff |
| Provider Network | 8790 assigned Provider workspace | Exact TransferIntent read and acknowledgement work; assignment IDs come from Provider invitation receipts | Operable with assigned receipt |
| Trading Capital | 8787 authenticated workspace | Existing exact Facility state, Evidence, close request, and proof eligibility are inspectable. Creation, matching, setup, and synthetic execution remain role-scoped API/SDK workflows | Operable at the documented browser boundary |
| Risk and Operations | 8789 invited operator workspace | Exact portfolio and queue reads and protective exact-Subject actions work without enumeration or PII | Operable with operator-provisioned IDs |
| Reports and Exports | 8787 after exact Obligation recovery | Canonical JSON/CSV artifacts support create, metadata read, hash verification, download, and revocation | Operable |
| Activity and proofs | 8787 authenticated workspace | Owned PostgreSQL Evidence is distinguished from Base Sepolia anchor transactions | Operable |

## Defects corrected

1. The Agent Console previously stopped at a handoff download and did not show
   an executable next action. It now displays the exact local application or
   runtime runner command.
2. There was no reusable reference runner composing the Agent Offer receipt
   with the Principal-activated Mandate. The two-stage runner and a complete
   reference acceptance now provide that composition.
3. Advanced exact-resource screens did not explain where the required IDs came
   from. Capital Partner, Provider, Trading Capital, and Risk documentation now
   identifies the authorized receipt or provisioning source and explicitly
   states that the browser will not enumerate resources.
4. UI regression coverage now fails if an enabled button has no direct or
   delegated action contract.

## Evidence

- `output/playwright/ux-001/01-signed-out-overview.png`
- `output/playwright/ux-001/02-human-credit-entry.png`
- `output/playwright/ux-001/03-agent-runtime-runner.png`
- `output/playwright/ux-001/04-provider-network.png`
- `output/playwright/ux-001/05-risk-operations-loaded.png`
- `.ipo-one/local-stack/agent-workflows/latest-reference-acceptance.json`

## Verification

| Check | Result |
| --- | --- |
| Repository unit and contract tests | 672 passed, 0 failed |
| Isolated PostgreSQL 17 integration tests | 82 passed, 0 failed |
| Local role, worker, migration, reconciliation, and Evidence acceptance | Passed before and after service/database restart |
| Agent reference lifecycle after restart | Passed; 1 synthetic Obligation, full repayment, 11 owned Evidence events |
| Web bundle integrity | Passed; 826 unique element IDs |
| Tenant protocol conformance | Passed; 76 operations |
| Product traceability | Passed; 13 destinations and 67 actions |
| Static enabled-control action coverage | Passed |

The isolated `ipo_one_ux001_test` database was removed after the PostgreSQL
integration run. The closed-pilot database was not reset.

All acceptance activity is synthetic and local. It uses durable PostgreSQL and
the shared Human/Agent obligation kernel. It does not enable real capital,
production funds movement, custody, public discovery, or production authority.
