import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";
import { AGENT_MCP_CLIENT_TOOLS } from "../../../packages/sdk/src/agent-mcp-client.js";
import {
  AGENT_MCP_TOOLS,
  createAgentHandoffCallPlan,
  createAgentMcpAdapter,
  createAgentMcpHost,
  createAgentMcpJsonRpcHandler,
  createAgentPilotHost,
  runAgentCreditOfferWorkflow
} from "../src/index.js";

const handoffFixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json", import.meta.url),
  "utf8"
));
const tenantProtocolFixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json", import.meta.url),
  "utf8"
));
const readyHandoff = handoffFixtures.valid.find((fixture) => fixture.status === "ready");
const applicationHandoff = handoffFixtures.valid.find(
  (fixture) => fixture.status === "application_ready"
);
const handoffCli = fileURLToPath(new URL("../src/handoff-cli.js", import.meta.url));
const serverEntrypoint = fileURLToPath(new URL("../src/server.js", import.meta.url));

function client() {
  return {
    async getSelf(input) { return { operationId: "pilotReadAgentSelf", input }; },
    async requestCredit(input) { return { operationId: "pilotRequestCredit", input }; },
    async getCreditApplication(input) { return { operationId: "pilotReadCreditApplication", input }; },
    async evaluateCreditApplication(input) { return { operationId: "pilotEvaluateCreditApplication", input }; },
    async submitAccountProof(input) { return { operationId: "pilotSubmitAgentAccountProof", input }; },
    async getAccountBinding(input) { return { operationId: "pilotReadAgentAccountBinding", input }; },
    async getOwnObligation(input) { return { operationId: "pilotReadOwnObligation", input }; },
    async getOwnObligationEvidence(input) { return { operationId: "pilotReadOwnObligationEvidence", input }; },
    async acceptCreditOffer(input) { return { operationId: "pilotAcceptCreditOffer", input }; },
    async executeSandboxObligation(input) { return { operationId: "pilotExecuteSandboxObligation", input }; },
    async postSandboxRepayment(input) { return { operationId: "pilotPostSandboxRepayment", input }; }
  };
}

function protocolResult(operationId) {
  return structuredClone(
    tenantProtocolFixtures.validResults.find((result) => result.operationId === operationId)
  );
}

function readJsonLine(stream) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for MCP stdio output"));
    }, 2_000);
    function cleanup() {
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("error", onError);
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    function onData(chunk) {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      cleanup();
      try {
        resolve(JSON.parse(buffer.slice(0, newline)));
      } catch (error) {
        reject(error);
      }
    }
    stream.setEncoding("utf8");
    stream.on("data", onData);
    stream.on("error", onError);
  });
}

function authenticatedAgentContext({
  actorId = applicationHandoff.subjectId,
  actorType = ActorType.AGENT
} = {}) {
  return createAuthenticationContext({
    tenantId: "tenant_agent_pilot_host",
    actorId,
    actorType,
    clientId: "client_agent_pilot_host",
    credentialId: "credential_agent_pilot_host",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: [
      "subject.read.self",
      "credit.request.self",
      "credit.evaluate.self",
      "agent_account.proof.submit.self",
      "agent_account.binding.read.self"
    ],
    roles: [],
    tokenJtiHash: "token_jti_hash_agent_pilot_host_00000000000000000000",
    authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: SenderConstraintMethod.DPOP,
    authenticatedAt: "2026-07-16T00:00:00.000Z"
  });
}

