import { createHash } from "node:crypto";
import {
  createCoreProjectionHash
} from "../../../modules/persistence/src/index.js";
import { assertTenantProtocolRequest } from "../../../packages/api-contract/src/tenant-protocol.js";
import { hashId } from "../../../packages/domain/src/index.js";

const EXACT_SHA = /^[0-9a-f]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const MINOR_UNITS = /^(?:0|[1-9][0-9]{0,77})$/;
const SAFE_WALLET_AMR = new Set([
  "eip191_eoa_v1",
  "eip1271_eip191_v1",
  "eip6492_eip191_v1"
]);
const FORBIDDEN_CAPTURE_KEY_FRAGMENT = Object.freeze([
  "authorization",
  "cookie",
  "csrf",
  "session",
  "token",
  "jwt",
  "signature",
  "walletaddress",
  "accountaddress",
  "privatekey",
  "seedphrase",
  "mnemonic",
  "databaseurl",
  "connectionstring",
  "password",
  "secret",
  "apikey",
  "requestheader",
  "requestbody",
  "selectedclaims",
  "disclosures",
  "issuer",
  "rawpii"
]);
const FORBIDDEN_CAPTURE_VALUE = Object.freeze([
  /^0x[0-9a-f]{40}$/i,
  /^0x[0-9a-f]{130}$/i,
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
  /-----BEGIN [A-Z0-9 ]+-----/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/i,
  /(?:^|;\s*)(?:session|auth|token|csrf|jwt|cookie)[A-Za-z0-9_.-]*=[^;\s]+/i,
  /^(?:bearer|basic)\s+\S+/i
]);
const HUMAN_CAPTURE_SEQUENCE = Object.freeze([
  ["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"],
  ["human", "pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1"],
  ["human", "pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1"],
  ["human", "pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1"],
  ["human", "pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1"]
]);
const CAPITAL_PARTNER_CAPTURE_SEQUENCE = Object.freeze([
  ["capital_partner", "pilotReadCapitalPartnerSelf", "tenant_capital_partner_self_view.v1"],
  ["capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1"],
  ["capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1"],
  ["human", "pilotAcceptCreditOffer", "problem_details.v1"],
  ["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"],
  ["capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1"],
  ["capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1"],
  ["capital_partner", "pilotTransitionCapitalPartnerOffer", "tenant_capital_partner_offer_transitioned.v1"],
  ["human", "pilotAcceptCreditOffer", "problem_details.v1"],
  ["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"]
]);
const SAFE_FALSE_CAPTURE_KEYS = new Set([
  "rawsignaturepersisted",
  "walletaddressincluded",
  "sessionmaterialincluded"
]);
const CRITICAL_EVENT_TYPES_BY_OPERATION = new Map([
  ["pilotAcceptCreditOffer", new Set([
    "credit_offer_acceptance_recorded",
    "credit_offer_accepted",
    "obligation_created"
  ])],
  ["pilotExecuteSandboxObligation", new Set([
    "ledger_transaction_posted",
    "obligation_sandbox_executed"
  ])],
  ["pilotPostSandboxRepayment", new Set([
    "interest_accrued",
    "ledger_transaction_posted",
    "repayment_posted"
  ])],
  ["pilotAuthorCapitalPartnerOffer", new Set([
    "credit_offer_status_changed",
    "credit_offer_created"
  ])],
  ["pilotTransitionCapitalPartnerOffer", new Set(["credit_offer_status_changed"])]
]);
const RETAINED_HUMAN_ORIGIN_OPERATIONS = new Set([
  "pilotCreateHumanSubject",
  "pilotCreateConsent",
  "pilotRequestCredit",
  "pilotEvaluateCreditApplication"
]);
const DURABLE_HUMAN_PREPARATION_OPERATIONS = new Set([
  "pilotCreateConsent",
  "pilotRequestCredit",
  "pilotEvaluateCreditApplication",
  "pilotCreateCreditPassportArtifact"
]);

export class M1BHumanCapitalPartnerAcceptanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BHumanCapitalPartnerAcceptanceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BHumanCapitalPartnerAcceptanceError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function plainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  return plainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function iso(value, code = "acceptance_time_invalid") {
  const date = value instanceof Date ? value : new Date(value);
  assert(Number.isFinite(date.getTime()), code, "Acceptance time is invalid");
  return date.toISOString();
}

function safeInteger(value, code, message) {
  const converted = Number(value);
  assert(Number.isSafeInteger(converted) && converted >= 0, code, message);
  return converted;
}

