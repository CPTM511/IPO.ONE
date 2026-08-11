# HYPERLIQUID-002 Audit — HyperCore Venue Execution Adapter

Date: 2026-08-08

Issue: `HYPERLIQUID-002`

Phase: 4 — Hyperliquid Execution

Implementation state: `VERIFIED_TESTNET — BOUNDED BTC PROOF CLOSED`

Hyperliquid Testnet proof: `VERIFIED_TESTNET_CLOSED`

## Outcome

The repository now has a closed Venue Execution Provider SPI and a local
HyperCore adapter projection. It preserves master/subaccount account identity
separately from an API-wallet signing delegate, tombstones every terminal
delegate address, compiles only the five approved execution action classes,
models both Hyperliquid signing schemes without computing a live digest or
signature, and composes existing TC-201/301/302/303 records into hash-only
execution Evidence.

The eight canonical Venue Tenant Gateway handlers are implemented and tested
as a standalone handler family. They are deliberately not added to the active
Tenant Protocol catalog, AuthZ policies or role bundles in this checkpoint.
Doing so would create new permissions and externally visible operations beyond
the approved local data/implementation scope. Delegate activation, external
deregistration and Exchange submission also contain unconditional L0 denial
guards.

No Hyperliquid endpoint, `approveAgent`, external signer, private key, account
mutation, Testnet write, order, cancel, modify, transfer, withdrawal, mainnet,
production or funds operation occurred.

## Reused canonical components

- `modules/hyperliquid-info`: signer-free master/subaccount Info read plane.
- `modules/hyperliquid-execution`: exact offline action, atomic nonce,
  idempotency and terminal UNKNOWN protocol.
- `modules/hyperliquid-risk-guardian`: stale/risk-increasing admission and
  protective state machine.
- `modules/hyperliquid-reconciliation`: read-side order/fill/state
  reconciliation with no blind resubmission.
- Existing Facility, CreditLine, Obligation, Ledger, settlement and Evidence
  kernels remain unchanged.

## Implemented contracts

### Venue SPI

Exactly these eight operations exist behind one provider contract:

1. `venueDiscoverCapabilities`
2. `venueReadBinding`
3. `venuePrepareDelegate`
4. `venueActivateDelegate`
5. `venueRevokeDelegate`
6. `venuePrepareExecution`
7. `venueSubmitExecution`
8. `venueReadExecution`

Capabilities are descriptor-, environment-, epoch- and expiry-bound. Unknown
or unsupported capability is non-permissive. The local HyperCore provider has
`externalCallsEnabled=false`, `externalSubmissionAllowed=false` and exposes
activation/submission as unsupported.

### Account/delegate boundary

- master or subaccount is the canonical query/account identity;
- API wallet is only a delegate signing identity;
- the returned projections contain address hashes and signer references, not
  raw addresses or key material;
- `SIMULATED_ACTIVE` never claims Hyperliquid registration;
- REVOKED, EXPIRED, COMPROMISED and RETIRED states are terminal;
- terminal address hashes survive repository snapshot/restart and cannot be
  reused;
- rotation requires the same Facility/account binding and a never-used fresh
  address.

### Action/signing boundary

Allowed exact action classes are `order`, `reduceOnlyOrder`, `cancel`,
`cancelByCloid` and `modify`. The adapter compiles reviewed HyperCore wire
shapes with deterministic field order. It rejects raw fields and denies
withdrawal, transfer, leverage/account-mode, `approveAgent`, fee approval and
all unknown action classes.

`l1_action` and `user_signed_action` are separate hash-bound contracts with
purpose-specific digest domains. They cannot be interchanged. The current
request records truthfully state:

- `officialDigestComputed=false`;
- `signingAllowed=false`;
- `externalSubmissionAllowed=false`; and
- official SDK or a reviewed reference implementation remains required before
  live signing.

### Evidence boundary

The HyperCore Evidence bundle binds Facility, OrderIntent, account binding,
delegate, account snapshot, risk snapshot, policy decision, execution record,
nonce state and reconciliation record. It fails with
`hypercore_prepared_work_quarantined` when risk freshness, binding or delegate
state drifts. It never treats adapter acknowledgement or venue state as Ledger
or settlement truth and always sets `resubmissionAllowed=false`.

