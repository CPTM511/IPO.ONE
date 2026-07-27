# REALVALUE-001 audit

Status: `DECISION_PACKAGE_PREPARED_AWAITING_NAMED_HUMAN_DECISIONS`

Launch decision: `REJECT_LOCKED`

Task gate: `human_decision_only`

Prepared: `2026-07-26`

## Outcome

REALVALUE-001 prepared a closed, versioned and machine-validated human decision
package for a possible tightly capped Agent/Trader real-value Facility. It did
not approve or implement a real-value pilot.

All 16 P0 decisions:

- name the accountable owner and all required approver roles;
- list required Evidence and current Evidence status;
- disclose residual risks;
- contain an explicit human approve/reject question; and
- remain `REJECT_LOCKED` with `approvalRecord=null`.

Required independent Legal, Security, Risk, Custody, Finance, Compliance,
Infrastructure and Operations assignees remain unassigned. The overall gate is
therefore `launchAllowed=false`, with 16 unresolved and zero verified P0
decisions.

## Prerequisite and source identity

- repository: `/Users/cptmao/Documents/IPO.ONE`
- branch: `codex/commercial-access-release`
- baseline HEAD:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- accepted RELEASE-001 status: `IMPLEMENTED_UNVERIFIED`
- accepted RELEASE-001 candidate:
  `0x88b8fccd24a4ecab4d3e2ba90bfed0fab641773398c1ea9cbe8ecd0f978c895d`
- accepted RELEASE-001 matrix SHA-256:
  `1260226d1316bea2f6894acef15c725300b8bd9e9e2fae3a012b7d0e85e9a381`
- RELEASE-001 P0/P1: `0/0`
- retained open P2:
  `TC403-REV-P2-002 runtime_alert_provenance_not_composed`

REALVALUE-001 test support is content-addressed separately by the regenerated
TC-403 manifest:

- preparation artifact set:
  `0x8b37c799ad118c30d48e2aaa8feda157e388a4a2bca576cd4b7458c89b0f3b26`
- content-addressed implementation/test-support files: `331`
- assurance hash:
  `0xe3f12b59e0969bc75b08a4b293f921d83b7449074d4d647ee2f0b465240f0cb1`
- assurance remains:
  `BLOCKED_INDEPENDENT_REVIEW`, `launchBlocked=true`

The accepted RELEASE-001 identity was not rewritten. The successor audit
directory is excluded from the frozen implementation set so adding human
decision Evidence cannot retroactively alter that set.

## Added or changed

Added:

- `schemas/v2/real-value-offline-review-attestation.schema.json`
- `schemas/v2/real-value-pilot-decision-package.schema.json`
- `scripts/check-realvalue-offline-review-contract.mjs`
- `scripts/check-realvalue-decision-package.mjs`
- `docs/codex/audits/REALVALUE-001/pre-change-mapping.md`
- `docs/codex/audits/REALVALUE-001/decision-package.v1.json`
- `docs/codex/audits/REALVALUE-001/offline-review-intake-template.md`
- `docs/codex/audits/REALVALUE-001/human-decision-sheet.md`
- `docs/codex/audits/REALVALUE-001/audit.md`

Changed only for contract registration and successor-audit isolation:

- `package.json`
- `scripts/check-schemas.mjs`
- `scripts/build-tc403-artifact-manifest.mjs`
- `modules/hyperliquid-operability/test/hyperliquid-operability.test.js`
- regenerated
  `docs/codex/audits/TC-403/reviewed-artifact-manifest.json`
- regenerated
  `docs/codex/audits/TC-403/operability-assurance.json`

## Runtime and authority diff

- migrations: none
- Tenant catalog operations: none
- OpenAPI or SDK operations: none
- Gateway handlers: none
- AuthN/AuthZ/admission changes: none
- PostgreSQL, Ledger, Event, Evidence, outbox or reconciliation behavior: none
- risk threshold or pricing value: none
- dependency or external adapter change: none
- launch-policy change: none
- deployment, credential, account, signer or network action: none
- funds, withdrawal, transfer or Exchange write: none

## Validator security properties

The decision package is a closed JSON Schema contract. Unknown top-level and
nested fields fail. The task validator additionally requires:

- exactly RV-P0-01 through RV-P0-16, in order and with unique domains;
- every decision `REJECT_LOCKED`;
- every approval record `null`;
- no approver marked `APPROVE`;
- truthful assigned/unassigned owner fields;
- all real-value authority booleans `false`;
- overall `launchAllowed=false`;
- exactly 16 unresolved P0 decisions; and
- the live SHA-256 of the accepted RELEASE-001 matrix.

