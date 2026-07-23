# IPO.ONE Task Handoff

## Identity

- Task ID: `AUDIT-001`
- Status: `IMPLEMENTED_UNVERIFIED`
- Repository: `/Users/cptmao/Documents/IPO.ONE` (`CPTM511/IPO.ONE`)
- Base commit: `20e142bb14690296eac754946a876ead879a45ca`
- Audited source HEAD before the evidence-only commit: `20e142bb14690296eac754946a876ead879a45ca`
- Branch/worktree: `codex/commercial-access-release`; clean before this evidence-only handoff was added; matched `origin/codex/commercial-access-release`
- Runtime/database/environment:
  - Repository contract: Node `24.18.0`, pnpm `11.1.3`, PostgreSQL `17`
  - Default shell observed: Node `26.0.0`, pnpm `11.1.3`
  - Alternative read-only test runtime used: bundled Node `24.14.0`, pnpm `11.1.3`
  - PostgreSQL client: `17.10`; `DATABASE_URL` unset; `127.0.0.1:5432` had no server response
  - Docker/Compose: unavailable
  - Sandbox restriction: binding loopback listeners returned `EPERM`

## Authoritative requirements

- Charter/ADR/PRD requirement IDs:
  - Product Charter v1.1: Single Kernel, Dual Entry; `Identity + Payment + Obligation`; complete no-real-funds Human and Agent lifecycle; server truth; multi-chain adapter boundary; named human approval for contracts, funds, risk, permissions, privacy, production dependencies and deployment.
  - Accepted ADRs `ADR-009` through `ADR-033`, including Ledger source of truth, event runtime, forced RLS, deny-by-default authorization, atomic Tenant commands, Tenant Protocol conformance, multi-chain finality, authenticated transports, signed Provider sandbox and Evidence-derived Decision Passport.
  - V10 package `AUDIT-001`: refresh repository/document/contract truth, run supported gates, classify environment exclusions, and produce an exact V9/V10 capability map without product changes.
- Package documents used: the complete `CODEX_HANDOFF.json` `readOrder`, including `START_HERE.md`, `CODEX_MASTER_PROMPT.md`, `governance/SOURCE_OF_TRUTH.md`, product/architecture/contracts/audit documents, task manifest/backlog, execution protocol, acceptance criteria, Definition of Done, human approval matrix, regression matrix and final acceptance.
- Current contract/schema/Launch Policy versions:
  - Tenant catalog: `tenant_protocol_catalog.v1` / `tenant_protocol.v1`, maturity `local_non_funds`, 38 closed operations.
  - Request/result envelope: `tenant_protocol_request.v1` / `tenant_protocol_result.v1`.
  - Portable schema surface: 46 JSON Schema contracts.
  - Database history: 25 ordered reversible migration pairs.
  - Launch Policy: `ipo.one.launch-policy/v1`, policy `1.0.0`; only `public_sandbox.releaseEnabled=true`.
  - V10 Trading Capital candidate: `trading_capital_protocol.v1-candidate`, 25 operations, `enabled=false`, `realFundsEnabled=false`.

## Source and package integrity

The original AUDIT-001 run recorded the package evidence below. At this CHANGES_REQUIRED correction, neither the ZIP nor the expanded V10 package remained at the recorded path or elsewhere found on the local machine. The prior results are retained as historical evidence, but package integrity, source drift, validation and Markdown count were not rerun or upgraded in this correction.

- Original input ZIP: `/Users/cptmao/.codex/.chatgpt-projects/g-p-6a3fe2ce54a081919c6e76a4b59e74fc/IPO_ONE_V10_Codex_Product_Basis.zip`
- ZIP SHA-256: `fae7f5129213d8b34584b8f82cb933f4b238b5b07670c68af4346153ec52ff80`
- `unzip -t`: all entries passed compressed-data integrity.
- A temporary extraction compared byte-for-byte with the supplied expanded directory using `diff -qr`: no differences.
- The original run recorded package validation as passed:
  - 5 CSS assets and 5 JavaScript assets;
  - 13 V9 product pages and 8 V10 Trading Capital views;
  - zero original V9 lines missing from complete V10;
  - 30 checked Markdown documents and 13 valid JSON files;
  - 27 task definitions;
  - 38 reviewed Tenant operations and 25 disabled V10 candidate operations.
