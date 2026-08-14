import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  M1_B_RISK_MFA_LIVE_OPERATION_IDS,
  M1_B_RISK_MFA_OPERATION_IDS,
  M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
  M1_B_RISK_MFA_PROTECTED_STATE_TABLES,
  M1BAcceptanceEvidenceError
} from "../packages/release-governance/src/m1-b-acceptance-evidence.js";
import { ActorType } from "../modules/authentication/src/index.js";
import { AuthorizationPolicyRegistry } from "../modules/authorization/src/index.js";
import { assertTenantProtocolRequest } from "../packages/api-contract/src/tenant-protocol.js";
import { hashId } from "../packages/domain/src/index.js";

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RISK_REGRESSION_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js",
  "apps/private-pilot/src/m1-b-acceptance-postgres.js",
  "scripts/local-risk-mfa-boundary-acceptance.mjs",
  "modules/authorization/src/authorization-policy.js",
  "modules/authorization/src/authorization-service.js",
  "modules/authorization/test/authorization-service.test.js"
]);
const riskRegressionSourceSha256 = new Map(await Promise.all(
  RISK_REGRESSION_SOURCE_PATHS.map(async (path) => [
    path,
    createHash("sha256").update(await readFile(resolve(REPOSITORY_ROOT, path))).digest("hex")
  ])
));
const riskMfaPolicyByOperationId = new Map(
  new AuthorizationPolicyRegistry().list()
    .filter((policy) => policy.requiresRecentMfaActorTypes.some((actorType) =>
      [ActorType.RISK_OPERATOR, ActorType.OPERATIONS_OPERATOR].includes(actorType)
    ))
    .map((policy) => [policy.operationId, policy])
);

export async function assertM1BEvidenceRootMatchesRepository(
  evidenceRoot,
  { repositoryRoot = REPOSITORY_ROOT } = {}
) {
  const [evidenceStats, repositoryStats] = await Promise.all([
    lstat(resolve(evidenceRoot)),
    lstat(resolve(repositoryRoot))
  ]);
  if (
    !evidenceStats.isDirectory() ||
    evidenceStats.isSymbolicLink() ||
    !repositoryStats.isDirectory() ||
    repositoryStats.isSymbolicLink()
  ) {
    throw new M1BAcceptanceEvidenceError([
      "Evidence root and repository root must be real directories, not symbolic links."
    ]);
  }
  const [canonicalEvidenceRoot, canonicalRepositoryRoot] = await Promise.all([
    realpath(resolve(evidenceRoot)),
    realpath(resolve(repositoryRoot))
  ]);
  if (canonicalEvidenceRoot !== canonicalRepositoryRoot) {
    throw new M1BAcceptanceEvidenceError([
      "Evidence root must be the exact repository root used for Git and source verification."
    ]);
  }
  return canonicalEvidenceRoot;
}

