# AECL-000 — Agentic Execution Compatibility architecture freeze

Status: ACCEPTED — Founder approved ADR-038 and subsequently authorized Phase 1
and Phase 2 through `EXEC-003` at `L0_LOCAL_NO_FUNDS` on 2026-08-07

Date: 2026-08-07

Delivery mode: `L0_LOCAL_NO_FUNDS`

Decision owner: IPO.ONE Founder / Product / Security / Architecture

Controlling proposal: `IPO_ONE_AGENTIC_EXECUTION_COMPATIBILITY_LAYER_v0.1.md`
supplied by the Founder on 2026-08-07. The proposal is architecture input and
does not override the Product Constitution or grant runtime authority.

## Context and current baseline

IPO.ONE already has a shared Human/Agent obligation kernel, an authenticated
Tenant Command Gateway, CAIP-2/CAIP-10 chain and account boundaries, EIP-6963
browser-provider discovery, a reviewed WalletConnect connector, EIP-712 Agent
account proof, an ERC-1271 verifier, Evidence anchoring, and a signer-free
Hyperliquid Info Adapter. It also has an offline, simulation-only Hyperliquid
writer model. These foundations are reusable but do not yet form one
standards-first Agentic Execution Compatibility Layer (AECL).

The supplied proposal requires an architecture freeze before runtime work. It
separates the canonical economic Kernel from three replaceable execution SPIs:
an EVM Wallet Connector, a Delegated Agentic Wallet Provider, and a Venue
Execution Adapter. It also requires bounded grant and target-policy
projections, mandatory transaction preflight, exact-payload binding, normalized
execution receipts, capability negotiation, and fail-closed reconciliation.

Repository baseline recorded before this issue:

- branch: `codex/m1-b-deployable-sandbox`;
- commit: `dfba8d7ec6390ec79df6df21886bcf3525702e69`;
- the worktree already contained modified browser-host support files and
  untracked recovery, marketing, prototype, output, and Evidence artifacts;
- none of those pre-existing changes is owned, modified, removed, or relied on
  by AECL-000.

## Scope

- audit current wallet, signature, Tenant Protocol, Agent MCP/SDK, chain,
  Evidence, and Hyperliquid boundaries against the controlling proposal;
- classify each material capability as `ALREADY_IMPLEMENTED`,
  `PARTIALLY_IMPLEMENTED`, `ABSENT`, or `CONFLICTS` with current code evidence;
- add one architecture ADR fixing the boundary among the Kernel, AECL, wallet
  adapters, delegated-wallet adapters, venue adapters, Ledger, and Evidence;
- decide which proposed objects are execution projections and receipts rather
  than new credit authority;
- freeze the public operation family, execution-decision vocabulary, exact
  preflight/submission sequence, failure isolation, persistence direction, and
  security invariants;
- map the architecture to existing Product Constitution requirement IDs and
  accepted ADRs without changing their approval status;
- define migration impact, rollback, review gates, and the next exact scopes
  for `EVM-WALLET-001` and `SIG-003`.

## Non-goals

- no runtime, UI, API, schema, SDK, MCP, migration, contract, chain-profile,
  policy, feature-flag, dependency, or generated-bundle change;
- no EVM connector SPI implementation, capability probe, ERC-6492 verifier,
  delegated grant persistence, simulator, preflight gate, or execution API;
- no MetaMask, OKX, Base, Circle, Safe, Coinbase, Rabby, Trust Wallet, or other
  vendor adapter;
- no Hyperliquid delegate provisioning, API-wallet key, signer, Exchange
  request, Testnet write, withdrawal, transfer, leverage change, or mainnet
  path;
- no new Mandate capability, capital authority, limit, pricing, risk policy,
  custody model, signer technology, credential, deployment, or funds movement;
- no claim that architecture approval proves implementation, local execution,
  live-provider compatibility, testnet execution, hosting, real-value activity,
  or production readiness.

## Likely files

- `docs/codex/tasks/AECL_000_AGENTIC_EXECUTION_COMPATIBILITY_ADR.md`
- `docs/codex/audits/AECL-000/pre-change-mapping.md`
- `docs/codex/audits/AECL-000/traceability.md`
- `docs/codex/audits/AECL-000/audit.md`
- `docs/architecture/ADR-038-agentic-execution-compatibility-layer.md`

No runtime file is likely or permitted to change in this issue.

## Acceptance criteria

1. Given the current repository and the supplied proposal, when the gap audit
   is read, then every material AECL capability has one explicit status, code
   evidence, gap, and owning follow-up issue.
2. Given the accepted shared-kernel and Tenant Gateway architecture, when the
   ADR is read, then no wallet or venue adapter can create, widen, or replace
   Mandate, SpendPolicy, CreditLine, Offer, Obligation, Ledger, or
   Authorization authority.
3. Given Human, Agent, EVM, and venue execution paths, when an executable
   action is modeled, then the ADR requires exact server-prepared payload,
   current authorization, pending-exposure reservation, fresh preflight,
   `ALLOW | STEP_UP | DENY | QUARANTINE`, exact approval binding, normalized
   finality/result, reconciliation, and Evidence.
4. Given an unknown, stale, revoked, changed, unsupported, or unreconciled
   state, when execution is evaluated, then the frozen architecture fails
   closed and cannot silently downgrade to raw transaction submission or a
   broader session key.
5. Given Hyperliquid, when the architecture is read, then HyperCore is a Venue
   Adapter, HyperEVM is an EVM chain profile, the master/subaccount remains the
   account identity, and an API wallet remains only a fresh, revocable signing
   delegate.
