import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { M1_A_1_INCLUDED_PATHS } from "./m1-a-1-candidate-paths.mjs";

const profilePath = "product/traceability/ipo-one.m1-b-gate-profile.v1.json";
const constitutionPath = "docs/PRODUCT_CONSTITUTION.md";
const evidencePath = "product/traceability/ipo-one.m1-requirement-evidence.v1.json";
const checkerPath = fileURLToPath(import.meta.url);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function sorted(values) {
  return [...values].sort();
}

const profileBytes = await readFile(profilePath);
const checkerBytes = await readFile(checkerPath);
const profile = JSON.parse(profileBytes.toString("utf8"));
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const constitution = await readFile(constitutionPath, "utf8");

assert.equal(profile.schemaVersion, "ipo_one_m1_b_gate_profile.v1");
assert.equal(profile.status, "FOUNDER_APPROVED_M1_B_DEPLOYABLE_SANDBOX");
assert.equal(profile.effective, true);
assert.deepEqual(profile.authorization, {
  m1BEntryAuthorized: true,
  releaseCandidateBranchAuthorized: false,
  releaseCandidateCommitAuthorized: false,
  releaseTagAuthorized: false,
  deploymentAuthorized: true,
  boundedSandboxRemediationAuthorized: true,
  runtimeFeatureExpansionAuthorized: false
});
assert.equal(
  profile.gateDefinition.milestone,
  "M1_B_DEPLOYABLE_SANDBOX_VERTICAL_SLICE"
);
assert.equal(profile.gateDefinition.deliveryMode, "L1_PUBLIC_SANDBOX");
assert.match(profile.gateDefinition.releaseBoundary, /invitation-only no-funds sandbox/i);
assert.match(profile.gateDefinition.releaseBoundary, /does not authorize an RC branch/i);

assert.equal(profile.sourceBinding.productConstitution, constitutionPath);
assert.equal(profile.sourceBinding.productConstitutionVersion, "v1.0");
assert.equal(profile.sourceBinding.requirementEvidence, evidencePath);
assert.equal(profile.sourceBinding.checkpointBranch, "codex/m1-a-1-preseal-checkpoint");
assert.equal(
  profile.sourceBinding.checkpointTree,
  git("rev-parse", `${profile.sourceBinding.checkpointCommit}^{tree}`)
);
assert.equal(
  profile.sourceBinding.checkpointParent,
  git("rev-parse", `${profile.sourceBinding.checkpointCommit}^`)
);
assert.equal(
  git("show", "-s", "--format=%D", profile.sourceBinding.checkpointCommit)
    .split(", ")
    .some((ref) => ref.startsWith("tag: ")),
  false,
  "checkpoint commit must not have a tag"
);

const checkpointPaths = sorted(
  git(
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    profile.sourceBinding.checkpointCommit
  )
    .split("\n")
    .filter(Boolean)
);
assert.deepEqual(checkpointPaths, M1_A_1_INCLUDED_PATHS);

const checkpointFiles = M1_A_1_INCLUDED_PATHS.map((path) => ({
  path,
  sha256: sha256(
    execFileSync("git", ["show", `${profile.sourceBinding.checkpointCommit}:${path}`])
  )
}));
const checkpointContentRoot = sha256(
  checkpointFiles.map(({ path, sha256: hash }) => `${path}\0${hash}\n`).join("")
);
assert.equal(
  profile.sourceBinding.checkpointCandidateContentRoot,
  checkpointContentRoot
);

const constitutionRequirementIds = sorted(
  [...constitution.matchAll(/^\| (REQ-[A-Z0-9-]+) \|/gm)].map((match) => match[1])
);
const evidenceRequirementIds = sorted(
  evidence.requirements.map(({ requirementId }) => requirementId)
);
const profileRequirementIds = sorted(
  profile.requirements.map(({ requirementId }) => requirementId)
);

assert.equal(constitutionRequirementIds.length, 44);
assert.equal(new Set(constitutionRequirementIds).size, 44);
assert.deepEqual(evidenceRequirementIds, constitutionRequirementIds);
assert.deepEqual(profileRequirementIds, constitutionRequirementIds);
assert.equal(new Set(profileRequirementIds).size, 44);

const evidenceLevels = new Map(
  evidence.requirements.map(({ requirementId, classification }) => [
    requirementId,
    classification
  ])
);
const requiredFields = [
  "required_for_m1_b",
  "required_level",
  "target_milestone",
  "blocking_reason",
  "evidence_required",
  "deferral_authority",
  "non_goal_boundary"
];

for (const requirement of profile.requirements) {
  assert.equal(
    requirement.current_level,
    evidenceLevels.get(requirement.requirementId),
    `${requirement.requirementId} current level drifted`
  );
  for (const field of requiredFields) {
    assert.ok(Object.hasOwn(requirement, field), `${requirement.requirementId} lacks ${field}`);
  }
  assert.equal(typeof requirement.required_for_m1_b, "boolean");
  assert.ok(requirement.blocking_reason.length > 0);
  assert.ok(requirement.deferral_authority.length > 0);
  assert.ok(requirement.non_goal_boundary.length > 0);
  assert.ok(Array.isArray(requirement.evidence_required));
  assert.ok(requirement.evidence_required.length > 0);
  assert.ok(requirement.evidence_required.every((entry) => typeof entry === "string" && entry.length > 0));
  if (requirement.required_for_m1_b) {
    assert.equal(requirement.required_level, "VERIFIED_SANDBOX");
    assert.equal(requirement.target_milestone, "M1_B");
  } else {
    assert.equal(requirement.required_level, "NOT_REQUIRED_FOR_M1_B");
    assert.notEqual(requirement.target_milestone, "M1_B");
  }
}

