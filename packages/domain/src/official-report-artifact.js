import { createHash } from "node:crypto";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { assertNoRawPiiReference } from "./validators.js";

export const OFFICIAL_REPORT_ARTIFACT_SCHEMA_VERSION = "official_report_artifact.v1";
export const OFFICIAL_REPORT_CONTENT_SCHEMA_VERSION =
  "official_obligation_activity_report_content.v1";
export const OFFICIAL_REPORT_DEFAULT_LIFETIME_SECONDS = 15 * 60;
export const OFFICIAL_REPORT_MAX_LIFETIME_SECONDS = 60 * 60;
export const OFFICIAL_REPORT_MAX_EVIDENCE_ITEMS = 50;

export const OfficialReportFormat = Object.freeze({
  JSON: "json",
  CSV: "csv"
});

export const OfficialReportStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked"
});

export const FEE_AUDIT_POLICY = Object.freeze({
  schemaVersion: "fee_audit_policy.v1",
  availability: "unavailable",
  productionPolicyAvailable: false,
  feeCalculationAuthorized: false,
  principalAsFeeBaseAllowed: false,
  unrealizedPnlAsFeeBaseAllowed: false,
  reasonCode: "production_fee_policy_not_approved"
});

const FORMAT_SET = new Set(Object.values(OfficialReportFormat));
const REVOCATION_REASON_CODES = new Set([
  "owner_withdrawal",
  "source_disclosure_error",
  "security_concern"
]);
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REPORT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function invalid(message) {
  throw new DomainError("invalid_official_report_artifact", message);
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function contentSha256(content) {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  const formulaSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replaceAll("\"", "\"\"")}"`;
}

function csvRow(values) {
  return `${values.map(csvCell).join(",")}\r\n`;
}

function safeObligation(obligation) {
  const requiredMinorFields = [
    "originalPrincipalMinor",
    "outstandingPrincipalMinor",
    "totalRepaidMinor",
    "accruedInterestMinor",
    "accruedFeesMinor",
    "outstandingFeesMinor",
    "originationFeeMinor"
  ];
  if (
    !obligation ||
    obligation.schemaVersion !== "obligation.v2" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false ||
    typeof obligation.obligationId !== "string" ||
    !IDENTIFIER_PATTERN.test(obligation.obligationId) ||
    typeof obligation.subjectId !== "string" ||
    !IDENTIFIER_PATTERN.test(obligation.subjectId) ||
    typeof obligation.principalId !== "string" ||
    !IDENTIFIER_PATTERN.test(obligation.principalId) ||
    typeof obligation.assetId !== "string" ||
    !IDENTIFIER_PATTERN.test(obligation.assetId) ||
    typeof obligation.status !== "string" ||
    requiredMinorFields.some(
      (field) => typeof obligation[field] !== "string" || !/^(0|[1-9][0-9]*)$/.test(obligation[field])
    ) ||
    typeof obligation.maturityAt !== "string" ||
    !Number.isFinite(Date.parse(obligation.maturityAt)) ||
    typeof obligation.createdAt !== "string" ||
    !Number.isFinite(Date.parse(obligation.createdAt)) ||
    typeof obligation.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(obligation.updatedAt))
  ) invalid("a durable no-funds Obligation is required");
  return {
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    principalId: obligation.principalId,
    assetId: obligation.assetId,
    status: obligation.status,
    originalPrincipalMinor: obligation.originalPrincipalMinor,
    outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
    totalRepaidMinor: obligation.totalRepaidMinor,
    accruedInterestMinor: obligation.accruedInterestMinor,
    accruedFeesMinor: obligation.accruedFeesMinor,
    outstandingFeesMinor: obligation.outstandingFeesMinor,
    originationFeeMinor: obligation.originationFeeMinor,
    maturityAt: obligation.maturityAt,
    createdAt: obligation.createdAt,
    updatedAt: obligation.updatedAt,
    sandboxOnly: true,
    productionFundsMoved: false
  };
}

