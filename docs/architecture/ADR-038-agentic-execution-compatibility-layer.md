# ADR-038: Agentic Execution Compatibility Layer

Status: Accepted by Founder on 2026-08-07; subsequent named L0 local no-funds
implementation authority covers `EVM-WALLET-001`, `SIG-003`, `EXEC-001`,
`EXEC-002`, `EXEC-003` and the vendor-neutral `AGENTWALLET-001` foundation; no
vendor activation, production, external execution or funds authority. The
disabled local `METAMASK-AGENT-001` and `OKX-AGENT-001` reference adapters are
implemented. On 2026-08-08 the Founder authorized `HYPERLIQUID-002` and Phase 4
to start. The local/offline Venue SPI, HyperCore identity/delegate/action/signing
projection and Tenant Gateway transport family are implemented. The bounded
HyperCore Testnet proof was subsequently completed with one exact order and one
separately approved exact cancel; both intents are reconciled and closed and the
local signer is retired. This is `VERIFIED_TESTNET_CLOSED`, not production,
mainnet, deployment or real-value authority.

On 2026-08-11 the Founder additionally approved the three
`PRODUCT-INTEGRATION-001` application contracts in
`DEC-AECL-INTEGRATION-001`: dual-native execution AccountBinding, the exact
TransferIntent resolver, and Tenant Command Gateway atomic persistence
ownership. This approval is limited to `L0_LOCAL_NO_FUNDS` implementation and
does not activate any external provider, deployment, credential, signer,
custody, real-value path or production mode.

Date: 2026-08-07

Decision owner: IPO.ONE Founder

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Context

IPO.ONE must support standards-compatible EVM wallets, smart accounts,
delegated agentic wallets, and venue execution without making any wallet,
chain, account vendor, or venue part of canonical credit authority.

The repository already has reusable boundaries: Subject and Principal,
Mandate v3, SpendPolicy, CreditLine, Offer, Obligation, TransferIntent,
SettlementReceipt, Ledger, Event, Evidence, the Tenant Command Gateway,
CAIP-2/CAIP-10 chain and account normalization, EIP-6963 discovery,
WalletConnect, EIP-712 proof, ERC-1271 verification, finality/reorg indexing,
Evidence anchoring, Hyperliquid read Evidence, and an offline simulation-only
Hyperliquid writer model.

Those pieces do not yet provide one execution-control architecture. In
particular, there is no capability-negotiated connector SPI, counterfactual
signature verification, canonical delegated grant projection, exact target
policy, mandatory simulation receipt, four-state execution decision, or
normalized wallet/venue execution receipt. A raw zero-value transaction method
also remains exposed at the WalletConnect facade, and the Agent MCP account
proof tool still assumes every signature is 65 bytes.

The controlling proposal for AECL-000 is
`IPO_ONE_AGENTIC_EXECUTION_COMPATIBILITY_LAYER_v0.1.md`, SHA-256
`f044b094f83b7f3b7a4ab3264a6863fc9e565cfa39b1fb39d070d67269f34a18`.
It is subordinate to the Product Constitution and accepted ADRs. It grants no
production, funds, custody, signer, chain, venue, limit, permission, or
deployment authority.

## Decision

IPO.ONE adopts the **Agentic Execution Compatibility Layer (AECL)** as an
application/integration control boundary between canonical economic authority
and replaceable external execution providers.

```text
Human Web / Agent OpenAPI / SDK / MCP
                  |
      Authenticated Tenant Protocol
                  |
      Tenant Command Gateway + AuthZ
                  |
   Canonical Kernel / Ledger / Evidence
                  |
     AECL projection + preflight gate
       /             |              \
EVM Wallet SPI  Agentic Wallet SPI  Venue SPI
       \             |              /
       replaceable external execution providers
```

The boundary has four non-negotiable truths:

1. The Kernel is the sole economic and authority truth.
2. AECL may project and further restrict authority; it cannot create or widen
   authority.
3. Wallets and venues sign or execute only an exact IPO.ONE-prepared action
   that has a fresh, hash-bound preflight decision.
4. Ledger plus reconciled Evidence remains canonical execution history; wallet
   or venue acknowledgement alone is never settlement truth.

### 1. Authority and object classification

No new credit authority is introduced. The following existing objects remain
canonical:

- Subject and accountable Principal;
- Consent or Mandate;
- deterministic policy and Authorization decision;
- Capital Partner Offer;
- Obligation, Facility and CreditLine capacity projection;
- SpendPolicy and live risk state;
- TransferIntent and SettlementReceipt;
- double-entry Ledger;
- Event, Evidence and reconciliation truth.

AECL adds only execution projections and receipts:

