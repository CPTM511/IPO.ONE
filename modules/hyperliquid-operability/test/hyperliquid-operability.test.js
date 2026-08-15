import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HyperliquidOperabilityReleaseStatus,
  compareHyperliquidRestoreManifests,
  createHyperliquidFailureDrill,
  createHyperliquidRestoreManifest,
  evaluateHyperliquidOperabilitySignal,
  evaluateHyperliquidTestnetOperabilityAssurance,
  runHyperliquidOperabilityCapacityProbe
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const [policy, schema, assuranceArtifact, artifactManifest] = await Promise.all([
  readFile(
    new URL(
      "../policy/testnet-facility-operability-policy.v1.json",
      import.meta.url
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    new URL(
      "../../../schemas/v2/hyperliquid-testnet-operability-assurance.schema.json",
      import.meta.url
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    new URL(
      "../../../docs/codex/audits/TC-403/operability-assurance.json",
      import.meta.url
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    new URL(
      "../../../docs/codex/audits/TC-403/reviewed-artifact-manifest.json",
      import.meta.url
    ),
    "utf8"
  ).then(JSON.parse)
]);
const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
})
  .addFormat("date-time", {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  })
  .compile(schema);

const NOW = "2026-07-26T08:00:00.000Z";
const RELEASE_COMMIT = "de5e72d5a912d2d55c2ce86570408f37c07d4a4f";
const ARTIFACT_SET_HASH = artifactManifest.artifactSetHash;

function restoreSnapshot(_label = "source", overrides = {}) {
  const fingerprint = (kind) =>
    hashId(`tc_403_${kind}`, { fixture: "complete", version: 1 });
  return {
    databaseFingerprint: fingerprint("database"),
    facilityFingerprint: fingerprint("facility"),
    ledgerFingerprint: fingerprint("ledger"),
    evidenceFingerprint: fingerprint("evidence"),
    executionFingerprint: fingerprint("execution"),
    riskFingerprint: fingerprint("risk"),
    reconciliationFingerprint: fingerprint("reconciliation"),
    fundingFingerprint: fingerprint("funding"),
    settlementFingerprint: fingerprint("settlement"),
    facilityCount: 1,
    ledgerTransactionCount: 12,
    ledgerEntryCount: 24,
    evidenceCount: 42,
    settlementCount: 1,
    capturedAt: NOW,
    ...overrides
  };
}

function exactRestore() {
  const source = createHyperliquidRestoreManifest(restoreSnapshot("source"));
  const restored = createHyperliquidRestoreManifest(
    restoreSnapshot("restored")
  );
  return compareHyperliquidRestoreManifests(source, restored, {
    durationMs: 12_345,
    completedAt: NOW
  });
}

function drills(overrides = {}) {
  const safeStateByScenario = {
    application_process_restart: "SETTLEMENT",
    database_process_restart: "SETTLEMENT",
    database_backup_restore: "SETTLEMENT",
    signer_loss: "REDUCE_ONLY",
    venue_outage: "REDUCE_ONLY",
    adapter_staleness: "REDUCE_ONLY",
    unknown_exchange_outcome: "REDUCE_ONLY"
  };
  const runnerByScenario = {
    application_process_restart: "tc402_postgres_event_runtime",
    database_process_restart: "tc402_postgres_event_runtime",
    database_backup_restore: "tc403_physical_pg17_drill",
    signer_loss: "tc403_network_disabled_simulation_suite",
    venue_outage: "tc403_network_disabled_simulation_suite",
    adapter_staleness: "tc403_network_disabled_simulation_suite",
    unknown_exchange_outcome: "tc403_network_disabled_simulation_suite"
  };
  return policy.requiredFailureScenarios.map((scenario) => {
    const override = overrides[scenario] ?? {};
    return {
      ...createHyperliquidFailureDrill({
        scenario,
        safeState: safeStateByScenario[scenario],
        status: override.status ?? "PASSED",
        evidence: { scenario, localOnly: true },
        runnerId: runnerByScenario[scenario],
        artifactSetHash: ARTIFACT_SET_HASH,
        startedAt: NOW,
        completedAt: NOW
      }),
      ...override
    };
  });
}

function alertRoutes() {
  return policy.alerts.map(({ signalType, owner, runbookRef }) => ({
    signalType,
    owner,
    runbookRef,
    configured: true
  }));
}

function input(overrides = {}) {
  return {
    facilityId: "trading_facility_tc403",
    facilityHash: hashId("tc_403_facility", { version: 1 }),
    releaseCommit: RELEASE_COMMIT,
    artifactSetHash: ARTIFACT_SET_HASH,
    restoreResult: exactRestore(),
    failureDrills: drills(),
    alertRoutes: alertRoutes(),
    capacityResult: runHyperliquidOperabilityCapacityProbe(policy),
    findings: [],
    independentReview: {
      status: "NOT_PERFORMED",
      reviewerId: null,
      reviewerType: null,
      reportHash: null,
      attestationHash: null,
      reviewedAt: null,
      reviewedReleaseCommit: null,
      reviewedArtifactSetHash: null,
      reviewedPolicyHash: null,
      findingsHash: null,
      independentFromCommissioningOwner: false
    },
    completedAt: NOW,
    ...overrides
  };
}

test("physical restore manifests require complete Facility, Ledger, Evidence, and settlement truth", () => {
  const source = createHyperliquidRestoreManifest(restoreSnapshot("source"));
  const restored = createHyperliquidRestoreManifest(
    restoreSnapshot("restored")
  );
  const result = exactRestore();
  assert.equal(result.status, "EXACT_MATCH");
  assert.equal(result.exactMatch, true);
  assert.deepEqual(result.mismatchFields, []);

  const changed = createHyperliquidRestoreManifest(
    restoreSnapshot("changed", {
      evidenceFingerprint: hashId("tc_403_evidence", {
        fixture: "tampered"
      })
    })
  );
  const mismatch = compareHyperliquidRestoreManifests(
    createHyperliquidRestoreManifest(restoreSnapshot("source")),
    changed,
    { durationMs: 100, completedAt: NOW }
  );
  assert.equal(mismatch.status, "MISMATCH");
  assert.deepEqual(mismatch.mismatchFields, ["evidenceFingerprint"]);
  assert.throws(
    () =>
      compareHyperliquidRestoreManifests(
        source,
        {
          ...restored,
          facilityFingerprint: hashId("tc_403_forged_facility", {
            invalid: true
          })
        },
        { durationMs: 100, completedAt: NOW }
      ),
    /hash does not match/
  );

  assert.throws(
    () =>
      createHyperliquidRestoreManifest(
        restoreSnapshot("empty", { facilityCount: 0 })
      ),
    /must contain Facility, Ledger, Evidence/
  );
});

test("complete local assurance remains blocked until independent review", () => {
  const result = evaluateHyperliquidTestnetOperabilityAssurance(input(), {
    policy
  });
  assert.equal(result.implementationStatus, "IMPLEMENTED_UNVERIFIED");
  assert.equal(
    result.releaseStatus,
    HyperliquidOperabilityReleaseStatus.BLOCKED_INDEPENDENT_REVIEW
  );
  assert.equal(result.launchBlocked, true);
  assert.deepEqual(result.blockerReasonCodes, [
    "independent_review_not_accepted"
  ]);
  assert.equal(result.openP0Count, 0);
  assert.equal(result.openP1Count, 0);
  assert.equal(result.exchangeWritesEnabled, false);
  assert.equal(result.apiWalletOperationsEnabled, false);
  assert.equal(result.mainnetAuthority, false);
  assert.equal(result.productionAuthority, false);
  assert.equal(result.fundsAuthority, false);
  assert.equal(result.realFunds, false);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
});

test("checked-in TC-403 assurance is schema-valid and truthfully blocked", () => {
  assert.equal(
    validate(assuranceArtifact),
    true,
    JSON.stringify(validate.errors)
  );
  assert.equal(
    assuranceArtifact.implementationStatus,
    "IMPLEMENTED_UNVERIFIED"
  );
  assert.equal(
    assuranceArtifact.releaseStatus,
    "BLOCKED_INDEPENDENT_REVIEW"
  );
  assert.equal(assuranceArtifact.artifactSetHash, ARTIFACT_SET_HASH);
  assert.equal(assuranceArtifact.launchBlocked, true);
  assert.equal(assuranceArtifact.independentReview.status, "NOT_PERFORMED");
  assert.equal(assuranceArtifact.openP0Count, 0);
  assert.equal(assuranceArtifact.openP1Count, 0);
  assert.equal(assuranceArtifact.restoreResult.exactMatch, true);
  assert.deepEqual(assuranceArtifact.restoreResult.mismatchFields, []);
  const {
    assuranceId,
    assuranceHash,
    ...assuranceBody
  } = assuranceArtifact;
  assert.equal(
    assuranceHash,
    hashId("tc_403_operability_assurance", assuranceBody)
  );
  assert.equal(
    assuranceId,
    `hyperliquid_testnet_operability_${assuranceHash.slice(2)}`
  );
});

test("reviewed artifact manifest remains content-addressed historical Evidence and excludes successor audit output", () => {
  const {
    schemaVersion,
    artifactSetHash,
    fileCount,
    ...manifestBody
  } = artifactManifest;
  assert.equal(schemaVersion, "tc_403_reviewed_artifact_manifest.v1");
  assert.equal(
    artifactSetHash,
    hashId("tc_403_reviewed_artifact_set", manifestBody)
  );
  assert.equal(fileCount, artifactManifest.entries.length);
  assert.equal(
    new Set(artifactManifest.entries.map(({ path }) => path)).size,
    fileCount
  );
  assert.equal(artifactManifest.releaseCommit, RELEASE_COMMIT);
  assert.ok(artifactManifest.fileCount > 300);
  assert.equal(
    artifactManifest.entries.some(({ path }) =>
      path.startsWith("docs/codex/audits/RELEASE-001/")
    ),
    false
  );
  assert.equal(
    artifactManifest.entries.some(({ path }) =>
      path.startsWith("docs/codex/audits/REALVALUE-001/")
    ),
    false
  );
});

test("reviewer assignment cannot be injected through an unapproved policy", () => {
  const reviewedPolicy = structuredClone(policy);
  reviewedPolicy.accountability.independentReviewer =
    "external_security_reviewer_fixture";
  reviewedPolicy.accountability.independentReviewerType =
    "external_human_or_organization";
  const policyHash = hashId(
    "tc_403_operability_policy",
    reviewedPolicy
  );
  const findingsHash = hashId(
    "tc_403_independent_review_findings",
    []
  );
  const reviewBody = {
    reviewerId: "external_security_reviewer_fixture",
    reviewerType: "external_human_or_organization",
    reviewedAt: NOW,
    reviewedReleaseCommit: RELEASE_COMMIT,
    reviewedArtifactSetHash: ARTIFACT_SET_HASH,
    reviewedPolicyHash: policyHash,
    findingsHash,
    independentFromCommissioningOwner: true
  };
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(
        input({
          independentReview: {
            status: "PASSED",
            ...reviewBody,
            reportHash: hashId(
              "tc_403_independent_review_report",
              reviewBody
            ),
            attestationHash: hashId(
              "tc_403_external_attestation_fixture",
              { reviewBody }
            )
          }
        }),
        { policy: reviewedPolicy }
      ),
    /not the source-approved policy artifact/
  );

  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(
        input({
          independentReview: {
            status: "PASSED",
            reviewerId: "unassigned_reviewer_fixture",
            reviewerType: "external_human_or_organization",
            reportHash: hashId("tc_403_unassigned_review", {
              invalid: true
            }),
            attestationHash: hashId("tc_403_unassigned_attestation", {
              invalid: true
            }),
            reviewedAt: NOW,
            reviewedReleaseCommit: RELEASE_COMMIT,
            reviewedArtifactSetHash: ARTIFACT_SET_HASH,
            reviewedPolicyHash: hashId(
              "tc_403_operability_policy",
              policy
            ),
            findingsHash,
            independentFromCommissioningOwner: true
          }
        }),
        { policy }
      ),
    /externally assigned and bound/
  );

  const result = evaluateHyperliquidTestnetOperabilityAssurance(input(), {
    policy
  });
  assert.equal(
    result.releaseStatus,
    HyperliquidOperabilityReleaseStatus.BLOCKED_INDEPENDENT_REVIEW
  );
  assert.equal(result.launchBlocked, true);
});

