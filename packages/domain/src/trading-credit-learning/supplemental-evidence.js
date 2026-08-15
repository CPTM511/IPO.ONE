import { createOperationalId, hashId } from "../ids.js";
import {
  TRADING_CREDIT_SUPPLEMENT_SCHEMA_VERSION
} from "./contracts.js";
import {
  INDEX_SCALE,
  assetId,
  exactObject,
  fail,
  hash,
  immutable,
  minor,
  nonNegativeInteger,
  positiveInteger,
  ratioBps,
  signedMinor,
  timestamp,
  uniqueHashes
} from "./shared.js";

function normalizeEquitySeries(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 2_000) {
    fail("equitySeries is invalid");
  }
  const normalized = values.map((row, index) => {
    exactObject(`equitySeries[${index}]`, row, [
      "observedAt",
      "equityMinor",
      "netExternalFlowMinor",
      "positionNotionalMinor",
      "evidenceHash"
    ]);
    return {
      observedAt: timestamp(
        `equitySeries[${index}].observedAt`,
        row.observedAt
      ),
      equityMinor: minor(
        `equitySeries[${index}].equityMinor`,
        row.equityMinor,
        { positive: true }
      ).toString(),
      netExternalFlowMinor: signedMinor(
        `equitySeries[${index}].netExternalFlowMinor`,
        row.netExternalFlowMinor
      ).toString(),
      positionNotionalMinor: minor(
        `equitySeries[${index}].positionNotionalMinor`,
        row.positionNotionalMinor
      ).toString(),
      evidenceHash: hash(
        `equitySeries[${index}].evidenceHash`,
        row.evidenceHash
      )
    };
  });
  normalized.sort(
    (left, right) =>
      new Date(left.observedAt).getTime() -
      new Date(right.observedAt).getTime()
  );
  for (let index = 1; index < normalized.length; index += 1) {
    if (
      new Date(normalized[index].observedAt).getTime() <=
      new Date(normalized[index - 1].observedAt).getTime()
    ) {
      fail("equitySeries timestamps must be unique and increasing");
    }
  }
  if (BigInt(normalized[0].netExternalFlowMinor) !== 0n) {
    fail("the first equity observation cannot contain an external flow");
  }
  return normalized;
}

function assertIntegrityChecks(value) {
  exactObject("integrityChecks", value, [
    "walletCluster",
    "selfTransfer",
    "washTrading",
    "evidenceHash"
  ]);
  for (const key of ["walletCluster", "selfTransfer", "washTrading"]) {
    if (!["clear", "flagged"].includes(value[key])) {
      fail(`integrityChecks.${key} is invalid`);
    }
  }
  hash("integrityChecks.evidenceHash", value.evidenceHash);
  return structuredClone(value);
}

export function createTradingCreditSupplementalEvidence({
  accountBindingHash,
  historyHash,
  evidenceSnapshotHash,
  assetId: inputAssetId,
  assetDecimals,
  observedAt,
  sourceEvidenceHashes,
  equitySeries,
  liquidationCount,
  mandateBreachCount,
  integrityChecks,
  repaymentCashflowCapacityMinor
}) {
  const normalizedAssetId = assetId(inputAssetId);
  positiveInteger("assetDecimals", assetDecimals, 18);
  const normalizedObservedAt = timestamp("observedAt", observedAt);
  const normalizedSeries = normalizeEquitySeries(equitySeries);
  if (
    new Date(normalizedObservedAt).getTime() <
    new Date(normalizedSeries.at(-1).observedAt).getTime()
  ) {
    fail("supplemental Evidence cannot precede its final equity observation");
  }
  const normalizedChecks = assertIntegrityChecks(integrityChecks);
  const explicitHashes = uniqueHashes(
    "sourceEvidenceHashes",
    sourceEvidenceHashes
  );
  const allSourceEvidenceHashes = [
    ...new Set([
      ...explicitHashes,
      ...normalizedSeries.map((row) => row.evidenceHash),
      normalizedChecks.evidenceHash
    ])
  ].sort();
  const normalized = {
    accountBindingHash: hash("accountBindingHash", accountBindingHash),
    historyHash: hash("historyHash", historyHash),
    evidenceSnapshotHash: hash(
      "evidenceSnapshotHash",
      evidenceSnapshotHash
    ),
    assetId: normalizedAssetId,
    assetDecimals,
    observedAt: normalizedObservedAt,
    sourceFinality: "finalized",
    reconciliationStatus: "reconciled",
    sourceEvidenceHashes: allSourceEvidenceHashes,
    equitySeries: normalizedSeries,
    liquidationCount: nonNegativeInteger(
      "liquidationCount",
      liquidationCount
    ),
    mandateBreachCount: nonNegativeInteger(
      "mandateBreachCount",
      mandateBreachCount
    ),
    integrityChecks: normalizedChecks,
    repaymentCashflowCapacityMinor: minor(
      "repaymentCashflowCapacityMinor",
      repaymentCashflowCapacityMinor
    ).toString(),
    rawTransactionsIncluded: false,
    rawAddressesIncluded: false,
    selfReportedSignalsAccepted: false,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false
  };
  return immutable({
    supplementalEvidenceId: createOperationalId(
      "trading_credit_supplemental_evidence"
    ),
    supplementalEvidenceHash: hashId(
      "trading_credit_supplemental_evidence",
      normalized
    ),
    ...normalized,
    schemaVersion: TRADING_CREDIT_SUPPLEMENT_SCHEMA_VERSION
  });
}