| Object | Classification | Authority rule |
| --- | --- | --- |
| `DelegatedWalletGrant` | Tenant-scoped execution projection | creation-time Authorization is Evidence only; every use rechecks current canonical authority |
| `ExecutionTargetPolicy` | versioned execution-control policy | may narrow targets/actions/effects; cannot add a Mandate capability, asset, limit, purpose, Provider, venue, chain or recipient |
| `TransactionPreflightReceipt` | immutable decision Evidence | authorizes nothing after expiry or exact-payload/context drift |
| `WalletExecutionReceipt` | immutable normalized execution/reconciliation Evidence | external success cannot directly mutate Ledger, Obligation or settlement truth |

`DelegatedWalletGrant` and `ExecutionTargetPolicy` belong to the AECL execution
domain, not the shared credit kernel. They reference kernel objects by immutable
ID and hash. They must not be copied into wallet-vendor-specific tables or
business models.

### 2. Effective permission invariant

For every external wallet or venue permission:

```text
EffectiveExternalPermission
  <= live DelegatedWalletGrant
  <= current Mandate + SpendPolicy + accepted Offer/Obligation/Facility
  <= current Tenant AuthZ + risk/chain/adapter policy
```

The external provider may compile a stricter permission. It may never widen
the canonical envelope. Unknown or unprovable provider semantics produce a
structured mismatch, not a broader fallback.

A grant becomes unusable when any referenced authority is revoked, expired,
superseded, frozen, paused, changed, unknown, stale, or unreconciled. Grant
status is closed to:

```text
prepared -> active -> revoked | expired | quarantined
```

Only a separately authorized activation command may move `prepared` to
`active`. No transition leaves `revoked` or `expired`. A quarantined grant
requires a new reviewed projection or an exact, evidenced recovery operation;
time alone cannot restore it.

### 3. Three independent SPIs

AECL defines three versioned service-provider interfaces. A provider may
implement more than one interface, but the contracts and authority remain
independent.

#### EVM Wallet Connector SPI

```text
descriptor
discoverProviders
connect
getAccounts
getChain
getCapabilities
signTypedData
submitPreparedExecution
subscribeAccountChanges
subscribeChainChanges
disconnect
```

This SPI owns browser/mobile transport normalization only. It never accepts a
caller-authored raw transaction or arbitrary calldata. Provider-native
`request`, `eth_sendTransaction`, `wallet_sendCalls`, UserOperation, or similar
methods may exist inside an adapter implementation, but are not application or
Agent interfaces.

#### Delegated Agentic Wallet Provider SPI

```text
descriptor
discoverCapabilities
prepareGrant
activateGrant
readGrant
revokeGrant
preflight
submit
readExecution
requestHumanStepUp
```

The SPI consumes a canonical grant projection and a prepared execution. It
cannot accept a new limit, target, capability, or economic term that is absent
from the canonical input.

#### Venue Execution SPI

```text
descriptor
bindAccount
prepareDelegate
activateDelegate
revokeDelegate
readRiskSnapshot
validateAction
submitAction
readAction
readAccountState
```

Venue-specific account, delegate, nonce, action, and failure semantics remain
behind this SPI. Venue results normalize into the same AECL decision, receipt,
Evidence, unknown-outcome, and reconciliation vocabulary.

Every SPI descriptor and result is closed, versioned, JSON-safe, observable,
capability-scoped, explicitly enabled, independently pausable, and
replaceable. No adapter code is dynamically loaded into the trust boundary;
ADR-011 remains in force.

### 4. Standards-first capability contract

The first EVM capability schema must express, at minimum:

```text
walletTransport:
  eip1193 | walletconnect | vendor | none
accountType:
  eoa | contract | counterfactual | delegated | unknown
signatures:
  eip712 | erc1271 | erc6492
calls:
  single | batch | atomicBatch
delegation:
  erc7715 | erc7710 | vendorNative | none
accountAbstraction:
  eip7702 | erc4337 | vendorNative | none
humanStepUp:
  wallet | mobile | email | external | none
walletSimulation:
  supported | unsupported | unknown
walletThreatScreening:
  supported | unsupported | unknown
```

Capability discovery is descriptive and non-authorizing. A missing, malformed,
changed, unsupported, or `unknown` capability never enables an operation and
never silently selects a less restricted path. Batch and atomic behavior are
used only when positively discovered and compatible with the exact prepared
execution.

The code remains EVM-generic while chain enablement remains an explicit
versioned policy. Wallet support for a chain does not add the chain to
IPO.ONE's enabled registry.

### 5. Signature compatibility boundary

The verifier must support EIP-712 EOA, ERC-1271 contract-account, and ERC-6492
counterfactual-account proof without trusting caller-declared wallet type.

- raw signatures are bounded transient input, never durable product truth;
- the verifier derives or proves the verification method and records its exact
  type in a hash-only receipt;
- every OpenAPI, Tenant Protocol, SDK and MCP surface accepts the same bounded
  signature envelope and rejects oversized, malformed, ambiguous, unsupported,
  or context-mismatched values;
- an upper transport must not assume a 65-byte signature;
- counterfactual validation cannot deploy an account, send a transaction, or
  enable a chain;
