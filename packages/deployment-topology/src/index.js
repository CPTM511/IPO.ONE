import {
  LaunchEvidenceError,
  parseCanonicalJson
} from "../../release-governance/src/index.js";

const AUTHORITY_KEYS = Object.freeze([
  "cloudMutationEnabled",
  "remoteParticipantAccessEnabled",
  "realFundsEnabled",
  "humanCreditEnabled",
  "testnetWritesEnabled",
  "externalProviderExecutionEnabled",
  "venueSignerEnabled",
  "publicSignupEnabled"
]);

const ACTIVATION_GATES = Object.freeze([
  "AUTHN-005",
  "TRANSPORT-003",
  "OPS-004",
  "SECURITY-INDEPENDENT-REVIEW",
  "PRIVACY-PILOT-REVIEW",
  "DEPLOYMENT-HUMAN-APPROVAL",
  "LAUNCH-POLICY-REVISION"
]);

const WORKER_RESPONSIBILITIES = Object.freeze([
  "outbox",
  "reconciliation",
  "synthetics",
  "evidence_finalization",
  "credit_outcome_materialization",
  "alert_delivery"
]);

const PROVIDER_AUTHORITY_KEYS = Object.freeze([
  "vercelProjectLinkEnabled",
  "marketplaceInstallEnabled",
  "billingCommitmentEnabled",
  "databaseProvisioningEnabled",
  "runtimeProvisioningEnabled",
  "workerProvisioningEnabled",
  "secretWriteEnabled",
  "dnsMutationEnabled",
  "remoteAccessEnabled"
]);

const PROVIDER_APPROVAL_INPUTS = Object.freeze([
  "pilot_region",
  "monthly_cost_ceiling_usd",
  "billing_owner",
  "provider_account_owner",
  "public_tls_database_risk_acceptance",
  "restore_drill_owner",
  "incident_owner"
]);

const PROVIDER_OPTIONS = Object.freeze([
  Object.freeze({
    id: "vercel_neon_cloud_run",
    decision: "recommended",
    score: 86
  }),
  Object.freeze({
    id: "vercel_cloud_sql_cloud_run",
    decision: "control_first_alternative",
    score: 83
  }),
  Object.freeze({
    id: "vercel_render",
    decision: "single_runtime_vendor_alternative",
    score: 78
  })
]);

const LOCAL_STACK_AUTHORITY_KEYS = Object.freeze([
  "remoteAccessEnabled",
  "realFundsEnabled",
  "humanCreditEnabled",
  "testnetWritesEnabled",
  "externalProviderExecutionEnabled",
  "venueSignerEnabled",
  "publicSignupEnabled",
  "cloudMutationEnabled"
]);

export class DeployTopologyError extends Error {
  constructor(issues) {
    super("DEPLOY-001 topology is invalid.");
    this.name = "DeployTopologyError";
    this.issues = Object.freeze([...issues]);
  }
}

export class ProviderSelectionError extends Error {
  constructor(issues) {
    super("DEPLOY-001B provider recommendation is invalid.");
    this.name = "ProviderSelectionError";
    this.issues = Object.freeze([...issues]);
  }
}

export class LocalStackError extends Error {
  constructor(issues) {
    super("LOCAL-STACK-001 contract is invalid.");
    this.name = "LocalStackError";
    this.issues = Object.freeze([...issues]);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, path, issues) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return false;
  }
  const actual = Object.keys(value);
  for (const key of expected) {
    if (!actual.includes(key)) issues.push(`${path}.${key} is required.`);
  }
  for (const key of actual) {
    if (!expected.includes(key)) issues.push(`${path}.${key} is not allowed.`);
  }
  return true;
}

function exact(value, expected, path, issues) {
  if (value !== expected) issues.push(`${path} must be ${JSON.stringify(expected)}.`);
}

function exactArray(value, expected, path, issues) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    issues.push(`${path} must match the reviewed ordered set.`);
  }
}

function allFalse(value, keys, path, issues) {
  if (!exactKeys(value, keys, path, issues)) return;
  for (const key of keys) exact(value[key], false, `${path}.${key}`, issues);
}

function allTrue(value, keys, path, issues) {
  if (!exactKeys(value, keys, path, issues)) return;
  for (const key of keys) exact(value[key], true, `${path}.${key}`, issues);
}

function boundedString(value, path, issues, max = 500) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    /\p{Cc}/u.test(value)
  ) {
    issues.push(`${path} must be a non-empty bounded string without control characters.`);
  }
}

