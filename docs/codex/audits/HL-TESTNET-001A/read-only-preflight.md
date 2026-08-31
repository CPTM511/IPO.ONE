# HL-TESTNET-001A read-only preflight

Observed at: `2026-08-31T14:13:21.484Z`

## Results

- Offline Testnet authority gate: PASS, 10 checks, 0 blockers.
- Live endpoint: `https://api.hyperliquid-testnet.xyz/info`.
- Read-only requests: `meta`, `allMids`, `l2Book(BTC)`; all HTTP 200.
- BTC: asset index 3, size decimals 5, mid `78751.0`, best bid `78739.0`,
  best ask `78755.0`, 20 bid and 20 ask levels.
- `/exchange` requests: 0.
- Signer created or loaded: false.
- Economic nonce allocated: false.
- Venue mutation: false.

Response SHA-256 bindings:

- meta: `2025ef3b857fe9d1a012d8fe19f6dcbb4640985c92376bb089b7e9c55d3fca8b`;
- allMids: `b2a7c11ece151130a0dba086af84bc73201386981cb411131f190e81a12806f6`;
- BTC l2Book:
  `d629c23c52e8e63a06dfca4cf5556ec93aa1e15ef0bf7d53f8ef0b245362453d`.

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

## Limitation and STOP

The public market preflight does not prove a specific account. Hyperliquid's
read API requires the actual master or subaccount address; an API-wallet
address returns the wrong account view. No exact current master address was
available in the repository or existing browser session. Historical raw
addresses are deliberately absent and the historical signer is retired.

Verdict: `BLOCKED — NOT COMPLETE (EXACT TESTNET MASTER ADDRESS REQUIRED)`.

No `HL-TESTNET-001B` authority exists.
