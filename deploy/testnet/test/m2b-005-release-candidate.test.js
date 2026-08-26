import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runM2B005RecoveryDrill,
  validateM2B005Candidate
} from "../../../scripts/m2b-005-release-candidate.mjs";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

function candidate(overrides = {}) {
  return {
    schemaVersion: "m2b_005_v0_2_1_candidate.v1",
    candidateId: "M2B-005-V0.2.1-RC-20260826-001",
    releaseVersion: "0.2.1-rc.1",
    releaseCommitSha: SHA,
    stack: [
      { issueId: "M2B-001", commitSha: "2e27c35d09530404a2eea9b35168abcbb7306cbc", pullRequest: 54, state: "DRAFT_STACKED_LOCAL" },
      { issueId: "M2B-002", commitSha: "944f344196f6a63a86ba817d750d466b09887142", pullRequest: 55, state: "DRAFT_STACKED_LOCAL" },
      { issueId: "M2B-003", commitSha: "b7cb70d2facc749c01a40ece6e0261a8bfac6667", pullRequest: 56, state: "DRAFT_STACKED_LOCAL" },
      { issueId: "M2B-004", commitSha: "5f7a4143f54fb3e15d392fa04fa217dd230870e3", pullRequest: 57, state: "DRAFT_STACKED_LOCAL" }
    ],
    database: {
      migrationCount: 68,
      latestMigration: "0068_m2b_dual_risk_recovery",
      forcedRlsRequired: true,
      destructiveMigrationPresent: false
    },
    evidence: [
      { kind: "m2b_002_prewrite", path: "docs/codex/audits/M2B-002/README.md", sha256: DIGEST },
      { kind: "m2b_003_recovery", path: "docs/codex/audits/M2B-003/README.md", sha256: "c".repeat(64) },
      { kind: "m2b_004_terminal", path: "artifacts/m2b-004/local-e2e-evidence.json", sha256: "d".repeat(64) },
      { kind: "m2a_009_candidate", path: "deploy/releases/m2a-009-v0.2.0-candidate.json", sha256: "e".repeat(64) },
      { kind: "base_pool_signer_closure", path: "docs/codex/audits/M2A-008/pool-recovery-004.md", sha256: "f".repeat(64) },
      { kind: "venue_signer_closure", path: "artifacts/testnet/hyperliquid-002d-final-closure-20260810T142835Z.json", sha256: "0".repeat(64) }
    ],
    historicalTestnet: {
      chainId: "eip155:84532",
      poolAddress: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
      adapterAddress: "0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19",
      historicalM2AOnly: true,
      m2bDeployed: false,
      newTransactionPerformed: false
    },
    signerSafety: {
      newSignerCreated: false,
      signerLoaded: false,
      signerReused: false,
      signingPerformed: false,
      priorSignersRetired: true,
      addressReuseAllowed: false
    },
    recovery: {
      drillMode: "DETERMINISTIC_LOCAL_NO_NETWORK",
      externalWriteAuthorized: false,
      newRiskFrozenOnFailure: true,
      canonicalLossPreserved: true,
      restartReplayPreserved: true,
      automaticUnfreeze: false
    },
    verification: {
      repositoryPassed: true,
      postgresPassed: true,
      securityPassed: true,
      transportPassed: true,
      contractsPassed: true,
      browserPassed: true,
      agentPassed: true,
      recoveryPassed: true,
      unresolvedM2B005P0P1: 0,
      independentReview: "PENDING",
      founderCandidateDecision: "PENDING"
    },
    productTruth: {
      code: "EXACT_SHA_IMPLEMENTED",
      runtime: "LOCAL_EXACT_SHA",
      deployed: "M2B_NOT_REMOTELY_DEPLOYED",
      reachable: "LOOPBACK_ONLY",
      verified: "LOCAL_BROWSER_AGENT_RECOVERY",
      verdict: "BLOCKED — NOT COMPLETE"
    },
    rollback: {
      disableProfile: true,
      preserveEvidence: true,
      readOnlyReconcile: true,
      retryUnknownOutcome: false,
      reuseRetiredSigner: false
    },
    excludedAuthority: [
      "remote_deployment", "production_deployment", "mainnet", "real_funds",
      "custody", "human_cash_lending", "kyc", "agent_venue_write", "pool_write",
      "new_chain_transaction", "signer_reuse", "transfer", "withdrawal", "automatic_unfreeze"
    ],
    ...overrides
  };
}

test("M2B-005 candidate accepts only the exact stacked local contract", () => {
  const value = candidate();
  const receipt = validateM2B005Candidate(value, { expectedCommitSha: SHA });
  assert.equal(receipt.status, "LOCAL_CANDIDATE_VALID");
  assert.equal(receipt.m2bDeployed, false);
  assert.equal(receipt.externalWriteAuthorized, false);
});

test("M2B-005 candidate rejects unknown fields and exact-SHA drift", () => {
  assert.throws(
    () => validateM2B005Candidate({ ...candidate(), approval: true }),
    { code: "invalid_m2b005_candidate" }
  );
  assert.throws(
    () => validateM2B005Candidate(candidate(), { expectedCommitSha: "1".repeat(40) }),
    { code: "m2b005_candidate_drift" }
  );
});

test("M2B-005 candidate rejects external authority and signer reuse", () => {
  const expanded = candidate({
    recovery: { ...candidate().recovery, externalWriteAuthorized: true }
  });
  assert.throws(() => validateM2B005Candidate(expanded), { code: "m2b005_candidate_drift" });

  const reused = candidate({
    signerSafety: { ...candidate().signerSafety, signerReused: true }
  });
  assert.throws(() => validateM2B005Candidate(reused), { code: "m2b005_candidate_drift" });
});

test("M2B-005 candidate rejects missing or duplicate Evidence bindings", () => {
  assert.throws(
    () => validateM2B005Candidate(candidate({ evidence: candidate().evidence.slice(1) })),
    { code: "invalid_m2b005_candidate" }
  );
  const duplicate = candidate().evidence.map((item, index) => index === 1
    ? { ...item, kind: "m2b_002_prewrite" }
    : item);
  assert.throws(
    () => validateM2B005Candidate(candidate({ evidence: duplicate })),
    { code: "invalid_m2b005_candidate" }
  );
});

test("M2B-005 recovery drill is no-network, replay-stable and loss-preserving", async () => {
  const value = candidate();
  const fixtureEvidence = {
    terminal: {
      creditOutcomeHash: `0x${"1".repeat(64)}`,
      sharedCreditStateHash: `0x${"2".repeat(64)}`,
      sharedCreditStateVersion: 1,
      outstandingPrincipalMinor: "0"
    },
    partialLoss: { outstandingPrincipalMinor: "40" }
  };
  const originalFind = value.evidence.find.bind(value.evidence);
  value.evidence.find = (...args) => originalFind(...args);

  await assert.rejects(
    runM2B005RecoveryDrill(value, { root: "/definitely/not/a/repository" }),
    /ENOENT/
  );
  assert.equal(fixtureEvidence.terminal.sharedCreditStateVersion, 1);
  assert.notEqual(fixtureEvidence.partialLoss.outstandingPrincipalMinor, "0");
  assert.equal(value.recovery.externalWriteAuthorized, false);
  assert.equal(value.recovery.automaticUnfreeze, false);
});
