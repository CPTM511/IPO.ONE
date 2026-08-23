import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  M2A008IndependentReviewError,
  verifyM2A008IndependentReview
} from "../../../scripts/verify-m2a-008-independent-review.mjs";

const RELEASE_SHA = "a".repeat(40);
const REPORT = Buffer.from("independent M2A-008 report fixture\n");
const REPORT_SHA256 = `sha256:${createHash("sha256").update(REPORT).digest("hex")}`;
const NOW = new Date("2026-08-23T12:00:00.000Z");

function attestation(overrides = {}) {
  const base = {
    schemaVersion: "m2a_008_independent_contract_review.v1",
    reviewId: "M2A-008-REVIEW-20260823-0001",
    reviewer: {
      name: "External Reviewer",
      organizationOrIndependentCapacity: "Independent security consultant",
      ownerRole: "Independent Security"
    },
    release: {
      repository: "CPTM511/IPO.ONE",
      commitSha: RELEASE_SHA,
      sourceSha256: {
        oracleAdapter: "sha256:29fcf0d1775b2d7be2e4c478cbaa4e072e4bb63394cae648ac0027411bb5ed34",
        securedPool: "sha256:7982c23b405958a85ae3035f3e4ba9c69b92a46ade9fcabd3f02b5ec741028ca",
        securedPoolMath: "sha256:7eb4731af2ded7e4a1fefb22352e4b4100e275cb702516ab09233d3376382f09"
      },
      solidityVersion: "0.8.30+commit.73712a01",
      optimizerRuns: 200
    },
    review: {
      conclusion: "approved_with_resolved_findings",
      completedAt: "2026-08-23T10:00:00.000Z",
      methods: ["manual source review", "Foundry fuzz and invariant review"],
      findingSummary: {
        total: 2,
        resolved: 2,
        openCritical: 0,
        openHigh: 0
      },
      residualRisks: ["Base Sepolia dependencies remain external test services."],
      reportUrl: `https://github.com/CPTM511/IPO.ONE/blob/${"b".repeat(40)}/review.md`,
      reportSha256: REPORT_SHA256
    },
    scope: {
      chainId: "eip155:84532",
      testAssetsOnly: true,
      mainnetAuthorized: false,
      realFundsAuthorized: false
    },
    independentReviewAttested: true
  };
  return {
    ...base,
    ...overrides,
    reviewer: { ...base.reviewer, ...(overrides.reviewer ?? {}) },
    release: {
      ...base.release,
      ...(overrides.release ?? {}),
      sourceSha256: {
        ...base.release.sourceSha256,
        ...(overrides.release?.sourceSha256 ?? {})
      }
    },
    review: {
      ...base.review,
      ...(overrides.review ?? {}),
      findingSummary: {
        ...base.review.findingSummary,
        ...(overrides.review?.findingSummary ?? {})
      }
    },
    scope: { ...base.scope, ...(overrides.scope ?? {}) }
  };
}

test("verified independent review produces the exact launch gate record", async () => {
  const result = await verifyM2A008IndependentReview(attestation(), {
    expectedCommitSha: RELEASE_SHA,
    reportBytes: REPORT,
    now: NOW
  });
  assert.deepEqual(result.gate, {
    id: "independent_contract_review",
    status: "approved",
    ownerRole: "Independent Security",
    approvedBy: "External Reviewer",
    approvedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-09-22T10:00:00.000Z",
    evidenceUrl: `https://github.com/CPTM511/IPO.ONE/blob/${"b".repeat(40)}/review.md`
  });
  assert.equal(result.releaseCommitSha, RELEASE_SHA);
  assert.equal(result.testAssetsOnly, true);
  assert.equal(result.mainnetAuthorized, false);
  assert.equal(result.realFundsAuthorized, false);
});

test("review verifier rejects pending, stale, drifted, mutable or unsafe Evidence", async () => {
  const cases = [
    attestation({ review: { conclusion: "pending" } }),
    attestation({ review: { completedAt: "2026-07-01T00:00:00.000Z" } }),
    attestation({ release: { commitSha: "b".repeat(40) } }),
    attestation({
      release: { sourceSha256: { oracleAdapter: `sha256:${"c".repeat(64)}` } }
    }),
    attestation({ review: { findingSummary: { openHigh: 1 } } }),
    attestation({ review: { reportUrl: "https://example.com/latest/report.md" } }),
    attestation({ reviewer: { name: "PENDING REVIEWER" } }),
    attestation({ mainnetAuthorized: true })
  ];
  for (const input of cases) {
    await assert.rejects(
      verifyM2A008IndependentReview(input, {
        expectedCommitSha: RELEASE_SHA,
        reportBytes: REPORT,
        now: NOW
      }),
      M2A008IndependentReviewError
    );
  }
  await assert.rejects(
    verifyM2A008IndependentReview(attestation(), {
      expectedCommitSha: RELEASE_SHA,
      reportBytes: Buffer.from("different report"),
      now: NOW
    }),
    (error) =>
      error instanceof M2A008IndependentReviewError &&
      error.issues.some((issue) => issue.includes("report bytes do not match"))
  );
});
