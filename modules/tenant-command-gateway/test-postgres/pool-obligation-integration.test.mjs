import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  keccak256,
  stringToHex
} from "viem";
import {
  CreditEventType,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  SECURED_POOL_V1_EVENT_ABI,
  createSecuredPoolV1Adapter
} from "../../chain-adapter/src/index.js";
import {
  PoolEventIndexer,
  PostgresPoolObservationStore
} from "../../event-indexer/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/index.js";
import { PostgresCreditOutcomeMaterializer } from "../../credit-learning/src/index.js";
import {
  PoolObligationIntegrationService,
  readOwnSecuredPoolQueryHandler,
  readSecuredPoolRiskQueryHandler,
  reviewSecuredPoolActionQueryHandler
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const TENANT_ID = "tenant_ipo_one_local_pilot";
const OTHER_TENANT_ID = "tenant_m2a006_other";
const CHAIN = "eip155:84532";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const MARKET = keccak256(stringToHex("ipo.one:m2a006:postgres-market"));
const ACCOUNT = "0x2222222222222222222222222222222222222222";
const LP = "0x3333333333333333333333333333333333333333";
const DEBT_ASSET = "0x4444444444444444444444444444444444444444";
const COLLATERAL_ASSET = "0x5555555555555555555555555555555555555555";
const ORACLE = "0x6666666666666666666666666666666666666666";
const SOURCE = keccak256(stringToHex("ipo.one:m2a006:oracle"));
const SUBJECT_ID = "subject_m2a006_human";
const PRINCIPAL_ID = "principal_m2a006_human";
const ACCOUNT_BINDING_ID = "account_binding_m2a006_human";
const OBLIGATION_ID = "obligation_m2a006_human";
const ASSET_ID = `eip155:84532/erc20:${DEBT_ASSET}`;
const CONTEXT = createTenantSecurityContext({
  tenantId: TENANT_ID,
  actorId: "actor_m2a006_worker",
  policyVersion: "security_001.v1",
  source: "local_test"
});
const OTHER_CONTEXT = createTenantSecurityContext({
  tenantId: OTHER_TENANT_ID,
  actorId: "actor_m2a006_other",
  policyVersion: "security_001.v1",
  source: "local_test"
});

function baseline() {
  const createdAt = "2026-08-23T00:00:00.000Z";
  const installmentId = "obligation_installment_m2a006";
  const riskDecisionId = "risk_decision_m2a006";
  const decisionHash = hashId("m2a006_risk_decision", riskDecisionId);
  const policyHash = hashId("m2a006_risk_policy", "v1");
  const featureSnapshotHash = hashId("m2a006_feature_snapshot", riskDecisionId);
  const riskFeatureSnapshotId = `risk_feature_snapshot_${featureSnapshotHash.slice(2)}`;
  const decisionPassportHash = hashId("m2a006_decision_passport", riskDecisionId);
  return {
    principal: {
      principalId: PRINCIPAL_ID,
      principalHash: hashId("m2a006_principal", PRINCIPAL_ID),
      principalType: "individual",
      responsibilityScope: "full",
      status: "active",
      createdAt,
      schemaVersion: "principal.v1"
    },
    subject: {
      subjectId: SUBJECT_ID,
      subjectHash: hashId("m2a006_subject", SUBJECT_ID),
      subjectType: "human",
      displayName: "Synthetic M2A-006 Human",
      primaryPrincipalId: PRINCIPAL_ID,
      riskTier: "standard",
      prototypeOnly: true,
      status: "active",
      createdAt,
      updatedAt: createdAt,
      schemaVersion: "subject.v1"
    },
    accountBinding: {
      accountBindingId: ACCOUNT_BINDING_ID,
      subjectId: SUBJECT_ID,
      accountHash: hashId("m2a006_account", `${CHAIN}:${ACCOUNT}`),
      accountIdRef: `${CHAIN}:${ACCOUNT}`,
      chainId: CHAIN,
      purpose: "execution",
      signatureHash: hashId("m2a006_proof", "redacted"),
      nonce: hashId("m2a006_nonce", "one"),
      verificationMethod: "eip712_eoa_v1",
      status: "active",
      boundAt: createdAt,
      proofHash: hashId("m2a006_proof", "redacted"),
      protocolVersion: "1.2",
      executionChallengeId: "execution_account_binding_challenge_m2a006",
      controllerActorHash: hashId("m2a006_actor", "controller"),
      bindingKind: "execution",
      schemaVersion: "account_binding.v3"
    },
    riskDecision: {
      riskDecisionId,
      decisionHash,
      creditIntentId: "credit_intent_m2a006",
      subjectId: SUBJECT_ID,
      principalId: PRINCIPAL_ID,
      authorityType: "consent",
      authorityRef: "consent_m2a006",
      consentId: "consent_m2a006",
      assetId: ASSET_ID,
      status: "approved",
      modelVersion: "credit-application-rules.v1",
      limitMinor: "2000",
      utilizationMinor: "0",
      action: "credit_application_evaluation",
      reasons: [{ code: "sandbox_rules_v1_approved" }],
      policyHash,
      riskFeatureSnapshotId,
      featureSnapshotHash,
      riskFeatureSnapshot: {
        riskFeatureSnapshotId,
        featureSnapshotHash,
        featureSetVersion: "credit-application-evidence-features.v1",
        policyVersion: "credit-application-rules.v1",
        policyHash,
        features: { allRequiredFeaturesSatisfied: true },
        sourceEvidence: [{
          role: "credit_intent",
          evidenceHash: hashId("m2a006_risk_source", riskDecisionId)
        }],
        riskStateAttestation: {
          queryVersion: "credit-application-risk-state.v1",
          stateHash: hashId("m2a006_risk_state", riskDecisionId)
        },
        asOf: createdAt,
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: "risk_feature_snapshot.v1"
      },
      decisionPassport: {
        riskDecisionPassportId: `risk_decision_passport_${decisionPassportHash.slice(2)}`,
        decisionPassportHash,
        riskDecisionId,
        decisionHash,
        riskFeatureSnapshotId,
        featureSnapshotHash,
        featureSetVersion: "credit-application-evidence-features.v1",
        policyVersion: "credit-application-rules.v1",
        policyHash,
        reasonLineage: [{
          reasonCode: "sandbox_rules_v1_approved",
          featureKeys: ["allRequiredFeaturesSatisfied"],
          sourceRoles: ["credit_intent", "risk_state_attestation"]
        }],
        asOf: createdAt,
        nonAuthorizing: true,
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: "risk_decision_passport.v1"
      },
      sandboxOnly: true,
      productionAuthority: false,
      createdAt,
      schemaVersion: "risk_decision.v3"
    },
    obligation: {
      obligationId: OBLIGATION_ID,
      obligationHash: hashId("m2a006_obligation", OBLIGATION_ID),
      subjectId: SUBJECT_ID,
      principalId: PRINCIPAL_ID,
      creditIntentId: "credit_intent_m2a006",
      riskDecisionId: "risk_decision_m2a006",
      creditOfferId: "credit_offer_m2a006",
      creditOfferAcceptanceId: "credit_offer_acceptance_m2a006",
      authorityType: "consent",
      authorityRef: "consent_m2a006",
      consentId: "consent_m2a006",
      assetId: ASSET_ID,
      originalPrincipalMinor: "2000",
      outstandingPrincipalMinor: "2000",
      annualRateBps: 0,
      originationFeeMinor: "0",
      accruedInterestMinor: "0",
      outstandingInterestMinor: "0",
      accruedFeesMinor: "0",
      outstandingFeesMinor: "0",
      totalRepaidMinor: "0",
      repaymentFrequency: "end_of_term",
      installmentCount: 1,
      firstPaymentAt: "2027-08-23T00:00:00.000Z",
      maturityAt: "2027-08-23T00:00:00.000Z",
      scheduleVersion: "obligation_schedule.v1",
      scheduleHash: hashId("m2a006_schedule", OBLIGATION_ID),
      scheduleSequence: 1,
      installments: [{
        installmentId,
        obligationId: OBLIGATION_ID,
        installmentNumber: 1,
        dueAt: "2027-08-23T00:00:00.000Z",
        scheduledPrincipalMinor: "2000",
        scheduledInterestMinor: "0",
        scheduledFeeMinor: "0",
        paidPrincipalMinor: "0",
        paidInterestMinor: "0",
        paidFeeMinor: "0",
        status: "scheduled",
        scheduleVersion: "obligation_schedule.v1",
        scheduleSequence: 1,
        schemaVersion: "obligation_installment.v1"
      }],
      executionStatus: "pending",
      sandboxOnly: true,
      productionFundsMoved: false,
      status: "created",
      servicingClassification: "current",
      daysPastDue: 0,
      oldestUnpaidInstallmentId: installmentId,
      servicingEffectiveAt: createdAt,
      servicingReasonCode: "obligation_created",
      servicingPolicyVersion: "sandbox-servicing-policy.v1",
      servicingOwnerCode: "sandbox_platform",
      writtenOffPrincipalMinor: "0",
      writtenOffInterestMinor: "0",
      writtenOffFeesMinor: "0",
      acceptedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: "obligation.v2"
    }
  };
}

function eventFor(type, aggregateId, subjectId = SUBJECT_ID) {
  return createCreditEvent({
    eventType: type,
    subjectId,
    obligationId: aggregateId === OBLIGATION_ID ? OBLIGATION_ID : undefined,
    payload: { aggregateId, syntheticOnly: true, productionFundsMoved: false },
    now: new Date("2026-08-23T00:00:00.000Z")
  });
}

async function seedCanonicalKernel(ownerPool) {
  const values = baseline();
  const eventRepository = new PostgresEventRepository({ pool: ownerPool, tenantContext: CONTEXT });
  const coreRepository = new PostgresCoreRepository({ pool: ownerPool, eventRepository });
  await ownerPool.query("ALTER TABLE account_bindings DISABLE TRIGGER ALL");
  await ownerPool.query("ALTER TABLE risk_decisions DISABLE TRIGGER ALL");
  await ownerPool.query("ALTER TABLE obligations DISABLE TRIGGER ALL");
  await ownerPool.query("ALTER TABLE account_bindings ENABLE TRIGGER tenant_context_guard_account_bindings");
  await ownerPool.query("ALTER TABLE risk_decisions ENABLE TRIGGER tenant_context_guard_risk_decisions");
  await ownerPool.query("ALTER TABLE obligations ENABLE TRIGGER tenant_context_guard_obligations");
  try {
    return await eventRepository.withTenantWrite(async (client) => {
    const descriptors = [
      [CoreProjectionType.PRINCIPAL, values.principal, PRINCIPAL_ID, CreditEventType.PRINCIPAL_CREATED],
      [CoreProjectionType.SUBJECT, values.subject, SUBJECT_ID, CreditEventType.SUBJECT_CREATED],
      [CoreProjectionType.ACCOUNT_BINDING, values.accountBinding, ACCOUNT_BINDING_ID, CreditEventType.ACCOUNT_BOUND],
      [CoreProjectionType.RISK_DECISION, values.riskDecision, values.riskDecision.riskDecisionId, CreditEventType.RISK_DECISION_CREATED],
      [CoreProjectionType.OBLIGATION, values.obligation, OBLIGATION_ID, CreditEventType.OBLIGATION_CREATED]
    ];
    const events = descriptors.map(([type, , aggregateId, eventType]) => ({
      aggregateType: type,
      aggregateId,
      expectedVersion: 0,
      event: eventFor(eventType, aggregateId)
    }));
      await coreRepository.commitCommandInTransaction(client, {
      aggregateType: "m2a006_fixture",
      aggregateId: OBLIGATION_ID,
      idempotencyKey: `m2a006-fixture:${OBLIGATION_ID}`,
      commandHash: hashId("m2a006_fixture_command", OBLIGATION_ID),
      events,
      writes: descriptors.map(([type, value], index) => ({
        type,
        value,
        eventId: events[index].event.eventId
      })),
      response: { seeded: true }
      });
    });
  } finally {
    await ownerPool.query("ALTER TABLE obligations ENABLE TRIGGER ALL");
    await ownerPool.query("ALTER TABLE risk_decisions ENABLE TRIGGER ALL");
    await ownerPool.query("ALTER TABLE account_bindings ENABLE TRIGGER ALL");
  }
}

function encodedLog(eventName, args, blockNumber, logIndex) {
  const item = getAbiItem({ abi: SECURED_POOL_V1_EVENT_ABI, name: eventName });
  const indexed = Object.fromEntries(
    item.inputs.filter(({ indexed: isIndexed }) => isIndexed).map(({ name }) => [name, args[name]])
  );
  const dataInputs = item.inputs.filter(({ indexed: isIndexed }) => !isIndexed);
  return {
    chainId: CHAIN,
    contractAddress: CONTRACT,
    transactionHash: hashId("m2a006_postgres_tx", { eventName, blockNumber, logIndex }),
    transactionIndex: 0,
    logIndex,
    blockNumber: String(blockNumber),
    blockHash: hashId("m2a006_postgres_block", String(blockNumber)),
    blockTimestamp: String(1_787_385_600 + blockNumber),
    confirmations: 4,
    topics: encodeEventTopics({ abi: SECURED_POOL_V1_EVENT_ABI, eventName, args: indexed }),
    data: encodeAbiParameters(dataInputs, dataInputs.map(({ name }) => args[name])),
    observedAt: new Date(Date.UTC(2026, 7, 23, 1, blockNumber - 99)).toISOString()
  };
}

async function seedFinalizedBorrow(appPool) {
  const adapter = createSecuredPoolV1Adapter({ chainId: CHAIN, contractAddress: CONTRACT, marketId: MARKET });
  const store = new PostgresPoolObservationStore({ pool: appPool, tenantContext: CONTEXT });
  const indexer = new PoolEventIndexer({ adapter, store });
  const logs = [
    encodedLog("MarketInitialized", {
      marketId: MARKET,
      chainId: 84532n,
      debtAsset: DEBT_ASSET,
      collateralAsset: COLLATERAL_ASSET,
      priceOracle: ORACLE,
      oracleSourceId: SOURCE,
      marketDebtCapAssets: 1_000_000n,
      borrowerDebtCapAssets: 100_000n,
      loanToValueBps: 7_000,
      liquidationThresholdBps: 8_000,
      pauseGuardian: ACCOUNT,
      recoveryAuthority: LP
    }, 100, 0),
    encodedLog("AssetsSupplied", {
      marketId: MARKET,
      account: LP,
      assets: 10_000n,
      shares: 10_000n,
      cashAfter: 10_000n,
      totalSupplySharesAfter: 10_000n
    }, 101, 0),
    encodedLog("CollateralAdded", {
      marketId: MARKET,
      account: ACCOUNT,
      assets: 5_000n,
      collateralAfter: 5_000n
    }, 102, 0),
    encodedLog("AssetsBorrowed", {
      marketId: MARKET,
      account: ACCOUNT,
      assets: 2_000n,
      debtShares: 2_000n,
      debtAfter: 2_000n,
      cashAfter: 8_000n
    }, 103, 0)
  ];
  let borrowed;
  for (const log of logs) borrowed = await indexer.ingest(log);
  return { adapter, indexer, effect: borrowed.effect };
}

async function seedFinalizedRepayment(indexer) {
  const repaid = await indexer.ingest(encodedLog("AssetsRepaid", {
    marketId: MARKET,
    account: ACCOUNT,
    payer: ACCOUNT,
    assetsTransferred: 2_000n,
    debtReducedAssets: 2_000n,
    debtSharesBurned: 2_000n,
    reserveDustAssets: 0n,
    debtAfter: 0n,
    cashAfter: 10_000n
  }, 104, 0));
  return repaid.effect;
}

async function withContext(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test("M2A-006 binding and finalized-effect import are atomic, RLS-isolated, replay-safe and restartable", { timeout: 40_000 }, async () => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL is required");
  const ownerPool = createPostgresPool({ connectionString: CONNECTION_STRING, max: 4, applicationName: "m2a006-owner" });
  const appRole = "ipo_one_m2a006_test";
  let appPool;
  try {
    await ownerPool.query("TRUNCATE pool_obligation_effect_receipts, pool_execution_receipts, pool_obligation_projections, pool_obligation_bindings CASCADE");
    const existingRole = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
    if (existingRole.rowCount > 0) {
      await ownerPool.query(`DROP OWNED BY ${appRole}`);
      await ownerPool.query(`DROP ROLE ${appRole}`);
    }
    const password = randomBytes(24).toString("base64url");
    const quoted = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
    await ownerPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD ${quoted}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await ownerPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    const appUrl = new URL(CONNECTION_STRING);
    appUrl.username = appRole;
    appUrl.password = password;
    appPool = createPostgresPool({ connectionString: appUrl.toString(), max: 8, applicationName: "m2a006-app" });
    await assertTenantDatabaseRole(appPool);
    await seedCanonicalKernel(ownerPool);
    const { adapter, indexer, effect } = await seedFinalizedBorrow(appPool);
    const service = new PoolObligationIntegrationService({
      pool: appPool,
      tenantContext: CONTEXT,
      clock: () => new Date("2026-08-23T01:10:00.000Z")
    });
    await assert.rejects(
      () => service.bindPosition({
        subjectId: SUBJECT_ID,
        principalId: PRINCIPAL_ID,
        accountBindingId: ACCOUNT_BINDING_ID,
        obligationId: OBLIGATION_ID,
        descriptor: { ...adapter.descriptor(), chainId: "eip155:1952" }
      }),
      { code: "pool_account_binding_unavailable" }
    );
    assert.equal((await withContext(appPool, CONTEXT, (client) => client.query("SELECT count(*)::int AS count FROM pool_obligation_bindings"))).rows[0].count, 0);

    const bound = await service.bindPosition({
      subjectId: SUBJECT_ID,
      principalId: PRINCIPAL_ID,
      accountBindingId: ACCOUNT_BINDING_ID,
      obligationId: OBLIGATION_ID,
      descriptor: adapter.descriptor()
    });
    assert.equal(bound.entryMode, "human");
    assert.equal(bound.replayed, false);

    const [first, concurrent] = await Promise.all([
      service.importFinalizedEffect({ poolObligationBindingId: bound.poolObligationBindingId, effectHash: effect.effectHash }),
      service.importFinalizedEffect({ poolObligationBindingId: bound.poolObligationBindingId, effectHash: effect.effectHash })
    ]);
    assert.equal([first.replayed, concurrent.replayed].filter(Boolean).length, 1);
    assert.equal(first.projectionHash, concurrent.projectionHash);
    assert.equal(first.ledgerTransactionIds.length, 1);

    const durable = await withContext(appPool, CONTEXT, async (client) => {
      const obligation = await client.query(
        "SELECT status, execution_status, pool_execution_receipt_id FROM obligations WHERE id = $1",
        [OBLIGATION_ID]
      );
      const projection = await client.query(
        "SELECT projection_version, projection_hash, debt_assets::text FROM pool_obligation_projections"
      );
      const receipt = await client.query(
        "SELECT effect_hash, evidence_hash, credit_state_authorizing, automatic_limit_change FROM pool_obligation_effect_receipts"
      );
      const evidence = await client.query(
        "SELECT count(*)::int AS count FROM evidence_envelopes WHERE obligation_id = $1 AND event_type = 'pool_obligation_effect_imported'",
        [OBLIGATION_ID]
      );
      const ledger = await client.query(
        "SELECT count(*)::int AS count FROM ledger_transactions WHERE reference_id = $1",
        [effect.effectHash]
      );
      return { obligation, projection, receipt, evidence, ledger };
    });
    assert.equal(durable.obligation.rows[0].status, "active");
    assert.equal(durable.obligation.rows[0].execution_status, "executed");
    assert.ok(durable.obligation.rows[0].pool_execution_receipt_id.startsWith("pool_execution_receipt_"));
    assert.deepEqual(durable.projection.rows[0], {
      projection_version: 1,
      projection_hash: first.projectionHash,
      debt_assets: "2000"
    });
    assert.equal(durable.receipt.rowCount, 1);
    assert.equal(durable.receipt.rows[0].effect_hash, effect.effectHash);
    assert.equal(durable.receipt.rows[0].credit_state_authorizing, false);
    assert.equal(durable.receipt.rows[0].automatic_limit_change, false);
    assert.equal(durable.evidence.rows[0].count, 1);
    assert.equal(durable.ledger.rows[0].count, 1);

    const workspaceRepository = new PostgresCoreRepository({
      pool: appPool,
      eventRepository: new PostgresEventRepository({ pool: appPool, tenantContext: CONTEXT })
    });
    const productSurfaces = await withContext(appPool, CONTEXT, async (client) => {
      const workspace = await readOwnSecuredPoolQueryHandler().execute({
        client,
        coreRepository: workspaceRepository,
        resource: { resourceType: "subject", resourceId: SUBJECT_ID },
        payload: {},
        now: new Date("2026-08-23T01:15:00.000Z")
      });
      const review = await reviewSecuredPoolActionQueryHandler().execute({
        client,
        coreRepository: workspaceRepository,
        resource: { resourceType: "subject", resourceId: SUBJECT_ID },
        payload: { actionType: "borrow", amountAssets: "1000" },
        now: new Date("2026-08-23T01:15:00.000Z")
      });
      const risk = await readSecuredPoolRiskQueryHandler().execute({
        client,
        authorizationDecision: {
          resourceType: "risk_portfolio",
          resourceId: "risk_portfolio_m2a007"
        },
        payload: {},
        now: new Date("2026-08-23T01:15:00.000Z")
      });
      return { workspace, review, risk };
    });
    assert.equal(productSurfaces.workspace.market.status, "local_synthetic_indexed");
    assert.equal(productSurfaces.workspace.position.debtAssets, "2000");
    assert.equal(productSurfaces.workspace.accountBindingAvailable, true);
    assert.equal(JSON.stringify(productSurfaces.workspace).includes(ACCOUNT), false);
    assert.equal(productSurfaces.review.submittable, false);
    assert.equal(productSurfaces.review.transactionState, "not_submitted");
    assert.equal(productSurfaces.risk.positionCount, 2);
    assert.equal(productSurfaces.risk.controls.liquidationSubmissionAvailable, false);

    const restarted = new PoolObligationIntegrationService({ pool: appPool, tenantContext: CONTEXT });
    const replayed = await restarted.importFinalizedEffect({
      poolObligationBindingId: bound.poolObligationBindingId,
      effectHash: effect.effectHash
    });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.projectionHash, first.projectionHash);

    const repaymentEffect = await seedFinalizedRepayment(indexer);
    const repaid = await restarted.importFinalizedEffect({
      poolObligationBindingId: bound.poolObligationBindingId,
      effectHash: repaymentEffect.effectHash
    });
    assert.equal(repaid.replayed, false);
    assert.equal(repaid.creditStateCandidate, true);
    assert.equal(repaid.ledgerTransactionIds.length, 1);
    const terminal = await withContext(appPool, CONTEXT, async (client) => {
      const obligation = await client.query(
        `SELECT status, outstanding_minor::text, total_repaid_minor::text
           FROM obligations WHERE id = $1`,
        [OBLIGATION_ID]
      );
      const installment = await client.query(
        `SELECT paid_principal_minor::text, status
           FROM obligation_installments WHERE obligation_id = $1`,
        [OBLIGATION_ID]
      );
      return { obligation: obligation.rows[0], installment: installment.rows[0] };
    });
    assert.deepEqual(terminal.obligation, {
      status: "fully_repaid",
      outstanding_minor: "0",
      total_repaid_minor: "2000"
    });
    assert.deepEqual(terminal.installment, {
      paid_principal_minor: "2000",
      status: "paid"
    });

    const outcomeMaterializer = new PostgresCreditOutcomeMaterializer({
      eventRepository: new PostgresEventRepository({ pool: appPool, tenantContext: CONTEXT }),
      clock: () => new Date("2026-08-23T01:20:00.000Z")
    });
    const materialized = await outcomeMaterializer.run();
    assert.equal(materialized.candidateCount, 1);
    assert.equal(materialized.materializedCount, 1);
    assert.equal(materialized.creditStateProjectionCount, 1);
    const creditState = await withContext(appPool, CONTEXT, (client) => client.query(
      "SELECT projection FROM credit_state_projections WHERE subject_id = $1",
      [SUBJECT_ID]
    ));
    assert.equal(creditState.rowCount, 1);
    assert.equal(creditState.rows[0].projection.authorizing, false);
    assert.equal(creditState.rows[0].projection.automaticLimitChange, false);
    assert.equal(creditState.rows[0].projection.scoreAuthoritative, false);
    assert.equal(creditState.rows[0].projection.productionFundsMoved, false);

    const hidden = await withContext(appPool, OTHER_CONTEXT, async (client) => [
      await client.query("SELECT * FROM pool_obligation_bindings"),
      await client.query("SELECT * FROM pool_obligation_projections"),
      await client.query("SELECT * FROM pool_obligation_effect_receipts")
    ]);
    assert.deepEqual(hidden.map(({ rowCount }) => rowCount), [0, 0, 0]);
  } finally {
    await appPool?.end();
    const role = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
    if (role.rowCount > 0) {
      await ownerPool.query(`DROP OWNED BY ${appRole}`);
      await ownerPool.query(`DROP ROLE ${appRole}`);
    }
    await ownerPool.end();
  }
});
