import {
  DomainError,
  activateTradingFacility,
  createCreditEvent,
  createEvidenceEnvelope,
  hashId
} from "../../../packages/domain/src/index.js";

export const HYPERLIQUID_TESTNET_FACILITY_FUNDING_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_facility_funding.v1";

export const HyperliquidTestnetFacilityFundingStatus = Object.freeze({
  AWAITING_CONTRIBUTIONS: "AWAITING_CONTRIBUTIONS",
  AWAITING_SUBJECT: "AWAITING_SUBJECT",
  AWAITING_PROVIDER: "AWAITING_PROVIDER",
  READY: "READY",
  ACTIVE: "ACTIVE",
  INCIDENT: "INCIDENT"
});

export const HyperliquidTestnetContributionRole = Object.freeze({
  SUBJECT_FIRST_LOSS: "SUBJECT_FIRST_LOSS",
  PROVIDER_PRINCIPAL: "PROVIDER_PRINCIPAL"
});

export const HyperliquidTestnetContributionReceiptKind = Object.freeze({
  FINALIZED_CONTRIBUTION: "FINALIZED_CONTRIBUTION",
  REORG_INVALIDATION: "REORG_INVALIDATION"
});

const STATUSES = new Set(
  Object.values(HyperliquidTestnetFacilityFundingStatus)
);
const ROLES = new Set(Object.values(HyperliquidTestnetContributionRole));
const RECEIPT_KINDS = new Set(
  Object.values(HyperliquidTestnetContributionReceiptKind)
);
const TERMINAL_STATUSES = new Set([
  HyperliquidTestnetFacilityFundingStatus.ACTIVE,
  HyperliquidTestnetFacilityFundingStatus.INCIDENT
]);
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MINOR_PATTERN = /^(?:0|[1-9][0-9]{0,77})$/;
const POSITIVE_MINOR_PATTERN = /^[1-9][0-9]{0,77}$/;
const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9_]{0,95}$/;
const FUNDING_OUTBOX_TOPIC =
  "ipo.one.trading.testnet-facility-funding.v1";
const FUNDING_INBOX_CONSUMER =
  "ipo.one.trading-testnet-facility-funding-receipts.v1";
const MAX_RISK_AGE_MS = 5 * 60 * 1000;

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

function exactKeys(
  value,
  required,
  optional = [],
  code = "invalid_hyperliquid_facility_funding_input"
) {
  if (!plainObject(value)) {
    fail(code, "value must be a plain object");
  }
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
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} is invalid`
    );
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} is invalid`
    );
  }
  return value;
}

function nullableHash(name, value) {
  if (value !== null) hash(name, value);
  return value;
}

function positiveMinor(name, value) {
  if (typeof value !== "string" || !POSITIVE_MINOR_PATTERN.test(value)) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} must be a positive minor-unit string`
    );
  }
  return value;
}

function nonNegativeMinor(name, value) {
  if (typeof value !== "string" || !MINOR_PATTERN.test(value)) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} must be a non-negative minor-unit string`
    );
  }
  return value;
}

function positiveInteger(name, value, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} must be a bounded positive integer`
    );
  }
  return value;
}

function nonNegativeInteger(name, value, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} must be a bounded non-negative integer`
    );
  }
  return value;
}

function safeCode(name, value) {
  if (typeof value !== "string" || !SAFE_CODE_PATTERN.test(value)) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      `${name} is invalid`
    );
  }
  return value;
}

function iso(value) {
  const date = new Date(value);
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(date.getTime())
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      "timestamp is invalid"
    );
  }
  return date.toISOString();
}

function clockMs(clock) {
  const value = clock();
  positiveInteger("clock", value);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function actorHash(actorId) {
  identifier("actorId", actorId);
  return hashId("actor", actorId);
}

function deterministicFundingId(requestHash) {
  hash("requestHash", requestHash);
  return `trading_testnet_funding_${requestHash.slice(2, 34)}`;
}

function deterministicReceiptId(sourceEvidenceHash) {
  hash("sourceEvidenceHash", sourceEvidenceHash);
  return `trading_testnet_contribution_${sourceEvidenceHash.slice(2, 34)}`;
}

function baseSafety() {
  return {
    environment: "hyperliquid_testnet",
    testnetOnly: true,
    simulationOnly: true,
    protectedTestnetE2EOnly: true,
    nonRedeemable: true,
    directFacilityDestination: true,
    pooledCapital: false,
    traderWalletPassThrough: false,
    traderWithdrawalAuthority: false,
    masterWithdrawalAuthoritySeparated: true,
    executionSignerSeparated: true,
    externalSystemQueried: false,
    externalContributionSubmitted: false,
    liveTransportApproved: false,
    liveAccountsApproved: false,
    apiWalletApproved: false,
    rawAddressPersisted: false,
    rawResponsePersisted: false,
    reusableSignaturePersisted: false,
    canonicalFacility: true,
    secondFacilityCreated: false,
    canonicalFacilityMutationCreated: false,
    canonicalLedger: true,
    ledgerMutationCreated: false,
    secondLedgerCreated: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    realFunds: false,
    productionFundsMoved: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion:
      HYPERLIQUID_TESTNET_FACILITY_FUNDING_SCHEMA_VERSION
  };
}

function assertSafety(value) {
  const expected = baseSafety();
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual =
      key === "canonicalFacilityMutationCreated" &&
      value.status === HyperliquidTestnetFacilityFundingStatus.ACTIVE
        ? true
        : expectedValue;
    if (value[key] !== actual) {
      fail(
        "invalid_hyperliquid_facility_funding_record",
        `safety boundary ${key} is invalid`
      );
    }
  }
}

function assertDistinctAuthorities(snapshot) {
  const values = [
    snapshot.facilityDestinationHash,
    snapshot.masterAccountHash,
    snapshot.withdrawalAuthorityHash,
    snapshot.executionSignerReferenceHash
  ];
  if (new Set(values).size !== values.length) {
    fail(
      "hyperliquid_facility_funding_authority_collision",
      "Facility destination, master, withdrawal, and execution authorities must remain separated"
    );
  }
}

function snapshotCore(snapshot) {
  return {
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    facilityStateHash: snapshot.facilityStateHash,
    facilityVersion: snapshot.facilityVersion,
    facilityLifecycleStatus: snapshot.facilityLifecycleStatus,
    obligationId: snapshot.obligationId,
    subjectId: snapshot.subjectId,
    bilateralTermsHash: snapshot.bilateralTermsHash,
    assetId: snapshot.assetId,
    requiredSubjectContributionMinor:
      snapshot.requiredSubjectContributionMinor,
    requiredProviderContributionMinor:
      snapshot.requiredProviderContributionMinor,
    maximumFacilityCapMinor: snapshot.maximumFacilityCapMinor,
    facilityDestinationHash: snapshot.facilityDestinationHash,
    accountBindingHash: snapshot.accountBindingHash,
    masterAccountHash: snapshot.masterAccountHash,
    withdrawalAuthorityHash: snapshot.withdrawalAuthorityHash,
    executionSignerReferenceHash:
      snapshot.executionSignerReferenceHash,
    canonicalLedgerStateHash: snapshot.canonicalLedgerStateHash,
    ledgerTransactionCount: snapshot.ledgerTransactionCount,
    riskSnapshotHash: snapshot.riskSnapshotHash,
    riskState: snapshot.riskState,
    riskFreshness: snapshot.riskFreshness,
    riskObservedAt: snapshot.riskObservedAt,
    riskMaximumAgeMs: snapshot.riskMaximumAgeMs,
    capturedAt: snapshot.capturedAt
  };
}

function snapshotHash(snapshot) {
  return hashId(
    "hyperliquid_testnet_facility_funding_kernel_snapshot",
    snapshotCore(snapshot)
  );
}

function assertKernelSnapshot(value, expected = null) {
  exactKeys(
    value,
    [
      "facility",
      "matchProposal",
      "obligation",
      "subjectActorId",
      "facilityId",
      "facilityHash",
      "facilityStateHash",
      "facilityVersion",
      "facilityLifecycleStatus",
      "obligationId",
      "subjectId",
      "bilateralTermsHash",
      "assetId",
      "requiredSubjectContributionMinor",
      "requiredProviderContributionMinor",
      "maximumFacilityCapMinor",
      "facilityDestinationHash",
      "accountBindingHash",
      "masterAccountHash",
      "withdrawalAuthorityHash",
      "executionSignerReferenceHash",
      "canonicalLedgerStateHash",
      "ledgerTransactionCount",
      "riskSnapshotHash",
      "riskState",
      "riskFreshness",
      "riskObservedAt",
      "riskMaximumAgeMs",
      "simulationOnly",
      "canonicalFacility",
      "secondFacilityCreated",
      "canonicalLedger",
      "secondLedgerCreated",
      "liveAccountsApproved",
      "capturedAt",
      "schemaVersion"
    ],
    [],
    "invalid_hyperliquid_facility_funding_snapshot"
  );
  if (!plainObject(value.facility) ||
      !plainObject(value.matchProposal) ||
      !plainObject(value.obligation)) {
    fail(
      "invalid_hyperliquid_facility_funding_snapshot",
      "canonical resources must be closed server-owned objects"
    );
  }
  identifier("facilityId", value.facilityId);
  hash("facilityHash", value.facilityHash);
  hash("facilityStateHash", value.facilityStateHash);
  positiveInteger("facilityVersion", value.facilityVersion);
  identifier("obligationId", value.obligationId);
  identifier("subjectId", value.subjectId);
  hash("bilateralTermsHash", value.bilateralTermsHash);
  identifier("assetId", value.assetId);
  positiveMinor(
    "requiredSubjectContributionMinor",
    value.requiredSubjectContributionMinor
  );
  positiveMinor(
    "requiredProviderContributionMinor",
    value.requiredProviderContributionMinor
  );
  positiveMinor("maximumFacilityCapMinor", value.maximumFacilityCapMinor);
  for (const name of [
    "facilityDestinationHash",
    "accountBindingHash",
    "masterAccountHash",
    "withdrawalAuthorityHash",
    "executionSignerReferenceHash",
    "canonicalLedgerStateHash",
    "riskSnapshotHash"
  ]) {
    hash(name, value[name]);
  }
  nonNegativeInteger("ledgerTransactionCount", value.ledgerTransactionCount);
  positiveInteger("riskMaximumAgeMs", value.riskMaximumAgeMs, MAX_RISK_AGE_MS);
  iso(value.riskObservedAt);
  iso(value.capturedAt);
  if (
    value.facilityLifecycleStatus !== "ready_for_activation" ||
    value.riskState !== "NORMAL" ||
    value.riskFreshness !== "FRESH" ||
    value.simulationOnly !== true ||
    value.canonicalFacility !== true ||
    value.secondFacilityCreated !== false ||
    value.canonicalLedger !== true ||
    value.secondLedgerCreated !== false ||
    value.liveAccountsApproved !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_facility_funding_kernel_snapshot.v1"
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_snapshot",
      "kernel snapshot is outside the protected Testnet simulation boundary"
    );
  }
  const facility = value.facility;
  const proposal = value.matchProposal;
  const obligation = value.obligation;
  if (
    facility.tradingFacilityId !== value.facilityId ||
    facility.facilityHash !== value.facilityHash ||
    facility.stateHash !== value.facilityStateHash ||
    facility.version !== value.facilityVersion ||
    facility.lifecycleStatus !== value.facilityLifecycleStatus ||
    facility.obligationId !== value.obligationId ||
    facility.subjectId !== value.subjectId ||
    facility.termsHash !== value.bilateralTermsHash ||
    facility.assetId !== value.assetId ||
    facility.requiredSubjectCollateralMinor !==
      value.requiredSubjectContributionMinor ||
    facility.requiredProviderFundingMinor !==
      value.requiredProviderContributionMinor ||
    facility.nonRedeemable !== true ||
    facility.withdrawable !== false ||
    facility.transferable !== false ||
    facility.linkedCanonicalObligation !== true ||
    facility.secondLedgerCreated !== false ||
    proposal.tradingMatchProposalId !== facility.matchProposalId ||
    proposal.proposalHash !== facility.proposalHash ||
    proposal.terms?.termsHash !== value.bilateralTermsHash ||
    proposal.status !== "bilaterally_accepted" ||
    proposal.immutableTerms !== true ||
    obligation.obligationId !== value.obligationId ||
    obligation.obligationHash !== facility.obligationHash ||
    obligation.subjectId !== value.subjectId ||
    obligation.executionStatus !== "executed" ||
    obligation.status !== "active" ||
    obligation.withdrawable !== false ||
    obligation.productionFundsMoved !== false ||
    actorHash(value.subjectActorId) !== facility.subjectActorHash
  ) {
    fail(
      "hyperliquid_facility_funding_kernel_mismatch",
      "canonical Facility, bilateral terms, or Obligation binding changed"
    );
  }
  const requiredTotal =
    BigInt(value.requiredSubjectContributionMinor) +
    BigInt(value.requiredProviderContributionMinor);
  if (requiredTotal > BigInt(value.maximumFacilityCapMinor)) {
    fail(
      "hyperliquid_facility_funding_cap_exceeded",
      "required Testnet contributions exceed the server-owned Facility cap"
    );
  }
  assertDistinctAuthorities(value);
  if (expected) {
    if (
      value.facilityId !== expected.facilityId ||
      value.facilityHash !== expected.facilityHash
    ) {
      fail(
        "hyperliquid_facility_funding_kernel_mismatch",
        "requested Facility does not match the server-owned snapshot"
      );
    }
  }
  return deepFreeze(structuredClone(value));
}