- The original run recorded source drift as passed at the exact branch/commit with a clean pre-handoff worktree and all seven ChatGPT Project sources present.
- All 11 critical repository artifacts matched `SOURCE_SNAPSHOT.json` SHA-256 values: Product Charter, Charter traceability, commercialization roadmap, architecture review, dual-native execution plan, public-beta gate, Tenant catalog, request schema, result schema, Launch Policy and repository README.

## Delivered outcome

- User-visible outcome: no product behavior was changed. This file records exact current product truth and gaps.
- Protocol/domain outcome: no catalog, schema, handler, type, authorization, admission, persistence, SDK, MCP, UI or worker behavior was changed.
- Persistence/Ledger/Event/Evidence outcome: no database or runtime state was changed; only static and non-destructive test/audit commands were run.
- Explicitly unavailable behavior:
  - all V10 Trading Capital operations;
  - real funds, mainnet, custody, withdrawal and external Provider execution;
  - hosted private Tenant product under the current Launch Policy;
  - portable production Passport issuance, official server-generated reports/exports and public capital marketplace/funding.

## Current repository implementation truth

| Area | Exact current state | Evidence |
| --- | --- | --- |
| Shared kernel | Human and Agent use one Subject/Principal/Consent-or-Mandate/Intent/Decision/Offer/`obligation.v2`/Ledger/Event/Evidence lifecycle | `README.md`, `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`, `modules/tenant-command-gateway/src/tenant-foundation-handlers.js` |
| Tenant application protocol | 38 closed private operations; all have `fundsAuthority:false`; unknown operations/fields fail closed | `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`, request/result schemas, protocol conformance gate |
| Human product | Guided local authenticated Subject, Consent, synthetic identity reference, Offer, acceptance, sandbox execution, repayment, servicing and Evidence surfaces exist | `apps/web`, `apps/tenant-api`, Human handlers and workflow receipts |
| Agent product | Principal-controlled Agent Subject, one-use CAIP-10 EIP-712 EOA proof, bounded Mandate, local SDK and exactly 11 local-stdio MCP tools exist | `apps/agent-mcp`, `packages/sdk`, Agent handlers/manifests |
| Operations | PII-bounded Tenant risk read, servicing queue, protective Subject freeze, reconciliation, alert/health/feedback foundations exist | Risk/servicing handlers, operations-control modules and accepted ADRs |
| Persistence | 25 up/down migration pairs encode PostgreSQL event/projection, RLS, replay, Ledger, servicing, Provider and AuthN foundations | `db/migrations`, migration static gate |
| Multi-chain | Base Sepolia and X Layer Testnet conformance, finality/reorg/replay and bounded live-observer unit paths exist | chain adapter/indexer tests and CHAIN-001B runbook |
| Provider | Signed fixed loopback no-funds Provider sandbox contract exists; public/remote Provider and capital execution remain locked | `apps/provider-sandbox`, Provider handlers, ADR-032 |
| Release | Only the anonymous public no-real-funds sandbox profile is enabled; private and real-value profiles are disabled | `deploy/launch-policy.v1.json` |
| Trading Capital | No runtime implementation exists; none of the 25 candidate operation IDs is present in the current 38-operation catalog | candidate/current catalog set comparison and runtime-source search |

The current contract maturity label is `local_non_funds`. The repository contains substantial durable local implementation, but this run does not upgrade it to a fully verified pinned-environment or production claim because the exact runtime, PostgreSQL, listener, live browser and dependency-advisory gates remain unverified here.

## Exact V9 gap matrix

`Verified local` below means current code/contract and available local tests exist; it does not imply active private release authority or real funds.

