# WALLET-003 ERC-1271 deployment preflight evidence

Recorded: 2026-07-24 Asia/Shanghai  
Decision ID: `WALLET-003-ERC1271-DEPLOY-001`  
Status: `COMPLETED_VERIFIED_SAFE`

This evidence records the approved offline decision preflight, read-only Base
Sepolia checks, and the later bounded human-signer acceptance state. It is not
a production authorization.

## Approved decision preflight

- decision file: one mode-`0600` regular JSON file below `/private/tmp`;
- approval timestamp: `2026-07-23T16:16:49.729Z`;
- approval expiry: `2026-09-22T23:59:59.999Z`;
- contract expiry: `2026-07-29T16:33:27.000Z`;
- decision record hash:
  `0xfa7d8bea6adc69ef0503f867ea78513ab064556640bcdfba855d7c7b6ffb6e35`;
- owner/deployer address reference hash:
  `0x0d402e26a3057ce2856e0d838b86f9636d54cae6bf2856a97581661da52e6e27`;
- Human EIP-191 approved: `true`;
- Agent EIP-712 approved: `true`;
- gas limit: `500000`;
- maximum fee per gas: `5000000000` wei;
- original maximum faucet balance: `10000000000000000` wei;
- Founder-approved balance-cap amendment:
  `docs/security/WALLET_003_ERC1271_DEPLOYMENT_BALANCE_CAP_AMENDMENT_001.md`;
- amendment SHA-256:
  `179768eae10af3004b3c980677bc20554625226cd1c24800dc8274511edf7d9e`;
- amended maximum faucet balance: `1000000000000000000` wei.

The offline preflight independently recompiled the contract and matched:

- source SHA-256:
  `sha256:d622a3c841ec5d022ae3aa1dec312459da3492b5897e4bc05532a4e214190787`;
- creation bytecode Keccak-256:
  `0xfc8b0043879c1f3868149fb616a1f11f939b4c96f423d18265f5be46a24217d2`;
- deployed bytecode Keccak-256:
  `0x24fbe2a0332e8b875babde91f1995ceab8e0fb500b66de8047658adca0459de1`.

The approved deployed-bytecode hash above is the compiler template. Because
the contract has immutable `owner` and `expiresAt` fields, a correct onchain
instance cannot have the same hash. The preflight now materializes both
approved immutable values into every compiler-reported immutable reference and
derives the instance-specific expected runtime hash offline. For the approved
owner and expiry, that hash is:

```text
0x001cc35f6652ce3e62d12bb128cbc2814195b633ee4030c3ac60cc8466962931
```

This distinction was confirmed by a read-only Base Sepolia `eth_call`
constructor simulation at `safe`: the returned 932-byte runtime matched the
offline materialized instance hash and, correctly, did not match the immutable
template hash. Chain acceptance must compare deployed code to the derived
instance hash while retaining the approved template hash as compiler evidence.

The returned flags were:

```text
keyMaterialAccepted: false
transactionBuilt: false
transactionSigned: false
transactionBroadcast: false
productionFundsMoved: false
```

## Read-only Base Sepolia classification

Only the approved primary endpoint and read methods were used:

```text
https://sepolia.base.org/
eth_chainId
eth_getBlockByNumber
eth_getCode
```

Result:

- reported chain ID: `84532`;
- finality tag: `safe`;
- pinned block number: `44528125`;
- pinned block hash:
  `0x63e1902e011dd949ca4f8dbf1c9ba748cf9eb1c6c7126dda62015d141ed2b606`;
- block timestamp: `2026-07-23T16:35:38.000Z`;
- `eth_getCode` at the pinned block: `0x`;
- classification: `EOA`;
- pinned block number and hash after re-read: unchanged.

No balance, nonce, transaction history, signature, `eth_call`, write method,
batch request, redirect, dynamic endpoint, mainnet, or production system was
accessed.

## Human-signer completion

The complete public decision has passed offline preflight, and the supplied
owner/deployer address is an EOA at the recorded Base Sepolia `safe` block.
The post-approval continuation now has a loopback-only human signer handoff.
It keeps the exact constructor calldata in process memory only, refuses to
build an unsigned transaction until the deployer balance is within the
approved cap and sufficient for the bounded maximum cost, and leaves signing
and broadcast to the browser wallet.

The first post-faucet live inspection reported `100000000000000` wei and was
within the approved cap. The approved public EOA then completed one real
EIP-191 challenge and the server returned an authenticated read-only session
with AMR `wallet`, `siwe`, and `eip191_eoa_v1`. A protected read succeeded, and
two concurrent requests sharing one idempotency key both returned
`logged_out`. Raw challenges, signatures, cookies, and reusable session
material were not copied into repository evidence.

At `2026-07-24T02:30:53.160Z`, a later read-only refresh reported `0.5001 ETH`,
which exceeded the original cap. The Founder then explicitly approved an
amended maximum balance of `1 ETH`. The revised closed decision record kept
mode `0600`, passed all 9 focused preflight/handoff tests, and produced redacted
decision-record hash
`0xfb17fee9220d890340952b52869030c54ca3666e29b6c9eec86d27ebba05ce35`.

A post-amendment read-only refresh at Base Sepolia `safe` block `44546103`
reported:

- constructor simulation matches:
  `0x001cc35f6652ce3e62d12bb128cbc2814195b633ee4030c3ac60cc8466962931`;
- deployer classification: `EOA`;
- deployer balance: `500100000000000000` wei;
- maximum faucet balance: `1000000000000000000` wei;
- balance within approved cap: `true`;
- transaction signed/broadcast: `false`;
- production funds moved: `false`.

The Founder-operated wallet signed and broadcast the exact zero-value bounded
deployment after the server and browser balance gates passed.

Verified result:

- transaction hash:
  `0xbf71b28617083602498c75a19a508831d37c97c14da1b15b5acf662675c55955`;
- contract:
  `0x0a635DcC3D3F9a742B2236f270Fb010585858068`;
- receipt block: `44547144`;
- receipt block hash:
  `0x00118583c6e52e1ecceb3dc10f908504a4010e4f9f47a635b1c3033a49d9f4ac`;
- recovered verified `safe` block: `44548616`;
- deployed bytecode Keccak-256:
  `0x001cc35f6652ce3e62d12bb128cbc2814195b633ee4030c3ac60cc8466962931`;
- transaction value: `0` wei;
- gas limit: `314878`;
- maximum fee per gas: `12000000` wei;
- human wallet signed/broadcast: `true`;
- production funds moved: `false`.

At the final read-only inspection, block `44548695` reported balance
`500098388190089112` wei, below the approved `1000000000000000000` wei cap;
the constructor simulation and deployed instance bytecode still matched. No
signer or private credential was supplied to Codex. The live authentication
proofs are recorded separately in `live-testnet-e2e-evidence.md`.
