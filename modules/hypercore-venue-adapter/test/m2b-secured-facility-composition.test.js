import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentSecuredFacilityAuthorization,
  hashId,
  revokeAgentSecuredFacilityAuthorization
} from "../../../packages/domain/src/index.js";
import {
  createHypercoreStableExecutionIntent,
  createHypercoreStableCancelExecutionIntent,
  createHypercoreStableCancelPolicyConstraint,
  createHypercoreStableCancelTarget,
  createHypercoreStablePolicyConstraint,
  createM2BSecuredFacilityComposition,
  createM2BProtectiveCloseReceipt,
  createM2B003RecoveryReadiness,
  createM2BDualRiskRecoveryIncident,
  createM2BDualRiskSnapshot,
  assertM2BRecoveryTransition,
  M2B_RECOVERY_STAGE_ORDER,
  PostgresM2BDualRiskRepository,
  PostgresM2BCompositionRepository,
  evaluateM2B002PrewriteReadiness,
  verifyM2BSecuredFacilityComposition
} from "../src/index.js";

const NOW = new Date("2026-08-25T15:00:00.000Z");
const H = (label) => hashId(`m2b_002_${label}`, { fixture: true });

function fixture() {
  const subjectId = "subject_agent_m2b_002";
  const principalId = "principal_m2b_002";
  const mandateId = "mandate_m2b_002";
  const accountBindingId = "account_binding_m2b_002";
  const obligationId = "obligation_m2b_002";
  const poolObligationBindingId = "pool_obligation_binding_m2b_002";
  const tradingFacilityId = "trading_facility_m2b_002";
  const resources = {
    subject: { subjectId, subjectType: "agent", status: "active", primaryPrincipalId: principalId },
    principal: { principalId, status: "active" },
    mandate: {
      mandateId, mandateHash: H("mandate"), subjectId, principalId,
      capabilities: ["execute_sandbox_credit"], validFrom: "2026-08-25T00:00:00.000Z",
      expiresAt: "2026-09-25T00:00:00.000Z", status: "active", sandboxOnly: true,
      productionAuthority: false, schemaVersion: "mandate.v3"
    },
    accountBinding: {
      accountBindingId, subjectId, accountHash: H("economic_account"), chainId: "eip155:84532",
      purpose: "execution", bindingKind: "execution", status: "active",
      schemaVersion: "account_binding.v3"
    },
    obligation: {
      obligationId, obligationHash: H("obligation"), subjectId, principalId, mandateId,
      authorityRef: mandateId, status: "active", executionStatus: "executed",
      poolObligationBindingId, poolExecutionReceiptId: "pool_execution_receipt_m2b_002",
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
      version: 5, subjectId, principalId, obligationId, lifecycleStatus: "active",
      riskState: "NORMAL", maturityAt: "2026-09-20T00:00:00.000Z",
      linkedCanonicalObligation: true, secondLedgerCreated: false, sandboxOnly: true,
      syntheticOnly: true, withdrawable: false, transferable: false,
      productionAuthority: false, fundsAuthority: false, schemaVersion: "trading_facility.v1"
    }
  };
  const authorization = createAgentSecuredFacilityAuthorization({ ...resources, now: NOW });
  const currentResourceHashes = {
    mandateHash: authorization.mandateHash,
    accountHash: authorization.accountHash,
    poolBindingHash: authorization.poolBindingHash,
    poolProjectionHash: authorization.poolProjectionHash,
    obligationHash: authorization.obligationHash,
    facilityHash: authorization.facilityHash,
    facilityStateHash: authorization.facilityStateHash
  };
  const policyConstraint = createHypercoreStablePolicyConstraint({
    policyId: "m2b_002_exact_btc_testnet",
    policyVersion: "m2b_002.v1",
    facilityHash: authorization.facilityHash,
    accountBindingHash: H("venue_account_binding"),
    delegateHash: H("delegate"),
    signerReferenceHash: H("signer_reference"),
    executionOwnerActorId: "actor_m2b_002_execution_owner",
    riskOwnerActorId: "actor_m2b_002_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
  const stableIntent = createHypercoreStableExecutionIntent({
    facilityId: authorization.tradingFacilityId,
    facilityHash: authorization.facilityHash,
    accountBindingId: "hypercore_account_binding_m2b_002",
    accountBindingHash: policyConstraint.accountBindingHash,
    canonicalAccountAddressHash: H("canonical_account"),
    handoffId: "hypercore_signer_handoff_m2b_002",
    handoffHash: H("handoff"),
    delegateId: "hypercore_delegate_m2b_002",
    delegateHash: policyConstraint.delegateHash,
    apiWalletAddressHash: H("api_wallet"),
    signerReferenceHash: policyConstraint.signerReferenceHash,
    policyConstraint,
    hyperliquidAction: {
      type: "order",
      orders: [{
        a: 3, b: true, p: "62500", s: "0.00016", r: false,
        t: { limit: { tif: "Alo" } }, c: "0x00000000000000000000000000000042"
      }],
      grouping: "na"
    },
    idempotencyKey: "m2b-002-exact-composition",
    nonce: NOW.getTime(),
    preparedAt: NOW,
    approvalExpiresAt: new Date(NOW.getTime() + 30 * 60_000)
  });
  return { resources, authorization, currentResourceHashes, policyConstraint, stableIntent };
}

function compose(input, overrides = {}) {
  return createM2BSecuredFacilityComposition({
    authorization: input.authorization,
    currentResourceHashes: input.currentResourceHashes,
    stableIntent: input.stableIntent,
    policyConstraint: input.policyConstraint,
    now: NOW,
    ...overrides
  });
}

test("M2B-002 binds current M2B-001 authority to one exact BTC Testnet stable intent", () => {
  const input = fixture();
  const composition = compose(input);
  assert.equal(verifyM2BSecuredFacilityComposition(composition), true);
  assert.equal(composition.agentSecuredFacilityAuthorizationHash, input.authorization.authorizationHash);
  assert.equal(composition.tradingFacilityId, input.authorization.tradingFacilityId);
  assert.equal(composition.hypercoreIntentHash, input.stableIntent.intentHash);
  assert.equal(composition.intentKind, "open");
  assert.equal(composition.maxOrderNotionalUsd, "10");
  assert.equal(composition.externalNonceAllocated, false);
  assert.equal(composition.signatureCreated, false);
  assert.equal(composition.networkCalled, false);
  assert.equal(composition.withdrawalAuthority, false);
  assert.equal(composition.transferAuthority, false);
});

test("M2B-002 pre-write readiness stays blocked without the distinct exact L3 profile", () => {
  const input = fixture();
  const composition = compose(input);
  const readiness = evaluateM2B002PrewriteReadiness({
    composition,
    authorization: input.authorization,
    currentResourceHashes: input.currentResourceHashes,
    now: new Date(NOW.getTime() + 1_000)
  });
  assert.equal(readiness.status, "BLOCKED_PREWRITE");
  assert.deepEqual(readiness.blockers, [
    "exact_launch_profile_missing_or_disabled",
    "fresh_reconciled_account_observation_missing",
    "fresh_non_exporting_signer_handoff_missing",
    "exact_one_use_founder_run_approval_missing"
  ]);
  assert.equal(readiness.submissionAuthorizedByReceipt, false);
  assert.equal(readiness.externalNonceAllocated, false);
  assert.equal(readiness.signatureCreated, false);
  assert.equal(readiness.networkCalled, false);
});

test("M2B-002 denies revoked authority, Facility drift, unsafe action and open input before signing", () => {
  const input = fixture();
  const revoked = revokeAgentSecuredFacilityAuthorization(input.authorization, {
    expectedAuthorizationHash: input.authorization.authorizationHash,
    expectedVersion: 1,
    revokedAt: new Date(NOW.getTime() + 1_000)
  });
  assert.throws(() => compose(input, {
    authorization: revoked,
    now: new Date(NOW.getTime() + 2_000)
  }), /not current/i);

  const driftedIntent = structuredClone(input.stableIntent);
  driftedIntent.facilityHash = H("wrong_facility");
  assert.throws(() => compose(input, {
    stableIntent: driftedIntent,
    now: NOW
  }));

  const reducingIntent = structuredClone(input.stableIntent);
  reducingIntent.hyperliquidAction.orders[0].r = true;
  assert.throws(() => compose(input, {
    stableIntent: reducingIntent,
    now: NOW
  }));

  assert.throws(() => compose(input, {
    rawAction: { type: "withdraw3" },
    now: NOW
  }), /open/i);
});

test("M2B-002 protective close can only cancel the exact bound opening order", () => {
  const input = fixture();
  const composition = compose(input);
  const order = input.stableIntent.hyperliquidAction.orders[0];
  const target = createHypercoreStableCancelTarget({
    parentIntentId: composition.hypercoreIntentId,
    parentIntentHash: composition.hypercoreIntentHash,
    market: "BTC",
    assetIndex: order.a,
    side: order.b ? "buy" : "sell",
    limitPx: order.p,
    size: order.s,
    reduceOnly: order.r,
    cloid: "0x3ec931145cbe6e36213621b50521a704",
    venueOrderId: 57670774189
  });
  const cancelPolicy = createHypercoreStableCancelPolicyConstraint({
    policyId: "m2b_002_exact_protective_cancel",
    policyVersion: "m2b_002.v1",
    facilityHash: composition.facilityHash,
    accountBindingHash: composition.venueAccountBindingHash,
    delegateHash: composition.delegateHash,
    signerReferenceHash: composition.signerReferenceHash,
    parentIntentHash: composition.hypercoreIntentHash,
    targetOrderHash: target.targetOrderHash,
    targetClientOrderId: target.cloid,
    executionOwnerActorId: "actor_m2b_002_execution_owner",
    riskOwnerActorId: "actor_m2b_002_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
  const cancelIntent = createHypercoreStableCancelExecutionIntent({
    facilityId: composition.tradingFacilityId,
    facilityHash: composition.facilityHash,
    accountBindingId: composition.venueAccountBindingId,
    accountBindingHash: composition.venueAccountBindingHash,
    canonicalAccountAddressHash: H("canonical_account"),
    handoffId: "hypercore_signer_handoff_m2b_002",
    handoffHash: H("handoff"),
    delegateId: "hypercore_delegate_m2b_002",
    delegateHash: composition.delegateHash,
    apiWalletAddressHash: H("api_wallet"),
    signerReferenceHash: composition.signerReferenceHash,
    parentIntentId: composition.hypercoreIntentId,
    parentIntentHash: composition.hypercoreIntentHash,
    targetOrder: target,
    policyConstraint: cancelPolicy,
    hyperliquidAction: {
      type: "cancelByCloid",
      cancels: [{ asset: 3, cloid: target.cloid }]
    },
    idempotencyKey: "m2b-002-exact-protective-cancel",
    nonce: NOW.getTime() + 1,
    preparedAt: new Date(NOW.getTime() + 1_000),
    approvalExpiresAt: new Date(NOW.getTime() + 20 * 60_000)
  });
  const receipt = createM2BProtectiveCloseReceipt({
    authorization: input.authorization,
    currentResourceHashes: input.currentResourceHashes,
    parentComposition: composition,
    cancelIntent,
    now: new Date(NOW.getTime() + 2_000)
  });
  assert.equal(receipt.actionKind, "cancelByCloid");
  assert.equal(receipt.increasesExposure, false);
  assert.equal(receipt.externalNonceAllocated, false);
  assert.equal(receipt.signatureCreated, false);
  assert.equal(receipt.networkCalled, false);

  const drifted = structuredClone(cancelIntent);
  drifted.parentIntentHash = H("another_parent");
  assert.throws(() => createM2BProtectiveCloseReceipt({
    authorization: input.authorization,
    currentResourceHashes: input.currentResourceHashes,
    parentComposition: composition,
    cancelIntent: drifted,
    now: new Date(NOW.getTime() + 2_000)
  }));
});

test("M2B-002 PostgreSQL repository prepares once and rejects idempotency drift", async () => {
  const rows = [];
  const transitions = [];
  const client = {
    async query(statement, values = []) {
      if (statement.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rowCount: 1, rows: [{}] };
      }
      if (statement.includes("WHERE idempotency_key_hash = $1 FOR UPDATE")) {
        const row = rows.find((item) => item.idempotency_key_hash === values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (statement.startsWith("INSERT INTO agent_hyperliquid_compositions")) {
        rows.push({
          id: values[0],
          composition_hash: values[1],
          idempotency_key_hash: values[2],
          trading_facility_id: values[11],
          prepared_at: values[16],
          composition_record: JSON.parse(values[18])
        });
        return { rowCount: 1, rows: [] };
      }
      if (statement.startsWith("INSERT INTO agent_hyperliquid_composition_transitions")) {
        transitions.push({ id: values[0], compositionId: values[1] });
        return { rowCount: 1, rows: [] };
      }
      if (statement.includes("WHERE id = $1")) {
        const row = rows.find((item) => item.id === values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (statement.includes("WHERE trading_facility_id = $1")) {
        const row = rows.find((item) => item.trading_facility_id === values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      throw new Error(`unexpected SQL: ${statement}`);
    }
  };
  const eventRepository = {
    withTenantWrite: (operation) => operation(client),
    withTenantRead: (operation) => operation(client)
  };
  const repository = new PostgresM2BCompositionRepository({ eventRepository });
  const input = fixture();
  const composition = compose(input);
  const first = await repository.prepare({
    composition,
    idempotencyKey: "m2b-002-durable-composition"
  });
  assert.equal(first.replayed, false);
  assert.equal(rows.length, 1);
  assert.equal(transitions.length, 1);
  const replay = await repository.prepare({
    composition,
    idempotencyKey: "m2b-002-durable-composition"
  });
  assert.equal(replay.replayed, true);
  assert.equal(rows.length, 1);
  assert.equal(transitions.length, 1);
  assert.equal(
    (await repository.findById(composition.m2bHyperliquidCompositionId))
      .compositionHash,
    composition.compositionHash
  );
  assert.equal(
    (await repository.findByFacility(composition.tradingFacilityId))
      .compositionHash,
    composition.compositionHash
  );
  const drifted = compose(input, { now: new Date(NOW.getTime() + 1_000) });
  await assert.rejects(() => repository.prepare({
    composition: drifted,
    idempotencyKey: "m2b-002-durable-composition"
  }), { code: "m2b_composition_idempotency_conflict" });
});

function dualRisk(composition, overrides = {}) {
  return createM2BDualRiskSnapshot({
    composition,
    poolRisk: {
      poolObservationHash: H("pool_observation"),
      poolProjectionHash: composition.poolProjectionHash,
      freshness: "FRESH",
      reconciliationStatus: "RECONCILED",
      healthState: "HEALTHY",
      riskState: "NORMAL",
      newRiskFrozen: false,
      liquidatable: false,
      ...overrides.poolRisk
    },
    venueRisk: {
      venueObservationHash: H("venue_observation"),
      compositionHash: composition.compositionHash,
      freshness: "FRESH",
      reconciliationStatus: "RECONCILED",
      marginState: "HEALTHY",
      riskState: "NORMAL",
      unknownOutcome: false,
      ...overrides.venueRisk
    },
    observedAt: new Date(NOW.getTime() + 2_000)
  });
}

test("M2B-003 combines healthy Pool and Venue truth without opening an incident", () => {
  const composition = compose(fixture());
  const snapshot = dualRisk(composition);
  assert.equal(snapshot.combinedRiskState, "NORMAL");
  assert.equal(snapshot.freezeNewRiskRequired, false);
  assert.equal(snapshot.networkCalled, false);
  assert.throws(() => createM2BDualRiskRecoveryIncident({
    snapshot,
    openedAt: new Date(NOW.getTime() + 3_000)
  }), { code: "m2b_recovery_incident_not_required" });
});

test("M2B-003 stale or unknown truth freezes risk and uses exact recovery order", () => {
  const composition = compose(fixture());
  const snapshot = dualRisk(composition, {
    venueRisk: {
      freshness: "UNKNOWN",
      reconciliationStatus: "UNKNOWN",
      marginState: "UNKNOWN",
      unknownOutcome: true
    }
  });
  assert.equal(snapshot.combinedRiskState, "REDUCE_ONLY");
  assert.equal(snapshot.freezeNewRiskRequired, true);
  assert.equal(snapshot.lossDisposition, "CANONICAL_OBLIGATION_REMAINS_OUTSTANDING");
  const incident = createM2BDualRiskRecoveryIncident({
    snapshot,
    openedAt: new Date(NOW.getTime() + 3_000)
  });
  assert.deepEqual(incident.stagePlan.map(({ stage }) => stage), M2B_RECOVERY_STAGE_ORDER);
  assert.equal(incident.currentStage, "FREEZE_NEW_RISK");
  assert.equal(incident.stagePlan[1].status, "BLOCKED_EXTERNAL_APPROVAL");
  assert.ok(incident.stagePlan.every(({ externalWriteAuthorized }) => !externalWriteAuthorized));
  assert.equal(createM2B003RecoveryReadiness({ snapshot, incident }).status,
    "BLOCKED_RECOVERY_PREWRITE");
});

test("M2B-003 critical margin or liquidation escalates and cannot auto-relax", () => {
  const composition = compose(fixture());
  const snapshot = dualRisk(composition, {
    poolRisk: { healthState: "LIQUIDATABLE", liquidatable: true },
    venueRisk: { marginState: "CRITICAL" }
  });
  assert.equal(snapshot.combinedRiskState, "FLATTEN");
  const incident = createM2BDualRiskRecoveryIncident({
    snapshot,
    openedAt: new Date(NOW.getTime() + 3_000)
  });
  assert.throws(() => assertM2BRecoveryTransition({
    incident,
    nextCombinedRiskState: "REDUCE_ONLY",
    completedStage: "FREEZE_NEW_RISK",
    evidenceHash: H("freeze_evidence")
  }), { code: "m2b_recovery_automatic_relaxation_denied" });
  assert.equal(assertM2BRecoveryTransition({
    incident,
    nextCombinedRiskState: "FLATTEN",
    completedStage: "FREEZE_NEW_RISK",
    evidenceHash: H("freeze_evidence")
  }), true);
  assert.throws(() => assertM2BRecoveryTransition({
    incident,
    nextCombinedRiskState: "SETTLEMENT",
    completedStage: "CANCEL",
    evidenceHash: H("cancel_evidence")
  }), { code: "m2b_recovery_external_action_denied" });
});

test("M2B-003 PostgreSQL repository opens immutable Evidence once", async () => {
  const rows = [];
  const transitions = [];
  const client = {
    async query(statement, values = []) {
      if (statement.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rowCount: 1, rows: [{}] };
      }
      if (statement.includes("WHERE idempotency_key_hash = $1 FOR UPDATE")) {
        const row = rows.find((item) => item.idempotency_key_hash === values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (statement.startsWith("INSERT INTO agent_dual_risk_incidents")) {
        rows.push({
          id: values[0],
          incident_hash: values[1],
          idempotency_key_hash: values[2],
          trading_facility_id: values[9],
          snapshot_record: JSON.parse(values[13]),
          incident_record: JSON.parse(values[14])
        });
        return { rowCount: 1, rows: [] };
      }
      if (statement.startsWith("INSERT INTO agent_dual_risk_incident_transitions")) {
        transitions.push({ id: values[0], incidentId: values[1] });
        return { rowCount: 1, rows: [] };
      }
      if (statement.includes("WHERE id = $1")) {
        const row = rows.find((item) => item.id === values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (statement.includes("WHERE trading_facility_id = $1")) {
        const row = rows.find((item) => item.trading_facility_id === values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      throw new Error(`unexpected SQL: ${statement}`);
    }
  };
  const eventRepository = {
    withTenantWrite: (operation) => operation(client),
    withTenantRead: (operation) => operation(client)
  };
  const repository = new PostgresM2BDualRiskRepository({ eventRepository });
  const composition = compose(fixture());
  const snapshot = dualRisk(composition, {
    venueRisk: { freshness: "STALE", reconciliationStatus: "UNRECONCILED" }
  });
  const incident = createM2BDualRiskRecoveryIncident({
    snapshot,
    openedAt: new Date(NOW.getTime() + 3_000)
  });
  const first = await repository.open({
    snapshot,
    incident,
    idempotencyKey: "m2b-003-durable-incident"
  });
  assert.equal(first.replayed, false);
  assert.equal(rows.length, 1);
  assert.equal(transitions.length, 1);
  const replay = await repository.open({
    snapshot,
    incident,
    idempotencyKey: "m2b-003-durable-incident"
  });
  assert.equal(replay.replayed, true);
  assert.equal(rows.length, 1);
  assert.equal((await repository.findById(incident.dualRiskIncidentId))
    .incident.incidentHash, incident.incidentHash);
  assert.equal((await repository.findLatestByFacility(composition.tradingFacilityId))
    .snapshot.snapshotHash, snapshot.snapshotHash);

  const changedSnapshot = dualRisk(composition, {
    venueRisk: { marginState: "CRITICAL" }
  });
  const changedIncident = createM2BDualRiskRecoveryIncident({
    snapshot: changedSnapshot,
    openedAt: new Date(NOW.getTime() + 4_000)
  });
  await assert.rejects(() => repository.open({
    snapshot: changedSnapshot,
    incident: changedIncident,
    idempotencyKey: "m2b-003-durable-incident"
  }), { code: "m2b_dual_risk_idempotency_conflict" });
});
