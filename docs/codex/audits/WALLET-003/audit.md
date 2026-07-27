# WALLET-003 implementation audit

Date: 2026-07-24  
Task status: `VERIFIED_APPROVED_TESTNET_SCOPE`  
Source branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Human approval owner: IPO.ONE Founder  
Approval expiry: 2026-09-22  
Approval decision SHA-256:
`bcc8909712748c729969487ca9024843feea9b18e68b50d6189fa039dd1f8e92`

The approved WALLET-003 Testnet scope is verified. Exact dependency
resolution, temporary PostgreSQL including a physical server restart,
loopback transport, the full repository gate, one real Base Sepolia EOA
EIP-191 flow, one real ERC-1271 EIP-191 flow, and one real ERC-1271 Agent
EIP-712 flow have completed. The approved minimal contract was deployed by
the Founder-operated wallet as a zero-value Base Sepolia transaction and was
accepted only after its receipt, `safe` block, and instance bytecode were
revalidated. No private key, raw signature, reusable session, or production
funds entered Codex or repository evidence.

The mobile/QR connector remains `SPECIFIED_DISABLED`. The exact dependency,
Community License acceptance, Origin, Relay, deterministic same-origin
bundle, storage boundary, and lifecycle integration are reviewed, but no
production release or real mobile/QR session is claimed. This disabled
release boundary does not invalidate the completed desktop-injected-wallet
and contract-wallet Testnet acceptance scope.

## Source and prerequisite state

The observed branch and commit matched the package source identity. The
worktree already contained the user-accepted, uncommitted outputs of
AUDIT-001, PRODUCT-002, WALLET-001, and WALLET-002. Those changes were
preserved. `source-drift.md` and `pre-change-mapping.md` record the exact
pre-change state.

The Founder explicitly approved:

- exact `@walletconnect/ethereum-provider@2.23.10`;
- the installed WalletConnect Community License through
  `2026-09-22T23:59:59.999Z`;
- exact browser Origin `https://ipo.one`;
- exact Relay `wss://relay.walletconnect.org`;
- opening Reown Dashboard for Founder-operated creation or selection of one
  Testnet Project;
- Base Sepolia and X Layer Testnet connector scope;
- the seven named wallet methods and bounded event scope;
- exact primary/secondary ERC-1271 RPC endpoints and four read methods;
- `/private/tmp` temporary PostgreSQL;
- preparation, but not deployment, of one minimal ERC-1271 test contract.

No approval was granted for a deployment, key, signer custody, faucet
transaction, mainnet, production identity, production dependency, release,
transaction/funds method, or real funds.

Subsequent Founder approvals separately authorized the bounded Base Sepolia
deployment handoff, a maximum Testnet wallet balance of
`1000000000000000000` wei, the human-operated zero-value deployment
transaction, and the Human EIP-191 and Agent EIP-712 acceptance proofs. Those
later approvals did not authorize mainnet, production funds, signer custody,
arbitrary wallet methods, or release enablement.

## Implemented contracts and runtime

### Wallet verification result

`schemas/v2/wallet-signature-verification.schema.json` defines one closed,
redacted result. It explicitly distinguishes:

- `eip191_eoa_v1`;
- `eip1271_eip191_v1`;
- `eip712_eoa_v1`;
- `eip1271_eip712_v1`.

It carries only account/challenge/signature reference hashes, exact chain,
block number/hash, Provider slot, finality label, wallet type, and safety
flags. Raw signature, message, typed data, RPC payload, credential, and funds
authority are excluded.

### Dedicated ERC-1271 adapter

`modules/chain-adapter/src/erc1271-signature-verifier.js`:

- admits only CAIP-2 `eip155:84532` and `eip155:1952`;
- contains only the four exact approved read methods:
  `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, and `eth_call`;
- fixes both approved RPC slots per chain and rejects URL, credential, query,
  fragment, redirect, and caller endpoint drift;
- limits each response to 64 KiB, each signature to 4 KiB, each Provider
  attempt to five seconds, and failover to two slots;
- allows at most one `eth_call` in one verification invocation and does not
  replay it through the secondary Provider after an ambiguous call result;
- classifies the address using `eth_getCode` at one pinned block;
- uses a revalidated Base Sepolia `safe` block;
- permits X Layer `latest` only as inclusion-only conformance and rejects it
  as accepted authentication evidence;
- ABI-encodes `isValidSignature(bytes32,bytes)` at the same block;
- accepts only the exact ABI-encoded `0x1626ba7e` bytes4 result;
- re-reads the fixed block number and rejects a changed hash;
- never invokes EOA recovery after non-empty contract code selects the
  contract path;
- performs no transaction, subscription, batch, dynamic RPC, balance,
  history, token, transfer, or approval call.

The production closed-pilot composition now injects this verifier for Human
SIWE and Agent EIP-712 proof adapters. It makes network calls only when an
approved wallet proof is submitted; this code change is not a deployment.
Human sessions record the explicit verification method in `amr`. Agent proof
request bounds were widened only from a fixed 65-byte EOA signature to
65–4096-byte closed hex data; the EOA-only adapter still enforces canonical
65-byte low-s signatures.

### Fixed mobile/QR boundary

`apps/web/src/mobile-wallet-connector.js` is an IPO.ONE-owned, default-disabled
adapter. It:

- requires the exact approved package name and `2.23.10` from a fixed loader;
- refuses initialization unless that loader attests that the supplied
  memory-only store was actually applied;
- admits only exact runtime Project ID format, exact HTTPS Origin, and the
  approval expiry;
- keeps Project ID and pairing state out of all snapshots;
- exposes only exact 84532/1952 account, chain-switch/add, EIP-191, and
  EIP-712 request shapes;
- rejects mainnet, arbitrary chain metadata/RPC, transaction, transfer,
  approval, balance/history, and unknown methods;
- exposes only account, chain, connect, and disconnect lifecycle events;
- maps only account/chain updates from the bounded session-event surface;
- clears in-memory connector storage on disconnect/dispose.

The Provider registry accepts this exact connector only through explicit
registration and selection. Its Provider facade enters the same WALLET-002
account/chain/disconnect invalidation lifecycle as desktop EIP-1193. It is not
bootstrapped by `app.js`; current CSP has not been widened for an unreviewed
relay. Product traceability therefore correctly remains
`SPECIFIED_DISABLED`.

The exact approved package is now installed and locked. Review of its real
storage interface found that IPO.ONE's initial memory store lacked
`getEntries` and could not retain the package's JSON-compatible values. The
store now implements the complete bounded interface, and a fixed loader proves
that the real provider retained that exact object at its core storage boundary.
The loader disables Provider ping and telemetry and fails closed on storage
substitution. The adapter passes the exact package-default relay
`wss://relay.walletconnect.org`; current enforced `connect-src 'self'` denies
that egress until a separate CSP/runtime approval.

This is installation for review, not enablement. The workspace now resolves
the optional AppKit/Coinbase branch to exact `axios@1.18.0`; the production
audit reports zero vulnerabilities and the full 378-test compatibility gate
passes. The installed WalletConnect Community License still requires separate
human/legal acceptance. See `dependency-review.md`.

### Minimal Testnet deployment

Approved and deployed on Base Sepolia:

- source:
  `contracts/IpoOneMinimalErc1271TestWalletV1.sol`;
- source SHA-256:
  `d622a3c841ec5d022ae3aa1dec312459da3492b5897e4bc05532a4e214190787`;
- creation bytecode Keccak-256:
  `0xfc8b0043879c1f3868149fb616a1f11f939b4c96f423d18265f5be46a24217d2`;
- deployed bytecode Keccak-256:
  `0x24fbe2a0332e8b875babde91f1995ceab8e0fb500b66de8047658adca0459de1`;
- compiler: exact `solc 0.8.30`, optimizer 200 runs, metadata hash disabled.

The contract has one immutable owner, automatically expires within seven days,
accepts only canonical low-s 65-byte owner signatures, rejects native value,
and has no call/execution, transfer, approval, custody, lending, upgrade,
administration, or self-destruct path.

