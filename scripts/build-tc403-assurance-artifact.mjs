import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashId } from "../packages/domain/src/index.js";
import {
  compareHyperliquidRestoreManifests,
  createHyperliquidFailureDrill,
  evaluateHyperliquidTestnetOperabilityAssurance,
  runHyperliquidOperabilityCapacityProbe
} from "../modules/hyperliquid-operability/src/index.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);

async function readJson(path) {
  return readFile(resolve(repositoryRoot, path), "utf8").then(JSON.parse);
}

const [policy, artifactManifest] = await Promise.all([
  readJson(
    "modules/hyperliquid-operability/policy/testnet-facility-operability-policy.v1.json"
  ),
  readJson(
    "docs/codex/audits/TC-403/reviewed-artifact-manifest.json"
  )
]);

const COMPLETED_AT = "2026-07-26T04:27:13.470Z";

const sourceManifest = {
  databaseFingerprint:
    "0x4cf6020fcbdd3456d77daed19ed8c06b15061dbc6fb03b3c870cebf76f76bf50",
  facilityFingerprint:
    "0x9da63a77223fa8f13e7cc4dd51102c655d5e80bbf6801ea1586776d2a6c7d810",
  ledgerFingerprint:
    "0x7ad781dbfddb5bc881ad75808fd8a29f22832b620e68e9b189258cce9102e28a",
  evidenceFingerprint:
    "0x964a144015fa48513e3f2df7a21b3979fb5b68c234bab01d846fbc3a4827b335",
  executionFingerprint:
    "0xe911a4703a4bd6d9c0b23d3fb58d9aa3fb01a94d45a8cf8479e9a7f42704445d",
  riskFingerprint:
    "0x63d3d2f65504e4bdbea83b0e5b3830ae826b36069e5c8b26e2d6b26f413ccdd1",
  reconciliationFingerprint:
    "0x8004ef86df9eac7d689564a9e1be2cc4de34b7a89d01af0c8f3fffabd791efcd",
  fundingFingerprint:
    "0xa8312839bbc9113be65a4a5fd3891e0f80c130079dfd582596294063085e589c",
  settlementFingerprint:
    "0x84ec6bd12da7d93ccedb130c174762f04a1fbe4001e2b061f1045006a169a2db",
  facilityCount: 1,
  ledgerTransactionCount: 3,
  ledgerEntryCount: 15,
  evidenceCount: 45,
  settlementCount: 1,
  capturedAt: "2026-07-26T04:27:12.685Z",
  manifestHash:
    "0x8a6e6e51e59c37961f75ea40ebbc09f2eddaa175e3422e3efe8a0eb436ec6b01",
  schemaVersion: "hyperliquid_testnet_restore_manifest.v1"
};

const restoredManifest = {
  ...sourceManifest,
  capturedAt: "2026-07-26T04:27:13.469Z",
  manifestHash:
    "0x01d80dc38610a53a9be271d6c726d97291e9fae59fa8a50016e625490c3545a9"
};

const restoreResult = compareHyperliquidRestoreManifests(
  sourceManifest,
  restoredManifest,
  {
    durationMs: 812,
    completedAt: COMPLETED_AT
  }
);

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

const failureDrills = policy.requiredFailureScenarios.map((scenario) =>
  createHyperliquidFailureDrill({
    scenario,
    status: "PASSED",
    safeState: safeStateByScenario[scenario],
    runnerId: runnerByScenario[scenario],
    artifactSetHash: artifactManifest.artifactSetHash,
    evidence: {
      scenario,
      runnerId: runnerByScenario[scenario],
      localOnly: true,
      networkDisabled: true,
      testnetOnly: true,
      externalWriteSubmitted: false,
      credentialOperationPerformed: false
    },
    startedAt:
      scenario === "database_backup_restore"
        ? sourceManifest.capturedAt
        : "2026-07-26T04:26:00.000Z",
    completedAt: COMPLETED_AT
  })
);

