# OKX-AGENT-001 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED_UNVERIFIED` — stopped for Founder review after the second
Phase 3 vendor adapter

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Authority and Phase 3 stop boundary

The Founder accepted the first adapter capability Evidence and directed
continued development. This delivery implements the final planned Phase 3
reference adapter as local synthetic contracts only. It does not install or
call OKX Onchain OS Skills, MCP, CLI, Open API, Agent Trade Kit, a wallet, TEE,
RPC, chain, bundler, relay or remote service. It creates no login, OTP, API key,
passphrase, credential file, session, wallet, signature, transaction,
UserOperation, trade, transfer, payment or funds movement.

The checked-in descriptor fixes `enabled=false` and
`externalCallsEnabled=false`. Static Provider registry resolution rejects the
adapter before any method invocation. Direct local discovery returns only
`unavailable/not_invoked` with `externalCallPerformed=false`.

Phase 3 adapter implementation now contains the vendor-neutral SPI plus the
disabled MetaMask and OKX reference adapters. Per the controlling plan, work
stops here. Phase 4 and `HYPERLIQUID-002` have not started and remain separately
gated.

## Official capability mapping

The implementation was checked against current official OKX sources on
2026-08-07:

- OKX Agentic Wallet documentation describes TEE-based key generation/storage/
  signing, transaction risk simulation/scoring, identity checks, blacklist and
  anomaly blocking, and multi-chain execution:
  <https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet>.
- The current Agentic Wallet Skills catalog exposes wallet status/history/send
  and security token, DApp, approval, transaction and signature scan workflows;
  its composite flow sequences gas check, simulation, security scan, execution
  and tracking:
  <https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet-skills>.
- OKX's current Agentic Wallet introduction says Agents can connect through
  MCP or CLI, transactions are simulated and risk-graded before execution,
  critical transactions are blocked, and keys remain in TEE:
  <https://web3.okx.com/learn/agentic-wallet>.

These sources state vendor capabilities but do not provide a reviewed IPO.ONE
TEE-attestation verifier, exact credential scope or canonical execution proof.
The implementation therefore records `vendorClaimsAttested=false` and
`teeAttestationVerified=false`. This is a conservative inference from the
reviewed interface material, not a claim that OKX lacks internal attestation.

The separate OKX Agent Trade Kit was deliberately not integrated: its MCP/CLI
surface targets exchange accounts and requires Read/Trade permissions for
non-market operations. It is outside this wallet-reference issue and no account
or venue permission was authorized.

## Delivered adapter contracts

### Capability observation

`createOkxCapabilityObservation` closes integration surfaces to `skills`,
`mcp`, `cli`, and `open_api`; tools to `security_tx_scan`,
`security_sig_scan`, `wallet_history`, and `wallet_send`; and security claims
to TEE isolation, transaction simulation, risk scoring, critical blocking and
identity verification. Observations are limited to Base Sepolia or X Layer
Testnet, one context epoch and five minutes.

All observations are `local_synthetic_fixture`, non-attested,
non-authorizing and no-call. Missing or unknown surface/tool/security facts
remain non-permissive. When every integration surface is unsupported, the
canonical permission model and transport normalize to `none`; they cannot
remain an implied vendor fallback.

### MCP/CLI invocation projection

The invocation projection consumes one verified canonical Provider request and
rechecks descriptor, normalized capabilities, observation, context epoch,
chain, operation, input hash and expiry. It retains no raw argument or command.
The following escape hatches are invariant false:

- `naturalLanguagePromptAllowed`;
- `genericMcpForwardingAllowed`;
- `shellCommandAllowed`;
- `rawArgumentsRetained`;
- `externalCallAllowed` and `executionAllowed`.

Security scan and history references produce only `STEP_UP` with
`external_okx_integration_review_required`. `wallet_send` produces `DENY` with
`value_moving_vendor_tool_forbidden`, even if a synthetic observation says the
vendor supports it. Transfer, batch transfer, swap, payment, approvals and
arbitrary tool names are not representable.

### TEE and execution reference

