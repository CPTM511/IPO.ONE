# TC-000 Architecture Freeze Audit

Recorded: 2026-07-24T17:02:04.285Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Next task: `TC-101 AUTHORIZED_NOT_STARTED`

## Gate

The IPO.ONE Founder accepted V9-009 and explicitly authorized TC-000. The
acceptance is recorded in `docs/codex/audits/V9-009/audit.md`.

At `2026-07-25T00:32:32.792Z`, the IPO.ONE Founder accepted ADR-034 through
ADR-037 and the Trading Capital threat model, preserving every explicitly
unapproved decision. The Founder authorized the V9-009 security-test
expectation repair and made a fully green `test:security` the condition for
starting TC-101. That condition now passes 24/24.

TC-101 is therefore authorized but has not started. Acceptance does not itself
make any of the 25 Trading Capital candidate operations callable and does not
authorize Hyperliquid credentials or calls, an API wallet, Testnet writes,
production deployment, mainnet, pricing, risk limits, custody, capital,
settlement, or real funds.

The accepted stacked WALLET and V9 dirty worktree was preserved. It was not
reset, cleaned, committed, deployed, or relabelled as TC-000 work.

## Outcome

TC-000 produced an accepted architecture freeze before any runtime operation:

1. ADR-034 proposes one shared-kernel Trading Capital Facility and five
   separately accepted maturity gates;
2. ADR-035 proposes signer-free read isolation, separate signer/custody/risk
   authority, a positive Testnet action allowlist ceiling, a fail-closed
   denylist, and a durable signer-scoped nonce/outcome state machine;
3. ADR-036 proposes explainable Evidence factors, explicit
   `FRESH/STALE/UNKNOWN` semantics, a monotonic protective risk state machine,
   and no black-box or procyclical repricing authority;
4. ADR-037 proposes deterministic settlement authority, loss-conserving
   economics, interim no-funds/Testnet incident ownership, and append-only
   recovery;
5. the proposed threat model records 20 threats and five incident tabletop
   scenarios; and
6. the pre-change mapping proves that the 25 package candidates remain absent
   from the runtime and have maturity `specified_disabled`.

Every ADR now records
`Accepted by IPO.ONE Founder under TC-000; architecture only; no runtime authority`.
Each names the IPO.ONE Founder as decision owner, and records rationale,
alternatives, rollback, and explicitly unapproved decisions.

## Accepted architecture boundaries

### One Facility, one kernel

The Facility is an execution/risk aggregate over exactly one Provider, one
canonical Obligation, one Human Trader or Agent Operator, one environment, and
one Hyperliquid account binding. It may project venue and risk state but is not
monetary truth. Subject/Principal, Consent/Mandate, Offer, Obligation, Ledger,
Event, and Evidence remain the existing shared Human/Agent kernel.

The only proposed term shapes are fixed Credit, fixed Performance
Participation, and fixed Hybrid. Active terms cannot automatically reprice.
Rates, fees, caps, collateral, first loss, leverage, maturity, legal structure,
and loss bearer remain unapproved.

### Staged maturity

The proposed gates are:

- TC-G0: complete no-real-funds product;
- TC-G1: real Hyperliquid read-only data;
- TC-G2: protected Testnet writes;
- TC-G3: complete Testnet Facility; and
- TC-G4: a human-owned real-value decision package only.

No gate implies the next. TC-G4 cannot authorize Codex to deploy a production
credential, unlock mainnet, or move real value.

### Hyperliquid safety boundary

The proposal was checked against current official Hyperliquid documentation:

- API wallets sign for a master/subaccount, but account reads use the actual
  account address;
- nonces are signer-scoped, time-bounded, and require durable unique
  allocation;
- retired/deregistered API-wallet addresses are never reused because pruning
  can remove nonce state; and
- the Exchange endpoint contains withdrawals, transfers, API-wallet approval,
  builder-fee approval, vault, leverage, margin, and other actions outside the
  narrow execution authority.