- authentication eligibility remains distinct from cryptographic validity and
  continues to respect chain finality policy.

### 6. Prepared execution and mandatory preflight

An Agent or browser supplies economic intent only. The Tenant Gateway resolves
the current canonical objects and asks AECL to build a closed
`PreparedExecution`. The object binds:

- Tenant, Actor, Subject, Principal and account references;
- Mandate, SpendPolicy, Authorization, Offer/Obligation/Facility and policy
  hashes/versions;
- grant and target-policy IDs/hashes;
- exact chain or venue environment;
- exact target/action, selector, calldata/call bundle or venue action;
- exact asset, amount, native value, token allowance and expected effects;
- idempotency, correlation, execution ID, session epoch and expiry.

Before any signing or submission, one serializable Tenant command transaction
must reserve pending exposure against every applicable per-action, rolling,
aggregate, Obligation, Provider/venue, asset, chain, Tenant and global ceiling.
Concurrent requests cannot observe the same unreserved capacity.

The preflight service then:

1. revalidates current authority, grant, target policy, chain/venue profile,
   adapter status and session epoch;
2. snapshots target code and proxy implementation or venue account/risk state;
3. simulates the exact transaction, call bundle, or venue action;
4. derives native, asset, allowance, position and exposure changes;
5. compares simulated effects to expected effects;
6. incorporates bounded threat/provider checks where available;
7. emits one immutable `TransactionPreflightReceipt` with a short expiry and
   exact payload/context hash; and
8. returns exactly one execution decision.

No external submission occurs in the same conceptual step as intent parsing.
The preflight implementation may be locally composed, but it must remain a
separate testable port from wallet/venue submission.

### 7. Execution decision contract

The AECL execution decision is distinct from the Tenant authorization decision
and is closed to:

```text
ALLOW | STEP_UP | DENY | QUARANTINE
```

- `ALLOW`: every current canonical check and exact preflight passes.
- `STEP_UP`: the action remains within immutable capital/lender hard bounds but
  requires the configured Human or dual-control approval. No submission may
  occur until an exact, current approval artifact is bound.
- `DENY`: a hard authority, limit, asset, target, venue, chain, jurisdiction,
  security, or policy rule fails. No Human popup or approval can override it.
- `QUARANTINE`: exact approved identity or effect cannot be proven due to code,
  proxy, simulation, permission, signer/account, state, finality, or
  reconciliation drift.

Every material result, including denial and quarantine, is queryable Evidence.
`STEP_UP` is not an allow result and cannot reserve authority indefinitely.

### 8. Exact approval and submission binding

Submission accepts only a current prepared execution plus its matching
preflight receipt and, where required, the exact approval artifact. It rechecks
at least:

- exact payload hash;
- preflight hash and expiry;
- grant status, hash, nonce and session epoch;
- target policy hash and code/proxy or venue snapshot identity;
- current account, chain, adapter, venue and signer binding;
- current Mandate, policy, freeze/pause and reconciliation state;
- pending-exposure reservation ownership; and
- approval command hash for `STEP_UP`.

Any mismatch denies or quarantines before invoking the adapter. The adapter
cannot receive an alternate payload under an approved hash.

Unknown submission status is durable and blocks blind retry. Reconciliation
reads the external transaction/UserOperation/order/account state using the
same account and environment binding. Idempotent replay returns the existing
execution record and cannot create a second canonical economic effect.

### 9. Target and effect safety

EVM target policy must be default-deny and may admit only an exact combination
of chain, target address, code hash, proxy implementation hash, selector,
native-value ceiling, token spender, allowance ceiling and approval mode.

The following remain denied unless a future exact policy and review explicitly
admits a narrower action:

- unlimited ERC-20 approval;
- `setApprovalForAll`;
- broad permit-style spending authority;
- arbitrary `delegatecall`;
- wallet owner, module or implementation upgrades;
- bridges;
- unrestricted withdrawal or transfer;
- arbitrary recipient transfer; and
- unknown selector, target, code, proxy or effect.

`value = 0` is not a safety classification. Token approvals, delegated
authority, contract ownership and venue actions can be financially material
without native-value transfer.

Venue target policy is equally closed and binds venue, account, market, action
class, notional, position, leverage and reduce-only rules. Withdrawal and
transfer are `false` by default.

### 10. Public operation family and parity

The following canonical operation family is reserved for the existing Tenant
Protocol:

```text
walletDiscoverCapabilities
walletReadGrant
walletPrepareGrant
walletActivateGrant
walletRevokeGrant
walletPrepareExecution
walletApproveExecution
walletSubmitExecution
walletReadExecution

venueDiscoverCapabilities
venueReadBinding
venuePrepareDelegate
venueActivateDelegate
venueRevokeDelegate
venuePrepareExecution
venueSubmitExecution
venueReadExecution
```

Exact availability is controlled by versioned catalog entries, authentication,
AuthZ, handler registration, feature/permission gates and deployment profile.
Catalog presence grants no authority.