const required = profile.requirements.filter(({ required_for_m1_b }) => required_for_m1_b);
const deferred = profile.requirements.filter(({ required_for_m1_b }) => !required_for_m1_b);
assert.equal(required.length, profile.gateDefinition.requiredRequirementCount);
assert.equal(deferred.length, profile.gateDefinition.deferredRequirementCount);
assert.equal(required.length, 38);
assert.equal(deferred.length, 6);
assert.deepEqual(
  sorted(deferred.map(({ requirementId }) => requirementId)),
  [
    "REQ-PAY-002",
    "REQ-PILOT-001",
    "REQ-PILOT-002",
    "REQ-TRADE-002",
    "REQ-UX-001",
    "REQ-UX-003"
  ]
);
assert.deepEqual(
  profile.gateDefinition.deferredRequirementIds,
  [
    "REQ-PAY-002",
    "REQ-PILOT-001",
    "REQ-PILOT-002",
    "REQ-TRADE-002",
    "REQ-UX-001",
    "REQ-UX-003"
  ]
);
assert.deepEqual(
  profile.gateDefinition.proposedBlockingRequirementIds,
  [
    "REQ-CREDIT-009",
    "REQ-UX-004",
    "REQ-UX-005"
  ]
);

const byId = new Map(
  profile.requirements.map((requirement) => [requirement.requirementId, requirement])
);
assert.equal(byId.get("REQ-CREDIT-009").gate_disposition, "M1_B_CANONICAL_BLOCKER");
assert.equal(byId.get("REQ-CREDIT-009").required_for_m1_b, true);
assert.match(byId.get("REQ-CREDIT-009").non_goal_boundary, /never an independent/i);

assert.equal(byId.get("REQ-UX-005").gate_disposition, "M1_B_CANONICAL_BLOCKER");
assert.equal(byId.get("REQ-UX-005").required_for_m1_b, true);
assert.match(byId.get("REQ-UX-005").non_goal_boundary, /client-storage canonical truth/i);

assert.equal(
  byId.get("REQ-UX-001").gate_disposition,
  "DEFERRED_BY_FOUNDER_HUMAN_DISPUTE_APPEAL"
);
assert.equal(byId.get("REQ-UX-001").required_for_m1_b, false);
assert.match(byId.get("REQ-UX-001").non_goal_boundary, /No Human production lending/i);

assert.equal(
  byId.get("REQ-UX-003").gate_disposition,
  "DEFERRED_BY_FOUNDER_CAPITAL_PARTNER_BROWSER"
);
assert.equal(byId.get("REQ-UX-003").required_for_m1_b, false);
assert.equal(
  byId.get("REQ-UX-004").gate_disposition,
  "M1_B_AUTHENTICATED_GOLDEN_FLOW_BLOCKER"
);
assert.equal(byId.get("REQ-UX-004").required_for_m1_b, true);

assert.equal(
  byId.get("REQ-PAY-002").gate_disposition,
  "DEFERRED_BY_FOUNDER_PAID_CONTROLLED_PILOT"
);
assert.equal(byId.get("REQ-PAY-002").required_for_m1_b, false);
assert.match(byId.get("REQ-PAY-002").non_goal_boundary, /Fee runtime implementation/i);
assert.ok(
  byId
    .get("REQ-PAY-002")
    .evidence_required.some((entry) => /protocol fees are disabled in sandbox/i.test(entry))
);

assert.equal(
  byId.get("REQ-TRADE-002").gate_disposition,
  "DEFERRED_READ_ONLY_EXTERNAL_EVIDENCE"
);
assert.equal(byId.get("REQ-TRADE-002").required_for_m1_b, false);
assert.match(byId.get("REQ-TRADE-002").non_goal_boundary, /No signer/i);

assert.equal(
  byId.get("REQ-PILOT-001").gate_disposition,
  "DEFERRED_FOUNDER_STATE_MACHINE"
);
assert.equal(byId.get("REQ-PILOT-001").required_for_m1_b, false);
assert.match(byId.get("REQ-PILOT-001").non_goal_boundary, /Do not implement before Founder/i);

assert.equal(
  byId.get("REQ-PILOT-002").gate_disposition,
  "DEFERRED_CONTROLLED_PILOT"
);
assert.equal(byId.get("REQ-PILOT-002").required_for_m1_b, false);

const currentLevelCounts = profile.requirements.reduce((counts, requirement) => {
  counts[requirement.current_level] = (counts[requirement.current_level] ?? 0) + 1;
  return counts;
}, {});
assert.deepEqual(currentLevelCounts, {
  VERIFIED_SANDBOX: 35,
  IMPLEMENTED_UNVERIFIED: 8,
  NOT_IMPLEMENTED: 1
});

console.log("M1-B Gate Profile validation passed.");
console.log(`Checkpoint commit: ${profile.sourceBinding.checkpointCommit}`);
console.log(`Checkpoint tree: ${profile.sourceBinding.checkpointTree}`);
console.log(`Checkpoint 67-path content root: ${checkpointContentRoot}`);
console.log(`Requirement coverage: ${profile.requirements.length}/44`);
console.log(`Required for M1-B: ${required.length}`);
console.log(`Deferred beyond M1-B: ${deferred.length}`);
console.log(`Profile SHA-256: ${sha256(profileBytes)}`);
console.log(`Checker SHA-256: ${sha256(checkerBytes)}`);
console.log("M1-B deployable-sandbox work is authorized; RC and release authority remain false.");