The signer-free Info Adapter and protected writer are separate. A strategy can
submit only a closed server-created intent. The proposed future Testnet
allowlist ceiling is order, cancel/cancel-by-cloid, modify, and server-proven
reduce-only order. Every unknown action and high-risk action is denied before
signing. There is no generic Exchange passthrough.

### Explainable risk and O1 response

The factor profile has Alpha Quality, Risk Reliability, Strategy Capacity,
Mandate Compliance, and Evidence Confidence. A composite score is
presentation-only and non-authorizing. Historical PnL, wallet balance, or an
opaque model cannot alone set a limit, activate capital, price credit, or
loosen risk.

This preserves the clarity of the Agent Prime wedge while rejecting a
black-box credit authority, PnL-only limits, automatic risk-based repricing,
and Codex-owned real-value caps or first loss.

The proposed protective order is:

`NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`

Stale or unknown Evidence blocks new risk and can move only toward greater
restriction. Exact age, threshold, limit, leverage, drawdown, concentration,
hysteresis, and cooling values remain unapproved.

### Settlement and recovery

The protected writer cannot withdraw, transfer, post the Ledger, or finalize
settlement. The settlement worker proposes deterministic allocation; the
Tenant Command Gateway remains the canonical serializable Ledger/Event/Evidence
write boundary. Unknown writes are reconciled instead of retried, and
historical facts are corrected append-only.

Settlement cannot create synthetic profit, Provider principal guarantees, or
fees without actual realized financial income and future accepted economic
terms.

The IPO.ONE Founder is the proposed interim no-funds/Testnet incident owner and
Evidence custodian. This is accountability only and grants no signer,
withdrawal, deployment, or bypass authority. Real-value incident, custody,
capital, settlement, and review roles remain unapproved.

## Candidate-operation proof

The package contract was parsed rather than counted manually:

- package candidates: 25;
- unique package candidates: 25;
- current Tenant protocol catalog: 46 operations;
- candidate/catalog intersection: 0; and
- candidate identifier hits in `api`, `apps`, `db`, `modules`, `packages`,
  `schemas`, `scripts`, `security`, `contracts`, and `deploy`: 0.

Therefore the Trading Capital runtime remains `0/25`. No candidate received a
request/result schema, capability, AuthZ entry, admission class, handler, route,
SDK, UI, MCP tool, migration, worker, adapter, signer, or credential.

## Change scope

The TC-000 architecture freeze changed only:

- `docs/architecture/ADR-034-trading-capital-shared-facility-and-maturity-gates.md`
- `docs/architecture/ADR-035-hyperliquid-adapter-signer-custody-action-and-nonce-boundary.md`
- `docs/architecture/ADR-036-trading-capital-evidence-factor-risk-staleness-and-state-machine.md`
- `docs/architecture/ADR-037-trading-capital-settlement-incident-ownership-and-recovery.md`
- `docs/security/IPO_ONE_TRADING_CAPITAL_THREAT_MODEL_v0.1_PROPOSED.md`
- `docs/codex/audits/TC-000/pre-change-mapping.md`
- `docs/codex/audits/TC-000/audit.md`
- `docs/codex/audits/V9-009/audit.md` for the Founder acceptance record

The separately authorized post-acceptance remediation changed only:

- `security/test/gateway-security.test.mjs`, adding the already implemented
  `officialReportArtifactsEnabled: true` safety flag to the exact expected
  catalog object; and
- accepted status and audit metadata in the TC-000 documents.

No runtime, schema, migration, protocol catalog, capability, AuthZ, abuse,
handler, route, UI, SDK, MCP, dependency, credential, environment, deployment,
wallet, signer, chain, funds, or pricing implementation was changed.

## Verification