export function validateDeployTopology(value) {
  const issues = [];
  const topKeys = [
    "schemaVersion",
    "decisionId",
    "status",
    "releaseProfile",
    "launchBlocked",
    "currentPublicSurface",
    "authority",
    "runtime",
    "database",
    "worker",
    "edge",
    "operations",
    "costControls",
    "activationGates"
  ];
  if (!exactKeys(value, topKeys, "topology", issues)) {
    throw new DeployTopologyError(issues);
  }

  exact(value.schemaVersion, "ipo.one.deploy-topology/v1", "topology.schemaVersion", issues);
  exact(value.decisionId, "DEPLOY-001", "topology.decisionId", issues);
  exact(value.status, "local_preflight", "topology.status", issues);
  exact(value.releaseProfile, "closed_non_funds_pilot", "topology.releaseProfile", issues);
  exact(value.launchBlocked, true, "topology.launchBlocked", issues);

  if (exactKeys(value.currentPublicSurface, [
    "provider",
    "project",
    "profile",
    "stateModel",
    "privatePilotAttached",
    "unchangedByDeploy001"
  ], "topology.currentPublicSurface", issues)) {
    exact(value.currentPublicSurface.provider, "vercel", "topology.currentPublicSurface.provider", issues);
    exact(value.currentPublicSurface.project, "ipo-one-internal", "topology.currentPublicSurface.project", issues);
    exact(value.currentPublicSurface.profile, "public_sandbox", "topology.currentPublicSurface.profile", issues);
    exact(
      value.currentPublicSurface.stateModel,
      "process_local_ephemeral",
      "topology.currentPublicSurface.stateModel",
      issues
    );
    exact(
      value.currentPublicSurface.privatePilotAttached,
      false,
      "topology.currentPublicSurface.privatePilotAttached",
      issues
    );
    exact(
      value.currentPublicSurface.unchangedByDeploy001,
      true,
      "topology.currentPublicSurface.unchangedByDeploy001",
      issues
    );
  }

  allFalse(value.authority, AUTHORITY_KEYS, "topology.authority", issues);

  if (exactKeys(value.runtime, [
    "providerDecisionState",
    "shape",
    "entrypoint",
    "nodeVersion",
    "ingress",
    "minimumInstances",
    "maximumInstances",
    "canonicalState",
    "processLocalPrivateStateAllowed",
    "signerEnabled"
  ], "topology.runtime", issues)) {
    exact(
      value.runtime.providerDecisionState,
      "human_review_required",
      "topology.runtime.providerDecisionState",
      issues
    );
    exact(value.runtime.shape, "single_oci_container", "topology.runtime.shape", issues);
    exact(
      value.runtime.entrypoint,
      "apps/private-pilot/src/start-production.js",
      "topology.runtime.entrypoint",
      issues
    );
    exact(value.runtime.nodeVersion, "26.5.0", "topology.runtime.nodeVersion", issues);
    exact(value.runtime.ingress, "disabled", "topology.runtime.ingress", issues);
    exact(value.runtime.minimumInstances, 0, "topology.runtime.minimumInstances", issues);
    exact(value.runtime.maximumInstances, 1, "topology.runtime.maximumInstances", issues);
    exact(value.runtime.canonicalState, "managed_postgresql", "topology.runtime.canonicalState", issues);
    exact(
      value.runtime.processLocalPrivateStateAllowed,
      false,
      "topology.runtime.processLocalPrivateStateAllowed",
      issues
    );
    exact(value.runtime.signerEnabled, false, "topology.runtime.signerEnabled", issues);
  }

  if (exactKeys(value.database, [
    "providerDecisionState",
    "shape",
    "majorVersion",
    "requiredRoles",
    "forcedTenantRls",
    "encryptedTransport",
    "connectionPoolingRequired",
    "automatedBackups",
    "pointInTimeRecovery",
    "restoreDrillRequired",
    "publicUnauthenticatedAccess"
  ], "topology.database", issues)) {
    exact(
      value.database.providerDecisionState,
      "human_review_required",
      "topology.database.providerDecisionState",
      issues
    );
    exact(value.database.shape, "managed_postgresql", "topology.database.shape", issues);
    exact(value.database.majorVersion, 17, "topology.database.majorVersion", issues);
    exactArray(
      value.database.requiredRoles,
      ["migrator", "gateway", "authentication"],
      "topology.database.requiredRoles",
      issues
    );
    for (const key of [
      "forcedTenantRls",
      "encryptedTransport",
      "connectionPoolingRequired",
      "automatedBackups",
      "pointInTimeRecovery",
      "restoreDrillRequired"
    ]) {
      exact(value.database[key], true, `topology.database.${key}`, issues);
    }
    exact(
      value.database.publicUnauthenticatedAccess,
      false,
      "topology.database.publicUnauthenticatedAccess",
      issues
    );
  }

  if (exactKeys(value.worker, [
    "providerDecisionState",
    "shape",
    "activation",
    "responsibilities",
    "leaseAndIdempotencyRequired",
    "signerEnabled"
  ], "topology.worker", issues)) {
    exact(
      value.worker.providerDecisionState,
      "human_review_required",
      "topology.worker.providerDecisionState",
      issues
    );
    exact(value.worker.shape, "same_release_separate_process", "topology.worker.shape", issues);
    exact(value.worker.activation, "disabled", "topology.worker.activation", issues);
    exactArray(
      value.worker.responsibilities,
      WORKER_RESPONSIBILITIES,
      "topology.worker.responsibilities",
      issues
    );
    exact(
      value.worker.leaseAndIdempotencyRequired,
      true,
      "topology.worker.leaseAndIdempotencyRequired",
      issues
    );
    exact(value.worker.signerEnabled, false, "topology.worker.signerEnabled", issues);
  }

  if (exactKeys(value.edge, [
    "webProvider",
    "privateApiShape",
    "activation",
    "httpsRequired",
    "directRuntimeOriginDenied",
    "edgeAssertionRequired"
  ], "topology.edge", issues)) {
    exact(value.edge.webProvider, "vercel", "topology.edge.webProvider", issues);
    exact(value.edge.privateApiShape, "same_origin_reverse_proxy", "topology.edge.privateApiShape", issues);
    exact(value.edge.activation, "disabled", "topology.edge.activation", issues);
    exact(value.edge.httpsRequired, true, "topology.edge.httpsRequired", issues);
    exact(
      value.edge.directRuntimeOriginDenied,
      true,
      "topology.edge.directRuntimeOriginDenied",
      issues
    );
    exact(value.edge.edgeAssertionRequired, true, "topology.edge.edgeAssertionRequired", issues);
  }

  allTrue(value.operations, [
    "backupRestoreRequired",
    "reconciliationRequired",
    "syntheticsRequired",
    "alertDeliveryRequired",
    "namedIncidentOwnerRequired",
    "rollbackReceiptRequired"
  ], "topology.operations", issues);

  if (exactKeys(value.costControls, [
    "databaseSizing",
    "scaleToZeroBeforeCohort",
    "redisEnabled",
    "kubernetesEnabled",
    "dataWarehouseEnabled",
    "multiCloudFailoverEnabled",
    "mainnetIndexerEnabled"
  ], "topology.costControls", issues)) {
    exact(
      value.costControls.databaseSizing,
      "smallest_pitr_capable",
      "topology.costControls.databaseSizing",
      issues
    );
    exact(
      value.costControls.scaleToZeroBeforeCohort,
      true,
      "topology.costControls.scaleToZeroBeforeCohort",
      issues
    );
    for (const key of [
      "redisEnabled",
      "kubernetesEnabled",
      "dataWarehouseEnabled",
      "multiCloudFailoverEnabled",
      "mainnetIndexerEnabled"
    ]) {
      exact(value.costControls[key], false, `topology.costControls.${key}`, issues);
    }
  }

  exactArray(value.activationGates, ACTIVATION_GATES, "topology.activationGates", issues);

  if (issues.length > 0) throw new DeployTopologyError(issues);
  return value;
}

