import {
  RailFinalityModel,
  RailKind,
  SettlementFinality,
  SettlementOutcome,
  TransferDirection,
  TransferIntentStatus,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertNonNegativeMinorUnits,
  assertPositiveMinorUnits
} from "./validators.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const RAIL_ID_PATTERN = /^rail_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function parseTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_timestamp", `${name} must be an ISO timestamp`, { name, value });
  }
  return parsed.toISOString();
}

function uniqueEnumValues(name, values, allowedValues) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new DomainError("invalid_enum_list", `${name} must be a non-empty array`, { name });
  }
  for (const value of values) assertEnumValue(name, value, allowedValues);
  if (new Set(values).size !== values.length) {
    throw new DomainError("duplicate_contract_value", `${name} cannot contain duplicates`, { name });
  }
  return [...values];
}

function normalizeAsset(name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("invalid_asset_descriptor", `${name} must be an object`, { name });
  }
  assertNonEmptyString(`${name}.assetId`, value.assetId);
  if (!Number.isSafeInteger(value.scale) || value.scale < 0 || value.scale > 30) {
    throw new DomainError("invalid_asset_scale", `${name}.scale must be an integer from 0 through 30`, {
      name,
      scale: value.scale
    });
  }
  return { assetId: value.assetId, scale: value.scale };
}

function normalizeMoney(name, value, { allowZero = false } = {}) {
  const asset = normalizeAsset(name, value);
  const amount = allowZero
    ? assertNonNegativeMinorUnits(value.amountMinor, `${name}.amountMinor`)
    : assertPositiveMinorUnits(value.amountMinor, `${name}.amountMinor`);
  return { ...asset, amountMinor: amount.toString() };
}

function assertOpaqueHash(name, value) {
  assertNonEmptyString(name, value);
  if (!HASH_PATTERN.test(value)) {
    throw new DomainError("invalid_opaque_hash", `${name} must be an opaque 32-byte hex hash`, { name });
  }
}

function normalizeAssetList(name, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new DomainError("invalid_asset_list", `${name} must be a non-empty array`, { name });
  }
  const normalized = values.map((value) => normalizeAsset(name, value));
  const keys = normalized.map((value) => `${value.assetId}\0${value.scale}`);
  if (new Set(keys).size !== keys.length) {
    throw new DomainError("duplicate_contract_value", `${name} cannot contain duplicates`, { name });
  }
  return normalized;
}

export function createRailDescriptor(input) {
  assertNoRawPiiReference(input, "railDescriptor");
  for (const name of ["railId", "displayName", "adapterVersion"]) assertNonEmptyString(name, input[name]);
  if (!RAIL_ID_PATTERN.test(input.railId)) {
    throw new DomainError("invalid_rail_id", "railId must be a stable snake-case rail identifier", {
      railId: input.railId
    });
  }
  if (!VERSION_PATTERN.test(input.adapterVersion)) {
    throw new DomainError("invalid_adapter_version", "adapterVersion must be semantic version core syntax", {
      adapterVersion: input.adapterVersion
    });
  }
  assertEnumValue("railKind", input.railKind, enumValues(RailKind));
  assertEnumValue("finalityModel", input.finalityModel, enumValues(RailFinalityModel));
  if (typeof input.sandboxOnly !== "boolean") {
    throw new DomainError("invalid_sandbox_flag", "sandboxOnly must be a boolean");
  }

  const directions = uniqueEnumValues("directions", input.directions, enumValues(TransferDirection));
  const sourceAssets = normalizeAssetList("sourceAssets", input.sourceAssets);
  const destinationAssets = normalizeAssetList("destinationAssets", input.destinationAssets);
  const descriptorCore = {
    railId: input.railId,
    displayName: input.displayName,
    railKind: input.railKind,
    directions,
    sourceAssets,
    destinationAssets,
    finalityModel: input.finalityModel,
    sandboxOnly: input.sandboxOnly,
    adapterVersion: input.adapterVersion
  };
  return Object.freeze({
    ...descriptorCore,
    descriptorHash: hashId("rail_descriptor", descriptorCore),
    schemaVersion: "rail_descriptor.v2"
  });
}

