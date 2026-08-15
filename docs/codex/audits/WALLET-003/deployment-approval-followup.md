# WALLET-003 ERC-1271 deployment approval follow-up

Date recorded: 2026-07-23  
Decision ID: `WALLET-003-ERC1271-DEPLOY-001`  
Status: `SUPERSEDED_COMPLETE_DECISION_PREFLIGHT_PASSED`  
Approver role: IPO.ONE Founder  
Approved decision-pack SHA-256:
`4d015b8f0d3a91ba1fc8397496449698d25fa80dbaba340cc9262c09c7d915ae`

Founder follow-up:

> 批准所有的内容，开始继续下一步

This approves the fixed policy in
`docs/security/WALLET_003_MINIMAL_ERC1271_DEPLOYMENT_DECISION_PACK_v0.1.md`:

- Base Sepolia only (`eip155:84532`);
- the three exact source and bytecode hashes;
- one deployment, value `0`, gas limit at most `500000`, max fee per gas at
  most `5 gwei`, total deployment gas budget at most `0.0025 ETH`, and faucet
  balance at most `0.01 ETH`;
- an immutable contract lifetime of at most seven days;
- no mainnet, X Layer deployment, production identity, credit, Mandate,
  custody, funds, upgrade, transfer, approval, or post-deployment transaction;
- only the approved Human EIP-191 and optionally approved Agent EIP-712
  no-funds acceptance paths;
- no private key, seed phrase, raw signature, pairing secret, Project ID, or
  reusable credential may be given to Codex or committed to the repository.

The statement does not supply the concrete runtime values required by the
approved decision package. It therefore cannot be represented as a complete
deployment authorization record and does not authorize Codex to infer,
generate, receive, store, or operate a signer.

This paragraph records the intermediate state at the time of that statement.
The Founder subsequently supplied and confirmed the public owner/deployer
address, both E2E selections, all four accountable roles, and the exact
time/cap policy. The complete decision later passed the mode-`0600` offline
preflight. The approved public address was also classified as an EOA at one
pinned and revalidated Base Sepolia `safe` block. See
`erc1271-deployment-preflight-evidence.md` for the current redacted evidence.

## Public runtime fields that were subsequently completed

The intermediate decision was missing the fields below. They were subsequently
completed in the explicit decision represented by the redacted evidence hash.
The raw public address is not duplicated in repository audit documents.

```text
Approval timestamp (exact UTC):
Approval expiry (exact UTC, no later than 2026-09-22T23:59:59.999Z):
Base Sepolia owner EOA public address:
Base Sepolia deployer EOA public address:
Exact contract expiresAt (UTC, no more than seven days after preflight):
Deployment gas limit (100000-500000):
maxFeePerGas in wei (1-5000000000):
Maximum faucet balance in wei (1-1000000000000000000, amended by Founder):
Human EIP-191 E2E approved: yes/no
Agent EIP-712 E2E approved: yes/no
Human wallet operator:
Deployer operator:
Evidence custodian:
Credential destruction owner:
```

Both E2E paths were later approved. The policy fixes deployment count to one
and transaction value to zero.

## Safe continuation completed

The repository now contains:

- a closed JSON Schema for the complete decision record;
- an offline preflight that reads only one bounded, non-symlink, mode-`0600`
  JSON file below `/private/tmp`;
- exact decision-pack, chain, cap, lifetime, role, and artifact-hash checks;
- deterministic recompilation and artifact-hash matching;
- a redacted result containing only address hashes and explicit
  `transactionBuilt: false`, `transactionSigned: false`, and
  `transactionBroadcast: false` flags.

The preflight does not construct constructor calldata or a transaction, access
an RPC, request faucet funds, access key material, sign, broadcast, or deploy.
It may be executed only after every public runtime field above is supplied.

## Current stop condition

No contract address, transaction hash, credential, faucet receipt, or onchain
deployment evidence exists. The complete decision has passed the offline
preflight; deployment now remains blocked only at the separately accountable
human signer handoff. Production funds remain untouched.
