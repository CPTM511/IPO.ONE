# M2A-008 exact Base Sepolia retry profile 002

Status: `FOUNDER-AUTHORIZED RECOVERY — CI-GATED`

Decision date: 2026-08-24

Deployment approval reference: `M2A-008-DEPLOY-20260824-002`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY`

## Recovery basis

The first exact run deployed only the approved Adapter before a runner
receipt-observation race failed closed. No Pool transaction was sent and the
first one-use signer was destroyed. The partial Adapter remains immutable
testnet Evidence and is not reused as the retry oracle. The Founder authorized
Codex to continue the M2A-008 work after supplying Base Sepolia test gas.

## Exact retry identities

- one-use deployer: `0x7235BC11F9D1cd72F8a65d2b3997524AeA4Df51d`;
- predicted oracle adapter: `0xA67DDDEA7DF4b084cE70B0c87C16621664C4fb98`;
- predicted secured pool: `0xe3a50a2BA033661F87C09A796f7ae4C8aDb93a1f`;
- pause guardian: `0x8a1E62C539B802c8a204382442cA7a8caC31f19E`;
- recovery authority: `0x730766ff23D3c4366f3314c8895330fC589AA546`.

The retry signer is fresh, private, unfunded and nonce zero. Its key is held
only in the isolated mode-0600 temporary boundary and must be destroyed after
success or terminal uncertainty. Role keys are not included or requested.

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
  `0x512d9c39aefbc7b905f2f03b4046f99f3b705b960ce96a8319a752ef9b664272`;
- configuration hash:
  `0x136416856b1f3abbc239f3b39e129f8c1debfdee454162466f82cd9d90e27a89`;
- market cap: `1000000000` test-USDC base units;
- borrower cap: `100000000` test-USDC base units;
- LTV: `5000` bps.

The runtime hash was computed on a read-only Base Sepolia fork with the retry
oracle address etched using the identically configured Adapter code.

## Permission boundary

Exactly two zero-native-value contract creations may occur after the exact
retry commit passes PR and post-merge Quality Gates and fresh private Gate A-C
Evidence binds that SHA, configuration, signer, observed balance, nonce and
gas. No mainnet, real funds, production credit, Human cash lending, custody,
second market, proxy, factory or Agent venue write is authorized.

Gate D still requires the genuine two-transaction deployment. Gate E still
requires finalized runtime, explorer, indexer/restart/replay, safe
pause/recovery and visible Human/LP/Risk plus Agent parity acceptance. Until
then the truthful result is `BLOCKED — NOT COMPLETE`.
