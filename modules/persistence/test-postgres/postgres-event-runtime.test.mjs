import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountPurpose,
  CreditLineStatus,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerNormalSide,
  LockboxStatus,
  MandateCapability,
  MandateStatus,
  ObligationStatus,
  PrincipalType,
  RiskAction,
  SettlementFinality,
  SettlementOutcome,
  SubjectStatus,
  SubjectType,
  TransferDirection,
  createAccountBinding,
  createAdminAction,
  createCreditLine,
  createCreditEvent,
  createLedgerAccount,
  createLedgerEntry,
  createLedgerTransaction,
  createLockbox,
  createMandate,
  createObligation,
  createPrincipal,
  createProvider,
  createRiskDecision,
  createSpendPolicy,
  createSpendRequest,
  createSubject,
  createWalletAccount,
  hashId
} from "../../../packages/domain/src/index.js";
import { RailService, SandboxRailAdapter } from "../../rail/src/index.js";
import { migrateDown, migrateUp, migrationStatus } from "../../../scripts/migrate.mjs";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  PostgresReconciliationService,
  assertTenantDatabaseRole,
  createTenantSecurityContext,
  createPostgresPool,
  setTenantTransactionContext
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const FIXED_NOW = new Date("2026-07-11T00:00:00.000Z");
const ASSET = { assetId: "asset:demo-usd", scale: 2 };
const PROVIDER_ACCOUNT = "eip155:8453:0x3333333333333333333333333333333333333333";
const TENANT_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_local_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});
const TENANT_TWO_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_test_two",
  actorId: "actor_tenant_two_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});
const TENANT_OWNED_TABLES = [
  "access_grants",
  "account_bindings",
  "admin_actions",
  "aggregate_stream_heads",
  "behavioral_metrics",
  "command_events",
  "command_idempotency",
  "credit_events",
  "credit_learning_events",
  "credit_lines",
  "credit_profiles",
  "domain_events",
  "evidence_envelopes",
  "inbox_messages",
  "ledger_accounts",
  "ledger_entries",
  "ledger_transactions",
  "lockboxes",
  "mandate_releases",
  "mandate_reservations",
  "mandates",
  "memberships",
  "obligations",
  "outbox_messages",
  "principals",
  "projection_registry",
  "projection_replay_jobs",
  "projection_snapshots",
  "providers",
  "reconciliation_discrepancies",
  "reconciliation_runs",
  "repayment_events",
  "reputation_signals",
  "risk_decisions",
  "settlement_receipts",
  "spend_policies",
  "spend_requests",
  "subjects",
  "transfer_intents",
  "transfer_quotes"
];

