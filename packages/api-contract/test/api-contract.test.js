import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { DomainError } from "../../domain/src/index.js";
import {
  ApiBoundaryError,
  TENANT_PROTOCOL_CATALOG,
  assertTenantProtocolRequest,
  assertTenantProtocolResult,
  createProblemDetails,
  createRequestId,
  isTenantProtocolCatalog,
  isTenantProtocolRequest,
  isTenantProtocolResult,
  isValidRequestId
} from "../src/index.js";

const fixtures = JSON.parse(await readFile(
  join(process.cwd(), "api", "tenant-protocol", "conformance", "tenant-protocol.v1.fixtures.json"),
  "utf8"
));

function isDeeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

test("Tenant protocol fixtures enforce every closed request and result branch", () => {
  for (const request of fixtures.validRequests) assert.equal(isTenantProtocolRequest(request), true);
  for (const request of fixtures.invalidRequests) assert.equal(isTenantProtocolRequest(request), false);
  for (const result of fixtures.validResults) assert.equal(isTenantProtocolResult(result), true);
  for (const result of fixtures.invalidResults) assert.equal(isTenantProtocolResult(result), false);
  assert.equal(isTenantProtocolCatalog(TENANT_PROTOCOL_CATALOG), true);
});

test("Tenant protocol validation is mutation-free and errors expose no validator internals", () => {
  const validRequest = structuredClone(fixtures.validRequests[0]);
  const requestBefore = structuredClone(validRequest);
  assertTenantProtocolRequest(validRequest);
  assert.deepEqual(validRequest, requestBefore);

  const validResult = structuredClone(fixtures.validResults[0]);
  const resultBefore = structuredClone(validResult);
  assertTenantProtocolResult(validResult);
  assert.deepEqual(validResult, resultBefore);

  assert.throws(
    () => assertTenantProtocolRequest(fixtures.invalidRequests[0]),
    (error) => {
      assert.equal(error.code, "invalid_tenant_protocol_request");
      assert.deepEqual(error.details, {});
      assert.equal(error.message.includes("instancePath"), false);
      assert.equal(error.message.includes("must"), false);
      return true;
    }
  );
  assert.throws(
    () => assertTenantProtocolResult(fixtures.invalidResults[0]),
    (error) => error.code === "invalid_tenant_protocol_result" && Object.keys(error.details).length === 0
  );
  assert.equal(isDeeplyFrozen(TENANT_PROTOCOL_CATALOG), true);
});

test("request IDs accept a bounded safe value and replace unsafe input", () => {
  assert.equal(createRequestId({ "x-request-id": "pilot-request-001" }), "pilot-request-001");
  assert.equal(isValidRequestId(createRequestId({ "x-request-id": "bad value\nreflected" })), true);
  assert.equal(isValidRequestId("short"), false);
});

test("domain and boundary errors map to stable Problem Details", () => {
  const conflict = createProblemDetails(
    new DomainError("rail_idempotency_conflict", "key was reused"),
    { requestId: "pilot-request-001" }
  );
  assert.deepEqual(conflict, {
    type: "urn:ipo-one:problem:rail_idempotency_conflict",
    title: "Conflict",
    status: 409,
    detail: "key was reused",
    instance: "urn:ipo-one:request:pilot-request-001",
    code: "rail_idempotency_conflict",
    requestId: "pilot-request-001",
    schemaVersion: "problem_details.v1"
  });

  const tooLarge = createProblemDetails(
    new ApiBoundaryError("payload_too_large", "Request body exceeds 64 KiB."),
    { requestId: "pilot-request-002" }
  );
  assert.equal(tooLarge.status, 413);

  const unsupported = createProblemDetails(
    new ApiBoundaryError("unsupported_media_type", "JSON is required."),
    { requestId: "pilot-request-003" }
  );
  assert.equal(unsupported.status, 415);
  assert.equal(unsupported.title, "Unsupported Media Type");

  const rateLimited = createProblemDetails(
    new ApiBoundaryError("sandbox_mutation_limit_exceeded", "Reset the sandbox."),
    { requestId: "pilot-request-004" }
  );
  assert.equal(rateLimited.status, 429);

  const denied = createProblemDetails(
    new DomainError("authorization_denied", "The requested operation is not available."),
    { requestId: "pilot-request-005" }
  );
  assert.equal(denied.status, 404);
  assert.equal(denied.title, "Not Found");
  assert.equal(denied.detail, "The requested operation is not available.");

  const unavailable = createProblemDetails(
    new DomainError("authorization_unavailable", "Authorization is temporarily unavailable."),
    { requestId: "pilot-request-006" }
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.title, "Service Unavailable");

  const budget = createProblemDetails(
    new DomainError(
      "request_budget_exceeded",
      "The request budget is temporarily unavailable.",
      { retryAfterClass: "short", configuredLimit: 30, tenantUtilization: 29 }
    ),
    { requestId: "pilot-request-007" }
  );
  assert.equal(budget.status, 429);
  assert.equal(budget.retryAfterClass, "short");
  assert.equal(Object.hasOwn(budget, "configuredLimit"), false);
  assert.equal(Object.hasOwn(budget, "tenantUtilization"), false);

  const retryProhibited = createProblemDetails(
    new DomainError(
      "automatic_retry_prohibited",
      "Automatic retry is not permitted for this operation.",
      { retryAfterClass: "manual" }
    ),
    { requestId: "pilot-request-008" }
  );
  assert.equal(retryProhibited.status, 409);
  assert.equal(retryProhibited.retryAfterClass, "manual");

  const unrelatedMetadata = createProblemDetails(
    new DomainError("invalid_request_field", "field is invalid", { retryAfterClass: "short" }),
    { requestId: "pilot-request-009" }
  );
  assert.equal(Object.hasOwn(unrelatedMetadata, "retryAfterClass"), false);
});

test("unexpected errors are redacted", () => {
  const problem = createProblemDetails(new Error("password=secret at /private/path"), {
    requestId: "pilot-request-003"
  });
  assert.equal(problem.status, 500);
  assert.equal(problem.code, "internal_error");
  assert.equal(problem.detail.includes("secret"), false);
  assert.equal(problem.detail.includes("/private"), false);
});