## Security acceptance

| Acceptance | Evidence | Result |
| --- | --- | --- |
| Signer address differs from account query identity | account binding and query-identity tests | PASS |
| Fresh delegate per binding/environment | one-use address owner index and rotation test | PASS |
| Deregistered/terminal delegate cannot be reused | durable tombstone snapshot/restart test | PASS |
| No raw key/signature/provider response persistence | closed schemas, runtime assertions, source boundary | PASS |
| Two signing schemes are explicit and non-interchangeable | purpose/domain mismatch tests | PASS |
| Only order/cancel/modify/reduce-only first slice | five positive fixtures plus denied-action matrix | PASS |
| Withdrawal/transfer/leverage/account changes denied | compiler deny matrix and existing TC-301/302 regression | PASS |
| `approveAgent` is not callable | compiler denial, disabled activation handler, no transport | PASS |
| Nonce unique/monotonic/time-bounded | existing TC-301 concurrency/restart/window tests | PASS |
| UNKNOWN never blindly retried | existing TC-301/303 terminal and reconciliation tests | PASS |
| Stale risk/prepared state cannot proceed | Evidence freshness quarantine test | PASS |
| Account/risk/execution/reconciliation Evidence is hash-bound | execution Evidence composition and JSON Schema test | PASS |
| Active Tenant/AuthZ permission is not silently added | handler family remains uncomposed from active catalog | PASS |
| No external write or funds authority | source profiles, guards and local-only test commands | PASS |

## Verification Evidence

### Phase 4 and Hyperliquid regression

Command:

```sh
node --test modules/hypercore-venue-adapter/test/*.test.js modules/hyperliquid-execution/test/*.test.js modules/hyperliquid-info/test/*.test.js modules/hyperliquid-risk-guardian/test/*.test.js modules/hyperliquid-reconciliation/test/*.test.js modules/hyperliquid-facility-funding/test/*.test.js modules/hyperliquid-settlement/test/*.test.js modules/hyperliquid-operability/test/*.test.js modules/tenant-command-gateway/test/venue-execution-handlers.test.js
```

Result: PASS, 79 tests, 0 failures.

### Full repository suite

Command: `pnpm test`

Result: PASS, 810 tests, 0 failures.

### Static contracts

- `pnpm run lint`: PASS; 613 JavaScript modules; boundary lint PASS.
- `pnpm run typecheck`: PASS; 3 package export surfaces and 70 runtime value
  exports.
- `pnpm run check:schemas`: PASS; 111 contracts.
- In the aggregate `pnpm run check`, runtime, lint, typecheck, schemas,
  OpenAPI, migrations, deploy topology, provider selection, closed-pilot
  operations, local stack and M1 requirement Evidence all passed before the
  known sealed snapshot branch assertion stopped the command.

Aggregate stop (pre-existing and unrelated):

```text
actual:   codex/checkpoint-20260727-pre-strategy
expected: codex/m1-b-deployable-sandbox
```

No implementation test failed.

### Founder review runtime

Local product URL: `http://127.0.0.1:3000/`

Host-side check: HTTP 200. The loopback runtime remains running for Founder
review. This is not a hosted or deployed experience.

## Reviewed official Hyperliquid references

- Nonces and API wallets:
  `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets`
- Signing:
  `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing`
- Exchange endpoint:
  `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint`
- Info endpoint:
  `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint`
- Asset IDs:
  `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids`

The local signing request is a contract projection only. This audit does not
claim official SDK digest/signature conformance.

## Artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `modules/hypercore-venue-adapter/src/venue-execution-provider.js` | `00eea649c70a1e6ae8269e024ed9b55b36a54a36a51e683277d54b3fb7dc8d6f` |
| `modules/hypercore-venue-adapter/src/hypercore-delegate.js` | `45617cb65fdc6c2719816d74826cf5b22c8f6b9f78222576ed19c90a39d1378b` |
| `modules/hypercore-venue-adapter/src/hypercore-action.js` | `07ca0d819914a468d8738b644624e7a6cf9671704478da2c8fe18fa04677a9d4` |
| `modules/hypercore-venue-adapter/src/hypercore-evidence.js` | `dbe023b085c9a30c0fb192a4addd48d14555039dc2839c12928e136b66f65815` |
| `modules/hypercore-venue-adapter/src/hypercore-venue-adapter.js` | `f1c158d060c6a0ffda87c91361464671b6027196365cc6bbab6dec9ff3e6f04c` |
| `modules/hypercore-venue-adapter/test/hypercore-venue-adapter.test.js` | `1f8ad870a9dccf9e1229f8c24536a071d2ca7de98b125e6904d4e7976a078b23` |
| `modules/hypercore-venue-adapter/test/fixtures/hypercore-venue-conformance.v1.json` | `75e06d0852ed68b9bb413ea90cd978f282f6d9f0abbcc4fdf97f53d137afb0d2` |
| `modules/tenant-command-gateway/src/venue-execution-handlers.js` | `12111ad80d2cd3b6bdc2add3c2fc65b3f22cd9729370731211abf92ce7164dbb` |
| `modules/tenant-command-gateway/test/venue-execution-handlers.test.js` | `f5530fe6a8c2124b1614877335b2f2a49ca37460b9a2055af9dd7806685d0eb9` |
| `schemas/v2/hypercore-account-binding.schema.json` | `cec47c683026eae3844624909e0456e1e039b1bbb7b05a06091f9dade1e2c229` |
| `schemas/v2/hypercore-api-wallet-delegate.schema.json` | `1a133b69ff041f2b8823783f52f750c43ae5065fe0fd841405cce28a374d70e1` |
| `schemas/v2/hypercore-prepared-action.schema.json` | `a4b863aaebd72e363c07d998693b4c785e0e2ab875bb060216c03ebd1cc2f70d` |
| `schemas/v2/hypercore-signing-request.schema.json` | `409c9ffc8fad86c44f12f8db6ee45cd4cc6d98cec3e30499aaa46898a4abf5d1` |
| `schemas/v2/hypercore-execution-evidence.schema.json` | `be383e58355769e6107c0a9447f5daf04a6e963efbd3ab5ffbe035e8662434eb` |

## Remaining named gates

1. Approve adding the eight Venue operations to active Tenant Protocol,
   AuthZ policies, role bundles, OpenAPI, TypeScript SDK and MCP. This is a
   permission/transport surface change; current handlers alone grant nothing.
2. Approve a durable Tenant-scoped PostgreSQL delegate/tombstone migration.
3. Name the qualified Hyperliquid Testnet master/subaccount, markets, products,
   exact numeric limits and owners.
4. Approve isolated signer custody and a never-reused API-wallet provisioning,
   revocation and destruction procedure.
5. Approve official SDK/reference signing conformance for both schemes.
6. Approve a bounded Exchange endpoint transport and exact no-value Testnet
   order/cancel/modify proof plan.
7. Stop for Founder/security review after the separately authorized Testnet
   proof. None of these gates implies mainnet, real funds or production.

## Rollback

Remove the uncomposed Venue SPI/handler family and five schemas, leaving the
existing Hyperliquid Info/execution/risk/reconciliation modules unchanged.
Preserve terminal delegate tombstones and all existing execution or
reconciliation Evidence. Never reuse a retired signer and never resubmit an
UNKNOWN action.

## Bounded Phase 4 Testnet closure addendum — 2026-08-10

The original local/offline SPI assertions above remain valid as the general
adapter baseline. The separately authorized `HYPERLIQUID-002D` proof has now
closed the bounded BTC Testnet path: one exact order write, one separately
approved exact cancel, no automatic retry, terminal read-only reconciliation,
zero open orders, zero positions, Ledger/Obligation Evidence closure, and local
signer retirement behind a no-reuse tombstone.

Both stable intents are `CLOSED` version `7`. The isolated key was logically
destroyed and verified absent; venue-side API-wallet deregistration and
storage-medium secure erase are not claimed. Final Evidence is
`artifacts/testnet/hyperliquid-002d-final-closure-20260810T142835Z.json`.

This updates the Phase 4 verdict to `VERIFIED_TESTNET_CLOSED` only for the
approved bounded proof. Production, mainnet, deployment, real value, transfers,
withdrawals and new signer authority remain unapproved.
