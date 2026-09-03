import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  calculateJwkThumbprint,
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair
} from "jose";
import fixtures from "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json" with { type: "json" };
import {
  confirmVercelAgentEconomicCommand,
  createProductionMcpHandle,
  createVercelGoldenFlowAgentClient,
  resolveVercelAgentOfferReceipt
} from "../src/vercel-golden-flow-agent.js";

const NOW = new Date("2026-08-07T00:00:00.000Z");
const REQUEST = fixtures.validRequests[0];
const RESULT = fixtures.validResults.find(
  (value) => value.operationId === REQUEST.operationId
);

function fakeHttpsRequest() {
  const calls = [];
  const request = (url, options, onResponse) => {
    const outgoing = new EventEmitter();
    outgoing.setTimeout = () => {};
    outgoing.destroy = (error) => queueMicrotask(() => outgoing.emit("error", error));
    outgoing.end = (body) => {
      calls.push({ url, options, body });
      const incoming = new EventEmitter();
      incoming.statusCode = 200;
      incoming.headers = {
        "content-type": "application/json",
        "x-request-id": REQUEST.requestId
      };
      queueMicrotask(() => {
        onResponse(incoming);
        incoming.emit("data", Buffer.from(JSON.stringify(RESULT)));
        incoming.emit("end");
      });
    };
    return outgoing;
  };
  return { calls, request };
}

test("Vercel Golden Flow Agent creates exact short-lived DPoP-bound requests", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const [privateJwk, publicJwk] = await Promise.all([
    exportJWK(privateKey),
    exportJWK(publicKey)
  ]);
  Object.assign(privateJwk, {
    alg: "ES256",
    kid: "golden-flow-test-key",
    key_ops: ["sign"],
    use: "sig"
  });
  Object.assign(publicJwk, {
    alg: "ES256",
    kid: "golden-flow-test-key",
    key_ops: ["verify"],
    use: "sig"
  });
  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  const bootstrap = {
    tenant: { tenantId: "tenant_m1_b_sandbox" },
    policyVersion: "security_001.v1",
    credentials: [{
      kind: "agent_dpop",
      profile: "agent_runtime",
      clientId: "client_agent_runtime_m1_b",
      issuer: "https://workload.ipo.one",
      externalSubject: "agent-runtime-m1-b-sandbox",
      senderThumbprint: thumbprint
    }]
  };
  const transport = fakeHttpsRequest();
  const client = await createVercelGoldenFlowAgentClient({
    origin: "https://closed-pilot.invalid",
    audience: "https://closed-pilot-audience.invalid",
    bootstrap,
    workloadPrivateJwk: privateJwk,
    clock: () => NOW,
    request: transport.request
  });
  assert.deepEqual(await client.execute(REQUEST), RESULT);
  assert.equal(transport.calls.length, 1);
  const headers = transport.calls[0].options.headers;
  const token = headers.authorization.slice("Bearer ".length);
  const tokenHeader = decodeProtectedHeader(token);
  const tokenClaims = decodeJwt(token);
  const proofHeader = decodeProtectedHeader(headers.dpop);
  const proofClaims = decodeJwt(headers.dpop);
  assert.deepEqual(tokenHeader, {
    alg: "ES256",
    typ: "at+jwt",
    kid: "golden-flow-test-key"
  });
  assert.equal(tokenClaims.aud, "https://closed-pilot-audience.invalid");
  assert.equal(tokenClaims.cnf.jkt, thumbprint);
  assert.equal(tokenClaims.exp - tokenClaims.iat, 120);
  assert.equal(tokenClaims.capabilities.includes("agent_account.proof.submit.self"), true);
  assert.equal(
    tokenClaims.capabilities.includes(
      "agent_secured_facility_authorization.read.bound"
    ),
    false
  );
  assert.equal(tokenClaims.capabilities.length, 20);
  assert.equal(proofHeader.typ, "dpop+jwt");
  assert.equal(Object.hasOwn(proofHeader.jwk, "d"), false);
  assert.equal(proofClaims.htm, "POST");
  assert.equal(
    proofClaims.htu,
    "https://closed-pilot.invalid/tenant/v1/operations"
  );
  assert.equal(
    proofClaims.ath,
    createHash("sha256").update(token).digest("base64url")
  );
  assert.equal(JSON.stringify(transport.calls).includes(privateJwk.d), false);
});

