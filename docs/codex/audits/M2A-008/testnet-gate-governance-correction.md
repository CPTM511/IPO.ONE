# M2A-008 testnet gate governance correction

Status: `FOUNDER_APPROVED — IMPLEMENTED`

Decision date: 2026-08-23

Delivery mode: first `L3_LIVE_TESTNET` Base Sepolia engineering deployment,
test assets only

## Context

The prior 13-gate profile treated an external Independent Security review and
production-grade role custody as hard requirements for a two-transaction Base
Sepolia engineering deployment. It also mixed deployment-time and post-
deployment Evidence into one pre-deployment approval set, creating a circular
gate. The Founder directed a scope-specific correction: light testnet
governance with strong technical verification, while preserving strong
governance and independent review for mainnet or real value.

## Scope

- Replace the M2A-008 profile's 13 named gates with five effective gates.
- Require Gates A through C before signing.
- Enforce Gate D inside the closed deployment runner.
- Require Gate E before M2A-008 completion.
- Permit two distinct Founder-controlled EVM role addresses backed by distinct
  keys for Base Sepolia test assets only.
- Replace the unrelated container/protected-environment evidence shape with a
  null image and immutable exact Founder testnet-decision reference for this
  local closed runner only.
- Retain the independent-review schema, verifier and handoff as optional
  testnet assurance and mandatory future mainnet/real-value assurance.

## Five effective gates

| Gate | Policy ID | Stage | Blocking truth |
| --- | --- | --- | --- |
| A — Code integrity | `m2a_testnet_code_integrity` | pre-deployment | exact green SHA, CI, provenance, Foundry unit/fuzz/invariant, security and fork checks |
| B — Exact configuration | `m2a_testnet_exact_configuration` | pre-deployment | `eip155:84532`, admitted dependencies, exact 1,000/100 test-USDC caps, 50% LTV, test assets only |
| C — Authority/signer safety | `m2a_testnet_authority_signer_safety` | pre-deployment | distinct roles/keys, fresh deployer, exact nonce/balance/gas, no mainnet or real funds |
| D — Exact deployment | `m2a_testnet_exact_deployment` | runtime-enforced | exactly adapter then pool, two zero-value transactions, deterministic inputs/receipts and dual-RPC runtime truth |
| E — Post-deployment acceptance | `m2a_testnet_post_deployment_acceptance` | post-deployment | explorer/source, finality/indexer/reconciliation, restart/replay, safe pause/recovery and visible Human/LP/Risk acceptance |

## Non-goals

- No enabled exact profile in this correction.
- No account generation, signer generation, faucet request, signing or chain
  transaction.
- No mainnet, real funds, production credit, custody, Human cash lending,
  Agent venue execution, second market, factory or proxy.
- No claim that Independent Security review exists.

## Remaining-input classification

### A — genuinely unavoidable Founder input

Exactly two public Base Sepolia EVM addresses remain:

- `pauseGuardian`
- `recoveryAuthority`

They may both be Founder-controlled, but must be distinct addresses backed by
distinct private keys. No private key, seed phrase or signing secret is
requested or accepted.

### B — derived or automated after the two addresses arrive

Codex derives the final green SHA and source hashes, validates the exact
configuration, generates and funds a fresh one-use deployer with minimum
testnet gas, calculates deterministic addresses, builds immutable Gate A-C
Evidence, enables the exact profile through a reviewed policy revision, runs
the closed two-transaction deployment, and performs Gate E reconciliation,
indexing, restart/replay and browser acceptance. These are execution work, not
additional Founder information requests.

### C — removed as unnecessary for this bounded testnet deployment

The first test-assets-only Base Sepolia deployment does not require a completed
Independent Security review, different human controllers, institutional
custody, multisig, a container image, or a protected hosted environment.
Independent Security review remains a mandatory hard gate before any mainnet
or real-value profile can validate.

## Likely files

- `deploy/launch-policy.v1.json`
- `packages/release-governance/src/index.js`
- `schemas/v2/m2a-008-exact-deployment-decision.schema.json`
- `deploy/testnet/m2a-008-secured-pool-preflight.mjs`
- M2A-008 approval templates, tests, task, security and traceability documents

## Acceptance criteria

1. Missing Independent Security Evidence does not block the exact Base Sepolia
   test-assets profile.
2. Any mainnet-named or real-funds profile without an `Independent Security`
   gate fails policy validation.
3. The two role addresses remain distinct from each other and every deployment
   identity/dependency; both may identify `Founder` as controller while distinct
   private keys are explicitly attested and never included.
4. Exact testnet decisions reject `mainnetAuthorized=true`,
   `realFundsAuthorized=true`, non-exact caps/LTV and any missing technical
   pre-deployment gate.
5. Independent review tooling remains available and cannot be represented as
   completed without exact external Evidence.
6. Public/hosted profiles retain immutable image and protected-environment
   requirements; only M2A-008 may use the exact local-runner evidence shape.

## Tests

```text
pnpm run check:launch-policy
node --test packages/release-governance/test/release-governance.test.js
pnpm run test:m2a008:preflight
pnpm run testnet:m2a008:fork:dry-run
pnpm run check
git diff --check
```

## Security, migration and rollback

The correction changes governance staging, not contract logic or database
state. Rollback restores policy v1.1.0 and its templates. Mainnet and real-value
profiles continue to require Independent Security review, remain disabled, and
cannot inherit the M2A testnet exception. No private key, seed phrase or role
secret may enter the repository, logs, Evidence or GitHub.

## Completion Evidence

This correction is complete only after its PR and final `main` Quality Gate
pass. M2A-008 itself remains `BLOCKED — NOT COMPLETE` until two public role
addresses are supplied and the exact deployment plus Gate E acceptance are
genuinely completed.
