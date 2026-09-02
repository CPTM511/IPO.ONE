import { parseArgs } from "node:util";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import {
  AgentTenantCommandClient,
  HumanTenantCommandClient,
  SystemWorkerTenantCommandClient
} from "../../../modules/tenant-command-gateway/src/index.js";
import {
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  findLocalSyntheticMeteredUsageRun,
  prepareLocalSyntheticMeteredUsage
} from "./local-synthetic-metered-provider.js";
import { createPrivatePilotGateway } from "./private-pilot-runtime.js";

const ACKNOWLEDGEMENT = "I_UNDERSTAND_LOCAL_SYNTHETIC_METERED_USAGE_ONLY";

function fail(code, message) {
  throw new DomainError(code, message);
}

function requestIdentity(runId) {
  return hashId("local_metered_usage_request", runId).slice(2, 34);
}

async function findEligibleObligation(pool, authenticationContext) {
  const repository = new PostgresEventRepository({
    pool,
    tenantContext: createTenantSecurityContext({
      tenantId: authenticationContext.tenantId,
      actorId: authenticationContext.actorId,
      policyVersion: authenticationContext.policyVersion,
      source: "local_test"
    })
  });
  return repository.withTenantRead(async (client) => {
    const result = await client.query(
      `SELECT o.id
         FROM obligations o
         JOIN mandates m
           ON m.tenant_id = o.tenant_id AND m.id = o.mandate_id
         JOIN lockboxes l
           ON l.tenant_id = o.tenant_id AND l.obligation_id = o.id
        WHERE o.tenant_id = $1
          AND o.schema_version = 'obligation.v2'
          AND o.status = 'active'
          AND o.execution_status = 'executed'
          AND o.sandbox_only = TRUE
          AND o.production_funds_moved = FALSE
          AND o.withdrawable = FALSE
          AND m.status = 'active'
          AND m.allowed_provider_ids @> $2::jsonb
          AND l.status = 'active'
          AND l.allowed_provider_ids @> $2::jsonb
        ORDER BY o.created_at DESC, o.id
        LIMIT 1`,
      [authenticationContext.tenantId, JSON.stringify(["provider_gateway_compute"])]
    );
    return result.rows[0]?.id;
  });
}

function clientOptions(runtime, identity) {
  return {
    gateway: runtime.gateway,
    authenticationContextProvider: async () => identity.createContext(),
    networkContextProvider: async () => createTrustedNetworkContext({
      networkRefHash: hashId("private_pilot_network", "local_metered_usage"),
      source: "local_test"
    })
  };
}

export async function runLocalSyntheticMeteredUsage({
  databaseUrl,
  runId,
  quantity = "250"
}) {
  if (typeof databaseUrl !== "string" || databaseUrl.length < 1) {
    fail("local_metered_usage_database_required", "DATABASE_URL is required");
  }
  const runtime = await createPrivatePilotGateway(databaseUrl);
  try {
    const worker = runtime.authentication.identities.meteredUsageWorker;
    const authenticationContext = worker.createContext();
    const previousRun = await findLocalSyntheticMeteredUsageRun({
      pool: runtime.pool,
      authenticationContext,
      runId
    });
    const obligationId = previousRun?.obligationId ??
      await findEligibleObligation(runtime.pool, authenticationContext);
    if (!obligationId) {
      fail(
        "local_metered_usage_obligation_unavailable",
        "No active executed local Agent Obligation is ready for metered usage"
      );
    }
    const prepared = await prepareLocalSyntheticMeteredUsage({
      pool: runtime.pool,
      authenticationContext,
      obligationId,
      provider: runtime.meteredUsageProvider,
      runId,
      quantity
    });
    const identity = requestIdentity(runId);
    const systemClient = new SystemWorkerTenantCommandClient(
      clientOptions(runtime, worker)
    );
    const admitted = await systemClient.admitMeteredUsage({
      obligationId,
      evidence: prepared.evidence,
      expectedPolicyHash: prepared.expectedPolicyHash,
      providerSignature: prepared.providerSignature,
      idempotencyKey: `local-metered-usage-${identity}`,
      requestId: `request-local-metered-${identity}`,
      correlationId: `correlation-local-metered-${identity}`
    });
    const [principalEvidence, agentEvidence] = await Promise.all([
      new HumanTenantCommandClient(clientOptions(
        runtime,
        runtime.authentication.identities.controller
      )).getOwnObligationEvidence({
        obligationId,
        limit: 50,
        requestId: `request-principal-evidence-${identity}`,
        correlationId: `correlation-local-metered-${identity}`
      }),
      new AgentTenantCommandClient(clientOptions(
        runtime,
        runtime.authentication.identities.agent
      )).getOwnObligationEvidence({
        obligationId,
        limit: 50,
        requestId: `request-agent-evidence-${identity}`,
        correlationId: `correlation-local-metered-${identity}`
      })
    ]);
    const expectedEvidenceId = admitted.response.evidence.usageEvidenceId;
    const principalReceipt = principalEvidence.response.items.find(
      (item) => item.meteredUsage?.usageEvidenceId === expectedEvidenceId
    );
    const agentReceipt = agentEvidence.response.items.find(
      (item) => item.meteredUsage?.usageEvidenceId === expectedEvidenceId
    );
    if (
      !principalReceipt ||
      !agentReceipt ||
      JSON.stringify(principalReceipt.meteredUsage) !==
        JSON.stringify(agentReceipt.meteredUsage)
    ) {
      fail(
        "local_metered_usage_receipt_mismatch",
        "Principal and Agent Metered Usage receipts do not match"
      );
    }
    return Object.freeze({
      schemaVersion: "local_synthetic_metered_usage_acceptance.v1",
      status: "passed",
      providerId: runtime.meteredUsageProvider.providerId,
      providerKeyId: runtime.meteredUsageProvider.providerKeyId,
      policyHash: prepared.expectedPolicyHash,
      obligationId,
      usageEvidenceId: expectedEvidenceId,
      meteredUsageAdmissionId:
        admitted.response.admission.meteredUsageAdmissionId,
      ledgerTransactionId: admitted.response.ledgerTransactionId,
      chargeMinor: admitted.response.admission.chargeMinor,
      replayed: admitted.replayed,
      principalAgentParity: true,
      nextAction: admitted.response.nextAction,
      sandboxOnly: true,
      productionFundsMoved: false,
      realFundsEnabled: false
    });
  } finally {
    await runtime.pool.end();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "run-id": { type: "string" },
      quantity: { type: "string", default: "250" }
    },
    strict: true
  });
  if (process.env.IPO_ONE_LOCAL_METERED_USAGE_ACK !== ACKNOWLEDGEMENT) {
    fail(
      "local_metered_usage_acknowledgement_required",
      `Set IPO_ONE_LOCAL_METERED_USAGE_ACK=${ACKNOWLEDGEMENT}`
    );
  }
  const result = await runLocalSyntheticMeteredUsage({
    databaseUrl: process.env.DATABASE_URL,
    runId: values["run-id"],
    quantity: values.quantity
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    process.stderr.write(
      `Local synthetic Metered Usage failed: ${error?.code ?? "unknown"}: ${error?.message ?? "unknown"}\n`
    );
    process.exitCode = 1;
  });
}
