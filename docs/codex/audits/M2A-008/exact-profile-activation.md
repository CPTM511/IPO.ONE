# M2A-008 exact Base Sepolia profile activation

Status: `FOUNDER_APPROVED EXACT PROFILE — CI-GATED`

Decision date: 2026-08-24

Deployment approval reference: `M2A-008-DEPLOY-20260824-001`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY`

## Context and authority

The Founder supplied the final two public testnet role addresses after approving
the M2A-008 testnet governance correction and closed two-transaction runner.
This record activates one exact Base Sepolia profile only if the exact commit's
pull-request and post-merge `main` Quality Gates pass. Passing policy validation
does not bypass private Gate A-C Launch Evidence or runner preflight.

## Exact public identities

- one-use deployer: `0xeEe5EA8826F5c9572358dbc73501E8C8283571b1`;
- predicted oracle adapter: `0x1B6e2D641d783792aB03e11C8E56Fc381e6000aF`;
- predicted secured pool: `0x1d106a3590c0364b145146B3829cFC8825Da916F`;
- pause guardian: `0x8a1E62C539B802c8a204382442cA7a8caC31f19E`;
- recovery authority: `0x730766ff23D3c4366f3314c8895330fC589AA546`.

The two Founder-controlled role addresses are distinct and were supplied after
the explicit requirement that they use distinct private keys. No role key,
deployer key, seed phrase or signing secret is included in this record, Git,
Launch Evidence or command output.

## Gate A — code integrity

- compiler: Solidity `0.8.30`, optimizer `200`, Cancun EVM, metadata hash off;
- adapter source SHA-256:
  `29fcf0d1775b2d7be2e4c478cbaa4e072e4bb63394cae648ac0027411bb5ed34`;
- pool source SHA-256:
  `7982c23b405958a85ae3035f3e4ba9c69b92a46ade9fcabd3f02b5ec741028ca`;
- pool math source SHA-256:
  `7eb4731af2ded7e4a1fefb22352e4b4100e275cb702516ab09233d3376382f09`;
- adapter creation bytecode hash:
  `0xc603db2c905b3641ea9454745e48d6d55c0933f74a0ec850de8e98df6736ac4b`;
- exact adapter runtime bytecode hash after immutable substitution:
  `0x1e6df0c6c6e5f479e2b0bb8fa4f7856b99dbbec171fe3159b3a2539b9ac17d80`;
- pool creation bytecode hash:
  `0xe3398763f0187a0ca40f99b51ed5b2f9901e773235870f1634cbee4530690601`;
- exact pool runtime bytecode hash after immutable substitution:
  `0xfa921161401d05ed267da2253df1d94b8b92be3a91bcabe47ccf8e0c2bb82fc5`.

The exact runtime hashes were computed by deploying the fixed constructor
arguments on a read-only Base Sepolia fork. The fork test etches the exact
predicted adapter address with the identically configured adapter code before
constructing the pool, so every immutable that affects deployed runtime code is
covered without sending a transaction.

Local toolchain, 25 Foundry unit/fuzz/invariant checks, the 13-test focused
M2A-008 suite and the explicit Base Sepolia fork test passed before this
activation. Gate A becomes current Launch Evidence only when the exact final
commit also has green GitHub Quality Gate results.

## Gate B — exact configuration

- chain: Base Sepolia `eip155:84532`;
- WETH: `0x4200000000000000000000000000000000000006`;
- Circle test USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`;
- Chainlink ETH/USD feed: `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`;
- source: `chainlink_base_sepolia_eth_usd.v1`;
- source ID:
  `0xfa58e12cfda5fc3e0ed258c4fe0ddd64458ea44ac5af9ca594411da8e4291280`;
- market debt cap: `1000000000` test-USDC base units;
- borrower debt cap: `100000000` test-USDC base units;
- LTV: `5000` bps;
- configuration hash:
  `0xa95b15c4f342d8d8f17f1152ad2a3590045ea965f4ce49044304f2df3f2a9933`.

Two independent RPCs agreed on chain, dependency code hashes, token metadata,
oracle round/value/time and the unfunded deployer's nonce zero before this
activation.

## Gate C — authority and signer safety

- the deployer is a fresh M2A-008-only local key under the private temporary
  boundary, currently unfunded with nonce zero;
- deployer, predicted contracts, roles, assets and feed are pairwise distinct;
- exactly two contract creations, zero constructor native value;
- maximum faucet balance `0.1` Base Sepolia ETH;
- maximum total gas cost `0.02` Base Sepolia ETH;
- signer destruction is mandatory after success or terminal uncertainty;
- `mainnetAuthorized=false`, `realFundsAuthorized=false`, test assets only.

The exact observed funding balance and live gas boundary are bound later in the
private mode-0600 decision immediately before signing. No transaction is
authorized if Gate A-C Evidence, either RPC, nonce, balance, gas, oracle,
predicted-address emptiness or policy binding drifts.

## Non-goals and rollback

No mainnet, real funds, production credit, Human cash lending, Agent venue
execution, custody, second market, proxy, factory or unrestricted transfer is
authorized. Independent Security review remains mandatory for any mainnet or
real-value profile. Rollback disables this exact profile, pauses new risk,
stops ingestion and performs read-only dual-RPC reconciliation without retrying
an unknown transaction.

## Completion boundary

This record can support Gates A-C after its exact final SHA and CI run are
bound in private Launch Evidence. Gate D still requires the genuine two-
transaction deployment. Gate E still requires finalized runtime, explorer,
indexer/restart/replay, pause/recovery and visible Human/LP/Risk plus Agent
parity acceptance. Until then M2A-008 remains `BLOCKED — NOT COMPLETE`.