export function parseDeployTopology(text) {
  let value;
  try {
    value = parseCanonicalJson(text, "DEPLOY-001 topology");
  } catch (error) {
    if (error instanceof LaunchEvidenceError) {
      throw new DeployTopologyError([error.message]);
    }
    throw error;
  }
  return validateDeployTopology(value);
}

export function validateProviderSelection(value) {
  const issues = [];
  const topKeys = [
    "schemaVersion",
    "decisionId",
    "pricingObservedAt",
    "status",
    "provisioningBlocked",
    "recommendation",
    "authority",
    "compatibility",
    "options",
    "approvalInputs"
  ];
  if (!exactKeys(value, topKeys, "providerSelection", issues)) {
    throw new ProviderSelectionError(issues);
  }

  exact(
    value.schemaVersion,
    "ipo.one.deploy-provider-selection/v1",
    "providerSelection.schemaVersion",
    issues
  );
  exact(value.decisionId, "DEPLOY-001B", "providerSelection.decisionId", issues);
  exact(value.pricingObservedAt, "2026-07-27", "providerSelection.pricingObservedAt", issues);
  exact(
    value.status,
    "recommended_pending_founder_approval",
    "providerSelection.status",
    issues
  );
  exact(value.provisioningBlocked, true, "providerSelection.provisioningBlocked", issues);

  if (exactKeys(value.recommendation, [
    "optionId",
    "webProvider",
    "databaseProvider",
    "databasePlan",
    "runtimeProvider",
    "workerShape",
    "databaseConnectionMode",
    "runtimeMinimumInstances",
    "runtimeMaximumInstances",
    "workerActivation",
    "regionDecisionState"
  ], "providerSelection.recommendation", issues)) {
    exact(
      value.recommendation.optionId,
      "vercel_neon_cloud_run",
      "providerSelection.recommendation.optionId",
      issues
    );
    exact(value.recommendation.webProvider, "vercel", "providerSelection.recommendation.webProvider", issues);
    exact(
      value.recommendation.databaseProvider,
      "neon",
      "providerSelection.recommendation.databaseProvider",
      issues
    );
    exact(
      value.recommendation.databasePlan,
      "launch",
      "providerSelection.recommendation.databasePlan",
      issues
    );
    exact(
      value.recommendation.runtimeProvider,
      "google_cloud_run",
      "providerSelection.recommendation.runtimeProvider",
      issues
    );
    exact(
      value.recommendation.workerShape,
      "google_cloud_run_jobs_and_scheduler",
      "providerSelection.recommendation.workerShape",
      issues
    );
    exact(
      value.recommendation.databaseConnectionMode,
      "direct_tls_application_pool",
      "providerSelection.recommendation.databaseConnectionMode",
      issues
    );
    exact(
      value.recommendation.runtimeMinimumInstances,
      0,
      "providerSelection.recommendation.runtimeMinimumInstances",
      issues
    );
    exact(
      value.recommendation.runtimeMaximumInstances,
      1,
      "providerSelection.recommendation.runtimeMaximumInstances",
      issues
    );
    exact(
      value.recommendation.workerActivation,
      "disabled",
      "providerSelection.recommendation.workerActivation",
      issues
    );
    exact(
      value.recommendation.regionDecisionState,
      "founder_approval_required",
      "providerSelection.recommendation.regionDecisionState",
      issues
    );
  }

  allFalse(value.authority, PROVIDER_AUTHORITY_KEYS, "providerSelection.authority", issues);

  if (exactKeys(value.compatibility, [
    "postgresMajorVersion",
    "nodeVersion",
    "applicationPoolRequired",
    "providerTransactionPoolAllowed",
    "transactionLocalTenantContextRequired",
    "advisoryLocksRequired",
    "skipLockedLeasesRequired",
    "privateApiDatabaseAccessOnly",
    "vercelDirectDatabaseAccessAllowed"
  ], "providerSelection.compatibility", issues)) {
    exact(
      value.compatibility.postgresMajorVersion,
      17,
      "providerSelection.compatibility.postgresMajorVersion",
      issues
    );
    exact(value.compatibility.nodeVersion, "26.5.0", "providerSelection.compatibility.nodeVersion", issues);
    for (const key of [
      "applicationPoolRequired",
      "transactionLocalTenantContextRequired",
      "advisoryLocksRequired",
      "skipLockedLeasesRequired",
      "privateApiDatabaseAccessOnly"
    ]) {
      exact(value.compatibility[key], true, `providerSelection.compatibility.${key}`, issues);
    }
    for (const key of [
      "providerTransactionPoolAllowed",
      "vercelDirectDatabaseAccessAllowed"
    ]) {
      exact(value.compatibility[key], false, `providerSelection.compatibility.${key}`, issues);
    }
  }

  if (!Array.isArray(value.options) || value.options.length !== PROVIDER_OPTIONS.length) {
    issues.push("providerSelection.options must contain the reviewed ordered option set.");
  } else {
    value.options.forEach((option, index) => {
      const expected = PROVIDER_OPTIONS[index];
      const path = `providerSelection.options[${index}]`;
      if (exactKeys(option, ["id", "decision", "score", "reason"], path, issues)) {
        exact(option.id, expected.id, `${path}.id`, issues);
        exact(option.decision, expected.decision, `${path}.decision`, issues);
        exact(option.score, expected.score, `${path}.score`, issues);
        boundedString(option.reason, `${path}.reason`, issues);
      }
    });
  }

  exactArray(
    value.approvalInputs,
    PROVIDER_APPROVAL_INPUTS,
    "providerSelection.approvalInputs",
    issues
  );

  if (issues.length > 0) throw new ProviderSelectionError(issues);
  return value;
}