test("open P0/P1 findings and incomplete failure drills hard-block release", () => {
  const openFinding = {
    findingId: "TC403-P1-001",
    severity: "P1",
    status: "accepted_launch_blocker",
    summary: "external_review_not_completed",
    evidenceHash: hashId("tc_403_finding", { id: "TC403-P1-001" }),
    retestEvidenceHash: null
  };
  const findingBlocked = evaluateHyperliquidTestnetOperabilityAssurance(
    input({ findings: [openFinding] }),
    { policy }
  );
  assert.equal(findingBlocked.releaseStatus, "BLOCKED_FINDINGS");
  assert.equal(findingBlocked.openP1Count, 1);
  assert.equal(findingBlocked.launchBlocked, true);

  const failureBlocked = evaluateHyperliquidTestnetOperabilityAssurance(
    input({
      failureDrills: drills({
        venue_outage: {
          status: "FAILED",
          historyPreserved: false
        }
      })
    }),
    { policy }
  );
  assert.equal(failureBlocked.implementationStatus, "BLOCKED");
  assert.equal(failureBlocked.releaseStatus, "BLOCKED_ASSURANCE");
  assert.deepEqual(failureBlocked.failedFailureScenarios, ["venue_outage"]);
});

test("signer, venue, stale-data, and unknown-outcome drills cannot write or retry", () => {
  for (const drill of drills()) {
    assert.equal(drill.status, "PASSED");
    assert.equal(drill.newRiskBlocked, true);
    assert.equal(drill.uncertainEffectRetried, false);
    assert.equal(drill.historyPreserved, true);
    assert.equal(drill.externalWriteSubmitted, false);
    assert.equal(drill.credentialOperationPerformed, false);
  }
});

