import {
  ConsentPurpose,
  CreditAuthorityType,
  CreditIntentStatus,
  RepaymentFrequency,
  RiskDecisionStatus
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createCreditOffer } from "./credit-contracts.js";
import { hashId } from "./ids.js";
import {
  CREDIT_APPLICATION_FEATURE_SET_VERSION,
  CREDIT_REASON_LINEAGE,
  createCreditApplicationRiskFeatureSnapshot,
  createRiskDecisionPassport
} from "./risk-evidence.js";
import {
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits
} from "./validators.js";

export const SANDBOX_CREDIT_DECISION_POLICY = Object.freeze({
  assetId: "urn:ipo-one:sandbox-asset:usd-cent",
  maximumPrincipalMinor: "500000",
  maximumTermDays: 366,
  originationFeeMinor: "0",
  offerValidityMs: 24 * 60 * 60 * 1000,
  disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
  modelVersion: "credit-application-rules.v1"
});

export const APPROVED_CREDIT_REASON_CODES = Object.freeze({
  common: Object.freeze([
    "authority_scope_current",
    "principal_and_subject_eligible"
  ]),
  human: "identity_evidence_current",
  agent: "principal_binding_current",
  tail: Object.freeze([
    "no_adverse_obligation",
    "within_sandbox_policy_cap",
    "sandbox_rules_v1_approved"
  ])
});

export const DENIED_CREDIT_REASON_CODES = Object.freeze([
  "application_not_eligible",
  "authority_not_current",
  "identity_evidence_not_current",
  "adverse_obligation_open",
  "credit_state_frozen",
  "sandbox_cap_exceeded",
  "unsupported_sandbox_asset",
  "invalid_requested_schedule"
]);

export const SANDBOX_CREDIT_POLICY_MANIFEST = Object.freeze({
  policyVersion: SANDBOX_CREDIT_DECISION_POLICY.modelVersion,
  featureSetVersion: CREDIT_APPLICATION_FEATURE_SET_VERSION,
  assetId: SANDBOX_CREDIT_DECISION_POLICY.assetId,
  maximumPrincipalMinor: SANDBOX_CREDIT_DECISION_POLICY.maximumPrincipalMinor,
  maximumTermDays: SANDBOX_CREDIT_DECISION_POLICY.maximumTermDays,
  originationFeeMinor: SANDBOX_CREDIT_DECISION_POLICY.originationFeeMinor,
  offerValidityMs: SANDBOX_CREDIT_DECISION_POLICY.offerValidityMs,
  disclosureRef: SANDBOX_CREDIT_DECISION_POLICY.disclosureRef,
  annualRateBands: Object.freeze([
    Object.freeze({ maximumTermDays: 30, annualRateBps: 600 }),
    Object.freeze({ maximumTermDays: 90, annualRateBps: 900 }),
    Object.freeze({ maximumTermDays: 180, annualRateBps: 1_200 }),
    Object.freeze({ maximumTermDays: 366, annualRateBps: 1_500 })
  ]),
  approvedReasonCodes: Object.freeze([
    ...APPROVED_CREDIT_REASON_CODES.common,
    APPROVED_CREDIT_REASON_CODES.human,
    APPROVED_CREDIT_REASON_CODES.agent,
    ...APPROVED_CREDIT_REASON_CODES.tail
  ]),
  deniedReasonCodes: DENIED_CREDIT_REASON_CODES,
  reasonLineage: CREDIT_REASON_LINEAGE
});

export const SANDBOX_CREDIT_POLICY_HASH = hashId(
  "risk_policy_manifest",
  SANDBOX_CREDIT_POLICY_MANIFEST
);