function receiptCore(input, observedAt) {
  return {
    fundingHash: input.fundingHash,
    facilityHash: input.facilityHash,
    contributorRole: input.contributorRole,
    kind: input.kind,
    assetId: input.assetId,
    amountMinor: input.amountMinor,
    destinationHash: input.destinationHash,
    transactionReferenceHash: input.transactionReferenceHash,
    blockReferenceHash: input.blockReferenceHash,
    relatedReceiptHash: input.relatedReceiptHash,
    freshness: input.freshness,
    complete: input.complete,
    finalized: input.finalized,
    observedAt
  };
}

export function createSimulatedTestnetContributionReceipt(
  input,
  { clock = Date.now, ...unknownOptions } = {}
) {
  if (Object.keys(unknownOptions).length !== 0 || typeof clock !== "function") {
    fail(
      "invalid_hyperliquid_facility_funding_receipt",
      "receipt options are invalid"
    );
  }
  exactKeys(
    input,
    [
      "fundingHash",
      "facilityHash",
      "contributorRole",
      "kind",
      "assetId",
      "amountMinor",
      "destinationHash",
      "transactionReferenceHash",
      "blockReferenceHash",
      "relatedReceiptHash",
      "freshness",
      "complete",
      "finalized"
    ],
    [],
    "invalid_hyperliquid_facility_funding_receipt"
  );
  hash("fundingHash", input.fundingHash);
  hash("facilityHash", input.facilityHash);
  if (!ROLES.has(input.contributorRole) || !RECEIPT_KINDS.has(input.kind)) {
    fail(
      "invalid_hyperliquid_facility_funding_receipt",
      "receipt role or kind is unsupported"
    );
  }
  identifier("assetId", input.assetId);
  positiveMinor("amountMinor", input.amountMinor);
  hash("destinationHash", input.destinationHash);
  hash("transactionReferenceHash", input.transactionReferenceHash);
  hash("blockReferenceHash", input.blockReferenceHash);
  nullableHash("relatedReceiptHash", input.relatedReceiptHash);
  if (
    input.freshness !== "FRESH" ||
    input.complete !== true ||
    (
      input.kind ===
        HyperliquidTestnetContributionReceiptKind.FINALIZED_CONTRIBUTION &&
      (input.finalized !== true || input.relatedReceiptHash !== null)
    ) ||
    (
      input.kind ===
        HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION &&
      (input.finalized !== false || input.relatedReceiptHash === null)
    )
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_receipt",
      "receipt finality or completeness is invalid"
    );
  }
  const observedAt = new Date(clockMs(clock)).toISOString();
  const core = receiptCore(input, observedAt);
  const sourceEvidenceHash = hashId(
    "hyperliquid_testnet_contribution_source_evidence",
    core
  );
  const receipt = {
    receiptId: deterministicReceiptId(sourceEvidenceHash),
    receiptHash: hashId(
      "hyperliquid_testnet_contribution_receipt",
      { ...core, sourceEvidenceHash }
    ),
    sourceEvidenceHash,
    ...core,
    environment: "hyperliquid_testnet",
    simulationOnly: true,
    protectedTestnetE2EOnly: true,
    nonRedeemable: true,
    directFacilityDestination: true,
    externalSystemQueried: false,
    externalContributionSubmitted: false,
    rawAddressPersisted: false,
    rawResponsePersisted: false,
    reusableSignaturePersisted: false,
    productionAuthority: false,
    fundsAuthority: false,
    realFunds: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion:
      "hyperliquid_testnet_simulated_contribution_receipt.v1"
  };
  return deepFreeze(receipt);
}

function assertReceipt(value) {
  exactKeys(
    value,
    [
      "receiptId",
      "receiptHash",
      "sourceEvidenceHash",
      "fundingHash",
      "facilityHash",
      "contributorRole",
      "kind",
      "assetId",
      "amountMinor",
      "destinationHash",
      "transactionReferenceHash",
      "blockReferenceHash",
      "relatedReceiptHash",
      "freshness",
      "complete",
      "finalized",
      "observedAt",
      "environment",
      "simulationOnly",
      "protectedTestnetE2EOnly",
      "nonRedeemable",
      "directFacilityDestination",
      "externalSystemQueried",
      "externalContributionSubmitted",
      "rawAddressPersisted",
      "rawResponsePersisted",
      "reusableSignaturePersisted",
      "productionAuthority",
      "fundsAuthority",
      "realFunds",
      "piiIncluded",
      "secretsIncluded",
      "schemaVersion"
    ],
    [],
    "invalid_hyperliquid_facility_funding_receipt"
  );
  identifier("receiptId", value.receiptId);
  hash("receiptHash", value.receiptHash);
  hash("sourceEvidenceHash", value.sourceEvidenceHash);
  const rebuilt = createSimulatedTestnetContributionReceipt(
    {
      fundingHash: value.fundingHash,
      facilityHash: value.facilityHash,
      contributorRole: value.contributorRole,
      kind: value.kind,
      assetId: value.assetId,
      amountMinor: value.amountMinor,
      destinationHash: value.destinationHash,
      transactionReferenceHash: value.transactionReferenceHash,
      blockReferenceHash: value.blockReferenceHash,
      relatedReceiptHash: value.relatedReceiptHash,
      freshness: value.freshness,
      complete: value.complete,
      finalized: value.finalized
    },
    { clock: () => new Date(value.observedAt).getTime() }
  );
  if (
    rebuilt.receiptId !== value.receiptId ||
    rebuilt.receiptHash !== value.receiptHash ||
    rebuilt.sourceEvidenceHash !== value.sourceEvidenceHash ||
    JSON.stringify(rebuilt) !== JSON.stringify(value)
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_receipt",
      "receipt hash or safety evidence changed"
    );
  }
  return value;
}

function stateFromContributions(subjectFinalized, providerFinalized) {
  if (subjectFinalized && providerFinalized) {
    return HyperliquidTestnetFacilityFundingStatus.READY;
  }
  if (subjectFinalized) {
    return HyperliquidTestnetFacilityFundingStatus.AWAITING_PROVIDER;
  }
  if (providerFinalized) {
    return HyperliquidTestnetFacilityFundingStatus.AWAITING_SUBJECT;
  }
  return HyperliquidTestnetFacilityFundingStatus.AWAITING_CONTRIBUTIONS;
}

function dynamicStateCore(record) {
  return {
    fundingId: record.fundingId,
    fundingHash: record.fundingHash,
    status: record.status,
    subjectContributionMinor: record.subjectContributionMinor,
    providerContributionMinor: record.providerContributionMinor,
    reconciledTotalMinor: record.reconciledTotalMinor,
    subjectReceiptHash: record.subjectReceiptHash,
    providerReceiptHash: record.providerReceiptHash,
    subjectContributionFinalized: record.subjectContributionFinalized,
    providerContributionFinalized: record.providerContributionFinalized,
    processedReceiptCount: record.processedReceiptCount,
    latestSourceEvidenceHash: record.latestSourceEvidenceHash,
    latestKernelSnapshotHash: record.latestKernelSnapshotHash,
    riskSnapshotHash: record.riskSnapshotHash,
    riskObservedAt: record.riskObservedAt,
    incidentReasonCodes: record.incidentReasonCodes,
    activationEvidenceHash: record.activationEvidenceHash,
    activatedByActorHash: record.activatedByActorHash,
    activationIdempotencyKeyHash: record.activationIdempotencyKeyHash,
    activationCommandHash: record.activationCommandHash,
    canonicalFacilityMutationCreated:
      record.canonicalFacilityMutationCreated,
    version: record.version,
    updatedAt: record.updatedAt,
    activatedAt: record.activatedAt
  };
}

function withStateHash(record) {
  const next = structuredClone(record);
  next.stateHash = hashId(
    "hyperliquid_testnet_facility_funding_state",
    dynamicStateCore(next)
  );
  return next;
}

