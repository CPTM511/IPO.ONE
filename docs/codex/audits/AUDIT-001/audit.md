# AUDIT-001 — Current repository and Product Basis 10.1.0 baseline

Date: 2026-07-23

Task: `AUDIT-001` only

Status: `VERIFIED_LOCAL`

Gate: independent review, followed by explicit human acceptance

## Executive verdict

The Product Basis 10.1.0 package and the audited repository source match exactly
at commit `de5e72d5a912d2d55c2ce86570408f37c07d4a4f` on branch
`codex/commercial-access-release`. The worktree was clean before this
evidence-only document was added. The local branch was one commit ahead of the
locally known `origin/codex/commercial-access-release`; no network fetch was
performed, so that remote-tracking comparison is not a statement about current
GitHub state.

The repository contains a substantial local no-real-funds Human/Agent product
foundation. All environment-dependent checks that were previously
`UNVERIFIED` have now been executed under the exact pinned runtime and pass
locally, but the repository is not production-ready:

- an official Node `24.18.0` arm64 runtime and pnpm `11.1.3` satisfy the exact
  runtime contract;
- isolated PostgreSQL `17.10` execution passes all 70 migration, RLS,
  atomicity, replay, restart, and reconciliation tests;
- listener-dependent security, authenticated HTTP, Provider, SDK, and MCP
  suites pass outside the listener-restricted sandbox;
- the repaired prototype passes static validation and a fresh Playwright
  browser pass covering Human access, Agent binding, all 14 primary
  destinations, and all five Trading Capital tabs;
- production dependency audit initially found `GHSA-v2hh-gcrm-f6hx` through
  `ajv > fast-uri@3.1.3`; the workspace now overrides the transitive dependency
  to `fast-uri@3.1.4`, after which `pnpm audit --prod` reports no known
  vulnerabilities and all tests pass;
- only `public_sandbox` is release-enabled;
- all 38 current Tenant operations are private, no-funds operations;
- all 25 proposed Trading Capital operations are absent from runtime.

No feature code, protocol contract, schema, migration, authorization, admission,
launch policy, deployment, wallet, Provider, chain, or funds behavior changed
in this task. The only runtime-adjacent change is the reviewed-scope transitive
dependency security override and its lockfile resolution.

## Authority and pre-change mapping

The review used this precedence:

1. repository `AGENTS.md`, current checked-in machine contracts, and Launch
   Policy;
2. Product Charter v1.1 and the active Dual-Native Execution Plan;
3. MVP Build Spec v0.1 and accepted ADR-009 through ADR-033;
4. current security boundaries and CHAIN-001B runbook;
5. Product Basis 10.1.0 task/package contracts;
6. repaired V9+V10 HTML as interaction intent only;
7. original HTML, old handoffs, historical counts, and competitor claims as
   non-authoritative evidence.

Pre-change repository mapping:

| Layer | Current source |
| --- | --- |
| Product/governance | `AGENTS.md`, Product Charter v1.1, Dual-Native Execution Plan, Launch Policy |
| Closed application protocol | `api/tenant-protocol/ipo-one.tenant-protocol.v1.json` |
| Runtime validation/types | `packages/api-contract`, 46 JSON Schemas, conformance fixtures |
| AuthN/AuthZ/admission | `modules/authentication`, `modules/authorization`, `modules/abuse-control` |
| Durable command boundary | `modules/tenant-command-gateway`, `modules/persistence`, 25 migration pairs |
| Economic truth | shared Obligation, Ledger, Event, Evidence, outbox, reconciliation modules |
| Human/Agent interfaces | authenticated loopback Human UI, local SDK, eleven-tool local stdio MCP |
| Public runtime | separate anonymous no-real-funds sandbox |
| Provider/chain boundaries | fixed loopback signed Provider sandbox and bounded testnet adapters |
| V9/V10 prototypes | reference-only static HTML; never server or financial truth |

The older
`docs/codex/audits/AUDIT_001_V10_CURRENT_STATE_TASK_HANDOFF.md` audited source
`20e142b...` and an earlier package. Its status tables are historical input,
not inherited PASS evidence. This audit independently reran the available
checks against Product Basis 10.1.0 and the current `de5e72d...` source.

## Source and package integrity

Package:

`/Users/cptmao/.codex/.chatgpt-projects/g-p-6a3fe2ce54a081919c6e76a4b59e74fc/IPO_ONE_V9_V10_Codex_Product_Basis_10.1.0`

ZIP:

`/Users/cptmao/.codex/.chatgpt-projects/g-p-6a3fe2ce54a081919c6e76a4b59e74fc/IPO_ONE_V9_V10_Codex_Product_Basis_10.1.0.zip`

| Evidence | Result |
| --- | --- |
| ZIP SHA-256 | `0a628994c948902953e831723be4c3b92ce904dfcbe7991b8f5c5e5f3f266fc1` — `PASS` |
| `unzip -t` | all compressed entries valid — `PASS` |
| Extracted file count | 82 files — `PASS` |
| `npm run validate` in package | 11/11 checks passed — `PASS` |
| Package content checks | 30 ordered prompts, 25 Trading Capital candidates, 159 repository Markdown documents inventoried, 58 non-empty package Markdown files — `PASS` |
| Prototype checks | hashes match; malformed nested boundary repaired; four repaired scripts parse; no duplicate static HTML IDs — static `PASS` |
| `npm run check:source-drift -- /Users/cptmao/Documents/IPO.ONE` | branch/commit match and 10 critical files match — `PASS` |
| Fresh browser/console interaction check | Human credential/KYC flow, Agent wallet/signature binding, all 14 primary destinations, and all five Trading Capital tabs rendered; no JavaScript error or raw-source leak; the temporary static server emitted only a missing `favicon.ico` 404 — `PASS` |

The original V9 and V10 files remain unchanged audit evidence. The repaired
files remain synthetic reference artifacts and are not production
implementations.

## Current repository truth

| Area | Independently observed state | Evidence/status |
| --- | --- | --- |
| Source identity | `codex/commercial-access-release` at `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`; clean before evidence file | `git rev-parse`, `git status` — `PASS` |
| Runtime contract | Node `24.18.0`, pnpm `11.1.3`, PostgreSQL 17 | `.node-version`, `.nvmrc`, `package.json`, runtime gate |
| Verified runtime | official Node `24.18.0` arm64 (`e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1`), pnpm `11.1.3`, PostgreSQL `17.10` | exact runtime and isolated database command evidence — `PASS` |
| Tenant protocol | `tenant_protocol_catalog.v1`, protocol `tenant_protocol.v1`, maturity `local_non_funds` | catalog — `PASS` |
| Tenant operations | 38 unique closed operations; all `public=false`, all `fundsAuthority=false` | catalog and `check:tenant-protocol` — `PASS` |
| Agent MCP | exactly 11 reviewed local stdio tools; registry/SDK/browser parity checked | protocol gate and exact-runtime tests — `PASS` |
| JSON Schemas | 46 | `check:schemas` under exact runtime — `PASS` |
| Public OpenAPI | 21 paths / 21 operations for the retained anonymous sandbox | `check:openapi` under exact runtime — `PASS` |
| Database history | 25 ordered reversible up/down migration pairs | static gate plus PostgreSQL 17.10 execution — `PASS` |
| Human/Agent kernel | one Subject/Authority/Intent/Decision/Offer/Obligation/Execution/Payment/Performance/Evidence lifecycle | catalog, handlers, domain and PostgreSQL tests — local `PASS` |
| Current authenticated web shell | eight workspace destinations, not one-to-one V9 parity | `apps/web/src/index.html` |
| Release profiles | only `public_sandbox.releaseEnabled=true`; closed and controlled-real-value profiles false | `deploy/launch-policy.v1.json` — `PASS` |
| Trading Capital | 0 of 25 candidate operation IDs found across runtime source/catalog/schema/migrations | exact candidate/source comparison — `PASS` |

The current source contains no accepted Trading Capital protocol version,
handlers, AuthZ/admission mappings, migrations, SDK/MCP/UI server integration,
Hyperliquid adapter, signer, Facility, risk/settlement runtime, or Trading
Capital launch profile.

## V9 implementation and gap map

`Local` below means current source plus exact-runtime local tests. It does not
mean the private release profile, production identity, real funds, or external
integrations are approved.