const DENIED = new Set(DENIED_CREDIT_REASON_CODES);
const APPROVED = new Set([
  ...APPROVED_CREDIT_REASON_CODES.common,
  APPROVED_CREDIT_REASON_CODES.human,
  APPROVED_CREDIT_REASON_CODES.agent,
  ...APPROVED_CREDIT_REASON_CODES.tail
]);
const INTERVAL_DAYS = Object.freeze({
  [RepaymentFrequency.WEEKLY]: 7,
  [RepaymentFrequency.BIWEEKLY]: 14,
  [RepaymentFrequency.MONTHLY]: 30
});

function assertIntent(intent) {
  if (
    !intent ||
    typeof intent !== "object" ||
    intent.schemaVersion !== "credit_intent.v1" ||
    intent.status !== CreditIntentStatus.SUBMITTED ||
    intent.sandboxOnly !== true ||
    intent.productionFundsRequested !== false
  ) {
    throw new DomainError("invalid_credit_intent", "evaluation requires one submitted sandbox Credit Intent");
  }
  assertNoRawPiiReference(intent, "creditDecision.intent");
}

function addUtcDays(now, days) {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function expectedInstallmentCount(repaymentFrequency, termDays) {
  if (!Number.isSafeInteger(termDays) || termDays < 1) {
    throw new DomainError("invalid_credit_term", "requestedTermDays must be a positive integer");
  }
  if (repaymentFrequency === RepaymentFrequency.END_OF_TERM) return 1;
  const interval = INTERVAL_DAYS[repaymentFrequency];
  if (!interval) {
    throw new DomainError("invalid_credit_schedule", "repaymentFrequency is not supported");
  }
  return Math.ceil(termDays / interval);
}

export function annualRateBpsForTerm(termDays) {
  if (!Number.isSafeInteger(termDays) || termDays < 1 || termDays > 366) {
    throw new DomainError("invalid_credit_term", "sandbox term must be between 1 and 366 days");
  }
  if (termDays <= 30) return 600;
  if (termDays <= 90) return 900;
  if (termDays <= 180) return 1_200;
  return 1_500;
}

export function deriveSandboxCreditPolicyDenial(intent) {
  assertIntent(intent);
  if (intent.assetId !== SANDBOX_CREDIT_DECISION_POLICY.assetId) {
    return "unsupported_sandbox_asset";
  }
  if (BigInt(assertPositiveMinorUnits(intent.requestedPrincipalMinor, "requestedPrincipalMinor")) >
      BigInt(SANDBOX_CREDIT_DECISION_POLICY.maximumPrincipalMinor)) {
    return "sandbox_cap_exceeded";
  }
  if (
    !Number.isSafeInteger(intent.requestedTermDays) ||
    intent.requestedTermDays < 1 ||
    intent.requestedTermDays > SANDBOX_CREDIT_DECISION_POLICY.maximumTermDays
  ) {
    return "sandbox_cap_exceeded";
  }
  try {
    if (
      expectedInstallmentCount(intent.repaymentFrequency, intent.requestedTermDays) !==
      intent.installmentCount
    ) {
      return "invalid_requested_schedule";
    }
  } catch {
    return "invalid_requested_schedule";
  }
  return undefined;
}

function normalizeReasonCodes(status, reasonCodes) {
  if (!Array.isArray(reasonCodes) || reasonCodes.length === 0 || reasonCodes.length > 8) {
    throw new DomainError("invalid_credit_reason_codes", "Decision reasons are invalid");
  }
  const allowed = status === RiskDecisionStatus.APPROVED ? APPROVED : DENIED;
  if (new Set(reasonCodes).size !== reasonCodes.length || reasonCodes.some((code) => !allowed.has(code))) {
    throw new DomainError("invalid_credit_reason_codes", "Decision reasons are outside the closed policy");
  }
  return reasonCodes;
}

export function approvedCreditReasonCodes(authorityType) {
  if (![CreditAuthorityType.CONSENT, CreditAuthorityType.MANDATE].includes(authorityType)) {
    throw new DomainError("invalid_credit_authority", "Credit authority is invalid");
  }
  return [
    ...APPROVED_CREDIT_REASON_CODES.common,
    authorityType === CreditAuthorityType.CONSENT
      ? APPROVED_CREDIT_REASON_CODES.human
      : APPROVED_CREDIT_REASON_CODES.agent,
    ...APPROVED_CREDIT_REASON_CODES.tail
  ];
}

export function createCreditApplicationRiskDecision({
  intent,
  status,
  reasonCodes,
  riskFeatureSnapshot,
  now = new Date()
}) {
  assertIntent(intent);
  if (!Object.values(RiskDecisionStatus).includes(status)) {
    throw new DomainError("invalid_risk_decision_status", "Risk Decision status is invalid");
  }
  const normalizedReasonCodes = normalizeReasonCodes(status, reasonCodes);
  const authority = intent.authorityType === CreditAuthorityType.CONSENT
    ? { consentId: intent.authorityRef }
    : { mandateId: intent.authorityRef };
  const core = {
    creditIntentId: intent.creditIntentId,
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    authorityType: intent.authorityType,
    authorityRef: intent.authorityRef,
    ...authority,
    assetId: intent.assetId,
    status,
    modelVersion: SANDBOX_CREDIT_DECISION_POLICY.modelVersion,
    limitMinor: status === RiskDecisionStatus.APPROVED ? intent.requestedPrincipalMinor : "0",
    utilizationMinor: "0",
    action: "credit_application_evaluation",
    reasons: normalizedReasonCodes.map((code) => ({ code })),
    sandboxOnly: true,
    productionAuthority: false,
    createdAt: now.toISOString()
  };
  if (riskFeatureSnapshot !== undefined) {
    if (
      riskFeatureSnapshot?.schemaVersion !== "risk_feature_snapshot.v1" ||
      riskFeatureSnapshot.policyVersion !== SANDBOX_CREDIT_DECISION_POLICY.modelVersion ||
      riskFeatureSnapshot.policyHash !== SANDBOX_CREDIT_POLICY_HASH ||
      riskFeatureSnapshot.asOf !== core.createdAt
    ) {
      throw new DomainError(
        "invalid_risk_evidence",
        "Risk feature snapshot is inconsistent with the current policy Decision"
      );
    }
    core.policyHash = SANDBOX_CREDIT_POLICY_HASH;
    core.riskFeatureSnapshotId = riskFeatureSnapshot.riskFeatureSnapshotId;
    core.featureSnapshotHash = riskFeatureSnapshot.featureSnapshotHash;
  }
  assertNoRawPiiReference(core, "creditDecision");
  const decisionHash = hashId("credit_application_risk_decision", core);
  const decision = {
    riskDecisionId: `risk_decision_${decisionHash.slice(2)}`,
    decisionHash,
    ...core
  };
  if (riskFeatureSnapshot === undefined) {
    return { ...decision, schemaVersion: "risk_decision.v2" };
  }
  const decisionPassport = createRiskDecisionPassport({
    decision,
    riskFeatureSnapshot,
    policyHash: SANDBOX_CREDIT_POLICY_HASH
  });
  return Object.freeze({
    ...decision,
    riskFeatureSnapshot,
    decisionPassport,
    schemaVersion: "risk_decision.v3"
  });
}

export function createDeterministicCreditDecisionOutcome({
  intent,
  denialCode,
  frozen = false,
  riskFeatureSnapshot,
  now = new Date()
}) {
  assertIntent(intent);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new DomainError("invalid_tenant_command_clock", "trusted evaluation time is invalid");
  }
  const policyDenial = deriveSandboxCreditPolicyDenial(intent);
  const effectiveDenial = denialCode ?? policyDenial;
  if (effectiveDenial !== undefined && !DENIED.has(effectiveDenial)) {
    throw new DomainError("invalid_credit_reason_codes", "denialCode is outside the closed policy");
  }
  const status = effectiveDenial === undefined
    ? RiskDecisionStatus.APPROVED
    : (frozen || effectiveDenial === "credit_state_frozen"
        ? RiskDecisionStatus.FROZEN
        : RiskDecisionStatus.REJECTED);
  const reasonCodes = effectiveDenial === undefined
    ? approvedCreditReasonCodes(intent.authorityType)
    : [effectiveDenial];
  const decision = createCreditApplicationRiskDecision({
    intent,
    status,
    reasonCodes,
    riskFeatureSnapshot,
    now
  });
  if (status !== RiskDecisionStatus.APPROVED) {
    return Object.freeze({ decision, offer: undefined });
  }

  const maturityAt = addUtcDays(now, intent.requestedTermDays);
  const intervalDays = intent.repaymentFrequency === RepaymentFrequency.END_OF_TERM
    ? intent.requestedTermDays
    : INTERVAL_DAYS[intent.repaymentFrequency];
  const firstPaymentAt = addUtcDays(now, Math.min(intervalDays, intent.requestedTermDays));
  const validUntil = new Date(now.getTime() + SANDBOX_CREDIT_DECISION_POLICY.offerValidityMs).toISOString();
  const annualRateBps = annualRateBpsForTerm(intent.requestedTermDays);
  const provisional = createCreditOffer({
    creditIntentId: intent.creditIntentId,
    subjectId: intent.subjectId,
    riskDecisionId: decision.riskDecisionId,
    assetId: intent.assetId,
    approvedPrincipalMinor: intent.requestedPrincipalMinor,
    annualRateBps,
    originationFeeMinor: SANDBOX_CREDIT_DECISION_POLICY.originationFeeMinor,
    repaymentFrequency: intent.repaymentFrequency,
    installmentCount: intent.installmentCount,
    firstPaymentAt,
    maturityAt,
    validUntil,
    reasonCodes,
    disclosureRef: SANDBOX_CREDIT_DECISION_POLICY.disclosureRef,
    now
  });
  const offer = {
    ...provisional,
    creditOfferId: `credit_offer_${provisional.creditOfferHash.slice(2)}`
  };
  return Object.freeze({ decision, offer });
}