| V9 surface/outcome | Current implementation | State | Exact remaining gap |
| --- | --- | --- | --- |
| 1. Overview | `pilotReadWorkspaceResume`, Human/Agent self reads and owned Obligation reads back the current Portfolio shell | `Verified local / partial product parity` | Exact V9 navigation/outcome traceability, hosted private composition and complete maturity/unavailable labels still require `PRODUCT-002`/`V9-001` proof |
| 2. Request Credit | Shared Human/Agent Intent, deterministic Decision Passport/Offer and exact acceptance are closed operations | `Verified local no-funds` | Production identity, underwriting, pricing, disclosures, capital and real execution are unapproved |
| 3. Repay & Settle | Sandbox execution, deterministic repayment allocation, schedule, DPD/default/cure/resolution, Ledger and Evidence exist | `Verified local no-funds` | Real collection rail, custody/bank reconciliation, production notices and servicing remain absent |
| 4. Credit Passport | `risk_decision.v3` plus `risk_decision_passport.v1` presentation and provenance exist | `Partial` | No portable issuer/verifier artifact operation, selective disclosure policy, expiry/revocation lifecycle, privacy approval or external credential conformance |
| 5. Obligations | Owned `obligation.v2`, schedule, servicing state and Evidence reads exist | `Verified local no-funds` | Hosted private profile and production servicing/collection gates remain closed |
| 6. Agent Console | Local SDK and exact 11-tool stdio MCP workflow cover authority, Offer, Obligation, repayment and Evidence | `Verified local stdio no-funds` | Remote MCP/A2A, production workload identity, webhooks and real Provider execution remain locked |
| 7. Capital Network | Signed Provider sandbox and shared accounting primitives exist | `Required gap` | No capital marketplace, Provider funding, facility allocation, distribution, earnings or TVL operation; no public pool or real capital authority |
| 8. Risk & Operations | Tenant risk, pilot health, feedback, servicing queue and protective freeze operations exist | `Verified local / partial` | Unfreeze, limit increase, financial disposition, production scheduler/on-call and automated funds actions are absent or gated |
| 9. Architecture | Checked-in schemas, ADRs, discovery and dependency gates are the source | `Reference only` | V9 architecture page cannot claim adapters/capabilities not present in checked-in contracts |
| 10. Wallet & Permissions | OIDC, server-side one-use SIWE, internal Credential-gated sessions, EIP-712 EOA account proof, Consent/Mandate, deny-by-default AuthZ, AccessGrants, MFA and dual control exist locally | `Partial` | The five independent wallet-reality gaps below remain, in addition to unapproved production IdP/secret/IAM composition, generic token approvals, production chain registry and remote credentials |
| 11. Activity & Proofs | Owner/auditor Evidence reads and append-only Event/Evidence runtime exist | `Verified local / partial` | Public/portable export, production retention/issuer policy and hosted auditor access remain gated |
| 12. Credit Track Record | Evidence-derived Decision Passport exists and the old educational score is non-authoritative | `Partial` | No production score/limit-evolution policy registry, outcome windows, model/fairness/legal review or named Risk approval |
| 13. Reports & Exports | Browser reference behavior exists only as UX history; no official artifact operation exists | `Required gap` | Closed server request/result, async artifact lifecycle, authorization revalidation, hash/issuer/version, redaction, supersession/revocation and retrieval are missing |
| Fee/revenue behavior | Accepted no-funds Offer/Ledger economics exist; V9 `MVP-FEE-1.0` remains historical example text | `Partial / policy locked` | Production pricing and fee bases require a versioned policy and named Product/Finance/Legal approval; principal and unrealized PnL must never be percentage-fee bases |

### V10 10.0.7 wallet-reality gaps

These are independent gaps; none is implied to pass because the local EIP-1193, SIWE or EIP-712 EOA foundations exist:

