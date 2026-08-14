import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const overlayPath =
  "product/traceability/ipo-one.m1-b-release-closure-founder-overlay.2026-08-14.v1.json";
const baseProfilePath = "product/traceability/ipo-one.m1-b-gate-profile.v1.json";
const baseProfileCheckerPath = "scripts/check-m1-b-gate-profile.mjs";
const amendmentPath =
  "docs/releases/M1_B_FOUNDER_RELEASE_CLOSURE_AMENDMENT_2026_08_14.md";
const acceptanceTaskPath =
  "docs/codex/tasks/M1_B_P0_5_EXACT_COMMIT_ACCEPTANCE.md";
const acceptanceRunbookPath = "docs/verification/M1_B_P0_5_ACCEPTANCE.md";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sorted(values) {
  return [...values].sort();
}

function exactKeys(value, keys) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

const overlayBytes = await readFile(overlayPath);
const overlay = JSON.parse(overlayBytes.toString("utf8"));
const baseProfileBytes = await readFile(baseProfilePath);
const baseProfile = JSON.parse(baseProfileBytes.toString("utf8"));
const amendment = await readFile(amendmentPath, "utf8");
const acceptanceTask = await readFile(acceptanceTaskPath, "utf8");
const acceptanceRunbook = await readFile(acceptanceRunbookPath, "utf8");

exactKeys(overlay, [
  "schemaVersion",
  "status",
  "decisionDate",
  "deliveryMode",
  "baseProfile",
  "amendment",
  "authorizationBoundary",
  "requirementDispositionOverrides",
  "effectiveGate",
  "mandatoryRiskSecurityBoundary",
  "operationalNegativeEvidenceBoundary",
  "releaseEvidenceBinding"
]);

assert.equal(
  overlay.schemaVersion,
  "ipo_one_m1_b_release_closure_founder_overlay.v1"
);
assert.equal(
  overlay.status,
  "FOUNDER_APPROVED_EFFECTIVE_FOR_M1_B_RELEASE_CLOSURE"
);
assert.equal(overlay.decisionDate, "2026-08-14");
assert.equal(overlay.deliveryMode, "L1_PUBLIC_SANDBOX");

assert.equal(
  overlay.baseProfile.path,
  baseProfilePath
);
assert.equal(overlay.baseProfile.checkerPath, baseProfileCheckerPath);
assert.equal(overlay.baseProfile.schemaVersion, "ipo_one_m1_b_gate_profile.v1");
assert.equal(overlay.baseProfile.preservedUnmodified, true);
assert.equal(sha256(baseProfileBytes), overlay.baseProfile.sha256);
assert.equal(baseProfile.schemaVersion, overlay.baseProfile.schemaVersion);
assert.equal(baseProfile.gateDefinition.requiredRequirementCount, 38);
assert.equal(baseProfile.gateDefinition.deferredRequirementCount, 6);
execFileSync(process.execPath, [baseProfileCheckerPath], {
  encoding: "utf8"
});

assert.equal(
  overlay.amendment.path,
  amendmentPath
);
assert.equal(overlay.amendment.historicalEvidenceRewritten, false);
assert.match(amendment, /Effective date: 2026-08-14/);
assert.match(amendment, /M1_B_RISK_SIWE_ONLY_FAIL_CLOSED/);
assert.match(amendment, /39.*required/i);
assert.match(amendment, /5.*deferred/i);
assert.match(amendment, /deployment.*pending/i);

assert.deepEqual(overlay.authorizationBoundary, {
  baseProfileDeploymentAuthorizationInherited: false,
  productScopeExpansionAuthorized: false,
  runtimeFeatureExpansionAuthorized: false,
  authorizationPolicyChangeAuthorized: false,
  requiresRecentMfaActorTypesChangeAuthorized: false,
  authenticationBypassAuthorized: false,
  riskSurfacePromotionAuthorized: false,
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
  mainnetEnabled: false
});
assert.equal(
  baseProfile.authorization.deploymentAuthorized,
  true,
  "the preserved base profile must retain its historical deployment authority"
);
assert.equal(
  overlay.authorizationBoundary.baseProfileDeploymentAuthorizationInherited,
  false,
  "the current overlay must not inherit historical deployment authority"
);

assert.equal(overlay.requirementDispositionOverrides.length, 3);
assert.equal(
  new Set(
    overlay.requirementDispositionOverrides.map(({ requirementId }) => requirementId)
  ).size,
  3
);
assert.deepEqual(
  overlay.requirementDispositionOverrides.map(({ requirementId }) => requirementId),
  ["REQ-UX-001", "REQ-UX-003", "REQ-UX-004"]
);

const baseById = new Map(
  baseProfile.requirements.map((requirement) => [
    requirement.requirementId,
    requirement
  ])
);
const overrideById = new Map(
  overlay.requirementDispositionOverrides.map((requirement) => [
    requirement.requirementId,
    requirement
  ])
);
const effectiveRequirements = baseProfile.requirements.map((requirement) => ({
  ...requirement,
  ...(overrideById.get(requirement.requirementId) ?? {})
}));
const effectiveById = new Map(
  effectiveRequirements.map((requirement) => [
    requirement.requirementId,
    requirement
  ])
);

