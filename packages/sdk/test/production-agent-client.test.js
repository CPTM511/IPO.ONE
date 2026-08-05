import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import fixtures from "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json" with { type: "json" };
import {
  IpoOneAgentApiError,
  IpoOneAgentTransportError,
  ProductionAgentClient
} from "../src/production-agent-client.js";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const CERTIFICATE = `-----BEGIN CERTIFICATE-----\n${"A".repeat(96)}\n-----END CERTIFICATE-----`;
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${"B".repeat(96)}\n-----END PRIVATE KEY-----`;
const REQUEST = fixtures.validRequests[0];
const RESULT = fixtures.validResults.find(
  (value) => value.operationId === REQUEST.operationId
);

function accessToken(overrides = {}) {
  const current = Math.floor(NOW.getTime() / 1_000);
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    typ: "at+jwt",
    kid: "transport-003-test"
  })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iat: current,
    exp: current + 300,
    cnf: { "x5t#S256": "m".repeat(43) },
    ...overrides
  })).toString("base64url");
  return `${header}.${payload}.${"s".repeat(86)}`;
}

function dpopAccessToken(overrides = {}) {
  return accessToken({ cnf: { jkt: "d".repeat(43) }, ...overrides });
}

function dpopProof(accessToken, overrides = {}) {
  const current = Math.floor(NOW.getTime() / 1_000);
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    typ: "dpop+jwt",
    jwk: {
      kty: "EC",
      crv: "P-256",
      x: "A".repeat(43),
      y: "B".repeat(43)
    }
  })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    htm: "POST",
    htu: "https://closed-pilot.invalid/tenant/v1/operations",
    iat: current,
    jti: "dpop-production-agent-0001",
    ath: createHash("sha256").update(accessToken).digest("base64url"),
    ...overrides
  })).toString("base64url");
  return `${header}.${payload}.${"s".repeat(86)}`;
}

function fakeHttpsRequest({
  responseStatus = 200,
  responseType = "application/json",
  responseBody = RESULT,
  responseRequestId = REQUEST.requestId,
  requestError
} = {}) {
  const calls = [];
  const request = (url, options, onResponse) => {
    const outgoing = new EventEmitter();
    outgoing.setTimeout = (_milliseconds, callback) => {
      outgoing.timeout = callback;
    };
    outgoing.destroy = (error) => queueMicrotask(() => outgoing.emit("error", error));
    outgoing.end = (body) => {
      calls.push({ url, options, body });
      if (requestError) {
        queueMicrotask(() => outgoing.emit("error", requestError));
        return;
      }
      const incoming = new EventEmitter();
      incoming.statusCode = responseStatus;
      incoming.headers = {
        "content-type": responseType,
        "x-request-id": responseRequestId
      };
      queueMicrotask(() => {
        onResponse(incoming);
        incoming.emit("data", Buffer.from(JSON.stringify(responseBody)));
        incoming.emit("end");
      });
    };
    return outgoing;
  };
  return { calls, request };
}

function client(transport) {
  return new ProductionAgentClient({
    baseUrl: "https://closed-pilot.invalid",
    accessTokenProvider: async () => accessToken(),
    cert: CERTIFICATE,
    key: PRIVATE_KEY,
    request: transport.request,
    clock: () => NOW
  });
}

test("remote Agent client sends one exact mTLS-bound HTTPS protocol request", async () => {
  const transport = fakeHttpsRequest();
  const result = await client(transport).execute(REQUEST);
  assert.deepEqual(result, RESULT);
  assert.equal(transport.calls.length, 1);
  const [{ url, options, body }] = transport.calls;
  assert.equal(url.toString(), "https://closed-pilot.invalid/tenant/v1/operations");
  assert.equal(options.method, "POST");
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.minVersion, "TLSv1.2");
  assert.equal(options.servername, "closed-pilot.invalid");
  assert.equal(options.headers["x-request-id"], REQUEST.requestId);
  assert.match(options.headers.authorization, /^Bearer [A-Za-z0-9_-]+\./);
  assert.equal(Object.hasOwn(options.headers, "dpop"), false);
  assert.deepEqual(JSON.parse(body), REQUEST);
});

test("remote Agent client sends one exact DPoP-bound HTTPS protocol request without certificate material", async () => {
  const transport = fakeHttpsRequest();
  const token = dpopAccessToken();
  const client = new ProductionAgentClient({
    baseUrl: "https://closed-pilot.invalid",
    accessTokenProvider: async () => token,
    dpopProofProvider: async (binding) => {
      assert.deepEqual(binding, {
        accessToken: token,
        method: "POST",
        url: "https://closed-pilot.invalid/tenant/v1/operations"
      });
      return dpopProof(token);
    },
    request: transport.request,
    clock: () => NOW
  });
  const result = await client.execute(REQUEST);
  assert.deepEqual(result, RESULT);
  const [{ options }] = transport.calls;
  assert.match(options.headers.dpop, /^[A-Za-z0-9_-]+\./);
  assert.equal(Object.hasOwn(options, "cert"), false);
  assert.equal(Object.hasOwn(options, "key"), false);
});

test("remote Agent client rejects unsafe origins and non-short-lived tokens before transport", async () => {
  const transport = fakeHttpsRequest();
  assert.throws(
    () => new ProductionAgentClient({
      baseUrl: "http://closed-pilot.invalid",
      accessTokenProvider: async () => accessToken(),
      cert: CERTIFICATE,
      key: PRIVATE_KEY,
      request: transport.request
    }),
    /HTTPS origin/
  );
  const expired = new ProductionAgentClient({
    baseUrl: "https://closed-pilot.invalid",
    accessTokenProvider: async () => accessToken({
      iat: Math.floor(NOW.getTime() / 1_000) - 600,
      exp: Math.floor(NOW.getTime() / 1_000) - 300
    }),
    cert: CERTIFICATE,
    key: PRIVATE_KEY,
    request: transport.request,
    clock: () => NOW
  });
  await assert.rejects(() => expired.execute(REQUEST), /active <=300 second/);
  assert.equal(transport.calls.length, 0);
});

test("remote Agent client exposes bounded known Problem Details without automatic retry", async () => {
  const problem = {
    type: "urn:ipo-one:problem:request_budget_exceeded",
    title: "Too Many Requests",
    status: 429,
    detail: "Request budget is exhausted",
    instance: `urn:ipo-one:request:${REQUEST.requestId}`,
    code: "request_budget_exceeded",
    requestId: REQUEST.requestId,
    retryAfterClass: "short",
    schemaVersion: "problem_details.v1"
  };
  const transport = fakeHttpsRequest({
    responseStatus: 429,
    responseType: "application/problem+json",
    responseBody: problem
  });
  await assert.rejects(
    () => client(transport).execute(REQUEST),
    (error) => {
      assert.ok(error instanceof IpoOneAgentApiError);
      assert.equal(error.outcome, "known_rejection");
      assert.equal(error.code, "request_budget_exceeded");
      assert.equal(error.retryAfterClass, "short");
      return true;
    }
  );
  assert.equal(transport.calls.length, 1);
});

test("remote Agent client treats timeout and response binding drift as unknown outcomes", async () => {
  const failed = fakeHttpsRequest({
    requestError: new Error("connection closed after submission")
  });
  await assert.rejects(
    () => client(failed).execute(REQUEST),
    (error) => {
      assert.ok(error instanceof IpoOneAgentTransportError);
      assert.equal(error.outcome, "unknown");
      assert.equal(
        error.retryDirective,
        "replay_exact_request_with_same_idempotency_key"
      );
      assert.equal(error.requestId, REQUEST.requestId);
      return true;
    }
  );

  const mismatched = fakeHttpsRequest({
    responseRequestId: "request-transport-003-mismatch"
  });
  await assert.rejects(
    () => client(mismatched).execute(REQUEST),
    (error) => (
      error instanceof IpoOneAgentTransportError &&
      error.code === "agent_response_binding_rejected"
    )
  );

  const wrongOperation = fixtures.validResults.find(
    (value) => value.operationId !== REQUEST.operationId
  );
  const drifted = fakeHttpsRequest({ responseBody: wrongOperation });
  await assert.rejects(
    () => client(drifted).execute(REQUEST),
    (error) => (
      error instanceof IpoOneAgentTransportError &&
      error.code === "agent_response_binding_rejected"
    )
  );
});
