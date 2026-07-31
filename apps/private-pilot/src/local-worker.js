import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  PostgresEventRepository,
  PostgresReconciliationService,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import {
  PostgresCreditOutcomeMaterializer
} from "../../../modules/credit-learning/src/index.js";
import {
  PostgresEvidenceAnchorStore,
  createEvidenceAnchorNonceReader,
  createEvidenceAnchorObserver,
  createEvidenceAnchorWorker
} from "../../../modules/event-indexer/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { createPrivatePilotGateway } from "./private-pilot-runtime.js";
import {
  createEvidenceAnchorTestnetAttestor
} from "./evidence-anchor-testnet-attestor.js";

const LOCAL_WORKER_ACKNOWLEDGEMENT = "I_UNDERSTAND_SYNTHETIC_OUTBOX_ONLY";
const EVIDENCE_ATTESTOR_ACKNOWLEDGEMENT =
  "I_UNDERSTAND_BASE_SEPOLIA_ZERO_VALUE_HASH_ANCHORS";
const DEFAULT_HEARTBEAT_FILE = "/tmp/ipo-one-local-worker-heartbeat.json";

function boundedInteger(name, value, { minimum, maximum }) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DomainError(
      "invalid_local_worker_configuration",
      `${name} must be an integer from ${minimum} through ${maximum}`
    );
  }
  return parsed;
}

function safeWorkerId(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{2,63}$/.test(value)) {
    throw new DomainError(
      "invalid_local_worker_configuration",
      "IPO_ONE_LOCAL_WORKER_ID is invalid"
    );
  }
  return value;
}