export function assertSupplement(value, profile, policy) {
  exactObject("supplementalEvidence", value, [
    "supplementalEvidenceId",
    "supplementalEvidenceHash",
    "accountBindingHash",
    "historyHash",
    "evidenceSnapshotHash",
    "assetId",
    "assetDecimals",
    "observedAt",
    "sourceFinality",
    "reconciliationStatus",
    "sourceEvidenceHashes",
    "equitySeries",
    "liquidationCount",
    "mandateBreachCount",
    "integrityChecks",
    "repaymentCashflowCapacityMinor",
    "rawTransactionsIncluded",
    "rawAddressesIncluded",
    "selfReportedSignalsAccepted",
    "authorizing",
    "fundsAuthority",
    "economicStateMutation",
    "schemaVersion"
  ]);
  if (
    value.schemaVersion !== TRADING_CREDIT_SUPPLEMENT_SCHEMA_VERSION ||
    value.sourceFinality !== "finalized" ||
    value.reconciliationStatus !== "reconciled" ||
    value.rawTransactionsIncluded !== false ||
    value.rawAddressesIncluded !== false ||
    value.selfReportedSignalsAccepted !== false ||
    value.authorizing !== false ||
    value.fundsAuthority !== false ||
    value.economicStateMutation !== false ||
    value.accountBindingHash !== profile.accountBinding.accountBindingHash ||
    value.historyHash !== profile.historyImport.historyHash ||
    value.evidenceSnapshotHash !== profile.evidenceSnapshot.snapshotHash ||
    value.assetId !== policy.assetId ||
    value.assetDecimals !== policy.assetDecimals
  ) {
    fail("supplemental Evidence binding or safety boundary is invalid");
  }
  hash("supplementalEvidenceHash", value.supplementalEvidenceHash);
  const normalizedSeries = normalizeEquitySeries(value.equitySeries);
  if (
    hashId("trading_credit_equity_series_canonical", normalizedSeries) !==
    hashId("trading_credit_equity_series_canonical", value.equitySeries)
  ) {
    fail("supplemental Evidence equity series is not canonical");
  }
  assertIntegrityChecks(value.integrityChecks);
  const normalizedSourceHashes = uniqueHashes(
    "sourceEvidenceHashes",
    value.sourceEvidenceHashes
  );
  const requiredSourceHashes = [
    ...new Set([
      ...normalizedSeries.map((row) => row.evidenceHash),
      value.integrityChecks.evidenceHash,
      ...normalizedSourceHashes
    ])
  ].sort();
  if (
    requiredSourceHashes.length !== normalizedSourceHashes.length ||
    requiredSourceHashes.some(
      (sourceHash, index) => sourceHash !== normalizedSourceHashes[index]
    )
  ) {
    fail("supplemental Evidence source lineage is incomplete");
  }
  const normalizedObservedAt = timestamp(
    "supplementalEvidence.observedAt",
    value.observedAt
  );
  if (
    new Date(normalizedObservedAt).getTime() <
    new Date(normalizedSeries.at(-1).observedAt).getTime()
  ) {
    fail("supplemental Evidence precedes its equity series");
  }
  nonNegativeInteger(
    "supplementalEvidence.liquidationCount",
    value.liquidationCount
  );
  nonNegativeInteger(
    "supplementalEvidence.mandateBreachCount",
    value.mandateBreachCount
  );
  minor(
    "supplementalEvidence.repaymentCashflowCapacityMinor",
    value.repaymentCashflowCapacityMinor
  );
  const {
    supplementalEvidenceId,
    supplementalEvidenceHash,
    schemaVersion,
    ...core
  } = value;
  if (
    supplementalEvidenceHash !==
    hashId("trading_credit_supplemental_evidence", core)
  ) {
    fail("supplemental Evidence hash does not match its content");
  }
  return value;
}

export function calculateSeriesMetrics(series) {
  const equities = series.map((row) => BigInt(row.equityMinor));
  const sortedEquities = [...equities].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const p10Index = Math.floor((sortedEquities.length - 1) / 10);
  const equityP10Minor = sortedEquities[p10Index];
  const leverageValues = series
    .map((row) =>
      ratioBps(
        BigInt(row.positionNotionalMinor),
        BigInt(row.equityMinor),
        { cap: 1_000_000 }
      )
    )
    .sort((left, right) => left - right);
  const p95Index = Math.max(
    0,
    Math.ceil(leverageValues.length * 0.95) - 1
  );
  const p95LeverageBps = leverageValues[p95Index];
  let indexValue = INDEX_SCALE;
  let peak = INDEX_SCALE;
  let maximumDrawdownBps = 0;
  let positivePeriods = 0;
  for (let index = 1; index < series.length; index += 1) {
    const previousEquity = BigInt(series[index - 1].equityMinor);
    const currentEquity = BigInt(series[index].equityMinor);
    const externalFlow = BigInt(series[index].netExternalFlowMinor);
    const flowAdjustedEquity = currentEquity - externalFlow;
    if (flowAdjustedEquity <= 0n) {
      fail("flow-adjusted equity must remain positive");
    }
    if (flowAdjustedEquity > previousEquity) positivePeriods += 1;
    indexValue = (indexValue * flowAdjustedEquity) / previousEquity;
    if (indexValue > peak) peak = indexValue;
    const drawdown = ratioBps(peak - indexValue, peak, { cap: 10_000 });
    if (drawdown > maximumDrawdownBps) maximumDrawdownBps = drawdown;
  }
  const positivePeriodRateBps = ratioBps(
    BigInt(positivePeriods),
    BigInt(series.length - 1),
    { cap: 10_000 }
  );
  return {
    equityP10Minor,
    p95LeverageBps,
    maximumDrawdownBps,
    positivePeriodRateBps
  };
}