1. Provider discovery is limited to a single `globalThis.ethereum` object. EIP-6963 multi-Provider discovery is absent.
2. No approved QR or mobile wallet connector exists.
3. Signature/account-proof verification is EOA-only. ERC-1271 contract-wallet verification is absent.
4. `accountsChanged` and `chainChanged` currently update browser UI state only, and no provider-change path exists. There is no proof that an account, chain or provider change invalidates server-side session or proof authority.
5. No real Hyperliquid master/subaccount relationship or read-only query binding exists.

Additional V9 shell fact: the current authenticated web product has eight workspace views (`Portfolio`, `My Credit`, `Agent Workspace`, `Borrow & Credit`, `Payments`, `Evidence`, `Risk Operations`, `Agent API`), not a proved one-to-one implementation of all 13 V9 destinations. Browser storage is used only to remember bounded opaque resource IDs; authenticated financial state is fetched from the server. `PRODUCT-002` must still map each V9 destination to operation, schema, handler, AuthZ, admission, migration, UI adapter and test, and identify any unsupported success action.

## Exact V10 Trading Capital gap matrix

The current protocol contains **0 of 25** Trading Capital candidate operations. The candidate package defines all 25 as `specified_disabled`; none is callable.

| Candidate group | Candidate count | Current runtime | Missing layers |
| --- | ---: | --- | --- |
| Evidence/profile | 4 | Absent | Trading account challenge/import/finalization/profile contracts, persistence and approved read-only adapter |
| Capital request/matching | 6 | Absent | Capital request, Provider mandate, matching, two-party acceptance, identity/legal/capacity/pricing decisions |
| Facility | 4 | Absent | One-Provider/one-Subject Facility, canonical Obligation linkage, contribution reconciliation and privileged activation |
| Execution/risk | 6 | Absent | Order Intent/cancel, risk snapshot/evaluation, pause/flatten, protected signer, narrow venue adapter and failure reconciliation |
| Settlement/evidence | 5 | Absent | Durable close/settlement run, exact waterfall/Ledger postings, non-redeemable receipts and finalized Performance Evidence |

Cross-cutting V10 gaps are complete, not incremental runtime omissions: no accepted Tenant Protocol v2 schema generation, no TypeScript unions/validators, no handlers, no AuthZ/admission mappings, no migrations/RLS/repositories, no SDK/MCP/UI server integration for the eight V10 views, no Hyperliquid adapter, no signer, no Facility risk/settlement runtime, no Trading Capital launch profile, and no real-value authority.

## Change inventory

- Files changed: this evidence-only handoff document.
- Migrations: none.
- Operation catalog/schema/type changes: none.
- Capability/AuthZ/admission/quota changes: none.
- UI/SDK/MCP/worker changes: none.
- Observability/runbook changes: none.

## Acceptance evidence

| Criterion | Evidence file/test/runtime result | Status |
| --- | --- | --- |
| Exact source compared with snapshot | exact branch/commit plus all 11 critical SHA-256 matches | `PASS` |
| Original package integrity and validation record | ZIP integrity, extracted-directory byte comparison, `npm run validate` | Prior run: `PASS`; current correction rerun: `UNVERIFIED` because the package is absent |
| Charter and current machine contracts retain authority | current `AGENTS.md`, Charter, ADRs, catalog, schemas and Launch Policy inspected | `PASS` |
| Exact V9 implementation/gap map | 13-surface matrix above, grounded in the current 38-operation catalog and code | `PASS` |
| Exact V10 implementation/gap map | current/candidate operation set comparison: 0/25 present | `PASS` |
| Pass/fail/unverified results separated | command-level table below | `PASS` |
| Exact pinned repository quality gate | `pnpm run check` stopped at Node mismatch | `FAIL` |
| PostgreSQL/RLS/migration runtime | static migration checks pass; database suite not executed | `UNVERIFIED` |
| Listener-dependent security/transport/Provider runtime | loopback bind prohibited by sandbox | `UNVERIFIED` |
| Live browser/accessibility | static and unit web checks included; no live browser run | `UNVERIFIED` |
| Production dependency advisory state | npm advisory endpoint unavailable; external disclosure escalation was not authorized | `UNVERIFIED` |
| Launch Policy not widened | no diff to `deploy/launch-policy.v1.json`; only `public_sandbox` enabled | `PASS` |

