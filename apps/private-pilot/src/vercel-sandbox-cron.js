import {
  PostgresEventRepository,
  PostgresReconciliationService,
  createPostgresPool,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import { PostgresCreditOutcomeMaterializer } from "../../../modules/credit-learning/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { runLocalWorkerCycle } from "./local-worker.js";
import {
  reprovisionProductionAgentReference,
  revokeProductionGoldenFlowAgentCredential
} from "./production-bootstrap.js";
import { loadProductionClosedPilotEnvironment } from "./production-environment.js";

const CRON_LOCK_NAMESPACE = "ipo.one";
const CRON_LOCK_NAME = "vercel-sandbox-cron";
const FIVE_MINUTES_MS = 5 * 60 * 1_000;
const OPERATION_SCHEMA = "authn_008_agent_operation.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

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

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function authn008AgentOperation(environment, releaseId) {
  const source = environment.IPO_ONE_AUTHN_008_AGENT_OPERATION_JSON;
  if (source === undefined) return undefined;
  if (typeof source !== "string" || source.length < 2 || source.length > 8_192) {
    throw new DomainError(
      "invalid_vercel_sandbox_cron_configuration",
      "AUTHN-008 Agent operation is invalid"
    );
  }
  let operation;
  try {
    operation = parseStrictJson(source, {
      maximumBytes: 8_192,
      maximumDepth: 2,
      maximumKeys: 10
    });
  } catch {
    throw new DomainError(
      "invalid_vercel_sandbox_cron_configuration",
      "AUTHN-008 Agent operation is invalid"
    );
  }
  const commonValid =
    operation?.schemaVersion === OPERATION_SCHEMA &&
    operation?.releaseId === releaseId &&
    SAFE_ID.test(operation?.actorId ?? "");
  if (operation?.action === "reprovision") {
    if (
      !exactKeys(operation, [
        "schemaVersion",
        "action",
        "releaseId",
        "oldCredentialId",
        "actorId",
        "clientId",
        "issuer",
        "externalSubject",
        "invitationId",
        "senderThumbprint"
      ]) ||
      !commonValid ||
      !SAFE_ID.test(operation.oldCredentialId) ||
      !SAFE_ID.test(operation.clientId) ||
      !SAFE_ID.test(operation.invitationId) ||
      !BASE64URL_43.test(operation.senderThumbprint) ||
      typeof operation.externalSubject !== "string" ||
      operation.externalSubject.length < 1 ||
      operation.externalSubject.length > 512
    ) {
      throw new DomainError(
        "invalid_vercel_sandbox_cron_configuration",
        "AUTHN-008 Agent reprovision operation is invalid"
      );
    }
    try {
      const issuer = new URL(operation.issuer);
      if (
        issuer.protocol !== "https:" ||
        issuer.username ||
        issuer.password ||
        issuer.pathname !== "/" ||
        issuer.search ||
        issuer.hash ||
        issuer.origin !== operation.issuer
      ) throw new Error("invalid issuer");
    } catch {
      throw new DomainError(
        "invalid_vercel_sandbox_cron_configuration",
        "AUTHN-008 Agent issuer is invalid"
      );
    }
    return Object.freeze(operation);
  }
  if (
    operation?.action === "revoke" &&
    exactKeys(operation, ["schemaVersion", "action", "releaseId", "actorId"]) &&
    commonValid
  ) {
    return Object.freeze(operation);
  }
  throw new DomainError(
    "invalid_vercel_sandbox_cron_configuration",
    "AUTHN-008 Agent operation is invalid"
  );
}

async function runAuthn008AgentOperation({ environment, operation }) {
  if (operation === undefined) return undefined;
  const configuration = await loadProductionClosedPilotEnvironment(environment);
  try {
    if (
      configuration.referenceHashMode !== "overlap_v2_write_v1_lookup" ||
      configuration.deploymentRole !== "primary" ||
      configuration.releaseId !== operation.releaseId
    ) {
      throw new DomainError(
        "invalid_vercel_sandbox_cron_configuration",
        "AUTHN-008 Agent operation requires the exact overlap release"
      );
    }
    if (operation.action === "reprovision") {
      return reprovisionProductionAgentReference({
        authenticationConnectionString: environment.IPO_ONE_AUTH_DATABASE_URL,
        referenceHashKey: configuration.referenceHashKey,
        referenceHashMode: configuration.referenceHashMode,
        tenantId: configuration.tenantId,
        oldCredentialId: operation.oldCredentialId,
        actorId: operation.actorId,
        clientId: operation.clientId,
        issuer: operation.issuer,
        externalSubject: operation.externalSubject,
        invitationId: operation.invitationId,
        senderThumbprint: operation.senderThumbprint,
        performedByActorId: configuration.systemActorId
      });
    }
    return revokeProductionGoldenFlowAgentCredential({
      adminConnectionString: environment.IPO_ONE_AUTH_DATABASE_URL,
      tenantId: configuration.tenantId,
      actorId: operation.actorId,
      performedByActorId: configuration.systemActorId
    });
  } finally {
    await Promise.allSettled([
      configuration.gatewayPool.end(),
      configuration.authenticationPool.end()
    ]);
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
  const agentOperation = authn008AgentOperation(environment, releaseId);
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
    const authenticationRotation = await runAuthn008AgentOperation({
      environment,
      operation: agentOperation
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
      creditStateUpdatedCount:
        result.creditOutcomes?.creditStateUpdatedCount ?? 0,
      reconciliationStatus: result.reconciliation?.status ?? "not_due",
      ...(authenticationRotation === undefined ? {} : { authenticationRotation }),
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