test("production MCP handle maps the approved application and synthetic Metered Resource tools", async () => {
  const commands = [];
  const resourceRequests = [];
  const meteredReceipt = { status: "consumed", schemaVersion: "ipo_one_synthetic_metered_resource_receipt.v1" };
  const client = {
    async execute(command) {
      commands.push(command);
      return RESULT;
    },
    async consumeSyntheticMeteredResource(request) {
      resourceRequests.push(request);
      return meteredReceipt;
    }
  };
  const handle = createProductionMcpHandle(client);
  const message = {
    jsonrpc: "2.0",
    id: "rpc-golden-flow-0001",
    method: "tools/call",
    params: {
      name: "ipo_one_read_self",
      arguments: {
        subjectId: "subject_golden_flow",
        requestId: REQUEST.requestId,
        correlationId: REQUEST.correlationId
      }
    }
  };
  const response = await handle(message);
  assert.equal(response.id, message.id);
  assert.deepEqual(response.result.structuredContent, RESULT);
  assert.deepEqual(commands, [{
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotReadAgentSelf",
    requestId: REQUEST.requestId,
    correlationId: REQUEST.correlationId,
    payload: {},
    resource: {
      resourceType: "subject",
      resourceId: "subject_golden_flow"
    }
  }]);
  const resourceArguments = {
    obligationId: "obligation_golden_flow",
    quantity: "250",
    idempotencyKey: "golden-flow-metered-resource-0001",
    requestId: "request-golden-flow-metered-resource-0001"
  };
  const resourceResponse = await handle({
    ...message,
    id: "rpc-golden-flow-metered-0001",
    params: {
      name: "ipo_one_consume_synthetic_metered_resource",
      arguments: resourceArguments
    }
  });
  assert.deepEqual(resourceResponse.result.structuredContent, meteredReceipt);
  assert.deepEqual(resourceRequests, [resourceArguments]);
  await assert.rejects(
    () => handle({ ...message, params: { ...message.params, name: "forbidden_tool" } }),
    /unavailable/
  );
});

test("Golden Flow runtime consumes only an exact safe application Offer receipt", () => {
  const receipt = {
    schemaVersion: "agent_credit_offer_workflow_receipt.v1",
    offer: { approvedPrincipalMinor: "10000" }
  };
  assert.equal(resolveVercelAgentOfferReceipt(receipt), receipt);
  assert.equal(resolveVercelAgentOfferReceipt({
    schemaVersion: "vercel_golden_flow_agent_application.v1",
    status: "offer_persisted",
    offerReceipt: receipt,
    sandboxOnly: true,
    productionFundsMoved: false
  }), receipt);
  assert.throws(
    () => resolveVercelAgentOfferReceipt({
      schemaVersion: "vercel_golden_flow_agent_application.v1",
      status: "offer_persisted",
      offerReceipt: receipt,
      sandboxOnly: true,
      productionFundsMoved: true
    }),
    /not an eligible Offer receipt source/
  );
});

test("Golden Flow Agent binds economic commands to one authenticated protocol confirmation", () => {
  const command = {
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotAcceptCreditOffer",
    payload: {
      expectedOfferHash: `0x${"1".repeat(64)}`,
      expectedTermsHash: `0x${"2".repeat(64)}`,
      acknowledgementHash: `0x${"3".repeat(64)}`
    },
    resource: {
      resourceType: "credit_offer",
      resourceId: "credit_offer_golden_flow"
    },
    idempotencyKey: "idempotency-golden-flow-accept-0001",
    requestId: "request-golden-flow-accept-0001",
    correlationId: "correlation-golden-flow-accept-0001"
  };
  const confirmed = confirmVercelAgentEconomicCommand(command);
  assert.equal(Object.hasOwn(command.payload, "actionConfirmation"), false);
  assert.equal(
    confirmed.payload.actionConfirmation.confirmationMethod,
    "authenticated_protocol_request"
  );
  assert.equal(confirmed.payload.actionConfirmation.requestId, command.requestId);
  assert.equal(confirmed.payload.actionConfirmation.resourceId, command.resource.resourceId);
  assert.equal(confirmed.payload.actionConfirmation.rawSignaturePersisted, false);
  assert.equal(confirmed.payload.actionConfirmation.blockchainTransactionSubmitted, false);
  assert.equal(
    confirmVercelAgentEconomicCommand(confirmed),
    confirmed,
    "an exact existing confirmation must not be replaced"
  );
});
