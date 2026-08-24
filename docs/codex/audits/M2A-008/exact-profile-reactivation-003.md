# M2A-008 exact Base Sepolia retry profile 003

Status: `FOUNDER-AUTHORIZED RECOVERY — CI-GATED`

Decision date: 2026-08-24

Deployment approval reference: `M2A-008-DEPLOY-20260824-003`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY`

## Recovery basis

The second exact run deployed only the approved Adapter before the primary RPC
returned a mined receipt while its transaction read still exposed pending block
metadata. No Pool transaction was sent and the second one-use signer was
destroyed. Later two-RPC reconciliation proved the exact transaction, receipt,
address and runtime hash. The isolated Adapter is immutable testnet Evidence;
it is not reused as the retry oracle.

The runner now polls the read-only transaction observation for bounded mined
block metadata after receiving the receipt. It never sends a second transaction
during that wait and still fails closed at the deadline or on any exact-field
drift.

## Exact retry identities

- one-use deployer: `0xacae37604E98eB1867D05DB48b135CF9899b60ef`;
- predicted oracle adapter: `0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19`;
- predicted secured pool: `0x9Da8d04D0E989811aB59a37aEf3C9E548F242362`;
- pause guardian: `0x8a1E62C539B802c8a204382442cA7a8caC31f19E`;
- recovery authority: `0x730766ff23D3c4366f3314c8895330fC589AA546`.

The third signer is fresh, private, unfunded and nonce zero. Its key remains
only in the isolated mode-0600 temporary boundary and must be destroyed after
success or terminal uncertainty. Neither prior signer is reusable.

## Exact retry binding

- chain: Base Sepolia `eip155:84532`;
- WETH: `0x4200000000000000000000000000000000000006`;
- Circle test USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`;
- Chainlink ETH/USD feed: `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`;
- adapter creation bytecode hash:
  `0xc603db2c905b3641ea9454745e48d6d55c0933f74a0ec850de8e98df6736ac4b`;
- adapter runtime bytecode hash:
  `0x1e6df0c6c6e5f479e2b0bb8fa4f7856b99dbbec171fe3159b3a2539b9ac17d80`;
- pool creation bytecode hash:
  `0xe3398763f0187a0ca40f99b51ed5b2f9901e773235870f1634cbee4530690601`;
- exact retry pool runtime bytecode hash:
  `0xd65ee592be35018f33af1e2a538ead22f15e1bb577e84583645cb76bf768a198`;
- configuration hash:
  `0x3c6ad8d23ecb794f702d6102075cd06d3d0b3b7261d7a5d1c86f6b7da8b67b8c`;
- market cap: `1000000000` test-USDC base units;
- borrower cap: `100000000` test-USDC base units;
- LTV: `5000` bps.

## Permission boundary

Exactly two zero-native-value contract creations may occur only after the
retry commit passes PR and post-merge Quality Gates and fresh private Gate A-C
Evidence binds that SHA, configuration, signer, observed balance, nonce and
gas. No mainnet, real funds, production credit, Human cash lending, custody,
second market, proxy, factory or Agent venue write is authorized.

Gate D still requires the genuine two-transaction deployment. Gate E still
requires finalized runtime, explorer, indexer/restart/replay, safe
pause/recovery and visible Human/LP/Risk plus Agent parity acceptance. Until
then the truthful result is `BLOCKED — NOT COMPLETE`.
