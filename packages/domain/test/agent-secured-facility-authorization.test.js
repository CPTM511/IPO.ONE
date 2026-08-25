import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION,
  AGENT_SECURED_FACILITY_OPERATION_FAMILY,
  authorizeAgentSecuredFacilityIntent,
  createAgentSecuredFacilityAuthorization,
  hashId,
  revokeAgentSecuredFacilityAuthorization
} from "../src/index.js";

const NOW = new Date("2026-08-25T12:00:00.000Z");
const H = (label) => hashId(label, { fixture: true });

function fixture() {
  const subjectId = "subject_agent_m2b_001";
  const principalId = "principal_m2b_001";
  const mandateId = "mandate_m2b_001";
  const accountBindingId = "account_binding_m2b_001";
  const obligationId = "obligation_m2b_001";
  const poolObligationBindingId = "pool_obligation_binding_m2b_001";
  const tradingFacilityId = "trading_facility_m2b_001";
  return {
    subject: { subjectId, subjectType: "agent", status: "active", primaryPrincipalId: principalId },
    principal: { principalId, status: "active" },
    mandate: {
      mandateId, mandateHash: H("mandate"), subjectId, principalId,
      capabilities: ["execute_sandbox_credit"], validFrom: "2026-08-25T00:00:00.000Z",
      expiresAt: "2026-09-25T00:00:00.000Z", status: "active", sandboxOnly: true,
      productionAuthority: false, schemaVersion: "mandate.v3"
    },
    accountBinding: {
      accountBindingId, subjectId, accountHash: H("account"), chainId: "eip155:84532",
      purpose: "execution", bindingKind: "execution", status: "active",
      schemaVersion: "account_binding.v3"
    },
    obligation: {
      obligationId, obligationHash: H("obligation"), subjectId, principalId, mandateId,
      authorityRef: mandateId, status: "active", executionStatus: "executed",
      poolObligationBindingId, poolExecutionReceiptId: "pool_execution_receipt_m2b_001",
      sandboxExecutionReceiptId: null, sandboxOnly: true, productionFundsMoved: false,
      withdrawable: false, schemaVersion: "obligation.v2"
    },
    poolObligationBinding: {
      poolObligationBindingId, bindingHash: H("pool_binding"), subjectId, principalId,
      accountBindingId, obligationId, chainId: "eip155:84532", entryMode: "agent",
      selfPrincipal: true, status: "active", syntheticOnly: true,
      productionFundsMoved: false, schemaVersion: "pool_obligation_binding.v1"
    },
    poolObligationProjection: {
      poolObligationBindingId, obligationId, projectionHash: H("pool_projection"),
      lifecycleStatus: "active", badDebtAssets: "0",
      canonicalObligationRemainsAuthoritative: true, creditStateAuthorizing: false,
      automaticLimitChange: false, syntheticOnly: true, productionFundsMoved: false,
      schemaVersion: "pool_obligation_projection.v1"
    },
    tradingFacility: {
      tradingFacilityId, facilityHash: H("facility"), stateHash: H("facility_state"),
      version: 4, subjectId, principalId, obligationId, lifecycleStatus: "active",
      riskState: "NORMAL", maturityAt: "2026-09-20T00:00:00.000Z",
      linkedCanonicalObligation: true, secondLedgerCreated: false, sandboxOnly: true,
      syntheticOnly: true, withdrawable: false, transferable: false,
      productionAuthority: false, fundsAuthority: false, schemaVersion: "trading_facility.v1"
    }
  };
}

test("M2B-001 binds the exact shared-kernel resources without nonce, signer or funds authority", () => {
  const resources = fixture();
  const authorization = createAgentSecuredFacilityAuthorization({ ...resources, now: NOW });
  assert.equal(authorization.schemaVersion, AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION);
  assert.equal(authorization.operationFamily, AGENT_SECURED_FACILITY_OPERATION_FAMILY);
  assert.deepEqual(authorization.allowedIntentKinds, ["open", "close"]);
  assert.equal(authorization.signingAuthority, false);
  assert.equal(authorization.nonceAuthority, false);
  assert.equal(authorization.networkAuthority, false);
  assert.equal(authorization.fundsAuthority, false);
  const decision = authorizeAgentSecuredFacilityIntent(authorization, {
    kind: "open", expectedAuthorizationHash: authorization.authorizationHash,
    expectedVersion: authorization.version,
    currentResourceHashes: {
      mandateHash: authorization.mandateHash, accountHash: authorization.accountHash,
      poolBindingHash: authorization.poolBindingHash,
      poolProjectionHash: authorization.poolProjectionHash,
      obligationHash: authorization.obligationHash, facilityHash: authorization.facilityHash,
      facilityStateHash: authorization.facilityStateHash
    }, now: NOW
  });
  assert.equal(decision.admitted, true);
  assert.equal(decision.preSigningOnly, true);
  assert.equal(decision.nonceCreated, false);
});

test("M2B-001 denies mismatched parties, authority, Pool and Facility before execution", () => {
  for (const mutate of [
    (x) => { x.subject.subjectType = "human"; },
    (x) => { x.mandate.status = "revoked"; },
    (x) => { x.accountBinding.status = "revoked"; },
    (x) => { x.obligation.poolExecutionReceiptId = null; },
    (x) => { x.poolObligationProjection.lifecycleStatus = "loss_recorded"; },
    (x) => { x.poolObligationProjection.badDebtAssets = "1"; },
    (x) => { x.tradingFacility.riskState = "REDUCE_ONLY"; },
    (x) => { x.tradingFacility.obligationId = "wrong_obligation"; }
  ]) {
    const resources = fixture();
    mutate(resources);
    assert.throws(() => createAgentSecuredFacilityAuthorization({ ...resources, now: NOW }));
  }
});

test("M2B-001 rejects open shapes and resource drift, and revocation is terminal", () => {
  const resources = fixture();
  assert.throws(() => createAgentSecuredFacilityAuthorization({
    ...resources, operationFamily: "raw_venue_action.v1", now: NOW
  }), /operation family/i);
  const authorization = createAgentSecuredFacilityAuthorization({ ...resources, now: NOW });
  assert.throws(() => authorizeAgentSecuredFacilityIntent(authorization, {
    kind: "withdraw", expectedAuthorizationHash: authorization.authorizationHash,
    expectedVersion: 1, currentResourceHashes: {}, now: NOW
  }), /outside the exact operation family/i);
  assert.throws(() => authorizeAgentSecuredFacilityIntent(authorization, {
    kind: "open", expectedAuthorizationHash: authorization.authorizationHash,
    expectedVersion: 1,
    currentResourceHashes: {
      mandateHash: authorization.mandateHash, accountHash: authorization.accountHash,
      poolBindingHash: authorization.poolBindingHash,
      poolProjectionHash: H("changed"), obligationHash: authorization.obligationHash,
      facilityHash: authorization.facilityHash, facilityStateHash: authorization.facilityStateHash
    }, now: NOW
  }), /resources changed/i);
  const revoked = revokeAgentSecuredFacilityAuthorization(authorization, {
    expectedAuthorizationHash: authorization.authorizationHash, expectedVersion: 1,
    revokedAt: "2026-08-25T12:01:00.000Z"
  });
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.version, 2);
  assert.throws(() => authorizeAgentSecuredFacilityIntent(revoked, {
    kind: "close", expectedAuthorizationHash: revoked.authorizationHash,
    expectedVersion: 2, currentResourceHashes: {}, now: NOW
  }), /not current/i);
});