function safeEvidence(items, obligationId) {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > OFFICIAL_REPORT_MAX_EVIDENCE_ITEMS
  ) invalid("a bounded Evidence set is required");
  return items.map((item) => {
    if (
      !item ||
      item.obligationId !== obligationId ||
      typeof item.evidenceId !== "string" ||
      !IDENTIFIER_PATTERN.test(item.evidenceId) ||
      typeof item.evidenceHash !== "string" ||
      !HASH_PATTERN.test(item.evidenceHash) ||
      typeof item.payloadHash !== "string" ||
      !HASH_PATTERN.test(item.payloadHash)
    ) invalid("Evidence does not match the report source");
    return {
      evidenceId: item.evidenceId,
      evidenceHash: item.evidenceHash,
      eventType: item.eventType,
      aggregateType: item.aggregateType,
      aggregateId: item.aggregateId,
      aggregateVersion: item.aggregateVersion,
      sourceFinality: item.sourceFinality,
      payloadHash: item.payloadHash,
      occurredAt: item.occurredAt,
      recordedAt: item.recordedAt
    };
  });
}

function createContent({ reportId, format, obligation, evidence, generatedAt }) {
  const document = {
    schemaVersion: OFFICIAL_REPORT_CONTENT_SCHEMA_VERSION,
    reportId,
    reportKind: "obligation_activity",
    generatedAt,
    source: obligation,
    activity: evidence,
    feeAuditPolicy: FEE_AUDIT_POLICY,
    redaction: {
      schemaVersion: "official_report_redaction.v1",
      piiIncluded: false,
      secretsIncluded: false,
      rawTransactionDataIncluded: false,
      browserAuthoredFieldsIncluded: false,
      excludedCategories: [
        "raw_kyc",
        "raw_pii",
        "credentials",
        "session_tokens",
        "wallet_private_material",
        "free_text"
      ]
    }
  };
  assertNoRawPiiReference(document, "officialReport.content");
  if (format === OfficialReportFormat.JSON) return `${canonicalJson(document)}\n`;
  let csv = csvRow(["record_type", "field", "value"]);
  for (const [field, value] of Object.entries({
    schema_version: document.schemaVersion,
    report_id: reportId,
    report_kind: document.reportKind,
    generated_at: generatedAt,
    obligation_id: obligation.obligationId,
    asset_id: obligation.assetId,
    status: obligation.status,
    original_principal_minor: obligation.originalPrincipalMinor,
    outstanding_principal_minor: obligation.outstandingPrincipalMinor,
    total_repaid_minor: obligation.totalRepaidMinor,
    accrued_interest_minor: obligation.accruedInterestMinor,
    accrued_fees_minor: obligation.accruedFeesMinor,
    outstanding_fees_minor: obligation.outstandingFeesMinor,
    origination_fee_minor: obligation.originationFeeMinor,
    production_fee_policy: FEE_AUDIT_POLICY.availability
  })) {
    csv += csvRow(["report", field, value]);
  }
  for (const item of evidence) {
    csv += csvRow([
      "evidence",
      item.eventType,
      canonicalJson({
        evidenceId: item.evidenceId,
        evidenceHash: item.evidenceHash,
        aggregateType: item.aggregateType,
        aggregateId: item.aggregateId,
        aggregateVersion: item.aggregateVersion,
        sourceFinality: item.sourceFinality,
        payloadHash: item.payloadHash,
        occurredAt: item.occurredAt,
        recordedAt: item.recordedAt
      })
    ]);
  }
  return csv;
}

