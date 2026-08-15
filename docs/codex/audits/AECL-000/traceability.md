# AECL-000 Product and Architecture Traceability

Date: 2026-08-07

Status: accepted architecture mapping; Phase 1 implementation authorized for
`EVM-WALLET-001` and `SIG-003` only on 2026-08-07

This mapping does not add or change a Product Constitution requirement. The
Founder-supplied AECL v0.1 proposal is a subordinate architecture input. Its
requirements become executable only through separately reviewed issue,
schema, permission, migration, adapter and activation work.

## Product Constitution crosswalk

| Requirement | Existing authority | AECL-000 preservation or proposed refinement | Runtime status after AECL-000 |
| --- | --- | --- | --- |
| `REQ-CORE-001` | one shared Human/Agent obligation kernel | AECL is an execution projection layer and cannot add a wallet, Agent or venue kernel | unchanged |
| `REQ-ID-002` | Agent Subject plus accountable Principal | every wallet/venue grant binds both Subject and Principal | unchanged |
| `REQ-ID-004` | CAIP-10 AccountBinding and wallet proof | reuse CAIP-2/CAIP-10, EIP-712 and ERC-1271; add ERC-6492 parity | Phase 1 local no-funds compatibility implemented; no external verifier or deployment enabled |
| `REQ-ID-005` | Principal-controlled Agent Mandate | a delegated grant is no broader than and cannot outlive current Mandate authority | grant remains absent |
| `REQ-CREDIT-007` | canonical Obligation and schedule | every execution receipt references the existing Obligation; no execution-only obligation | unchanged |
| `REQ-CREDIT-008` | purpose-bound Facility | venue execution is constrained by the existing Facility and accepted Offer | unchanged |
| `REQ-CREDIT-009` | authority-bound CreditLine projection | AECL reserves current capacity but cannot create/increase credit authority | pending-exposure projection remains absent |
| `REQ-EXEC-001` | controlled sandbox execution | proposed prepared execution and mandatory preflight refine the execution control boundary | architecture only |
| `REQ-EXEC-002` | allowlisted Provider spend with caps | proposed target policy adds exact contract/venue action restrictions; Provider controls remain | target policy remains absent |
| `REQ-EXEC-003` | Agent Lockbox revenue/repayment profile | wallet execution cannot bypass Lockbox, repayment, Ledger or Evidence | unchanged |
| `REQ-EXEC-004` | withdrawal and transfer denial | target policies default-deny withdrawal, transfer, bridge and broad approval | unchanged |
| `REQ-PAY-001` | canonical double-entry Ledger | external receipt cannot post or replace Ledger truth | unchanged |
| `REQ-PAY-004` | settlement/performance proof, runtime gated | AECL requires normalized finality, effects and reconciliation before canonical settlement | architecture only; runtime gate unchanged |
| `REQ-EVID-001` | typed portable Event/Evidence | grant, preflight, decision and execution become new typed Evidence inputs, not a new store | schemas remain absent |
| `REQ-EVID-002` | durable event/outbox/projection reconciliation | future AECL persistence reuses the same serializable unit of work and additive correction | unchanged |
| `REQ-EVID-003` | queryable receipts/reports | every allow, step-up, deny, quarantine and execution result must be queryable | AECL receipts remain absent |
| `REQ-EVID-004` | longitudinal factor/outcome record | execution outcomes may become evidenced factors but cannot authorize credit directly | unchanged |
| `REQ-RISK-001` | caps, pause/freeze and dual control | architecture adds scoped adapter/chain/grant controls; permissions and numeric limits remain separately reviewed | architecture only |
| `REQ-RISK-002` | stale/unknown monotonic protection | unknown capability/result, state drift and reconciliation mismatch deny or quarantine new risk | unchanged |
| `REQ-CHAIN-001` | CAIP multi-chain adapter boundary | generic EVM architecture reuses explicit chain registry; compatibility does not enable a chain | unchanged |
| `REQ-CHAIN-002` | finality/reorg-safe Event Indexer | execution receipt consumes normalized finality and additive reorg/correction Evidence | unchanged |
| `REQ-UX-002` | versioned Agent OpenAPI/SDK/MCP journey | proposed wallet/venue operations must have Tenant Protocol, SDK and MCP parity | operations remain absent |
| `REQ-UX-005` | server-derived workspace recovery | prepared execution, grant and next action are server truth; browser state is never authority | unchanged |
| `REQ-TRADE-001` | Trading Capital shared-kernel Facility | HyperCore remains a Venue Adapter over the same Facility/Ledger/Obligation | unchanged |
| `REQ-TRADE-002` | signer-free venue binding/history Evidence | current Hyperliquid Info Adapter remains the read plane; AECL does not add signer authority | unchanged |
| `REQ-TRADE-004` | synthetic Trading Facility/order/risk lifecycle | current offline execution simulation becomes a Venue SPI conformance input only | unchanged; no live write |
| `REQ-PRIV-001` | offchain sensitive-data boundary | keys, raw signatures, credentials, PII and sensitive strategies remain outside durable/public Evidence | unchanged |
| `REQ-AUTO-001` | queryable fail-closed automation | preflight may prepare/evaluate; exact A3/A4 execution or step-up still requires current authority | architecture only |