function immutableFundingCore(record) {
  return {
    fundingId: record.fundingId,
    requestHash: record.requestHash,
    facilityId: record.facilityId,
    facilityHash: record.facilityHash,
    facilityStateHash: record.facilityStateHash,
    facilityVersion: record.facilityVersion,
    obligationId: record.obligationId,
    subjectId: record.subjectId,
    bilateralTermsHash: record.bilateralTermsHash,
    assetId: record.assetId,
    requiredSubjectContributionMinor:
      record.requiredSubjectContributionMinor,
    requiredProviderContributionMinor:
      record.requiredProviderContributionMinor,
    maximumFacilityCapMinor: record.maximumFacilityCapMinor,
    facilityDestinationHash: record.facilityDestinationHash,
    accountBindingHash: record.accountBindingHash,
    masterAccountHash: record.masterAccountHash,
    withdrawalAuthorityHash: record.withdrawalAuthorityHash,
    executionSignerReferenceHash:
      record.executionSignerReferenceHash,
    canonicalLedgerStateHash: record.canonicalLedgerStateHash,
    ledgerTransactionCount: record.ledgerTransactionCount,
    initialKernelSnapshotHash: record.initialKernelSnapshotHash
  };
}

function assertRecord(value) {
  if (!plainObject(value) || !STATUSES.has(value.status)) {
    fail(
      "invalid_hyperliquid_facility_funding_record",
      "funding record is unavailable"
    );
  }
  for (const name of [
    "fundingHash",
    "stateHash",
    "requestHash",
    "idempotencyKeyHash",
    "facilityHash",
    "facilityStateHash",
    "bilateralTermsHash",
    "facilityDestinationHash",
    "accountBindingHash",
    "masterAccountHash",
    "withdrawalAuthorityHash",
    "executionSignerReferenceHash",
    "canonicalLedgerStateHash",
    "riskSnapshotHash",
    "initialKernelSnapshotHash",
    "latestKernelSnapshotHash",
    "authorizationDecisionHash",
    "admissionDecisionHash",
    "authorizedActorHash"
  ]) {
    hash(name, value[name]);
  }
  for (const name of [
    "subjectReceiptHash",
    "providerReceiptHash",
    "latestSourceEvidenceHash",
    "activatedByActorHash",
    "activationEvidenceHash",
    "activationIdempotencyKeyHash",
    "activationCommandHash",
    "resultHash"
  ]) {
    nullableHash(name, value[name]);
  }
  identifier("fundingId", value.fundingId);
  identifier("facilityId", value.facilityId);
  identifier("obligationId", value.obligationId);
  identifier("subjectId", value.subjectId);
  identifier("assetId", value.assetId);
  positiveInteger("facilityVersion", value.facilityVersion);
  nonNegativeInteger("ledgerTransactionCount", value.ledgerTransactionCount);
  positiveInteger("riskMaximumAgeMs", value.riskMaximumAgeMs, MAX_RISK_AGE_MS);
  positiveInteger("version", value.version, 1_000_000);
  nonNegativeInteger(
    "processedReceiptCount",
    value.processedReceiptCount,
    1_000_000
  );
  for (const name of [
    "requiredSubjectContributionMinor",
    "requiredProviderContributionMinor",
    "maximumFacilityCapMinor"
  ]) {
    positiveMinor(name, value[name]);
  }
  for (const name of [
    "subjectContributionMinor",
    "providerContributionMinor",
    "reconciledTotalMinor"
  ]) {
    nonNegativeMinor(name, value[name]);
  }
  iso(value.createdAt);
  iso(value.updatedAt);
  iso(value.riskObservedAt);
  if (value.activatedAt !== null) iso(value.activatedAt);
  if (
    value.riskState !== "NORMAL" ||
    value.riskFreshness !== "FRESH" ||
    value.facilityLifecycleStatus !== "ready_for_activation" ||
    !Array.isArray(value.incidentReasonCodes) ||
    value.incidentReasonCodes.length > 16 ||
    new Set(value.incidentReasonCodes).size !==
      value.incidentReasonCodes.length ||
    value.incidentReasonCodes.some(
      (reason) => !SAFE_CODE_PATTERN.test(reason)
    ) ||
    hashId(
      "hyperliquid_testnet_facility_funding",
      immutableFundingCore(value)
    ) !== value.fundingHash ||
    hashId(
      "hyperliquid_testnet_facility_funding_state",
      dynamicStateCore(value)
    ) !== value.stateHash
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_record",
      "funding record bindings are inconsistent"
    );
  }
  const requiredTotal =
    BigInt(value.requiredSubjectContributionMinor) +
    BigInt(value.requiredProviderContributionMinor);
  const reconciledTotal =
    BigInt(value.subjectContributionMinor) +
    BigInt(value.providerContributionMinor);
  if (
    requiredTotal > BigInt(value.maximumFacilityCapMinor) ||
    reconciledTotal.toString() !== value.reconciledTotalMinor ||
    value.subjectContributionFinalized !==
      (value.subjectReceiptHash !== null) ||
    value.providerContributionFinalized !==
      (value.providerReceiptHash !== null) ||
    (
      value.subjectContributionFinalized &&
      value.subjectContributionMinor !==
        value.requiredSubjectContributionMinor
    ) ||
    (
      value.providerContributionFinalized &&
      value.providerContributionMinor !==
        value.requiredProviderContributionMinor
    ) ||
    (
      !value.subjectContributionFinalized &&
      value.subjectContributionMinor !== "0"
    ) ||
    (
      !value.providerContributionFinalized &&
      value.providerContributionMinor !== "0"
    )
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_record",
      "contribution balance evidence is inconsistent"
    );
  }
  const expectedNonTerminal = stateFromContributions(
    value.subjectContributionFinalized,
    value.providerContributionFinalized
  );
  if (
    (
      !TERMINAL_STATUSES.has(value.status) &&
      value.status !== expectedNonTerminal
    ) ||
    (
      value.status === HyperliquidTestnetFacilityFundingStatus.ACTIVE &&
      (
        expectedNonTerminal !==
          HyperliquidTestnetFacilityFundingStatus.READY ||
        value.activationEvidenceHash === null ||
        value.activationIdempotencyKeyHash === null ||
        value.activationCommandHash === null ||
        value.resultHash === null ||
        value.activatedAt === null ||
        value.canonicalFacilityMutationCreated !== true
      )
    ) ||
    (
      value.status === HyperliquidTestnetFacilityFundingStatus.INCIDENT &&
      (
        value.incidentReasonCodes.length === 0 ||
        value.resultHash === null ||
        value.activatedAt !== null ||
        value.canonicalFacilityMutationCreated !== false
      )
    ) ||
    (
      !TERMINAL_STATUSES.has(value.status) &&
      (
        value.resultHash !== null ||
        value.activatedAt !== null ||
        value.activationEvidenceHash !== null ||
        value.activationIdempotencyKeyHash !== null ||
        value.activationCommandHash !== null ||
        value.canonicalFacilityMutationCreated !== false
      )
    )
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_record",
      "funding lifecycle evidence is inconsistent"
    );
  }
  assertSafety(value);
  return value;
}

function createDraft(input, snapshot, guard) {
  const idempotencyKeyHash = hashId(
    "hyperliquid_testnet_facility_funding_idempotency",
    { idempotencyKey: input.idempotencyKey }
  );
  const initialKernelSnapshotHash = snapshotHash(snapshot);
  const requestHash = hashId(
    "hyperliquid_testnet_facility_funding_request",
    {
      facilityId: snapshot.facilityId,
      facilityHash: snapshot.facilityHash,
      facilityStateHash: snapshot.facilityStateHash,
      bilateralTermsHash: snapshot.bilateralTermsHash,
      facilityDestinationHash: snapshot.facilityDestinationHash,
      requiredSubjectContributionMinor:
        snapshot.requiredSubjectContributionMinor,
      requiredProviderContributionMinor:
        snapshot.requiredProviderContributionMinor,
      maximumFacilityCapMinor: snapshot.maximumFacilityCapMinor,
      initialKernelSnapshotHash,
      authorizationDecisionHash: guard.authorizationDecisionHash,
      admissionDecisionHash: guard.admissionDecisionHash,
      idempotencyKeyHash
    }
  );
  return deepFreeze({
    fundingId: deterministicFundingId(requestHash),
    requestHash,
    idempotencyKeyHash,
    initialKernelSnapshotHash,
    snapshot,
    guard
  });
}

export function createPendingTestnetFacilityFundingRecord(
  draft,
  { nowMs }
) {
  positiveInteger("nowMs", nowMs);
  const snapshot = assertKernelSnapshot(draft.snapshot);
  const createdAt = new Date(nowMs).toISOString();
  let record = {
    fundingId: draft.fundingId,
    requestHash: draft.requestHash,
    idempotencyKeyHash: draft.idempotencyKeyHash,
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    facilityStateHash: snapshot.facilityStateHash,
    facilityVersion: snapshot.facilityVersion,
    facilityLifecycleStatus: snapshot.facilityLifecycleStatus,
    obligationId: snapshot.obligationId,
    subjectId: snapshot.subjectId,
    bilateralTermsHash: snapshot.bilateralTermsHash,
    assetId: snapshot.assetId,
    requiredSubjectContributionMinor:
      snapshot.requiredSubjectContributionMinor,
    requiredProviderContributionMinor:
      snapshot.requiredProviderContributionMinor,
    maximumFacilityCapMinor: snapshot.maximumFacilityCapMinor,
    facilityDestinationHash: snapshot.facilityDestinationHash,
    accountBindingHash: snapshot.accountBindingHash,
    masterAccountHash: snapshot.masterAccountHash,
    withdrawalAuthorityHash: snapshot.withdrawalAuthorityHash,
    executionSignerReferenceHash:
      snapshot.executionSignerReferenceHash,
    subjectContributionMinor: "0",
    providerContributionMinor: "0",
    reconciledTotalMinor: "0",
    subjectReceiptHash: null,
    providerReceiptHash: null,
    subjectContributionFinalized: false,
    providerContributionFinalized: false,
    processedReceiptCount: 0,
    latestSourceEvidenceHash: null,
    canonicalLedgerStateHash: snapshot.canonicalLedgerStateHash,
    ledgerTransactionCount: snapshot.ledgerTransactionCount,
    riskSnapshotHash: snapshot.riskSnapshotHash,
    riskState: snapshot.riskState,
    riskFreshness: snapshot.riskFreshness,
    riskObservedAt: snapshot.riskObservedAt,
    riskMaximumAgeMs: snapshot.riskMaximumAgeMs,
    initialKernelSnapshotHash: draft.initialKernelSnapshotHash,
    latestKernelSnapshotHash: draft.initialKernelSnapshotHash,
    authorizationDecisionHash:
      draft.guard.authorizationDecisionHash,
    admissionDecisionHash: draft.guard.admissionDecisionHash,
    authorizedActorHash: draft.guard.authorizedActorHash,
    activatedByActorHash: null,
    status:
      HyperliquidTestnetFacilityFundingStatus.AWAITING_CONTRIBUTIONS,
    incidentReasonCodes: [],
    activationEvidenceHash: null,
    activationIdempotencyKeyHash: null,
    activationCommandHash: null,
    resultHash: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    activatedAt: null,
    ...baseSafety()
  };
  record.fundingHash = hashId(
    "hyperliquid_testnet_facility_funding",
    immutableFundingCore({
      ...record,
      fundingHash: "pending"
    })
  );
  record = withStateHash(record);
  assertRecord(record);
  return deepFreeze(record);
}