function actorRefHash(actorId) {
  return hashId("m1_b_acceptance_actor_reference", { actorId });
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function normalizedCaptureKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assertSafeCaptureString(value) {
  assert(
    !FORBIDDEN_CAPTURE_VALUE.some((pattern) => pattern.test(value)),
    "acceptance_capture_sensitive_value",
    "Response-only capture contains credential, address, signature, or connection material"
  );
}

export function hashM1BAcceptanceManifest(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function minorUnits(value, code, message, { positive = false } = {}) {
  const normalized = String(value);
  assert(MINOR_UNITS.test(normalized), code, message);
  assert(!positive || BigInt(normalized) > 0n, code, message);
  return normalized;
}

function inspectResponseOnlyValue(value, depth = 0) {
  assert(
    depth <= 12,
    "acceptance_capture_too_deep",
    "Response-only capture exceeds the maximum depth"
  );
  if (typeof value === "string") {
    assertSafeCaptureString(value);
    return;
  }
  if (value === null || ["number", "boolean"].includes(typeof value)) {
    return;
  }
  if (Array.isArray(value)) {
    assert(
      value.length <= 256,
      "acceptance_capture_too_large",
      "Response-only capture contains too many array entries"
    );
    value.forEach((entry) => inspectResponseOnlyValue(entry, depth + 1));
    return;
  }
  assert(
    plainObject(value),
    "acceptance_capture_invalid",
    "Response-only capture must contain plain JSON values"
  );
  const keys = Object.keys(value);
  assert(
    keys.length <= 128,
    "acceptance_capture_too_large",
    "Response-only capture contains too many object fields"
  );
  for (const key of keys) {
    const normalizedKey = normalizedCaptureKey(key);
    assert(
      (SAFE_FALSE_CAPTURE_KEYS.has(normalizedKey) && value[key] === false) ||
      !FORBIDDEN_CAPTURE_KEY_FRAGMENT.some((fragment) => normalizedKey.includes(fragment)),
      "acceptance_capture_sensitive_key",
      `Response-only capture contains forbidden field ${key}`
    );
    inspectResponseOnlyValue(value[key], depth + 1);
  }
}

function compactObject(entries) {
  return Object.freeze(Object.fromEntries(
    entries.filter(([, value]) => value !== undefined)
  ));
}

function projectOffer(offer) {
  if (!plainObject(offer)) return undefined;
  return compactObject([
    ["creditOfferId", offer.creditOfferId],
    ["creditOfferHash", offer.creditOfferHash],
    ["termsHash", offer.termsHash],
    ["creditIntentId", offer.creditIntentId],
    ["subjectId", offer.subjectId],
    ["riskDecisionId", offer.riskDecisionId],
    ["capitalPartnerId", offer.capitalPartnerId],
    ["creditPassportArtifactId", offer.creditPassportArtifactId],
    ["creditPassportArtifactHash", offer.creditPassportArtifactHash],
    ["creditPassportArtifactVersion", offer.creditPassportArtifactVersion],
    ["passportVerificationHash", offer.passportVerificationHash],
    ["underwritingSnapshotHash", offer.underwritingSnapshotHash],
    ["status", offer.status],
    ["validUntil", offer.validUntil],
    ["closedAt", offer.closedAt],
    ["sandboxOnly", offer.sandboxOnly],
    ["productionFundsApproved", offer.productionFundsApproved],
    ["schemaVersion", offer.schemaVersion]
  ]);
}

function projectObligation(obligation) {
  if (!plainObject(obligation)) return undefined;
  return compactObject([
    ["obligationId", obligation.obligationId],
    ["obligationHash", obligation.obligationHash],
    ["subjectId", obligation.subjectId],
    ["principalId", obligation.principalId],
    ["creditIntentId", obligation.creditIntentId],
    ["riskDecisionId", obligation.riskDecisionId],
    ["creditOfferId", obligation.creditOfferId],
    ["creditOfferAcceptanceId", obligation.creditOfferAcceptanceId],
    ["authorityType", obligation.authorityType],
    ["authorityId", obligation.authorityId],
    ["assetId", obligation.assetId],
    ["scheduleHash", obligation.scheduleHash],
    ["scheduleSequence", obligation.scheduleSequence],
    ["executionStatus", obligation.executionStatus],
    ["sandboxExecutionReceiptId", obligation.sandboxExecutionReceiptId],
    ["status", obligation.status],
    ["sandboxOnly", obligation.sandboxOnly],
    ["productionFundsMoved", obligation.productionFundsMoved],
    ["withdrawable", obligation.withdrawable],
    ["schemaVersion", obligation.schemaVersion]
  ]);
}

function projectWorkspaceResponse(response) {
  const review = response.humanOfferReview;
  const projectedReview = review === null
    ? null
    : plainObject(review)
      ? compactObject([
          ["subjectId", review.subjectId],
          ["consentId", review.consentId],
          ["creditIntentId", review.creditIntent?.creditIntentId],
          ["riskDecisionId", review.decision?.riskDecisionId],
          ["offer", projectOffer(review.offer)],
          ["offerSchemaVersion", review.offerSchemaVersion],
          ["offerAggregateVersion", review.offerAggregateVersion],
          ["serverTruth", review.serverTruth],
          ["nonAuthorizing", review.nonAuthorizing],
          ["sandboxOnly", review.sandboxOnly],
          ["productionFundsApproved", review.productionFundsApproved],
          ["fundsAuthority", review.fundsAuthority],
          ["schemaVersion", review.schemaVersion]
        ])
      : undefined;
  return compactObject([
    ["workspaceKind", response.workspaceKind],
    ["humanOfferReview", projectedReview],
    ["hasMore", response.hasMore],
    ["serverTruth", response.serverTruth],
    ["schemaVersion", response.schemaVersion]
  ]);
}

function projectAcceptedResponse(response) {
  const acceptance = response.acceptance;
  return compactObject([
    ["acceptance", plainObject(acceptance) ? compactObject([
      ["creditOfferAcceptanceId", acceptance.creditOfferAcceptanceId],
      ["acceptanceHash", acceptance.acceptanceHash],
      ["creditOfferId", acceptance.creditOfferId],
      ["creditOfferHash", acceptance.creditOfferHash],
      ["termsHash", acceptance.termsHash],
      ["creditIntentId", acceptance.creditIntentId],
      ["riskDecisionId", acceptance.riskDecisionId],
      ["subjectId", acceptance.subjectId],
      ["principalId", acceptance.principalId],
      ["authorityType", acceptance.authorityType],
      ["authorityId", acceptance.authorityId],
      ["acknowledgementHash", acceptance.acknowledgementHash],
      ["acceptedAt", acceptance.acceptedAt],
      ["sandboxOnly", acceptance.sandboxOnly],
      ["productionAuthority", acceptance.productionAuthority]
    ]) : undefined],
    ["obligation", projectObligation(response.obligation)],
    ["offerStatus", response.offerStatus],
    ["executionCreated", response.executionCreated],
    ["fundsAuthority", response.fundsAuthority],
    ["schemaVersion", response.schemaVersion]
  ]);
}

function projectExecutionResponse(response) {
  const execution = response.executionReceipt;
  return compactObject([
    ["obligation", projectObligation(response.obligation)],
    ["executionReceipt", plainObject(execution) ? compactObject([
      ["sandboxExecutionReceiptId", execution.sandboxExecutionReceiptId],
      ["receiptHash", execution.receiptHash],
      ["obligationId", execution.obligationId],
      ["assetId", execution.assetId],
      ["amountMinor", execution.amountMinor],
      ["adapterId", execution.adapterId],
      ["adapterVersion", execution.adapterVersion],
      ["adapterKeyId", execution.adapterKeyId],
      ["adapterMessageHash", execution.adapterMessageHash],
      ["executedAt", execution.executedAt],
      ["sandboxOnly", execution.sandboxOnly],
      ["productionFundsMoved", execution.productionFundsMoved],
      ["withdrawable", execution.withdrawable],
      ["schemaVersion", execution.schemaVersion]
    ]) : undefined],
    ["principalLedgerTransactionId", response.principalLedgerTransactionId],
    ["sandboxOnly", response.sandboxOnly],
    ["productionFundsMoved", response.productionFundsMoved],
    ["withdrawable", response.withdrawable],
    ["schemaVersion", response.schemaVersion]
  ]);
}

function projectRepaymentResponse(response) {
  const repayment = response.repayment;
  return compactObject([
    ["obligation", projectObligation(response.obligation)],
    ["repayment", plainObject(repayment) ? compactObject([
      ["repaymentId", repayment.repaymentId],
      ["repaymentHash", repayment.repaymentHash],
      ["obligationId", repayment.obligationId],
      ["subjectId", repayment.subjectId],
      ["ledgerTransactionId", repayment.ledgerTransactionId],
      ["interestLedgerTransactionId", repayment.interestLedgerTransactionId],
      ["occurredAt", repayment.occurredAt],
      ["sandboxOnly", repayment.sandboxOnly],
      ["productionFundsMoved", repayment.productionFundsMoved],
      ["schemaVersion", repayment.schemaVersion]
    ]) : undefined],
    ["sandboxOnly", response.sandboxOnly],
    ["productionFundsMoved", response.productionFundsMoved],
    ["withdrawable", response.withdrawable],
    ["schemaVersion", response.schemaVersion]
  ]);
}

function projectEvidenceResponse(response) {
  const items = Array.isArray(response.items)
    ? response.items.map((item) => compactObject([
        ["evidenceId", item?.evidenceId],
        ["evidenceHash", item?.evidenceHash],
        ["eventType", item?.eventType],
        ["aggregateType", item?.aggregateType],
        ["aggregateId", item?.aggregateId],
        ["aggregateVersion", item?.aggregateVersion],
        ["obligationId", item?.obligationId],
        ["sourceFinality", item?.sourceFinality],
        ["payloadHash", item?.payloadHash],
        ["occurredAt", item?.occurredAt],
        ["recordedAt", item?.recordedAt],
        ["schemaVersion", item?.schemaVersion]
      ]))
    : undefined;
  return compactObject([
    ["obligationId", response.obligationId],
    ["asOf", response.asOf],
    ["items", items === undefined ? undefined : Object.freeze(items)],
    ["hasMore", response.hasMore],
    ["nextCursor", response.nextCursor],
    ["schemaVersion", response.schemaVersion]
  ]);
}

function projectCapitalPartnerResponse(operationId, response) {
  if (operationId === "pilotReadCapitalPartnerSelf") {
    return compactObject([
      ["resource", plainObject(response.resource) ? compactObject([
        ["resourceType", response.resource.resourceType],
        ["resourceId", response.resource.resourceId]
      ]) : undefined],
      ["profile", plainObject(response.profile) ? compactObject([
        ["capitalPartnerId", response.profile.capitalPartnerId]
      ]) : undefined],
      ["fundsAuthority", response.fundsAuthority],
      ["serverTruth", response.serverTruth],
      ["readOnly", response.readOnly],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotReadCapitalPartnerPassportInbox") {
    const items = Array.isArray(response.items) ? response.items.map((item) => compactObject([
      ["resource", plainObject(item?.resource) ? compactObject([
        ["resourceType", item.resource.resourceType],
        ["resourceId", item.resource.resourceId]
      ]) : undefined],
      ["reviewContext", plainObject(item?.reviewContext) ? compactObject([
        ["creditIntentId", item.reviewContext.creditIntentId],
        ["artifactHash", item.reviewContext.artifactHash],
        ["artifactVersion", item.reviewContext.artifactVersion]
      ]) : undefined],
      ["summary", plainObject(item?.summary) ? compactObject([
        ["claimCount", item.summary.claimCount],
        ["purpose", item.summary.purpose],
        ["issuedAt", item.summary.issuedAt],
        ["expiresAt", item.summary.expiresAt]
      ]) : undefined]
    ])) : undefined;
    return compactObject([
      ["items", items === undefined ? undefined : Object.freeze(items)],
      ["count", response.count],
      ["hasMore", response.hasMore],
      ["fundsAuthority", response.fundsAuthority],
      ["serverTruth", response.serverTruth],
      ["readOnly", response.readOnly],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotAuthorCapitalPartnerOffer") {
    return compactObject([
      ["offer", projectOffer(response.offer)],
      ["capitalPartner", plainObject(response.capitalPartner) ? compactObject([
        ["capitalPartnerId", response.capitalPartner.capitalPartnerId]
      ]) : undefined],
      ["fundsAuthority", response.fundsAuthority],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotTransitionCapitalPartnerOffer") {
    return compactObject([
      ["offer", projectOffer(response.offer)],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  return undefined;
}

function projectRetainedHumanOriginResponse(operationId, response) {
  if (operationId === "pilotCreateHumanSubject") {
    return compactObject([
      ["principalId", response.principalId],
      ["subjectId", response.subjectId],
      ["subjectHash", response.subjectHash],
      ["subjectType", response.subjectType],
      ["status", response.status],
      ["prototypeOnly", response.prototypeOnly],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotCreateConsent") {
    return compactObject([
      ["subjectId", response.subjectId],
      ["consent", plainObject(response.consent) ? compactObject([
        ["consentId", response.consent.consentId],
        ["consentHash", response.consent.consentHash],
        ["termsHash", response.consent.termsHash],
        ["dataUsageHash", response.consent.dataUsageHash],
        ["subjectId", response.consent.subjectId],
        ["principalId", response.consent.principalId],
        ["status", response.consent.status],
        ["expiresAt", response.consent.expiresAt],
        ["sandboxOnly", response.consent.sandboxOnly],
        ["productionAuthority", response.consent.productionAuthority],
        ["schemaVersion", response.consent.schemaVersion]
      ]) : undefined],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotRequestCredit") {
    return compactObject([
      ["creditIntent", plainObject(response.creditIntent) ? compactObject([
        ["creditIntentId", response.creditIntent.creditIntentId],
        ["creditIntentHash", response.creditIntent.creditIntentHash],
        ["subjectId", response.creditIntent.subjectId],
        ["principalId", response.creditIntent.principalId],
        ["authorityType", response.creditIntent.authorityType],
        ["authorityRef", response.creditIntent.authorityRef],
        ["status", response.creditIntent.status],
        ["sandboxOnly", response.creditIntent.sandboxOnly],
        ["productionFundsRequested", response.creditIntent.productionFundsRequested],
        ["schemaVersion", response.creditIntent.schemaVersion]
      ]) : undefined],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotEvaluateCreditApplication") {
    return compactObject([
      ["creditIntent", plainObject(response.creditIntent) ? compactObject([
        ["creditIntentId", response.creditIntent.creditIntentId],
        ["creditIntentHash", response.creditIntent.creditIntentHash],
        ["subjectId", response.creditIntent.subjectId],
        ["status", response.creditIntent.status],
        ["schemaVersion", response.creditIntent.schemaVersion]
      ]) : undefined],
      ["decision", plainObject(response.decision) ? compactObject([
        ["riskDecisionId", response.decision.riskDecisionId],
        ["decisionHash", response.decision.decisionHash],
        ["creditIntentId", response.decision.creditIntentId],
        ["status", response.decision.status],
        ["featureSnapshotHash", response.decision.featureSnapshotHash],
        ["decisionPassportHash", response.decision.decisionPassportHash],
        ["sandboxOnly", response.decision.sandboxOnly],
        ["productionAuthority", response.decision.productionAuthority],
        ["schemaVersion", response.decision.schemaVersion]
      ]) : undefined],
      ["offer", projectOffer(response.offer)],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  if (operationId === "pilotCreateCreditPassportArtifact") {
    return compactObject([
      ["artifact", plainObject(response.artifact) ? compactObject([
        ["creditPassportArtifactId", response.artifact.creditPassportArtifactId],
        ["artifactHash", response.artifact.artifactHash],
        ["version", response.artifact.version],
        ["sourceRiskDecisionId", response.artifact.sourceRiskDecisionId],
        ["sourceDecisionHash", response.artifact.sourceDecisionHash],
        ["sourceDecisionPassportHash", response.artifact.sourceDecisionPassportHash],
        ["sourceFeatureSnapshotHash", response.artifact.sourceFeatureSnapshotHash],
        ["subjectId", response.artifact.subjectId],
        ["purpose", response.artifact.purpose],
        ["claimManifestHash", response.artifact.claimManifestHash],
        ["issuedAt", response.artifact.issuedAt],
        ["expiresAt", response.artifact.expiresAt],
        ["status", response.artifact.status],
        ["onlineVerificationRequired", response.artifact.onlineVerificationRequired],
        ["sameTenantOnly", response.artifact.sameTenantOnly],
        ["pointInTime", response.artifact.pointInTime],
        ["nonAuthorizing", response.artifact.nonAuthorizing],
        ["sandboxOnly", response.artifact.sandboxOnly],
        ["productionAuthority", response.artifact.productionAuthority],
        ["piiIncluded", response.artifact.piiIncluded],
        ["rawTransactionDataIncluded", response.artifact.rawTransactionDataIncluded],
        ["scoreAuthoritative", response.artifact.scoreAuthoritative],
        ["schemaVersion", response.artifact.schemaVersion]
      ]) : undefined],
      ["replaced", response.replaced],
      ["schemaVersion", response.schemaVersion]
    ]);
  }
  return undefined;
}

export function projectM1BSafeResponse(operationId, responseSchemaVersion, response) {
  assert(
    plainObject(response) && response.schemaVersion === responseSchemaVersion,
    "acceptance_capture_response_invalid",
    `Captured ${operationId} response does not match ${responseSchemaVersion}`
  );
  let projected;
  if (responseSchemaVersion === "tenant_workspace_resume_view.v2") {
    projected = projectWorkspaceResponse(response);
  } else if (responseSchemaVersion === "tenant_credit_offer_accepted.v1") {
    projected = projectAcceptedResponse(response);
  } else if (responseSchemaVersion === "tenant_sandbox_obligation_executed.v1") {
    projected = projectExecutionResponse(response);
  } else if (responseSchemaVersion === "tenant_sandbox_repayment_posted.v1") {
    projected = projectRepaymentResponse(response);
  } else if (responseSchemaVersion === "tenant_owned_obligation_evidence_view.v1") {
    projected = projectEvidenceResponse(response);
  } else if (responseSchemaVersion === "problem_details.v1") {
    projected = compactObject([
      ["status", response.status],
      ["code", response.code],
      ["requestId", response.requestId],
      ["schemaVersion", response.schemaVersion]
    ]);
  } else if (
    RETAINED_HUMAN_ORIGIN_OPERATIONS.has(operationId) ||
    DURABLE_HUMAN_PREPARATION_OPERATIONS.has(operationId)
  ) {
    projected = projectRetainedHumanOriginResponse(operationId, response);
  } else {
    projected = projectCapitalPartnerResponse(operationId, response);
  }
  assert(
    plainObject(projected),
    "acceptance_capture_response_invalid",
    `Captured ${operationId} response is not an allowlisted acceptance response`
  );
  inspectResponseOnlyValue(projected);
  return projected;
}

export function createM1BQueryResponseProjection(operationId, safeResponse) {
  assert(
    plainObject(safeResponse),
    "acceptance_query_response_invalid",
    `Safe response projection is missing for ${operationId}`
  );
  if (operationId === "pilotReadWorkspaceResume") {
    const review = safeResponse.humanOfferReview;
    const projectedReview = review === null
      ? null
      : plainObject(review) && plainObject(review.offer)
        ? {
            subjectId: review.subjectId,
            consentId: review.consentId,
            creditIntentId: review.creditIntentId,
            riskDecisionId: review.riskDecisionId,
            creditOfferId: review.offer.creditOfferId,
            creditOfferHash: review.offer.creditOfferHash,
            termsHash: review.offer.termsHash,
            offerSchemaVersion: review.offerSchemaVersion,
            offerAggregateVersion: review.offerAggregateVersion,
            offerStatus: review.offer.status,
            recoverySchemaVersion: review.schemaVersion,
            serverTruth: review.serverTruth
          }
        : undefined;
    assert(
      projectedReview === null || plainObject(projectedReview),
      "acceptance_query_response_invalid",
      "Workspace response lacks a closed Human Offer review projection"
    );
    return Object.freeze({
      workspaceKind: safeResponse.workspaceKind,
      humanOfferReview: projectedReview,
      serverTruth: safeResponse.serverTruth,
      schemaVersion: safeResponse.schemaVersion
    });
  }
  if (operationId === "pilotReadCapitalPartnerSelf") {
    return Object.freeze({
      capitalPartnerId: safeResponse.profile?.capitalPartnerId,
      resourceType: safeResponse.resource?.resourceType,
      resourceId: safeResponse.resource?.resourceId,
      fundsAuthority: safeResponse.fundsAuthority,
      serverTruth: safeResponse.serverTruth,
      readOnly: safeResponse.readOnly,
      schemaVersion: safeResponse.schemaVersion
    });
  }
  if (operationId === "pilotReadCapitalPartnerPassportInbox") {
    assert(
      Array.isArray(safeResponse.items),
      "acceptance_query_response_invalid",
      "Capital Partner inbox response items are missing"
    );
    return Object.freeze({
      items: Object.freeze(safeResponse.items.map((item) => Object.freeze({
        artifactId: item.resource?.resourceId,
        artifactHash: item.reviewContext?.artifactHash,
        artifactVersion: item.reviewContext?.artifactVersion,
        creditIntentId: item.reviewContext?.creditIntentId,
        claimCount: item.summary?.claimCount,
        purpose: item.summary?.purpose,
        issuedAt: item.summary?.issuedAt,
        expiresAt: item.summary?.expiresAt
      }))),
      count: safeResponse.count,
      hasMore: safeResponse.hasMore,
      fundsAuthority: safeResponse.fundsAuthority,
      serverTruth: safeResponse.serverTruth,
      readOnly: safeResponse.readOnly,
      schemaVersion: safeResponse.schemaVersion
    });
  }
  if (operationId === "pilotReadOwnObligationEvidence") {
    assert(
      Array.isArray(safeResponse.items),
      "acceptance_query_response_invalid",
      "Human Evidence response items are missing"
    );
    return Object.freeze({
      obligationId: safeResponse.obligationId,
      orderedEvidenceIds: Object.freeze(safeResponse.items.map(({ evidenceId }) => evidenceId)),
      hasMore: safeResponse.hasMore,
      nextCursor: safeResponse.nextCursor ?? null,
      schemaVersion: safeResponse.schemaVersion
    });
  }
  fail(
    "acceptance_query_response_invalid",
    `Operation ${operationId} has no critical query response projection`
  );
}

export function createM1BCommandResponseProjection(operationId, safeResponse) {
  let projection;
  if (operationId === "pilotAcceptCreditOffer") {
    projection = compactObject([
      ["creditOfferAcceptanceId", safeResponse.acceptance?.creditOfferAcceptanceId],
      ["acceptanceHash", safeResponse.acceptance?.acceptanceHash],
      ["creditOfferId", safeResponse.acceptance?.creditOfferId],
      ["creditOfferHash", safeResponse.acceptance?.creditOfferHash],
      ["termsHash", safeResponse.acceptance?.termsHash],
      ["creditIntentId", safeResponse.acceptance?.creditIntentId],
      ["riskDecisionId", safeResponse.acceptance?.riskDecisionId],
      ["subjectId", safeResponse.acceptance?.subjectId],
      ["obligationId", safeResponse.obligation?.obligationId],
      ["obligationHash", safeResponse.obligation?.obligationHash],
      ["obligationStatus", safeResponse.obligation?.status],
      ["executionStatus", safeResponse.obligation?.executionStatus],
      ["offerStatus", safeResponse.offerStatus],
      ["sandboxOnly", safeResponse.obligation?.sandboxOnly],
      ["productionAuthority", safeResponse.acceptance?.productionAuthority],
      ["productionFundsMoved", safeResponse.obligation?.productionFundsMoved],
      ["withdrawable", safeResponse.obligation?.withdrawable],
      ["fundsAuthority", safeResponse.fundsAuthority],
      ["schemaVersion", safeResponse.schemaVersion]
    ]);
  } else if (operationId === "pilotExecuteSandboxObligation") {
    projection = compactObject([
      ["obligationId", safeResponse.obligation?.obligationId],
      ["obligationHash", safeResponse.obligation?.obligationHash],
      ["obligationStatus", safeResponse.obligation?.status],
      ["executionStatus", safeResponse.obligation?.executionStatus],
      ["sandboxExecutionReceiptId", safeResponse.executionReceipt?.sandboxExecutionReceiptId],
      ["executionReceiptHash", safeResponse.executionReceipt?.receiptHash],
      ["assetId", safeResponse.executionReceipt?.assetId],
      ["amountMinor", safeResponse.executionReceipt?.amountMinor],
      ["principalLedgerTransactionId", safeResponse.principalLedgerTransactionId],
      ["sandboxOnly", safeResponse.sandboxOnly],
      ["productionFundsMoved", safeResponse.productionFundsMoved],
      ["withdrawable", safeResponse.withdrawable],
      ["schemaVersion", safeResponse.schemaVersion]
    ]);
  } else if (operationId === "pilotPostSandboxRepayment") {
    projection = compactObject([
      ["obligationId", safeResponse.obligation?.obligationId],
      ["obligationHash", safeResponse.obligation?.obligationHash],
      ["obligationStatus", safeResponse.obligation?.status],
      ["repaymentId", safeResponse.repayment?.repaymentId],
      ["repaymentHash", safeResponse.repayment?.repaymentHash],
      ["ledgerTransactionId", safeResponse.repayment?.ledgerTransactionId],
      ["interestLedgerTransactionId", safeResponse.repayment?.interestLedgerTransactionId ?? null],
      ["sandboxOnly", safeResponse.sandboxOnly],
      ["productionFundsMoved", safeResponse.productionFundsMoved],
      ["withdrawable", safeResponse.withdrawable],
      ["schemaVersion", safeResponse.schemaVersion]
    ]);
  } else if (operationId === "pilotAuthorCapitalPartnerOffer") {
    projection = compactObject([
      ["creditOfferId", safeResponse.offer?.creditOfferId],
      ["creditOfferHash", safeResponse.offer?.creditOfferHash],
      ["termsHash", safeResponse.offer?.termsHash],
      ["creditIntentId", safeResponse.offer?.creditIntentId],
      ["subjectId", safeResponse.offer?.subjectId],
      ["riskDecisionId", safeResponse.offer?.riskDecisionId],
      ["capitalPartnerId", safeResponse.offer?.capitalPartnerId],
      ["creditPassportArtifactId", safeResponse.offer?.creditPassportArtifactId],
      ["creditPassportArtifactHash", safeResponse.offer?.creditPassportArtifactHash],
      ["creditPassportArtifactVersion", safeResponse.offer?.creditPassportArtifactVersion],
      ["status", safeResponse.offer?.status],
      ["offerSchemaVersion", safeResponse.offer?.schemaVersion],
      ["sandboxOnly", safeResponse.offer?.sandboxOnly],
      ["productionFundsApproved", safeResponse.offer?.productionFundsApproved],
      ["responseCapitalPartnerId", safeResponse.capitalPartner?.capitalPartnerId],
      ["fundsAuthority", safeResponse.fundsAuthority],
      ["schemaVersion", safeResponse.schemaVersion]
    ]);
  } else if (operationId === "pilotTransitionCapitalPartnerOffer") {
    projection = compactObject([
      ["creditOfferId", safeResponse.offer?.creditOfferId],
      ["creditOfferHash", safeResponse.offer?.creditOfferHash],
      ["termsHash", safeResponse.offer?.termsHash],
      ["creditIntentId", safeResponse.offer?.creditIntentId],
      ["subjectId", safeResponse.offer?.subjectId],
      ["riskDecisionId", safeResponse.offer?.riskDecisionId],
      ["capitalPartnerId", safeResponse.offer?.capitalPartnerId],
      ["status", safeResponse.offer?.status],
      ["offerSchemaVersion", safeResponse.offer?.schemaVersion],
      ["closedAt", safeResponse.offer?.closedAt],
      ["sandboxOnly", safeResponse.offer?.sandboxOnly],
      ["productionFundsApproved", safeResponse.offer?.productionFundsApproved],
      ["schemaVersion", safeResponse.schemaVersion]
    ]);
  } else if (
    RETAINED_HUMAN_ORIGIN_OPERATIONS.has(operationId) ||
    DURABLE_HUMAN_PREPARATION_OPERATIONS.has(operationId)
  ) {
    projection = structuredClone(safeResponse);
  }
  assert(
    plainObject(projection) && Object.keys(projection).length >= 1,
    "acceptance_command_response_invalid",
    `Operation ${operationId} has no critical command response projection`
  );
  inspectResponseOnlyValue(projection);
  return projection;
}

export function inspectM1BResponseOnlyOperation({
  operationId,
  responseSchemaVersion,
  response
}) {
  assert(
    IDENTIFIER.test(operationId ?? "") &&
      IDENTIFIER.test(responseSchemaVersion ?? "") &&
      plainObject(response),
    "acceptance_capture_response_invalid",
    "Response-only operation input is invalid"
  );
  inspectResponseOnlyValue(response);
  return Object.freeze({
    rawResponseHash: hashId("command_response", response),
    response: projectM1BSafeResponse(
      operationId,
      responseSchemaVersion,
      response
    )
  });
}

export function assertM1BResponseOnlyCapture(capture, { role }) {
  const schemaVersion = role === "human"
    ? "m1_b_human_response_capture.v1"
    : role === "capital_partner"
      ? "m1_b_capital_partner_response_capture.v1"
      : undefined;
  const sequence = role === "human"
    ? HUMAN_CAPTURE_SEQUENCE
    : role === "capital_partner"
      ? CAPITAL_PARTNER_CAPTURE_SEQUENCE
      : undefined;
  assert(
    schemaVersion &&
    exactKeys(capture, [
      "schemaVersion",
      "candidateReleaseId",
      "capturedAt",
      "databaseStartedAt",
      "role",
      "responses"
    ]) &&
    capture.schemaVersion === schemaVersion &&
    EXACT_SHA.test(capture.candidateReleaseId ?? "") &&
    capture.role === role &&
    Number.isFinite(Date.parse(capture.capturedAt ?? "")) &&
    Number.isFinite(Date.parse(capture.databaseStartedAt ?? "")) &&
    Date.parse(capture.capturedAt) >= Date.parse(capture.databaseStartedAt) &&
    Array.isArray(capture.responses) &&
    capture.responses.length === sequence?.length,
    "acceptance_capture_invalid",
    "Response-only capture has an invalid release, role, time, or operation envelope"
  );
  const encoded = Buffer.byteLength(JSON.stringify(capture), "utf8");
  assert(
    encoded <= 256 * 1024,
    "acceptance_capture_too_large",
    "Response-only capture exceeds 256 KiB"
  );
  let previousCapturedAt = Date.parse(capture.databaseStartedAt);
  const safeResponses = capture.responses.map((entry, index) => {
    const [actorRole, operationId, responseSchemaVersion] = sequence[index];
    const denialResponse = responseSchemaVersion === "problem_details.v1";
    assert(
      exactKeys(entry, denialResponse ? [
        "sequence",
        "actorRole",
        "operationId",
        "requestId",
        "correlationId",
        "responseSchemaVersion",
        "capturedAt",
        "requestProjection",
        "requestProjectionHash",
        "response"
      ] : [
        "sequence",
        "actorRole",
        "operationId",
        "requestId",
        "correlationId",
        "responseSchemaVersion",
        "capturedAt",
        "response"
      ]) &&
      entry.sequence === index + 1 &&
      entry.actorRole === actorRole &&
      entry.operationId === operationId &&
      REQUEST_IDENTIFIER.test(entry.requestId ?? "") &&
      REQUEST_IDENTIFIER.test(entry.correlationId ?? "") &&
      entry.responseSchemaVersion === responseSchemaVersion &&
      Number.isFinite(Date.parse(entry.capturedAt ?? "")) &&
      Date.parse(entry.capturedAt) >= Date.parse(capture.databaseStartedAt) &&
      Date.parse(entry.capturedAt) > previousCapturedAt &&
      Date.parse(entry.capturedAt) <= Date.parse(capture.capturedAt) &&
      plainObject(entry.response),
      "acceptance_capture_invalid",
      `Response-only capture entry ${index + 1} is invalid`
    );
    if (denialResponse) {
      try {
        assertTenantProtocolRequest(entry.requestProjection);
      } catch {
        fail(
          "acceptance_capture_invalid",
          `Response-only denial request ${index + 1} violates the protocol contract`
        );
      }
      assert(
        entry.requestProjection.operationId === operationId &&
          entry.requestProjection.requestId === entry.requestId &&
          entry.requestProjection.correlationId === entry.correlationId &&
          entry.requestProjection.resource?.resourceType === "credit_offer" &&
          entry.requestProjection.payload?.actionConfirmation?.confirmationMethod ===
            "wallet_personal_sign" &&
          entry.requestProjection.payload.actionConfirmation.rawSignaturePersisted === false &&
          entry.requestProjection.payload.actionConfirmation.blockchainTransactionSubmitted === false &&
          entry.requestProjectionHash ===
            hashM1BAcceptanceManifest(entry.requestProjection),
        "acceptance_capture_invalid",
        `Response-only denial request ${index + 1} is not the exact wallet-confirmed request`
      );
      inspectResponseOnlyValue(entry.requestProjection);
    }
    previousCapturedAt = Date.parse(entry.capturedAt);
    const inspected = inspectM1BResponseOnlyOperation({
      operationId,
      responseSchemaVersion,
      response: entry.response
    });
    return Object.freeze({
      ...structuredClone(entry),
      rawResponseHash: inspected.rawResponseHash,
      response: inspected.response
    });
  });
  return Object.freeze({
    ...structuredClone(capture),
    responses: Object.freeze(safeResponses)
  });
}

function assertEventIntegrity(row, requestId, correlationId, expectedSequence) {
  assert(
    safeInteger(
      row.sequence,
      "acceptance_command_event_invalid",
      "Command event sequence is invalid"
    ) === expectedSequence &&
    row.event_id === row.evidence_id &&
    row.aggregate_type === row.domain_aggregate_type &&
    row.aggregate_id === row.domain_aggregate_id &&
    Number(row.aggregate_version) === Number(row.domain_aggregate_version) &&
    row.event_type === row.evidence_event_type &&
    row.aggregate_type === row.evidence_aggregate_type &&
    row.aggregate_id === row.evidence_aggregate_id &&
    Number(row.aggregate_version) === Number(row.evidence_aggregate_version) &&
    row.payload_hash === row.evidence_payload_hash &&
    row.payload_hash === hashId("event_payload", row.payload) &&
    row.source_finality === row.evidence_source_finality &&
    row.causation_id === requestId &&
    row.correlation_id === correlationId &&
    IDENTIFIER.test(row.event_id ?? "") &&
    HASH.test(row.payload_hash ?? "") &&
    HASH.test(row.evidence_hash ?? ""),
    "acceptance_command_event_invalid",
    "Command event, Evidence, causation, or ordering integrity is invalid"
  );
}

export async function readM1BCommandProof(client, {
  tenantId,
  actorId,
  operationId,
  requestId,
  correlationId,
  resourceType,
  resourceId,
  responseSchemaVersion,
  response,
  safeResponse,
  capturedRawResponseHash,
  capturedAt
}) {
  assert(
    (response === undefined) !== (safeResponse === undefined),
    "acceptance_command_response_invalid",
    `Exactly one raw or already-allowlisted response is required for ${operationId}`
  );
  const allowlistedResponse = response === undefined
    ? structuredClone(safeResponse)
    : projectM1BSafeResponse(operationId, responseSchemaVersion, response);
  inspectResponseOnlyValue(allowlistedResponse);
  const safeResponseProjection = createM1BCommandResponseProjection(
    operationId,
    allowlistedResponse
  );
  const capturedAtIso = iso(capturedAt);
  assert(
    HASH.test(capturedRawResponseHash ?? ""),
    "acceptance_command_response_hash_invalid",
    `Captured raw response hash is invalid for ${operationId}`
  );
  const command = await client.query(
    `SELECT a.id AS audit_event_id, a.occurred_at, a.request_id,
            a.correlation_id, a.actor_id, a.operation_id, a.resource_type,
            a.resource_id, a.authorization_decision,
            a.authorization_decision_id, a.command_payload_hash,
            a.command_hash AS audit_command_hash, a.policy_version,
            a.reason_code, t.idempotency_key, t.command_payload_hash AS
            execution_payload_hash, t.command_hash AS execution_command_hash,
            t.operation_id AS execution_operation_id,
            t.actor_id AS execution_actor_id,
            t.response_hash AS execution_response_hash, t.business_event_id,
            t.completed_at, c.command_hash AS persisted_command_hash,
            c.response_hash AS persisted_response_hash, c.status,
            c.event_id AS persisted_first_event_id
       FROM authorization_audit_events a
       JOIN tenant_command_executions t
         ON t.tenant_id = a.tenant_id
        AND t.authorization_decision_id = a.authorization_decision_id
       JOIN command_idempotency c
         ON c.tenant_id = t.tenant_id
        AND c.idempotency_key = t.idempotency_key
      WHERE a.tenant_id = $1 AND a.actor_id = $2
        AND a.operation_id = $3 AND a.request_id = $4
        AND a.correlation_id = $5 AND a.resource_type = $6
        AND a.resource_id = $7`,
    [tenantId, actorId, operationId, requestId, correlationId, resourceType, resourceId]
  );
  assert(
    command.rowCount === 1,
    "acceptance_command_ambiguous",
    `Exactly one durable command execution is required for ${operationId}`
  );
  const row = command.rows[0];
  assert(
    row.authorization_decision === "allow" &&
    row.reason_code === "authorization_allowed" &&
    row.audit_command_hash === row.execution_command_hash &&
    row.audit_command_hash === row.persisted_command_hash &&
    row.command_payload_hash === row.execution_payload_hash &&
    row.execution_operation_id === operationId &&
    row.execution_actor_id === actorId &&
    row.execution_response_hash === row.persisted_response_hash &&
    row.execution_response_hash === capturedRawResponseHash &&
    row.status === "completed" &&
    row.business_event_id === row.persisted_first_event_id &&
    Date.parse(capturedAtIso) >= Date.parse(iso(row.completed_at)),
    "acceptance_command_integrity_invalid",
    `Durable command hashes or authorization are invalid for ${operationId}`
  );
  const events = await client.query(
    `SELECT ce.sequence, ce.event_id, ce.aggregate_type, ce.aggregate_id,
            ce.aggregate_version, d.event_type,
            d.aggregate_type AS domain_aggregate_type,
            d.aggregate_id AS domain_aggregate_id,
            d.aggregate_version AS domain_aggregate_version, d.payload_hash,
            d.payload, d.source_finality, d.occurred_at, e.id AS evidence_id,
            e.event_type AS evidence_event_type,
            e.aggregate_type AS evidence_aggregate_type,
            e.aggregate_id AS evidence_aggregate_id,
            e.aggregate_version AS evidence_aggregate_version,
            e.payload_hash AS evidence_payload_hash,
            e.evidence_hash, e.source_finality AS evidence_source_finality,
            e.causation_id, e.correlation_id
       FROM command_events ce
       JOIN domain_events d
         ON d.tenant_id = ce.tenant_id AND d.id = ce.event_id
       JOIN evidence_envelopes e
         ON e.tenant_id = ce.tenant_id AND e.id = ce.event_id
      WHERE ce.tenant_id = $1 AND ce.idempotency_key = $2
      ORDER BY ce.sequence`,
    [tenantId, row.idempotency_key]
  );
  assert(
    events.rowCount >= 1,
    "acceptance_command_events_missing",
    `Complete command events are required for ${operationId}`
  );
  const eventManifest = events.rows.map((event, index) => {
    assertEventIntegrity(event, requestId, correlationId, index);
    const includePayload = CRITICAL_EVENT_TYPES_BY_OPERATION
      .get(operationId)?.has(event.event_type) === true;
    if (includePayload) inspectResponseOnlyValue(event.payload);
    return Object.freeze({
      sequence: index,
      eventId: event.event_id,
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      aggregateVersion: Number(event.aggregate_version),
      payloadHash: event.payload_hash,
      evidenceId: event.evidence_id,
      evidenceHash: event.evidence_hash,
      evidencePayloadHash: event.evidence_payload_hash,
      ...(includePayload
        ? { payloadProjection: Object.freeze(structuredClone(event.payload)) }
        : {}),
      sourceFinality: event.source_finality,
      causationId: event.causation_id,
      correlationId: event.correlation_id,
      occurredAt: iso(event.occurred_at)
    });
  });
  assert(
    eventManifest[0].eventId === row.business_event_id,
    "acceptance_command_first_event_invalid",
    `Command first-event linkage is invalid for ${operationId}`
  );
  const auditSet = await client.query(
    `SELECT id, occurred_at, request_id, correlation_id, actor_id,
            operation_id, resource_type, resource_id,
            authorization_decision, authorization_decision_id,
            command_payload_hash, command_hash, policy_version, reason_code
       FROM authorization_audit_events
      WHERE tenant_id = $1 AND actor_id = $2 AND operation_id = $3
        AND request_id = $4 AND correlation_id = $5
        AND resource_type = $6 AND resource_id = $7
        AND authorization_decision = 'allow'
      ORDER BY id`,
    [tenantId, actorId, operationId, requestId, correlationId, resourceType, resourceId]
  );
  assert(
    auditSet.rowCount === 2,
    "acceptance_command_audit_set_invalid",
    `Exactly two allow authorization audits are required for ${operationId}`
  );
  const authorizationAudits = auditSet.rows.map((audit) => {
    assert(
      audit.request_id === requestId &&
      audit.correlation_id === correlationId &&
      audit.actor_id === actorId &&
      audit.operation_id === operationId &&
      audit.resource_type === resourceType &&
      audit.resource_id === resourceId &&
      audit.authorization_decision === "allow" &&
      audit.reason_code === "authorization_allowed" &&
      audit.command_payload_hash === row.command_payload_hash &&
      audit.command_hash === row.audit_command_hash &&
      IDENTIFIER.test(audit.id ?? "") &&
      IDENTIFIER.test(audit.authorization_decision_id ?? "") &&
      Number.isFinite(Date.parse(audit.occurred_at ?? "")),
      "acceptance_command_audit_set_invalid",
      `Command authorization audit set is invalid for ${operationId}`
    );
    return Object.freeze({
      eventId: audit.id,
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      authorizationDecision: "allow",
      authorizationDecisionId: audit.authorization_decision_id,
      actorRefHash: actorRefHash(actorId),
      policyVersion: audit.policy_version,
      reasonCode: audit.reason_code,
      occurredAt: iso(audit.occurred_at)
    });
  });
  assert(
    new Set(authorizationAudits.map(({ eventId }) => eventId)).size === 2 &&
    new Set(authorizationAudits.map(({ authorizationDecisionId }) =>
      authorizationDecisionId
    )).size === 2 &&
    authorizationAudits.some((audit) => (
      audit.eventId === row.audit_event_id &&
      audit.authorizationDecisionId === row.authorization_decision_id
    )),
    "acceptance_command_audit_set_invalid",
    `Command final authorization decision is not in the exact audit set for ${operationId}`
  );
  return Object.freeze({
    operationId,
    requestId,
    correlationId,
    resourceType,
    resourceId,
    authorizationAuditEventId: row.audit_event_id,
    authorizationDecisionId: row.authorization_decision_id,
    authorizationDecision: "allow",
    actorRefHash: actorRefHash(actorId),
    policyVersion: row.policy_version,
    authorizationReasonCode: row.reason_code,
    authorizationAudits: Object.freeze(authorizationAudits),
    commandHash: row.audit_command_hash,
    responseHash: row.execution_response_hash,
    responseSchemaVersion,
    responseProjection: safeResponseProjection,
    capturedResponseHashVerified: true,
    capturedAt: capturedAtIso,
    businessEventId: row.business_event_id,
    occurredAt: iso(row.occurred_at),
    completedAt: iso(row.completed_at),
    eventManifest: Object.freeze(eventManifest)
  });
}

export async function readM1BRetainedCommandProof(client, options) {
  assert(
    RETAINED_HUMAN_ORIGIN_OPERATIONS.has(options?.operationId),
    "acceptance_retained_command_invalid",
    "Only the closed retained Human origin command set may use durable response recovery"
  );
  const persisted = await client.query(
    `SELECT c.response_json, c.response_hash, t.completed_at
       FROM authorization_audit_events a
       JOIN tenant_command_executions t
         ON t.tenant_id = a.tenant_id
        AND t.authorization_decision_id = a.authorization_decision_id
       JOIN command_idempotency c
         ON c.tenant_id = t.tenant_id
        AND c.idempotency_key = t.idempotency_key
      WHERE a.tenant_id = $1 AND a.actor_id = $2
        AND a.operation_id = $3 AND a.request_id = $4
        AND a.correlation_id = $5 AND a.resource_type = $6
        AND a.resource_id = $7`,
    [
      options.tenantId,
      options.actorId,
      options.operationId,
      options.requestId,
      options.correlationId,
      options.resourceType,
      options.resourceId
    ]
  );
  assert(
    persisted.rowCount === 1 &&
      plainObject(persisted.rows[0].response_json) &&
      HASH.test(persisted.rows[0].response_hash ?? "") &&
      persisted.rows[0].response_hash ===
        hashId("command_response", persisted.rows[0].response_json),
    "acceptance_retained_command_invalid",
    `Retained command response is unavailable or inconsistent for ${options.operationId}`
  );
  inspectResponseOnlyValue(
    projectM1BSafeResponse(
      options.operationId,
      options.responseSchemaVersion,
      persisted.rows[0].response_json
    )
  );
  return readM1BCommandProof(client, {
    ...options,
    response: persisted.rows[0].response_json,
    capturedRawResponseHash: persisted.rows[0].response_hash,
    capturedAt: iso(persisted.rows[0].completed_at)
  });
}

export async function readM1BDurablePreparationCommandProof(client, options) {
  assert(
    DURABLE_HUMAN_PREPARATION_OPERATIONS.has(options?.operationId),
    "acceptance_preparation_command_invalid",
    "Only the closed Human preparation command set may recover durable responses"
  );
  const persisted = await client.query(
    `SELECT c.response_json, c.response_hash, t.completed_at
       FROM authorization_audit_events a
       JOIN tenant_command_executions t
         ON t.tenant_id = a.tenant_id
        AND t.authorization_decision_id = a.authorization_decision_id
       JOIN command_idempotency c
         ON c.tenant_id = t.tenant_id
        AND c.idempotency_key = t.idempotency_key
      WHERE a.tenant_id = $1 AND a.actor_id = $2
        AND a.operation_id = $3 AND a.request_id = $4
        AND a.correlation_id = $5 AND a.resource_type = $6
        AND a.resource_id = $7`,
    [
      options.tenantId,
      options.actorId,
      options.operationId,
      options.requestId,
      options.correlationId,
      options.resourceType,
      options.resourceId
    ]
  );
  assert(
    persisted.rowCount === 1 &&
      plainObject(persisted.rows[0].response_json) &&
      HASH.test(persisted.rows[0].response_hash ?? "") &&
      persisted.rows[0].response_hash ===
        hashId("command_response", persisted.rows[0].response_json),
    "acceptance_preparation_command_invalid",
    `Durable preparation response is unavailable or inconsistent for ${options.operationId}`
  );
  const safeResponse = projectM1BSafeResponse(
    options.operationId,
    options.responseSchemaVersion,
    persisted.rows[0].response_json
  );
  inspectResponseOnlyValue(safeResponse);
  const proof = await readM1BCommandProof(client, {
    ...options,
    safeResponse,
    capturedRawResponseHash: persisted.rows[0].response_hash,
    capturedAt: iso(persisted.rows[0].completed_at)
  });
  return Object.freeze({
    ...proof,
    responseProvenance: "durable_postgresql_response_recovery",
    capturedResponseHashVerified: false
  });
}

export async function readM1BCommandLocator(client, {
  tenantId,
  actorId,
  operationId,
  aggregateType,
  aggregateId
}) {
  const result = await client.query(
    `SELECT DISTINCT a.request_id, a.correlation_id,
            a.resource_type, a.resource_id
       FROM command_events ce
       JOIN tenant_command_executions t
         ON t.tenant_id = ce.tenant_id
        AND t.idempotency_key = ce.idempotency_key
       JOIN authorization_audit_events a
         ON a.tenant_id = t.tenant_id
        AND a.authorization_decision_id = t.authorization_decision_id
      WHERE ce.tenant_id = $1 AND t.actor_id = $2
        AND t.operation_id = $3 AND ce.aggregate_type = $4
        AND ce.aggregate_id = $5 AND a.authorization_decision = 'allow'`,
    [tenantId, actorId, operationId, aggregateType, aggregateId]
  );
  assert(
    result.rowCount === 1 &&
      REQUEST_IDENTIFIER.test(result.rows[0].request_id ?? "") &&
      REQUEST_IDENTIFIER.test(result.rows[0].correlation_id ?? "") &&
      IDENTIFIER.test(result.rows[0].resource_type ?? "") &&
      IDENTIFIER.test(result.rows[0].resource_id ?? ""),
    "acceptance_command_locator_ambiguous",
    `Exactly one retained command is required for ${operationId}/${aggregateId}`
  );
  return Object.freeze({
    requestId: result.rows[0].request_id,
    correlationId: result.rows[0].correlation_id,
    resourceType: result.rows[0].resource_type,
    resourceId: result.rows[0].resource_id
  });
}

export async function readM1BAuthorizationResourceLocator(client, {
  tenantId,
  actorId,
  operationId,
  requestId,
  correlationId,
  authorizationDecision = "allow"
}) {
  const result = await client.query(
    `SELECT DISTINCT resource_type, resource_id
       FROM authorization_audit_events
      WHERE tenant_id = $1 AND actor_id = $2 AND operation_id = $3
        AND request_id = $4 AND correlation_id = $5
        AND authorization_decision = $6`,
    [tenantId, actorId, operationId, requestId, correlationId, authorizationDecision]
  );
  assert(
    result.rowCount === 1 &&
      IDENTIFIER.test(result.rows[0].resource_type ?? "") &&
      IDENTIFIER.test(result.rows[0].resource_id ?? ""),
    "acceptance_authorization_resource_ambiguous",
    `Exactly one authorization resource is required for ${operationId}/${requestId}`
  );
  return Object.freeze({
    resourceType: result.rows[0].resource_type,
    resourceId: result.rows[0].resource_id
  });
}

export async function readM1BQueryProof(client, {
  tenantId,
  actorId,
  operationId,
  requestId,
  correlationId,
  resourceType,
  resourceId,
  responseSchemaVersion,
  response,
  capturedAt
}) {
  const safeResponse = projectM1BSafeResponse(
    operationId,
    responseSchemaVersion,
    response
  );
  const responseProjection = createM1BQueryResponseProjection(operationId, safeResponse);
  const audits = await client.query(
    `SELECT id, occurred_at, request_id, correlation_id, actor_id,
            operation_id, resource_type, resource_id,
            authorization_decision, authorization_decision_id,
            policy_version, reason_code
       FROM authorization_audit_events
      WHERE tenant_id = $1 AND actor_id = $2 AND operation_id = $3
        AND request_id = $4 AND correlation_id = $5
        AND resource_type = $6 AND resource_id = $7
      ORDER BY id`,
    [tenantId, actorId, operationId, requestId, correlationId, resourceType, resourceId]
  );
  assert(
    audits.rowCount === 2,
    "acceptance_query_audit_set_invalid",
    `Exactly two allow authorization audits are required for ${operationId}`
  );
  const decisionIds = new Set();
  const authorizationAudits = audits.rows.map((row) => {
    assert(
      row.authorization_decision === "allow" &&
      row.reason_code === "authorization_allowed" &&
      IDENTIFIER.test(row.authorization_decision_id ?? "") &&
      iso(row.occurred_at) <= iso(capturedAt),
      "acceptance_query_audit_invalid",
      `Query authorization audit is invalid for ${operationId}`
    );
    decisionIds.add(row.authorization_decision_id);
    return Object.freeze({
      eventId: row.id,
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      authorizationDecision: "allow",
      authorizationDecisionId: row.authorization_decision_id,
      actorRefHash: actorRefHash(actorId),
      policyVersion: row.policy_version,
      reasonCode: row.reason_code,
      occurredAt: iso(row.occurred_at)
    });
  });
  assert(
    decisionIds.size === 2,
    "acceptance_query_audit_set_invalid",
    `Query authorization decisions are not distinct for ${operationId}`
  );
  return Object.freeze({
    operationId,
    requestId,
    correlationId,
    responseSchemaVersion,
    responseProvenance: "runtime_response_capture_db_reconciled",
    responseProjection,
    responseHash: hashM1BAcceptanceManifest(responseProjection),
    occurredAt: iso(capturedAt),
    authorizationAudits: Object.freeze(authorizationAudits)
  });
}

export async function readM1BQueryAuthorizationObservation(client, {
  tenantId,
  actorId,
  operationId,
  correlationId,
  resourceType,
  resourceId,
  notBefore,
  notAfter
}) {
  const lowerBound = iso(notBefore);
  const upperBound = iso(notAfter);
  assert(
    Date.parse(lowerBound) < Date.parse(upperBound),
    "acceptance_query_observation_window_invalid",
    `Query observation window is invalid for ${operationId}`
  );
  const audits = await client.query(
    `SELECT id, occurred_at, request_id, correlation_id, actor_id,
            operation_id, resource_type, resource_id,
            authorization_decision, authorization_decision_id,
            policy_version, reason_code
       FROM authorization_audit_events
      WHERE tenant_id = $1 AND actor_id = $2 AND operation_id = $3
        AND correlation_id = $4 AND resource_type = $5 AND resource_id = $6
        AND occurred_at > $7 AND occurred_at <= $8
      ORDER BY id`,
    [
      tenantId,
      actorId,
      operationId,
      correlationId,
      resourceType,
      resourceId,
      lowerBound,
      upperBound
    ]
  );
  assert(
    audits.rowCount === 2 &&
      new Set(audits.rows.map(({ request_id: requestId }) => requestId)).size === 1 &&
      new Set(audits.rows.map(({ authorization_decision_id: decisionId }) =>
        decisionId
      )).size === 2,
    "acceptance_query_observation_ambiguous",
    `Exactly one two-allow audit set is required for ${operationId}`
  );
  const requestId = audits.rows[0].request_id;
  const authorizationAudits = audits.rows.map((row) => {
    assert(
      REQUEST_IDENTIFIER.test(row.request_id ?? "") &&
        row.correlation_id === correlationId &&
        row.actor_id === actorId &&
        row.operation_id === operationId &&
        row.resource_type === resourceType &&
        row.resource_id === resourceId &&
        row.authorization_decision === "allow" &&
        row.reason_code === "authorization_allowed" &&
        IDENTIFIER.test(row.authorization_decision_id ?? "") &&
        Date.parse(iso(row.occurred_at)) > Date.parse(lowerBound) &&
        Date.parse(iso(row.occurred_at)) <= Date.parse(upperBound),
      "acceptance_query_observation_invalid",
      `Query authorization observation is invalid for ${operationId}`
    );
    return Object.freeze({
      eventId: row.id,
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      authorizationDecision: "allow",
      authorizationDecisionId: row.authorization_decision_id,
      actorRefHash: actorRefHash(actorId),
      policyVersion: row.policy_version,
      reasonCode: row.reason_code,
      occurredAt: iso(row.occurred_at)
    });
  });
  return Object.freeze({
    operationId,
    requestId,
    correlationId,
    resourceType,
    resourceId,
    responseDurability: "not_persisted_query_authorization_only",
    occurredAt: authorizationAudits
      .map(({ occurredAt }) => occurredAt)
      .sort()
      .at(-1),
    authorizationAudits: Object.freeze(authorizationAudits)
  });
}

export async function readM1BProjectionProof(client, {
  tenantId,
  entityType,
  entityId,
  sourceEventId
}) {
  const values = [tenantId, entityType, entityId];
  const sourceClause = sourceEventId === undefined
    ? "AND r.last_event_id = s.source_event_id"
    : "AND s.source_event_id = $4";
  if (sourceEventId !== undefined) values.push(sourceEventId);
  const result = await client.query(
    `SELECT s.entity_type, s.entity_id, s.entity_hash,
            s.root_aggregate_type, s.root_aggregate_id,
            s.aggregate_version, s.source_event_id, s.payload,
            r.last_event_id, r.entity_hash AS registry_entity_hash,
            d.event_type, d.aggregate_type, d.aggregate_id,
            d.aggregate_version AS event_aggregate_version,
            d.payload_hash, d.source_finality,
            d.payload AS event_payload,
            e.id AS evidence_id, e.evidence_hash,
            e.event_type AS evidence_event_type,
            e.aggregate_type AS evidence_aggregate_type,
            e.aggregate_id AS evidence_aggregate_id,
            e.aggregate_version AS evidence_aggregate_version,
            e.payload_hash AS evidence_payload_hash,
            e.source_finality AS evidence_source_finality
       FROM projection_snapshots s
       JOIN domain_events d
         ON d.tenant_id = s.tenant_id AND d.id = s.source_event_id
       JOIN evidence_envelopes e
         ON e.tenant_id = s.tenant_id AND e.id = s.source_event_id
       LEFT JOIN projection_registry r
         ON r.tenant_id = s.tenant_id
        AND r.entity_type = s.entity_type AND r.entity_id = s.entity_id
      WHERE s.tenant_id = $1 AND s.entity_type = $2 AND s.entity_id = $3
        ${sourceClause}
      ORDER BY s.write_sequence DESC
      LIMIT 2`,
    values
  );
  assert(
    result.rowCount === 1,
    "acceptance_projection_ambiguous",
    `Exactly one projection snapshot is required for ${entityType}/${entityId}`
  );
  const row = result.rows[0];
  const aggregateVersion = safeInteger(
    row.aggregate_version,
    "acceptance_projection_invalid",
    "Projection aggregate version is invalid"
  );
  assert(
    aggregateVersion >= 1 &&
    row.entity_hash === createCoreProjectionHash(entityType, row.payload) &&
    (sourceEventId !== undefined || row.registry_entity_hash === row.entity_hash) &&
    row.source_event_id === row.evidence_id &&
    row.root_aggregate_type === row.aggregate_type &&
    row.root_aggregate_id === row.aggregate_id &&
    Number(row.event_aggregate_version) === aggregateVersion &&
    row.event_type === row.evidence_event_type &&
    row.aggregate_type === row.evidence_aggregate_type &&
    row.aggregate_id === row.evidence_aggregate_id &&
    Number(row.event_aggregate_version) === Number(row.evidence_aggregate_version) &&
    row.payload_hash === hashId("event_payload", row.event_payload) &&
    row.payload_hash === row.evidence_payload_hash &&
    row.source_finality === row.evidence_source_finality &&
    HASH.test(row.evidence_hash ?? ""),
    "acceptance_projection_invalid",
    `Projection, event, and Evidence integrity is invalid for ${entityType}/${entityId}`
  );
  return Object.freeze({
    entityType,
    entityId,
    entityHash: row.entity_hash,
    rootAggregateType: row.root_aggregate_type,
    rootAggregateId: row.root_aggregate_id,
    aggregateVersion,
    sourceEventId: row.source_event_id,
    sourceEvidenceHash: row.evidence_hash,
    sourceFinality: row.source_finality
  });
}

export async function readM1BProjectionSourceEventId(client, {
  tenantId,
  entityType,
  entityId,
  aggregateVersion
}) {
  const result = await client.query(
    `SELECT source_event_id
       FROM projection_snapshots
      WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
        AND aggregate_version = $4
      ORDER BY write_sequence DESC
      LIMIT 2`,
    [tenantId, entityType, entityId, aggregateVersion]
  );
  assert(
    result.rowCount === 1 && IDENTIFIER.test(result.rows[0].source_event_id ?? ""),
    "acceptance_projection_source_ambiguous",
    `Exactly one historic projection source is required for ${entityType}/${entityId}@${aggregateVersion}`
  );
  return result.rows[0].source_event_id;
}

export async function readM1BDurableEvent(client, { tenantId, eventId }) {
  const result = await client.query(
    `SELECT d.id, d.event_type, d.aggregate_type, d.aggregate_id,
            d.aggregate_version, d.payload_hash, d.source_finality,
            d.occurred_at, e.id AS evidence_id, e.evidence_hash,
            e.payload_hash AS evidence_payload_hash,
            e.source_finality AS evidence_source_finality,
            e.causation_id, e.correlation_id
       FROM domain_events d
       JOIN evidence_envelopes e
         ON e.tenant_id = d.tenant_id AND e.id = d.id
      WHERE d.tenant_id = $1 AND d.id = $2`,
    [tenantId, eventId]
  );
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row.id === row.evidence_id &&
      row.payload_hash === row.evidence_payload_hash &&
      row.source_finality === row.evidence_source_finality &&
      row.source_finality === "finalized" &&
      IDENTIFIER.test(row.event_type ?? "") &&
      IDENTIFIER.test(row.aggregate_type ?? "") &&
      IDENTIFIER.test(row.aggregate_id ?? "") &&
      Number(row.aggregate_version) >= 1 &&
      HASH.test(row.payload_hash ?? "") &&
      HASH.test(row.evidence_hash ?? ""),
    "acceptance_durable_event_invalid",
    `Durable Event/Evidence integrity is invalid for ${eventId}`
  );
  return Object.freeze({
    sequence: 0,
    eventId: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: Number(row.aggregate_version),
    payloadHash: row.payload_hash,
    evidenceId: row.evidence_id,
    evidenceHash: row.evidence_hash,
    evidencePayloadHash: row.evidence_payload_hash,
    sourceFinality: row.source_finality,
    causationId: row.causation_id,
    correlationId: row.correlation_id,
    occurredAt: iso(row.occurred_at)
  });
}

const CP_DENIAL_RELATED_COUNT_KEYS = Object.freeze([
  "creditOfferRowCount",
  "projectionRegistryCount",
  "projectionSnapshotCount",
  "domainEventCount",
  "evidenceEnvelopeCount",
  "creditOfferAcceptanceCount",
  "obligationCount",
  "sandboxExecutionReceiptCount",
  "repaymentEventCount",
  "ledgerTransactionCount",
  "ledgerEntryCount"
]);

function nonnegativeCountRow(row, key) {
  return safeInteger(
    row[key],
    "acceptance_denial_protected_state_invalid",
    `Capital Partner denial protected-state count ${key} is invalid`
  );
}

export async function readM1BCapitalPartnerDenialProtectedState(client, {
  tenantId,
  actorId,
  creditOfferId,
  expectedStatus,
  requestId,
  correlationId,
  clientId,
  idempotencyKey
}) {
  assert(
    IDENTIFIER.test(creditOfferId ?? "") &&
    new Set(["declined", "withdrawn"]).has(expectedStatus) &&
    REQUEST_IDENTIFIER.test(requestId ?? "") &&
    REQUEST_IDENTIFIER.test(correlationId ?? "") &&
    IDENTIFIER.test(clientId ?? "") &&
    typeof idempotencyKey === "string" &&
    idempotencyKey.length >= 16 &&
    idempotencyKey.length <= 256,
    "acceptance_denial_target_invalid",
    "Capital Partner denial target or attempt identity is invalid"
  );
  const clientIdempotencyHash = hashId("tenant_command_client_idempotency", {
    tenantId,
    actorId,
    clientId,
    operationId: "pilotAcceptCreditOffer",
    idempotencyKey
  });
  const repositoryIdempotencyKey = hashId(
    "tenant_command_repository_idempotency",
    {
      tenantId,
      actorId,
      clientId,
      operationId: "pilotAcceptCreditOffer",
      clientIdempotencyHash
    }
  );
  const offerResult = await client.query(
    `SELECT o.id, o.offer_hash, o.terms_hash, o.disclosure_ref,
            o.status, o.schema_version,
            r.entity_hash AS projection_entity_hash,
            r.aggregate_version AS projection_aggregate_version,
            r.last_event_id AS projection_source_event_id,
            ar.status AS authorization_resource_status,
            ar.version AS authorization_resource_version
       FROM credit_offers o
       JOIN projection_registry r
         ON r.tenant_id = o.tenant_id
        AND r.entity_type = 'credit_offer' AND r.entity_id = o.id
       JOIN authorization_resources ar
         ON ar.tenant_id = o.tenant_id
        AND ar.resource_type = 'credit_offer' AND ar.resource_id = o.id
      WHERE o.tenant_id = $1 AND o.id = $2`,
    [tenantId, creditOfferId]
  );
  assert(
    offerResult.rowCount === 1,
    "acceptance_denial_protected_state_invalid",
    `Exactly one protected Offer is required for ${creditOfferId}`
  );
  const offer = offerResult.rows[0];
  const projectionAggregateVersion = safeInteger(
    offer.projection_aggregate_version,
    "acceptance_denial_protected_state_invalid",
    `Protected Offer projection version is invalid for ${creditOfferId}`
  );
  const authorizationResourceVersion = safeInteger(
    offer.authorization_resource_version,
    "acceptance_denial_protected_state_invalid",
    `Protected Offer authorization resource version is invalid for ${creditOfferId}`
  );
  assert(
    offer.id === creditOfferId &&
    offer.status === expectedStatus &&
    new Set(["credit_offer.v1", "credit_offer.v2"]).has(offer.schema_version) &&
    HASH.test(offer.offer_hash ?? "") &&
    HASH.test(offer.terms_hash ?? "") &&
    IDENTIFIER.test(offer.disclosure_ref ?? "") &&
    HASH.test(offer.projection_entity_hash ?? "") &&
    projectionAggregateVersion >= 1 &&
    IDENTIFIER.test(offer.projection_source_event_id ?? "") &&
    new Set(["active", "closed"]).has(offer.authorization_resource_status) &&
    authorizationResourceVersion >= 1,
    "acceptance_denial_protected_state_invalid",
    `Protected Offer state is invalid for ${creditOfferId}`
  );
  const countsResult = await client.query(
    `WITH related_obligations AS (
       SELECT id FROM obligations
        WHERE tenant_id = $1 AND credit_offer_id = $2
     ), related_repayments AS (
       SELECT id FROM repayment_events
        WHERE tenant_id = $1
          AND obligation_id IN (SELECT id FROM related_obligations)
     ), related_ledger_transactions AS (
       SELECT id FROM ledger_transactions
        WHERE tenant_id = $1 AND (
          (reference_type = 'obligation'
            AND reference_id IN (SELECT id FROM related_obligations))
          OR (reference_type = 'repayment'
            AND reference_id IN (SELECT id FROM related_repayments))
        )
     )
     SELECT
       (SELECT count(*) FROM credit_offers
         WHERE tenant_id = $1 AND id = $2) AS credit_offer_row_count,
       (SELECT count(*) FROM projection_registry
         WHERE tenant_id = $1 AND entity_type = 'credit_offer'
           AND entity_id = $2) AS projection_registry_count,
       (SELECT count(*) FROM projection_snapshots
         WHERE tenant_id = $1 AND entity_type = 'credit_offer'
           AND entity_id = $2) AS projection_snapshot_count,
       (SELECT count(*) FROM domain_events
         WHERE tenant_id = $1 AND aggregate_type = 'credit_offer'
           AND aggregate_id = $2) AS domain_event_count,
       (SELECT count(*) FROM evidence_envelopes
         WHERE tenant_id = $1 AND aggregate_type = 'credit_offer'
           AND aggregate_id = $2) AS evidence_envelope_count,
       (SELECT count(*) FROM credit_offer_acceptances
         WHERE tenant_id = $1 AND credit_offer_id = $2) AS credit_offer_acceptance_count,
       (SELECT count(*) FROM related_obligations) AS obligation_count,
       (SELECT count(*) FROM sandbox_execution_receipts
         WHERE tenant_id = $1
           AND obligation_id IN (SELECT id FROM related_obligations))
         AS sandbox_execution_receipt_count,
       (SELECT count(*) FROM related_repayments) AS repayment_event_count,
       (SELECT count(*) FROM related_ledger_transactions) AS ledger_transaction_count,
       (SELECT count(*) FROM ledger_entries
         WHERE tenant_id = $1
           AND transaction_id IN (SELECT id FROM related_ledger_transactions))
         AS ledger_entry_count,
       (SELECT count(*) FROM authorization_audit_events
         WHERE tenant_id = $1 AND actor_id = $3
           AND operation_id = 'pilotAcceptCreditOffer'
           AND request_id = $4 AND correlation_id = $5
           AND authorization_decision = 'allow') AS authorization_allow_count,
       (SELECT count(*) FROM command_idempotency
         WHERE tenant_id = $1 AND idempotency_key = $6) AS command_idempotency_count,
       (SELECT count(*) FROM command_events
         WHERE tenant_id = $1 AND idempotency_key = $6) AS command_event_count,
       (SELECT count(*) FROM tenant_command_executions
         WHERE tenant_id = $1 AND idempotency_key = $6) AS tenant_command_execution_count,
       (SELECT count(*) FROM domain_events d
          JOIN command_events ce
            ON ce.tenant_id = d.tenant_id AND ce.event_id = d.id
         WHERE ce.tenant_id = $1 AND ce.idempotency_key = $6)
         AS business_domain_event_count,
       (SELECT count(*) FROM evidence_envelopes e
          JOIN command_events ce
            ON ce.tenant_id = e.tenant_id AND ce.event_id = e.id
         WHERE ce.tenant_id = $1 AND ce.idempotency_key = $6)
         AS business_evidence_envelope_count`,
    [
      tenantId,
      creditOfferId,
      actorId,
      requestId,
      correlationId,
      repositoryIdempotencyKey
    ]
  );
  assert(
    countsResult.rowCount === 1,
    "acceptance_denial_protected_state_invalid",
    `Protected Offer counts are missing for ${creditOfferId}`
  );
  const row = countsResult.rows[0];
  const relatedRowCounts = Object.freeze(Object.fromEntries(
    CP_DENIAL_RELATED_COUNT_KEYS.map((key) => {
      const sqlKey = key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
      return [key, nonnegativeCountRow(row, sqlKey)];
    })
  ));
  const deniedCommand = Object.freeze({
    requestId,
    correlationId,
    clientIdRefHash: hashId("m1_b_acceptance_client_reference", { clientId }),
    idempotencyKeyHash: hashId("m1_b_denial_idempotency", { idempotencyKey }),
    repositoryIdempotencyKeyHash: repositoryIdempotencyKey,
    authorizationAllowCount: nonnegativeCountRow(row, "authorization_allow_count"),
    commandIdempotencyCount: nonnegativeCountRow(row, "command_idempotency_count"),
    commandEventCount: nonnegativeCountRow(row, "command_event_count"),
    tenantCommandExecutionCount: nonnegativeCountRow(row, "tenant_command_execution_count"),
    businessDomainEventCount: nonnegativeCountRow(row, "business_domain_event_count"),
    businessEvidenceEnvelopeCount: nonnegativeCountRow(
      row,
      "business_evidence_envelope_count"
    )
  });
  assert(
    relatedRowCounts.creditOfferRowCount === 1 &&
    relatedRowCounts.projectionRegistryCount === 1 &&
    relatedRowCounts.projectionSnapshotCount >= 2 &&
    relatedRowCounts.domainEventCount >= 2 &&
    relatedRowCounts.evidenceEnvelopeCount === relatedRowCounts.domainEventCount &&
    relatedRowCounts.creditOfferAcceptanceCount === 0 &&
    relatedRowCounts.obligationCount === 0 &&
    relatedRowCounts.sandboxExecutionReceiptCount === 0 &&
    relatedRowCounts.repaymentEventCount === 0 &&
    relatedRowCounts.ledgerTransactionCount === 0 &&
    relatedRowCounts.ledgerEntryCount === 0 &&
    Object.entries(deniedCommand)
      .filter(([key]) => key.endsWith("Count"))
      .every(([, value]) => value === 0),
    "acceptance_denial_protected_state_invalid",
    `Protected Offer has an unexpected business or command effect for ${creditOfferId}`
  );
  return Object.freeze({
    catalogVersion: "m1_b_cp_denial_protected_state.v1",
    creditOffer: Object.freeze({
      creditOfferId,
      creditOfferHash: offer.offer_hash,
      termsHash: offer.terms_hash,
      disclosureRef: offer.disclosure_ref,
      status: offer.status,
      schemaVersion: offer.schema_version,
      projectionEntityHash: offer.projection_entity_hash,
      projectionAggregateVersion,
      projectionSourceEventId: offer.projection_source_event_id,
      authorizationResourceStatus: offer.authorization_resource_status,
      authorizationResourceVersion
    }),
    deniedCommand,
    relatedRowCounts
  });
}

async function readM1BCapitalPartnerDenialAudit(client, {
  tenantId,
  actorId,
  creditOfferId,
  requestId,
  correlationId
}) {
  const result = await client.query(
    `SELECT id, occurred_at, request_id, correlation_id, operation_id,
            resource_type, resource_id, authorization_decision,
            authorization_decision_id, policy_version, reason_code
       FROM authorization_audit_events
      WHERE tenant_id = $1 AND actor_id = $2
        AND operation_id = 'pilotAcceptCreditOffer'
        AND request_id = $3 AND correlation_id = $4
        AND resource_type = 'credit_offer' AND resource_id = $5
        AND authorization_decision = 'deny'`,
    [tenantId, actorId, requestId, correlationId, creditOfferId]
  );
  assert(
    result.rowCount === 1,
    "acceptance_denial_audit_invalid",
    `Exactly one durable denial audit is required for ${creditOfferId}`
  );
  const row = result.rows[0];
  assert(
    row.operation_id === "pilotAcceptCreditOffer" &&
    row.request_id === requestId &&
    row.correlation_id === correlationId &&
    row.resource_type === "credit_offer" &&
    row.resource_id === creditOfferId &&
    row.authorization_decision === "deny" &&
    row.authorization_decision_id === null &&
    row.reason_code === "live_policy_rejected" &&
    IDENTIFIER.test(row.id ?? "") &&
    IDENTIFIER.test(row.policy_version ?? "") &&
    Number.isFinite(Date.parse(row.occurred_at ?? "")),
    "acceptance_denial_audit_invalid",
    `Durable denial audit is invalid for ${creditOfferId}`
  );
  return Object.freeze({
    eventId: row.id,
    operationId: "pilotAcceptCreditOffer",
    requestId,
    correlationId,
    resourceType: "credit_offer",
    resourceId: creditOfferId,
    authorizationDecision: "deny",
    authorizationDecisionId: null,
    actorRefHash: actorRefHash(actorId),
    policyVersion: row.policy_version,
    reasonCode: row.reason_code,
    occurredAt: iso(row.occurred_at)
  });
}

async function captureCapitalPartnerDenialSnapshot({
  readTenant,
  tenantId,
  actorId,
  targets,
  includeAudits
}) {
  return readTenant(async (client) => {
    const clock = await client.query("SELECT clock_timestamp() AS captured_at");
    assert(
      clock.rowCount === 1,
      "acceptance_denial_snapshot_invalid",
      "Capital Partner denial snapshot time is unavailable"
    );
    const states = [];
    const audits = [];
    for (const target of targets) {
      states.push(await readM1BCapitalPartnerDenialProtectedState(client, {
        tenantId,
        actorId,
        ...target
      }));
      if (includeAudits) {
        audits.push(await readM1BCapitalPartnerDenialAudit(client, {
          tenantId,
          actorId,
          ...target
        }));
      }
    }
    return Object.freeze({
      capturedAt: iso(clock.rows[0].captured_at),
      states: Object.freeze(states),
      audits: Object.freeze(audits)
    });
  });
}

export async function captureM1BCapitalPartnerDenialBoundary({
  readTenant,
  tenantId,
  actorId,
  targets,
  performDenials
}) {
  assert(
    typeof readTenant === "function" &&
    typeof performDenials === "function" &&
    Array.isArray(targets) &&
    targets.length >= 1 && targets.length <= 2 &&
    (targets.length === 1
      ? new Set(["declined", "withdrawn"]).has(targets[0]?.expectedStatus)
      : targets[0]?.expectedStatus === "declined" &&
        targets[1]?.expectedStatus === "withdrawn") &&
    targets.every((target) => exactKeys(target, [
      "creditOfferId",
      "expectedStatus",
      "requestId",
      "correlationId",
      "clientId",
      "idempotencyKey"
    ])) &&
    new Set(targets.map(({ creditOfferId }) => creditOfferId)).size === targets.length &&
    new Set(targets.map(({ requestId }) => requestId)).size === targets.length &&
    new Set(targets.map(({ idempotencyKey }) => idempotencyKey)).size === targets.length,
    "acceptance_denial_boundary_invalid",
    "Capital Partner denial boundary requires one exact target or the ordered stale/withdrawn pair"
  );
  const baseline = await captureCapitalPartnerDenialSnapshot({
    readTenant,
    tenantId,
    actorId,
    targets,
    includeAudits: false
  });
  const runtimeResults = await performDenials(
    Object.freeze(targets.map((target) => Object.freeze(structuredClone(target)))),
    baseline
  );
  assert(
    Array.isArray(runtimeResults) && runtimeResults.length === targets.length,
    "acceptance_denial_runtime_invalid",
    "Capital Partner denial callback must return the exact target count"
  );
  const safeRuntimeResults = runtimeResults.map((result, index) => {
    const target = targets[index];
    assert(
      exactKeys(result, [
        "creditOfferId",
        "requestId",
        "correlationId",
        "responseSchemaVersion",
        "capturedAt",
        "requestProjection",
        "requestProjectionHash",
        "response"
      ]) &&
      result.creditOfferId === target.creditOfferId &&
      result.requestId === target.requestId &&
      result.correlationId === target.correlationId &&
      result.responseSchemaVersion === "problem_details.v1" &&
      Number.isFinite(Date.parse(result.capturedAt ?? "")),
      "acceptance_denial_runtime_invalid",
      `Capital Partner denial response envelope is invalid for ${target.creditOfferId}`
    );
    try {
      assertTenantProtocolRequest(result.requestProjection);
    } catch {
      fail(
        "acceptance_denial_runtime_invalid",
        `Capital Partner denial request violates the protocol contract for ${target.creditOfferId}`
      );
    }
    const protectedOffer = baseline.states[index].creditOffer;
    assert(
      result.requestProjection.operationId === "pilotAcceptCreditOffer" &&
        result.requestProjection.requestId === target.requestId &&
        result.requestProjection.correlationId === target.correlationId &&
        result.requestProjection.idempotencyKey === target.idempotencyKey &&
        result.requestProjection.resource?.resourceType === "credit_offer" &&
        result.requestProjection.resource.resourceId === target.creditOfferId &&
        result.requestProjection.payload?.expectedOfferHash ===
          protectedOffer.creditOfferHash &&
        result.requestProjection.payload?.expectedTermsHash ===
          protectedOffer.termsHash &&
        result.requestProjection.payload?.actionConfirmation?.confirmationMethod ===
          "wallet_personal_sign" &&
        result.requestProjection.payload.actionConfirmation.resourceId ===
          target.creditOfferId &&
        result.requestProjection.payload.actionConfirmation.resourceHash ===
          protectedOffer.creditOfferHash &&
        result.requestProjection.payload.actionConfirmation.rawSignaturePersisted === false &&
        result.requestProjection.payload.actionConfirmation.blockchainTransactionSubmitted === false &&
        result.requestProjectionHash ===
          hashM1BAcceptanceManifest(result.requestProjection),
      "acceptance_denial_runtime_invalid",
      `Capital Partner denial request is not bound to protected Offer ${target.creditOfferId}`
    );
    inspectResponseOnlyValue(result.requestProjection);
    const responseProjection = projectM1BSafeResponse(
      "pilotAcceptCreditOffer",
      result.responseSchemaVersion,
      result.response
    );
    assert(
      responseProjection.status === 404 &&
      responseProjection.code === "authorization_denied" &&
      responseProjection.requestId === target.requestId,
      "acceptance_denial_runtime_invalid",
      `Capital Partner denial response is not the fail-closed anti-enumeration result for ${target.creditOfferId}`
    );
    return Object.freeze({
      capturedAt: iso(result.capturedAt),
      requestProjection: Object.freeze(structuredClone(result.requestProjection)),
      requestProjectionHash: result.requestProjectionHash,
      responseProjection,
      responseHash: hashM1BAcceptanceManifest(responseProjection)
    });
  });
  const verification = await captureCapitalPartnerDenialSnapshot({
    readTenant,
    tenantId,
    actorId,
    targets,
    includeAudits: true
  });
  return Object.freeze(targets.map((target, index) => {
    const before = baseline.states[index];
    const after = verification.states[index];
    const audit = verification.audits[index];
    const runtime = safeRuntimeResults[index];
    const beforeHash = hashM1BAcceptanceManifest(before);
    const afterHash = hashM1BAcceptanceManifest(after);
    assert(
      beforeHash === afterHash &&
      Date.parse(baseline.capturedAt) <= Date.parse(audit.occurredAt) &&
      Date.parse(audit.occurredAt) <= Date.parse(runtime.capturedAt) &&
      Date.parse(runtime.capturedAt) <= Date.parse(verification.capturedAt),
      "acceptance_denial_boundary_invalid",
      `Capital Partner denial changed protected business state for ${target.creditOfferId}`
    );
    return Object.freeze({
      operationId: "pilotAcceptCreditOffer",
      creditOfferId: target.creditOfferId,
      requestId: target.requestId,
      correlationId: target.correlationId,
      outwardErrorCode: "authorization_denied",
      outwardResponse: Object.freeze({
        responseSchemaVersion: "problem_details.v1",
        requestProjection: runtime.requestProjection,
        requestProjectionHash: runtime.requestProjectionHash,
        responseProjection: runtime.responseProjection,
        responseHash: runtime.responseHash,
        capturedAt: runtime.capturedAt
      }),
      authorizationAudit: audit,
      protectedStateCatalogVersion: "m1_b_cp_denial_protected_state.v1",
      baselineCapturedAt: baseline.capturedAt,
      verificationCapturedAt: verification.capturedAt,
      protectedStateBefore: before,
      protectedStateAfter: after,
      protectedStateBeforeHash: beforeHash,
      protectedStateAfterHash: afterHash,
      businessMutationCount: 0
    });
  }));
}

export async function readM1BActorResourceScope(client, {
  tenantId,
  actorId,
  resources
}) {
  assert(
    Array.isArray(resources) && resources.length >= 1 && resources.length <= 16,
    "acceptance_resource_scope_invalid",
    "A bounded actor resource scope is required"
  );
  const results = [];
  for (const [resourceType, resourceId] of resources) {
    const result = await client.query(
      `SELECT r.resource_type, r.resource_id, r.status AS resource_status,
              r.version AS resource_version, b.relationship,
              b.status AS binding_status, b.version AS binding_version
         FROM authorization_resources r
         JOIN authorization_resource_bindings b
           ON b.tenant_id = r.tenant_id
          AND b.resource_type = r.resource_type
          AND b.resource_id = r.resource_id
        WHERE r.tenant_id = $1 AND b.actor_id = $2
          AND r.resource_type = $3 AND r.resource_id = $4`,
      [tenantId, actorId, resourceType, resourceId]
    );
    assert(
      result.rowCount === 1 &&
      result.rows[0].resource_status === "active" &&
      result.rows[0].binding_status === "active",
      "acceptance_resource_scope_invalid",
      `Active actor binding is missing for ${resourceType}/${resourceId}`
    );
    const row = result.rows[0];
    const resourceVersion = safeInteger(
      row.resource_version,
      "acceptance_resource_scope_invalid",
      `Authorization resource version is invalid for ${resourceType}/${resourceId}`
    );
    const bindingVersion = safeInteger(
      row.binding_version,
      "acceptance_resource_scope_invalid",
      `Authorization binding version is invalid for ${resourceType}/${resourceId}`
    );
    assert(
      resourceVersion >= 1 && bindingVersion >= 1,
      "acceptance_resource_scope_invalid",
      `Authorization resource or binding version is invalid for ${resourceType}/${resourceId}`
    );
    results.push(Object.freeze({
      resourceType,
      resourceId,
      resourceStatus: row.resource_status,
      resourceVersion,
      bindingRelationship: row.relationship,
      bindingStatus: row.binding_status,
      bindingVersion,
      actorRefHash: actorRefHash(actorId)
    }));
  }
  return Object.freeze(results);
}

export async function readM1BSafeSiweAuthentication(client, {
  tenantId,
  actorId,
  auditEventIds,
  databaseStartedAt
}) {
  assert(
    Array.isArray(auditEventIds) &&
    auditEventIds.length >= 1 &&
    auditEventIds.length <= 64 &&
    auditEventIds.every((eventId) => IDENTIFIER.test(eventId ?? "")) &&
    new Set(auditEventIds).size === auditEventIds.length &&
    Number.isFinite(Date.parse(databaseStartedAt ?? "")),
    "acceptance_authentication_audit_set_invalid",
    "Acceptance authentication requires an exact bounded audit-event set and runtime start"
  );
  const result = await client.query(
    `SELECT a.id AS audit_event_id, a.request_id, a.occurred_at,
            a.operation_id, a.correlation_id, a.policy_version AS audit_policy_version,
            s.actor_id AS session_actor_id, s.client_id AS session_client_id,
            s.credential_id AS session_credential_id,
            s.credential_version AS session_credential_version,
            s.authentication_method, s.sender_constraint_method,
            s.policy_version AS session_policy_version, s.acr, s.amr,
            s.auth_time, s.created_at AS session_created_at,
            s.absolute_expires_at, s.status AS session_status,
            c.actor_id AS credential_actor_id, c.actor_type::text AS credential_actor_type,
            c.client_id AS credential_client_id,
            c.client_authentication_method,
            c.sender_constraint_method AS credential_sender_constraint_method,
            c.policy_version AS credential_policy_version,
            c.status AS credential_status, c.version AS current_credential_version,
            c.created_at AS credential_created_at, c.expires_at AS credential_expires_at,
            m.actor_id AS membership_actor_id, m.client_ids AS membership_client_ids,
            m.policy_version AS membership_policy_version,
            m.status AS membership_status, m.valid_from AS membership_valid_from,
            m.expires_at AS membership_expires_at,
            registration.registration_count,
            registration.invitation_registration_count,
            registration.registration_occurred_at,
            count(*) OVER (PARTITION BY a.id) AS session_match_count
       FROM authorization_audit_events a
       LEFT JOIN authentication_sessions s
         ON s.tenant_id = a.tenant_id AND s.actor_id = a.actor_id
        AND s.token_jti_ref_hash = a.token_jti_hash
       LEFT JOIN authentication_credentials c
         ON c.tenant_id = s.tenant_id AND c.id = s.credential_id
        AND c.version = s.credential_version
       LEFT JOIN memberships m
         ON m.tenant_id = s.tenant_id AND m.actor_id = s.actor_id
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (
                  WHERE e.event_type = 'credential_registered'
                ) AS registration_count,
                count(*) FILTER (
                  WHERE e.event_type = 'credential_registered'
                    AND e.payload ? 'invitationRefHash'
                ) AS invitation_registration_count,
                min(e.occurred_at) FILTER (
                  WHERE e.event_type = 'credential_registered'
                ) AS registration_occurred_at
           FROM authentication_events e
          WHERE e.tenant_id = c.tenant_id
            AND e.actor_id = c.actor_id AND e.credential_id = c.id
       ) registration ON TRUE
      WHERE a.tenant_id = $1 AND a.actor_id = $2
        AND a.id = ANY($3::text[])
      ORDER BY a.id`,
    [tenantId, actorId, auditEventIds]
  );
  const coveredAuditEventIds = [...new Set(
    result.rows.map((row) => row.audit_event_id)
  )].sort();
  const expectedAuditEventIds = [...auditEventIds].sort();
  const coveredRequestIds = [...new Set(result.rows.map((row) => row.request_id))].sort();
  assert(
    result.rowCount === auditEventIds.length &&
    JSON.stringify(coveredAuditEventIds) === JSON.stringify(expectedAuditEventIds) &&
    result.rows.every((row) => (
      IDENTIFIER.test(row.audit_event_id ?? "") &&
      REQUEST_IDENTIFIER.test(row.request_id ?? "") &&
      REQUEST_IDENTIFIER.test(row.correlation_id ?? "") &&
      IDENTIFIER.test(row.operation_id ?? "") &&
      Number.isFinite(Date.parse(row.occurred_at ?? "")) &&
      Number.isFinite(Date.parse(row.auth_time ?? "")) &&
      Number(row.session_match_count) === 1 &&
      row.session_actor_id === actorId &&
      row.credential_actor_id === actorId &&
      row.membership_actor_id === actorId &&
      row.session_client_id === row.credential_client_id &&
      Array.isArray(row.membership_client_ids) &&
      row.membership_client_ids.includes(row.session_client_id) &&
      row.session_credential_id !== null &&
      Number(row.session_credential_version) === Number(row.current_credential_version) &&
      Date.parse(row.auth_time) <= Date.parse(row.occurred_at) &&
      Date.parse(row.auth_time) >= Date.parse(databaseStartedAt) &&
      Date.parse(row.session_created_at) <= Date.parse(row.occurred_at) &&
      Date.parse(row.absolute_expires_at) > Date.parse(row.occurred_at) &&
      row.session_status === "active" &&
      row.authentication_method === "siwe" &&
      row.sender_constraint_method === "host_session" &&
      row.client_authentication_method === "siwe" &&
      row.credential_sender_constraint_method === "host_session" &&
      row.credential_status === "active" &&
      Date.parse(row.credential_created_at) <= Date.parse(row.occurred_at) &&
      (row.credential_expires_at === null ||
        Date.parse(row.credential_expires_at) > Date.parse(row.occurred_at)) &&
      row.membership_status === "active" &&
      Date.parse(row.membership_valid_from) <= Date.parse(row.occurred_at) &&
      (row.membership_expires_at === null ||
        Date.parse(row.membership_expires_at) > Date.parse(row.occurred_at)) &&
      row.audit_policy_version === row.session_policy_version &&
      row.audit_policy_version === row.credential_policy_version &&
      row.audit_policy_version === row.membership_policy_version &&
      Number(row.registration_count) === 1 &&
      Number(row.invitation_registration_count) === 1 &&
      Date.parse(row.registration_occurred_at) <= Date.parse(row.auth_time) &&
      row.acr === "urn:ipo.one:acr:wallet" &&
      Array.isArray(row.amr) &&
      row.amr.length === 3 &&
      row.amr[0] === "wallet" &&
      row.amr[1] === "siwe" &&
      SAFE_WALLET_AMR.has(row.amr[2])
    )),
    "acceptance_authentication_invalid",
    "Acceptance operations must bind only safe invited-wallet SIWE assurance"
  );
  const assurance = new Set(result.rows.map((row) => JSON.stringify({
    method: row.authentication_method,
    acr: row.acr,
    amr: row.amr
  })));
  assert(
    assurance.size === 1 &&
    new Set(result.rows.map((row) => row.session_credential_id)).size === 1 &&
    new Set(result.rows.map((row) => row.session_client_id)).size === 1,
    "acceptance_authentication_ambiguous",
    "Acceptance operations used inconsistent wallet assurance"
  );
  const authTimes = result.rows.map((row) => iso(row.auth_time)).sort();
  const row = result.rows.at(-1);
  return Object.freeze({
    method: "siwe",
    acr: row.acr,
    amr: Object.freeze([...row.amr]),
    actorRefHash: actorRefHash(actorId),
    clientRefHash: hashId("m1_b_acceptance_client_reference", {
      clientId: row.session_client_id
    }),
    coveredAuditEventIds: Object.freeze(coveredAuditEventIds),
    auditEventCount: coveredAuditEventIds.length,
    coveredRequestIds: Object.freeze(coveredRequestIds),
    requestCount: coveredRequestIds.length,
    earliestAuthTime: authTimes[0],
    latestAuthTime: authTimes.at(-1),
    activeCredentialBinding: true,
    activeMembershipBinding: true,
    credentialBindingCount: 1,
    invitationBoundCredentialRegistrationCount: 1,
    sessionMaterialIncluded: false,
    rawSignatureIncluded: false,
    walletAddressIncluded: false
  });
}

const HUMAN_LEDGER_ACCOUNT_NORMAL_SIDE = Object.freeze({
  principal_receivable: "debit",
  sandbox_funding_source: "credit",
  repayment_clearing: "debit"
});

function humanLedgerAccountNatural({
  account_owner_type: ownerType,
  account_owner_id: ownerId,
  account_asset_id: assetId,
  account_type: accountType
}) {
  return { ownerType, ownerId, assetId, accountType };
}

function derivedHumanLedgerAccountId(obligationId, assetId, accountType) {
  const digest = hashId("sandbox_ledger_account", {
    ownerType: "obligation",
    ownerId: obligationId,
    assetId,
    accountType
  });
  return `ledger_account_${digest.slice(2)}`;
}

function humanLedgerEntryProof(row, expectedTransactionId) {
  const accountNatural = humanLedgerAccountNatural(row);
  const expectedNormalSide = HUMAN_LEDGER_ACCOUNT_NORMAL_SIDE[row.account_type];
  assert(
    row.transaction_id === expectedTransactionId &&
      IDENTIFIER.test(row.id ?? "") &&
      IDENTIFIER.test(row.account_id ?? "") &&
      HASH.test(row.account_hash ?? "") &&
      row.account_owner_type === "obligation" &&
      IDENTIFIER.test(row.account_owner_id ?? "") &&
      IDENTIFIER.test(row.account_asset_id ?? "") &&
      IDENTIFIER.test(row.account_type ?? "") &&
      row.account_id === derivedHumanLedgerAccountId(
        row.account_owner_id,
        row.account_asset_id,
        row.account_type
      ) &&
      row.account_hash === hashId("ledger_account", accountNatural) &&
      expectedNormalSide !== undefined &&
      row.account_normal_side === expectedNormalSide &&
      row.account_status === "active" &&
      row.account_schema_version === "ledger_account.v1" &&
      new Set(["debit", "credit"]).has(row.direction) &&
      Number.isSafeInteger(Number(row.sequence)) &&
      Number(row.sequence) >= 0 &&
      row.schema_version === "ledger_entry.v1",
    "acceptance_human_ledger_entry_invalid",
    "Human ledger entry is missing its exact durable transaction linkage"
  );
  return Object.freeze({
    sequence: Number(row.sequence),
    ledgerEntryId: row.id,
    ledgerAccountRefHash: hashId("m1_b_ledger_account_reference", {
      ledgerAccountId: row.account_id
    }),
    accountOwnerType: row.account_owner_type,
    accountOwnerRefHash: hashId("m1_b_ledger_account_owner_reference", {
      ownerType: row.account_owner_type,
      ownerId: row.account_owner_id
    }),
    accountAssetId: row.account_asset_id,
    accountType: row.account_type,
    accountNormalSide: row.account_normal_side,
    accountStatus: row.account_status,
    canonicalAccountVerified: true,
    direction: row.direction,
    amountMinor: minorUnits(
      row.amount_minor,
      "acceptance_human_ledger_entry_invalid",
      "Human ledger entry amount must be a positive canonical minor-unit string",
      { positive: true }
    ),
    postedAt: iso(row.posted_at),
    schemaVersion: row.schema_version
  });
}

function humanLedgerTransactionProof(row, rows, {
  expectedIdempotencyKey,
  expectedMetadata
}) {
  assert(
    row &&
      IDENTIFIER.test(row.id ?? "") &&
      HASH.test(row.transaction_hash ?? "") &&
      HASH.test(row.idempotency_key ?? "") &&
      IDENTIFIER.test(row.transaction_type ?? "") &&
      IDENTIFIER.test(row.asset_id ?? "") &&
      IDENTIFIER.test(row.reference_type ?? "") &&
      IDENTIFIER.test(row.reference_id ?? "") &&
      plainObject(row.metadata) &&
      HASH.test(row.metadata_hash ?? "") &&
      row.idempotency_key === expectedIdempotencyKey &&
      row.metadata_hash === hashId("ledger_metadata", row.metadata) &&
      row.metadata_hash === hashId("ledger_metadata", expectedMetadata) &&
      row.schema_version === "ledger_transaction.v1",
    "acceptance_human_ledger_transaction_invalid",
    "Human ledger transaction does not match the durable v1 projection"
  );
  const entryCount = safeInteger(
    row.entry_count,
    "acceptance_human_ledger_transaction_invalid",
    "Human ledger transaction entry count is invalid"
  );
  const orderedRows = rows
    .filter(({ transaction_id: transactionId }) => transactionId === row.id)
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
  const entries = orderedRows.map((entry) => humanLedgerEntryProof(entry, row.id));
  assert(
    entryCount >= 2 &&
      entries.length === entryCount &&
      entries.every(({ sequence }, index) => sequence === index),
    "acceptance_human_ledger_manifest_invalid",
    "Human ledger entry manifest must be complete and ordered"
  );
  const debitTotalMinor = minorUnits(
    row.debit_total_minor,
    "acceptance_human_ledger_transaction_invalid",
    "Human ledger debit total is invalid",
    { positive: true }
  );
  const creditTotalMinor = minorUnits(
    row.credit_total_minor,
    "acceptance_human_ledger_transaction_invalid",
    "Human ledger credit total is invalid",
    { positive: true }
  );
  const debitSum = entries
    .filter(({ direction }) => direction === "debit")
    .reduce((sum, { amountMinor }) => sum + BigInt(amountMinor), 0n);
  const creditSum = entries
    .filter(({ direction }) => direction === "credit")
    .reduce((sum, { amountMinor }) => sum + BigInt(amountMinor), 0n);
  assert(
    debitSum === BigInt(debitTotalMinor) &&
      creditSum === BigInt(creditTotalMinor) &&
      debitSum === creditSum,
    "acceptance_human_ledger_unbalanced",
    "Human ledger readback is not exactly balanced"
  );
  const normalizedEntries = orderedRows.map((entry) => ({
    ledgerAccountId: entry.account_id,
    direction: entry.direction,
    amountMinor: minorUnits(
      entry.amount_minor,
      "acceptance_human_ledger_entry_invalid",
      "Human ledger entry amount must be a positive canonical minor-unit string",
      { positive: true }
    ),
    sequence: Number(entry.sequence)
  }));
  assert(
    row.transaction_hash === hashId("ledger_transaction", {
      idempotencyKey: row.idempotency_key,
      transactionType: row.transaction_type,
      assetId: row.asset_id,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      metadata: row.metadata,
      entries: normalizedEntries
    }),
    "acceptance_human_ledger_transaction_hash_invalid",
    "Human ledger transaction hash does not match its stored canonical source and entries"
  );
  return Object.freeze({
    ledgerTransactionId: row.id,
    transactionHash: row.transaction_hash,
    transactionType: row.transaction_type,
    assetId: row.asset_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadataHash: row.metadata_hash,
    canonicalSourceVerified: true,
    idempotencyKeyIncluded: false,
    metadataIncluded: false,
    debitTotalMinor,
    creditTotalMinor,
    entryCount,
    postedAt: iso(row.posted_at),
    schemaVersion: row.schema_version,
    entriesManifestHash: hashM1BAcceptanceManifest(entries),
    entries: Object.freeze(entries)
  });
}

function derivedHumanLedgerAccountRefHash(obligationId, assetId, accountType) {
  return hashId("m1_b_ledger_account_reference", {
    ledgerAccountId: derivedHumanLedgerAccountId(obligationId, assetId, accountType)
  });
}

function humanInstallmentState(row, obligationId, scheduleSequence) {
  assert(
    IDENTIFIER.test(row.id ?? "") &&
      row.obligation_id === obligationId &&
      Number.isSafeInteger(Number(row.installment_number)) &&
      Number(row.installment_number) >= 1 &&
      row.schedule_version === "obligation_schedule.v1" &&
      Number(row.schedule_sequence) === scheduleSequence &&
      row.schema_version === "obligation_installment.v1" &&
      row.status === "paid",
    "acceptance_human_installment_invalid",
    "Human installment readback is not the exact paid current schedule"
  );
  return Object.freeze({
    installmentId: row.id,
    obligationId: row.obligation_id,
    installmentNumber: Number(row.installment_number),
    dueAt: iso(row.due_at),
    scheduledPrincipalMinor: minorUnits(
      row.scheduled_principal_minor,
      "acceptance_human_installment_invalid",
      "Human scheduled principal is invalid"
    ),
    scheduledInterestMinor: minorUnits(
      row.scheduled_interest_minor,
      "acceptance_human_installment_invalid",
      "Human scheduled interest is invalid"
    ),
    scheduledFeeMinor: minorUnits(
      row.scheduled_fee_minor,
      "acceptance_human_installment_invalid",
      "Human scheduled fee is invalid"
    ),
    paidPrincipalMinor: minorUnits(
      row.paid_principal_minor,
      "acceptance_human_installment_invalid",
      "Human paid principal is invalid"
    ),
    paidInterestMinor: minorUnits(
      row.paid_interest_minor,
      "acceptance_human_installment_invalid",
      "Human paid interest is invalid"
    ),
    paidFeeMinor: minorUnits(
      row.paid_fee_minor,
      "acceptance_human_installment_invalid",
      "Human paid fee is invalid"
    ),
    status: row.status,
    scheduleVersion: row.schedule_version,
    scheduleSequence: Number(row.schedule_sequence),
    schemaVersion: row.schema_version
  });
}

function sumHumanInstallmentMinor(installments, key) {
  return installments.reduce((sum, installment) => sum + BigInt(installment[key]), 0n);
}

export async function readM1BHumanEconomicReadBack(client, {
  actorId,
  obligationId,
  subjectId,
  sandboxExecutionReceiptId,
  repaymentId,
  principalLedgerTransactionId,
  repaymentLedgerTransactionId
}) {
  [
    actorId,
    obligationId,
    subjectId,
    sandboxExecutionReceiptId,
    repaymentId,
    principalLedgerTransactionId,
    repaymentLedgerTransactionId
  ].forEach((value) => assert(
    IDENTIFIER.test(value ?? ""),
    "acceptance_human_economic_identifier_invalid",
    "Human economic readback identifiers are invalid"
  ));
  const [executionResult, repaymentResult, repaymentCountResult] = await Promise.all([
    client.query(
      `SELECT id, receipt_hash, obligation_id, subject_id, asset_id,
              amount_minor::text, provider_id, provider_category, purpose_code,
              adapter_id, adapter_version, adapter_key_id, adapter_message_hash,
              adapter_issued_at, executed_at, sandbox_only,
              production_funds_moved, withdrawable, schema_version
         FROM sandbox_execution_receipts
        WHERE id = $1 AND obligation_id = $2 AND subject_id = $3`,
      [sandboxExecutionReceiptId, obligationId, subjectId]
    ),
    client.query(
      `SELECT id, repayment_hash, obligation_id, subject_id, asset_id,
              requested_minor::text, applied_minor::text,
              applied_fee_minor::text, applied_interest_minor::text,
              applied_principal_minor::text, surplus_minor::text,
              remaining_principal_minor::text, remaining_interest_minor::text,
              remaining_fees_minor::text, source_code, actor_hash,
              accrued_interest_minor::text, accrual_days,
              ledger_transaction_id, interest_ledger_transaction_id,
              occurred_at, sandbox_only, production_funds_moved, schema_version
         FROM repayment_events
        WHERE id = $1 AND obligation_id = $2 AND subject_id = $3
          AND schema_version = 'repayment.v2'`,
      [repaymentId, obligationId, subjectId]
    ),
    client.query(
      `SELECT
         (SELECT count(*)::int FROM repayment_events
           WHERE obligation_id = $1) AS repayment_row_count,
         (SELECT count(*)::int FROM domain_events
           WHERE aggregate_type = 'obligation' AND aggregate_id = $1
             AND event_type = 'repayment_posted') AS repayment_posted_event_count`,
      [obligationId]
    )
  ]);
  assert(
    executionResult.rowCount === 1 && repaymentResult.rowCount === 1,
    "acceptance_human_economic_readback_missing",
    "Human execution receipt and repayment must each resolve exactly once"
  );
  const execution = executionResult.rows[0];
  const repayment = repaymentResult.rows[0];
  const repaymentCounts = repaymentCountResult.rows[0];
  assert(
    execution.provider_id === null &&
      execution.provider_category === null &&
      execution.purpose_code === null &&
      HASH.test(execution.receipt_hash ?? "") &&
      IDENTIFIER.test(execution.asset_id ?? "") &&
      IDENTIFIER.test(execution.adapter_id ?? "") &&
      IDENTIFIER.test(execution.adapter_version ?? "") &&
      HASH.test(execution.adapter_key_id ?? "") &&
      HASH.test(execution.adapter_message_hash ?? "") &&
      iso(execution.adapter_issued_at) === iso(execution.executed_at) &&
      execution.sandbox_only === true &&
      execution.production_funds_moved === false &&
      execution.withdrawable === false &&
      execution.schema_version === "sandbox_execution_receipt.v1",
    "acceptance_human_execution_receipt_invalid",
    "Human execution receipt is not the safe non-provider sandbox receipt"
  );
  const executionAmountMinor = minorUnits(
    execution.amount_minor,
    "acceptance_human_execution_receipt_invalid",
    "Human execution receipt amount is invalid",
    { positive: true }
  );
  const repaymentMinorFields = [
    "requested_minor",
    "applied_minor",
    "applied_fee_minor",
    "applied_interest_minor",
    "applied_principal_minor",
    "surplus_minor",
    "remaining_principal_minor",
    "remaining_interest_minor",
    "remaining_fees_minor",
    "accrued_interest_minor"
  ];
  const repaymentMinor = Object.fromEntries(repaymentMinorFields.map((key) => [
    key,
    minorUnits(
      repayment[key],
      "acceptance_human_repayment_invalid",
      "Human repayment amounts must be canonical minor-unit strings"
    )
  ]));
  assert(
    HASH.test(repayment.repayment_hash ?? "") &&
      repayment.asset_id === execution.asset_id &&
      repayment.source_code === "synthetic_wallet" &&
      HASH.test(repayment.actor_hash ?? "") &&
      Number.isSafeInteger(Number(repayment.accrual_days)) &&
      Number(repayment.accrual_days) >= 0 &&
      repayment.ledger_transaction_id === repaymentLedgerTransactionId &&
      repayment.interest_ledger_transaction_id === null &&
      repayment.sandbox_only === true &&
      repayment.production_funds_moved === false &&
      repayment.schema_version === "repayment.v2" &&
      repaymentMinor.requested_minor === repaymentMinor.applied_minor &&
      repaymentMinor.surplus_minor === "0" &&
      repaymentMinor.applied_fee_minor === "0" &&
      repaymentMinor.applied_interest_minor === "0" &&
      repaymentMinor.accrued_interest_minor === "0" &&
      Number(repayment.accrual_days) === 0 &&
      repaymentMinor.applied_principal_minor === executionAmountMinor &&
      BigInt(repaymentMinor.applied_minor) ===
        BigInt(repaymentMinor.applied_fee_minor) +
          BigInt(repaymentMinor.applied_interest_minor) +
          BigInt(repaymentMinor.applied_principal_minor) &&
      BigInt(repaymentMinor.remaining_principal_minor) +
        BigInt(repaymentMinor.remaining_interest_minor) +
        BigInt(repaymentMinor.remaining_fees_minor) === 0n &&
      repaymentMinor.requested_minor === executionAmountMinor &&
      repayment.actor_hash === hashId("actor", actorId) &&
      repaymentCounts?.repayment_row_count === 1 &&
      repaymentCounts?.repayment_posted_event_count === 1,
    "acceptance_human_repayment_invalid",
    "Human repayment must be the full wallet-confirmed payoff of the executed amount"
  );
  const [obligationResult, installmentsResult] = await Promise.all([
    client.query(
      `SELECT id, obligation_hash, subject_id, asset_id,
              amount_minor::text, outstanding_minor::text,
              repaid_amount_minor::text, accrued_interest_minor::text,
              outstanding_interest_minor::text, accrued_fees_minor::text,
              outstanding_fees_minor::text, total_repaid_minor::text,
              installment_count, schedule_version, schedule_hash,
              schedule_sequence, execution_status,
              sandbox_execution_receipt_id, executed_at, updated_at,
              status, sandbox_only, production_funds_moved, withdrawable,
              schema_version
         FROM obligations
        WHERE id = $1 AND subject_id = $2 AND schema_version = 'obligation.v2'`,
      [obligationId, subjectId]
    ),
    client.query(
      `SELECT id, obligation_id, installment_number, due_at,
              scheduled_principal_minor::text,
              scheduled_interest_minor::text, scheduled_fee_minor::text,
              paid_principal_minor::text, paid_interest_minor::text,
              paid_fee_minor::text, status, schedule_version,
              schedule_sequence, schema_version
         FROM obligation_installments
        WHERE obligation_id = $1
          AND schedule_sequence = (
            SELECT schedule_sequence FROM obligations
             WHERE id = $1 AND subject_id = $2
          )
        ORDER BY installment_number`,
      [obligationId, subjectId]
    )
  ]);
  assert(
    obligationResult.rowCount === 1,
    "acceptance_human_obligation_missing",
    "Human canonical Obligation must resolve exactly once through tenant RLS"
  );
  const obligation = obligationResult.rows[0];
  const obligationMinorFields = [
    "amount_minor",
    "outstanding_minor",
    "repaid_amount_minor",
    "accrued_interest_minor",
    "outstanding_interest_minor",
    "accrued_fees_minor",
    "outstanding_fees_minor",
    "total_repaid_minor"
  ];
  const obligationMinor = Object.fromEntries(obligationMinorFields.map((key) => [
    key,
    minorUnits(
      obligation[key],
      "acceptance_human_obligation_invalid",
      "Human Obligation amounts must be canonical minor-unit strings"
    )
  ]));
  const scheduleSequence = safeInteger(
    obligation.schedule_sequence,
    "acceptance_human_obligation_invalid",
    "Human Obligation schedule sequence is invalid"
  );
  const installmentCount = safeInteger(
    obligation.installment_count,
    "acceptance_human_obligation_invalid",
    "Human Obligation installment count is invalid"
  );
  assert(
    HASH.test(obligation.obligation_hash ?? "") &&
      obligation.id === obligationId &&
      obligation.subject_id === subjectId &&
      obligation.asset_id === execution.asset_id &&
      obligationMinor.amount_minor === executionAmountMinor &&
      obligationMinor.amount_minor === repaymentMinor.applied_principal_minor &&
      obligationMinor.outstanding_minor === "0" &&
      obligationMinor.repaid_amount_minor === repaymentMinor.applied_principal_minor &&
      obligationMinor.accrued_interest_minor === repaymentMinor.accrued_interest_minor &&
      obligationMinor.outstanding_interest_minor === "0" &&
      obligationMinor.accrued_fees_minor === "0" &&
      obligationMinor.outstanding_fees_minor === "0" &&
      obligationMinor.total_repaid_minor === repaymentMinor.applied_minor &&
      installmentCount >= 1 &&
      scheduleSequence === 1 &&
      obligation.schedule_version === "obligation_schedule.v1" &&
      HASH.test(obligation.schedule_hash ?? "") &&
      obligation.execution_status === "executed" &&
      obligation.sandbox_execution_receipt_id === sandboxExecutionReceiptId &&
      iso(obligation.executed_at) === iso(execution.executed_at) &&
      iso(obligation.updated_at) === iso(repayment.occurred_at) &&
      obligation.status === "fully_repaid" &&
      obligation.sandbox_only === true &&
      obligation.production_funds_moved === false &&
      obligation.withdrawable === false &&
      obligation.schema_version === "obligation.v2",
    "acceptance_human_obligation_invalid",
    "Human canonical Obligation does not prove the executed and fully repaid lifecycle"
  );
  const installments = installmentsResult.rows.map((row) =>
    humanInstallmentState(row, obligationId, scheduleSequence)
  );
  assert(
    installmentsResult.rowCount === installmentCount &&
      installments.length === installmentCount &&
      installments.every(({ installmentNumber }, index) => installmentNumber === index + 1),
    "acceptance_human_installment_manifest_invalid",
    "Human current installment schedule is incomplete or ambiguous"
  );
  const scheduledPrincipalMinor = sumHumanInstallmentMinor(
    installments,
    "scheduledPrincipalMinor"
  );
  const scheduledInterestMinor = sumHumanInstallmentMinor(
    installments,
    "scheduledInterestMinor"
  );
  const scheduledFeeMinor = sumHumanInstallmentMinor(installments, "scheduledFeeMinor");
  const paidPrincipalMinor = sumHumanInstallmentMinor(installments, "paidPrincipalMinor");
  const paidInterestMinor = sumHumanInstallmentMinor(installments, "paidInterestMinor");
  const paidFeeMinor = sumHumanInstallmentMinor(installments, "paidFeeMinor");
  const originalSchedule = installments.map((installment) => Object.freeze({
    ...installment,
    paidPrincipalMinor: "0",
    paidInterestMinor: "0",
    paidFeeMinor: "0",
    status: "scheduled"
  }));
  assert(
    scheduledPrincipalMinor === BigInt(obligationMinor.amount_minor) &&
      scheduledInterestMinor === BigInt(repaymentMinor.applied_interest_minor) &&
      scheduledFeeMinor === BigInt(repaymentMinor.applied_fee_minor) &&
      paidPrincipalMinor === BigInt(repaymentMinor.applied_principal_minor) &&
      paidInterestMinor === scheduledInterestMinor &&
      paidFeeMinor === scheduledFeeMinor &&
      paidPrincipalMinor + paidInterestMinor + paidFeeMinor ===
        BigInt(repaymentMinor.applied_minor) &&
      obligation.schedule_hash === hashId("obligation_schedule", originalSchedule),
    "acceptance_human_installment_totals_invalid",
    "Human paid installment totals do not exactly reconcile to the Obligation and repayment"
  );
  const transactionIds = [
    principalLedgerTransactionId,
    repaymentLedgerTransactionId,
    ...(repayment.interest_ledger_transaction_id
      ? [repayment.interest_ledger_transaction_id]
      : [])
  ];
  assert(
    new Set(transactionIds).size === transactionIds.length,
    "acceptance_human_ledger_transaction_invalid",
    "Human economic ledger transaction identifiers must be distinct"
  );
  const [transactionsResult, entriesResult] = await Promise.all([
    client.query(
      `SELECT id, transaction_hash, idempotency_key, transaction_type, asset_id,
              reference_type, reference_id, metadata, metadata_hash,
              debit_total_minor::text, credit_total_minor::text,
              entry_count, posted_at, schema_version
         FROM ledger_transactions
        WHERE id = ANY($1::text[])
        ORDER BY id`,
      [transactionIds]
    ),
    client.query(
      `SELECT e.id, e.transaction_id, e.account_id, e.direction,
              e.amount_minor::text, e.sequence, e.posted_at, e.schema_version,
              a.owner_type AS account_owner_type,
              a.owner_id AS account_owner_id,
              a.asset_id AS account_asset_id,
              a.account_hash, a.account_type,
              a.normal_side AS account_normal_side,
              a.status AS account_status,
              a.schema_version AS account_schema_version
         FROM ledger_entries e
         JOIN ledger_accounts a ON a.id = e.account_id
        WHERE e.transaction_id = ANY($1::text[])
        ORDER BY e.transaction_id, e.sequence`,
      [transactionIds]
    )
  ]);
  assert(
    transactionsResult.rowCount === transactionIds.length &&
      new Set(transactionsResult.rows.map(({ id }) => id)).size === transactionIds.length,
    "acceptance_human_ledger_transaction_invalid",
    "Human economic ledger transaction set is incomplete or ambiguous"
  );
  const principalMetadata = Object.freeze({
    obligationId,
    receiptHash: execution.receipt_hash,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  });
  const repaymentMetadata = Object.freeze({
    repaymentHash: repayment.repayment_hash,
    sourceCode: repayment.source_code,
    appliedFeeMinor: repaymentMinor.applied_fee_minor,
    appliedInterestMinor: repaymentMinor.applied_interest_minor,
    appliedPrincipalMinor: repaymentMinor.applied_principal_minor,
    surplusMinor: repaymentMinor.surplus_minor,
    sandboxOnly: true,
    productionFundsMoved: false
  });
  const canonicalLedgerSource = new Map([
    [principalLedgerTransactionId, Object.freeze({
      expectedIdempotencyKey: hashId("sandbox_execution_ledger_idempotency", {
        obligationId,
        receiptHash: execution.receipt_hash
      }),
      expectedMetadata: principalMetadata
    })],
    [repaymentLedgerTransactionId, Object.freeze({
      expectedIdempotencyKey: hashId("sandbox_repayment_ledger_idempotency", {
        repaymentId,
        repaymentHash: repayment.repayment_hash
      }),
      expectedMetadata: repaymentMetadata
    })]
  ]);
  const byId = new Map(transactionsResult.rows.map((row) => {
    const source = canonicalLedgerSource.get(row.id);
    assert(
      source !== undefined,
      "acceptance_human_ledger_transaction_invalid",
      "Human economic ledger transaction is outside the exact canonical set"
    );
    return [
      row.id,
      humanLedgerTransactionProof(row, entriesResult.rows, source)
    ];
  }));
  const principal = byId.get(principalLedgerTransactionId);
  const repaymentTransaction = byId.get(repaymentLedgerTransactionId);
  const interest = repayment.interest_ledger_transaction_id
    ? byId.get(repayment.interest_ledger_transaction_id)
    : null;
  assert(
    principal?.transactionType === "sandbox_credit_execution" &&
      principal.assetId === execution.asset_id &&
      principal.referenceType === "sandbox_execution_receipt" &&
      principal.referenceId === sandboxExecutionReceiptId &&
      principal.metadataHash === hashId("ledger_metadata", principalMetadata) &&
      principal.debitTotalMinor === executionAmountMinor &&
      principal.entries.length === 2 &&
      principal.entries[0].accountType === "principal_receivable" &&
      principal.entries[0].direction === "debit" &&
      principal.entries[1].accountType === "sandbox_funding_source" &&
      principal.entries[1].direction === "credit" &&
      principal.entries.every((entry) => (
        entry.accountOwnerRefHash === hashId(
          "m1_b_ledger_account_owner_reference",
          { ownerType: "obligation", ownerId: obligationId }
        ) && entry.accountAssetId === execution.asset_id &&
        entry.ledgerAccountRefHash === derivedHumanLedgerAccountRefHash(
          obligationId,
          execution.asset_id,
          entry.accountType
        ) && entry.postedAt === principal.postedAt
      )) &&
      repaymentTransaction?.transactionType === "sandbox_repayment" &&
      repaymentTransaction.assetId === execution.asset_id &&
      repaymentTransaction.referenceType === "repayment" &&
      repaymentTransaction.referenceId === repaymentId &&
      repaymentTransaction.metadataHash === hashId("ledger_metadata", repaymentMetadata) &&
      repaymentTransaction.debitTotalMinor === repaymentMinor.applied_minor &&
      repaymentTransaction.entries.length === 2 &&
      repaymentTransaction.entries[0]?.accountType === "repayment_clearing" &&
      repaymentTransaction.entries[0]?.direction === "debit" &&
      repaymentTransaction.entries[1]?.accountType === "principal_receivable" &&
      repaymentTransaction.entries[1]?.direction === "credit" &&
      repaymentTransaction.entries.every((entry) => (
        entry.accountOwnerRefHash === hashId(
          "m1_b_ledger_account_owner_reference",
          { ownerType: "obligation", ownerId: obligationId }
        ) && entry.accountAssetId === execution.asset_id &&
        entry.ledgerAccountRefHash === derivedHumanLedgerAccountRefHash(
          obligationId,
          execution.asset_id,
          entry.accountType
        ) && entry.postedAt === repaymentTransaction.postedAt
      )) &&
      interest === null,
    "acceptance_human_ledger_linkage_invalid",
    "Human execution and repayment ledger transactions do not match their exact projections"
  );
  return Object.freeze({
    schemaVersion: "m1_b_human_economic_read_back.v1",
    obligationId,
    repaymentRowCount: 1,
    repaymentPostedEventCount: 1,
    obligation: Object.freeze({
      obligationHash: obligation.obligation_hash,
      subjectId: obligation.subject_id,
      assetId: obligation.asset_id,
      originalPrincipalMinor: obligationMinor.amount_minor,
      outstandingPrincipalMinor: obligationMinor.outstanding_minor,
      repaidPrincipalMinor: obligationMinor.repaid_amount_minor,
      accruedInterestMinor: obligationMinor.accrued_interest_minor,
      outstandingInterestMinor: obligationMinor.outstanding_interest_minor,
      accruedFeesMinor: obligationMinor.accrued_fees_minor,
      outstandingFeesMinor: obligationMinor.outstanding_fees_minor,
      totalRepaidMinor: obligationMinor.total_repaid_minor,
      installmentCount,
      scheduleVersion: obligation.schedule_version,
      scheduleHash: obligation.schedule_hash,
      scheduleSequence,
      executionStatus: obligation.execution_status,
      sandboxExecutionReceiptId: obligation.sandbox_execution_receipt_id,
      executedAt: iso(obligation.executed_at),
      status: obligation.status,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: obligation.schema_version
    }),
    installmentSummary: Object.freeze({
      installmentCount,
      paidInstallmentCount: installments.length,
      scheduledPrincipalMinor: scheduledPrincipalMinor.toString(),
      scheduledInterestMinor: scheduledInterestMinor.toString(),
      scheduledFeeMinor: scheduledFeeMinor.toString(),
      paidPrincipalMinor: paidPrincipalMinor.toString(),
      paidInterestMinor: paidInterestMinor.toString(),
      paidFeeMinor: paidFeeMinor.toString(),
      paidTotalMinor: (paidPrincipalMinor + paidInterestMinor + paidFeeMinor).toString(),
      currentStateManifestHash: hashM1BAcceptanceManifest(installments),
      allPaid: true,
      installmentIdsIncluded: false
    }),
    executionReceipt: Object.freeze({
      sandboxExecutionReceiptId: execution.id,
      receiptHash: execution.receipt_hash,
      obligationId: execution.obligation_id,
      subjectId: execution.subject_id,
      assetId: execution.asset_id,
      amountMinor: executionAmountMinor,
      adapterId: execution.adapter_id,
      adapterVersion: execution.adapter_version,
      adapterKeyId: execution.adapter_key_id,
      adapterMessageHash: execution.adapter_message_hash,
      adapterIssuedAt: iso(execution.adapter_issued_at),
      executedAt: iso(execution.executed_at),
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: execution.schema_version
    }),
    repayment: Object.freeze({
      repaymentId: repayment.id,
      repaymentHash: repayment.repayment_hash,
      obligationId: repayment.obligation_id,
      subjectId: repayment.subject_id,
      assetId: repayment.asset_id,
      requestedMinor: repaymentMinor.requested_minor,
      appliedMinor: repaymentMinor.applied_minor,
      appliedFeeMinor: repaymentMinor.applied_fee_minor,
      appliedInterestMinor: repaymentMinor.applied_interest_minor,
      appliedPrincipalMinor: repaymentMinor.applied_principal_minor,
      surplusMinor: repaymentMinor.surplus_minor,
      remainingPrincipalMinor: repaymentMinor.remaining_principal_minor,
      remainingInterestMinor: repaymentMinor.remaining_interest_minor,
      remainingFeesMinor: repaymentMinor.remaining_fees_minor,
      sourceCode: repayment.source_code,
      actorHash: repayment.actor_hash,
      accruedInterestMinor: repaymentMinor.accrued_interest_minor,
      accrualDays: Number(repayment.accrual_days),
      ledgerTransactionId: repayment.ledger_transaction_id,
      interestLedgerTransactionId: repayment.interest_ledger_transaction_id,
      occurredAt: iso(repayment.occurred_at),
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: repayment.schema_version
    }),
    principalLedgerTransaction: principal,
    repaymentLedgerTransaction: repaymentTransaction,
    interestLedgerTransaction: interest
  });
}
