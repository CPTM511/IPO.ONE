import assert from "node:assert/strict";
import test from "node:test";
import protocolFixtures from "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json" with { type: "json" };
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createLocalAgentMcpTransport,
  createLocalAgentApplicationInput,
  createM1BAgentForeignOfferApplicationInput,
  createLocalAgentRuntimeInput,
  persistLocalAgentContinuationReceipt
} from "../src/agent-reference-workflows.js";

const manifest = Object.freeze({
  mandateHash: `0x${"a".repeat(64)}`,
  authority: Object.freeze({
    assetIds: Object.freeze([
      "urn:ipo-one:sandbox-asset:usd-cent"
    ]),
    perActionLimitMinor: "25000",
    aggregateLimitMinor: "100000"
  })
});

function protocolResult(operationId) {
  return structuredClone(
    protocolFixtures.validResults.find((result) => (
      result.operationId === operationId
    ))
  );
}

function runtimeCommands() {
  const common = {
    schemaVersion: "tenant_protocol_request.v1",
    correlationId: "correlation_agent_obligation:test:credit"
  };
  return [
    {
      ...common,
      operationId: "pilotAcceptCreditOffer",
      payload: {
        expectedOfferHash: `0x${"1".repeat(64)}`,
        expectedTermsHash: `0x${"2".repeat(64)}`,
        acknowledgementHash: `0x${"3".repeat(64)}`
      },
      resource: {
        resourceType: "credit_offer",
        resourceId: "credit_offer_agent_reference"
      },
      idempotencyKey: "idempotency_agent_obligation:test:01",
      requestId: "request_agent_obligation:test:01"
    },
    {
      ...common,
      operationId: "pilotExecuteSandboxObligation",
      payload: {
        providerId: "provider_gateway_compute",
        providerCategory: "compute"
      },
      resource: {
        resourceType: "obligation",
        resourceId: "obligation_agent_reference"
      },
      idempotencyKey: "idempotency_agent_obligation:test:02",
      requestId: "request_agent_obligation:test:02"
    },
    {
      ...common,
      operationId: "pilotPostSandboxRepayment",
      payload: {
        amountMinor: "7500",
        sourceCode: "synthetic_revenue"
      },
      resource: {
        resourceType: "obligation",
        resourceId: "obligation_agent_reference"
      },
      idempotencyKey: "idempotency_agent_obligation:test:03",
      requestId: "request_agent_obligation:test:03"
    },
    {
      ...common,
      operationId: "pilotReadOwnObligationEvidence",
      payload: { limit: 50 },
      resource: {
        resourceType: "evidence",
        resourceId: "obligation_agent_reference"
      },
      requestId: "request_agent_obligation:test:04"
    }
  ];
}

test("reference Agent application remains bounded by the smallest approved limit", () => {
  const input = createLocalAgentApplicationInput(manifest);

  assert.equal(
    input.creditRequest.assetId,
    "urn:ipo-one:sandbox-asset:usd-cent"
  );
  assert.equal(input.creditRequest.requestedPrincipalMinor, "10000");
  assert.equal(input.creditRequest.purposeCode, "compute");
  assert.equal(input.workflowId, `local-agent-application-${"a".repeat(24)}`);
  assert.equal(Object.hasOwn(input, "credential"), false);
  assert.equal(Object.hasOwn(input, "tenantId"), false);
});

test("M1-B foreign Agent Offer uses one distinct candidate-bound application workflow", () => {
  const candidateReleaseId = "c".repeat(40);
  const canonical = createLocalAgentApplicationInput(manifest);
  const foreign = createM1BAgentForeignOfferApplicationInput(
    manifest,
    candidateReleaseId
  );

  assert.deepEqual(foreign.creditRequest, canonical.creditRequest);
  assert.equal(
    foreign.workflowId,
    `m1b-agent-foreign-offer-${candidateReleaseId}`
  );
  assert.notEqual(foreign.workflowId, canonical.workflowId);
  assert.equal(Object.isFrozen(foreign), true);
  assert.throws(
    () => createM1BAgentForeignOfferApplicationInput(manifest, "not-a-sha"),
    (error) => error.code === "invalid_m1_b_agent_foreign_offer_candidate"
  );
});