function kernelContradiction(record, snapshot) {
  if (
    snapshot.facilityId !== record.facilityId ||
    snapshot.facilityHash !== record.facilityHash ||
    snapshot.facilityStateHash !== record.facilityStateHash ||
    snapshot.facilityVersion !== record.facilityVersion ||
    snapshot.facilityLifecycleStatus !== record.facilityLifecycleStatus ||
    snapshot.obligationId !== record.obligationId ||
    snapshot.subjectId !== record.subjectId ||
    snapshot.bilateralTermsHash !== record.bilateralTermsHash ||
    snapshot.assetId !== record.assetId ||
    snapshot.requiredSubjectContributionMinor !==
      record.requiredSubjectContributionMinor ||
    snapshot.requiredProviderContributionMinor !==
      record.requiredProviderContributionMinor ||
    snapshot.maximumFacilityCapMinor !== record.maximumFacilityCapMinor ||
    snapshot.facilityDestinationHash !==
      record.facilityDestinationHash ||
    snapshot.accountBindingHash !== record.accountBindingHash ||
    snapshot.masterAccountHash !== record.masterAccountHash ||
    snapshot.withdrawalAuthorityHash !==
      record.withdrawalAuthorityHash ||
    snapshot.executionSignerReferenceHash !==
      record.executionSignerReferenceHash
  ) {
    return "kernel_binding_changed";
  }
  if (
    snapshot.canonicalLedgerStateHash !==
      record.canonicalLedgerStateHash ||
    snapshot.ledgerTransactionCount !== record.ledgerTransactionCount
  ) {
    return "canonical_ledger_changed";
  }
  return null;
}

function incident(record, reasonCode, receipt, snapshot, nowMs) {
  const updatedAt = new Date(nowMs).toISOString();
  const incidentReasonCodes = [...new Set([
    ...record.incidentReasonCodes,
    safeCode("reasonCode", reasonCode)
  ])].sort();
  let next = {
    ...structuredClone(record),
    status: HyperliquidTestnetFacilityFundingStatus.INCIDENT,
    processedReceiptCount:
      record.processedReceiptCount + (receipt ? 1 : 0),
    latestSourceEvidenceHash:
      receipt?.sourceEvidenceHash ?? record.latestSourceEvidenceHash,
    latestKernelSnapshotHash: snapshotHash(snapshot),
    riskSnapshotHash: snapshot.riskSnapshotHash,
    riskObservedAt: snapshot.riskObservedAt,
    incidentReasonCodes,
    resultHash: hashId(
      "hyperliquid_testnet_facility_funding_incident",
      {
        fundingHash: record.fundingHash,
        reasonCode,
        receiptHash: receipt?.receiptHash ?? null,
        recordVersion: record.version + 1,
        kernelSnapshotHash: snapshotHash(snapshot)
      }
    ),
    version: record.version + 1,
    updatedAt
  };
  next = withStateHash(next);
  assertRecord(next);
  return deepFreeze(next);
}

export function transitionTestnetFacilityFundingRecord(
  record,
  { receipt, kernelSnapshot, nowMs }
) {
  const current = assertRecord(record);
  const normalizedReceipt = assertReceipt(receipt);
  const snapshot = assertKernelSnapshot(kernelSnapshot, current);
  positiveInteger("nowMs", nowMs);
  if (TERMINAL_STATUSES.has(current.status)) return current;
  const contradiction = kernelContradiction(current, snapshot);
  if (contradiction) {
    return incident(
      current,
      contradiction,
      normalizedReceipt,
      snapshot,
      nowMs
    );
  }
  let reasonCode = null;
  const expectedAmount =
    normalizedReceipt.contributorRole ===
      HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS
      ? current.requiredSubjectContributionMinor
      : current.requiredProviderContributionMinor;
  if (normalizedReceipt.fundingHash !== current.fundingHash) {
    reasonCode = "funding_binding_changed";
  } else if (normalizedReceipt.facilityHash !== current.facilityHash) {
    reasonCode = "facility_binding_changed";
  } else if (normalizedReceipt.assetId !== current.assetId) {
    reasonCode = "wrong_asset";
  } else if (
    normalizedReceipt.destinationHash !==
    current.facilityDestinationHash
  ) {
    reasonCode = "wrong_destination";
  } else if (normalizedReceipt.amountMinor !== expectedAmount) {
    reasonCode = "wrong_amount";
  } else if (
    normalizedReceipt.freshness !== "FRESH" ||
    normalizedReceipt.complete !== true
  ) {
    reasonCode = "incomplete_or_stale_receipt";
  } else if (
    new Date(normalizedReceipt.observedAt).getTime() > nowMs
  ) {
    reasonCode = "future_receipt";
  }
  if (reasonCode) {
    return incident(
      current,
      reasonCode,
      normalizedReceipt,
      snapshot,
      nowMs
    );
  }

  const subjectRole =
    normalizedReceipt.contributorRole ===
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS;
  const existingReceiptHash = subjectRole
    ? current.subjectReceiptHash
    : current.providerReceiptHash;
  const finalizedContribution =
    normalizedReceipt.kind ===
    HyperliquidTestnetContributionReceiptKind.FINALIZED_CONTRIBUTION;
  if (finalizedContribution && existingReceiptHash !== null) {
    return incident(
      current,
      "duplicate_economic_contribution",
      normalizedReceipt,
      snapshot,
      nowMs
    );
  }
  if (
    !finalizedContribution &&
    (
      existingReceiptHash === null ||
      normalizedReceipt.relatedReceiptHash !== existingReceiptHash
    )
  ) {
    return incident(
      current,
      "reorg_receipt_mismatch",
      normalizedReceipt,
      snapshot,
      nowMs
    );
  }

  const subjectReceiptHash = subjectRole
    ? (finalizedContribution ? normalizedReceipt.receiptHash : null)
    : current.subjectReceiptHash;
  const providerReceiptHash = subjectRole
    ? current.providerReceiptHash
    : (finalizedContribution ? normalizedReceipt.receiptHash : null);
  const subjectContributionFinalized = subjectReceiptHash !== null;
  const providerContributionFinalized = providerReceiptHash !== null;
  const subjectContributionMinor = subjectContributionFinalized
    ? current.requiredSubjectContributionMinor
    : "0";
  const providerContributionMinor = providerContributionFinalized
    ? current.requiredProviderContributionMinor
    : "0";
  const reconciledTotalMinor = (
    BigInt(subjectContributionMinor) +
    BigInt(providerContributionMinor)
  ).toString();
  const updatedAt = new Date(nowMs).toISOString();
  let next = {
    ...structuredClone(current),
    status: stateFromContributions(
      subjectContributionFinalized,
      providerContributionFinalized
    ),
    subjectContributionMinor,
    providerContributionMinor,
    reconciledTotalMinor,
    subjectReceiptHash,
    providerReceiptHash,
    subjectContributionFinalized,
    providerContributionFinalized,
    processedReceiptCount: current.processedReceiptCount + 1,
    latestSourceEvidenceHash:
      normalizedReceipt.sourceEvidenceHash,
    latestKernelSnapshotHash: snapshotHash(snapshot),
    riskSnapshotHash: snapshot.riskSnapshotHash,
    riskObservedAt: snapshot.riskObservedAt,
    version: current.version + 1,
    updatedAt
  };
  next = withStateHash(next);
  assertRecord(next);
  return deepFreeze(next);
}

function assertActivationFreshness(snapshot, nowMs) {
  const observedAtMs = new Date(snapshot.riskObservedAt).getTime();
  if (
    snapshot.riskState !== "NORMAL" ||
    snapshot.riskFreshness !== "FRESH" ||
    observedAtMs > nowMs ||
    nowMs - observedAtMs > snapshot.riskMaximumAgeMs
  ) {
    fail(
      "hyperliquid_facility_funding_risk_stale",
      "activation requires a fresh server-owned NORMAL risk snapshot"
    );
  }
}

export function activateTestnetFacilityFundingRecord(
  record,
  {
    kernelSnapshot,
    activationIdempotencyKeyHash,
    activationCommandHash,
    activatedByActorHash,
    activatedFacility,
    nowMs
  }
) {
  const current = assertRecord(record);
  const snapshot = assertKernelSnapshot(kernelSnapshot, current);
  hash("activationIdempotencyKeyHash", activationIdempotencyKeyHash);
  hash("activationCommandHash", activationCommandHash);
  hash("activatedByActorHash", activatedByActorHash);
  positiveInteger("nowMs", nowMs);
  if (current.status === HyperliquidTestnetFacilityFundingStatus.ACTIVE) {
    if (
      current.activationIdempotencyKeyHash !==
        activationIdempotencyKeyHash ||
      current.activationCommandHash !== activationCommandHash
    ) {
      fail(
        "hyperliquid_facility_funding_idempotency_conflict",
        "activation idempotency key is bound to another command"
      );
    }
    return current;
  }
  if (current.status !== HyperliquidTestnetFacilityFundingStatus.READY) {
    fail(
      "hyperliquid_facility_funding_not_ready",
      "both exact finalized contributions are required before activation"
    );
  }
  const contradiction = kernelContradiction(current, snapshot);
  if (contradiction) {
    return incident(current, contradiction, null, snapshot, nowMs);
  }
  assertActivationFreshness(snapshot, nowMs);
  if (
    !plainObject(activatedFacility) ||
    activatedFacility.tradingFacilityId !== current.facilityId ||
    activatedFacility.facilityHash !== current.facilityHash ||
    activatedFacility.lifecycleStatus !== "active" ||
    activatedFacility.version !== current.facilityVersion + 1 ||
    activatedFacility.nonRedeemable !== true ||
    activatedFacility.withdrawable !== false ||
    activatedFacility.transferable !== false ||
    activatedFacility.secondLedgerCreated !== false ||
    activatedFacility.productionAuthority !== false ||
    activatedFacility.fundsAuthority !== false
  ) {
    fail(
      "hyperliquid_facility_funding_activation_invalid",
      "canonical Facility activation result is invalid"
    );
  }
  const activatedAt = new Date(nowMs).toISOString();
  const activationEvidenceHash = hashId(
    "hyperliquid_testnet_facility_activation_evidence",
    {
      fundingHash: current.fundingHash,
      facilityHash: current.facilityHash,
      previousFacilityStateHash: current.facilityStateHash,
      activatedFacilityStateHash: activatedFacility.stateHash,
      subjectReceiptHash: current.subjectReceiptHash,
      providerReceiptHash: current.providerReceiptHash,
      reconciledTotalMinor: current.reconciledTotalMinor,
      riskSnapshotHash: snapshot.riskSnapshotHash,
      authorizationDecisionHash: current.authorizationDecisionHash,
      admissionDecisionHash: current.admissionDecisionHash,
      activationCommandHash,
      activatedAt
    }
  );
  let next = {
    ...structuredClone(current),
    status: HyperliquidTestnetFacilityFundingStatus.ACTIVE,
    latestKernelSnapshotHash: snapshotHash(snapshot),
    riskSnapshotHash: snapshot.riskSnapshotHash,
    riskObservedAt: snapshot.riskObservedAt,
    activatedByActorHash,
    activationEvidenceHash,
    activationIdempotencyKeyHash,
    activationCommandHash,
    canonicalFacilityMutationCreated: true,
    resultHash: hashId(
      "hyperliquid_testnet_facility_funding_result",
      {
        fundingHash: current.fundingHash,
        activationEvidenceHash,
        activatedFacilityStateHash: activatedFacility.stateHash
      }
    ),
    version: current.version + 1,
    updatedAt: activatedAt,
    activatedAt
  };
  next = withStateHash(next);
  assertRecord(next);
  return deepFreeze(next);
}

