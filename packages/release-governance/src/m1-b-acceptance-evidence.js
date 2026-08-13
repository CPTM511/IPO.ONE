const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[a-z][a-z0-9_]{2,63}$/;
const ARTIFACT_PATH = /^output\/playwright\/m1-b-p0-5\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

const ROLES = Object.freeze([
  "human",
  "principal_agent",
  "capital_partner",
  "risk_operations"
]);
const BROWSER_CHECKS = Object.freeze([
  "desktop",
  "mobile",
  "reload",
  "fresh_browser_context",
  "back_forward",
  "sign_out_relogin",
  "negative_authorization",
  "restart_recovery"
]);
const JOURNEY_STEPS = Object.freeze({
  human: Object.freeze([
    "sign_in",
    "subject_consent",
    "credit_request",
    "decision_offer",
    "reload_relogin",
    "offer_recovery",
    "acceptance",
    "obligation",
    "controlled_sandbox_execution",
    "repayment",
    "evidence"
  ]),
  principal_agent: Object.freeze([
    "principal_sign_in",
    "agent_subject",
    "account_proof",
    "mandate",
    "agent_application",
    "offer",
    "acceptance",
    "mcp_execution",
    "repayment",
    "evidence",
    "restart_recovery"
  ]),
  capital_partner: Object.freeze([
    "partner_sign_in",
    "passport_review",
    "author_offer",
    "replace_offer",
    "withdraw_offer",
    "borrower_recovers_current_offer"
  ]),
  risk_operations: Object.freeze([
    "risk_sign_in",
    "portfolio_queue_recovery",
    "protective_control",
    "audit_evidence"
  ])
});
const NEGATIVE_CASES = Object.freeze({
  human: Object.freeze([
    "expired_offer",
    "replaced_stale_offer",
    "duplicate_acceptance",
    "unauthorized_subject",
    "wrong_tenant",
    "changed_version",
    "invalid_acceptance_binding"
  ]),
  agent: Object.freeze([
    "wrong_provider",
    "wrong_provider_category",
    "stale_mandate",
    "revoked_mandate",
    "out_of_scope_facility",
    "replay_invalid_execution"
  ]),
  authorization: Object.freeze([
    "signed_out_private_read",
    "cross_role_private_read",
    "wrong_tenant_private_read"
  ])
});
const ARTIFACT_KINDS = new Set([
  "playwright_trace",
  "screenshot",
  "browser_audit",
  "runtime_receipt",
  "postgres_receipt",
  "restart_log",
  "negative_receipt",
  "agent_mcp_receipt",
  "release_identity"
]);
const ARTIFACT_SOURCES = new Set([
  "local_exact_commit",
  "hosted_exact_commit"
]);
const HOSTED_DEPLOYMENT_ROLES = Object.freeze(["primary", "risk"]);
const REAL_BROWSER_DRIVERS = new Set(["playwright_cli", "chrome_control"]);
const BROWSER_ARTIFACT_KINDS = new Set([
  "playwright_trace",
  "screenshot",
  "browser_audit"
]);
const RUNTIME_ARTIFACT_KINDS = new Set([
  "runtime_receipt",
  "postgres_receipt"
]);

export class M1BAcceptanceEvidenceError extends Error {
  constructor(issues) {
    super("M1-B P0-5 acceptance Evidence is invalid.");
    this.name = "M1BAcceptanceEvidenceError";
    this.issues = Object.freeze([...issues]);
  }
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, path, issues) {
  if (!record(value)) {
    issues.push(`${path} must be an object.`);
    return false;
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) issues.push(`${path}.${key} is required.`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) issues.push(`${path}.${key} is not allowed.`);
  }
  return true;
}

function exact(value, expected, path, issues) {
  if (value !== expected) issues.push(`${path} must be ${JSON.stringify(expected)}.`);
}

function pattern(value, expected, path, issues) {
  if (typeof value !== "string" || !expected.test(value)) {
    issues.push(`${path} has an invalid format.`);
  }
}

function timestamp(value, path, issues) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    issues.push(`${path} must be an ISO 8601 UTC timestamp with millisecond precision.`);
  }
}