for (const override of overlay.requirementDispositionOverrides) {
  exactKeys(override, [
    "requirementId",
    "gate_disposition",
    "required_for_m1_b",
    "required_level",
    "target_milestone",
    "blocking_reason",
    "evidence_required",
    "deferral_authority",
    "non_goal_boundary"
  ]);
  assert.ok(baseById.has(override.requirementId));
  assert.equal(baseById.get(override.requirementId).current_level, "IMPLEMENTED_UNVERIFIED");
  assert.equal(Object.hasOwn(override, "current_level"), false);
  assert.ok(Array.isArray(override.evidence_required));
  assert.ok(override.evidence_required.length > 0);
  assert.ok(override.blocking_reason.length > 0);
  assert.ok(override.deferral_authority.length > 0);
  assert.ok(override.non_goal_boundary.length > 0);
}

for (const requirementId of ["REQ-UX-001", "REQ-UX-003"]) {
  const requirement = effectiveById.get(requirementId);
  assert.equal(requirement.required_for_m1_b, true);
  assert.equal(requirement.required_level, "VERIFIED_SANDBOX");
  assert.equal(requirement.target_milestone, "M1_B");
  assert.match(requirement.gate_disposition, /^M1_B_/);
}
assert.match(
  effectiveById.get("REQ-UX-001").non_goal_boundary,
  /No real Human lending/
);
assert.match(
  effectiveById.get("REQ-UX-003").non_goal_boundary,
  /No real funding/
);

const riskJourney = effectiveById.get("REQ-UX-004");
assert.equal(
  riskJourney.gate_disposition,
  "DEFERRED_BY_FOUNDER_STRONG_MFA_TO_M1_C_L2"
);
assert.equal(riskJourney.required_for_m1_b, false);
assert.equal(riskJourney.required_level, "NOT_REQUIRED_FOR_M1_B");
assert.equal(riskJourney.target_milestone, "M1_C_L2_CLOSED_NO_FUNDS");
assert.match(riskJourney.non_goal_boundary, /Do not weaken requiresRecentMfaActorTypes/);

const effectiveRequired = effectiveRequirements.filter(
  ({ required_for_m1_b }) => required_for_m1_b
);
const effectiveDeferred = effectiveRequirements.filter(
  ({ required_for_m1_b }) => !required_for_m1_b
);
assert.equal(effectiveRequired.length, 39);
assert.equal(effectiveDeferred.length, 5);
assert.deepEqual(overlay.effectiveGate, {
  requiredRequirementCount: effectiveRequired.length,
  deferredRequirementCount: effectiveDeferred.length,
  proposedBlockingRequirementIds: [
    "REQ-CREDIT-009",
    "REQ-UX-001",
    "REQ-UX-003",
    "REQ-UX-005"
  ],
  deferredRequirementIds: [
    "REQ-PAY-002",
    "REQ-PILOT-001",
    "REQ-PILOT-002",
    "REQ-TRADE-002",
    "REQ-UX-004"
  ]
});
assert.deepEqual(
  sorted(effectiveDeferred.map(({ requirementId }) => requirementId)),
  sorted(overlay.effectiveGate.deferredRequirementIds)
);

assert.deepEqual(overlay.mandatoryRiskSecurityBoundary, {
  gateId: "M1_B_RISK_SIWE_ONLY_FAIL_CLOSED",
  requiredForM1B: true,
  requiredStatus: "VERIFIED_FAIL_CLOSED",
  sessionAssuranceUnderTest: "SIWE_ONLY",
  requiredPrivilegedAssurance: "RECENT_PHISHING_RESISTANT_MFA",
  weakAuthenticationFallbackAllowed: false,
  riskSurfacePromotionAuthorized: false,
  maximumPrivilegedMutationCount: 0,
  fullPrivilegedJourneyTarget: "M1_C_L2_CLOSED_NO_FUNDS",
  requiredEvidence: overlay.mandatoryRiskSecurityBoundary.requiredEvidence
});
assert.equal(overlay.mandatoryRiskSecurityBoundary.requiredEvidence.length, 3);
assert.ok(
  overlay.mandatoryRiskSecurityBoundary.requiredEvidence.every(
    (entry) => typeof entry === "string" && entry.length > 0
  )
);
assert.equal(
  overlay.mandatoryRiskSecurityBoundary.requiredEvidence.some((entry) =>
    /sampled/i.test(entry)
  ),
  false
);
assert.equal(
  overlay.mandatoryRiskSecurityBoundary.requiredEvidence[0],
  "Every exported Risk or Operations operation whose authorization policy requires recent phishing-resistant MFA is covered by exact-source fail-closed Evidence; separate post-restart live SIWE-only Risk runtime Evidence proves exposed protected read and mutation denial with zero protected-state change."
);

