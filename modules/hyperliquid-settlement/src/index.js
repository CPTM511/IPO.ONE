import {
  DomainError,
  LedgerEntryDirection,
  LedgerNormalSide,
  createCreditEvent,
  hashId,
  settleTradingFacility
} from "../../../packages/domain/src/index.js";

export const HYPERLIQUID_TESTNET_SETTLEMENT_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_settlement.v1";
export const HYPERLIQUID_TESTNET_PERFORMANCE_EVIDENCE_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_performance_evidence.v1";
export const HYPERLIQUID_TESTNET_FEE_POLICY_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_fee_policy.v1";

export const HyperliquidTestnetSettlementStatus = Object.freeze({
  AWAITING_FINALITY: "AWAITING_FINALITY",
  READY_TO_SETTLE: "READY_TO_SETTLE",
  SETTLED: "SETTLED",
  EVIDENCE_ACTIVE: "EVIDENCE_ACTIVE",
  EVIDENCE_REVOKED: "EVIDENCE_REVOKED",
  INCIDENT: "INCIDENT"
});

export const HyperliquidTestnetFinalityStatus = Object.freeze({
  FINAL: "FINAL",
  UNKNOWN: "UNKNOWN"
});

export const HyperliquidTestnetReconciliationStatus = Object.freeze({
  RECONCILED: "RECONCILED",
  UNKNOWN: "UNKNOWN"
});

const STATUSES = new Set(
  Object.values(HyperliquidTestnetSettlementStatus)
);
const FINALITY_STATUSES = new Set(
  Object.values(HyperliquidTestnetFinalityStatus)
);
const RECONCILIATION_STATUSES = new Set(
  Object.values(HyperliquidTestnetReconciliationStatus)
);
const TEMPLATE_TYPES = new Set([
  "credit",
  "performance_participation",
  "hybrid"
]);
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MINOR_PATTERN = /^(?:0|[1-9][0-9]{0,77})$/;
const SIGNED_MINOR_PATTERN = /^(?:0|-?[1-9][0-9]{0,77})$/;
const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9_]{0,95}$/;
const SETTLEMENT_OUTBOX_TOPIC =
  "ipo.one.trading.testnet-settlement.v1";
const SETTLEMENT_INBOX_CONSUMER =
  "ipo.one.hyperliquid-testnet-finality-observations.v1";
const PROOF_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FINALITY_AGE_MS = 5 * 60 * 1000;
const DAY_COUNT_DENOMINATOR = 3_650_000n;