function artifactReferences(
  value,
  path,
  artifactsById,
  issues,
  { requiredKindSets = [], allowedSources, requireSingleSource = false } = {}
) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    issues.push(`${path} must contain one to 32 artifact IDs.`);
    return;
  }
  const seen = new Set();
  value.forEach((artifactId, index) => {
    pattern(artifactId, ID, `${path}[${index}]`, issues);
    if (seen.has(artifactId)) issues.push(`${path} duplicates ${artifactId}.`);
    seen.add(artifactId);
    if (!artifactsById.has(artifactId)) {
      issues.push(`${path} references unknown artifact ${artifactId}.`);
    }
  });
  const artifacts = value
    .map((artifactId) => artifactsById.get(artifactId))
    .filter(Boolean);
  for (const kinds of requiredKindSets) {
    if (!artifacts.some((artifact) => kinds.has(artifact.kind))) {
      issues.push(
        `${path} must reference an artifact of kind ${[...kinds].join(" or ")}.`
      );
    }
  }
  if (
    allowedSources &&
    artifacts.some((artifact) => !allowedSources.has(artifact.sourceRuntime))
  ) {
    issues.push(`${path} references an artifact from an incompatible runtime source.`);
  }
  if (
    requireSingleSource &&
    new Set(artifacts.map((artifact) => artifact.sourceRuntime)).size !== 1
  ) {
    issues.push(`${path} must use one aligned runtime source.`);
  }
}

function exactHttpsOrigin(value, path, issues) {
  let url;
  try {
    url = new URL(value);
  } catch {
    issues.push(`${path} must be an absolute HTTPS origin.`);
    return null;
  }
  const forbiddenHost =
    url.hostname === "localhost" ||
    url.hostname === "0.0.0.0" ||
    url.hostname === "::1" ||
    /^127\./.test(url.hostname) ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".invalid");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    forbiddenHost
  ) {
    issues.push(`${path} must be a non-loopback HTTPS origin without credentials, query, or fragment.`);
    return null;
  }
  return url;
}

function sameOriginPath(value, origin, pathname, path, issues) {
  let url;
  try {
    url = new URL(value);
  } catch {
    issues.push(`${path} must be an absolute HTTPS URL.`);
    return;
  }
  if (
    !origin ||
    url.origin !== origin.origin ||
    url.pathname !== pathname ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    issues.push(`${path} must be ${pathname} on the exact role origin.`);
  }
}

function validateArtifacts(artifacts, issues) {
  const artifactsById = new Map();
  const paths = new Set();
  if (!Array.isArray(artifacts) || artifacts.length < 1 || artifacts.length > 512) {
    issues.push("evidence.artifacts must contain one to 512 redacted artifacts.");
    return artifactsById;
  }
  artifacts.forEach((artifact, index) => {
    const path = `evidence.artifacts[${index}]`;
    if (!exactKeys(artifact, [
      "id",
      "kind",
      "relativePath",
      "sha256",
      "sourceRuntime",
      "redacted",
      "containsSecrets",
      "containsRawPii",
      "containsSessionMaterial",
      "fixtureGenerated"
    ], path, issues)) return;
    pattern(artifact.id, ID, `${path}.id`, issues);
    if (artifactsById.has(artifact.id)) issues.push(`${path}.id duplicates ${artifact.id}.`);
    artifactsById.set(artifact.id, artifact);
    if (!ARTIFACT_KINDS.has(artifact.kind)) issues.push(`${path}.kind is not accepted.`);
    pattern(artifact.relativePath, ARTIFACT_PATH, `${path}.relativePath`, issues);
    if (artifact.relativePath.includes("..") || artifact.relativePath.includes("//")) {
      issues.push(`${path}.relativePath must not traverse or contain empty segments.`);
    }
    if (paths.has(artifact.relativePath)) {
      issues.push(`${path}.relativePath duplicates another artifact path.`);
    }
    paths.add(artifact.relativePath);
    pattern(artifact.sha256, SHA256, `${path}.sha256`, issues);
    if (!ARTIFACT_SOURCES.has(artifact.sourceRuntime)) {
      issues.push(`${path}.sourceRuntime is not accepted.`);
    }
    exact(artifact.redacted, true, `${path}.redacted`, issues);
    exact(artifact.containsSecrets, false, `${path}.containsSecrets`, issues);
    exact(artifact.containsRawPii, false, `${path}.containsRawPii`, issues);
    exact(artifact.containsSessionMaterial, false, `${path}.containsSessionMaterial`, issues);
    exact(artifact.fixtureGenerated, false, `${path}.fixtureGenerated`, issues);
  });
  return artifactsById;
}

