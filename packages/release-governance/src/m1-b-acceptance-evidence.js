const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[a-z][a-z0-9_]{2,63}$/;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const ARTIFACT_PATH = /^output\/playwright\/m1-b-p0-5\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const CURRENT_V2_ARTIFACT_PATH = /^(?:output\/playwright\/m1-b-p0-5|\.ipo-one\/local-stack\/agent-workflows)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

const TOPOLOGY_ROLES = Object.freeze([
  "human",
  "principal_agent",
  "capital_partner",
  "risk_operations"
]);
const POSITIVE_JOURNEY_ROLES = Object.freeze([
  "human",
  "principal_agent",
  "capital_partner"
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
const POSITIVE_JOURNEY_STEPS = Object.freeze({
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
  ])
});
const HISTORICAL_V1_JOURNEY_STEPS = Object.freeze({
  ...POSITIVE_JOURNEY_STEPS,
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
const CURRENT_V2_ARTIFACT_KINDS = new Set([
  ...ARTIFACT_KINDS,
  "tap_log",
  "negative_source_proof"
]);
const ARTIFACT_SOURCES = new Set([
  "local_exact_commit",
  "hosted_exact_commit"
]);
const HISTORICAL_V1_HOSTED_ROLE_BY_DEPLOYMENT_ROLE = Object.freeze({
  primary: "principal_agent",
  risk: "risk_operations"
});
const M1_B_HOSTED_ROLE_BY_DEPLOYMENT_ROLE = Object.freeze({
  primary: "principal_agent"
});
const RISK_MFA_OPERATION_IDS = Object.freeze([
  "pilotCancelApproval",
  "pilotDecideApproval",
  "pilotFreezeSubject",
  "pilotIncreaseCreditLimit",
  "pilotProposeApproval",
  "pilotReadApproval",
  "pilotReadCreditRegistryEvidence",
  "pilotReadPilotFeedbackSummary",
  "pilotReadPilotHealth",
  "pilotReadServicingQueue",
  "pilotReadServicingQueueReference",
  "pilotReadTenantRisk",
  "pilotReadTenantRiskPortfolioReference",
  "pilotReduceCreditLimit",
  "pilotRepurchaseSandboxObligation",
  "pilotRestructureSandboxObligation",
  "pilotUnfreezeSubject",
  "pilotWriteOffSandboxObligation",
  "tradingEvaluateRisk",
  "tradingFlattenFacility",
  "tradingPauseNewRisk"
]);
const RISK_MFA_LIVE_OPERATION_IDS = Object.freeze([
  "pilotReadTenantRiskPortfolioReference",
  "pilotFreezeSubject"
]);
const RISK_MFA_PROTECTED_STATE_TABLES = Object.freeze([
  "access_grants",
  "account_bindings",
  "aggregate_stream_heads",
  "approval_decisions",
  "approval_executions",
  "approval_proposals",
  "authorization_resource_bindings",
  "authorization_resources",
  "break_glass_custodian_decisions",
  "break_glass_incidents",
  "break_glass_reviews",
  "capital_partner_profiles",
  "command_events",
  "command_idempotency",
  "consent_records",
  "credit_events",
  "credit_intents",
  "credit_lines",
  "credit_offer_acceptances",
  "credit_offers",
  "credit_outcomes",
  "credit_passport_artifacts",
  "credit_profiles",
  "delegated_wallet_grant_target_policies",
  "delegated_wallet_grant_transitions",
  "delegated_wallet_grants",
  "delegated_wallet_pending_exposures",
  "domain_events",
  "evidence_envelopes",
  "execution_account_binding_challenges",
  "execution_account_binding_proof_attempts",
  "execution_target_policies",
  "human_identity_references",
  "hypercore_account_bindings",
  "hypercore_api_wallet_delegates",
  "hypercore_delegate_tombstones",
  "hypercore_jit_venue_preflight_receipts",
  "hypercore_stable_execution_intents",
  "hypercore_stable_execution_transitions",
  "hypercore_stable_founder_approvals",
  "hypercore_testnet_founder_approvals",
  "hypercore_testnet_nonce_heads",
  "hypercore_testnet_signer_handoffs",
  "hypercore_testnet_submission_attempts",
  "hypercore_testnet_submission_transitions",
  "ledger_accounts",
  "ledger_entries",
  "ledger_transactions",
  "lockboxes",
  "mandate_releases",
  "mandate_reservations",
  "mandates",
  "obligation_installments",
  "obligations",
  "official_report_artifacts",
  "outbox_messages",
  "pilot_feedback_records",
  "principals",
  "provider_callback_inbox",
  "provider_intent_acknowledgements",
  "provider_intent_deliveries",
  "repayment_events",
  "risk_decisions",
  "sandbox_execution_receipts",
  "sandbox_servicing_actions",
  "settlement_receipts",
  "spend_policies",
  "spend_requests",
  "subjects",
  "tenant_command_executions",
  "tenant_command_pauses",
  "trading_capital_requests",
  "trading_credit_profiles",
  "trading_execution_nonce_heads",
  "trading_facilities",
  "trading_facility_close_requests",
  "trading_facility_risk_evaluations",
  "trading_match_proposals",
  "trading_order_intents",
  "trading_performance_proofs",
  "trading_provider_mandates",
  "trading_settlements",
  "trading_testnet_execution_records",
  "trading_testnet_execution_transitions",
  "trading_testnet_facility_funding_controls",
  "trading_testnet_protective_controls",
  "trading_testnet_protective_transitions",
  "trading_testnet_settlement_runs",
  "transfer_intents",
  "transfer_quotes",
  "wallet_prepared_executions",
  "wallet_simulation_reports",
  "wallet_transaction_preflight_receipts",
  "workspace_continuation_receipts"
]);
const RISK_MFA_PROTECTED_STATE_MINIMUMS = Object.freeze({
  aggregate_stream_heads: 1,
  authorization_resources: 3,
  credit_lines: 1,
  domain_events: 1,
  evidence_envelopes: 1,
  obligations: 1,
  outbox_messages: 1,
  subjects: 1,
  tenant_command_executions: 1
});
const HISTORICAL_V1_PROFILE = Object.freeze({
  schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v1",
  journeyRoles: TOPOLOGY_ROLES,
  journeySteps: HISTORICAL_V1_JOURNEY_STEPS,
  localBrowserRoles: TOPOLOGY_ROLES,
  hostedRoleByDeploymentRole: HISTORICAL_V1_HOSTED_ROLE_BY_DEPLOYMENT_ROLE,
  restartRiskKey: "riskRecovered",
  riskBoundaryRequired: false,
  deploymentPendingAllowed: false
});
const CURRENT_V2_PROFILE = Object.freeze({
  schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
  journeyRoles: POSITIVE_JOURNEY_ROLES,
  journeySteps: POSITIVE_JOURNEY_STEPS,
  localBrowserRoles: POSITIVE_JOURNEY_ROLES,
  hostedRoleByDeploymentRole: M1_B_HOSTED_ROLE_BY_DEPLOYMENT_ROLE,
  restartRiskKey: "riskFailClosedAfterRestart",
  riskBoundaryRequired: true,
  deploymentPendingAllowed: true
});
const REAL_BROWSER_DRIVERS = new Set(["playwright_cli", "chrome_control"]);
const PRINCIPAL_AGENT_MCP_STEPS = new Set([
  "agent_application",
  "offer",
  "acceptance",
  "mcp_execution",
  "repayment",
  "evidence"
]);
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

function validateArtifacts(artifacts, issues, profile) {
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
    const acceptedKinds = profile === CURRENT_V2_PROFILE
      ? CURRENT_V2_ARTIFACT_KINDS
      : ARTIFACT_KINDS;
    if (!acceptedKinds.has(artifact.kind)) issues.push(`${path}.kind is not accepted.`);
    pattern(
      artifact.relativePath,
      profile === CURRENT_V2_PROFILE ? CURRENT_V2_ARTIFACT_PATH : ARTIFACT_PATH,
      `${path}.relativePath`,
      issues
    );
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
  if (!exactKeys(origins, TOPOLOGY_ROLES, "evidence.runtime.local.origins", issues)) return;
  const expected = {
    human: `http://127.0.0.1:${portBase}/`,
    principal_agent: `http://127.0.0.1:${portBase + 1}/`,
    capital_partner: `http://127.0.0.1:${portBase + 3}/`,
    risk_operations: `http://127.0.0.1:${portBase + 2}/`
  };
  for (const role of TOPOLOGY_ROLES) {
    exact(origins[role], expected[role], `evidence.runtime.local.origins.${role}`, issues);
  }
}

function validateLocalAgentAcceptance(
  acceptance,
  expectedCommitSha,
  artifactsById,
  issues
) {
  const path = "evidence.runtime.local.agentAcceptance";
  if (!exactKeys(acceptance, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "candidateMarker",
    "accountHash",
    "subjectId",
    "mandateId",
    "creditIntentId",
    "creditOfferId",
    "obligationId",
    "facilityId",
    "creditLineId",
    "beforeRestart",
    "afterRestart"
  ], path, issues)) return;
  exact(
    acceptance.schemaVersion,
    "local_agent_release_acceptance_linkage.v1",
    `${path}.schemaVersion`,
    issues
  );
  exact(acceptance.status, "passed", `${path}.status`, issues);
  exact(
    acceptance.candidateReleaseId,
    expectedCommitSha,
    `${path}.candidateReleaseId`,
    issues
  );
  exact(
    acceptance.candidateMarker,
    `m1b.agent.${expectedCommitSha}`,
    `${path}.candidateMarker`,
    issues
  );
  pattern(acceptance.accountHash, HASH, `${path}.accountHash`, issues);
  for (const key of [
    "subjectId",
    "mandateId",
    "creditIntentId",
    "creditOfferId",
    "obligationId",
    "facilityId",
    "creditLineId"
  ]) pattern(acceptance[key], RESOURCE_ID, `${path}.${key}`, issues);

  const beforePath = `${path}.beforeRestart`;
  const afterPath = `${path}.afterRestart`;
  if (exactKeys(acceptance.beforeRestart, [
    "acceptanceMode",
    "databaseStartedAt",
    "acceptanceArtifactId",
    "applicationMcpArtifactId",
    "runtimeMcpArtifactId"
  ], beforePath, issues)) {
    exact(
      acceptance.beforeRestart.acceptanceMode,
      "before_restart_executed",
      `${beforePath}.acceptanceMode`,
      issues
    );
    timestamp(
      acceptance.beforeRestart.databaseStartedAt,
      `${beforePath}.databaseStartedAt`,
      issues
    );
    artifactReferences(
      [
        acceptance.beforeRestart.acceptanceArtifactId,
        acceptance.beforeRestart.applicationMcpArtifactId,
        acceptance.beforeRestart.runtimeMcpArtifactId
      ],
      `${beforePath}.artifactIds`,
      artifactsById,
      issues,
      {
        requiredKindSets: [
          RUNTIME_ARTIFACT_KINDS,
          new Set(["agent_mcp_receipt"])
        ],
        allowedSources: new Set(["local_exact_commit"]),
        requireSingleSource: true
      }
    );
  }
  if (exactKeys(acceptance.afterRestart, [
    "acceptanceMode",
    "databaseStartedAt",
    "acceptanceArtifactId",
    "recoveryReceiptArtifactId"
  ], afterPath, issues)) {
    exact(
      acceptance.afterRestart.acceptanceMode,
      "after_restart_recovered",
      `${afterPath}.acceptanceMode`,
      issues
    );
    timestamp(
      acceptance.afterRestart.databaseStartedAt,
      `${afterPath}.databaseStartedAt`,
      issues
    );
    artifactReferences(
      [
        acceptance.afterRestart.acceptanceArtifactId,
        acceptance.afterRestart.recoveryReceiptArtifactId
      ],
      `${afterPath}.artifactIds`,
      artifactsById,
      issues,
      {
        requiredKindSets: [RUNTIME_ARTIFACT_KINDS],
        allowedSources: new Set(["local_exact_commit"]),
        requireSingleSource: true
      }
    );
  }
  const beforeTime = Date.parse(acceptance.beforeRestart?.databaseStartedAt ?? "");
  const afterTime = Date.parse(acceptance.afterRestart?.databaseStartedAt ?? "");
  if (
    Number.isFinite(beforeTime) &&
    Number.isFinite(afterTime) &&
    afterTime <= beforeTime
  ) {
    issues.push(`${afterPath}.databaseStartedAt must be later than the pre-restart PostgreSQL start.`);
  }
  const artifactIds = [
    acceptance.beforeRestart?.acceptanceArtifactId,
    acceptance.beforeRestart?.applicationMcpArtifactId,
    acceptance.beforeRestart?.runtimeMcpArtifactId,
    acceptance.afterRestart?.acceptanceArtifactId,
    acceptance.afterRestart?.recoveryReceiptArtifactId
  ].filter((value) => typeof value === "string");
  if (new Set(artifactIds).size !== artifactIds.length) {
    issues.push(`${path} must use distinct phase and MCP/recovery artifacts.`);
  }
}

function validateLocalHumanAcceptance(
  acceptance,
  expectedCommitSha,
  expectedDatabaseStartedAt,
  artifactsById,
  issues
) {
  const path = "evidence.runtime.local.humanAcceptance";
  if (!exactKeys(acceptance, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "databaseStartedAt",
    "subjectId",
    "consentId",
    "creditIntentId",
    "riskDecisionId",
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "offerAggregateVersion",
    "creditOfferAcceptanceId",
    "obligationId",
    "repaymentId",
    "artifactId"
  ], path, issues)) return;
  exact(
    acceptance.schemaVersion,
    "local_human_release_acceptance_linkage.v1",
    `${path}.schemaVersion`,
    issues
  );
  exact(acceptance.status, "passed", `${path}.status`, issues);
  exact(acceptance.candidateReleaseId, expectedCommitSha, `${path}.candidateReleaseId`, issues);
  exact(
    acceptance.databaseStartedAt,
    expectedDatabaseStartedAt,
    `${path}.databaseStartedAt`,
    issues
  );
  for (const key of [
    "subjectId",
    "consentId",
    "creditIntentId",
    "riskDecisionId",
    "creditOfferId",
    "creditOfferAcceptanceId",
    "obligationId",
    "repaymentId"
  ]) pattern(acceptance[key], RESOURCE_ID, `${path}.${key}`, issues);
  pattern(acceptance.creditOfferHash, HASH, `${path}.creditOfferHash`, issues);
  pattern(acceptance.termsHash, HASH, `${path}.termsHash`, issues);
  if (!Number.isSafeInteger(acceptance.offerAggregateVersion) || acceptance.offerAggregateVersion < 1) {
    issues.push(`${path}.offerAggregateVersion must be a positive safe integer.`);
  }
  artifactReferences(
    [acceptance.artifactId],
    `${path}.artifactId`,
    artifactsById,
    issues,
    {
      requiredKindSets: [new Set(["postgres_receipt"])],
      allowedSources: new Set(["local_exact_commit"]),
      requireSingleSource: true
    }
  );
}

