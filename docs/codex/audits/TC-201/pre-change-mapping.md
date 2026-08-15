# TC-201 Pre-change Mapping

Captured at: `2026-07-25T10:13:42.775Z`

Repository: `/Users/cptmao/Documents/IPO.ONE`  
Branch: `codex/commercial-access-release`  
Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Task boundary: TC-201 only

## Authority

The IPO.ONE Founder accepted TC-104 and instructed Codex to continue through
`同意TC104，继续后面的工作`, followed by `继续`. The package dependency graph
identifies TC-201 as the only successor. This unlocks a signer-free
Hyperliquid Testnet Info Adapter only.

The approved outbound ceiling is:

- Origin: `https://api.hyperliquid-testnet.xyz`
- Path: `/info`
- Method: `POST`
- Content type: `application/json`
- Query families: mandatory user-role verification, account clearinghouse
  state, frontend open orders, time-bounded user fills, and master-account
  subaccount discovery
- Account input: an actual master or subaccount address supplied by a later
  server-bound integration, never an API-wallet address
- Credentials/signature: none

No `/exchange`, mainnet, websocket, API wallet, key, signer, account-binding
claim, Testnet write, deployment, custody, transfer, withdrawal, real funds,
or TC-202 work is authorized.

## Source and architecture inputs

- `AGENTS.md`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_v1.1.md`
- `docs/guidance/IPO_ONE_DUAL_NATIVE_EXECUTION_PLAN_v0.1.md`
- `docs/architecture/ADR-034-trading-capital-shared-facility-and-maturity-gates.md`
- `docs/architecture/ADR-035-hyperliquid-adapter-signer-custody-action-and-nonce-boundary.md`
- `docs/security/IPO_ONE_TRADING_CAPITAL_THREAT_MODEL_v0.1_PROPOSED.md`
- `docs/security/IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`
- Hyperliquid official API, Info endpoint, and rate-limit documentation

Official documentation confirms that Testnet uses the corresponding
`https://api.hyperliquid-testnet.xyz` API server and that user-state queries
must use the actual master/subaccount address. An Agent/API-wallet address can
return an empty result and must not be accepted as account identity.

## Runtime truth before TC-201

- Tenant protocol: 71 private, no-funds operations.
- Trading Capital: 25/25 local no-funds operations.
- Hyperliquid runtime endpoint/profile: absent.
- Hyperliquid Info Adapter: absent.
- Hyperliquid Exchange client: absent.
- Hyperliquid credentials, API wallet, signer, nonce allocator: absent.
- Real master/subaccount binding: absent and reserved for TC-202.
- `tradingImportHyperliquidHistory` still imports an explicit synthetic
  fixture and reports `externalSystemQueried: false`.
- Existing reusable safety patterns include fixed exact Testnet endpoint
  registries, redirect denial, omitted credentials, abort timeouts, bounded
  streaming response reads, strict normalized contracts, caches, circuit
  breakers, and redacted provenance hashes.

## Contract and module map

| Concern | Existing authority to reuse | TC-201 change |
| --- | --- | --- |
| Network profile | Exact Testnet RPC registries | Add one immutable Hyperliquid Testnet Info profile |
| Transport | Bounded JSON-RPC and Provider clients | Add fixed POST `/info`, no dynamic URL/body, no credentials |
| Query contract | Closed internal operation patterns | Add four typed read queries; reject raw `type` and arbitrary JSON |
| Response | Closed domain and schema validators | Normalize only bounded equity, positions, orders, fills, subaccounts |
| Provenance | `hashId`, server time, Evidence lineage | Record origin/path/profile/query/time/raw hash/normalized hash/freshness |
| Resilience | timeout, retry, cache, circuit patterns | Add fixed conservative budgets and fail-closed state |
| Integration | TC-101 synthetic import | No integration or mutation in TC-201; TC-202 remains blocked |

## Live read-only reachability evidence

Before implementation, Codex issued five no-credential fixed `POST /info`
queries to the official Testnet origin with
`0x0000000000000000000000000000000000000000` as a non-binding contract-test
address:

- `clearinghouseState`: HTTP success with server time and empty positions;
- `spotClearinghouseState`: HTTP success, but the response was large and is
  excluded from the TC-201 minimum Evidence surface;
- `frontendOpenOrders`: HTTP success with an empty array;
- `userFillsByTime`: HTTP success with an empty array; and
- `subAccounts`: HTTP success with `null`.

This proves endpoint reachability only. It is not real-account Evidence,
account ownership, master/subaccount binding, production readiness, or
permission for TC-202.

## Planned verification

- official-shape recorded fixtures with source metadata;
- exact origin/path/method/body and actual-account-address tests;
- Exchange/raw query/API-wallet capability absence tests;
- SSRF, credential URL, redirect, timeout, rate limit, response-size,
  malformed JSON, partial-response, count, decimal, and timestamp tests;
- bounded retry, cache, circuit, provenance, hash, and staleness tests;
- one live Testnet read-only contract probe with a non-binding address;
- full runtime, schema, security, and patch-integrity gates; and
- `docs/codex/audits/TC-201/audit.md`.

No successor task is part of this mapping.
