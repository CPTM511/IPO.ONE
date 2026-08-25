import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationPolicyRegistry } from "../../authorization/src/index.js";
import { SubjectStatus } from "../../../packages/domain/src/index.js";
import { createPostgresTenantLivePolicyAdapter } from "../src/postgres-live-policy-adapter.js";

const policyRegistry = new AuthorizationPolicyRegistry({ policyVersion: "security_001.v1" });
const resource = Object.freeze({ resourceType: "subject", resourceId: "subject_pool_fixture" });
const client = Object.freeze({
  async query(sql) {
    assert.match(sql, /pool_chain_finalized_effects/);
    return { rows: [{ live_state_version: "1" }], rowCount: 1 };
  }
});
const coreRepository = Object.freeze({
  async getProjectionStateInTransaction(_client, projectionType, aggregateId, options) {
    assert.equal(projectionType, "subject");
    assert.equal(aggregateId, resource.resourceId);
    assert.deepEqual(options, { lock: false });
    return { aggregateVersion: 3, value: { status: SubjectStatus.ACTIVE } };
  }
});

for (const operationId of ["pilotReadOwnSecuredPool", "pilotReviewSecuredPoolAction"]) {
  test(`${operationId} evaluates the exact read-only Pool live checks`, async () => {
    const policy = policyRegistry.getAuthenticated(operationId);
    const adapter = createPostgresTenantLivePolicyAdapter({
      client,
      coreRepository,
      handler: { operationId },
      payload: {}
    });
    const result = await adapter.evaluate({
      policy,
      resource,
      authenticationContext: { actorType: "human" },
      now: new Date("2026-08-25T00:00:00.000Z")
    });
    assert.equal(result.liveStateVersion, 4);
    assert.deepEqual(result.evaluatedChecks, policy.liveChecks);
  });
}

test("pilotReadSecuredPoolRisk evaluates aggregate Pool state without submission authority", async () => {
  const operationId = "pilotReadSecuredPoolRisk";
  const policy = policyRegistry.getAuthenticated(operationId);
  const adapter = createPostgresTenantLivePolicyAdapter({
    client,
    coreRepository,
    handler: { operationId },
    payload: {}
  });
  const result = await adapter.evaluate({
    policy,
    resource: { resourceType: "risk_portfolio", resourceId: "risk_portfolio_fixture" },
    authenticationContext: { actorType: "risk_operator" },
    now: new Date("2026-08-25T00:00:00.000Z")
  });
  assert.equal(result.liveStateVersion, 1);
  assert.deepEqual(result.evaluatedChecks, policy.liveChecks);
});