test("staleness and reconciliation alerts use server time and never execute actions", () => {
  const nowMs = new Date(NOW).getTime();
  const evidenceHash = hashId("tc_403_alert_evidence", { version: 1 });
  const fresh = evaluateHyperliquidOperabilitySignal(
    {
      signalType: "risk_data_stale",
      sourceEvidenceHash: evidenceHash,
      observedAt: new Date(nowMs - 29_999).toISOString()
    },
    { policy, clock: () => nowMs }
  );
  assert.equal(fresh, null);
  const warning = evaluateHyperliquidOperabilitySignal(
    {
      signalType: "risk_data_stale",
      sourceEvidenceHash: evidenceHash,
      observedAt: new Date(nowMs - 30_000).toISOString()
    },
    { policy, clock: () => nowMs }
  );
  assert.equal(warning.severity, "high");
  assert.equal(warning.thresholdMs, 30_000);
  assert.equal(warning.newRiskBlocked, true);
  assert.equal(warning.notificationDeliveryAttempted, false);
  assert.equal(warning.automaticActionTaken, false);
  assert.equal(warning.exchangeWriteSubmitted, false);
  assert.equal(warning.credentialOperationPerformed, false);
  const critical = evaluateHyperliquidOperabilitySignal(
    {
      signalType: "reconciliation_slo_breached",
      sourceEvidenceHash: evidenceHash,
      observedAt: new Date(nowMs - 120_000).toISOString()
    },
    { policy, clock: () => nowMs }
  );
  assert.equal(critical.severity, "critical");
  assert.equal(critical.thresholdMs, 120_000);
  assert.equal(critical.owner, "ipo_one_founder");
  assert.equal(
    critical.runbookRef,
    "TC403-RUNBOOK-RECONCILIATION"
  );
  const signer = evaluateHyperliquidOperabilitySignal(
    {
      signalType: "signer_unavailable_or_revoked",
      sourceEvidenceHash: evidenceHash,
      observedAt: NOW
    },
    { policy, clock: () => nowMs }
  );
  assert.equal(signer.severity, "critical");
  assert.equal(signer.thresholdMs, 0);
  assert.throws(
    () =>
      evaluateHyperliquidOperabilitySignal(
        {
          signalType: "unapproved_signal",
          sourceEvidenceHash: evidenceHash,
          observedAt: NOW
        },
        { policy, clock: () => nowMs }
      ),
    /not in the closed alert policy/
  );
});