function validateRoleOrigins(origins, portBase, issues) {
  if (!exactKeys(origins, ROLES, "evidence.runtime.local.origins", issues)) return;
  const expected = {
    human: `http://127.0.0.1:${portBase}/`,
    principal_agent: `http://127.0.0.1:${portBase + 1}/`,
    capital_partner: `http://127.0.0.1:${portBase + 3}/`,
    risk_operations: `http://127.0.0.1:${portBase + 2}/`
  };
  for (const role of ROLES) exact(origins[role], expected[role], `evidence.runtime.local.origins.${role}`, issues);
}

function validateRuntime(runtime, expectedCommitSha, issues) {
  if (!exactKeys(runtime, ["canonicalProductTruth", "local", "hosted"], "evidence.runtime", issues)) return;
  exact(
    runtime.canonicalProductTruth,
    "tenant_protocol_gateway_shared_kernel_postgresql",
    "evidence.runtime.canonicalProductTruth",
    issues
  );
  const local = runtime.local;
  if (exactKeys(local, [
    "status",
    "releaseId",
    "imageRevision",
    "pilotRevision",
    "workerRevision",
    "portBase",
    "postgresBacked",
    "fixtureHost",
    "beforeRestartAcceptance",
    "afterRestartAcceptance",
    "origins"
  ], "evidence.runtime.local", issues)) {
    exact(local.status, "passed", "evidence.runtime.local.status", issues);
    for (const key of ["releaseId", "imageRevision", "pilotRevision", "workerRevision"]) {
      exact(local[key], expectedCommitSha, `evidence.runtime.local.${key}`, issues);
    }
    if (
      !Number.isSafeInteger(local.portBase) ||
      local.portBase < 1_024 ||
      local.portBase > 65_532
    ) {
      issues.push("evidence.runtime.local.portBase must leave four consecutive non-privileged TCP ports.");
    }
    exact(local.postgresBacked, true, "evidence.runtime.local.postgresBacked", issues);
    exact(local.fixtureHost, false, "evidence.runtime.local.fixtureHost", issues);
    exact(local.beforeRestartAcceptance, "passed", "evidence.runtime.local.beforeRestartAcceptance", issues);
    exact(local.afterRestartAcceptance, "passed", "evidence.runtime.local.afterRestartAcceptance", issues);
    validateRoleOrigins(local.origins, local.portBase, issues);
  }

  const hosted = runtime.hosted;
  if (!exactKeys(hosted, [
    "status",
    "releaseId",
    "productProfile",
    "postgresBacked",
    "fixtureHost",
    "surfaces"
  ], "evidence.runtime.hosted", issues)) return;
  exact(hosted.status, "passed", "evidence.runtime.hosted.status", issues);
  exact(hosted.releaseId, expectedCommitSha, "evidence.runtime.hosted.releaseId", issues);
  exact(
    hosted.productProfile,
    "deployable_sandbox_vertical_slice",
    "evidence.runtime.hosted.productProfile",
    issues
  );
  exact(hosted.postgresBacked, true, "evidence.runtime.hosted.postgresBacked", issues);
  exact(hosted.fixtureHost, false, "evidence.runtime.hosted.fixtureHost", issues);
  if (
    !Array.isArray(hosted.surfaces) ||
    hosted.surfaces.length < 1 ||
    hosted.surfaces.length > HOSTED_DEPLOYMENT_ROLES.length
  ) {
    issues.push("evidence.runtime.hosted.surfaces must contain one or two actually deployed canonical surfaces.");
    return;
  }
  const seen = new Set();
  hosted.surfaces.forEach((surface, index) => {
    const path = `evidence.runtime.hosted.surfaces[${index}]`;
    if (!exactKeys(surface, [
      "deploymentRole",
      "origin",
      "capabilityUrl",
      "readinessUrl",
      "reportedReleaseId",
      "fixtureHost",
      "postgresBacked"
    ], path, issues)) return;
    if (!HOSTED_DEPLOYMENT_ROLES.includes(surface.deploymentRole)) {
      issues.push(`${path}.deploymentRole is invalid.`);
    }
    if (seen.has(surface.deploymentRole)) {
      issues.push(`${path}.deploymentRole duplicates ${surface.deploymentRole}.`);
    }
    seen.add(surface.deploymentRole);
    const origin = exactHttpsOrigin(surface.origin, `${path}.origin`, issues);
    sameOriginPath(surface.capabilityUrl, origin, "/.well-known/ipo-one.json", `${path}.capabilityUrl`, issues);
    sameOriginPath(surface.readinessUrl, origin, "/readyz", `${path}.readinessUrl`, issues);
    exact(surface.reportedReleaseId, expectedCommitSha, `${path}.reportedReleaseId`, issues);
    exact(surface.fixtureHost, false, `${path}.fixtureHost`, issues);
    exact(surface.postgresBacked, true, `${path}.postgresBacked`, issues);
  });
  if (!seen.has("primary")) {
    issues.push("evidence.runtime.hosted.surfaces is missing the primary deployment.");
  }
}

