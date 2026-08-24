# M2A-008 missing Pool recovery 004

Status: `FOUNDER-AUTHORIZED RECOVERY — CI-GATED`

Decision date: 2026-08-24

Deployment approval reference: `M2A-008-DEPLOY-20260824-004`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY`

## Recovery basis

The third exact run created the approved Adapter at
`0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19` but sent no Pool transaction.
The one-use signer was destroyed. Independent reads through Base and PublicNode
RPCs later agreed on the exact sender, nonce-zero calldata, successful receipt,
block `45907914`, block hash, contract address and runtime bytecode hash. That
immutable Adapter is therefore retained as cumulative testnet deployment
Evidence; neither its destroyed signer nor the two earlier isolated Adapters is
reusable.

The recovery runner sends only the missing Pool creation. Before signing, it
revalidates the historical Adapter transaction and receipt through both RPCs,
requires finalized identical Adapter code and configuration, verifies the
fresh Pool address is empty, and binds exact signer balance, nonce and gas.

## Exact recovery identities

- retained oracle Adapter: `0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19`;
- retained Adapter transaction:
  `0x9653196281e29f96476a53aed2b21a2a6ee14794987dd1aeaeb98df376c8721f`;
- fresh Pool-only deployer: `0x53cEeBF4D8454939c1Aa5BC21D196deD801439F1`;
- predicted secured Pool: `0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da`;
- pause guardian: `0x8a1E62C539B802c8a204382442cA7a8caC31f19E`;
- recovery authority: `0x730766ff23D3c4366f3314c8895330fC589AA546`.

The Pool signer was observed unfunded and nonce zero through both RPCs. Its
private key remains in the isolated mode-0600 temporary boundary and must be
destroyed after success or terminal uncertainty.

## Exact recovery binding

- chain: Base Sepolia `eip155:84532`;
- WETH: `0x4200000000000000000000000000000000000006`;
- Circle test USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`;
- Chainlink ETH/USD feed: `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`;
- Adapter runtime bytecode hash:
  `0x1e6df0c6c6e5f479e2b0bb8fa4f7856b99dbbec171fe3159b3a2539b9ac17d80`;
- Pool creation bytecode hash:
  `0xe3398763f0187a0ca40f99b51ed5b2f9901e773235870f1634cbee4530690601`;
- Pool runtime bytecode hash:
  `0xd65ee592be35018f33af1e2a538ead22f15e1bb577e84583645cb76bf768a198`;
- configuration hash:
  `0x3c6ad8d23ecb794f702d6102075cd06d3d0b3b7261d7a5d1c86f6b7da8b67b8c`;
- market cap: `1000000000` test-USDC base units;
- borrower cap: `100000000` test-USDC base units;
- LTV: `5000` bps.

## Permission boundary

Exactly one zero-native-value Pool creation may occur only after this recovery
commit passes PR and post-merge Quality Gates and fresh private Gate A-C
Evidence binds that SHA, existing Adapter proof, configuration, signer,
observed balance, nonce and gas. No Adapter creation, mainnet, real funds,
production credit, Human cash lending, custody, second market, proxy, factory
or Agent venue write is authorized.

Gate E still requires finalized runtime, explorer, indexer/restart/replay, safe
pause/recovery and visible Human/LP/Risk plus Agent parity acceptance. Until
then the truthful result is `BLOCKED — NOT COMPLETE`.