All repository commands used the exact runtime contract:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm ...
```

### Exact repository gate

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: **PASS**.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: pass;
- schemas: 55;
- OpenAPI: 21 paths / 21 operations;
- migrations: 28 ordered up/down pairs;
- approval policy: 9 high-impact operations and 5 protective break-glass
  actions;
- abuse policy: 63 Tenant operations;
- Tenant protocol: 46 operations, 62 request fixtures, 54 result fixtures,
  8 handoff fixtures, and 5 workflow receipt fixtures;
- product traceability: 13 destinations and 60 actions; and
- local tests: 427/427 pass.

### Focused static review

The TC-000 static checker returned:

```text
PASS: 4 accepted architecture ADRs contain required decision fields
PASS: 20 threats and 5 tabletop scenarios are documented
PASS: package candidate count 25; unique 25
PASS: runtime catalog count 46; Trading Capital intersection 0
PASS: runtime/schema/security/contract/deploy identifier scan intersection 0
```

Focused repository checks returned:

- `check:schemas`: pass, 55 contracts;
- `check:migrations`: pass, 28 ordered up/down pairs;
- `check:tenant-protocol`: pass, 46 operations;
- `check:approval-policy`: pass;
- `check:abuse-policy`: pass;
- `test:transport`: pass, 49/49; and
- `git diff --check`: pass, both TC-000 scope and complete worktree.

### Resolved independent security-suite blocker

Before Founder acceptance, the separately invoked `pnpm test:security`
returned 23/24 pass. Its one failure was the accepted V9-009
stacked-worktree expectation gap:

```text
Tenant protocol contracts are closed, non-authoritative, and private
```

The live catalog safety object contained
`officialReportArtifactsEnabled: true`, while the security test omitted that
already implemented V9-009 flag from its exact expected object. Under the
Founder's explicit authorization, the expectation gained that one boolean
field. No production behavior changed.

Post-fix command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Result: **PASS, 24/24**.

The exact repository gate was rerun after the repair and also passed with
427/427 local tests.

No PostgreSQL or browser run was required: TC-000 adds no runtime, persistence,
UI, transport, external call, or credential behavior.

## Founder-accepted proposal hashes

| Artifact | SHA-256 |
| --- | --- |
| ADR-034 | `2e690d2d98e393c37213d224b1157ccf7e1f4103f672cf1bbaa27ea6cf99066d` |
| ADR-035 | `ac8c33534cdf35a9e7de183d630e66f82f8d85b7b1024f1298cf66004e0c7a34` |
| ADR-036 | `953f1f7c5c4adeb3e66a338a5614570f621c5ba1d524e38f40710b4cb98cbe68` |
| ADR-037 | `45e9803100fabd9fe2f2332d3030a959c8c6054a66ca4a308c3e9cdeb8674039` |
| Threat model | `41ac7a6b146b33c6ae6cdd18f10642147b30ec052de49cb7a54361e1935a5b1e` |
| Pre-change mapping | `b0c3f604f9e95425c58b895574b3a82d18943e9deac8ebf1ce721c25d8744667` |

The acceptance-record status update produces these new document hashes:

| Artifact | Accepted-record SHA-256 |
| --- | --- |
| ADR-034 | `0710f01e4a7fab8a0886e1e556ade5ff100ccd95b3f2bd0b6a5a95f5d575276b` |
| ADR-035 | `9334b56c3ec3a72ff1e310fc5cd6525866dd1b419152a9fcb56d3c23c108d995` |
| ADR-036 | `b3c3a2c0fe55ccbb5b31735c65a40badd909b0e6628e3a7cce7cbd188d3d11d9` |
| ADR-037 | `038639ec9517703ba602b4901069f39e753d5e7c27c816e0e13413b2527680f3` |
| Threat model | `42b6aac4f27b29fbd51df64266ca8f289f273d905c2d5e065661d4881e6a24cd` |

## Founder acceptance and next gate

Founder acceptance covers ADR-034 through ADR-037 and the threat model as an
architecture target. Every explicit unapproved decision remains unapproved,
and all 25 candidate operations remain `specified_disabled`.

The V9-009 expectation correction is complete and `test:security` is green.
TC-101 is authorized as the next task, but no TC-101 implementation, runtime
operation, credential, endpoint call, or external effect occurred in this
remediation turn.
