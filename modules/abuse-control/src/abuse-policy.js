import { TENANT_OPERATION_POLICIES } from "../../authorization/src/index.js";
import {
  ABUSE_POLICY_VERSION,
  AbuseProfileId,
  QuotaClass,
  RequestMetric,
  ResourceKind
} from "./abuse-constants.js";
import {
  abuseError,
  assertAbuseIdentifier,
  deepFreezeAbuse
} from "./abuse-utils.js";

const MINUTE = 60_000;

export const HARD_CEILINGS = deepFreezeAbuse({
  rate: {
    windowMs: 10 * MINUTE,
    actor: 2_000,
    client: 5_000,
    tenant: 10_000,
    operation: 5_000,
    service: 25_000,
    network: 5_000,
    account: 100
  },
  concurrency: { actor: 16, tenant: 64, service: 256 },
  metrics: {
    [RequestMetric.BODY_BYTES]: 64 * 1024,
    [RequestMetric.COMMAND_BYTES]: 1024 * 1024,
    [RequestMetric.EVENT_BYTES]: 64 * 1024,
    [RequestMetric.PROJECTION_BYTES]: 128 * 1024,
    [RequestMetric.PROJECTION_WRITE_SET_BYTES]: 2 * 1024 * 1024,
    [RequestMetric.RESPONSE_BYTES]: 256 * 1024,
    [RequestMetric.EXPORT_ROWS]: 10_000,
    [RequestMetric.QUEUE_UNITS]: 16,
    [RequestMetric.EXECUTION_MS]: 30_000,
    [RequestMetric.UPSTREAM_COST_UNITS]: 100
  },
  resources: {
    [ResourceKind.AGENT_SUBJECTS]: 500,
    [ResourceKind.MANDATES]: 1_000,
    [ResourceKind.OPEN_OBLIGATIONS]: 1_000,
    [ResourceKind.PROVIDERS]: 100,
    [ResourceKind.CREDENTIALS]: 50,
    [ResourceKind.ACCESS_GRANTS]: 500
  },
  upstreamCostUnitsPerMinute: 1_000,
  admissionLeaseMs: 60_000,
  automaticRetries: 3
});

function profile({
  quotaClass,
  windowMs = MINUTE,
  rate,
  concurrency,
  metrics = {},
  maxAutomaticRetries = 0,
  idempotencyRequired = false,
  upstreamCostUnitsPerMinute = 0,
  admissionLeaseMs = 15_000
}) {
  const commonMetrics = {
    ...HARD_CEILINGS.metrics,
    [RequestMetric.EXPORT_ROWS]: 0,
    [RequestMetric.QUEUE_UNITS]: 0,
    [RequestMetric.UPSTREAM_COST_UNITS]: 0
  };
  return deepFreezeAbuse({
    quotaClass,
    windowMs,
    rate: {
      actor: 0,
      client: 0,
      tenant: 0,
      operation: 0,
      service: 0,
      network: 0,
      account: 0,
      ...rate
    },
    concurrency: { actor: 0, tenant: 0, service: 0, ...concurrency },
    metrics: { ...commonMetrics, ...metrics },
    resources: { ...HARD_CEILINGS.resources },
    maxAutomaticRetries,
    idempotencyRequired,
    upstreamCostUnitsPerMinute,
    admissionLeaseMs
  });
}

export const QUOTA_PROFILES = deepFreezeAbuse({
  [QuotaClass.DISCOVERY]: profile({
    quotaClass: QuotaClass.DISCOVERY,
    rate: { network: 30, service: 3_000 },
    concurrency: { service: 64 },
    metrics: { [RequestMetric.EXECUTION_MS]: 2_000 },
    maxAutomaticRetries: 1,
    admissionLeaseMs: 3_000
  }),
  [QuotaClass.READ]: profile({
    quotaClass: QuotaClass.READ,
    rate: {
      actor: 600,
      client: 1_200,
      tenant: 3_000,
      operation: 1_200,
      service: 10_000,
      network: 3_000
    },
    concurrency: { actor: 8, tenant: 32, service: 128 },
    metrics: { [RequestMetric.EXECUTION_MS]: 10_000 },
    maxAutomaticRetries: 2
  }),
  [QuotaClass.MUTATION]: profile({
    quotaClass: QuotaClass.MUTATION,
    rate: { actor: 120, client: 240, tenant: 600, operation: 240, service: 2_400, network: 600 },
    concurrency: { actor: 4, tenant: 24, service: 96 },
    metrics: { [RequestMetric.EXECUTION_MS]: 15_000 },
    idempotencyRequired: true
  }),
  [QuotaClass.ECONOMIC]: profile({
    quotaClass: QuotaClass.ECONOMIC,
    rate: { actor: 30, client: 60, tenant: 180, operation: 60, service: 600, network: 180 },
    concurrency: { actor: 2, tenant: 12, service: 48 },
    metrics: {
      [RequestMetric.EXECUTION_MS]: 15_000,
      [RequestMetric.UPSTREAM_COST_UNITS]: 100
    },
    idempotencyRequired: true,
    upstreamCostUnitsPerMinute: 300
  }),
  [QuotaClass.CREDENTIAL]: profile({
    quotaClass: QuotaClass.CREDENTIAL,
    windowMs: 10 * MINUTE,
    rate: { network: 10, account: 10, service: 1_000 },
    concurrency: { service: 32 },
    metrics: { [RequestMetric.EXECUTION_MS]: 10_000 },
    admissionLeaseMs: 12_000
  }),
  [QuotaClass.PRIVILEGED]: profile({
    quotaClass: QuotaClass.PRIVILEGED,
    rate: { actor: 30, client: 60, tenant: 120, operation: 30, service: 480, network: 120 },
    concurrency: { actor: 2, tenant: 8, service: 32 },
    metrics: { [RequestMetric.EXECUTION_MS]: 15_000 },
    idempotencyRequired: true
  }),
  [QuotaClass.BATCH]: profile({
    quotaClass: QuotaClass.BATCH,
    rate: { actor: 6, client: 12, tenant: 6, operation: 6, service: 30, network: 30 },
    concurrency: { actor: 1, tenant: 1, service: 8 },
    metrics: {
      [RequestMetric.EXPORT_ROWS]: 10_000,
      [RequestMetric.QUEUE_UNITS]: 8,
      [RequestMetric.EXECUTION_MS]: 30_000
    },
    idempotencyRequired: true,
    admissionLeaseMs: 35_000
  }),
  [QuotaClass.WORKER]: profile({
    quotaClass: QuotaClass.WORKER,
    rate: { actor: 120, client: 240, tenant: 600, operation: 120, service: 2_400, network: 600 },
    concurrency: { actor: 4, tenant: 16, service: 64 },
    metrics: { [RequestMetric.QUEUE_UNITS]: 8, [RequestMetric.EXECUTION_MS]: 30_000 },
    maxAutomaticRetries: 3,
    idempotencyRequired: true,
    admissionLeaseMs: 35_000
  })
});

