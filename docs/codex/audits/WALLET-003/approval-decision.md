# WALLET-003 human approval decision

Date prepared: 2026-07-23  
Status: `APPROVED_FOR_IMPLEMENTATION`  
Approved by: IPO.ONE Founder  
Approved on: 2026-07-23  
Expires: 2026-09-22

Approval statement:

> 批准 WALLET-003 决策包，Owner 为 IPO.ONE Founder，有效期至
> 2026-09-22；批准 WalletConnect 2.23.10、上述 Testnet/RPC/方法范围，
> 以及在 /private/tmp 启动临时 PostgreSQL；先准备一个独立的最小测试
> 合约部署审批包——这不会自动授权部署。

## Supplemental license and runtime-boundary approval

Accepted by: IPO.ONE Founder  
Accepted at: `2026-07-24T00:04:37Z`  
Expiry: `2026-09-22T23:59:59.999Z`

Founder statement:

> 接受 WalletConnect Community License；批准
> `Origin=https://ipo.one`、`Relay=wss://relay.walletconnect.org`；批准打开
> Reown Dashboard，由 Founder 登录并创建/选择 Testnet Project。

This supplemental approval:

- accepts the installed WalletConnect Community License for the already
  approved no-real-funds Testnet/private-pilot scope;
- fixes the only approved browser Origin to `https://ipo.one`;
- fixes Relay egress to `wss://relay.walletconnect.org`;
- permits the existing approved Base Sepolia and X Layer Testnet RPC endpoints
  in the repository CSP;
- permits opening Reown Dashboard so the Founder can log in and create or
  select one Testnet Project.

It does not supply or authorize committing a Project ID, authorize Codex to
take custody of a Reown login, widen wallet methods/chains, enable mainnet,
deploy a production release, or move production funds. The Project ID remains
a runtime-only owner-managed input and the connector remains disabled until
that input and real mobile E2E exist.

This approval unlocks the exact connector, RPC, method, Testnet, dependency
review, and temporary PostgreSQL scope below. It does not approve a contract
deployment, private key, signer custody, faucet transaction, arbitrary wallet
method, mainnet, production identity, production dependency, release, or
funds authority.

This decision is intentionally narrower than production wallet approval. It
unlocks only a no-funds Testnet implementation and E2E evidence.

## Recommended connector scope

- Owner: IPO.ONE Founder.
- Connector: `@walletconnect/ethereum-provider`.
- Candidate version: exact `2.23.10`; no caret/range/canary.
- Source: official WalletConnect monorepo and npm package.
- Installation gate: record npm lockfile integrity, complete license review,
  dependency graph review, and `pnpm audit --prod` before integration.
- Adapter: one IPO.ONE-owned browser adapter; no general SDK/plugin loader.
- Chains: only `84532` and `1952`.
- Methods:
  `eth_requestAccounts`, `eth_accounts`, `eth_chainId`,
  `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `personal_sign`,
  and `eth_signTypedData_v4`.
- Events: only `accountsChanged`, `chainChanged`, `connect`, `disconnect`,
  `display_uri`, and the connector's bounded session event needed to map those
  same lifecycle changes.
- Explicitly denied: transaction submission, raw transaction, token approval,
  transfer, balance/history discovery, arbitrary RPC, mainnet, and production
  identity authority.
- Storage: connector key/value storage must be supplied by IPO.ONE as
  memory-only for this test profile; no pairing, connector key, signature,
  server session, or wallet telemetry in local/session storage, IndexedDB,
  logs, Events, Evidence, or analytics.
- Project ID: supplied at runtime from an owner-managed WalletConnect project
  restricted to the exact approved Testnet origin; never committed. Project ID
  rotation/revocation is the connector kill switch.
- Expiry: approval expires 2026-09-22 or on dependency, integrity, license,
  origin, method, chain, or Project ID change, whichever comes first.
- Rollback: remove the adapter and dependency, revoke the Project ID, clear
  in-memory pairing state, retain only redacted acceptance hashes, and return
  traceability to `SPECIFIED_DISABLED`.

The exact candidate version was explicitly approved by the IPO.ONE Founder.
Installation still requires resolved-integrity, dependency, license, and
production-audit evidence; an approval does not make an unavailable or
unaudited package present in the repository.

## Recommended ERC-1271 RPC scope

- Reuse only the existing CHAIN-001B exact Testnet endpoints:
  - Base Sepolia primary `https://sepolia.base.org/`;
  - Base Sepolia secondary
    `https://base-sepolia-rpc.publicnode.com/`;
  - X Layer Testnet primary
    `https://testrpc.xlayer.tech/terigon`;
  - X Layer Testnet secondary
    `https://xlayertestrpc.okx.com/terigon`.
- Add only `eth_getCode` and `eth_call` to a dedicated ERC-1271 client; reuse
  `eth_chainId` and `eth_getBlockByNumber`.
- No caller-provided URL, redirects, URL credentials/query/fragment, batch,
  subscriptions, write method, or dynamic provider.
- Maximum two provider attempts, five-second timeout per attempt, 64 KiB
  response, 4 KiB signature, and one verification call per challenge.
- Base Sepolia: use one revalidated `safe` block and require its hash to remain
  stable before accepting the result.
- X Layer Testnet: no safe/finalized claim is approved. Contract verification
  may be implemented for bounded inclusion-only conformance but must remain
  ineligible for accepted live authentication evidence unless the owner
  expressly approves that weaker finality.
- ERC-1271 path is selected only when the pinned block returns non-empty
  contract code. It never falls back to EOA verification after selecting the
  contract path.
- Accept only the final ERC-1271 `bytes4` value `0x1626ba7e`.
- Expiry: 2026-09-22 or any endpoint/method/finality/contract change.
- Rollback: remove ERC-1271 from the verifier factory and method allowlist,
  preserve redacted verification evidence, and leave EOA behavior unchanged.

## Live E2E inputs still needed

The owner selected option 2 as a preparation request only:

1. provide an existing Base Sepolia ERC-1271 wallet address and operate its
   approved mobile owner wallet during the test; or
2. separately approve a minimal, non-upgradeable, no-value ERC-1271 test
   contract scope, deployer/key procedure, address, retirement/abandonment
   policy, and gas-only faucet budget.

The deployment decision package may now be prepared. No deployment authority
was granted.

The EOA and contract wallet must be pre-provisioned as no-funds test
Credentials. Codex must not receive or store their keys, seed phrases, raw
signatures, or wallet telemetry.

## Evidence and acceptance

Acceptance evidence must contain only:

- decision document hash and approving owner;
- package version and resolved integrity;
- dependency/license/audit results;
- chain ID, contract address, block number/hash and finality label;
- verification method (`eip191_eoa_v1`, `eip1271_eip191_v1`,
  `eip712_eoa_v1`, or `eip1271_eip712_v1`);
- challenge/proof/signature reference hashes, never raw values;
- session invalidation/logout Event references;
- E2E timestamps, result, expiry, and rollback confirmation;
- `productionFundsMoved: false`.

The connector dependency and RPC expansion are approved only under this exact
scope. Contract deployment and live ERC-1271 E2E remain blocked until the
separate deployment decision is approved or an existing approved contract
wallet is supplied.
