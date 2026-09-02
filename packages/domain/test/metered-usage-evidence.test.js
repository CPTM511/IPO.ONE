import assert from "node:assert/strict";
import { test } from "node:test";
import {
  admitMeteredUsageEvidence,
  createMeteredUsageLedgerPosting,
  createMeteredUsageEvidence,
  createMeteredUsagePolicy
} from "../src/index.js";

const HASH = `0x${"1".repeat(64)}`;
const OTHER_HASH = `0x${"2".repeat(64)}`;

function policy(overrides = {}) {
  return createMeteredUsagePolicy({
    policyId: "resource_policy_001",
    tenantId: "tenant_001",
    subjectId: "subject_agent_001",
    principalId: "principal_001",
    mandateId: "mandate_001",
    facilityId: "facility_001",
    authorizationId: "authorization_001",
    obligationId: "obligation_001",
    providerId: "provider_synthetic_001",
    resourceClass: "inference_tokens",
    measurementUnit: "token",
    priceScheduleHash: HASH,
    unitPriceMinor: "2",
    assetId: "iso4217:USD",
    maxQuantityPerEvent: "1000",
    maxChargePerEventMinor: "2000",
    maxChargePerWindowMinor: "5000",
    validFrom: "2026-09-02T00:00:00.000Z",
    expiresAt: "2026-09-03T00:00:00.000Z",
    ...overrides
  });
}

function usage(overrides = {}) {
  return createMeteredUsageEvidence({
    usageEvidenceId: "usage_001",
    providerEventId: "provider_event_001",
    nonce: "nonce_001",
    tenantId: "tenant_001",
    subjectId: "subject_agent_001",
    principalId: "principal_001",
    mandateId: "mandate_001",
    facilityId: "facility_001",
    authorizationId: "authorization_001",
    obligationId: "obligation_001",
    providerId: "provider_synthetic_001",
    resourceClass: "inference_tokens",
    measurementUnit: "token",
    quantity: "250",
    priceScheduleHash: HASH,
    unitPriceMinor: "2",
    chargeMinor: "500",
    assetId: "iso4217:USD",
    windowStartedAt: "2026-09-02T01:00:00.000Z",
    windowEndedAt: "2026-09-02T01:05:00.000Z",
    observedAt: "2026-09-02T01:05:01.000Z",
    finality: "finalized",
    reconciliation: "reconciled",
    providerKeyId: "synthetic_key_v1",
    providerPayloadHash: OTHER_HASH,
    ...overrides
  });
}

test("admits exact finalized metered usage and calculates one canonical charge", () => {
  const result = admitMeteredUsageEvidence({
    policy: policy(),
    evidence: usage(),
    windowChargeBeforeMinor: "0",
    admittedAt: "2026-09-02T01:05:02.000Z"
  });
  assert.equal(result.chargeMinor, "500");
  assert.equal(result.chargeDeltaMinor, "500");
  assert.equal(result.correctionOfUsageEvidenceId, null);
  assert.equal(result.windowChargeAfterMinor, "500");
  assert.equal(result.sandboxOnly, true);
  assert.equal(result.productionFundsMoved, false);
  assert.match(result.meteredUsageAdmissionId, /^metered_usage_admission_[0-9a-f]{64}$/);
  assert.equal(result.obligationId, "obligation_001");
  assert.match(result.admissionHash, /^0x[0-9a-f]{64}$/);
});

