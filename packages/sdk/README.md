# IPO.ONE SDK

Private alpha SDK for IPO.ONE's deliberately separate public-demo and durable
Agent entry surfaces. It does not grant authentication, authorization,
transport, credit, or funds authority.

## Agent pilot capability discovery

`createAgentPilotCapabilityManifest(handoff)` turns one validated waiting,
draft-application, or active-runtime handoff into the closed immutable
`agent_pilot_capability_manifest.v1`. The manifest advertises the exact eleven
local MCP tools, including exact owned Obligation hydration, and three existing SDK workflows in lifecycle order, with an
explicit `enabled`, `locked`, or `input_required` state and next Agent action.

The packet is metadata only. It does not invoke a tool, load a credential,
grant a capability, create an endpoint, or perform chain/network execution.
Offer remains a draft-handoff MCP composition. Owned Evidence, Offer
acceptance, sandbox execution, and synthetic repayment are active-handoff MCP
tools over the same authenticated Tenant protocol. The Obligation SDK remains
an equivalent typed composition, and portability consumes a prior lifecycle
receipt locally without RPC.

## Local Agent MCP client

`IpoOneAgentMcpClient` is the reviewed Agent-first entry for the current
durable no-funds application path. It accepts only:

- one validated `application_ready` handoff manifest;
- one already composed in-process JSON-RPC handler; and
- the literal `mcp_stdio_local` transport profile.

The Host must first authenticate the Agent out of band and construct the local
MCP handler. The SDK never accepts credentials, endpoints, caller-selected
Tenant/Actor roles, or an authority override.

```js
import { IpoOneAgentMcpClient } from "@ipo-one/sdk";

const agent = new IpoOneAgentMcpClient({
  handle: localMcpHost.handle,
  manifest: applicationHandoff,
  transportProfile: "mcp_stdio_local"
});

const receipt = await agent.runCreditOfferWorkflow({
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

The credit workflow executes exactly four reviewed self-owned tools: self-read,
Credit Intent submission, application read, and deterministic evaluation. The
shared local MCP registry additionally exposes two IDENTITY-001 tools, one
owned Evidence read, and three TRANSPORT-002 economic lifecycle tools. It derives
Mandate authority from the handoff, creates stable retry identifiers, validates
every Tenant result, and returns a closed immutable
`agent_credit_offer_workflow_receipt.v1`. Reusing the workflow ID replays the
same durable Intent and Decision.

`runCreditOfferWorkflow` remains application-only. The approved economic and
Evidence tools are called through a separate runtime-ready MCP Host or through
the typed clients below. Remote MCP/SSE/A2A, credential loading,
caller-selected Subject activation, production execution, real-funds movement,
and unrestricted servicing remain unavailable.

## Local Agent sandbox Obligation client

`IpoOneAgentSandboxObligationClient` composes the already-approved private
Tenant protocol after the Principal has activated the Agent Subject and
Mandate. It accepts only:

- one validated `ready` handoff manifest with `accept_credit_offer`,
  `execute_sandbox_credit`, and `route_repayment`;
- one injected, already-authenticated Tenant protocol executor; and
- the literal `local_in_process` profile.

```js
import { IpoOneAgentSandboxObligationClient } from "@ipo-one/sdk";

const obligations = new IpoOneAgentSandboxObligationClient({
  execute: authenticatedAgentClient.execute.bind(authenticatedAgentClient),
  manifest: activeHandoff,
  transportProfile: "local_in_process"
});