export function parseProviderSelection(text) {
  let value;
  try {
    value = parseCanonicalJson(text, "DEPLOY-001B provider recommendation");
  } catch (error) {
    if (error instanceof LaunchEvidenceError) {
      throw new ProviderSelectionError([error.message]);
    }
    throw error;
  }
  return validateProviderSelection(value);
}

export function validateLocalStack(value) {
  const issues = [];
  const topKeys = [
    "schemaVersion",
    "decisionId",
    "status",
    "profile",
    "launchBlocked",
    "virtualization",
    "database",
    "pilot",
    "worker",
    "authority",
    "acceptance"
  ];
  if (!exactKeys(value, topKeys, "localStack", issues)) {
    throw new LocalStackError(issues);
  }
  exact(value.schemaVersion, "ipo.one.local-stack/v1", "localStack.schemaVersion", issues);
  exact(value.decisionId, "LOCAL-STACK-001", "localStack.decisionId", issues);
  exact(value.status, "implemented_local_only", "localStack.status", issues);
  exact(value.profile, "local_no_funds", "localStack.profile", issues);
  exact(value.launchBlocked, true, "localStack.launchBlocked", issues);

  if (exactKeys(value.virtualization, [
    "provider",
    "instance",
    "cpus",
    "memoryGiB",
    "diskGiB",
    "containerEngine",
    "compose",
    "portForwarding"
  ], "localStack.virtualization", issues)) {
    exact(value.virtualization.provider, "lima", "localStack.virtualization.provider", issues);
    exact(value.virtualization.instance, "ipo-one-local", "localStack.virtualization.instance", issues);
    exact(value.virtualization.cpus, 4, "localStack.virtualization.cpus", issues);
    exact(value.virtualization.memoryGiB, 6, "localStack.virtualization.memoryGiB", issues);
    exact(value.virtualization.diskGiB, 40, "localStack.virtualization.diskGiB", issues);
    exact(
      value.virtualization.containerEngine,
      "docker_rootless",
      "localStack.virtualization.containerEngine",
      issues
    );
    exact(value.virtualization.compose, "v2", "localStack.virtualization.compose", issues);
    exact(
      value.virtualization.portForwarding,
      "lima_hostagent_loopback_only",
      "localStack.virtualization.portForwarding",
      issues
    );
  }

  if (exactKeys(value.database, [
    "image",
    "majorVersion",
    "patchVersion",
    "database",
    "guestAddress",
    "guestPort",
    "macHostPublished",
    "persistentVolume",
    "ownerRuntimeUse"
  ], "localStack.database", issues)) {
    exact(
      value.database.image,
      "postgres@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394",
      "localStack.database.image",
      issues
    );
    exact(value.database.majorVersion, 17, "localStack.database.majorVersion", issues);
    exact(value.database.patchVersion, "17.10", "localStack.database.patchVersion", issues);
    exact(value.database.database, "ipo_one_private_pilot", "localStack.database.database", issues);
    exact(value.database.guestAddress, "127.0.0.2", "localStack.database.guestAddress", issues);
    exact(value.database.guestPort, 55432, "localStack.database.guestPort", issues);
    exact(value.database.macHostPublished, false, "localStack.database.macHostPublished", issues);
    exact(value.database.persistentVolume, true, "localStack.database.persistentVolume", issues);
    exact(
      value.database.ownerRuntimeUse,
      "bootstrap_only",
      "localStack.database.ownerRuntimeUse",
      issues
    );
  }

  if (exactKeys(value.pilot, [
    "image",
    "nodeVersion",
    "entrypoint",
    "hostBinding",
    "ports",
    "syntheticDataOnly",
    "processLocalCanonicalStateAllowed"
  ], "localStack.pilot", issues)) {
    exact(value.pilot.image, "ipo-one-local:node-26.5.0", "localStack.pilot.image", issues);
    exact(value.pilot.nodeVersion, "26.5.0", "localStack.pilot.nodeVersion", issues);
    exact(
      value.pilot.entrypoint,
      "apps/private-pilot/src/start.js",
      "localStack.pilot.entrypoint",
      issues
    );
    exact(value.pilot.hostBinding, "127.0.0.1", "localStack.pilot.hostBinding", issues);
    exactArray(value.pilot.ports, [8787, 8788, 8789], "localStack.pilot.ports", issues);
    exact(value.pilot.syntheticDataOnly, true, "localStack.pilot.syntheticDataOnly", issues);
    exact(
      value.pilot.processLocalCanonicalStateAllowed,
      false,
      "localStack.pilot.processLocalCanonicalStateAllowed",
      issues
    );
  }

  if (exactKeys(value.worker, [
    "image",
    "entrypoint",
    "shape",
    "syntheticOutboxSink",
    "leaseAndIdempotencyRequired",
    "reconciliationRequired",
    "signerEnabled"
  ], "localStack.worker", issues)) {
    exact(value.worker.image, "ipo-one-local:node-26.5.0", "localStack.worker.image", issues);
    exact(
      value.worker.entrypoint,
      "apps/private-pilot/src/local-worker.js",
      "localStack.worker.entrypoint",
      issues
    );
    exact(value.worker.shape, "separate_container", "localStack.worker.shape", issues);
    exact(value.worker.syntheticOutboxSink, true, "localStack.worker.syntheticOutboxSink", issues);
    exact(
      value.worker.leaseAndIdempotencyRequired,
      true,
      "localStack.worker.leaseAndIdempotencyRequired",
      issues
    );
    exact(
      value.worker.reconciliationRequired,
      true,
      "localStack.worker.reconciliationRequired",
      issues
    );
    exact(value.worker.signerEnabled, false, "localStack.worker.signerEnabled", issues);
  }

  allFalse(value.authority, LOCAL_STACK_AUTHORITY_KEYS, "localStack.authority", issues);

  if (exactKeys(value.acceptance, [
    "databaseMigrations",
    "leastPrivilegeRlsRole",
    "humanWorkspace",
    "agentControllerWorkspace",
    "riskWorkspace",
    "workerHeartbeat",
    "outboxDelivery",
    "reconciliation",
    "restartRecovery",
    "repositoryQualityGate"
  ], "localStack.acceptance", issues)) {
    for (const key of Object.keys(value.acceptance)) {
      exact(value.acceptance[key], true, `localStack.acceptance.${key}`, issues);
    }
  }

  if (issues.length > 0) throw new LocalStackError(issues);
  return value;
}