The separate decision package is
`docs/security/WALLET_003_MINIMAL_ERC1271_DEPLOYMENT_DECISION_PACK_v0.1.md`.
Its SHA-256 is
`4d015b8f0d3a91ba1fc8397496449698d25fa80dbaba340cc9262c09c7d915ae`.
The package file remains unchanged so its approved hash stays stable.
`deployment-approval-followup.md` records the policy approval.
`erc1271-deployment-preflight-evidence.md` records the later complete,
redacted runtime decision preflight and read-only EOA classification.

An offline, no-sign/no-broadcast continuation was added:

- `schemas/v2/wallet-003-erc1271-deployment-decision.schema.json` defines the
  complete, closed approval record;
- `deploy/testnet/prepare-erc1271-deployment.mjs` accepts only one mode-`0600`
  regular JSON file below `/private/tmp`, rechecks every fixed policy and
  artifact hash, and returns only redacted address hashes;
- the preflight contains no transaction builder, signer, RPC writer, faucet
  call, or deployment action and reports `transactionBuilt: false`,
  `transactionSigned: false`, and `transactionBroadcast: false`.

The post-approval chain preflight found and fixed an immutable-bytecode
verification defect before deployment. The approved deployed-bytecode hash is
the compiler template, while the actual instance contains the approved
`owner` and `expiresAt` values at compiler-reported immutable offsets. The
offline preflight now derives an instance-specific runtime hash without
changing the contract, approved template hash, decision record, parameters, or
authority. A read-only Base Sepolia constructor simulation returned the same
instance hash. Onchain acceptance must use that derived hash.

After that correction, the approved signer continuation added:

- `deploy/testnet/erc1271-deployment-handoff.mjs`, which builds only the exact
  zero-value constructor transaction in memory, estimates and caps gas/fees,
  and verifies the actual mined transaction and instance code before accepting
  a `safe` result;
- `deploy/testnet/start-erc1271-human-handoff.mjs`, a loopback-only Human
  wallet page that composes real EOA/contract SIWE, protected read, idempotent
  invalidation/logout, and Agent EIP-712 verification while leaving every
  wallet signature and the deployment confirmation to the accountable human.

The constructor calldata existed only in the loopback handoff process and is
excluded from repository evidence and logs. The Founder-operated wallet
signed and broadcast transaction
`0xbf71b28617083602498c75a19a508831d37c97c14da1b15b5acf662675c55955`.
It deployed
`0x0a635DcC3D3F9a742B2236f270Fb010585858068` at block `44547144`.
The zero transaction value, bounded gas fields, receipt, `safe` recovery, and
instance bytecode hash
`0x001cc35f6652ce3e62d12bb128cbc2814195b633ee4030c3ac60cc8466962931`
were independently checked by the handoff server. The public EOA remains only
in the mode-`0600` temporary decision file; repository evidence retains no
private credential or raw signature.

## Migrations, catalog, AuthZ, admission, ledger, and funds

- migrations added by WALLET-003: none;
- Tenant operation IDs added/removed: none;
- AuthZ capabilities or policies changed: none;
- admission or rate policy changed: none;
- Ledger, Obligation, Event, Evidence, outbox, or reconciliation model changed:
  none;
- production identity or release policy changed: none;
- production funds moved: none;
- Testnet movement: zero-value deployment transaction with bounded gas only;
- contract deployed: one approved, expiring Base Sepolia ERC-1271 test
  instance;
- key provisioned, generated, received, stored, or destroyed: none;
- WalletConnect Project ID committed or received by Codex: none.

The existing Agent proof request/result schemas changed only to admit a bounded
contract-wallet signature and the `eip1271_eip712_v1` method.

## Test evidence

### PASS

Final task-focused command:

```text
node --test \
  apps/web/test/mobile-wallet-connector.test.js \
  apps/web/test/wallet-provider-registry.test.js \
  apps/web/test/walletconnect-browser-bundle.test.js \
  modules/chain-adapter/test/erc1271-signature-verifier.test.js \
  modules/chain-adapter/test/evm-account-proof.test.js \
  modules/authentication/test/human-wallet-bff.test.js \
  contracts/test/minimal-erc1271-test-wallet.test.js \
  deploy/testnet/test/erc1271-deployment-preflight.test.js \
  deploy/testnet/test/erc1271-deployment-handoff.test.js
```

Result: 47 tests passed, 0 failed.

Covered behavior includes:

- EOA versus contract classification;
- Human EIP-191 and Agent EIP-712 method propagation;
- wrong chain, timeout, oversize response, malformed code, wrong magic,
  Provider failure, block reorg, and stale/ineligible finality;
- one contract call without secondary replay after ambiguous result;
- X Layer inclusion-only rejection for authentication;
- exact real-package dependency/version/storage loader and substitution
  fail-closed behavior;
- exact mobile chain/method/event bounds;
- deterministic same-origin browser artifact, served license copy, and
  explicit relay pin;
- explicit mobile Provider selection;
- shared account-change server invalidation;
- deterministic minimal contract compilation and forbidden ABI/source checks;
- bounded unsigned deployment preparation and exact mined-instance
  observation without signing or broadcast authority.

Exact repository runtime gate:

```text
PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:\
/opt/homebrew/bin:/usr/bin:/bin pnpm check
```

Result: PASS.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: PASS;
- schemas: PASS, 51 contracts;
- OpenAPI: PASS, 21 paths/operations;
- migrations: PASS, 26 up/down pairs;
- deploy/launch/approval/abuse/operations policies: PASS;
- Tenant protocol: PASS, 38 operations;
- product traceability: PASS, 13 destinations / 60 actions;
- local JavaScript suite: 378 passed, 0 failed.

Temporary PostgreSQL gate:

```text
pnpm run test:postgres
```

Result: 70 passed, 0 failed. PostgreSQL 17.10 ran in one isolated
`/private/tmp` cluster with no TCP listener and no Homebrew service. The first
run exposed stale `0025` migration expectations and an invalid `FOR UPDATE`
privilege demand on the append-only invalidation table. Both were fixed
without broadening database-role privileges.

The actual PostgreSQL server process was then stopped and restarted from the
same data directory. All 26 migration records persisted, and the focused
durable Human/Wallet authentication suite passed 5/5 after that physical
restart. The server was stopped normally after testing.

Loopback transport gates:

```text
node --test apps/tenant-api/test/transport-conformance.test.mjs
pnpm run test:transport
```

Results: focused 6/6 and full transport 49/49. Tests listened only on
`127.0.0.1`.

Post-approval offline deployment-preflight command:

```text
node --test \
  deploy/testnet/test/erc1271-deployment-preflight.test.js \
  deploy/testnet/test/erc1271-deployment-handoff.test.js
```

Result: 9 passed, 0 failed. The tests cover the approved happy path, redacted
output, exact schema, unknown-field and mainnet rejection, artifact drift,
gas/faucet caps, expiry, at-least-one-E2E selection, strict duplicate-key JSON,
mode-`0600` and non-symlink file enforcement, and absence of signer/broadcast
primitives. They also prove instance-specific immutable hashing, exact
zero-value unsigned transaction construction, cap enforcement, and post-mine
transaction/code observation.

The unchanged deployment decision package SHA-256 was rechecked as:

```text
4d015b8f0d3a91ba1fc8397496449698d25fa80dbaba340cc9262c09c7d915ae
```

`git diff --check`: PASS.

### LIVE READ-ONLY PREFLIGHT PASS

The complete mode-`0600` decision passed:

```text
node deploy/testnet/prepare-erc1271-deployment.mjs \
  --decision-file /private/tmp/ipo-one-wallet003-erc1271-decision.json
```

Result: `ready_for_human_signer_handoff`. Source, creation-bytecode, and
deployed-bytecode hashes matched the approved package. The redacted decision
record hash is
`0xfa7d8bea6adc69ef0503f867ea78513ab064556640bcdfba855d7c7b6ffb6e35`.