export function createEvidenceDerivedCreditDecisionOutcome({
  intent,
  denialCode,
  frozen = false,
  eligibilityFacts,
  sourceEvidence,
  riskState,
  now = new Date()
}) {
  assertIntent(intent);
  const riskFeatureSnapshot = createCreditApplicationRiskFeatureSnapshot({
    intent,
    eligibilityFacts,
    sourceEvidence,
    riskState,
    policy: SANDBOX_CREDIT_DECISION_POLICY,
    policyHash: SANDBOX_CREDIT_POLICY_HASH,
    now
  });
  return createDeterministicCreditDecisionOutcome({
    intent,
    denialCode,
    frozen,
    riskFeatureSnapshot,
    now
  });
}

export function assertHumanDecisionConsentPurposes(consent) {
  for (const purpose of [ConsentPurpose.CREDIT_DECISION, ConsentPurpose.IDENTITY_REFERENCE_USE]) {
    if (!consent?.purposes?.includes(purpose)) {
      throw new DomainError("consent_scope_mismatch", "Consent does not authorize credit decision identity use");
    }
  }
  return true;
}

export function createMandateTermsHash(mandate) {
  for (const name of ["principalId", "subjectId"]) assertNonEmptyString(name, mandate?.[name]);
  return hashId("mandate_terms", {
    capabilities: mandate.capabilities,
    allowedProviderIds: mandate.allowedProviderIds,
    allowedCategories: mandate.allowedCategories,
    assetIds: mandate.assetIds,
    perActionLimitMinor: mandate.perActionLimitMinor,
    aggregateLimitMinor: mandate.aggregateLimitMinor,
    validFrom: mandate.validFrom,
    expiresAt: mandate.expiresAt,
    nonce: mandate.nonce,
    termsRef: mandate.termsRef ?? null,
    sandboxOnly: true,
    productionAuthority: false
  });
}
