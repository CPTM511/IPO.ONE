# WALLET-003 ERC-1271 deployment balance-cap amendment 001

Status: `APPROVED`  
Decision ID: `WALLET-003-ERC1271-DEPLOY-001`  
Amendment ID: `WALLET-003-ERC1271-BALANCE-CAP-001`  
Approver: `IPO.ONE Founder`  
Approval recorded at: `2026-07-24T02:32:21.327Z`

## Approved change

The Founder explicitly approved continuing the already authorized Base Sepolia
acceptance run with a deployer Testnet balance of up to `1 ETH`.

The decision field `caps.maximumFaucetBalanceWei` is amended from:

```text
10000000000000000
```

to:

```text
1000000000000000000
```

The observed `0.5001 ETH` Base Sepolia balance is within this amended cap.

## Unchanged boundaries

Every other field and restriction in
`WALLET_003_MINIMAL_ERC1271_DEPLOYMENT_DECISION_PACK_v0.1.md` and its completed
decision remains unchanged:

- Base Sepolia `eip155:84532` only;
- one deployment;
- zero transaction value;
- gas limit at most `500000`;
- max fee per gas at most `5000000000` wei;
- the exact approved owner/deployer, bytecode hashes, contract expiry, E2E
  methods, and accountable roles;
- no key custody, arbitrary RPC, production funds, mainnet, credit, Mandate,
  asset, lending, repayment, or production authority.

This amendment does not authorize Codex to confirm a wallet prompt. The Founder
remains the human wallet and deployment operator.
