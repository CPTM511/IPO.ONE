# EXEC-003 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED_UNVERIFIED` — Phase 2 Founder review required

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Authority and boundary

The Founder authorized API/SDK/MCP parity for the canonical wallet operation
family. Catalog presence is not transaction authority. No remote endpoint,
wallet popup, Provider/RPC call, external simulator, signer, transaction,
UserOperation, chain write, deployment or funds path was enabled.

## Canonical operation family

The authenticated Tenant Protocol now owns exactly these nine operation IDs:

1. `walletDiscoverCapabilities`
2. `walletPrepareGrant`
3. `walletActivateGrant`
4. `walletReadGrant`
5. `walletRevokeGrant`
6. `walletPrepareExecution`
7. `walletApproveExecution`
8. `walletSubmitExecution`
9. `walletReadExecution`

The static catalog, runtime catalog, request/result schemas, OpenAPI extensions,
TypeScript declarations, SDK methods and local Agent MCP tools use the same
operation IDs and closed payload meanings. `walletPrepareExecution` accepts a
`transferIntentId`, not caller-authored calldata or a raw transaction envelope.
`walletSubmitExecution` binds one exact prepared-execution hash to one exact
preflight-receipt hash.

## One business-logic path

All transports call the same Tenant Command Gateway handler contracts. The
handlers invoke an injected wallet-execution application boundary; they do not
reimplement grant, preflight, staleness or submission rules. When no reviewed
application composition is injected, the default application is intentionally
unavailable and fails closed with
`wallet_execution_application_not_composed`.

The SDK validates the canonical request and result contract. The MCP adapter
only maps its closed tool inputs into that SDK. OpenAPI describes the same
Tenant request/result unions. Conformance fixtures include all nine valid
request/result pairs plus invalid raw-calldata, query-idempotency and
adapter-invocation mutations.

## Role and admission controls

- Human Principal Controller owns grant prepare/activate/revoke and execution
  approval authority in the local no-funds model.
- Agent Runtime may discover, prepare an owned exact execution, submit it to
  the disabled guard and read owned state; it cannot widen or approve a grant.
- read/discovery operations use the read quota profile.
- execution prepare/submit use the economic profile with mandatory
  idempotency and zero automatic retries.
- grant control and Human approval use the privileged profile.
- every operation is private, Tenant-scoped and has `fundsAuthority=false`.

## Fail-closed safety flags

The canonical catalog/result surfaces preserve:

- `realFundsEnabled=false`
- `productionCreditEnabled=false`
- `agenticWalletPreflightEnabled=true`
- `walletSubmissionEnabled=false`

A stale or context-drifted submit request is rejected by EXEC-002 checks. A
fresh request reaches only the disabled local guard and invokes no adapter.

## Verification results

- `pnpm test`: PASS — 767 tests, 0 failures.
- focused Gateway registry and wallet handler tests: PASS.
- focused SDK and MCP parity tests: PASS.
- focused OpenAPI/Tenant transport conformance tests: PASS.
- Tenant Protocol gate: PASS — 86 operations, 97 request fixtures and 85 result
  fixtures.
- OpenAPI gate: PASS — 21 paths and 21 operations.
- authorization, abuse-control, schema and product-traceability gates: PASS.
- real-browser loopback check: PASS — product rendered, Human/Agent switch
  worked, the no-funds boundary remained visible, and the console had 0 errors
  and 0 warnings.

The aggregate `pnpm run check` stops at the pre-existing M1-A.1 sealed snapshot
branch mismatch (`codex/checkpoint-20260727-pre-strategy` versus current
`codex/m1-b-deployable-sandbox`). All preceding aggregate gates passed. The
later EXEC-003-relevant approval, abuse, operations, Tenant Protocol, Agent
HTTPS, product traceability and Web bundle gates were run independently and
passed. No historical release candidate was modified or resealed.

## Product review experience

Local product URL: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)

EXEC-003 intentionally adds no unauthenticated UI execution mutation. The
local product remains a non-authorizing no-funds shell while the machine-facing
contracts are available for review.

## Rollback

Remove the nine catalog/schema/handler/OpenAPI/SDK/MCP bindings and their
conformance fixtures as one unit. EXEC-002 domain Evidence remains readable.
No external execution or financial state exists to reverse.

## Review gate

EXEC-003 is implemented, not Founder-accepted. Phase 2 stops here. Any adapter
composition, external simulation, wallet/venue provider, signing, Testnet or
production execution requires a new named review and authorization.
