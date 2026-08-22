# IPO.ONE Product Constitution

Version: v1.3

Effective date: 2026-08-22

Status: Founder-directed and ratified for current product-truth governance

Decision owner: IPO.ONE Founder / Product / Governance

Supersedes: Product Constitution v1.2 effective 2026-08-14

Milestone: M2 — Public Secured Liquidity & Delegated Agent Execution

## 1. Purpose and authority

This Constitution is the highest repository authority for determining which
IPO.ONE product capabilities are approved, gated, rejected, or unresolved. It
is an authority index and conflict resolver. It does not replace the detailed
product thesis, architecture decisions, security invariants, schemas, or
acceptance specifications it governs.

The M2 direction is made authoritative by recording it in this versioned
repository document. v1.3 approves only the bounded secured-pool architecture
and implementation sequence described here. It does not prove or activate
runtime, testnet, hosting, real value, or production. Conversations remain
non-authoritative unless their decision is reviewed and incorporated into this
Constitution or a subordinate approved source.

Approval of a requirement is not evidence that it is implemented, verified,
hosted, available to users, real-value active, or production ready. Those states
must be established separately with current executable Evidence.

## 2. Authority and supersession order

| Order | Authority | Role and conflict rule |
| --- | --- | --- |
| 1 | This Product Constitution | Defines approved capability inventory, stable IDs, status, phase, non-goals, and conflict resolution. |
| 2 | Product Charter v1.1 | Canonical long-term thesis, shared lifecycle, interfaces, pilot definitions, governance, and commercialization gates. |
| 3 | Accepted ADRs and approved security invariants | Govern the exact architecture/security decision within their stated scope; architecture-only ADRs grant no runtime authority. |
| 4 | MVP Build Spec v0.1 | Governs first-build engineering discipline, foundation scope, FR-001 through FR-012, and issue structure where not superseded. |
| 5 | Product Optimization Measure v1.0 | Governs active near-term product structure, Capital Partner workflow, Credit Passport, Trading Capital profile, and phased delivery where consistent with higher authorities. |
| 6 | Domain models, state machines, API/schema contracts | Define executable protocol shape but cannot approve a capability or broaden authority. |
| 7 | Executable acceptance specifications | Establish behavior at their exact tested boundary; fixtures and mocks cannot prove product runtime truth. |
| 8 | Approved UX specifications/prototypes | Govern intended experience only; browser state is never canonical truth. |
| 9 | Current implementation | Evidence of what code exists, not approval or completion. |

Product Description and PRD v1.0 remains historical and is superseded where it
conflicts with Product Charter v1.1 or this Constitution. Draft roadmaps,
reviews, proposals, research, marketing, audits, task names, filenames, test
names, and conversations do not approve product behavior.

When two sources at the same level conflict, the later approved version governs
only if it explicitly records supersession. Otherwise the behavior is
`UNRESOLVED` and must fail closed until a named decision is recorded.

## 3. Normative product invariants

1. IPO.ONE is verifiable credit marketplace and obligation infrastructure, not
   a generic lending app.
2. The primitive is `Identity + Payment + Obligation`.
3. Human and Agent are parallel entry modes over one Subject, authority, Offer,
   Obligation, Facility, Ledger, servicing, Event, Evidence, risk, and
   reconciliation kernel.
4. Capital Partners own bilateral economic Offer decisions. IPO.ONE owns
   permission integrity, versioning, servicing, Ledger, reconciliation, and
   Evidence.
5. Trading Capital is a purpose-bound Facility profile, not a separate credit
   or funds system.
6. Active credit policy is deterministic, versioned, and explainable. Any
   learning model is versioned, shadow-only, and non-authorizing.
7. Raw KYC, PII, credentials, private keys, raw signatures, and lender-private
   policy remain off public/onchain surfaces by default.
