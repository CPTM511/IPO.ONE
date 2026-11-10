import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";

export const SYNTHETIC_FEE_PROFILE = "synthetic_usd_platform_fee.v1";
export const HOSTED_SYNTHETIC_FEE_PROFILE = "synthetic_usd_platform_fee_hosted.v1";
export const SYNTHETIC_FEE_ASSET = "urn:ipo-one:sandbox-asset:usd-cent";
export const SYNTHETIC_FEE_POLICY = Object.freeze({
  profile: SYNTHETIC_FEE_PROFILE,
  schemaVersion: "synthetic_fee_policy.v1",
  scope: "L0_LOCAL_NO_FUNDS",
  currency: "USD", minorUnitScale: 2,
  borrowerRateBps: 10, borrowerCapMinor: "1000", minimumFeeMinor: "0",
  institutionRateBps: 1000,
  collectionMethod: "separate_receivable",
  rounding: "cumulative_floor_minor_unit",
  settlementPeriod: "utc_calendar_month",
  fxMode: "not_applicable_usd_only",
  syntheticOnly: true, productionPolicyAvailable: false,
  productionFundsMoved: false, withdrawable: false
});
export const SYNTHETIC_FEE_POLICY_HASH = hashId("synthetic_fee_policy", SYNTHETIC_FEE_POLICY);
export const HOSTED_SYNTHETIC_FEE_POLICY = Object.freeze({
  ...SYNTHETIC_FEE_POLICY,
  profile: HOSTED_SYNTHETIC_FEE_PROFILE,
  schemaVersion: "synthetic_fee_policy.hosted.v1",
  scope: "L2_PUBLIC_AUTHENTICATED_NO_FUNDS"
});
export const HOSTED_SYNTHETIC_FEE_POLICY_HASH = hashId("synthetic_fee_policy", HOSTED_SYNTHETIC_FEE_POLICY);
export function syntheticFeeTermsVersion(terms) {
  if (terms?.profile === SYNTHETIC_FEE_PROFILE) return "credit_terms.synthetic_fee.v1";
  if (terms?.profile === HOSTED_SYNTHETIC_FEE_PROFILE) return "credit_terms.synthetic_fee_hosted.v1";
  throw new DomainError("synthetic_fee_profile_invalid", "A known synthetic fee profile is required");
}
const immutable = value => Object.freeze(structuredClone(value));
const fail = message => { throw new DomainError("synthetic_fee_integrity_mismatch", message); };
function minor(value, signed = false) {
  if (typeof value !== "string" || !(signed ? /^-?(0|[1-9][0-9]{0,77})$/ : /^(0|[1-9][0-9]{0,77})$/).test(value)) {
    fail("Fees require canonical integer minor-unit strings");
  }
  return BigInt(value);
}
function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(value)) fail("Fee source identity is required");
  return value;
}
function timestamp(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail("A trusted fee clock is required");
  return now.toISOString();
}
export function syntheticFeeTarget(kind, baseMinor) {
  const base = minor(baseMinor);
  if (kind === "borrower") {
    const amount = base * 10n / 10000n;
    return (amount > 1000n ? 1000n : amount).toString();
  }
  if (kind === "institution") return (base * 1000n / 10000n).toString();
  fail("Unknown fee kind");
}