## Test results

### Task-specific and package tests

The package results in this first table are retained from the original AUDIT-001 run and were not rerun in this correction.

| Command | Runtime | Result |
| --- | --- | --- |
| `unzip -t IPO_ONE_V10_Codex_Product_Basis.zip` | system unzip | `PASS`; every archive entry valid |
| `diff -qr <temporary extraction> <expanded package>` | system diff | `PASS`; no byte differences |
| `npm run check:source-drift` | default Node | `PASS`; branch/commit/clean tree/project sources matched |
| `npm run validate` in V10 package | default Node | `PASS`; package/prototype/V9 preservation/docs/JSON/task/catalog gates passed |
| Independent 11-artifact SHA comparison | default Node | `PASS`; 11/11 matched snapshot |

### CHANGES_REQUIRED correction revalidation

| Command/check | Result | Interpretation |
| --- | --- | --- |
| Repository identity precondition | `PASS` | Branch `codex/commercial-access-release`, HEAD `20e142bb14690296eac754946a876ead879a45ca`, and only the allowed untracked Handoff matched before correction |
| `npm run check:source-drift` in V10 package | `UNVERIFIED` | The V10 ZIP, expanded directory and package script are absent from the current local machine |
| `npm run validate` in V10 package | `UNVERIFIED` | The validator is absent, so the reported current count of 72 Markdown files was not independently reproduced |
| `delivery/DELIVERY_VERIFICATION.md` count correction | `UNVERIFIED` / not edited | The source file is absent; no `71` to `72` change was made without runnable validator evidence |

### Repository gates

| Command/group | Result | Interpretation |
| --- | --- | --- |
| `pnpm run check` under default shell | `FAIL` at `check:runtime` | Expected fail: Node `26.0.0` is not exact required `24.18.0`; downstream commands did not run in this invocation |
| Static gates individually under bundled Node `24.14.0` + pnpm `11.1.3` | `PASS` | Boundary lint; 46 schemas; 21 OpenAPI operations; 25 migration pairs; deploy; launch, approval, abuse and operations policies; 38-operation Tenant Protocol all passed, but runtime was not exact pinned Node |
| `pnpm test` | `344 PASS / 0 FAIL` | Core unit/conformance suite passed under Node `24.14.0` |
| `pnpm run test:security` | `16 PASS / 2 environment-unverified` | Two listener tests exited on `EPERM`; no product assertion failure observed |
| `pnpm run test:transport` | `38 PASS / 8 environment-unverified` | Eight loopback HTTP tests could not bind `127.0.0.1`; stdio/SDK/non-listener tests passed |
| `pnpm run test:provider` | `2 PASS / 3 environment-unverified` | Three process tests require the fixed `127.0.0.1` listener and exited before ready in the same listener-restricted sandbox |
| `pnpm run test:chain:conformance` | `6 PASS / 0 FAIL` | Base Sepolia/X Layer contract conformance passed locally |
| `pnpm run test:indexer:reorg` | `5 PASS / 0 FAIL` | duplicate/reorg/replacement/restart model passed locally |
| `pnpm run test:chain:live-unit` | `9 PASS / 0 FAIL` | emitter compile/safety, ephemeral-key and bounded observer unit tests passed; no live transaction was run |
| `pnpm run test:postgres` | `UNVERIFIED` | `DATABASE_URL` was unset and local PostgreSQL had no response; no database test was classified as pass or product failure |
| `pnpm audit --prod` | `UNVERIFIED` | registry DNS was unavailable in sandbox; elevated external advisory query was rejected because it would disclose dependency metadata without explicit authority |

### Failure summary

