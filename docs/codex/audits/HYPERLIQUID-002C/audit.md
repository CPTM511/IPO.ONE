# HYPERLIQUID-002C Audit — Testnet Signing and Bounded Proof Readiness

Date: 2026-08-08

Issue: `HYPERLIQUID-002C`

Implementation state: `IMPLEMENTED_UNVERIFIED — WRITE PREFLIGHT BLOCKED`

External Hyperliquid write: `NOT PERFORMED`

## Outcome

The Founder-authorized Testnet-only control plane is implemented and passes
repository regression. It provides official-reference action hashing and
typed-data construction, a non-exporting isolated signer port, an exact
zero-real-value proof policy, one-shot Exchange transport and a hash-only
preflight report.

The stop condition was reached before signing or transport. There is no
qualified Testnet master/subaccount, durable binding for it, approved fresh API
wallet, isolated signer handoff, one-use human confirmation or durable
single-use submission/UNKNOWN store. No `/exchange`, `approveAgent`, Testnet
order, cancel, modify, transfer, withdrawal, leverage change or funds movement
occurred.

## Fixed proof policy

| Control | Fixed value |
| --- | --- |
| Environment / endpoint | Hyperliquid Testnet / fixed `/exchange` origin |
| Market | BTC perpetual, asset index `3` |
| Decimal rule | `szDecimals=5`, maximum price decimals `1` |
| Opening action | one ALO order only |
| Testnet order notional | exactly `10 USDC`, also the hard cap |
| Expected fill | `0`; any fill requires reconciliation |
| Open orders | maximum `1` |
| Signed submissions | maximum `3` for the proof |
| Request / proof lifetime | `30 seconds` / `15 minutes` |
| Timeout or ambiguous response | `UNKNOWN`, no retry, new risk blocked |
| Mainnet / production / real funds | disabled |

## Official-signing Evidence

- The official Python SDK MessagePack order action hash vector matches exactly:
  `0x0fcbeda5ae3c4950a548021552a4fea2226858c4453571bf3f24ba017eac2908`.
- The official Testnet L1 EIP-712 signature vector matches exactly:
  `0x542af61ef1f429707e3c76c5293c80d01f74ef853e34b76efffcb57e574f951017b8b32f086e8cdede991f1e2c529f5dd5297cbe8128500e00cbaf766204a6131c`.
- L1 and user-signed requests are distinct closed schemes. `approveAgent` is
  Testnet-only and cannot enter the Exchange execution transport.
- The signer port rejects raw-key configuration and identity drift. It returns
  transient signature components but persists only signature and recovered
  signer hashes.

## Live signer-free Testnet observation

Only `/info` requests for `meta` and `allMids` were made. At
`2026-08-08T13:45:08.000Z`, BTC was observed at asset index `3`,
`szDecimals=5`, mid `64912.5`, maximum leverage `40`, with `210` universe
entries. Reduced Evidence is stored in
`artifacts/testnet/hyperliquid-002c-market-metadata-20260808.json`.

- `meta` response SHA-256:
  `5d5ac211381a32407ba71406b83ec3be4fd08148d505b56863a2ab66b7c2ba51`
- `allMids` response SHA-256:
  `54ccd9504d1ec29b36c2670eee457200a2f6e85bb2feee7d199089bddf8545ed`
- Reviewed metadata hash:
  `0x7e7f503e9479df7b18c4d9341686231cae15b0aee5c6ec2294eb84264e658dd4`
- Raw responses persisted in the repository: `false`.
- Signer or credentials used: `false`.
- Exchange write performed: `false`.

## Preflight Evidence

With the exact acknowledgement
`IPO_ONE_APPROVE_HYPERCORE_TESTNET_PROOF=HYPERLIQUID-002C`, the preflight
accepted the approval marker, metadata contract and no-raw-key condition, then
returned `BLOCKED` before any write.

Report hash:
`0x37306501e8e066202e1b2a8d11fea60601b56dbd35650fc78d4f49599c0ddccb`

Named blockers:

- qualified Testnet master/subaccount and role missing;
- durable account binding missing;
- approved fresh distinct API-wallet delegate missing;
- isolated signer port/reference missing;
- one-use human confirmation missing; and
- durable single-use submission store not composed.

The last blocker is intentional. Migration `0057` governs binding, delegate and
tombstone truth; migration `0056` is simulation-only. A real attempt needs an
append-only durable `PREPARED`/`SIGNED`/`SUBMITTING`/terminal/`UNKNOWN` state
machine so a crash cannot make an authorization, nonce or signature reusable.
That work is proposed separately as `HYPERLIQUID-002D`.

## Verification Evidence

- Official signing and proof policy/transport: PASS, 15 tests, 0 failures.
- `pnpm test`: PASS, 833 tests, 0 failures.
- `pnpm run check:schemas`: PASS, 116 contracts.
- `pnpm run lint`: PASS, 626 JavaScript modules; boundary lint PASS.
- `pnpm run typecheck`: PASS, 3 export surfaces and 72 runtime value exports.
- `git diff --check`: PASS.

The aggregate `pnpm run check` passed runtime, lint, type, schema, OpenAPI,
migration, deployment-topology, provider-selection, closed-pilot operations,
local-stack and all 44 M1 Constitution requirement gates before the existing
sealed candidate branch assertion stopped it:

```text
actual:   codex/checkpoint-20260727-pre-strategy
expected: codex/m1-b-deployable-sandbox
```

No `HYPERLIQUID-002C` implementation test failed.

No PostgreSQL migration was added by `002C`, so the existing `002B` PostgreSQL
Evidence remains the latest persistence result. No dependency was added for
MessagePack; the closed encoder is bounded and verified against official
vectors.

## Security disposition

| Control | Result |
| --- | --- |
| Exact official L1 hash/signature vectors | PASS |
| User-signed provisioning separated from L1 execution | PASS |
| Raw-key ingress and persistence | DENIED |
| Wrong signer/account/vault/environment | DENIED |
| Non-ALO, wrong market or non-10-USDC opening order | DENIED |
| Withdrawal/transfer/leverage/admin/builder/raw action | DENIED |
| Stale metadata/risk, pause, outstanding UNKNOWN | DENIED |
| Redirect, retry and ambiguous success inference | DENIED |
| Raw response durable persistence | DENIED |
| Testnet Exchange write | NOT ATTEMPTED |

## Next review gate

`HYPERLIQUID-002D` is proposed but not authorized. It covers the durable
single-use Testnet submission/UNKNOWN migration and non-logging account/signer
handoff. Even after that implementation, a Testnet write may occur only after
a new exact readiness decision supplies and binds every named prerequisite.

Mainnet, production, deployment, real value, withdrawals, transfers, capital,
canonical Ledger settlement and continuing strategy execution remain outside
the authority.