function workflowClient({ selfSubjectId = applicationHandoff.subjectId } = {}) {
  const calls = [];
  let intent;
  let evaluated;
  let requestCount = 0;
  let evaluationCount = 0;
  return {
    calls,
    client: {
      async getSelf(input) {
        calls.push({ method: "getSelf", input: structuredClone(input) });
        const result = protocolResult("pilotReadAgentSelf");
        result.response.subject.subjectId = selfSubjectId;
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
        return result;
      },
      async requestCredit(input) {
        calls.push({ method: "requestCredit", input: structuredClone(input) });
        const result = protocolResult("pilotRequestCredit");
        result.replayed = requestCount > 0;
        requestCount += 1;
        intent ??= {
          ...result.response.creditIntent,
          creditIntentId: "credit_intent_agent_workflow_fixture",
          subjectId: applicationHandoff.subjectId,
          authorityType: "mandate",
          authorityId: applicationHandoff.mandateId,
          ...input.payload,
          status: "submitted"
        };
        result.response.creditIntent = structuredClone(intent);
        return result;
      },
      async getCreditApplication(input) {
        calls.push({ method: "getCreditApplication", input: structuredClone(input) });
        const result = protocolResult("pilotReadCreditApplication");
        result.response.creditIntent = structuredClone(
          evaluated?.response.creditIntent ?? intent
        );
        result.response.decision = structuredClone(evaluated?.response.decision ?? null);
        result.response.offer = structuredClone(evaluated?.response.offer ?? null);
        return result;
      },
      async evaluateCreditApplication(input) {
        calls.push({ method: "evaluateCreditApplication", input: structuredClone(input) });
        const result = protocolResult("pilotEvaluateCreditApplication");
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
        return result;
      },
      async submitAccountProof(input) {
        calls.push({ method: "submitAccountProof", input: structuredClone(input) });
        return protocolResult("pilotSubmitAgentAccountProof");
      },
      async getAccountBinding(input) {
        calls.push({ method: "getAccountBinding", input: structuredClone(input) });
        return protocolResult("pilotReadAgentAccountBinding");
      },
      async getOwnObligationEvidence(input) {
        calls.push({ method: "getOwnObligationEvidence", input: structuredClone(input) });
        return protocolResult("pilotReadOwnObligationEvidence");
      },
      async getOwnObligation(input) {
        calls.push({ method: "getOwnObligation", input: structuredClone(input) });
        return protocolResult("pilotReadOwnObligation");
      },
      async acceptCreditOffer(input) {
        calls.push({ method: "acceptCreditOffer", input: structuredClone(input) });
        return protocolResult("pilotAcceptCreditOffer");
      },
      async executeSandboxObligation(input) {
        calls.push({ method: "executeSandboxObligation", input: structuredClone(input) });
        return protocolResult("pilotExecuteSandboxObligation");
      },
      async postSandboxRepayment(input) {
        calls.push({ method: "postSandboxRepayment", input: structuredClone(input) });
        return protocolResult("pilotPostSandboxRepayment");
      }
    }
  };
}

