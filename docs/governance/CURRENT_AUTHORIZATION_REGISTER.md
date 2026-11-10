# IPO.ONE Current Authorization Register

Version: v1.0

Effective date: 2026-11-07 (Asia/Shanghai)

Status: Founder-approved companion to Product Constitution v2.0

Decision owner: IPO.ONE Founder / Product / Governance

## 1. Scope and source of authority

This is the canonical current capability/scope register delegated by
[Product Constitution v2.0](../PRODUCT_CONSTITUTION.md). It relocates v1.7's
profile boundaries and all 56 requirement rows without expanding operational
permissions. It is not a current runtime or deployment inventory.

The exact prior text is in the [v1.7 archive](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md).
In the retained tables below, references to "section 7" mean the named decision
in that archive, indexed in section 7 here. An approval status states required
or permitted product scope; it does not assert implementation or availability.
Legacy status names are compatibility labels, not a fixed development order.

Authorization requires both a valid owner decision and applicable executable
policy/approval evidence. Configured capability flags alone cannot create a
valid grant; missing, expired, revoked or unresolved authority denies the
operation. Existing exact-run/one-use approval conditions remain intact.

## 2. Describe work without conflating environment and money

A task or release records the relevant dimensions:

| Dimension | Values or examples |
| --- | --- |
| Delivery target | document review; local verification; test-environment acceptance; deployed user acceptance |
| Hosting environment | local; private preview; public production hosting |
| Access/roles | anonymous sandbox; authenticated Tenant; specifically authorized privileged role |
| Economic/execution profile | synthetic/no-funds; exact test-asset profile; separately approved controlled real value |

The legacy L0–L5 identifiers below remain for existing contracts and evidence.
They are not a mandatory deployment ladder. A production-hosted no-funds Beta
is not L5 real-value finance. Network identity/signature proof is distinct from
chain execution and financial authority.

## 3. Retained delivery modes and status vocabulary


| Mode | Meaning | Current authority |
| --- | --- | --- |
| `L0_LOCAL_NO_FUNDS` | Durable local synthetic/no-funds product work | Approved only within existing local permissions and policies. |
| `L1_PUBLIC_SANDBOX` | Public synthetic product with no private Tenant data or real value | Subject to current launch policy and current release Evidence. |
| `L2_PUBLIC_AUTHENTICATED_NO_FUNDS` | Public authenticated no-funds Beta with durable Tenant-isolated private state | Founder-authorized for ordinary self-service Human and Principal entry through the current launch policy; authentication, RLS, object authorization and financial no-go boundaries remain mandatory. |
| `L3_LIVE_TESTNET` | Separately approved testnet execution/read proof | Every live profile remains disabled until a named policy entry is unlocked. A ratified `live_testnet_secured_pool` profile may authorize public test-asset participation only for its exact chain, contracts, accounts, assets, oracle, caps, owners, and Evidence window. Deployment/admin/signers remain exact-run approvals. Test assets are not real funds or Human production lending. |
| `L4_CONTROLLED_REAL_VALUE` | Bounded Agent-only real-value candidate | Disabled; requires a complete named decision package and policy revision. |
| `L5_PRODUCTION` | Production real-value operation | Not approved. |

Requirement statuses:

- `APPROVED_MVP`: required for the complete L0 shared MVP.
- `APPROVED_PHASE_2`: required for the synthetic bilateral marketplace.
- `REQUIRED_FOR_NO_FUNDS_OPERATIONS`: required operational capability for L2;
  it does not restore invitation or participant-by-participant approval.
- `ARCHITECTURE_APPROVED_RUNTIME_GATED`: target architecture is approved, but
  runtime activation remains separately gated.
- `NOT_APPROVED`: not part of the current product; no implementation inference.

## 4. Stable approved-capability registry

The following table is retained byte-for-byte from v1.7. Its governing semantic
decisions remain binding as indexed in section 7. For `REQ-AUTO-001`, "AI never
authorizes" refers to creation of authority; authenticated Agent invocation
through independently enforced server policy is governed by Constitution
section 3.3 and engineering standard v1.1. The normal Human no-funds lifecycle
remains required; the new sequencing rule does not remove its scope.


Each row has exactly one governing decision source. Supporting sources may add
detail but cannot change the status, mode, or gate without updating this file.

