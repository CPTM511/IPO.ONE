import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentSecuredFacilityAuthorizationHandlers
} from "../src/agent-secured-facility-authorization-handlers.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";

const NOW = new Date("2026-08-25T13:00:00.000Z");
const H = (label) => hashId(`m2b_001_gateway_${label}`, { fixture: true });

function resources() {
  const subjectId = "subject_agent_m2b_gateway";
  const principalId = "principal_m2b_gateway";
  const mandateId = "mandate_m2b_gateway";
  const accountBindingId = "account_binding_m2b_gateway";
  const obligationId = "obligation_m2b_gateway";
  const poolObligationBindingId = "pool_obligation_binding_m2b_gateway";
  const tradingFacilityId = "trading_facility_m2b_gateway";
  const bindingHash = H("pool_binding");
  return {
    [CoreProjectionType.SUBJECT]: {
      subjectId,
      subjectType: "agent",
      status: "active",
      primaryPrincipalId: principalId
    },
    [CoreProjectionType.PRINCIPAL]: {
      principalId,
      status: "active"
    },
    [CoreProjectionType.MANDATE]: {
      mandateId,
      mandateHash: H("mandate"),
      subjectId,
      principalId,
      capabilities: ["execute_sandbox_credit"],
      validFrom: "2026-08-25T00:00:00.000Z",
      expiresAt: "2026-09-25T00:00:00.000Z",
      status: "active",
      sandboxOnly: true,
      productionAuthority: false,
      schemaVersion: "mandate.v3"
    },
    [CoreProjectionType.ACCOUNT_BINDING]: {
      accountBindingId,
      subjectId,
      accountHash: H("account"),
      chainId: "eip155:84532",
      purpose: "execution",
      bindingKind: "execution",
      status: "active",
      schemaVersion: "account_binding.v3"
    },
    [CoreProjectionType.OBLIGATION]: {
      obligationId,
      obligationHash: H("obligation"),
      subjectId,
      principalId,
      mandateId,
      authorityRef: mandateId,
      status: "active",
      executionStatus: "executed",
      poolObligationBindingId,
      poolExecutionReceiptId: "pool_execution_receipt_m2b_gateway",
      sandboxExecutionReceiptId: null,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "obligation.v2"
    },
    [CoreProjectionType.POOL_OBLIGATION_BINDING]: {
      poolObligationBindingId,
      bindingHash,
      subjectId,
      principalId,
      accountBindingId,
      obligationId,
      chainId: "eip155:84532",
      entryMode: "agent",
      selfPrincipal: true,
      status: "active",
      syntheticOnly: true,
      productionFundsMoved: false,
      schemaVersion: "pool_obligation_binding.v1"
    },
    [CoreProjectionType.POOL_OBLIGATION_PROJECTION]: {
      poolObligationProjectionId: `pool_obligation_projection_${bindingHash.slice(2)}`,
      poolObligationBindingId,
      obligationId,
      projectionHash: H("pool_projection"),
      lifecycleStatus: "active",
      badDebtAssets: "0",
      canonicalObligationRemainsAuthoritative: true,
      creditStateAuthorizing: false,
      automaticLimitChange: false,
      syntheticOnly: true,
      productionFundsMoved: false,
      schemaVersion: "pool_obligation_projection.v1"
    },
    [CoreProjectionType.TRADING_FACILITY]: {
      tradingFacilityId,
      facilityHash: H("facility"),
      stateHash: H("facility_state"),
      version: 4,
      subjectId,
      principalId,
      obligationId,
      lifecycleStatus: "active",
      riskState: "NORMAL",
      maturityAt: "2026-09-20T00:00:00.000Z",
      linkedCanonicalObligation: true,
      secondLedgerCreated: false,
      sandboxOnly: true,
      syntheticOnly: true,
      withdrawable: false,
      transferable: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "trading_facility.v1"
    }
  };
}