Human Web, OpenAPI, TypeScript SDK, MCP/A2A, workers and adapters use the same
operation semantics. Transport adapters may narrow their exposed operation
set, but no transport may add business logic, authorization, or a hidden
capability.

### 11. Persistence and transaction boundary

Future execution projections and receipts must reuse ADR-013, ADR-015,
ADR-016, ADR-017 and ADR-022:

- PostgreSQL remains canonical durable truth;
- every row is Tenant-scoped with forced RLS and immutable ownership;
- a stateful command is one serializable transaction over authorization audit,
  current revalidation, grant/execution state, pending exposure, Event,
  Evidence, outbox, projection snapshot and durable response;
- command and external submission identities are idempotent and hash-bound;
- immutable receipts and transitions are append-only;
- correction is additive and cannot rewrite prior external or Ledger truth;
- reconciliation never trusts browser state, adapter acknowledgement or venue
  balance as canonical economic truth.

Exact tables and migration numbers are deferred to EXEC-001 and EXEC-002. No
new database, queue, service framework or production dependency is approved.

### 12. Failure isolation and protective controls

AECL requires these independently queryable controls:

```text
globalExecutionPause
walletAdapterPause(adapterId)
venueAdapterPause(venueId)
chainPause(chainId)
subjectFreeze(subjectId)
grantRevoke(grantId)
```

This ADR defines the control shape but does not grant permission to operate or
change any control. Existing Subject freeze and Trading Capital protection are
reused. New global, adapter, chain and grant controls require their own
permission review before implementation.

An adapter failure cannot mutate CreditLine, Obligation, Ledger or settlement
state without authenticated normalized Evidence. Account, chain, provider,
grant, permission, signer, policy-version or adapter-state change invalidates
stale prepared work. Protective automation may stop new risk; it cannot
unfreeze, increase limits, restore a grant, or declare reconciliation complete.

### 13. Evidence and privacy

Every material execution record must bind, by ID/hash and version where
applicable:

- Subject, Principal, Agent and AccountBinding;
- Mandate and SpendPolicy;
- accepted Offer, CreditLine/exposure, Obligation and Facility;
- Authorization decision;
- DelegatedWalletGrant and ExecutionTargetPolicy;
- preflight, expected/simulated effects and Human approval;
- external permission and exact payload/action;
- transaction, UserOperation or venue action reference;
- finality/result, actual effects, Ledger transaction, reconciliation and
  correction lineage.

The existing Evidence model and Evidence Anchor Registry remain the only
Evidence truth. Public/onchain Evidence must not contain root keys, session
private keys, raw credentials, raw signatures, raw KYC/PII, private lender
policy or sensitive strategy payloads.

### 14. Hyperliquid model

Hyperliquid remains two integrations:

1. **HyperEVM** may be added only as a normal versioned EVM chain profile
   behind the Chain Adapter and all EVM preflight/target/finality rules. Generic
   architecture does not enable it.
2. **HyperCore** is a Venue Execution Adapter with its own account, delegate,
   signing, nonce, action and reconciliation semantics.

For HyperCore:

- master/subaccount address is canonical venue account identity;
- API-wallet address is delegated signing identity only;
- signer-free Info reads use the master/subaccount, never the API wallet;
- each approved Facility/environment receives a fresh delegate;
- deregistered, expired, compromised or retired API-wallet addresses are never
  reused;
- provisioning, activation, revocation and rotation remain separate protected
  actions;
- first execution scope is order/cancel/modify and server-proven reduce-only
  protection only;
- withdrawal, transfer, leverage/account-mode change, arbitrary action and
  mainnet remain denied;
- unknown outcome blocks new risk and is reconciled without resubmission.

The current offline Hyperliquid simulation modules are reusable conformance
fixtures, not live-Testnet or production execution Evidence. `approveAgent`,
keys, official signing, Exchange network transport and any Testnet write remain
separately gated.

## Security invariants

1. Principal root authority, Agent workload authentication key and delegated
   wallet/venue session signer are distinct identities and trust domains.
2. Root or session private material is never exposed to an LLM, browser log,
   normal application process, public Evidence or fixture.
3. Every external permission is no broader than live canonical authority.
4. No unsupported capability silently downgrades into a broader session or raw
   transaction.
5. Intent is caller input; exact executable payload is server-created.
6. No signing/submission occurs without fresh exact preflight and current
   reservation.
7. `DENY` cannot be overridden by Human approval.
8. Code, proxy, simulation, permission, account, chain, signer or state drift
   quarantines exact prepared work.
9. Pending exposure is counted before finality and concurrent requests cannot
   overrun a ceiling.
10. Unknown external outcome is never treated as failure and never blindly
    retried.
11. Wallet/venue result cannot directly become Ledger, Obligation or settlement
    truth.
12. All adapters are versioned, enabled explicitly, independently pausable,
    observable, replaceable and fail-closed.
