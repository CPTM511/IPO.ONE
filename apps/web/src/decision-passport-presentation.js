const HASH = /^0x[0-9a-f]{64}$/;

export const DECISION_PASSPORT_REASON_COPY = Object.freeze({
  authority_scope_current: Object.freeze({
    title: "Your authority is current",
    detail: "The active Consent covers this asset, purpose, amount, term, and repayment plan."
  }),
  principal_and_subject_eligible: Object.freeze({
    title: "Borrower and Principal are eligible",
    detail: "The accountable Subject and Principal are active for this no-funds application."
  }),
  identity_evidence_current: Object.freeze({
    title: "Identity Evidence is current",
    detail: "A finalized synthetic identity reference is bound to the active Consent."
  }),
  principal_binding_current: Object.freeze({
    title: "Principal binding is current",
    detail: "The Agent is bound to its accountable Human Principal and scoped Mandate."
  }),
  no_adverse_obligation: Object.freeze({
    title: "No adverse obligation is open",
    detail: "The point-in-time risk state found no overdue Obligation or frozen credit state."
  }),
  within_sandbox_policy_cap: Object.freeze({
    title: "The request is within sandbox limits",
    detail: "Asset, principal, term, and schedule fit the checked-in no-funds policy."
  }),
  sandbox_rules_v1_approved: Object.freeze({
    title: "Sandbox rules approved this request",
    detail: "All required deterministic checks passed under the exact policy version shown here."
  }),
  application_not_eligible: Object.freeze({
    title: "Eligibility checks did not pass",
    detail: "The Subject or accountable Principal is not currently eligible for this application."
  }),
  authority_not_current: Object.freeze({
    title: "Authority is not current",
    detail: "The Consent or Mandate no longer authorizes the requested credit terms."
  }),
  identity_evidence_not_current: Object.freeze({
    title: "Identity Evidence is not current",
    detail: "A required identity reference is missing, expired, revoked, or no longer Consent-bound."
  }),
  adverse_obligation_open: Object.freeze({
    title: "An adverse obligation is open",
    detail: "The point-in-time risk state found an unresolved adverse Obligation."
  }),
  credit_state_frozen: Object.freeze({
    title: "Credit state is frozen",
    detail: "A protective control currently prevents a new credit Offer."
  }),
  sandbox_cap_exceeded: Object.freeze({
    title: "The request exceeds sandbox limits",
    detail: "The requested principal or term is outside the checked-in no-funds policy."
  }),
  unsupported_sandbox_asset: Object.freeze({
    title: "The asset is not supported",
    detail: "This no-funds policy cannot issue an Offer for the requested asset."
  }),
  invalid_requested_schedule: Object.freeze({
    title: "The repayment schedule is invalid",
    detail: "The requested frequency or installment count does not form an eligible schedule."
  })
});

export const DECISION_PASSPORT_SOURCE_COPY = Object.freeze({
  credit_intent: "Credit Intent",
  subject: "Borrower Subject",
  principal: "Accountable Principal",
  authority: "Consent / Mandate",
  human_identity_reference: "Synthetic identity reference"
});

const HUMAN_SOURCE_ROLES = Object.freeze(Object.keys(DECISION_PASSPORT_SOURCE_COPY));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function compactDecisionProofHash(value) {
  return HASH.test(value) ? `${value.slice(0, 10)}…${value.slice(-6)}` : "Unavailable";
}

export function createHumanDecisionPassportPresentation(decision) {
  const passport = decision?.decisionPassport;
  if (
    !passport ||
    passport.schemaVersion !== "risk_decision_passport.v1" ||
    passport.featureSetVersion !== "credit-application-evidence-features.v1" ||
    passport.policyVersion !== decision.policyVersion ||
    passport.sandboxOnly !== true ||
    passport.nonAuthorizing !== true ||
    passport.productionAuthority !== false ||
    !HASH.test(passport.decisionPassportHash) ||
    !HASH.test(passport.featureSnapshotHash) ||
    !HASH.test(passport.policyHash) ||
    !HASH.test(passport.riskStateHash) ||
    !Number.isFinite(new Date(passport.asOf).getTime()) ||
    !Array.isArray(decision.reasonCodes) ||
    decision.reasonCodes.length === 0 ||
    decision.reasonCodes.some((code) => !DECISION_PASSPORT_REASON_COPY[code]) ||
    !Array.isArray(passport.reasonLineage) ||
    passport.reasonLineage.length !== decision.reasonCodes.length ||
    passport.reasonLineage.some((lineage, index) =>
      lineage?.reasonCode !== decision.reasonCodes[index] ||
      !Array.isArray(lineage.featureKeys) || lineage.featureKeys.length === 0 ||
      !Array.isArray(lineage.sourceRoles) || lineage.sourceRoles.length === 0
    ) ||
    !Array.isArray(passport.sourceEvidence) ||
    passport.sourceEvidence.length !== HUMAN_SOURCE_ROLES.length
  ) return null;

  const returnedRoles = passport.sourceEvidence.map(({ role }) => role);
  if (
    new Set(returnedRoles).size !== HUMAN_SOURCE_ROLES.length ||
    !HUMAN_SOURCE_ROLES.every((role) => returnedRoles.includes(role)) ||
    passport.sourceEvidence.some((source) =>
      !DECISION_PASSPORT_SOURCE_COPY[source.role] ||
      !HASH.test(source.evidenceHash) ||
      !HASH.test(source.entityHash) ||
      !Number.isSafeInteger(source.aggregateVersion) ||
      source.aggregateVersion < 1 ||
      source.sourceFinality !== "finalized"
    )
  ) return null;

  return deepFreeze({
    status: decision.status,
    policyVersion: passport.policyVersion,
    policyHash: passport.policyHash,
    featureSetVersion: passport.featureSetVersion,
    schemaVersion: passport.schemaVersion,
    asOf: passport.asOf,
    decisionPassportHash: passport.decisionPassportHash,
    featureSnapshotHash: passport.featureSnapshotHash,
    riskStateHash: passport.riskStateHash,
    evidenceSummary: `${passport.sourceEvidence.length}/${passport.sourceEvidence.length} finalized`,
    reasons: decision.reasonCodes.map((code) => ({
      code,
      ...DECISION_PASSPORT_REASON_COPY[code]
    })),
    sources: passport.sourceEvidence.map((source) => ({
      ...source,
      label: DECISION_PASSPORT_SOURCE_COPY[source.role]
    }))
  });
}

export function hasVerifiedHumanDecisionPassport(decision) {
  return createHumanDecisionPassportPresentation(decision) !== null;
}