test("local Agent MCP publishes exactly the eleven approved self-owned tools", async () => {
  const adapter = createAgentMcpAdapter({ client: client() });
  assert.deepEqual(
    AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId })),
    AGENT_MCP_CLIENT_TOOLS
  );
  assert.deepEqual(AGENT_MCP_TOOLS.map((tool) => tool.name), [
    "ipo_one_read_self",
    "ipo_one_request_credit",
    "ipo_one_read_credit_application",
    "ipo_one_evaluate_credit_application",
    "ipo_one_submit_account_proof",
    "ipo_one_read_account_binding",
    "ipo_one_read_obligation",
    "ipo_one_read_obligation_evidence",
    "ipo_one_accept_credit_offer",
    "ipo_one_execute_sandbox_obligation",
    "ipo_one_post_sandbox_repayment"
  ]);
  const rpc = createAgentMcpJsonRpcHandler({ adapter });
  const listed = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), AGENT_MCP_TOOLS.map((tool) => tool.name));
  assert.equal(listed.result.tools.some((tool) => /shell|file|url|human|operator|mandate/i.test(tool.name)), false);
  const unknown = await rpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "ipo_one_activate_mandate", arguments: {} }
  });
  assert.equal(unknown.error.message, "mcp_tool_unavailable");

  const proof = await rpc({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "ipo_one_submit_account_proof",
      arguments: {
        subjectId: "subject_agent",
        payload: {
          challengeId: "agent_account_challenge_11111111-1111-4111-8111-111111111111",
          accountId: "eip155:84532:0x1111111111111111111111111111111111111111",
          signature: `0x${"11".repeat(65)}`
        },
        idempotencyKey: "idempotency-agent-account-proof-0001",
        requestId: "request-agent-account-proof-0001",
        correlationId: "correlation-agent-account-proof-0001"
      }
    }
  });
  assert.equal(proof.result.structuredContent.operationId, "pilotSubmitAgentAccountProof");

  const binding = await rpc({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "ipo_one_read_account_binding",
      arguments: {
        subjectId: "subject_agent",
        requestId: "request-agent-account-binding-0001",
        correlationId: "correlation-agent-account-binding-0001"
      }
    }
  });
  assert.equal(binding.result.structuredContent.operationId, "pilotReadAgentAccountBinding");

  const obligation = await rpc({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "ipo_one_read_obligation",
      arguments: {
        obligationId: "obligation_agent_fixture",
        requestId: "request-agent-obligation-0001",
        correlationId: "correlation-agent-obligation-0001"
      }
    }
  });
  assert.equal(obligation.result.structuredContent.operationId, "pilotReadOwnObligation");

  const evidence = await rpc({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "ipo_one_read_obligation_evidence",
      arguments: {
        obligationId: "obligation_agent_fixture",
        limit: 25,
        requestId: "request-agent-evidence-0001",
        correlationId: "correlation-agent-evidence-0001"
      }
    }
  });
  assert.equal(evidence.result.structuredContent.operationId, "pilotReadOwnObligationEvidence");

  const accepted = await rpc({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "ipo_one_accept_credit_offer",
      arguments: {
        creditOfferId: "credit_offer_agent_fixture",
        payload: {
          expectedOfferHash: `0x${"11".repeat(32)}`,
          expectedTermsHash: `0x${"22".repeat(32)}`,
          acknowledgementHash: `0x${"33".repeat(32)}`
        },
        idempotencyKey: "idempotency-agent-accept-offer-0001",
        requestId: "request-agent-accept-offer-0001",
        correlationId: "correlation-agent-accept-offer-0001"
      }
    }
  });
  assert.equal(accepted.result.structuredContent.operationId, "pilotAcceptCreditOffer");

  const executed = await rpc({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: {
      name: "ipo_one_execute_sandbox_obligation",
      arguments: {
        obligationId: "obligation_agent_fixture",
        idempotencyKey: "idempotency-agent-execute-obligation-0001",
        requestId: "request-agent-execute-obligation-0001",
        correlationId: "correlation-agent-execute-obligation-0001"
      }
    }
  });
  assert.equal(executed.result.structuredContent.operationId, "pilotExecuteSandboxObligation");

  const repaid = await rpc({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: {
      name: "ipo_one_post_sandbox_repayment",
      arguments: {
        obligationId: "obligation_agent_fixture",
        payload: { amountMinor: "2500", sourceCode: "synthetic_revenue" },
        idempotencyKey: "idempotency-agent-post-repayment-0001",
        requestId: "request-agent-post-repayment-0001",
        correlationId: "correlation-agent-post-repayment-0001"
      }
    }
  });
  assert.equal(repaid.result.structuredContent.operationId, "pilotPostSandboxRepayment");
});

test("MCP tool arguments cannot carry credentials or Authentication Context", async () => {
  const rpc = createAgentMcpJsonRpcHandler({ adapter: createAgentMcpAdapter({ client: client() }) });
  const response = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "ipo_one_read_self",
      arguments: {
        subjectId: "subject_agent",
        requestId: "request-agent-mcp",
        correlationId: "correlation-agent-mcp",
        accessToken: "prohibited"
      }
    }
  });
  assert.equal(response.error.message, "invalid_mcp_tool_arguments");
  assert.equal(JSON.stringify(AGENT_MCP_TOOLS).includes("accessToken"), false);
  assert.equal(JSON.stringify(AGENT_MCP_TOOLS).includes("authenticationContext"), false);
});

test("ready handoff creates one immutable first self-read call without credential authority", () => {
  const plan = createAgentHandoffCallPlan(readyHandoff, {
    requestId: "request-agent-handoff-001",
    correlationId: "correlation-agent-handoff-001",
    jsonRpcId: "rpc-agent-handoff-001"
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.firstCall.params.arguments), true);
  assert.equal(plan.schemaVersion, "agent_handoff_call_plan.v1");
  assert.equal(plan.transportProfile, "mcp_stdio_local");
  assert.equal(plan.hostCompositionRequired, true);
  assert.equal(plan.credentialDelivery, "out_of_band");
  assert.equal(plan.firstCall.params.name, "ipo_one_read_self");
  assert.equal(plan.firstCall.params.arguments.subjectId, readyHandoff.subjectId);
  assert.equal(plan.credentialsIncluded, false);
  assert.equal(plan.remoteMcpEnabled, false);
  assert.equal(plan.fundsAuthority, false);
  for (const omitted of ["mandateHash", "termsHash", "authority", "capabilities", "tenantId", "roles"]) {
    assert.equal(Object.hasOwn(plan, omitted), false);
  }
});