const obligationReceipt = await obligations.runObligationWorkflow({
  offerReceipt,
  acknowledgementHash: acknowledgementHashFromTrustedAgentRuntime,
  repayment: {
    amountMinor: "3000",
    sourceCode: "synthetic_revenue"
  },
  workflowId: "design-partner-obligation-0001"
});
```

The workflow sends exactly `pilotAcceptCreditOffer`,
`pilotExecuteSandboxObligation`, and `pilotPostSandboxRepayment`. Stable
request/idempotency identifiers make the whole sequence replay-safe. Every
result and cross-step identifier is checked before continuation, and the SDK
returns an immutable
`agent_sandbox_obligation_workflow_receipt.v1` containing the shared
`obligation.v2`, signed sandbox execution receipt, principal Ledger
transaction reference, and synthetic repayment.

This client creates no listener and loads no credential. The executor owns
fresh authentication and trusted network context. The same three economic
commands are available through the approved TRANSPORT-002 local MCP registry,
with identical downstream authorization and invariants. All execution is
non-withdrawable and proves
`sandboxOnly=true` and `productionFundsMoved=false`.

## Owned Obligation Evidence client

`IpoOneAgentEvidenceClient` reads the authenticated Agent's exact owned
Obligation Evidence through `pilotReadOwnObligationEvidence`. It accepts only
a validated active handoff, an already-authenticated local executor, and a
bounded page query. It returns redacted hash-based Evidence without event
payloads, actor data, credentials, mutation, or export.

```js
import { IpoOneAgentEvidenceClient } from "@ipo-one/sdk";

const evidenceClient = new IpoOneAgentEvidenceClient({
  execute: authenticatedAgentClient.execute.bind(authenticatedAgentClient),
  manifest: activeHandoff,
  transportProfile: "local_in_process"
});

const evidence = await evidenceClient.readObligationEvidence({
  obligationId: obligationReceipt.obligation.obligationId,
  limit: 25,
  requestId: "request-owned-evidence-0001",
  correlationId: obligationReceipt.correlationId
});
```

## Shared Obligation portability conformance

After either the Human or Agent sandbox lifecycle completes, the SDK can bind
that immutable receipt to the two ratified CHAIN-001A profiles:

```js
import { runSandboxObligationPortabilityConformance } from "@ipo-one/sdk";

const portability = await runSandboxObligationPortabilityConformance({
  workflowReceipt: obligationReceipt
});
```

The pure local workflow returns
`sandbox_obligation_portability_receipt.v1`. It verifies that Base Sepolia and
X Layer Testnet produce the same canonical Payment and Obligation kernel while
retaining separate synthetic finality and Evidence hashes. It binds both the
principal and repayment Ledger transaction references, performs deterministic
reorg/replay/failover/cap conformance, and makes no RPC or other network call.
It is not a live testnet receipt and accepts no endpoint, credential, wallet,
key, signer, contract, authority, or funds input.

## Privacy-safe Agent feedback client

`IpoOneAgentFeedbackClient` submits one closed categorical design-partner
signal for the exact authenticated Agent Subject through
`pilotSubmitPilotFeedback`. It accepts an injected local Tenant executor and
the literal `local_in_process` transport profile; it accepts no endpoint,
credential, Tenant override, free text, identifier-bearing comment, or funds
authority.

```js
import { IpoOneAgentFeedbackClient } from "@ipo-one/sdk";

const feedback = new IpoOneAgentFeedbackClient({
  execute: authenticatedAgentClient.execute.bind(authenticatedAgentClient),
  transportProfile: "local_in_process"
});

await feedback.submit({
  subjectId: activeAgentSubjectId,
  surface: "agent_sdk",
  lifecycleStage: "repayment",
  sentiment: "valuable",
  outcome: "completed",
  blockerCode: "none",
  workflowId: "design-partner-feedback-0001"
});
```

Stable workflow identifiers make retries idempotent. The returned receipt is
immutable and identifier-minimal; feedback never changes underwriting,
Mandate, Obligation, servicing, or funds state.

## Anonymous public-demo HTTP client

`IpoOneClient` wraps the separate process-local Agent Lockbox demonstration
API. Its sandbox session ID partitions demo state; it is not authentication,
Tenant identity, or authorization.

```js
import { IpoOneClient } from "@ipo-one/sdk";

const client = new IpoOneClient({ baseUrl: "http://127.0.0.1:3000" });
const current = await client.getDemoState();
const state = await client.createAgent({ displayName: "Revenue Agent" });
```

The HTTP client never retries mutations automatically. Callers may provide a
stable request ID, abort signal, and explicit headers; structured API failures
are returned as `IpoOneApiError` instances.

No SDK surface moves real funds or contains wallet keys, signing, custody,
KYC, or Provider credentials.