13. Vendor identity remains outside canonical credit semantics.
14. Chain compatibility never implies chain enablement.
15. Withdrawal, unrestricted transfer and broad approval remain default-deny.

## Consequences

Positive consequences:

- standards-compatible wallets can share one connector and conformance model;
- smart and counterfactual accounts can be supported without EOA-only upper
  contracts;
- Agentic wallet permissions remain projections of IPO.ONE authority;
- wallet and venue execution share decision, preflight, Evidence and unknown
  outcome semantics without sharing vendor-specific protocols;
- Hyperliquid can evolve without becoming a wallet or a second economic kernel;
- provider failure or replacement does not rewrite credit semantics.

Costs and constraints:

- every execution requires additional persistence, simulation, effect parsing,
  reservation and reconciliation work;
- upper transport schemas must change in lockstep;
- existing raw wallet submission surfaces must be migrated before they can
  claim AECL conformance;
- provider-specific capabilities still require isolated adapters and their own
  review;
- some actions will produce `STEP_UP` or `QUARANTINE` even when a wallet could
  technically submit them.

## Alternatives rejected

- **Wallet Compatibility Gateway:** rejected as too narrow because delegated
  wallets and venues have different account, permission, nonce and result
  semantics.
- **Wallet-specific Kernel objects:** rejected because a vendor would become
  credit authority and replacement would require a kernel rewrite.
- **Hyperliquid as an EVM wallet:** rejected because HyperCore is not an EVM
  wallet transport and its API-wallet identity is not account identity.
- **Wallet popup as approval:** rejected because wallet consent cannot override
  canonical hard policy or prove expected effects.
- **Raw transaction allowlist by native value:** rejected because zero-value
  calls can change token allowances, modules, owners or delegated authority.
- **One generic execution passthrough:** rejected because caller-authored raw
  actions and new provider methods could become implicitly allowed.
- **Provider capability fallback:** rejected because unsupported advanced
  permission cannot safely become an unrestricted session key or raw send.
- **External receipt as settlement:** rejected because wallet/venue success
  lacks canonical Ledger, Obligation, finality and reconciliation truth.
- **Second execution Ledger/Evidence store:** rejected because it would fork
  canonical economic and audit truth.

## Migration impact

AECL-000 has no runtime or data migration.

Future migration order is:

1. place injected and WalletConnect providers behind the common connector SPI
   and remove generic raw-send exposure;
2. complete EOA/ERC-1271/ERC-6492 signature parity across Tenant Protocol, SDK
   and MCP;
3. add Tenant-scoped grant, target-policy and pending-exposure projections;
4. add prepared execution, preflight and execution receipt state machines;
5. expose the canonical operation family through the existing protocol;
6. migrate the Evidence-anchor wallet path to prepared submission without
   changing its separately approved testnet scope;
7. only then add provider adapters and later a separately approved Hyperliquid
   Testnet execution adapter.

Every step requires its own issue contract, migration impact, rollback,
security checks and current Evidence. Compatibility migrations cannot activate
new chains, signers, credentials, venues or funds.

## Rollback

Before acceptance, rollback is deletion of this proposed ADR and the AECL-000
documentation artifacts. Runtime is unaffected.

After future implementations, rollback must:

- disable the affected adapter and new-execution admission;
- revoke or expire grants through the separately authorized path;
- retain pending, submitted and unknown execution records;
- reconcile external effects without resubmission;
- preserve all Event, Evidence and Ledger history;
- restore the last accepted connector/protocol version only when no execution
  identity or external effect is lost; and
- leave root authority, custody, withdrawals and capital untouched.

Rollback must never delete an unknown external outcome, reuse a retired signer,
rewrite Ledger history, or fall back to raw transaction submission.

## Explicitly unresolved and separately reviewed

- exact schema fields and state-machine versions for grants, target policies,
  preflight and execution receipts;
- exact `STEP_UP` approval policy, approver roles, lifetime and dual-control
  requirements;
- target-policy authoring and approval roles;
- EVM simulation provider/runtime, supported trace methods, block freshness and
  effect-extraction algorithm;
- proxy recognition and code-hash policy for each approved target;
- allowance/permit thresholds and any narrowly admitted approval mode;
- exact EIP-5792, ERC-7715, ERC-7710, EIP-7702, ERC-4337 and ERC-6492 support
  profile and conformance fixtures;
- external permission lifetime, session epoch and revocation observation SLO;
- pending exposure dimensions, numeric ceilings and release policy;
- adapter/global/chain/grant pause permissions and operational owners;
- the Evidence-anchor migration policy and whether every zero-value registry
  write requires full effect simulation at L0/L3;
- any MetaMask, OKX, Base, Circle, Safe, institutional or other provider
  adapter;
- Hyperliquid API-wallet provisioning, custody, official signing, endpoint,
  account, market, numeric limits, Testnet write plan and operators;
- HyperEVM chain enablement;
- production dependencies, credentials, hosting, mainnet, capital and real
  value.

## Phase 4 local implementation checkpoint

