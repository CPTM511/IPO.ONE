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
import { hashId } from "../../../packages/domain/src/index.js";
import {
  SECURED_POOL_V1_EVENT_ABI,
  createSecuredPoolV1Adapter
} from "../../chain-adapter/src/index.js";
import {
  PoolEventIndexer,
  PostgresPoolObservationStore
} from "../../event-indexer/src/index.js";
import {
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const CHAIN_ID = "eip155:84532";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const MARKET = keccak256(stringToHex("ipo.one:m2:postgres-market"));
const ACTOR = "0x2222222222222222222222222222222222222222";
const TENANT_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_local_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});
const OTHER_TENANT_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_test_two",
  actorId: "actor_tenant_two_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});
const adapter = createSecuredPoolV1Adapter({ chainId: CHAIN_ID, contractAddress: CONTRACT, marketId: MARKET });

function pauseLog() {
  const eventName = "NewRiskPauseChanged";
  const args = { marketId: MARKET, paused: true, actor: ACTOR };
  const item = getAbiItem({ abi: SECURED_POOL_V1_EVENT_ABI, name: eventName });
  const indexed = Object.fromEntries(
    item.inputs.filter(({ indexed: isIndexed }) => isIndexed).map(({ name }) => [name, args[name]])
  );
  const dataInputs = item.inputs.filter(({ indexed: isIndexed }) => !isIndexed);
  return {
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    transactionHash: hashId("m2a005_postgres_tx", "pause"),
    transactionIndex: 0,
    logIndex: 0,
    blockNumber: "700",
    blockHash: hashId("m2a005_postgres_block", "700"),
    blockTimestamp: "1787386300",
    confirmations: 4,
    topics: encodeEventTopics({ abi: SECURED_POOL_V1_EVENT_ABI, eventName, args: indexed }),
    data: encodeAbiParameters(dataInputs, dataInputs.map(({ name }) => args[name])),
    observedAt: "2026-08-22T10:00:00.000Z"
  };
}

function directRead(providerSlot, snapshot, state = snapshot.state) {
  return {
    providerSlot,
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    marketId: MARKET,
    blockNumber: "710",
    blockHash: hashId("m2a005_postgres_direct_block", "710"),
    state,
    complete: true,
    observedAt: "2026-08-22T10:01:00.000Z",
    readOnly: true,
    rawProviderPayloadPersisted: false,
    schemaVersion: "pool_direct_state_snapshot.v1"
  };
}

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
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