export function createSyntheticFeeTerms({ profile, institutionId, assetId, economicLoanId, principalMinor, originationFeeMinor = "0", annualRateBps = 0, scheduledTermDays = 0 }) {
  if (profile === undefined || profile === null) return undefined;
  const hosted = profile === HOSTED_SYNTHETIC_FEE_PROFILE;
  const localInstitution = "urn:ipo-one:local:synthetic-capital-partner:b4";
  if ((!hosted && profile !== SYNTHETIC_FEE_PROFILE) || assetId !== SYNTHETIC_FEE_ASSET || originationFeeMinor !== "0" ||
      (hosted ? !/^urn:ipo-one:hosted:synthetic-capital-partner:[A-Za-z0-9_.-]{1,80}:[A-Za-z0-9_.-]{1,80}$/.test(institutionId ?? "")
        : institutionId !== undefined && institutionId !== localInstitution)) {
    throw new DomainError("synthetic_fee_profile_invalid", "An exact synthetic USD profile and its trusted synthetic institution are required");
  }
  if (minor(principalMinor) <= 0n) fail("Fee terms require a positive principal");
  if (!Number.isSafeInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 100000 || !Number.isInteger(scheduledTermDays) || scheduledTermDays < 0 || scheduledTermDays > 366) fail("Invalid fee cost disclosure schedule");
  const estimatedInterest = minor(principalMinor) * BigInt(annualRateBps) * BigInt(scheduledTermDays) / 3650000n;
  const estimatedFee = BigInt(syntheticFeeTarget("borrower", principalMinor));
  const core = {
    ...(hosted ? HOSTED_SYNTHETIC_FEE_POLICY : SYNTHETIC_FEE_POLICY),
    schemaVersion: hosted ? "synthetic_fee_terms.hosted.v1" : "synthetic_fee_terms.v1",
    policyHash: hosted ? HOSTED_SYNTHETIC_FEE_POLICY_HASH : SYNTHETIC_FEE_POLICY_HASH,
    economicLoanId: identifier(economicLoanId),
    borrowerPayer: "obligation_subject", institutionPayer: "synthetic_capital_partner",
    institutionId: hosted ? institutionId : localInstitution,
    assetId, principalMinor,
    borrowerFeeAtFullFundingMinor: syntheticFeeTarget("borrower", principalMinor),
    providerOriginationFeeMinor: "0",
    annualRateBps, scheduledTermDays,
    netProceedsMinor: principalMinor,
    scheduledInterestEstimateMinor: estimatedInterest.toString(),
    estimatedTotalRepaymentMinor: (minor(principalMinor) + estimatedFee + estimatedInterest).toString(),
    estimatedTotalCostMinor: (estimatedFee + estimatedInterest).toString(),
    disclosureBasis: "execute_at_offer_creation_hold_to_maturity_actual365"
  };
  return immutable({ ...core, termsHash: hashId("synthetic_fee_terms", core) });
}
export function assertSyntheticFeeTerms(terms) {
  const expected = createSyntheticFeeTerms({
    profile: terms?.profile, institutionId: terms?.institutionId, assetId: terms?.assetId,
    economicLoanId: terms?.economicLoanId, principalMinor: terms?.principalMinor,
    originationFeeMinor: terms?.providerOriginationFeeMinor,
    annualRateBps: terms?.annualRateBps, scheduledTermDays: terms?.scheduledTermDays
  });
  if (!expected || hashId("fee_terms_verification", expected) !== hashId("fee_terms_verification", terms)) fail("Fee terms do not match the approved policy");
  return true;
}
export function initialSyntheticFees(terms) {
  assertSyntheticFeeTerms(terms);
  return immutable({
    schemaVersion: "synthetic_fee_state.v1", terms,
    fundedBaseMinor: "0", normalInterestBaseMinor: "0",
    borrowerAssessedMinor: "0", borrowerPaidMinor: "0",
    institutionAssessedMinor: "0", institutionSettledMinor: "0",
    pendingNormalInterestMinor: "0", pendingEntryIds: [],
    principalUnpaidCreditMinor: "0", principalWrittenOffCreditMinor: "0",
    principalRefundCreditDueMinor: "0", interestRefundCreditDueMinor: "0",
    feeWrittenOffCreditMinor: "0", sourceCorrectionCount: 0, lastSourceCorrectionReceiptId: null,
    borrowerRefundDueMinor: "0", institutionCreditDueMinor: "0",
    revision: 0
  });
}
export function assertSyntheticFees(state) {
  assertSyntheticFeeTerms(state?.terms);
  if (state.schemaVersion !== "synthetic_fee_state.v1" || !Number.isSafeInteger(state.revision) || state.revision < 0) fail("Invalid fee state version");
  for (const key of ["fundedBaseMinor", "normalInterestBaseMinor", "borrowerAssessedMinor", "borrowerPaidMinor", "institutionAssessedMinor", "institutionSettledMinor", "borrowerRefundDueMinor", "institutionCreditDueMinor", "pendingNormalInterestMinor"]) minor(state[key]);
  for (const key of ["principalUnpaidCreditMinor", "principalWrittenOffCreditMinor", "principalRefundCreditDueMinor", "interestRefundCreditDueMinor", "feeWrittenOffCreditMinor"]) minor(state[key] ?? "0");
  if (state.sourceCorrectionCount !== undefined && (!Number.isSafeInteger(state.sourceCorrectionCount) || state.sourceCorrectionCount<0)) fail("Invalid source correction count");
  if (state.borrowerAssessedMinor !== syntheticFeeTarget("borrower", state.fundedBaseMinor) ||
      state.institutionAssessedMinor !== syntheticFeeTarget("institution", (minor(state.normalInterestBaseMinor) - minor(state.pendingNormalInterestMinor)).toString())) fail("Fee balances do not reconcile to their cumulative bases");
  if (!Array.isArray(state.pendingEntryIds) || state.pendingEntryIds.some(id => !/^0x[0-9a-f]{64}$/.test(id))) fail("Pending fee sources are invalid");
  const borrowerCredit = minor(state.borrowerPaidMinor) - minor(state.borrowerAssessedMinor);
  const institutionCredit = minor(state.institutionSettledMinor) - minor(state.institutionAssessedMinor);
  if (state.borrowerRefundDueMinor !== (borrowerCredit > 0n ? borrowerCredit : 0n).toString() ||
      state.institutionCreditDueMinor !== (institutionCredit > 0n ? institutionCredit : 0n).toString()) fail("Fee credit balances do not reconcile");
  return true;
}
export function assertSyntheticFeeProvenance({ offer, obligation }) {
  const terms = offer.feeTerms;
  if (terms) assertSyntheticFeeTerms(terms);
  if (Boolean(terms) !== Boolean(obligation?.syntheticFees) && obligation) fail("Accepted fee terms were removed or added");
  if (terms && (terms.economicLoanId !== offer.creditIntentId || terms.principalMinor !== offer.approvedPrincipalMinor || terms.assetId !== offer.assetId)) fail("Fee terms belong to another loan");
  if (obligation?.syntheticFees) {
    assertSyntheticFees(obligation.syntheticFees);
    if (hashId("fee_terms_verification", terms) !== hashId("fee_terms_verification", obligation.syntheticFees.terms)) fail("Obligation fee terms changed after acceptance");
  }
}