export function createOfficialReportArtifact({
  reportId,
  format,
  obligation,
  evidence,
  controllerActorRefHash,
  lifetimeSeconds = OFFICIAL_REPORT_DEFAULT_LIFETIME_SECONDS,
  now = new Date()
}) {
  if (
    typeof reportId !== "string" ||
    !REPORT_ID_PATTERN.test(reportId) ||
    !FORMAT_SET.has(format) ||
    typeof controllerActorRefHash !== "string" ||
    !HASH_PATTERN.test(controllerActorRefHash) ||
    !Number.isSafeInteger(lifetimeSeconds) ||
    lifetimeSeconds < 60 ||
    lifetimeSeconds > OFFICIAL_REPORT_MAX_LIFETIME_SECONDS ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) invalid("report creation input is invalid");
  const source = safeObligation(obligation);
  const activity = safeEvidence(evidence, source.obligationId);
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1000).toISOString();
  const content = createContent({
    reportId,
    format,
    obligation: source,
    evidence: activity,
    generatedAt
  });
  const sha256 = contentSha256(content);
  const artifact = {
    officialReportId: reportId,
    reportKind: "obligation_activity",
    format,
    contentType: format === OfficialReportFormat.JSON
      ? "application/json"
      : "text/csv; charset=utf-8",
    fileName: `ipo-one-obligation-activity-${reportId}.${format}`,
    contentBase64: Buffer.from(content, "utf8").toString("base64"),
    contentSha256: sha256,
    artifactHash: hashId("official_report_artifact", {
      reportId,
      reportKind: "obligation_activity",
      format,
      contentSha256: sha256,
      sourceObligationId: source.obligationId,
      generatedAt,
      expiresAt,
      controllerActorRefHash
    }),
    sourceObligationId: source.obligationId,
    sourceEvidenceCount: activity.length,
    sourceEvidenceHeadHash: activity.at(0).evidenceHash,
    sourceEvidenceTailHash: activity.at(-1).evidenceHash,
    controllerActorRefHash,
    generatedAt,
    expiresAt,
    status: OfficialReportStatus.ACTIVE,
    version: 1,
    authorizationRevalidationRequired: true,
    objectAccessExpires: true,
    signedUrlIssued: false,
    sameTenantOnly: true,
    sandboxOnly: true,
    productionAuthority: false,
    piiIncluded: false,
    secretsIncluded: false,
    rawTransactionDataIncluded: false,
    browserAuthored: false,
    feeAuditPolicy: FEE_AUDIT_POLICY,
    schemaVersion: OFFICIAL_REPORT_ARTIFACT_SCHEMA_VERSION
  };
  assertNoRawPiiReference(artifact, "officialReport.artifact");
  return Object.freeze(artifact);
}

export function officialReportEffectiveStatus(artifact, now = new Date()) {
  if (artifact?.status === OfficialReportStatus.REVOKED) return "revoked";
  return now >= new Date(artifact.expiresAt) ? "expired" : "active";
}

export function verifyOfficialReportContent(artifact) {
  if (
    artifact?.schemaVersion !== OFFICIAL_REPORT_ARTIFACT_SCHEMA_VERSION ||
    typeof artifact.contentBase64 !== "string" ||
    artifact.contentBase64.length % 4 !== 0 ||
    !BASE64_PATTERN.test(artifact.contentBase64) ||
    typeof artifact.contentSha256 !== "string" ||
    !SHA256_PATTERN.test(artifact.contentSha256)
  ) invalid("report artifact is invalid");
  let content;
  try {
    content = Buffer.from(artifact.contentBase64, "base64").toString("utf8");
  } catch {
    invalid("report content is invalid");
  }
  return {
    verified: contentSha256(content) === artifact.contentSha256,
    content
  };
}

export function revokeOfficialReportArtifact({
  artifact,
  reasonCode,
  now = new Date()
}) {
  if (
    artifact?.schemaVersion !== OFFICIAL_REPORT_ARTIFACT_SCHEMA_VERSION ||
    artifact.status !== OfficialReportStatus.ACTIVE ||
    !REVOCATION_REASON_CODES.has(reasonCode) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) invalid("report revocation input is invalid");
  return Object.freeze({
    ...artifact,
    status: OfficialReportStatus.REVOKED,
    version: artifact.version + 1,
    revokedAt: now.toISOString(),
    revocationReasonCode: reasonCode
  });
}