`HYPERLIQUID-002` now has a repository-local, no-funds implementation in
`modules/hypercore-venue-adapter`:

- the eight-operation Venue Execution Provider SPI is closed, versioned and
  capability-bound;
- master/subaccount account identity remains distinct from the API-wallet
  signing identity and signer-free Info queries reject the API wallet;
- delegate preparation, simulated activation, terminal revocation/expiry/
  compromise/retirement and fresh-address rotation are modeled hash-only;
- terminal API-wallet addresses are tombstoned and cannot be reused after
  restart;
- `l1_action` and `user_signed_action` remain explicit, non-interchangeable
  signing-request schemes; the live official digest/signer is not composed;
- exact HyperCore wire projections exist only for order, server-proven
  reduce-only order, cancel, cancel-by-cloid and modify;
- withdrawal, transfer, leverage/account-mode, `approveAgent`, raw and unknown
  actions fail before signing/submission;
- existing TC-201/301/302/303 Info, nonce, risk and reconciliation records can
  compose into one fresh hash-only HyperCore Evidence bundle; and
- the Tenant Command Gateway handler family exists but is not added to active
  catalog/AuthZ role bundles, because that would be a permission change beyond
  this local implementation authority. Activation, external deregistration and
  submission guards always deny in the L0 profile.

This checkpoint is implementation Evidence only. It is not API-wallet
provisioning, Hyperliquid registration, official signing conformance, a Testnet
write, Testnet proof, production readiness or real-value authority.

## Phase 4 local transport-parity checkpoint

Following separate Founder approval on 2026-08-08, `HYPERLIQUID-002A` activates
the eight Venue operations on the local/no-funds permission surface. Tenant
Protocol, AuthZ, abuse control, Gateway, OpenAPI, TypeScript SDK, local MCP and
conformance fixtures use the same operation IDs and the same Gateway business
boundary. Delegate administration is Human Principal Controller plus recent
MFA only; Agent Runtime receives no delegate administration capability.

This transport checkpoint does not compose a live Hyperliquid application.
`approveAgent`, external deregistration and Exchange submission remain hard
disabled, and every operation remains private with `fundsAuthority=false`.
Remote MCP/A2A, credentials, official signing, external requests, Testnet
writes, deployment and real value remain outside the approval.

## Phase 4 durable persistence checkpoint

Following separate Founder approval on 2026-08-08, `HYPERLIQUID-002B` adds
migration `0057_hypercore_delegate_persistence` and one Tenant-scoped
PostgreSQL repository for hash-only HyperCore account bindings, API-wallet
delegate lifecycle records and immutable terminal address tombstones. Forced
RLS, tenant-context guards, same-Tenant composite foreign keys, optimistic
hash/version checks, address uniqueness and deferred delegate/tombstone
constraints preserve fail-closed restart and concurrency behavior.

The local private-pilot Gateway composes capability discovery, durable binding
reads and hash-only delegate preparation. Production composition remains
unchanged. Activation, external deregistration, official signing, Exchange
submission and execution reads remain hard disabled. The down migration refuses
to remove the schema while binding, delegate or tombstone Evidence exists.

This checkpoint is `VERIFIED_SANDBOX` local persistence Evidence only. It is
not an external account binding, API-wallet provisioning, `approveAgent`,
credential or signer custody, a Hyperliquid request, Testnet proof, deployment,
production readiness or funds authority.

## Phase 4 Testnet signing-readiness checkpoint

Following explicit Founder authorization on 2026-08-08,
`HYPERLIQUID-002C` implements the closed Testnet signing and proof control
plane:

- exact official-reference MessagePack action hashing and Testnet L1 EIP-712
  construction match the published Python SDK vectors;
- Testnet `approveAgent` is a separate user-signed construction and cannot
  enter the L1 Exchange execution transport;
- an isolated non-exporting typed-data signer port rejects raw-key injection
  and signer-identity drift;
- the proof policy is fixed to BTC perpetual, asset index `3`, `szDecimals=5`,
  an exact `10` Testnet-USDC ALO order, one open order, three total
  submissions, thirty-second request authority and a fifteen-minute proof
  window;
- fixed-origin Exchange transport is one-shot, no-redirect, no-retry and maps
  timeout, invalid, oversized or ambiguous outcomes to `UNKNOWN` plus required
  reconciliation; and
- live signer-free `/info` metadata was observed and retained only as a reduced
  hash-bound artifact. No `/exchange` write occurred.

The write preflight stopped as designed. The repository has no reviewed
Testnet master/subaccount, durable binding for that account, approved fresh API
wallet, isolated signer handoff or one-use human confirmation. More
importantly, migration `0057` records delegate truth but does not provide the
durable single-use authorization, signed-attempt, submitting, terminal and
`UNKNOWN` state machine needed to survive a crash without replay. The existing
simulation-only tables will not be weakened or relabeled to satisfy this gate.

