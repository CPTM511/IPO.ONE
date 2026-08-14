import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const checkpointPath = "deploy/local/m1-b-release-closure-checkpoint.v1.json";
const profilePath = "product/traceability/ipo-one.m1-b-gate-profile.v1.json";
const overlayPath =
  "product/traceability/ipo-one.m1-b-release-closure-founder-overlay.2026-08-14.v1.json";
const overlayCheckerPath =
  "scripts/check-m1-b-release-closure-founder-overlay.mjs";
const overlayAmendmentPath =
  "docs/releases/M1_B_FOUNDER_RELEASE_CLOSURE_AMENDMENT_2026_08_14.md";
const historicalCheckerPath = "scripts/check-m1-a-1-candidate-snapshot.mjs";
const historicalSnapshotPath = "deploy/local/m1-a-1-candidate-snapshot.v1.json";
const historicalLocalRcPath = "deploy/local/release-candidate.v2.json";
const historicalLocalRcCheckerPath = "scripts/check-local-release-candidate-v2.mjs";
const currentPreflightPath = "deploy/local/prod-cutover-001.release-candidate.v1.json";
const currentPreflightCheckerPath = "scripts/check-prod-cutover-release-candidate.mjs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function exactKeys(value, keys) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

const [
  checkpoint,
  profile,
  overlay,
  historicalLocalRc,
  currentPreflight,
  packageManifest
] = await Promise.all([
  readFile(checkpointPath, "utf8").then(JSON.parse),
  readFile(profilePath, "utf8").then(JSON.parse),
  readFile(overlayPath, "utf8").then(JSON.parse),
  readFile(historicalLocalRcPath, "utf8").then(JSON.parse),
  readFile(currentPreflightPath, "utf8").then(JSON.parse),
  readFile("package.json", "utf8").then(JSON.parse)
]);

exactKeys(checkpoint, [
  "schemaVersion",
  "status",
  "milestone",
  "deliveryMode",
  "authorization",
  "orderedBaseline",
  "historicalM1A1Evidence",
  "historicalLocalReleaseCandidate",
  "historicalBaseGateProfile",
  "founderReleaseClosureOverlay",
  "closureOrder",
  "completionBoundary"
]);
assert.equal(Object.hasOwn(checkpoint, "currentStageAuthority"), false);

assert.equal(
  checkpoint.schemaVersion,
  "ipo_one_m1_b_release_closure_checkpoint.v1"
);
assert.equal(checkpoint.status, "P0_RELEASE_CLOSURE_IN_PROGRESS");
assert.equal(checkpoint.milestone, "M1_B_RELEASE_CLOSURE");
assert.equal(checkpoint.deliveryMode, "L1_PUBLIC_SANDBOX");
assert.deepEqual(checkpoint.authorization, {
  boundedNoFundsReleaseClosureAuthorized: true,
  baseProfileDeploymentAuthorizationInherited: false,
  productScopeExpansionAuthorized: false,
  mergeAuthorized: false,
  deploymentAuthorized: false,
  deploymentEvidenceCollectionAuthorized: false,
  deploymentPromotionAuthorized: false,
  aliasMutationAuthorized: false,
  dnsMutationAuthorized: false,
  customDomainAuthorized: false,
  releaseTagAuthorized: false,
  releaseSealAuthorized: false,
  realFundsEnabled: false,
  mainnetEnabled: false,
  candidateCommit: null,
  exactGreen: false,
  deploymentClosureClaimed: false
});

assert.match(checkpoint.orderedBaseline.commit, /^[0-9a-f]{40}$/);
execFileSync(
  "git",
  ["merge-base", "--is-ancestor", checkpoint.orderedBaseline.commit, "HEAD"],
  { stdio: "ignore" }
);
assert.equal(
  checkpoint.orderedBaseline.branch,
  "codex/m1-b-deployable-sandbox"
);

const historical = checkpoint.historicalM1A1Evidence;
assert.equal(
  historical.disposition,
  "IMMUTABLE_HISTORICAL_EVIDENCE_SUPERSEDED_FOR_AGGREGATE_CURRENT_STAGE_CHECK"
);
assert.equal(historical.checkpointCommit, profile.sourceBinding.checkpointCommit);
assert.equal(historical.checkpointTree, profile.sourceBinding.checkpointTree);
assert.equal(
  historical.candidateContentRoot,
  profile.sourceBinding.checkpointCandidateContentRoot
);
assert.equal(historical.snapshotPath, historicalSnapshotPath);
assert.equal(historical.snapshotCheckerPath, historicalCheckerPath);
assert.equal(historical.aggregateCurrentStageGate, false);
assert.equal(historical.directHistoricalVerificationRetained, true);
assert.equal(
  packageManifest.scripts["check:m1-a-1-snapshot"],
  `node ${historicalCheckerPath}`
);
assert.equal(
  git("rev-parse", `${historical.checkpointCommit}^{tree}`),
  historical.checkpointTree
);
assert.doesNotMatch(
  packageManifest.scripts.check,
  /check:m1-a-1-snapshot/,
  "the branch-bound historical verifier must not gate the current M1-B aggregate"
);