test("handoff call plan fails closed for waiting or unsafe request identifiers", () => {
  assert.throws(
    () => createAgentHandoffCallPlan(handoffFixtures.valid[0]),
    (error) => error.code === "agent_handoff_not_ready"
  );
  assert.throws(
    () => createAgentHandoffCallPlan(readyHandoff, { requestId: "bad value" }),
    (error) => error.code === "invalid_agent_handoff_plan"
  );
  assert.throws(
    () => createAgentHandoffCallPlan(handoffFixtures.invalid[0]),
    (error) => error.code === "invalid_agent_handoff_manifest"
  );
  const drifted = structuredClone(readyHandoff);
  drifted.protocol.tools[0].operationId = "pilotReadTenantRisk";
  assert.throws(
    () => createAgentHandoffCallPlan(drifted),
    (error) => error.code === "invalid_agent_handoff_manifest"
  );
});

test("ready handoff composes one Subject-pinned MCP Host over the injected Agent client", async () => {
  const host = createAgentMcpHost({ client: client(), manifest: readyHandoff });
  const plan = createAgentHandoffCallPlan(readyHandoff, {
    requestId: "request-agent-host-001",
    correlationId: "correlation-agent-host-001",
    jsonRpcId: "rpc-agent-host-001"
  });
  const response = await host.handle(plan.firstCall);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.operationId, "pilotReadAgentSelf");
  assert.equal(
    response.result.structuredContent.input.subjectId,
    readyHandoff.subjectId
  );

  const wrongSubject = structuredClone(plan.firstCall);
  wrongSubject.id = "rpc-agent-host-002";
  wrongSubject.params.arguments.subjectId = "subject_outside_handoff";
  const denied = await host.handle(wrongSubject);
  assert.equal(denied.error.message, "mcp_subject_scope_denied");

  const wrongMandate = {
    jsonrpc: "2.0",
    id: "rpc-agent-host-003",
    method: "tools/call",
    params: {
      name: "ipo_one_request_credit",
      arguments: {
        subjectId: readyHandoff.subjectId,
        payload: {
          authorityId: "mandate_outside_handoff",
          assetId: "urn:ipo-one:sandbox-asset:usd-cent",
          requestedPrincipalMinor: "9000",
          purposeCode: "compute",
          requestedTermDays: 30,
          repaymentFrequency: "end_of_term",
          installmentCount: 1
        },
        idempotencyKey: "idempotency-agent-host-wrong-mandate-0001",
        requestId: "request-agent-host-wrong-mandate-0001",
        correlationId: "correlation-agent-host-wrong-mandate-0001"
      }
    }
  };
  const mandateDenied = await host.handle(wrongMandate);
  assert.equal(mandateDenied.error.message, "mcp_mandate_scope_denied");

  const runtimeRequest = structuredClone(wrongMandate);
  runtimeRequest.id = "rpc-agent-host-004";
  runtimeRequest.params.arguments.payload.authorityId = readyHandoff.mandateId;
  const applicationRequired = await host.handle(runtimeRequest);
  assert.equal(applicationRequired.error.message, "mcp_application_handoff_required");

  assert.throws(
    () => createAgentMcpHost({ client: client(), manifest: handoffFixtures.valid[0] }),
    (error) => error.code === "agent_handoff_not_ready"
  );
  assert.throws(
    () => createAgentMcpHost({ client: client(), manifest: readyHandoff, accessToken: "prohibited" }),
    (error) => error.code === "invalid_agent_mcp_host_config"
  );
});