async function withTenantTransaction(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original test failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

function createTestEvent({ eventType = "integration_test_event", subjectId = "subject_pg_test", payload = {}, now = FIXED_NOW } = {}) {
  return createCreditEvent({ eventType, subjectId, payload, now });
}

async function resetRuntime(pool) {
  await pool.query(`
    TRUNCATE TABLE
      outbox_messages,
      inbox_messages,
      command_idempotency,
      domain_events,
      aggregate_stream_heads,
      evidence_envelopes,
      credit_events
    RESTART IDENTITY CASCADE
  `);
}

async function runtimeCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM command_idempotency) AS commands,
      (SELECT count(*)::int FROM domain_events) AS events,
      (SELECT count(*)::int FROM evidence_envelopes) AS evidence,
      (SELECT count(*)::int FROM credit_events) AS credit_events,
      (SELECT count(*)::int FROM outbox_messages) AS outbox,
      (SELECT count(*)::int FROM aggregate_stream_heads) AS stream_heads
  `);
  return result.rows[0];
}

async function resetCoreRuntime(pool) {
  await pool.query(`
    TRUNCATE TABLE
      projection_replay_jobs,
      reconciliation_discrepancies,
      reconciliation_runs,
      projection_registry,
      projection_snapshots,
      command_events,
      risk_decisions,
      admin_actions,
      repayment_events,
      obligations,
      credit_lines,
      lockboxes,
      ledger_entries,
      ledger_transactions,
      ledger_accounts,
      spend_requests,
      spend_policies,
      providers,
      account_bindings,
      mandates,
      subjects,
      principals,
      outbox_messages,
      inbox_messages,
      command_idempotency,
      domain_events,
      aggregate_stream_heads,
      evidence_envelopes,
      credit_events
    RESTART IDENTITY CASCADE
  `);
}

function buildCoreFixture() {
  const now = FIXED_NOW;
  const principal = createPrincipal({ principalType: PrincipalType.DEVELOPER, jurisdiction: "US", now });
  const subject = {
    ...createSubject({
      subjectType: SubjectType.AGENT,
      primaryPrincipalId: principal.principalId,
      displayName: "Durable Pilot Agent",
      now
    }),
    status: SubjectStatus.ACTIVE
  };
  const walletAccount = createWalletAccount({
    accountId: "eip155:8453:0x1111111111111111111111111111111111111111",
    purpose: AccountPurpose.EXECUTION,
    verificationMethod: "verified_signature",
    now
  });
  const accountBinding = createAccountBinding({
    subjectId: subject.subjectId,
    account: walletAccount,
    signatureHash: hashId("signature", { fixture: "durable-account-binding" }),
    nonce: "durable-account-binding-1",
    now
  });
  const provider = createProvider({
    name: "Durable Compute Provider",
    settlementAccountId: PROVIDER_ACCOUNT,
    riskTier: "tier_1",
    now
  });
  const mandate = {
    ...createMandate({
      principalId: principal.principalId,
      subjectId: subject.subjectId,
      capabilities: Object.values(MandateCapability),
      allowedProviderIds: [provider.providerId],
      allowedCategories: ["compute"],
      assetIds: [ASSET.assetId],
      perActionLimitMinor: "100000",
      aggregateLimitMinor: "500000",
      validFrom: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400_000).toISOString(),
      nonce: "durable-mandate-1",
      termsRef: "urn:ipo.one:test:durable-mandate:v1",
      now
    }),
    status: MandateStatus.ACTIVE
  };
  const spendPolicy = createSpendPolicy({
    subjectId: subject.subjectId,
    providerId: provider.providerId,
    assetId: ASSET.assetId,
    perTxLimitMinor: "100000",
    dailyLimitMinor: "250000",
    obligationCapMinor: "100000",
    category: "compute",
    now
  });
  const spendRequest = {
    ...createSpendRequest({
      subjectId: subject.subjectId,
      mandateId: mandate.mandateId,
      providerId: provider.providerId,
      spendPolicyId: spendPolicy.spendPolicyId,
      assetId: ASSET.assetId,
      amountMinor: "10000",
      purposeCode: "compute",
      now
    }),
    status: "approved"
  };
  mandate.utilizedMinor = spendRequest.amountMinor;
  spendPolicy.dailySpentMinor = spendRequest.amountMinor;
  const reservation = {
    reservationId: spendRequest.spendRequestId,
    reservationHash: hashId("mandate_reservation", {
      mandateId: mandate.mandateId,
      reservationId: spendRequest.spendRequestId,
      subjectId: subject.subjectId,
      capability: MandateCapability.PROVIDER_SPEND,
      providerId: provider.providerId,
      category: "compute",
      assetId: ASSET.assetId,
      amountMinor: spendRequest.amountMinor
    }),
    mandateId: mandate.mandateId,
    subjectId: subject.subjectId,
    capability: MandateCapability.PROVIDER_SPEND,
    providerId: provider.providerId,
    category: "compute",
    assetId: ASSET.assetId,
    amountMinor: spendRequest.amountMinor,
    releasedMinor: "0",
    createdAt: now.toISOString(),
    schemaVersion: "mandate_reservation.v1"
  };
  const baseLockbox = createLockbox({
    subjectId: subject.subjectId,
    chainId: "eip155:8453",
    assetId: ASSET.assetId,
    accountId: "eip155:8453:0x2222222222222222222222222222222222222222",
    now
  });
  const lockboxAccount = createLedgerAccount({
    ownerType: "lockbox",
    ownerId: baseLockbox.lockboxId,
    assetId: ASSET.assetId,
    accountType: LedgerAccountType.LOCKBOX_ASSET,
    normalSide: LedgerNormalSide.DEBIT,
    now
  });
  const revenueAccount = createLedgerAccount({
    ownerType: "system",
    ownerId: "external_revenue",
    assetId: ASSET.assetId,
    accountType: LedgerAccountType.EXTERNAL_REVENUE,
    normalSide: LedgerNormalSide.CREDIT,
    now
  });
  const repaymentAccount = createLedgerAccount({
    ownerType: "system",
    ownerId: "repayment_clearing",
    assetId: ASSET.assetId,
    accountType: LedgerAccountType.REPAYMENT_CLEARING,
    normalSide: LedgerNormalSide.DEBIT,
    now
  });
  const lockbox = {
    ...baseLockbox,
    status: LockboxStatus.ACTIVE,
    ledgerAccountId: lockboxAccount.ledgerAccountId,
    revenueLedgerAccountId: revenueAccount.ledgerAccountId,
    repaymentLedgerAccountId: repaymentAccount.ledgerAccountId
  };
  const normalizedEntries = [
    { ledgerAccountId: lockboxAccount.ledgerAccountId, direction: LedgerEntryDirection.DEBIT, amountMinor: "10000", sequence: 0 },
    { ledgerAccountId: revenueAccount.ledgerAccountId, direction: LedgerEntryDirection.CREDIT, amountMinor: "10000", sequence: 1 }
  ];
  const ledgerTransaction = createLedgerTransaction({
    idempotencyKey: "durable-ledger-capture-1",
    transactionType: "lockbox_revenue_capture",
    assetId: ASSET.assetId,
    referenceType: "lockbox",
    referenceId: lockbox.lockboxId,
    metadata: { source: "postgres_test" },
    normalizedEntries,
    debitTotalMinor: "10000",
    creditTotalMinor: "10000",
    now
  });
  ledgerTransaction.entries = normalizedEntries.map((entry) =>
    createLedgerEntry({
      ledgerTransactionId: ledgerTransaction.ledgerTransactionId,
      ledgerAccountId: entry.ledgerAccountId,
      direction: entry.direction,
      amountMinor: entry.amountMinor,
      sequence: entry.sequence,
      now
    })
  );
  const riskDecision = createRiskDecision({
    subjectId: subject.subjectId,
    mandateId: mandate.mandateId,
    assetId: ASSET.assetId,
    status: CreditLineStatus.APPROVED,
    limitMinor: "500000",
    action: RiskAction.NONE,
    reasons: [{ code: "approved_by_rules_v0", message: "test fixture" }],
    now
  });
  const creditLine = createCreditLine({
    subjectId: subject.subjectId,
    mandateId: mandate.mandateId,
    assetId: ASSET.assetId,
    limitMinor: "500000",
    utilizedMinor: spendRequest.amountMinor,
    riskSnapshotId: riskDecision.riskDecisionId,
    now
  });
  const obligation = {
    ...createObligation({
      subjectId: subject.subjectId,
      principalId: principal.principalId,
      mandateId: mandate.mandateId,
      assetId: ASSET.assetId,
      amountMinor: "10000",
      dueAt: new Date(now.getTime() + 86400_000).toISOString(),
      spendPolicyId: spendPolicy.spendPolicyId,
      cashflowRouteId: `route_${lockbox.lockboxId}`,
      nonce: spendRequest.spendRequestId,
      now
    }),
    status: ObligationStatus.ACTIVE
  };
  const adminAction = createAdminAction({
    adminId: "system:test",
    actionType: "pilot_fixture_created",
    targetType: "subject",
    targetId: subject.subjectId,
    reason: "postgres durability verification",
    now
  });

  const events = [
    {
      aggregateType: "principal",
      aggregateId: principal.principalId,
      expectedVersion: 0,
      event: createTestEvent({
        eventType: "principal_created",
        payload: { principalId: principal.principalId },
        now
      })
    },
    {
      aggregateType: "subject",
      aggregateId: subject.subjectId,
      expectedVersion: 0,
      event: createTestEvent({
        eventType: "subject_created",
        subjectId: subject.subjectId,
        payload: { subjectId: subject.subjectId, principalId: principal.principalId },
        now
      })
    },
    {
      aggregateType: "subject",
      aggregateId: subject.subjectId,
      expectedVersion: 1,
      event: createTestEvent({
        eventType: "pilot_control_plane_initialized",
        subjectId: subject.subjectId,
        payload: { subjectId: subject.subjectId, lockboxId: lockbox.lockboxId },
        now
      })
    }
  ];
  const sourceEventId = events[2].event.eventId;
  const writes = [
    { type: CoreProjectionType.PRINCIPAL, value: principal, eventId: events[0].event.eventId },
    { type: CoreProjectionType.SUBJECT, value: subject, eventId: events[1].event.eventId },
    { type: CoreProjectionType.ACCOUNT_BINDING, value: accountBinding, eventId: sourceEventId },
    { type: CoreProjectionType.PROVIDER, value: provider, eventId: sourceEventId },
    { type: CoreProjectionType.MANDATE, value: mandate, eventId: sourceEventId },
    { type: CoreProjectionType.MANDATE_RESERVATION, value: reservation, eventId: sourceEventId },
    { type: CoreProjectionType.SPEND_POLICY, value: spendPolicy, eventId: sourceEventId },
    { type: CoreProjectionType.SPEND_REQUEST, value: spendRequest, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_ACCOUNT, value: lockboxAccount, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_ACCOUNT, value: revenueAccount, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_ACCOUNT, value: repaymentAccount, eventId: sourceEventId },
    { type: CoreProjectionType.LOCKBOX, value: lockbox, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_TRANSACTION, value: ledgerTransaction, eventId: sourceEventId },
    { type: CoreProjectionType.RISK_DECISION, value: riskDecision, eventId: sourceEventId },
    { type: CoreProjectionType.CREDIT_LINE, value: creditLine, eventId: sourceEventId },
    { type: CoreProjectionType.OBLIGATION, value: obligation, eventId: sourceEventId },
    { type: CoreProjectionType.ADMIN_ACTION, value: adminAction, eventId: sourceEventId }
  ];
  return {
    principal,
    subject,
    accountBinding,
    provider,
    mandate,
    reservation,
    spendPolicy,
    spendRequest,
    lockbox,
    ledgerTransaction,
    riskDecision,
    creditLine,
    obligation,
    adminAction,
    events,
    writes
  };
}

test("PostgreSQL event runtime proves atomicity, recovery, and replay", { timeout: 60_000 }, async (t) => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL must be provided by scripts/run-postgres-tests.mjs");
  const pool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 8,
    applicationName: "ipo-one-postgres-integration"
  });

  try {
    await t.test("migrations run up, down, and up with recorded checksums", async () => {
      const initialStatus = await migrationStatus({ pool });
      const appliedCount = initialStatus.filter((migration) => migration.applied).length;
      if (appliedCount > 0) await migrateDown({ pool, steps: appliedCount });

      assert.deepEqual(await migrateUp({ pool }), [
        "0001_mvp_foundation",
        "0002_event_runtime",
        "0003_core_aggregate_persistence",
        "0004_reconciliation_runtime",
        "0005_tenant_isolation_rls"
      ]);
      const firstStatus = await migrationStatus({ pool });
      assert.equal(firstStatus.every((migration) => migration.applied && migration.checksum.length === 64), true);

      assert.deepEqual(await migrateDown({ pool, steps: 5 }), [
        "0005_tenant_isolation_rls",
        "0004_reconciliation_runtime",
        "0003_core_aggregate_persistence",
        "0002_event_runtime",
        "0001_mvp_foundation"
      ]);
      assert.deepEqual(await migrateUp({ pool }), [
        "0001_mvp_foundation",
        "0002_event_runtime",
        "0003_core_aggregate_persistence",
        "0004_reconciliation_runtime",
        "0005_tenant_isolation_rls"
      ]);

      assert.deepEqual(await migrateDown({ pool, steps: 3 }), [
        "0005_tenant_isolation_rls",
        "0004_reconciliation_runtime",
        "0003_core_aggregate_persistence"
      ]);
      await pool.query(
        `INSERT INTO principals(id, principal_hash, principal_type, jurisdiction, status, created_at)
         VALUES ('principal_legacy_upgrade', 'hash_principal_legacy_upgrade', 'developer', 'US', 'active', $1)`,
        [FIXED_NOW.toISOString()]
      );
      await pool.query(
        `INSERT INTO subjects(id, subject_hash, subject_type, status, display_name, created_at, updated_at)
         VALUES (
           'subject_legacy_upgrade', 'hash_subject_legacy_upgrade', 'agent', 'active',
           'Legacy Upgrade Fixture', $1, $1
         )`,
        [FIXED_NOW.toISOString()]
      );
      assert.deepEqual(await migrateUp({ pool }), [
        "0003_core_aggregate_persistence",
        "0004_reconciliation_runtime",
        "0005_tenant_isolation_rls"
      ]);
      assert.equal(
        (await pool.query("SELECT primary_principal_id FROM subjects WHERE id = 'subject_legacy_upgrade'"))
          .rows[0].primary_principal_id,
        null
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at
             ) VALUES (
               'subject_missing_principal', 'hash_subject_missing_principal', 'agent',
               'active', 'Invalid New Subject', NULL, $1, $1
             )`,
            [FIXED_NOW.toISOString()]
          )),
        (error) => error.code === "23514"
      );
      await pool.query("TRUNCATE TABLE principals RESTART IDENTITY CASCADE");
    });

    await t.test("tenant context, RLS, role posture, and pooled reuse fail closed", async () => {
      const appRole = "ipo_one_app_test";
      const dropAppRole = async () => {
        const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${appRole}`);
        await pool.query(`DROP ROLE ${appRole}`);
      };
      await dropAppRole();
      const tenantTableCoverage = await pool.query(`
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced,
          EXISTS (
            SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
          ) AS has_policy,
          EXISTS (
            SELECT 1
              FROM pg_trigger t
             WHERE t.tgrelid = c.oid
               AND t.tgname = 'tenant_context_guard_' || c.relname
               AND t.tgenabled = 'O'
               AND NOT t.tgisinternal
          ) AS has_write_guard
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind IN ('r', 'p')
          AND EXISTS (
            SELECT 1
              FROM pg_attribute a
             WHERE a.attrelid = c.oid
               AND a.attname = 'tenant_id'
               AND NOT a.attisdropped
          )
        ORDER BY c.relname
      `);
      assert.deepEqual(
        tenantTableCoverage.rows.map((row) => row.table_name),
        TENANT_OWNED_TABLES
      );
      assert.equal(
        tenantTableCoverage.rows.every((row) =>
          row.rls_enabled && row.rls_forced && row.has_policy && row.has_write_guard
        ),
        true
      );
      const missingTenantForeignKeys = await pool.query(`
        SELECT source.relname AS source_table, original.conname AS constraint_name,
               target.relname AS target_table
          FROM pg_constraint original
          JOIN pg_class source ON source.oid = original.conrelid
          JOIN pg_class target ON target.oid = original.confrelid
         WHERE original.contype = 'f'
           AND EXISTS (
             SELECT 1 FROM pg_attribute source_tenant
              WHERE source_tenant.attrelid = source.oid
                AND source_tenant.attname = 'tenant_id'
                AND NOT source_tenant.attisdropped
           )
           AND EXISTS (
             SELECT 1 FROM pg_attribute target_tenant
              WHERE target_tenant.attrelid = target.oid
                AND target_tenant.attname = 'tenant_id'
                AND NOT target_tenant.attisdropped
           )
           AND NOT EXISTS (
             SELECT 1
               FROM unnest(original.conkey) source_key
               JOIN pg_attribute source_attribute
                 ON source_attribute.attrelid = source.oid
                AND source_attribute.attnum = source_key
              WHERE source_attribute.attname = 'tenant_id'
           )
           AND NOT EXISTS (
             SELECT 1
               FROM pg_constraint tenant_constraint
              WHERE tenant_constraint.contype = 'f'
                AND tenant_constraint.conrelid = original.conrelid
                AND tenant_constraint.confrelid = original.confrelid
                AND original.conkey <@ tenant_constraint.conkey
                AND EXISTS (
                  SELECT 1
                    FROM unnest(tenant_constraint.conkey) tenant_key
                    JOIN pg_attribute tenant_attribute
                      ON tenant_attribute.attrelid = source.oid
                     AND tenant_attribute.attnum = tenant_key
                   WHERE tenant_attribute.attname = 'tenant_id'
                )
           )
         ORDER BY source.relname, original.conname
      `);
      assert.deepEqual(missingTenantForeignKeys.rows, []);
      const unscopedIdempotencyTables = await pool.query(`
        SELECT c.relname AS table_name
          FROM pg_class c
         WHERE c.relkind IN ('r', 'p')
           AND EXISTS (
           SELECT 1 FROM pg_attribute tenant_column
            WHERE tenant_column.attrelid = c.oid
              AND tenant_column.attname = 'tenant_id'
              AND NOT tenant_column.attisdropped
         )
           AND EXISTS (
             SELECT 1 FROM pg_attribute idempotency_column
              WHERE idempotency_column.attrelid = c.oid
                AND idempotency_column.attname = 'idempotency_key'
                AND NOT idempotency_column.attisdropped
           )
           AND NOT EXISTS (
             SELECT 1
               FROM pg_constraint identity_constraint
              WHERE identity_constraint.conrelid = c.oid
                AND identity_constraint.contype IN ('p', 'u')
                AND EXISTS (
                  SELECT 1
                    FROM unnest(identity_constraint.conkey) identity_key
                    JOIN pg_attribute identity_attribute
                      ON identity_attribute.attrelid = c.oid
                     AND identity_attribute.attnum = identity_key
                   WHERE identity_attribute.attname = 'tenant_id'
                )
                AND EXISTS (
                  SELECT 1
                    FROM unnest(identity_constraint.conkey) identity_key
                    JOIN pg_attribute identity_attribute
                      ON identity_attribute.attrelid = c.oid
                     AND identity_attribute.attnum = identity_key
                   WHERE identity_attribute.attname = 'idempotency_key'
                )
           )
         ORDER BY c.relname
      `);
      assert.deepEqual(unscopedIdempotencyTables.rows, []);
      const rootRlsCoverage = await pool.query(`
        SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
               c.relforcerowsecurity AS rls_forced,
               EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_policy
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relname IN ('actors', 'tenants')
         ORDER BY c.relname
      `);
      assert.deepEqual(
        rootRlsCoverage.rows,
        [
          { table_name: "actors", rls_enabled: true, rls_forced: true, has_policy: true },
          { table_name: "tenants", rls_enabled: true, rls_forced: true, has_policy: true }
        ]
      );
      await pool.query(`CREATE ROLE ${appRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           tenants, actors, memberships, access_grants, principals, subjects
         TO ${appRole}`
      );

      const appTransaction = async (context, operation, { includeContext = true } = {}) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${appRole}`);
          if (includeContext) await setTenantTransactionContext(client, context);
          const result = await operation(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original test error.
          }
          throw error;
        } finally {
          client.release();
        }
      };

      try {
        await pool.query(
          `INSERT INTO tenants(
             id, tenant_hash, organization_ref, display_name, status,
             pilot_jurisdiction, legal_retention_owner_ref, created_at,
             updated_at, schema_version
           ) VALUES (
             'tenant_ipo_one_test_two', 'tenant_hash_test_two',
             'org:test-two', 'Tenant Two', 'active', 'US', 'org:test-two',
             $1, $1, 'tenant.v1'
           ) ON CONFLICT (id) DO NOTHING`,
          [FIXED_NOW.toISOString()]
        );
        await pool.query(
          `INSERT INTO actors(
             id, actor_hash, actor_type, status, created_at, updated_at,
             schema_version
           ) VALUES (
             'actor_tenant_two_system', 'actor_hash_tenant_two_system',
             'system_worker', 'active', $1, $1, 'actor.v1'
           ) ON CONFLICT (id) DO NOTHING`,
          [FIXED_NOW.toISOString()]
        );
        await withTenantTransaction(pool, TENANT_TWO_CONTEXT, (client) => client.query(
          `INSERT INTO memberships(
             id, membership_hash, tenant_id, actor_id, role_bundle,
             capabilities, status, valid_from, created_at, updated_at,
             schema_version
           ) VALUES (
             'membership_tenant_two_system', 'membership_hash_tenant_two_system',
             'tenant_ipo_one_test_two', 'actor_tenant_two_system',
             'system_worker', '["local_non_funds_repository"]'::jsonb,
             'active', $1, $1, $1, 'membership.v1'
           ) ON CONFLICT (id) DO NOTHING`,
          [FIXED_NOW.toISOString()]
        ));

        const seedTenant = (context, suffix) => withTenantTransaction(pool, context, async (client) => {
          await client.query(
            `INSERT INTO principals(
               id, principal_hash, principal_type, jurisdiction, status,
               created_at
             ) VALUES ($1, $2, 'developer', 'US', 'active', $3)`,
            [`principal_rls_${suffix}`, `principal_hash_rls_${suffix}`, FIXED_NOW.toISOString()]
          );
          await client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at
             ) VALUES ($1, $2, 'agent', 'active', $3, $4, $5, $5)`,
            [
              `subject_rls_${suffix}`,
              `subject_hash_rls_${suffix}`,
              `Tenant ${suffix} Agent`,
              `principal_rls_${suffix}`,
              FIXED_NOW.toISOString()
            ]
          );
        });
        await seedTenant(TENANT_CONTEXT, "one");
        await seedTenant(TENANT_TWO_CONTEXT, "two");

        const roleProof = await appTransaction(TENANT_CONTEXT, (client) => assertTenantDatabaseRole(client));
        assert.equal(roleProof.roleName, appRole);

        const tenantOneRows = await appTransaction(TENANT_CONTEXT, (client) =>
          client.query("SELECT id, tenant_id FROM subjects ORDER BY id")
        );
        assert.deepEqual(tenantOneRows.rows, [{
          id: "subject_rls_one",
          tenant_id: TENANT_CONTEXT.tenantId
        }]);
        const hiddenTenantTwo = await appTransaction(TENANT_CONTEXT, (client) =>
          client.query("SELECT id FROM subjects WHERE id = 'subject_rls_two'")
        );
        assert.equal(hiddenTenantTwo.rowCount, 0);

        const tenantTwoRows = await appTransaction(TENANT_TWO_CONTEXT, (client) =>
          client.query("SELECT id, tenant_id FROM subjects ORDER BY id")
        );
        assert.deepEqual(tenantTwoRows.rows, [{
          id: "subject_rls_two",
          tenant_id: TENANT_TWO_CONTEXT.tenantId
        }]);

        await assert.rejects(
          () => appTransaction(TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at, tenant_id
             ) VALUES (
               'subject_cross_tenant_explicit', 'subject_hash_cross_explicit',
               'agent', 'active', 'Cross Tenant Explicit', 'principal_rls_two',
               $1, $1, 'tenant_ipo_one_test_two'
             )`,
            [FIXED_NOW.toISOString()]
          )),
          (error) => error.code === "42501"
        );

        await assert.rejects(
          () => appTransaction(TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at
             ) VALUES (
               'subject_cross_tenant_fk', 'subject_hash_cross_fk', 'agent',
               'active', 'Cross Tenant FK', 'principal_rls_two', $1, $1
             )`,
            [FIXED_NOW.toISOString()]
          )),
          (error) => error.code === "23503"
        );

        await assert.rejects(
          () => appTransaction(TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO principals(
               id, principal_hash, principal_type, jurisdiction, status,
               created_at
             ) VALUES (
               'principal_missing_context', 'principal_hash_missing_context',
               'developer', 'US', 'active', $1
             )`,
            [FIXED_NOW.toISOString()]
          ), { includeContext: false }),
          (error) => error.code === "42501"
        );

        const pooledClient = await pool.connect();
        try {
          await pooledClient.query("BEGIN");
          await pooledClient.query(`SET LOCAL ROLE ${appRole}`);
          await setTenantTransactionContext(pooledClient, TENANT_CONTEXT);
          assert.equal(
            (await pooledClient.query("SELECT count(*)::int AS count FROM subjects")).rows[0].count,
            1
          );
          await pooledClient.query("COMMIT");

          await pooledClient.query("BEGIN");
          await pooledClient.query(`SET LOCAL ROLE ${appRole}`);
          assert.equal(
            (await pooledClient.query("SELECT count(*)::int AS count FROM subjects")).rows[0].count,
            0
          );
          await pooledClient.query("ROLLBACK");
        } finally {
          pooledClient.release();
        }
      } finally {
        await pool.query("TRUNCATE TABLE principals RESTART IDENTITY CASCADE");
        await dropAppRole();
      }
    });

    await t.test("two tenants can reuse stream and idempotency identities without coupling", async () => {
      await resetRuntime(pool);
      const appRole = "ipo_one_runtime_tenant_test";
      const dropAppRole = async () => {
        const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${appRole}`);
        await pool.query(`DROP ROLE ${appRole}`);
      };
      await dropAppRole();
      await pool.query(
        `CREATE ROLE ${appRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           aggregate_stream_heads, domain_events, command_idempotency,
           outbox_messages, inbox_messages, evidence_envelopes, credit_events,
           command_events
         TO ${appRole}`
      );
      const appConnection = new URL(CONNECTION_STRING);
      appConnection.username = appRole;
      appConnection.password = "";
      const appPool = createPostgresPool({
        connectionString: appConnection.toString(),
        max: 4,
        applicationName: "ipo-one-runtime-tenant-test"
      });

      try {
        await assertTenantDatabaseRole(appPool);
        const tenantOneRepository = new PostgresEventRepository({
          pool: appPool,
          tenantContext: TENANT_CONTEXT
        });
        const tenantTwoRepository = new PostgresEventRepository({
          pool: appPool,
          tenantContext: TENANT_TWO_CONTEXT
        });
        const sharedIdentity = {
          aggregateType: "tenant_scoped_aggregate",
          aggregateId: "shared_aggregate_id",
          expectedVersion: 0,
          idempotencyKey: "shared_idempotency_key",
          commandHash: hashId("integration_command", { operation: "tenant-scoped" })
        };
        const tenantOneCommand = {
          ...sharedIdentity,
          event: createTestEvent({
            subjectId: "subject_tenant_one_event",
            payload: { tenant: "one" }
          })
        };
        const tenantTwoCommand = {
          ...sharedIdentity,
          event: createTestEvent({
            subjectId: "subject_tenant_two_event",
            payload: { tenant: "two" }
          })
        };

        const [tenantOneCommit, tenantTwoCommit] = await Promise.all([
          tenantOneRepository.appendCommand(tenantOneCommand),
          tenantTwoRepository.appendCommand(tenantTwoCommand)
        ]);

        assert.equal(tenantOneCommit.replayed, false);
        assert.equal(tenantTwoCommit.replayed, false);
        assert.notEqual(tenantOneCommit.event.eventId, tenantTwoCommit.event.eventId);
        assert.deepEqual(
          (await tenantOneRepository.listEvents(sharedIdentity)).map((event) => event.eventId),
          [tenantOneCommit.event.eventId]
        );
        assert.deepEqual(
          (await tenantTwoRepository.listEvents(sharedIdentity)).map((event) => event.eventId),
          [tenantTwoCommit.event.eventId]
        );
        assert.equal(await tenantOneRepository.getStreamVersion(sharedIdentity), 1);
        assert.equal(await tenantTwoRepository.getStreamVersion(sharedIdentity), 1);

        const tenantOneReplay = await tenantOneRepository.appendCommand(tenantOneCommand);
        assert.equal(tenantOneReplay.replayed, true);
        assert.equal(tenantOneReplay.event.eventId, tenantOneCommit.event.eventId);
        assert.deepEqual(await runtimeCounts(pool), {
          commands: 2,
          events: 2,
          evidence: 2,
          credit_events: 2,
          outbox: 2,
          stream_heads: 2
        });
      } finally {
        await appPool.end();
        await dropAppRole();
      }
    });

    await t.test("an injected crash rolls back command, event, Evidence, outbox, and stream head", async () => {
      await resetRuntime(pool);
      const event = createTestEvent({ payload: { operation: "atomic-crash-test" } });
      const input = {
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_crash",
        expectedVersion: 0,
        idempotencyKey: "command-crash-1",
        commandHash: hashId("integration_command", { operation: "atomic-crash-test" }),
        event
      };
      const crashingRepository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        faultInjector: ({ stage }) => {
          if (stage === "after_event_inserted") throw new Error("injected process crash");
        }
      });

      await assert.rejects(() => crashingRepository.appendCommand(input), /injected process crash/);
      assert.deepEqual(await runtimeCounts(pool), {
        commands: 0,
        events: 0,
        evidence: 0,
        credit_events: 0,
        outbox: 0,
        stream_heads: 0
      });

      const repository = new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT });
      const committed = await repository.appendCommand(input);
      assert.equal(committed.replayed, false);
      assert.deepEqual(await runtimeCounts(pool), {
        commands: 1,
        events: 1,
        evidence: 1,
        credit_events: 1,
        outbox: 1,
        stream_heads: 1
      });
      assert.equal(await repository.getStreamVersion(input), 1);
    });

    await t.test("command replay is stable and conflicting idempotency reuse fails closed", async () => {
      await resetRuntime(pool);
      const repository = new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT });
      const command = {
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_idempotency",
        expectedVersion: 0,
        idempotencyKey: "command-idempotency-1",
        commandHash: hashId("integration_command", { value: 1 }),
        event: createTestEvent({ payload: { value: 1 } })
      };

      const first = await repository.appendCommand(command);
      const replay = await repository.appendCommand(command);
      assert.equal(replay.replayed, true);
      assert.equal(replay.event.eventId, first.event.eventId);
      assert.equal((await repository.listEvents({ aggregateId: command.aggregateId })).length, 1);

      await assert.rejects(
        () => repository.appendCommand({ ...command, commandHash: hashId("integration_command", { value: 2 }) }),
        (error) => error.code === "event_idempotency_conflict"
      );
      assert.equal((await repository.listOutbox()).length, 1);
    });

    await t.test("concurrent writers with one expected version produce one winner", async () => {
      await resetRuntime(pool);
      const repository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        transactionRetries: 5
      });
      const aggregate = { aggregateType: "integration_aggregate", aggregateId: "aggregate_race" };
      await repository.appendCommand({
        ...aggregate,
        expectedVersion: 0,
        idempotencyKey: "race-seed",
        commandHash: hashId("integration_command", { race: "seed" }),
        event: createTestEvent({ payload: { race: "seed" } })
      });

      const attempts = ["left", "right"].map((side) =>
        repository.appendCommand({
          ...aggregate,
          expectedVersion: 1,
          idempotencyKey: `race-${side}`,
          commandHash: hashId("integration_command", { race: side }),
          event: createTestEvent({ payload: { race: side } })
        })
      );
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.equal(rejected.reason.code, "stale_aggregate_version");
      assert.equal(await repository.getStreamVersion(aggregate), 2);
      assert.equal((await repository.listEvents(aggregate)).length, 2);
      assert.equal((await repository.listOutbox()).length, 2);
    });

    await t.test("outbox leases recover after worker death and terminate at the retry bound", async () => {
      await resetRuntime(pool);
      const repository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        maxOutboxAttempts: 2
      });
      await repository.appendCommand({
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_outbox_dead",
        expectedVersion: 0,
        idempotencyKey: "outbox-dead-1",
        commandHash: hashId("integration_command", { outbox: "dead" }),
        event: createTestEvent({ payload: { outbox: "dead" } })
      });

      const firstClaim = await repository.claimOutboxBatch({ workerId: "worker-dead", limit: 1, leaseMs: 60_000 });
      assert.equal(firstClaim.length, 1);
      assert.equal((await repository.claimOutboxBatch({ workerId: "worker-waiting", limit: 1, leaseMs: 60_000 })).length, 0);

      await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        "UPDATE outbox_messages SET locked_at = clock_timestamp() - interval '2 minutes' WHERE id = $1",
        [firstClaim[0].outboxMessageId]
      ));
      const recovered = await repository.claimOutboxBatch({ workerId: "worker-recovery", limit: 1, leaseMs: 60_000 });
      assert.equal(recovered[0].outboxMessageId, firstClaim[0].outboxMessageId);
      assert.equal(recovered[0].attempts, 2);
      const deadLettered = await repository.markOutboxFailed({
        outboxMessageId: recovered[0].outboxMessageId,
        workerId: "worker-recovery",
        error: new Error("broker unavailable")
      });
      assert.ok(deadLettered.deadLetteredAt);

      await repository.appendCommand({
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_outbox_publish",
        expectedVersion: 0,
        idempotencyKey: "outbox-publish-1",
        commandHash: hashId("integration_command", { outbox: "publish" }),
        event: createTestEvent({ payload: { outbox: "publish" } })
      });
      const publishable = await repository.claimOutboxBatch({ workerId: "worker-publish", limit: 10 });
      assert.equal(publishable.length, 1);
      const published = await repository.markOutboxPublished({
        outboxMessageId: publishable[0].outboxMessageId,
        workerId: "worker-publish"
      });
      assert.ok(published.publishedAt);

      const finalAttemptRepository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        maxOutboxAttempts: 1
      });
      await finalAttemptRepository.appendCommand({
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_outbox_final_crash",
        expectedVersion: 0,
        idempotencyKey: "outbox-final-crash-1",
        commandHash: hashId("integration_command", { outbox: "final-crash" }),
        event: createTestEvent({ payload: { outbox: "final-crash" } })
      });
      const finalClaim = await finalAttemptRepository.claimOutboxBatch({
        workerId: "worker-final-crash",
        limit: 1,
        leaseMs: 60_000
      });
      await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        "UPDATE outbox_messages SET locked_at = clock_timestamp() - interval '2 minutes' WHERE id = $1",
        [finalClaim[0].outboxMessageId]
      ));
      assert.equal(
        (await finalAttemptRepository.claimOutboxBatch({ workerId: "worker-after-final-crash", limit: 1, leaseMs: 60_000 }))
          .length,
        0
      );
      const recoveredFinalAttempt = (await finalAttemptRepository.listOutbox()).find(
        (message) => message.outboxMessageId === finalClaim[0].outboxMessageId
      );
      assert.ok(recoveredFinalAttempt.deadLetteredAt);
      assert.equal(recoveredFinalAttempt.lastError, "delivery lease expired after final attempt");
    });

    await t.test("inbox commits consumer effects once and rolls back interrupted handlers", async () => {
      await resetRuntime(pool);
      await pool.query("DROP TABLE IF EXISTS integration_test_effects");
      await pool.query("CREATE TABLE integration_test_effects(event_id TEXT PRIMARY KEY, value INTEGER NOT NULL)");
      const payload = { operation: "apply", value: 7 };
      const applyEffect = async ({ client, eventId }) => {
        await client.query("INSERT INTO integration_test_effects(event_id, value) VALUES ($1, $2)", [eventId, payload.value]);
        return { applied: true, value: payload.value };
      };

      try {
        const crashingRepository = new PostgresEventRepository({
          pool,
          tenantContext: TENANT_CONTEXT,
          faultInjector: ({ stage }) => {
            if (stage === "before_inbox_complete") throw new Error("injected inbox crash");
          }
        });
        await assert.rejects(
          () => crashingRepository.processInbox({ consumerName: "projection", eventId: "inbox-1", payload, handler: applyEffect }),
          /injected inbox crash/
        );
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM integration_test_effects")).rows[0].count, 0);
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM inbox_messages")).rows[0].count, 0);

        const repository = new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT });
        const first = await repository.processInbox({
          consumerName: "projection",
          eventId: "inbox-1",
          payload,
          handler: applyEffect
        });
        const replay = await repository.processInbox({
          consumerName: "projection",
          eventId: "inbox-1",
          payload,
          handler: () => {
            throw new Error("completed inbox handler must not run again");
          }
        });
        assert.equal(first.replayed, false);
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.result, first.result);
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM integration_test_effects")).rows[0].count, 1);

        await assert.rejects(
          () =>
            repository.processInbox({
              consumerName: "projection",
              eventId: "inbox-1",
              payload: { ...payload, value: 8 },
              handler: applyEffect
            }),
          (error) => error.code === "inbox_payload_conflict"
        );
      } finally {
        await pool.query("DROP TABLE IF EXISTS integration_test_effects");
      }
    });

    await t.test("a multi-event core command rolls back projections after an injected crash", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const command = {
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "core-command-crash-1",
        commandHash: hashId("core_command", { fixture: "durable-pilot-v1" }),
        events: fixture.events,
        writes: fixture.writes,
        response: {
          principalId: fixture.principal.principalId,
          subjectId: fixture.subject.subjectId,
          lockboxId: fixture.lockbox.lockboxId
        }
      };
      const crashingEvents = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        faultInjector: ({ stage }) => {
          if (stage === "after_projection_applied") throw new Error("injected core projection crash");
        }
      });
      const crashingRepository = new PostgresCoreRepository({ pool, eventRepository: crashingEvents });

      await assert.rejects(() => crashingRepository.commitCommand(command), /injected core projection crash/);
      const rolledBack = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM principals) AS principals,
          (SELECT count(*)::int FROM subjects) AS subjects,
          (SELECT count(*)::int FROM ledger_transactions) AS ledger_transactions,
          (SELECT count(*)::int FROM domain_events) AS events,
          (SELECT count(*)::int FROM outbox_messages) AS outbox,
          (SELECT count(*)::int FROM projection_registry) AS projections,
          (SELECT count(*)::int FROM projection_snapshots) AS snapshots,
          (SELECT count(*)::int FROM command_events) AS command_events
      `);
      assert.deepEqual(rolledBack.rows[0], {
        principals: 0,
        subjects: 0,
        ledger_transactions: 0,
        events: 0,
        outbox: 0,
        projections: 0,
        snapshots: 0,
        command_events: 0
      });
    });

    await t.test("core projections survive restart and replay the original command response", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const command = {
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "core-command-durable-1",
        commandHash: hashId("core_command", { fixture: "durable-pilot-v1" }),
        events: fixture.events,
        writes: fixture.writes,
        response: {
          principalId: fixture.principal.principalId,
          subjectId: fixture.subject.subjectId,
          lockboxId: fixture.lockbox.lockboxId
        }
      };

      const firstRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      const committed = await firstRepository.commitCommand(command);
      assert.equal(committed.replayed, false);
      assert.equal(committed.events.length, 3);
      assert.deepEqual(committed.response, command.response);

      const restartedRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      const [principal, subject, accountBinding, mandate, lockbox, ledgerTransaction, obligation, riskDecision, adminAction] =
        await Promise.all([
          restartedRepository.getPrincipal(fixture.principal.principalId),
          restartedRepository.getSubject(fixture.subject.subjectId),
          restartedRepository.getAccountBinding(fixture.accountBinding.accountBindingId),
          restartedRepository.getMandate(fixture.mandate.mandateId),
          restartedRepository.getLockbox(fixture.lockbox.lockboxId),
          restartedRepository.getLedgerTransaction(fixture.ledgerTransaction.ledgerTransactionId),
          restartedRepository.getObligation(fixture.obligation.obligationId),
          restartedRepository.getRiskDecision(fixture.riskDecision.riskDecisionId),
          restartedRepository.getAdminAction(fixture.adminAction.adminActionId)
        ]);
      assert.deepEqual(principal.linkedSubjectIds, [fixture.subject.subjectId]);
      assert.equal(subject.primaryPrincipalId, fixture.principal.principalId);
      assert.deepEqual(subject.linkedAccountIds, [fixture.accountBinding.accountBindingId]);
      assert.equal(accountBinding.verificationMethod, "verified_signature");
      assert.equal(mandate.status, MandateStatus.ACTIVE);
      assert.equal(lockbox.balanceMinor, "10000");
      assert.equal(lockbox.capturedRevenueMinor, "10000");
      assert.equal(ledgerTransaction.entries.length, 2);
      assert.equal(ledgerTransaction.debitTotalMinor, "10000");
      assert.equal(obligation.outstandingPrincipalMinor, "10000");
      assert.equal(riskDecision.riskDecisionId, fixture.riskDecision.riskDecisionId);
      assert.equal(adminAction.reason, fixture.adminAction.reason);

      const registration = await restartedRepository.getProjectionRegistration(
        CoreProjectionType.OBLIGATION,
        fixture.obligation.obligationId
      );
      assert.equal(registration.rootAggregateId, fixture.subject.subjectId);
      assert.equal(registration.lastEventId, fixture.events[2].event.eventId);
      assert.equal(registration.aggregateVersion, 2);
      const projectionProof = await restartedRepository.verifyProjection(
        CoreProjectionType.OBLIGATION,
        fixture.obligation.obligationId
      );
      assert.equal(projectionProof.matches, true);

      const replay = await restartedRepository.commitCommand(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, command.response);
      assert.deepEqual(
        replay.events.map((event) => event.eventId),
        committed.events.map((event) => event.eventId)
      );
      const counts = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM command_idempotency) AS commands,
          (SELECT count(*)::int FROM command_events) AS command_events,
          (SELECT count(*)::int FROM domain_events) AS events,
          (SELECT count(*)::int FROM outbox_messages) AS outbox,
          (SELECT count(*)::int FROM projection_registry) AS projections,
          (SELECT count(*)::int FROM projection_snapshots) AS snapshots
      `);
      assert.deepEqual(counts.rows[0], {
        commands: 1,
        command_events: 3,
        events: 3,
        outbox: 3,
        projections: fixture.writes.length,
        snapshots: fixture.writes.length
      });

      await assert.rejects(
        () =>
          restartedRepository.commitCommand({
            ...command,
            commandHash: hashId("core_command", { fixture: "conflicting-input" })
        }),
        (error) => error.code === "event_idempotency_conflict"
      );

      const conflictingBindingEvent = createTestEvent({
        eventType: "account_binding_changed",
        subjectId: fixture.subject.subjectId,
        payload: { accountBindingId: fixture.accountBinding.accountBindingId },
        now: new Date(FIXED_NOW.getTime() + 1000)
      });
      await assert.rejects(
        () =>
          restartedRepository.commitCommand({
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            idempotencyKey: "core-binding-identity-conflict",
            commandHash: hashId("core_command", { case: "binding_identity_conflict" }),
            events: [
              {
                aggregateType: "subject",
                aggregateId: fixture.subject.subjectId,
                expectedVersion: 2,
                event: conflictingBindingEvent
              }
            ],
            writes: [
              {
                type: CoreProjectionType.ACCOUNT_BINDING,
                value: { ...fixture.accountBinding, purpose: AccountPurpose.PRIMARY },
                eventId: conflictingBindingEvent.eventId
              }
            ],
            response: { changed: true }
          }),
        (error) => error.code === "projection_identity_conflict"
      );
      assert.equal(
        (await restartedRepository.getAccountBinding(fixture.accountBinding.accountBindingId)).purpose,
        AccountPurpose.EXECUTION
      );
    });

    await t.test("core stream races produce one projection winner", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const repository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "core-race-seed",
        commandHash: hashId("core_command", { race: "seed" }),
        events: fixture.events,
        writes: fixture.writes,
        response: { status: fixture.subject.status }
      });

      const attempts = [SubjectStatus.SUSPENDED, SubjectStatus.CLOSED].map((status) => {
        const nextSubject = {
          ...fixture.subject,
          status,
          updatedAt: new Date(FIXED_NOW.getTime() + 1000).toISOString()
        };
        const event = createTestEvent({
          eventType: "subject_status_changed",
          subjectId: fixture.subject.subjectId,
          payload: { subjectId: fixture.subject.subjectId, newStatus: status },
          now: new Date(FIXED_NOW.getTime() + 1000)
        });
        return repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: `core-race-${status}`,
          commandHash: hashId("core_command", { race: status }),
          events: [
            {
              aggregateType: "subject",
              aggregateId: fixture.subject.subjectId,
              expectedVersion: 2,
              event
            }
          ],
          writes: [{ type: CoreProjectionType.SUBJECT, value: nextSubject, eventId: event.eventId }],
          response: { status }
        });
      });
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.equal(rejected.reason.code, "stale_aggregate_version");
      const stored = await repository.getSubject(fixture.subject.subjectId);
      const winner = results.find((result) => result.status === "fulfilled").value.response.status;
      assert.equal(stored.status, winner);
      assert.equal(
        await repository.eventRepository.getStreamVersion({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId
        }),
        3
      );
    });

    await t.test("reconciliation detects drift and approval-gated repair restores a clean state", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const coreRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await coreRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "reconciliation-fixture-1",
        commandHash: hashId("core_command", { reconciliation: "fixture" }),
        events: fixture.events,
        writes: fixture.writes,
        response: { subjectId: fixture.subject.subjectId }
      });
      const reconciliation = new PostgresReconciliationService({
        pool,
        coreRepository,
        eventRepository: coreRepository.eventRepository,
        release: "postgres-test",
        clock: (() => {
          let tick = 0;
          return () => new Date(FIXED_NOW.getTime() + 10_000 + tick++ * 1000);
        })()
      });

      const clean = await reconciliation.run({
        initiatedBy: "system:test-reconciliation",
        idempotencyKey: "reconciliation-clean-1"
      });
      assert.equal(clean.status, "passed", JSON.stringify(await reconciliation.getRun(clean.runId)));
      assert.equal(clean.discrepancyCount, 0);
      const cleanReplay = await reconciliation.run({
        initiatedBy: "system:test-reconciliation",
        idempotencyKey: "reconciliation-clean-1"
      });
      assert.equal(cleanReplay.replayed, true);
      assert.equal(cleanReplay.runId, clean.runId);
      const cleanRun = await reconciliation.getRun(clean.runId);
      assert.equal(cleanRun.discrepancies.length, 0);
      assert.ok(cleanRun.evidenceEventId);

      await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        `UPDATE obligations
            SET outstanding_minor = 9000,
                repaid_amount_minor = 1000,
                updated_at = clock_timestamp()
          WHERE id = $1`,
        [fixture.obligation.obligationId]
      ));
      const drifted = await reconciliation.run({ initiatedBy: "system:test-reconciliation" });
      assert.equal(drifted.status, "failed");
      assert.ok(drifted.criticalCount >= 2);
      const driftedRun = await reconciliation.getRun(drifted.runId);
      const codes = new Set(driftedRun.discrepancies.map((item) => item.checkCode));
      assert.equal(codes.has("projection_hash_mismatch"), true);
      assert.equal(codes.has("obligation_repayment_mismatch"), true);
      assert.equal(codes.has("credit_exposure_mismatch"), true);
      assert.equal(driftedRun.discrepancies.every((item) => item.evidenceEventId), true);

      const plan = await reconciliation.planProjectionReplay({
        entityType: CoreProjectionType.OBLIGATION,
        entityId: fixture.obligation.obligationId,
        requestedBy: "operator:test",
        reason: "restore the verified obligation projection"
      });
      assert.equal(plan.wouldRepair, true);
      assert.equal(plan.snapshotAvailable, true);

      const repaired = await reconciliation.repairProjection({
        entityType: CoreProjectionType.OBLIGATION,
        entityId: fixture.obligation.obligationId,
        approvedBy: "operator:test",
        reason: "restore the verified obligation projection",
        idempotencyKey: "projection-repair-obligation-1"
      });
      assert.equal(repaired.status, "completed");
      assert.ok(repaired.repairEventId);
      const repairReplay = await reconciliation.repairProjection({
        entityType: CoreProjectionType.OBLIGATION,
        entityId: fixture.obligation.obligationId,
        approvedBy: "operator:test",
        reason: "restore the verified obligation projection",
        idempotencyKey: "projection-repair-obligation-1"
      });
      assert.deepEqual(repairReplay, repaired);

      const restored = await coreRepository.getObligation(fixture.obligation.obligationId);
      assert.equal(restored.outstandingPrincipalMinor, fixture.obligation.outstandingPrincipalMinor);
      assert.equal(restored.repaidAmountMinor, fixture.obligation.repaidAmountMinor);
      assert.equal(
        (await coreRepository.verifyProjection(CoreProjectionType.OBLIGATION, fixture.obligation.obligationId)).matches,
        true
      );
      const finalRun = await reconciliation.run({ initiatedBy: "system:test-reconciliation" });
      assert.equal(finalRun.status, "passed");
      assert.equal(finalRun.discrepancyCount, 0);
    });

    await t.test("a fresh Rail Service reconstructs state and idempotency from PostgreSQL", async () => {
      await resetRuntime(pool);
      const state = {
        spendRequest: {
          spendRequestId: "spend_pg_restart_1",
          subjectId: "subject_pg_restart_1",
          mandateId: "mandate_pg_restart_1",
          providerId: "provider_pg_restart_1",
          assetId: ASSET.assetId,
          amountMinor: "10000",
          purposeCode: "compute",
          status: "approved"
        },
        provider: {
          providerId: "provider_pg_restart_1",
          settlementAccountIdRef: PROVIDER_ACCOUNT,
          status: "allowlisted"
        }
      };
      const policyDecisionService = {
        getSpendRequest: () => structuredClone(state.spendRequest),
        getProvider: () => structuredClone(state.provider)
      };
      const authorizationService = { assertAuthorized: () => ({ mandateId: state.spendRequest.mandateId }) };
      const adapter = new SandboxRailAdapter({ sourceAssets: [ASSET] });
      const createRail = () =>
        new RailService({
          eventRepository: new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT }),
          policyDecisionService,
          authorizationService,
          adapters: [adapter]
        });

      const rail = createRail();
      let intent = await rail.createProviderSpendIntent({
        spendRequestId: state.spendRequest.spendRequestId,
        sourceAccountRefHash: hashId("test_source_account", "source_pg_restart_1"),
        direction: TransferDirection.NATIVE,
        idempotencyKey: "pg-restart-intent",
        now: FIXED_NOW
      });
      intent = await rail.quoteTransfer({
        transferIntentId: intent.transferIntentId,
        idempotencyKey: "pg-restart-quote",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });
      intent = await rail.authorizeTransfer({
        transferIntentId: intent.transferIntentId,
        actorRef: "principal_pg_restart_1",
        idempotencyKey: "pg-restart-authorize",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });
      intent = await rail.submitTransfer({
        transferIntentId: intent.transferIntentId,
        idempotencyKey: "pg-restart-submit",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });
      intent = await rail.simulateSettlement({
        transferIntentId: intent.transferIntentId,
        providerEventId: "provider-pg-final-1",
        outcome: SettlementOutcome.SUCCEEDED,
        finality: SettlementFinality.FINALIZED,
        idempotencyKey: "pg-restart-receipt",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });

      const restartedRail = createRail();
      const rebuilt = await restartedRail.getTransferIntent(intent.transferIntentId);
      assert.deepEqual(rebuilt, intent);
      const proof = await restartedRail.getReplayProof(intent.transferIntentId);
      assert.equal(proof.replayable, true);
      assert.equal(proof.eventCount, 5);
      assert.equal((await restartedRail.listSettlementReceipts()).length, 1);
      assert.equal(
        (await new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT }).listOutbox()).length,
        5
      );

      const replay = await restartedRail.simulateSettlement({
        transferIntentId: intent.transferIntentId,
        providerEventId: "provider-pg-final-1",
        outcome: SettlementOutcome.SUCCEEDED,
        finality: SettlementFinality.FINALIZED,
        idempotencyKey: "pg-restart-receipt",
        expectedVersion: 4,
        now: FIXED_NOW
      });
      assert.deepEqual(replay, intent);
      assert.equal(
        (await new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT }).listEvents({
          aggregateId: intent.transferIntentId
        })).length,
        5
      );
    });
  } finally {
    await pool.end();
  }
});
