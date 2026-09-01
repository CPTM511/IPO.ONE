# HL-TESTNET-001A read-only preflight

Closed at: `2026-08-31T15:39:25.079Z`

Market observed at: `2026-08-31T14:13:21.484Z`

Account observed at: `2026-08-31T15:39:25.079Z`

## Results

- Offline Testnet authority gate: PASS, 10 checks, 0 blockers.
- Runner regression tests: PASS, 18 passed, 0 failed.
- Live endpoint: `https://api.hyperliquid-testnet.xyz/info`.
- Read-only requests: `meta`, `allMids`, `l2Book(BTC)`; all HTTP 200.
- BTC: asset index 3, size decimals 5, mid `78751.0`, best bid `78739.0`,
  best ask `78755.0`, 20 bid and 20 ask levels.
- `/exchange` requests: 0.
- Signer created or loaded: false.
- Economic nonce allocated: false.
- Venue mutation: false.

Account-specific read-only results for the exact historical 002D Testnet
master account `0x8c2cbe747578c03c385dfd4d2e45774e5541217e`:

- canonical account-address hash:
  `0xda35abd4f31d5e8c9a5d87f289535c6164d1d587c49bb1deb206f906a1802038`;
  exact match to the historical 002D binding;
- `userRole`: `user`;
- account value: `998.989328` Testnet USDC;
- withdrawable: `998.989328` Testnet USDC;
- total notional and margin used: `0.0`;
- positions: 0;
- open orders: 0;
- subaccounts: 0 (`subAccounts` returned `null`).

Response SHA-256 bindings:

- meta: `2025ef3b857fe9d1a012d8fe19f6dcbb4640985c92376bb089b7e9c55d3fca8b`;
- allMids: `b2a7c11ece151130a0dba086af84bc73201386981cb411131f190e81a12806f6`;
- BTC l2Book:
  `d629c23c52e8e63a06dfca4cf5556ec93aa1e15ef0bf7d53f8ef0b245362453d`.
- userRole:
  `6b3061507ef8cc2ca95320f790a9f9ccb3c850ae081df4b6f6e56e40d57203e4`;
- clearinghouseState:
  `f18752cbca04fd6e58e4b2530602a5b4fbffc0e23475a63260b5d27526d6401f`;
- openOrders:
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`;
- subAccounts:
  `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b`.

## Code and configuration binding

- runtime baseline:
  `c4cc81f09f1c7aeb78871373d29ed581e428daca`;
- combined runner source binding:
  `0xc0939601a86f57f4740e2eb86eebb339ca3ea2b1740b78cb381141fc627eded5`;
- gate SHA-256:
  `54e493e2c6d1ab28354996ed6832c7fed34c88f3ab1c5c92392e4d51cefb83fa`;
- CLI SHA-256:
  `7fb657488b5eb9a9dc05f974d37d367492b8cbe23e9e2e5dd8e7951e91bc98cc`;
- live runner SHA-256:
  `333c038b250df20ebb5fbfa6db8bdcff8f537350e46940662ac6cbd92b609b55`;
- isolated signer SHA-256:
  `885a801c270c81e77308a02bbed1f0b7168d63a32be5ac9f141893c54ade90fb`;
- launch policy 1.4.0 SHA-256:
  `e7e72c74941c4cdbc9c09fe49cc9fc9759bc60baed7758b4c9f1cca3ecbadb2a`.

## Verdict and STOP

The exact public master-account address was copied without accessing private
key material. Its canonical hash exactly matches the historical 002D binding,
and all required account-specific `/info` reads pass the proposed baseline.
The historical API-wallet signer remains retired and is not reusable.

`HL-TESTNET-001A`: `PASS — READ-ONLY PREFLIGHT COMPLETE`.

`HL-TESTNET-001B`: `BLOCKED — NOT COMPLETE (EXPLICIT FOUNDER SIGNED-RUN
APPROVAL REQUIRED)`.

No signer exists for this run. No signature, economic nonce, `/exchange`
request or Venue mutation occurred.