test("named Agent pilot Host binds fresh trusted identity and network context to the handoff", async () => {
  const context = authenticatedAgentContext({ actorId: readyHandoff.subjectId });
  const networkContext = Object.freeze({ source: "local_mcp_stdio" });
  const calls = [];
  let authenticationCount = 0;
  let networkCount = 0;
  const gateway = {
    async execute(command) {
      calls.push(command);
      assert.equal(command.authenticationContext, context);
      assert.equal(command.networkContext, networkContext);
      assert.equal(command.resource.resourceId, readyHandoff.subjectId);
      return protocolResult(command.operationId);
    }
  };
  const host = createAgentPilotHost({
    gateway,
    manifest: readyHandoff,
    async authenticateAgent() {
      authenticationCount += 1;
      return context;
    },
    async verifyAgentSubjectBinding({ authenticationContext, subjectId }) {
      return authenticationContext === context && subjectId === readyHandoff.subjectId;
    },
    async createNetworkContext() {
      networkCount += 1;
      return networkContext;
    }
  });
  const firstPlan = createAgentHandoffCallPlan(readyHandoff, {
    requestId: "request-agent-pilot-host-001",
    correlationId: "correlation-agent-pilot-host-001",
    jsonRpcId: "rpc-agent-pilot-host-001"
  });
  const first = await host.handle(firstPlan.firstCall);
  assert.equal(first.result.structuredContent.operationId, "pilotReadAgentSelf");

  const secondCall = structuredClone(firstPlan.firstCall);
  secondCall.id = "rpc-agent-pilot-host-002";
  secondCall.params.arguments.requestId = "request-agent-pilot-host-002";
  const second = await host.handle(secondCall);
  assert.equal(second.result.structuredContent.operationId, "pilotReadAgentSelf");
  assert.equal(authenticationCount, 2);
  assert.equal(networkCount, 2);
  assert.equal(calls.length, 2);

  const tools = await host.handle({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.deepEqual(
    tools.result.tools.map(({ name }) => name),
    AGENT_MCP_TOOLS.map(({ name }) => name)
  );

  for (const mismatch of [
    authenticatedAgentContext({ actorId: "subject_agent_outside_handoff" }),
    authenticatedAgentContext({ actorType: ActorType.PROVIDER })
  ]) {
    let mismatchGatewayCalls = 0;
    const mismatchHost = createAgentPilotHost({
      gateway: { async execute() { mismatchGatewayCalls += 1; } },
      manifest: readyHandoff,
      authenticateAgent: async () => mismatch,
      verifyAgentSubjectBinding: async () => false,
      createNetworkContext: async () => networkContext
    });
    const denied = await mismatchHost.handle(firstPlan.firstCall);
    assert.equal(denied.error.message, "agent_pilot_host_identity_mismatch");
    assert.equal(mismatchGatewayCalls, 0);
  }

  assert.throws(
    () => createAgentPilotHost({
      gateway,
      manifest: readyHandoff,
      authenticateAgent: async () => context,
      verifyAgentSubjectBinding: async () => true,
      createNetworkContext: async () => networkContext,
      accessToken: "prohibited"
    }),
    (error) => error.code === "invalid_agent_pilot_host_config"
  );
  const getterConfig = {
    gateway,
    manifest: readyHandoff,
    authenticateAgent: async () => context,
    verifyAgentSubjectBinding: async () => true,
    createNetworkContext: async () => networkContext
  };
  Object.defineProperty(getterConfig, "accessToken", {
    enumerable: true,
    get() { throw new Error("must not execute"); }
  });
  assert.throws(
    () => createAgentPilotHost(getterConfig),
    (error) => error.code === "invalid_agent_pilot_host_config"
  );
});

test("named Agent pilot Host completes the four-tool Offer workflow with per-command authentication", async () => {
  const runtime = workflowClient();
  const context = authenticatedAgentContext();
  const networkContext = Object.freeze({ source: "local_mcp_stdio" });
  let authenticationCount = 0;
  let networkCount = 0;
  let gatewayCount = 0;
  const gateway = {
    async execute(command) {
      gatewayCount += 1;
      assert.equal(command.authenticationContext, context);
      assert.equal(command.networkContext, networkContext);
      const common = {
        requestId: command.requestId,
        correlationId: command.correlationId
      };
      if (command.operationId === "pilotReadAgentSelf") {
        return runtime.client.getSelf({
          ...common,
          subjectId: command.resource.resourceId
        });
      }
      if (command.operationId === "pilotRequestCredit") {
        return runtime.client.requestCredit({
          ...common,
          subjectId: command.resource.resourceId,
          payload: command.payload,
          idempotencyKey: command.idempotencyKey
        });
      }
      if (command.operationId === "pilotReadCreditApplication") {
        return runtime.client.getCreditApplication({
          ...common,
          creditIntentId: command.resource.resourceId
        });
      }
      return runtime.client.evaluateCreditApplication({
        ...common,
        creditIntentId: command.resource.resourceId,
        idempotencyKey: command.idempotencyKey
      });
    }
  };
  const host = createAgentPilotHost({
    gateway,
    manifest: applicationHandoff,
    async authenticateAgent() {
      authenticationCount += 1;
      return context;
    },
    async verifyAgentSubjectBinding() {
      return true;
    },
    async createNetworkContext() {
      networkCount += 1;
      return networkContext;
    }
  });
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
    workflowId: "agent-pilot-host-offer-workflow-0001"
  });
  assert.equal(receipt.status, "offer_ready");
  assert.equal(receipt.subjectId, applicationHandoff.subjectId);
  assert.equal(receipt.mandateId, applicationHandoff.mandateId);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.fundsAuthority, false);
  assert.equal(authenticationCount, 4);
  assert.equal(networkCount, 4);
  assert.equal(gatewayCount, 4);
  assert.deepEqual(runtime.calls.map(({ method }) => method), [
    "getSelf",
    "requestCredit",
    "getCreditApplication",
    "evaluateCreditApplication"
  ]);
});

