import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../domain/src/index.js";
import {
  ApiBoundaryError,
  createProblemDetails,
  createRequestId,
  isValidRequestId
} from "../src/index.js";

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