function validateLocalCapitalPartnerAcceptance(
  acceptance,
  expectedCommitSha,
  expectedDatabaseStartedAt,
  artifactsById,
  issues
) {
  const path = "evidence.runtime.local.capitalPartnerAcceptance";
  if (!exactKeys(acceptance, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "databaseStartedAt",
    "capitalPartnerId",
    "currentLineage",
    "withdrawalLineage",
    "artifactId"
  ], path, issues)) return;
  exact(
    acceptance.schemaVersion,
    "local_capital_partner_release_acceptance_linkage.v1",
    `${path}.schemaVersion`,
    issues
  );
  exact(acceptance.status, "passed", `${path}.status`, issues);
  exact(acceptance.candidateReleaseId, expectedCommitSha, `${path}.candidateReleaseId`, issues);
  exact(
    acceptance.databaseStartedAt,
    expectedDatabaseStartedAt,
    `${path}.databaseStartedAt`,
    issues
  );
  pattern(acceptance.capitalPartnerId, RESOURCE_ID, `${path}.capitalPartnerId`, issues);
  const currentPath = `${path}.currentLineage`;
  if (exactKeys(acceptance.currentLineage, [
    "creditIntentId",
    "creditPassportArtifactId",
    "preliminaryOfferId",
    "currentOfferId",
    "currentOfferHash",
    "currentTermsHash",
    "currentOfferAggregateVersion"
  ], currentPath, issues)) {
    for (const key of [
      "creditIntentId",
      "creditPassportArtifactId",
      "preliminaryOfferId",
      "currentOfferId"
    ]) pattern(acceptance.currentLineage[key], RESOURCE_ID, `${currentPath}.${key}`, issues);
    pattern(
      acceptance.currentLineage.currentOfferHash,
      HASH,
      `${currentPath}.currentOfferHash`,
      issues
    );
    pattern(
      acceptance.currentLineage.currentTermsHash,
      HASH,
      `${currentPath}.currentTermsHash`,
      issues
    );
    if (
      !Number.isSafeInteger(acceptance.currentLineage.currentOfferAggregateVersion) ||
      acceptance.currentLineage.currentOfferAggregateVersion < 1
    ) {
      issues.push(`${currentPath}.currentOfferAggregateVersion must be a positive safe integer.`);
    }
    if (acceptance.currentLineage.preliminaryOfferId === acceptance.currentLineage.currentOfferId) {
      issues.push(`${currentPath} must identify distinct preliminary and current Offers.`);
    }
  }
  const withdrawalPath = `${path}.withdrawalLineage`;
  if (exactKeys(acceptance.withdrawalLineage, [
    "creditIntentId",
    "creditPassportArtifactId",
    "withdrawnOfferId"
  ], withdrawalPath, issues)) {
    for (const key of ["creditIntentId", "creditPassportArtifactId", "withdrawnOfferId"]) {
      pattern(acceptance.withdrawalLineage[key], RESOURCE_ID, `${withdrawalPath}.${key}`, issues);
    }
    if (
      acceptance.withdrawalLineage.creditIntentId === acceptance.currentLineage?.creditIntentId ||
      acceptance.withdrawalLineage.creditPassportArtifactId ===
        acceptance.currentLineage?.creditPassportArtifactId ||
      acceptance.withdrawalLineage.withdrawnOfferId === acceptance.currentLineage?.currentOfferId
    ) {
      issues.push(`${withdrawalPath} must be distinct from the current-Offer lineage.`);
    }
  }
  artifactReferences(
    [acceptance.artifactId],
    `${path}.artifactId`,
    artifactsById,
    issues,
    {
      requiredKindSets: [new Set(["postgres_receipt"])],
      allowedSources: new Set(["local_exact_commit"]),
      requireSingleSource: true
    }
  );
}

