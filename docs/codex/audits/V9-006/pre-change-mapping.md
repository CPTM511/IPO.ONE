# V9-006 pre-change mapping

Recorded: 2026-07-24T13:46:27.622Z  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Gate and source identity

The IPO.ONE Founder accepted V9-005 at
`2026-07-24T13:46:27.622Z`, authorizing V9-006 only. The checked-out branch and
source commit exactly match the V9-006 package identity. The worktree contains
the accepted stacked task changes and must not be reset or treated as source
drift.

V9-006 does not authorize V9-007, remote MCP, A2A, production workload
credentials, a Provider integration, a deployment, live-chain execution, real
funds, a permission change, or an active-Mandate edit operation.

## Existing runtime truth

| Product need | Current authoritative runtime | Pre-change product gap |
| --- | --- | --- |
| Capability discovery | Closed immutable `agent_pilot_capability_manifest.v1` over `agent_mcp_registry.v2` | Agent Console does not render the manifest; the technical view is located under Architecture |
| Local MCP | Exactly 11 reviewed local stdio tools, parity-checked across MCP App, browser handoff, SDK and API contract | Agent Console shows no registry or per-tool catalog status |
| Typed SDK | Three staged local workflows: Credit Offer, sandbox Obligation/repayment, and local portability conformance | The executable local SDK example is documented in the package but the browser still displays a hypothetical production HTTPS example |
| OpenAPI | Versioned Tenant request/result schemas and an authenticated Tenant OpenAPI document exist in the production-host composition | The approved loopback development host does not serve the existing `/openapi.json` link |
| Principal binding | Human-controlled Agent Subject and immutable Principal relation are durable Tenant state | Agent Console exposes only a coarse identity label |
| Account proof | One-use EIP-712 proof creates an exact hash-only CAIP-10 AccountBinding and activates the Subject | Exact chain, proof method, hash and binding state are not visible in Agent Console |
| Mandate | Exact read, draft creation/revocation and Principal-approved sandbox activation exist | Limits, capabilities, hashes, expiry and unavailable active-edit state are not visible in Agent Console |
| Reliability | Gateway commands retain stable idempotency, bounded errors, authorization/admission, Event, Evidence, outbox and reconciliation | Agent Console does not explain or expose the conformance status |
| Disabled capabilities | Remote MCP/A2A, production workload credentials, public endpoint, live Provider execution and funds authority are absent or disabled | These boundaries are not consolidated with the current Agent integration state |

## Documentation and presentation drift

- `IPO_ONE_AUTHENTICATED_TRANSPORT_BOUNDARY_v0.1_DRAFT.md` still describes the
  historical six-tool handoff boundary even though the versioned runtime and
  repository drift gate enforce 11 tools.
- Architecture UI copy still labels the sample as a production HTTPS client
  and describes workload credentials that are not approved for the current
  local no-funds product.
- Static protocol counts and transport wording can drift from the server
  catalog.

Runtime contracts, registry parity checks, schemas, SDK tests and the Tenant
catalog are authoritative. Historical task evidence remains unchanged but must
not supply current product truth.

## Implementation decision

V9-006 will:

1. add a closed `agent_console_presentation.v1` browser presentation contract
   derived from the existing capability manifest, exact authenticated
   Subject/AccountBinding/Mandate snapshots and the current server catalog;
2. build one Agent Console workspace for Principal binding, account proof,
   Mandate, 11-tool local MCP registry, three SDK workflows, OpenAPI discovery,
   stable errors/idempotency, Evidence and exact unavailable capabilities;
3. replace the hypothetical production HTTPS sample with the executable
   reviewed local MCP SDK composition;
4. serve the existing Tenant OpenAPI document from the already-approved
   loopback development host without adding business authority;
5. keep every setup action in the existing Human Principal workbench and keep
   browser Agent execution disabled.

No Tenant operation, catalog entry, AuthZ rule, admission classification,
permission, migration, Ledger/Event/Evidence model, external adapter,
dependency, credential, signer, funds path or deployment is expected to
change.

## Expected change surface

- `apps/web/src/agent-console-presentation.js`
- focused presentation and browser UI tests
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/tenant-api/src/tenant-openapi.js`
- loopback and production Tenant Host composition/tests
- authenticated browser fixture for current Agent state
- V9 traceability and V9-006 audit documents

If implementation requires any contract, permission, credential, production
identity, external network, deployment or funds boundary not listed above,
V9-006 must stop for a separate named human gate.
