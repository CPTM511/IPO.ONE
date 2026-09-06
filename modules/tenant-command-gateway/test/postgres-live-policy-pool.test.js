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

test("workerAdmitMeteredUsage never requests an UPDATE-authority row lock on immutable Evidence", async () => {
  const operationId = "workerAdmitMeteredUsage";
  const policy = policyRegistry.getAuthenticated(operationId);
  const obligationId = "obligation_metered_live_policy";
  const subjectId = "subject_metered_live_policy";
  const principalId = "principal_metered_live_policy";
  const mandateId = "mandate_metered_live_policy";
  const providerId = "provider_gateway_compute";
  const assetId = "asset_synthetic_usd";
  const spendPolicyId = "spend_policy_metered_live_policy";
  const repository = Object.freeze({
    async getProjectionStateInTransaction(_client, projectionType, aggregateId, options) {
      assert.deepEqual(options, { lock: true });
      if (projectionType === "obligation") return {
        aggregateVersion: 1,
        value: {
          schemaVersion: "obligation.v2", obligationId, subjectId, principalId, mandateId,
          creditOfferAcceptanceId: "acceptance_metered_live_policy", assetId,
          status: "active", executionStatus: "executed", sandboxOnly: true,
          productionFundsMoved: false, withdrawable: false
        }
      };
      if (projectionType === "mandate") return {
        aggregateVersion: 2,
        value: {
          mandateId, subjectId, principalId, status: "active", sandboxOnly: true,
          productionAuthority: false, capabilities: ["provider_spend"],
          allowedProviderIds: [providerId], assetIds: [assetId], perActionLimitMinor: "2000",
          aggregateLimitMinor: "10000", utilizedMinor: "0",
          validFrom: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-10T00:00:00.000Z"
        }
      };
      if (projectionType === "provider") return {
        aggregateVersion: 3,
        value: { providerId, status: "allowlisted" }
      };
      if (projectionType === "spend_policy") return {
        aggregateVersion: 4,
        value: {
          spendPolicyId, subjectId, providerId, assetId, status: "active",
          perTxLimitMinor: "2000", obligationCapMinor: "5000", dailySpentMinor: "0",
          dailySpentDate: "2026-09-02", dailyLimitMinor: "5000"
        }
      };
      assert.fail(`unexpected projection ${projectionType}:${aggregateId}`);
    },
    async findActiveSpendPolicyForMeteredUsageInTransaction(_client, input, options) {
      assert.deepEqual(input, { subjectId, providerId, assetId });
      assert.deepEqual(options, { lock: true });
      return { spendPolicyId };
    },
    async findAgentLockboxByObligationInTransaction(_client, id, options) {
      assert.equal(id, obligationId);
      assert.deepEqual(options, { lock: true });
      return {
        status: "active", obligationId, subjectId, principalId, mandateId,
        creditLineId: "facility_metered_live_policy", assetId,
        allowedProviderIds: [providerId], sandboxOnly: true,
        productionFundsMoved: false, withdrawable: false
      };
    },
    async findMeteredUsageEvidenceIdentityInTransaction(_client, _input, options) {
      assert.deepEqual(options, { lock: false });
      return [];
    }
  });
  const adapter = createPostgresTenantLivePolicyAdapter({
    client: { async query() { assert.fail("unexpected direct SQL query"); } },
    coreRepository: repository,
    handler: { operationId },
    payload: {
      expectedPolicyHash: `0x${"a".repeat(64)}`,
      evidence: {
        tenantId: "tenant_metered_live_policy", obligationId, subjectId, principalId,
        mandateId, providerId, assetId, authorizationId: "acceptance_metered_live_policy",
        facilityId: "facility_metered_live_policy", usageEvidenceId: "usage_metered_live_policy",
        providerEventId: "provider_event_metered_live_policy", nonce: "nonce_metered_live_policy",
        chargeMinor: "500"
      }
    }
  });
  const result = await adapter.evaluate({
    policy,
    resource: { resourceType: "obligation", resourceId: obligationId },
    authenticationContext: { tenantId: "tenant_metered_live_policy" },
    now: new Date("2026-09-03T00:00:00.000Z")
  });
  assert.equal(result.liveStateVersion, 10);
  assert.deepEqual(result.evaluatedChecks, policy.liveChecks);
});

for (const operationId of ["walletPrepareAccountBinding","walletSubmitAccountBinding","walletReadAccountBindings","walletRevokeAccountBinding"]) {
  test(`${operationId} checks active Subject and exact test-chain binding state`,async()=>{
    let subjectStatus="active", bindingSubject=resource.resourceId;
    const repository={async getProjectionStateInTransaction(_client,type){return type==="subject"
      ? {aggregateVersion:3,value:{subjectType:"agent",status:subjectStatus}}
      : {aggregateVersion:2,value:{subjectId:bindingSubject,schemaVersion:"account_binding.v3",status:"active",chainId:"eip155:84532"}};}};
    let accountId="eip155:84532:0x1111111111111111111111111111111111111111";
    const policy=policyRegistry.getAuthenticated(operationId);
    const evaluate=()=>createPostgresTenantLivePolicyAdapter({client,coreRepository:repository,handler:{operationId},payload:{accountId,accountBindingId:"account_bound"}})
      .evaluate({policy,resource:{...resource,status:"active"},authenticationContext:{actorType:"human"},now:new Date()});
    assert.deepEqual((await evaluate()).evaluatedChecks,policy.liveChecks);
    subjectStatus="frozen";await assert.rejects(evaluate,{code:"authorization_live_policy_rejected"});subjectStatus="active";
    if(operationId.includes("Prepare")||operationId.includes("Submit")) {accountId=accountId.replace("84532","1");await assert.rejects(evaluate,{code:"authorization_live_policy_rejected"});}
    if(operationId.includes("Revoke")){bindingSubject="another_subject";await assert.rejects(evaluate,{code:"authorization_live_policy_rejected"});}
  });
}
test("wallet discovery reads the configured non-executing descriptor and rejects a widened adapter",async()=>{
  const operationId="walletDiscoverCapabilities",policy=policyRegistry.getAuthenticated(operationId);
  const value={adapters:[{adapterId:"local_sandbox",enabled:true,externalCallsEnabled:false,transactionsAllowed:false,sandboxOnly:true,productionAuthority:false,fundsAuthority:false,supportedChains:["eip155:84532","eip155:1952"]}]};
  const evaluate=()=>createPostgresTenantLivePolicyAdapter({client,coreRepository,handler:{operationId,readCapabilityDescriptor:async()=>value},payload:{}})
    .evaluate({policy,resource:{resourceType:"wallet_adapter",resourceId:"adapter_local_sandbox",status:"active"}});
  assert.deepEqual((await evaluate()).evaluatedChecks,policy.liveChecks);
  value.adapters[0].transactionsAllowed=true;await assert.rejects(evaluate,{code:"authorization_live_policy_rejected"});
});
