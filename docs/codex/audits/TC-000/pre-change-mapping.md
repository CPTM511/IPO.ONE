# TC-000 Pre-change Mapping

Captured at: `2026-07-24T17:02:04.285Z`

Task gate: `human_approval`

## Authority entering TC-000

- V9-009 is accepted by the IPO.ONE Founder.
- TC-000 is authorized for architecture review only.
- TC-101 and every later Trading Capital task remain blocked.
- No Hyperliquid credential, endpoint call, API wallet, Testnet write, runtime
  route, real funds, pricing, risk limit, or deployment is authorized.

## Sources reviewed

Repository authority:

- `AGENTS.md`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_v1.1.md`
- `docs/guidance/IPO_ONE_DUAL_NATIVE_EXECUTION_PLAN_v0.1.md`
- ADR-009, ADR-010, ADR-013, ADR-015, ADR-016, ADR-017, ADR-019, ADR-020,
  ADR-021, ADR-022, ADR-025, ADR-029, ADR-031, ADR-032, and ADR-033
- current security boundaries and reconciliation/incident runbooks

Development-package sources:

- `prompts/TC-000.md`
- `product/V9_V10_COMPLETE_PRD.md`
- `contracts/TRADING_CAPITAL_OPERATION_CONTRACTS.md`
- `architecture/PRODUCTION_ARCHITECTURE.md`
- `architecture/WALLET_AND_HYPERLIQUID_SECURITY.md`
- `product/O1_COMPETITIVE_RESPONSE.md`
- `delivery/HUMAN_APPROVAL_MATRIX.md`
- `delivery/SECURITY_ACCEPTANCE_MATRIX.md`
- `governance/SOURCE_OF_TRUTH.md`

External primary references:

- Hyperliquid `Nonces and API wallets`
- Hyperliquid `Exchange endpoint`
- Hyperliquid `Info endpoint`

## Current runtime mapping

The existing runtime catalog has no Trading Capital operation. The development
package defines 25 candidates, all with maturity `specified_disabled`:

| # | Candidate | Current runtime |
| ---: | --- | --- |
| 1 | `tradingCreateAccountBindingChallenge` | absent / disabled |
| 2 | `tradingImportHyperliquidHistory` | absent / disabled |
| 3 | `tradingFinalizeEvidenceSnapshot` | absent / disabled |
| 4 | `tradingReadCreditProfile` | absent / disabled |
| 5 | `tradingCreateCapitalRequest` | absent / disabled |
| 6 | `tradingCreateProviderMandate` | absent / disabled |
| 7 | `tradingListCompatibleMandates` | absent / disabled |
| 8 | `tradingCreateMatchProposal` | absent / disabled |
| 9 | `tradingAcceptMatchAsProvider` | absent / disabled |
| 10 | `tradingAcceptMatchAsSubject` | absent / disabled |
| 11 | `tradingCreateFacility` | absent / disabled |
| 12 | `tradingContributeSubjectCollateral` | absent / disabled |
| 13 | `tradingRecordProviderFunding` | absent / disabled |
| 14 | `tradingActivateFacility` | absent / disabled |
| 15 | `tradingSubmitOrderIntent` | absent / disabled |
| 16 | `tradingCancelOrderIntent` | absent / disabled |
| 17 | `tradingReadFacilityState` | absent / disabled |
| 18 | `tradingEvaluateRisk` | absent / disabled |
| 19 | `tradingPauseNewRisk` | absent / disabled |
| 20 | `tradingFlattenFacility` | absent / disabled |
| 21 | `tradingRequestClose` | absent / disabled |
| 22 | `tradingRunSettlement` | absent / disabled |
| 23 | `tradingReadSettlement` | absent / disabled |
| 24 | `tradingIssuePerformanceProof` | absent / disabled |
| 25 | `tradingReadFacilityEvidence` | absent / disabled |

TC-000 must leave all 25 rows unchanged.

## Existing shared-kernel reuse

| Concern | Existing authority to reuse | TC-000 prohibition |
| --- | --- | --- |
| Subject/Principal | shared Tenant-bound Subject and Principal projections | no Trading Capital identity fork |
| Consent/Mandate | shared Human Consent and Agent Mandate rules | no venue signature as protocol Consent |
| Offer/Obligation | deterministic shared Offer and canonical Obligation | no Facility-only obligation |
| Monetary truth | canonical double-entry Ledger | no venue balance or second ledger as truth |
| State change | Tenant Command Gateway serializable unit of work | no direct worker mutation |
| External truth | Event, Evidence, outbox and reconciliation | no response-only success |
| Tenant isolation | Tenant Gateway, AuthZ, admission and PostgreSQL RLS | no caller-selected Tenant/account bypass |
| Protection | deny-by-default, dual control, break glass and incident runbooks | no broad signer or withdrawal capability |

## Proposed document-only change set

| Document | Frozen boundary |
| --- | --- |
| ADR-034 | one shared Facility and five maturity gates |
| ADR-035 | separate Info/writer planes, signer/custody/action/nonce boundary |
| ADR-036 | factor Evidence, freshness and risk state machine |
| ADR-037 | settlement authority, incident ownership and recovery |
| Trading Capital threat model | adversary cases and tabletop outcomes |
| TC-000 audit | exact commands, results, limitations and next gate |

No runtime code, schema, migration, API catalog, capability, AuthZ, abuse
policy, handler, route, UI, SDK, MCP, credential, environment, or deployment
file is in the TC-000 change set.

## Rejected scope expansion

- implementing any of the 25 candidates;
- adding placeholder callable routes;
- connecting to Hyperliquid Testnet or mainnet;
- generating, importing, approving, rotating, or revoking an API wallet;
- selecting numeric risk, exposure, collateral, pricing, fee, first-loss, or
  loss-waterfall values;
- treating O1.credit project claims as independent Evidence;
- allowing one black-box score or PnL to become credit authority; and
- claiming architecture acceptance is production readiness.

