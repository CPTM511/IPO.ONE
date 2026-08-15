export const CAPITAL_NETWORK_PRESENTATION_VERSION =
  "capital_network_presentation.v1";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;
const DELIVERY_STATUSES = new Set([
  "pending",
  "acknowledged",
  "callback_completed"
]);
const REQUIRED_OPERATIONS = Object.freeze([
  "pilotReadProviderIntent",
  "pilotAcknowledgeProviderIntent"
]);
const HISTORICAL_EXAMPLE_RATE_BPS = 125n;

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedRecord(value, required) {
  if (!plainRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !required.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") &&
      !descriptor.get && !descriptor.set;
  });
}

function validTimestamp(value) {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function uniqueIdentifiers(values, maximum) {
  return Array.isArray(values) &&
    values.length <= maximum &&
    new Set(values).size === values.length &&
    values.every((value) => typeof value === "string" && IDENTIFIER.test(value));
}

function validProviderView(view) {
  return closedRecord(view, [
    "deliveryId",
    "deliveryHash",
    "transferIntentId",
    "transferIntentHash",
    "providerId",
    "purposeCode",
    "sourceAssetId",
    "sourceAmountMinor",
    "destinationAssetId",
    "status",
    "issuedAt",
    "expiresAt",
    "sandboxOnly",
    "productionFundsMoved",
    "withdrawable",
    "schemaVersion"
  ]) &&
    IDENTIFIER.test(view.deliveryId ?? "") &&
    HASH.test(view.deliveryHash ?? "") &&
    IDENTIFIER.test(view.transferIntentId ?? "") &&
    HASH.test(view.transferIntentHash ?? "") &&
    IDENTIFIER.test(view.providerId ?? "") &&
    IDENTIFIER.test(view.purposeCode ?? "") &&
    IDENTIFIER.test(view.sourceAssetId ?? "") &&
    POSITIVE_MINOR.test(view.sourceAmountMinor ?? "") &&
    IDENTIFIER.test(view.destinationAssetId ?? "") &&
    DELIVERY_STATUSES.has(view.status) &&
    validTimestamp(view.issuedAt) &&
    validTimestamp(view.expiresAt) &&
    new Date(view.expiresAt) > new Date(view.issuedAt) &&
    view.sandboxOnly === true &&
    view.productionFundsMoved === false &&
    view.withdrawable === false &&
    view.schemaVersion === "provider_intent_view.v1";
}

function validAcknowledgement(acknowledgement, view) {
  if (acknowledgement === null) return true;
  return closedRecord(acknowledgement, [
    "acknowledgementId",
    "deliveryId",
    "deliveryHash",
    "transferIntentId",
    "providerId",
    "acknowledgedAt",
    "sandboxOnly",
    "productionFundsMoved",
    "withdrawable",
    "schemaVersion"
  ]) &&
    IDENTIFIER.test(acknowledgement.acknowledgementId ?? "") &&
    acknowledgement.deliveryId === view.deliveryId &&
    acknowledgement.deliveryHash === view.deliveryHash &&
    acknowledgement.transferIntentId === view.transferIntentId &&
    acknowledgement.providerId === view.providerId &&
    validTimestamp(acknowledgement.acknowledgedAt) &&
    new Date(acknowledgement.acknowledgedAt) >= new Date(view.issuedAt) &&
    new Date(acknowledgement.acknowledgedAt) < new Date(view.expiresAt) &&
    acknowledgement.sandboxOnly === true &&
    acknowledgement.productionFundsMoved === false &&
    acknowledgement.withdrawable === false &&
    acknowledgement.schemaVersion === "provider_intent_acknowledgement.v1" &&
    view.status !== "pending";
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function statusFor(view) {
  if (view.status === "pending") return "assigned";
  if (view.status === "acknowledged") return "acknowledged";
  return "reconciled";
}

function reconciliationStatus(view) {
  if (view.status === "pending") return "pending_provider_acknowledgement";
  if (view.status === "acknowledged") return "acknowledgement_recorded";
  return "signed_callback_processed";
}

export function createCapitalNetworkPresentation(input) {
  if (
    !closedRecord(input, [
      "catalogOperationIds",
      "providerView",
      "acknowledgement"
    ]) ||
    !uniqueIdentifiers(input.catalogOperationIds, 128) ||
    !(input.providerView === null || validProviderView(input.providerView))
  ) return null;

  const catalog = new Set(input.catalogOperationIds);
  const availability = Object.freeze({
    read: catalog.has(REQUIRED_OPERATIONS[0]),
    acknowledge: catalog.has(REQUIRED_OPERATIONS[1])
  });
  if (!input.providerView) {
    if (input.acknowledgement !== null) return null;
    return deepFreeze({
      schemaVersion: CAPITAL_NETWORK_PRESENTATION_VERSION,
      status: availability.read ? "empty" : "unavailable",
      profile: "signed_fixed_loopback_provider_sandbox",
      availability,
      mandate: null,
      facility: null,
      allocation: null,
      delivery: null,
      reconciliation: null,
      earningsSimulation: null,
      disabledCapabilities: [
        "provider_funding",
        "withdrawal",
        "public_pool",
        "tvl",
        "production_pricing",
        "remote_provider",
        "mainnet",
        "real_capital"
      ],
      serverDerived: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    });
  }

  const view = input.providerView;
  if (!validAcknowledgement(input.acknowledgement, view)) return null;
  const earningsMinor = String(
    BigInt(view.sourceAmountMinor) * HISTORICAL_EXAMPLE_RATE_BPS / 10_000n
  );
  return deepFreeze({
    schemaVersion: CAPITAL_NETWORK_PRESENTATION_VERSION,
    status: statusFor(view),
    profile: "signed_fixed_loopback_provider_sandbox",
    availability,
    mandate: {
      providerId: view.providerId,
      transferIntentId: view.transferIntentId,
      purposeCode: view.purposeCode,
      status: "assigned_no_funds",
      contractVersion: view.schemaVersion,
      fundingAuthority: false,
      schemaVersion: "capital_network_mandate_presentation.v1"
    },
    facility: {
      facilityType: "assigned_no_funds_sandbox_exposure",
      sourceAssetId: view.sourceAssetId,
      sourceAmountMinor: view.sourceAmountMinor,
      destinationAssetId: view.destinationAssetId,
      simulatedAmount: true,
      deployedCapital: false,
      withdrawable: false,
      schemaVersion: "capital_network_facility_presentation.v1"
    },
    allocation: {
      allocationType: "assigned_sandbox_exposure",
      transferIntentId: view.transferIntentId,
      allocatedMinor: view.sourceAmountMinor,
      assetId: view.sourceAssetId,
      allocationReceiptRef: view.transferIntentHash,
      serverDerived: true,
      deployedCapital: false,
      schemaVersion: "capital_network_allocation_receipt.v1"
    },
    delivery: {
      deliveryId: view.deliveryId,
      deliveryHash: view.deliveryHash,
      transferIntentId: view.transferIntentId,
      status: view.status,
      issuedAt: view.issuedAt,
      expiresAt: view.expiresAt,
      signedBoundary: true,
      fixedLoopback: true,
      schemaVersion: "capital_network_delivery_presentation.v1"
    },
    reconciliation: {
      status: reconciliationStatus(view),
      providerViewStatus: view.status,
      receiptId: input.acknowledgement?.acknowledgementId ?? null,
      receiptRef: view.deliveryHash,
      settlement: false,
      duplicateCanonicalStateAllowed: false,
      serverDerived: true,
      schemaVersion: "capital_network_reconciliation_receipt.v1"
    },
    earningsSimulation: {
      rateBasisPoints: String(HISTORICAL_EXAMPLE_RATE_BPS),
      earningsMinor,
      assetId: view.sourceAssetId,
      label: "Historical example only · unapproved",
      source: "historical_example_only",
      approved: false,
      pricingPolicy: false,
      nonBinding: true,
      schemaVersion: "capital_network_earnings_simulation.v1"
    },
    disabledCapabilities: [
      "provider_funding",
      "withdrawal",
      "public_pool",
      "tvl",
      "production_pricing",
      "remote_provider",
      "mainnet",
      "real_capital"
    ],
    serverDerived: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  });
}