TEE inputs are closed to claimed/unavailable/unknown vendor claims and
unverified/invalid/unknown attestation states. No `verified` state exists in
this L0 contract. Every reference is `QUARANTINE`, never confirms canonical
execution or settlement, never mutates canonical state, and never enables
retry.

Any synthetic pending, succeeded, failed or unknown external execution state
requires a hash reference and sets `reconciliationRequired=true`. A
`not_submitted` state rejects an external execution reference. This prevents a
vendor acknowledgement or unknown outcome from becoming retry or settlement
truth.

### Preflight and risk receipt

Vendor facts normalize deterministically:

| Facts | Decision | Boundary |
| --- | --- | --- |
| passed simulation, low/medium risk, verified identity, clear interception, not submitted | `ALLOW` | descriptive only; submission false |
| high risk or identity step-up | `STEP_UP` | no external delivery performed |
| failed/unknown simulation, failed identity or failed execution | `DENY` | no execution |
| critical/unknown risk, blocked/unknown interception, unknown identity or pending/succeeded/unknown outcome | `QUARANTINE` | reconciliation required where an outcome exists |

Every receipt keeps `canonicalPreflightStillRequired=true`,
`submissionAllowed=false`, `retryAllowed=false`, raw vendor response retention
false, and production/funds authority false. Stale receipts are unusable.

## Closed schema set

1. `okx-agentic-wallet-capability-observation.schema.json`
2. `okx-agentic-wallet-invocation-projection.schema.json`
3. `okx-tee-execution-reference.schema.json`
4. `okx-agentic-wallet-risk-receipt.schema.json`

Runtime fixtures validate against all four closed Draft 2020-12 schemas. The
repository registry now contains 106 contracts.

## Verification results

- focused `OKX-AGENT-001` tests: PASS — 11 tests, 0 failures;
- `pnpm test`: PASS — 797 tests, 0 failures;
- `pnpm run check:schemas`: PASS — 106 closed contracts;
- source and boundary lint: PASS — 604 JavaScript modules parsed;
- contract typecheck: PASS — 3 package surfaces and 70 runtime exports;
- vendor module-size gate: PASS — adapter 422 lines; risk module 301 lines;
- loopback product availability: PASS — host-side `GET /` returned HTTP 200;
- `git diff --check`: PASS.

The aggregate `pnpm run check` reaches and passes runtime, lint, type, schema,
OpenAPI, migrations, deployment topology, Provider selection, closed-pilot,
local-stack and all 44 Constitution gates. It stops only at the existing sealed
M1-A.1 branch binding: the historical artifact records
`codex/checkpoint-20260727-pre-strategy`, while the current branch is
`codex/m1-b-deployable-sandbox`. This issue did not modify or reseal that
historical artifact.

PostgreSQL/RLS tests are not applicable because this issue adds no migration,
durable state, Event, outbox, transaction or Evidence write. No browser control
or user-facing mutation changed, so real-browser flow testing is not applicable.

## Product review experience

Local product URL: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)

The existing no-funds product remains available. This reference adapter adds no
wallet button, OKX login, Provider selection or executable action and does not
claim OKX is connected or active.

## Changed-file proof

- `modules/agentic-execution/src/okx-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/okx-agentic-wallet-risk.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/okx-agentic-wallet-adapter.test.js`
- the four closed schemas listed above;
- `scripts/check-schemas.mjs`;
- `docs/codex/tasks/OKX_AGENT_001_REFERENCE_AGENTIC_WALLET_ADAPTER.md`;
- this audit;
- ADR-038 implementation-status clarification.

The worktree remains intentionally stacked and dirty with the accepted earlier
phase implementation and Evidence. No unrelated user change was reverted or
claimed as part of this adapter.

## Rollback

Remove the two OKX modules and index exports, focused test, four schemas,
schema-registry entries, issue/audit documents and ADR status clarification. No
database, wallet, TEE, Provider, chain, deployment or financial state exists to
unwind.

## Remaining gate

Founder review is required for the second adapter and the Phase 3 checkpoint.
No external activation is authorized. Phase 4 may begin only after a new
explicit continuation instruction and its own permission review.