| Requirement ID | Capability | Status | Earliest mode | Governing decision | Gate / boundary |
| --- | --- | --- | --- | --- | --- |
| REQ-CORE-001 | one shared Human/Agent obligation kernel | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.1 | no parallel ledger, risk, Event, Evidence, or reconciliation truth |
| REQ-ID-001 | Human Subject plus accountable Principal | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.3 step 1 | synthetic/private identity only; no production Human credit |
| REQ-ID-002 | Agent Subject plus accountable Principal | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.3 step 1 | production workload identity separately approved |
| REQ-ID-003 | Human Consent and KYC/VC reference | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 4 | reference/attestation only; raw KYC/PII offchain |
| REQ-ID-004 | Human/Agent CAIP-10 execution AccountBinding and wallet proof | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-AECL-INTEGRATION-001 in section 7 | binding is not login, Actor/Role/Subject creation, credit authority, custody or session authority; production wallet/connector separately gated |
| REQ-ID-005 | Principal-controlled Agent Mandate | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 4 | exact bounded capabilities; stale/revoked authority fails closed |
| REQ-CREDIT-001 | Credit Intent | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.3 step 3 | authority, purpose, amount, asset, cap, and freeze checks |
| REQ-CREDIT-002 | deterministic explainable Risk Decision | APPROVED_MVP | L0_LOCAL_NO_FUNDS | ADR-033 | non-authorizing Evidence-derived decision passport |
| REQ-CREDIT-003 | permissioned factor/outcome Credit Passport | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 3 | no universal authoritative score; disclosure is recipient scoped |
| REQ-CREDIT-004 | authorized Capital Partner review | APPROVED_PHASE_2 | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 5 Phase 2 | borrower-authorized disclosure; lender-private policy protected |
| REQ-CREDIT-005 | lender-authored versioned Offer | APPROVED_PHASE_2 | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 2 Capital Partners | Capital Partner owns limit, price, term, purpose, schedule, conditions |
| REQ-CREDIT-006 | exact Offer acceptance/rejection/expiry/replacement/withdrawal | APPROVED_PHASE_2 | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 5 Phase 2 | stale, duplicate, changed, unauthorized, or cross-Tenant acceptance fails |
| REQ-CREDIT-007 | canonical Obligation and repayment schedule | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.3 step 5 | one state machine for Human and Agent |
| REQ-CREDIT-008 | purpose-bound Facility | APPROVED_PHASE_2 | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 4 | exact accepted Offer/Obligation; no deposit, withdrawal, custody, or real funds |
| REQ-CREDIT-009 | authority-bound CreditLine capacity/utilization projection | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-CREDITLINE-001 in section 7 | never independent lending authority or caller-controlled limit |
| REQ-EXEC-001 | signed controlled sandbox execution from an exact server-resolved intent | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-AECL-INTEGRATION-001 in section 7 | exact payload, ExpectedEffects and target policy are server-derived; explicit no-funds/non-withdrawable receipt |
| REQ-EXEC-002 | allowlisted Provider spend with caps | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-AECL-INTEGRATION-001 in section 7 | canonical TransferIntent plus versioned server registry only; ambiguous/unsupported resolution denies; external Provider separately approved |
| REQ-EXEC-003 | Agent Lockbox revenue capture and repayment profile | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-LOCKBOX-001 in section 7 | must become durable/authenticated before L4; no arbitrary balance release |
| REQ-EXEC-004 | withdrawal and transfer denial boundary | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 8 | no arbitrary withdrawal/unrestricted external transfer |
| REQ-EXEC-005 | Mandate-bound metered machine-service usage Evidence and deterministic charge admission | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-METERED-RESOURCE-CREDIT-001 in section 7 | exact `provider_gateway_compute` / `inference_tokens` / `token` synthetic profile may operate at L0 and L2; signed replay-safe Evidence and canonical Ledger only; external Provider and real funds separately gated |
| REQ-PAY-001 | canonical double-entry Ledger | APPROVED_MVP | L0_LOCAL_NO_FUNDS | ADR-010 | Ledger is source of economic truth; local approval is not production authority |
| REQ-PAY-002 | deterministic repayment waterfall and receipt | APPROVED_MVP | L0_LOCAL_NO_FUNDS | MVP Build Spec FR-007 | exact fee/interest/principal allocation; idempotent and evidenced |
| REQ-PAY-003 | DPD/default/cure/restructure/repurchase/write-off | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.3 step 8 | Human/Agent shared servicing; protected actions keep named authority |
| REQ-PAY-004 | canonical settlement and performance proof | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-037 | real-value settlement, corrections, release, and overrides separately approved |
| REQ-EVID-001 | typed portable Event and Evidence record | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.3 step 10 | explicit provenance, finality, revocation, and reconciliation |
| REQ-EVID-002 | event/outbox/projection reconciliation and replay | APPROVED_MVP | L0_LOCAL_NO_FUNDS | DEC-AECL-INTEGRATION-001 in section 7 | Tenant Command Gateway owns one serializable AECL command transaction and durable response; production HA/ops separately gated |
| REQ-EVID-003 | owned/operator receipts and official reports | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 6 rule 4 | resolvable typed hashes; browser exports are not truth |
| REQ-EVID-004 | longitudinal factor/outcome credit record | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 4 | active policy deterministic; learning shadow-only |
| REQ-RISK-001 | caps, pause/freeze, stop-loss posture, dual control | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 5 Operator product | numerical production limits and override authority separately approved |
| REQ-RISK-002 | stale/unknown/incident monotonic protection | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-036 | no new risk until fresh reconciled Evidence and approved recovery |
| REQ-CHAIN-001 | CAIP multi-chain adapter boundary | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 3.4 | Base Sepolia and X Layer are reversible test profiles only |
| REQ-CHAIN-002 | finality/reorg-safe Event Indexer | APPROVED_MVP | L0_LOCAL_NO_FUNDS | MVP Build Spec FR-011 | testnet writes remain separately approved |
| REQ-UX-001 | complete Human no-funds product journey | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 5 Human product | no raw IDs as normal workflow; server truth only |
| REQ-UX-002 | versioned Agent OpenAPI/SDK/MCP product journey | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 5 Agent product | remote MCP/A2A and production credentials separately reviewed |
| REQ-UX-003 | Capital Partner inbox/portfolio/Evidence journey | APPROVED_PHASE_2 | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 2 Capital Partners | invited/synthetic only until L2 approval |
| REQ-UX-004 | Risk/Operations queue, alerts, controls, audit drill-down | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 5 Operator product | privacy-safe and authorization-filtered |
| REQ-UX-005 | authenticated server-derived workspace recovery | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Engineering and Experience Standard v1.0 section 4 | browser state/fixtures cannot supply canonical truth |
| REQ-TRADE-001 | Trading Capital as shared-kernel Facility profile | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-034 | no second Ledger/Obligation/Evidence/funds system |
| REQ-TRADE-002 | signer-free venue binding/history Evidence | ARCHITECTURE_APPROVED_RUNTIME_GATED | L3_LIVE_TESTNET | ADR-035 | no signer, transfer, withdrawal, key approval, or venue write authority |
| REQ-TRADE-003 | bilateral capital request/mandate/matching | APPROVED_PHASE_2 | L0_LOCAL_NO_FUNDS | Product Optimization Measure v1.0 section 2 | exact bilateral acceptance; no real funding |
| REQ-TRADE-004 | synthetic Trading Facility/order/risk lifecycle | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-036 | conservative state machine; exact numerical policy separately approved |
| REQ-TRADE-005 | purpose-bound delegated external venue execution for an Agent Trading Capital Facility | ARCHITECTURE_APPROVED_RUNTIME_GATED | L3_LIVE_TESTNET | DEC-AGENT-VENUE-EXEC-001 in section 7 | external Agent and shared kernel remain independent; controlled capital account and policy signer only; every signer, account and run separately approved; mainnet and real value prohibited |
| REQ-POOL-001 | one curated secured market and pool solvency | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | DEC-M2-SECURED-POOL-001 | one market; no factory/proxy/multi-asset; L3 separately gated |
| REQ-POOL-002 | public testnet LP supply and liquidity-valid withdrawal | ARCHITECTURE_APPROVED_RUNTIME_GATED | L3_LIVE_TESTNET | DEC-M2-SECURED-POOL-001 | exact test assets/caps/pause; no real funds |
| REQ-POOL-003 | deterministic LP/debt share and reserve/bad-debt accounting | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | explicit rounding and conservation invariants |
| REQ-COLL-001 | collateral deposit, capacity, health and valid release | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | secured-only; stale oracle denies new risk/release |
| REQ-COLL-002 | deterministic liquidation, surplus and bad debt | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | test fixtures only; L3 action separately gated |
| REQ-ORACLE-001 | source-bound valid/fresh/deviation-guarded price | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | exact L3 feed/address and recovery separately approved |
| REQ-RATE-001 | utilization rate and monotonic bounded accrual | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | fixture curve; no commercial pricing inference |
| REQ-POOL-EVID-001 | pool event finality, Obligation mapping and reconciliation | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-003 | finalized authenticated logs; discrepancy blocks new risk |
| REQ-POOL-UX-001 | LP, Human borrower and pool Risk/Ops journeys | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | M2 alignment v1.0 | L3 candidate requires deployed visible-click Evidence |
| REQ-AGENT-POOL-001 | Principal-bound Agent use of secured Facility | ARCHITECTURE_APPROVED_RUNTIME_GATED | L3_LIVE_TESTNET | DEC-AGENT-VENUE-EXEC-001 plus M2 alignment | M2B after M2A; no withdrawal/transfer/leverage-on-leverage |
| REQ-PRIV-001 | offchain sensitive-data and least-privilege boundary | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Charter v1.1 section 6 | no raw KYC/PII/credentials/onchain sensitive record |
| REQ-AUTO-001 | queryable fail-closed automation | APPROVED_MVP | L0_LOCAL_NO_FUNDS | Product Engineering and Experience Standard v1.0 section 5 | A3/A4 authority must be exact; AI never authorizes credit or mutation |
| REQ-PILOT-001 | dispute/appeal/correction case workflow | REQUIRED_FOR_NO_FUNDS_OPERATIONS | L2_PUBLIC_AUTHENTICATED_NO_FUNDS | DEC-DISPUTE-001 in section 7 | no claim of legal complaint handling; immutable Evidence and correction linkage |
| REQ-PILOT-002 | privacy-safe analytics, feedback, support, and incident ownership | REQUIRED_FOR_NO_FUNDS_OPERATIONS | L2_PUBLIC_AUTHENTICATED_NO_FUNDS | Product Charter v1.1 section 7 | minimum-data Beta operations; no invitation or participant approval gate |

