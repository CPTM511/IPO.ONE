import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import { SubjectType } from "./enums.js";
import { assertNoRawPiiReference } from "./validators.js";
import {
  TRADING_CREDIT_PROFILE_SCHEMA_VERSION,
  TradingProfileStage
} from "./trading-capital-evidence.js";

export const TRADING_CAPITAL_REQUEST_SCHEMA_VERSION =
  "trading_capital_request.v1";
export const TRADING_PROVIDER_MANDATE_SCHEMA_VERSION =
  "trading_provider_mandate.v1";
export const TRADING_MATCH_PROPOSAL_SCHEMA_VERSION =
  "trading_match_proposal.v1";
export const TRADING_MATCHING_POLICY_VERSION =
  "trading_matching_policy.v1";
export const TRADING_TEMPLATE_POLICY_VERSION =
  "trading_no_funds_template_policy.v1";
export const TRADING_SYNTHETIC_ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";

export const TradingCapitalTemplateType = Object.freeze({
  CREDIT: "credit",
  PERFORMANCE_PARTICIPATION: "performance_participation",
  HYBRID: "hybrid"
});

export const TradingStrategyClass = Object.freeze({
  MARKET_NEUTRAL: "market_neutral",
  DIRECTIONAL: "directional",
  LIQUIDITY_PROVISION: "liquidity_provision"
});

export const TradingMatchProposalStatus = Object.freeze({
  PROPOSED: "proposed",
  PROVIDER_ACCEPTED: "provider_accepted",
  SUBJECT_ACCEPTED: "subject_accepted",
  BILATERALLY_ACCEPTED: "bilaterally_accepted"
});

const TEMPLATE_TYPES = new Set(Object.values(TradingCapitalTemplateType));
const STRATEGY_CLASSES = new Set(Object.values(TradingStrategyClass));
const SUBJECT_TYPES = new Set([SubjectType.HUMAN, SubjectType.AGENT]);
const PROPOSAL_STATUSES = new Set(Object.values(TradingMatchProposalStatus));
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const POSITIVE_MINOR_PATTERN = /^[1-9][0-9]{0,77}$/;
const REQUEST_LIFETIME_MS = 48 * 60 * 60 * 1000;
const MANDATE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MATCHES = 20;
const MAX_CANDIDATES = 100;

const TEMPLATE_ECONOMICS = Object.freeze({
  [TradingCapitalTemplateType.CREDIT]: Object.freeze({
    repaymentMode: "synthetic_fixed_credit",
    fixedReturnBps: 500,
    performanceParticipationBps: 0
  }),
  [TradingCapitalTemplateType.PERFORMANCE_PARTICIPATION]: Object.freeze({
    repaymentMode: "synthetic_performance_participation",
    fixedReturnBps: 0,
    performanceParticipationBps: 1500
  }),
  [TradingCapitalTemplateType.HYBRID]: Object.freeze({
    repaymentMode: "synthetic_hybrid",
    fixedReturnBps: 250,
    performanceParticipationBps: 750
  })
});

const HARD_FILTER_CODES = Object.freeze([
  "active_and_unexpired",
  "template_compatible",
  "synthetic_asset_compatible",
  "amount_range_compatible",
  "duration_range_compatible",
  "subject_type_compatible",
  "strategy_class_compatible",
  "server_evidence_eligible"
]);

function invalid(message) {
  throw new DomainError("invalid_trading_capital_matching", message);
}

function unavailable(message = "Trading Capital matching resource is unavailable") {
  throw new DomainError("trading_capital_matching_unavailable", message);
}

function plainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${name} must be a plain object`);
  }
  return value;
}

function exactKeys(name, value, keys) {
  plainObject(name, value);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid(`${name} has an open shape`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function date(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function positiveMinor(name, value) {
  if (typeof value !== "string" || !POSITIVE_MINOR_PATTERN.test(value)) {
    invalid(`${name} must be a positive decimal minor-unit string`);
  }
  return value;
}

function integer(name, value, minimum, maximum) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(`${name} is outside its closed range`);
  }
  return value;
}

function enumValue(name, value, allowed) {
  if (!allowed.has(value)) invalid(`${name} is unsupported`);
  return value;
}

function uniqueEnumList(name, value, allowed, maximum) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximum ||
    new Set(value).size !== value.length ||
    value.some((item) => !allowed.has(item))
  ) {
    invalid(`${name} is invalid`);
  }
  return [...value].sort();
}

function clone(value) {
  return structuredClone(value);
}

function commonSafety() {
  return {
    sandboxOnly: true,
    syntheticOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    realPricing: false,
    realFunding: false,
    externalSystemQueried: false,
    piiIncluded: false,
    secretsIncluded: false
  };
}

function assertCommonSafety(value) {
  if (
    value.sandboxOnly !== true ||
    value.syntheticOnly !== true ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.realPricing !== false ||
    value.realFunding !== false ||
    value.externalSystemQueried !== false ||
    value.piiIncluded !== false ||
    value.secretsIncluded !== false
  ) {
    invalid("Trading Capital matching safety boundary is invalid");
  }
}

function assertFinalizedProfile(profile) {
  plainObject("tradingCreditProfile", profile);
  if (
    profile.schemaVersion !== TRADING_CREDIT_PROFILE_SCHEMA_VERSION ||
    profile.stage !== TradingProfileStage.FINALIZED ||
    profile.version !== 3 ||
    profile.syntheticOnly !== true ||
    profile.productionAuthority !== false ||
    profile.fundsAuthority !== false ||
    profile.externalSystemQueried !== false ||
    profile.evidenceSnapshot?.pointInTime !== true ||
    profile.historyImport?.dataQuality?.selfReportedSignalsAccepted !== false ||
    !Array.isArray(profile.factorScorecard?.factors) ||
    profile.factorScorecard.factors.length !== 5 ||
    profile.factorScorecard.factors.some(
      (factor) => factor.authorizing !== false || factor.numericScoreAvailable !== false
    ) ||
    profile.factorScorecard.newRiskAuthority !== false
  ) {
    unavailable("A finalized non-authorizing Trading Credit Profile is required");
  }
  hash("evidenceSnapshot.snapshotHash", profile.evidenceSnapshot.snapshotHash);
  hash("factorScorecard.scorecardHash", profile.factorScorecard.scorecardHash);
  return profile;
}

function evidenceEligibility(profile) {
  const current = assertFinalizedProfile(profile);
  return {
    eligibilityClass: "synthetic_restricted",
    evidenceSnapshotHash: current.evidenceSnapshot.snapshotHash,
    factorScorecardHash: current.factorScorecard.scorecardHash,
    factorAssessments: current.factorScorecard.factors.map((factor) => ({
      factorId: factor.factorId,
      assessment: factor.assessment
    })),
    freshness: "unknown",
    selfDeclaredRiskClassAccepted: false,
    authorizing: false,
    reasonCodes: [
      "finalized_point_in_time_evidence",
      "synthetic_evidence_only",
      "external_freshness_unknown",
      "new_risk_authority_disabled"
    ],
    schemaVersion: "trading_matching_evidence_eligibility.v1"
  };
}

function templateTerms(templateType, requestedAmountMinor, durationDays) {
  const template = TEMPLATE_ECONOMICS[templateType];
  if (!template) invalid("templateType is unsupported");
  const core = {
    templateType,
    syntheticPrincipalMinor: requestedAmountMinor,
    assetId: TRADING_SYNTHETIC_ASSET_ID,
    durationDays,
    repaymentMode: template.repaymentMode,
    fixedReturnBps: template.fixedReturnBps,
    performanceParticipationBps: template.performanceParticipationBps,
    economicPolicyVersion: TRADING_TEMPLATE_POLICY_VERSION
  };
  return {
    ...core,
    termsHash: hashId("trading_no_funds_template_terms", core),
    illustrativeOnly: true,
    immutable: true,
    realPrice: false,
    fundsAuthority: false,
    schemaVersion: "trading_no_funds_template_terms.v1"
  };
}

function requestCore(input) {
  return {
    subjectId: input.subjectId,
    principalId: input.principalId,
    subjectType: input.subjectType,
    operatorType: input.operatorType,
    tradingCreditProfileId: input.tradingCreditProfileId,
    evidenceSnapshotHash: input.evidenceEligibility.evidenceSnapshotHash,
    factorScorecardHash: input.evidenceEligibility.factorScorecardHash,
    requestedByActorHash: input.requestedByActorHash,
    templateType: input.templateType,
    strategyClass: input.strategyClass,
    assetId: input.assetId,
    requestedAmountMinor: input.requestedAmountMinor,
    durationDays: input.durationDays,
    termsBlueprintHash: input.termsBlueprint.termsHash,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt
  };
}

export function createTradingCapitalRequest({
  tradingCreditProfile,
  requestedByActorId,
  templateType,
  strategyClass,
  assetId,
  requestedAmountMinor,
  durationDays,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Capital Request input has an open shape");
  }
  const profile = assertFinalizedProfile(tradingCreditProfile);
  identifier("requestedByActorId", requestedByActorId);
  enumValue("templateType", templateType, TEMPLATE_TYPES);
  enumValue("strategyClass", strategyClass, STRATEGY_CLASSES);
  if (assetId !== TRADING_SYNTHETIC_ASSET_ID) {
    invalid("only the closed synthetic asset is supported");
  }
  positiveMinor("requestedAmountMinor", requestedAmountMinor);
  integer("durationDays", durationDays, 7, 365);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now.getTime() + REQUEST_LIFETIME_MS).toISOString();
  const eligibility = evidenceEligibility(profile);
  const termsBlueprint = templateTerms(
    templateType,
    requestedAmountMinor,
    durationDays
  );
  const partial = {
    tradingCapitalRequestId: createOperationalId("trading_capital_request"),
    subjectId: profile.subjectId,
    principalId: profile.principalId,
    subjectType: profile.subjectType,
    operatorType: profile.operatorType,
    tradingCreditProfileId: profile.tradingCreditProfileId,
    evidenceEligibility: eligibility,
    requestedByActorHash: hashId("actor", requestedByActorId),
    templateType,
    strategyClass,
    assetId,
    requestedAmountMinor,
    durationDays,
    termsBlueprint,
    status: "open",
    version: 1,
    createdAt,
    expiresAt,
    riskClassCallerSupplied: false,
    autoMatch: false,
    autoAccept: false,
    ...commonSafety(),
    schemaVersion: TRADING_CAPITAL_REQUEST_SCHEMA_VERSION
  };
  const request = {
    ...partial,
    requestHash: hashId("trading_capital_request", requestCore(partial))
  };
  assertNoRawPiiReference(request, "tradingCapitalRequest");
  return request;
}

export function createTradingProviderMandate({
  provider,
  providerActorId,
  supportedTemplateTypes,
  allowedSubjectTypes,
  allowedStrategyClasses,
  assetId,
  minAmountMinor,
  maxAmountMinor,
  minDurationDays,
  maxDurationDays,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Provider Mandate input has an open shape");
  }
  plainObject("provider", provider);
  if (
    provider.status !== "allowlisted" ||
    provider.schemaVersion !== "provider.v1"
  ) {
    unavailable("An allowlisted Provider is required");
  }
  identifier("provider.providerId", provider.providerId);
  identifier("providerActorId", providerActorId);
  const templates = uniqueEnumList(
    "supportedTemplateTypes",
    supportedTemplateTypes,
    TEMPLATE_TYPES,
    3
  );
  const subjectTypes = uniqueEnumList(
    "allowedSubjectTypes",
    allowedSubjectTypes,
    SUBJECT_TYPES,
    2
  );
  const strategies = uniqueEnumList(
    "allowedStrategyClasses",
    allowedStrategyClasses,
    STRATEGY_CLASSES,
    3
  );
  if (assetId !== TRADING_SYNTHETIC_ASSET_ID) {
    invalid("only the closed synthetic asset is supported");
  }
  positiveMinor("minAmountMinor", minAmountMinor);
  positiveMinor("maxAmountMinor", maxAmountMinor);
  if (BigInt(minAmountMinor) > BigInt(maxAmountMinor)) {
    invalid("Provider Mandate amount range is invalid");
  }
  integer("minDurationDays", minDurationDays, 7, 365);
  integer("maxDurationDays", maxDurationDays, 7, 365);
  if (minDurationDays > maxDurationDays) {
    invalid("Provider Mandate duration range is invalid");
  }
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now.getTime() + MANDATE_LIFETIME_MS).toISOString();
  const providerActorHash = hashId("actor", providerActorId);
  const mandateCore = {
    providerId: provider.providerId,
    providerHash: provider.providerHash,
    providerActorHash,
    supportedTemplateTypes: templates,
    allowedSubjectTypes: subjectTypes,
    allowedStrategyClasses: strategies,
    assetId,
    minAmountMinor,
    maxAmountMinor,
    minDurationDays,
    maxDurationDays,
    evidenceEligibilityClass: "synthetic_restricted",
    createdAt,
    expiresAt,
    policyVersion: TRADING_MATCHING_POLICY_VERSION
  };
  const mandate = {
    tradingProviderMandateId: createOperationalId("trading_provider_mandate"),
    mandateHash: hashId("trading_provider_mandate", mandateCore),
    ...mandateCore,
    status: "open",
    version: 1,
    hardFiltersOnly: true,
    selfDeclaredRiskClassAccepted: false,
    providerRankingAuthority: false,
    autoAccept: false,
    ...commonSafety(),
    schemaVersion: TRADING_PROVIDER_MANDATE_SCHEMA_VERSION
  };
  assertNoRawPiiReference(mandate, "tradingProviderMandate");
  return mandate;
}

function assertCapitalRequest(request) {
  plainObject("capitalRequest", request);
  if (
    request.schemaVersion !== TRADING_CAPITAL_REQUEST_SCHEMA_VERSION ||
    request.status !== "open" ||
    request.version !== 1 ||
    request.riskClassCallerSupplied !== false ||
    request.autoMatch !== false ||
    request.autoAccept !== false
  ) {
    unavailable();
  }
  identifier("tradingCapitalRequestId", request.tradingCapitalRequestId);
  hash("requestHash", request.requestHash);
  assertCommonSafety(request);
  if (hashId("trading_capital_request", requestCore(request)) !== request.requestHash) {
    unavailable("Capital Request hash is invalid");
  }
  return request;
}

function providerMandateCore(mandate) {
  return {
    providerId: mandate.providerId,
    providerHash: mandate.providerHash,
    providerActorHash: mandate.providerActorHash,
    supportedTemplateTypes: mandate.supportedTemplateTypes,
    allowedSubjectTypes: mandate.allowedSubjectTypes,
    allowedStrategyClasses: mandate.allowedStrategyClasses,
    assetId: mandate.assetId,
    minAmountMinor: mandate.minAmountMinor,
    maxAmountMinor: mandate.maxAmountMinor,
    minDurationDays: mandate.minDurationDays,
    maxDurationDays: mandate.maxDurationDays,
    evidenceEligibilityClass: mandate.evidenceEligibilityClass,
    createdAt: mandate.createdAt,
    expiresAt: mandate.expiresAt,
    policyVersion: mandate.policyVersion
  };
}

function assertProviderMandate(mandate) {
  plainObject("providerMandate", mandate);
  if (
    mandate.schemaVersion !== TRADING_PROVIDER_MANDATE_SCHEMA_VERSION ||
    mandate.status !== "open" ||
    mandate.version !== 1 ||
    mandate.hardFiltersOnly !== true ||
    mandate.selfDeclaredRiskClassAccepted !== false ||
    mandate.providerRankingAuthority !== false ||
    mandate.autoAccept !== false
  ) {
    unavailable();
  }
  identifier("tradingProviderMandateId", mandate.tradingProviderMandateId);
  hash("mandateHash", mandate.mandateHash);
  assertCommonSafety(mandate);
  if (
    hashId("trading_provider_mandate", providerMandateCore(mandate)) !==
    mandate.mandateHash
  ) {
    unavailable("Provider Mandate hash is invalid");
  }
  return mandate;
}

function hardFilter(request, mandate, now) {
  const reasons = [];
  if (
    new Date(request.expiresAt) <= now ||
    new Date(mandate.expiresAt) <= now
  ) return { compatible: false, rejectedBy: "active_and_unexpired" };
  reasons.push(HARD_FILTER_CODES[0]);
  if (!mandate.supportedTemplateTypes.includes(request.templateType)) {
    return { compatible: false, rejectedBy: "template_compatible" };
  }
  reasons.push(HARD_FILTER_CODES[1]);
  if (mandate.assetId !== request.assetId) {
    return { compatible: false, rejectedBy: "synthetic_asset_compatible" };
  }
  reasons.push(HARD_FILTER_CODES[2]);
  if (
    BigInt(request.requestedAmountMinor) < BigInt(mandate.minAmountMinor) ||
    BigInt(request.requestedAmountMinor) > BigInt(mandate.maxAmountMinor)
  ) return { compatible: false, rejectedBy: "amount_range_compatible" };
  reasons.push(HARD_FILTER_CODES[3]);
  if (
    request.durationDays < mandate.minDurationDays ||
    request.durationDays > mandate.maxDurationDays
  ) return { compatible: false, rejectedBy: "duration_range_compatible" };
  reasons.push(HARD_FILTER_CODES[4]);
  if (!mandate.allowedSubjectTypes.includes(request.subjectType)) {
    return { compatible: false, rejectedBy: "subject_type_compatible" };
  }
  reasons.push(HARD_FILTER_CODES[5]);
  if (!mandate.allowedStrategyClasses.includes(request.strategyClass)) {
    return { compatible: false, rejectedBy: "strategy_class_compatible" };
  }
  reasons.push(HARD_FILTER_CODES[6]);
  if (
    request.evidenceEligibility?.eligibilityClass !==
      mandate.evidenceEligibilityClass ||
    request.evidenceEligibility?.selfDeclaredRiskClassAccepted !== false ||
    request.evidenceEligibility?.authorizing !== false
  ) return { compatible: false, rejectedBy: "server_evidence_eligible" };
  reasons.push(HARD_FILTER_CODES[7]);
  return { compatible: true, reasons };
}

function matchSummary(request, mandate, rank, reasons) {
  const terms = templateTerms(
    request.templateType,
    request.requestedAmountMinor,
    request.durationDays
  );
  const core = {
    capitalRequestId: request.tradingCapitalRequestId,
    requestHash: request.requestHash,
    requestVersion: request.version,
    providerMandateId: mandate.tradingProviderMandateId,
    mandateHash: mandate.mandateHash,
    mandateVersion: mandate.version,
    evidenceSnapshotHash: request.evidenceEligibility.evidenceSnapshotHash,
    hardFilterReasonCodes: reasons,
    termsHash: terms.termsHash,
    matchingPolicyVersion: TRADING_MATCHING_POLICY_VERSION
  };
  return {
    providerMandateId: mandate.tradingProviderMandateId,
    mandateHash: mandate.mandateHash,
    mandateVersion: mandate.version,
    providerReferenceHash: hashId("provider", mandate.providerId),
    compatibilityHash: hashId("trading_match_compatibility", core),
    hardFilterReasonCodes: reasons,
    rank,
    rankReason: "hard_filters_then_created_at_mandate_hash_and_id",
    termsPreview: terms,
    autoAccepted: false,
    fundsAuthority: false,
    schemaVersion: "trading_compatible_mandate.v1"
  };
}

export function listCompatibleTradingProviderMandates({
  capitalRequest,
  providerMandates,
  now = new Date()
}) {
  const request = assertCapitalRequest(capitalRequest);
  if (
    !Array.isArray(providerMandates) ||
    providerMandates.length > MAX_CANDIDATES
  ) invalid("Provider Mandate candidate set is unbounded");
  const candidates = providerMandates
    .map(assertProviderMandate)
    .map((mandate) => ({ mandate, filter: hardFilter(request, mandate, now) }))
    .filter(({ filter }) => filter.compatible)
    .sort((left, right) =>
      left.mandate.createdAt.localeCompare(right.mandate.createdAt) ||
      left.mandate.mandateHash.localeCompare(right.mandate.mandateHash) ||
      left.mandate.tradingProviderMandateId.localeCompare(
        right.mandate.tradingProviderMandateId
      )
    )
    .slice(0, MAX_MATCHES);
  const matches = candidates.map(({ mandate, filter }, index) =>
    matchSummary(request, mandate, index + 1, filter.reasons)
  );
  return {
    tradingCapitalRequestId: request.tradingCapitalRequestId,
    requestHash: request.requestHash,
    requestVersion: request.version,
    evaluatedCandidateCount: providerMandates.length,
    compatibleMandateCount: matches.length,
    matches,
    hardFiltersAppliedBeforeRanking: true,
    rankingAuthorizing: false,
    providerIdentityEnumerated: false,
    crossTenantDiscovery: false,
    asOf: now.toISOString(),
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "trading_compatible_mandate_list.v1"
  };
}

export function createTradingMatchProposal({
  capitalRequest,
  providerMandate,
  requestedMandateHash,
  requestedRequestHash,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Match Proposal input has an open shape");
  }
  const request = assertCapitalRequest(capitalRequest);
  const mandate = assertProviderMandate(providerMandate);
  hash("requestedMandateHash", requestedMandateHash);
  hash("requestedRequestHash", requestedRequestHash);
  if (
    requestedMandateHash !== mandate.mandateHash ||
    requestedRequestHash !== request.requestHash
  ) unavailable("Capital Request or Provider Mandate changed");
  const result = listCompatibleTradingProviderMandates({
    capitalRequest: request,
    providerMandates: [mandate],
    now
  });
  if (result.matches.length !== 1) unavailable("Provider Mandate is not compatible");
  const compatibility = result.matches[0];
  const terms = clone(compatibility.termsPreview);
  const createdAt = now.toISOString();
  const expiresAt = new Date(
    Math.min(
      new Date(request.expiresAt).getTime(),
      new Date(mandate.expiresAt).getTime()
    )
  ).toISOString();
  const core = {
    capitalRequestId: request.tradingCapitalRequestId,
    requestHash: request.requestHash,
    requestVersion: request.version,
    providerMandateId: mandate.tradingProviderMandateId,
    mandateHash: mandate.mandateHash,
    mandateVersion: mandate.version,
    subjectId: request.subjectId,
    principalId: request.principalId,
    subjectType: request.subjectType,
    providerId: mandate.providerId,
    subjectActorHash: request.requestedByActorHash,
    providerActorHash: mandate.providerActorHash,
    compatibilityHash: compatibility.compatibilityHash,
    termsHash: terms.termsHash,
    createdAt,
    expiresAt,
    matchingPolicyVersion: TRADING_MATCHING_POLICY_VERSION
  };
  const proposal = {
    tradingMatchProposalId: createOperationalId("trading_match_proposal"),
    proposalHash: hashId("trading_match_proposal", core),
    ...core,
    terms,
    hardFilterReasonCodes: compatibility.hardFilterReasonCodes,
    status: TradingMatchProposalStatus.PROPOSED,
    providerAcceptance: null,
    subjectAcceptance: null,
    version: 1,
    updatedAt: createdAt,
    immutableTerms: true,
    autoAccepted: false,
    bilateralAcceptanceRequired: true,
    requestAndMandateRevalidationRequired: true,
    ...commonSafety(),
    schemaVersion: TRADING_MATCH_PROPOSAL_SCHEMA_VERSION
  };
  assertNoRawPiiReference(proposal, "tradingMatchProposal");
  return proposal;
}

function assertProposal(proposal) {
  plainObject("matchProposal", proposal);
  if (
    proposal.schemaVersion !== TRADING_MATCH_PROPOSAL_SCHEMA_VERSION ||
    !PROPOSAL_STATUSES.has(proposal.status) ||
    proposal.immutableTerms !== true ||
    proposal.autoAccepted !== false ||
    proposal.bilateralAcceptanceRequired !== true ||
    proposal.requestAndMandateRevalidationRequired !== true
  ) unavailable();
  hash("proposalHash", proposal.proposalHash);
  hash("termsHash", proposal.terms?.termsHash);
  assertCommonSafety(proposal);
  const proposalCore = {
    capitalRequestId: proposal.capitalRequestId,
    requestHash: proposal.requestHash,
    requestVersion: proposal.requestVersion,
    providerMandateId: proposal.providerMandateId,
    mandateHash: proposal.mandateHash,
    mandateVersion: proposal.mandateVersion,
    subjectId: proposal.subjectId,
    principalId: proposal.principalId,
    subjectType: proposal.subjectType,
    providerId: proposal.providerId,
    subjectActorHash: proposal.subjectActorHash,
    providerActorHash: proposal.providerActorHash,
    compatibilityHash: proposal.compatibilityHash,
    termsHash: proposal.terms.termsHash,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
    matchingPolicyVersion: proposal.matchingPolicyVersion
  };
  if (hashId("trading_match_proposal", proposalCore) !== proposal.proposalHash) {
    unavailable("Match Proposal hash is invalid");
  }
  return proposal;
}

function assertCurrentProposalSources(proposal, request, mandate, now) {
  if (
    request.requestHash !== proposal.requestHash ||
    request.version !== proposal.requestVersion ||
    mandate.mandateHash !== proposal.mandateHash ||
    mandate.version !== proposal.mandateVersion ||
    request.tradingCapitalRequestId !== proposal.capitalRequestId ||
    mandate.tradingProviderMandateId !== proposal.providerMandateId ||
    new Date(request.expiresAt) <= now ||
    new Date(mandate.expiresAt) <= now ||
    new Date(proposal.expiresAt) <= now
  ) unavailable("Expired or changed request/mandate invalidates the proposal");
  const compatibility = listCompatibleTradingProviderMandates({
    capitalRequest: request,
    providerMandates: [mandate],
    now
  });
  if (
    compatibility.matches.length !== 1 ||
    compatibility.matches[0].compatibilityHash !== proposal.compatibilityHash ||
    compatibility.matches[0].termsPreview.termsHash !== proposal.terms.termsHash
  ) unavailable("Proposal compatibility is no longer current");
}

function acceptance({
  proposal,
  capitalRequest,
  providerMandate,
  acceptedByActorId,
  acceptedProposalHash,
  acceptedTermsHash,
  side,
  now
}) {
  const current = assertProposal(proposal);
  const request = assertCapitalRequest(capitalRequest);
  const mandate = assertProviderMandate(providerMandate);
  identifier("acceptedByActorId", acceptedByActorId);
  hash("acceptedProposalHash", acceptedProposalHash);
  hash("acceptedTermsHash", acceptedTermsHash);
  if (
    acceptedProposalHash !== current.proposalHash ||
    acceptedTermsHash !== current.terms.termsHash
  ) unavailable("Acceptance does not bind the exact immutable proposal terms");
  assertCurrentProposalSources(current, request, mandate, now);
  const actorHash = hashId("actor", acceptedByActorId);
  const isProvider = side === "provider";
  const expectedActorHash = isProvider
    ? current.providerActorHash
    : current.subjectActorHash;
  if (actorHash !== expectedActorHash) unavailable();
  if (
    (isProvider && current.providerAcceptance !== null) ||
    (!isProvider && current.subjectAcceptance !== null)
  ) unavailable("This proposal side is already accepted");
  const record = {
    acceptanceId: createOperationalId(`trading_${side}_acceptance`),
    actorHash,
    proposalHash: current.proposalHash,
    termsHash: current.terms.termsHash,
    acceptedAt: now.toISOString(),
    exactTerms: true,
    automatic: false,
    fundsAuthority: false,
    schemaVersion: `trading_match_${side}_acceptance.v1`
  };
  const providerAcceptance = isProvider
    ? record
    : clone(current.providerAcceptance);
  const subjectAcceptance = isProvider
    ? clone(current.subjectAcceptance)
    : record;
  let status;
  if (providerAcceptance && subjectAcceptance) {
    status = TradingMatchProposalStatus.BILATERALLY_ACCEPTED;
  } else if (providerAcceptance) {
    status = TradingMatchProposalStatus.PROVIDER_ACCEPTED;
  } else {
    status = TradingMatchProposalStatus.SUBJECT_ACCEPTED;
  }
  const next = {
    ...clone(current),
    status,
    providerAcceptance,
    subjectAcceptance,
    version: current.version + 1,
    updatedAt: now.toISOString()
  };
  assertNoRawPiiReference(next, "tradingMatchProposal");
  return next;
}

export function acceptTradingMatchAsProvider(input) {
  return acceptance({ ...input, side: "provider" });
}

export function acceptTradingMatchAsSubject(input) {
  return acceptance({ ...input, side: "subject" });
}

export function tradingCapitalRequestView(value) {
  return clone(assertCapitalRequest(value));
}

export function tradingProviderMandateView(value) {
  return clone(assertProviderMandate(value));
}

export function tradingMatchProposalView(value) {
  return clone(assertProposal(value));
}