8. No arbitrary withdrawal, unrestricted transfer, generic/public real-value
   LP/vault, market factory, token/DAO, black-box universal score, unbounded
   Human cash loan, hybrid secured/unsecured Facility, or automatic model
   promotion is approved. One curated, overcollateralized, public-participation
   Base Sepolia test-asset pool may proceed through separately gated M2 modes.
   That exception grants no mainnet, real-value, production, multi-market,
   multi-asset, flash-loan, recursive-leverage, or Agent-withdrawal authority.
9. Stale, unknown, unauthorized, unreconciled, or ambiguous state cannot
   authorize new risk.
10. Designed, approved, implemented, locally verified, testnet verified,
    hosted, real-value active, and production ready are distinct states.
11. M2 is secured-only. Existing unsecured/synthetic credit remains no-funds;
    collateral deficiency never becomes silent unsecured exposure.
12. The secured pool is one Capital Facility domain behind an adapter, not a
    second Subject, Offer, Obligation, Ledger, Event, Evidence, Credit State, or
    reconciliation kernel.
13. Public participation does not imply permissionless market creation or risk
    administration.
14. On-chain pool balances are authoritative for custody, LP shares,
    collateral, debt, interest, and liquidation; the IPO.ONE kernel remains
    authoritative for identity, Mandate, cross-rail Obligation, and portable
    Evidence. Discrepancies fail closed.

## 4. Delivery modes and requirement status

| Mode | Meaning | Current authority |
| --- | --- | --- |
| `L0_LOCAL_NO_FUNDS` | Durable local synthetic/no-funds product work | Approved only within existing local permissions and policies. |
| `L1_PUBLIC_SANDBOX` | Public synthetic product with no private Tenant data or real value | Subject to current launch policy and current release Evidence. |
| `L2_CLOSED_NO_FUNDS` | Invited durable no-funds pilot with private Tenant data | Disabled until all named launch-policy gates and approvals pass. |
| `L3_LIVE_TESTNET` | Separately approved testnet execution/read proof | Every live profile remains disabled until a named policy entry is unlocked. A ratified `live_testnet_secured_pool` profile may authorize public test-asset participation only for its exact chain, contracts, accounts, assets, oracle, caps, owners, and Evidence window. Deployment/admin/signers remain exact-run approvals. Test assets are not real funds or Human production lending. |
| `L4_CONTROLLED_REAL_VALUE` | Bounded Agent-only real-value candidate | Disabled; requires a complete named decision package and policy revision. |
| `L5_PRODUCTION` | Production real-value operation | Not approved. |

Requirement statuses:

- `APPROVED_MVP`: required for the complete L0 shared MVP.
- `APPROVED_PHASE_2`: required for the synthetic bilateral marketplace.
- `REQUIRED_BEFORE_CLOSED_PILOT`: must be approved and verified before L2.
- `ARCHITECTURE_APPROVED_RUNTIME_GATED`: target architecture is approved, but
  runtime activation remains separately gated.
- `NOT_APPROVED`: not part of the current product; no implementation inference.

## 5. Stable approved-capability registry

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
| REQ-PILOT-001 | dispute/appeal/correction case workflow | REQUIRED_BEFORE_CLOSED_PILOT | L2_CLOSED_NO_FUNDS | DEC-DISPUTE-001 in section 7 | no claim of legal complaint handling; immutable Evidence and correction linkage |
| REQ-PILOT-002 | privacy-safe analytics, feedback, support, and incident ownership | REQUIRED_BEFORE_CLOSED_PILOT | L2_CLOSED_NO_FUNDS | Product Charter v1.1 section 7 | named privacy, retention, support, and incident approvals |

## 6. MVP Build Spec FR crosswalk

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

## 7. M0 semantic decisions

### DEC-CREDITLINE-001 — CreditLine is a capacity projection, not credit authority

1. A Risk Decision or generated Offer does not create a CreditLine, execution
   authority, or spend permission.
2. Economic authority comes from an exact accepted Offer and its canonical
   Obligation/Facility, plus current Consent or Mandate and all live policy
   checks.
3. A CreditLine represents bounded capacity and utilization for an approved
   profile. It cannot replace the Offer, Obligation, Facility, Mandate, Ledger,
   or risk policy.