function validateBrowser(browser, artifactsById, issues) {
  if (!exactKeys(browser, [
    "driver",
    "realBrowser",
    "humanRoleAuthentication",
    "authenticationBypassUsed",
    "browserStorageAuthority",
    "consoleErrors",
    "networkErrors",
    "matrix"
  ], "evidence.browser", issues)) return;
  if (!REAL_BROWSER_DRIVERS.has(browser.driver)) {
    issues.push("evidence.browser.driver must be playwright_cli or chrome_control.");
  }
  exact(browser.realBrowser, true, "evidence.browser.realBrowser", issues);
  exact(
    browser.humanRoleAuthentication,
    "operator_confirmed_invited_wallet_siwe",
    "evidence.browser.humanRoleAuthentication",
    issues
  );
  exact(browser.authenticationBypassUsed, false, "evidence.browser.authenticationBypassUsed", issues);
  exact(browser.browserStorageAuthority, false, "evidence.browser.browserStorageAuthority", issues);
  exact(browser.consoleErrors, 0, "evidence.browser.consoleErrors", issues);
  exact(browser.networkErrors, 0, "evidence.browser.networkErrors", issues);
  const expectedCount = ROLES.length * BROWSER_CHECKS.length;
  if (!Array.isArray(browser.matrix) || browser.matrix.length !== expectedCount) {
    issues.push(`evidence.browser.matrix must contain exactly ${expectedCount} role/check results.`);
    return;
  }
  const observed = new Set();
  browser.matrix.forEach((entry, index) => {
    const path = `evidence.browser.matrix[${index}]`;
    if (!exactKeys(entry, ["role", "check", "status", "artifactIds"], path, issues)) return;
    const key = `${entry.role}:${entry.check}`;
    if (!ROLES.includes(entry.role)) issues.push(`${path}.role is invalid.`);
    if (!BROWSER_CHECKS.includes(entry.check)) issues.push(`${path}.check is invalid.`);
    if (observed.has(key)) issues.push(`${path} duplicates ${key}.`);
    observed.add(key);
    exact(entry.status, "passed", `${path}.status`, issues);
    artifactReferences(
      entry.artifactIds,
      `${path}.artifactIds`,
      artifactsById,
      issues,
      {
        requiredKindSets: [BROWSER_ARTIFACT_KINDS, RUNTIME_ARTIFACT_KINDS],
        requireSingleSource: true
      }
    );
  });
  for (const role of ROLES) {
    for (const check of BROWSER_CHECKS) {
      if (!observed.has(`${role}:${check}`)) {
        issues.push(`evidence.browser.matrix is missing ${role}:${check}.`);
      }
    }
  }
}

function validateJourneys(journeys, artifactsById, issues) {
  if (!exactKeys(journeys, ROLES, "evidence.journeys", issues)) return;
  for (const role of ROLES) {
    const entries = journeys[role];
    const expected = JOURNEY_STEPS[role];
    if (!Array.isArray(entries) || entries.length !== expected.length) {
      issues.push(`evidence.journeys.${role} must contain the exact ${expected.length}-step journey.`);
      continue;
    }
    entries.forEach((entry, index) => {
      const path = `evidence.journeys.${role}[${index}]`;
      if (!exactKeys(entry, [
        "id",
        "status",
        "transport",
        "canonicalPersistence",
        "fixtureUsed",
        "artifactIds"
      ], path, issues)) return;
      exact(entry.id, expected[index], `${path}.id`, issues);
      exact(entry.status, "passed", `${path}.status`, issues);
      if (!new Set(["human_web", "agent_mcp"]).has(entry.transport)) {
        issues.push(`${path}.transport is invalid.`);
      }
      if (role !== "principal_agent" && entry.transport !== "human_web") {
        issues.push(`${path}.transport must be human_web for this role.`);
      }
      if (entry.id === "mcp_execution" && entry.transport !== "agent_mcp") {
        issues.push(`${path}.transport must prove direct agent_mcp execution.`);
      }
      exact(entry.canonicalPersistence, "postgresql", `${path}.canonicalPersistence`, issues);
      exact(entry.fixtureUsed, false, `${path}.fixtureUsed`, issues);
      artifactReferences(
        entry.artifactIds,
        `${path}.artifactIds`,
        artifactsById,
        issues,
        {
          requiredKindSets: entry.id === "mcp_execution"
            ? [RUNTIME_ARTIFACT_KINDS, new Set(["agent_mcp_receipt"])]
            : [RUNTIME_ARTIFACT_KINDS],
          allowedSources: new Set(["local_exact_commit", "hosted_exact_commit"]),
          requireSingleSource: true
        }
      );
    });
  }
}