// Application handlers resolve source receipts, authorization and reconciliation
// before calling this pure transition. Source uniqueness is enforced durably.
export function transitionSyntheticFeeBasis(state, {
  obligationId, kind, sourceId, sourceHash, baseDeltaMinor,
  reversesEntryId = null, reasonCode = null, assessmentEnabled = true, now = new Date()
}) {
  assertSyntheticFees(state);
  const delta = minor(baseDeltaMinor, true);
  if (!['borrower', 'institution'].includes(kind)) fail("Unknown fee kind");
  if (!/^0x[0-9a-f]{64}$/.test(sourceHash)) fail("Fee basis must reference a source digest");
  identifier(obligationId); identifier(sourceId);
  if (delta < 0n && (!reversesEntryId || !["funding_correction", "normal_interest_refund"].includes(reasonCode))) fail("A reversal must reference its original entry and reason");
  if (delta >= 0n && (reversesEntryId !== null || reasonCode !== null)) fail("Positive assessments cannot masquerade as reversals");
  if (delta < 0n && ((kind === "borrower") !== (reasonCode === "funding_correction"))) fail("Correction reason does not match fee kind");
  const baseKey = kind === "borrower" ? "fundedBaseMinor" : "normalInterestBaseMinor";
  const assessedKey = kind === "borrower" ? "borrowerAssessedMinor" : "institutionAssessedMinor";
  const nextBase = minor(state[baseKey]) + delta;
  if (nextBase < 0n) fail("A fee basis cannot become negative");
  const reversal = delta < 0n;
  const pending = kind === "institution" && assessmentEnabled !== true;
  const nextPending = kind !== "institution" ? 0n : pending
    ? minor(state.pendingNormalInterestMinor) + delta
    : reversal ? minor(state.pendingNormalInterestMinor) : 0n;
  if(nextPending<0n || nextPending>nextBase)fail("Pending corrections exceed their unassessed source");
  const nextFee = pending ? state[assessedKey] : syntheticFeeTarget(kind, (nextBase-nextPending).toString());
  const feeDeltaMinor = (minor(nextFee) - minor(state[assessedKey])).toString();
  const next = {
    ...structuredClone(state), [baseKey]: nextBase.toString(), [assessedKey]: nextFee,
    revision: state.revision + 1,
    ...(kind === "institution" ? { pendingNormalInterestMinor: nextPending.toString(),
      pendingEntryIds: pending || reversal ? [...state.pendingEntryIds] : [] } : {})
  };
  next.borrowerRefundDueMinor = (minor(next.borrowerPaidMinor) > minor(next.borrowerAssessedMinor)
    ? minor(next.borrowerPaidMinor) - minor(next.borrowerAssessedMinor) : 0n).toString();
  next.institutionCreditDueMinor = (minor(next.institutionSettledMinor) > minor(next.institutionAssessedMinor)
    ? minor(next.institutionSettledMinor) - minor(next.institutionAssessedMinor) : 0n).toString();
  const entryCore = {
    obligationId, economicLoanId: state.terms.economicLoanId,
    institutionId: state.terms.institutionId, kind,
    policyHash: state.terms.policyHash, termsHash: state.terms.termsHash,
    sourceId, sourceHash, baseDeltaMinor, feeDeltaMinor,
    cumulativeBaseMinor: nextBase.toString(), cumulativeFeeMinor: nextFee,
    remainderNumerator: (nextBase * (kind === "borrower" ? 10n : 1000n) % 10000n).toString(),
    remainderDenominator: "10000", reversesEntryId, reasonCode,
    assessmentStatus: pending ? "pending_profile_disabled" : "assessed",
    reconcilesPendingEntryIds: kind === "institution" && !pending && !reversal ? [...state.pendingEntryIds] : [],
    occurredAt: timestamp(now), revision: next.revision,
    syntheticOnly: true, productionFundsMoved: false,
    schemaVersion: "synthetic_fee_entry.v1"
  };
  const feeEntryId = hashId("synthetic_fee_entry", entryCore);
  if (pending) next.pendingEntryIds.push(feeEntryId);
  assertSyntheticFees(next);
  return immutable({
    state: next,
    entry: { ...entryCore, feeEntryId }
  });
}