function harness() {
  const values = resources();
  let authorization;
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type, id) {
      const value = values[type];
      const identity = {
        [CoreProjectionType.SUBJECT]: "subjectId",
        [CoreProjectionType.PRINCIPAL]: "principalId",
        [CoreProjectionType.MANDATE]: "mandateId",
        [CoreProjectionType.ACCOUNT_BINDING]: "accountBindingId",
        [CoreProjectionType.OBLIGATION]: "obligationId",
        [CoreProjectionType.POOL_OBLIGATION_BINDING]: "poolObligationBindingId",
        [CoreProjectionType.POOL_OBLIGATION_PROJECTION]: "poolObligationProjectionId",
        [CoreProjectionType.TRADING_FACILITY]: "tradingFacilityId"
      }[type];
      return value?.[identity] === id ? { value, aggregateVersion: 4 } : undefined;
    },
    async findAgentSecuredFacilityAuthorizationForFacilityInTransaction() {
      return authorization;
    }
  };
  const context = {
    client: {},
    coreRepository,
    authenticationContext: { actorId: "actor_principal_m2b_gateway" },
    authorizationDecision: {
      resourceType: "trading_facility",
      resourceId: values[CoreProjectionType.TRADING_FACILITY].tradingFacilityId,
      resourceVersion: 7
    },
    payload: {},
    now: NOW,
    requestId: "request_m2b_gateway_0001",
    correlationId: "correlation_m2b_gateway_0001"
  };
  return {
    context,
    values,
    get authorization() { return authorization; },
    set authorization(value) { authorization = value; }
  };
}

test("M2B-001 Gateway creates one atomic no-funds authorization plan", async () => {
  const [create] = createAgentSecuredFacilityAuthorizationHandlers();
  const state = harness();
  const plan = await create.plan(state.context);
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.events.length, 1);
  assert.equal(
    plan.writes[0].type,
    CoreProjectionType.AGENT_SECURED_FACILITY_AUTHORIZATION
  );
  assert.equal(plan.response.readyForIntent, true);
  assert.equal(plan.response.executionPrewriteReadiness.status, "BLOCKED_PREWRITE");
  assert.equal(plan.response.executionPrewriteReadiness.submissionAuthorized, false);
  assert.equal(plan.response.nonceCreated, false);
  assert.equal(plan.response.signatureCreated, false);
  assert.equal(plan.response.networkCalled, false);
  assert.equal(plan.response.fundsMoved, false);
  assert.equal(plan.authorizationResourceTransition.nextStatus, "active");
});

test("M2B-001 Gateway read reruns resource hashes and revocation is exact", async () => {
  const [create, read, revoke] = createAgentSecuredFacilityAuthorizationHandlers();
  const state = harness();
  const createPlan = await create.plan(state.context);
  state.authorization = createPlan.response.authorization;
  const view = await read.execute(state.context);
  assert.equal(view.readyForIntent, true);
  assert.equal(view.executionPrewriteReadiness.compositionAvailable, false);
  state.values[CoreProjectionType.POOL_OBLIGATION_PROJECTION].projectionHash = H("drifted");
  await assert.rejects(() => read.execute(state.context), {
    code: "agent_secured_facility_resource_drift"
  });
  state.values[CoreProjectionType.POOL_OBLIGATION_PROJECTION].projectionHash =
    state.authorization.poolProjectionHash;
  const plan = await revoke.plan({
    ...state.context,
    payload: {
      expectedAuthorizationHash: state.authorization.authorizationHash,
      expectedVersion: 1
    }
  });
  assert.equal(plan.response.authorization.status, "revoked");
  assert.equal(plan.response.readyForIntent, false);
  assert.equal(plan.response.authorization.version, 2);
});

test("M2B-001 Gateway denies open payloads and duplicate Facility authority", async () => {
  const [create, , revoke] = createAgentSecuredFacilityAuthorizationHandlers();
  const state = harness();
  assert.throws(() => create.preflight({ payload: { signer: "forbidden" } }));
  assert.throws(() => revoke.preflight({ payload: {
    expectedAuthorizationHash: H("authorization"),
    expectedVersion: 1,
    nonce: 1
  } }));
  const plan = await create.plan(state.context);
  state.authorization = plan.response.authorization;
  await assert.rejects(() => create.plan(state.context), {
    code: "agent_secured_facility_authorization_exists"
  });
});
