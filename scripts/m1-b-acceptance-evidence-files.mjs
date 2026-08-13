import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { M1BAcceptanceEvidenceError } from "../packages/release-governance/src/m1-b-acceptance-evidence.js";

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;

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