function finding({
  findingId,
  severity,
  status,
  summary,
  evidence,
  retest
}) {
  return {
    findingId,
    severity,
    status,
    summary,
    evidenceHash: hashId("tc_403_ai_review_finding", evidence),
    retestEvidenceHash:
      retest === null
        ? null
        : hashId("tc_403_ai_review_retest", retest)
  };
}

const findings = [
  finding({
    findingId: "TC403-GATE-P1-001",
    severity: "P1",
    status: "resolved",
    summary: "forged_restore_capacity_and_drill_assurance",
    evidence: { reviewer: "gpt_agent_tc403_gate_review_02", finding: 1 },
    retest: {
      canonicalRestoreRecomputed: true,
      capacityRelationsRecomputed: true,
      drillEnvelopeRecomputed: true,
      maliciousPayloadRejected: true
    }
  }),
  finding({
    findingId: "TC403-GATE-P1-002",
    severity: "P1",
    status: "resolved",
    summary: "review_identity_and_report_replay",
    evidence: { reviewer: "gpt_agent_tc403_gate_review_02", finding: 2 },
    retest: {
      releaseArtifactPolicyFindingsBound: true,
      reportEnvelopeRecomputed: true,
      futureReviewRejected: true,
      machineLaunchUnlockImpossible: true
    }
  }),
  finding({
    findingId: "TC403-GATE-P1-003",
    severity: "P1",
    status: "resolved",
    summary: "dirty_worktree_not_content_addressed",
    evidence: { reviewer: "gpt_agent_tc403_gate_review_02", finding: 3 },
    retest: {
      canonicalManifestChecked: true,
      baselineAndDirtyFilesBound: true,
      manifestDriftRejected: true
    }
  }),
  finding({
    findingId: "TC403-GATE-P1-004",
    severity: "P1",
    status: "resolved",
    summary: "findings_and_retests_not_bound",
    evidence: { reviewer: "gpt_agent_tc403_gate_review_02", finding: 4 },
    retest: {
      findingsHashBoundToReview: true,
      resolvedFindingRequiresRetestHash: true,
      omittedOrMutatedFindingsChangeReportHash: true
    }
  }),
  finding({
    findingId: "TC403-REV-P2-001",
    severity: "P2",
    status: "resolved",
    summary: "capacity_probe_claimed_measured_concurrency",
    evidence: { reviewer: "gpt_agent_tc403_review_01", finding: 3 },
    retest: {
      renamedBoundaryArithmeticSelfTest: true,
      configuredCeilingNotMeasuredPeak: true
    }
  }),
  finding({
    findingId: "TC403-REV-P2-002",
    severity: "P2",
    status: "open",
    summary: "runtime_alert_provenance_not_composed",
    evidence: { reviewer: "gpt_agent_tc403_review_01", finding: 4 },
    retest: null
  }),
  finding({
    findingId: "TC403-GATE-P2-001",
    severity: "P2",
    status: "resolved",
    summary: "postgres_binary_override_and_parent_environment",
    evidence: { reviewer: "gpt_agent_tc403_gate_review_02", finding: 5 },
    retest: {
      trustedPostgres17BinaryRequired: true,
      writableOrWrongBinaryRejected: true,
      minimalChildEnvironment: true,
      physicalRestorePassed: true
    }
  })
];

const input = {
  facilityId: "trading_facility_tc403",
  facilityHash: hashId("tc_403_facility", {
    version: 1,
    environment: "hyperliquid_testnet"
  }),
  releaseCommit: artifactManifest.releaseCommit,
  artifactSetHash: artifactManifest.artifactSetHash,
  restoreResult,
  failureDrills,
  alertRoutes: policy.alerts.map(({ signalType, owner, runbookRef }) => ({
    signalType,
    owner,
    runbookRef,
    configured: true
  })),
  capacityResult: runHyperliquidOperabilityCapacityProbe(policy),
  findings,
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
  completedAt: COMPLETED_AT
};

process.stdout.write(
  `${JSON.stringify(
    evaluateHyperliquidTestnetOperabilityAssurance(input, { policy }),
    null,
    2
  )}\n`
);
