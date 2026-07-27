# TC-202 Pre-change Mapping

Captured at: `2026-07-25T10:45:45.462Z`

Repository: `/Users/cptmao/Documents/IPO.ONE`  
Branch: `codex/commercial-access-release`  
Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Task boundary: TC-202 only

## Authority

The IPO.ONE Founder accepted TC-201 and instructed Codex to continue through
`接受，继续`. TC-202 authorizes a one-use, Principal-controlled Hyperliquid
Testnet master/subaccount binding and real signer-free Info Evidence import.

The approved external boundary remains exactly:

- environment: Hyperliquid Testnet;
- Info origin: `https://api.hyperliquid-testnet.xyz`;
- Info path/method: `POST /info`;
- account roles: actual master (`user`) and actual `subAccount`;
- ownership proof: one-use master EOA EIP-712 binding proof for HyperEVM
  Testnet chain ID `998`, verified locally without an RPC or reusable
  signature;
- relationship proof: independently query `userRole` for both addresses and
  `subAccounts` for the master before history import; and
- history: bounded `userFillsByTime` pagination plus a reconciled current
  account snapshot.

No `/exchange`, API-wallet approval, API-wallet key, signer service, order,
cancel, transfer, withdrawal, raw action, mainnet, real funds, deployment, or
capital decision is authorized.

## Source and architecture inputs

- `AGENTS.md`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_v1.1.md`
- `docs/guidance/IPO_ONE_DUAL_NATIVE_EXECUTION_PLAN_v0.1.md`
- `docs/architecture/ADR-035-hyperliquid-adapter-signer-custody-action-and-nonce-boundary.md`
- `docs/architecture/ADR-036-trading-capital-evidence-factor-risk-staleness-and-state-machine.md`
- `docs/security/IPO_ONE_TRADING_CAPITAL_THREAT_MODEL_v0.1_PROPOSED.md`
- `docs/security/IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`
- Hyperliquid official Info, subaccount, HyperEVM, API-wallet, and rate-limit
  documentation

The official Info documentation requires the actual master/subaccount address,
documents `userRole` and `subAccounts`, limits available fill history, and
requires pagination from the last returned timestamp. Hyperliquid documents
that subaccounts have no private keys and are controlled through their master.
HyperEVM Testnet uses chain ID `998`.

## Runtime truth before TC-202

- TC-201 provides a fixed, signer-free Testnet Info adapter with verified
  `userRole`, bounded current state, response hashes, freshness, retry, cache,
  request budget, and circuit protection.
- `tradingCreateAccountBindingChallenge` creates only a synthetic fixture
  challenge with no account input or ownership proof.
- `tradingImportHyperliquidHistory` imports a checked-in synthetic fixture and
  records `externalSystemQueried: false`.
- `tradingFinalizeEvidenceSnapshot` creates a non-authorizing synthetic factor
  scorecard.
- Migration `0029_trading_credit_profiles` requires
  `trading_credit_profile.v1`, `synthetic_only = TRUE`, and
  `external_system_queried = FALSE`.
- One profile is durable per Tenant/Subject, but rebinding and prior Evidence
  invalidation are not implemented.
- Fill pagination, deduplication, restart Evidence, source-retention gaps,
  wallet-cluster/self-transfer/wash flags, and current-state reconciliation are
  absent.
- Tenant/AuthZ/admission/idempotency/Event/Evidence/outbox/projection
  transaction boundaries already exist and remain authoritative.

## Planned contract and implementation map

| Concern | Existing authority to reuse | TC-202 change |
| --- | --- | --- |
| Challenge | Tenant operation, trusted Actor/Subject/Principal, server nonce | Bind hashes of exact master/subaccount, environment, chain 998, epoch, trusted time, and one-use EIP-712 digest |
| Proof | `viem` signature verification and low-s rules | Add local master-EOA proof verifier; persist proof hash only |
| Relationship | TC-201 `userRole` and `subAccounts` normalization | Require independent master and subaccount responses plus exact relationship hash |
| History | TC-201 fixed transport and fill normalization | Add bounded pages, inclusive-cursor dedupe, progress guard, source-retention limits, and manifest hashes |
| Data quality | Trading Evidence factor model | Persist visible gaps, survivorship, pagination, anomaly flags, and non-authorizing classifications |
| Reconciliation | Current account snapshot | Bind history end state to a fresh/explicitly stale account snapshot and provenance hashes |
| Durability | Gateway transaction, profile projection, Event/Evidence, idempotency | Add a v2 real-read profile and migration; one-use import commits once and replay returns the committed response |
| Rebinding | Existing one-profile-per-Subject lock | Increment binding epoch and invalidate prior active Evidence authority before issuing the replacement challenge |

## Security and privacy constraints

- Account data is queried only after authenticated Tenant authorization,
  current resource ownership, a current challenge, and successful master
  signature proof.
- Raw addresses may cross the authenticated command boundary only for proof
  and external querying. Durable profile, Events, Evidence, logs, fixtures, and
  reports retain hashes only.
- Raw signatures are never persisted or returned.
- Imported durable Evidence contains aggregate metrics and event-manifest
  hashes, not raw fills, orders, strategy parameters, or counterparty data.
- Wallet-cluster, self-transfer, and wash-trading conclusions remain
  `unknown` when the Info dataset lacks the necessary counterparty lineage.
- Missing pages, cursor stalls, source-retention limits, stale state, and
  incomplete reconciliation fail closed and remain visible.
- A real read-only snapshot cannot approve credit, set a limit, price capital,
  or enable new risk.

## Planned verification

- EIP-712 challenge and negative proof cases;
- master/subaccount mismatch and API-wallet denial;
- pagination boundary, duplicate timestamp/event, cursor stall, page cap, and
  restart/idempotency tests;
- rebinding invalidation and stale prior Evidence tests;
- data-quality, survivorship, provenance, and current-state reconciliation;
- PostgreSQL migration, RLS, append-only Event/Evidence, replay, and restart;
- approved Testnet read-only reachability without a live key; and
- full schema, protocol, security, conformance, migration, and repository
  gates.

No successor task is part of this mapping.
