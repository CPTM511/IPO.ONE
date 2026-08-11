import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../persistence/src/index.js";
import {
  HypercoreDelegateStatus,
  HypercoreExecutionActionKind,
  PostgresHypercoreDelegateRepository,
  PostgresHypercoreStableExecutionRepository,
  PostgresHypercoreTestnetSubmissionRepository,
  compileHypercoreExecutionAction,
  createHypercoreCancelJitVenuePreflightReceipt,
  createHypercoreJitVenuePreflightReceipt,
  createHypercoreL1SigningRequest,
  createHypercoreStableCancelPolicyConstraint,
  createHypercoreStableCancelTarget,
  createHypercoreStableFounderApproval,
  createHypercoreStablePolicyConstraint,
  retireHypercoreTestnetSignerHandoff
} from "../src/index.js";

const { Pool } = pg;
const enabled = process.env.IPO_ONE_RUN_HYPERCORE_ADR039_POSTGRES_TESTS === "true";
const connectionString = process.env.DATABASE_URL;

function h(scope) {
  return hashId("hypercore_adr039_postgres_test", { scope });
}

function policy(intent) {
  return createHypercoreStablePolicyConstraint({
    policyId: "hypercore_testnet_btc_proof_002d_stable",
    policyVersion: "adr_039.v2",
    facilityHash: intent.facilityHash,
    accountBindingHash: intent.accountBindingHash,
    delegateHash: intent.delegateHash,
    signerReferenceHash: intent.signerReferenceHash,
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
}

function draft(intent, hyperliquidAction = intent.hyperliquidAction) {
  return {
    facilityId: intent.facilityId,
    facilityHash: intent.facilityHash,
    accountBindingId: intent.accountBindingId,
    accountBindingHash: intent.accountBindingHash,
    canonicalAccountAddressHash: intent.canonicalAccountAddressHash,
    handoffId: intent.handoffId,
    handoffHash: intent.handoffHash,
    delegateId: intent.delegateId,
    delegateHash: intent.delegateHash,
    apiWalletAddressHash: intent.apiWalletAddressHash,
    signerReferenceHash: intent.signerReferenceHash,
    policyConstraint: policy(intent),
    hyperliquidAction
  };
}

function originalIdempotencyKey(intent) {
  const order = intent.hyperliquidAction.orders[0];
  const sourceHash = hashId("hypercore_002d_stable_exact_source", {
    facilityHash: intent.facilityHash,
    accountBindingHash: intent.accountBindingHash,
    delegateHash: intent.delegateHash,
    side: order.b ? "buy" : "sell",
    limitPx: order.p,
    size: order.s,
    preparedAt: intent.preparedAt
  });
  return `hypercore-002d-stable-${sourceHash}`;
}

function cancelObservation(target, observedAt) {
  return {
    masterRole: "user",
    apiWalletRole: "agent",
    accountValue: "999",
    withdrawable: "998.5",
    positionCount: 0,
    openOrderCount: 1,
    aggregateExposureUsd: "0",
    positionNotionalUsd: "0",
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false,
    masterRoleHash: h("cancel_master_role"),
    apiWalletRoleHash: h("cancel_api_role"),
    accountStateHash: h("cancel_account_state"),
    ordersHash: h("cancel_orders"),
    orderStatusHash: h("cancel_order_status"),
    metadataHash: h("cancel_metadata"),
    metadataObservedAt: new Date(observedAt.getTime() - 1_000).toISOString(),
    market: "BTC",
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    observedTargetOrder: target,
    observedTargetOrderHash: target.targetOrderHash,
    metaResponseHash: h("cancel_meta_response"),
    ordersResponseHash: h("cancel_orders_response"),
    orderStatusResponseHash: h("cancel_order_status_response")
  };
}

test("ADR-039 PostgreSQL replay and signing claims are single-use", {
  skip: !enabled || !connectionString
}, async () => {
  const pool = new Pool({
    connectionString,
    max: 12,
    application_name: "ipo-one-hypercore-adr039-postgres-test"
  });
  const eventRepository = new PostgresEventRepository({
    pool,
    tenantContext: createTenantSecurityContext({
      tenantId: "tenant_ipo_one_local_pilot",
      actorId: "actor_hypercore_execution_owner",
      policyVersion: "security_001.v1",
      source: "system_worker"
    })
  });
  const repository = new PostgresHypercoreStableExecutionRepository({ eventRepository });
  try {
    const seedResult = await eventRepository.withTenantRead((client) => client.query(
      `SELECT intent FROM hypercore_stable_execution_intents
        WHERE state = 'PREPARED'
          AND schema_version = 'hypercore_stable_execution_intent.v2'
        ORDER BY prepared_at DESC LIMIT 1`
    ));
    assert.equal(seedResult.rowCount, 1);
    const seed = seedResult.rows[0].intent;
    assert.equal(policy(seed).policyConstraintHash, seed.policyConstraintHash);

    const replays = await Promise.all(Array.from({ length: 12 }, () => repository.prepare({
      draft: draft(seed),
      idempotencyKey: originalIdempotencyKey(seed),
      now: new Date(seed.preparedAt)
    })));
    assert.equal(replays.every(({ replayed }) => replayed === true), true);
    assert.equal(new Set(replays.map(({ intent }) => intent.intentHash)).size, 1);
    assert.equal(replays[0].intent.intentHash, seed.intentHash);

    const preparedAt = new Date(new Date(seed.preparedAt).getTime() + 1_000);
    const action = structuredClone(seed.hyperliquidAction);
    action.orders[0].c = `0x${h("concurrent_preparation").slice(2, 34)}`;
    const idempotencyKey = `adr-039-postgres-concurrency-${h("idempotency")}`;
    const prepared = await Promise.all(Array.from({ length: 12 }, () => repository.prepare({
      draft: draft(seed, action),
      idempotencyKey,
      now: preparedAt
    })));
    assert.equal(prepared.filter(({ replayed }) => replayed === false).length, 1);
    assert.equal(prepared.filter(({ replayed }) => replayed === true).length, 11);
    assert.equal(new Set(prepared.map(({ intent }) => intent.intentHash)).size, 1);
    const intent = prepared[0].intent;
    assert.equal(
      new Date(intent.approvalExpiresAt).getTime() - new Date(intent.preparedAt).getTime(),
      30 * 60_000
    );

    const approvedAt = new Date(preparedAt.getTime() + 1_000);
    const approval = createHypercoreStableFounderApproval({
      intent,
      actorId: "actor_ipo_one_founder",
      confirmationNonceHash: h("confirmation"),
      approvedAt,
      expiresAt: new Date(approvedAt.getTime() + 60_000)
    });
    const approved = await repository.approve({ intentId: intent.intentId, approval });
    const observedAt = new Date(approvedAt.getTime() + 1_000);
    const receipt = createHypercoreJitVenuePreflightReceipt({
      intent: approved,
      approval,
      now: observedAt,
      observation: {
        masterRole: "user",
        apiWalletRole: "agent",
        accountValue: "999",
        withdrawable: "999",
        positionCount: 0,
        openOrderCount: 0,
        aggregateExposureUsd: "0",
        positionNotionalUsd: "0",
        unknownOutcomeCount: 0,
        reconciliationStatus: "RECONCILED",
        paused: false,
        masterRoleHash: h("master_role"),
        apiWalletRoleHash: h("api_role"),
        accountStateHash: h("account_state"),
        ordersHash: h("orders"),
        metadataHash: h("metadata"),
        metadataObservedAt: observedAt.toISOString(),
        market: "BTC",
        assetIndex: 3,
        sizeDecimals: 5,
        priceDecimals: 1,
        mid: "65005",
        bestBid: "65000",
        bestAsk: "65010",
        metaResponseHash: h("meta"),
        midsResponseHash: h("mids"),
        bookResponseHash: h("book")
      }
    });
    const order = intent.hyperliquidAction.orders[0];
    const preparedAction = compileHypercoreExecutionAction({
      actionKind: HypercoreExecutionActionKind.ORDER,
      action: {
        assetIndex: 3,
        side: order.b ? "buy" : "sell",
        limitPx: order.p,
        size: order.s,
        reduceOnly: false,
        timeInForce: "Alo",
        cloid: order.c
      },
      sourceActionHash: intent.intentHash,
      policyDecisionHash: intent.policyConstraintHash,
      riskSnapshotHash: receipt.riskSnapshotHash,
      accountBindingHash: intent.accountBindingHash,
      delegateHash: intent.delegateHash
    });
    const signingRequest = createHypercoreL1SigningRequest({
      preparedAction,
      signerReferenceHash: intent.signerReferenceHash,
      canonicalAccountAddressHash: intent.canonicalAccountAddressHash,
      nonce: intent.nonce,
      expiresAfter: observedAt.getTime() + 9_000
    });
    const claims = await Promise.allSettled([1, 2].map(() => repository.beginSigning({
      intentId: intent.intentId,
      approval,
      receipt,
      signingRequest,
      now: observedAt
    })));
    assert.equal(claims.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(claims.filter(({ status }) => status === "rejected").length, 1);
    const aborted = await repository.abortSigning({
      intentId: intent.intentId,
      reasonHash: h("test_abort_before_network"),
      now: new Date(observedAt.getTime() + 1_000)
    });
    assert.equal(aborted.state, "ABORTED");
    assert.equal(aborted.externalSubmissionAttempted, false);
    assert.equal(aborted.retryAllowed, false);

    const evidence = await eventRepository.withTenantRead((client) => client.query(
      `SELECT
         (SELECT count(*)::int FROM hypercore_stable_execution_transitions
           WHERE intent_id = $1) AS transitions,
         (SELECT count(*)::int FROM hypercore_stable_founder_approvals
           WHERE intent_id = $1 AND status = 'CONSUMED') AS consumed,
         (SELECT count(*)::int FROM hypercore_jit_venue_preflight_receipts
           WHERE intent_id = $1) AS preflights`,
      [intent.intentId]
    ));
    assert.deepEqual(evidence.rows[0], { transitions: 4, consumed: 1, preflights: 1 });
    await assert.rejects(
      () => eventRepository.withTenantWrite((client) => client.query(
        "DELETE FROM hypercore_stable_execution_transitions WHERE intent_id = $1",
        [intent.intentId]
      )),
      (error) => error.code === "23514"
    );
  } finally {
    await pool.end();
  }
});

test("ADR-039 closure PostgreSQL binds one exact cancel and aborts before any external write", {
  skip: !enabled || !connectionString
}, async (t) => {
  const pool = new Pool({
    connectionString,
    max: 12,
    application_name: "ipo-one-hypercore-adr039-cancel-postgres-test"
  });
  const eventRepository = new PostgresEventRepository({
    pool,
    tenantContext: createTenantSecurityContext({
      tenantId: "tenant_ipo_one_local_pilot",
      actorId: "actor_hypercore_execution_owner",
      policyVersion: "security_001.v1",
      source: "system_worker"
    })
  });
  const repository = new PostgresHypercoreStableExecutionRepository({ eventRepository });
  try {
    const parentResult = await eventRepository.withTenantRead((client) => client.query(
      `SELECT intent FROM hypercore_stable_execution_intents
        WHERE intent_hash = $1 AND schema_version = 'hypercore_stable_execution_intent.v2'`,
      ["0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5"]
    ));
    assert.equal(parentResult.rowCount, 1);
    const parent = parentResult.rows[0].intent;
    assert.equal(parent.state, "SUBMITTED");
    assert.equal(parent.disposition, "confirmed");
    const attempted = await eventRepository.withTenantRead((client) => client.query(
      `SELECT count(*)::int AS count FROM hypercore_stable_execution_intents
        WHERE parent_intent_id = $1 AND external_submission_attempted = TRUE`,
      [parent.intentId]
    ));
    if (attempted.rows[0].count !== 0) {
      t.skip("parent already has the one permitted live cancel attempt");
      return;
    }
    const order = parent.hyperliquidAction.orders[0];
    const target = createHypercoreStableCancelTarget({
      parentIntentId: parent.intentId,
      parentIntentHash: parent.intentHash,
      market: "BTC",
      assetIndex: 3,
      side: order.b ? "buy" : "sell",
      limitPx: order.p,
      size: order.s,
      reduceOnly: order.r,
      cloid: order.c,
      venueOrderId: 57670774189
    });
    const policyConstraint = createHypercoreStableCancelPolicyConstraint({
      policyId: "hypercore_testnet_btc_proof_002d_cancel",
      policyVersion: "adr_039_closure.v1",
      facilityHash: parent.facilityHash,
      accountBindingHash: parent.accountBindingHash,
      delegateHash: parent.delegateHash,
      signerReferenceHash: parent.signerReferenceHash,
      parentIntentHash: parent.intentHash,
      targetOrderHash: target.targetOrderHash,
      targetClientOrderId: target.cloid,
      executionOwnerActorId: "actor_hypercore_execution_owner",
      riskOwnerActorId: "actor_hypercore_risk_owner",
      incidentOwnerActorId: "actor_ipo_one_founder"
    });
    const draft = {
      facilityId: parent.facilityId,
      facilityHash: parent.facilityHash,
      accountBindingId: parent.accountBindingId,
      accountBindingHash: parent.accountBindingHash,
      canonicalAccountAddressHash: parent.canonicalAccountAddressHash,
      handoffId: parent.handoffId,
      handoffHash: parent.handoffHash,
      delegateId: parent.delegateId,
      delegateHash: parent.delegateHash,
      apiWalletAddressHash: parent.apiWalletAddressHash,
      signerReferenceHash: parent.signerReferenceHash,
      parentIntentId: parent.intentId,
      parentIntentHash: parent.intentHash,
      targetOrder: target,
      policyConstraint,
      hyperliquidAction: {
        type: "cancelByCloid",
        cancels: [{ asset: 3, cloid: target.cloid }]
      }
    };
    const preparedAt = new Date(new Date(parent.preparedAt).getTime() + 2_000);
    const idempotencyKey = `adr-039-cancel-postgres-${h("cancel_idempotency")}`;
    const preparations = await Promise.all(Array.from({ length: 12 }, () =>
      repository.prepareCancel({ draft, idempotencyKey, now: preparedAt })
    ));
    assert.equal(preparations.filter(({ replayed }) => replayed === false).length, 1);
    assert.equal(preparations.filter(({ replayed }) => replayed === true).length, 11);
    assert.equal(new Set(preparations.map(({ intent }) => intent.intentHash)).size, 1);
    const intent = preparations[0].intent;
    assert.equal(intent.actionKind, "cancelByCloid");
    assert.equal(intent.parentIntentHash, parent.intentHash);
    assert.equal(intent.targetOrderHash, target.targetOrderHash);
    assert.equal(
      new Date(intent.approvalExpiresAt).getTime() - new Date(intent.preparedAt).getTime(),
      30 * 60_000
    );

    const approvedAt = new Date(preparedAt.getTime() + 1_000);
    const approval = createHypercoreStableFounderApproval({
      intent,
      actorId: "actor_ipo_one_founder",
      confirmationNonceHash: h("cancel_confirmation"),
      approvedAt,
      expiresAt: new Date(approvedAt.getTime() + 60_000)
    });
    const approved = await repository.approve({ intentId: intent.intentId, approval });
    const observedAt = new Date(approvedAt.getTime() + 1_000);
    const receipt = createHypercoreCancelJitVenuePreflightReceipt({
      intent: approved,
      approval,
      observation: cancelObservation(target, observedAt),
      now: observedAt
    });
    const preparedAction = compileHypercoreExecutionAction({
      actionKind: HypercoreExecutionActionKind.CANCEL_BY_CLOID,
      action: { assetIndex: 3, cloid: target.cloid },
      sourceActionHash: intent.intentHash,
      policyDecisionHash: intent.policyConstraintHash,
      riskSnapshotHash: receipt.riskSnapshotHash,
      accountBindingHash: intent.accountBindingHash,
      delegateHash: intent.delegateHash
    });
    const signingRequest = createHypercoreL1SigningRequest({
      preparedAction,
      signerReferenceHash: intent.signerReferenceHash,
      canonicalAccountAddressHash: intent.canonicalAccountAddressHash,
      nonce: intent.nonce,
      expiresAfter: observedAt.getTime() + 9_000
    });
    const claims = await Promise.allSettled([1, 2].map(() => repository.beginSigning({
      intentId: intent.intentId,
      approval,
      receipt,
      signingRequest,
      now: observedAt
    })));
    assert.equal(claims.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(claims.filter(({ status }) => status === "rejected").length, 1);
    const aborted = await repository.abortSigning({
      intentId: intent.intentId,
      reasonHash: h("cancel_abort_before_network"),
      now: new Date(observedAt.getTime() + 1_000)
    });
    assert.equal(aborted.state, "ABORTED");
    assert.equal(aborted.externalSubmissionAttempted, false);
    assert.equal(aborted.retryAllowed, false);

    const evidence = await eventRepository.withTenantRead((client) => client.query(
      `SELECT
         (SELECT count(*)::int FROM hypercore_stable_execution_intents
           WHERE parent_intent_id = $1) AS cancel_intents,
         (SELECT count(*)::int FROM hypercore_stable_execution_transitions
           WHERE intent_id = $2) AS transitions,
         (SELECT count(*)::int FROM hypercore_stable_founder_approvals
           WHERE intent_id = $2 AND status = 'CONSUMED') AS consumed,
         (SELECT count(*)::int FROM hypercore_jit_venue_preflight_receipts
           WHERE intent_id = $2) AS preflights,
         (SELECT count(*)::int FROM hypercore_stable_execution_intents
           WHERE id = $2 AND external_submission_attempted = TRUE) AS external_attempts`,
      [parent.intentId, intent.intentId]
    ));
    assert.deepEqual(evidence.rows[0], {
      cancel_intents: 1,
      transitions: 4,
      consumed: 1,
      preflights: 1,
      external_attempts: 0
    });
    await assert.rejects(
      () => eventRepository.withTenantWrite((client) => client.query(
        `UPDATE hypercore_stable_execution_intents
            SET target_venue_order_id = target_venue_order_id + 1
          WHERE id = $1`,
        [intent.intentId]
      )),
      (error) => error.code === "23514"
    );
  } finally {
    await pool.end();
  }
});

test("ADR-039 closure PostgreSQL requires reconciled parent/cancel and retired signer/delegate", {
  skip: !enabled || !connectionString
}, async () => {
  const pool = new Pool({
    connectionString,
    max: 8,
    application_name: "ipo-one-hypercore-adr039-final-closure-postgres-test"
  });
  const tenantContext = createTenantSecurityContext({
    tenantId: "tenant_ipo_one_local_pilot",
    actorId: "actor_hypercore_execution_owner",
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
  const eventRepository = new PostgresEventRepository({ pool, tenantContext });
  const repository = new PostgresHypercoreStableExecutionRepository({ eventRepository });
  const coreRepository = new PostgresCoreRepository({ pool, tenantContext });
  const delegateRepository = new PostgresHypercoreDelegateRepository({ coreRepository });
  const submissionRepository = new PostgresHypercoreTestnetSubmissionRepository({
    eventRepository
  });
  try {
    const parent = await repository.findByHash(
      "0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5"
    );
    const cancel = await repository.findByHash(
      "0x773eb0c6262e91681ba2f526d0ece54e1397b70b8d76224361d5020fc77dc381"
    );
    assert.equal(parent?.state, "SUBMITTED");
    assert.equal(cancel?.state, "SUBMITTED");
    const terminalHashes = {
      venueOrderStateHash: h("final_cancel_order_state"),
      venueAccountStateHash: h("final_cancel_account_state"),
      ledgerStateHash: h("final_cancel_ledger_state"),
      obligationEvidenceHash: h("final_cancel_obligation_evidence")
    };
    const parentReconciled = await repository.reconcile({
      intentId: parent.intentId,
      reconciliationHash: h("final_parent_reconciliation"),
      ...terminalHashes,
      now: new Date("2026-08-10T14:20:00.000Z")
    });
    const cancelReconciled = await repository.reconcile({
      intentId: cancel.intentId,
      reconciliationHash: h("final_cancel_reconciliation"),
      ...terminalHashes,
      now: new Date("2026-08-10T14:20:01.000Z")
    });
    assert.equal(parentReconciled.state, "RECONCILED");
    assert.equal(cancelReconciled.state, "RECONCILED");
    await assert.rejects(
      () => repository.close({
        intentId: cancel.intentId,
        now: new Date("2026-08-10T14:20:02.000Z")
      }),
      { code: "hypercore_stable_close_denied" }
    );

    const delegate = await delegateRepository.find(cancel.delegateId);
    const terminated = await delegateRepository.terminate({
      delegateId: delegate.delegateId,
      expectedDelegateHash: delegate.delegateHash,
      status: HypercoreDelegateStatus.RETIRED,
      reason: "bounded_testnet_proof_complete",
      idempotencyKey: `adr-039-final-retire-${h("final_delegate_retirement")}`,
      now: new Date("2026-08-10T14:20:03.000Z")
    });
    assert.equal(terminated.delegate.status, HypercoreDelegateStatus.RETIRED);
    assert.equal(terminated.tombstone.addressReuseAllowed, false);
    const handoff = await submissionRepository.findSignerHandoff(cancel.handoffId);
    const retirementEvidenceHash = hashId("hypercore_002d_signer_retirement", {
      cancelIntentHash: cancel.intentHash,
      tombstoneHash: terminated.tombstone.tombstoneHash,
      signerDestructionHash: h("final_signer_destruction")
    });
    const retiredHandoff = retireHypercoreTestnetSignerHandoff({
      handoff,
      retirementEvidenceHash,
      now: new Date("2026-08-10T14:20:04.000Z")
    });
    await submissionRepository.retireSignerHandoff(retiredHandoff);
    const parentClosed = await repository.close({
      intentId: parent.intentId,
      now: new Date("2026-08-10T14:20:05.000Z")
    });
    const cancelClosed = await repository.close({
      intentId: cancel.intentId,
      now: new Date("2026-08-10T14:20:06.000Z")
    });
    assert.equal(parentClosed.state, "CLOSED");
    assert.equal(cancelClosed.state, "CLOSED");
    assert.equal(parentClosed.signerRetirementHash, retirementEvidenceHash);
    assert.equal(cancelClosed.signerRetirementHash, retirementEvidenceHash);

    const durable = await eventRepository.withTenantRead((client) => client.query(
      `SELECT
         (SELECT count(*)::int FROM hypercore_delegate_tombstones
           WHERE delegate_id = $1) AS tombstones,
         (SELECT count(*)::int FROM hypercore_stable_execution_intents
           WHERE id IN ($2, $3) AND state = 'CLOSED') AS closed_intents,
         (SELECT count(*)::int FROM hypercore_stable_execution_transitions
           WHERE intent_id IN ($2, $3) AND next_state IN ('RECONCILED', 'CLOSED'))
           AS closure_transitions`,
      [cancel.delegateId, parent.intentId, cancel.intentId]
    ));
    assert.deepEqual(durable.rows[0], {
      tombstones: 1,
      closed_intents: 2,
      closure_transitions: 4
    });
  } finally {
    await pool.end();
  }
});