function validateRuntime(runtime, expectedCommitSha, artifactsById, issues, profile) {
  if (!exactKeys(runtime, ["canonicalProductTruth", "local", "hosted"], "evidence.runtime", issues)) return;
  exact(
    runtime.canonicalProductTruth,
    "tenant_protocol_gateway_shared_kernel_postgresql",
    "evidence.runtime.canonicalProductTruth",
    issues
  );
  const local = runtime.local;
  const localKeys = [
    "status",
    "releaseId",
    "imageRevision",
    "pilotRevision",
    "workerRevision",
    "portBase",
    "postgresBacked",
    "fixtureHost",
    "releaseIdentityArtifactId",
    "beforeRestartAcceptance",
    "afterRestartAcceptance",
    "agentAcceptance",
    ...(profile === CURRENT_V2_PROFILE
      ? ["humanAcceptance", "capitalPartnerAcceptance"]
      : []),
    "origins"
  ];
  if (exactKeys(local, localKeys, "evidence.runtime.local", issues)) {
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
    artifactReferences(
      [local.releaseIdentityArtifactId],
      "evidence.runtime.local.releaseIdentityArtifactId",
      artifactsById,
      issues,
      {
        requiredKindSets: [new Set(["release_identity"])],
        allowedSources: new Set(["local_exact_commit"]),
        requireSingleSource: true
      }
    );
    exact(local.beforeRestartAcceptance, "passed", "evidence.runtime.local.beforeRestartAcceptance", issues);
    exact(local.afterRestartAcceptance, "passed", "evidence.runtime.local.afterRestartAcceptance", issues);
    validateLocalAgentAcceptance(
      local.agentAcceptance,
      expectedCommitSha,
      artifactsById,
      issues
    );
    if (profile === CURRENT_V2_PROFILE) {
      const postRestartDatabaseStartedAt = local.agentAcceptance?.afterRestart?.databaseStartedAt;
      validateLocalHumanAcceptance(
        local.humanAcceptance,
        expectedCommitSha,
        postRestartDatabaseStartedAt,
        artifactsById,
        issues
      );
      validateLocalCapitalPartnerAcceptance(
        local.capitalPartnerAcceptance,
        expectedCommitSha,
        postRestartDatabaseStartedAt,
        artifactsById,
        issues
      );
      const criticalArtifactIds = [
        local.humanAcceptance?.artifactId,
        local.capitalPartnerAcceptance?.artifactId,
        local.agentAcceptance?.beforeRestart?.acceptanceArtifactId,
        local.agentAcceptance?.afterRestart?.acceptanceArtifactId
      ].filter((value) => typeof value === "string");
      if (new Set(criticalArtifactIds).size !== criticalArtifactIds.length) {
        issues.push("evidence.runtime.local critical role receipts must use distinct artifacts.");
      }
    }
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
  const deploymentPending =
    profile.deploymentPendingAllowed && hosted.status === "deployment_pending";
  if (!deploymentPending) {
    exact(hosted.status, "passed", "evidence.runtime.hosted.status", issues);
  }
  exact(
    hosted.productProfile,
    "deployable_sandbox_vertical_slice",
    "evidence.runtime.hosted.productProfile",
    issues
  );
  exact(hosted.fixtureHost, false, "evidence.runtime.hosted.fixtureHost", issues);
  if (deploymentPending) {
    exact(hosted.releaseId, null, "evidence.runtime.hosted.releaseId", issues);
    exact(hosted.postgresBacked, false, "evidence.runtime.hosted.postgresBacked", issues);
    if (!Array.isArray(hosted.surfaces) || hosted.surfaces.length !== 0) {
      issues.push(
        "evidence.runtime.hosted.surfaces must be empty while deployment is pending."
      );
    }
    return;
  }
  exact(hosted.releaseId, expectedCommitSha, "evidence.runtime.hosted.releaseId", issues);
  exact(hosted.postgresBacked, true, "evidence.runtime.hosted.postgresBacked", issues);
  const deploymentRoles = Object.keys(profile.hostedRoleByDeploymentRole);
  if (
    !Array.isArray(hosted.surfaces) ||
    hosted.surfaces.length < 1 ||
    hosted.surfaces.length > deploymentRoles.length
  ) {
    issues.push(
      `evidence.runtime.hosted.surfaces must contain one to ${deploymentRoles.length} ` +
        "actually deployed canonical surfaces."
    );
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
    if (!deploymentRoles.includes(surface.deploymentRole)) {
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

function hostedBrowserRoles(runtime, profile) {
  const surfaces = runtime?.hosted?.surfaces;
  if (!Array.isArray(surfaces)) return [];
  return [...new Set(surfaces
    .map((surface) => profile.hostedRoleByDeploymentRole[surface?.deploymentRole])
    .filter(Boolean))];
}

function validateBrowser(browser, runtime, artifactsById, issues, profile) {
  if (!exactKeys(browser, [
    "driver",
    "realBrowser",
    "humanRoleAuthentication",
    "authenticationBypassUsed",
    "browserStorageAuthority",
    "consoleErrors",
    "networkErrors",
    "localMatrix",
    "hostedMatrix"
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

  validateBrowserMatrix(
    browser.localMatrix,
    "evidence.browser.localMatrix",
    profile.localBrowserRoles,
    "local_exact_commit",
    artifactsById,
    issues
  );
  validateBrowserMatrix(
    browser.hostedMatrix,
    "evidence.browser.hostedMatrix",
    hostedBrowserRoles(runtime, profile),
    "hosted_exact_commit",
    artifactsById,
    issues
  );
  validateCrossRuntimeBrowserProofContent(
    browser.localMatrix,
    browser.hostedMatrix,
    artifactsById,
    issues
  );
}

function browserProofDigests(matrix, artifactsById) {
  const digests = new Set();
  if (!Array.isArray(matrix)) return digests;
  for (const entry of matrix) {
    if (!record(entry) || !Array.isArray(entry.artifactIds)) continue;
    for (const artifactId of new Set(entry.artifactIds)) {
      const artifact = artifactsById.get(artifactId);
      if (!SHA256.test(artifact?.sha256 ?? "")) continue;
      if (
        BROWSER_ARTIFACT_KINDS.has(artifact.kind) ||
        RUNTIME_ARTIFACT_KINDS.has(artifact.kind)
      ) {
        digests.add(artifact.sha256);
      }
    }
  }
  return digests;
}

function validateCrossRuntimeBrowserProofContent(
  localMatrix,
  hostedMatrix,
  artifactsById,
  issues
) {
  const local = browserProofDigests(localMatrix, artifactsById);
  const hosted = browserProofDigests(hostedMatrix, artifactsById);
  if ([...local].some((digest) => hosted.has(digest))) {
    issues.push(
      "evidence.browser must not reuse proof bytes across local and hosted runtimes."
    );
  }
}

function validateBrowserMatrix(
  matrix,
  matrixPath,
  requiredRoles,
  requiredSourceRuntime,
  artifactsById,
  issues
) {
  const expectedCount = requiredRoles.length * BROWSER_CHECKS.length;
  if (!Array.isArray(matrix) || matrix.length !== expectedCount) {
    issues.push(
      `${matrixPath} must contain exactly ${expectedCount} role/check results for the deployed roles.`
    );
    return;
  }
  const artifactRowCounts = new Map();
  const proofDigestRowCounts = new Map();
  for (const entry of matrix) {
    if (!record(entry) || !Array.isArray(entry.artifactIds)) continue;
    for (const artifactId of new Set(entry.artifactIds)) {
      artifactRowCounts.set(artifactId, (artifactRowCounts.get(artifactId) ?? 0) + 1);
      const artifact = artifactsById.get(artifactId);
      const proofFamily = BROWSER_ARTIFACT_KINDS.has(artifact?.kind)
        ? "browser"
        : RUNTIME_ARTIFACT_KINDS.has(artifact?.kind)
          ? "runtime"
          : undefined;
      if (proofFamily && SHA256.test(artifact.sha256 ?? "")) {
        const digestKey = `${proofFamily}:${artifact.sha256}`;
        proofDigestRowCounts.set(
          digestKey,
          (proofDigestRowCounts.get(digestKey) ?? 0) + 1
        );
      }
    }
  }
  const observed = new Set();
  matrix.forEach((entry, index) => {
    const path = `${matrixPath}[${index}]`;
    if (!exactKeys(entry, ["role", "check", "status", "artifactIds"], path, issues)) return;
    const key = `${entry.role}:${entry.check}`;
    if (!requiredRoles.includes(entry.role)) {
      issues.push(`${path}.role is not required by a deployed surface.`);
    }
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
        allowedSources: new Set([requiredSourceRuntime]),
        requireSingleSource: true
      }
    );
    if (Array.isArray(entry.artifactIds)) {
      const referencedArtifacts = entry.artifactIds
        .map((artifactId) => artifactsById.get(artifactId))
        .filter(Boolean);
      if (!referencedArtifacts.some(
        (artifact) =>
          BROWSER_ARTIFACT_KINDS.has(artifact.kind) &&
          artifactRowCounts.get(artifact.id) === 1 &&
          proofDigestRowCounts.get(`browser:${artifact.sha256}`) === 1
      )) {
        issues.push(
          `${path}.artifactIds must include a browser artifact unique to this matrix row.`
        );
      }
      if (!referencedArtifacts.some(
        (artifact) =>
          RUNTIME_ARTIFACT_KINDS.has(artifact.kind) &&
          artifactRowCounts.get(artifact.id) === 1 &&
          proofDigestRowCounts.get(`runtime:${artifact.sha256}`) === 1
      )) {
        issues.push(
          `${path}.artifactIds must include a runtime/PostgreSQL receipt unique to this matrix row.`
        );
      }
    }
  });
  for (const role of requiredRoles) {
    for (const check of BROWSER_CHECKS) {
      if (!observed.has(`${role}:${check}`)) {
        issues.push(`${matrixPath} is missing ${role}:${check}.`);
      }
    }
  }
}

function validateJourneys(journeys, artifactsById, issues, profile) {
  if (!exactKeys(journeys, profile.journeyRoles, "evidence.journeys", issues)) return;
  for (const role of profile.journeyRoles) {
    const entries = journeys[role];
    const expected = profile.journeySteps[role];
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
      const requiresAgentMcp = role === "principal_agent" &&
        PRINCIPAL_AGENT_MCP_STEPS.has(entry.id);
      if (requiresAgentMcp && entry.transport !== "agent_mcp") {
        issues.push(`${path}.transport must prove the machine-facing agent_mcp path.`);
      }
      exact(entry.canonicalPersistence, "postgresql", `${path}.canonicalPersistence`, issues);
      exact(entry.fixtureUsed, false, `${path}.fixtureUsed`, issues);
      artifactReferences(
        entry.artifactIds,
        `${path}.artifactIds`,
        artifactsById,
        issues,
        {
          requiredKindSets: requiresAgentMcp
            ? [RUNTIME_ARTIFACT_KINDS, new Set(["agent_mcp_receipt"])]
            : [RUNTIME_ARTIFACT_KINDS],
          allowedSources: new Set(["local_exact_commit"]),
          requireSingleSource: true
        }
      );
    });
  }
}

function validateNegatives(negatives, artifactsById, issues, profile) {
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
      const exactReplay = profile === CURRENT_V2_PROFILE &&
        group === "human" && entry.id === "duplicate_acceptance";
      exact(
        entry.status,
        exactReplay ? "passed_exact_replay" : "passed_fail_closed",
        `${path}.status`,
        issues
      );
      exact(entry.additionalEffectCount, 0, `${path}.additionalEffectCount`, issues);
      exact(entry.nonEnumerating, !exactReplay, `${path}.nonEnumerating`, issues);
      artifactReferences(
        entry.artifactIds,
        `${path}.artifactIds`,
        artifactsById,
        issues,
        {
          requiredKindSets: [new Set(["negative_receipt"])],
          allowedSources: new Set(["local_exact_commit"]),
          requireSingleSource: true
        }
      );
    });
  }
}