This checkpoint is `IMPLEMENTED_UNVERIFIED — BLOCKED BEFORE TESTNET WRITE`. It
is not `approveAgent`, a qualified external account, signer custody, a Testnet
order, Testnet proof, deployment, production, mainnet or real-value authority.

The next implementation slice is `HYPERLIQUID-002D`: a separately reviewed
durable single-use Testnet submission store and non-logging account/signer
handoff.

## Phase 4 durable Testnet pre-write checkpoint

Following explicit Founder authorization on 2026-08-08,
`HYPERLIQUID-002D` adds migration
`0058_hypercore_testnet_submission_closure` and a closed execution service over
the existing 002C signer and Exchange ports:

- one canonical economic action and idempotency hash identify one durable
  attempt, while an advisory transaction lock makes concurrent duplicate
  preparation converge;
- one short-lived Founder approval, authorization, nonce, request-body hash and
  signature hash are consumed atomically before any Exchange network I/O;
- attempts move only through `PREPARED`, `APPROVED`, `SUBMITTING`, one of
  `SUBMITTED`/`REJECTED`/`UNKNOWN`, `RECONCILED`, and `CLOSED`;
- a crash, timeout, lost response or post-remote persistence failure after
  claim cannot restore retry authority and recovers only to `UNKNOWN`;
- master/subaccount and API-wallet identities remain distinct and durable
  records contain hashes/references only; private keys, raw signatures, raw
  responses and raw addresses are not accepted as stored truth;
- forced RLS, append-only transitions, one-use approval rows, monotonic nonces,
  terminal tombstones and a populated-down guard preserve the lifecycle across
  restarts; and
- the pre-write runner queries exact PostgreSQL truth and cannot authorize a
  write from environment assertions alone.

This checkpoint is local pre-write implementation Evidence, not a Hyperliquid
Testnet execution. No qualified external master/subaccount, fresh API wallet or
isolated signer handoff was supplied, and the prior metadata observation is no
longer fresh. Preflight therefore remains `BLOCKED`; no signing or `/exchange`
write occurred. `HYPERLIQUID-002D` and the parent `HYPERLIQUID-002` remain
`IMPLEMENTED_UNVERIFIED` until the same issue receives those exact inputs, stops
for the exact Founder approval, performs one bounded proof, reconciles external
truth with Ledger/Evidence, and retires the signer.

## Next issue scope after review

### `EVM-WALLET-001 — Standards-First EVM Wallet Connector`

Exact proposed scope:

- introduce a vendor-neutral connector SPI and closed descriptor/capability
  schema;
- adapt current EIP-6963 injected and WalletConnect paths to the same SPI;
- normalize EIP-1193 account/chain/signing requests, results and events;
- add capability discovery with unknown-as-non-permissive semantics;
- preserve the exact Base Sepolia/X Layer registry and explicit provider
  selection;
- invalidate stale prepared work on provider/account/chain/disconnect change;
- remove generic raw `eth_sendTransaction` from the connector surface and add
  a non-functional `submitPreparedExecution` port that rejects until EXEC-002
  supplies a valid prepared/preflight contract;
- add injected/remote conformance, downgrade denial and invalidation tests;
- add no vendor adapter, grant, simulation, contract, migration, chain,
  credential, external call, or funds authority.

### `SIG-003 — Universal EVM Signature Compatibility`

Exact proposed scope:

- retain current EIP-712 EOA and ERC-1271 verifier behavior;
- add bounded ERC-6492 counterfactual verification without deployment or
  transaction submission;
- define one closed signature input/result contract and exact type receipt;
- remove the Agent MCP 65-byte-only assumption and align Tenant Protocol,
  OpenAPI where applicable, TypeScript declarations, SDK and MCP;
- retain maximum signature size, malformed/oversized/unsupported denial,
  chain-finality eligibility and hash-only durable truth;
- add positive/negative conformance for EOA, ERC-1271 magic value, ERC-6492,
  transport parity and raw-signature non-persistence;
- add no wallet permission, connector submission, chain, contract deployment,
  credential, signer custody, external execution, or funds authority.

## Review gate

The Founder accepted this ADR on 2026-08-07, later accepted the Phase 1 and
Phase 2 Evidence, authorized Phase 3, and on 2026-08-08 authorized
`HYPERLIQUID-002` and Phase 4 to start, then separately approved
`HYPERLIQUID-002A`, `002B` and the Testnet-only/zero-real-value
`HYPERLIQUID-002C` control plane. The `002C` preflight found required account,
signer and durable-submission prerequisites missing and therefore performed no
Exchange write.

The Founder approved the local durable `HYPERLIQUID-002D` implementation on
2026-08-08. The remaining Phase 4 gate is operational and exact: supply one
qualified Testnet master/subaccount, one fresh API wallet, one non-exporting
signer handoff and current read-only metadata; prepare one exact durable action;
then stop at `READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`. Only the later approval
bound to that execution hash may authorize the unchanged request. No command
may infer or cross that gate. Mainnet, production, deployment, real value,
withdrawals, transfers, capital and funds movement remain unauthorized.