const negativeBoundary = overlay.operationalNegativeEvidenceBoundary;
exactKeys(negativeBoundary, [
  "gateId",
  "requiredForM1B",
  "requiredCaseCount",
  "caseDefinitionHashRequired",
  "sameCandidateShaTreeAndImageRequired",
  "uniqueCaseReceiptAndIdentifiersRequired",
  "fixtureOrMockAllowed",
  "provenanceRelabelingAllowed",
  "sourceModes",
  "requiredEvidence"
]);
assert.equal(negativeBoundary.gateId, "M1_B_16_CASE_SPLIT_PROVENANCE");
assert.equal(negativeBoundary.requiredForM1B, true);
assert.equal(negativeBoundary.requiredCaseCount, 16);
assert.equal(negativeBoundary.caseDefinitionHashRequired, true);
assert.equal(negativeBoundary.sameCandidateShaTreeAndImageRequired, true);
assert.equal(negativeBoundary.uniqueCaseReceiptAndIdentifiersRequired, true);
assert.equal(negativeBoundary.fixtureOrMockAllowed, false);
assert.equal(negativeBoundary.provenanceRelabelingAllowed, false);
assert.deepEqual(negativeBoundary.sourceModes, {
  live_post_restart: [
    "human:expired_offer",
    "human:replaced_stale_offer",
    "human:unauthorized_subject",
    "authorization:cross_role_private_read"
  ],
  exact_source_disposable_postgres: [
    "human:duplicate_acceptance",
    "human:wrong_tenant",
    "human:invalid_acceptance_binding",
    "agent:wrong_provider",
    "agent:wrong_provider_category",
    "agent:stale_mandate",
    "agent:revoked_mandate",
    "agent:out_of_scope_facility",
    "agent:replay_invalid_execution",
    "authorization:wrong_tenant_private_read"
  ],
  exact_source_ui_binding: [
    "human:changed_version"
  ],
  exact_source_transport: [
    "authorization:signed_out_private_read"
  ]
});
assert.equal(
  Object.values(negativeBoundary.sourceModes).flat().length,
  negativeBoundary.requiredCaseCount
);
assert.equal(
  new Set(Object.values(negativeBoundary.sourceModes).flat()).size,
  negativeBoundary.requiredCaseCount
);
assert.equal(negativeBoundary.requiredEvidence.length, 5);
assert.ok(negativeBoundary.requiredEvidence.every(
  (entry) => typeof entry === "string" && entry.length > 0
));
assert.match(amendment, /M1_B_16_CASE_SPLIT_PROVENANCE/);
assert.match(amendment, /exact_source_disposable_postgres/);
assert.match(amendment, /exact_source_ui_binding/);
assert.match(amendment, /exact_source_transport/);
for (const currentAcceptanceDocument of [acceptanceTask, acceptanceRunbook]) {
  assert.match(currentAcceptanceDocument, /four safe[\s\S]{0,120}`live_post_restart`/i);
  assert.match(currentAcceptanceDocument, /ten[\s\S]{0,180}`exact_source_disposable_postgres`/i);
  assert.match(currentAcceptanceDocument, /`exact_source_ui_binding`/);
  assert.match(currentAcceptanceDocument, /`exact_source_transport`/);
  assert.match(currentAcceptanceDocument, /same exact candidate\s+SHA, tree,[\s\S]{0,40}(?:OCI )?image/i);
  assert.match(
    currentAcceptanceDocument,
    /(?:never (?:be )?relabel|relabeling (?:is|are) forbidden)/i
  );
  assert.match(
    currentAcceptanceDocument,
    /first ten Principal\/Agent(?: journey)?\s+steps[\s\S]{0,220}pre-restart Agent\s+acceptance/i
  );
  assert.match(
    currentAcceptanceDocument,
    /economic\s+actions\s+(?:must\s+not\s+be|are\s+not)\s+replayed|never\s+replay\s+those\s+economic\s+actions/i
  );
  assert.doesNotMatch(
    currentAcceptanceDocument,
    /all 28 journey steps (?:against|bind to) (?:this|that) (?:same|one) post-restart/i
  );
  assert.doesNotMatch(
    currentAcceptanceDocument,
    /exact negative(?: set)?s? (?:against|bind to) (?:this|that) (?:same|one) post-restart runtime/i
  );
}

assert.deepEqual(overlay.releaseEvidenceBinding, {
  mode: "EXTERNAL_PRIVATE_EXACT_COMMIT_EVIDENCE",
  privateEvidenceRoot: "output/playwright/m1-b-p0-5/",
  sourceShaMustEqualTestedSha: true,
  sourceShaMustEqualAcceptedSha: true,
  deployedShaMustEqualAcceptedShaWhenDeployed: true,
  deploymentMayRemainExplicitlyPending: true,
  pendingDeploymentMayClaimDeployedSha: false,
  trackedCheckpointSelfReferenceAllowed: false,
  postAcceptanceTrackedSealAuthorized: false
});

console.log("M1-B Founder release-closure overlay validation passed.");
console.log(`Base profile SHA-256: ${overlay.baseProfile.sha256}`);
console.log(`Effective requirements: ${effectiveRequired.length} required, ${effectiveDeferred.length} deferred`);
console.log(`Mandatory Risk gate: ${overlay.mandatoryRiskSecurityBoundary.gateId}`);
console.log(`Overlay SHA-256: ${sha256(overlayBytes)}`);