function validateRiskBoundary(
  boundary,
  expectedCommitSha,
  artifactsById,
  issues
) {
  const path = "evidence.riskBoundary";
  if (!exactKeys(boundary, [
    "schemaVersion",
    "status",
    "releaseLevel",
    "candidateReleaseId",
    "surfaceDisposition",
    "hostedSurfaceDeployed",
    "strongMfaTopologyComposed",
    "siweOnlySessionObserved",
    "requiresRecentMfaPolicyPreserved",
    "weakAuthFallbackAvailable",
    "weakAuthFallbackUsed",
    "protectedReadDecision",
    "protectedMutationDecision",
    "denialReasonCode",
    "privilegedMutationCount",
    "postRestartFailClosed",
    "deferredGate",
    "artifactId"
  ], path, issues)) return;
  exact(
    boundary.schemaVersion,
    "m1_b_risk_boundary_linkage.v1",
    `${path}.schemaVersion`,
    issues
  );
  exact(boundary.status, "passed_fail_closed", `${path}.status`, issues);
  exact(boundary.releaseLevel, "L1_PUBLIC_SANDBOX", `${path}.releaseLevel`, issues);
  exact(
    boundary.candidateReleaseId,
    expectedCommitSha,
    `${path}.candidateReleaseId`,
    issues
  );
  exact(
    boundary.surfaceDisposition,
    "private_unavailable",
    `${path}.surfaceDisposition`,
    issues
  );
  for (const key of [
    "hostedSurfaceDeployed",
    "strongMfaTopologyComposed",
    "weakAuthFallbackAvailable",
    "weakAuthFallbackUsed"
  ]) exact(boundary[key], false, `${path}.${key}`, issues);
  for (const key of [
    "siweOnlySessionObserved",
    "requiresRecentMfaPolicyPreserved",
    "postRestartFailClosed"
  ]) exact(boundary[key], true, `${path}.${key}`, issues);
  exact(boundary.protectedReadDecision, "deny", `${path}.protectedReadDecision`, issues);
  exact(
    boundary.protectedMutationDecision,
    "deny",
    `${path}.protectedMutationDecision`,
    issues
  );
  exact(
    boundary.denialReasonCode,
    "actor_capability_rejected",
    `${path}.denialReasonCode`,
    issues
  );
  exact(boundary.privilegedMutationCount, 0, `${path}.privilegedMutationCount`, issues);
  exact(
    boundary.deferredGate,
    "M1_C_L2_CLOSED_NO_FUNDS",
    `${path}.deferredGate`,
    issues
  );
  artifactReferences(
    [boundary.artifactId],
    `${path}.artifactId`,
    artifactsById,
    issues,
    {
      requiredKindSets: [new Set(["negative_receipt"])],
      allowedSources: new Set(["local_exact_commit"]),
      requireSingleSource: true
    }
  );
}