export function createTransferIntent(input) {
  assertNoRawPiiReference(input, "transferIntent");
  for (const name of [
    "subjectId",
    "mandateId",
    "policyDecisionRef",
    "providerId",
    "purposeCode",
    "railId",
    "idempotencyKey"
  ]) {
    assertNonEmptyString(name, input[name]);
  }
  assertOpaqueHash("sourceAccountRefHash", input.sourceAccountRefHash);
  assertOpaqueHash("destinationAccountRefHash", input.destinationAccountRefHash);
  assertEnumValue("direction", input.direction, enumValues(TransferDirection));
  const sourceMoney = normalizeMoney("sourceMoney", input.sourceMoney);
  const destinationAsset = normalizeAsset("destinationAsset", input.destinationAsset);
  const createdAt = parseTimestamp("createdAt", (input.now ?? new Date()).toISOString());
  const requestCore = {
    subjectId: input.subjectId,
    mandateId: input.mandateId,
    policyDecisionRef: input.policyDecisionRef,
    providerId: input.providerId,
    purposeCode: input.purposeCode,
    railId: input.railId,
    direction: input.direction,
    sourceMoney,
    destinationAsset,
    sourceAccountRefHash: input.sourceAccountRefHash,
    destinationAccountRefHash: input.destinationAccountRefHash
  };
  const requestHash = hashId("transfer_intent_request", requestCore);
  return {
    transferIntentId: createOperationalId("transfer_intent"),
    transferIntentHash: hashId("transfer_intent", { ...requestCore, idempotencyKey: input.idempotencyKey }),
    requestHash,
    idempotencyKey: input.idempotencyKey,
    ...requestCore,
    status: TransferIntentStatus.CREATED,
    quote: undefined,
    authorization: undefined,
    submission: undefined,
    settlementReceipts: [],
    version: 1,
    sandboxOnly: true,
    productionFundsMoved: false,
    createdAt,
    updatedAt: createdAt,
    schemaVersion: "transfer_intent.v2"
  };
}

export function createTransferQuote({
  transferIntent,
  feeMoney,
  destinationMoney,
  rate,
  idempotencyKey,
  expiresAt,
  now = new Date()
}) {
  assertNonEmptyString("idempotencyKey", idempotencyKey);
  const normalizedFee = normalizeMoney("feeMoney", feeMoney, { allowZero: true });
  const normalizedDestination = normalizeMoney("destinationMoney", destinationMoney);
  if (
    normalizedFee.assetId !== transferIntent.sourceMoney.assetId ||
    normalizedFee.scale !== transferIntent.sourceMoney.scale
  ) {
    throw new DomainError("quote_fee_asset_mismatch", "quote fees must use the source asset and scale");
  }
  if (
    normalizedDestination.assetId !== transferIntent.destinationAsset.assetId ||
    normalizedDestination.scale !== transferIntent.destinationAsset.scale
  ) {
    throw new DomainError("quote_destination_asset_mismatch", "quote destination does not match the intent");
  }
  const sourceUnits = assertPositiveMinorUnits(rate?.sourceUnits, "rate.sourceUnits");
  const destinationUnits = assertPositiveMinorUnits(rate?.destinationUnits, "rate.destinationUnits");
  const sourceAmount = BigInt(transferIntent.sourceMoney.amountMinor);
  const feeAmount = BigInt(normalizedFee.amountMinor);
  if (feeAmount >= sourceAmount) {
    throw new DomainError("quote_fee_exhausts_source", "quote fee must be less than the source amount");
  }
  const convertedNumerator = (sourceAmount - feeAmount) * destinationUnits;
  if (convertedNumerator % sourceUnits !== 0n) {
    throw new DomainError("inexact_quote_conversion", "quote conversion must resolve exactly in destination minor units");
  }
  const expectedDestination = convertedNumerator / sourceUnits;
  if (expectedDestination !== BigInt(normalizedDestination.amountMinor)) {
    throw new DomainError("quote_amount_mismatch", "quote destination amount does not match its fee and rational rate", {
      expectedDestinationMinor: expectedDestination.toString(),
      actualDestinationMinor: normalizedDestination.amountMinor
    });
  }
  const createdAt = parseTimestamp("createdAt", now.toISOString());
  const normalizedExpiresAt = parseTimestamp("expiresAt", expiresAt);
  if (new Date(normalizedExpiresAt) <= new Date(createdAt)) {
    throw new DomainError("invalid_quote_expiry", "quote expiresAt must be after createdAt");
  }
  const quoteCore = {
    transferIntentId: transferIntent.transferIntentId,
    railId: transferIntent.railId,
    sourceMoney: structuredClone(transferIntent.sourceMoney),
    feeMoney: normalizedFee,
    destinationMoney: normalizedDestination,
    rate: { sourceUnits: sourceUnits.toString(), destinationUnits: destinationUnits.toString() },
    expiresAt: normalizedExpiresAt,
    idempotencyKey
  };
  return {
    transferQuoteId: createOperationalId("transfer_quote"),
    transferQuoteHash: hashId("transfer_quote", quoteCore),
    ...quoteCore,
    createdAt,
    schemaVersion: "transfer_quote.v2"
  };
}

