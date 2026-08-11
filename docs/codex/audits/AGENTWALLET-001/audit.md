# AGENTWALLET-001 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED_UNVERIFIED` — Phase 3 adapter-foundation review required

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Authority and boundary

The Founder authorized Phase 3 after accepting the Phase 2 implementation
Evidence. AGENTWALLET-001 applies that authorization only to the vendor-neutral
Provider SPI and conformance harness. It does not implement or activate a
MetaMask, OKX or other vendor adapter and grants no Provider call, permission,
credential, signature, transaction, UserOperation, RPC, chain write,
production or funds authority.

The checked-in runtime exposes only a disabled `local_sandbox` reference
provider. Its descriptor has `enabled=false` and
`externalCallsEnabled=false`. Static registry resolution rejects it before
method invocation.

## Delivered SPI

| Tenant operation | Provider SPI method | Exact binding |
| --- | --- | --- |
| `walletDiscoverCapabilities` | `discoverCapabilities` | descriptor, chain, account reference hash and context epoch |
| `walletPrepareGrant` | `prepareGrant` | active canonical grant plus narrower permission projection |
| `walletActivateGrant` | `activateGrant` | same exact grant/projection hashes |
| `walletReadGrant` | `readGrant` | same exact grant/projection hashes |
| `walletRevokeGrant` | `revokeGrant` | same exact grant/projection hashes |
| `walletPrepareExecution` | `preflight` | exact PreparedExecution and current preflight receipt |
| `walletApproveExecution` | `requestHumanStepUp` | exact `STEP_UP` receipt and approval request hash |
| `walletSubmitExecution` | `submit` | exact `ALLOW`, or exact STEP_UP approval artifact binding |
| `walletReadExecution` | `readExecution` | execution ID, prepared hash and external reference hash |

All requests and results are closed, immutable, JSON-safe, short-lived and
hash-bound. Provider results are adapter acknowledgement only and explicitly
carry `canonicalMutationAllowed=false`, `rawProviderResponseRetained=false` and
`fundsAuthority=false`.

## Permission projection

`compileExternalWalletPermissionProjection` accepts no caller target, selector
or broader permission. It can only select subsets of the verified active grant
and target policies and lower the four canonical limits and expiry. The output
is always `prepared`, cannot activate, records no external permission reference
and fixes withdrawal, transfer, approval, transactions, production and funds
authority to false.

The verifier independently rejects a self-hashed but semantically widened
projection, including changed transfer/withdrawal flags, target/code/selector
shape or scope duplication.

## Capability and registry safety

- all nine operations have explicit `supported`, `unsupported` or `unknown`
  status;
- `unknown` is non-permissive and cannot create an operation request;
- descriptor/capability/request epochs and hashes are rechecked immediately
  before invocation;
- stale capabilities and stale requests fail closed;
- the registry accepts only exact in-process provider objects with unique IDs;
- extra methods, dynamic loading, package discovery, URLs and unregistered
  fallback are unavailable;
- a changed descriptor or capability snapshot invalidates prepared work;
- the conformance harness proves all nine methods without mutating input.

## Closed schema set

1. `agentic-wallet-provider-descriptor.schema.json`
2. `agentic-wallet-provider-capabilities.schema.json`
3. `external-wallet-permission-projection.schema.json`
4. `agentic-wallet-provider-request.schema.json`
5. `agentic-wallet-provider-result.schema.json`

Runtime fixtures validate against all five schemas. The request schema closes
each operation-specific payload and references the existing grant,
PreparedExecution and preflight contracts rather than duplicating them.

## Verification results

- focused AGENTWALLET-001 tests: PASS — 9 tests, 0 failures;
- `pnpm test`: PASS — 776 tests, 0 failures;
- `pnpm run check:schemas`: PASS — 98 closed contracts;
- source and boundary lint: PASS — 598 JavaScript modules parsed;
- contract typecheck: PASS — 3 package surfaces and 70 runtime exports;
- `git diff --check`: PASS.

The aggregate `pnpm run check` reaches and passes runtime, lint, type, schema,
OpenAPI, migration, deployment-topology, Provider-selection, closed-pilot,
local-stack and all 44 Constitution gates, then stops at the pre-existing sealed
M1-A.1 branch binding. The historical artifact records
`codex/checkpoint-20260727-pre-strategy`; the current branch is
`codex/m1-b-deployable-sandbox`. AGENTWALLET-001 did not modify or reseal it.

PostgreSQL/RLS tests are intentionally omitted: this issue adds no durable
state, migration, transaction, Event, Evidence or outbox write. Interactive
browser flow testing is also not applicable because no user-facing control was
added. The existing local product remains available for Founder review.

## Product review experience

Local product URL: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)

The page remains the existing no-funds product shell. Provider SPI registration
does not create a discoverable wallet action or imply that a vendor is active.

## Changed-file proof

- `modules/agentic-execution/src/agentic-wallet-provider.js`
- `modules/agentic-execution/src/agentic-wallet-provider-conformance.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/agentic-wallet-provider.test.js`
- the five closed schemas listed above;
- `scripts/check-schemas.mjs`;
- the AGENTWALLET-001 issue and audit documents;
- ADR-038 status clarification.

## Rollback

Remove the two provider foundation modules, their exports, the five schemas,
their schema-registry entries and the focused test. No database, wallet,
Provider, chain or financial state exists to unwind.

## Remaining Phase 3 gates

AGENTWALLET-001 is implemented, not Founder-accepted. MetaMask and OKX remain
separate vendor issues. Vendor code must stay outside the Kernel and this
foundation module, and each adapter must stop for review after its own Evidence.