export function parseLocalStack(text) {
  let value;
  try {
    value = parseCanonicalJson(text, "LOCAL-STACK-001 contract");
  } catch (error) {
    if (error instanceof LaunchEvidenceError) {
      throw new LocalStackError([error.message]);
    }
    throw error;
  }
  return validateLocalStack(value);
}

const OPS_AUTHORITY_KEYS = Object.freeze([
  "cloudMutationEnabled",
  "remoteParticipantAccessEnabled",
  "scheduleActivationEnabled",
  "notificationDeliveryEnabled",
  "secretWriteEnabled",
  "realFundsEnabled",
  "humanCreditEnabled",
  "externalProviderExecutionEnabled",
  "venueSignerEnabled",
  "publicSignupEnabled"
]);

const OPS_WORKER_RESPONSIBILITIES = WORKER_RESPONSIBILITIES;

const OPS_APPROVAL_INPUTS = Object.freeze([
  "pilot_region",
  "monthly_cost_ceiling_usd",
  "billing_owner",
  "provider_account_owner",
  "public_tls_database_risk_acceptance",
  "rpo_minutes",
  "rto_minutes",
  "restore_drill_owner",
  "incident_owner",
  "alert_delivery_provider",
  "notification_recipients",
  "secret_manager",
  "credential_rotation_owner",
  "rollback_owner"
]);

