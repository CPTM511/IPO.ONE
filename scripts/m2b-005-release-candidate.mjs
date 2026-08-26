import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../modules/authentication/src/strict-json.js";

const execFileAsync = promisify(execFile);

export const M2B005_CANDIDATE_FILE = "deploy/releases/m2b-005-v0.2.1-candidate.json";
export const M2B005_SCHEMA_VERSION = "m2b_005_v0_2_1_candidate.v1";
export const M2B005_RELEASE_VERSION = "0.2.1-rc.1";

const MAXIMUM_CANDIDATE_BYTES = 96 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CANDIDATE_ID = /^M2B-005-V0\.2\.1-RC-[0-9]{8}-[0-9]{3}$/;

const STACK = new Map([
  ["M2B-001", { commitSha: "2e27c35d09530404a2eea9b35168abcbb7306cbc", pullRequest: 54 }],
  ["M2B-002", { commitSha: "944f344196f6a63a86ba817d750d466b09887142", pullRequest: 55 }],
  ["M2B-003", { commitSha: "b7cb70d2facc749c01a40ece6e0261a8bfac6667", pullRequest: 56 }],
  ["M2B-004", { commitSha: "5f7a4143f54fb3e15d392fa04fa217dd230870e3", pullRequest: 57 }]
]);

const REQUIRED_EVIDENCE = new Set([
  "m2b_002_prewrite",
  "m2b_003_recovery",
  "m2b_004_terminal",
  "m2a_009_candidate",
  "base_pool_signer_closure",
  "venue_signer_closure"
]);

const EXCLUDED_AUTHORITY = new Set([
  "remote_deployment",
  "production_deployment",
  "mainnet",
  "real_funds",
  "custody",
  "human_cash_lending",
  "kyc",
  "agent_venue_write",
  "pool_write",
  "new_chain_transaction",
  "signer_reuse",
  "transfer",
  "withdrawal",
  "automatic_unfreeze"
]);

const KEYS = Object.freeze({
  candidate: new Set([
    "schemaVersion", "candidateId", "releaseVersion", "releaseCommitSha",
    "stack", "database", "evidence", "historicalTestnet", "signerSafety",
    "recovery", "verification", "productTruth", "rollback", "excludedAuthority"
  ]),
  stack: new Set(["issueId", "commitSha", "pullRequest", "state"]),
  database: new Set([
    "migrationCount", "latestMigration", "forcedRlsRequired", "destructiveMigrationPresent"
  ]),
  evidence: new Set(["kind", "path", "sha256"]),
  historicalTestnet: new Set([
    "chainId", "poolAddress", "adapterAddress", "historicalM2AOnly",
    "m2bDeployed", "newTransactionPerformed"
  ]),
  signerSafety: new Set([
    "newSignerCreated", "signerLoaded", "signerReused", "signingPerformed",
    "priorSignersRetired", "addressReuseAllowed"
  ]),
  recovery: new Set([
    "drillMode", "externalWriteAuthorized", "newRiskFrozenOnFailure",
    "canonicalLossPreserved", "restartReplayPreserved", "automaticUnfreeze"
  ]),
  verification: new Set([
    "repositoryPassed", "postgresPassed", "securityPassed", "transportPassed",
    "contractsPassed", "browserPassed", "agentPassed", "recoveryPassed",
    "unresolvedM2B005P0P1", "independentReview", "founderCandidateDecision"
  ]),
  productTruth: new Set(["code", "runtime", "deployed", "reachable", "verified", "verdict"]),
  rollback: new Set([
    "disableProfile", "preserveEvidence", "readOnlyReconcile",
    "retryUnknownOutcome", "reuseRetiredSigner"
  ])
});

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function exactObject(name, value, keys) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.size ||
    Object.keys(value).some((key) => !keys.has(key))
  ) fail("invalid_m2b005_candidate", `${name} must use the exact closed contract`);
  return value;
}

function exact(name, value, expected) {
  if (value !== expected) fail("m2b005_candidate_drift", `${name} does not match the release contract`);
}

