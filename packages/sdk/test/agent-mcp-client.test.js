import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_MCP_CLIENT_TOOLS,
  IpoOneAgentMcpClient,
  IpoOneAgentSdkError
} from "../src/index.js";

const handoffFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const tenantProtocolFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const applicationHandoff = handoffFixtures.valid.find(
  (fixture) => fixture.status === "application_ready"
);
const readyHandoff = handoffFixtures.valid.find((fixture) => fixture.status === "ready");

function protocolResult(operationId) {
  return structuredClone(
    tenantProtocolFixtures.validResults.find((result) => result.operationId === operationId)
  );
}

function workflowHandle({ operationDrift = false } = {}) {
  const calls = [];
  let intent;
  let evaluated;
  let requestCount = 0;
  let evaluationCount = 0;

  async function handle(message) {
    calls.push(structuredClone(message));
    const { name, arguments: args } = message.params;
    let result;
    if (name === "ipo_one_read_self") {
      result = protocolResult("pilotReadAgentSelf");
      result.response.subject.subjectId = applicationHandoff.subjectId;
      result.response.subject.status = "pending";
      result.response.mandates[0] = {
        ...result.response.mandates[0],
        mandateId: applicationHandoff.mandateId,
        mandateHash: applicationHandoff.mandateHash,
        status: "draft",
        capabilities: [...applicationHandoff.authority.capabilities],
        assetIds: [...applicationHandoff.authority.assetIds],
        providerScopeCount: 0,
        categoryScopeCount: 0,
        perActionLimitMinor: applicationHandoff.authority.perActionLimitMinor,
        aggregateLimitMinor: applicationHandoff.authority.aggregateLimitMinor,
        expiresAt: applicationHandoff.authority.expiresAt
      };
    } else if (name === "ipo_one_request_credit") {
      result = protocolResult("pilotRequestCredit");
      result.replayed = requestCount > 0;
      requestCount += 1;
      intent ??= {
        ...result.response.creditIntent,
        creditIntentId: "credit_intent_agent_sdk_fixture",
        subjectId: applicationHandoff.subjectId,
        authorityType: "mandate",
        authorityId: applicationHandoff.mandateId,
        ...args.payload,
        status: "submitted"
      };
      result.response.creditIntent = structuredClone(intent);
    } else if (name === "ipo_one_read_credit_application") {
      result = protocolResult("pilotReadCreditApplication");
      result.response.creditIntent = structuredClone(evaluated?.response.creditIntent ?? intent);
      result.response.decision = structuredClone(evaluated?.response.decision ?? null);
      result.response.offer = structuredClone(evaluated?.response.offer ?? null);
    } else {
      result = protocolResult("pilotEvaluateCreditApplication");
      result.replayed = evaluationCount > 0;
      evaluationCount += 1;
      result.response.creditIntent = {
        ...structuredClone(intent),
        status: "decided",
        updatedAt: result.response.creditIntent.updatedAt
      };
      result.response.decision = {
        ...result.response.decision,
        creditIntentId: intent.creditIntentId,
        subjectId: applicationHandoff.subjectId,
        authorityType: "mandate",
        authorityId: applicationHandoff.mandateId,
        assetId: intent.assetId,
        reasonCodes: result.response.decision.reasonCodes.map((code) =>
          code === "identity_evidence_current" ? "principal_binding_current" : code
        ),
        decisionPassport: {
          ...result.response.decision.decisionPassport,
          sourceEvidence: result.response.decision.decisionPassport.sourceEvidence.filter(
            ({ role }) => role !== "human_identity_reference"
          ),
          reasonLineage: result.response.decision.decisionPassport.reasonLineage.map((lineage) =>
            lineage.reasonCode === "identity_evidence_current"
              ? {
                  reasonCode: "principal_binding_current",
                  featureKeys: ["principalBindingCurrent"],
                  sourceRoles: ["subject", "principal", "authority"]
                }
              : lineage
          )
        }
      };
      result.response.offer = {
        ...result.response.offer,
        creditIntentId: intent.creditIntentId,
        riskDecisionId: result.response.decision.riskDecisionId,
        subjectId: applicationHandoff.subjectId,
        assetId: intent.assetId,
        approvedPrincipalMinor: intent.requestedPrincipalMinor,
        repaymentFrequency: intent.repaymentFrequency,
        installmentCount: intent.installmentCount
      };
      evaluated ??= structuredClone(result);
    }
    if (operationDrift && calls.length === 3) result.operationId = "pilotReadAgentSelf";
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false
      }
    };
  }

  return { calls, handle };
}

function workflowInput(workflowId = "agent-sdk-credit-offer-workflow-0001") {
  return {
    creditRequest: {
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedPrincipalMinor: "9000",
      purposeCode: "compute",
      requestedTermDays: 30,
      repaymentFrequency: "end_of_term",
      installmentCount: 1
    },
    workflowId
  };
}