const OPS_ACTIVATION_GATES = Object.freeze([
  "DEPLOY-001B-FOUNDER-APPROVAL",
  "OPS-004-NAMED-OWNERS",
  "OPS-004-RESTORE-DRILL",
  "OPS-004-RECONCILIATION-DRILL",
  "OPS-004-SYNTHETIC-DRILL",
  "OPS-004-ALERT-DELIVERY-DRILL",
  "OPS-004-KEY-ROTATION-DRILL",
  "OPS-004-ROLLBACK-DRILL",
  "SECURITY-INDEPENDENT-REVIEW",
  "PRIVACY-PILOT-REVIEW",
  "DEPLOYMENT-HUMAN-APPROVAL",
  "LAUNCH-POLICY-REVISION"
]);

const OPS_SEALED_COMMIT = "3a466c4a3267923de96f4c31c1f1d2b1531e73c6";
const OPS_SEALED_MANIFEST_SHA =
  "cbe736a80860f718350d8289b72d8f589176bbce0e9d16f792b1dd9d277a36ad";

export class ClosedPilotOperationsError extends Error {
  constructor(issues) {
    super("OPS-004 closed-pilot operations contract is invalid.");
    this.name = "ClosedPilotOperationsError";
    this.issues = Object.freeze([...issues]);
  }
}