function exactSet(name, values, expected) {
  if (
    !Array.isArray(values) || values.length !== expected.size ||
    new Set(values).size !== values.length || values.some((value) => !expected.has(value))
  ) fail("invalid_m2b005_candidate", `${name} must contain the exact closed set`);
}

export function validateM2B005Candidate(candidate, { expectedCommitSha } = {}) {
  exactObject("candidate", candidate, KEYS.candidate);
  exact("schemaVersion", candidate.schemaVersion, M2B005_SCHEMA_VERSION);
  if (!CANDIDATE_ID.test(candidate.candidateId ?? "")) {
    fail("invalid_m2b005_candidate", "candidateId is invalid");
  }
  exact("releaseVersion", candidate.releaseVersion, M2B005_RELEASE_VERSION);
  if (!SHA.test(candidate.releaseCommitSha ?? "")) {
    fail("invalid_m2b005_candidate", "releaseCommitSha is invalid");
  }
  if (expectedCommitSha !== undefined) exact("releaseCommitSha", candidate.releaseCommitSha, expectedCommitSha);

  if (!Array.isArray(candidate.stack) || candidate.stack.length !== STACK.size) {
    fail("invalid_m2b005_candidate", "exact M2B stack is required");
  }
  const seenIssues = new Set();
  for (const item of candidate.stack) {
    exactObject("stack item", item, KEYS.stack);
    const expected = STACK.get(item.issueId);
    if (!expected || seenIssues.has(item.issueId)) {
      fail("invalid_m2b005_candidate", "stack issues must be unique and closed");
    }
    seenIssues.add(item.issueId);
    exact(`${item.issueId}.commitSha`, item.commitSha, expected.commitSha);
    exact(`${item.issueId}.pullRequest`, item.pullRequest, expected.pullRequest);
    exact(`${item.issueId}.state`, item.state, "DRAFT_STACKED_LOCAL");
  }

  const database = exactObject("database", candidate.database, KEYS.database);
  exact("migrationCount", database.migrationCount, 68);
  exact("latestMigration", database.latestMigration, "0068_m2b_dual_risk_recovery");
  exact("forcedRlsRequired", database.forcedRlsRequired, true);
  exact("destructiveMigrationPresent", database.destructiveMigrationPresent, false);

  if (!Array.isArray(candidate.evidence) || candidate.evidence.length !== REQUIRED_EVIDENCE.size) {
    fail("invalid_m2b005_candidate", "exact Evidence bindings are required");
  }
  const kinds = new Set();
  const paths = new Set();
  for (const binding of candidate.evidence) {
    exactObject("Evidence binding", binding, KEYS.evidence);
    if (
      !REQUIRED_EVIDENCE.has(binding.kind) || kinds.has(binding.kind) || paths.has(binding.path) ||
      !/^(artifacts|deploy\/releases|docs\/codex\/audits)\/[A-Za-z0-9._/-]+\.(json|md)$/.test(binding.path ?? "") ||
      !SHA256.test(binding.sha256 ?? "")
    ) fail("invalid_m2b005_candidate", "Evidence binding is invalid or duplicated");
    kinds.add(binding.kind);
    paths.add(binding.path);
  }
  exactSet("Evidence kinds", [...kinds], REQUIRED_EVIDENCE);

  const historical = exactObject("historicalTestnet", candidate.historicalTestnet, KEYS.historicalTestnet);
  exact("chainId", historical.chainId, "eip155:84532");
  exact("poolAddress", historical.poolAddress, "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da");
  exact("adapterAddress", historical.adapterAddress, "0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19");
  exact("historicalM2AOnly", historical.historicalM2AOnly, true);
  exact("m2bDeployed", historical.m2bDeployed, false);
  exact("newTransactionPerformed", historical.newTransactionPerformed, false);

  const signer = exactObject("signerSafety", candidate.signerSafety, KEYS.signerSafety);
  exact("newSignerCreated", signer.newSignerCreated, false);
  exact("signerLoaded", signer.signerLoaded, false);
  exact("signerReused", signer.signerReused, false);
  exact("signingPerformed", signer.signingPerformed, false);
  exact("priorSignersRetired", signer.priorSignersRetired, true);
  exact("addressReuseAllowed", signer.addressReuseAllowed, false);

  const recovery = exactObject("recovery", candidate.recovery, KEYS.recovery);
  exact("drillMode", recovery.drillMode, "DETERMINISTIC_LOCAL_NO_NETWORK");
  exact("externalWriteAuthorized", recovery.externalWriteAuthorized, false);
  exact("newRiskFrozenOnFailure", recovery.newRiskFrozenOnFailure, true);
  exact("canonicalLossPreserved", recovery.canonicalLossPreserved, true);
  exact("restartReplayPreserved", recovery.restartReplayPreserved, true);
  exact("automaticUnfreeze", recovery.automaticUnfreeze, false);

  const verification = exactObject("verification", candidate.verification, KEYS.verification);
  for (const key of [
    "repositoryPassed", "postgresPassed", "securityPassed", "transportPassed",
    "contractsPassed", "browserPassed", "agentPassed", "recoveryPassed"
  ]) exact(key, verification[key], true);
  exact("unresolvedM2B005P0P1", verification.unresolvedM2B005P0P1, 0);
  exact("independentReview", verification.independentReview, "PENDING");
  exact("founderCandidateDecision", verification.founderCandidateDecision, "PENDING");

  const truth = exactObject("productTruth", candidate.productTruth, KEYS.productTruth);
  exact("code", truth.code, "EXACT_SHA_IMPLEMENTED");
  exact("runtime", truth.runtime, "LOCAL_EXACT_SHA");
  exact("deployed", truth.deployed, "M2B_NOT_REMOTELY_DEPLOYED");
  exact("reachable", truth.reachable, "LOOPBACK_ONLY");
  exact("verified", truth.verified, "LOCAL_BROWSER_AGENT_RECOVERY");
  exact("verdict", truth.verdict, "BLOCKED — NOT COMPLETE");

  const rollback = exactObject("rollback", candidate.rollback, KEYS.rollback);
  exact("disableProfile", rollback.disableProfile, true);
  exact("preserveEvidence", rollback.preserveEvidence, true);
  exact("readOnlyReconcile", rollback.readOnlyReconcile, true);
  exact("retryUnknownOutcome", rollback.retryUnknownOutcome, false);
  exact("reuseRetiredSigner", rollback.reuseRetiredSigner, false);
  exactSet("excludedAuthority", candidate.excludedAuthority, EXCLUDED_AUTHORITY);

  return Object.freeze({
    status: "LOCAL_CANDIDATE_VALID",
    verdict: truth.verdict,
    candidateId: candidate.candidateId,
    releaseVersion: candidate.releaseVersion,
    releaseCommitSha: candidate.releaseCommitSha,
    evidenceCount: candidate.evidence.length,
    externalWriteAuthorized: false,
    m2bDeployed: false,
    mainnetAuthorized: false,
    realFundsAuthorized: false
  });
}