test("reference Agent runtime binds acceptance and repayment to the exact Offer", () => {
  const offerReceipt = Object.freeze({
    offer: Object.freeze({
      creditOfferHash: `0x${"b".repeat(64)}`,
      approvedPrincipalMinor: "7500"
    })
  });
  const input = createLocalAgentRuntimeInput(manifest, offerReceipt);

  assert.equal(input.offerReceipt, offerReceipt);
  assert.equal(input.repayment.amountMinor, "7500");
  assert.equal(input.repayment.sourceCode, "synthetic_revenue");
  assert.equal(
    input.acknowledgementHash,
    hashId(
      "agent_offer_acknowledgement",
      `${manifest.mandateHash}:${offerReceipt.offer.creditOfferHash}`
    )
  );
  assert.equal(input.workflowId, `local-agent-obligation-${"a".repeat(24)}`);
  assert.equal(Object.hasOwn(input, "privateKey"), false);
  assert.equal(Object.hasOwn(input, "fundsAuthority"), false);
});

test("reference Agent persists one exact continuation without changing the Offer receipt", async () => {
  const receipt = Object.freeze({
    status: "offer_ready",
    correlationId: "correlation-agent-application-0001",
    offer: Object.freeze({
      creditOfferId: "offer_agent_application_0001",
      creditOfferHash: `0x${"b".repeat(64)}`
    })
  });
  const calls = [];
  const result = await persistLocalAgentContinuationReceipt({
    receipt,
    session: {
      client: {
        async persistContinuationReceipt(input) {
          calls.push(input);
          return { response: { status: "offer_persisted" } };
        }
      }
    }
  });

  assert.equal(result.response.status, "offer_persisted");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receipt, receipt);
  assert.equal(calls[0].creditOfferId, receipt.offer.creditOfferId);
  assert.equal(
    calls[0].idempotencyKey,
    `reference-agent-continuation-${receipt.offer.creditOfferHash}`
  );
  assert.equal(calls[0].correlationId, receipt.correlationId);
  assert.equal(
    calls[0].requestId,
    `request-reference-agent-persist-${"b".repeat(24)}`
  );
});

test("reference Agent rejects a malformed continuation before any command", async () => {
  let called = false;
  await assert.rejects(
    () => persistLocalAgentContinuationReceipt({
      receipt: { status: "offer_ready", offer: {} },
      session: {
        client: {
          async persistContinuationReceipt() {
            called = true;
          }
        }
      }
    }),
    /not eligible for durable continuation/
  );
  assert.equal(called, false);
});