test("preserves original Evidence and posts one signed additive correction delta", () => {
  const originalEvidence = usage();
  const originalAdmission = admitMeteredUsageEvidence({
    policy: policy(),
    evidence: originalEvidence,
    windowChargeBeforeMinor: "0",
    admittedAt: "2026-09-02T01:05:02.000Z"
  });
  const correctionEvidence = usage({
    usageEvidenceId: "usage_correction_001",
    providerEventId: "provider_event_correction_001",
    nonce: "nonce_correction_001",
    correctionOfUsageEvidenceId: originalEvidence.usageEvidenceId,
    quantity: "200",
    chargeMinor: "400",
    observedAt: "2026-09-02T01:06:01.000Z"
  });
  const correction = admitMeteredUsageEvidence({
    policy: policy(),
    evidence: correctionEvidence,
    priorEvidence: originalEvidence,
    priorAdmission: originalAdmission,
    windowChargeBeforeMinor: "500",
    admittedAt: "2026-09-02T01:06:02.000Z"
  });
  assert.equal(correction.correctionOfUsageEvidenceId, originalEvidence.usageEvidenceId);
  assert.equal(correction.chargeMinor, "400");
  assert.equal(correction.chargeDeltaMinor, "-100");
  assert.equal(correction.windowChargeBeforeMinor, "500");
  assert.equal(correction.windowChargeAfterMinor, "400");
  assert.equal(originalEvidence.chargeMinor, "500");

  const posting = createMeteredUsageLedgerPosting({
    obligation: {
      obligationId: "obligation_001",
      assetId: "iso4217:USD",
      outstandingPrincipalMinor: "5000",
      executionStatus: "executed",
      status: "active",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "obligation.v2"
    },
    admission: correction
  });
  assert.equal(posting.transaction.transactionType, "metered_service_correction");
  assert.equal(posting.transaction.debitTotalMinor, "100");
  assert.equal(posting.transaction.entries[0].direction, "debit");
  assert.equal(posting.transaction.entries[0].ledgerAccountId, posting.accounts[1].ledgerAccountId);
});

test("posts an admitted charge to the existing canonical Ledger without moving funds", () => {
  const admission = admitMeteredUsageEvidence({
    policy: policy(),
    evidence: usage(),
    windowChargeBeforeMinor: "0",
    admittedAt: "2026-09-02T01:05:02.000Z"
  });
  const posting = createMeteredUsageLedgerPosting({
    obligation: {
      obligationId: "obligation_001",
      assetId: "iso4217:USD",
      outstandingPrincipalMinor: "5000",
      executionStatus: "executed",
      status: "active",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "obligation.v2"
    },
    admission
  });
  assert.equal(posting.transaction.transactionType, "metered_service_charge");
  assert.equal(posting.transaction.debitTotalMinor, "500");
  assert.equal(posting.transaction.creditTotalMinor, "500");
  assert.equal(posting.transaction.entries.length, 2);
  assert.deepEqual(posting.accounts.map((account) => account.accountType), [
    "metered_service_expense",
    "synthetic_provider_payable"
  ]);
  assert.equal(posting.productionFundsMoved, false);
});

test("rejects price drift, wrong scope, over-cap and unreconciled usage", () => {
  for (const evidence of [
    usage({ priceScheduleHash: OTHER_HASH }),
    usage({ providerId: "provider_wrong" }),
    usage({ quantity: "1001", chargeMinor: "2002" }),
    usage({ reconciliation: "pending" })
  ]) {
    assert.throws(
      () => admitMeteredUsageEvidence({ policy: policy(), evidence, windowChargeBeforeMinor: "0" }),
      /metered_usage_/
    );
  }
});

test("rejects caller arithmetic drift and expired or revoked authority", () => {
  assert.throws(() => usage({ chargeMinor: "499" }), /metered_usage_charge_mismatch/);
  assert.throws(
    () => admitMeteredUsageEvidence({ policy: policy({ status: "revoked" }), evidence: usage(), windowChargeBeforeMinor: "0" }),
    /metered_usage_policy_inactive/
  );
  assert.throws(
    () => admitMeteredUsageEvidence({ policy: policy(), evidence: usage(), windowChargeBeforeMinor: "0", admittedAt: "2026-09-03T00:00:00.000Z" }),
    /metered_usage_policy_expired/
  );
});

test("returns byte-semantic replay identity and rejects a conflicting duplicate", () => {
  const first = usage();
  const replay = usage();
  assert.equal(first.usageEvidenceHash, replay.usageEvidenceHash);
  const conflict = usage({ quantity: "251", chargeMinor: "502" });
  assert.notEqual(first.usageEvidenceHash, conflict.usageEvidenceHash);
  assert.equal(first.providerEventId, conflict.providerEventId);
});