4. Logical authorization begins only with exact Offer acceptance and Facility
   activation. A row may be lazily materialized at first permitted Agent
   execution, but that materialization cannot invent or increase limit, term,
   price, purpose, Provider, target, or authority.
5. Human and Agent parity is at the shared Offer, Obligation, Facility, Ledger,
   servicing, Event, Evidence, and reconciliation layers. A CreditLine
   projection may be profile-specific; it must not create a separate Human or
   Agent risk truth.
6. Utilization may increase only through permitted execution and decrease only
   through canonical repayment, reversal/correction, or approved close. Freeze,
   pause, and closure may restrict capacity.
7. Increasing a limit or broadening duration, purpose, Provider, target, asset,
   or authority requires a new disclosed Offer and exact acceptance. No silent
   administrative or model-driven increase is approved.

This decision ratifies semantics only. It does not claim the current
implementation is complete or approve new operations, schema, limits, or risk
policy.

### DEC-LOCKBOX-001 — Agent Lockbox remains the first controlled-value profile

Agent Lockbox is an approved MVP capability and the first candidate for a later
controlled Agent-credit pilot. It must bind the accountable Principal, active
Mandate, accepted Offer/Facility, allowlisted Provider purpose, canonical
Ledger, captured revenue, deterministic repayment, Event, Evidence, freeze,
reconciliation, and non-withdrawability.

Process-local state, generic balance reduction, UI presence, or a demo flow does
not satisfy REQ-EXEC-003. Before any L4 proposal, Lockbox truth must be durable,
authenticated, Tenant-isolated, restart-readable, reconciled, and proven to
deny arbitrary withdrawal or transfer.

### DEC-STRATEGY-VAULT-001 — Strategy Vault is not approved

“Strategy Vault” is not an approved MVP capability, is not a synonym for Agent
Lockbox or Trading Capital Facility, and must not appear as an available product
surface, API, custody construct, or roadmap commitment. Any future proposal
requires a separate versioned product decision explaining its user, authority,
capital, custody, loss, withdrawal, and non-redundancy boundaries. Public LP
vaults and unrestricted liquidity remain prohibited.

### DEC-DISPUTE-001 — dispute/appeal is a closed-pilot prerequisite

A durable user/operator dispute, appeal, and correction case workflow is not a
required L0 local-MVP capability, but it is required before L2 invited closed
pilot activation. The minimum approved outcome is:

- file a case against a Decision, Offer disclosure, Payment, servicing action,
  Evidence item, or report;
- preserve the original immutable record and link any correction as a new
  version/Event;
- record authorized filer, owner, status, reason, timestamps, Evidence, and
  resolution;
- expose privacy-safe status to the affected owner and authorized operator;
- prevent a dispute from silently changing credit, Ledger, or Evidence truth;
- keep legal complaint procedure, adverse-action law, SLA, jurisdiction, and
  production roles behind separate Legal/Privacy/Operations approval.

### DEC-AECL-INTEGRATION-001 — native execution keeps identity, intent and persistence closed

Founder approval on 2026-08-11 resolves the three canonical blockers recorded
by `PRODUCT-INTEGRATION-001` for `L0_LOCAL_NO_FUNDS` implementation only:

1. **Dual-native execution AccountBinding.** An already authenticated Human or
   Agent Actor may prove control of a CAIP-10 execution account and bind it to
   an existing, active Subject relationship. The binding uses one shared
   AccountBinding truth across both entry modes. It never creates or replaces
   IPO.ONE login, session, Tenant, Actor, Role, Subject, PrincipalRelationship,
   Mandate, credit authority or custody. The existing Agent-onboarding binding
   remains a distinct lifecycle and is not silently reinterpreted. Multiple
   accounts are allowed only as separate, readable and revocable bindings with
   exact purpose, chain, account, controller, proof and lifecycle Evidence.