function eventFor(record, {
  eventType,
  actorId,
  reasonCode,
  activatedFacilityStateHash = null,
  nowMs
}) {
  return createCreditEvent({
    eventType,
    subjectId: record.subjectId,
    obligationId: record.obligationId,
    payload: {
      fundingId: record.fundingId,
      fundingHash: record.fundingHash,
      facilityId: record.facilityId,
      facilityHash: record.facilityHash,
      fundingStateHash: record.stateHash,
      fundingStatus: record.status,
      recordVersion: record.version,
      assetId: record.assetId,
      requiredSubjectContributionMinor:
        record.requiredSubjectContributionMinor,
      requiredProviderContributionMinor:
        record.requiredProviderContributionMinor,
      subjectContributionMinor: record.subjectContributionMinor,
      providerContributionMinor: record.providerContributionMinor,
      reconciledTotalMinor: record.reconciledTotalMinor,
      subjectReceiptHash: record.subjectReceiptHash,
      providerReceiptHash: record.providerReceiptHash,
      latestSourceEvidenceHash: record.latestSourceEvidenceHash,
      riskSnapshotHash: record.riskSnapshotHash,
      canonicalLedgerStateHash: record.canonicalLedgerStateHash,
      activationEvidenceHash: record.activationEvidenceHash,
      activatedFacilityStateHash,
      directFacilityDestination: true,
      traderWalletPassThrough: false,
      traderWithdrawalAuthority: false,
      masterWithdrawalAuthoritySeparated: true,
      executionSignerSeparated: true,
      nonRedeemable: true,
      simulationOnly: true,
      externalSystemQueried: false,
      externalContributionSubmitted: false,
      canonicalFacility: true,
      secondFacilityCreated: false,
      canonicalFacilityMutationCreated:
        record.canonicalFacilityMutationCreated,
      ledgerMutationCreated: false,
      secondLedgerCreated: false,
      productionAuthority: false,
      fundsAuthority: false,
      productionFundsMoved: false,
      secretsIncluded: false,
      reasonCode,
      actorId
    },
    now: new Date(nowMs)
  });
}

function inMemoryEvidence(event, record, aggregateVersion, nowMs) {
  return createEvidenceEnvelope({
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateType: "trading_testnet_facility_funding",
    aggregateId: record.fundingId,
    aggregateVersion,
    subjectId: record.subjectId,
    obligationId: record.obligationId,
    correlationId: record.fundingId,
    idempotencyKey: `${record.idempotencyKeyHash}:${aggregateVersion}`,
    actorRef: event.payload.actorId,
    sourceSystem: "ipo.one.tc401.simulation",
    sourceFinality: event.finalityStatus,
    payload: event.payload,
    occurredAt: event.occurredAt,
    recordedAt: new Date(nowMs).toISOString()
  });
}

export class InMemoryHyperliquidFacilityFundingRepository {
  #records = new Map();
  #idempotency = new Map();
  #activations = new Map();
  #facilities = new Map();
  #events = new Map();
  #evidences = new Map();
  #outbox = new Map();
  #inbox = new Map();
  #queue = Promise.resolve();

  constructor(snapshot) {
    if (snapshot === undefined) return;
    exactKeys(
      snapshot,
      [
        "records",
        "idempotency",
        "activations",
        "facilities",
        "events",
        "evidences",
        "outbox",
        "inbox"
      ],
      [],
      "invalid_hyperliquid_facility_funding_repository_snapshot"
    );
    for (const record of snapshot.records) {
      assertRecord(record);
      this.#records.set(record.fundingId, deepFreeze(record));
    }
    this.#idempotency = new Map(structuredClone(snapshot.idempotency));
    this.#activations = new Map(structuredClone(snapshot.activations));
    this.#facilities = new Map(structuredClone(snapshot.facilities));
    this.#events = new Map(structuredClone(snapshot.events));
    this.#evidences = new Map(structuredClone(snapshot.evidences));
    this.#outbox = new Map(structuredClone(snapshot.outbox));
    this.#inbox = new Map(structuredClone(snapshot.inbox));
  }

