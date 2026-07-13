import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ApprovalRequirement,
  AuthorizationPolicyRegistry,
  AuthorizationSurface,
  PUBLIC_SANDBOX_OPERATION_POLICIES,
  TENANT_OPERATION_POLICIES,
  assertPolicyTransitionDoesNotBroaden
} from "../src/index.js";

test("the policy registry classifies every OpenAPI operation and keeps the public sandbox separate", async () => {
  const spec = JSON.parse(await readFile("api/openapi/ipo-one.v1.json", "utf8"));
  const documented = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      documented.push({ operationId: operation.operationId, method: method.toUpperCase(), path });
    }
  }
  const registered = PUBLIC_SANDBOX_OPERATION_POLICIES.map((policy) => ({
    operationId: policy.operationId,
    method: policy.transport.method,
    path: policy.transport.path
  }));
  assert.deepEqual(
    registered.sort((left, right) => left.operationId.localeCompare(right.operationId)),
    documented.sort((left, right) => left.operationId.localeCompare(right.operationId))
  );
  assert.equal(PUBLIC_SANDBOX_OPERATION_POLICIES.every(
    (policy) => policy.surface === AuthorizationSurface.PUBLIC_SANDBOX
  ), true);
  const registry = new AuthorizationPolicyRegistry();
  assert.equal(registry.getAuthenticated("createAgent"), undefined);
  assert.equal(registry.getAuthenticated("pilotSubmitSpend").auditRequirement, "allow_and_deny");

  const mutable = structuredClone(TENANT_OPERATION_POLICIES.find(
    (policy) => policy.operationId === "pilotSubmitSpend"
  ));
  const isolatedRegistry = new AuthorizationPolicyRegistry({
    publicOperations: [],
    tenantOperations: [mutable]
  });
  mutable.allowedActorTypes.push("human");
  mutable.liveChecks.length = 0;
  assert.deepEqual(isolatedRegistry.getAuthenticated("pilotSubmitSpend").allowedActorTypes, ["agent"]);
  assert.deepEqual(
    isolatedRegistry.getAuthenticated("pilotSubmitSpend").liveChecks,
    ["mandate", "spend_policy", "risk", "cap", "freeze"]
  );
});

test("policy rollback compatibility rejects every permission-broadening dimension", () => {
  const current = TENANT_OPERATION_POLICIES;
  const spend = structuredClone(current.find((policy) => policy.operationId === "pilotSubmitSpend"));
  assert.equal(assertPolicyTransitionDoesNotBroaden(current, [{
    ...spend,
    liveChecks: [...spend.liveChecks, "additional_emergency_guard"]
  }]), true);

  for (const broadened of [
    { ...spend, allowedActorTypes: [...spend.allowedActorTypes, "human"] },
    { ...spend, requiredCapability: "spend.any" },
    { ...spend, ownershipRule: "tenant" },
    { ...spend, liveChecks: spend.liveChecks.filter((check) => check !== "mandate") },
    { ...spend, idempotencyRequirement: "optional" },
    { ...spend, approvalRequirement: "unreviewed" },
    { ...spend, transport: { kind: "worker" } }
  ]) {
    assert.throws(
      () => assertPolicyTransitionDoesNotBroaden(current, [broadened]),
      (error) => error.code === "authorization_policy_broadening_rejected"
    );
  }

  const increase = structuredClone(current.find(
    (policy) => policy.operationId === "pilotIncreaseCreditLimit"
  ));
  assert.equal(increase.approvalRequirement, ApprovalRequirement.DUAL_CONTROL);
  assert.throws(
    () => assertPolicyTransitionDoesNotBroaden(current, [{
      ...increase,
      approvalRequirement: ApprovalRequirement.PROTECTIVE
    }]),
    (error) => error.code === "authorization_policy_broadening_rejected"
  );
  assert.throws(
    () => assertPolicyTransitionDoesNotBroaden(current, [{
      ...spend,
      operationId: "newUnreviewedOperation"
    }]),
    (error) => error.code === "authorization_policy_broadening_rejected"
  );
  assert.throws(
    () => assertPolicyTransitionDoesNotBroaden(current, [spend, structuredClone(spend)]),
    (error) => error.code === "authorization_policy_broadening_rejected"
  );
});