export async function readM2B005Candidate(file, options = {}) {
  const path = resolve(file);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAXIMUM_CANDIDATE_BYTES) {
    fail("invalid_m2b005_candidate_file", "candidate must be one bounded regular file");
  }
  const candidate = parseStrictJson(await readFile(path, "utf8"), {
    maximumBytes: MAXIMUM_CANDIDATE_BYTES,
    maximumDepth: 18,
    maximumKeys: 512
  });
  validateM2B005Candidate(candidate, options);
  return candidate;
}

function evidencePath(root, relativePath) {
  const allowedRoots = ["artifacts", "deploy/releases", "docs/codex/audits"].map((item) => resolve(root, item));
  const path = resolve(root, relativePath);
  if (!allowedRoots.some((allowed) => path === allowed || path.startsWith(`${allowed}${sep}`))) {
    fail("invalid_m2b005_evidence_path", "Evidence escaped the reviewed roots");
  }
  return path;
}

function assertEvidenceSemantics(kind, text) {
  if (kind === "m2b_004_terminal") {
    const evidence = parseStrictJson(text, { maximumBytes: 1024 * 1024, maximumDepth: 24, maximumKeys: 4096 });
    if (
      evidence.issueId !== "M2B-004" || evidence.terminal?.creditOutcomeStatus !== "FINALIZED" ||
      evidence.terminal?.sharedCreditStateStatus !== "PROJECTED" ||
      evidence.terminal?.creditStateAuthorizing !== false ||
      evidence.partialLoss?.creditOutcomeStatus !== "PENDING_TERMINAL" ||
      evidence.partialLoss?.outstandingPrincipalMinor === "0" ||
      evidence.assertions?.externalNetworkCalled !== false ||
      evidence.assertions?.realFundsMoved !== false
    ) fail("invalid_m2b005_evidence", "M2B-004 terminal Evidence drifted or expands authority");
  } else if (kind === "m2a_009_candidate") {
    const evidence = parseStrictJson(text, { maximumBytes: 1024 * 1024, maximumDepth: 24, maximumKeys: 4096 });
    if (
      evidence.releaseVersion !== "0.2.0-rc.1" || evidence.chain?.chainId !== "eip155:84532" ||
      evidence.chain?.testAssetsOnly !== true || evidence.chain?.transactionPrimitivePresent !== false ||
      !evidence.excludedAuthority?.includes("production_deployment")
    ) fail("invalid_m2b005_evidence", "historical M2A candidate is not bounded read-only Testnet truth");
  } else if (kind === "venue_signer_closure") {
    const evidence = parseStrictJson(text, { maximumBytes: 1024 * 1024, maximumDepth: 24, maximumKeys: 4096 });
    if (
      evidence.decision !== "VERIFIED_TESTNET_CLOSED" || evidence.signerRetirement?.state !== "RETIRED" ||
      evidence.signerRetirement?.addressReuseAllowed !== false ||
      evidence.signerRetirement?.keyLogicallyDestroyed !== true ||
      evidence.safety?.realFundsAuthority !== false || evidence.safety?.mainnetAuthority !== false
    ) fail("invalid_m2b005_evidence", "venue signer closure is not terminal and non-reusable");
  } else if (kind === "base_pool_signer_closure") {
    if (!text.includes("one-use signer was destroyed") || !text.includes("neither its destroyed signer")) {
      fail("invalid_m2b005_evidence", "Base Pool signer closure attestation drifted");
    }
  } else if (kind === "m2b_002_prewrite") {
    if (!text.includes("BLOCKED — NOT COMPLETE") || !text.includes("externalNonceAllocated=false")) {
      fail("invalid_m2b005_evidence", "M2B-002 no-write boundary drifted");
    }
  } else if (kind === "m2b_003_recovery") {
    if (!text.includes("BLOCKED — NOT COMPLETE") || !text.includes("automatic movement to a less restrictive state fails")) {
      fail("invalid_m2b005_evidence", "M2B-003 recovery STOP boundary drifted");
    }
  }
}