test("named Agent pilot Host serves one authenticated MCP call over local stdio", async () => {
  const context = authenticatedAgentContext({ actorId: readyHandoff.subjectId });
  const host = createAgentPilotHost({
    gateway: {
      async execute(command) {
        assert.equal(command.authenticationContext, context);
        assert.equal(command.resource.resourceId, readyHandoff.subjectId);
        return protocolResult(command.operationId);
      }
    },
    manifest: readyHandoff,
    authenticateAgent: async () => context,
    verifyAgentSubjectBinding: async ({ authenticationContext, subjectId }) => (
      authenticationContext === context && subjectId === readyHandoff.subjectId
    ),
    createNetworkContext: async () => ({ source: "local_mcp_stdio" })
  });
  const input = new PassThrough();
  const output = new PassThrough();
  const running = host.startStdio({ input, output });
  const plan = createAgentHandoffCallPlan(readyHandoff, {
    requestId: "request-agent-pilot-stdio-001",
    correlationId: "correlation-agent-pilot-stdio-001",
    jsonRpcId: "rpc-agent-pilot-stdio-001"
  });
  const responsePromise = readJsonLine(output);
  input.write(`${JSON.stringify(plan.firstCall)}\n`);
  const response = await responsePromise;
  await running.close();
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, "rpc-agent-pilot-stdio-001");
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.operationId, "pilotReadAgentSelf");
});

test("application-ready handoff completes the four-tool Agent Credit Intent to Offer workflow idempotently", async () => {
  const runtime = workflowClient();
  const host = createAgentMcpHost({ client: runtime.client, manifest: applicationHandoff });
  const input = {
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
    workflowId: "agent-credit-offer-workflow-fixture-0001"
  };
  const receipt = await runAgentCreditOfferWorkflow(input);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.steps), true);
  assert.equal(Object.isFrozen(receipt.offer), true);
  assert.equal(receipt.schemaVersion, "agent_credit_offer_workflow_receipt.v1");
  assert.equal(receipt.status, "offer_ready");
  assert.equal(receipt.nonAuthorizing, true);
  assert.equal(receipt.sandboxOnly, true);
  assert.equal(receipt.productionFundsApproved, false);
  assert.equal(receipt.fundsAuthority, false);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.publicEndpointEnabled, false);
  assert.equal(receipt.remoteMcpEnabled, false);
  assert.equal(receipt.subjectId, applicationHandoff.subjectId);
  assert.equal(receipt.mandateId, applicationHandoff.mandateId);
  assert.equal(receipt.creditIntent.authorityId, applicationHandoff.mandateId);
  assert.equal(receipt.decision.productionAuthority, false);
  assert.equal(receipt.offer.productionFundsApproved, false);
  assert.deepEqual(
    receipt.steps.map(({ tool }) => tool),
    AGENT_MCP_TOOLS.slice(0, 4).map(({ name }) => name)
  );
  assert.deepEqual(runtime.calls.map(({ method }) => method), [
    "getSelf",
    "requestCredit",
    "getCreditApplication",
    "evaluateCreditApplication"
  ]);
  assert.equal(runtime.calls[1].input.payload.authorityId, applicationHandoff.mandateId);

  const replay = await runAgentCreditOfferWorkflow(input);
  assert.equal(replay.creditIntent.creditIntentId, receipt.creditIntent.creditIntentId);
  assert.equal(replay.decision.riskDecisionId, receipt.decision.riskDecisionId);
  assert.equal(replay.steps[1].replayed, true);
  assert.equal(replay.steps[3].replayed, true);
});