test("capacity probe is deterministic, bounded, and rejects oversize inputs", () => {
  const first = runHyperliquidOperabilityCapacityProbe(policy);
  const second = runHyperliquidOperabilityCapacityProbe(policy);
  assert.deepEqual(first, second);
  assert.equal(first.attemptedEvaluations, 2048);
  assert.equal(
    first.completedEvaluations + first.rejectedOversizeInputs,
    first.attemptedEvaluations
  );
  assert.ok(first.rejectedOversizeInputs > 0);
  assert.equal(first.probeKind, "boundary_arithmetic_self_test");
  assert.equal(first.configuredConcurrencyCeiling, 8);
  assert.equal(first.bounded, true);
  assert.equal(first.failClosed, true);
});

test("open input shapes, missing alerts, and oversized arrays fail closed", () => {
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(
        { ...input(), unexpectedAuthority: true },
        { policy }
      ),
    /open or incomplete shape/
  );
  const missingAlert = evaluateHyperliquidTestnetOperabilityAssurance(
    input({ alertRoutes: alertRoutes().slice(1) }),
    { policy }
  );
  assert.equal(missingAlert.releaseStatus, "BLOCKED_ASSURANCE");
  assert.deepEqual(missingAlert.missingAlertRoutes, ["risk_data_stale"]);
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(
        input({
          findings: Array.from(
            { length: policy.capacity.maximumFindings + 1 },
            (_, index) => ({
              findingId: `P2_${index}`,
              severity: "P2",
              status: "resolved",
              summary: `bounded_finding_${index}`,
              evidenceHash: hashId("tc_403_bounded_finding", { index }),
              retestEvidenceHash: hashId("tc_403_bounded_retest", { index })
            })
          )
        }),
        { policy }
      ),
    /exceed the policy bound/
  );
  const oversized = input();
  oversized.findings = [
    {
      findingId: "P2_OVERSIZE",
      severity: "P2",
      status: "resolved",
      summary: `bounded_${"a".repeat(
        policy.capacity.maximumAssuranceInputBytes
      )}`,
      evidenceHash: hashId("tc_403_oversize", { version: 1 }),
      retestEvidenceHash: hashId("tc_403_oversize_retest", { version: 1 })
    }
  ];
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(oversized, { policy }),
    /exceeds the policy byte bound/
  );
});

