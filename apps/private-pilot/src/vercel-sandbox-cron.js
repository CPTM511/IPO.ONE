import {
  PostgresEventRepository,
  PostgresReconciliationService,
  createPostgresPool,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import { PostgresCreditOutcomeMaterializer } from "../../../modules/credit-learning/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { runLocalWorkerCycle } from "./local-worker.js";

const CRON_LOCK_NAMESPACE = "ipo.one";
const CRON_LOCK_NAME = "vercel-sandbox-cron";
const FIVE_MINUTES_MS = 5 * 60 * 1_000;

function required(environment, name, pattern, maximum = 16_384) {
  const value = environment[name];
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    !pattern.test(value)
  ) {
    throw new DomainError(
      "invalid_vercel_sandbox_cron_configuration",
      `${name} is invalid`
    );
  }
  return value;
}

function assertVercelCronEnvironment(environment) {
  if (
    environment.NODE_ENV !== "production" ||
    environment.VERCEL !== "1" ||
    environment.VERCEL_ENV !== "production" ||
    environment.VERCEL_TARGET_ENV !== "production" ||
    environment.IPO_ONE_DEPLOYMENT_PROFILE !== "vercel_sandbox" ||
    environment.IPO_ONE_DEPLOYMENT_MODE !== "vercel_sandbox" ||
    environment.IPO_ONE_VERCEL_PROJECT_ROLE !== "primary" ||
    environment.IPO_ONE_NO_REAL_FUNDS_ACK !==
      "I_UNDERSTAND_DEPLOYABLE_SANDBOX_NO_REAL_FUNDS"
  ) {
    throw new DomainError(
      "invalid_vercel_sandbox_cron_configuration",
      "Vercel Sandbox Cron deployment authority is invalid"
    );
  }
}

export async function runVercelSandboxCronCycle({
  environment = process.env,
  now = new Date(),
  publish = async (message) => {
    process.stdout.write(`${JSON.stringify({
      event: "vercel_sandbox_outbox_delivered",
      outboxMessageId: message.outboxMessageId,
      topic: message.topic,
      payloadHash: message.payloadHash,
      realFundsEnabled: false
    })}\n`);
  }
} = {}) {
  assertVercelCronEnvironment(environment);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof publish !== "function") {
    throw new DomainError(
      "invalid_vercel_sandbox_cron_configuration",
      "Vercel Sandbox Cron invocation is invalid"
    );
  }
  const releaseId = required(environment, "IPO_ONE_RELEASE_ID", /^[0-9a-f]{40}$/, 40);
  if (
    process.env.IPO_ONE_BUNDLED_RELEASE_ID !== undefined &&
    releaseId !== process.env.IPO_ONE_BUNDLED_RELEASE_ID
  ) {
    throw new DomainError(
      "invalid_vercel_sandbox_cron_configuration",
      "IPO_ONE_RELEASE_ID does not match the bundled source commit"
    );
  }
  const tenantId = required(
    environment,
    "IPO_ONE_TENANT_ID",
    /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/,
    128
  );
  const systemActorId = required(
    environment,
    "IPO_ONE_SYSTEM_ACTOR_ID",
    /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/,
    128
  );
  const policyVersion = required(
    environment,
    "IPO_ONE_POLICY_VERSION",
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/,
    256
  );
  const pool = createPostgresPool({
    connectionString: required(
      environment,
      "IPO_ONE_GATEWAY_DATABASE_URL",
      /^postgres(?:ql)?:\/\/.+$/
    ),
    max: 2,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    applicationName: "ipo-one-vercel-cron"
  });
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lock = await lockClient.query(
      "SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired",
      [CRON_LOCK_NAMESPACE, CRON_LOCK_NAME]
    );
    locked = lock.rows[0]?.acquired === true;
    if (!locked) {
      return Object.freeze({
        schemaVersion: "vercel_sandbox_cron_result.v1",
        status: "skipped_concurrent_run",
        releaseId,
        realFundsEnabled: false
      });
    }
    const tenantContext = createTenantSecurityContext({
      tenantId,
      actorId: systemActorId,
      policyVersion,
      source: "system_worker"
    });
    const repository = new PostgresEventRepository({
      pool,
      tenantContext,
      sourceSystem: "ipo.one.vercel-sandbox-cron"
    });
    const reconciliationService = new PostgresReconciliationService({
      pool,
      tenantContext,
      release: releaseId
    });
    const creditOutcomeMaterializer = new PostgresCreditOutcomeMaterializer({
      eventRepository: repository
    });
    const bucket = Math.floor(now.getTime() / FIVE_MINUTES_MS);
    const result = await runLocalWorkerCycle({
      repository,
      reconciliationService,
      creditOutcomeMaterializer,
      workerId: `vercel_cron_${releaseId.slice(0, 12)}`,
      batchSize: 64,
      leaseMs: 30_000,
      reconciliationKey: `vercel-sandbox-reconciliation-${bucket}`,
      reconciliationInitiatedBy: "system:vercel-sandbox-cron",
      publish
    });
    return Object.freeze({
      schemaVersion: "vercel_sandbox_cron_result.v1",
      status: "completed",
      releaseId,
      claimedCount: result.claimedCount,
      publishedCount: result.publishedCount,
      creditOutcomeMaterializedCount:
        result.creditOutcomes?.materializedCount ?? 0,
      reconciliationStatus: result.reconciliation?.status ?? "not_due",
      realFundsEnabled: false
    });
  } finally {
    if (locked) {
      await lockClient.query(
        "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
        [CRON_LOCK_NAMESPACE, CRON_LOCK_NAME]
      ).catch(() => {});
    }
    lockClient.release();
    await pool.end();
  }
}