export function validateClosedPilotOperations(value) {
  const issues = [];
  if (!exactKeys(value, [
    "schemaVersion",
    "decisionId",
    "status",
    "profile",
    "launchBlocked",
    "sourceRelease",
    "authority",
    "databaseRecovery",
    "workerOperations",
    "reconciliation",
    "synthetics",
    "alerting",
    "secrets",
    "rollback",
    "approvalInputs",
    "activationGates",
    "satisfiedActivationGates",
    "runbooks"
  ], "operations", issues)) {
    throw new ClosedPilotOperationsError(issues);
  }

  exact(
    value.schemaVersion,
    "ipo.one.closed-pilot-operations/v1",
    "operations.schemaVersion",
    issues
  );
  exact(value.decisionId, "OPS-004", "operations.decisionId", issues);
  exact(
    value.status,
    "local_preflight_pending_named_approval",
    "operations.status",
    issues
  );
  exact(value.profile, "closed_non_funds_pilot", "operations.profile", issues);
  exact(value.launchBlocked, true, "operations.launchBlocked", issues);

  if (exactKeys(value.sourceRelease, [
    "releaseCandidateId",
    "commitSha",
    "manifestPath",
    "manifestSha256"
  ], "operations.sourceRelease", issues)) {
    exact(
      value.sourceRelease.releaseCandidateId,
      "ipo-one-local-rc-20260729-001",
      "operations.sourceRelease.releaseCandidateId",
      issues
    );
    exact(
      value.sourceRelease.commitSha,
      OPS_SEALED_COMMIT,
      "operations.sourceRelease.commitSha",
      issues
    );
    exact(
      value.sourceRelease.manifestPath,
      "deploy/local/release-candidate.v1.json",
      "operations.sourceRelease.manifestPath",
      issues
    );
    exact(
      value.sourceRelease.manifestSha256,
      OPS_SEALED_MANIFEST_SHA,
      "operations.sourceRelease.manifestSha256",
      issues
    );
  }

  allFalse(value.authority, OPS_AUTHORITY_KEYS, "operations.authority", issues);

  if (exactKeys(value.databaseRecovery, [
    "providerDecisionState",
    "automatedBackupsRequired",
    "pointInTimeRecoveryRequired",
    "destructiveRestoreIntoCanonicalDatabaseAllowed",
    "restoreTarget",
    "restoreDrillActivation",
    "restoreEvidenceRequired",
    "rpoMinutes",
    "rtoMinutes",
    "objectivesDecisionState"
  ], "operations.databaseRecovery", issues)) {
    exact(
      value.databaseRecovery.providerDecisionState,
      "founder_approval_required",
      "operations.databaseRecovery.providerDecisionState",
      issues
    );
    exact(
      value.databaseRecovery.automatedBackupsRequired,
      true,
      "operations.databaseRecovery.automatedBackupsRequired",
      issues
    );
    exact(
      value.databaseRecovery.pointInTimeRecoveryRequired,
      true,
      "operations.databaseRecovery.pointInTimeRecoveryRequired",
      issues
    );
    exact(
      value.databaseRecovery.destructiveRestoreIntoCanonicalDatabaseAllowed,
      false,
      "operations.databaseRecovery.destructiveRestoreIntoCanonicalDatabaseAllowed",
      issues
    );
    exact(
      value.databaseRecovery.restoreTarget,
      "ephemeral_isolated_database",
      "operations.databaseRecovery.restoreTarget",
      issues
    );
    exact(
      value.databaseRecovery.restoreDrillActivation,
      "disabled",
      "operations.databaseRecovery.restoreDrillActivation",
      issues
    );
    exact(
      value.databaseRecovery.restoreEvidenceRequired,
      true,
      "operations.databaseRecovery.restoreEvidenceRequired",
      issues
    );
    exact(value.databaseRecovery.rpoMinutes, null, "operations.databaseRecovery.rpoMinutes", issues);
    exact(value.databaseRecovery.rtoMinutes, null, "operations.databaseRecovery.rtoMinutes", issues);
    exact(
      value.databaseRecovery.objectivesDecisionState,
      "founder_approval_required",
      "operations.databaseRecovery.objectivesDecisionState",
      issues
    );
  }

  if (exactKeys(value.workerOperations, [
    "activation",
    "scheduleProviderDecisionState",
    "responsibilities",
    "leaseAndIdempotencyRequired",
    "overlappingRunsAllowed",
    "automaticRepairAllowed",
    "boundedRetryRequired"
  ], "operations.workerOperations", issues)) {
    exact(value.workerOperations.activation, "disabled", "operations.workerOperations.activation", issues);
    exact(
      value.workerOperations.scheduleProviderDecisionState,
      "founder_approval_required",
      "operations.workerOperations.scheduleProviderDecisionState",
      issues
    );
    exactArray(
      value.workerOperations.responsibilities,
      OPS_WORKER_RESPONSIBILITIES,
      "operations.workerOperations.responsibilities",
      issues
    );
    exact(
      value.workerOperations.leaseAndIdempotencyRequired,
      true,
      "operations.workerOperations.leaseAndIdempotencyRequired",
      issues
    );
    exact(
      value.workerOperations.overlappingRunsAllowed,
      false,
      "operations.workerOperations.overlappingRunsAllowed",
      issues
    );
    exact(
      value.workerOperations.automaticRepairAllowed,
      false,
      "operations.workerOperations.automaticRepairAllowed",
      issues
    );
    exact(
      value.workerOperations.boundedRetryRequired,
      true,
      "operations.workerOperations.boundedRetryRequired",
      issues
    );
  }

  if (exactKeys(value.reconciliation, [
    "scheduleActivation",
    "canonicalState",
    "unknownOutcomeResolutionRequired",
    "manualRepairApprovalRequired",
    "immutableEvidenceRequired"
  ], "operations.reconciliation", issues)) {
    exact(value.reconciliation.scheduleActivation, "disabled", "operations.reconciliation.scheduleActivation", issues);
    exact(value.reconciliation.canonicalState, "postgresql", "operations.reconciliation.canonicalState", issues);
    for (const key of [
      "unknownOutcomeResolutionRequired",
      "manualRepairApprovalRequired",
      "immutableEvidenceRequired"
    ]) {
      exact(value.reconciliation[key], true, `operations.reconciliation.${key}`, issues);
    }
  }

  if (exactKeys(value.synthetics, [
    "scheduleActivation",
    "scopes",
    "syntheticOnly",
    "noFunds",
    "failureBlocksLaunch"
  ], "operations.synthetics", issues)) {
    exact(value.synthetics.scheduleActivation, "disabled", "operations.synthetics.scheduleActivation", issues);
    exactArray(
      value.synthetics.scopes,
      ["human_full_lifecycle", "agent_full_lifecycle", "reconciliation"],
      "operations.synthetics.scopes",
      issues
    );
    for (const key of ["syntheticOnly", "noFunds", "failureBlocksLaunch"]) {
      exact(value.synthetics[key], true, `operations.synthetics.${key}`, issues);
    }
  }

  if (exactKeys(value.alerting, [
    "deliveryActivation",
    "providerDecisionState",
    "namedRecipientsConfigured",
    "incidentOwnerConfigured",
    "restoreOwnerConfigured",
    "acknowledgementAndResolutionAuthorityEnabled",
    "piiFreeLowCardinalitySignalsRequired"
  ], "operations.alerting", issues)) {
    exact(value.alerting.deliveryActivation, "disabled", "operations.alerting.deliveryActivation", issues);
    exact(
      value.alerting.providerDecisionState,
      "founder_approval_required",
      "operations.alerting.providerDecisionState",
      issues
    );
    for (const key of [
      "namedRecipientsConfigured",
      "incidentOwnerConfigured",
      "restoreOwnerConfigured",
      "acknowledgementAndResolutionAuthorityEnabled"
    ]) {
      exact(value.alerting[key], false, `operations.alerting.${key}`, issues);
    }
    exact(
      value.alerting.piiFreeLowCardinalitySignalsRequired,
      true,
      "operations.alerting.piiFreeLowCardinalitySignalsRequired",
      issues
    );
  }

  if (exactKeys(value.secrets, [
    "managerDecisionState",
    "browserSecretExposureAllowed",
    "vercelDirectDatabaseSecretAllowed",
    "runtimeSecretInjectionActivation",
    "rotationActivation",
    "rotationDrillRequired",
    "longLivedCloudKeyAllowed"
  ], "operations.secrets", issues)) {
    exact(value.secrets.managerDecisionState, "founder_approval_required", "operations.secrets.managerDecisionState", issues);
    exact(value.secrets.browserSecretExposureAllowed, false, "operations.secrets.browserSecretExposureAllowed", issues);
    exact(value.secrets.vercelDirectDatabaseSecretAllowed, false, "operations.secrets.vercelDirectDatabaseSecretAllowed", issues);
    exact(value.secrets.runtimeSecretInjectionActivation, "disabled", "operations.secrets.runtimeSecretInjectionActivation", issues);
    exact(value.secrets.rotationActivation, "disabled", "operations.secrets.rotationActivation", issues);
    exact(value.secrets.rotationDrillRequired, true, "operations.secrets.rotationDrillRequired", issues);
    exact(value.secrets.longLivedCloudKeyAllowed, false, "operations.secrets.longLivedCloudKeyAllowed", issues);
  }

  if (exactKeys(value.rollback, [
    "activation",
    "strategy",
    "previousCommit",
    "databaseRollbackStrategy",
    "automaticDatabaseRollbackAllowed",
    "preserveCanonicalEvents",
    "preserveEvidence",
    "preserveIdempotency",
    "rollbackReceiptRequired"
  ], "operations.rollback", issues)) {
    exact(value.rollback.activation, "disabled", "operations.rollback.activation", issues);
    exact(value.rollback.strategy, "redeploy_previous_immutable_commit", "operations.rollback.strategy", issues);
    exact(value.rollback.previousCommit, OPS_SEALED_COMMIT, "operations.rollback.previousCommit", issues);
    exact(value.rollback.databaseRollbackStrategy, "forward_only_reviewed_migration", "operations.rollback.databaseRollbackStrategy", issues);
    exact(value.rollback.automaticDatabaseRollbackAllowed, false, "operations.rollback.automaticDatabaseRollbackAllowed", issues);
    for (const key of [
      "preserveCanonicalEvents",
      "preserveEvidence",
      "preserveIdempotency",
      "rollbackReceiptRequired"
    ]) {
      exact(value.rollback[key], true, `operations.rollback.${key}`, issues);
    }
  }

  exactArray(value.approvalInputs, OPS_APPROVAL_INPUTS, "operations.approvalInputs", issues);
  exactArray(value.activationGates, OPS_ACTIVATION_GATES, "operations.activationGates", issues);
  exactArray(value.satisfiedActivationGates, [], "operations.satisfiedActivationGates", issues);

  if (exactKeys(value.runbooks, ["operations", "task"], "operations.runbooks", issues)) {
    exact(
      value.runbooks.operations,
      "docs/security/IPO_ONE_CLOSED_PILOT_OPERATIONS_RUNBOOK_v0.1.md",
      "operations.runbooks.operations",
      issues
    );
    exact(
      value.runbooks.task,
      "docs/codex/tasks/OPS_004_HOSTED_OPERATIONS_RECOVERY_BASELINE.md",
      "operations.runbooks.task",
      issues
    );
  }

  if (issues.length > 0) throw new ClosedPilotOperationsError(issues);
  return value;
}

export function parseClosedPilotOperations(text) {
  let value;
  try {
    value = parseCanonicalJson(text, "OPS-004 closed-pilot operations contract");
  } catch (error) {
    if (error instanceof LaunchEvidenceError) {
      throw new ClosedPilotOperationsError([error.message]);
    }
    throw error;
  }
  return validateClosedPilotOperations(value);
}