const SETTLEMENT_ACCOUNT_SPECS = Object.freeze([
  ["trading_provider_contributed_capital", LedgerNormalSide.CREDIT],
  ["trading_subject_contributed_capital", LedgerNormalSide.CREDIT],
  ["trading_realized_gain", LedgerNormalSide.CREDIT],
  ["trading_realized_loss", LedgerNormalSide.DEBIT],
  ["trading_venue_cost", LedgerNormalSide.DEBIT],
  ["trading_closing_cost", LedgerNormalSide.DEBIT],
  ["trading_provider_principal_return", LedgerNormalSide.DEBIT],
  ["trading_subject_contribution_return", LedgerNormalSide.DEBIT],
  ["trading_provider_fixed_income", LedgerNormalSide.DEBIT],
  ["trading_provider_performance_income", LedgerNormalSide.DEBIT],
  ["trading_subject_profit", LedgerNormalSide.DEBIT],
  ["trading_ipo_one_fee_income", LedgerNormalSide.DEBIT]
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function plainObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, required, optional = [], code = "invalid_testnet_settlement") {
  if (!plainObject(value)) fail(code, "value must be a plain object");
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    fail(code, "value has an open or incomplete shape");
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    fail("invalid_testnet_settlement", `${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    fail("invalid_testnet_settlement", `${name} is invalid`);
  }
  return value;
}

function code(name, value) {
  if (typeof value !== "string" || !SAFE_CODE_PATTERN.test(value)) {
    fail("invalid_testnet_settlement", `${name} is invalid`);
  }
  return value;
}

function iso(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail("invalid_testnet_settlement", `${name} is invalid`);
  }
  return value;
}

function minor(name, value) {
  if (typeof value !== "string" || !MINOR_PATTERN.test(value)) {
    fail("invalid_testnet_settlement", `${name} is invalid`);
  }
  return BigInt(value);
}

function positiveMinor(name, value) {
  const parsed = minor(name, value);
  if (parsed <= 0n) {
    fail("invalid_testnet_settlement", `${name} must be positive`);
  }
  return parsed;
}

function signedMinor(name, value) {
  if (typeof value !== "string" || !SIGNED_MINOR_PATTERN.test(value)) {
    fail("invalid_testnet_settlement", `${name} is invalid`);
  }
  return BigInt(value);
}

function boundedInteger(name, value, minimum, maximum) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail("invalid_testnet_settlement", `${name} is outside its closed range`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function deterministicId(namespace, core) {
  return `${namespace}_${hashId(namespace, core).slice(2)}`;
}

function commonSafety() {
  return {
    environment: "hyperliquid_testnet",
    testnetOnly: true,
    simulationOnly: true,
    protectedTestnetE2EOnly: true,
    nonRedeemable: true,
    payoutExecuted: false,
    withdrawalExecuted: false,
    transferExecuted: false,
    externalSystemQueried: false,
    externalCloseSubmitted: false,
    liveTransportApproved: false,
    liveAccountsApproved: false,
    apiWalletApproved: false,
    rawAddressPersisted: false,
    rawResponsePersisted: false,
    reusableSignaturePersisted: false,
    canonicalFacility: true,
    canonicalObligation: true,
    canonicalLedger: true,
    secondFacilityCreated: false,
    secondObligationCreated: false,
    secondLedgerCreated: false,
    principalGuaranteeCreated: false,
    syntheticReceivableCreated: false,
    dynamicRepricingApplied: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    realFunds: false,
    productionFundsMoved: false,
    piiIncluded: false,
    secretsIncluded: false
  };
}

function assertSafety(value) {
  const expected = commonSafety();
  for (const [key, item] of Object.entries(expected)) {
    if (value[key] !== item) {
      fail(
        "testnet_settlement_safety_boundary_changed",
        `${key} changed the closed settlement boundary`
      );
    }
  }
}

export function createSimulatedTestnetFeePolicy(input, { clock = Date.now } = {}) {
  exactKeys(input, [
    "policyId",
    "approvalEvidenceHash",
    "approvedByActorHash",
    "ipoOneFeeBps",
    "validFrom",
    "validUntil"
  ]);
  identifier("policyId", input.policyId);
  hash("approvalEvidenceHash", input.approvalEvidenceHash);
  hash("approvedByActorHash", input.approvedByActorHash);
  boundedInteger("ipoOneFeeBps", input.ipoOneFeeBps, 0, 10_000);
  iso("validFrom", input.validFrom);
  iso("validUntil", input.validUntil);
  if (
    new Date(input.validUntil).getTime() <=
    new Date(input.validFrom).getTime()
  ) {
    fail("invalid_testnet_settlement", "fee policy validity is invalid");
  }
  const core = {
    policyId: input.policyId,
    approvalEvidenceHash: input.approvalEvidenceHash,
    approvedByActorHash: input.approvedByActorHash,
    ipoOneFeeBps: input.ipoOneFeeBps,
    feeBasis: "provider_realized_income",
    principalFeeAllowed: false,
    unrealizedPnlFeeAllowed: false,
    dayCountBasis: "actual_365",
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    sourceFixed: true,
    testPolicyInputAccepted: true,
    productionPricingApproved: false,
    mainnetApproved: false,
    economicAuthority: false,
    simulationOnly: true,
    fundsAuthority: false,
    schemaVersion: HYPERLIQUID_TESTNET_FEE_POLICY_SCHEMA_VERSION
  };
  const policy = {
    ...core,
    policyHash: hashId("hyperliquid_testnet_fee_policy", core),
    capturedAt: new Date(clock()).toISOString()
  };
  return deepFreeze(policy);
}

function assertFeePolicy(value, nowMs) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== HYPERLIQUID_TESTNET_FEE_POLICY_SCHEMA_VERSION ||
    value.feeBasis !== "provider_realized_income" ||
    value.principalFeeAllowed !== false ||
    value.unrealizedPnlFeeAllowed !== false ||
    value.dayCountBasis !== "actual_365" ||
    value.sourceFixed !== true ||
    value.testPolicyInputAccepted !== true ||
    value.productionPricingApproved !== false ||
    value.mainnetApproved !== false ||
    value.economicAuthority !== false ||
    value.simulationOnly !== true ||
    value.fundsAuthority !== false
  ) {
    fail("testnet_fee_policy_unavailable", "closed Testnet fee policy is unavailable");
  }
  identifier("policyId", value.policyId);
  hash("policyHash", value.policyHash);
  hash("approvalEvidenceHash", value.approvalEvidenceHash);
  hash("approvedByActorHash", value.approvedByActorHash);
  boundedInteger("ipoOneFeeBps", value.ipoOneFeeBps, 0, 10_000);
  iso("validFrom", value.validFrom);
  iso("validUntil", value.validUntil);
  iso("capturedAt", value.capturedAt);
  const core = {
    policyId: value.policyId,
    approvalEvidenceHash: value.approvalEvidenceHash,
    approvedByActorHash: value.approvedByActorHash,
    ipoOneFeeBps: value.ipoOneFeeBps,
    feeBasis: value.feeBasis,
    principalFeeAllowed: value.principalFeeAllowed,
    unrealizedPnlFeeAllowed: value.unrealizedPnlFeeAllowed,
    dayCountBasis: value.dayCountBasis,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    sourceFixed: value.sourceFixed,
    testPolicyInputAccepted: value.testPolicyInputAccepted,
    productionPricingApproved: value.productionPricingApproved,
    mainnetApproved: value.mainnetApproved,
    economicAuthority: value.economicAuthority,
    simulationOnly: value.simulationOnly,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
  if (
    hashId("hyperliquid_testnet_fee_policy", core) !== value.policyHash ||
    nowMs < new Date(value.validFrom).getTime() ||
    nowMs >= new Date(value.validUntil).getTime()
  ) {
    fail("testnet_fee_policy_unavailable", "fee policy binding or validity changed");
  }
  return value;
}

export function calculateTestnetSettlementWaterfall(input) {
  exactKeys(input, [
    "templateType",
    "providerContributionMinor",
    "subjectContributionMinor",
    "finalEquityMinor",
    "realizedPnlMinor",
    "venueCostMinor",
    "closingCostMinor",
    "fixedReturnBps",
    "performanceParticipationBps",
    "durationDays",
    "ipoOneFeeBps"
  ]);
  if (!TEMPLATE_TYPES.has(input.templateType)) {
    fail("invalid_testnet_settlement", "templateType is unsupported");
  }
  const provider = positiveMinor(
    "providerContributionMinor",
    input.providerContributionMinor
  );
  const subject = positiveMinor(
    "subjectContributionMinor",
    input.subjectContributionMinor
  );
  const equity = minor("finalEquityMinor", input.finalEquityMinor);
  const realizedPnl = signedMinor("realizedPnlMinor", input.realizedPnlMinor);
  const venueCost = minor("venueCostMinor", input.venueCostMinor);
  const closingCost = minor("closingCostMinor", input.closingCostMinor);
  const fixedReturnBps = boundedInteger(
    "fixedReturnBps",
    input.fixedReturnBps,
    0,
    10_000
  );
  const performanceParticipationBps = boundedInteger(
    "performanceParticipationBps",
    input.performanceParticipationBps,
    0,
    10_000
  );
  const durationDays = boundedInteger(
    "durationDays",
    input.durationDays,
    1,
    3_650
  );
  const ipoOneFeeBps = boundedInteger(
    "ipoOneFeeBps",
    input.ipoOneFeeBps,
    0,
    10_000
  );
  if (
    (input.templateType === "credit" &&
      performanceParticipationBps !== 0) ||
    (input.templateType === "performance_participation" &&
      fixedReturnBps !== 0)
  ) {
    fail("invalid_testnet_settlement", "template economics are inconsistent");
  }
  const capital = provider + subject;
  if (capital + realizedPnl - venueCost - closingCost !== equity) {
    fail(
      "testnet_settlement_not_conserved",
      "final equity does not reconcile to capital, realized PnL, and costs"
    );
  }
  const providerPrincipalReturn = equity < provider ? equity : provider;
  let remaining = equity - providerPrincipalReturn;
  const subjectContributionReturn = remaining < subject ? remaining : subject;
  remaining -= subjectContributionReturn;
  const realizedFinancialIncome = remaining;
  const fixedTarget =
    (provider * BigInt(fixedReturnBps) * BigInt(durationDays)) /
    DAY_COUNT_DENOMINATOR;
  const providerFixedReturnGross =
    input.templateType === "performance_participation"
      ? 0n
      : (fixedTarget < remaining ? fixedTarget : remaining);
  remaining -= providerFixedReturnGross;
  const providerPerformanceParticipationGross =
    input.templateType === "credit"
      ? 0n
      : (remaining * BigInt(performanceParticipationBps)) / 10_000n;
  const providerGrossIncome =
    providerFixedReturnGross + providerPerformanceParticipationGross;
  const ipoOneFee =
    (providerGrossIncome * BigInt(ipoOneFeeBps)) / 10_000n;
  const feeFromPerformance =
    ipoOneFee < providerPerformanceParticipationGross
      ? ipoOneFee
      : providerPerformanceParticipationGross;
  const feeFromFixed = ipoOneFee - feeFromPerformance;
  const providerFixedReturnNet =
    providerFixedReturnGross - feeFromFixed;
  const providerPerformanceParticipationNet =
    providerPerformanceParticipationGross - feeFromPerformance;
  const providerNetIncome =
    providerFixedReturnNet + providerPerformanceParticipationNet;
  const subjectProfit =
    realizedFinancialIncome - providerGrossIncome;
  const providerTotalAllocation =
    providerPrincipalReturn + providerNetIncome;
  const subjectTotalAllocation =
    subjectContributionReturn + subjectProfit;
  const totalAllocated =
    providerTotalAllocation + subjectTotalAllocation + ipoOneFee;
  if (totalAllocated !== equity) {
    fail("testnet_settlement_not_conserved", "waterfall lost a minor unit");
  }
  return deepFreeze({
    templateType: input.templateType,
    totalCapitalMinor: capital.toString(),
    providerContributionMinor: provider.toString(),
    subjectContributionMinor: subject.toString(),
    realizedPnlMinor: realizedPnl.toString(),
    venueCostMinor: venueCost.toString(),
    closingCostMinor: closingCost.toString(),
    finalEquityMinor: equity.toString(),
    providerPrincipalReturnMinor: providerPrincipalReturn.toString(),
    providerPrincipalShortfallMinor:
      (provider - providerPrincipalReturn).toString(),
    subjectContributionReturnMinor: subjectContributionReturn.toString(),
    subjectFirstLossMinor:
      (subject - subjectContributionReturn).toString(),
    realizedFinancialIncomeMinor: realizedFinancialIncome.toString(),
    fixedReturnTargetMinor: fixedTarget.toString(),
    providerFixedReturnGrossMinor: providerFixedReturnGross.toString(),
    providerPerformanceParticipationGrossMinor:
      providerPerformanceParticipationGross.toString(),
    providerGrossIncomeMinor: providerGrossIncome.toString(),
    ipoOneFeeBasisMinor: providerGrossIncome.toString(),
    ipoOneFeeMinor: ipoOneFee.toString(),
    providerFixedReturnNetMinor: providerFixedReturnNet.toString(),
    providerPerformanceParticipationNetMinor:
      providerPerformanceParticipationNet.toString(),
    providerNetIncomeMinor: providerNetIncome.toString(),
    providerTotalAllocationMinor: providerTotalAllocation.toString(),
    subjectProfitMinor: subjectProfit.toString(),
    subjectTotalAllocationMinor: subjectTotalAllocation.toString(),
    totalAllocatedMinor: totalAllocated.toString(),
    principalFeeApplied: false,
    unrealizedPnlFeeApplied: false,
    providerPrincipalGuaranteed: false,
    roundingMode: "floor_minor_units_subject_residual",
    waterfallBalanced: true,
    schemaVersion: "hyperliquid_testnet_waterfall.v1"
  });
}

export function createSimulatedTestnetFinalityObservation(
  input,
  { clock = Date.now } = {}
) {
  exactKeys(input, [
    "settlementHash",
    "facilityHash",
    "fundingHash",
    "assetId",
    "sourceEvidenceHash",
    "finalityStatus",
    "reconciliationStatus",
    "openOrderCount",
    "exposureMinor",
    "unknownExecutionCount",
    "positionsFinal",
    "unrealizedPnlMinor",
    "realizedPnlMinor",
    "venueCostMinor",
    "closingCostMinor",
    "finalEquityMinor",
    "complete",
    "economicValuesAuthoritative",
    "reasonCode"
  ]);
  hash("settlementHash", input.settlementHash);
  hash("facilityHash", input.facilityHash);
  hash("fundingHash", input.fundingHash);
  identifier("assetId", input.assetId);
  hash("sourceEvidenceHash", input.sourceEvidenceHash);
  if (
    !FINALITY_STATUSES.has(input.finalityStatus) ||
    !RECONCILIATION_STATUSES.has(input.reconciliationStatus)
  ) {
    fail("invalid_testnet_settlement", "observation state is unsupported");
  }
  boundedInteger("openOrderCount", input.openOrderCount, 0, 1_000_000);
  minor("exposureMinor", input.exposureMinor);
  boundedInteger(
    "unknownExecutionCount",
    input.unknownExecutionCount,
    0,
    1_000_000
  );
  signedMinor("unrealizedPnlMinor", input.unrealizedPnlMinor);
  signedMinor("realizedPnlMinor", input.realizedPnlMinor);
  minor("venueCostMinor", input.venueCostMinor);
  minor("closingCostMinor", input.closingCostMinor);
  minor("finalEquityMinor", input.finalEquityMinor);
  code("reasonCode", input.reasonCode);
  const observedAt = new Date(clock()).toISOString();
  const core = {
    ...input,
    sourceFixed: true,
    simulationOnly: true,
    networkAvailable: false,
    liveTransportApproved: false,
    externalSystemQueried: false,
    rawResponsePersisted: false,
    observedAt,
    schemaVersion:
      "hyperliquid_testnet_simulated_finality_observation.v1"
  };
  const observation = {
    observationId: deterministicId(
      "hyperliquid_testnet_finality_observation",
      { sourceEvidenceHash: input.sourceEvidenceHash }
    ),
    observationHash: hashId(
      "hyperliquid_testnet_finality_observation",
      core
    ),
    ...core
  };
  return deepFreeze(observation);
}

function assertObservation(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !==
      "hyperliquid_testnet_simulated_finality_observation.v1" ||
    value.sourceFixed !== true ||
    value.simulationOnly !== true ||
    value.networkAvailable !== false ||
    value.liveTransportApproved !== false ||
    value.externalSystemQueried !== false ||
    value.rawResponsePersisted !== false
  ) {
    fail("testnet_finality_observation_unavailable", "observation is unavailable");
  }
  identifier("observationId", value.observationId);
  hash("observationHash", value.observationHash);
  hash("sourceEvidenceHash", value.sourceEvidenceHash);
  iso("observedAt", value.observedAt);
  const rebuilt = createSimulatedTestnetFinalityObservation(
    {
      settlementHash: value.settlementHash,
      facilityHash: value.facilityHash,
      fundingHash: value.fundingHash,
      assetId: value.assetId,
      sourceEvidenceHash: value.sourceEvidenceHash,
      finalityStatus: value.finalityStatus,
      reconciliationStatus: value.reconciliationStatus,
      openOrderCount: value.openOrderCount,
      exposureMinor: value.exposureMinor,
      unknownExecutionCount: value.unknownExecutionCount,
      positionsFinal: value.positionsFinal,
      unrealizedPnlMinor: value.unrealizedPnlMinor,
      realizedPnlMinor: value.realizedPnlMinor,
      venueCostMinor: value.venueCostMinor,
      closingCostMinor: value.closingCostMinor,
      finalEquityMinor: value.finalEquityMinor,
      complete: value.complete,
      economicValuesAuthoritative: value.economicValuesAuthoritative,
      reasonCode: value.reasonCode
    },
    { clock: () => new Date(value.observedAt).getTime() }
  );
  if (
    rebuilt.observationId !== value.observationId ||
    rebuilt.observationHash !== value.observationHash
  ) {
    fail("testnet_finality_observation_unavailable", "observation binding changed");
  }
  return value;
}

function assertKernelSnapshot(value, nowMs) {
  if (
    !plainObject(value) ||
    value.schemaVersion !==
      "hyperliquid_testnet_settlement_kernel_snapshot.v1" ||
    value.fundingStatus !== "ACTIVE" ||
    value.facilityLifecycleStatus !== "flattened" ||
    value.facilityRiskState !== "FLATTEN" ||
    value.openOrderCount !== 0 ||
    value.exposureMinor !== "0" ||
    value.newRiskAdmissionOpen !== false ||
    value.closeAdmissionFrozen !== true ||
    value.closeRequestStatus !== "requested" ||
    value.obligationExecutionStatus !== "executed" ||
    value.obligationWithdrawable !== false ||
    value.reconciliationStatus !== "RECONCILED" ||
    value.unknownExecutionCount !== 0 ||
    value.canonicalFacility !== true ||
    value.canonicalObligation !== true ||
    value.canonicalLedger !== true ||
    value.secondFacilityCreated !== false ||
    value.secondObligationCreated !== false ||
    value.secondLedgerCreated !== false ||
    value.simulationOnly !== true ||
    value.externalSystemQueried !== false ||
    value.liveAccountsApproved !== false
  ) {
    fail("testnet_settlement_kernel_unavailable", "kernel snapshot is unavailable");
  }
  for (const field of [
    "facilityId",
    "fundingId",
    "closeRequestId",
    "obligationId",
    "subjectId",
    "assetId"
  ]) identifier(field, value[field]);
  for (const field of [
    "facilityHash",
    "facilityStateHash",
    "fundingHash",
    "closeRequestHash",
    "obligationHash",
    "termsHash",
    "finalReconciliationHash",
    "canonicalLedgerStateHash"
  ]) hash(field, value[field]);
  boundedInteger("facilityVersion", value.facilityVersion, 1, 1_000_000);
  boundedInteger(
    "ledgerTransactionCount",
    value.ledgerTransactionCount,
    0,
    Number.MAX_SAFE_INTEGER
  );
  positiveMinor(
    "subjectContributionMinor",
    value.subjectContributionMinor
  );
  positiveMinor(
    "providerContributionMinor",
    value.providerContributionMinor
  );
  if (!TEMPLATE_TYPES.has(value.templateType)) {
    fail("testnet_settlement_kernel_unavailable", "template is unsupported");
  }
  boundedInteger("fixedReturnBps", value.fixedReturnBps, 0, 10_000);
  boundedInteger(
    "performanceParticipationBps",
    value.performanceParticipationBps,
    0,
    10_000
  );
  boundedInteger("durationDays", value.durationDays, 1, 3_650);
  iso("capturedAt", value.capturedAt);
  if (
    nowMs - new Date(value.capturedAt).getTime() > MAX_FINALITY_AGE_MS ||
    new Date(value.capturedAt).getTime() > nowMs
  ) {
    fail("testnet_settlement_kernel_unavailable", "kernel snapshot is stale");
  }
  if (
    !plainObject(value.facility) ||
    value.facility.tradingFacilityId !== value.facilityId ||
    value.facility.facilityHash !== value.facilityHash ||
    value.facility.stateHash !== value.facilityStateHash ||
    value.facility.version !== value.facilityVersion
  ) {
    fail("testnet_settlement_kernel_unavailable", "Facility binding changed");
  }
  return value;
}

function recordIdentityCore(value) {
  return {
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    facilityStateHashBefore: value.facilityStateHashBefore,
    facilityVersionBefore: value.facilityVersionBefore,
    fundingId: value.fundingId,
    fundingHash: value.fundingHash,
    closeRequestId: value.closeRequestId,
    closeRequestHash: value.closeRequestHash,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    subjectId: value.subjectId,
    assetId: value.assetId,
    templateType: value.templateType,
    termsHash: value.termsHash,
    fixedReturnBps: value.fixedReturnBps,
    performanceParticipationBps: value.performanceParticipationBps,
    durationDays: value.durationDays,
    subjectContributionMinor: value.subjectContributionMinor,
    providerContributionMinor: value.providerContributionMinor,
    finalReconciliationHash: value.finalReconciliationHash,
    feePolicyId: value.feePolicyId,
    feePolicyHash: value.feePolicyHash,
    feeApprovalEvidenceHash: value.feeApprovalEvidenceHash,
    ipoOneFeeBps: value.ipoOneFeeBps,
    canonicalLedgerStateHashBefore: value.canonicalLedgerStateHashBefore,
    ledgerTransactionCountBefore: value.ledgerTransactionCountBefore,
    createdAt: value.createdAt
  };
}

function recordStateCore(value) {
  return {
    settlementHash: value.settlementHash,
    processedObservationCount: value.processedObservationCount,
    finalObservationHash: value.finalObservationHash,
    finalSourceEvidenceHash: value.finalSourceEvidenceHash,
    realizedPnlMinor: value.realizedPnlMinor,
    venueCostMinor: value.venueCostMinor,
    closingCostMinor: value.closingCostMinor,
    finalEquityMinor: value.finalEquityMinor,
    waterfall: value.waterfall,
    ledgerTransactionId: value.ledgerTransactionId,
    ledgerTransactionHash: value.ledgerTransactionHash,
    facilityStateHashAfter: value.facilityStateHashAfter,
    facilityVersionAfter: value.facilityVersionAfter,
    currentPerformanceEvidence: value.currentPerformanceEvidence,
    performanceEvidenceVersion: value.performanceEvidenceVersion,
    incidentReasonCodes: value.incidentReasonCodes,
    status: value.status,
    version: value.version,
    updatedAt: value.updatedAt,
    settledAt: value.settledAt
  };
}

function createPendingRecord(snapshot, feePolicy, guard, idempotencyKeyHash, nowMs) {
  const createdAt = new Date(nowMs).toISOString();
  const draft = {
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    facilityStateHashBefore: snapshot.facilityStateHash,
    facilityVersionBefore: snapshot.facilityVersion,
    fundingId: snapshot.fundingId,
    fundingHash: snapshot.fundingHash,
    closeRequestId: snapshot.closeRequestId,
    closeRequestHash: snapshot.closeRequestHash,
    obligationId: snapshot.obligationId,
    obligationHash: snapshot.obligationHash,
    subjectId: snapshot.subjectId,
    assetId: snapshot.assetId,
    templateType: snapshot.templateType,
    termsHash: snapshot.termsHash,
    fixedReturnBps: snapshot.fixedReturnBps,
    performanceParticipationBps: snapshot.performanceParticipationBps,
    durationDays: snapshot.durationDays,
    subjectContributionMinor: snapshot.subjectContributionMinor,
    providerContributionMinor: snapshot.providerContributionMinor,
    finalReconciliationHash: snapshot.finalReconciliationHash,
    feePolicyId: feePolicy.policyId,
    feePolicyHash: feePolicy.policyHash,
    feeApprovalEvidenceHash: feePolicy.approvalEvidenceHash,
    ipoOneFeeBps: feePolicy.ipoOneFeeBps,
    canonicalLedgerStateHashBefore: snapshot.canonicalLedgerStateHash,
    ledgerTransactionCountBefore: snapshot.ledgerTransactionCount,
    createdAt
  };
  const settlementHash = hashId(
    "hyperliquid_testnet_settlement_identity",
    draft
  );
  const settlementId = deterministicId(
    "hyperliquid_testnet_settlement",
    { settlementHash }
  );
  const record = {
    settlementId,
    settlementHash,
    requestHash: hashId("hyperliquid_testnet_settlement_prepare_request", {
      settlementHash,
      idempotencyKeyHash,
      authorizationDecisionHash: guard.authorizationDecisionHash,
      admissionDecisionHash: guard.admissionDecisionHash
    }),
    idempotencyKeyHash,
    authorizationDecisionHash: guard.authorizationDecisionHash,
    admissionDecisionHash: guard.admissionDecisionHash,
    ...draft,
    processedObservationCount: 0,
    finalObservationHash: null,
    finalSourceEvidenceHash: null,
    realizedPnlMinor: null,
    venueCostMinor: null,
    closingCostMinor: null,
    finalEquityMinor: null,
    waterfall: null,
    ledgerTransactionId: null,
    ledgerTransactionHash: null,
    facilityStateHashAfter: null,
    facilityVersionAfter: null,
    currentPerformanceEvidence: null,
    performanceEvidenceVersion: 0,
    incidentReasonCodes: [],
    status: HyperliquidTestnetSettlementStatus.AWAITING_FINALITY,
    version: 1,
    stateHash: null,
    updatedAt: createdAt,
    settledAt: null,
    economicTermsImmutable: true,
    feePolicyVersioned: true,
    finalReconciliationRequired: true,
    noPayoutBeforeFinality: true,
    canonicalLedgerTransactionCreated: false,
    performanceEvidenceRevocable: true,
    ...commonSafety(),
    schemaVersion: HYPERLIQUID_TESTNET_SETTLEMENT_SCHEMA_VERSION
  };
  record.stateHash = hashId(
    "hyperliquid_testnet_settlement_state",
    recordStateCore(record)
  );
  return deepFreeze(assertRecord(record));
}

function assertPerformanceEvidence(value, record) {
  if (
    !plainObject(value) ||
    value.schemaVersion !==
      HYPERLIQUID_TESTNET_PERFORMANCE_EVIDENCE_SCHEMA_VERSION ||
    !["active", "revoked"].includes(value.status) ||
    value.revocable !== true ||
    value.externalVerificationAvailable !== false ||
    value.officialReport !== false ||
    value.universalScore !== false ||
    value.strategyDataIncluded !== false ||
    value.rawHistoryIncluded !== false ||
    value.piiIncluded !== false ||
    value.secretsIncluded !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false
  ) {
    fail("testnet_performance_evidence_unavailable", "Performance Evidence is unavailable");
  }
  identifier("performanceEvidenceId", value.performanceEvidenceId);
  hash("performanceEvidenceHash", value.performanceEvidenceHash);
  if (value.previousEvidenceHash !== null) hash("previousEvidenceHash", value.previousEvidenceHash);
  boundedInteger("evidenceVersion", value.evidenceVersion, 1, 100);
  iso("issuedAt", value.issuedAt);
  iso("expiresAt", value.expiresAt);
  if (
    value.settlementId !== record.settlementId ||
    value.settlementHash !== record.settlementHash ||
    value.ledgerTransactionHash !== record.ledgerTransactionHash ||
    value.claims?.finalReconciliation !== true ||
    value.claims?.zeroExposure !== true ||
    value.claims?.waterfallBalanced !== true ||
    value.claims?.principalGuaranteed !== false ||
    value.claims?.principalFeeApplied !== false ||
    value.claims?.unrealizedPnlFeeApplied !== false ||
    value.claims?.payoutExecuted !== false
  ) {
    fail("testnet_performance_evidence_unavailable", "Performance Evidence binding changed");
  }
  const core = {
    settlementId: value.settlementId,
    settlementHash: value.settlementHash,
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    ledgerTransactionHash: value.ledgerTransactionHash,
    claims: value.claims,
    status: value.status,
    reasonCode: value.reasonCode,
    previousEvidenceHash: value.previousEvidenceHash,
    evidenceVersion: value.evidenceVersion,
    issuedByActorHash: value.issuedByActorHash,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt
  };
  if (
    hashId("hyperliquid_testnet_performance_evidence", core) !==
    value.performanceEvidenceHash
  ) {
    fail("testnet_performance_evidence_unavailable", "Performance Evidence hash changed");
  }
  return value;
}

function assertRecord(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== HYPERLIQUID_TESTNET_SETTLEMENT_SCHEMA_VERSION ||
    !STATUSES.has(value.status) ||
    !Array.isArray(value.incidentReasonCodes) ||
    value.incidentReasonCodes.length > 20 ||
    value.incidentReasonCodes.some((item) => !SAFE_CODE_PATTERN.test(item))
  ) {
    fail("testnet_settlement_unavailable", "settlement record is unavailable");
  }
  for (const field of [
    "settlementId",
    "facilityId",
    "fundingId",
    "closeRequestId",
    "obligationId",
    "subjectId",
    "assetId",
    "feePolicyId"
  ]) identifier(field, value[field]);
  for (const field of [
    "settlementHash",
    "stateHash",
    "requestHash",
    "idempotencyKeyHash",
    "authorizationDecisionHash",
    "admissionDecisionHash",
    "facilityHash",
    "facilityStateHashBefore",
    "fundingHash",
    "closeRequestHash",
    "obligationHash",
    "termsHash",
    "finalReconciliationHash",
    "feePolicyHash",
    "feeApprovalEvidenceHash",
    "canonicalLedgerStateHashBefore"
  ]) hash(field, value[field]);
  assertSafety(value);
  positiveMinor("subjectContributionMinor", value.subjectContributionMinor);
  positiveMinor("providerContributionMinor", value.providerContributionMinor);
  boundedInteger("version", value.version, 1, 1_000_000);
  boundedInteger(
    "processedObservationCount",
    value.processedObservationCount,
    0,
    1_000_000
  );
  boundedInteger(
    "performanceEvidenceVersion",
    value.performanceEvidenceVersion,
    0,
    100
  );
  iso("createdAt", value.createdAt);
  iso("updatedAt", value.updatedAt);
  if (
    hashId("hyperliquid_testnet_settlement_identity", recordIdentityCore(value)) !==
    value.settlementHash ||
    hashId("hyperliquid_testnet_settlement_state", recordStateCore(value)) !==
    value.stateHash
  ) {
    fail("testnet_settlement_unavailable", "settlement identity or state changed");
  }
  const preSettlement = [
    HyperliquidTestnetSettlementStatus.AWAITING_FINALITY,
    HyperliquidTestnetSettlementStatus.READY_TO_SETTLE
  ].includes(value.status);
  const settled = [
    HyperliquidTestnetSettlementStatus.SETTLED,
    HyperliquidTestnetSettlementStatus.EVIDENCE_ACTIVE,
    HyperliquidTestnetSettlementStatus.EVIDENCE_REVOKED
  ].includes(value.status);
  if (
    (preSettlement &&
      (
        value.ledgerTransactionId !== null ||
        value.ledgerTransactionHash !== null ||
        value.waterfall !== null ||
        value.settledAt !== null ||
        value.canonicalLedgerTransactionCreated !== false
      )) ||
    (settled &&
      (
        value.ledgerTransactionId === null ||
        value.ledgerTransactionHash === null ||
        value.waterfall?.waterfallBalanced !== true ||
        value.settledAt === null ||
        value.canonicalLedgerTransactionCreated !== true
      ))
  ) {
    fail("testnet_settlement_unavailable", "settlement lifecycle is inconsistent");
  }
  if (
    value.status === HyperliquidTestnetSettlementStatus.AWAITING_FINALITY &&
    value.finalObservationHash !== null
  ) {
    fail("testnet_settlement_unavailable", "unknown finality became authoritative");
  }
  if (
    value.status === HyperliquidTestnetSettlementStatus.READY_TO_SETTLE &&
    (
      value.finalObservationHash === null ||
      value.finalSourceEvidenceHash === null ||
      value.finalEquityMinor === null
    )
  ) {
    fail("testnet_settlement_unavailable", "final settlement inputs are missing");
  }
  if (
    value.status === HyperliquidTestnetSettlementStatus.EVIDENCE_ACTIVE ||
    value.status === HyperliquidTestnetSettlementStatus.EVIDENCE_REVOKED
  ) {
    assertPerformanceEvidence(value.currentPerformanceEvidence, value);
    if (
      value.currentPerformanceEvidence.evidenceVersion !==
        value.performanceEvidenceVersion ||
      value.currentPerformanceEvidence.status !==
        (value.status === HyperliquidTestnetSettlementStatus.EVIDENCE_ACTIVE
          ? "active"
          : "revoked")
    ) {
      fail("testnet_settlement_unavailable", "Performance Evidence state changed");
    }
  } else if (
    value.currentPerformanceEvidence !== null ||
    value.performanceEvidenceVersion !== 0
  ) {
    fail("testnet_settlement_unavailable", "unexpected Performance Evidence exists");
  }
  return value;
}

function nextState(record, patch, nowMs) {
  const next = {
    ...clone(record),
    ...clone(patch),
    version: record.version + 1,
    updatedAt: new Date(nowMs).toISOString()
  };
  next.stateHash = hashId(
    "hyperliquid_testnet_settlement_state",
    recordStateCore(next)
  );
  return deepFreeze(assertRecord(next));
}

function incident(record, reasonCode, nowMs) {
  return nextState(record, {
    status: HyperliquidTestnetSettlementStatus.INCIDENT,
    incidentReasonCodes: [...record.incidentReasonCodes, code("reasonCode", reasonCode)]
  }, nowMs);
}

function transitionObservation(record, observation, snapshot, nowMs) {
  const current = assertRecord(record);
  const source = assertObservation(observation);
  const kernel = assertKernelSnapshot(snapshot, nowMs);
  if (
    current.status !== HyperliquidTestnetSettlementStatus.AWAITING_FINALITY
  ) return current;
  if (
    kernel.facilityId !== current.facilityId ||
    kernel.facilityHash !== current.facilityHash ||
    kernel.facilityStateHash !== current.facilityStateHashBefore ||
    kernel.facilityVersion !== current.facilityVersionBefore ||
    kernel.fundingId !== current.fundingId ||
    kernel.fundingHash !== current.fundingHash ||
    kernel.closeRequestId !== current.closeRequestId ||
    kernel.closeRequestHash !== current.closeRequestHash ||
    kernel.obligationId !== current.obligationId ||
    kernel.obligationHash !== current.obligationHash ||
    kernel.termsHash !== current.termsHash ||
    kernel.finalReconciliationHash !== current.finalReconciliationHash ||
    kernel.canonicalLedgerStateHash !== current.canonicalLedgerStateHashBefore ||
    kernel.ledgerTransactionCount !== current.ledgerTransactionCountBefore
  ) {
    return incident(current, "kernel_binding_drift", nowMs);
  }
  if (
    source.settlementHash !== current.settlementHash ||
    source.facilityHash !== current.facilityHash ||
    source.fundingHash !== current.fundingHash ||
    source.assetId !== current.assetId
  ) {
    return incident(current, "finality_binding_drift", nowMs);
  }
  if (
    nowMs < new Date(source.observedAt).getTime() ||
    nowMs - new Date(source.observedAt).getTime() > MAX_FINALITY_AGE_MS
  ) {
    return nextState(current, {
      processedObservationCount: current.processedObservationCount + 1
    }, nowMs);
  }
  const final =
    source.finalityStatus === HyperliquidTestnetFinalityStatus.FINAL &&
    source.reconciliationStatus ===
      HyperliquidTestnetReconciliationStatus.RECONCILED &&
    source.openOrderCount === 0 &&
    source.exposureMinor === "0" &&
    source.unknownExecutionCount === 0 &&
    source.positionsFinal === true &&
    source.unrealizedPnlMinor === "0" &&
    source.complete === true &&
    source.economicValuesAuthoritative === true;
  if (!final) {
    return nextState(current, {
      processedObservationCount: current.processedObservationCount + 1
    }, nowMs);
  }
  try {
    calculateTestnetSettlementWaterfall({
      templateType: current.templateType,
      providerContributionMinor: current.providerContributionMinor,
      subjectContributionMinor: current.subjectContributionMinor,
      finalEquityMinor: source.finalEquityMinor,
      realizedPnlMinor: source.realizedPnlMinor,
      venueCostMinor: source.venueCostMinor,
      closingCostMinor: source.closingCostMinor,
      fixedReturnBps: current.fixedReturnBps,
      performanceParticipationBps: current.performanceParticipationBps,
      durationDays: current.durationDays,
      ipoOneFeeBps: current.ipoOneFeeBps
    });
  } catch {
    return incident(current, "economic_reconciliation_failed", nowMs);
  }
  return nextState(current, {
    processedObservationCount: current.processedObservationCount + 1,
    finalObservationHash: source.observationHash,
    finalSourceEvidenceHash: source.sourceEvidenceHash,
    realizedPnlMinor: source.realizedPnlMinor,
    venueCostMinor: source.venueCostMinor,
    closingCostMinor: source.closingCostMinor,
    finalEquityMinor: source.finalEquityMinor,
    status: HyperliquidTestnetSettlementStatus.READY_TO_SETTLE
  }, nowMs);
}

function deterministicLedgerAccount(facilityId, assetId, accountType, normalSide, now) {
  const core = {
    ownerType: "trading_facility",
    ownerId: facilityId,
    assetId,
    accountType
  };
  const digest = hashId("trading_testnet_settlement_ledger_account", core);
  return deepFreeze({
    ledgerAccountId: `ledger_account_${digest.slice(2)}`,
    ledgerAccountHash: hashId("ledger_account", core),
    ...core,
    normalSide,
    status: "active",
    openedAt: now.toISOString(),
    schemaVersion: "ledger_account.v1"
  });
}

function createSettlementLedger(record, waterfall, now) {
  const accounts = Object.fromEntries(
    SETTLEMENT_ACCOUNT_SPECS.map(([accountType, normalSide]) => [
      accountType,
      deterministicLedgerAccount(
        record.facilityId,
        record.assetId,
        accountType,
        normalSide,
        now
      )
    ])
  );
  const positivePnl = signedMinor("realizedPnlMinor", record.realizedPnlMinor);
  const entrySpecs = [
    ["trading_provider_contributed_capital", LedgerEntryDirection.CREDIT, record.providerContributionMinor],
    ["trading_subject_contributed_capital", LedgerEntryDirection.CREDIT, record.subjectContributionMinor],
    ["trading_realized_gain", LedgerEntryDirection.CREDIT, positivePnl > 0n ? positivePnl.toString() : "0"],
    ["trading_realized_loss", LedgerEntryDirection.DEBIT, positivePnl < 0n ? (-positivePnl).toString() : "0"],
    ["trading_venue_cost", LedgerEntryDirection.DEBIT, record.venueCostMinor],
    ["trading_closing_cost", LedgerEntryDirection.DEBIT, record.closingCostMinor],
    ["trading_provider_principal_return", LedgerEntryDirection.DEBIT, waterfall.providerPrincipalReturnMinor],
    ["trading_subject_contribution_return", LedgerEntryDirection.DEBIT, waterfall.subjectContributionReturnMinor],
    ["trading_provider_fixed_income", LedgerEntryDirection.DEBIT, waterfall.providerFixedReturnNetMinor],
    ["trading_provider_performance_income", LedgerEntryDirection.DEBIT, waterfall.providerPerformanceParticipationNetMinor],
    ["trading_subject_profit", LedgerEntryDirection.DEBIT, waterfall.subjectProfitMinor],
    ["trading_ipo_one_fee_income", LedgerEntryDirection.DEBIT, waterfall.ipoOneFeeMinor]
  ].filter(([, , amount]) => BigInt(amount) > 0n);
  const normalizedEntries = entrySpecs.map(
    ([accountType, direction, amountMinor], sequence) => ({
      ledgerAccountId: accounts[accountType].ledgerAccountId,
      direction,
      amountMinor,
      sequence
    })
  );
  const debitTotal = normalizedEntries
    .filter((item) => item.direction === LedgerEntryDirection.DEBIT)
    .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  const creditTotal = normalizedEntries
    .filter((item) => item.direction === LedgerEntryDirection.CREDIT)
    .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  if (
    debitTotal === 0n ||
    debitTotal !== creditTotal ||
    normalizedEntries.length < 2
  ) {
    fail("testnet_settlement_ledger_unbalanced", "canonical Ledger posting is unbalanced");
  }
  const metadata = {
    settlementHash: record.settlementHash,
    facilityHash: record.facilityHash,
    fundingHash: record.fundingHash,
    closeRequestHash: record.closeRequestHash,
    finalReconciliationHash: record.finalReconciliationHash,
    finalSourceEvidenceHash: record.finalSourceEvidenceHash,
    feePolicyHash: record.feePolicyHash,
    economicTermsImmutable: true,
    allocationOnly: true,
    payoutExecuted: false,
    productionFundsMoved: false
  };
  const transactionCore = {
    idempotencyKey: `tc402:ledger:${record.settlementHash}`,
    transactionType: "trading_testnet_settlement",
    assetId: record.assetId,
    referenceType: "trading_testnet_settlement",
    referenceId: record.settlementId,
    metadata,
    entries: normalizedEntries
  };
  const transactionHash = hashId("ledger_transaction", transactionCore);
  const ledgerTransactionId =
    `ledger_transaction_${transactionHash.slice(2)}`;
  const entries = normalizedEntries.map((entry) => ({
    ledgerEntryId: deterministicId("ledger_entry", {
      ledgerTransactionId,
      sequence: entry.sequence,
      ledgerAccountId: entry.ledgerAccountId
    }),
    ledgerTransactionId,
    ...entry,
    postedAt: now.toISOString(),
    schemaVersion: "ledger_entry.v1"
  }));
  return deepFreeze({
    accounts,
    transaction: {
      ledgerTransactionId,
      transactionHash,
      idempotencyKey: transactionCore.idempotencyKey,
      transactionType: transactionCore.transactionType,
      assetId: transactionCore.assetId,
      referenceType: transactionCore.referenceType,
      referenceId: transactionCore.referenceId,
      metadata,
      metadataHash: hashId("ledger_metadata", metadata),
      debitTotalMinor: debitTotal.toString(),
      creditTotalMinor: creditTotal.toString(),
      entryCount: entries.length,
      entries,
      postedAt: now.toISOString(),
      schemaVersion: "ledger_transaction.v1"
    }
  });
}

function settleRecord(record, snapshot, guard, feePolicy, nowMs) {
  const current = assertRecord(record);
  const kernel = assertKernelSnapshot(snapshot, nowMs);
  assertFeePolicy(feePolicy, nowMs);
  if (current.status !== HyperliquidTestnetSettlementStatus.READY_TO_SETTLE) {
    fail("testnet_settlement_not_ready", "final reconciliation is incomplete");
  }
  if (
    guard.privilegedSettlement !== true ||
    feePolicy.policyHash !== current.feePolicyHash ||
    kernel.facilityId !== current.facilityId ||
    kernel.facilityHash !== current.facilityHash ||
    kernel.facilityStateHash !== current.facilityStateHashBefore ||
    kernel.facilityVersion !== current.facilityVersionBefore ||
    kernel.canonicalLedgerStateHash !== current.canonicalLedgerStateHashBefore ||
    kernel.ledgerTransactionCount !== current.ledgerTransactionCountBefore ||
    kernel.termsHash !== current.termsHash
  ) {
    return { record: incident(current, "settlement_binding_drift", nowMs) };
  }
  const waterfall = calculateTestnetSettlementWaterfall({
    templateType: current.templateType,
    providerContributionMinor: current.providerContributionMinor,
    subjectContributionMinor: current.subjectContributionMinor,
    finalEquityMinor: current.finalEquityMinor,
    realizedPnlMinor: current.realizedPnlMinor,
    venueCostMinor: current.venueCostMinor,
    closingCostMinor: current.closingCostMinor,
    fixedReturnBps: current.fixedReturnBps,
    performanceParticipationBps: current.performanceParticipationBps,
    durationDays: current.durationDays,
    ipoOneFeeBps: current.ipoOneFeeBps
  });
  const now = new Date(nowMs);
  const ledger = createSettlementLedger(current, waterfall, now);
  const facility = settleTradingFacility(kernel.facility, {
    settledByActorId: guard.actorId,
    expectedStateHash: current.facilityStateHashBefore,
    expectedVersion: current.facilityVersionBefore,
    now
  });
  const next = nextState(current, {
    waterfall,
    ledgerTransactionId: ledger.transaction.ledgerTransactionId,
    ledgerTransactionHash: ledger.transaction.transactionHash,
    facilityStateHashAfter: facility.stateHash,
    facilityVersionAfter: facility.version,
    status: HyperliquidTestnetSettlementStatus.SETTLED,
    settledAt: now.toISOString(),
    canonicalLedgerTransactionCreated: true
  }, nowMs);
  return deepFreeze({ record: next, facility, ledger });
}

function performanceClaims(record) {
  return deepFreeze({
    finalReconciliation: true,
    zeroExposure: true,
    waterfallBalanced: true,
    canonicalFacilitySettled: true,
    canonicalObligationLinked: true,
    canonicalLedgerPosted: true,
    principalGuaranteed: false,
    principalFeeApplied: false,
    unrealizedPnlFeeApplied: false,
    payoutExecuted: false,
    finalEquityMinor: record.finalEquityMinor,
    providerPrincipalReturnMinor:
      record.waterfall.providerPrincipalReturnMinor,
    providerPrincipalShortfallMinor:
      record.waterfall.providerPrincipalShortfallMinor,
    subjectFirstLossMinor: record.waterfall.subjectFirstLossMinor,
    providerNetIncomeMinor: record.waterfall.providerNetIncomeMinor,
    subjectProfitMinor: record.waterfall.subjectProfitMinor,
    ipoOneFeeMinor: record.waterfall.ipoOneFeeMinor
  });
}

function revisePerformanceEvidence(record, {
  actorHash,
  status,
  reasonCode,
  nowMs
}) {
  const current = assertRecord(record);
  if (
    ![
      HyperliquidTestnetSettlementStatus.SETTLED,
      HyperliquidTestnetSettlementStatus.EVIDENCE_ACTIVE,
      HyperliquidTestnetSettlementStatus.EVIDENCE_REVOKED
    ].includes(current.status)
  ) {
    fail("testnet_performance_evidence_unavailable", "settlement is not eligible");
  }
  hash("actorHash", actorHash);
  code("reasonCode", reasonCode);
  const evidenceVersion = current.performanceEvidenceVersion + 1;
  if (evidenceVersion > 100) {
    fail("testnet_performance_evidence_unavailable", "Evidence revision limit reached");
  }
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + PROOF_LIFETIME_MS).toISOString();
  const previousEvidenceHash =
    current.currentPerformanceEvidence?.performanceEvidenceHash ?? null;
  const core = {
    settlementId: current.settlementId,
    settlementHash: current.settlementHash,
    facilityId: current.facilityId,
    facilityHash: current.facilityHash,
    obligationId: current.obligationId,
    obligationHash: current.obligationHash,
    ledgerTransactionHash: current.ledgerTransactionHash,
    claims: performanceClaims(current),
    status,
    reasonCode,
    previousEvidenceHash,
    evidenceVersion,
    issuedByActorHash: actorHash,
    issuedAt,
    expiresAt
  };
  const performanceEvidenceHash = hashId(
    "hyperliquid_testnet_performance_evidence",
    core
  );
  const performanceEvidence = deepFreeze({
    performanceEvidenceId: deterministicId(
      "trading_testnet_performance_evidence",
      { performanceEvidenceHash }
    ),
    performanceEvidenceHash,
    ...core,
    revocable: true,
    externalVerificationAvailable: false,
    officialReport: false,
    universalScore: false,
    strategyDataIncluded: false,
    rawHistoryIncluded: false,
    piiIncluded: false,
    secretsIncluded: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion:
      HYPERLIQUID_TESTNET_PERFORMANCE_EVIDENCE_SCHEMA_VERSION
  });
  const next = nextState(current, {
    currentPerformanceEvidence: performanceEvidence,
    performanceEvidenceVersion: evidenceVersion,
    status:
      status === "active"
        ? HyperliquidTestnetSettlementStatus.EVIDENCE_ACTIVE
        : HyperliquidTestnetSettlementStatus.EVIDENCE_REVOKED
  }, nowMs);
  return next;
}

function eventFor(record, {
  eventType,
  actorId,
  reasonCode,
  nowMs
}) {
  const current = assertRecord(record);
  const event = createCreditEvent({
    eventType,
    subjectId: current.subjectId,
    obligationId: current.obligationId,
    payload: {
      settlementId: current.settlementId,
      settlementHash: current.settlementHash,
      stateHash: current.stateHash,
      facilityId: current.facilityId,
      facilityHash: current.facilityHash,
      fundingId: current.fundingId,
      fundingHash: current.fundingHash,
      closeRequestId: current.closeRequestId,
      closeRequestHash: current.closeRequestHash,
      finalReconciliationHash: current.finalReconciliationHash,
      finalSourceEvidenceHash: current.finalSourceEvidenceHash,
      feePolicyHash: current.feePolicyHash,
      status: current.status,
      version: current.version,
      reasonCode,
      finalEquityMinor: current.finalEquityMinor,
      ledgerTransactionHash: current.ledgerTransactionHash,
      performanceEvidenceHash:
        current.currentPerformanceEvidence?.performanceEvidenceHash ?? null,
      performanceEvidenceVersion: current.performanceEvidenceVersion,
      economicTermsImmutable: true,
      noPayoutBeforeFinality: true,
      principalGuaranteeCreated: false,
      principalFeeApplied: false,
      unrealizedPnlFeeApplied: false,
      payoutExecuted: false,
      withdrawalExecuted: false,
      transferExecuted: false,
      simulationOnly: true,
      externalSystemQueried: false,
      productionAuthority: false,
      fundsAuthority: false,
      productionFundsMoved: false,
      actorId
    },
    now: new Date(nowMs)
  });
  return event;
}

export class SimulatedHyperliquidSettlementCommandGuard {
  constructor(options = {}) {
    exactKeys(options, []);
    this.profile = deepFreeze({
      serverOwned: true,
      tenantContextResolved: true,
      privilegedSettlement: true,
      simulationOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_settlement_guard_profile.v1"
    });
  }

  async authorize({
    operation,
    settlementId,
    facilityId,
    idempotencyKey,
    ...unknown
  }) {
    if (
      Object.keys(unknown).length !== 0 ||
      !["prepare", "observe_finality", "settle", "issue_evidence", "revoke_evidence"].includes(operation)
    ) {
      fail("testnet_settlement_authorization_denied", "operation is unavailable");
    }
    identifier("facilityId", facilityId);
    if (settlementId !== null) identifier("settlementId", settlementId);
    identifier("idempotencyKey", idempotencyKey);
    const actorId = operation === "settle"
      ? "system_tc402_settlement_worker"
      : operation === "revoke_evidence"
        ? "system_tc402_evidence_custodian"
        : "system_tc402_testnet_controller";
    return deepFreeze({
      approved: true,
      operation,
      actorId,
      actorHash: hashId("actor", actorId),
      authorizationDecisionHash: hashId(
        "tc402_simulated_authorization_decision",
        { operation, settlementId, facilityId, idempotencyKey }
      ),
      admissionDecisionHash: hashId(
        "tc402_simulated_admission_decision",
        { operation, settlementId, facilityId, idempotencyKey }
      ),
      privilegedSettlement: operation === "settle",
      tenantContextResolved: true,
      clientIdentityAccepted: false,
      simulationOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_settlement_guard.v1"
    });
  }
}

function assertSettlementGuardDecision(value, operation) {
  exactKeys(value, [
    "approved",
    "operation",
    "actorId",
    "actorHash",
    "authorizationDecisionHash",
    "admissionDecisionHash",
    "privilegedSettlement",
    "tenantContextResolved",
    "clientIdentityAccepted",
    "simulationOnly",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  if (
    value.approved !== true ||
    value.operation !== operation ||
    value.privilegedSettlement !== (operation === "settle") ||
    value.tenantContextResolved !== true ||
    value.clientIdentityAccepted !== false ||
    value.simulationOnly !== true ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_simulated_settlement_guard.v1"
  ) {
    fail(
      "testnet_settlement_authorization_denied",
      "closed server authorization is required"
    );
  }
  identifier("actorId", value.actorId);
  hash("actorHash", value.actorHash);
  hash("authorizationDecisionHash", value.authorizationDecisionHash);
  hash("admissionDecisionHash", value.admissionDecisionHash);
  if (hashId("actor", value.actorId) !== value.actorHash) {
    fail(
      "testnet_settlement_authorization_denied",
      "authorized actor binding changed"
    );
  }
  return value;
}

export class SimulatedHyperliquidSettlementKernelResolver {
  #snapshots;

  constructor({ snapshots, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(snapshots) ||
      snapshots.length < 1 ||
      snapshots.length > 16
    ) {
      fail("invalid_testnet_settlement_kernel", "one through 16 snapshots are required");
    }
    this.#snapshots = new Map(
      snapshots.map((snapshot) => [
        snapshot.facilityId,
        deepFreeze(clone(snapshot))
      ])
    );
    this.profile = deepFreeze({
      sourceFixed: true,
      simulationOnly: true,
      networkAvailable: false,
      liveAccountsApproved: false,
      schemaVersion: "hyperliquid_testnet_settlement_kernel_resolver.v1"
    });
  }

  async resolve(facilityId, nowMs) {
    identifier("facilityId", facilityId);
    const snapshot = this.#snapshots.get(facilityId);
    if (!snapshot) {
      fail("testnet_settlement_kernel_unavailable", "snapshot is unavailable");
    }
    return assertKernelSnapshot(clone(snapshot), nowMs);
  }
}

export class ScriptedHyperliquidFinalityObservationAdapter {
  #observations;
  #calls = 0;

  constructor({ observations, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(observations) ||
      observations.length < 1 ||
      observations.length > 32
    ) {
      fail("invalid_testnet_settlement_adapter", "one through 32 observations are required");
    }
    this.#observations = observations.map((item) =>
      deepFreeze(clone(assertObservation(item)))
    );
    this.profile = deepFreeze({
      sourceFixed: true,
      simulationOnly: true,
      networkAvailable: false,
      liveTransportApproved: false,
      closeSubmissionAvailable: false,
      schemaVersion: "hyperliquid_testnet_scripted_finality_adapter.v1"
    });
  }

  get callCount() {
    return this.#calls;
  }

  async observe() {
    const index = Math.min(this.#calls, this.#observations.length - 1);
    this.#calls += 1;
    return clone(this.#observations[index]);
  }
}

export class ScriptedHyperliquidFeePolicyAdapter {
  #policy;

  constructor({ policy, ...unknown } = {}) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_testnet_fee_policy_adapter", "adapter shape is invalid");
    }
    this.#policy = deepFreeze(clone(policy));
    this.profile = deepFreeze({
      sourceFixed: true,
      simulationOnly: true,
      productionPricingApproved: false,
      networkAvailable: false,
      schemaVersion: "hyperliquid_testnet_scripted_fee_policy_adapter.v1"
    });
  }

  async resolve(nowMs) {
    return deepFreeze(clone(assertFeePolicy(this.#policy, nowMs)));
  }
}

export class InMemoryHyperliquidSettlementRepository {
  #records = new Map();
  #commands = new Map();
  #observations = new Map();
  #ledger = new Map();
  #facilities = new Map();
  #events = [];

  async create({ snapshot, feePolicy, guard, idempotencyKeyHash, nowMs }) {
    const candidate = createPendingRecord(
      snapshot,
      feePolicy,
      guard,
      idempotencyKeyHash,
      nowMs
    );
    const key = `prepare:${idempotencyKeyHash}`;
    const replay = this.#commands.get(key);
    if (replay) {
      if (replay.requestHash !== candidate.requestHash) {
        fail("testnet_settlement_idempotency_conflict", "prepare identity was reused");
      }
      return { record: clone(this.#records.get(replay.settlementId)), replayed: true };
    }
    if ([...this.#records.values()].some((item) => item.facilityId === candidate.facilityId)) {
      fail("testnet_settlement_unavailable", "Facility already has a settlement control");
    }
    this.#records.set(candidate.settlementId, candidate);
    this.#commands.set(key, {
      requestHash: candidate.requestHash,
      settlementId: candidate.settlementId
    });
    this.#events.push(eventFor(candidate, {
      eventType: "trading_testnet_settlement_prepared",
      actorId: guard.actorId,
      reasonCode: "settlement_prepared",
      nowMs
    }));
    return { record: clone(candidate), replayed: false };
  }

  async consumeObservation({ settlementId, observation, snapshot, actorId, nowMs }) {
    const source = assertObservation(observation);
    const existingObservation = this.#observations.get(source.observationId);
    if (existingObservation) {
      if (existingObservation.observationHash !== source.observationHash) {
        fail("testnet_settlement_idempotency_conflict", "observation identity was reused");
      }
      return { record: clone(this.#records.get(settlementId)), replayed: true };
    }
    const current = this.#records.get(settlementId);
    if (!current) fail("testnet_settlement_unavailable", "record is unavailable");
    const next = transitionObservation(current, source, snapshot, nowMs);
    this.#records.set(settlementId, next);
    this.#observations.set(source.observationId, source);
    this.#events.push(eventFor(next, {
      eventType:
        next.status === HyperliquidTestnetSettlementStatus.INCIDENT
          ? "trading_testnet_settlement_incident"
          : next.status === HyperliquidTestnetSettlementStatus.READY_TO_SETTLE
            ? "trading_testnet_finality_reconciled"
            : "trading_testnet_finality_pending",
      actorId,
      reasonCode:
        next.status === HyperliquidTestnetSettlementStatus.READY_TO_SETTLE
          ? "finality_reconciled"
          : next.status === HyperliquidTestnetSettlementStatus.INCIDENT
            ? next.incidentReasonCodes.at(-1)
            : "finality_unknown",
      nowMs
    }));
    return { record: clone(next), replayed: false };
  }

  async settle({ settlementId, snapshot, guard, feePolicy, idempotencyKeyHash, nowMs }) {
    const key = `settle:${idempotencyKeyHash}`;
    const replay = this.#commands.get(key);
    if (replay) {
      if (replay.settlementId !== settlementId) {
        fail("testnet_settlement_idempotency_conflict", "settlement identity was reused");
      }
      return {
        record: clone(this.#records.get(settlementId)),
        facility: clone(this.#facilities.get(settlementId)),
        ledger: clone(this.#ledger.get(settlementId)),
        replayed: true
      };
    }
    const current = this.#records.get(settlementId);
    if (!current) fail("testnet_settlement_unavailable", "record is unavailable");
    const result = settleRecord(current, snapshot, guard, feePolicy, nowMs);
    this.#records.set(settlementId, result.record);
    if (result.facility) {
      this.#facilities.set(settlementId, result.facility);
      this.#ledger.set(settlementId, result.ledger);
    }
    this.#commands.set(key, { settlementId });
    this.#events.push(eventFor(result.record, {
      eventType:
        result.record.status === HyperliquidTestnetSettlementStatus.INCIDENT
          ? "trading_testnet_settlement_incident"
          : "trading_testnet_settlement_posted",
      actorId: guard.actorId,
      reasonCode:
        result.record.status === HyperliquidTestnetSettlementStatus.INCIDENT
          ? result.record.incidentReasonCodes.at(-1)
          : "canonical_ledger_posted",
      nowMs
    }));
    return {
      record: clone(result.record),
      facility: clone(result.facility),
      ledger: clone(result.ledger),
      replayed: false
    };
  }

  async reviseEvidence({ settlementId, actorHash, status, reasonCode, idempotencyKeyHash, nowMs }) {
    const key = `evidence:${idempotencyKeyHash}`;
    const replay = this.#commands.get(key);
    if (replay) {
      if (replay.settlementId !== settlementId) {
        fail("testnet_settlement_idempotency_conflict", "Evidence identity was reused");
      }
      return { record: clone(this.#records.get(settlementId)), replayed: true };
    }
    const current = this.#records.get(settlementId);
    if (!current) fail("testnet_settlement_unavailable", "record is unavailable");
    const next = revisePerformanceEvidence(current, {
      actorHash,
      status,
      reasonCode,
      nowMs
    });
    this.#records.set(settlementId, next);
    this.#commands.set(key, { settlementId });
    this.#events.push(eventFor(next, {
      eventType:
        status === "active"
          ? "trading_testnet_performance_evidence_issued"
          : "trading_testnet_performance_evidence_revoked",
      actorId: "system_tc402_evidence_custodian",
      reasonCode,
      nowMs
    }));
    return { record: clone(next), replayed: false };
  }

  async findById(settlementId) {
    const record = this.#records.get(settlementId);
    return record ? clone(record) : undefined;
  }

  get eventCount() {
    return this.#events.length;
  }
}

function settlementInsertValues(record) {
  return [
    record.settlementId,
    record.settlementHash,
    record.stateHash,
    record.requestHash,
    record.idempotencyKeyHash,
    record.authorizationDecisionHash,
    record.admissionDecisionHash,
    record.facilityId,
    record.facilityHash,
    record.facilityStateHashBefore,
    record.facilityVersionBefore,
    record.fundingId,
    record.fundingHash,
    record.closeRequestId,
    record.closeRequestHash,
    record.obligationId,
    record.obligationHash,
    record.subjectId,
    record.assetId,
    record.templateType,
    record.termsHash,
    record.fixedReturnBps,
    record.performanceParticipationBps,
    record.durationDays,
    record.subjectContributionMinor,
    record.providerContributionMinor,
    record.finalReconciliationHash,
    record.feePolicyId,
    record.feePolicyHash,
    record.feeApprovalEvidenceHash,
    record.ipoOneFeeBps,
    record.canonicalLedgerStateHashBefore,
    record.ledgerTransactionCountBefore,
    record.processedObservationCount,
    record.finalObservationHash,
    record.finalSourceEvidenceHash,
    record.realizedPnlMinor,
    record.venueCostMinor,
    record.closingCostMinor,
    record.finalEquityMinor,
    record.ledgerTransactionId,
    record.ledgerTransactionHash,
    record.facilityStateHashAfter,
    record.facilityVersionAfter,
    record.currentPerformanceEvidence?.performanceEvidenceHash ?? null,
    record.performanceEvidenceVersion,
    record.status,
    record.version,
    JSON.stringify(record),
    record.createdAt,
    record.updatedAt,
    record.settledAt,
    record.simulationOnly,
    record.payoutExecuted,
    record.canonicalLedgerTransactionCreated,
    record.secondFacilityCreated,
    record.secondObligationCreated,
    record.secondLedgerCreated,
    record.principalGuaranteeCreated,
    record.syntheticReceivableCreated,
    record.dynamicRepricingApplied,
    record.mainnetAuthority,
    record.productionAuthority,
    record.fundsAuthority,
    record.secretsIncluded,
    record.schemaVersion
  ];
}

function settlementUpdateValues(record) {
  return [
    record.settlementId,
    record.stateHash,
    record.processedObservationCount,
    record.finalObservationHash,
    record.finalSourceEvidenceHash,
    record.realizedPnlMinor,
    record.venueCostMinor,
    record.closingCostMinor,
    record.finalEquityMinor,
    record.ledgerTransactionId,
    record.ledgerTransactionHash,
    record.facilityStateHashAfter,
    record.facilityVersionAfter,
    record.currentPerformanceEvidence?.performanceEvidenceHash ?? null,
    record.performanceEvidenceVersion,
    record.status,
    record.version,
    JSON.stringify(record),
    record.updatedAt,
    record.settledAt,
    record.canonicalLedgerTransactionCreated
  ];
}

async function updateSettlementProjection(client, record, expectedVersion) {
  const result = await client.query(
    `UPDATE trading_testnet_settlement_runs
        SET state_hash = $2,
            processed_observation_count = $3,
            final_observation_hash = $4,
            final_source_evidence_hash = $5,
            realized_pnl_minor = $6,
            venue_cost_minor = $7,
            closing_cost_minor = $8,
            final_equity_minor = $9,
            ledger_transaction_id = $10,
            ledger_transaction_hash = $11,
            facility_state_hash_after = $12,
            facility_version_after = $13,
            performance_evidence_hash = $14,
            performance_evidence_version = $15,
            status = $16,
            version = $17,
            record = $18::JSONB,
            updated_at = $19,
            settled_at = $20,
            canonical_ledger_transaction_created = $21
      WHERE id = $1
        AND version = $22`,
    [...settlementUpdateValues(record), expectedVersion]
  );
  if (result.rowCount !== 1) {
    fail(
      "testnet_settlement_concurrency_conflict",
      "settlement projection lost its version lock"
    );
  }
}

function settlementCommandHash(operation, input) {
  return hashId(`hyperliquid_testnet_settlement_${operation}_command`, input);
}

export class PostgresHyperliquidSettlementRepository {
  #coreRepository;
  #eventRepository;

  constructor({ coreRepository, ...unknown } = {}) {
    const eventRepository = coreRepository?.eventRepository;
    if (
      Object.keys(unknown).length !== 0 ||
      !coreRepository ||
      typeof coreRepository.withTenantTransaction !== "function" ||
      typeof coreRepository.commitCommandInTransaction !== "function" ||
      typeof coreRepository.findCommandInTransaction !== "function" ||
      typeof coreRepository.getProjectionStateInTransaction !== "function" ||
      !eventRepository ||
      typeof eventRepository.appendCommand !== "function" ||
      typeof eventRepository.appendCommandBatchInTransaction !== "function" ||
      typeof eventRepository.processInbox !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_testnet_settlement_repository",
        "the Tenant-scoped PostgreSQL Core/Event Repository is required"
      );
    }
    this.#coreRepository = coreRepository;
    this.#eventRepository = eventRepository;
  }

  async create({
    snapshot,
    feePolicy,
    guard,
    idempotencyKeyHash,
    nowMs
  }) {
    const record = createPendingRecord(
      snapshot,
      feePolicy,
      guard,
      idempotencyKeyHash,
      nowMs
    );
    const event = eventFor(record, {
      eventType: "trading_testnet_settlement_prepared",
      actorId: guard.actorId,
      reasonCode: "settlement_prepared",
      nowMs
    });
    const committed = await this.#eventRepository.appendCommand({
      aggregateType: "trading_testnet_settlement",
      aggregateId: record.settlementId,
      expectedVersion: 0,
      idempotencyKey: `tc402:prepare:${idempotencyKeyHash}`,
      commandHash: record.requestHash,
      event,
      outboxTopic: SETTLEMENT_OUTBOX_TOPIC,
      response: record,
      applyProjection: async ({ client }) => {
        await client.query(
          `INSERT INTO trading_testnet_settlement_runs (
             id, settlement_hash, state_hash, request_hash,
             idempotency_key_hash, authorization_decision_hash,
             admission_decision_hash, facility_id, facility_hash,
             facility_state_hash_before, facility_version_before,
             funding_id, funding_hash, close_request_id,
             close_request_hash, obligation_id, obligation_hash,
             subject_id, asset_id, template_type, terms_hash,
             fixed_return_bps, performance_participation_bps,
             duration_days, subject_contribution_minor,
             provider_contribution_minor, final_reconciliation_hash,
             fee_policy_id, fee_policy_hash,
             fee_approval_evidence_hash, ipo_one_fee_bps,
             canonical_ledger_state_hash_before,
             ledger_transaction_count_before,
             processed_observation_count, final_observation_hash,
             final_source_evidence_hash, realized_pnl_minor,
             venue_cost_minor, closing_cost_minor, final_equity_minor,
             ledger_transaction_id, ledger_transaction_hash,
             facility_state_hash_after, facility_version_after,
             performance_evidence_hash, performance_evidence_version,
             status, version, record, created_at, updated_at,
             settled_at, simulation_only, payout_executed,
             canonical_ledger_transaction_created,
             second_facility_created, second_obligation_created,
             second_ledger_created, principal_guarantee_created,
             synthetic_receivable_created, dynamic_repricing_applied,
             mainnet_authority, production_authority, funds_authority,
             secrets_included, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
             $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
             $41, $42, $43, $44, $45, $46, $47, $48, $49::JSONB,
             $50, $51, $52, $53, $54, $55, $56, $57, $58, $59,
             $60, $61, $62, $63, $64, $65, $66
           )`,
          settlementInsertValues(record)
        );
      }
    });
    if (committed.replayed) {
      const current = await this.findById(record.settlementId);
      if (!current || current.requestHash !== record.requestHash) {
        fail(
          "testnet_settlement_idempotency_conflict",
          "replayed preparation is not bound to the durable record"
        );
      }
      return { record: current, replayed: true };
    }
    return {
      record: deepFreeze(assertRecord(committed.response)),
      replayed: false
    };
  }

  async consumeObservation({
    settlementId,
    observation,
    snapshot,
    actorId,
    nowMs
  }) {
    identifier("settlementId", settlementId);
    identifier("actorId", actorId);
    const source = assertObservation(observation);
    const payloadHash = hashId("inbox_payload", source);
    const processed = await this.#eventRepository.processInbox({
      consumerName: SETTLEMENT_INBOX_CONSUMER,
      eventId: source.observationId,
      payload: source,
      payloadHash,
      handler: async ({ client }) => {
        const result = await client.query(
          `SELECT record
             FROM trading_testnet_settlement_runs
            WHERE id = $1
            FOR UPDATE`,
          [settlementId]
        );
        if (result.rowCount !== 1) {
          fail(
            "testnet_settlement_unavailable",
            "settlement record is unavailable"
          );
        }
        const current = assertRecord(result.rows[0].record);
        if (
          current.status !==
          HyperliquidTestnetSettlementStatus.AWAITING_FINALITY
        ) {
          return current;
        }
        const next = transitionObservation(
          current,
          source,
          snapshot,
          nowMs
        );
        const event = eventFor(next, {
          eventType:
            next.status === HyperliquidTestnetSettlementStatus.INCIDENT
              ? "trading_testnet_settlement_incident"
              : next.status ===
                  HyperliquidTestnetSettlementStatus.READY_TO_SETTLE
                ? "trading_testnet_finality_reconciled"
                : "trading_testnet_finality_pending",
          actorId,
          reasonCode:
            next.status === HyperliquidTestnetSettlementStatus.INCIDENT
              ? next.incidentReasonCodes.at(-1)
              : next.status ===
                  HyperliquidTestnetSettlementStatus.READY_TO_SETTLE
                ? "finality_reconciled"
                : "finality_unknown",
          nowMs
        });
        const committed =
          await this.#eventRepository.appendCommandBatchInTransaction(
            client,
            {
              aggregateType: "trading_testnet_settlement",
              aggregateId: settlementId,
              idempotencyKey:
                `tc402:observation:${source.observationId}`,
              commandHash: payloadHash,
              events: [{
                aggregateType: "trading_testnet_settlement",
                aggregateId: settlementId,
                expectedVersion: current.version,
                event,
                outboxTopic: SETTLEMENT_OUTBOX_TOPIC
              }],
              response: next,
              applyProjection: async () => {
                await updateSettlementProjection(
                  client,
                  next,
                  current.version
                );
              }
            }
          );
        return committed.response;
      }
    });
    return {
      record: deepFreeze(assertRecord(processed.result)),
      replayed: processed.replayed
    };
  }

  async settle({
    settlementId,
    snapshot,
    guard,
    feePolicy,
    idempotencyKeyHash,
    nowMs
  }) {
    identifier("settlementId", settlementId);
    hash("idempotencyKeyHash", idempotencyKeyHash);
    const idempotencyKey = `tc402:settle:${idempotencyKeyHash}`;
    const commandHash = settlementCommandHash("post", {
      settlementId,
      idempotencyKeyHash
    });
    return this.#coreRepository.withTenantTransaction(async (client) => {
      const replay =
        await this.#coreRepository.findCommandInTransaction(client, {
          idempotencyKey,
          commandHash,
          expectedAggregateType: "trading_testnet_settlement",
          expectedAggregateId: settlementId,
          lock: true
        });
      if (replay) {
        return {
          ...deepFreeze(clone(replay.response)),
          replayed: true
        };
      }
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_settlement_runs
          WHERE id = $1
          FOR UPDATE`,
        [settlementId]
      );
      if (result.rowCount !== 1) {
        fail(
          "testnet_settlement_unavailable",
          "settlement record is unavailable"
        );
      }
      const current = assertRecord(result.rows[0].record);
      const outcome = settleRecord(
        current,
        snapshot,
        guard,
        feePolicy,
        nowMs
      );
      const settlementEvent = eventFor(outcome.record, {
        eventType:
          outcome.record.status ===
          HyperliquidTestnetSettlementStatus.INCIDENT
            ? "trading_testnet_settlement_incident"
            : "trading_testnet_settlement_posted",
        actorId: guard.actorId,
        reasonCode:
          outcome.record.status ===
          HyperliquidTestnetSettlementStatus.INCIDENT
            ? outcome.record.incidentReasonCodes.at(-1)
            : "canonical_ledger_posted",
        nowMs
      });
      if (!outcome.facility) {
        const committed =
          await this.#eventRepository.appendCommandBatchInTransaction(
            client,
            {
              aggregateType: "trading_testnet_settlement",
              aggregateId: settlementId,
              idempotencyKey,
              commandHash,
              events: [{
                aggregateType: "trading_testnet_settlement",
                aggregateId: settlementId,
                expectedVersion: current.version,
                event: settlementEvent,
                outboxTopic: SETTLEMENT_OUTBOX_TOPIC
              }],
              response: { record: outcome.record },
              applyProjection: async () => {
                await updateSettlementProjection(
                  client,
                  outcome.record,
                  current.version
                );
              }
            }
          );
        return {
          record: deepFreeze(assertRecord(committed.response.record)),
          facility: undefined,
          ledger: undefined,
          replayed: committed.replayed
        };
      }
      const facilityEvent = createCreditEvent({
        eventType: "trading_facility_settled",
        subjectId: outcome.record.subjectId,
        obligationId: outcome.record.obligationId,
        payload: {
          tradingFacilityId: outcome.record.facilityId,
          settlementId: outcome.record.settlementId,
          settlementHash: outcome.record.settlementHash,
          previousStateHash: outcome.record.facilityStateHashBefore,
          stateHash: outcome.facility.stateHash,
          ledgerTransactionHash:
            outcome.ledger.transaction.transactionHash,
          finalReconciliationHash:
            outcome.record.finalReconciliationHash,
          finalEquityMinor: outcome.record.finalEquityMinor,
          waterfallBalanced: true,
          canonicalFacility: true,
          canonicalObligation: true,
          canonicalLedger: true,
          payoutExecuted: false,
          withdrawalExecuted: false,
          transferExecuted: false,
          principalGuaranteeCreated: false,
          secondFacilityCreated: false,
          secondObligationCreated: false,
          secondLedgerCreated: false,
          simulationOnly: true,
          externalSystemQueried: false,
          productionAuthority: false,
          fundsAuthority: false,
          productionFundsMoved: false,
          actorId: guard.actorId
        },
        now: new Date(nowMs)
      });
      await updateSettlementProjection(
        client,
        outcome.record,
        current.version
      );
      const writes = [
        ...Object.values(outcome.ledger.accounts).map((account) => ({
          type: "ledger_account",
          value: account,
          eventId: settlementEvent.eventId
        })),
        {
          type: "ledger_transaction",
          value: outcome.ledger.transaction,
          eventId: settlementEvent.eventId
        },
        {
          type: "trading_facility",
          value: outcome.facility,
          eventId: facilityEvent.eventId
        }
      ];
      const response = {
        record: outcome.record,
        facility: outcome.facility,
        ledger: outcome.ledger
      };
      const committed =
        await this.#coreRepository.commitCommandInTransaction(
          client,
          {
            aggregateType: "trading_testnet_settlement",
            aggregateId: settlementId,
            idempotencyKey,
            commandHash,
            events: [
              {
                aggregateType: "trading_testnet_settlement",
                aggregateId: settlementId,
                expectedVersion: current.version,
                event: settlementEvent,
                outboxTopic: SETTLEMENT_OUTBOX_TOPIC
              },
              {
                aggregateType: "trading_facility",
                aggregateId: current.facilityId,
                expectedVersion: current.facilityVersionBefore,
                event: facilityEvent,
                outboxTopic: SETTLEMENT_OUTBOX_TOPIC
              }
            ],
            writes,
            response
          }
        );
      return {
        record: deepFreeze(
          assertRecord(committed.response.record)
        ),
        facility: deepFreeze(clone(committed.response.facility)),
        ledger: deepFreeze(clone(committed.response.ledger)),
        replayed: committed.replayed
      };
    });
  }

  async reviseEvidence({
    settlementId,
    actorHash,
    status,
    reasonCode,
    idempotencyKeyHash,
    nowMs
  }) {
    identifier("settlementId", settlementId);
    hash("actorHash", actorHash);
    hash("idempotencyKeyHash", idempotencyKeyHash);
    const idempotencyKey =
      `tc402:evidence:${idempotencyKeyHash}`;
    const commandHash = settlementCommandHash("evidence", {
      settlementId,
      status,
      reasonCode: status === "revoked" ? reasonCode : null,
      idempotencyKeyHash
    });
    return this.#coreRepository.withTenantTransaction(async (client) => {
      const replay =
        await this.#coreRepository.findCommandInTransaction(client, {
          idempotencyKey,
          commandHash,
          expectedAggregateType: "trading_testnet_settlement",
          expectedAggregateId: settlementId,
          lock: true
        });
      if (replay) {
        return {
          record: deepFreeze(assertRecord(replay.response)),
          replayed: true
        };
      }
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_settlement_runs
          WHERE id = $1
          FOR UPDATE`,
        [settlementId]
      );
      if (result.rowCount !== 1) {
        fail(
          "testnet_settlement_unavailable",
          "settlement record is unavailable"
        );
      }
      const current = assertRecord(result.rows[0].record);
      const next = revisePerformanceEvidence(current, {
        actorHash,
        status,
        reasonCode,
        nowMs
      });
      const event = eventFor(next, {
        eventType:
          status === "active"
            ? "trading_testnet_performance_evidence_issued"
            : "trading_testnet_performance_evidence_revoked",
        actorId: "system_tc402_evidence_custodian",
        reasonCode,
        nowMs
      });
      const committed =
        await this.#eventRepository.appendCommandBatchInTransaction(
          client,
          {
            aggregateType: "trading_testnet_settlement",
            aggregateId: settlementId,
            idempotencyKey,
            commandHash,
            events: [{
              aggregateType: "trading_testnet_settlement",
              aggregateId: settlementId,
              expectedVersion: current.version,
              event,
              outboxTopic: SETTLEMENT_OUTBOX_TOPIC
            }],
            response: next,
            applyProjection: async () => {
              await updateSettlementProjection(
                client,
                next,
                current.version
              );
            }
          }
        );
      return {
        record: deepFreeze(assertRecord(committed.response)),
        replayed: committed.replayed
      };
    });
  }

  async findById(settlementId) {
    identifier("settlementId", settlementId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_settlement_runs
          WHERE id = $1`,
        [settlementId]
      );
      return result.rowCount === 1
        ? deepFreeze(assertRecord(clone(result.rows[0].record)))
        : undefined;
    });
  }

  async history(settlementId) {
    identifier("settlementId", settlementId);
    return this.#eventRepository.listEvents({
      aggregateType: "trading_testnet_settlement",
      aggregateId: settlementId
    });
  }
}