2. **Exact TransferIntent resolver.** A versioned Provider/Venue resolver may
   derive an exact target policy, target, value, calldata/action payload,
   ExpectedEffects and simulation context only from a canonical TransferIntent
   plus authenticated server-side registry and current authority state. A
   browser, SDK, MCP client, Agent or wallet may supply the intent reference,
   but never raw target, calldata or expected effects. Missing, ambiguous,
   unsupported, stale or policy-inconsistent resolution fails closed.
3. **Gateway-owned AECL persistence.** Tenant Command Gateway owns one
   serializable command transaction for authorization revalidation, grant and
   exposure state, exact prepared execution, simulation/preflight decision,
   Event, Evidence, outbox/projection changes and the durable response. AECL
   repositories may participate only through a reviewed in-transaction port or
   Gateway projection plan. A second independent commit is prohibited.

These approvals establish application semantics and local implementation
authority. They do not approve a Provider/Venue, production connector,
credential, signer, custody model, chain/mainnet, contract, risk limit,
deployment, real-value execution or funds movement.

### v1.0 to v1.1 requirement crosswalk

No requirement ID is added, deleted or repurposed. `REQ-ID-004` is explicitly
broadened from the Agent-onboarding proof use case to a dual-native execution
AccountBinding while preserving that onboarding lifecycle as a distinct
subtype. `REQ-EXEC-001`, `REQ-EXEC-002` and `REQ-EVID-002` retain their original
capabilities and gain the exact resolver and single-transaction invariants
above. All other v1.0 requirement IDs and dispositions are unchanged.

### DEC-AGENT-VENUE-EXEC-001 — delegated execution is not Agent custody

Founder direction on 2026-08-14 approves the target architecture for
purpose-bound delegated external venue execution under `REQ-TRADE-005`, while
retaining an explicit runtime gate.

1. An independent wallet-capable economic Agent may use IPO.ONE as a
   `CreditProvider` and an approved external venue through a replaceable
   `ExecutionVenue` adapter. The Agent is not an IPO.ONE-native strategy or
   custody process.
2. The existing shared Subject, PrincipalRelationship, Mandate, Credit Intent,
   Offer, Authorization, Obligation, Facility, Ledger, repayment, servicing,
   Event, Evidence, Credit State and reconciliation kernel remains canonical.
   A Trading Loan, Hyperliquid Loan, Trading Ledger or other parallel economic
   truth is prohibited.
3. `economicAgentWallet`, `capitalController`, `venueApiSigner` and
   `ipoOneSubject` are distinct identities. A financed Agent receives only an
   opaque, purpose-bound execution capability. It receives no controller key,
   venue signer key, arbitrary signing, withdrawal, transfer or residual-release
   authority.
4. The controlled capital account retains custody and repayment/release
   authority under `capitalController`. A Policy Signer may sign only a closed,
   versioned action allowlist after current server-derived venue, account,
   market, notional, leverage, drawdown, expiry, Mandate, Facility, Tenant and
   reconciliation checks. Unknown, stale, ambiguous or unreconciled state
   denies before signing.
5. The first reference venue profile is Hyperliquid Testnet with bounded BTC
   execution. Hyperliquid-specific types and credential semantics remain behind
   the adapter and signer boundary and cannot enter the canonical credit kernel.
6. Repayment and release follow canonical Ledger truth: close, cancel remaining
   orders, reconcile, repay the exact outstanding amount available, then release
   only an entitled residual. Venue balance or HTTP success cannot replace
   canonical settlement truth. Loss and partial repayment remain outstanding
   and adverse rather than being manufactured as settled.
7. `REQ-TRADE-005` grants architecture approval only. L0 deterministic no-funds
   implementation may proceed under current local authority. Each L3 account,
   signer, numerical profile and run requires its own exact approval. L4/L5,
   mainnet, real-value funds, production custody, production credentials and
   automatic promotion remain prohibited.

### v1.1 to v1.2 requirement crosswalk