## 5. Legacy MVP requirement crosswalk

This crosswalk preserves historical requirement semantics. Statements about a
then-existing implementation gap are historical, not a fresh readiness audit.


| Legacy ID | Current stable requirements | Disposition |
| --- | --- | --- |
| FR-001 Subject Registry | REQ-ID-001, REQ-ID-002 | retained and split by entry authority over shared Subject model |
| FR-002 Principal Binding | REQ-ID-001, REQ-ID-002, REQ-ID-005 | retained |
| FR-003 Multi-chain Binding | REQ-ID-004, REQ-CHAIN-001 | retained |
| FR-004 Agent Lockbox | REQ-EXEC-003 | retained; durable authenticated gap remains |
| FR-005 Spend Policy | REQ-EXEC-002, REQ-EXEC-004 | retained with explicit withdrawal denial |
| FR-006 Obligation Registry | REQ-CREDIT-007 | retained in shared kernel |
| FR-007 Repayment Router | REQ-PAY-002 | retained in canonical Ledger |
| FR-008 Deterministic Risk | REQ-CREDIT-002, REQ-CREDIT-009, REQ-RISK-001 | retained; universal score rejected |
| FR-009 Admin Console | REQ-UX-004, REQ-EVID-003 | retained as product surface and receipt access |
| FR-010 Human Prototype | REQ-ID-001, REQ-ID-003, REQ-UX-001, REQ-PAY-003 | upgraded by Charter to complete no-funds Human product; real Human lending still prohibited |
| FR-011 Event Indexer | REQ-CHAIN-002, REQ-EVID-001 | retained |
| FR-012 Provider Sandbox | REQ-EXEC-002 | retained; external Provider remains gated |