The approved Base Sepolia primary RPC returned chain ID `84532`. At pinned
`safe` block `44528125`,
`eth_getCode` for the approved owner/deployer address returned `0x`, proving
EOA classification at that block. Re-reading the fixed block number returned
the same block hash. No balance, signature, transaction, write method, or
mainnet call was made. Exact redacted evidence is in
`erc1271-deployment-preflight-evidence.md`.

### LIVE TESTNET ACCEPTANCE

1. Mobile/QR release boundary: `PASS_DISABLED_BOUNDARY`. Exact
   `@walletconnect/ethereum-provider@2.23.10` resolution, integrity, dependency
   graph, license inventory, production audit, real storage hook,
   deterministic bundle, approved Origin and Relay, and shared invalidation
   lifecycle are reviewed. Runtime enablement and real mobile/QR E2E remain a
   separate release gate; the connector stays `SPECIFIED_DISABLED`.
2. Real EOA wallet E2E: `PASS_REAL_TESTNET`. The approved Base Sepolia EOA
   completed one real one-use EIP-191 challenge. Protected read returned AMR
   `wallet`, `siwe`, and `eip191_eoa_v1`; two concurrent logout requests with
   one idempotency key both returned `logged_out`.
3. Real ERC-1271 Human E2E: `PASS_REAL_TESTNET`. The deployed contract
   accepted the owner's real EIP-191 signature through
   `isValidSignature(bytes32,bytes)`. Protected read returned
   `eip1271_eip191_v1`.
4. Real ERC-1271 Agent E2E: `PASS_REAL_TESTNET`. The deployed contract
   accepted the owner's real EIP-712 signature and returned
   `verificationMethod: eip1271_eip712_v1`. The result persisted only
   `accountHash` and `proofHash`, not the raw signature.

Exact redacted deployment and proof identifiers are recorded in
`live-testnet-e2e-evidence.md`.

## Security and privacy proof

- no secret, private key, seed phrase, Project ID, raw signature, wallet
  telemetry, or reusable session is present in fixtures or audit evidence;
- verifier outputs hash signature/challenge references and discard raw RPC
  documents;
- browser storage for the connector boundary is memory-only;
- unknown Provider methods/events and chain/RPC parameters fail closed;
- RPC redirects, credentials, dynamic URLs, writes, batches, and mainnet fail
  closed;
- Base finality is pinned and revalidated; X Layer is explicitly ineligible;
- contract path cannot fall back to EOA;
- sessions still require pre-provisioned internal Credentials and server
  authorization;
- Provider selection, signature validity, and wallet type grant no credit,
  Mandate, transaction, or funds authority;
- no production funds moved; the approved Testnet deployment carried zero
  value and consumed bounded Base Sepolia gas only.

## Rollback

Rollback is code-only:

1. remove the WALLET-003 verifier, connector, schemas, contract compile
   artifact/tests, and review documents;
2. restore the Human verifier and Agent adapter to EOA-only results;
3. restore the fixed 65-byte Agent request/result contract;
4. remove mobile connector registration from the Provider registry;
5. keep product traceability `SPECIFIED_DISABLED`;
6. uninstall the exact WalletConnect dependency and remove its lockfile graph;
7. retain this redacted audit and local PostgreSQL/transport evidence.

The expiring Base Sepolia test contract is the only onchain artifact. It has no
execution, transfer, approval, custody, upgrade, or administration path and
rejects native value. There is no Project ID, pairing persistence, production
database, key, or reusable session in the repository to revoke. The loopback
handoff retains only in-memory challenges and sessions and is stopped after
evidence capture. The temporary PostgreSQL server is stopped; its
`/private/tmp` data directory and the installed-but-disabled dependency are
local review artifacts only.

## Completion and stop

WALLET-003 is `VERIFIED_APPROVED_TESTNET_SCOPE` and may hand off to V9-001.
This conclusion does not enable the mobile/QR connector, a production release,
mainnet, production funds, or any wallet method beyond the reviewed
authentication proofs. Those remain separate named human gates.