export async function runLocalWorkerCycle({
  repository,
  reconciliationService,
  creditOutcomeMaterializer,
  evidenceAnchorWorker,
  workerId,
  batchSize = 100,
  leaseMs = 30_000,
  reconciliationKey,
  publish = async () => {}
}) {
  if (
    !repository?.claimOutboxBatch ||
    !repository?.markOutboxPublished ||
    !repository?.markOutboxFailed ||
    !reconciliationService?.run ||
    (creditOutcomeMaterializer !== undefined && !creditOutcomeMaterializer?.run) ||
    (evidenceAnchorWorker !== undefined && !evidenceAnchorWorker?.runOnce) ||
    typeof publish !== "function"
  ) {
    throw new DomainError(
      "invalid_local_worker_configuration",
      "Local worker adapters are incomplete"
    );
  }
  const checkedWorkerId = safeWorkerId(workerId);
  const checkedBatchSize = boundedInteger("batchSize", batchSize, {
    minimum: 1,
    maximum: 100
  });
  const checkedLeaseMs = boundedInteger("leaseMs", leaseMs, {
    minimum: 1_000,
    maximum: 300_000
  });
  const creditOutcomes = creditOutcomeMaterializer === undefined
    ? undefined
    : await creditOutcomeMaterializer.run({ limit: checkedBatchSize });
  const evidenceAnchors = evidenceAnchorWorker === undefined
    ? undefined
    : await evidenceAnchorWorker.runOnce({
        limit: Math.min(checkedBatchSize, 16)
      });
  const claimed = await repository.claimOutboxBatch({
    workerId: checkedWorkerId,
    limit: checkedBatchSize,
    leaseMs: checkedLeaseMs
  });
  let publishedCount = 0;
  for (const message of claimed) {
    try {
      await publish(Object.freeze({
        outboxMessageId: message.outboxMessageId,
        topic: message.topic,
        payloadHash: message.payloadHash
      }));
      await repository.markOutboxPublished({
        outboxMessageId: message.outboxMessageId,
        workerId: checkedWorkerId
      });
      publishedCount += 1;
    } catch (error) {
      await repository.markOutboxFailed({
        outboxMessageId: message.outboxMessageId,
        workerId: checkedWorkerId,
        error,
        retryAt: new Date(Date.now() + checkedLeaseMs)
      });
      throw error;
    }
  }

  const reconciliation = reconciliationKey === undefined
    ? undefined
    : await reconciliationService.run({
        scope: "full",
        initiatedBy: "system:local-stack-reconciliation",
        idempotencyKey: reconciliationKey
      });
  return Object.freeze({
    claimedCount: claimed.length,
    publishedCount,
    creditOutcomes,
    evidenceAnchors,
    reconciliation
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startLocalWorker(environment = process.env) {
  if (environment.IPO_ONE_LOCAL_WORKER_ACK !== LOCAL_WORKER_ACKNOWLEDGEMENT) {
    throw new DomainError(
      "local_worker_acknowledgement_required",
      "Local worker requires the exact synthetic-only acknowledgement"
    );
  }
  const ownerConnectionString = environment.DATABASE_URL;
  if (typeof ownerConnectionString !== "string" || ownerConnectionString.length === 0) {
    throw new DomainError(
      "local_worker_database_url_required",
      "DATABASE_URL is required for the local worker"
    );
  }
  const intervalMs = boundedInteger(
    "IPO_ONE_LOCAL_WORKER_INTERVAL_MS",
    environment.IPO_ONE_LOCAL_WORKER_INTERVAL_MS ?? 5_000,
    { minimum: 1_000, maximum: 60_000 }
  );
  const reconciliationIntervalMs = boundedInteger(
    "IPO_ONE_LOCAL_RECONCILIATION_INTERVAL_MS",
    environment.IPO_ONE_LOCAL_RECONCILIATION_INTERVAL_MS ?? 300_000,
    { minimum: 60_000, maximum: 3_600_000 }
  );
  const workerId = safeWorkerId(
    environment.IPO_ONE_LOCAL_WORKER_ID ?? "ipo_one_local_worker"
  );
  const heartbeatFile =
    environment.IPO_ONE_LOCAL_WORKER_HEARTBEAT_FILE ?? DEFAULT_HEARTBEAT_FILE;
  if (
    typeof heartbeatFile !== "string" ||
    !/^\/tmp\/[A-Za-z0-9._/-]{1,200}$/.test(heartbeatFile)
  ) {
    throw new DomainError(
      "invalid_local_worker_configuration",
      "IPO_ONE_LOCAL_WORKER_HEARTBEAT_FILE must remain under /tmp"
    );
  }

  const { authentication, pool } = await createPrivatePilotGateway(
    ownerConnectionString
  );
  const riskIdentity = authentication.identities.risk;
  const tenantContext = createTenantSecurityContext({
    tenantId: authentication.profile.tenantId,
    actorId: riskIdentity.actorId,
    policyVersion: riskIdentity.createContext().policyVersion,
    source: "local_test"
  });
  const repository = new PostgresEventRepository({ pool, tenantContext });
  const reconciliationService = new PostgresReconciliationService({
    pool,
    tenantContext,
    release: "local-stack-node-26.5.0"
  });
  const creditOutcomeMaterializer = new PostgresCreditOutcomeMaterializer({
    eventRepository: repository
  });
  const evidenceAnchorContractAddress =
    environment.IPO_ONE_EVIDENCE_ANCHOR_CONTRACT_ADDRESS;
  const evidenceAnchorAttestorKeyFile =
    environment.IPO_ONE_EVIDENCE_ATTESTOR_KEY_FILE;
  if (
    Boolean(evidenceAnchorContractAddress) !==
      Boolean(evidenceAnchorAttestorKeyFile)
  ) {
    throw new DomainError(
      "invalid_local_worker_configuration",
      "Evidence anchor contract and attestor key must be configured together"
    );
  }
  let evidenceAnchorWorker;
  if (evidenceAnchorContractAddress) {
    if (
      environment.IPO_ONE_EVIDENCE_ATTESTOR_ACK !==
        EVIDENCE_ATTESTOR_ACKNOWLEDGEMENT
    ) {
      throw new DomainError(
        "evidence_anchor_attestor_acknowledgement_required",
        "Evidence anchor attestor requires the exact Base Sepolia acknowledgement"
      );
    }
    const evidenceAnchorProviderSlot =
      environment.IPO_ONE_EVIDENCE_ANCHOR_PROVIDER_SLOT ?? "primary";
    const attestor = await createEvidenceAnchorTestnetAttestor({
      contractAddress: evidenceAnchorContractAddress,
      keyFile: evidenceAnchorAttestorKeyFile,
      providerSlot: evidenceAnchorProviderSlot
    });
    evidenceAnchorWorker = createEvidenceAnchorWorker({
      store: new PostgresEvidenceAnchorStore({
        pool,
        tenantContext
      }),
      contractAddress: evidenceAnchorContractAddress,
      attestorAddress: attestor.address,
      nonceReader: createEvidenceAnchorNonceReader({
        contractAddress: evidenceAnchorContractAddress,
        providerSlot: evidenceAnchorProviderSlot
      }),
      observer: createEvidenceAnchorObserver({
        contractAddress: evidenceAnchorContractAddress,
        providerSlot: evidenceAnchorProviderSlot
      }),
      sender: attestor.sender
    });
  }

  let closing = false;
  let consecutiveFailures = 0;
  let lastReconciliationBucket;
  const stop = () => {
    closing = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (!closing) {
      const now = Date.now();
      const reconciliationBucket = Math.floor(now / reconciliationIntervalMs);
      const reconcile = reconciliationBucket !== lastReconciliationBucket;
      try {
        const result = await runLocalWorkerCycle({
          repository,
          reconciliationService,
          creditOutcomeMaterializer,
          evidenceAnchorWorker,
          workerId,
          reconciliationKey: reconcile
            ? `local-stack-reconciliation-${reconciliationBucket}`
            : undefined,
          publish: async (message) => {
            process.stdout.write(`${JSON.stringify({
              event: "local_outbox_delivered",
              outboxMessageId: message.outboxMessageId,
              topic: message.topic,
              payloadHash: message.payloadHash
            })}\n`);
          }
        });
        if (reconcile) lastReconciliationBucket = reconciliationBucket;
        consecutiveFailures = 0;
        const heartbeat = {
          schemaVersion: "ipo_one_local_worker_heartbeat.v1",
          workerId,
          healthy: true,
          syntheticOnly: true,
          realFundsEnabled: false,
          publishedCount: result.publishedCount,
          creditOutcomeMaterializedCount:
            result.creditOutcomes?.materializedCount ?? 0,
          evidenceAnchorStatus:
            result.evidenceAnchors?.status ?? "not_configured",
          evidenceAnchorManualReconciliationRequired:
            result.evidenceAnchors?.manualReconciliationRequired ?? false,
          reconciliationStatus: result.reconciliation?.status ?? "not_due",
          observedAt: new Date().toISOString()
        };
        await writeFile(heartbeatFile, `${JSON.stringify(heartbeat)}\n`, {
          mode: 0o600
        });
        process.stdout.write(`${JSON.stringify({
          event: "local_worker_cycle_completed",
          ...heartbeat
        })}\n`);
      } catch (error) {
        consecutiveFailures += 1;
        process.stderr.write(`${JSON.stringify({
          event: "local_worker_cycle_failed",
          code: error?.code ?? "local_worker_cycle_failed",
          consecutiveFailures
        })}\n`);
        if (consecutiveFailures >= 3) throw error;
      }
      if (!closing) await delay(intervalMs);
    }
  } finally {
    await pool.end();
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedPath) {
  startLocalWorker().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      event: "local_worker_start_failed",
      code: error?.code ?? "local_worker_start_failed",
      message: error?.message ?? "Local worker failed"
    })}\n`);
    process.exitCode = 1;
  });
}