Product Constitution v1.2 adds only `REQ-TRADE-005` and
`DEC-AGENT-VENUE-EXEC-001`. No v1.1 requirement ID is deleted, repurposed,
downgraded or broadened. `REQ-TRADE-001..004` retain their existing meaning and
gates. The new requirement records a previously missing architecture-approved,
runtime-gated capability for delegated external venue execution; it does not
claim implementation, verification, hosting, testnet execution, real value or
production readiness.

### DEC-M2-SECURED-POOL-001 — one secured testnet Capital Facility

Founder direction on 2026-08-22 approves the target architecture and bounded
implementation sequence for one secured testnet Capital Facility while
retaining explicit runtime and release gates.

1. M2 introduces one curated Base Sepolia WETH/test-USDC overcollateralized
   pool. Public users may participate only through the exact enabled L3 profile.
2. Market, asset, oracle, and risk administration remains governed. No market
   factory, proxy, arbitrary asset, or multi-market path is approved.
3. M2A proves the LP and Human lifecycle before M2B composes Principal-bound
   Hyperliquid Testnet execution.
4. The pool is not the IPO.ONE kernel. It emits authenticated facts mapped by a
   fail-closed adapter to the existing shared Obligation, Ledger, and Evidence
   model.
5. All numerical values before an exact run approval are test fixtures.
6. Testnet passage grants no real-value or mainnet authority. Real-value public
   liquidity requires a future Constitution revision and complete legal,
   custody, capital, risk, oracle, audit, incident, and loss-bearer decision.

### v1.2 to v1.3 requirement crosswalk

No v1.2 requirement ID is deleted, repurposed, downgraded, or broadened.
`REQ-CREDIT-008` and `REQ-TRADE-001` remain shared-kernel Facility requirements;
the ten new rows add pool-specific acceptance. `REQ-EXEC-004` continues to
prohibit arbitrary withdrawal; `REQ-POOL-002` permits only normal withdrawal of
an LP's valid pool claim under liquidity and pause rules. Architecture approval
does not claim implementation, verification, hosting, testnet execution, real
value, or production readiness.

## 8. Explicit current non-goals and gates

The following remain not approved: real Human cash lending; public real-value
LP, Strategy Vault, generic market factory, and any pool outside the exact M2
testnet profile; unrestricted liquidity, withdrawal, or transfer; mainnet;
token/DAO governance; black-box or universal authoritative scoring; raw KYC/PII
onchain; automatic model promotion; uncontrolled Agent borrowing; production
signer/custody; real-value settlement; and self-enabling release profiles.

Contracts, funds movement, custody, risk limits, pricing, permissions, privacy
boundaries, KYC/KYP providers, production dependencies, chain/mainnet selection,
capital sources, legal agreements, external credentials, deployment, and
release-profile changes always require separate named human approval.

## 9. Evidence and change control

Every requirement implementation must be issue-sized and map its exact
requirement ID to context, scope, non-goals, files, acceptance criteria, test
commands, security checks, permission boundary, migration impact, rollback, and
completion Evidence.

An implementation may claim no higher state than its current Evidence proves.
Tests using fixture hosts, mock handlers, process-local services, client storage,
or static catalogs must be labeled accordingly. Current authenticated runtime,
persistence, restart, negative authorization, and external-boundary proof are
required for higher classifications.

Changing this Constitution requires a new version, named decision owner,
effective date, explicit supersession, and a migration/crosswalk for any changed
requirement ID. Existing IDs must not be silently reused for different meaning.

## 10. Governance disposition

Recovery finding `P0-AUTH-001` is resolved at the governance-document level by
this Constitution. It does not resolve `P0-RC-001`, `P0-RUNTIME-001`,
`P0-LOCKBOX-001`, `P0-PUBLIC-001`, or any implementation/runtime finding from
the 2026-08-03 audit.

M1 remains responsible for sealing one exact candidate and synchronizing
machine/human traceability to that commit. The M2 secured-pool capability remains
`BLOCKED — NOT COMPLETE` until issue-sized implementation, current runtime and
deployment Evidence, an explicitly unlocked launch-policy revision, and visible
Human and equivalent Agent verification exist.