export async function verifyM1BArtifactFiles(artifacts, { evidenceRoot }) {
  const rootStats = await lstat(resolve(evidenceRoot));
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new M1BAcceptanceEvidenceError([
      "Evidence root must be a real directory, not a symbolic link."
    ]);
  }
  const canonicalRoot = await realpath(resolve(evidenceRoot));
  for (const artifact of artifacts) {
    const requestedPath = resolve(canonicalRoot, artifact.relativePath);
    const relativePath = relative(canonicalRoot, requestedPath);
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} is outside the Evidence root.`
      ]);
    }
    let artifactPath;
    try {
      artifactPath = await realpath(requestedPath);
    } catch {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} does not exist.`
      ]);
    }
    if (artifactPath !== requestedPath) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} must not contain symbolic-link path components.`
      ]);
    }
    const canonicalRelative = relative(canonicalRoot, artifactPath);
    if (
      canonicalRelative === "" ||
      canonicalRelative.startsWith("..") ||
      isAbsolute(canonicalRelative)
    ) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} resolves outside the Evidence root.`
      ]);
    }
    const artifactStats = await stat(artifactPath);
    if (
      !artifactStats.isFile() ||
      artifactStats.size < 1 ||
      artifactStats.size > MAX_ARTIFACT_BYTES
    ) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} must be a non-empty regular file no larger than 64 MiB.`
      ]);
    }
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(artifactPath)) {
      digest.update(chunk);
    }
    if (digest.digest("hex") !== artifact.sha256) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} SHA-256 does not match its Evidence record.`
      ]);
    }
  }
  return true;
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function criticalProjectionHash(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function artifactById(evidence, artifactId, expectedKind, issues) {
  const artifact = evidence.artifacts.find((entry) => entry.id === artifactId);
  if (!artifact || artifact.kind !== expectedKind) {
    issues.push(`Artifact ${artifactId} must be classified as ${expectedKind}.`);
  }
  return artifact;
}

async function readJsonArtifact(artifact, canonicalRoot, issues) {
  if (!artifact) return undefined;
  try {
    const text = await readFile(resolve(canonicalRoot, artifact.relativePath), "utf8");
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value;
  } catch {
    issues.push(`Artifact ${artifact.id} must contain valid JSON evidence.`);
    return undefined;
  }
}

function compareAgentLinkage(receipt, linkage, path, issues) {
  for (const key of [
    "candidateReleaseId",
    "candidateMarker",
    "accountHash",
    "subjectId",
    "mandateId",
    "creditIntentId",
    "creditOfferId",
    "obligationId",
    "facilityId",
    "creditLineId"
  ]) {
    if (receipt?.[key] !== linkage[key]) {
      issues.push(`${path}.${key} does not match the Agent linkage record.`);
    }
  }
}

function validateApplicationMcpReceipt(receipt, linkage, issues) {
  const path = "application MCP receipt";
  const steps = [
    [
      "ipo_one_read_self",
      "pilotReadAgentSelf",
      "tenant_agent_subject_view.v2"
    ],
    [
      "ipo_one_request_credit",
      "pilotRequestCredit",
      "tenant_credit_intent_created.v1"
    ],
    [
      "ipo_one_read_credit_application",
      "pilotReadCreditApplication",
      "tenant_credit_application_view.v2"
    ],
    [
      "ipo_one_evaluate_credit_application",
      "pilotEvaluateCreditApplication",
      "tenant_credit_application_evaluated.v2"
    ]
  ];
  if (
    receipt?.schemaVersion !== "agent_credit_offer_workflow_receipt.v1" ||
    receipt.status !== "offer_ready" ||
    receipt.transportProfile !== "mcp_stdio_local" ||
    receipt.subjectId !== linkage.subjectId ||
    receipt.mandateId !== linkage.mandateId ||
    receipt.creditIntent?.creditIntentId !== linkage.creditIntentId ||
    receipt.offer?.creditOfferId !== linkage.creditOfferId ||
    receipt.nonAuthorizing !== true ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsApproved !== false ||
    receipt.fundsAuthority !== false ||
    receipt.credentialsIncluded !== false ||
    receipt.publicEndpointEnabled !== false ||
    receipt.remoteMcpEnabled !== false ||
    !Array.isArray(receipt.steps) ||
    receipt.steps.length !== steps.length ||
    !receipt.steps.every((step, index) => (
      step?.sequence === index + 1 &&
      step.tool === steps[index][0] &&
      step.operationId === steps[index][1] &&
      step.responseSchemaVersion === steps[index][2] &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(step.requestId ?? "") &&
      typeof step.replayed === "boolean"
    ))
  ) issues.push(`${path} does not prove the exact four-tool no-funds application path.`);
}

function validateRuntimeMcpReceipt(receipt, linkage, issues) {
  const operations = [
    [
      "pilotAcceptCreditOffer",
      "ipo_one_accept_credit_offer",
      "tenant_credit_offer_accepted.v1"
    ],
    [
      "pilotExecuteSandboxObligation",
      "ipo_one_execute_sandbox_obligation",
      "tenant_sandbox_obligation_executed.v1"
    ],
    [
      "pilotPostSandboxRepayment",
      "ipo_one_post_sandbox_repayment",
      "tenant_sandbox_repayment_posted.v1"
    ],
    [
      "pilotReadOwnObligationEvidence",
      "ipo_one_read_obligation_evidence",
      "tenant_owned_obligation_evidence_view.v1"
    ]
  ];
  if (
    receipt?.schemaVersion !== "local_agent_mcp_transport_receipt.v1" ||
    receipt.status !== "evidence_read" ||
    receipt.transportProfile !== "mcp_stdio_local" ||
    receipt.registryVersion !== "agent_mcp_registry.v2" ||
    receipt.obligationId !== linkage.obligationId ||
    receipt.providerTarget?.providerId !== "provider_gateway_compute" ||
    receipt.providerTarget?.providerCategory !== "compute" ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsMoved !== false ||
    receipt.withdrawable !== false ||
    receipt.fundsAuthority !== false ||
    receipt.credentialsIncluded !== false ||
    receipt.remoteMcpEnabled !== false ||
    !Array.isArray(receipt.steps) ||
    receipt.steps.length !== operations.length ||
    !receipt.steps.every((step, index) => (
      step?.sequence === index + 1 &&
      step.operationId === operations[index][0] &&
      step.tool === operations[index][1] &&
      step.responseSchemaVersion === operations[index][2] &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(step.requestId ?? "") &&
      typeof step.replayed === "boolean"
    ))
  ) issues.push("runtime MCP receipt does not prove the exact Provider-scoped no-funds path.");
}

function validateRecoveryReceipt(receipt, linkage, issues) {
  for (const key of [
    "subjectId",
    "mandateId",
    "creditIntentId",
    "creditOfferId",
    "obligationId",
    "facilityId",
    "creditLineId"
  ]) {
    if (receipt?.[key] !== linkage[key]) {
      issues.push(`recovery receipt.${key} does not match the Agent linkage record.`);
    }
  }
  if (
    receipt?.schemaVersion !== "local_agent_reference_recovery_receipt.v1" ||
    receipt.status !== "recovered" ||
    receipt.serverTruth !== true ||
    receipt.canonicalLifecycleReadOnly !== true ||
    receipt.lifecycleMutationPerformed !== false ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsMoved !== false
  ) issues.push("recovery receipt does not prove recovery-only canonical server truth.");
}

const HUMAN_CRITICAL_OPERATION_SEQUENCE = Object.freeze([
  ["pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2", false],
  ["pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1", true],
  ["pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1", true],
  ["pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1", true],
  ["pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1", false]
]);
const ACCEPTED_WALLET_VERIFICATION_METHODS = new Set([
  "eip191_eoa_v1",
  "eip1271_eip191_v1",
  "eip6492_eip191_v1"
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const MINOR_UNITS = /^(?:0|[1-9][0-9]{0,77})$/;

function validSafeSiweAuthentication(
  authentication,
  {
    expectedRequestIds,
    expectedAuditEventIds,
    expectedActorRefHash,
    databaseStartedAt,
    acceptedVerificationMethods = ACCEPTED_WALLET_VERIFICATION_METHODS
  } = {}
) {
  const coveredRequestIds = authentication?.coveredRequestIds;
  const expected = Array.isArray(expectedRequestIds)
    ? [...new Set(expectedRequestIds)].sort()
    : undefined;
  const expectedAudits = Array.isArray(expectedAuditEventIds)
    ? [...new Set(expectedAuditEventIds)].sort()
    : undefined;
  const coveredAuditEventIds = authentication?.coveredAuditEventIds;
  return exactKeys(authentication, [
    "method",
    "acr",
    "amr",
    "actorRefHash",
    "clientRefHash",
    "coveredAuditEventIds",
    "auditEventCount",
    "coveredRequestIds",
    "requestCount",
    "earliestAuthTime",
    "latestAuthTime",
    "activeCredentialBinding",
    "activeMembershipBinding",
    "credentialBindingCount",
    "invitationBoundCredentialRegistrationCount",
    "sessionMaterialIncluded",
    "rawSignatureIncluded",
    "walletAddressIncluded"
  ]) &&
    authentication.method === "siwe" &&
    authentication.acr === "urn:ipo.one:acr:wallet" &&
    Array.isArray(authentication.amr) &&
    authentication.amr.length === 3 &&
    authentication.amr[0] === "wallet" &&
    authentication.amr[1] === "siwe" &&
    acceptedVerificationMethods.has(authentication.amr[2]) &&
    HASH.test(authentication.actorRefHash ?? "") &&
    (expectedActorRefHash === undefined ||
      authentication.actorRefHash === expectedActorRefHash) &&
    HASH.test(authentication.clientRefHash ?? "") &&
    Array.isArray(coveredAuditEventIds) &&
    coveredAuditEventIds.length >= 1 &&
    coveredAuditEventIds.length === authentication.auditEventCount &&
    coveredAuditEventIds.every((eventId) => IDENTIFIER.test(eventId ?? "")) &&
    new Set(coveredAuditEventIds).size === coveredAuditEventIds.length &&
    JSON.stringify(coveredAuditEventIds) ===
      JSON.stringify([...coveredAuditEventIds].sort()) &&
    (expectedAudits === undefined ||
      JSON.stringify(coveredAuditEventIds) === JSON.stringify(expectedAudits)) &&
    Array.isArray(coveredRequestIds) &&
    coveredRequestIds.length >= 1 &&
    coveredRequestIds.length === authentication.requestCount &&
    coveredRequestIds.every((requestId) => REQUEST_IDENTIFIER.test(requestId ?? "")) &&
    new Set(coveredRequestIds).size === coveredRequestIds.length &&
    JSON.stringify(coveredRequestIds) === JSON.stringify([...coveredRequestIds].sort()) &&
    (expected === undefined || JSON.stringify(coveredRequestIds) === JSON.stringify(expected)) &&
    Number.isFinite(Date.parse(authentication.earliestAuthTime ?? "")) &&
    Number.isFinite(Date.parse(authentication.latestAuthTime ?? "")) &&
    Date.parse(authentication.earliestAuthTime) <= Date.parse(authentication.latestAuthTime) &&
    (databaseStartedAt === undefined ||
      Date.parse(authentication.earliestAuthTime) >= Date.parse(databaseStartedAt)) &&
    authentication.activeCredentialBinding === true &&
    authentication.activeMembershipBinding === true &&
    authentication.credentialBindingCount === 1 &&
    authentication.invitationBoundCredentialRegistrationCount === 1 &&
    authentication.sessionMaterialIncluded === false &&
    authentication.rawSignatureIncluded === false &&
    authentication.walletAddressIncluded === false;
}

function validCommandReceipt(receipt, expectedOperationId) {
  return exactKeys(receipt, [
    "operationId",
    "requestId",
    "correlationId",
    "resourceType",
    "resourceId",
    "authorizationAuditEventId",
    "authorizationDecisionId",
    "authorizationDecision",
    "actorRefHash",
    "policyVersion",
    "authorizationReasonCode",
    "authorizationAudits",
    "commandHash",
    "responseHash",
    "responseSchemaVersion",
    "responseProjection",
    "capturedResponseHashVerified",
    "capturedAt",
    "businessEventId",
    "occurredAt",
    "completedAt",
    "eventManifest"
  ]) &&
    receipt.operationId === expectedOperationId &&
    REQUEST_IDENTIFIER.test(receipt.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(receipt.correlationId ?? "") &&
    IDENTIFIER.test(receipt.resourceType ?? "") &&
    IDENTIFIER.test(receipt.resourceId ?? "") &&
    IDENTIFIER.test(receipt.authorizationAuditEventId ?? "") &&
    IDENTIFIER.test(receipt.authorizationDecisionId ?? "") &&
    receipt.authorizationDecision === "allow" &&
    HASH.test(receipt.actorRefHash ?? "") &&
    IDENTIFIER.test(receipt.policyVersion ?? "") &&
    receipt.authorizationReasonCode === "authorization_allowed" &&
    Array.isArray(receipt.authorizationAudits) &&
    receipt.authorizationAudits.length === 2 &&
    receipt.authorizationAudits.every((audit) => (
      validAuthorizationAudit(audit, expectedOperationId, receipt.requestId) &&
      audit.correlationId === receipt.correlationId &&
      audit.resourceType === receipt.resourceType &&
      audit.resourceId === receipt.resourceId &&
      audit.actorRefHash === receipt.actorRefHash &&
      audit.policyVersion === receipt.policyVersion &&
      Date.parse(audit.occurredAt) <= Date.parse(receipt.completedAt)
    )) &&
    new Set(receipt.authorizationAudits.map(({ eventId }) => eventId)).size === 2 &&
    new Set(receipt.authorizationAudits.map(({ authorizationDecisionId }) =>
      authorizationDecisionId
    )).size === 2 &&
    receipt.authorizationAudits.some((audit) => (
      audit.eventId === receipt.authorizationAuditEventId &&
      audit.authorizationDecisionId === receipt.authorizationDecisionId
    )) &&
    HASH.test(receipt.commandHash ?? "") &&
    HASH.test(receipt.responseHash ?? "") &&
    IDENTIFIER.test(receipt.responseSchemaVersion ?? "") &&
    exactKeys(receipt.responseProjection, Object.keys(receipt.responseProjection ?? {})) &&
    receipt.capturedResponseHashVerified === true &&
    Number.isFinite(Date.parse(receipt.capturedAt ?? "")) &&
    IDENTIFIER.test(receipt.businessEventId ?? "") &&
    Number.isFinite(Date.parse(receipt.occurredAt ?? "")) &&
    Number.isFinite(Date.parse(receipt.completedAt ?? "")) &&
    Date.parse(receipt.capturedAt) >= Date.parse(receipt.completedAt) &&
    Date.parse(receipt.completedAt) >= Date.parse(receipt.occurredAt) &&
    Array.isArray(receipt.eventManifest) &&
    receipt.eventManifest.length >= 1 &&
    receipt.eventManifest.every((event, index) => (
      validDurableEvent(event) &&
      event.sequence === index &&
      event.causationId === receipt.requestId &&
      event.correlationId === receipt.correlationId &&
      Date.parse(event.occurredAt) <= Date.parse(receipt.completedAt)
    )) &&
    receipt.eventManifest[0].eventId === receipt.businessEventId;
}

function validCriticalRedaction(redaction) {
  return exactKeys(redaction, [
    "containsSecrets",
    "containsRawPii",
    "containsSessionMaterial",
    "containsRawSignature",
    "containsWalletAddress",
    "containsDatabaseCredentials"
  ]) && Object.values(redaction).every((value) => value === false);
}

function validDurableEvent(event) {
  const hasPayloadProjection = Boolean(
    event && Object.hasOwn(event, "payloadProjection")
  );
  return exactKeys(event, [
    "sequence",
    "eventId",
    "eventType",
    "aggregateType",
    "aggregateId",
    "aggregateVersion",
    "payloadHash",
    "evidenceId",
    "evidenceHash",
    "evidencePayloadHash",
    "sourceFinality",
    "causationId",
    "correlationId",
    "occurredAt",
    ...(hasPayloadProjection ? ["payloadProjection"] : [])
  ]) &&
    Number.isSafeInteger(event.sequence) &&
    event.sequence >= 0 &&
    IDENTIFIER.test(event.eventId ?? "") &&
    IDENTIFIER.test(event.eventType ?? "") &&
    IDENTIFIER.test(event.aggregateType ?? "") &&
    IDENTIFIER.test(event.aggregateId ?? "") &&
    Number.isSafeInteger(event.aggregateVersion) &&
    event.aggregateVersion >= 1 &&
    HASH.test(event.payloadHash ?? "") &&
    IDENTIFIER.test(event.evidenceId ?? "") &&
    HASH.test(event.evidenceHash ?? "") &&
    event.evidencePayloadHash === event.payloadHash &&
    (!hasPayloadProjection || (
      exactKeys(event.payloadProjection, Object.keys(event.payloadProjection ?? {})) &&
      event.payloadHash === hashId("event_payload", event.payloadProjection)
    )) &&
    event.evidenceId === event.eventId &&
    event.sourceFinality === "finalized" &&
    (event.causationId === null || REQUEST_IDENTIFIER.test(event.causationId ?? "")) &&
    REQUEST_IDENTIFIER.test(event.correlationId ?? "") &&
    Number.isFinite(Date.parse(event.occurredAt ?? ""));
}

function validProjectionReadBack(projection, eventIds) {
  return exactKeys(projection, [
    "entityType",
    "entityId",
    "entityHash",
    "rootAggregateType",
    "rootAggregateId",
    "aggregateVersion",
    "sourceEventId",
    "sourceEvidenceHash",
    "sourceFinality"
  ]) &&
    IDENTIFIER.test(projection.entityType ?? "") &&
    IDENTIFIER.test(projection.entityId ?? "") &&
    HASH.test(projection.entityHash ?? "") &&
    IDENTIFIER.test(projection.rootAggregateType ?? "") &&
    IDENTIFIER.test(projection.rootAggregateId ?? "") &&
    Number.isSafeInteger(projection.aggregateVersion) &&
    projection.aggregateVersion >= 1 &&
    eventIds.has(projection.sourceEventId) &&
    HASH.test(projection.sourceEvidenceHash ?? "") &&
    projection.sourceFinality === "finalized";
}

function validAuthorizationAudit(audit, expectedOperationId, expectedRequestId) {
  return exactKeys(audit, [
    "eventId",
    "operationId",
    "requestId",
    "correlationId",
    "resourceType",
    "resourceId",
    "authorizationDecision",
    "authorizationDecisionId",
    "actorRefHash",
    "policyVersion",
    "reasonCode",
    "occurredAt"
  ]) &&
    IDENTIFIER.test(audit.eventId ?? "") &&
    audit.operationId === expectedOperationId &&
    audit.requestId === expectedRequestId &&
    REQUEST_IDENTIFIER.test(audit.correlationId ?? "") &&
    IDENTIFIER.test(audit.resourceType ?? "") &&
    IDENTIFIER.test(audit.resourceId ?? "") &&
    audit.authorizationDecision === "allow" &&
    IDENTIFIER.test(audit.authorizationDecisionId ?? "") &&
    HASH.test(audit.actorRefHash ?? "") &&
    IDENTIFIER.test(audit.policyVersion ?? "") &&
    IDENTIFIER.test(audit.reasonCode ?? "") &&
    Number.isFinite(Date.parse(audit.occurredAt ?? ""));
}

function validQueryProof(query, expectedOperationId, expectedResponseSchemaVersion) {
  return exactKeys(query, [
    "operationId",
    "requestId",
    "correlationId",
    "responseSchemaVersion",
    "responseProvenance",
    "responseProjection",
    "responseHash",
    "occurredAt",
    "authorizationAudits"
  ]) &&
    query.operationId === expectedOperationId &&
    REQUEST_IDENTIFIER.test(query.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(query.correlationId ?? "") &&
    query.responseSchemaVersion === expectedResponseSchemaVersion &&
    query.responseProvenance === "runtime_response_capture_db_reconciled" &&
    exactKeys(query.responseProjection, Object.keys(query.responseProjection ?? {})) &&
    HASH.test(query.responseHash ?? "") &&
    query.responseHash === criticalProjectionHash(query.responseProjection) &&
    Number.isFinite(Date.parse(query.occurredAt ?? "")) &&
    Array.isArray(query.authorizationAudits) &&
    query.authorizationAudits.length === 2 &&
    query.authorizationAudits.every((audit) => (
      validAuthorizationAudit(audit, expectedOperationId, query.requestId) &&
      audit.correlationId === query.correlationId &&
      Date.parse(audit.occurredAt) <= Date.parse(query.occurredAt)
    )) &&
    new Set(query.authorizationAudits.map(({ eventId }) => eventId)).size === 2 &&
    new Set(query.authorizationAudits.map(({ authorizationDecisionId }) =>
      authorizationDecisionId
    )).size === 2;
}

function validWorkspaceResponseProjection(projection, expected) {
  const review = projection?.humanOfferReview;
  return exactKeys(projection, [
    "workspaceKind",
    "humanOfferReview",
    "serverTruth",
    "schemaVersion"
  ]) &&
    projection.workspaceKind === "human_borrower" &&
    projection.serverTruth === true &&
    projection.schemaVersion === "tenant_workspace_resume_view.v2" &&
    exactKeys(review, [
      "subjectId",
      "consentId",
      "creditIntentId",
      "riskDecisionId",
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "offerSchemaVersion",
      "offerAggregateVersion",
      "offerStatus",
      "recoverySchemaVersion",
      "serverTruth"
    ]) &&
    Object.entries(expected).every(([key, value]) => review[key] === value) &&
    review.offerStatus === "offered" &&
    review.recoverySchemaVersion === "human_offer_review_recovery.v1" &&
    review.serverTruth === true;
}

function validHumanCommandResponseProjection(projection, operationId, identifiers) {
  if (operationId === "pilotAcceptCreditOffer") {
    return exactKeys(projection, [
      "creditOfferAcceptanceId",
      "acceptanceHash",
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "creditIntentId",
      "riskDecisionId",
      "subjectId",
      "obligationId",
      "obligationHash",
      "obligationStatus",
      "executionStatus",
      "offerStatus",
      "sandboxOnly",
      "productionAuthority",
      "productionFundsMoved",
      "withdrawable",
      "fundsAuthority",
      "schemaVersion"
    ]) &&
      projection.creditOfferAcceptanceId === identifiers?.creditOfferAcceptanceId &&
      HASH.test(projection.acceptanceHash ?? "") &&
      projection.creditOfferId === identifiers?.creditOfferId &&
      projection.creditOfferHash === identifiers?.creditOfferHash &&
      projection.termsHash === identifiers?.termsHash &&
      projection.creditIntentId === identifiers?.creditIntentId &&
      projection.riskDecisionId === identifiers?.riskDecisionId &&
      projection.subjectId === identifiers?.subjectId &&
      projection.obligationId === identifiers?.obligationId &&
      HASH.test(projection.obligationHash ?? "") &&
      projection.obligationStatus === "created" &&
      projection.executionStatus === "pending" &&
      projection.offerStatus === "accepted" &&
      projection.sandboxOnly === true &&
      projection.productionAuthority === false &&
      projection.productionFundsMoved === false &&
      projection.withdrawable === false &&
      projection.fundsAuthority === false &&
      projection.schemaVersion === "tenant_credit_offer_accepted.v1";
  }
  if (operationId === "pilotExecuteSandboxObligation") {
    return exactKeys(projection, [
      "obligationId",
      "obligationHash",
      "obligationStatus",
      "executionStatus",
      "sandboxExecutionReceiptId",
      "executionReceiptHash",
      "assetId",
      "amountMinor",
      "principalLedgerTransactionId",
      "sandboxOnly",
      "productionFundsMoved",
      "withdrawable",
      "schemaVersion"
    ]) &&
      projection.obligationId === identifiers?.obligationId &&
      HASH.test(projection.obligationHash ?? "") &&
      projection.obligationStatus === "active" &&
      projection.executionStatus === "executed" &&
      projection.sandboxExecutionReceiptId === identifiers?.sandboxExecutionReceiptId &&
      projection.executionReceiptHash === identifiers?.executionReceiptHash &&
      IDENTIFIER.test(projection.assetId ?? "") &&
      MINOR_UNITS.test(projection.amountMinor ?? "") &&
      projection.principalLedgerTransactionId === identifiers?.principalLedgerTransactionId &&
      projection.sandboxOnly === true &&
      projection.productionFundsMoved === false &&
      projection.withdrawable === false &&
      projection.schemaVersion === "tenant_sandbox_obligation_executed.v1";
  }
  if (operationId === "pilotPostSandboxRepayment") {
    return exactKeys(projection, [
      "obligationId",
      "obligationHash",
      "obligationStatus",
      "repaymentId",
      "repaymentHash",
      "ledgerTransactionId",
      "interestLedgerTransactionId",
      "sandboxOnly",
      "productionFundsMoved",
      "withdrawable",
      "schemaVersion"
    ]) &&
      projection.obligationId === identifiers?.obligationId &&
      HASH.test(projection.obligationHash ?? "") &&
      projection.obligationStatus === "fully_repaid" &&
      projection.repaymentId === identifiers?.repaymentId &&
      projection.repaymentHash === identifiers?.repaymentHash &&
      IDENTIFIER.test(projection.ledgerTransactionId ?? "") &&
      (projection.interestLedgerTransactionId === null ||
        IDENTIFIER.test(projection.interestLedgerTransactionId ?? "")) &&
      projection.sandboxOnly === true &&
      projection.productionFundsMoved === false &&
      projection.withdrawable === false &&
      projection.schemaVersion === "tenant_sandbox_repayment_posted.v1";
  }
  return false;
}

function validCapitalPartnerCommandResponseProjection(
  projection,
  operationId,
  offer,
  passport,
  profile,
  lineage,
  command
) {
  if (operationId === "pilotAuthorCapitalPartnerOffer") {
    return exactKeys(projection, [
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "creditIntentId",
      "subjectId",
      "riskDecisionId",
      "capitalPartnerId",
      "creditPassportArtifactId",
      "creditPassportArtifactHash",
      "creditPassportArtifactVersion",
      "status",
      "offerSchemaVersion",
      "sandboxOnly",
      "productionFundsApproved",
      "responseCapitalPartnerId",
      "fundsAuthority",
      "schemaVersion"
    ]) &&
      projection.creditOfferId === offer?.creditOfferId &&
      projection.creditOfferHash === offer?.creditOfferHash &&
      projection.termsHash === offer?.termsHash &&
      projection.creditIntentId === passport?.creditIntentId &&
      projection.subjectId === lineage?.subjectId &&
      projection.riskDecisionId === lineage?.riskDecisionId &&
      projection.capitalPartnerId === profile?.capitalPartnerId &&
      projection.creditPassportArtifactId === passport?.artifactId &&
      projection.creditPassportArtifactHash === passport?.artifactHash &&
      projection.creditPassportArtifactVersion === passport?.artifactVersion &&
      projection.status === "offered" &&
      projection.offerSchemaVersion === "credit_offer.v2" &&
      projection.sandboxOnly === true &&
      projection.productionFundsApproved === false &&
      projection.responseCapitalPartnerId === profile?.capitalPartnerId &&
      projection.fundsAuthority === false &&
      projection.schemaVersion === "tenant_capital_partner_offer_authored.v1";
  }
  if (operationId === "pilotTransitionCapitalPartnerOffer") {
    return exactKeys(projection, [
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "creditIntentId",
      "subjectId",
      "riskDecisionId",
      "capitalPartnerId",
      "status",
      "offerSchemaVersion",
      "closedAt",
      "sandboxOnly",
      "productionFundsApproved",
      "schemaVersion"
    ]) &&
      projection.creditOfferId === offer?.creditOfferId &&
      projection.creditOfferHash === offer?.creditOfferHash &&
      projection.termsHash === offer?.termsHash &&
      projection.creditIntentId === passport?.creditIntentId &&
      projection.subjectId === lineage?.subjectId &&
      projection.riskDecisionId === lineage?.riskDecisionId &&
      projection.capitalPartnerId === profile?.capitalPartnerId &&
      projection.status === "withdrawn" &&
      projection.offerSchemaVersion === "credit_offer.v2" &&
      projection.closedAt === command?.occurredAt &&
      projection.sandboxOnly === true &&
      projection.productionFundsApproved === false &&
      projection.schemaVersion === "tenant_capital_partner_offer_transitioned.v1";
  }
  return false;
}

function validCapitalPartnerSelfResponseProjection(projection, profile) {
  return exactKeys(projection, [
    "capitalPartnerId",
    "resourceType",
    "resourceId",
    "fundsAuthority",
    "serverTruth",
    "readOnly",
    "schemaVersion"
  ]) &&
    projection.capitalPartnerId === profile?.capitalPartnerId &&
    projection.resourceType === "capital_partner_profile" &&
    projection.resourceId === profile?.capitalPartnerId &&
    projection.fundsAuthority === false &&
    projection.serverTruth === true &&
    projection.readOnly === true &&
    projection.schemaVersion === "tenant_capital_partner_self_view.v1";
}

function validPassportInboxResponseProjection(projection, passport, queryOccurredAt) {
  return exactKeys(projection, [
    "items",
    "count",
    "hasMore",
    "fundsAuthority",
    "serverTruth",
    "readOnly",
    "schemaVersion"
  ]) &&
    Array.isArray(projection.items) &&
    projection.items.length === projection.count &&
    projection.items.length >= 1 &&
    projection.items.every((item) => exactKeys(item, [
      "artifactId",
      "artifactHash",
      "artifactVersion",
      "creditIntentId",
      "claimCount",
      "purpose",
      "issuedAt",
      "expiresAt"
    ])) &&
    projection.items.some((item) => (
      item.artifactId === passport?.artifactId &&
      item.artifactHash === passport?.artifactHash &&
      item.artifactVersion === passport?.artifactVersion &&
      item.creditIntentId === passport?.creditIntentId &&
      item.claimCount === passport?.claimCount &&
      item.purpose === passport?.purpose &&
      Number.isFinite(Date.parse(item.issuedAt ?? "")) &&
      Number.isFinite(Date.parse(item.expiresAt ?? "")) &&
      Number.isFinite(Date.parse(queryOccurredAt ?? "")) &&
      Date.parse(item.issuedAt) <= Date.parse(queryOccurredAt) &&
      Date.parse(queryOccurredAt) < Date.parse(item.expiresAt)
    )) &&
    projection.hasMore === false &&
    projection.fundsAuthority === false &&
    projection.serverTruth === true &&
    projection.readOnly === true &&
    projection.schemaVersion === "tenant_capital_partner_passport_inbox_view.v1";
}

function evidenceManifestHash(orderedEvidenceIds, events) {
  if (!Array.isArray(orderedEvidenceIds) || !Array.isArray(events)) return null;
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const manifest = [];
  for (const eventId of orderedEvidenceIds) {
    const event = byId.get(eventId);
    if (!event) return null;
    manifest.push({
      eventId: event.eventId,
      evidenceHash: event.evidenceHash,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      payloadHash: event.payloadHash,
      sourceFinality: event.sourceFinality
    });
  }
  return criticalProjectionHash(manifest);
}

function validHumanIdentityReferenceProof(proof, identifiers, riskDecisionId, eventIds) {
  const projection = proof?.projectionProof;
  const binding = proof?.decisionBinding;
  const source = binding?.sourceEvidence;
  return exactKeys(proof, [
    "identityReferenceId",
    "identityReferenceHash",
    "referenceEvidenceHash",
    "aggregateVersion",
    "projectionProof",
    "decisionBinding"
  ]) &&
    proof.identityReferenceId === identifiers?.identityReferenceId &&
    HASH.test(proof.identityReferenceHash ?? "") &&
    HASH.test(proof.referenceEvidenceHash ?? "") &&
    Number.isSafeInteger(proof.aggregateVersion) &&
    proof.aggregateVersion >= 1 &&
    validProjectionReadBack(projection, eventIds) &&
    projection.entityType === "human_identity_reference" &&
    projection.entityId === proof.identityReferenceId &&
    projection.entityHash === proof.identityReferenceHash &&
    projection.aggregateVersion === proof.aggregateVersion &&
    exactKeys(binding, [
      "riskDecisionId",
      "decisionHash",
      "riskFeatureSnapshotId",
      "featureSnapshotHash",
      "computedFeatureSnapshotHash",
      "riskDecisionPassportId",
      "decisionPassportHash",
      "sourceEvidence"
    ]) &&
    binding.riskDecisionId === riskDecisionId &&
    HASH.test(binding.decisionHash ?? "") &&
    IDENTIFIER.test(binding.riskFeatureSnapshotId ?? "") &&
    HASH.test(binding.featureSnapshotHash ?? "") &&
    binding.computedFeatureSnapshotHash === binding.featureSnapshotHash &&
    IDENTIFIER.test(binding.riskDecisionPassportId ?? "") &&
    HASH.test(binding.decisionPassportHash ?? "") &&
    exactKeys(source, [
      "role",
      "entityType",
      "entityIdHash",
      "aggregateVersion",
      "entityHash",
      "evidenceHash",
      "sourceFinality"
    ]) &&
    source.role === "human_identity_reference" &&
    source.entityType === "human_identity_reference" &&
    source.entityIdHash === hashId("risk_source_entity", {
      entityType: "human_identity_reference",
      entityId: proof.identityReferenceId
    }) &&
    source.aggregateVersion === proof.aggregateVersion &&
    source.entityHash === proof.identityReferenceHash &&
    source.evidenceHash === projection.sourceEvidenceHash &&
    source.sourceFinality === projection.sourceFinality;
}

function exactManifestEventTypes(receipt, expected) {
  return validCommandReceipt(receipt, receipt?.operationId) &&
    JSON.stringify(receipt.eventManifest.map(({ eventType }) => eventType)) ===
      JSON.stringify(expected);
}

function validEconomicActionConfirmation(value, actionType, requestId) {
  return exactKeys(value, [
    "actionType",
    "confirmationMethod",
    "confirmationHash",
    "messageHash",
    "resourceHash",
    "payloadHash",
    "requestId",
    "confirmedAt",
    "rawSignaturePersisted",
    "blockchainTransactionSubmitted",
    "schemaVersion"
  ]) &&
    value.actionType === actionType &&
    value.confirmationMethod === "wallet_personal_sign" &&
    [
      value.confirmationHash,
      value.messageHash,
      value.resourceHash,
      value.payloadHash
    ].every((hash) => HASH.test(hash ?? "")) &&
    value.requestId === requestId &&
    Number.isFinite(Date.parse(value.confirmedAt ?? "")) &&
    value.rawSignaturePersisted === false &&
    value.blockchainTransactionSubmitted === false &&
    value.schemaVersion === "economic_action_confirmation_result.v1";
}

function validHumanLifecycleEventPayloads(operations, identifiers) {
  const acceptanceCommand = operations?.[1]?.commandReceipt;
  const executionCommand = operations?.[2]?.commandReceipt;
  const repaymentCommand = operations?.[3]?.commandReceipt;
  const acceptance = acceptanceCommand?.eventManifest?.[0]?.payloadProjection;
  const accepted = acceptanceCommand?.eventManifest?.[1]?.payloadProjection;
  const obligation = acceptanceCommand?.eventManifest?.[2]?.payloadProjection;
  const execution = executionCommand?.eventManifest?.[2]?.payloadProjection;
  const repayment = repaymentCommand?.eventManifest?.at(-1)?.payloadProjection;
  const acceptanceBaseKeys = [
    "creditOfferAcceptanceId", "acceptanceHash", "creditOfferId", "creditOfferHash",
    "termsHash", "acknowledgementHash", "authorityType", "authorityRef", "actorHash",
    "actionConfirmation", "sandboxOnly", "productionAuthority", "causationId",
    "correlationId"
  ];
  const acceptanceKeys = Object.keys(acceptance ?? {});
  const acceptanceShape = exactKeys(acceptance, acceptanceBaseKeys) ||
    exactKeys(acceptance, [
      ...acceptanceBaseKeys.slice(0, 10),
      "capitalPartnerRefHash",
      "creditPassportArtifactHash",
      "passportVerificationHash",
      "underwritingSnapshotHash",
      ...acceptanceBaseKeys.slice(10)
    ]);
  return acceptanceShape &&
    acceptanceKeys.every((key) => acceptanceBaseKeys.includes(key) || new Set([
      "capitalPartnerRefHash",
      "creditPassportArtifactHash",
      "passportVerificationHash",
      "underwritingSnapshotHash"
    ]).has(key)) &&
    acceptance.creditOfferAcceptanceId === identifiers?.creditOfferAcceptanceId &&
    HASH.test(acceptance.acceptanceHash ?? "") &&
    acceptance.creditOfferId === identifiers?.creditOfferId &&
    acceptance.creditOfferHash === identifiers?.creditOfferHash &&
    acceptance.termsHash === identifiers?.termsHash &&
    HASH.test(acceptance.acknowledgementHash ?? "") &&
    acceptance.authorityType === "consent" &&
    acceptance.authorityRef === identifiers?.consentId &&
    HASH.test(acceptance.actorHash ?? "") &&
    acceptance.sandboxOnly === true &&
    acceptance.productionAuthority === false &&
    acceptance.causationId === acceptanceCommand.requestId &&
    acceptance.correlationId === acceptanceCommand.correlationId &&
    validEconomicActionConfirmation(
      acceptance.actionConfirmation,
      "accept_offer",
      acceptanceCommand.requestId
    ) &&
    exactKeys(accepted, [
      "creditOfferId",
      "creditOfferAcceptanceId",
      "previousStatus",
      "nextStatus",
      "actorHash",
      "actionConfirmation",
      "causationId",
      "correlationId"
    ]) &&
    accepted.creditOfferId === identifiers?.creditOfferId &&
    accepted.creditOfferAcceptanceId === identifiers?.creditOfferAcceptanceId &&
    accepted.previousStatus === "offered" &&
    accepted.nextStatus === "accepted" &&
    accepted.actorHash === acceptance.actorHash &&
    accepted.causationId === acceptanceCommand.requestId &&
    accepted.correlationId === acceptanceCommand.correlationId &&
    validEconomicActionConfirmation(
      accepted.actionConfirmation,
      "accept_offer",
      acceptanceCommand.requestId
    ) &&
    exactKeys(obligation, [
      "obligationId", "obligationHash", "creditIntentId", "riskDecisionId",
      "creditOfferId", "creditOfferAcceptanceId", "authorityType", "authorityRef",
      "assetId", "originalPrincipalMinor", "scheduleHash", "executionStatus",
      "sandboxOnly", "productionFundsMoved", "actorHash", "actionConfirmation",
      "causationId", "correlationId"
    ]) &&
    obligation.obligationId === identifiers?.obligationId &&
    HASH.test(obligation.obligationHash ?? "") &&
    obligation.creditIntentId === identifiers?.creditIntentId &&
    obligation.riskDecisionId === identifiers?.riskDecisionId &&
    obligation.creditOfferId === identifiers?.creditOfferId &&
    obligation.creditOfferAcceptanceId === identifiers?.creditOfferAcceptanceId &&
    obligation.authorityType === "consent" &&
    obligation.authorityRef === identifiers?.consentId &&
    HASH.test(obligation.scheduleHash ?? "") &&
    obligation.executionStatus === "pending" &&
    obligation.sandboxOnly === true &&
    obligation.productionFundsMoved === false &&
    obligation.actorHash === acceptance.actorHash &&
    obligation.causationId === acceptanceCommand.requestId &&
    obligation.correlationId === acceptanceCommand.correlationId &&
    validEconomicActionConfirmation(
      obligation.actionConfirmation,
      "accept_offer",
      acceptanceCommand.requestId
    ) &&
    exactKeys(execution, [
      "obligationId", "sandboxExecutionReceiptId", "receiptHash",
      "principalLedgerTransactionId", "previousStatus", "nextStatus",
      "previousExecutionStatus", "nextExecutionStatus", "actorId", "causationId",
      "correlationId", "sandboxOnly", "productionFundsMoved", "withdrawable",
      "actionConfirmation"
    ]) &&
    execution.obligationId === identifiers?.obligationId &&
    execution.sandboxExecutionReceiptId === identifiers?.sandboxExecutionReceiptId &&
    execution.receiptHash === identifiers?.executionReceiptHash &&
    execution.principalLedgerTransactionId === identifiers?.principalLedgerTransactionId &&
    execution.previousStatus === "created" &&
    execution.nextStatus === "active" &&
    execution.previousExecutionStatus === "pending" &&
    execution.nextExecutionStatus === "executed" &&
    IDENTIFIER.test(execution.actorId ?? "") &&
    hashId("m1_b_acceptance_actor_reference", { actorId: execution.actorId }) ===
      executionCommand.actorRefHash &&
    execution.causationId === executionCommand.requestId &&
    execution.correlationId === executionCommand.correlationId &&
    execution.sandboxOnly === true &&
    execution.productionFundsMoved === false &&
    execution.withdrawable === false &&
    validEconomicActionConfirmation(
      execution.actionConfirmation,
      "execute_obligation",
      executionCommand.requestId
    ) &&
    exactKeys(repayment, [
      "repaymentId", "repaymentHash", "obligationId", "requestedMinor", "appliedMinor",
      "appliedFeeMinor", "appliedInterestMinor", "appliedPrincipalMinor", "surplusMinor",
      "previousStatus", "nextStatus", "actorId", "causationId", "correlationId",
      "sandboxOnly", "productionFundsMoved", "actionConfirmation"
    ]) &&
    repayment.repaymentId === identifiers?.repaymentId &&
    repayment.repaymentHash === identifiers?.repaymentHash &&
    repayment.obligationId === identifiers?.obligationId &&
    [
      repayment.requestedMinor,
      repayment.appliedMinor,
      repayment.appliedFeeMinor,
      repayment.appliedInterestMinor,
      repayment.appliedPrincipalMinor,
      repayment.surplusMinor
    ].every((value) => MINOR_UNITS.test(value ?? "")) &&
    BigInt(repayment.requestedMinor) ===
      BigInt(repayment.appliedMinor) + BigInt(repayment.surplusMinor) &&
    BigInt(repayment.appliedMinor) ===
      BigInt(repayment.appliedFeeMinor) +
      BigInt(repayment.appliedInterestMinor) +
      BigInt(repayment.appliedPrincipalMinor) &&
    repayment.requestedMinor === repayment.appliedMinor &&
    repayment.surplusMinor === "0" &&
    repayment.appliedFeeMinor === "0" &&
    repayment.previousStatus === "active" &&
    repayment.nextStatus === "fully_repaid" &&
    IDENTIFIER.test(repayment.actorId ?? "") &&
    hashId("m1_b_acceptance_actor_reference", { actorId: repayment.actorId }) ===
      repaymentCommand.actorRefHash &&
    repayment.causationId === repaymentCommand.requestId &&
    repayment.correlationId === repaymentCommand.correlationId &&
    repayment.sandboxOnly === true &&
    repayment.productionFundsMoved === false &&
    validEconomicActionConfirmation(
      repayment.actionConfirmation,
      "post_repayment",
      repaymentCommand.requestId
    );
}

function validHumanRepaymentManifest(receipt) {
  if (!validCommandReceipt(receipt, "pilotPostSandboxRepayment")) return false;
  const types = receipt.eventManifest.map(({ eventType }) => eventType);
  if (types.at(-1) !== "repayment_posted") return false;
  const body = types.slice(0, -1);
  if (body[0] === "interest_accrued") body.shift();
  if (body.shift() !== "ledger_transaction_posted") return false;
  if (
    body.length === 1 &&
    !new Set(["servicing_advanced", "obligation_cured"]).has(body[0])
  ) return false;
  return body.length <= 1;
}

function validHumanLedgerTransactionReadBack(transaction, expected) {
  const entries = transaction?.entries;
  if (!exactKeys(transaction, [
    "ledgerTransactionId",
    "transactionHash",
    "transactionType",
    "assetId",
    "referenceType",
    "referenceId",
    "metadataHash",
    "canonicalSourceVerified",
    "idempotencyKeyIncluded",
    "metadataIncluded",
    "debitTotalMinor",
    "creditTotalMinor",
    "entryCount",
    "postedAt",
    "schemaVersion",
    "entriesManifestHash",
    "entries"
  ]) ||
    !IDENTIFIER.test(transaction.ledgerTransactionId ?? "") ||
    !HASH.test(transaction.transactionHash ?? "") ||
    transaction.transactionType !== expected.transactionType ||
    transaction.assetId !== expected.assetId ||
    transaction.referenceType !== expected.referenceType ||
    transaction.referenceId !== expected.referenceId ||
    transaction.metadataHash !== expected.metadataHash ||
    transaction.canonicalSourceVerified !== true ||
    transaction.idempotencyKeyIncluded !== false ||
    transaction.metadataIncluded !== false ||
    !MINOR_UNITS.test(transaction.debitTotalMinor ?? "") ||
    transaction.creditTotalMinor !== transaction.debitTotalMinor ||
    transaction.debitTotalMinor !== expected.amountMinor ||
    !Number.isSafeInteger(transaction.entryCount) ||
    transaction.entryCount < 2 ||
    !Number.isFinite(Date.parse(transaction.postedAt ?? "")) ||
    transaction.schemaVersion !== "ledger_transaction.v1" ||
    !Array.isArray(entries) ||
    entries.length !== transaction.entryCount) return false;
  let debit = 0n;
  let credit = 0n;
  for (const [index, entry] of entries.entries()) {
    if (!exactKeys(entry, [
      "sequence",
      "ledgerEntryId",
      "ledgerAccountRefHash",
      "accountOwnerType",
      "accountOwnerRefHash",
      "accountAssetId",
      "accountType",
      "accountNormalSide",
      "accountStatus",
      "canonicalAccountVerified",
      "direction",
      "amountMinor",
      "postedAt",
      "schemaVersion"
    ]) ||
      entry.sequence !== index ||
      !IDENTIFIER.test(entry.ledgerEntryId ?? "") ||
      !HASH.test(entry.ledgerAccountRefHash ?? "") ||
      entry.accountOwnerType !== "obligation" ||
      entry.accountOwnerRefHash !== expected.accountOwnerRefHash ||
      entry.accountAssetId !== expected.assetId ||
      entry.accountType !== expected.accountTypes[index] ||
      entry.ledgerAccountRefHash !== expected.accountRefHashes[index] ||
      entry.accountNormalSide !== expected.normalSides[index] ||
      entry.accountStatus !== "active" ||
      entry.canonicalAccountVerified !== true ||
      entry.direction !== expected.directions[index] ||
      !MINOR_UNITS.test(entry.amountMinor ?? "") ||
      BigInt(entry.amountMinor) <= 0n ||
      entry.postedAt !== transaction.postedAt ||
      entry.schemaVersion !== "ledger_entry.v1") return false;
    if (entry.direction === "debit") debit += BigInt(entry.amountMinor);
    else credit += BigInt(entry.amountMinor);
  }
  return debit === BigInt(transaction.debitTotalMinor) &&
    credit === BigInt(transaction.creditTotalMinor) &&
    transaction.entriesManifestHash === criticalProjectionHash(entries) &&
    JSON.stringify(entries.map(({ accountType }) => accountType)) ===
      JSON.stringify(expected.accountTypes) &&
    transaction.ledgerTransactionId === expected.ledgerTransactionId &&
    transaction.transactionHash === expected.transactionHash &&
    transaction.entryCount === expected.entryCount &&
    transaction.postedAt === expected.postedAt;
}

function validHumanObligationReadBack(
  obligation,
  installmentSummary,
  identifiers,
  operations,
  executionReceipt,
  repayment
) {
  const acceptanceResponse = operations?.[1]?.commandReceipt?.responseProjection;
  const executionResponse = operations?.[2]?.commandReceipt?.responseProjection;
  const repaymentResponse = operations?.[3]?.commandReceipt?.responseProjection;
  const obligationEvent = operations?.[1]?.commandReceipt?.eventManifest?.find(
    ({ eventType }) => eventType === "obligation_created"
  )?.payloadProjection;
  if (!exactKeys(obligation, [
    "obligationHash",
    "subjectId",
    "assetId",
    "originalPrincipalMinor",
    "outstandingPrincipalMinor",
    "repaidPrincipalMinor",
    "accruedInterestMinor",
    "outstandingInterestMinor",
    "accruedFeesMinor",
    "outstandingFeesMinor",
    "totalRepaidMinor",
    "installmentCount",
    "scheduleVersion",
    "scheduleHash",
    "scheduleSequence",
    "executionStatus",
    "sandboxExecutionReceiptId",
    "executedAt",
    "status",
    "sandboxOnly",
    "productionFundsMoved",
    "withdrawable",
    "schemaVersion"
  ]) ||
    !HASH.test(obligation.obligationHash ?? "") ||
    obligation.obligationHash !== obligationEvent?.obligationHash ||
    obligation.obligationHash !== acceptanceResponse?.obligationHash ||
    obligation.obligationHash !== executionResponse?.obligationHash ||
    obligation.obligationHash !== repaymentResponse?.obligationHash ||
    obligation.subjectId !== identifiers?.subjectId ||
    obligation.assetId !== executionReceipt?.assetId ||
    [
      "originalPrincipalMinor",
      "outstandingPrincipalMinor",
      "repaidPrincipalMinor",
      "accruedInterestMinor",
      "outstandingInterestMinor",
      "accruedFeesMinor",
      "outstandingFeesMinor",
      "totalRepaidMinor"
    ].some((key) => !MINOR_UNITS.test(obligation[key] ?? "")) ||
    obligation.originalPrincipalMinor !== executionReceipt?.amountMinor ||
    obligation.originalPrincipalMinor !== repayment?.appliedPrincipalMinor ||
    obligation.originalPrincipalMinor !== obligationEvent?.originalPrincipalMinor ||
    obligation.outstandingPrincipalMinor !== "0" ||
    obligation.repaidPrincipalMinor !== repayment?.appliedPrincipalMinor ||
    obligation.accruedInterestMinor !== repayment?.accruedInterestMinor ||
    obligation.outstandingInterestMinor !== "0" ||
    obligation.accruedFeesMinor !== repayment?.appliedFeeMinor ||
    obligation.outstandingFeesMinor !== "0" ||
    obligation.totalRepaidMinor !== repayment?.appliedMinor ||
    !Number.isSafeInteger(obligation.installmentCount) ||
    obligation.installmentCount < 1 ||
    obligation.scheduleVersion !== "obligation_schedule.v1" ||
    !HASH.test(obligation.scheduleHash ?? "") ||
    obligation.scheduleHash !== obligationEvent?.scheduleHash ||
    obligation.scheduleSequence !== 1 ||
    obligation.executionStatus !== "executed" ||
    obligation.sandboxExecutionReceiptId !== identifiers?.sandboxExecutionReceiptId ||
    obligation.executedAt !== executionReceipt?.executedAt ||
    obligation.status !== "fully_repaid" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false ||
    obligation.withdrawable !== false ||
    obligation.schemaVersion !== "obligation.v2") return false;
  if (!exactKeys(installmentSummary, [
    "installmentCount",
    "paidInstallmentCount",
    "scheduledPrincipalMinor",
    "scheduledInterestMinor",
    "scheduledFeeMinor",
    "paidPrincipalMinor",
    "paidInterestMinor",
    "paidFeeMinor",
    "paidTotalMinor",
    "currentStateManifestHash",
    "allPaid",
    "installmentIdsIncluded"
  ]) ||
    installmentSummary.installmentCount !== obligation.installmentCount ||
    installmentSummary.paidInstallmentCount !== obligation.installmentCount ||
    [
      "scheduledPrincipalMinor",
      "scheduledInterestMinor",
      "scheduledFeeMinor",
      "paidPrincipalMinor",
      "paidInterestMinor",
      "paidFeeMinor",
      "paidTotalMinor"
    ].some((key) => !MINOR_UNITS.test(installmentSummary[key] ?? "")) ||
    installmentSummary.scheduledPrincipalMinor !== obligation.originalPrincipalMinor ||
    installmentSummary.scheduledInterestMinor !== repayment.appliedInterestMinor ||
    installmentSummary.scheduledFeeMinor !== repayment.appliedFeeMinor ||
    installmentSummary.paidPrincipalMinor !== obligation.repaidPrincipalMinor ||
    installmentSummary.paidInterestMinor !== installmentSummary.scheduledInterestMinor ||
    installmentSummary.paidFeeMinor !== installmentSummary.scheduledFeeMinor ||
    BigInt(installmentSummary.paidTotalMinor) !==
      BigInt(installmentSummary.paidPrincipalMinor) +
        BigInt(installmentSummary.paidInterestMinor) +
        BigInt(installmentSummary.paidFeeMinor) ||
    installmentSummary.paidTotalMinor !== obligation.totalRepaidMinor ||
    !HASH.test(installmentSummary.currentStateManifestHash ?? "") ||
    installmentSummary.allPaid !== true ||
    installmentSummary.installmentIdsIncluded !== false) return false;
  return true;
}

function humanLedgerAccountRefHash(obligationId, assetId, accountType) {
  const digest = hashId("sandbox_ledger_account", {
    ownerType: "obligation",
    ownerId: obligationId,
    assetId,
    accountType
  });
  return hashId("m1_b_ledger_account_reference", {
    ledgerAccountId: `ledger_account_${digest.slice(2)}`
  });
}

function validHumanEconomicReadBack(
  readBack,
  identifiers,
  operations,
  databaseStartedAt,
  durableEvents
) {
  const executionReceipt = readBack?.executionReceipt;
  const repayment = readBack?.repayment;
  const obligation = readBack?.obligation;
  const installmentSummary = readBack?.installmentSummary;
  const executionCommand = operations?.[2]?.commandReceipt;
  const repaymentCommand = operations?.[3]?.commandReceipt;
  const executionResponse = executionCommand?.responseProjection;
  const repaymentResponse = repaymentCommand?.responseProjection;
  const executionEvent = executionCommand?.eventManifest?.find(({ eventType }) =>
    eventType === "obligation_sandbox_executed"
  )?.payloadProjection;
  const executionLedgerEvent = executionCommand?.eventManifest?.find(({ eventType }) =>
    eventType === "ledger_transaction_posted"
  )?.payloadProjection;
  const repaymentEvent = repaymentCommand?.eventManifest?.find(({ eventType }) =>
    eventType === "repayment_posted"
  )?.payloadProjection;
  const repaymentLedgerEvent = repaymentCommand?.eventManifest?.find(({ eventType }) =>
    eventType === "ledger_transaction_posted"
  )?.payloadProjection;
  const interestEvent = repaymentCommand?.eventManifest?.find(({ eventType }) =>
    eventType === "interest_accrued"
  )?.payloadProjection;
  const start = Date.parse(databaseStartedAt ?? "");
  if (!exactKeys(readBack, [
    "schemaVersion",
    "obligationId",
    "repaymentRowCount",
    "repaymentPostedEventCount",
    "obligation",
    "installmentSummary",
    "executionReceipt",
    "repayment",
    "principalLedgerTransaction",
    "repaymentLedgerTransaction",
    "interestLedgerTransaction"
  ]) ||
    readBack.schemaVersion !== "m1_b_human_economic_read_back.v1" ||
    readBack.obligationId !== identifiers?.obligationId ||
    readBack.repaymentRowCount !== 1 ||
    readBack.repaymentPostedEventCount !== 1 ||
    !Array.isArray(durableEvents) ||
    durableEvents.filter((event) => (
      event.eventType === "repayment_posted" &&
      event.aggregateType === "obligation" &&
      event.aggregateId === identifiers?.obligationId
    )).length !== 1 ||
    !exactKeys(executionReceipt, [
      "sandboxExecutionReceiptId",
      "receiptHash",
      "obligationId",
      "subjectId",
      "assetId",
      "amountMinor",
      "adapterId",
      "adapterVersion",
      "adapterKeyId",
      "adapterMessageHash",
      "adapterIssuedAt",
      "executedAt",
      "sandboxOnly",
      "productionFundsMoved",
      "withdrawable",
      "schemaVersion"
    ]) ||
    executionReceipt.sandboxExecutionReceiptId !== identifiers?.sandboxExecutionReceiptId ||
    executionReceipt.receiptHash !== identifiers?.executionReceiptHash ||
    executionReceipt.obligationId !== identifiers?.obligationId ||
    executionReceipt.subjectId !== identifiers?.subjectId ||
    executionReceipt.assetId !== executionResponse?.assetId ||
    executionReceipt.amountMinor !== executionResponse?.amountMinor ||
    !IDENTIFIER.test(executionReceipt.adapterId ?? "") ||
    !IDENTIFIER.test(executionReceipt.adapterVersion ?? "") ||
    !HASH.test(executionReceipt.adapterKeyId ?? "") ||
    !HASH.test(executionReceipt.adapterMessageHash ?? "") ||
    executionReceipt.adapterIssuedAt !== executionReceipt.executedAt ||
    executionReceipt.executedAt !== executionCommand?.occurredAt ||
    Date.parse(executionReceipt.executedAt ?? "") < start ||
    executionReceipt.sandboxOnly !== true ||
    executionReceipt.productionFundsMoved !== false ||
    executionReceipt.withdrawable !== false ||
    executionReceipt.schemaVersion !== "sandbox_execution_receipt.v1" ||
    executionReceipt.sandboxExecutionReceiptId !== executionEvent?.sandboxExecutionReceiptId ||
    executionReceipt.receiptHash !== executionEvent?.receiptHash ||
    !exactKeys(repayment, [
      "repaymentId",
      "repaymentHash",
      "obligationId",
      "subjectId",
      "assetId",
      "requestedMinor",
      "appliedMinor",
      "appliedFeeMinor",
      "appliedInterestMinor",
      "appliedPrincipalMinor",
      "surplusMinor",
      "remainingPrincipalMinor",
      "remainingInterestMinor",
      "remainingFeesMinor",
      "sourceCode",
      "actorHash",
      "accruedInterestMinor",
      "accrualDays",
      "ledgerTransactionId",
      "interestLedgerTransactionId",
      "occurredAt",
      "sandboxOnly",
      "productionFundsMoved",
      "schemaVersion"
    ]) ||
    repayment.repaymentId !== identifiers?.repaymentId ||
    repayment.repaymentHash !== identifiers?.repaymentHash ||
    repayment.obligationId !== identifiers?.obligationId ||
    repayment.subjectId !== identifiers?.subjectId ||
    repayment.assetId !== executionReceipt.assetId ||
    [
      "requestedMinor",
      "appliedMinor",
      "appliedFeeMinor",
      "appliedInterestMinor",
      "appliedPrincipalMinor",
      "surplusMinor",
      "remainingPrincipalMinor",
      "remainingInterestMinor",
      "remainingFeesMinor",
      "accruedInterestMinor"
    ].some((key) => !MINOR_UNITS.test(repayment[key] ?? "")) ||
    repayment.requestedMinor !== repayment.appliedMinor ||
    repayment.surplusMinor !== "0" ||
    repayment.appliedFeeMinor !== "0" ||
    repayment.appliedInterestMinor !== "0" ||
    repayment.accruedInterestMinor !== "0" ||
    repayment.accrualDays !== 0 ||
    repayment.appliedPrincipalMinor !== executionReceipt.amountMinor ||
    BigInt(repayment.appliedMinor) !==
      BigInt(repayment.appliedFeeMinor) + BigInt(repayment.appliedInterestMinor) +
        BigInt(repayment.appliedPrincipalMinor) ||
    BigInt(repayment.remainingPrincipalMinor) +
      BigInt(repayment.remainingInterestMinor) + BigInt(repayment.remainingFeesMinor) !== 0n ||
    repayment.requestedMinor !== executionReceipt.amountMinor ||
    repayment.sourceCode !== "synthetic_wallet" ||
    !HASH.test(repayment.actorHash ?? "") ||
    !Number.isSafeInteger(repayment.accrualDays) ||
    repayment.accrualDays < 0 ||
    repayment.ledgerTransactionId !== repaymentResponse?.ledgerTransactionId ||
    repayment.interestLedgerTransactionId !== repaymentResponse?.interestLedgerTransactionId ||
    repayment.occurredAt !== repaymentCommand?.occurredAt ||
    Date.parse(repayment.occurredAt ?? "") < start ||
    repayment.sandboxOnly !== true ||
    repayment.productionFundsMoved !== false ||
    repayment.schemaVersion !== "repayment.v2" ||
    repayment.interestLedgerTransactionId !== null ||
    repayment.actorHash !== hashId("actor", repaymentEvent?.actorId) ||
    repayment.requestedMinor !== repaymentEvent?.requestedMinor ||
    repayment.appliedMinor !== repaymentEvent?.appliedMinor ||
    repayment.appliedFeeMinor !== repaymentEvent?.appliedFeeMinor ||
    repayment.appliedInterestMinor !== repaymentEvent?.appliedInterestMinor ||
    repayment.appliedPrincipalMinor !== repaymentEvent?.appliedPrincipalMinor ||
    repayment.surplusMinor !== repaymentEvent?.surplusMinor ||
    !validHumanObligationReadBack(
      obligation,
      installmentSummary,
      identifiers,
      operations,
      executionReceipt,
      repayment
    )) return false;
  const exactLedgerPayload = (payload, transaction, command) => exactKeys(payload, [
    "ledgerTransactionId",
    "transactionHash",
    "transactionType",
    "assetId",
    "debitTotalMinor",
    "creditTotalMinor",
    "entryCount",
    "actorId",
    "causationId",
    "correlationId",
    "sandboxOnly",
    "productionFundsMoved"
  ]) &&
    payload.ledgerTransactionId === transaction?.ledgerTransactionId &&
    payload.transactionHash === transaction?.transactionHash &&
    payload.transactionType === transaction?.transactionType &&
    payload.assetId === transaction?.assetId &&
    payload.debitTotalMinor === transaction?.debitTotalMinor &&
    payload.creditTotalMinor === transaction?.creditTotalMinor &&
    payload.entryCount === transaction?.entryCount &&
    IDENTIFIER.test(payload.actorId ?? "") &&
    hashId("m1_b_acceptance_actor_reference", { actorId: payload.actorId }) ===
      command?.actorRefHash &&
    payload.causationId === command?.requestId &&
    payload.correlationId === command?.correlationId &&
    payload.sandboxOnly === true &&
    payload.productionFundsMoved === false;
  if (!exactLedgerPayload(
    executionLedgerEvent,
    readBack.principalLedgerTransaction,
    executionCommand
  ) ||
    !exactLedgerPayload(
      repaymentLedgerEvent,
      readBack.repaymentLedgerTransaction,
      repaymentCommand
    ) ||
    !validHumanLedgerTransactionReadBack(readBack.principalLedgerTransaction, {
      ledgerTransactionId: identifiers?.principalLedgerTransactionId,
      transactionHash: executionLedgerEvent?.transactionHash,
      transactionType: "sandbox_credit_execution",
      assetId: executionReceipt.assetId,
      referenceType: "sandbox_execution_receipt",
      referenceId: identifiers?.sandboxExecutionReceiptId,
      metadataHash: hashId("ledger_metadata", {
        obligationId: identifiers?.obligationId,
        receiptHash: executionReceipt.receiptHash,
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false
      }),
      amountMinor: executionReceipt.amountMinor,
      entryCount: executionLedgerEvent?.entryCount,
      accountOwnerRefHash: hashId("m1_b_ledger_account_owner_reference", {
        ownerType: "obligation",
        ownerId: identifiers?.obligationId
      }),
      accountTypes: ["principal_receivable", "sandbox_funding_source"],
      normalSides: ["debit", "credit"],
      accountRefHashes: ["principal_receivable", "sandbox_funding_source"].map(
        (accountType) => humanLedgerAccountRefHash(
          identifiers?.obligationId,
          executionReceipt.assetId,
          accountType
        )
      ),
      directions: ["debit", "credit"],
      postedAt: executionCommand?.occurredAt
    }) ||
    !validHumanLedgerTransactionReadBack(readBack.repaymentLedgerTransaction, {
      ledgerTransactionId: repayment.ledgerTransactionId,
      transactionHash: repaymentLedgerEvent?.transactionHash,
      transactionType: "sandbox_repayment",
      assetId: executionReceipt.assetId,
      referenceType: "repayment",
      referenceId: repayment.repaymentId,
      metadataHash: hashId("ledger_metadata", {
        repaymentHash: repayment.repaymentHash,
        sourceCode: repayment.sourceCode,
        appliedFeeMinor: repayment.appliedFeeMinor,
        appliedInterestMinor: repayment.appliedInterestMinor,
        appliedPrincipalMinor: repayment.appliedPrincipalMinor,
        surplusMinor: repayment.surplusMinor,
        sandboxOnly: true,
        productionFundsMoved: false
      }),
      amountMinor: repayment.appliedMinor,
      entryCount: repaymentLedgerEvent?.entryCount,
      accountOwnerRefHash: hashId("m1_b_ledger_account_owner_reference", {
        ownerType: "obligation",
        ownerId: identifiers?.obligationId
      }),
      accountTypes: ["repayment_clearing", "principal_receivable"],
      normalSides: ["debit", "debit"],
      accountRefHashes: ["repayment_clearing", "principal_receivable"].map(
        (accountType) => humanLedgerAccountRefHash(
          identifiers?.obligationId,
          executionReceipt.assetId,
          accountType
        )
      ),
      directions: ["debit", "credit"],
      postedAt: repaymentCommand?.occurredAt
    })) return false;
  return readBack.interestLedgerTransaction === null &&
    interestEvent === undefined && repayment.accruedInterestMinor === "0";
}

function validHumanActorScope(scope, identifiers) {
  const expectedResources = [
    ["subject", identifiers?.subjectId],
    ["consent", identifiers?.consentId],
    ["credit_intent", identifiers?.creditIntentId],
    ["credit_offer", identifiers?.creditOfferId],
    ["obligation", identifiers?.obligationId],
    ["evidence", identifiers?.obligationId]
  ];
  return exactKeys(scope, [
    "actorRefHash",
    "invitationOnly",
    "sameTenantOnly",
    "resources"
  ]) &&
    HASH.test(scope.actorRefHash ?? "") &&
    scope.invitationOnly === true &&
    scope.sameTenantOnly === true &&
    Array.isArray(scope.resources) &&
    scope.resources.length === expectedResources.length &&
    scope.resources.every((resource, index) => (
      exactKeys(resource, [
        "resourceType",
        "resourceId",
        "resourceStatus",
        "resourceVersion",
        "bindingRelationship",
        "bindingStatus",
        "bindingVersion",
        "actorRefHash"
      ]) &&
      resource.resourceType === expectedResources[index][0] &&
      resource.resourceId === expectedResources[index][1] &&
      resource.resourceStatus === "active" &&
      Number.isSafeInteger(resource.resourceVersion) &&
      resource.resourceVersion >= 1 &&
      resource.bindingRelationship === "owner" &&
      resource.bindingStatus === "active" &&
      Number.isSafeInteger(resource.bindingVersion) &&
      resource.bindingVersion >= 1 &&
      resource.actorRefHash === scope.actorRefHash
    ));
}

function validateHumanCriticalReceipt(
  receipt,
  linkage,
  expectedCommitSha,
  expectedDatabaseStartedAt,
  issues
) {
  const topLevelShape = exactKeys(receipt, [
    "schemaVersion",
    "candidateReleaseId",
    "sourceRuntime",
    "capturedAt",
    "databaseStartedAt",
    "postRestartVerification",
    "role",
    "status",
    "authentication",
    "actorScope",
    "originLineage",
    "linkage",
    "recovery",
    "operations",
    "durability",
    "safety",
    "redaction"
  ]);
  const origin = receipt?.originLineage;
  const originCommands = origin?.commandReceipts;
  const originValid = exactKeys(origin, [
    "provenance",
    "sourceRelation",
    "createdUnderExactCandidate",
    "postRestartProjectionReadBack",
    "subjectId",
    "consentId",
    "identityReferenceId",
    "creditIntentId",
    "riskDecisionId",
    "creditOfferId",
    "commandReceipts",
    "identityReferenceProof"
  ]) &&
    origin.provenance === "retained_postgresql_lineage" &&
    origin.sourceRelation === "preexisting_state_revalidated_by_exact_candidate" &&
    origin.createdUnderExactCandidate === false &&
    origin.postRestartProjectionReadBack === true &&
    Array.isArray(originCommands) &&
    originCommands.length === 4 &&
    [
      "pilotCreateHumanSubject",
      "pilotCreateConsent",
      "pilotRequestCredit",
      "pilotEvaluateCreditApplication"
    ].every((operationId, index) => validCommandReceipt(originCommands[index], operationId));
  const retainedOriginPredatesCandidate = Array.isArray(originCommands) &&
    originCommands.every(({ completedAt }) => (
      Date.parse(completedAt ?? "") < Date.parse(expectedDatabaseStartedAt ?? "")
    ));
  const identifiers = receipt?.linkage;
  const linkageShape = exactKeys(identifiers, [
    "subjectId",
    "consentId",
    "identityReferenceId",
    "creditIntentId",
    "riskDecisionId",
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "offerSchemaVersion",
    "offerAggregateVersion",
    "creditOfferAcceptanceId",
    "obligationId",
    "sandboxExecutionReceiptId",
    "executionReceiptHash",
    "principalLedgerTransactionId",
    "repaymentId",
    "repaymentHash"
  ]);
  const recovery = receipt?.recovery;
  const recoveryShape = exactKeys(recovery, [
    "operationId",
    "requestId",
    "correlationId",
    "responseSchemaVersion",
    "recoverySchemaVersion",
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "offerSchemaVersion",
    "offerAggregateVersion",
    "serverTruth",
    "queryProof",
    "offerProjectionProof"
  ]);
  const operations = receipt?.operations;
  const operationsValid = Array.isArray(operations) &&
    operations.length === HUMAN_CRITICAL_OPERATION_SEQUENCE.length &&
    operations.every((operation, index) => {
      const [operationId, responseSchemaVersion, command] =
        HUMAN_CRITICAL_OPERATION_SEQUENCE[index];
      return exactKeys(operation, [
        "sequence",
        "operationId",
        "requestId",
        "correlationId",
        "responseSchemaVersion",
        "authorizationAuditEventId",
        "authorizationDecisionId",
        "occurredAt",
        "queryProof",
        "commandReceipt"
      ]) &&
        operation.sequence === index + 1 &&
        operation.operationId === operationId &&
        operation.responseSchemaVersion === responseSchemaVersion &&
        REQUEST_IDENTIFIER.test(operation.requestId ?? "") &&
        REQUEST_IDENTIFIER.test(operation.correlationId ?? "") &&
        Number.isFinite(Date.parse(operation.occurredAt ?? "")) &&
        (command
          ? IDENTIFIER.test(operation.authorizationAuditEventId ?? "") &&
            IDENTIFIER.test(operation.authorizationDecisionId ?? "") &&
            validCommandReceipt(operation.commandReceipt, operationId) &&
            operation.commandReceipt.responseSchemaVersion === responseSchemaVersion &&
            validHumanCommandResponseProjection(
              operation.commandReceipt.responseProjection,
              operationId,
              identifiers
            ) &&
            operation.commandReceipt.requestId === operation.requestId &&
            operation.commandReceipt.correlationId === operation.correlationId &&
            operation.authorizationAuditEventId ===
              operation.commandReceipt.authorizationAuditEventId &&
            operation.authorizationDecisionId ===
              operation.commandReceipt.authorizationDecisionId &&
            operation.commandReceipt.occurredAt === operation.occurredAt &&
            operation.queryProof === null
          : operation.authorizationAuditEventId === null &&
            operation.authorizationDecisionId === null &&
            operation.commandReceipt === null &&
            validQueryProof(operation.queryProof, operationId, responseSchemaVersion) &&
            operation.queryProof.requestId === operation.requestId &&
            operation.queryProof.correlationId === operation.correlationId &&
            operation.queryProof.occurredAt === operation.occurredAt);
    });
  const durability = receipt?.durability;
  const events = durability?.events;
  const eventIds = new Set(Array.isArray(events) ? events.map(({ eventId }) => eventId) : []);
  const projections = durability?.projectionReadBack;
  const durabilityValid = exactKeys(durability, [
    "canonicalPersistence",
    "rlsReadBack",
    "authorizationAuditImmutable",
    "tenantCommandExecutionsImmutable",
    "fixtureUsed",
    "events",
    "projectionReadBack",
    "evidenceCompleteness",
    "economicReadBack"
  ]) &&
    durability.canonicalPersistence === "postgresql" &&
    durability.rlsReadBack === true &&
    durability.authorizationAuditImmutable === true &&
    durability.tenantCommandExecutionsImmutable === true &&
    durability.fixtureUsed === false &&
    Array.isArray(events) &&
    events.length >= 15 &&
    events.every(validDurableEvent) &&
    eventIds.size === events.length &&
    [
      ...(Array.isArray(originCommands) ? originCommands : [])
        .flatMap(({ eventManifest }) => eventManifest ?? []),
      ...(Array.isArray(operations) ? operations : [])
        .filter(({ commandReceipt }) => commandReceipt)
        .flatMap(({ commandReceipt }) => commandReceipt.eventManifest)
    ].every((event) => events.some(({ eventId }) => eventId === event.eventId)) &&
    [
      "credit_offer_accepted",
      "obligation_created",
      "obligation_sandbox_executed",
      "repayment_posted"
    ].every((eventType) => events.some((event) => event.eventType === eventType)) &&
    Array.isArray(projections) &&
    projections.length >= 2 &&
    projections.every((projection) => (
      validProjectionReadBack(projection, eventIds) &&
      events.some((event) => (
        event.eventId === projection.sourceEventId &&
        event.evidenceHash === projection.sourceEvidenceHash &&
        event.aggregateVersion === projection.aggregateVersion
      ))
    )) &&
    projections.some((projection) => (
      projection.entityType === "credit_offer" &&
      projection.entityId === identifiers?.creditOfferId &&
      events.some((event) => (
        event.eventId === projection.sourceEventId &&
        event.eventType === "credit_offer_accepted" &&
        event.aggregateId === identifiers?.creditOfferId
      ))
    )) &&
    projections.some((projection) => (
      projection.entityType === "obligation" &&
      projection.entityId === identifiers?.obligationId &&
      events.some((event) => (
        event.eventId === projection.sourceEventId &&
        event.eventType === "repayment_posted" &&
        event.aggregateId === identifiers?.obligationId
      ))
    )) &&
    exactKeys(durability.evidenceCompleteness, [
      "responseSchemaVersion",
      "responseProvenance",
      "pageCount",
      "finalHasMore",
      "orderedEvidenceIds",
      "orderedEvidenceHash",
      "databaseEvidenceCount",
      "databaseEvidenceManifestHash"
    ]) &&
    durability.evidenceCompleteness.responseSchemaVersion ===
      "tenant_owned_obligation_evidence_view.v1" &&
    durability.evidenceCompleteness.responseProvenance ===
      "runtime_response_capture_db_reconciled" &&
    Number.isSafeInteger(durability.evidenceCompleteness.pageCount) &&
    durability.evidenceCompleteness.pageCount >= 1 &&
    durability.evidenceCompleteness.finalHasMore === false &&
    Array.isArray(durability.evidenceCompleteness.orderedEvidenceIds) &&
    durability.evidenceCompleteness.orderedEvidenceIds.length ===
      durability.evidenceCompleteness.databaseEvidenceCount &&
    durability.evidenceCompleteness.orderedEvidenceIds.every((id) => eventIds.has(id)) &&
    new Set(durability.evidenceCompleteness.orderedEvidenceIds).size ===
      durability.evidenceCompleteness.orderedEvidenceIds.length &&
    JSON.stringify(durability.evidenceCompleteness.orderedEvidenceIds) ===
      JSON.stringify(events
        .filter((event) => durability.evidenceCompleteness.orderedEvidenceIds.includes(
          event.eventId
        ))
        .map((event) => event.eventId)) &&
    HASH.test(durability.evidenceCompleteness.orderedEvidenceHash ?? "") &&
    HASH.test(durability.evidenceCompleteness.databaseEvidenceManifestHash ?? "") &&
    durability.evidenceCompleteness.orderedEvidenceHash ===
      evidenceManifestHash(
        durability.evidenceCompleteness.orderedEvidenceIds,
        events
      ) &&
    durability.evidenceCompleteness.databaseEvidenceManifestHash ===
      evidenceManifestHash(
        durability.evidenceCompleteness.orderedEvidenceIds,
        events
      ) &&
    exactKeys(operations?.[4]?.queryProof?.responseProjection, [
      "obligationId",
      "orderedEvidenceIds",
      "hasMore",
      "nextCursor",
      "schemaVersion"
    ]) &&
    operations[4].queryProof.responseProjection.obligationId === identifiers?.obligationId &&
    JSON.stringify(operations[4].queryProof.responseProjection.orderedEvidenceIds) ===
      JSON.stringify(durability.evidenceCompleteness.orderedEvidenceIds) &&
    operations[4].queryProof.responseProjection.hasMore === false &&
    operations[4].queryProof.responseProjection.nextCursor === null &&
    operations[4].queryProof.responseProjection.schemaVersion ===
      "tenant_owned_obligation_evidence_view.v1" &&
    validHumanEconomicReadBack(
      durability.economicReadBack,
      identifiers,
      operations,
      expectedDatabaseStartedAt,
      events
    );
  const safety = receipt?.safety;
  const safetyValid = exactKeys(safety, [
    "sandboxOnly",
    "productionFundsMoved",
    "withdrawable",
    "fundsAuthority"
  ]) &&
    safety.sandboxOnly === true &&
    safety.productionFundsMoved === false &&
    safety.withdrawable === false &&
    safety.fundsAuthority === false;
  const linkageMatches = linkageShape && [
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
    "repaymentId"
  ].every((key) => identifiers[key] === linkage[key]);
  const identifierValuesValid = linkageShape && [
    "subjectId",
    "consentId",
    "identityReferenceId",
    "creditIntentId",
    "riskDecisionId",
    "creditOfferId",
    "creditOfferAcceptanceId",
    "obligationId",
    "sandboxExecutionReceiptId",
    "principalLedgerTransactionId",
    "repaymentId"
  ].every((key) => IDENTIFIER.test(identifiers[key] ?? ""));
  const hashValuesValid = linkageShape && [
    "creditOfferHash",
    "termsHash",
    "executionReceiptHash",
    "repaymentHash"
  ].every((key) => HASH.test(identifiers[key] ?? ""));
  const recoveryMatches = recoveryShape &&
    recovery.operationId === "pilotReadWorkspaceResume" &&
    recovery.responseSchemaVersion === "tenant_workspace_resume_view.v2" &&
    recovery.recoverySchemaVersion === "human_offer_review_recovery.v1" &&
    recovery.creditOfferId === identifiers?.creditOfferId &&
    recovery.creditOfferHash === identifiers?.creditOfferHash &&
    recovery.termsHash === identifiers?.termsHash &&
    recovery.offerSchemaVersion === identifiers?.offerSchemaVersion &&
    recovery.offerAggregateVersion === identifiers?.offerAggregateVersion &&
    recovery.serverTruth === true &&
    recovery.requestId === operations?.[0]?.requestId &&
    recovery.correlationId === operations?.[0]?.correlationId &&
    validQueryProof(
      recovery.queryProof,
      "pilotReadWorkspaceResume",
      "tenant_workspace_resume_view.v2"
    ) &&
    recovery.queryProof.requestId === recovery.requestId &&
    recovery.queryProof.correlationId === recovery.correlationId &&
    recovery.queryProof.responseHash === operations?.[0]?.queryProof?.responseHash &&
    validWorkspaceResponseProjection(recovery.queryProof.responseProjection, {
      subjectId: identifiers?.subjectId,
      consentId: identifiers?.consentId,
      creditIntentId: identifiers?.creditIntentId,
      riskDecisionId: identifiers?.riskDecisionId,
      creditOfferId: recovery.creditOfferId,
      creditOfferHash: recovery.creditOfferHash,
      termsHash: recovery.termsHash,
      offerSchemaVersion: recovery.offerSchemaVersion,
      offerAggregateVersion: recovery.offerAggregateVersion
    }) &&
    validProjectionReadBack(recovery.offerProjectionProof, eventIds) &&
    recovery.offerProjectionProof.entityType === "credit_offer" &&
    recovery.offerProjectionProof.entityId === recovery.creditOfferId &&
    recovery.offerProjectionProof.aggregateVersion === recovery.offerAggregateVersion;
  const originManifestValid =
    new Set([
      JSON.stringify(["subject_created"]),
      JSON.stringify(["principal_created", "subject_created"])
    ]).has(JSON.stringify(originCommands?.[0]?.eventManifest?.map(({ eventType }) => eventType))) &&
    exactManifestEventTypes(originCommands?.[1], ["consent_recorded"]) &&
    exactManifestEventTypes(originCommands?.[2], ["credit_intent_created"]) &&
    exactManifestEventTypes(originCommands?.[3], [
      "credit_intent_status_changed",
      "risk_decision_created",
      "credit_offer_created"
    ]);
  const lifecycleManifestValid =
    exactManifestEventTypes(operations?.[1]?.commandReceipt, [
      "credit_offer_acceptance_recorded",
      "credit_offer_accepted",
      "obligation_created"
    ]) &&
    exactManifestEventTypes(operations?.[2]?.commandReceipt, [
      "ledger_account_opened",
      "ledger_transaction_posted",
      "obligation_sandbox_executed"
    ]) &&
    validHumanRepaymentManifest(operations?.[3]?.commandReceipt);
  const databaseStart = Date.parse(expectedDatabaseStartedAt ?? "");
  const candidateOperationsAfterRestart = operationsValid && operations.every((operation) => (
    Date.parse(operation.occurredAt) >= databaseStart &&
    (operation.commandReceipt === null || (
      Date.parse(operation.commandReceipt.completedAt) >= databaseStart &&
      operation.commandReceipt.eventManifest.every((event) =>
        Date.parse(event.occurredAt) >= databaseStart
      )
    ))
  ));
  const humanTimelineValid = operationsValid && operations.every((operation, index) => (
    (index === 0 || Date.parse(operation.occurredAt) >
      Date.parse(operations[index - 1].occurredAt)) &&
    Date.parse(operation.occurredAt) <= Date.parse(receipt?.capturedAt ?? "") &&
    (operation.commandReceipt === null ||
      Date.parse(operation.commandReceipt.capturedAt) <=
        Date.parse(receipt?.capturedAt ?? ""))
  )) &&
    Date.parse(receipt?.authentication?.latestAuthTime ?? "") <=
      Date.parse(receipt?.capturedAt ?? "");
  const humanActorScopeValid = validHumanActorScope(receipt?.actorScope, identifiers) &&
    Array.isArray(originCommands) &&
    originCommands.every(({ actorRefHash }) => actorRefHash === receipt.actorScope.actorRefHash) &&
    Array.isArray(operations) &&
    operations.every((operation) => (
      operation.commandReceipt
        ? operation.commandReceipt.actorRefHash === receipt.actorScope.actorRefHash
        : operation.queryProof.authorizationAudits.every(({ actorRefHash }) =>
            actorRefHash === receipt.actorScope.actorRefHash
          )
    ));
  if (
    !topLevelShape ||
    receipt?.schemaVersion !== "m1_b_human_critical_receipt.v1" ||
    receipt.candidateReleaseId !== expectedCommitSha ||
    receipt.sourceRuntime !== "local_exact_commit" ||
    !Number.isFinite(Date.parse(receipt.capturedAt ?? "")) ||
    receipt.databaseStartedAt !== expectedDatabaseStartedAt ||
    Date.parse(receipt.capturedAt ?? "") <= Date.parse(expectedDatabaseStartedAt ?? "") ||
    receipt.postRestartVerification !== true ||
    receipt.role !== "human" ||
    receipt.status !== "passed" ||
    !validSafeSiweAuthentication(receipt.authentication, {
      expectedRequestIds: Array.isArray(operations)
        ? operations.map(({ requestId }) => requestId)
        : undefined,
      expectedAuditEventIds: Array.isArray(operations)
        ? operations.flatMap((operation) => (
            operation.commandReceipt?.authorizationAudits ??
            operation.queryProof?.authorizationAudits ?? []
          )).map(({ eventId }) => eventId)
        : undefined,
      expectedActorRefHash: receipt?.actorScope?.actorRefHash,
      databaseStartedAt: expectedDatabaseStartedAt,
      acceptedVerificationMethods: new Set(["eip191_eoa_v1"])
    }) ||
    !humanActorScopeValid ||
    !originValid ||
    !retainedOriginPredatesCandidate ||
    origin.subjectId !== identifiers?.subjectId ||
    origin.consentId !== identifiers?.consentId ||
    origin.identityReferenceId !== identifiers?.identityReferenceId ||
    origin.creditIntentId !== identifiers?.creditIntentId ||
    origin.riskDecisionId !== identifiers?.riskDecisionId ||
    origin.creditOfferId !== identifiers?.creditOfferId ||
    originCommands[0]?.resourceType !== "subject" ||
    originCommands[0]?.resourceId !== identifiers?.subjectId ||
    originCommands[1]?.resourceType !== "subject" ||
    originCommands[1]?.resourceId !== identifiers?.subjectId ||
    originCommands[2]?.resourceType !== "subject" ||
    originCommands[2]?.resourceId !== identifiers?.subjectId ||
    originCommands[3]?.resourceType !== "credit_intent" ||
    originCommands[3]?.resourceId !== identifiers?.creditIntentId ||
    !originManifestValid ||
    !validHumanIdentityReferenceProof(
      origin.identityReferenceProof,
      identifiers,
      identifiers?.riskDecisionId,
      eventIds
    ) ||
    !linkageMatches ||
    !identifierValuesValid ||
    !hashValuesValid ||
    !new Set(["credit_offer.v1", "credit_offer.v2"]).has(identifiers.offerSchemaVersion) ||
    !Number.isSafeInteger(identifiers.offerAggregateVersion) ||
    identifiers.offerAggregateVersion < 1 ||
    !recoveryMatches ||
    !operationsValid ||
    !candidateOperationsAfterRestart ||
    !humanTimelineValid ||
    !lifecycleManifestValid ||
    !validHumanLifecycleEventPayloads(operations, identifiers) ||
    !durabilityValid ||
    !safetyValid ||
    !validCriticalRedaction(receipt.redaction)
  ) {
    issues.push(
      "Human critical receipt does not prove post-restart exact-Offer recovery, bound lifecycle, PostgreSQL durability, and redaction truth."
    );
  }
}

export function verifyM1BHumanCriticalReceipt(
  receipt,
  { linkage, expectedCommitSha, expectedDatabaseStartedAt }
) {
  const issues = [];
  validateHumanCriticalReceipt(
    receipt,
    linkage,
    expectedCommitSha,
    expectedDatabaseStartedAt,
    issues
  );
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}

function validPassport(passport, expectedBindingActorRefHash) {
  return exactKeys(passport, [
    "artifactId",
    "artifactHash",
    "artifactVersion",
    "creditIntentId",
    "purpose",
    "status",
    "resourceStatus",
    "resourceVersion",
    "bindingStatus",
    "bindingVersion",
    "bindingRelationship",
    "bindingActorRefHash",
    "verifierActorRefHash",
    "claimCount",
    "onlineVerificationRequired",
    "sameTenantOnly",
    "pointInTime",
    "nonAuthorizing",
    "sandboxOnly",
    "productionAuthority",
    "piiIncluded",
    "rawTransactionDataIncluded",
    "scoreAuthoritative",
    "inboxQueryProof"
  ]) &&
    IDENTIFIER.test(passport.artifactId ?? "") &&
    HASH.test(passport.artifactHash ?? "") &&
    Number.isSafeInteger(passport.artifactVersion) &&
    passport.artifactVersion >= 1 &&
    IDENTIFIER.test(passport.creditIntentId ?? "") &&
    passport.purpose === "private_credit_review" &&
    passport.status === "active" &&
    passport.resourceStatus === "active" &&
    Number.isSafeInteger(passport.resourceVersion) &&
    passport.resourceVersion >= 1 &&
    passport.bindingStatus === "active" &&
    Number.isSafeInteger(passport.bindingVersion) &&
    passport.bindingVersion >= 1 &&
    passport.bindingRelationship === "verifier" &&
    HASH.test(passport.bindingActorRefHash ?? "") &&
    passport.bindingActorRefHash === expectedBindingActorRefHash &&
    HASH.test(passport.verifierActorRefHash ?? "") &&
    Number.isSafeInteger(passport.claimCount) &&
    passport.claimCount >= 1 &&
    passport.onlineVerificationRequired === true &&
    passport.sameTenantOnly === true &&
    passport.pointInTime === true &&
    passport.nonAuthorizing === true &&
    passport.sandboxOnly === true &&
    passport.productionAuthority === false &&
    passport.piiIncluded === false &&
    passport.rawTransactionDataIncluded === false &&
    passport.scoreAuthoritative === false &&
    validQueryProof(
      passport.inboxQueryProof,
      "pilotReadCapitalPartnerPassportInbox",
      "tenant_capital_partner_passport_inbox_view.v1"
    ) &&
    validPassportInboxResponseProjection(
      passport.inboxQueryProof.responseProjection,
      passport,
      passport.inboxQueryProof.occurredAt
    );
}

function validOffer(offer, schemaVersion, status) {
  return exactKeys(offer, [
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "schemaVersion",
    "aggregateVersion",
    "status"
  ]) &&
    IDENTIFIER.test(offer.creditOfferId ?? "") &&
    HASH.test(offer.creditOfferHash ?? "") &&
    HASH.test(offer.termsHash ?? "") &&
    offer.schemaVersion === schemaVersion &&
    Number.isSafeInteger(offer.aggregateVersion) &&
    offer.aggregateVersion >= 1 &&
    offer.status === status;
}

function validReplacementEventPayload(payload, replacement, preliminaryOfferId) {
  return exactKeys(payload, [
    "creditOfferId",
    "previousStatus",
    "nextStatus",
    "replacementOfferId",
    "reasonCode",
    "sandboxOnly",
    "productionFundsApproved",
    "causationId",
    "correlationId"
  ]) &&
    payload.creditOfferId === preliminaryOfferId &&
    payload.previousStatus === replacement?.previousStatus &&
    payload.nextStatus === replacement?.nextStatus &&
    payload.replacementOfferId === replacement?.replacementOfferId &&
    payload.reasonCode === replacement?.reasonCode &&
    payload.sandboxOnly === true &&
    payload.productionFundsApproved === false &&
    REQUEST_IDENTIFIER.test(payload.causationId ?? "") &&
    REQUEST_IDENTIFIER.test(payload.correlationId ?? "");
}

function validWithdrawalEventPayload(payload, withdrawal, withdrawnOfferId) {
  return exactKeys(payload, [
    "creditOfferId",
    "previousStatus",
    "nextStatus",
    "capitalPartnerRefHash",
    "operatorRefHash",
    "sandboxOnly",
    "productionFundsApproved",
    "causationId",
    "correlationId"
  ]) &&
    payload.creditOfferId === withdrawnOfferId &&
    payload.previousStatus === withdrawal?.previousStatus &&
    payload.nextStatus === withdrawal?.nextStatus &&
    HASH.test(payload.capitalPartnerRefHash ?? "") &&
    HASH.test(payload.operatorRefHash ?? "") &&
    payload.sandboxOnly === true &&
    payload.productionFundsApproved === false &&
    payload.causationId === withdrawal?.requestId &&
    payload.correlationId === withdrawal?.correlationId;
}

function validCapitalPartnerCreatedEventPayload(
  payload,
  offer,
  passport,
  riskDecisionId,
  command
) {
  return exactKeys(payload, [
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "creditIntentId",
    "riskDecisionId",
    "capitalPartnerRefHash",
    "operatorRefHash",
    "creditPassportArtifactHash",
    "passportVerificationHash",
    "underwritingSnapshotHash",
    "status",
    "validUntil",
    "sandboxOnly",
    "productionFundsApproved",
    "causationId",
    "correlationId"
  ]) &&
    payload.creditOfferId === offer?.creditOfferId &&
    payload.creditOfferHash === offer?.creditOfferHash &&
    payload.termsHash === offer?.termsHash &&
    payload.creditIntentId === passport?.creditIntentId &&
    payload.riskDecisionId === riskDecisionId &&
    HASH.test(payload.capitalPartnerRefHash ?? "") &&
    HASH.test(payload.operatorRefHash ?? "") &&
    payload.creditPassportArtifactHash === passport?.artifactHash &&
    HASH.test(payload.passportVerificationHash ?? "") &&
    HASH.test(payload.underwritingSnapshotHash ?? "") &&
    payload.status === "offered" &&
    Number.isFinite(Date.parse(payload.validUntil ?? "")) &&
    payload.sandboxOnly === true &&
    payload.productionFundsApproved === false &&
    payload.causationId === command?.requestId &&
    payload.correlationId === command?.correlationId;
}

function validCapitalPartnerDenialProtectedState(
  state,
  {
    offerId,
    status,
    schemaVersion,
    creditOfferHash,
    termsHash,
    aggregateVersion,
    projectionSourceEventId,
    authorizationResourceStatus,
    requestId,
    correlationId
  }
) {
  const offer = state?.creditOffer;
  const command = state?.deniedCommand;
  const counts = state?.relatedRowCounts;
  return exactKeys(state, [
    "catalogVersion",
    "creditOffer",
    "deniedCommand",
    "relatedRowCounts"
  ]) &&
    state.catalogVersion === "m1_b_cp_denial_protected_state.v1" &&
    exactKeys(offer, [
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "disclosureRef",
      "status",
      "schemaVersion",
      "projectionEntityHash",
      "projectionAggregateVersion",
      "projectionSourceEventId",
      "authorizationResourceStatus",
      "authorizationResourceVersion"
    ]) &&
    offer.creditOfferId === offerId &&
    offer.creditOfferHash === creditOfferHash &&
    offer.termsHash === termsHash &&
    IDENTIFIER.test(offer.disclosureRef ?? "") &&
    offer.status === status &&
    offer.schemaVersion === schemaVersion &&
    HASH.test(offer.projectionEntityHash ?? "") &&
    Number.isSafeInteger(offer.projectionAggregateVersion) &&
    offer.projectionAggregateVersion === aggregateVersion &&
    offer.projectionSourceEventId === projectionSourceEventId &&
    offer.authorizationResourceStatus === authorizationResourceStatus &&
    Number.isSafeInteger(offer.authorizationResourceVersion) &&
    offer.authorizationResourceVersion >= 1 &&
    exactKeys(command, [
      "requestId",
      "correlationId",
      "clientIdRefHash",
      "idempotencyKeyHash",
      "repositoryIdempotencyKeyHash",
      "authorizationAllowCount",
      "commandIdempotencyCount",
      "commandEventCount",
      "tenantCommandExecutionCount",
      "businessDomainEventCount",
      "businessEvidenceEnvelopeCount"
    ]) &&
    command.requestId === requestId &&
    command.correlationId === correlationId &&
    HASH.test(command.clientIdRefHash ?? "") &&
    HASH.test(command.idempotencyKeyHash ?? "") &&
    HASH.test(command.repositoryIdempotencyKeyHash ?? "") &&
    [
      command.authorizationAllowCount,
      command.commandIdempotencyCount,
      command.commandEventCount,
      command.tenantCommandExecutionCount,
      command.businessDomainEventCount,
      command.businessEvidenceEnvelopeCount
    ].every((count) => count === 0) &&
    exactKeys(counts, [
      "creditOfferRowCount",
      "projectionRegistryCount",
      "projectionSnapshotCount",
      "domainEventCount",
      "evidenceEnvelopeCount",
      "creditOfferAcceptanceCount",
      "obligationCount",
      "sandboxExecutionReceiptCount",
      "repaymentEventCount",
      "ledgerTransactionCount",
      "ledgerEntryCount"
    ]) &&
    counts.creditOfferRowCount === 1 &&
    counts.projectionRegistryCount === 1 &&
    Number.isSafeInteger(counts.projectionSnapshotCount) &&
    counts.projectionSnapshotCount >= 2 &&
    Number.isSafeInteger(counts.domainEventCount) &&
    counts.domainEventCount >= 2 &&
    counts.evidenceEnvelopeCount === counts.domainEventCount &&
    counts.creditOfferAcceptanceCount === 0 &&
    counts.obligationCount === 0 &&
    counts.sandboxExecutionReceiptCount === 0 &&
    counts.repaymentEventCount === 0 &&
    counts.ledgerTransactionCount === 0 &&
    counts.ledgerEntryCount === 0;
}

function validDeniedOfferRequestProjection(request, denial, expected) {
  try {
    assertTenantProtocolRequest(request);
  } catch {
    return false;
  }
  const confirmation = request?.payload?.actionConfirmation;
  const disclosureRef = denial?.protectedStateBefore?.creditOffer?.disclosureRef;
  const expectedActionPayloadHash = `0x${createHash("sha256").update(JSON.stringify({
    expectedOfferHash: expected.creditOfferHash,
    expectedTermsHash: expected.termsHash,
    disclosureRef,
    sandboxOnly: true,
    productionFundsAuthority: false
  })).digest("hex")}`;
  const expectedAcknowledgementHash = `0x${createHash("sha256").update(JSON.stringify({
    acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
    creditOfferHash: expected.creditOfferHash,
    termsHash: expected.termsHash,
    disclosureRef,
    actionConfirmationMethod: confirmation?.confirmationMethod,
    actionConfirmationHash: confirmation?.confirmationHash,
    actionConfirmationMessageHash: confirmation?.messageHash,
    sandboxOnly: true,
    productionFundsAuthority: false
  })).digest("hex")}`;
  return request.operationId === "pilotAcceptCreditOffer" &&
    request.requestId === denial.requestId &&
    request.correlationId === denial.correlationId &&
    request.resource?.resourceType === "credit_offer" &&
    request.resource.resourceId === expected.offerId &&
    hashId("m1_b_denial_idempotency", {
      idempotencyKey: request.idempotencyKey
    }) === denial?.protectedStateBefore?.deniedCommand?.idempotencyKeyHash &&
    request.payload.expectedOfferHash === expected.creditOfferHash &&
    request.payload.expectedTermsHash === expected.termsHash &&
    request.payload.acknowledgementHash === expectedAcknowledgementHash &&
    confirmation?.actionType === "accept_offer" &&
    confirmation.resourceId === expected.offerId &&
    confirmation.resourceHash === expected.creditOfferHash &&
    confirmation.payloadHash === expectedActionPayloadHash &&
    confirmation.requestId === denial.requestId &&
    confirmation.confirmationMethod === "wallet_personal_sign" &&
    confirmation.rawSignaturePersisted === false &&
    confirmation.blockchainTransactionSubmitted === false;
}

function validStaleDenial(denial, expected) {
  const expectedOfferId = expected.offerId;
  const audit = denial?.authorizationAudit;
  const outward = denial?.outwardResponse;
  return exactKeys(denial, [
    "operationId",
    "creditOfferId",
    "requestId",
    "correlationId",
    "outwardErrorCode",
    "outwardResponse",
    "authorizationAudit",
    "protectedStateCatalogVersion",
    "baselineCapturedAt",
    "verificationCapturedAt",
    "protectedStateBefore",
    "protectedStateAfter",
    "protectedStateBeforeHash",
    "protectedStateAfterHash",
    "businessMutationCount"
  ]) &&
    denial.operationId === "pilotAcceptCreditOffer" &&
    denial.creditOfferId === expectedOfferId &&
    REQUEST_IDENTIFIER.test(denial.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(denial.correlationId ?? "") &&
    denial.outwardErrorCode === "authorization_denied" &&
    exactKeys(outward, [
      "responseSchemaVersion",
      "requestProjection",
      "requestProjectionHash",
      "responseProjection",
      "responseHash",
      "capturedAt"
    ]) &&
    outward.responseSchemaVersion === "problem_details.v1" &&
    validDeniedOfferRequestProjection(outward.requestProjection, denial, expected) &&
    outward.requestProjectionHash ===
      criticalProjectionHash(outward.requestProjection) &&
    exactKeys(outward.responseProjection, [
      "status",
      "code",
      "requestId",
      "schemaVersion"
    ]) &&
    outward.responseProjection.status === 404 &&
    outward.responseProjection.code === "authorization_denied" &&
    outward.responseProjection.requestId === denial.requestId &&
    outward.responseProjection.schemaVersion === "problem_details.v1" &&
    outward.responseHash === criticalProjectionHash(outward.responseProjection) &&
    Number.isFinite(Date.parse(outward.capturedAt ?? "")) &&
    exactKeys(audit, [
      "eventId",
      "operationId",
      "requestId",
      "correlationId",
      "resourceType",
      "resourceId",
      "authorizationDecision",
      "authorizationDecisionId",
      "actorRefHash",
      "policyVersion",
      "reasonCode",
      "occurredAt"
    ]) &&
    IDENTIFIER.test(audit.eventId ?? "") &&
    audit.operationId === denial.operationId &&
    audit.requestId === denial.requestId &&
    audit.correlationId === denial.correlationId &&
    audit.resourceType === "credit_offer" &&
    audit.resourceId === expectedOfferId &&
    audit.authorizationDecision === "deny" &&
    audit.authorizationDecisionId === null &&
    HASH.test(audit.actorRefHash ?? "") &&
    IDENTIFIER.test(audit.policyVersion ?? "") &&
    audit.reasonCode === "live_policy_rejected" &&
    Number.isFinite(Date.parse(audit.occurredAt ?? "")) &&
    denial.protectedStateCatalogVersion === "m1_b_cp_denial_protected_state.v1" &&
    Number.isFinite(Date.parse(denial.baselineCapturedAt ?? "")) &&
    Number.isFinite(Date.parse(denial.verificationCapturedAt ?? "")) &&
    Date.parse(denial.baselineCapturedAt) <= Date.parse(audit.occurredAt) &&
    Date.parse(outward.capturedAt) >= Date.parse(audit.occurredAt) &&
    Date.parse(outward.capturedAt) <= Date.parse(denial.verificationCapturedAt) &&
    Date.parse(denial.verificationCapturedAt) >= Date.parse(audit.occurredAt) &&
    validCapitalPartnerDenialProtectedState(denial.protectedStateBefore, {
      ...expected,
      requestId: denial.requestId,
      correlationId: denial.correlationId
    }) &&
    validCapitalPartnerDenialProtectedState(denial.protectedStateAfter, {
      ...expected,
      requestId: denial.requestId,
      correlationId: denial.correlationId
    }) &&
    canonicalJson(denial.protectedStateAfter) ===
      canonicalJson(denial.protectedStateBefore) &&
    denial.protectedStateBeforeHash ===
      criticalProjectionHash(denial.protectedStateBefore) &&
    HASH.test(denial.protectedStateBeforeHash ?? "") &&
    denial.protectedStateAfterHash ===
      criticalProjectionHash(denial.protectedStateAfter) &&
    denial.protectedStateAfterHash === denial.protectedStateBeforeHash &&
    denial.businessMutationCount === 0;
}

function validPreparationCommandReceipt(receipt, operationId) {
  if (!exactKeys(receipt, [
    "operationId",
    "requestId",
    "correlationId",
    "resourceType",
    "resourceId",
    "authorizationAuditEventId",
    "authorizationDecisionId",
    "authorizationDecision",
    "actorRefHash",
    "policyVersion",
    "authorizationReasonCode",
    "authorizationAudits",
    "commandHash",
    "responseHash",
    "responseSchemaVersion",
    "responseProjection",
    "capturedResponseHashVerified",
    "capturedAt",
    "businessEventId",
    "occurredAt",
    "completedAt",
    "eventManifest",
    "responseProvenance"
  ]) ||
    receipt.responseProvenance !== "durable_postgresql_response_recovery" ||
    receipt.capturedResponseHashVerified !== false) return false;
  const normalized = { ...receipt, capturedResponseHashVerified: true };
  delete normalized.responseProvenance;
  return validCommandReceipt(normalized, operationId);
}

function validPreparationEventTypes(receipt, expected) {
  return validPreparationCommandReceipt(receipt, receipt?.operationId) &&
    JSON.stringify(receipt.eventManifest.map(({ eventType }) => eventType)) ===
      JSON.stringify(expected);
}

function validPreparationQueryObservation(observation, {
  operationId,
  resourceType,
  resourceId,
  actorRefHash
}) {
  return exactKeys(observation, [
    "operationId",
    "requestId",
    "correlationId",
    "resourceType",
    "resourceId",
    "responseDurability",
    "occurredAt",
    "authorizationAudits"
  ]) &&
    observation.operationId === operationId &&
    REQUEST_IDENTIFIER.test(observation.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(observation.correlationId ?? "") &&
    observation.resourceType === resourceType &&
    observation.resourceId === resourceId &&
    observation.responseDurability === "not_persisted_query_authorization_only" &&
    Number.isFinite(Date.parse(observation.occurredAt ?? "")) &&
    Array.isArray(observation.authorizationAudits) &&
    observation.authorizationAudits.length === 2 &&
    observation.authorizationAudits.every((audit) => (
      validAuthorizationAudit(audit, operationId, observation.requestId) &&
      audit.correlationId === observation.correlationId &&
      audit.resourceType === resourceType &&
      audit.resourceId === resourceId &&
      audit.actorRefHash === actorRefHash &&
      Date.parse(audit.occurredAt) <= Date.parse(observation.occurredAt)
    )) &&
    new Set(observation.authorizationAudits.map(({ eventId }) => eventId)).size === 2 &&
    new Set(observation.authorizationAudits.map(({ authorizationDecisionId }) =>
      authorizationDecisionId
    )).size === 2;
}

function validPreparationResourceScopes(resources, lineage, actorRefHash) {
  const expected = [
    ["subject", lineage?.subjectId],
    ["consent", lineage?.consentId],
    ["credit_intent", lineage?.creditIntentId],
    ["credit_passport_artifact", lineage?.passportArtifactId]
  ];
  return Array.isArray(resources) &&
    resources.length === expected.length &&
    resources.every((resource, index) => (
      exactKeys(resource, [
        "resourceType",
        "resourceId",
        "resourceStatus",
        "resourceVersion",
        "bindingRelationship",
        "bindingStatus",
        "bindingVersion",
        "actorRefHash"
      ]) &&
      resource.resourceType === expected[index][0] &&
      resource.resourceId === expected[index][1] &&
      resource.resourceStatus === "active" &&
      Number.isSafeInteger(resource.resourceVersion) &&
      resource.resourceVersion >= 1 &&
      new Set(["owner", "controller"]).has(resource.bindingRelationship) &&
      resource.bindingStatus === "active" &&
      Number.isSafeInteger(resource.bindingVersion) &&
      resource.bindingVersion >= 1 &&
      resource.actorRefHash === actorRefHash
    ));
}

function validPreparationCommandResponses(commands, lineage) {
  if (!Array.isArray(commands) || commands.length !== 4) return false;
  const [consent, request, evaluate, passport] = commands;
  const consentResponse = consent?.responseProjection;
  const requestResponse = request?.responseProjection;
  const evaluateResponse = evaluate?.responseProjection;
  const passportResponse = passport?.responseProjection;
  const offer = evaluateResponse?.offer;
  const artifact = passportResponse?.artifact;
  return validPreparationCommandReceipt(consent, "pilotCreateConsent") &&
    consent.responseSchemaVersion === "tenant_consent_created.v1" &&
    consent.resourceType === "subject" &&
    consent.resourceId === lineage?.subjectId &&
    exactKeys(consentResponse, ["subjectId", "consent", "schemaVersion"]) &&
    consentResponse.subjectId === lineage.subjectId &&
    exactKeys(consentResponse.consent, [
      "consentId", "consentHash", "termsHash", "dataUsageHash", "subjectId",
      "principalId", "status", "expiresAt", "sandboxOnly",
      "productionAuthority", "schemaVersion"
    ]) &&
    consentResponse.consent.consentId === lineage.consentId &&
    consentResponse.consent.subjectId === lineage.subjectId &&
    consentResponse.consent.status === "active" &&
    consentResponse.consent.sandboxOnly === true &&
    consentResponse.consent.productionAuthority === false &&
    consentResponse.consent.schemaVersion === "consent_record.v1" &&
    [
      consentResponse.consent.consentHash,
      consentResponse.consent.termsHash,
      consentResponse.consent.dataUsageHash
    ].every((hash) => HASH.test(hash ?? "")) &&
    consentResponse.schemaVersion === "tenant_consent_created.v1" &&
    validPreparationEventTypes(consent, [
      "consent_recorded"
    ]) &&
    validPreparationCommandReceipt(request, "pilotRequestCredit") &&
    request.responseSchemaVersion === "tenant_credit_intent_created.v1" &&
    request.resourceType === "subject" &&
    request.resourceId === lineage.subjectId &&
    exactKeys(requestResponse, ["creditIntent", "schemaVersion"]) &&
    exactKeys(requestResponse.creditIntent, [
      "creditIntentId", "creditIntentHash", "subjectId", "principalId",
      "authorityType", "authorityRef", "status", "sandboxOnly",
      "productionFundsRequested", "schemaVersion"
    ]) &&
    requestResponse.creditIntent.creditIntentId === lineage.creditIntentId &&
    requestResponse.creditIntent.subjectId === lineage.subjectId &&
    requestResponse.creditIntent.authorityType === "consent" &&
    requestResponse.creditIntent.authorityRef === lineage.consentId &&
    requestResponse.creditIntent.status === "pending" &&
    requestResponse.creditIntent.sandboxOnly === true &&
    requestResponse.creditIntent.productionFundsRequested === false &&
    requestResponse.creditIntent.schemaVersion === "credit_intent.v1" &&
    HASH.test(requestResponse.creditIntent.creditIntentHash ?? "") &&
    requestResponse.schemaVersion === "tenant_credit_intent_created.v1" &&
    validPreparationEventTypes(request, [
      "credit_intent_created"
    ]) &&
    validPreparationCommandReceipt(evaluate, "pilotEvaluateCreditApplication") &&
    evaluate.responseSchemaVersion === "tenant_credit_application_evaluated.v2" &&
    evaluate.resourceType === "credit_intent" &&
    evaluate.resourceId === lineage.creditIntentId &&
    exactKeys(evaluateResponse, ["creditIntent", "decision", "offer", "schemaVersion"]) &&
    evaluateResponse.creditIntent?.creditIntentId === lineage.creditIntentId &&
    evaluateResponse.creditIntent?.subjectId === lineage.subjectId &&
    evaluateResponse.creditIntent?.status === "decided" &&
    evaluateResponse.decision?.riskDecisionId === lineage.riskDecisionId &&
    evaluateResponse.decision?.creditIntentId === lineage.creditIntentId &&
    evaluateResponse.decision?.status === "approved" &&
    evaluateResponse.decision?.sandboxOnly === true &&
    evaluateResponse.decision?.productionAuthority === false &&
    offer?.creditOfferId === lineage.preliminaryOfferId &&
    offer?.creditIntentId === lineage.creditIntentId &&
    offer?.subjectId === lineage.subjectId &&
    offer?.riskDecisionId === lineage.riskDecisionId &&
    offer?.status === "offered" &&
    offer?.sandboxOnly === true &&
    offer?.productionFundsApproved === false &&
    offer?.schemaVersion === "credit_offer.v1" &&
    evaluateResponse.schemaVersion === "tenant_credit_application_evaluated.v2" &&
    validPreparationEventTypes(evaluate, [
      "credit_intent_status_changed",
      "risk_decision_created",
      "credit_offer_created"
    ]) &&
    validPreparationCommandReceipt(passport, "pilotCreateCreditPassportArtifact") &&
    passport.responseSchemaVersion === "tenant_credit_passport_artifact_created.v1" &&
    passport.resourceType === "subject" &&
    passport.resourceId === lineage.subjectId &&
    exactKeys(passportResponse, ["artifact", "replaced", "schemaVersion"]) &&
    exactKeys(artifact, [
      "creditPassportArtifactId", "artifactHash", "version",
      "sourceRiskDecisionId", "sourceDecisionHash",
      "sourceDecisionPassportHash", "sourceFeatureSnapshotHash", "subjectId",
      "purpose", "claimManifestHash", "issuedAt", "expiresAt", "status",
      "onlineVerificationRequired", "sameTenantOnly", "pointInTime",
      "nonAuthorizing", "sandboxOnly", "productionAuthority", "piiIncluded",
      "rawTransactionDataIncluded", "scoreAuthoritative", "schemaVersion"
    ]) &&
    artifact.creditPassportArtifactId === lineage.passportArtifactId &&
    artifact.sourceRiskDecisionId === lineage.riskDecisionId &&
    artifact.subjectId === lineage.subjectId &&
    HASH.test(artifact.artifactHash ?? "") &&
    Number.isSafeInteger(artifact.version) && artifact.version === 1 &&
    artifact.purpose === "private_credit_review" &&
    artifact.status === "active" &&
    artifact.onlineVerificationRequired === true &&
    artifact.sameTenantOnly === true &&
    artifact.pointInTime === true &&
    artifact.nonAuthorizing === true &&
    artifact.sandboxOnly === true &&
    artifact.productionAuthority === false &&
    artifact.piiIncluded === false &&
    artifact.rawTransactionDataIncluded === false &&
    artifact.scoreAuthoritative === false &&
    artifact.schemaVersion === "credit_passport_artifact.v1" &&
    passportResponse.replaced === false &&
    passportResponse.schemaVersion === "tenant_credit_passport_artifact_created.v1" &&
    validPreparationEventTypes(passport, [
      "credit_passport_artifact_issued"
    ]);
}

function validCapitalPartnerPreparationLineage(lineage, {
  expected,
  actorRefHash,
  windowStartedAt,
  observedBefore,
  databaseStartedAt
}) {
  const commands = lineage?.commandReceipts;
  const queries = lineage?.queryAuthorizationObservations;
  const events = lineage?.events;
  const eventIds = new Set(Array.isArray(events) ? events.map(({ eventId }) => eventId) : []);
  const projections = lineage?.projectionReadBack;
  const identity = lineage?.identityReferenceProof;
  const responseBoundary = lineage?.responseBoundary;
  if (!exactKeys(lineage, [
    "schemaVersion", "provenance", "windowStartedAt", "observedAt", "subjectId",
    "consentId", "identityReferenceId", "creditIntentId", "riskDecisionId",
    "preliminaryOfferId", "passportArtifactId", "retainedSubjectCommand",
    "commandReceipts", "queryAuthorizationObservations", "identityReferenceProof",
    "resourceScopes", "projectionReadBack", "events", "responseBoundary"
  ]) ||
    lineage.schemaVersion !== "m1_b_capital_partner_lineage_preparation.v1" ||
    lineage.provenance !== "normal_human_ui_durable_postgresql_reconciliation" ||
    lineage.windowStartedAt !== windowStartedAt ||
    !Number.isFinite(Date.parse(lineage.observedAt ?? "")) ||
    Date.parse(lineage.observedAt) <= Date.parse(windowStartedAt) ||
    Date.parse(lineage.observedAt) >= Date.parse(observedBefore) ||
    lineage.subjectId !== expected?.subjectId ||
    lineage.creditIntentId !== expected?.creditIntentId ||
    lineage.riskDecisionId !== expected?.riskDecisionId ||
    lineage.preliminaryOfferId !== expected?.preliminaryOfferId ||
    lineage.passportArtifactId !== expected?.passportArtifactId ||
    !IDENTIFIER.test(lineage.consentId ?? "") ||
    !IDENTIFIER.test(lineage.identityReferenceId ?? "") ||
    !validCommandReceipt(lineage.retainedSubjectCommand, "pilotCreateHumanSubject") ||
    lineage.retainedSubjectCommand.resourceType !== "subject" ||
    lineage.retainedSubjectCommand.resourceId !== lineage.subjectId ||
    Date.parse(lineage.retainedSubjectCommand.completedAt) >= Date.parse(databaseStartedAt) ||
    !validPreparationCommandResponses(commands, lineage) ||
    !Array.isArray(queries) || queries.length !== 2 ||
    !validPreparationQueryObservation(queries[0], {
      operationId: "pilotReadHumanSelf",
      resourceType: "subject",
      resourceId: lineage.subjectId,
      actorRefHash
    }) ||
    !validPreparationQueryObservation(queries[1], {
      operationId: "pilotReadCreditApplication",
      resourceType: "credit_intent",
      resourceId: lineage.creditIntentId,
      actorRefHash
    }) ||
    queries[0].correlationId !== commands[1].correlationId ||
    queries[1].correlationId !== commands[1].correlationId ||
    commands[2].correlationId !== commands[1].correlationId ||
    Date.parse(commands[0].occurredAt) <= Date.parse(windowStartedAt) ||
    Date.parse(commands[0].completedAt) > Date.parse(queries[0].occurredAt) ||
    Date.parse(queries[0].occurredAt) > Date.parse(commands[1].occurredAt) ||
    Date.parse(commands[1].completedAt) > Date.parse(queries[1].occurredAt) ||
    Date.parse(queries[1].occurredAt) > Date.parse(commands[2].occurredAt) ||
    Date.parse(commands[2].completedAt) > Date.parse(commands[3].occurredAt) ||
    Date.parse(commands[3].completedAt) > Date.parse(lineage.observedAt) ||
    commands.some(({ actorRefHash: commandActorRefHash }) =>
      commandActorRefHash !== actorRefHash
    ) ||
    !validPreparationResourceScopes(lineage.resourceScopes, lineage, actorRefHash) ||
    !exactKeys(identity, [
      "identityReferenceId", "identityReferenceHash", "referenceEvidenceHash",
      "projectionProof"
    ]) ||
    identity.identityReferenceId !== lineage.identityReferenceId ||
    !HASH.test(identity.identityReferenceHash ?? "") ||
    !HASH.test(identity.referenceEvidenceHash ?? "") ||
    !Array.isArray(events) || events.length < 7 ||
    !events.every(validDurableEvent) || eventIds.size !== events.length ||
    !Array.isArray(projections) || projections.length !== 6 ||
    !projections.every((projection) => validProjectionReadBack(projection, eventIds)) ||
    !validProjectionReadBack(identity.projectionProof, eventIds) ||
    identity.projectionProof.entityType !== "human_identity_reference" ||
    identity.projectionProof.entityId !== lineage.identityReferenceId ||
    identity.projectionProof.entityHash !== identity.identityReferenceHash ||
    identity.projectionProof.sourceEvidenceHash !== identity.referenceEvidenceHash ||
    ![
      ["human_identity_reference", lineage.identityReferenceId],
      ["consent_record", lineage.consentId],
      ["credit_intent", lineage.creditIntentId],
      ["risk_decision", lineage.riskDecisionId],
      ["credit_offer", lineage.preliminaryOfferId],
      ["credit_passport_artifact", lineage.passportArtifactId]
    ].every(([entityType, entityId]) => projections.some((projection) =>
      projection.entityType === entityType && projection.entityId === entityId
    )) ||
    commands.flatMap(({ eventManifest }) => eventManifest)
      .some(({ eventId }) => !eventIds.has(eventId)) ||
    !exactKeys(responseBoundary, [
      "rawResponsesPersisted", "passportSelectedClaimsPersisted",
      "passportDisclosuresPersisted", "passportIssuerPersisted",
      "durableResponseHashesRecomputed"
    ]) ||
    responseBoundary.rawResponsesPersisted !== false ||
    responseBoundary.passportSelectedClaimsPersisted !== false ||
    responseBoundary.passportDisclosuresPersisted !== false ||
    responseBoundary.passportIssuerPersisted !== false ||
    responseBoundary.durableResponseHashesRecomputed !== true) return false;
  return true;
}

function validateCapitalPartnerCriticalReceipt(
  receipt,
  linkage,
  expectedCommitSha,
  expectedDatabaseStartedAt,
  humanReceipt,
  issues
) {
  const topLevelShape = exactKeys(receipt, [
    "schemaVersion",
    "candidateReleaseId",
    "sourceRuntime",
    "capturedAt",
    "databaseStartedAt",
    "postRestartVerification",
    "role",
    "status",
    "authentication",
    "profile",
    "preparation",
    "currentLineage",
    "withdrawalLineage",
    "durability",
    "safety",
    "redaction"
  ]);
  const profile = receipt?.profile;
  const profileValid = exactKeys(profile, [
    "capitalPartnerId",
    "operatorActorRefHash",
    "invitationOnly",
    "sameTenantOnly",
    "sandboxOnly",
    "productionFundsAuthority",
    "resourceStatus",
    "resourceVersion",
    "bindingStatus",
    "bindingVersion",
    "bindingRelationship",
    "selfQueryProof"
  ]) &&
    profile.capitalPartnerId === linkage.capitalPartnerId &&
    IDENTIFIER.test(profile.capitalPartnerId ?? "") &&
    HASH.test(profile.operatorActorRefHash ?? "") &&
    profile.invitationOnly === true &&
    profile.sameTenantOnly === true &&
    profile.sandboxOnly === true &&
    profile.productionFundsAuthority === false &&
    profile.resourceStatus === "active" &&
    Number.isSafeInteger(profile.resourceVersion) &&
    profile.resourceVersion >= 1 &&
    profile.bindingStatus === "active" &&
    Number.isSafeInteger(profile.bindingVersion) &&
    profile.bindingVersion >= 1 &&
    profile.bindingRelationship === "owner" &&
    validQueryProof(
      profile.selfQueryProof,
      "pilotReadCapitalPartnerSelf",
      "tenant_capital_partner_self_view.v1"
    ) &&
    validCapitalPartnerSelfResponseProjection(
      profile.selfQueryProof.responseProjection,
      profile
    );
  const current = receipt?.currentLineage;
  const currentShape = exactKeys(current, [
    "subjectId",
    "borrowerActorRefHash",
    "riskDecisionId",
    "passport",
    "preliminaryOffer",
    "authoredOffer",
    "replacement",
    "staleOfferDenial",
    "borrowerRecovery"
  ]);
  const replacement = current?.replacement;
  const replacementValid = exactKeys(replacement, [
    "eventId",
    "previousStatus",
    "nextStatus",
    "replacementOfferId",
    "reasonCode",
    "eventPayloadProjection",
    "offeredProjectionProof",
    "declinedProjectionProof"
  ]) &&
    IDENTIFIER.test(replacement.eventId ?? "") &&
    replacement.previousStatus === "offered" &&
    replacement.nextStatus === "declined" &&
    replacement.replacementOfferId === current?.authoredOffer?.creditOfferId &&
    replacement.reasonCode === "capital_partner_offer_authored" &&
    validReplacementEventPayload(
      replacement.eventPayloadProjection,
      replacement,
      current?.preliminaryOffer?.creditOfferId
    );
  const recovery = current?.borrowerRecovery;
  const recoveryValid = exactKeys(recovery, [
    "operationId",
    "requestId",
    "correlationId",
    "responseSchemaVersion",
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "offerSchemaVersion",
    "offerAggregateVersion",
    "serverTruth",
    "queryProof",
    "offerProjectionProof"
  ]) &&
    recovery.operationId === "pilotReadWorkspaceResume" &&
    REQUEST_IDENTIFIER.test(recovery.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(recovery.correlationId ?? "") &&
    recovery.responseSchemaVersion === "tenant_workspace_resume_view.v2" &&
    recovery.creditOfferId === current?.authoredOffer?.creditOfferId &&
    recovery.creditOfferHash === current?.authoredOffer?.creditOfferHash &&
    recovery.termsHash === current?.authoredOffer?.termsHash &&
    recovery.offerSchemaVersion === "credit_offer.v2" &&
    recovery.offerAggregateVersion === current?.authoredOffer?.aggregateVersion &&
    recovery.serverTruth === true &&
    validQueryProof(
      recovery.queryProof,
      "pilotReadWorkspaceResume",
      "tenant_workspace_resume_view.v2"
    ) &&
    recovery.queryProof.requestId === recovery.requestId &&
    recovery.queryProof.correlationId === recovery.correlationId &&
    validWorkspaceResponseProjection(recovery.queryProof.responseProjection, {
      subjectId: current?.subjectId,
      creditIntentId: current?.passport?.creditIntentId,
      riskDecisionId: current?.riskDecisionId,
      creditOfferId: recovery.creditOfferId,
      creditOfferHash: recovery.creditOfferHash,
      termsHash: recovery.termsHash,
      offerSchemaVersion: recovery.offerSchemaVersion,
      offerAggregateVersion: recovery.offerAggregateVersion
    });
  const currentValid = currentShape &&
    IDENTIFIER.test(current.subjectId ?? "") &&
    HASH.test(current.borrowerActorRefHash ?? "") &&
    IDENTIFIER.test(current.riskDecisionId ?? "") &&
    validPassport(current.passport, profile?.operatorActorRefHash) &&
    current.passport.creditIntentId === linkage.currentLineage.creditIntentId &&
    current.passport.artifactId === linkage.currentLineage.creditPassportArtifactId &&
    validOffer(current.preliminaryOffer, "credit_offer.v1", "declined") &&
    validOffer(current.authoredOffer, "credit_offer.v2", "offered") &&
    current.authoredOffer.creditOfferId === linkage.currentLineage.currentOfferId &&
    current.authoredOffer.creditOfferHash === linkage.currentLineage.currentOfferHash &&
    current.authoredOffer.termsHash === linkage.currentLineage.currentTermsHash &&
    current.authoredOffer.aggregateVersion ===
      linkage.currentLineage.currentOfferAggregateVersion &&
    current.preliminaryOffer.creditOfferId === linkage.currentLineage.preliminaryOfferId &&
    current.preliminaryOffer.creditOfferId !== current.authoredOffer.creditOfferId &&
    replacementValid &&
    validStaleDenial(current.staleOfferDenial, {
      offerId: current.preliminaryOffer.creditOfferId,
      status: "declined",
      schemaVersion: "credit_offer.v1",
      creditOfferHash: current.preliminaryOffer.creditOfferHash,
      termsHash: current.preliminaryOffer.termsHash,
      aggregateVersion: current.preliminaryOffer.aggregateVersion,
      projectionSourceEventId: current.replacement.declinedProjectionProof.sourceEventId,
      authorizationResourceStatus: "active"
    }) &&
    recoveryValid;
  const withdrawn = receipt?.withdrawalLineage;
  const withdrawalShape = exactKeys(withdrawn, [
    "subjectId",
    "borrowerActorRefHash",
    "riskDecisionId",
    "passport",
    "preliminaryOffer",
    "authoredOffer",
    "replacement",
    "withdrawal",
    "withdrawnOfferDenial",
    "borrowerRecovery"
  ]);
  const withdrawalReplacement = withdrawn?.replacement;
  const withdrawalReplacementValid = exactKeys(withdrawalReplacement, [
    "eventId",
    "previousStatus",
    "nextStatus",
    "replacementOfferId",
    "reasonCode",
    "eventPayloadProjection",
    "offeredProjectionProof",
    "declinedProjectionProof"
  ]) &&
    IDENTIFIER.test(withdrawalReplacement.eventId ?? "") &&
    withdrawalReplacement.previousStatus === "offered" &&
    withdrawalReplacement.nextStatus === "declined" &&
    withdrawalReplacement.replacementOfferId === withdrawn?.authoredOffer?.creditOfferId &&
    withdrawalReplacement.reasonCode === "capital_partner_offer_authored" &&
    validReplacementEventPayload(
      withdrawalReplacement.eventPayloadProjection,
      withdrawalReplacement,
      withdrawn?.preliminaryOffer?.creditOfferId
    );
  const withdrawal = withdrawn?.withdrawal;
  const withdrawalValid = exactKeys(withdrawal, [
    "operationId",
    "requestId",
    "correlationId",
    "responseSchemaVersion",
    "eventId",
    "previousStatus",
    "nextStatus",
    "eventPayloadProjection",
    "authorizationAuditEventId",
    "withdrawnProjectionProof"
  ]) &&
    withdrawal.operationId === "pilotTransitionCapitalPartnerOffer" &&
    REQUEST_IDENTIFIER.test(withdrawal.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(withdrawal.correlationId ?? "") &&
    withdrawal.responseSchemaVersion === "tenant_capital_partner_offer_transitioned.v1" &&
    IDENTIFIER.test(withdrawal.eventId ?? "") &&
    withdrawal.previousStatus === "offered" &&
    withdrawal.nextStatus === "withdrawn" &&
    validWithdrawalEventPayload(
      withdrawal.eventPayloadProjection,
      withdrawal,
      withdrawn?.authoredOffer?.creditOfferId
    ) &&
    IDENTIFIER.test(withdrawal.authorizationAuditEventId ?? "");
  const withdrawalRecovery = withdrawn?.borrowerRecovery;
  const withdrawalRecoveryValid = exactKeys(withdrawalRecovery, [
    "operationId",
    "requestId",
    "correlationId",
    "responseSchemaVersion",
    "creditOfferId",
    "creditOfferHash",
    "termsHash",
    "offerSchemaVersion",
    "offerAggregateVersion",
    "serverTruth",
    "queryProof",
    "offerProjectionProof"
  ]) &&
    withdrawalRecovery.operationId === "pilotReadWorkspaceResume" &&
    REQUEST_IDENTIFIER.test(withdrawalRecovery.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(withdrawalRecovery.correlationId ?? "") &&
    withdrawalRecovery.responseSchemaVersion === "tenant_workspace_resume_view.v2" &&
    withdrawalRecovery.creditOfferId === current?.authoredOffer?.creditOfferId &&
    withdrawalRecovery.creditOfferHash === current?.authoredOffer?.creditOfferHash &&
    withdrawalRecovery.termsHash === current?.authoredOffer?.termsHash &&
    withdrawalRecovery.offerSchemaVersion === "credit_offer.v2" &&
    withdrawalRecovery.offerAggregateVersion === current?.authoredOffer?.aggregateVersion &&
    withdrawalRecovery.creditOfferId !== withdrawn?.authoredOffer?.creditOfferId &&
    withdrawalRecovery.serverTruth === true &&
    validQueryProof(
      withdrawalRecovery.queryProof,
      "pilotReadWorkspaceResume",
      "tenant_workspace_resume_view.v2"
    ) &&
    withdrawalRecovery.queryProof.requestId === withdrawalRecovery.requestId &&
    withdrawalRecovery.queryProof.correlationId === withdrawalRecovery.correlationId &&
    validWorkspaceResponseProjection(
      withdrawalRecovery.queryProof.responseProjection,
      {
        subjectId: current?.subjectId,
        creditIntentId: current?.passport?.creditIntentId,
        riskDecisionId: current?.riskDecisionId,
        creditOfferId: withdrawalRecovery.creditOfferId,
        creditOfferHash: withdrawalRecovery.creditOfferHash,
        termsHash: withdrawalRecovery.termsHash,
        offerSchemaVersion: withdrawalRecovery.offerSchemaVersion,
        offerAggregateVersion: withdrawalRecovery.offerAggregateVersion
      }
    ) &&
    exactKeys(withdrawalRecovery.offerProjectionProof, [
      "entityType",
      "entityId",
      "entityHash",
      "rootAggregateType",
      "rootAggregateId",
      "aggregateVersion",
      "sourceEventId",
      "sourceEvidenceHash",
      "sourceFinality"
    ]);
  const withdrawalLineageValid = withdrawalShape &&
    IDENTIFIER.test(withdrawn.subjectId ?? "") &&
    HASH.test(withdrawn.borrowerActorRefHash ?? "") &&
    IDENTIFIER.test(withdrawn.riskDecisionId ?? "") &&
    validPassport(withdrawn.passport, profile?.operatorActorRefHash) &&
    withdrawn.passport.creditIntentId === linkage.withdrawalLineage.creditIntentId &&
    withdrawn.passport.artifactId === linkage.withdrawalLineage.creditPassportArtifactId &&
    validOffer(withdrawn.preliminaryOffer, "credit_offer.v1", "declined") &&
    validOffer(withdrawn.authoredOffer, "credit_offer.v2", "withdrawn") &&
    withdrawn.authoredOffer.creditOfferId === linkage.withdrawalLineage.withdrawnOfferId &&
    withdrawalReplacementValid &&
    withdrawn.preliminaryOffer.creditOfferId !== withdrawn.authoredOffer.creditOfferId &&
    withdrawalValid &&
    withdrawalRecoveryValid &&
    validStaleDenial(withdrawn.withdrawnOfferDenial, {
      offerId: withdrawn.authoredOffer.creditOfferId,
      status: "withdrawn",
      schemaVersion: "credit_offer.v2",
      creditOfferHash: withdrawn.authoredOffer.creditOfferHash,
      termsHash: withdrawn.authoredOffer.termsHash,
      aggregateVersion: withdrawn.authoredOffer.aggregateVersion,
      projectionSourceEventId: withdrawn.withdrawal.withdrawnProjectionProof.sourceEventId,
      authorizationResourceStatus: "closed"
    }) &&
    withdrawn.borrowerActorRefHash === current?.borrowerActorRefHash &&
    withdrawn.subjectId === current?.subjectId &&
    withdrawn.passport.creditIntentId !== current?.passport?.creditIntentId &&
    withdrawn.passport.artifactId !== current?.passport?.artifactId &&
    withdrawn.authoredOffer.creditOfferId !== current?.authoredOffer?.creditOfferId;
  const preparation = receipt?.preparation;
  const humanBinding = preparation?.humanReceiptBinding;
  const preparationValid = exactKeys(preparation, [
    "schemaVersion",
    "humanReceiptBinding",
    "currentLineage",
    "withdrawalLineage"
  ]) &&
    preparation.schemaVersion === "m1_b_capital_partner_preparation.v1" &&
    exactKeys(humanBinding, [
      "schemaVersion",
      "candidateReleaseId",
      "receiptHash",
      "capturedAt",
      "subjectId",
      "actorRefHash"
    ]) &&
    humanBinding.schemaVersion === "m1_b_human_critical_receipt_binding.v1" &&
    humanBinding.candidateReleaseId === expectedCommitSha &&
    humanReceipt !== null && typeof humanReceipt === "object" &&
    !Array.isArray(humanReceipt) &&
    humanBinding.receiptHash === criticalProjectionHash(humanReceipt) &&
    humanBinding.capturedAt === humanReceipt?.capturedAt &&
    humanBinding.subjectId === humanReceipt?.linkage?.subjectId &&
    humanBinding.actorRefHash === humanReceipt?.actorScope?.actorRefHash &&
    humanBinding.subjectId === current?.subjectId &&
    humanBinding.actorRefHash === current?.borrowerActorRefHash &&
    validCapitalPartnerPreparationLineage(preparation.currentLineage, {
      expected: {
        subjectId: current?.subjectId,
        creditIntentId: current?.passport?.creditIntentId,
        riskDecisionId: current?.riskDecisionId,
        preliminaryOfferId: current?.preliminaryOffer?.creditOfferId,
        passportArtifactId: current?.passport?.artifactId
      },
      actorRefHash: current?.borrowerActorRefHash,
      windowStartedAt: humanBinding?.capturedAt,
      observedBefore: profile?.selfQueryProof?.occurredAt,
      databaseStartedAt: expectedDatabaseStartedAt
    }) &&
    validCapitalPartnerPreparationLineage(preparation.withdrawalLineage, {
      expected: {
        subjectId: withdrawn?.subjectId,
        creditIntentId: withdrawn?.passport?.creditIntentId,
        riskDecisionId: withdrawn?.riskDecisionId,
        preliminaryOfferId: withdrawn?.preliminaryOffer?.creditOfferId,
        passportArtifactId: withdrawn?.passport?.artifactId
      },
      actorRefHash: withdrawn?.borrowerActorRefHash,
      windowStartedAt: current?.borrowerRecovery?.queryProof?.occurredAt,
      observedBefore: withdrawn?.passport?.inboxQueryProof?.occurredAt,
      databaseStartedAt: expectedDatabaseStartedAt
    }) &&
    preparation.currentLineage.consentId !==
      preparation.withdrawalLineage.consentId &&
    preparation.currentLineage.identityReferenceId !==
      preparation.withdrawalLineage.identityReferenceId &&
    preparation.currentLineage.creditIntentId !==
      preparation.withdrawalLineage.creditIntentId &&
    preparation.currentLineage.riskDecisionId !==
      preparation.withdrawalLineage.riskDecisionId &&
    preparation.currentLineage.preliminaryOfferId !==
      preparation.withdrawalLineage.preliminaryOfferId &&
    preparation.currentLineage.passportArtifactId !==
      preparation.withdrawalLineage.passportArtifactId;
  const commandReceipts = receipt?.durability?.commandReceipts;
  const durableEvents = receipt?.durability?.events;
  const durableEventIds = new Set(
    Array.isArray(durableEvents) ? durableEvents.map(({ eventId }) => eventId) : []
  );
  const projectionReadBack = receipt?.durability?.projectionReadBack;
  const durabilityValid = exactKeys(receipt?.durability, [
    "canonicalPersistence",
    "rlsReadBack",
    "authorizationAuditImmutable",
    "tenantCommandExecutionsImmutable",
    "fixtureUsed",
    "commandReceipts",
    "events",
    "projectionReadBack"
  ]) &&
    receipt.durability.canonicalPersistence === "postgresql" &&
    receipt.durability.rlsReadBack === true &&
    receipt.durability.authorizationAuditImmutable === true &&
    receipt.durability.tenantCommandExecutionsImmutable === true &&
    receipt.durability.fixtureUsed === false &&
    Array.isArray(commandReceipts) &&
    commandReceipts.length === 3 &&
    validCommandReceipt(commandReceipts[0], "pilotAuthorCapitalPartnerOffer") &&
    validCommandReceipt(commandReceipts[1], "pilotAuthorCapitalPartnerOffer") &&
    validCommandReceipt(commandReceipts[2], "pilotTransitionCapitalPartnerOffer") &&
    commandReceipts[0].responseSchemaVersion ===
      "tenant_capital_partner_offer_authored.v1" &&
    validCapitalPartnerCommandResponseProjection(
      commandReceipts[0].responseProjection,
      "pilotAuthorCapitalPartnerOffer",
      current?.authoredOffer,
      current?.passport,
      profile,
      current,
      commandReceipts[0]
    ) &&
    commandReceipts[1].responseSchemaVersion ===
      "tenant_capital_partner_offer_authored.v1" &&
    validCapitalPartnerCommandResponseProjection(
      commandReceipts[1].responseProjection,
      "pilotAuthorCapitalPartnerOffer",
      withdrawn?.authoredOffer,
      withdrawn?.passport,
      profile,
      withdrawn,
      commandReceipts[1]
    ) &&
    commandReceipts[2].responseSchemaVersion ===
      "tenant_capital_partner_offer_transitioned.v1" &&
    validCapitalPartnerCommandResponseProjection(
      commandReceipts[2].responseProjection,
      "pilotTransitionCapitalPartnerOffer",
      withdrawn?.authoredOffer,
      withdrawn?.passport,
      profile,
      withdrawn,
      commandReceipts[2]
    ) &&
    commandReceipts[0].resourceType === "credit_passport_artifact" &&
    commandReceipts[0].resourceId === current?.passport?.artifactId &&
    commandReceipts[1].resourceType === "credit_passport_artifact" &&
    commandReceipts[1].resourceId === withdrawn?.passport?.artifactId &&
    commandReceipts[2].resourceType === "credit_offer" &&
    commandReceipts[2].resourceId === withdrawn?.authoredOffer?.creditOfferId &&
    current?.replacement?.eventId === commandReceipts[0].businessEventId &&
    current?.replacement?.eventId === commandReceipts[0].eventManifest[0]?.eventId &&
    withdrawn?.replacement?.eventId === commandReceipts[1].businessEventId &&
    withdrawn?.replacement?.eventId === commandReceipts[1].eventManifest[0]?.eventId &&
    withdrawn?.withdrawal?.eventId === commandReceipts[2].businessEventId &&
    withdrawn?.withdrawal?.eventId === commandReceipts[2].eventManifest[0]?.eventId &&
    withdrawn?.withdrawal?.requestId === commandReceipts[2].requestId &&
    withdrawn?.withdrawal?.correlationId === commandReceipts[2].correlationId &&
    withdrawn?.withdrawal?.authorizationAuditEventId ===
      commandReceipts[2].authorizationAuditEventId &&
    exactManifestEventTypes(commandReceipts[0], [
      "credit_offer_status_changed",
      "credit_offer_created"
    ]) &&
    exactManifestEventTypes(commandReceipts[1], [
      "credit_offer_status_changed",
      "credit_offer_created"
    ]) &&
    exactManifestEventTypes(commandReceipts[2], ["credit_offer_status_changed"]) &&
    validCapitalPartnerCreatedEventPayload(
      commandReceipts[0].eventManifest[1].payloadProjection,
      current.authoredOffer,
      current.passport,
      current.riskDecisionId,
      commandReceipts[0]
    ) &&
    validCapitalPartnerCreatedEventPayload(
      commandReceipts[1].eventManifest[1].payloadProjection,
      withdrawn.authoredOffer,
      withdrawn.passport,
      withdrawn.riskDecisionId,
      commandReceipts[1]
    ) &&
    current.replacement.eventPayloadProjection.causationId === commandReceipts[0].requestId &&
    current.replacement.eventPayloadProjection.correlationId ===
      commandReceipts[0].correlationId &&
    withdrawn.replacement.eventPayloadProjection.causationId ===
      commandReceipts[1].requestId &&
    withdrawn.replacement.eventPayloadProjection.correlationId ===
      commandReceipts[1].correlationId &&
    Array.isArray(durableEvents) &&
    durableEvents.length >= 6 &&
    durableEvents.every(validDurableEvent) &&
    durableEventIds.size === durableEvents.length &&
    commandReceipts.flatMap(({ eventManifest }) => eventManifest)
      .every((event) => durableEventIds.has(event.eventId)) &&
    durableEvents.filter(({ eventType }) => eventType === "credit_offer_created").length >= 2 &&
    durableEvents.filter(({ eventType }) => eventType === "credit_offer_status_changed").length >= 3 &&
    durableEventIds.has(current?.replacement?.eventId) &&
    durableEventIds.has(withdrawn?.withdrawal?.eventId) &&
    durableEventIds.has(commandReceipts[0].businessEventId) &&
    durableEventIds.has(commandReceipts[1].businessEventId) &&
    durableEventIds.has(commandReceipts[2].businessEventId) &&
    durableEvents.some((event) => (
      event.eventId === current.replacement.eventId &&
      event.eventType === "credit_offer_status_changed" &&
      canonicalJson(event.payloadProjection) ===
        canonicalJson(current.replacement.eventPayloadProjection) &&
      event.payloadHash === hashId(
        "event_payload",
        current.replacement.eventPayloadProjection
      ) &&
      event.causationId === current.replacement.eventPayloadProjection.causationId &&
      event.correlationId === current.replacement.eventPayloadProjection.correlationId
    )) &&
    durableEvents.some((event) => (
      event.eventId === withdrawn.replacement.eventId &&
      event.eventType === "credit_offer_status_changed" &&
      canonicalJson(event.payloadProjection) ===
        canonicalJson(withdrawn.replacement.eventPayloadProjection) &&
      event.payloadHash === hashId(
        "event_payload",
        withdrawn.replacement.eventPayloadProjection
      ) &&
      event.causationId === withdrawn.replacement.eventPayloadProjection.causationId &&
      event.correlationId === withdrawn.replacement.eventPayloadProjection.correlationId
    )) &&
    durableEvents.some((event) => (
      event.eventId === withdrawn.withdrawal.eventId &&
      event.eventType === "credit_offer_status_changed" &&
      canonicalJson(event.payloadProjection) ===
        canonicalJson(withdrawn.withdrawal.eventPayloadProjection) &&
      event.payloadHash === hashId(
        "event_payload",
        withdrawn.withdrawal.eventPayloadProjection
      ) &&
      event.causationId === withdrawn.withdrawal.requestId &&
      event.correlationId === withdrawn.withdrawal.correlationId
    )) &&
    Array.isArray(projectionReadBack) &&
    projectionReadBack.length >= 4 &&
    projectionReadBack.every((projection) => (
      validProjectionReadBack(projection, durableEventIds) &&
      durableEvents.some((event) => (
        event.eventId === projection.sourceEventId &&
        event.evidenceHash === projection.sourceEvidenceHash &&
        event.aggregateVersion === projection.aggregateVersion
      ))
    )) &&
    [
      current?.preliminaryOffer?.creditOfferId,
      current?.authoredOffer?.creditOfferId,
      withdrawn?.preliminaryOffer?.creditOfferId,
      withdrawn?.authoredOffer?.creditOfferId
    ].every((offerId) => projectionReadBack.some((projection) => (
      projection.entityType === "credit_offer" && projection.entityId === offerId
    ))) &&
    projectionReadBack.some((projection) => (
      projection.entityType === "credit_offer" &&
      projection.entityId === current?.preliminaryOffer?.creditOfferId &&
      projection.sourceEventId === current?.replacement?.eventId
    )) &&
    projectionReadBack.some((projection) => (
      projection.entityType === "credit_offer" &&
      projection.entityId === current?.authoredOffer?.creditOfferId &&
      projection.sourceEventId === commandReceipts[0].eventManifest[1].eventId
    )) &&
    projectionReadBack.some((projection) => (
      projection.entityType === "credit_offer" &&
      projection.entityId === withdrawn?.preliminaryOffer?.creditOfferId &&
      projection.sourceEventId === withdrawn?.replacement?.eventId
    )) &&
    projectionReadBack.some((projection) => (
      projection.entityType === "credit_offer" &&
      projection.entityId === withdrawn?.authoredOffer?.creditOfferId &&
      projection.sourceEventId === withdrawn?.withdrawal?.eventId
    )) &&
    validProjectionReadBack(current?.replacement?.offeredProjectionProof, durableEventIds) &&
    current.replacement.offeredProjectionProof.entityType === "credit_offer" &&
    current.replacement.offeredProjectionProof.entityId ===
      current.preliminaryOffer.creditOfferId &&
    current.replacement.offeredProjectionProof.aggregateVersion === 1 &&
    validProjectionReadBack(current?.replacement?.declinedProjectionProof, durableEventIds) &&
    current.replacement.declinedProjectionProof.entityType === "credit_offer" &&
    current.replacement.declinedProjectionProof.entityId ===
      current.preliminaryOffer.creditOfferId &&
    current.replacement.declinedProjectionProof.sourceEventId === current.replacement.eventId &&
    validProjectionReadBack(current?.borrowerRecovery?.offerProjectionProof, durableEventIds) &&
    current.borrowerRecovery.offerProjectionProof.entityType === "credit_offer" &&
    current.borrowerRecovery.offerProjectionProof.entityId ===
      current.authoredOffer.creditOfferId &&
    current.borrowerRecovery.offerProjectionProof.aggregateVersion ===
      current.authoredOffer.aggregateVersion &&
    validProjectionReadBack(withdrawn?.withdrawal?.withdrawnProjectionProof, durableEventIds) &&
    withdrawn.withdrawal.withdrawnProjectionProof.entityType === "credit_offer" &&
    withdrawn.withdrawal.withdrawnProjectionProof.entityId ===
      withdrawn.authoredOffer.creditOfferId &&
    withdrawn.withdrawal.withdrawnProjectionProof.sourceEventId === withdrawn.withdrawal.eventId &&
    validProjectionReadBack(
      withdrawn?.borrowerRecovery?.offerProjectionProof,
      durableEventIds
    ) &&
    withdrawn.borrowerRecovery.offerProjectionProof.entityType === "credit_offer" &&
    withdrawn.borrowerRecovery.offerProjectionProof.entityId ===
      current.authoredOffer.creditOfferId &&
    withdrawn.borrowerRecovery.offerProjectionProof.aggregateVersion ===
      current.authoredOffer.aggregateVersion &&
    validProjectionReadBack(
      withdrawn?.replacement?.offeredProjectionProof,
      durableEventIds
    ) &&
    withdrawn.replacement.offeredProjectionProof.entityType === "credit_offer" &&
    withdrawn.replacement.offeredProjectionProof.entityId ===
      withdrawn.preliminaryOffer.creditOfferId &&
    withdrawn.replacement.offeredProjectionProof.aggregateVersion === 1 &&
    validProjectionReadBack(
      withdrawn?.replacement?.declinedProjectionProof,
      durableEventIds
    ) &&
    withdrawn.replacement.declinedProjectionProof.entityType === "credit_offer" &&
    withdrawn.replacement.declinedProjectionProof.entityId ===
      withdrawn.preliminaryOffer.creditOfferId &&
    withdrawn.replacement.declinedProjectionProof.sourceEventId ===
      withdrawn.replacement.eventId;
  const databaseStart = Date.parse(expectedDatabaseStartedAt ?? "");
  const preparationCommands = [
    ...(preparation?.currentLineage?.commandReceipts ?? []),
    ...(preparation?.withdrawalLineage?.commandReceipts ?? [])
  ];
  const preparationQueries = [
    ...(preparation?.currentLineage?.queryAuthorizationObservations ?? []),
    ...(preparation?.withdrawalLineage?.queryAuthorizationObservations ?? [])
  ];
  const candidateActivityAfterRestart =
    Array.isArray(commandReceipts) &&
    [...commandReceipts, ...preparationCommands].every((command) => (
      Date.parse(command.occurredAt) >= databaseStart &&
      Date.parse(command.completedAt) >= databaseStart &&
      command.eventManifest.every((event) => Date.parse(event.occurredAt) >= databaseStart)
    )) &&
    [
      profile?.selfQueryProof,
      current?.passport?.inboxQueryProof,
      current?.borrowerRecovery?.queryProof,
      withdrawn?.passport?.inboxQueryProof,
      withdrawn?.borrowerRecovery?.queryProof
    ].every((query) => Date.parse(query?.occurredAt ?? "") >= databaseStart) &&
    preparationQueries.every((query) => Date.parse(query?.occurredAt ?? "") >= databaseStart) &&
    [current?.staleOfferDenial, withdrawn?.withdrawnOfferDenial]
      .every((denial) => Date.parse(denial?.authorizationAudit?.occurredAt ?? "") >= databaseStart);
  const currentPreparationCommands = preparation?.currentLineage?.commandReceipts ?? [];
  const currentPreparationQueries =
    preparation?.currentLineage?.queryAuthorizationObservations ?? [];
  const withdrawalPreparationCommands =
    preparation?.withdrawalLineage?.commandReceipts ?? [];
  const withdrawalPreparationQueries =
    preparation?.withdrawalLineage?.queryAuthorizationObservations ?? [];
  const strictCaptureTimeline = [
    humanBinding?.capturedAt,
    currentPreparationCommands[0]?.completedAt,
    currentPreparationQueries[0]?.occurredAt,
    currentPreparationCommands[1]?.completedAt,
    currentPreparationQueries[1]?.occurredAt,
    currentPreparationCommands[2]?.completedAt,
    currentPreparationCommands[3]?.completedAt,
    preparation?.currentLineage?.observedAt,
    profile?.selfQueryProof?.occurredAt,
    current?.passport?.inboxQueryProof?.occurredAt,
    commandReceipts?.[0]?.capturedAt,
    current?.staleOfferDenial?.outwardResponse?.capturedAt,
    current?.borrowerRecovery?.queryProof?.occurredAt,
    withdrawalPreparationCommands[0]?.completedAt,
    withdrawalPreparationQueries[0]?.occurredAt,
    withdrawalPreparationCommands[1]?.completedAt,
    withdrawalPreparationQueries[1]?.occurredAt,
    withdrawalPreparationCommands[2]?.completedAt,
    withdrawalPreparationCommands[3]?.completedAt,
    preparation?.withdrawalLineage?.observedAt,
    withdrawn?.passport?.inboxQueryProof?.occurredAt,
    commandReceipts?.[1]?.capturedAt,
    commandReceipts?.[2]?.capturedAt,
    withdrawn?.withdrawnOfferDenial?.outwardResponse?.capturedAt,
    withdrawn?.borrowerRecovery?.queryProof?.occurredAt,
    receipt?.capturedAt
  ];
  const strictCaptureTimelineValid = strictCaptureTimeline.every((value) =>
    Number.isFinite(Date.parse(value ?? ""))
  ) && strictCaptureTimeline.every((value, index) => (
    index === 0
      ? Date.parse(value) > databaseStart
      : Date.parse(value) > Date.parse(strictCaptureTimeline[index - 1])
  ));
  const actorScopeValid =
    Array.isArray(commandReceipts) &&
    commandReceipts.every(({ actorRefHash }) => actorRefHash === profile?.operatorActorRefHash) &&
    [profile?.selfQueryProof, current?.passport?.inboxQueryProof, withdrawn?.passport?.inboxQueryProof]
      .every((query) => query?.authorizationAudits?.every(({ actorRefHash }) =>
        actorRefHash === profile?.operatorActorRefHash
      )) &&
    current?.borrowerRecovery?.queryProof?.authorizationAudits?.every(({ actorRefHash }) =>
      actorRefHash === current.borrowerActorRefHash
    ) &&
    current?.staleOfferDenial?.authorizationAudit?.actorRefHash ===
      current?.borrowerActorRefHash &&
    withdrawn?.borrowerRecovery?.queryProof?.authorizationAudits?.every(({ actorRefHash }) =>
      actorRefHash === withdrawn.borrowerActorRefHash
    ) &&
    withdrawn?.withdrawnOfferDenial?.authorizationAudit?.actorRefHash ===
      withdrawn?.borrowerActorRefHash;
  const capitalPartnerAuthenticationRequestIds = Array.isArray(commandReceipts)
    ? [
        profile?.selfQueryProof?.requestId,
        current?.passport?.inboxQueryProof?.requestId,
        commandReceipts[0]?.requestId,
        withdrawn?.passport?.inboxQueryProof?.requestId,
        commandReceipts[1]?.requestId,
        commandReceipts[2]?.requestId
      ]
    : undefined;
  const capitalPartnerAuthenticationAuditEventIds = Array.isArray(commandReceipts)
    ? [
        ...(profile?.selfQueryProof?.authorizationAudits ?? []),
        ...(current?.passport?.inboxQueryProof?.authorizationAudits ?? []),
        ...(commandReceipts[0]?.authorizationAudits ?? []),
        ...(withdrawn?.passport?.inboxQueryProof?.authorizationAudits ?? []),
        ...(commandReceipts[1]?.authorizationAudits ?? []),
        ...(commandReceipts[2]?.authorizationAudits ?? [])
      ].map(({ eventId }) => eventId)
    : undefined;
  const borrowerAuthenticationRequestIds = [
    ...preparationCommands.map(({ requestId }) => requestId),
    ...preparationQueries.map(({ requestId }) => requestId),
    current?.borrowerRecovery?.requestId,
    current?.staleOfferDenial?.requestId,
    withdrawn?.withdrawnOfferDenial?.requestId,
    withdrawn?.borrowerRecovery?.requestId
  ];
  const borrowerAuthenticationAuditEventIds = [
    ...preparationCommands.flatMap(({ authorizationAudits }) =>
      authorizationAudits ?? []
    ),
    ...preparationQueries.flatMap(({ authorizationAudits }) =>
      authorizationAudits ?? []
    ),
    ...(current?.borrowerRecovery?.queryProof?.authorizationAudits ?? []),
    current?.staleOfferDenial?.authorizationAudit,
    withdrawn?.withdrawnOfferDenial?.authorizationAudit,
    ...(withdrawn?.borrowerRecovery?.queryProof?.authorizationAudits ?? [])
  ].filter(Boolean).map(({ eventId }) => eventId);
  const authenticationValid = exactKeys(receipt?.authentication, [
    "capitalPartner",
    "borrower"
  ]) &&
    validSafeSiweAuthentication(receipt.authentication.capitalPartner, {
      expectedRequestIds: capitalPartnerAuthenticationRequestIds,
      expectedAuditEventIds: capitalPartnerAuthenticationAuditEventIds,
      expectedActorRefHash: profile?.operatorActorRefHash,
      databaseStartedAt: expectedDatabaseStartedAt
    }) &&
    validSafeSiweAuthentication(receipt.authentication.borrower, {
      expectedRequestIds: borrowerAuthenticationRequestIds,
      expectedAuditEventIds: borrowerAuthenticationAuditEventIds,
      expectedActorRefHash: current?.borrowerActorRefHash,
      databaseStartedAt: expectedDatabaseStartedAt,
      acceptedVerificationMethods: new Set(["eip191_eoa_v1"])
    }) &&
    current?.staleOfferDenial?.protectedStateBefore?.deniedCommand?.clientIdRefHash ===
      receipt.authentication.borrower.clientRefHash &&
    withdrawn?.withdrawnOfferDenial?.protectedStateBefore?.deniedCommand?.clientIdRefHash ===
      receipt.authentication.borrower.clientRefHash;
  const safetyValid = exactKeys(receipt?.safety, [
    "sandboxOnly",
    "productionFundsApproved",
    "fundsAuthority"
  ]) &&
    receipt.safety.sandboxOnly === true &&
    receipt.safety.productionFundsApproved === false &&
    receipt.safety.fundsAuthority === false;
  if (
    !topLevelShape ||
    receipt?.schemaVersion !== "m1_b_capital_partner_critical_receipt.v1" ||
    receipt.candidateReleaseId !== expectedCommitSha ||
    receipt.sourceRuntime !== "local_exact_commit" ||
    !Number.isFinite(Date.parse(receipt.capturedAt ?? "")) ||
    receipt.databaseStartedAt !== expectedDatabaseStartedAt ||
    Date.parse(receipt.capturedAt ?? "") <= Date.parse(expectedDatabaseStartedAt ?? "") ||
    receipt.postRestartVerification !== true ||
    receipt.role !== "capital_partner" ||
    receipt.status !== "passed" ||
    !authenticationValid ||
    !profileValid ||
    !preparationValid ||
    !currentValid ||
    !withdrawalLineageValid ||
    !durabilityValid ||
    !candidateActivityAfterRestart ||
    !strictCaptureTimelineValid ||
    !actorScopeValid ||
    !safetyValid ||
    !validCriticalRedaction(receipt.redaction)
  ) {
    issues.push(
      "Capital Partner critical receipt does not prove recipient-scoped Passport review, distinct replace/current and withdraw/deny lineages, PostgreSQL durability, and redaction truth."
    );
  }
}

function validateRiskBoundaryReceipt(
  receipt,
  boundary,
  expectedCommitSha,
  expectedDatabaseStartedAt,
  expectedReleaseIdentityArtifactSha256,
  issues
) {
  const exactTopLevel = exactKeys(receipt, [
    "schemaVersion",
    "candidateReleaseId",
    "sourceRuntime",
    "capturedAt",
    "databaseStartedAt",
    "postRestartVerification",
    "runtimeBinding",
    "role",
    "status",
    "releaseLevel",
    "policy",
    "authorizationRegression",
    "liveRuntimeObservation",
    "protectedState",
    "exposure",
    "authority",
    "redaction"
  ]);
  const policyShape = exactKeys(receipt?.policy, [
    "policyVersion",
    "requiresRecentMfaActorTypesPreserved",
    "protectedOperationIds",
    "derivation"
  ]);
  const runtimeBindingShape = exactKeys(receipt?.runtimeBinding, [
    "buildSource",
    "imageId",
    "longLivedPilotImageMatch",
    "longLivedWorkerImageMatch",
    "releaseIdentityArtifactSha256"
  ]);
  const regression = receipt?.authorizationRegression;
  const regressionShape = exactKeys(regression, [
    "provenance",
    "testName",
    "testCommand",
    "testOutputSha256",
    "sourceFiles",
    "operationIds",
    "denials",
    "allowCount",
    "resultSha256",
    "passed"
  ]);
  const sourceFilesValid = Array.isArray(regression?.sourceFiles) &&
    regression.sourceFiles.length === RISK_REGRESSION_SOURCE_PATHS.length &&
    regression.sourceFiles.every((sourceFile, index) =>
      exactKeys(sourceFile, ["path", "sha256"]) &&
      sourceFile.path === RISK_REGRESSION_SOURCE_PATHS[index] &&
      sourceFile.sha256 === riskRegressionSourceSha256.get(sourceFile.path)
    );
  const regressionDenials = regression?.denials;
  const regressionDenialsValid = Array.isArray(regressionDenials) &&
    regressionDenials.length === M1_B_RISK_MFA_OPERATION_IDS.length &&
    regressionDenials.every((denial, index) => {
      const operationId = M1_B_RISK_MFA_OPERATION_IDS[index];
      const policy = riskMfaPolicyByOperationId.get(operationId);
      const expectedActorType = policy?.requiresRecentMfaActorTypes.includes(
        ActorType.RISK_OPERATOR
      )
        ? ActorType.RISK_OPERATOR
        : ActorType.OPERATIONS_OPERATOR;
      return exactKeys(denial, [
        "operationId",
        "actorType",
        "authorizationDecision",
        "reasonCode",
        "additionalEffectCount"
      ]) &&
        denial.operationId === operationId &&
        denial.actorType === expectedActorType &&
        denial.authorizationDecision === "deny" &&
        denial.reasonCode === "actor_capability_rejected" &&
        denial.additionalEffectCount === 0;
    });
  const expectedRegressionResultSha256 = regressionDenialsValid
    ? createHash("sha256").update(JSON.stringify({
        operationIds: regression.operationIds,
        denials: regression.denials,
        allowCount: regression.allowCount
      })).digest("hex")
    : undefined;
  const live = receipt?.liveRuntimeObservation;
  const liveShape = exactKeys(live, [
    "provenance",
    "actorType",
    "observationStartedAt",
    "session",
    "operationIds",
    "mfaDenialAttribution",
    "credentialBoundary",
    "checks"
  ]);
  const session = live?.session;
  const sessionShape = exactKeys(session, [
    "actorType",
    "method",
    "acr",
    "amr",
    "authTime",
    "createdAt",
    "observedAfterRestart",
    "phishingResistantMfaSatisfied",
    "sessionMaterialIncluded",
    "syntheticMfaClaimUsed"
  ]);
  const amr = session?.amr;
  const attribution = live?.mfaDenialAttribution;
  const attributionShape = exactKeys(attribution, [
    "requiredCapabilities",
    "roleBindingVerified",
    "policyBindingVerified",
    "clientBindingVerified",
    "sessionCredentialMembershipCapabilitiesVerified",
    "auditCorrelationBindingVerified",
    "auditSessionTokenBindingVerified"
  ]);
  const expectedLiveRequiredCapabilities = M1_B_RISK_MFA_LIVE_OPERATION_IDS.map(
    (operationId) => riskMfaPolicyByOperationId.get(operationId)?.requiredCapability
  );
  const credentialBoundary = live?.credentialBoundary;
  const credentialBoundaryShape = exactKeys(credentialBoundary, [
    "protectedActorTypes",
    "activeMembershipCountsByActorType",
    "activeCredentialCount",
    "activeAuthenticationMethods",
    "nonSiweActiveCredentialCount",
    "reviewedActiveIdentitySetVerified"
  ]);
  const protectedActorTypes = [...new Set(
    M1_B_RISK_MFA_OPERATION_IDS.flatMap((operationId) =>
      riskMfaPolicyByOperationId.get(operationId)?.requiresRecentMfaActorTypes ?? []
    )
  )].sort();
  const expectedActiveMembershipCounts = Object.fromEntries(
    protectedActorTypes.map((actorType) => [
      actorType,
      actorType === ActorType.RISK_OPERATOR ? 1 : 0
    ])
  );
  const activeMembershipCountsShape = exactKeys(
    credentialBoundary?.activeMembershipCountsByActorType,
    protectedActorTypes
  );
  const liveChecks = live?.checks;
  const liveChecksValid = Array.isArray(liveChecks) &&
    liveChecks.length === M1_B_RISK_MFA_LIVE_OPERATION_IDS.length &&
    liveChecks.every((check, index) => {
      const operationId = M1_B_RISK_MFA_LIVE_OPERATION_IDS[index];
      const query = operationId === "pilotReadTenantRiskPortfolioReference";
      return exactKeys(check, [
        "operationId",
        "kind",
        "resourceType",
        "resourceId",
        "requestId",
        "correlationId",
        "auditEventId",
        "authorizationDecision",
        "reasonCode",
        "additionalEffectCount"
      ]) &&
        check.operationId === operationId &&
        check.kind === (query ? "query" : "command") &&
        check.resourceType === (query ? "workspace" : "subject") &&
        (query
          ? check.resourceId === "resource_pending"
          : IDENTIFIER.test(check.resourceId ?? "")) &&
        REQUEST_IDENTIFIER.test(check.requestId ?? "") &&
        REQUEST_IDENTIFIER.test(check.correlationId ?? "") &&
        IDENTIFIER.test(check.auditEventId ?? "") &&
        check.authorizationDecision === "deny" &&
        check.reasonCode === "actor_capability_rejected" &&
        check.additionalEffectCount === 0;
    });
  const stateShape = exactKeys(receipt?.protectedState, [
    "catalogVersion",
    "tableNames",
    "minimumRowCounts",
    "observedRowCounts",
    "beforeHash",
    "afterHash",
    "privilegedMutationCount",
    "additionalEconomicEffectCount"
  ]);
  const exposureShape = exactKeys(receipt?.exposure, [
    "evidenceScope",
    "activeRiskAuthenticationMethods",
    "nonSiweActiveRiskCredentialCount",
    "hostedRiskSurfaceEvaluated"
  ]);
  const authorityShape = exactKeys(receipt?.authority, [
    "mfaPolicyWeakened",
    "privilegedMutationPerformed",
    "realFundsEnabled"
  ]);
  const redactionShape = exactKeys(receipt?.redaction, [
    "containsSecrets",
    "containsRawPii",
    "containsSessionMaterial"
  ]);
  const beforeHash = receipt?.protectedState?.beforeHash;
  const afterHash = receipt?.protectedState?.afterHash;
  const minimumRowCounts = receipt?.protectedState?.minimumRowCounts;
  const observedRowCounts = receipt?.protectedState?.observedRowCounts;
  const protectedStateInvariantsValid = exactKeys(
    minimumRowCounts,
    Object.keys(M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS)
  ) &&
    exactKeys(
      observedRowCounts,
      Object.keys(M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS)
    ) &&
    JSON.stringify(minimumRowCounts) ===
      JSON.stringify(M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS) &&
    Object.entries(M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS).every(
      ([tableName, minimum]) =>
        Number.isSafeInteger(observedRowCounts[tableName]) &&
        observedRowCounts[tableName] >= minimum
    );
  const capturedAt = Date.parse(receipt?.capturedAt ?? "");
  const observationStartedAt = Date.parse(live?.observationStartedAt ?? "");
  const sessionAuthTime = Date.parse(session?.authTime ?? "");
  const sessionCreatedAt = Date.parse(session?.createdAt ?? "");
  if (
    !exactTopLevel ||
    !runtimeBindingShape ||
    !policyShape ||
    !regressionShape ||
    !sourceFilesValid ||
    !regressionDenialsValid ||
    !liveShape ||
    !sessionShape ||
    !attributionShape ||
    !credentialBoundaryShape ||
    !activeMembershipCountsShape ||
    !liveChecksValid ||
    !stateShape ||
    !protectedStateInvariantsValid ||
    !exposureShape ||
    !authorityShape ||
    !redactionShape ||
    receipt?.schemaVersion !== "m1_b_risk_mfa_boundary_receipt.v2" ||
    receipt.candidateReleaseId !== expectedCommitSha ||
    receipt.candidateReleaseId !== boundary.candidateReleaseId ||
    receipt.sourceRuntime !== "local_exact_commit" ||
    !Number.isFinite(capturedAt) ||
    receipt.databaseStartedAt !== expectedDatabaseStartedAt ||
    capturedAt <= Date.parse(expectedDatabaseStartedAt ?? "") ||
    receipt.postRestartVerification !== true ||
    receipt.runtimeBinding.buildSource !== "tracked_git_archive" ||
    !/^sha256:[0-9a-f]{64}$/.test(receipt.runtimeBinding.imageId ?? "") ||
    receipt.runtimeBinding.longLivedPilotImageMatch !== true ||
    receipt.runtimeBinding.longLivedWorkerImageMatch !== true ||
    receipt.runtimeBinding.releaseIdentityArtifactSha256 !==
      expectedReleaseIdentityArtifactSha256 ||
    receipt.role !== "risk_operations" ||
    receipt.status !== "passed_fail_closed" ||
    receipt.releaseLevel !== "L1_PUBLIC_SANDBOX" ||
    receipt.policy.policyVersion !== "security_001.v1" ||
    receipt.policy.requiresRecentMfaActorTypesPreserved !== true ||
    JSON.stringify(receipt.policy.protectedOperationIds) !==
      JSON.stringify(M1_B_RISK_MFA_OPERATION_IDS) ||
    receipt.policy.derivation !==
      "authorization_policy_requires_recent_mfa_for_risk_or_operations" ||
    regression.provenance !== "exact_source_authorization_service" ||
    regression.testName !==
      "SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy" ||
    regression.testCommand !==
      "node --test --test-name-pattern 'SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy' modules/authorization/test/authorization-service.test.js" ||
    !/^[0-9a-f]{64}$/.test(regression.testOutputSha256 ?? "") ||
    JSON.stringify(regression.operationIds) !==
      JSON.stringify(M1_B_RISK_MFA_OPERATION_IDS) ||
    riskMfaPolicyByOperationId.size !== M1_B_RISK_MFA_OPERATION_IDS.length ||
    regression.allowCount !== 0 ||
    regression.resultSha256 !== expectedRegressionResultSha256 ||
    regression.passed !== true ||
    live.provenance !== "local_exact_commit_post_restart" ||
    live.actorType !== ActorType.RISK_OPERATOR ||
    !Number.isFinite(observationStartedAt) ||
    observationStartedAt <= Date.parse(expectedDatabaseStartedAt ?? "") ||
    JSON.stringify(live.operationIds) !==
      JSON.stringify(M1_B_RISK_MFA_LIVE_OPERATION_IDS) ||
    session.actorType !== ActorType.RISK_OPERATOR ||
    session.method !== "siwe" ||
    session.acr !== "urn:ipo.one:acr:wallet" ||
    !Array.isArray(amr) ||
    amr.length !== 3 ||
    amr[0] !== "wallet" ||
    amr[1] !== "siwe" ||
    !ACCEPTED_WALLET_VERIFICATION_METHODS.has(amr[2]) ||
    !Number.isFinite(sessionAuthTime) ||
    !Number.isFinite(sessionCreatedAt) ||
    sessionAuthTime < observationStartedAt ||
    sessionAuthTime > sessionCreatedAt ||
    sessionCreatedAt < observationStartedAt ||
    capturedAt <= sessionCreatedAt ||
    session.observedAfterRestart !== true ||
    session.phishingResistantMfaSatisfied !== false ||
    session.sessionMaterialIncluded !== false ||
    session.syntheticMfaClaimUsed !== false ||
    JSON.stringify(attribution.requiredCapabilities) !==
      JSON.stringify(expectedLiveRequiredCapabilities) ||
    attribution.roleBindingVerified !== true ||
    attribution.policyBindingVerified !== true ||
    attribution.clientBindingVerified !== true ||
    attribution.sessionCredentialMembershipCapabilitiesVerified !== true ||
    attribution.auditCorrelationBindingVerified !== true ||
    attribution.auditSessionTokenBindingVerified !== true ||
    JSON.stringify(credentialBoundary.protectedActorTypes) !==
      JSON.stringify(protectedActorTypes) ||
    JSON.stringify(credentialBoundary.activeMembershipCountsByActorType) !==
      JSON.stringify(expectedActiveMembershipCounts) ||
    !Number.isSafeInteger(credentialBoundary.activeCredentialCount) ||
    credentialBoundary.activeCredentialCount < 1 ||
    JSON.stringify(credentialBoundary.activeAuthenticationMethods) !==
      JSON.stringify(["siwe"]) ||
    credentialBoundary.nonSiweActiveCredentialCount !== 0 ||
    credentialBoundary.reviewedActiveIdentitySetVerified !== true ||
    receipt.protectedState.catalogVersion !== "m1_b_risk_protected_state.v1" ||
    JSON.stringify(receipt.protectedState.tableNames) !==
      JSON.stringify(M1_B_RISK_MFA_PROTECTED_STATE_TABLES) ||
    !/^0x[0-9a-f]{64}$/.test(beforeHash ?? "") ||
    afterHash !== beforeHash ||
    receipt.protectedState.privilegedMutationCount !== 0 ||
    receipt.protectedState.additionalEconomicEffectCount !== 0 ||
    receipt.exposure.evidenceScope !== "local_private_pilot_exact_commit" ||
    JSON.stringify(receipt.exposure.activeRiskAuthenticationMethods) !==
      JSON.stringify(["siwe"]) ||
    receipt.exposure.nonSiweActiveRiskCredentialCount !== 0 ||
    receipt.exposure.hostedRiskSurfaceEvaluated !== false ||
    Object.values(receipt.authority).some((value) => value !== false) ||
    Object.values(receipt.redaction).some((value) => value !== false)
  ) {
    issues.push(
      "Risk MFA boundary receipt does not prove exact SIWE fail-closed policy, denial, state, and exposure truth."
    );
  }
}

export async function verifyM1BCriticalArtifactContents(
  evidence,
  { evidenceRoot, expectedCommitSha }
) {
  const issues = [];
  const canonicalRoot = await realpath(resolve(evidenceRoot));
  const local = evidence.runtime.local;
  const linkage = local.agentAcceptance;
  const releaseArtifact = artifactById(
    evidence,
    local.releaseIdentityArtifactId,
    "release_identity",
    issues
  );
  const releaseIdentity = await readJsonArtifact(releaseArtifact, canonicalRoot, issues);
  if (
    !exactKeys(releaseIdentity, [
      "schemaVersion",
      "releaseId",
      "imageRevision",
      "pilotRevision",
      "workerRevision",
      "postgresBacked",
      "fixtureHost"
    ]) ||
    releaseIdentity?.schemaVersion !== "m1_b_local_release_identity.v1" ||
    !["releaseId", "imageRevision", "pilotRevision", "workerRevision"].every(
      (key) => releaseIdentity?.[key] === expectedCommitSha
    ) ||
    releaseIdentity?.postgresBacked !== true ||
    releaseIdentity?.fixtureHost !== false
  ) issues.push("local release identity artifact does not prove the exact runtime revisions.");

  const beforeArtifact = artifactById(
    evidence,
    linkage.beforeRestart.acceptanceArtifactId,
    "runtime_receipt",
    issues
  );
  const afterArtifact = artifactById(
    evidence,
    linkage.afterRestart.acceptanceArtifactId,
    "runtime_receipt",
    issues
  );
  const applicationArtifact = artifactById(
    evidence,
    linkage.beforeRestart.applicationMcpArtifactId,
    "agent_mcp_receipt",
    issues
  );
  const runtimeArtifact = artifactById(
    evidence,
    linkage.beforeRestart.runtimeMcpArtifactId,
    "agent_mcp_receipt",
    issues
  );
  const recoveryArtifact = artifactById(
    evidence,
    linkage.afterRestart.recoveryReceiptArtifactId,
    "runtime_receipt",
    issues
  );
  const [before, after, applicationMcp, runtimeMcp, recovery] = await Promise.all([
    readJsonArtifact(beforeArtifact, canonicalRoot, issues),
    readJsonArtifact(afterArtifact, canonicalRoot, issues),
    readJsonArtifact(applicationArtifact, canonicalRoot, issues),
    readJsonArtifact(runtimeArtifact, canonicalRoot, issues),
    readJsonArtifact(recoveryArtifact, canonicalRoot, issues)
  ]);
  compareAgentLinkage(before, linkage, "pre-restart acceptance", issues);
  compareAgentLinkage(after, linkage, "post-restart acceptance", issues);
  if (
    before?.schemaVersion !== "local_agent_reference_acceptance.v1" ||
    before.status !== "passed" ||
    before.acceptanceMode !== "before_restart_executed" ||
    before.acceptancePhase !== "before_restart" ||
    before.databaseStartedAt !== linkage.beforeRestart.databaseStartedAt ||
    before.sandboxOnly !== true ||
    before.productionFundsMoved !== false
  ) issues.push("pre-restart acceptance artifact does not prove exact MCP execution.");
  if (
    after?.schemaVersion !== "local_agent_reference_acceptance.v1" ||
    after.status !== "passed" ||
    after.acceptanceMode !== "after_restart_recovered" ||
    after.acceptancePhase !== "after_restart" ||
    after.databaseStartedAt !== linkage.afterRestart.databaseStartedAt ||
    after.sandboxOnly !== true ||
    after.productionFundsMoved !== false ||
    Object.hasOwn(after ?? {}, "lifecycle") ||
    JSON.stringify(after ?? {}).includes("mcpReceipt")
  ) issues.push("post-restart acceptance artifact does not prove recovery-only truth.");
  validateApplicationMcpReceipt(applicationMcp, linkage, issues);
  validateRuntimeMcpReceipt(runtimeMcp, linkage, issues);
  validateRecoveryReceipt(recovery, linkage, issues);
  if (evidence.schemaVersion === "ipo.one.m1-b-p0-5-acceptance-evidence/v2") {
    const humanLinkage = local.humanAcceptance;
    const capitalPartnerLinkage = local.capitalPartnerAcceptance;
    const humanArtifact = artifactById(
      evidence,
      humanLinkage?.artifactId,
      "postgres_receipt",
      issues
    );
    const capitalPartnerArtifact = artifactById(
      evidence,
      capitalPartnerLinkage?.artifactId,
      "postgres_receipt",
      issues
    );
    const [humanReceipt, capitalPartnerReceipt] = await Promise.all([
      readJsonArtifact(humanArtifact, canonicalRoot, issues),
      readJsonArtifact(capitalPartnerArtifact, canonicalRoot, issues)
    ]);
    validateHumanCriticalReceipt(
      humanReceipt,
      humanLinkage ?? {},
      expectedCommitSha,
      linkage.afterRestart.databaseStartedAt,
      issues
    );
    validateCapitalPartnerCriticalReceipt(
      capitalPartnerReceipt,
      capitalPartnerLinkage ?? {},
      expectedCommitSha,
      linkage.afterRestart.databaseStartedAt,
      humanReceipt,
      issues
    );
    const riskArtifact = artifactById(
      evidence,
      evidence.riskBoundary?.artifactId,
      "negative_receipt",
      issues
    );
    const riskReceipt = await readJsonArtifact(
      riskArtifact,
      canonicalRoot,
      issues
    );
    validateRiskBoundaryReceipt(
      riskReceipt,
      evidence.riskBoundary,
      expectedCommitSha,
      linkage.afterRestart.databaseStartedAt,
      releaseArtifact?.sha256,
      issues
    );
  }
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}

export function verifyM1BCurrentGitSource(
  evidence,
  expectedCommitSha,
  {
    root,
    git = (args) => execFileSync("git", args, {
      cwd: root,
      encoding: "utf8"
    }).trim()
  }
) {
  const head = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", `${head}^{tree}`]);
  const trackedStatus = git([
    "status",
    "--porcelain=v1",
    "--untracked-files=no"
  ]);
  const issues = [];
  if (head !== expectedCommitSha) {
    issues.push(`Current Git HEAD ${head} does not match ${expectedCommitSha}.`);
  }
  if (evidence.source.commitSha !== head) {
    issues.push("evidence.source.commitSha does not match current Git HEAD.");
  }
  if (evidence.source.treeSha !== tree) {
    issues.push("evidence.source.treeSha does not match the current Git tree.");
  }
  if (trackedStatus !== "") {
    issues.push("Current tracked Git worktree is not clean.");
  }
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}