| V9 outcome | Current state | Remaining gap |
| --- | --- | --- |
| Overview | Local partial: workspace recovery and Human/Agent/Obligation summaries exist | exact V9 outcome mapping, private hosted composition, complete maturity/unavailable labels |
| Request Credit | Local no-funds: shared Intent, explainable Decision Passport/Offer, exact acceptance | production identity, underwriting, pricing, disclosures, capital, real execution |
| Repay & Settle | Local no-funds: sandbox execution, repayment allocation, DPD/default/cure/resolution, Ledger/Evidence | real collection rail, custody/bank reconciliation, production notices and servicing |
| Credit Passport | Partial: `risk_decision.v3` and `risk_decision_passport.v1` provenance/presentation | portable issuer/verifier operation, selective disclosure, expiry/revocation, privacy and external conformance |
| Obligations | Local no-funds: owned `obligation.v2`, schedule, servicing state, Evidence | released private profile and production servicing/collections |
| Agent Console | Local no-funds: SDK plus eleven-tool stdio MCP lifecycle | remote MCP/A2A, production workload identity, webhooks, real Provider execution |
| Capital Network | Required gap: only signed local Provider sandbox/accounting primitives exist | capital marketplace, funding, Facility allocation, distribution/earnings, real capital authority |
| Risk & Operations | Local partial: portfolio, health, feedback, servicing queue, protective freeze | unfreeze/increase/disposition, production scheduler/on-call, approved limits and funds actions |
| Architecture | reference only; checked-in contracts/ADRs are authoritative | prototype claims must remain generated from or reconciled to runtime contracts |
| Wallet & Permissions | Partial: EIP-1193, server SIWE, EIP-712 EOA proof, Consent/Mandate, deny-by-default controls | five independent wallet gaps below plus production IdP/IAM/credential decisions |
| Activity & Proofs | Local partial: owner/auditor reads and append-only Event/Evidence | public/portable export, retention/issuer policy, hosted auditor access |
| Credit Track Record | Partial: Evidence-derived Decision Passport; educational score is non-authoritative | production policy registry, outcome windows, model/fairness/legal and Risk approval |
| Reports & Exports | Required gap: prototype-only browser intent; no official artifact operation | server request/result, async lifecycle, re-authorization, redaction, hash/issuer/version, supersession/revocation/retrieval |

Production fee bases and pricing remain policy-locked. Principal and unrealized
PnL are not approved percentage-fee bases.

## Wallet and Hyperliquid reality

Implemented local foundation:

- one injected `globalThis.ethereum` EIP-1193 Provider;
- approved Base Sepolia/X Layer Testnet switch/add flow;
- one-use server-side SIWE challenge and Credential-bound session;
- EIP-712 canonical 65-byte EOA Agent account proof;
- server-controlled roles, Consent/Mandate, AuthZ and admission.

Five independent gaps remain:

1. no EIP-6963 multi-Provider discovery;
2. no approved QR/mobile connector;
3. no ERC-1271 contract-wallet verification;
4. `accountsChanged` and `chainChanged` update browser display state only; no
   `disconnect`/Provider-change path proves server-session and proof-authority
   invalidation;
5. no real Hyperliquid master/subaccount binding or read-only account query
   adapter.

Source searches found no Hyperliquid runtime endpoint, operation, subaccount
binding, exchange signer, or Trading Capital action.

## Trading Capital 0/25 baseline

The package defines 25 candidate operations at maturity
`specified_disabled`. Exact operation-name comparison found none in current
runtime source:

| Candidate group | Candidate count | Runtime |
| --- | ---: | --- |
| Evidence/profile | 4 | absent |
| Capital/matching | 6 | absent |
| Facility | 4 | absent |
| Execution/risk | 6 | absent |
| Settlement/evidence | 5 | absent |
| Total | 25 | 0 present |

No candidate becomes callable because it exists in package documentation.

## Test and command evidence

The final repository commands below ran with the official Node `24.18.0`
arm64 runtime and pnpm `11.1.3`. Database tests used an isolated PostgreSQL
`17.10` database named `ipo_one_test`, exposed only through a temporary local
Unix socket. Listener tests and Playwright ran outside the restricted sandbox
because the sandbox denies local socket/listener creation.