## Phase 4 bounded Testnet closure checkpoint

Following exact Founder approvals, `HYPERLIQUID-002D` completed the Phase 4
HyperCore Testnet proof. The stable order intent made one confirmed Testnet
`/exchange` submission. Because the accepted ALO rested, a distinct
`cancelByCloid` intent required and received its own fresh exact approval and
made one confirmed cancel submission inside a ten-second JIT risk window.
There was no automatic retry.

Independent read-only venue reconciliation found the exact order canceled,
with zero open orders and zero positions. Both stable intents are `CLOSED`
version `7`; venue state, Ledger state and Obligation Evidence are hash-bound.
The signer handoff and delegate are retired, the tombstone prevents reuse and
the isolated key is logically destroyed and absent. External venue-side
API-wallet deregistration was not performed, so this checkpoint claims local
signing retirement rather than external deregistration or storage-medium secure
erase.

Phase 4 is `VERIFIED_TESTNET_CLOSED` for this bounded zero-real-value proof.
Phase 1 through Phase 4 validation is closed at the approved local/Testnet
scope. Mainnet, production, deployment, real capital, transfers, withdrawals,
new signers and any broader venue authority remain separate human gates.
Evidence is
`artifacts/testnet/hyperliquid-002d-final-closure-20260810T142835Z.json`.

## Phase 5 Safe/institutional provider checkpoint

Following Founder authorization to begin Phase 5, `SAFE-AGENT-001` adds the
first additional provider as a disabled L0 reference adapter through the
existing Agentic Wallet Provider SPI. It reuses canonical EIP-712/ERC-1271,
grant, target-policy, preflight, decision and Evidence boundaries and changes
no Credit, Obligation, Mandate, Ledger, Tenant Protocol, OpenAPI, SDK or MCP
semantics.

The adapter records only short-lived hash-bound synthetic Safe capability and
configuration observations. A supported module-free `CALL` reaches only
`STEP_UP`; unknown capability, enabled modules or configuration drift
quarantine; unsupported capability and `DELEGATECALL` deny. The descriptor and
registry kill switch keep every external operation disabled.

Verification passed: focused `9/9`, complete agentic execution `51/51`, full
unit `880/880`, transport parity `74/74`, fresh isolated PostgreSQL `85/85`,
schemas `131/131`, migrations `60/60`, lint/typecheck and `git diff --check`.
No Safe service, account, RPC, signature, contract, Testnet or mainnet call was
made. This checkpoint is `VERIFIED_SANDBOX`, not provider activation, hosted,
Testnet, production, custody or real-value authority. Evidence is
`artifacts/sandbox/safe-agent-001-conformance-20260810.json`.

## Phase 5 multi-provider reference conformance closure

Following the Founder's Phase 5 scope reduction, Safe remains complete at
`SAFE-AGENT-001 — VERIFIED_SANDBOX / DISABLED REFERENCE ADAPTER`. No
`SAFE-AGENT-002` or provider-specific Testnet lifecycle is implied. Phase 5
adds only the two remaining materially different reference architectures and
then closes on common conformance:

- Circle developer-controlled MPC/managed wallets project one canonical
  prepared execution and preflight into a hash-only managed-custody review
  receipt. No credential material, encrypted credential payload, raw
  signature, provider response, API call, custody activation or submission is
  accepted.
- Base Account smart accounts project one native Spend Permission from the
  canonical external permission projection. Chain, asset, target, allowance,
  period and validity must remain narrower; arbitrary `extraData`, Auto Spend
  Permissions, silent spend, Sub Account creation, provider adjustment and
  transaction RPCs remain disabled.
- MetaMask, OKX, Safe, Circle and Base are bound to the same unchanged
  nine-operation Agentic Wallet Provider SPI. Unsupported/unknown capability
  is non-permissive, each descriptor is independently disabled, provider
  security facts normalize to common hash Evidence, and no adapter creates a
  second authorization or economic-state Kernel.

Verification passed: focused Phase 5 `8/8`, complete agentic execution
`59/59`, full unit `888/888`, transport parity `74/74`, fresh isolated
PostgreSQL `85/85`, schemas `136/136`, migrations `60/60`, lint/typecheck and
`git diff --check`. No Circle, Base or Safe external call, credential, account,
wallet permission, signature, contract, Testnet/mainnet transaction, custody,
deployment or real-value action occurred.

Phase 5 is `VERIFIED_SANDBOX` for reference-provider breadth and common
conformance. Adding another compliant provider is primarily an adapter plus
conformance task and must not change canonical Credit, Obligation, Mandate,
SpendPolicy, Ledger or risk semantics. Safe Testnet work remains deferred
until an actual pilot requirement or a separately reviewed concrete safety gap
requires it. Evidence is
`artifacts/sandbox/aecl-phase5-multi-provider-conformance-20260810.json`.