const localRc = checkpoint.historicalLocalReleaseCandidate;
assert.equal(
  localRc.disposition,
  "IMMUTABLE_LOCAL_RC_V2_SUPERSEDED_FOR_AGGREGATE_CURRENT_STAGE_CHECK"
);
assert.equal(localRc.releaseCandidateId, historicalLocalRc.releaseCandidateId);
assert.equal(localRc.manifestPath, historicalLocalRcPath);
assert.equal(localRc.checkerPath, historicalLocalRcCheckerPath);
assert.equal(localRc.boundBranch, historicalLocalRc.sourceBinding.branch);
assert.equal(localRc.aggregateCurrentStageGate, false);
assert.equal(localRc.directHistoricalVerificationRetained, true);
assert.equal(
  packageManifest.scripts["check:local-rc"],
  `node ${historicalLocalRcCheckerPath}`
);
assert.doesNotMatch(
  packageManifest.scripts.check,
  /check:local-rc(?:\s|&)/,
  "the branch-bound historical local RC must not gate the current aggregate"
);

const historicalBaseProfile = checkpoint.historicalBaseGateProfile;
exactKeys(historicalBaseProfile, [
  "disposition",
  "profilePath",
  "profileSchemaVersion",
  "profileStatus",
  "requiredRequirementCount",
  "deferredRequirementCount",
  "baseEffectiveFieldRetained",
  "baseDeploymentAuthorizedFieldRetained",
  "deploymentAuthorizationInherited",
  "aggregateCurrentStageGate",
  "directHistoricalVerificationRetained",
  "preflightManifestPath",
  "preflightCheckerPath",
  "preflightVerdict",
  "preflightDisposition"
]);
assert.equal(
  historicalBaseProfile.disposition,
  "PRESERVED_HISTORICAL_BASE_SUPERSEDED_BY_FOUNDER_OVERLAY_FOR_CURRENT_CLOSURE"
);
assert.equal(historicalBaseProfile.profilePath, profilePath);
assert.equal(historicalBaseProfile.profileSchemaVersion, profile.schemaVersion);
assert.equal(historicalBaseProfile.profileStatus, profile.status);
assert.equal(profile.effective, true);
assert.equal(profile.authorization.m1BEntryAuthorized, true);
assert.equal(profile.authorization.deploymentAuthorized, true);
assert.equal(profile.authorization.runtimeFeatureExpansionAuthorized, false);
assert.equal(
  historicalBaseProfile.requiredRequirementCount,
  profile.gateDefinition.requiredRequirementCount
);
assert.equal(
  historicalBaseProfile.deferredRequirementCount,
  profile.gateDefinition.deferredRequirementCount
);
assert.equal(historicalBaseProfile.baseEffectiveFieldRetained, true);
assert.equal(historicalBaseProfile.baseDeploymentAuthorizedFieldRetained, true);
assert.equal(historicalBaseProfile.deploymentAuthorizationInherited, false);
assert.equal(historicalBaseProfile.aggregateCurrentStageGate, false);
assert.equal(historicalBaseProfile.directHistoricalVerificationRetained, true);
assert.equal(historicalBaseProfile.preflightManifestPath, currentPreflightPath);
assert.equal(historicalBaseProfile.preflightCheckerPath, currentPreflightCheckerPath);
assert.equal(historicalBaseProfile.preflightVerdict, currentPreflight.cutoverVerdictAtSeal);
assert.equal(
  historicalBaseProfile.preflightDisposition,
  "HISTORICAL_ANCESTOR_BOUND_BLOCKED_PREFLIGHT"
);
assert.equal(currentPreflight.deploymentAuthority.realFundsEnabled, false);
assert.equal(currentPreflight.cutoverVerdictAtSeal, "BLOCKED — NOT PRODUCTION RELEASED");
assert.match(packageManifest.scripts.check, /check:m1-b-gate-profile/);
assert.match(packageManifest.scripts.check, /check:m1-b-release-checkpoint/);
assert.match(packageManifest.scripts.check, /check:prod-cutover-rc/);