test("Pool V1 PostgreSQL indexing is atomic, idempotent, isolated, replayable and discrepancy-safe", { timeout: 30_000 }, async () => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL is required");
  const ownerPool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 4,
    applicationName: "ipo-one-pool-indexer-owner-test"
  });
  const appRole = "ipo_one_pool_indexer_test";
  const poolTables = [
    "pool_risk_control_transitions",
    "pool_risk_controls",
    "pool_reconciliation_evidence",
    "pool_reconciliation_discrepancies",
    "pool_reconciliation_runs",
    "pool_chain_outbox_messages",
    "pool_chain_finalized_effects",
    "pool_chain_cursors",
    "pool_chain_observations"
  ];
  const dropAppRole = async () => {
    const exists = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
    if (exists.rowCount === 0) return;
    await ownerPool.query(`DROP OWNED BY ${appRole}`);
    await ownerPool.query(`DROP ROLE ${appRole}`);
  };
  let appPool;
  try {
    await ownerPool.query(`TRUNCATE TABLE ${poolTables.join(", ")} CASCADE`);
    await dropAppRole();
    const password = randomBytes(24).toString("base64url");
    const quotedPassword = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
    await ownerPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await ownerPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${poolTables.join(", ")} TO ${appRole}`);
    const appConnection = new URL(CONNECTION_STRING);
    appConnection.username = appRole;
    appConnection.password = password;
    appPool = createPostgresPool({
      connectionString: appConnection.toString(),
      max: 6,
      applicationName: "ipo-one-pool-indexer-app-test"
    });
    await assertTenantDatabaseRole(appPool);

    const makeStore = (tenantContext = TENANT_CONTEXT) => new PostgresPoolObservationStore({
      pool: appPool,
      tenantContext
    });
    const firstIndexer = new PoolEventIndexer({ adapter, store: makeStore() });
    const competingIndexer = new PoolEventIndexer({ adapter, store: makeStore() });
    const [first, duplicate] = await Promise.all([
      firstIndexer.ingest(pauseLog()),
      competingIndexer.ingest(pauseLog())
    ]);
    assert.equal([first.persisted.effectCommitted, duplicate.persisted.effectCommitted].filter(Boolean).length, 1);
    assert.equal((await makeStore().listObservations(adapter.descriptor())).length, 1);
    assert.equal((await makeStore().listOutbox()).length, 1);
    assert.deepEqual(await makeStore(OTHER_TENANT_CONTEXT).listObservations(adapter.descriptor()), []);

    const restarted = new PoolEventIndexer({ adapter, store: makeStore() });
    const restored = await restarted.restore();
    assert.equal(restored.state.newRiskPaused, true);
    assert.equal(restored.finalizedEventCount, 1);
    assert.equal(restored.snapshotHash, first.snapshot.snapshotHash);

    const durable = await withTenantTransaction(ownerPool, TENANT_CONTEXT, (client) => client.query(
      "SELECT normalized_observation FROM pool_chain_observations"
    ));
    const serialized = JSON.stringify(durable.rows);
    assert.equal(serialized.includes("topics"), false);
    assert.equal(serialized.includes("data"), false);
    assert.equal(serialized.includes("providerUrl"), false);
    await assert.rejects(
      () => withTenantTransaction(ownerPool, TENANT_CONTEXT, (client) => client.query(
        "UPDATE pool_chain_observations SET normalized_observation = '{}'::jsonb"
      )),
      /append-only|immutable/
    );

    const drifted = structuredClone(restored.state);
    drifted.cashAssets = "1";
    const mismatch = await restarted.reconcile({
      directReads: [directRead("primary", restored), directRead("secondary", restored, drifted)]
    });
    assert.equal(mismatch.run.reasonCode, "provider_disagreement");
    assert.equal(restarted.operationAllowed("borrow"), false);
    assert.equal(restarted.operationAllowed("repay"), true);

    const afterFreezeRestart = new PoolEventIndexer({ adapter, store: makeStore() });
    await afterFreezeRestart.restore();
    assert.equal(afterFreezeRestart.riskControl().newRiskFrozen, true);
    const zero = await afterFreezeRestart.reconcile({
      directReads: [directRead("primary", restored), directRead("secondary", restored)]
    });
    const recovered = await afterFreezeRestart.approveRecovery({
      reconciliationId: zero.run.reconciliationId,
      approvalHash: hashId("m2a005_postgres_recovery", "approval"),
      approvedByHash: hashId("m2a005_postgres_recovery", "reviewer")
    });
    assert.equal(recovered.riskControl.newRiskFrozen, false);
    assert.equal((await makeStore().listRiskTransitions()).length, 2);

    const counts = await withTenantTransaction(ownerPool, TENANT_CONTEXT, (client) => client.query(
      `SELECT
         (SELECT COUNT(*) FROM pool_chain_observations)::int AS observations,
         (SELECT COUNT(*) FROM pool_chain_finalized_effects)::int AS effects,
         (SELECT COUNT(*) FROM pool_chain_outbox_messages)::int AS outbox,
         (SELECT COUNT(*) FROM pool_reconciliation_runs)::int AS reconciliations,
         (SELECT COUNT(*) FROM pool_reconciliation_discrepancies)::int AS discrepancies,
         (SELECT COUNT(*) FROM pool_reconciliation_evidence)::int AS evidence,
         (SELECT COUNT(*) FROM pool_risk_controls)::int AS controls,
         (SELECT COUNT(*) FROM pool_risk_control_transitions)::int AS transitions`
    ));
    assert.deepEqual(counts.rows[0], {
      observations: 1,
      effects: 1,
      outbox: 1,
      reconciliations: 2,
      discrepancies: 1,
      evidence: 3,
      controls: 3,
      transitions: 2
    });
  } finally {
    if (appPool) await appPool.end();
    await ownerPool.query(`TRUNCATE TABLE ${poolTables.join(", ")} CASCADE`).catch(() => {});
    await dropAppRole().catch(() => {});
    await ownerPool.end();
  }
});