export class HyperliquidTestnetSettlementService {
  #repository;
  #commandGuard;
  #kernelResolver;
  #observationAdapter;
  #feePolicyAdapter;
  #clock;

  constructor({
    repository,
    commandGuard,
    kernelResolver,
    observationAdapter,
    feePolicyAdapter,
    clock = Date.now,
    ...unknown
  } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !repository ||
      typeof repository.create !== "function" ||
      typeof repository.consumeObservation !== "function" ||
      typeof repository.settle !== "function" ||
      typeof repository.reviseEvidence !== "function" ||
      typeof repository.findById !== "function" ||
      !commandGuard ||
      typeof commandGuard.authorize !== "function" ||
      commandGuard.profile?.serverOwned !== true ||
      commandGuard.profile.tenantContextResolved !== true ||
      commandGuard.profile.privilegedSettlement !== true ||
      commandGuard.profile.simulationOnly !== true ||
      commandGuard.profile.productionAuthority !== false ||
      commandGuard.profile.fundsAuthority !== false ||
      kernelResolver?.profile?.sourceFixed !== true ||
      kernelResolver.profile.simulationOnly !== true ||
      kernelResolver.profile.networkAvailable !== false ||
      kernelResolver.profile.liveAccountsApproved !== false ||
      observationAdapter?.profile?.sourceFixed !== true ||
      observationAdapter.profile.simulationOnly !== true ||
      observationAdapter.profile.networkAvailable !== false ||
      observationAdapter.profile.liveTransportApproved !== false ||
      observationAdapter.profile.closeSubmissionAvailable !== false ||
      feePolicyAdapter?.profile?.sourceFixed !== true ||
      feePolicyAdapter.profile.simulationOnly !== true ||
      feePolicyAdapter.profile.productionPricingApproved !== false ||
      feePolicyAdapter.profile.networkAvailable !== false ||
      typeof clock !== "function"
    ) {
      fail("invalid_testnet_settlement_service", "closed settlement dependencies are required");
    }
    this.#repository = repository;
    this.#commandGuard = commandGuard;
    this.#kernelResolver = kernelResolver;
    this.#observationAdapter = observationAdapter;
    this.#feePolicyAdapter = feePolicyAdapter;
    this.#clock = clock;
  }

  async prepare({ facilityId, facilityHash, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_testnet_settlement", "prepare input has an open shape");
    }
    identifier("facilityId", facilityId);
    hash("facilityHash", facilityHash);
    identifier("idempotencyKey", idempotencyKey);
    const nowMs = this.#clock();
    const snapshot = await this.#kernelResolver.resolve(facilityId, nowMs);
    if (snapshot.facilityHash !== facilityHash) {
      fail("testnet_settlement_kernel_unavailable", "Facility hash changed");
    }
    const feePolicy = await this.#feePolicyAdapter.resolve(nowMs);
    const guard = assertSettlementGuardDecision(
      await this.#commandGuard.authorize({
        operation: "prepare",
        settlementId: null,
        facilityId,
        idempotencyKey
      }),
      "prepare"
    );
    return this.#repository.create({
      snapshot,
      feePolicy,
      guard,
      idempotencyKeyHash: hashId("idempotency_key", idempotencyKey),
      nowMs
    });
  }

  async reconcileFinality({ settlementId, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_testnet_settlement", "finality input has an open shape");
    }
    identifier("settlementId", settlementId);
    const current = await this.#repository.findById(settlementId);
    if (!current) fail("testnet_settlement_unavailable", "record is unavailable");
    const nowMs = this.#clock();
    const observation = assertObservation(
      await this.#observationAdapter.observe({ settlementId })
    );
    const snapshot = await this.#kernelResolver.resolve(current.facilityId, nowMs);
    const guard = assertSettlementGuardDecision(
      await this.#commandGuard.authorize({
        operation: "observe_finality",
        settlementId,
        facilityId: current.facilityId,
        idempotencyKey: observation.observationId
      }),
      "observe_finality"
    );
    return this.#repository.consumeObservation({
      settlementId,
      observation,
      snapshot,
      actorId: guard.actorId,
      nowMs
    });
  }

  async settle({ settlementId, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_testnet_settlement", "settle input has an open shape");
    }
    identifier("settlementId", settlementId);
    identifier("idempotencyKey", idempotencyKey);
    const current = await this.#repository.findById(settlementId);
    if (!current) fail("testnet_settlement_unavailable", "record is unavailable");
    const nowMs = this.#clock();
    const snapshot = await this.#kernelResolver.resolve(current.facilityId, nowMs);
    const feePolicy = await this.#feePolicyAdapter.resolve(nowMs);
    const guard = assertSettlementGuardDecision(
      await this.#commandGuard.authorize({
        operation: "settle",
        settlementId,
        facilityId: current.facilityId,
        idempotencyKey
      }),
      "settle"
    );
    return this.#repository.settle({
      settlementId,
      snapshot,
      guard,
      feePolicy,
      idempotencyKeyHash: hashId("idempotency_key", idempotencyKey),
      nowMs
    });
  }

  async issuePerformanceEvidence({ settlementId, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_testnet_settlement", "Evidence input has an open shape");
    }
    identifier("settlementId", settlementId);
    identifier("idempotencyKey", idempotencyKey);
    const current = await this.#repository.findById(settlementId);
    if (!current) fail("testnet_settlement_unavailable", "record is unavailable");
    const nowMs = this.#clock();
    const guard = assertSettlementGuardDecision(
      await this.#commandGuard.authorize({
        operation: "issue_evidence",
        settlementId,
        facilityId: current.facilityId,
        idempotencyKey
      }),
      "issue_evidence"
    );
    const reasonCode =
      current.performanceEvidenceVersion === 0
        ? "initial_final_performance"
        : current.status === HyperliquidTestnetSettlementStatus.EVIDENCE_REVOKED
          ? "reissued_after_revocation"
          : "superseded_by_new_evidence";
    return this.#repository.reviseEvidence({
      settlementId,
      actorHash: guard.actorHash,
      status: "active",
      reasonCode,
      idempotencyKeyHash: hashId("idempotency_key", idempotencyKey),
      nowMs
    });
  }

  async revokePerformanceEvidence({
    settlementId,
    idempotencyKey,
    reasonCode,
    ...unknown
  }) {
    if (
      Object.keys(unknown).length !== 0 ||
      ![
        "source_evidence_invalidated",
        "settlement_correction_required",
        "privacy_revocation"
      ].includes(reasonCode)
    ) {
      fail("invalid_testnet_settlement", "revocation input is invalid");
    }
    identifier("settlementId", settlementId);
    identifier("idempotencyKey", idempotencyKey);
    const current = await this.#repository.findById(settlementId);
    if (
      !current ||
      current.status !== HyperliquidTestnetSettlementStatus.EVIDENCE_ACTIVE
    ) {
      fail("testnet_performance_evidence_unavailable", "active Evidence is required");
    }
    const nowMs = this.#clock();
    const guard = assertSettlementGuardDecision(
      await this.#commandGuard.authorize({
        operation: "revoke_evidence",
        settlementId,
        facilityId: current.facilityId,
        idempotencyKey
      }),
      "revoke_evidence"
    );
    return this.#repository.reviseEvidence({
      settlementId,
      actorHash: guard.actorHash,
      status: "revoked",
      reasonCode,
      idempotencyKeyHash: hashId("idempotency_key", idempotencyKey),
      nowMs
    });
  }
}

export function hyperliquidTestnetSettlementView(value) {
  return deepFreeze(clone(assertRecord(value)));
}