export function createSettlementReceipt({
  transferIntent,
  quote,
  railReferenceHash,
  providerEventIdHash,
  outcome,
  finality,
  sourceMoney,
  feeMoney,
  destinationMoney,
  idempotencyKey,
  now = new Date()
}) {
  for (const [name, value] of Object.entries({ railReferenceHash, providerEventIdHash })) {
    assertOpaqueHash(name, value);
  }
  assertNonEmptyString("idempotencyKey", idempotencyKey);
  assertEnumValue("outcome", outcome, enumValues(SettlementOutcome));
  assertEnumValue("finality", finality, enumValues(SettlementFinality));
  const normalizedSource = normalizeMoney("sourceMoney", sourceMoney, { allowZero: true });
  const normalizedFee = normalizeMoney("feeMoney", feeMoney, { allowZero: true });
  const normalizedDestination = normalizeMoney("destinationMoney", destinationMoney, { allowZero: true });
  const amounts = [normalizedSource, normalizedFee, normalizedDestination];
  const quoteAmounts = [quote.sourceMoney, quote.feeMoney, quote.destinationMoney];

  if (outcome === SettlementOutcome.FAILED) {
    if (finality !== SettlementFinality.FINALIZED || amounts.some((money) => BigInt(money.amountMinor) !== 0n)) {
      throw new DomainError("invalid_failed_receipt", "failed receipts must be finalized with zero settled amounts");
    }
  } else {
    for (let index = 0; index < amounts.length; index += 1) {
      const actual = amounts[index];
      const expected = quoteAmounts[index];
      if (
        actual.assetId !== expected.assetId ||
        actual.scale !== expected.scale ||
        actual.amountMinor !== expected.amountMinor
      ) {
        throw new DomainError("settlement_amount_mismatch", "settlement receipt amounts must match the accepted quote");
      }
    }
    if (outcome === SettlementOutcome.REVERSED && finality !== SettlementFinality.FINALIZED) {
      throw new DomainError("invalid_reversal_finality", "reversal receipts must be finalized");
    }
  }

  const occurredAt = parseTimestamp("occurredAt", now.toISOString());
  const receiptCore = {
    transferIntentId: transferIntent.transferIntentId,
    transferQuoteId: quote.transferQuoteId,
    railId: transferIntent.railId,
    railReferenceHash,
    providerEventIdHash,
    outcome,
    finality,
    sourceMoney: normalizedSource,
    feeMoney: normalizedFee,
    destinationMoney: normalizedDestination,
    idempotencyKey,
    occurredAt
  };
  return {
    settlementReceiptId: createOperationalId("settlement_receipt"),
    settlementReceiptHash: hashId("settlement_receipt", receiptCore),
    ...receiptCore,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "settlement_receipt.v2"
  };
}