function validateRestart(restart, artifactsById, issues, profile, riskBoundary) {
  if (!exactKeys(restart, [
    "databaseRetained",
    "pilotRestarted",
    "workerRestarted",
    "humanRecovered",
    "agentRecovered",
    "capitalPartnerRecovered",
    profile.restartRiskKey,
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
    profile.restartRiskKey
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
  if (
    profile.riskBoundaryRequired &&
    !restart.artifactIds?.includes(riskBoundary?.artifactId)
  ) {
    issues.push(
      "evidence.restart.artifactIds must include the post-restart Risk boundary receipt."
    );
  }
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

function verifyM1BAcceptanceEvidenceForProfile(
  evidence,
  { expectedCommitSha },
  profile
) {
  const issues = [];
  if (!SHA.test(expectedCommitSha ?? "")) {
    throw new M1BAcceptanceEvidenceError([
      "expectedCommitSha must be one lowercase 40-character Git SHA."
    ]);
  }
  const evidenceKeys = [
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
  ];
  if (profile.riskBoundaryRequired) evidenceKeys.splice(8, 0, "riskBoundary");
  if (!exactKeys(evidence, evidenceKeys, "evidence", issues)) {
    throw new M1BAcceptanceEvidenceError(issues);
  }
  exact(
    evidence.schemaVersion,
    profile.schemaVersion,
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
  const artifactsById = validateArtifacts(evidence.artifacts, issues, profile);
  validateRuntime(evidence.runtime, expectedCommitSha, artifactsById, issues, profile);
  validateBrowser(evidence.browser, evidence.runtime, artifactsById, issues, profile);
  validateJourneys(evidence.journeys, artifactsById, issues, profile);
  validateNegatives(evidence.negativeCases, artifactsById, issues, profile);
  if (profile.riskBoundaryRequired) {
    validateRiskBoundary(
      evidence.riskBoundary,
      expectedCommitSha,
      artifactsById,
      issues
    );
  }
  validateRestart(
    evidence.restart,
    artifactsById,
    issues,
    profile,
    evidence.riskBoundary
  );
  validateAuthority(evidence.authority, issues);
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return Object.freeze({
    status: "verified",
    commitSha: expectedCommitSha,
    roleCount: TOPOLOGY_ROLES.length,
    positiveJourneyRoleCount: profile.journeyRoles.length,
    browserCheckCount:
      evidence.browser.localMatrix.length + evidence.browser.hostedMatrix.length,
    journeyStepCount: Object.values(profile.journeySteps).flat().length,
    negativeCaseCount: Object.values(NEGATIVE_CASES).flat().length,
    riskBoundaryCheckCount: profile.riskBoundaryRequired ? 4 : 0,
    artifactCount: evidence.artifacts.length,
    canonicalProductTruth: evidence.runtime.canonicalProductTruth,
    deploymentStatus: evidence.runtime.hosted.status,
    realFundsEnabled: evidence.authority.realFundsEnabled
  });
}

export function verifyM1BAcceptanceEvidence(
  evidence,
  options
) {
  return verifyM1BAcceptanceEvidenceForProfile(
    evidence,
    options,
    CURRENT_V2_PROFILE
  );
}

export function verifyM1BAcceptanceEvidenceV1Historical(
  evidence,
  options
) {
  return verifyM1BAcceptanceEvidenceForProfile(
    evidence,
    options,
    HISTORICAL_V1_PROFILE
  );
}

export function verifyM1BHostedCapabilityDocument(
  document,
  {
    expectedCommitSha,
    expectedDeploymentRole = "primary",
    evidenceSchemaVersion = CURRENT_V2_PROFILE.schemaVersion
  }
) {
  const issues = [];
  if (!record(document)) {
    throw new M1BAcceptanceEvidenceError(["Hosted capability document must be an object."]);
  }
  exact(document.schemaVersion, "ipo_one_deployment_capability.v1", "capability.schemaVersion", issues);
  if (evidenceSchemaVersion === CURRENT_V2_PROFILE.schemaVersion) {
    exact(expectedDeploymentRole, "primary", "surface.deploymentRole", issues);
    exact(
      document.deployment?.deploymentRole,
      expectedDeploymentRole,
      "capability.deployment.deploymentRole",
      issues
    );
  }
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
  {
    expectedCommitSha,
    expectedDeploymentRole = "primary",
    evidenceSchemaVersion = CURRENT_V2_PROFILE.schemaVersion
  }
) {
  const issues = [];
  if (!record(document)) {
    throw new M1BAcceptanceEvidenceError(["Hosted readiness document must be an object."]);
  }
  exact(document.schemaVersion, "production_readiness.v1", "readiness.schemaVersion", issues);
  if (evidenceSchemaVersion === CURRENT_V2_PROFILE.schemaVersion) {
    exact(expectedDeploymentRole, "primary", "surface.deploymentRole", issues);
    exact(
      document.deploymentRole,
      expectedDeploymentRole,
      "readiness.deploymentRole",
      issues
    );
  }
  exact(document.status, "ready", "readiness.status", issues);
  exact(document.releaseId, expectedCommitSha, "readiness.releaseId", issues);
  exact(document.realFundsEnabled, false, "readiness.realFundsEnabled", issues);
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}

export const M1_B_ACCEPTANCE_ROLES = POSITIVE_JOURNEY_ROLES;
export const M1_B_TOPOLOGY_ROLES = TOPOLOGY_ROLES;
export const M1_B_BROWSER_CHECKS = BROWSER_CHECKS;
export const M1_B_JOURNEY_STEPS = POSITIVE_JOURNEY_STEPS;
export const M1_B_NEGATIVE_CASES = NEGATIVE_CASES;
export const M1_B_RISK_MFA_OPERATION_IDS = RISK_MFA_OPERATION_IDS;
export const M1_B_RISK_MFA_LIVE_OPERATION_IDS = RISK_MFA_LIVE_OPERATION_IDS;
export const M1_B_RISK_MFA_PROTECTED_STATE_TABLES =
  RISK_MFA_PROTECTED_STATE_TABLES;
export const M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS =
  RISK_MFA_PROTECTED_STATE_MINIMUMS;