Passing the validator means only that the package is structurally complete and
fail-closed. It is not a launch, legal, security, risk, custody or capital
approval.

## Offline reviewer intake

The Founder confirmed that the substantive owners operate offline and will
provide opinions through the Founder. No online account is required.

The added `real_value_offline_review_attestation.v1` contract permits a
privacy-minimized, hash-bound record of:

- an opaque reviewer reference and role;
- exact P0 decision IDs;
- `APPROVE`, `REJECT`, or `REVISE_REQUIRED`;
- conditions and Evidence hashes;
- the offline source-record format, SHA-256 and opaque custody reference;
- review and expiry times; and
- a Founder custody receipt confirming hash verification and faithful
  transcription.

It prohibits repository PII, credentials and secrets. Its fixed effect is
`NONE_UNTIL_DECISION_PACKAGE_UPDATED_AND_REVALIDATED`, and every launch,
policy, funds, signer, Exchange, deployment and capital authority remains
false. The validator accepts an optional `--attestation` path only beneath the
bounded REALVALUE-001 `offline-reviews` directory, enforces the closed schema,
size limit, review/receipt/expiry ordering and unique Evidence references, and
still reports the opinion as non-authorizing.

## Verification

PASS:

1. Exact runtime:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check:runtime`

   Result: Node `v24.18.0`, pnpm `11.1.3`.

2. Schema registry:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check:schemas`

   Result: `75` closed contracts.

3. REALVALUE-001 completeness:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm
   check:realvalue-decision-package`

   Result: 16/16 P0 decisions present; every decision and launch remain
   `REJECT_LOCKED`.

4. Offline review contract:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm
   check:realvalue-offline-review-contract`

   Result: closed, privacy-minimized, account-free and non-authorizing.

5. Launch policy:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm
   check:launch-policy`

   Result: policy valid; locked profiles and pending Evidence fail closed.

6. TC-403 exact-artifact and assurance regression:

   `npx -y node@24.18.0 --test
   modules/hyperliquid-operability/test/hyperliquid-operability.test.js`

   Result: `11/11`.

7. Full repository gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check`

   Result: runtime, boundaries, 75 schemas, 21 OpenAPI operations, 38
   migration pairs, deploy, launch, both REALVALUE-001 validators, approval, abuse,
   operations, 71-operation Tenant protocol, product traceability, web bundle
   and `544/544` tests passed.

8. Security:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security`

   Result: `33/33`.

Artifact SHA-256:

| Artifact | SHA-256 |
| --- | --- |
| Decision package | `13eb17bdca90258bff27943b8be36516f5ebeead5855d28d23ba2cbe03ff4723` |
| Human decision sheet | `c39294a2df7a707c54af8fc80a5197ef3f7c451d9faab514c3da8451e37d22f2` |
| Offline intake template | `0a5caf620878a9f6b3d90c4c9ddb5b918d29633b7f96321e2e8ef09b0bf9aaaa` |
| Decision-package schema | `263544e282aa73270e8cea99890093e5d6c00a1776d3e0ef14e0622e55221693` |
| Offline-review schema | `a4f51f98690412561e0ea11e3e09f86911f59a6aff4ea607ad14a05a7cefdb17` |

FAIL: none.

UNVERIFIED:

- every substantive real-value P0 decision;
- all required independent owner appointments;
- production legal, capital, custody, signer, chain, asset, Provider, risk,
  pricing, operations, security, infrastructure and launch Evidence;
- retained RELEASE-001 live Hyperliquid and accessibility items; and
- `TC403-REV-P2-002`.

## Rollback

Remove only the REALVALUE-001 schema, validator, package script entry, schema
registration, decision-package audit directory and the successor-audit
exclusion/assertion; then regenerate the TC-403 manifest and assurance.

No database, production system, external account, signer, chain, Exchange or
capital rollback is needed because REALVALUE-001 changes none.

## Stop and next status

REALVALUE-001 stops after returning this package. No successor task is started.

The repository must await named human assignment and explicit decisions for
RV-P0-01 through RV-P0-16. Evidence completion alone cannot unlock
`controlled_agent_credit_pilot`; a later, separate, reviewed launch-policy
revision and exact-release final authorization would still be required.