const releaseClosureOverlay = checkpoint.founderReleaseClosureOverlay;
assert.deepEqual(releaseClosureOverlay, {
  path: overlayPath,
  checkerPath: overlayCheckerPath,
  amendmentPath: overlayAmendmentPath,
  schemaVersion: "ipo_one_m1_b_release_closure_founder_overlay.v1",
  status: "FOUNDER_APPROVED_EFFECTIVE_FOR_M1_B_RELEASE_CLOSURE",
  baseProfileRequiredRequirementCount: 38,
  baseProfileDeferredRequirementCount: 6,
  effectiveRequiredRequirementCount: 39,
  effectiveDeferredRequirementCount: 5,
  mandatoryRiskSecurityGateId: "M1_B_RISK_SIWE_ONLY_FAIL_CLOSED",
  baseProfileDeploymentAuthorizationInherited: false,
  deploymentAuthorized: false,
  soleEffectiveCurrentStageAuthority: true,
  aggregateCurrentStageGate: true
});
assert.equal(releaseClosureOverlay.schemaVersion, overlay.schemaVersion);
assert.equal(releaseClosureOverlay.status, overlay.status);
assert.equal(
  releaseClosureOverlay.baseProfileRequiredRequirementCount,
  profile.gateDefinition.requiredRequirementCount
);
assert.equal(
  releaseClosureOverlay.baseProfileDeferredRequirementCount,
  profile.gateDefinition.deferredRequirementCount
);
assert.equal(
  releaseClosureOverlay.effectiveRequiredRequirementCount,
  overlay.effectiveGate.requiredRequirementCount
);
assert.equal(
  releaseClosureOverlay.effectiveDeferredRequirementCount,
  overlay.effectiveGate.deferredRequirementCount
);
assert.equal(
  releaseClosureOverlay.mandatoryRiskSecurityGateId,
  overlay.mandatoryRiskSecurityBoundary.gateId
);
assert.equal(overlay.mandatoryRiskSecurityBoundary.requiredForM1B, true);
assert.equal(
  overlay.mandatoryRiskSecurityBoundary.maximumPrivilegedMutationCount,
  0
);
assert.equal(
  overlay.mandatoryRiskSecurityBoundary.weakAuthenticationFallbackAllowed,
  false
);
assert.equal(overlay.authorizationBoundary.authorizationPolicyChangeAuthorized, false);
assert.equal(
  overlay.authorizationBoundary.baseProfileDeploymentAuthorizationInherited,
  false
);
for (const boundary of [
  "mergeAuthorized",
  "deploymentAuthorized",
  "deploymentEvidenceCollectionAuthorized",
  "deploymentPromotionAuthorized",
  "aliasMutationAuthorized",
  "dnsMutationAuthorized",
  "customDomainAuthorized",
  "releaseTagAuthorized",
  "releaseSealAuthorized"
]) {
  assert.equal(
    checkpoint.authorization[boundary],
    false,
    `${boundary} must remain false in the current checkpoint`
  );
  assert.equal(
    overlay.authorizationBoundary[boundary],
    false,
    `${boundary} must remain false in the current overlay`
  );
}
assert.equal(releaseClosureOverlay.baseProfileDeploymentAuthorizationInherited, false);
assert.equal(releaseClosureOverlay.deploymentAuthorized, false);
assert.equal(releaseClosureOverlay.soleEffectiveCurrentStageAuthority, true);
assert.equal(
  overlay.authorizationBoundary.requiresRecentMfaActorTypesChangeAuthorized,
  false
);
execFileSync(process.execPath, [overlayCheckerPath], {
  encoding: "utf8"
});

assert.deepEqual(checkpoint.closureOrder, [
  "P0-1_HUMAN_OFFER_CONTINUATION",
  "P0-2_AGENT_CORE_MCP_EXECUTION",
  "P0-3_CANONICAL_PRODUCT_TRUTH",
  "P0-4_EXACT_GREEN_RELEASE_VERIFICATION",
  "P0-5_EXACT_COMMIT_ACCEPTANCE_AND_RELEASE_CLOSURE"
]);
assert.deepEqual(checkpoint.completionBoundary, {
  candidateMayBeBoundOnlyAfterCleanCommitExists: true,
  exactGreenMayBeTrueOnlyAfterApplicableGatesPassOnCandidateCommit: true,
  deploymentEvidenceRequiredForDeploymentClosure: true,
  candidateBindingMode: "EXTERNAL_PRIVATE_EXACT_COMMIT_EVIDENCE",
  trackedCheckpointSelfReferenceAllowed: false,
  deploymentMayRemainExplicitlyPending: true,
  pendingDeploymentMayClaimDeployedSha: false,
  postAcceptanceTrackedSealAuthorized: false,
  currentVerdict: "NOT_AN_M1_B_RELEASE_CANDIDATE"
});

console.log("M1-B release-closure checkpoint validation passed.");
console.log(`Ordered baseline: ${checkpoint.orderedBaseline.commit}`);
console.log(`Current HEAD: ${git("rev-parse", "HEAD")}`);
console.log("Historical M1-A.1 verification remains directly callable, not aggregate-current.");
console.log("Founder overlay: 39 required, 5 deferred, Risk SIWE-only fail-closed gate mandatory.");
console.log("Candidate commit: unset; exact-green and deployment closure remain false.");