export function recordSyntheticBorrowerFeePayment(state, amountMinor) {
  assertSyntheticFees(state);
  const paid = minor(state.borrowerPaidMinor) + minor(amountMinor);
  if (minor(amountMinor) > 0n && paid > minor(state.borrowerAssessedMinor)) fail("Repayment cannot overpay the platform fee");
  return immutable({ ...state, borrowerPaidMinor: paid.toString() });
}

export function createSyntheticFeeStatement({ institutionId, month, entries, now = new Date(), closed = false }) {
  identifier(institutionId);
  if (!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month) || !Array.isArray(entries)) fail("A valid UTC statement month is required");
  const cutoff = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(cutoff); end.setUTCMonth(end.getUTCMonth() + 1);
  if (closed && end > now) throw new DomainError("synthetic_fee_period_open", "The current UTC month cannot be closed early");
  const seen = new Set(); let opening = 0n, additions = 0n, reversals = 0n;
  const lines = [];
  for (const entry of [...entries].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt) || a.feeEntryId.localeCompare(b.feeEntryId))) {
    if (entry.kind !== "institution" || entry.institutionId !== institutionId) fail("Statement contains another payer or fee kind");
    if (seen.has(entry.feeEntryId)) fail("Statement contains duplicate entries");
    seen.add(entry.feeEntryId);
    const { feeEntryId, ledgerTransactionId: _ledger, ...core } = entry;
    if (hashId("synthetic_fee_entry", core) !== feeEntryId) fail("Statement entry digest is invalid");
    const when = new Date(entry.occurredAt), delta = minor(entry.feeDeltaMinor, true);
    if (!Number.isFinite(when.getTime()) || when > now) fail("Statement has an invalid source time");
    if (when < cutoff) opening += delta;
    else if (when < end) {
      if (delta < 0n) reversals -= delta; else additions += delta;
      lines.push(entry);
    }
  }
  const core = {
    institutionId, month, periodStart: cutoff.toISOString(), periodEnd: end.toISOString(),
    openingMinor: opening.toString(), additionsMinor: additions.toString(),
    reversalsMinor: reversals.toString(), settledMinor: "0",
    closingMinor: (opening + additions - reversals).toString(),
    lines, closed, syntheticOnly: true, productionFundsMoved: false,
    schemaVersion: "synthetic_fee_statement.v1"
  };
  return immutable({ ...core, statementId: hashId("synthetic_fee_statement", core) });
}

export function restoreSyntheticFeeOfferTerms(offer) {
  if (!["credit_terms.synthetic_fee.v1", "credit_terms.synthetic_fee_hosted.v1"].includes(offer.termsVersion)) return offer;
  assertSyntheticFeeTerms(offer.feeTerms);
  if (offer.termsVersion !== syntheticFeeTermsVersion(offer.feeTerms)) fail("Fee contract version does not match its policy");
  const keys = ["assetId", "approvedPrincipalMinor", "annualRateBps", "originationFeeMinor", "repaymentFrequency", "installmentCount", "firstPaymentAt", "maturityAt", "disclosureRef", "termsVersion"];
  const terms = { ...Object.fromEntries(keys.map(key => [key, offer[key]])),
    feeTerms: offer.feeTerms, ...(offer.collateralTerms ? { collateralTerms: offer.collateralTerms } : {}) };
  if (hashId("credit_terms", terms) !== offer.termsHash) fail("Stored synthetic fee Offer terms cannot be reproduced");
  return offer;
}
