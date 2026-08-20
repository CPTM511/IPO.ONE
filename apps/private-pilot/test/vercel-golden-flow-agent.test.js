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
  createProductionMcpHandle,
  createVercelGoldenFlowAgentClient
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

test("production MCP handle maps only the four approved application tools", async () => {
  const commands = [];
  const client = {
    async execute(command) {
      commands.push(command);
      return RESULT;
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
  await assert.rejects(
    () => handle({ ...message, params: { ...message.params, name: "forbidden_tool" } }),
    /unavailable/
  );
});