## 6. Exact current profile boundaries

| Area | Current approved/gated boundary | Owning decision or executable source |
| --- | --- | --- |
| Public authenticated no-funds Beta | Ordinary Human/Principal self-service has no invitation/cohort/participant approval gate; private state requires authentication, forced RLS and object authorization. Privileged roles remain specifically governed. | DEC-PUBLIC-NO-FUNDS-BETA-001; `deploy/launch-policy.v1.json` |
| Current hosted composition | Vercel + Neon and the accepted `single_v2` authentication/authorization composition remain the reviewed baseline. Routine work within it is reusable authority; a new datastore, identity provider, privacy flow or service commitment requires the applicable review. | DEC-PUBLIC-NO-FUNDS-BETA-001; accepted architecture and deployment records |
| Wallet/account proof | Base/X Layer accepted profiles plus BSC Testnet `eip155:97` and BNB Mainnet `eip155:56` signature-only access. Login, AccountBinding and economic authority stay distinct; same-address cross-chain identities are not silently merged. BNB identity access grants no chain write. | DEC-AECL-INTEGRATION-001; DEC-BNB-NO-FUNDS-001; BNB-001/BNB-004 task records |
| B2 mobile wallet transport | Founder-approved renewal through 2026-12-08 23:59:59 Asia/Shanghai: Binance Wallet, OKX Wallet, MetaMask; existing WalletConnect 2.23.10, ipo.one, relay and four-profile/eight-method maximum signature-only boundary. One existing-project production public ID variable and gated conditional release are approved; phone operators must be available and failure rolls back to B1 bcce697. No transactions, real funds, new SDK/chain or external spend. | [B2 exact approval](approvals/B2_MOBILE_NO_FUNDS_20261108.json); [task](../codex/tasks/B2_MULTI_WALLET_AND_MOBILE.md) |
| B2 QR operational disposition | Founder explicitly deferred desktop QR after failed iPhone/OKX acceptance on 2026-11-08. Public WalletConnect activation is disabled; no old staged candidate may reactivate it without an explicit Founder resume request. Wallet-internal injected browsers and desktop injected wallets continue under existing no-funds authority. QR is deferred, not accepted. | B2 approval operational disposition; current B2 task and recorded user directive |
| B3 exact-source conditional release | Founder-approved56f2718 exact conditional release completed at ipo.one/dpl_9Jdtb51bGHrRATTXgmyey9sSStL5. PASS — DEPLOYED AND USER-VERIFIED for Human no-funds synthetic B3: exactCI/artifacts,visible original-wallet accept/confirm/execute/fullrepay/release,refresh/logout/relogin,sameReceipt,old14/new12 fullUI hashes,creditv2/2cycles and6locale12theme checks passed. Same shared versioned Gateway; AgentSDK/MCP HTTP/PG proof retained without new productionAgent credential claim.32vars/approvedprofile/79migrations; no furtherDDL/funds/chain/newdeps/service/permission/spend. QR deferred. Approved rollback128OFF HMyGYYcC8X43MYyCxEbtkVwTG8iD/removeprofile/retainalldata. | [56 exact approval](approvals/B3_DISPLAY_REPAIR_56F2718_20261109.json); [current B3 task](../codex/tasks/B3_COLLATERAL_SUBMISSION_ALIGNMENT.md); release evidence |
| B4 synthetic fee policy — L0 only | On 2026-11-09 Founder explicitly approved option A: separately payable borrower platform fee, only new local synthetic USD loans. Borrower fee 0.10% of successful funded principal, no minimum, $10 cumulative cap per economic loan; institution share 10% of eligible received normal interest; cumulative integer-cent floor with loan-level remainder, UTC monthly synthetic statements, linked compensating reversals, no retroactive fees. L0 implementation and verification completed (PASS — LOCAL VERIFIED); see B4 task section11 and the local result. This is not production release authority; production deployment, real collection/settlement, new external spend/services and broader financial authority are not. Keep old fee_audit_policy.v1 and accepted loans/reports unchanged. | [PRD B4/R06](../guidance/IPO_ONE_DEVELOPMENT_SPEC_DRAFT.md); [B4 decision, contract and acceptance](../codex/tasks/B4_SYNTHETIC_FEE_POLICY_ALIGNMENT.md#当前决定2026-11-09) |
| B4-F1 synthetic source corrections — L0 only | Founder explicitly approved B4-F1 on 2026-11-09: linked synthetic funding/normal-interest source corrections and fee compensation for new B4 USD loans, with canonical Obligation/Ledger/Agent exposure/credit attribution kept consistent. Cancelled principal is not borrower repayment; paid amounts become explicit synthetic refund credits. Recent MFA, independent dual human approval, exact source/amount/state, idempotency and visible review are required. No production deployment/DDL, real refund/funds, chain writes, new external services/dependencies or spend. Local implementation and full HTTP/PostgreSQL/native-MFA browser execution were verified with distinct fixture identities; not human professional sign-off. Founder review runtime keeps F1 execution off until actual independent reviewer wallets are bound. Production B3 data was not touched. | [B4-F1 decision and scope](../codex/tasks/B4_SYNTHETIC_FEE_POLICY_ALIGNMENT.md#9-新发现的源纠错缺口与已批准扩展仅l0) |
| B4-H hosted synthetic adaptation — local and restricted CI only | On 2026-11-10 Founder explicitly approved B4-H default-off hosted synthetic policy/terms, exact migration compatibility, institution authorization and HTTPS/MFA/independent dual approval adaptation, local validation and existing CI pushed only to CPTM511/IPO.ONE branch codex/b4-hosted-synthetic. Verify no automatic Vercel deployment or new spend before pushing. No production configuration/DDL/role or credential enrollment, Vercel upload/stage/promote/rollback, real funds/refunds, chain writes, new services or spending. Existing A/F1 economics and immutable L0 policy/history remain unchanged. Local implementation and dual-runtime verification passed; exact branch CI and the frozen OFF artifact remain pending. This is not production authorization or deployed acceptance. Founder additionally approved disposable local-only test Actors/Memberships/authentication credentials/role enrollments for B4-H WebAuthn and independent dual-review acceptance, with cleanup; production identities and deployment remain excluded. Exact supplementary grant: approvals/B4_HOSTED_LOCAL_TEST_IDENTITIES_20261110.json. | [Exact approval](approvals/B4_HOSTED_LOCAL_CI_20261110.json); [B4 task section12](../codex/tasks/B4_SYNTHETIC_FEE_POLICY_ALIGNMENT.md) |
| Multi-chain test configuration | Base Sepolia `eip155:84532` is the first execution profile; X Layer Testnet `eip155:1952` is the portability profile. This is a reversible test configuration. | Product Charter v1.1 section 3.4; exact approved testnet runbooks |
| M2 secured pool | One curated overcollateralized Base Sepolia WETH/test-USDC market, secured-only, adapter-connected to the shared kernel. M2A LP/Human precedes M2B Agent venue composition. No unsecured fallback, factory/proxy, multiple assets/markets, flash loans or recursive leverage. | DEC-M2-SECURED-POOL-001; ADR-M2-001 through ADR-M2-005; `live_testnet_secured_pool` in launch policy |
| M2 runtime activation | Launch policy contains the exact pool/oracle profile and staged gates. Every required current code/configuration/authority/deployment/acceptance proof still applies. `releaseEnabled: true` is not proof that a particular run is authorized or verified. | `deploy/launch-policy.v1.json`; exact approved run/recovery evidence |
| Agent venue execution | Architecture-approved, runtime-gated purpose-bound execution through a controlled capital account and policy signer. First reference venue is Hyperliquid Testnet bounded BTC; Agent wallet, controller, signer and Subject stay distinct. Each signer/account/profile/run retains its exact approval conditions. | DEC-AGENT-VENUE-EXEC-001; accepted M2B and exact-run records |
| Metered machine service | Only `provider_gateway_compute` / `inference_tokens` / `token`, one synthetic price schedule and Agent/Principal Facility, is authorized at L0 and L2. Fresh hosted signing identity, replay-safe usage Evidence and canonical charge admission remain required. | DEC-METERED-RESOURCE-CREDIT-001; exact synthetic capability in launch policy |
| Provider/resource expansion | A second Provider/resource/unit, external calls/credentials or production pricing/risk changes remain gated. The product principle permits extensible profiles; this row does not activate one. | Same metered decision and a future explicit scoped review |
| Agent Lockbox | Approved MVP capability and first controlled-real-value candidate; durable authenticated Tenant isolation, captured revenue, repayment, freeze, reconciliation and non-withdrawability required. It is not active real-value authority. | DEC-LOCKBOX-001 |
| Strategy Vault and general liquidity | Strategy Vault, generic/public real-value LP/vault, unrestricted liquidity/transfer/withdrawal and market factory remain unapproved. Governed testnet LP withdrawal is limited to its valid claim under liquidity/pause rules. | DEC-STRATEGY-VAULT-001; DEC-M2-SECURED-POOL-001 |
| Models and adverse actions | Active policy remains deterministic, versioned and explainable; learning remains shadow-only and non-authorizing. Protected servicing, independent approval/MFA and override rules remain applicable to their exact operations. | Constitution section 3; accepted risk/servicing policies |
| L4/L5 finance | Disabled/unapproved. Real Human cash lending, real-value settlement, production custody/signing, mainnet economic execution, tokens/DAO and uncontrolled Agent borrowing are not activated. | Constitution section 8; disabled controlled-credit launch profile |

Exact chain addresses, risk caps, time windows, signer/account and receipt
conditions belong to executable policy and the approved run records. Do not
copy them into the Constitution or infer a new run from historical transactions.
The controlled-credit profile's `realFundsEnabled: true` describes that disabled
profile's potential effect; its `releaseEnabled: false` remains decisive.

The same authorization can be reused only within its granted target, effects,
budget, validity and conditions. Scope changes require review. Moving constants
here does not make an old one-use test grant repeatable or revive an expired grant.

## 7. Retained decisions and historical status

The following exact v1.7 decisions remain incorporated for their unchanged
semantics and current profile restrictions. Constitution v2.0 controls the
explicit governance/Agent-invocation clarifications.

| Decision | Preserved source |
| --- | --- |
| CreditLine as capacity projection, not independent credit authority | [DEC-CREDITLINE-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-creditline-001--creditline-is-a-capacity-projection-not-credit-authority) |
| Agent Lockbox as first controlled-value candidate | [DEC-LOCKBOX-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-lockbox-001--agent-lockbox-remains-the-first-controlled-value-profile) |
| Strategy Vault unapproved | [DEC-STRATEGY-VAULT-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-strategy-vault-001--strategy-vault-is-not-approved) |
| Dispute/appeal/correction operations | [DEC-DISPUTE-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-dispute-001--disputeappeal-remains-a-no-funds-operational-capability) |
| AccountBinding, exact server-resolved intent and one Gateway transaction | [DEC-AECL-INTEGRATION-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-aecl-integration-001--native-execution-keeps-identity-intent-and-persistence-closed) |
| Delegated venue execution and custody/signing separation | [DEC-AGENT-VENUE-EXEC-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-agent-venue-exec-001--delegated-execution-is-not-agent-custody) |
| One secured testnet Capital Facility | [DEC-M2-SECURED-POOL-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-m2-secured-pool-001--one-secured-testnet-capital-facility) |
| Public authenticated no-funds ordinary access | [DEC-PUBLIC-NO-FUNDS-BETA-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-public-no-funds-beta-001--ordinary-access-is-public-and-authenticated) |
| Exact synthetic metered usage/charge admission | [DEC-METERED-RESOURCE-CREDIT-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-metered-resource-credit-001--metered-machine-service-is-a-provider-spend-facility-profile) |
| BNB signature-only network identity access | [DEC-BNB-NO-FUNDS-001](history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md#dec-bnb-no-funds-001--binance-wallet-and-bnb-network-access) |

The archived section 10 is the 2026-08-03 recovery/M1/M2 governance disposition.
Its unresolved findings are preserved as historical findings; none is marked
fixed, re-tested or waived by this relocation. Use dated task evidence such as
`docs/codex/tasks/BNB_004_PUBLIC_NO_FUNDS_ACCEPTANCE_AND_RELEASE.md` and relevant
M2/M3 records for their exact past observations, then verify affected current
boundaries before a new availability claim.

The historical M1 manifest covers 55 v1.3 IDs and their original evidence hashes.
`REQ-EXEC-005` was added later and receives no M1 evidence by inheritance.

## 8. Register changes

Update this versioned register only from an explicit owner decision, stating
changed IDs/profiles, scope, compatibility, authority effects and required policy
or migration work. Preserve accepted semantics and immutable evidence provenance.
A local adapter implementation or added enum never activates another profile.
L4/L5 activation also requires the Constitution revision specified in section 8
of that document; a register edit cannot enable real-value finance alone.
