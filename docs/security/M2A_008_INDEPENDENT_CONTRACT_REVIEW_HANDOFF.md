# M2A-008 independent contract review handoff

Status: `READY_FOR_INDEPENDENT_REVIEW — THIS FILE IS NOT A REVIEW`

Review owner required by launch policy: `Independent Security`

Scope: one Base Sepolia WETH/test-USDC test-asset market only

## Exact review sources

| Source | SHA-256 |
| --- | --- |
| `contracts/src/m2/IpoOnePriceOracleAdapterV1.sol` | `29fcf0d1775b2d7be2e4c478cbaa4e072e4bb63394cae648ac0027411bb5ed34` |
| `contracts/src/m2/IpoOneSecuredPoolV1.sol` | `7982c23b405958a85ae3035f3e4ba9c69b92a46ade9fcabd3f02b5ec741028ca` |
| `contracts/src/m2/libraries/SecuredPoolMathV1.sol` | `7eb4731af2ded7e4a1fefb22352e4b4100e275cb702516ab09233d3376382f09` |

The review also covers imported OpenZeppelin 5.6.1 `IERC20`, `SafeERC20`,
`Math`, and `ReentrancyGuard`, the closed price-feed/oracle interfaces, all M2
Foundry tests, and the constructor/deployment encoding in
`deploy/testnet/m2a-008-secured-pool-runner.mjs`.

Compiler and build contract:

- Solidity `0.8.30+commit.73712a01`;
- optimizer enabled, 200 runs;
- native immutable contracts; no proxy, factory, delegatecall or upgrade path;
- pool runtime size 14,294 bytes; adapter runtime size 1,494 bytes.

## Required independent conclusions

The reviewer must issue a named immutable report for the exact release SHA and
state one of `approved`, `approved_with_resolved_findings`, or `rejected`.
Approval requires no open P0/P1 issue and explicit assessment of:

1. value conservation and solvency-favoring share/debt rounding;
2. first-depositor, direct-donation and share-inflation resistance;
3. reentrancy, failed-transfer atomicity and non-standard-token rejection;
4. market, borrower, collateral, cash and pause cap bypass;
5. oracle source/asset/chain/round/time/deviation validation and recovery;
6. interest accrual monotonicity, chunking and timestamp assumptions;
7. liquidation close factor, bonus, surplus and bad-debt recognition/recovery;
8. pause guardian and recovery authority privilege separation;
9. native-value, arbitrary-transfer, withdrawal, proxy and hidden-admin absence;
10. constructor encoding, exact asset/feed addresses, emitted initialization
    Evidence and deployed bytecode/configuration verification;
11. the M2 threat register `SC-01` through `SUP-01`; and
12. whether every accepted Foundry warning is intentional and bounded.

## Reproduction commands

```text
pnpm run check:m2-contract-toolchain
pnpm run test:contracts:foundry
pnpm run testnet:m2a008:fork:dry-run
pnpm run test:m2a008:preflight
pnpm run test:indexer:reorg
pnpm run test:security
pnpm run check
git diff --check
```

## Evidence contract

The independent report must identify the reviewer, organization or independent
capacity, reviewed release SHA, source hashes, tools/manual methods, findings,
resolutions, residual risks, approval timestamp and immutable Evidence URL.
It must not approve mainnet, real funds, production credit, custody, Human cash
lending or Agent venue execution.

Codex-authored tests, this handoff, internal threat modeling, Foundry lint and
CI are supporting assurance only. They must never be recorded as the
`independent_contract_review` gate.

## Single-command intake

The reviewer copies
`deploy/approvals/m2a-008-independent-review.pending.json`, replaces every
pending value, attaches the exact report and runs:

```text
pnpm run testnet:m2a008:review:verify -- \
  --attestation /absolute/path/review-attestation.json \
  --report /absolute/path/review-report.pdf \
  --expected-sha <EXACT_RELEASE_SHA>
```

The verifier checks the closed schema, reviewer identity/capacity, exact
release SHA, all three current source hashes, compiler profile, conclusion,
finding counts, 720-hour validity window, immutable report URL and the report
bytes against its non-zero SHA-256 digest. Only then does it emit the exact
`independent_contract_review` gate record. It has no signer, wallet or
transaction primitive and cannot enable the launch policy.
