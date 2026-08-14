import { randomBytes } from "node:crypto";
import { chmod, link, lstat, unlink, writeFile } from "node:fs/promises";
import { hashId } from "../packages/domain/src/index.js";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const PHASES = Object.freeze({
  before_restart: "before_restart_executed",
  after_restart: "after_restart_recovered"
});
const PHASE_ARTIFACT_IDS = Object.freeze({
  before_restart: Object.freeze([
    "application_handoff",
    "offer_receipt",
    "runtime_handoff",
    "lifecycle_result",
    "mcp_receipt",
    "agent_foreign_offer_setup"
  ]),
  after_restart: Object.freeze([
    "application_handoff",
    "offer_receipt",
    "runtime_handoff",
    "canonical_recovery",
    "recovery_receipt"
  ])
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function iso(value, name) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("agent_phase_receipt_invalid", `${name} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function artifact(value, name) {
  if (
    !exactKeys(value, ["id", "relativePath", "sha256"]) ||
    !IDENTIFIER.test(value.id ?? "") ||
    typeof value.relativePath !== "string" ||
    value.relativePath === "" ||
    value.relativePath.startsWith("/") ||
    value.relativePath.split(/[\\/]/).includes("..") ||
    !SHA256.test(value.sha256 ?? "")
  ) fail("agent_phase_receipt_invalid", `${name} binding is invalid`);
  return Object.freeze({ ...value });
}

function timedArtifact(value, name) {
  if (!exactKeys(value, ["id", "relativePath", "sha256", "completedAt"])) {
    fail("agent_phase_receipt_invalid", `${name} binding is invalid`);
  }
  const binding = artifact({
    id: value.id,
    relativePath: value.relativePath,
    sha256: value.sha256
  }, name);
  return Object.freeze({
    ...binding,
    completedAt: iso(value.completedAt, `${name} completedAt`)
  });
}

const FOREIGN_APPLICATION_OPERATIONS = Object.freeze([
  Object.freeze(["ipo_one_read_self", "pilotReadAgentSelf"]),
  Object.freeze(["ipo_one_request_credit", "pilotRequestCredit"]),
  Object.freeze(["ipo_one_read_credit_application", "pilotReadCreditApplication"]),
  Object.freeze(["ipo_one_evaluate_credit_application", "pilotEvaluateCreditApplication"])
]);

export function validateM1BAgentForeignOfferSetupReceipt(receipt, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId
} = {}) {
  if (!exactKeys(receipt, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "sourceTreeHash",
    "runtimeImageId",
    "runtimeImageRevision",
    "databaseStartedAt",
    "createdBeforeRestartAt",
    "applicationMcp",
    "references",
    "ownershipProof",
    "offer",
    "lifecycleAbsence",
    "canonicalMandateStatusAtSetup",
    "applicationOnly",
    "lifecycleContinuationPerformed",
    "sandboxOnly",
    "productionFundsMoved",
    "fixtureUsed",
    "redaction"
  ])) fail("agent_foreign_offer_setup_invalid", "Foreign Agent Offer setup receipt shape is invalid");
  const databaseStart = iso(receipt.databaseStartedAt, "foreign setup databaseStartedAt");
  const completedAt = iso(receipt.createdBeforeRestartAt, "foreign setup createdBeforeRestartAt");
  const application = receipt.applicationMcp;
  const references = receipt.references;
  const ownership = receipt.ownershipProof;
  const offer = receipt.offer;
  const absence = receipt.lifecycleAbsence;
  const expectedWorkflowId = `m1b-agent-foreign-offer-${receipt.candidateReleaseId}`;
  if (
    receipt.schemaVersion !== "m1_b_agent_foreign_offer_setup_receipt.v1" ||
    receipt.status !== "offered" ||
    !SHA.test(receipt.candidateReleaseId ?? "") ||
    !SHA.test(receipt.sourceTreeHash ?? "") ||
    !IMAGE_ID.test(receipt.runtimeImageId ?? "") ||
    receipt.runtimeImageRevision !== receipt.candidateReleaseId ||
    Date.parse(completedAt) < Date.parse(databaseStart) ||
    !exactKeys(application, [
      "schemaVersion", "status", "transportProfile", "workflowId",
      "correlationId", "operationCount", "operations", "nonAuthorizing",
      "fundsAuthority", "credentialsIncluded", "remoteMcpEnabled"
    ]) ||
    application.schemaVersion !== "agent_credit_offer_workflow_receipt.v1" ||
    application.status !== "offer_ready" ||
    application.transportProfile !== "mcp_stdio_local" ||
    application.workflowId !== expectedWorkflowId ||
    !IDENTIFIER.test(application.correlationId ?? "") ||
    application.operationCount !== FOREIGN_APPLICATION_OPERATIONS.length ||
    !Array.isArray(application.operations) ||
    application.operations.length !== FOREIGN_APPLICATION_OPERATIONS.length ||
    application.nonAuthorizing !== true ||
    application.fundsAuthority !== false ||
    application.credentialsIncluded !== false ||
    application.remoteMcpEnabled !== false ||
    !exactKeys(references, [
      "agentActorId", "subjectId", "canonicalMandateId", "mandateId",
      "creditIntentId", "riskDecisionId", "creditOfferId"
    ]) ||
    Object.values(references).some((value) => !IDENTIFIER.test(value ?? "")) ||
    references.canonicalMandateId === references.mandateId ||
    !exactKeys(ownership, [
      "agentActorRefHash", "membershipRefHash", "resourceManifestHash",
      "ownedResources", "activeAgentOwnership"
    ]) ||
    !HASH.test(ownership.agentActorRefHash ?? "") ||
    !HASH.test(ownership.membershipRefHash ?? "") ||
    !HASH.test(ownership.resourceManifestHash ?? "") ||
    ownership.activeAgentOwnership !== true ||
    !Array.isArray(ownership.ownedResources) ||
    ownership.ownedResources.length !== 4 ||
    !exactKeys(offer, [
      "creditOfferHash", "termsHash", "disclosureRef", "status",
      "schemaVersion", "validUntil", "acceptedAt", "sandboxOnly",
      "productionFundsApproved"
    ]) ||
    !HASH.test(offer.creditOfferHash ?? "") ||
    !HASH.test(offer.termsHash ?? "") ||
    !IDENTIFIER.test(offer.disclosureRef ?? "") ||
    offer.status !== "offered" ||
    offer.schemaVersion !== "credit_offer.v1" ||
    offer.acceptedAt !== null ||
    offer.sandboxOnly !== true ||
    offer.productionFundsApproved !== false ||
    !Number.isFinite(Date.parse(offer.validUntil ?? "")) ||
    Date.parse(offer.validUntil) <= Date.parse(completedAt) ||
    !exactKeys(absence, [
      "acceptanceCount", "obligationCount", "executionCount",
      "repaymentCount", "ledgerTransactionCount"
    ]) ||
    Object.values(absence).some((value) => value !== 0) ||
    receipt.canonicalMandateStatusAtSetup !== "draft" ||
    receipt.applicationOnly !== true ||
    receipt.lifecycleContinuationPerformed !== false ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsMoved !== false ||
    receipt.fixtureUsed !== false ||
    !exactKeys(receipt.redaction, [
      "containsSecrets", "containsRawPii", "containsSessionMaterial",
      "containsSignatures"
    ]) ||
    Object.values(receipt.redaction).some((value) => value !== false)
  ) fail("agent_foreign_offer_setup_invalid", "Foreign Agent Offer setup receipt truth is invalid");
  const resourceContract = [
    ["subject", "subject", references.subjectId],
    ["mandate", "subject", references.mandateId],
    ["credit_intent", "owner", references.creditIntentId],
    ["credit_offer", "owner", references.creditOfferId]
  ];
  if (application.operations.some((operation, index) => {
    const [tool, operationId] = FOREIGN_APPLICATION_OPERATIONS[index];
    return !exactKeys(operation, [
      "sequence", "tool", "operationId", "requestId", "replayed",
      "responseSchemaVersion"
    ]) || operation.sequence !== index + 1 || operation.tool !== tool ||
      operation.operationId !== operationId ||
      operation.requestId !== `request_agent_offer:${expectedWorkflowId}:${String(index + 1).padStart(2, "0")}` ||
      typeof operation.replayed !== "boolean" ||
      !IDENTIFIER.test(operation.responseSchemaVersion ?? "");
  }) || ownership.ownedResources.some((resource, index) => {
    const [resourceType, relationship, resourceId] = resourceContract[index];
    return !exactKeys(resource, [
      "resourceType", "resourceRefHash", "relationship", "resourceVersion",
      "bindingVersion", "status"
    ]) || resource.resourceType !== resourceType ||
      resource.relationship !== relationship ||
      resource.resourceRefHash !== hashId(
        "m1_b_agent_foreign_offer_resource_reference",
        { resourceType, resourceId }
      ) ||
      !Number.isSafeInteger(resource.resourceVersion) || resource.resourceVersion < 1 ||
      !Number.isSafeInteger(resource.bindingVersion) || resource.bindingVersion < 1 ||
      resource.status !== "active";
  }) || ownership.agentActorRefHash !== hashId(
    "m1_b_agent_foreign_offer_actor_reference",
    { actorId: references.agentActorId }
  ) || ownership.resourceManifestHash !== hashId(
    "m1_b_agent_foreign_offer_resource_manifest",
    ownership.ownedResources
  )) fail("agent_foreign_offer_setup_invalid", "Foreign Agent Offer setup operation or ownership proof is invalid");
  if (
    candidateReleaseId !== undefined && receipt.candidateReleaseId !== candidateReleaseId ||
    sourceTreeHash !== undefined && receipt.sourceTreeHash !== sourceTreeHash ||
    runtimeImageId !== undefined && receipt.runtimeImageId !== runtimeImageId
  ) fail("agent_foreign_offer_setup_invalid", "Foreign Agent Offer setup candidate binding is invalid");
  return Object.freeze({
    ...receipt,
    databaseStartedAt: databaseStart,
    createdBeforeRestartAt: completedAt
  });
}

export function createM1BAgentForeignOfferSetupReceipt(input) {
  return validateM1BAgentForeignOfferSetupReceipt({
    ...input,
    schemaVersion: "m1_b_agent_foreign_offer_setup_receipt.v1",
    status: "offered",
    runtimeImageRevision: input.candidateReleaseId,
    canonicalMandateStatusAtSetup: "draft",
    applicationOnly: true,
    lifecycleContinuationPerformed: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    fixtureUsed: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      containsSignatures: false
    })
  });
}

export function validateM1BAgentPhaseReceipt(receipt, {
  candidateReleaseId,
  runtimeImageId,
  acceptancePhase,
  databaseStartedAt
} = {}) {
  if (!exactKeys(receipt, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "acceptancePhase",
    "acceptanceMode",
    "runtimeImageId",
    "runtimeImageRevision",
    "databaseStartedAt",
    "startedAt",
    "completedAt",
    "acceptanceArtifact",
    "foreignOfferSetupArtifact",
    "extractedArtifacts",
    "producerOwnedClock",
    "recoveryOnly",
    "sandboxOnly",
    "productionFundsMoved",
    "redaction"
  ])) fail("agent_phase_receipt_invalid", "Agent phase receipt shape is invalid");
  const phase = receipt.acceptancePhase;
  const startedAt = iso(receipt.startedAt, "startedAt");
  const completedAt = iso(receipt.completedAt, "completedAt");
  const databaseStart = iso(receipt.databaseStartedAt, "databaseStartedAt");
  const acceptanceBinding = artifact(receipt.acceptanceArtifact, "acceptance artifact");
  const foreignOfferSetupBinding = timedArtifact(
    receipt.foreignOfferSetupArtifact,
    "foreign Offer setup artifact"
  );
  if (
    receipt.schemaVersion !== "m1_b_agent_acceptance_phase_receipt.v2" ||
    receipt.status !== "passed" ||
    !Object.hasOwn(PHASES, phase) ||
    receipt.acceptanceMode !== PHASES[phase] ||
    !SHA.test(receipt.candidateReleaseId ?? "") ||
    receipt.runtimeImageRevision !== receipt.candidateReleaseId ||
    !IMAGE_ID.test(receipt.runtimeImageId ?? "") ||
    Date.parse(startedAt) >= Date.parse(completedAt) ||
    receipt.producerOwnedClock !== true ||
    receipt.recoveryOnly !== (phase === "after_restart") ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsMoved !== false ||
    !exactKeys(receipt.redaction, [
      "containsSecrets",
      "containsRawPii",
      "containsSessionMaterial",
      "containsSignatures"
    ]) ||
    Object.values(receipt.redaction).some((value) => value !== false) ||
    acceptanceBinding.id !== (phase === "before_restart" ? "agent_before" : "agent_after") ||
    foreignOfferSetupBinding.id !== "agent_foreign_offer_setup" ||
    !Array.isArray(receipt.extractedArtifacts) ||
    receipt.extractedArtifacts.length !== PHASE_ARTIFACT_IDS[phase]?.length
  ) fail("agent_phase_receipt_invalid", "Agent phase receipt truth is invalid");
  if (
    phase === "before_restart" &&
    Date.parse(foreignOfferSetupBinding.completedAt) < Date.parse(databaseStart)
  ) {
    fail(
      "agent_phase_receipt_invalid",
      "Foreign Offer setup predates the pre-restart PostgreSQL generation"
    );
  }
  if (
    phase === "after_restart" &&
    Date.parse(foreignOfferSetupBinding.completedAt) >= Date.parse(databaseStart)
  ) {
    fail(
      "agent_phase_receipt_invalid",
      "Foreign Offer setup does not predate the post-restart PostgreSQL generation"
    );
  }
  const extracted = receipt.extractedArtifacts.map((entry, index) =>
    artifact(entry, `extracted artifact ${index + 1}`)
  );
  if (
    new Set(extracted.map(({ id }) => id)).size !== extracted.length ||
    new Set(extracted.map(({ relativePath }) => relativePath)).size !== extracted.length ||
    extracted.map(({ id }) => id).join("\0") !== PHASE_ARTIFACT_IDS[phase].join("\0") ||
    (phase === "before_restart" && (
      extracted.at(-1).id !== foreignOfferSetupBinding.id ||
      extracted.at(-1).relativePath !== foreignOfferSetupBinding.relativePath ||
      extracted.at(-1).sha256 !== foreignOfferSetupBinding.sha256
    )) ||
    (candidateReleaseId !== undefined && receipt.candidateReleaseId !== candidateReleaseId) ||
    (runtimeImageId !== undefined && receipt.runtimeImageId !== runtimeImageId) ||
    (acceptancePhase !== undefined && phase !== acceptancePhase) ||
    (databaseStartedAt !== undefined && databaseStart !== iso(databaseStartedAt, "expected databaseStartedAt"))
  ) fail("agent_phase_receipt_invalid", "Agent phase receipt context is invalid");
  return Object.freeze({
    ...receipt,
    startedAt,
    completedAt,
    databaseStartedAt: databaseStart,
    acceptanceArtifact: acceptanceBinding,
    foreignOfferSetupArtifact: foreignOfferSetupBinding,
    extractedArtifacts: Object.freeze(extracted)
  });
}

export function createM1BAgentPhaseArtifactPlan({
  acceptancePhase,
  acceptance,
  foreignOfferSetupReceipt
}) {
  if (!Object.hasOwn(PHASE_ARTIFACT_IDS, acceptancePhase)) {
    fail("agent_phase_receipt_invalid", "Agent phase artifact plan phase is invalid");
  }
  const candidates = [
    {
      property: "applicationHandoffPath",
      suffix: "application-handoff",
      value: acceptance?.applicationHandoff
    },
    {
      property: "offerReceiptPath",
      suffix: "offer-receipt",
      value: acceptance?.offerReceipt
    },
    {
      property: "runtimeHandoffPath",
      suffix: "runtime-handoff",
      value: acceptance?.runtimeHandoff
    },
    {
      property: "lifecycleResultPath",
      suffix: "lifecycle-result",
      value: acceptance?.lifecycle
    },
    {
      property: "canonicalRecoveryPath",
      suffix: "canonical-recovery",
      value: acceptance?.canonicalRecovery
    },
    {
      property: "mcpReceiptPath",
      suffix: "mcp-receipt",
      value: acceptance?.lifecycle?.mcpReceipt
    },
    {
      property: "recoveryReceiptPath",
      suffix: "recovery-receipt",
      value: acceptance?.recoveryReceipt
    },
    {
      property: "foreignOfferSetupPath",
      suffix: "agent-foreign-offer-setup",
      value: acceptancePhase === "before_restart"
        ? foreignOfferSetupReceipt
        : undefined
    }
  ].filter(({ value }) => value !== undefined);
  const ids = candidates.map(({ suffix }) => suffix.replaceAll("-", "_"));
  if (ids.join("\0") !== PHASE_ARTIFACT_IDS[acceptancePhase].join("\0")) {
    fail(
      "agent_phase_receipt_invalid",
      "Agent phase artifact plan does not match the closed phase contract"
    );
  }
  return Object.freeze(candidates.map((entry) => Object.freeze(entry)));
}

export function createM1BAgentPhaseReceipt(input) {
  return validateM1BAgentPhaseReceipt({
    schemaVersion: "m1_b_agent_acceptance_phase_receipt.v2",
    status: "passed",
    candidateReleaseId: input.candidateReleaseId,
    acceptancePhase: input.acceptancePhase,
    acceptanceMode: input.acceptanceMode,
    runtimeImageId: input.runtimeImageId,
    runtimeImageRevision: input.candidateReleaseId,
    databaseStartedAt: input.databaseStartedAt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    acceptanceArtifact: input.acceptanceArtifact,
    foreignOfferSetupArtifact: input.foreignOfferSetupArtifact,
    extractedArtifacts: input.extractedArtifacts,
    producerOwnedClock: true,
    recoveryOnly: input.acceptancePhase === "after_restart",
    sandboxOnly: true,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      containsSignatures: false
    })
  });
}

export function m1BAgentPhaseJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function assertM1BAgentPhaseTargetAbsent(path) {
  try {
    await lstat(path);
    fail("agent_phase_receipt_exists", "Refused to overwrite the sealed Agent phase receipt");
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

export async function writeM1BAgentPhaseArtifactSetNonOverwriting(entries) {
  if (
    !Array.isArray(entries) || entries.length < 1 || entries.length > 10 ||
    entries.some((entry) =>
      !exactKeys(entry, ["path", "bytes"]) ||
      typeof entry.path !== "string" || entry.path === "" ||
      !Buffer.isBuffer(entry.bytes) || entry.bytes.length === 0
    ) ||
    new Set(entries.map(({ path }) => path)).size !== entries.length
  ) fail("agent_phase_artifact_set_invalid", "Agent phase artifact set is invalid");

  for (const { path } of entries) await assertM1BAgentPhaseTargetAbsent(path);

  const nonce = `${process.pid}.${randomBytes(8).toString("hex")}`;
  const staged = entries.map((entry, index) => ({
    ...entry,
    temporaryPath: `${entry.path}.${nonce}.${index}.tmp`
  }));
  const linked = [];
  try {
    for (const entry of staged) {
      await writeFile(entry.temporaryPath, entry.bytes, {
        flag: "wx",
        mode: 0o600
      });
    }
    for (const entry of staged) {
      await link(entry.temporaryPath, entry.path);
      linked.push(entry.path);
    }
    for (const entry of staged) await unlink(entry.temporaryPath);
    for (const { path } of entries) await chmod(path, 0o600);
  } catch (error) {
    for (const path of linked.reverse()) {
      try { await unlink(path); } catch { /* Preserve the first failure. */ }
    }
    for (const { temporaryPath } of staged) {
      try { await unlink(temporaryPath); } catch { /* Preserve the first failure. */ }
    }
    if (error?.code === "EEXIST") {
      fail("agent_phase_receipt_exists", "Refused to overwrite a sealed Agent phase artifact");
    }
    throw error;
  }

  for (const { path } of entries) {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
      fail("agent_phase_receipt_write_invalid", "Agent phase artifact was not sealed as a regular 0600 file");
    }
  }
  return Object.freeze(entries.map(({ path }) => path));
}

export async function writeM1BAgentPhaseReceiptNonOverwriting(path, receipt) {
  validateM1BAgentPhaseReceipt(receipt);
  await writeM1BAgentPhaseArtifactSetNonOverwriting([
    { path, bytes: m1BAgentPhaseJsonBytes(receipt) }
  ]);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
    fail("agent_phase_receipt_write_invalid", "Agent phase receipt was not sealed as a regular 0600 file");
  }
  return path;
}