6. Given the operation family, when Human Web, OpenAPI, TypeScript SDK, MCP/A2A,
   and adapters are compared, then the ADR requires one Tenant Protocol
   business path and forbids transport-specific authority or business logic.
7. Given current approvals, when the changed file list is inspected, then it
   contains documentation only and introduces no production, funds, signer,
   custody, chain, venue, risk-limit, permission, privacy, or deployment
   authority.
8. Given AECL-000 completion, when next work is proposed, then
   `EVM-WALLET-001` and `SIG-003` are separately issue-sized, reviewable, and do
   not begin vendor-adapter or delegated-execution implementation.
9. Existing repository checks remain green at the exact worktree state, or any
   failure is attributed precisely to pre-existing drift rather than hidden.

## Exact test commands

```sh
test -f docs/architecture/ADR-038-agentic-execution-compatibility-layer.md
test -f docs/codex/audits/AECL-000/pre-change-mapping.md
test -f docs/codex/audits/AECL-000/traceability.md
test -f docs/codex/audits/AECL-000/audit.md
rg -n 'ALREADY_IMPLEMENTED|PARTIALLY_IMPLEMENTED|ABSENT|CONFLICTS' \
  docs/codex/audits/AECL-000/pre-change-mapping.md
rg -n 'REQ-|ADR-|EVM-WALLET-001|SIG-003' \
  docs/architecture/ADR-038-agentic-execution-compatibility-layer.md \
  docs/codex/audits/AECL-000/traceability.md
git diff --check -- \
  docs/architecture/ADR-038-agentic-execution-compatibility-layer.md \
  docs/codex/tasks/AECL_000_AGENTIC_EXECUTION_COMPATIBILITY_ADR.md \
  docs/codex/audits/AECL-000
pnpm check
```

## Security checklist

- [x] Architecture-only scope; no state-changing runtime path is added.
- [x] Root authority, workload authentication, and wallet/venue session signer
      remain distinct.
- [x] Unknown capability never widens authority or selects an unsafe fallback.
- [x] Raw Agent/browser calldata cannot be a future authorization source.
- [x] Zero native value is not treated as non-financial by default.
- [x] External permission is constrained to be no broader than the canonical
      IPO.ONE authorization envelope.
- [x] Pending exposure is counted before external finality.
- [x] Stale, changed, unknown, revoked, or unreconciled execution is denied or
      quarantined.
- [x] Withdrawal, transfer, bridge, unlimited approval, arbitrary delegatecall,
      ownership/module upgrade, and unknown venue actions remain default-deny.
- [x] Raw signatures, root/session keys, credentials, KYC/PII, and sensitive
      strategy payloads stay outside durable/public Evidence.
- [x] Hyperliquid account identity and API-wallet signing identity remain
      separate; deregistered delegates cannot be reused.
- [x] No vendor becomes part of canonical credit or obligation semantics.

## Permission boundary

The Founder request authorizes starting development according to the supplied
specification. The specification itself requires AECL-000 to stop at
architecture, audit, traceability, and next-issue definition. Therefore this
issue grants documentation authority only.

Contracts, runtime permissions, external signing, wallet-provider calls,
Hyperliquid delegation or writes, risk controls or limits, privacy, custody,
production dependencies, credentials, deployment, mainnet, and funds movement
remain behind separate named human review.

## Data and migration impact

None in AECL-000. The ADR may propose future Tenant-scoped projections and
append-only receipts, but this issue creates no schema or migration and moves
no data.

## Rollback plan

Revert only the five AECL-000 documentation artifacts. Runtime, database,
contracts, chain profiles, wallet behavior, and existing Evidence remain
unchanged.

## Required Evidence

- current branch, commit, and pre-existing drift record;
- exact gap matrix with code paths;
- accepted-ADR and Product Constitution traceability;
- architecture decision and unresolved-decision list;
- exact validation commands and pass/fail results;
- changed-file proof showing documentation-only scope;
- next-issue scope for `EVM-WALLET-001` and `SIG-003`.

## Dependency and sequencing notes

AECL-000 preceded all AECL runtime work. The Founder approved ADR-038,
authorized `EVM-WALLET-001` and `SIG-003`, accepted Phase 1 Evidence, separately
authorized the `EXEC-001` L0 local no-funds permission/data scope, and then
authorized `EXEC-002` and `EXEC-003`. Phase 2 is now implemented but unverified
pending Founder review. Provider adapters, external simulation, signing,
submission, venue execution and every later phase remain stop-gated.

The Product Engineering and Experience Standard ordered program remains the
general product sequence. This Founder-supplied architecture-freeze issue is a
documentation-only addition and does not opportunistically modify any later
runtime issue.

## Completion Evidence

Completed on 2026-08-07 at the documentation/architecture boundary:

- proposed ADR-038 added with no runtime authority;
- exact 54-row gap matrix: 15 already implemented, 16 partial, 20 absent and
  3 conflicts;
- Product Constitution and accepted-ADR traceability added;
- `pnpm test`: PASS, 728/728;
- product traceability, Web bundle, deploy, launch-policy, real-value locked
  package, approval, abuse, operations, Tenant Protocol and Agent HTTPS checks:
  PASS;
- `pnpm check`: not green because the pre-existing M1-A.1 snapshot and sealed
  local release candidate bind `codex/checkpoint-20260727-pre-strategy`, while
  the current branch is `codex/m1-b-deployable-sandbox`;
- no branch-bound candidate artifact was modified or resealed;
- AECL-owned changed files are documentation-only.

Detailed evidence and rollback are recorded in
`docs/codex/audits/AECL-000/audit.md`.
