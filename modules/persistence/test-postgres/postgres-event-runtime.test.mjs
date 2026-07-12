import assert from "node:assert/strict";
import test from "node:test";
import {
  SettlementFinality,
  SettlementOutcome,
  TransferDirection,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import { RailService, SandboxRailAdapter } from "../../rail/src/index.js";
import { migrateDown, migrateUp, migrationStatus } from "../../../scripts/migrate.mjs";
import { PostgresEventRepository, createPostgresPool } from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const FIXED_NOW = new Date("2026-07-11T00:00:00.000Z");
const ASSET = { assetId: "asset:demo-usd", scale: 2 };
const PROVIDER_ACCOUNT = "eip155:8453:0x3333333333333333333333333333333333333333";

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

      assert.deepEqual(await migrateUp({ pool }), ["0001_mvp_foundation", "0002_event_runtime"]);
      const firstStatus = await migrationStatus({ pool });
      assert.equal(firstStatus.every((migration) => migration.applied && migration.checksum.length === 64), true);

      assert.deepEqual(await migrateDown({ pool, steps: 2 }), ["0002_event_runtime", "0001_mvp_foundation"]);
      assert.deepEqual(await migrateUp({ pool }), ["0001_mvp_foundation", "0002_event_runtime"]);
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

      const repository = new PostgresEventRepository({ pool });
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
      const repository = new PostgresEventRepository({ pool });
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
      const repository = new PostgresEventRepository({ pool, transactionRetries: 5 });
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
      const repository = new PostgresEventRepository({ pool, maxOutboxAttempts: 2 });
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

      await pool.query(
        "UPDATE outbox_messages SET locked_at = clock_timestamp() - interval '2 minutes' WHERE id = $1",
        [firstClaim[0].outboxMessageId]
      );
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

      const finalAttemptRepository = new PostgresEventRepository({ pool, maxOutboxAttempts: 1 });
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
      await pool.query(
        "UPDATE outbox_messages SET locked_at = clock_timestamp() - interval '2 minutes' WHERE id = $1",
        [finalClaim[0].outboxMessageId]
      );
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

        const repository = new PostgresEventRepository({ pool });
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
          eventRepository: new PostgresEventRepository({ pool }),
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
      assert.equal((await new PostgresEventRepository({ pool }).listOutbox()).length, 5);

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
      assert.equal((await new PostgresEventRepository({ pool }).listEvents({ aggregateId: intent.transferIntentId })).length, 5);
    });
  } finally {
    await pool.end();
  }
});