function validateNegatives(negatives, artifactsById, issues) {
  const groups = Object.keys(NEGATIVE_CASES);
  if (!exactKeys(negatives, groups, "evidence.negativeCases", issues)) return;
  for (const group of groups) {
    const entries = negatives[group];
    const expected = NEGATIVE_CASES[group];
    if (!Array.isArray(entries) || entries.length !== expected.length) {
      issues.push(`evidence.negativeCases.${group} must contain the exact fail-closed set.`);
      continue;
    }
    entries.forEach((entry, index) => {
      const path = `evidence.negativeCases.${group}[${index}]`;
      if (!exactKeys(entry, [
        "id",
        "status",
        "additionalEffectCount",
        "nonEnumerating",
        "artifactIds"
      ], path, issues)) return;
      exact(entry.id, expected[index], `${path}.id`, issues);
      exact(entry.status, "passed_fail_closed", `${path}.status`, issues);
      exact(entry.additionalEffectCount, 0, `${path}.additionalEffectCount`, issues);
      exact(entry.nonEnumerating, true, `${path}.nonEnumerating`, issues);
      artifactReferences(
        entry.artifactIds,
        `${path}.artifactIds`,
        artifactsById,
        issues,
        {
          requiredKindSets: [new Set(["negative_receipt"])],
          requireSingleSource: true
        }
      );
    });
  }
}

function validateRestart(restart, artifactsById, issues) {
  if (!exactKeys(restart, [
    "databaseRetained",
    "pilotRestarted",
    "workerRestarted",
    "humanRecovered",
    "agentRecovered",
    "capitalPartnerRecovered",
    "riskRecovered",
    "outboxDuplicateEffects",
    "artifactIds"
  ], "evidence.restart", issues)) return;
  for (const key of [
    "databaseRetained",
    "pilotRestarted",
    "workerRestarted",
    "humanRecovered",
    "agentRecovered",
    "capitalPartnerRecovered",
    "riskRecovered"
  ]) exact(restart[key], true, `evidence.restart.${key}`, issues);
  exact(restart.outboxDuplicateEffects, 0, "evidence.restart.outboxDuplicateEffects", issues);
  artifactReferences(
    restart.artifactIds,
    "evidence.restart.artifactIds",
    artifactsById,
    issues,
    {
      requiredKindSets: [
        new Set(["restart_log"]),
        RUNTIME_ARTIFACT_KINDS
      ],
      allowedSources: new Set(["local_exact_commit"])
    }
  );
}

function validateAuthority(authority, issues) {
  const keys = [
    "realFundsEnabled",
    "externalFundsMovementEnabled",
    "productionSignerAuthorityEnabled",
    "arbitraryWithdrawalEnabled",
    "venueWriteAuthorityEnabled",
    "realHumanLendingEnabled",
    "mainnetEnabled",
    "protocolFeesEnabled",
    "browserCredentialCaptureEnabled"
  ];
  if (!exactKeys(authority, keys, "evidence.authority", issues)) return;
  for (const key of keys) exact(authority[key], false, `evidence.authority.${key}`, issues);
}

