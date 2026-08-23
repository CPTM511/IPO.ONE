# M2A-008 Founder / Release / Risk decision

Status: `APPROVED_WITH_EXACT_RUN_CONDITIONS — NOT AN UNLOCK`

Decision date: 2026-08-23

Decision owner: IPO.ONE Founder acting as Founder, Release Owner and Risk owner

Founder instructions in the active task:

- `好的，继续吧，同意授权并执行`
- `往下继续，我授权你做其中的所有内容，给我把这个部分做完了。`
- `已审查，没问题， 给我继续`
- `M2A-008 TESTNET GATE SIMPLIFICATION / GOVERNANCE CORRECTION`

The latest instruction is a Founder-owned scope-specific governance decision:
Independent Security review is optional additional assurance for the first Base
Sepolia test-assets-only engineering deployment, but remains a hard requirement
for any mainnet or real-value profile.

## Approved boundary

The Founder approves preparation and, only after every checked-in launch gate
passes, execution of one M2A-008 Base Sepolia deployment with these fixed
limits:

- chain: Base Sepolia, `eip155:84532`;
- collateral: Base Sepolia WETH9,
  `0x4200000000000000000000000000000000000006`;
- debt asset: Circle Base Sepolia test USDC,
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`;
- price feed: Chainlink Base Sepolia ETH/USD,
  `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`;
- one immutable oracle adapter and one immutable secured pool, with no proxy,
  factory or second market;
- market debt cap: 1,000 test USDC (`1000000000` base units);
- borrower debt cap: 100 test USDC (`100000000` base units);
- loan-to-value: 50% (`5000` bps), below the immutable 80% liquidation
  threshold;
- exactly two contract-creation transactions and zero native value;
- one fresh M2A-008 deployer, exact starting balance and nonce, no reuse, and
  logical credential destruction after success or terminal uncertainty;
- total worst-case deployment gas cost no greater than 0.02 Base Sepolia ETH;
- test assets only, with no mainnet, real funds, Human cash credit, private
  Tenant data, Agent venue execution, production or custody authority.

The Founder also approves Codex implementing the closed deployment runner,
read-only reconciliation path, conservative parameter binding, tests,
documentation, branch, pull request and merge needed for this issue.

## Conditions that this decision does not replace

This record does not claim or substitute for:

- two exact, distinct pause-guardian and recovery-authority public addresses
  controlled with distinct keys under the Founder testnet-only attestation;
- a freshly provisioned and exactly funded one-use deployer;
- immutable Evidence for pre-deployment Gates A through C;
- the separate reviewed policy revision that completes `exactProfile`, clears
  `unlockRequirements` and changes `releaseEnabled` to `true`;
- runtime enforcement of Gate D; or
- source-explorer verification, finality, indexer/restart reconciliation or
  Gate E visible-click acceptance against the deployed SHA.

Those values must be inserted into a mode-0600 exact decision after the final
green release SHA and before signing. A missing, stale or mismatched condition
must fail closed.

## Current decision effect

Founder / Release / Risk intent and the conservative numeric limits are
approved. Live signing remains blocked until the two public Founder-controlled
role addresses exist and the final exact release/signing inputs are generated.
The checked-in launch profile therefore correctly remains disabled.

The independent-review schema, template and verifier remain available. They are
not a testnet launch blocker and cannot be represented as completed without a
real external reviewer and exact report. Any mainnet or real-value policy still
fails validation without an `Independent Security` gate.

This is not a mainnet, real-value, production or funds-movement approval.