| Command | Result | Classification |
| --- | --- | --- |
| `pnpm run check` | exact runtime gate and every static/policy/protocol gate passed; 344 tests passed, 0 failed | exact-runtime `PASS` |
| `pnpm run test:postgres` | 70 passed, 0 failed against isolated PostgreSQL 17.10 | `PASS` |
| `pnpm run test:security` | 24 passed, 0 failed, including real local listener tests | `PASS` |
| `pnpm run test:transport` | 46 passed, 0 failed, including authenticated Human HTTP, Tenant HTTP, Agent MCP, and SDK transport | `PASS` |
| `pnpm run test:provider` | 5 passed, 0 failed, including signed loopback process, replay, conflict, crash, and restart paths | `PASS` |
| static boundary/schema/OpenAPI/migration/deploy/policy/protocol gates | all passed; 46 schemas, 21 OpenAPI operations, 25 migration pairs, 38 Tenant operations | exact-runtime `PASS` |
| `pnpm run test:chain:conformance` | covered by the final exact-runtime suite; 6 passed | `PASS`; no live transaction |
| `pnpm run test:indexer:reorg` | covered by the final exact-runtime suite; 5 passed | `PASS`; no live transaction |
| `pnpm run test:chain:live-unit` | covered by the final exact-runtime suite; 9 passed | `PASS`; no live transaction |
| package `npm run validate` | 11 package checks passed | `PASS` |
| package `npm run check:source-drift -- /Users/cptmao/Documents/IPO.ONE` | exact source and 10 critical files matched | `PASS` |
| Playwright browser pass | Human credential/KYC path, Agent TrustConnect/signature/Principal binding, 14 primary destinations, five Trading Capital tabs, and raw-source-leak check passed; no JavaScript errors | `PASS`; one temporary-server `favicon.ico` 404 was non-functional |
| initial `pnpm audit --prod` | one high advisory: `GHSA-v2hh-gcrm-f6hx`, `ajv > fast-uri@3.1.3` | `FAIL`, remediated |
| final `pnpm audit --prod` | `fast-uri@3.1.4`; no known vulnerabilities | `PASS` |

Final automated local total: 489 tests passed and 0 failed across the 344-test
base suite, 70 PostgreSQL tests, 24 security tests, 46 transport tests, and five
Provider tests.

## Security proof and residual risk

Observed safeguards:

- Launch Policy enables only the anonymous, no-real-funds, no-private-data
  `public_sandbox`.
- All 38 current private operations retain `fundsAuthority=false`.
- Unknown protocol operations/fields, malformed results, and catalog/handler/
  AuthZ/admission drift fail the conformance gate.
- High-confidence tracked-file scanning found no private-key block, common
  cloud/token credential, OpenAI-key, GitHub-token, or Slack-token shape.
- Raw-PII pattern scanning found no application runtime source match;
  deployment documents/configuration contain organizational contact values,
  not borrower records.
- Network-call source review found fixed approved testnet RPCs, reviewed OIDC
  exchange paths, same-origin/loopback calls, and public-sandbox deployment
  configuration. It found no Hyperliquid endpoint or generic Trading Capital
  Exchange call.
- No live key, wallet, real account, mainnet, credential, Provider endpoint,
  deployment action, or funds action was used.

Residual risks:

- any external Provider, Hyperliquid, wallet connector, contract-wallet, signer,
  custody, real-value, or private hosted composition;
- Trading Capital remains a 0/25 runtime baseline; clickable reference tabs do
  not create server operations or financial authority;
- only `public_sandbox` is release-enabled; no test here changes launch policy;
- the `fast-uri@3.1.4` production dependency override requires explicit human
  review before merge;
- independent security review and human acceptance of this audit.

## Change inventory and rollback

- Added: `docs/codex/audits/AUDIT-001/audit.md`.
- Modified: `pnpm-workspace.yaml` to override `fast-uri` at `3.1.4`.
- Modified: `pnpm-lock.yaml` to replace only `fast-uri@3.1.3` with
  `fast-uri@3.1.4` and record the override.
- Product feature/runtime source files changed: none.
- Migrations: none.
- Catalog/schema/type changes: none.
- AuthN/AuthZ/admission/quota changes: none.
- SDK/MCP/UI/worker changes: none.
- Launch policy/deployment changes: none.
- Dependency change: one transitive security override; no direct dependency or
  API surface changed.
- Funds, keys, credentials, wallets, chain state, or product database state:
  none. The temporary isolated test database contains synthetic test state only.

Rollback may remove the audit document and revert the workspace override and
lockfile delta. Reverting the dependency patch is not recommended because it
restores the high-severity advisory. No migration, chain, deployment, or fund
rollback is required.

## Reviewer-ready diff summary

This diff adds one independent evidence handoff against source
`de5e72d5a912d2d55c2ce86570408f37c07d4a4f` and Product Basis 10.1.0, plus one
minimal transitive dependency security override. It supersedes no product canon
and grants no authority. It records current capability counts, the
V9/wallet/Trading Capital gap map, exact-runtime commands, browser evidence, and
remaining external-integration risks.

`AUDIT-001` is `VERIFIED_LOCAL`. `PRODUCT-002` is eligible for the next
one-task pass after explicit human acceptance of this evidence and the
`fast-uri@3.1.4` dependency override. `PRODUCT-002` was not started here.