  #exclusive(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => {});
    return next;
  }

  #append(record, event, nowMs) {
    const events = this.#events.get(record.fundingId) ?? [];
    const evidence = inMemoryEvidence(
      event,
      record,
      record.version,
      nowMs
    );
    events.push(structuredClone(event));
    this.#events.set(record.fundingId, events);
    this.#evidences.set(record.fundingId, [
      ...(this.#evidences.get(record.fundingId) ?? []),
      structuredClone(evidence)
    ]);
    this.#outbox.set(event.eventId, {
      outboxMessageId: `outbox_${event.eventId}`,
      topic: FUNDING_OUTBOX_TOPIC,
      messageKey: record.fundingId,
      payloadHash: hashId("outbox_payload", { event, evidence }),
      published: false,
      attempts: 0
    });
  }

  async create(draft, { nowMs }) {
    return this.#exclusive(async () => {
      const existingId = this.#idempotency.get(draft.idempotencyKeyHash);
      if (existingId) {
        const existing = this.#records.get(existingId);
        if (existing.requestHash !== draft.requestHash) {
          fail(
            "hyperliquid_facility_funding_idempotency_conflict",
            "idempotency key is bound to another funding request"
          );
        }
        return { record: existing, replayed: true };
      }
      const record = createPendingTestnetFacilityFundingRecord(
        draft,
        { nowMs }
      );
      const event = eventFor(record, {
        eventType: "trading_testnet_facility_funding_prepared",
        actorId: draft.guard.actorId,
        reasonCode: "funding_prepared",
        nowMs
      });
      this.#records.set(record.fundingId, record);
      this.#idempotency.set(
        record.idempotencyKeyHash,
        record.fundingId
      );
      this.#append(record, event, nowMs);
      return { record, replayed: false };
    });
  }

  async consumeReceipt({
    fundingId,
    receipt,
    kernelSnapshot,
    actorId,
    nowMs
  }) {
    return this.#exclusive(async () => {
      const normalized = assertReceipt(receipt);
      const payloadHash = hashId("inbox_payload", normalized);
      const inboxKey =
        `${FUNDING_INBOX_CONSUMER}\0${normalized.receiptId}`;
      const prior = this.#inbox.get(inboxKey);
      if (prior) {
        if (prior.payloadHash !== payloadHash) {
          fail(
            "hyperliquid_facility_funding_inbox_conflict",
            "receipt identity was reused with another payload"
          );
        }
        return {
          record: this.#records.get(fundingId),
          replayed: true
        };
      }
      const current = this.#records.get(fundingId);
      if (!current) {
        fail(
          "hyperliquid_facility_funding_unavailable",
          "funding record is unavailable"
        );
      }
      const next = transitionTestnetFacilityFundingRecord(current, {
        receipt: normalized,
        kernelSnapshot,
        nowMs
      });
      const event = eventFor(next, {
        eventType:
          next.status === HyperliquidTestnetFacilityFundingStatus.INCIDENT
            ? "trading_testnet_facility_funding_incident"
            : normalized.kind ===
                HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION
              ? "trading_testnet_contribution_reorg_invalidated"
              : "trading_testnet_contribution_reconciled",
        actorId,
        reasonCode:
          next.status === HyperliquidTestnetFacilityFundingStatus.INCIDENT
            ? next.incidentReasonCodes.at(-1)
            : normalized.kind ===
                HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION
              ? "reorg_invalidated"
              : "contribution_reconciled",
        nowMs
      });
      this.#records.set(fundingId, next);
      this.#append(next, event, nowMs);
      this.#inbox.set(inboxKey, {
        payloadHash,
        status: "completed"
      });
      return { record: next, replayed: false };
    });
  }

  async activate({
    fundingId,
    kernelSnapshot,
    activationIdempotencyKeyHash,
    activationCommandHash,
    activatedByActorHash,
    activatedFacility,
    actorId,
    nowMs
  }) {
    return this.#exclusive(async () => {
      const prior = this.#activations.get(activationIdempotencyKeyHash);
      if (prior) {
        if (prior.activationCommandHash !== activationCommandHash) {
          fail(
            "hyperliquid_facility_funding_idempotency_conflict",
            "activation idempotency key is bound to another command"
          );
        }
        return {
          record: this.#records.get(prior.fundingId),
          facility: this.#facilities.get(prior.fundingId),
          replayed: true
        };
      }
      const current = this.#records.get(fundingId);
      if (!current) {
        fail(
          "hyperliquid_facility_funding_unavailable",
          "funding record is unavailable"
        );
      }
      const next = activateTestnetFacilityFundingRecord(current, {
        kernelSnapshot,
        activationIdempotencyKeyHash,
        activationCommandHash,
        activatedByActorHash,
        activatedFacility,
        nowMs
      });
      if (
        next.status ===
        HyperliquidTestnetFacilityFundingStatus.INCIDENT
      ) {
        const event = eventFor(next, {
          eventType: "trading_testnet_facility_funding_incident",
          actorId,
          reasonCode: next.incidentReasonCodes.at(-1),
          nowMs
        });
        this.#records.set(fundingId, next);
        this.#append(next, event, nowMs);
        return {
          record: next,
          facility: undefined,
          replayed: false
        };
      }
      const event = eventFor(next, {
        eventType: "trading_testnet_facility_funding_activated",
        actorId,
        reasonCode: "privileged_activation_reconciled",
        activatedFacilityStateHash: activatedFacility.stateHash,
        nowMs
      });
      this.#records.set(fundingId, next);
      this.#facilities.set(
        fundingId,
        deepFreeze(structuredClone(activatedFacility))
      );
      this.#activations.set(activationIdempotencyKeyHash, {
        fundingId,
        activationCommandHash
      });
      this.#append(next, event, nowMs);
      return {
        record: next,
        facility: this.#facilities.get(fundingId),
        replayed: false
      };
    });
  }

  async findById(fundingId) {
    identifier("fundingId", fundingId);
    return this.#records.get(fundingId);
  }

  async findFacility(fundingId) {
    identifier("fundingId", fundingId);
    return this.#facilities.get(fundingId);
  }

  async history(fundingId) {
    identifier("fundingId", fundingId);
    return structuredClone(this.#events.get(fundingId) ?? []);
  }

  exportSnapshot() {
    return deepFreeze({
      records: [...this.#records.values()].map((value) =>
        structuredClone(value)
      ),
      idempotency: [...this.#idempotency.entries()],
      activations: [...this.#activations.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      facilities: [...this.#facilities.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      events: [...this.#events.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      evidences: [...this.#evidences.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      outbox: [...this.#outbox.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      inbox: [...this.#inbox.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ])
    });
  }
}

export class SimulatedHyperliquidFacilityFundingCommandGuard {
  constructor(options = {}) {
    exactKeys(
      options,
      [],
      [],
      "invalid_hyperliquid_facility_funding_guard_configuration"
    );
    this.profile = deepFreeze({
      serverOwned: true,
      tenantContextResolved: true,
      privilegedActivation: true,
      simulationOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_facility_funding_guard_profile.v1"
    });
  }

  async authorize({ operation, requestHash, facilityId }) {
    if (!["prepare", "record_contribution", "activate"].includes(operation)) {
      fail(
        "hyperliquid_facility_funding_guard_denied",
        "operation is outside the internal funding allowlist"
      );
    }
    hash("requestHash", requestHash);
    identifier("facilityId", facilityId);
    const actorId = operation === "activate"
      ? "risk_operator:tc401-simulated-activation"
      : "system:tc401-simulated-funding-indexer";
    return deepFreeze({
      approved: true,
      operation,
      authorizationDecisionHash: hashId(
        "hyperliquid_testnet_facility_funding_authorization",
        { operation, requestHash, facilityId, actorId }
      ),
      admissionDecisionHash: hashId(
        "hyperliquid_testnet_facility_funding_admission",
        {
          operation,
          requestHash,
          facilityId,
          bounded: true,
          simulationOnly: true
        }
      ),
      authorizedActorHash: actorHash(actorId),
      actorId,
      privilegedActivation: operation === "activate",
      tenantContextResolved: true,
      clientIdentityAccepted: false,
      simulationOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_facility_funding_guard.v1"
    });
  }
}

function assertGuardDecision(value, operation) {
  exactKeys(
    value,
    [
      "approved",
      "operation",
      "authorizationDecisionHash",
      "admissionDecisionHash",
      "authorizedActorHash",
      "actorId",
      "privilegedActivation",
      "tenantContextResolved",
      "clientIdentityAccepted",
      "simulationOnly",
      "productionAuthority",
      "fundsAuthority",
      "schemaVersion"
    ],
    [],
    "invalid_hyperliquid_facility_funding_guard_decision"
  );
  if (
    value.approved !== true ||
    value.operation !== operation ||
    value.privilegedActivation !== (operation === "activate") ||
    value.tenantContextResolved !== true ||
    value.clientIdentityAccepted !== false ||
    value.simulationOnly !== true ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false
  ) {
    fail(
      "hyperliquid_facility_funding_guard_denied",
      "authorization/admission decision is invalid"
    );
  }
  hash("authorizationDecisionHash", value.authorizationDecisionHash);
  hash("admissionDecisionHash", value.admissionDecisionHash);
  hash("authorizedActorHash", value.authorizedActorHash);
  identifier("actorId", value.actorId);
  return value;
}

export class SimulatedHyperliquidFacilityFundingKernelResolver {
  #snapshots;
  #calls = 0;

  constructor({ snapshots, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(snapshots) ||
      snapshots.length < 1 ||
      snapshots.length > 32
    ) {
      fail(
        "invalid_hyperliquid_facility_funding_kernel_resolver",
        "one through 32 closed snapshots are required"
      );
    }
    this.#snapshots = snapshots.map((snapshot) =>
      assertKernelSnapshot(snapshot)
    );
    this.profile = deepFreeze({
      serverOwned: true,
      simulationOnly: true,
      canonicalFacility: true,
      canonicalLedger: true,
      networkAvailable: false,
      liveAccountsApproved: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_facility_funding_kernel_resolver.v1"
    });
  }

  async resolve({ facilityId, facilityHash }) {
    identifier("facilityId", facilityId);
    hash("facilityHash", facilityHash);
    const index = Math.min(this.#calls, this.#snapshots.length - 1);
    this.#calls += 1;
    return assertKernelSnapshot(
      this.#snapshots[index],
      { facilityId, facilityHash }
    );
  }

  get callCount() {
    return this.#calls;
  }
}

export class ScriptedHyperliquidContributionReceiptAdapter {
  #receipts;
  #calls = 0;

  constructor({ receipts, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(receipts) ||
      receipts.length < 1 ||
      receipts.length > 32
    ) {
      fail(
        "invalid_hyperliquid_facility_funding_adapter",
        "one through 32 normalized receipts are required"
      );
    }
    this.#receipts = receipts.map((receipt) =>
      deepFreeze(structuredClone(assertReceipt(receipt)))
    );
    this.profile = deepFreeze({
      sourceFixed: true,
      simulationOnly: true,
      networkAvailable: false,
      liveTransportApproved: false,
      contributionSubmissionAvailable: false,
      rawAddressAvailable: false,
      rawResponseAvailable: false,
      secretsAvailable: false,
      schemaVersion:
        "hyperliquid_testnet_scripted_contribution_receipt_adapter.v1"
    });
  }

  async observe({ fundingId, fundingHash, facilityHash }) {
    identifier("fundingId", fundingId);
    hash("fundingHash", fundingHash);
    hash("facilityHash", facilityHash);
    const index = Math.min(this.#calls, this.#receipts.length - 1);
    this.#calls += 1;
    return this.#receipts[index];
  }

  get callCount() {
    return this.#calls;
  }
}

function boundedIdempotencyKey(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 256
  ) {
    fail(
      "invalid_hyperliquid_facility_funding_input",
      "idempotencyKey must be bounded"
    );
  }
  return value;
}

export class HyperliquidTestnetFacilityFundingService {
  #repository;
  #commandGuard;
  #kernelResolver;
  #receiptAdapter;
  #clock;

  constructor({
    repository,
    commandGuard,
    kernelResolver,
    receiptAdapter,
    clock = Date.now,
    ...unknown
  } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !repository ||
      typeof repository.create !== "function" ||
      typeof repository.consumeReceipt !== "function" ||
      typeof repository.activate !== "function" ||
      typeof repository.findById !== "function" ||
      typeof repository.findFacility !== "function" ||
      !commandGuard ||
      typeof commandGuard.authorize !== "function" ||
      commandGuard.profile?.serverOwned !== true ||
      commandGuard.profile?.tenantContextResolved !== true ||
      commandGuard.profile?.privilegedActivation !== true ||
      commandGuard.profile?.simulationOnly !== true ||
      !kernelResolver ||
      typeof kernelResolver.resolve !== "function" ||
      kernelResolver.profile?.serverOwned !== true ||
      kernelResolver.profile?.simulationOnly !== true ||
      kernelResolver.profile?.canonicalFacility !== true ||
      kernelResolver.profile?.canonicalLedger !== true ||
      kernelResolver.profile?.networkAvailable !== false ||
      kernelResolver.profile?.liveAccountsApproved !== false ||
      !receiptAdapter ||
      typeof receiptAdapter.observe !== "function" ||
      receiptAdapter.profile?.sourceFixed !== true ||
      receiptAdapter.profile?.simulationOnly !== true ||
      receiptAdapter.profile?.networkAvailable !== false ||
      receiptAdapter.profile?.liveTransportApproved !== false ||
      receiptAdapter.profile?.contributionSubmissionAvailable !== false ||
      typeof clock !== "function"
    ) {
      fail(
        "hyperliquid_facility_funding_runtime_unavailable",
        "only the complete protected offline funding composition is approved"
      );
    }
    this.#repository = repository;
    this.#commandGuard = commandGuard;
    this.#kernelResolver = kernelResolver;
    this.#receiptAdapter = receiptAdapter;
    this.#clock = clock;
  }

  async prepare({ facilityId, facilityHash, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail(
        "invalid_hyperliquid_facility_funding_input",
        "prepare input has an open shape"
      );
    }
    identifier("facilityId", facilityId);
    hash("facilityHash", facilityHash);
    boundedIdempotencyKey(idempotencyKey);
    const snapshot = assertKernelSnapshot(
      await this.#kernelResolver.resolve({ facilityId, facilityHash }),
      { facilityId, facilityHash }
    );
    const preGuardRequestHash = hashId(
      "hyperliquid_testnet_facility_funding_pre_guard",
      {
        facilityId,
        facilityHash,
        facilityStateHash: snapshot.facilityStateHash,
        bilateralTermsHash: snapshot.bilateralTermsHash,
        facilityDestinationHash: snapshot.facilityDestinationHash
      }
    );
    const guard = assertGuardDecision(
      await this.#commandGuard.authorize({
        operation: "prepare",
        requestHash: preGuardRequestHash,
        facilityId
      }),
      "prepare"
    );
    const draft = createDraft(
      { idempotencyKey },
      snapshot,
      guard
    );
    return (
      await this.#repository.create(draft, {
        nowMs: clockMs(this.#clock)
      })
    ).record;
  }

  async reconcileNext({ fundingId, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail(
        "invalid_hyperliquid_facility_funding_input",
        "reconciliation input has an open shape"
      );
    }
    identifier("fundingId", fundingId);
    const current = await this.#repository.findById(fundingId);
    if (!current) {
      fail(
        "hyperliquid_facility_funding_unavailable",
        "funding record is unavailable"
      );
    }
    if (TERMINAL_STATUSES.has(current.status)) return current;
    const requestHash = hashId(
      "hyperliquid_testnet_facility_contribution_reconciliation",
      {
        fundingHash: current.fundingHash,
        recordVersion: current.version
      }
    );
    const guard = assertGuardDecision(
      await this.#commandGuard.authorize({
        operation: "record_contribution",
        requestHash,
        facilityId: current.facilityId
      }),
      "record_contribution"
    );
    const snapshot = assertKernelSnapshot(
      await this.#kernelResolver.resolve({
        facilityId: current.facilityId,
        facilityHash: current.facilityHash
      }),
      current
    );
    const receipt = assertReceipt(
      await this.#receiptAdapter.observe({
        fundingId,
        fundingHash: current.fundingHash,
        facilityHash: current.facilityHash
      })
    );
    return (
      await this.#repository.consumeReceipt({
        fundingId,
        receipt,
        kernelSnapshot: snapshot,
        actorId: guard.actorId,
        nowMs: clockMs(this.#clock)
      })
    ).record;
  }

  async activate({ fundingId, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail(
        "invalid_hyperliquid_facility_funding_input",
        "activation input has an open shape"
      );
    }
    identifier("fundingId", fundingId);
    boundedIdempotencyKey(idempotencyKey);
    const current = await this.#repository.findById(fundingId);
    if (!current) {
      fail(
        "hyperliquid_facility_funding_unavailable",
        "funding record is unavailable"
      );
    }
    if (
      current.status === HyperliquidTestnetFacilityFundingStatus.ACTIVE
    ) {
      const activationIdempotencyKeyHash = hashId(
        "hyperliquid_testnet_facility_activation_idempotency",
        { idempotencyKey }
      );
      if (
        current.activationIdempotencyKeyHash !==
        activationIdempotencyKeyHash
      ) {
        fail(
          "hyperliquid_facility_funding_idempotency_conflict",
          "activation idempotency key is bound to another command"
        );
      }
      return {
        record: current,
        facility: await this.#repository.findFacility(fundingId),
        replayed: true
      };
    }
    const snapshot = assertKernelSnapshot(
      await this.#kernelResolver.resolve({
        facilityId: current.facilityId,
        facilityHash: current.facilityHash
      }),
      current
    );
    const requestHash = hashId(
      "hyperliquid_testnet_facility_activation_request",
      {
        fundingHash: current.fundingHash,
        fundingStateHash: current.stateHash,
        facilityStateHash: snapshot.facilityStateHash,
        riskSnapshotHash: snapshot.riskSnapshotHash,
        subjectReceiptHash: current.subjectReceiptHash,
        providerReceiptHash: current.providerReceiptHash
      }
    );
    const guard = assertGuardDecision(
      await this.#commandGuard.authorize({
        operation: "activate",
        requestHash,
        facilityId: current.facilityId
      }),
      "activate"
    );
    const nowMs = clockMs(this.#clock);
    assertActivationFreshness(snapshot, nowMs);
    const activatedFacility = activateTradingFacility(snapshot.facility, {
      matchProposal: snapshot.matchProposal,
      obligation: snapshot.obligation,
      activatedByActorId: snapshot.subjectActorId,
      expectedStateHash: snapshot.facilityStateHash,
      expectedVersion: snapshot.facilityVersion,
      now: new Date(nowMs)
    });
    const activationIdempotencyKeyHash = hashId(
      "hyperliquid_testnet_facility_activation_idempotency",
      { idempotencyKey }
    );
    const activationCommandHash = hashId(
      "hyperliquid_testnet_facility_activation_command",
      {
        requestHash,
        authorizationDecisionHash: guard.authorizationDecisionHash,
        admissionDecisionHash: guard.admissionDecisionHash,
        activationIdempotencyKeyHash,
        activatedFacilityStateHash: activatedFacility.stateHash
      }
    );
    return this.#repository.activate({
      fundingId,
      kernelSnapshot: snapshot,
      activationIdempotencyKeyHash,
      activationCommandHash,
      activatedByActorHash: guard.authorizedActorHash,
      activatedFacility,
      actorId: guard.actorId,
      nowMs
    });
  }
}

