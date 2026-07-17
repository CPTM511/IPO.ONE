# IPO.ONE Local Agent MCP Adapter

This package is the approved TRANSPORT-001 local stdio adapter over one
pre-authenticated `AgentTenantCommandClient`. Authentication Context is
injected by the host process and is never accepted as a tool argument.

The closed tool list is:

- `ipo_one_read_self`;
- `ipo_one_request_credit`;
- `ipo_one_read_credit_application`;
- `ipo_one_evaluate_credit_application`;
- `ipo_one_submit_account_proof`;
- `ipo_one_read_account_binding`;
- `ipo_one_read_obligation`;
- `ipo_one_read_obligation_evidence`;
- `ipo_one_accept_credit_offer`;
- `ipo_one_execute_sandbox_obligation`;
- `ipo_one_post_sandbox_repayment`.

The four credit-application tools retain their deterministic Offer workflow.
The two IDENTITY-001 tools let the exact authenticated Agent submit a one-use
CAIP-10 proof and read only the resulting hash-based binding state.
The EVIDENCE-001B tool returns only the exact owned Obligation's redacted
Evidence page. The three TRANSPORT-002 commands accept one self-owned Offer or
Obligation and remain sandbox-only, non-withdrawable, and bound to an active
runtime handoff.

The embedding application must own the approved workload authentication path.
Use the named `createAgentPilotHost(...)` composition below, or construct the
lower-level Agent client and pass its adapter to `startAgentMcpStdio(...)`.
Directly executing `src/server.js` intentionally exits with
`agent_mcp_composition_required`; it does not read credentials from arguments,
environment variables, files, or model context.

`createAgentPilotHost(...)` is the named authenticated local composition for
an embedding application. It accepts only the durable Gateway, a validated
credential-free handoff manifest, a no-argument Host-owned `authenticateAgent`
function, a Host-owned durable Subject-to-Actor binding verifier, and a trusted
Network Context factory. It constructs the existing
`AgentTenantCommandClient` and Subject/Mandate-pinned MCP Host internally:

```js
const host = createAgentPilotHost({
  gateway,
  manifest: applicationHandoff,
  authenticateAgent: () => workloadHost.authenticateAgent(),
  verifyAgentSubjectBinding: ({ authenticationContext, subjectId }) =>
    workloadHost.verifySubjectBinding(authenticationContext, subjectId),
  createNetworkContext: () => workloadHost.localNetworkContext()
});

const running = host.startStdio();
```

Authentication is performed again for every protocol command. The trusted
Actor must be an Agent with an active durable binding to the manifest Subject;
otherwise the call fails before Gateway execution. The factory cannot accept
a token, Authentication Context, Tenant, Actor, role, capability, endpoint,
stream, or secret. Credential verification and acquisition remain an
out-of-band responsibility of the embedding Host.

## Two-stage Principal-to-Agent handoff

The same closed `agent_handoff_manifest.v1` contract has two non-authorizing
phases:

- `application_ready` binds a pending or active Agent Subject to one **draft**
  Mandate for the approved Credit Intent -> Decision -> Offer workflow;
- `ready` binds the Agent to the **active** Mandate after Principal
  authorization and is reserved for post-application runtime work.

This lifecycle split is deliberate. A `ready` runtime Host fails closed with
`mcp_application_handoff_required` if it is asked to submit a new Credit Intent.
Neither phase contains credentials or funds authority.

### Application-to-Offer composition

After constructing one pre-authenticated `AgentTenantCommandClient`, a Host can
compose the draft application handoff and run the four existing MCP tools:

```js
const host = createAgentMcpHost({ client, manifest: applicationHandoff });
const receipt = await runAgentCreditOfferWorkflow({
  host,
  manifest: applicationHandoff,
  creditRequest: {
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "9000",
    purposeCode: "compute",
    requestedTermDays: 30,
    repaymentFrequency: "end_of_term",
    installmentCount: 1
  },
  workflowId: "design-partner-application-0001"
});
```

The same canonical implementation is exported for Agent integrations through
`IpoOneAgentMcpClient` in `@ipo-one/sdk`. The MCP App wrapper preserves the
existing Host API but no longer maintains a second workflow implementation;
SDK and App conformance tests pin the same eleven tool/operation pairs while the
Offer receipt continues to pin its four-step economic workflow.

The helper derives `authorityId` from the handoff, uses stable retry IDs,
validates every canonical Tenant result, and returns an immutable sandbox-only
receipt. The receipt is independently validated against the closed
`agent_credit_offer_workflow_receipt.v1` JSON Schema and explicitly states that
credentials, public endpoints, remote MCP, production funds, and funds
authority are disabled. It does not accept an Offer or activate the Mandate.

### Active runtime preflight

After the Human Principal activates an eligible sandbox Mandate, copy the
`agent_handoff_manifest.v1` packet from the Agent API workspace and save it as a
local non-credential integration artifact. Treat its identifiers and authority
metadata as private operational data. Validate it and generate the first MCP
call plan through standard input:

```sh
pnpm run agent:handoff:plan < agent-handoff.json
```

The command:

- strictly parses at most 32 KiB and rejects duplicate or unknown fields;
- requires a ready, non-authorizing, credential-free, local-stdio manifest;
- checks the exact eleven tool/operation pairs against the MCP registry;
- emits fresh request/correlation/JSON-RPC IDs and a first
  `ipo_one_read_self` call; and
- does not echo hashes, capabilities, limits, credentials, or validator
  internals.

The emitted `agent_handoff_call_plan.v1` document is not a credential and does
not start the MCP Host. The approved Host must still inject one verified Agent
Authentication Context out of band. The plan can then be sent as the first
JSON-RPC tool call after MCP initialization.

Host applications can use `createAgentMcpHost({ client, manifest })` after they
have constructed one pre-authenticated `AgentTenantCommandClient`. The factory
validates either handoff phase, pins Subject-scoped tools to its exact Subject
ID, request-credit to the exact Mandate, and economic/Evidence tools to an
active runtime handoff,
and exposes an in-process JSON-RPC handler plus an explicit `startStdio()`
method. It accepts no Authentication Context, token, Tenant, role, endpoint, or
secret configuration fields; those remain inside the injected client/Host
boundary.

Run conformance tests with:

```sh
pnpm run test:transport
```

Remote MCP/SSE, A2A, dynamic tools, shell/filesystem/browser/network tools,
production credentials, deployment, and real-funds authority remain disabled.
