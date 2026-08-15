# METAMASK-AGENT-001 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED_UNVERIFIED` — stopped for Founder review after the first
Phase 3 vendor adapter

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Authority and stop boundary

The Founder authorized Phase 3 after accepting Phase 2 Evidence. This delivery
implements only a disabled local MetaMask reference adapter over the accepted
vendor-neutral SPI. It does not call MetaMask, `window.ethereum`, Smart Accounts
Kit, the `mm` CLI, Agent SDK, a wallet, RPC, bundler, relay, chain or remote
service. It requests no permission, approval, credential, signature,
transaction, UserOperation, deployment or funds movement.

The adapter descriptor fixes `enabled=false` and
`externalCallsEnabled=false`. Static registry resolution rejects the adapter
before any method can be invoked. The direct discovery fixture returns only an
`unavailable/not_invoked` result with `externalCallPerformed=false`.

Per the Phase 3 source plan, work stops here. `OKX-AGENT-001` has not started
and remains separately gated.

## Official contract mapping

The implementation was checked against current official sources on 2026-08-07:

- ERC-7715 is still a Draft and defines
  `wallet_getSupportedExecutionPermissions`,
  `wallet_requestExecutionPermissions`,
  `wallet_getGrantedExecutionPermissions`, and
  `wallet_revokeExecutionPermission`. It states that a permission response may
  differ from the request and recommends narrow permissions with reasonable
  expiry: <https://eips.ethereum.org/EIPS/eip-7715>.
- MetaMask documents Advanced Permissions as ERC-7715-based fine-grained wallet
  execution permissions. Its current supported list is token/native allowance,
  periodic and stream permissions, plus toolkit-only token approval revocation:
  <https://docs.metamask.io/smart-accounts-kit/get-started/supported-advanced-permissions/>.
- MetaMask Agent Wallet currently documents default simulation, threat
  scanning, and an asynchronous state that may await MFA:
  <https://docs.metamask.io/agent-wallet/reference/architecture/>.

External documentation is capability evidence only. It creates no IPO.ONE
permission or Provider trust.

## Delivered adapter contracts

### Capability observation and canonical projection

`createMetaMaskCapabilityObservation` accepts only the four reviewed ERC-7715
method names, Base Sepolia (`eip155:84532` / `0x14a34`) or X Layer Testnet
(`eip155:1952` / `0x7a0`), bounded permission/rule names, explicit security
feature statuses and a five-minute maximum local observation lifetime.

Observations are fixed to `local_synthetic_fixture`,
`externalCallPerformed=false`, `authorizationGranted=false`, and
`fundsAuthority=false`. Missing or `unknown` support remains `unknown` in the
canonical Provider capability contract. It never becomes a supported fallback.

### Advanced Permission projection

The adapter independently verifies the canonical external permission
projection, descriptor, normalized capabilities and exact capability
observation. It emits hashes and references only; raw account addresses and RPC
parameters are not accepted or retained. Chain, session epoch, account reference
hashes, permission data hash and expiry are exact. `isAdjustmentAllowed` is
always false.

The current MetaMask allowance, periodic, stream and approval-revocation
permission vocabulary cannot represent IPO.ONE's exact target/code/selector
policy without adding asset or approval authority. Those types therefore return
`DENY` with `canonical_policy_forbids_allowance_permission`.

`ipo-one-exact-call-v1` exists only as a local synthetic conformance fixture to
exercise exact-response comparison. It is not asserted to be supported by
MetaMask and is never provisionable: `providerProvisioningReady=false`,
`activationAllowed=false`, `externalCallAllowed=false`, and
`transactionsAllowed=false` remain invariant.

### Response and security normalization

An exact normalized permission response remains `STEP_UP` because Human wallet
approval is not canonical activation authority. Any changed chain, permission
type/data, account/session binding, expiry or adjustment flag becomes
`QUARANTINE`. A response for an already denied permission is also quarantined.
Only hashed external references and dependency facts are accepted.

Agent Wallet security facts normalize into the shared four decisions:

| Provider facts | Decision | Canonical effect |
| --- | --- | --- |
| simulation passed, threat safe, approval approved/not required | `ALLOW` | descriptive only; submission still false |
| awaiting MFA or unknown approval | `STEP_UP` | Human action required; no delivery performed |
| failed/unknown simulation or rejected approval | `DENY` | no execution |
| malicious/unknown threat state | `QUARANTINE` | no execution or recovery by time |

Every security receipt preserves `canonicalPreflightStillRequired=true` and
`submissionAllowed=false`. Stale security or capability evidence is rejected.

## Closed schema set

1. `metamask-agentic-wallet-capability-observation.schema.json`
2. `metamask-advanced-permission-projection.schema.json`
3. `metamask-advanced-permission-response-comparison.schema.json`
4. `metamask-agent-wallet-security-receipt.schema.json`

Runtime fixtures validate against all four schemas. All are closed top-level
Draft 2020-12 contracts and the repository schema registry now contains 102
contracts.

## Verification results

- focused `METAMASK-AGENT-001` tests: PASS — 10 tests, 0 failures;
- `pnpm test`: PASS — 786 tests, 0 failures;
- `pnpm run check:schemas`: PASS — 102 closed contracts;
- source and boundary lint: PASS — 601 JavaScript modules parsed;
- contract typecheck: PASS — 3 package surfaces and 70 runtime exports;
- vendor module-size gate: PASS — adapter 475 lines; security module 189 lines;
- loopback product availability: PASS — host-side `GET /` returned HTTP 200;
- `git diff --check`: PASS.

The aggregate `pnpm run check` reaches and passes runtime, lint, type, schema,
OpenAPI, migrations, deployment topology, Provider selection, closed-pilot,
local-stack and all 44 Constitution gates. It then stops only at the existing
sealed M1-A.1 branch binding: the historical artifact records
`codex/checkpoint-20260727-pre-strategy`, while the current branch is
`codex/m1-b-deployable-sandbox`. This issue did not modify or reseal that
historical artifact.

PostgreSQL/RLS tests are not applicable because this issue adds no durable
state, migration, transaction, Event, outbox or Evidence write. No new browser
control exists, so interactive flow mutation testing is not applicable.

## Product review experience

Local product URL: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)

The existing no-funds product shell remains available. This adapter adds no
wallet button, Provider choice or discoverable execution action and makes no
claim that MetaMask is active.

## Changed-file proof

- `modules/agentic-execution/src/metamask-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/metamask-agent-wallet-security.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/metamask-agentic-wallet-adapter.test.js`
- the four closed schemas listed above;
- `scripts/check-schemas.mjs`;
- `docs/codex/tasks/METAMASK_AGENT_001_REFERENCE_AGENTIC_WALLET_ADAPTER.md`;
- this audit;
- ADR-038 implementation-status clarification.

The worktree remains intentionally stacked and dirty with accepted Phase 1,
Phase 2 and AGENTWALLET-001 implementation and Evidence. No unrelated user
change was reverted or claimed as part of this adapter.

## Rollback

Remove the two MetaMask modules and index exports, focused test, four schemas,
schema-registry entries, issue/audit documents and ADR status clarification. No
database, wallet, Provider, chain, deployment or financial state exists to
unwind.

## Remaining gate

Founder review is required for this first adapter. No external activation is
authorized. `OKX-AGENT-001` may begin only after a new explicit continuation
instruction and must itself stop for review after its Evidence.