test("forged restore, capacity, drill, and review evidence cannot satisfy assurance", () => {
  const forgedRestore = input();
  forgedRestore.restoreResult = {
    ...forgedRestore.restoreResult,
    comparedFields: ["fabricated"]
  };
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(forgedRestore, {
        policy
      }),
    /does not match its complete manifests/
  );

  const forgedCapacity = input();
  forgedCapacity.capacityResult = {
    ...forgedCapacity.capacityResult,
    attemptedEvaluations: 0,
    completedEvaluations: 0,
    rejectedOversizeInputs: 0,
    configuredConcurrencyCeiling: 0,
    bounded: true,
    failClosed: true
  };
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(forgedCapacity, {
        policy
      }),
    /source-fixed boundary probe/
  );

  const forgedDrill = input();
  forgedDrill.failureDrills[0] = {
    ...forgedDrill.failureDrills[0],
    artifactSetHash: hashId("tc_403_wrong_artifact_set", { version: 1 })
  };
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(forgedDrill, {
        policy
      }),
    /approved scenario and artifact set/
  );

  const resolvedWithoutRetest = input({
    findings: [
      {
        findingId: "TC403-REV-P1-001",
        severity: "P1",
        status: "resolved",
        summary: "forged_restore_capacity_and_drill_assurance",
        evidenceHash: hashId("tc_403_review_finding", { id: 1 }),
        retestEvidenceHash: null
      }
    ]
  });
  assert.throws(
    () =>
      evaluateHyperliquidTestnetOperabilityAssurance(
        resolvedWithoutRetest,
        { policy }
      ),
    /resolved findings require retest evidence/
  );
});