test("reference Agent runtime maps the exact closed lifecycle through MCP", async () => {
  const calls = [];
  const transport = createLocalAgentMcpTransport({
    async handle(message) {
      calls.push(structuredClone(message));
      const operationId = {
        ipo_one_accept_credit_offer: "pilotAcceptCreditOffer",
        ipo_one_execute_sandbox_obligation: "pilotExecuteSandboxObligation",
        ipo_one_post_sandbox_repayment: "pilotPostSandboxRepayment",
        ipo_one_read_obligation_evidence: "pilotReadOwnObligationEvidence"
      }[message.params.name];
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: false,
          structuredContent: protocolResult(operationId)
        }
      };
    }
  });
  const commands = runtimeCommands();
  for (const command of commands) await transport.execute(command);

  assert.deepEqual(calls.map(({ params }) => params.name), [
    "ipo_one_accept_credit_offer",
    "ipo_one_execute_sandbox_obligation",
    "ipo_one_post_sandbox_repayment",
    "ipo_one_read_obligation_evidence"
  ]);
  assert.deepEqual(calls[0].params.arguments, {
    creditOfferId: "credit_offer_agent_reference",
    payload: commands[0].payload,
    idempotencyKey: commands[0].idempotencyKey,
    requestId: commands[0].requestId,
    correlationId: commands[0].correlationId
  });
  assert.deepEqual(calls[1].params.arguments, {
    obligationId: "obligation_agent_reference",
    providerId: "provider_gateway_compute",
    providerCategory: "compute",
    idempotencyKey: commands[1].idempotencyKey,
    requestId: commands[1].requestId,
    correlationId: commands[1].correlationId
  });
  assert.deepEqual(calls[2].params.arguments, {
    obligationId: "obligation_agent_reference",
    payload: commands[2].payload,
    idempotencyKey: commands[2].idempotencyKey,
    requestId: commands[2].requestId,
    correlationId: commands[2].correlationId
  });
  assert.deepEqual(calls[3].params.arguments, {
    obligationId: "obligation_agent_reference",
    limit: 50,
    requestId: commands[3].requestId,
    correlationId: commands[3].correlationId
  });
  assert.equal(JSON.stringify(calls).includes("accessToken"), false);
  assert.equal(JSON.stringify(calls).includes("authenticationContext"), false);
  assert.equal(JSON.stringify(calls).includes("credential"), false);

  const receipt = transport.createReceipt({
    obligationId: "obligation_agent_reference",
    providerId: "provider_gateway_compute",
    providerCategory: "compute"
  });
  assert.equal(receipt.schemaVersion, "local_agent_mcp_transport_receipt.v1");
  assert.equal(receipt.transportProfile, "mcp_stdio_local");
  assert.equal(receipt.steps.length, 4);
  assert.equal(receipt.steps[1].tool, "ipo_one_execute_sandbox_obligation");
  assert.deepEqual(receipt.providerTarget, {
    providerId: "provider_gateway_compute",
    providerCategory: "compute"
  });
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.productionFundsMoved, false);
  assert.equal(receipt.fundsAuthority, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.steps), true);
});

test("reference Agent MCP transport rejects unsupported, widened, and incomplete commands", async () => {
  let calls = 0;
  const transport = createLocalAgentMcpTransport({
    async handle() {
      calls += 1;
      assert.fail("invalid command reached the MCP Host");
    }
  });
  const [accept] = runtimeCommands();
  for (const command of [
    { ...accept, operationId: "pilotCreateHumanSubject" },
    { ...accept, accessToken: "prohibited" },
    {
      ...accept,
      resource: { ...accept.resource, resourceType: "obligation" }
    },
    {
      ...accept,
      payload: { ...accept.payload, authorityId: "prohibited" }
    }
  ]) {
    await assert.rejects(
      () => transport.execute(command),
      (error) => error.code === "invalid_local_agent_mcp_command"
    );
  }
  assert.equal(calls, 0);
  assert.throws(
    () => transport.createReceipt({
      obligationId: "obligation_agent_reference",
      providerId: "provider_gateway_compute",
      providerCategory: "compute"
    }),
    (error) => error.code === "incomplete_local_agent_mcp_receipt"
  );
});

test("reference Agent MCP transport fails closed on Host and result drift", async () => {
  const [accept] = runtimeCommands();
  const hostFailure = createLocalAgentMcpTransport({
    async handle() {
      throw new Error("sensitive upstream detail");
    }
  });
  await assert.rejects(
    () => hostFailure.execute(accept),
    (error) => (
      error.code === "local_agent_mcp_transport_failed" &&
      !error.message.includes("sensitive")
    )
  );

  const toolFailure = createLocalAgentMcpTransport({
    async handle(message) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: "credit_facility_scope_mismatch" }
      };
    }
  });
  await assert.rejects(
    () => toolFailure.execute(accept),
    (error) => error.code === "credit_facility_scope_mismatch"
  );

  for (const response of [
    { jsonrpc: "2.0", id: "wrong", result: { isError: false } },
    {
      jsonrpc: "2.0",
      id: `rpc_agent_runtime:${accept.requestId}`,
      result: {
        isError: false,
        structuredContent: {
          ...protocolResult("pilotAcceptCreditOffer"),
          operationId: "pilotPostSandboxRepayment"
        }
      }
    }
  ]) {
    const drifted = createLocalAgentMcpTransport({
      async handle() {
        return structuredClone(response);
      }
    });
    await assert.rejects(
      () => drifted.execute(accept),
      (error) => error.code === "invalid_local_agent_mcp_response"
    );
  }
});