test("Agent SDK publishes the exact reviewed local MCP operation pairs", () => {
  assert.deepEqual(AGENT_MCP_CLIENT_TOOLS, [
    { name: "ipo_one_read_self", operationId: "pilotReadAgentSelf" },
    { name: "ipo_one_request_credit", operationId: "pilotRequestCredit" },
    {
      name: "ipo_one_read_credit_application",
      operationId: "pilotReadCreditApplication"
    },
    {
      name: "ipo_one_evaluate_credit_application",
      operationId: "pilotEvaluateCreditApplication"
    },
    {
      name: "ipo_one_submit_account_proof",
      operationId: "pilotSubmitAgentAccountProof"
    },
    {
      name: "ipo_one_read_account_binding",
      operationId: "pilotReadAgentAccountBinding"
    },
    {
      name: "ipo_one_read_obligation",
      operationId: "pilotReadOwnObligation"
    },
    {
      name: "ipo_one_read_obligation_evidence",
      operationId: "pilotReadOwnObligationEvidence"
    },
    {
      name: "ipo_one_accept_credit_offer",
      operationId: "pilotAcceptCreditOffer"
    },
    {
      name: "ipo_one_execute_sandbox_obligation",
      operationId: "pilotExecuteSandboxObligation"
    },
    {
      name: "ipo_one_post_sandbox_repayment",
      operationId: "pilotPostSandboxRepayment"
    }
  ]);
  assert.equal(Object.isFrozen(AGENT_MCP_CLIENT_TOOLS), true);
  assert.equal(AGENT_MCP_CLIENT_TOOLS.every(Object.isFrozen), true);
});

test("Agent SDK reaches one immutable no-funds Offer receipt and replays safely", async () => {
  const runtime = workflowHandle();
  const client = new IpoOneAgentMcpClient({
    handle: runtime.handle,
    manifest: applicationHandoff,
    transportProfile: "mcp_stdio_local"
  });
  const input = workflowInput();
  const receipt = await client.runCreditOfferWorkflow(input);
  assert.equal(receipt.schemaVersion, "agent_credit_offer_workflow_receipt.v1");
  assert.equal(receipt.status, "offer_ready");
  assert.equal(receipt.nonAuthorizing, true);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.publicEndpointEnabled, false);
  assert.equal(receipt.remoteMcpEnabled, false);
  assert.equal(receipt.fundsAuthority, false);
  assert.equal(receipt.productionFundsApproved, false);
  assert.equal(receipt.subjectId, applicationHandoff.subjectId);
  assert.equal(receipt.mandateId, applicationHandoff.mandateId);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.steps), true);
  assert.deepEqual(
    receipt.steps.map(({ tool, operationId }) => ({ name: tool, operationId })),
    AGENT_MCP_CLIENT_TOOLS.slice(0, 4)
  );
  assert.equal(runtime.calls[1].params.arguments.payload.authorityId, applicationHandoff.mandateId);

  const replay = await client.runCreditOfferWorkflow(input);
  assert.equal(replay.creditIntent.creditIntentId, receipt.creditIntent.creditIntentId);
  assert.equal(replay.decision.riskDecisionId, receipt.decision.riskDecisionId);
  assert.equal(replay.steps[1].replayed, true);
  assert.equal(replay.steps[3].replayed, true);
});

test("Agent SDK configuration is closed and local-profile-only", () => {
  const runtime = workflowHandle();
  assert.throws(
    () => new IpoOneAgentMcpClient({
      handle: runtime.handle,
      manifest: applicationHandoff,
      transportProfile: "mcp_stdio_local",
      accessToken: "prohibited"
    }),
    (error) => error instanceof IpoOneAgentSdkError && error.code === "invalid_agent_mcp_sdk_config"
  );
  assert.throws(
    () => new IpoOneAgentMcpClient({
      handle: runtime.handle,
      manifest: applicationHandoff,
      transportProfile: "mcp_remote"
    }),
    (error) => error.code === "invalid_agent_mcp_sdk_config"
  );
  assert.throws(
    () => new IpoOneAgentMcpClient({
      handle: runtime.handle,
      manifest: readyHandoff,
      transportProfile: "mcp_stdio_local"
    }),
    (error) => error.code === "agent_application_handoff_required"
  );
});

test("Agent SDK rejects authority input and protocol-result drift", async () => {
  const clean = workflowHandle();
  const client = new IpoOneAgentMcpClient({
    handle: clean.handle,
    manifest: applicationHandoff,
    transportProfile: "mcp_stdio_local"
  });
  const input = workflowInput("agent-sdk-credit-offer-workflow-0002");
  await assert.rejects(
    () => client.runCreditOfferWorkflow({
      ...input,
      creditRequest: {
        ...input.creditRequest,
        authorityId: applicationHandoff.mandateId
      }
    }),
    (error) => error.code === "invalid_agent_credit_workflow"
  );
  assert.equal(clean.calls.length, 0);

  const drifted = workflowHandle({ operationDrift: true });
  const driftedClient = new IpoOneAgentMcpClient({
    handle: drifted.handle,
    manifest: applicationHandoff,
    transportProfile: "mcp_stdio_local"
  });
  await assert.rejects(
    () => driftedClient.runCreditOfferWorkflow(
      workflowInput("agent-sdk-credit-offer-workflow-0003")
    ),
    (error) => error.code === "agent_credit_workflow_drift"
  );
  assert.equal(drifted.calls.length, 3);
});