export function verifyM1BAcceptanceEvidence(
  evidence,
  { expectedCommitSha }
) {
  const issues = [];
  if (!SHA.test(expectedCommitSha ?? "")) {
    throw new M1BAcceptanceEvidenceError([
      "expectedCommitSha must be one lowercase 40-character Git SHA."
    ]);
  }
  if (!exactKeys(evidence, [
    "schemaVersion",
    "status",
    "capturedAt",
    "source",
    "runtime",
    "browser",
    "journeys",
    "negativeCases",
    "restart",
    "authority",
    "artifacts"
  ], "evidence", issues)) {
    throw new M1BAcceptanceEvidenceError(issues);
  }
  exact(
    evidence.schemaVersion,
    "ipo.one.m1-b-p0-5-acceptance-evidence/v1",
    "evidence.schemaVersion",
    issues
  );
  exact(evidence.status, "passed", "evidence.status", issues);
  timestamp(evidence.capturedAt, "evidence.capturedAt", issues);
  if (exactKeys(evidence.source, [
    "commitSha",
    "treeSha",
    "sourceMaterialization",
    "untrackedInputIncluded",
    "trackedWorktreeClean",
    "headMatchesCommit"
  ], "evidence.source", issues)) {
    exact(evidence.source.commitSha, expectedCommitSha, "evidence.source.commitSha", issues);
    pattern(evidence.source.treeSha, SHA, "evidence.source.treeSha", issues);
    exact(
      evidence.source.sourceMaterialization,
      "tracked_git_archive",
      "evidence.source.sourceMaterialization",
      issues
    );
    exact(
      evidence.source.untrackedInputIncluded,
      false,
      "evidence.source.untrackedInputIncluded",
      issues
    );
    exact(evidence.source.trackedWorktreeClean, true, "evidence.source.trackedWorktreeClean", issues);
    exact(evidence.source.headMatchesCommit, true, "evidence.source.headMatchesCommit", issues);
  }
  const artifactsById = validateArtifacts(evidence.artifacts, issues);
  validateRuntime(evidence.runtime, expectedCommitSha, issues);
  validateBrowser(evidence.browser, artifactsById, issues);
  validateJourneys(evidence.journeys, artifactsById, issues);
  validateNegatives(evidence.negativeCases, artifactsById, issues);
  validateRestart(evidence.restart, artifactsById, issues);
  validateAuthority(evidence.authority, issues);
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return Object.freeze({
    status: "verified",
    commitSha: expectedCommitSha,
    roleCount: ROLES.length,
    browserCheckCount: ROLES.length * BROWSER_CHECKS.length,
    journeyStepCount: Object.values(JOURNEY_STEPS).flat().length,
    negativeCaseCount: Object.values(NEGATIVE_CASES).flat().length,
    artifactCount: evidence.artifacts.length,
    canonicalProductTruth: evidence.runtime.canonicalProductTruth,
    realFundsEnabled: evidence.authority.realFundsEnabled
  });
}

export function verifyM1BHostedCapabilityDocument(
  document,
  { expectedCommitSha }
) {
  const issues = [];
  if (!record(document)) {
    throw new M1BAcceptanceEvidenceError(["Hosted capability document must be an object."]);
  }
  exact(document.schemaVersion, "ipo_one_deployment_capability.v1", "capability.schemaVersion", issues);
  exact(document.deployment?.releaseId, expectedCommitSha, "capability.deployment.releaseId", issues);
  exact(
    document.deployment?.productProfile,
    "deployable_sandbox_vertical_slice",
    "capability.deployment.productProfile",
    issues
  );
  exact(document.realValue?.activationStatus, "DISABLED", "capability.realValue.activationStatus", issues);
  exact(document.realValue?.realFundsEnabled, false, "capability.realValue.realFundsEnabled", issues);
  exact(document.realValue?.productionFundsMoved, false, "capability.realValue.productionFundsMoved", issues);
  for (const key of [
    "realFundsEnabled",
    "externalProviderExecutionEnabled",
    "productionSignerAuthorityEnabled",
    "withdrawalAuthorityEnabled",
    "venueWriteAuthorityEnabled"
  ]) exact(document.safety?.[key], false, `capability.safety.${key}`, issues);
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}

export function verifyM1BHostedReadinessDocument(
  document,
  { expectedCommitSha }
) {
  const issues = [];
  if (!record(document)) {
    throw new M1BAcceptanceEvidenceError(["Hosted readiness document must be an object."]);
  }
  exact(document.schemaVersion, "production_readiness.v1", "readiness.schemaVersion", issues);
  exact(document.status, "ready", "readiness.status", issues);
  exact(document.releaseId, expectedCommitSha, "readiness.releaseId", issues);
  exact(document.realFundsEnabled, false, "readiness.realFundsEnabled", issues);
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}

export const M1_B_ACCEPTANCE_ROLES = ROLES;
export const M1_B_BROWSER_CHECKS = BROWSER_CHECKS;
export const M1_B_JOURNEY_STEPS = JOURNEY_STEPS;
export const M1_B_NEGATIVE_CASES = NEGATIVE_CASES;