test("Agent Credit Offer workflow rejects scope, authority input, and response drift before escalation", async () => {
  const scoped = workflowClient();
  const scopedHost = createAgentMcpHost({ client: scoped.client, manifest: applicationHandoff });
  const base = {
    host: scopedHost,
    manifest: applicationHandoff,
    creditRequest: {
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedPrincipalMinor: "9000",
      purposeCode: "compute",
      requestedTermDays: 30,
      repaymentFrequency: "end_of_term",
      installmentCount: 1
    },
    workflowId: "agent-credit-offer-workflow-fixture-0002"
  };
  await assert.rejects(
    () => runAgentCreditOfferWorkflow({
      ...base,
      creditRequest: { ...base.creditRequest, authorityId: applicationHandoff.mandateId }
    }),
    (error) => error.code === "invalid_agent_credit_workflow"
  );
  assert.equal(scoped.calls.length, 0);

  await assert.rejects(
    () => runAgentCreditOfferWorkflow({
      ...base,
      creditRequest: { ...base.creditRequest, requestedPrincipalMinor: "25001" }
    }),
    (error) => error.code === "agent_credit_workflow_scope_denied"
  );
  assert.equal(scoped.calls.length, 0);

  const drifted = workflowClient({ selfSubjectId: "subject_response_drift" });
  const driftedHost = createAgentMcpHost({ client: drifted.client, manifest: applicationHandoff });
  await assert.rejects(
    () => runAgentCreditOfferWorkflow({ ...base, host: driftedHost }),
    (error) => error.code === "agent_credit_workflow_drift"
  );
  assert.deepEqual(drifted.calls.map(({ method }) => method), ["getSelf"]);
});

test("handoff CLI reads bounded strict stdin and emits only a safe call plan", () => {
  const valid = spawnSync(process.execPath, [handoffCli], {
    input: JSON.stringify(readyHandoff),
    encoding: "utf8"
  });
  assert.equal(valid.status, 0, valid.stderr);
  const plan = JSON.parse(valid.stdout);
  assert.equal(plan.schemaVersion, "agent_handoff_call_plan.v1");
  assert.equal(plan.firstCall.params.name, "ipo_one_read_self");
  assert.doesNotMatch(valid.stdout, /mandateHash|termsHash|capabilities|aggregateLimit|perActionLimit/);

  const invalid = spawnSync(process.execPath, [handoffCli], {
    input: '{"schemaVersion":"agent_handoff_manifest.v1","status":"ready","status":"awaiting_active_mandate"}',
    encoding: "utf8"
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /invalid_agent_handoff_input/);
  assert.doesNotMatch(invalid.stderr, /instancePath|schemaPath|stack|validator/);

  const credentialBearing = spawnSync(process.execPath, [handoffCli], {
    input: JSON.stringify(handoffFixtures.invalid[0]),
    encoding: "utf8"
  });
  assert.equal(credentialBearing.status, 1);
  assert.equal(credentialBearing.stdout, "");
  assert.doesNotMatch(credentialBearing.stderr, /credentialsIncluded|true|instancePath/);

  const oversized = spawnSync(process.execPath, [handoffCli], {
    input: " ".repeat(32 * 1024 + 1),
    encoding: "utf8"
  });
  assert.equal(oversized.status, 1);
  assert.equal(oversized.stdout, "");
  assert.match(oversized.stderr, /invalid_agent_handoff_input/);
});

test("handoff preflight has no credential loader or ambient transport and cannot start the MCP Host", async () => {
  const [cliSource, planSource] = await Promise.all([
    readFile(handoffCli, "utf8"),
    readFile(new URL("../src/agent-handoff-plan.js", import.meta.url), "utf8")
  ]);
  for (const source of [cliSource, planSource]) {
    assert.doesNotMatch(source, /process\.env|node:fs|fetch\(|node:http|node:https|listen\(|createConnection|WebSocket/);
  }
  const server = spawnSync(process.execPath, [serverEntrypoint], { encoding: "utf8" });
  assert.equal(server.status, 78);
  assert.match(server.stderr, /agent_mcp_composition_required/);
});