export async function verifyM2B005Evidence(candidate, { root = process.cwd() } = {}) {
  const receipts = [];
  for (const binding of candidate.evidence) {
    const path = evidencePath(root, binding.path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 4 * 1024 * 1024) {
      fail("invalid_m2b005_evidence_file", `${binding.kind} must be one bounded regular file`);
    }
    const bytes = await readFile(path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== binding.sha256) fail("m2b005_evidence_digest_mismatch", `${binding.kind} Evidence drifted`);
    assertEvidenceSemantics(binding.kind, bytes.toString("utf8"));
    receipts.push(Object.freeze({ kind: binding.kind, path: binding.path, sha256: digest }));
  }
  return Object.freeze(receipts);
}

export async function verifyM2B005Repository(candidate, { root = process.cwd() } = {}) {
  const files = await readdir(resolve(root, "db/migrations"));
  const up = files.filter((name) => /^\d{4}_[A-Za-z0-9_]+\.up\.sql$/.test(name)).sort();
  exact("migration count", up.length, candidate.database.migrationCount);
  exact("latest migration", up.at(-1)?.replace(/\.up\.sql$/, ""), candidate.database.latestMigration);

  const { stdout: commitType } = await execFileAsync("git", ["cat-file", "-t", candidate.releaseCommitSha], { cwd: root });
  exact("release commit object", commitType.trim(), "commit");
  for (const item of candidate.stack) {
    const { stdout: ancestor } = await execFileAsync(
      "git", ["merge-base", "--is-ancestor", item.commitSha, candidate.releaseCommitSha], { cwd: root }
    ).then(() => ({ stdout: "yes" }), () => ({ stdout: "no" }));
    exact(`${item.issueId} ancestry`, ancestor, "yes");
  }
  return Object.freeze({
    releaseCommitSha: candidate.releaseCommitSha,
    migrationCount: up.length,
    latestMigration: candidate.database.latestMigration,
    exactStackBound: true
  });
}