const CLASSIFIED_OPERATIONS = Object.freeze({
  [QuotaClass.READ]: [
    "pilotReadApproval",
    "pilotReadAgentSelf",
    "pilotReadTenantRisk",
    "pilotReadProviderIntent",
    "pilotReadEvidence"
  ],
  [QuotaClass.MUTATION]: [
    "pilotCreateAgentSubject",
    "pilotCreateDraftMandate",
    "pilotAcknowledgeProviderIntent"
  ],
  [QuotaClass.ECONOMIC]: [
    "pilotRequestCredit",
    "pilotSubmitSpend",
    "pilotCaptureRevenue",
    "pilotAutoRepay",
    "workerAutoRepay"
  ],
  [QuotaClass.PRIVILEGED]: [
    "pilotProposeApproval",
    "pilotDecideApproval",
    "pilotCancelApproval",
    "pilotFreezeSubject",
    "pilotReduceCreditLimit",
    "pilotIncreaseCreditLimit",
    "pilotUnfreezeSubject",
    "workerPlanProjectionRepair",
    "workerExecuteProjectionRepair"
  ],
  [QuotaClass.BATCH]: ["pilotExportAudit", "workerRunReconciliation"],
  [QuotaClass.WORKER]: ["workerPublishOutbox", "workerExpireApproval", "workerProcessInbox"]
});

const authorizationPolicies = new Map(TENANT_OPERATION_POLICIES.map((item) => [item.operationId, item]));
const operationPolicies = new Map();
for (const [quotaClass, operationIds] of Object.entries(CLASSIFIED_OPERATIONS)) {
  for (const operationId of operationIds) {
    const authorization = authorizationPolicies.get(operationId);
    if (!authorization || operationPolicies.has(operationId)) {
      throw new Error(`Invalid abuse-control operation classification: ${operationId}`);
    }
    operationPolicies.set(operationId, deepFreezeAbuse({
      operationId,
      action: authorization.action,
      authorizationSurface: authorization.surface,
      quotaClass,
      profile: QUOTA_PROFILES[quotaClass],
      policyVersion: ABUSE_POLICY_VERSION
    }));
  }
}
if (operationPolicies.size !== authorizationPolicies.size) {
  const missing = [...authorizationPolicies.keys()].filter((operationId) => !operationPolicies.has(operationId));
  throw new Error(`Missing abuse-control classifications: ${missing.join(", ")}`);
}

export const TENANT_ABUSE_OPERATION_POLICIES = Object.freeze([...operationPolicies.values()]);

export const PUBLIC_ABUSE_PROFILES = deepFreezeAbuse({
  [AbuseProfileId.DISCOVERY]: QUOTA_PROFILES[QuotaClass.DISCOVERY],
  [AbuseProfileId.CREDENTIAL]: QUOTA_PROFILES[QuotaClass.CREDENTIAL]
});

export const ABUSE_CONTROL_POLICY = deepFreezeAbuse({
  policyVersion: ABUSE_POLICY_VERSION,
  hardCeilings: HARD_CEILINGS,
  publicProfiles: Object.fromEntries(
    Object.entries(PUBLIC_ABUSE_PROFILES).map(([profileId, value]) => [profileId, value.quotaClass])
  ),
  operations: Object.fromEntries(
    TENANT_ABUSE_OPERATION_POLICIES.map(({ operationId, quotaClass }) => [operationId, quotaClass])
  ),
  schemaVersion: "abuse_control_policy.v1"
});

export function getTenantAbusePolicy(operationId) {
  const policy = operationPolicies.get(assertAbuseIdentifier("operationId", operationId));
  if (!policy) {
    throw abuseError("abuse_policy_not_found", "The requested operation is not available.");
  }
  return policy;
}

export function getPublicAbuseProfile(profileId) {
  const profile = PUBLIC_ABUSE_PROFILES[assertAbuseIdentifier("profileId", profileId)];
  if (!profile) {
    throw abuseError("abuse_policy_not_found", "The requested operation is not available.");
  }
  return profile;
}