function insertSqlValues(record) {
  return [
    record.fundingId,
    record.fundingHash,
    record.stateHash,
    record.requestHash,
    record.idempotencyKeyHash,
    record.facilityId,
    record.facilityHash,
    record.facilityStateHash,
    record.facilityVersion,
    record.obligationId,
    record.subjectId,
    record.bilateralTermsHash,
    record.assetId,
    record.requiredSubjectContributionMinor,
    record.requiredProviderContributionMinor,
    record.maximumFacilityCapMinor,
    record.facilityDestinationHash,
    record.accountBindingHash,
    record.masterAccountHash,
    record.withdrawalAuthorityHash,
    record.executionSignerReferenceHash,
    record.subjectContributionMinor,
    record.providerContributionMinor,
    record.reconciledTotalMinor,
    record.subjectReceiptHash,
    record.providerReceiptHash,
    record.subjectContributionFinalized,
    record.providerContributionFinalized,
    record.processedReceiptCount,
    record.latestSourceEvidenceHash,
    record.canonicalLedgerStateHash,
    record.ledgerTransactionCount,
    record.riskSnapshotHash,
    record.authorizationDecisionHash,
    record.admissionDecisionHash,
    record.activatedByActorHash,
    record.activationEvidenceHash,
    record.activationIdempotencyKeyHash,
    record.activationCommandHash,
    record.status,
    record.resultHash,
    record.version,
    JSON.stringify(record),
    record.createdAt,
    record.updatedAt,
    record.activatedAt,
    record.simulationOnly,
    record.nonRedeemable,
    record.directFacilityDestination,
    record.traderWalletPassThrough,
    record.traderWithdrawalAuthority,
    record.canonicalFacilityMutationCreated,
    record.ledgerMutationCreated,
    record.secondFacilityCreated,
    record.secondLedgerCreated,
    record.mainnetAuthority,
    record.productionAuthority,
    record.fundsAuthority,
    record.secretsIncluded,
    record.schemaVersion
  ];
}

function updateSqlValues(record) {
  return [
    record.fundingId,
    record.stateHash,
    record.subjectContributionMinor,
    record.providerContributionMinor,
    record.reconciledTotalMinor,
    record.subjectReceiptHash,
    record.providerReceiptHash,
    record.subjectContributionFinalized,
    record.providerContributionFinalized,
    record.processedReceiptCount,
    record.latestSourceEvidenceHash,
    record.riskSnapshotHash,
    record.activatedByActorHash,
    record.activationEvidenceHash,
    record.activationIdempotencyKeyHash,
    record.activationCommandHash,
    record.status,
    record.resultHash,
    record.version,
    JSON.stringify(record),
    record.updatedAt,
    record.activatedAt,
    record.canonicalFacilityMutationCreated
  ];
}

export class PostgresHyperliquidFacilityFundingRepository {
  #coreRepository;
  #eventRepository;

