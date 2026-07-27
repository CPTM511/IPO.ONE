import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FEE_AUDIT_POLICY,
  createOfficialReportArtifact,
  officialReportEffectiveStatus,
  revokeOfficialReportArtifact,
  verifyOfficialReportContent
} from "../src/index.js";

const checkedInFeeAuditPolicy = JSON.parse(await readFile(
  new URL("../../../product/policies/ipo-one.fee-audit-policy.v1.json", import.meta.url),
  "utf8"
));

const obligation = Object.freeze({
  obligationId: "obligation_report_test",
  subjectId: "subject_report_test",
  principalId: "principal_report_test",
  assetId: "eip155:84532/erc20:0x1111111111111111111111111111111111111111",
  status: "active",
  originalPrincipalMinor: "10000",
  outstandingPrincipalMinor: "8000",
  totalRepaidMinor: "2000",
  accruedInterestMinor: "100",
  accruedFeesMinor: "25",
  outstandingFeesMinor: "20",
  originationFeeMinor: "5",
  maturityAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  sandboxOnly: true,
  productionFundsMoved: false,
  schemaVersion: "obligation.v2"
});

const evidence = Object.freeze([{
  evidenceId: "evidence_report_test",
  evidenceHash: `0x${"1".repeat(64)}`,
  eventType: "repayment_posted",
  aggregateType: "obligation",
  aggregateId: obligation.obligationId,
  aggregateVersion: 2,
  obligationId: obligation.obligationId,
  sourceFinality: "finalized",
  payloadHash: `0x${"2".repeat(64)}`,
  occurredAt: "2026-07-24T00:00:00.000Z",
  recordedAt: "2026-07-24T00:00:01.000Z"
}]);

function create(format = "json") {
  return createOfficialReportArtifact({
    reportId: "official_report_test",
    format,
    obligation,
    evidence,
    controllerActorRefHash: `0x${"3".repeat(64)}`,
    lifetimeSeconds: 900,
    now: new Date("2026-07-24T00:00:02.000Z")
  });
}

test("official JSON report is server-authored, hashed, redacted, and fee-policy closed", () => {
  const artifact = create();
  const verification = verifyOfficialReportContent(artifact);
  assert.equal(verification.verified, true);
  assert.match(artifact.contentSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(artifact.browserAuthored, false);
  assert.equal(artifact.piiIncluded, false);
  assert.equal(artifact.objectAccessExpires, true);
  assert.equal(FEE_AUDIT_POLICY.productionPolicyAvailable, false);
  assert.equal(FEE_AUDIT_POLICY.principalAsFeeBaseAllowed, false);
  assert.equal(FEE_AUDIT_POLICY.unrealizedPnlAsFeeBaseAllowed, false);
  assert.deepEqual(FEE_AUDIT_POLICY, checkedInFeeAuditPolicy);
  assert.match(verification.content, /production_fee_policy_not_approved/);
  const parsed = JSON.parse(verification.content);
  assert.equal(parsed.source.originalPrincipalMinor, obligation.originalPrincipalMinor);
  assert.equal(parsed.source.outstandingPrincipalMinor, obligation.outstandingPrincipalMinor);
  assert.equal(parsed.source.totalRepaidMinor, obligation.totalRepaidMinor);
  assert.doesNotMatch(verification.content, /undefined/);
});

test("official CSV neutralizes spreadsheet formulas and never emits HTML", () => {
  const artifact = createOfficialReportArtifact({
    reportId: "official_report_csv_test",
    format: "csv",
    obligation: { ...obligation, status: "=HYPERLINK(1)" },
    evidence,
    controllerActorRefHash: `0x${"3".repeat(64)}`,
    now: new Date("2026-07-24T00:00:02.000Z")
  });
  const { content, verified } = verifyOfficialReportContent(artifact);
  assert.equal(verified, true);
  assert.match(content, /'=HYPERLINK/);
  assert.doesNotMatch(content, /<script|<html/i);
});

test("official report expires and revocation is terminal", () => {
  const artifact = create();
  assert.equal(
    officialReportEffectiveStatus(artifact, new Date("2026-07-24T00:15:03.000Z")),
    "expired"
  );
  const revoked = revokeOfficialReportArtifact({
    artifact,
    reasonCode: "owner_withdrawal",
    now: new Date("2026-07-24T00:02:00.000Z")
  });
  assert.equal(officialReportEffectiveStatus(revoked), "revoked");
  assert.throws(
    () => revokeOfficialReportArtifact({
      artifact: revoked,
      reasonCode: "owner_withdrawal",
      now: new Date("2026-07-24T00:03:00.000Z")
    }),
    { code: "invalid_official_report_artifact" }
  );
});