## Accepted ADR crosswalk

| ADR | Relationship to ADR-038 | Conflict resolution |
| --- | --- | --- |
| ADR-009 | canonical Kernel remains Identity + Mandate + Payment + Obligation + Evidence | ADR-038 adds execution projections only |
| ADR-010 | Ledger is monetary truth | wallet/venue results cannot become independent monetary truth |
| ADR-011 | provider integration is data-only/remote and explicitly reviewed | AECL adapters remain injected, versioned ports; no dynamic third-party code |
| ADR-012 | TransferIntent/SettlementReceipt provide the shared Rail lifecycle | AECL prepares/submits exact external actions and then reconciles into existing Rail/Ledger truth |
| ADR-013 | PostgreSQL event runtime and transactional outbox | future AECL durable writes reuse the same pattern |
| ADR-015 | multi-aggregate command unit of work | pending exposure, grant/execution state, Event/Evidence and response commit atomically |
| ADR-016 | reconciliation is additive and repair is approval-gated | unknown or divergent execution quarantines and reconciles; history is not rewritten |
| ADR-017 | Tenant RLS and immutable ownership | all future grants, policies and receipts are Tenant-scoped |
| ADR-018 | authentication does not grant protocol authority | workload proof and wallet/venue signing identity remain separate |
| ADR-019 | deny-by-default AuthZ and live-state checks | AuthZ `ALLOW` is only a prerequisite; separate AECL decision may still step up, deny or quarantine |
| ADR-020 | protected mutations require durable dual control | AECL `STEP_UP` must bind the exact approved execution and cannot override hard deny |
| ADR-022 | authenticated Tenant command transaction | every AECL operation routes through the existing Gateway |
| ADR-025 | one closed versioned Tenant Protocol | wallet/venue operation families extend that protocol rather than adding a side channel |
| ADR-029 | provider-neutral chain/finality adapter | AECL reuses explicit chain profiles and normalized finality; no all-EVM enablement |
| ADR-031 | thin Human HTTP and Agent MCP adapters | no transport-specific AECL business logic or authority |
| ADR-034 | Trading Capital is one shared-kernel Facility with maturity gates | Venue SPI preserves Facility and all TC gates |
| ADR-035 | Hyperliquid read/write, signer/custody/action/nonce separation | HyperCore mapping adopts master/API-wallet identity split, fresh delegates, closed actions and no blind retry |
| ADR-036 | Evidence-derived factors, freshness and conservative risk state | stale/unknown external truth blocks new risk and cannot restore permission |
| ADR-037 | settlement authority and incident recovery | writer cannot declare settlement; Gateway/Ledger/Evidence reconciliation remains canonical |

ADR-038 does not supersede an accepted ADR. If accepted, it supplies the
execution-compatibility decision within those existing boundaries.

## AECL proposal to follow-up issue crosswalk

| Proposal section | Deliverable | Owning issue | Gate |
| --- | --- | --- | --- |
| 4, 13.1 | common EVM connector and capability contract | `EVM-WALLET-001` | local no-funds implementation complete; Founder review before Phase 2 |
| 4.1, 17 Phase 1 | EIP-712/1271/6492 parity | `SIG-003` | local no-funds implementation complete; external verifier/deployment still gated |
| 7.1–7.2, 15 | grant, target policy, pending exposure, scoped controls | `EXEC-001` | permission/data review after Phase 1 |
| 7.3–7.4, 8–10 | exact payload, preflight, decision, submission and receipt | `EXEC-002` | risk/security review after EXEC-001 |
| 12 | OpenAPI/SDK/MCP parity | `EXEC-003` | transport/security review after EXEC-002 |
| 13.2, 17 Phase 3 | Agentic Wallet Provider SPI | `AGENTWALLET-001` | provider-neutral SPI review |
| 14 | individual MetaMask / OKX / other adapters | one issue per adapter | provider/dependency/credential review |
| 6, 17 Phase 4 | HyperCore Venue Execution Adapter | `HYPERLIQUID-002` | Testnet signer/custody/action/risk review |
| 6.1 | HyperEVM Chain Adapter profile | `HYPERLIQUID-EVM-001` | separate chain-profile approval |

## Claim boundary

After the approved Phase 1 implementation, the justified claim is:

> IPO.ONE has a repository-traceable Agentic Execution Compatibility
> architecture, a closed local no-funds EVM wallet connector, and bounded
> EOA/ERC-1271/ERC-6492 verification compatibility.

It is not justified to claim that arbitrary EVM wallet/chain compatibility,
delegated wallet grants, transaction preflight or submission, a selected
ERC-6492 offchain validator, Agentic Wallet providers, Hyperliquid Testnet
execution, hosting, real value, or production is implemented or approved.