  constructor({ coreRepository, ...unknown } = {}) {
    const eventRepository = coreRepository?.eventRepository;
    if (
      Object.keys(unknown).length !== 0 ||
      !coreRepository ||
      typeof coreRepository.withTenantTransaction !== "function" ||
      typeof coreRepository.commitCommandInTransaction !== "function" ||
      typeof coreRepository.getProjectionStateInTransaction !== "function" ||
      !eventRepository ||
      typeof eventRepository.appendCommand !== "function" ||
      typeof eventRepository.appendCommandBatchInTransaction !== "function" ||
      typeof eventRepository.processInbox !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_hyperliquid_facility_funding_repository",
        "the Tenant-scoped PostgreSQL Core/Event Repository is required"
      );
    }
    this.#coreRepository = coreRepository;
    this.#eventRepository = eventRepository;
  }

  async create(draft, { nowMs }) {
    const record = createPendingTestnetFacilityFundingRecord(
      draft,
      { nowMs }
    );
    const event = eventFor(record, {
      eventType: "trading_testnet_facility_funding_prepared",
      actorId: draft.guard.actorId,
      reasonCode: "funding_prepared",
      nowMs
    });
    const committed = await this.#eventRepository.appendCommand({
      aggregateType: "trading_testnet_facility_funding",
      aggregateId: record.fundingId,
      expectedVersion: 0,
      idempotencyKey: `tc401:prepare:${record.idempotencyKeyHash}`,
      commandHash: record.requestHash,
      event,
      outboxTopic: FUNDING_OUTBOX_TOPIC,
      response: record,
      applyProjection: async ({ client }) => {
        await client.query(
          `INSERT INTO trading_testnet_facility_funding_controls (
             id, funding_hash, state_hash, request_hash,
             idempotency_key_hash, facility_id, facility_hash,
             facility_state_hash, facility_version, obligation_id,
             subject_id, bilateral_terms_hash, asset_id,
             required_subject_contribution_minor,
             required_provider_contribution_minor,
             maximum_facility_cap_minor, facility_destination_hash,
             account_binding_hash, master_account_hash,
             withdrawal_authority_hash, execution_signer_reference_hash,
             subject_contribution_minor, provider_contribution_minor,
             reconciled_total_minor, subject_receipt_hash,
             provider_receipt_hash, subject_contribution_finalized,
             provider_contribution_finalized, processed_receipt_count,
             latest_source_evidence_hash, canonical_ledger_state_hash,
             ledger_transaction_count, risk_snapshot_hash,
             authorization_decision_hash, admission_decision_hash,
             activated_by_actor_hash, activation_evidence_hash,
             activation_idempotency_key_hash,
             activation_command_hash, status, result_hash, version,
             record, created_at, updated_at, activated_at,
             simulation_only, non_redeemable, direct_facility_destination,
             trader_wallet_pass_through, trader_withdrawal_authority,
             canonical_facility_mutation_created, ledger_mutation_created,
             second_facility_created, second_ledger_created,
             mainnet_authority, production_authority, funds_authority,
             secrets_included, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
             $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
             $41, $42, $43::JSONB, $44, $45, $46, $47, $48, $49, $50,
             $51, $52, $53, $54, $55, $56, $57, $58, $59, $60
           )`,
          insertSqlValues(record)
        );
      }
    });
    if (committed.replayed) {
      const current = await this.findById(record.fundingId);
      if (!current || current.requestHash !== record.requestHash) {
        fail(
          "hyperliquid_facility_funding_idempotency_conflict",
          "replayed request is not bound to the durable funding record"
        );
      }
      return { record: current, replayed: true };
    }
    return {
      record: deepFreeze(assertRecord(committed.response)),
      replayed: false
    };
  }

  async consumeReceipt({
    fundingId,
    receipt,
    kernelSnapshot,
    actorId,
    nowMs
  }) {
    identifier("fundingId", fundingId);
    identifier("actorId", actorId);
    const normalized = assertReceipt(receipt);
    const payloadHash = hashId("inbox_payload", normalized);
    const processed = await this.#eventRepository.processInbox({
      consumerName: FUNDING_INBOX_CONSUMER,
      eventId: normalized.receiptId,
      payload: normalized,
      payloadHash,
      handler: async ({ client }) => {
        const result = await client.query(
          `SELECT record
             FROM trading_testnet_facility_funding_controls
            WHERE id = $1
            FOR UPDATE`,
          [fundingId]
        );
        if (result.rowCount !== 1) {
          fail(
            "hyperliquid_facility_funding_unavailable",
            "funding record is unavailable"
          );
        }
        const current = assertRecord(result.rows[0].record);
        if (TERMINAL_STATUSES.has(current.status)) return current;
        const next = transitionTestnetFacilityFundingRecord(current, {
          receipt: normalized,
          kernelSnapshot,
          nowMs
        });
        const event = eventFor(next, {
          eventType:
            next.status ===
              HyperliquidTestnetFacilityFundingStatus.INCIDENT
              ? "trading_testnet_facility_funding_incident"
              : normalized.kind ===
                  HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION
                ? "trading_testnet_contribution_reorg_invalidated"
                : "trading_testnet_contribution_reconciled",
          actorId,
          reasonCode:
            next.status ===
              HyperliquidTestnetFacilityFundingStatus.INCIDENT
              ? next.incidentReasonCodes.at(-1)
              : normalized.kind ===
                  HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION
                ? "reorg_invalidated"
                : "contribution_reconciled",
          nowMs
        });
        const committed =
          await this.#eventRepository.appendCommandBatchInTransaction(
            client,
            {
              aggregateType: "trading_testnet_facility_funding",
              aggregateId: fundingId,
              idempotencyKey: `tc401:receipt:${normalized.receiptId}`,
              commandHash: payloadHash,
              events: [{
                aggregateType: "trading_testnet_facility_funding",
                aggregateId: fundingId,
                expectedVersion: current.version,
                event,
                outboxTopic: FUNDING_OUTBOX_TOPIC
              }],
              response: next,
              applyProjection: async () => {
                const update = await client.query(
                  `UPDATE trading_testnet_facility_funding_controls
                      SET state_hash = $2,
                          subject_contribution_minor = $3,
                          provider_contribution_minor = $4,
                          reconciled_total_minor = $5,
                          subject_receipt_hash = $6,
                          provider_receipt_hash = $7,
                          subject_contribution_finalized = $8,
                          provider_contribution_finalized = $9,
                          processed_receipt_count = $10,
                          latest_source_evidence_hash = $11,
                          risk_snapshot_hash = $12,
                          activated_by_actor_hash = $13,
                          activation_evidence_hash = $14,
                          activation_idempotency_key_hash = $15,
                          activation_command_hash = $16,
                          status = $17,
                          result_hash = $18,
                          version = $19,
                          record = $20::JSONB,
                          updated_at = $21,
                          activated_at = $22,
                          canonical_facility_mutation_created = $23
                    WHERE id = $1
                      AND version = $24`,
                  [...updateSqlValues(next), current.version]
                );
                if (update.rowCount !== 1) {
                  fail(
                    "hyperliquid_facility_funding_concurrency_conflict",
                    "funding projection lost its version lock"
                  );
                }
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

  async activate({
    fundingId,
    kernelSnapshot,
    activationIdempotencyKeyHash,
    activationCommandHash,
    activatedByActorHash,
    activatedFacility,
    actorId,
    nowMs
  }) {
    identifier("fundingId", fundingId);
    identifier("actorId", actorId);
    return this.#coreRepository.withTenantTransaction(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_facility_funding_controls
          WHERE id = $1
          FOR UPDATE`,
        [fundingId]
      );
      if (result.rowCount !== 1) {
        fail(
          "hyperliquid_facility_funding_unavailable",
          "funding record is unavailable"
        );
      }
      const current = assertRecord(result.rows[0].record);
      if (
        current.status ===
        HyperliquidTestnetFacilityFundingStatus.ACTIVE
      ) {
        if (
          current.activationIdempotencyKeyHash !==
            activationIdempotencyKeyHash ||
          current.activationCommandHash !== activationCommandHash
        ) {
          fail(
            "hyperliquid_facility_funding_idempotency_conflict",
            "activation idempotency key is bound to another command"
          );
        }
        const facilityState =
          await this.#coreRepository.getProjectionStateInTransaction(
            client,
            "trading_facility",
            current.facilityId,
            { lock: false }
          );
        return {
          record: current,
          facility: facilityState?.value,
          replayed: true
        };
      }
      const next = activateTestnetFacilityFundingRecord(current, {
        kernelSnapshot,
        activationIdempotencyKeyHash,
        activationCommandHash,
        activatedByActorHash,
        activatedFacility,
        nowMs
      });
      if (
        next.status ===
        HyperliquidTestnetFacilityFundingStatus.INCIDENT
      ) {
        const event = eventFor(next, {
          eventType: "trading_testnet_facility_funding_incident",
          actorId,
          reasonCode: next.incidentReasonCodes.at(-1),
          nowMs
        });
        const committed =
          await this.#eventRepository.appendCommandBatchInTransaction(
            client,
            {
              aggregateType: "trading_testnet_facility_funding",
              aggregateId: fundingId,
              idempotencyKey:
                `tc401:activation-incident:${activationIdempotencyKeyHash}`,
              commandHash: activationCommandHash,
              events: [{
                aggregateType: "trading_testnet_facility_funding",
                aggregateId: fundingId,
                expectedVersion: current.version,
                event,
                outboxTopic: FUNDING_OUTBOX_TOPIC
              }],
              response: next,
              applyProjection: async () => {
                const update = await client.query(
                  `UPDATE trading_testnet_facility_funding_controls
                      SET state_hash = $2,
                          subject_contribution_minor = $3,
                          provider_contribution_minor = $4,
                          reconciled_total_minor = $5,
                          subject_receipt_hash = $6,
                          provider_receipt_hash = $7,
                          subject_contribution_finalized = $8,
                          provider_contribution_finalized = $9,
                          processed_receipt_count = $10,
                          latest_source_evidence_hash = $11,
                          risk_snapshot_hash = $12,
                          activated_by_actor_hash = $13,
                          activation_evidence_hash = $14,
                          activation_idempotency_key_hash = $15,
                          activation_command_hash = $16,
                          status = $17,
                          result_hash = $18,
                          version = $19,
                          record = $20::JSONB,
                          updated_at = $21,
                          activated_at = $22,
                          canonical_facility_mutation_created = $23
                    WHERE id = $1
                      AND version = $24`,
                  [...updateSqlValues(next), current.version]
                );
                if (update.rowCount !== 1) {
                  fail(
                    "hyperliquid_facility_funding_concurrency_conflict",
                    "incident projection lost its version lock"
                  );
                }
              }
            }
          );
        return {
          record: deepFreeze(assertRecord(committed.response)),
          facility: undefined,
          replayed: committed.replayed
        };
      }
      const fundingEvent = eventFor(next, {
        eventType: "trading_testnet_facility_funding_activated",
        actorId,
        reasonCode: "privileged_activation_reconciled",
        activatedFacilityStateHash: activatedFacility.stateHash,
        nowMs
      });
      const facilityEvent = createCreditEvent({
        eventType: "trading_facility_activated",
        subjectId: next.subjectId,
        obligationId: next.obligationId,
        payload: {
          tradingFacilityId: next.facilityId,
          fundingId: next.fundingId,
          fundingHash: next.fundingHash,
          activationEvidenceHash: next.activationEvidenceHash,
          previousStateHash: next.facilityStateHash,
          stateHash: activatedFacility.stateHash,
          lifecycleStatus: activatedFacility.lifecycleStatus,
          privilegedActivation: true,
          exactContributionsReconciled: true,
          freshRiskRequired: true,
          nonRedeemable: true,
          directFacilityDestination: true,
          traderWalletPassThrough: false,
          traderWithdrawalAuthority: false,
          masterWithdrawalAuthoritySeparated: true,
          executionSignerSeparated: true,
          simulationOnly: true,
          externalSystemQueried: false,
          externalContributionSubmitted: false,
          secondFacilityCreated: false,
          ledgerMutationCreated: false,
          secondLedgerCreated: false,
          productionAuthority: false,
          fundsAuthority: false,
          productionFundsMoved: false,
          actorId
        },
        now: new Date(nowMs)
      });
      const update = await client.query(
        `UPDATE trading_testnet_facility_funding_controls
            SET state_hash = $2,
                subject_contribution_minor = $3,
                provider_contribution_minor = $4,
                reconciled_total_minor = $5,
                subject_receipt_hash = $6,
                provider_receipt_hash = $7,
                subject_contribution_finalized = $8,
                provider_contribution_finalized = $9,
                processed_receipt_count = $10,
                latest_source_evidence_hash = $11,
                risk_snapshot_hash = $12,
                activated_by_actor_hash = $13,
                activation_evidence_hash = $14,
                activation_idempotency_key_hash = $15,
                activation_command_hash = $16,
                status = $17,
                result_hash = $18,
                version = $19,
                record = $20::JSONB,
                updated_at = $21,
                activated_at = $22,
                canonical_facility_mutation_created = $23
          WHERE id = $1
            AND version = $24`,
        [...updateSqlValues(next), current.version]
      );
      if (update.rowCount !== 1) {
        fail(
          "hyperliquid_facility_funding_concurrency_conflict",
          "activation projection lost its version lock"
        );
      }
      const committed =
        await this.#coreRepository.commitCommandInTransaction(
          client,
          {
            aggregateType: "trading_testnet_facility_funding",
            aggregateId: fundingId,
            idempotencyKey:
              `tc401:activate:${activationIdempotencyKeyHash}`,
            commandHash: activationCommandHash,
            events: [
              {
                aggregateType: "trading_testnet_facility_funding",
                aggregateId: fundingId,
                expectedVersion: current.version,
                event: fundingEvent,
                outboxTopic: FUNDING_OUTBOX_TOPIC
              },
              {
                aggregateType: "trading_facility",
                aggregateId: next.facilityId,
                expectedVersion: current.facilityVersion,
                event: facilityEvent,
                outboxTopic: FUNDING_OUTBOX_TOPIC
              }
            ],
            writes: [{
              type: "trading_facility",
              value: activatedFacility,
              eventId: facilityEvent.eventId
            }],
            response: {
              record: next,
              facility: activatedFacility
            }
          }
        );
      return {
        record: deepFreeze(
          assertRecord(committed.response.record)
        ),
        facility: deepFreeze(
          structuredClone(committed.response.facility)
        ),
        replayed: committed.replayed
      };
    });
  }

  async findById(fundingId) {
    identifier("fundingId", fundingId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_facility_funding_controls
          WHERE id = $1`,
        [fundingId]
      );
      return result.rowCount === 1
        ? deepFreeze(assertRecord(structuredClone(result.rows[0].record)))
        : undefined;
    });
  }

  async findFacility(fundingId) {
    identifier("fundingId", fundingId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const funding = await client.query(
        `SELECT facility_id
           FROM trading_testnet_facility_funding_controls
          WHERE id = $1`,
        [fundingId]
      );
      if (funding.rowCount !== 1) return undefined;
      const state =
        await this.#coreRepository.getProjectionStateInTransaction(
          client,
          "trading_facility",
          funding.rows[0].facility_id,
          { lock: false }
        );
      return state?.value;
    });
  }

  async history(fundingId) {
    identifier("fundingId", fundingId);
    return this.#eventRepository.listEvents({
      aggregateType: "trading_testnet_facility_funding",
      aggregateId: fundingId
    });
  }
}
