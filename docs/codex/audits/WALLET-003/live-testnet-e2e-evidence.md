# WALLET-003 live Testnet E2E evidence

Recorded: 2026-07-24  
Status: `VERIFIED_APPROVED_TESTNET_SCOPE`  
Decision ID: `WALLET-003-ERC1271-DEPLOY-001`

This is the redacted acceptance record for the Founder-approved Base Sepolia
deployment and wallet proofs. It is not a mainnet, production-funds, connector
release, or repeat-deployment authorization.

## Decision and safety bounds

- chain: `eip155:84532`;
- approved owner/deployer:
  `0x8c2cbe747578c03c385dfd4d2e45774e5541217e`;
- contract expiry: `2026-07-29T16:33:27.000Z`;
- approval expiry: `2026-09-22T23:59:59.999Z`;
- amended maximum wallet balance: `1000000000000000000` wei;
- amendment SHA-256:
  `179768eae10af3004b3c980677bc20554625226cd1c24800dc8274511edf7d9e`;
- amended decision record hash:
  `0xfb17fee9220d890340952b52869030c54ca3666e29b6c9eec86d27ebba05ce35`;
- transaction value allowed and observed: `0` wei;
- private key, seed phrase, raw signature, reusable session, and production
  funds accepted by Codex: `false`.

## Deployment observation

- transaction:
  `0xbf71b28617083602498c75a19a508831d37c97c14da1b15b5acf662675c55955`;
- contract:
  `0x0a635DcC3D3F9a742B2236f270Fb010585858068`;
- receipt block: `44547144`;
- receipt block hash:
  `0x00118583c6e52e1ecceb3dc10f908504a4010e4f9f47a635b1c3033a49d9f4ac`;
- recovered verified `safe` block: `44548616`;
- recovered verified `safe` block hash:
  `0xb9099186ac079b6dbabf6d56cc358068048ced8499d2886473000600a332c3c0`;
- deployed and expected instance bytecode Keccak-256:
  `0x001cc35f6652ce3e62d12bb128cbc2814195b633ee4030c3ac60cc8466962931`;
- gas limit: `314878`;
- maximum fee per gas: `12000000` wei;
- signed and broadcast by human wallet: `true`;
- production funds moved: `false`.

The final read-only inspection at `safe` block `44548695` observed balance
`500098388190089112` wei, below the approved cap, and reconfirmed the
constructor simulation and exact instance bytecode.

## Human EOA EIP-191

The approved EOA completed a real one-use SIWE challenge. The authenticated
protected read returned:

```text
wallet
siwe
eip191_eoa_v1
```

Two concurrent logout requests sharing one idempotency key both returned
`logged_out`. No raw signature or reusable session material was retained.

## Human contract-wallet EIP-191

The deployed ERC-1271 contract accepted the owner-operated EIP-191 signature
at an eligible revalidated Base Sepolia block. The protected read returned:

```text
wallet
siwe
eip1271_eip191_v1
```

Authority remained `read_only_no_funds`, and `productionFundsMoved` remained
`false`.

## Agent contract-wallet EIP-712

The same contract accepted the owner-operated EIP-712 Agent account proof.
The redacted result was:

```json
{
  "accountId": "eip155:84532:0x0a635dcc3d3f9a742b2236f270fb010585858068",
  "accountHash": "0x0763cb3d87c7317e0ae8538f48401cf7aec320253d7bff02e233291f2d12f9c9",
  "chainId": "eip155:84532",
  "proofHash": "0xdbc6083d2e732c93a4186dfdc94e24548980d91820f7d2674ef538b1cf90e4fe",
  "verificationMethod": "eip1271_eip712_v1",
  "schemaVersion": "agent_account_proof_result.v1",
  "rawSignaturePersisted": false,
  "credentialsIncluded": false,
  "productionFundsMoved": false
}
```

The injected wallet required `eth_signTypedData_v4` `params.data` to be a JSON
string. The handoff now supplies an explicit `EIP712Domain`, serializes the
transport payload, proves its digest is unchanged, and normalizes only the
approved 65-byte ECDSA recovery-byte variants before ERC-1271 verification.

## Verification and cleanup

- focused WALLET-003 suite: 47 passed, 0 failed;
- full repository gate with Node `v24.18.0`: 378 passed, 0 failed;
- schemas: 51 passed;
- OpenAPI: 21 paths and operations;
- migrations: 26 up/down pairs;
- product traceability: 13 destinations, 60 actions;
- final handoff state: no active session, two authentication events, no
  production funds moved;
- loopback handoff: stopped after evidence capture; in-memory challenges and
  sessions destroyed.

The mobile/QR connector remains `SPECIFIED_DISABLED`; this evidence does not
claim a real mobile/QR session or authorize runtime release enablement.