- Product-test assertion failures observed: **0** among tests that could execute their required environment.
- Command failures observed: exact `pnpm run check` runtime gate; PostgreSQL precondition; listener-dependent suites; advisory network query.
- Package correction commands were not executable because the V10 package is absent; they remain `UNVERIFIED` rather than inheriting the prior run's `PASS`.
- These command failures and unavailable checks are not silently converted into passes. The package rerun, PostgreSQL, listener, live-browser, dependency-advisory and exact-runtime results remain `UNVERIFIED`.

## Safety proof

- Real funds/mainnet/external execution remain: disabled and structurally outside this task.
- Launch Policy profile and diff: no policy diff; only `public_sandbox` is enabled and it has all real/private/external economic capabilities false.
- Cross-Tenant/authorization denial evidence: current security/core suites passed their non-listener denial assertions; PostgreSQL forced-RLS runtime proof remains unverified in this environment.
- Idempotency/concurrency/replay/restart evidence: core tests passed; chain replay/reorg passed; database and listener process-restart portions remain unverified here.
- Secret/PII/log review: no key, credential, raw KYC/PII, production secret or external account was created or used.
- Forbidden-action evidence: no deploy, fund movement, key provisioning, live testnet write, Launch Policy edit or production/external account action occurred.

## Remaining risks and follow-ups

- Known limitations:
  - the V10 ZIP and expanded package are absent, so source drift, package validation and the Markdown count correction were not executed in this correction;
  - exact Node `24.18.0` was unavailable;
  - PostgreSQL integration and forced-RLS runtime were not executed;
  - loopback HTTP/Provider process behavior was not executed because listener bind was denied;
  - live browser/accessibility and npm advisory results were not refreshed;
  - no V10 runtime layer exists.
- Unresolved findings:
  - V9 exact destination-to-code traceability remains the intended output of `PRODUCT-002`;
  - Wallet authenticity remains partial: no EIP-6963 multi-Provider discovery, approved QR/mobile connector, ERC-1271 verification, proved server-side authority invalidation on wallet changes, or real Hyperliquid master/subaccount read-only binding;
  - V9 Passport, reports/exports, capital network, production pricing/underwriting, private hosting and production servicing remain gaps or policy locks;
  - all Trading Capital implementation remains absent and disabled.
- Human approvals required:
  1. Accept or independently review this handoff; Codex does not self-assign `VERIFIED_LOCAL`.
  2. Decide whether to provide an exact Node `24.18.0` + PostgreSQL 17 test environment with loopback/browser access and authorized dependency-advisory lookup for a fully refreshed baseline.
  3. Before later wallet work: approve the supported browser/mobile Provider and QR connector matrix, ERC-1271 scope, server-side invalidation semantics for account/chain/provider changes, and any Hyperliquid master/subaccount read-only binding.
  4. Before later V9 Passport/report work: approve issuer/verifier, privacy, selective disclosure, retention/revocation and artifact authority.
  5. Before later capital/fee/risk work: approve Provider/capital/legal/custody, pricing/fee, underwriting and risk-policy boundaries.
  6. Before any V10 code after `PRODUCT-002`: complete the human-owned `TC-000` ADR decisions for initial maturity, Hyperliquid profile, signer/custody separation, risk sources/staleness, thresholds, settlement policy and owners.
  7. Any deployment, production identity, production dependency, real funds, mainnet or Launch Policy unlock remains separately human-owned.
- Rollback/compatibility plan: no runtime change exists to roll back. Remove only this audit document if the evidence artifact itself is rejected; do not alter product or policy.
- Next task unlocked, if any:
  - Dependency graph successor: `PRODUCT-002` only.
  - Strict execution state: `PRODUCT-002` remains blocked until this `AUDIT-001` handoff is independently reviewed/accepted as at least `VERIFIED_LOCAL` under the execution protocol.
  - No V9 implementation task and no Trading Capital task is currently unlocked.

## Reviewer verdict

- Reviewer: pending independent/human review.
- Independent commit reviewed: pending.
- Verdict: pending; implementer status is `IMPLEMENTED_UNVERIFIED`.
- Findings/resolution references: this audit contains no product code change and grants no launch or protected authority.