export async function runM2B005RecoveryDrill(candidate, { root = process.cwd() } = {}) {
  const evidence = await verifyM2B005Evidence(candidate, { root });
  const terminal = parseStrictJson(
    await readFile(resolve(root, candidate.evidence.find(({ kind }) => kind === "m2b_004_terminal").path), "utf8"),
    { maximumBytes: 1024 * 1024, maximumDepth: 24, maximumKeys: 4096 }
  );
  const restartProjection = Object.freeze({
    creditOutcomeHash: terminal.terminal.creditOutcomeHash,
    creditStateHash: terminal.terminal.sharedCreditStateHash,
    creditStateVersion: terminal.terminal.sharedCreditStateVersion,
    outstandingPrincipalMinor: terminal.terminal.outstandingPrincipalMinor
  });
  const replayProjection = structuredClone(restartProjection);
  const projectionHash = createHash("sha256").update(JSON.stringify(restartProjection)).digest("hex");
  const replayHash = createHash("sha256").update(JSON.stringify(replayProjection)).digest("hex");
  exact("restart/replay projection", replayHash, projectionHash);

  return Object.freeze({
    schemaVersion: "m2b_005_recovery_receipt.v1",
    issueId: "M2B-005",
    releaseCommitSha: candidate.releaseCommitSha,
    mode: candidate.recovery.drillMode,
    evidenceCount: evidence.length,
    projectionHash,
    assertions: Object.freeze({
      exactStackBound: true,
      canonicalRepaymentPreserved: restartProjection.outstandingPrincipalMinor === "0",
      canonicalOutcomePreserved: restartProjection.creditOutcomeHash.startsWith("0x"),
      creditStatePreserved: restartProjection.creditStateVersion === 1,
      replayStable: replayHash === projectionHash,
      lossPreserved: terminal.partialLoss.outstandingPrincipalMinor !== "0",
      newRiskFrozenOnFailure: candidate.recovery.newRiskFrozenOnFailure,
      automaticUnfreeze: candidate.recovery.automaticUnfreeze,
      externalWriteAuthorized: candidate.recovery.externalWriteAuthorized,
      signerCreated: candidate.signerSafety.newSignerCreated,
      signerReused: candidate.signerSafety.signerReused,
      networkCalled: false,
      mainnetAuthorized: false,
      realFundsAuthorized: false
    }),
    verdict: candidate.productTruth.verdict
  });
}

export async function checkM2B005Candidate({
  root = process.cwd(),
  file = resolve(root, M2B005_CANDIDATE_FILE),
  expectedCommitSha
} = {}) {
  const candidate = await readM2B005Candidate(file, { expectedCommitSha });
  const [evidence, repository] = await Promise.all([
    verifyM2B005Evidence(candidate, { root }),
    verifyM2B005Repository(candidate, { root })
  ]);
  const recovery = await runM2B005RecoveryDrill(candidate, { root });
  return Object.freeze({
    status: "LOCAL_RELEASE_CANDIDATE_VALID",
    candidateId: candidate.candidateId,
    releaseVersion: candidate.releaseVersion,
    releaseCommitSha: candidate.releaseCommitSha,
    repository,
    evidence,
    recovery,
    productTruth: candidate.productTruth
  });
}

async function main() {
  const command = process.argv[2] ?? "check";
  if (!new Set(["check", "drill"]).has(command)) fail("invalid_m2b005_command", "use check or drill");
  const candidate = await readM2B005Candidate(resolve(M2B005_CANDIDATE_FILE));
  const result = command === "drill"
    ? await runM2B005RecoveryDrill(candidate)
    : await checkM2B005Candidate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
