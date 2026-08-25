import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import {
  M2A009_ADAPTER,
  M2A009_ADAPTER_TRANSACTION,
  M2A009_CHAIN_ID,
  M2A009_POOL,
  M2A009_POOL_TRANSACTION,
  approveM2A009DualRecovery,
  readM2A009RecoveryCandidate,
  runM2A009DeterministicRecoveryDrill,
  validateM2A009RecoveryCandidate,
  verifyM2A009EvidenceDigests
} from "../m2a-009-recovery-candidate.mjs";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(await readFile(
  new URL("../../../schemas/v2/m2a-009-recovery-candidate.schema.json", import.meta.url),
  "utf8"
));
const validateSchema = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false
}).compile(schema);

const EVIDENCE_KINDS = [
  "deployment_reconciliation",
  "source_verification",
  "live_indexer",
  "product_acceptance"
];

function candidate(overrides = {}) {
  const base = {
    schemaVersion: "m2a_009_recovery_candidate.v1",
    candidateId: "M2A-009-V0.2.0-RC-20260825-001",
    releaseVersion: "0.2.0-rc.1",
    releaseCommitSha: "a".repeat(40),
    chain: {
      chainId: M2A009_CHAIN_ID,
      poolAddress: M2A009_POOL,
      adapterAddress: M2A009_ADAPTER,
      poolTransactionHash: M2A009_POOL_TRANSACTION,
      adapterTransactionHash: M2A009_ADAPTER_TRANSACTION,
      testAssetsOnly: true,
      readOnlyRecovery: true,
      transactionPrimitivePresent: false
    },
    evidence: EVIDENCE_KINDS.map((kind, index) => ({
      kind,
      path: `artifacts/testnet/m2a-009-fixture-${index}.json`,
      sha256: String(index + 1).repeat(64)
    })),
    database: {
      migrationCount: 65,
      latestMigration: "0065_pool_obligation_integration",
      forcedRlsRequired: true,
      destructiveMigrationPresent: false,
      restartRestoreRequired: true
    },
    recovery: {
      ownerApprovals: [
        { role: "release_owner", approvalHash: `0x${"1".repeat(64)}` },
        { role: "risk_operations_owner", approvalHash: `0x${"2".repeat(64)}` }
      ],
      failureTriggers: [
        "rpc_disagreement",
        "oracle_invalid_or_stale",
        "reorg_uncertainty",
        "projection_discrepancy",
        "process_restart",
        "database_restore"
      ],
      newRiskFrozenOnFailure: true,
      protectiveRepaymentAvailable: true,
      automaticUnfreeze: false,
      zeroDiscrepancyRequired: true
    },
    acceptance: {
      repositoryGatePassed: true,
      postgresPassed: true,
      securityPassed: true,
      transportPassed: true,
      browserPassed: true,
      forkDryRunPassed: true,
      unresolvedP0P1: 0
    },
    rollback: {
      profilePosture: "deployed_testnet_read_only_when_disabled",
      stopIngestion: true,
      preserveEvidence: true,
      rebuildFromFinalizedLogs: true,
      onchainTransactionPracticed: false
    },
    excludedAuthority: [
      "mainnet",
      "real_funds",
      "human_cash_lending",
      "custody",
      "kyc",
      "production_deployment",
      "agent_venue_write",
      "new_chain_transaction",
      "automatic_unfreeze"
    ]
  };
  return {
    ...base,
    ...overrides,
    chain: { ...base.chain, ...(overrides.chain ?? {}) },
    database: { ...base.database, ...(overrides.database ?? {}) },
    recovery: { ...base.recovery, ...(overrides.recovery ?? {}) },
    acceptance: { ...base.acceptance, ...(overrides.acceptance ?? {}) },
    rollback: { ...base.rollback, ...(overrides.rollback ?? {}) }
  };
}

test("M2A-009 schema and runtime validator accept only the exact bounded candidate", () => {
  const fixture = candidate();
  assert.equal(validateSchema(fixture), true, JSON.stringify(validateSchema.errors, null, 2));
  assert.deepEqual(validateM2A009RecoveryCandidate(fixture), {
    status: "candidate_valid",
    candidateId: fixture.candidateId,
    releaseCommitSha: fixture.releaseCommitSha,
    evidenceCount: 4,
    dualControl: true,
    transactionPrimitivePresent: false,
    testAssetsOnly: true,
    mainnetAuthorized: false,
    realFundsAuthorized: false
  });
});

test("M2A-009 candidate fails closed on drift, expanded authority, or incomplete recovery", () => {
  const invalid = [
    candidate({ unknown: true }),
    candidate({ chain: { chainId: "eip155:1" } }),
    candidate({ chain: { transactionPrimitivePresent: true } }),
    candidate({ evidence: candidate().evidence.slice(0, 3) }),
    candidate({ recovery: { ownerApprovals: candidate().recovery.ownerApprovals.slice(0, 1) } }),
    candidate({ recovery: { ownerApprovals: [
      candidate().recovery.ownerApprovals[0],
      { ...candidate().recovery.ownerApprovals[1], approvalHash: candidate().recovery.ownerApprovals[0].approvalHash }
    ] } }),
    candidate({ recovery: { automaticUnfreeze: true } }),
    candidate({ acceptance: { unresolvedP0P1: 1 } }),
    candidate({ rollback: { onchainTransactionPracticed: true } }),
    candidate({ excludedAuthority: candidate().excludedAuthority.slice(0, 8) })
  ];
  for (const fixture of invalid) {
    assert.throws(() => validateM2A009RecoveryCandidate(fixture));
  }
  assert.ok(
    invalid.filter((fixture) => validateSchema(fixture) === false).length >= invalid.length - 1,
    "the schema must reject all structural drift; the runtime validator supplements cross-item uniqueness"
  );
});

test("strict candidate reader rejects duplicate JSON keys and SHA drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m2a009-reader-"));
  try {
    const path = join(root, "candidate.json");
    await writeFile(path, JSON.stringify(candidate()));
    await assert.rejects(
      readM2A009RecoveryCandidate(path, { expectedCommitSha: "b".repeat(40) }),
      /m2a009_candidate_drift/
    );
    await writeFile(path, '{"schemaVersion":"x","schemaVersion":"y"}');
    await assert.rejects(readM2A009RecoveryCandidate(path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Evidence verification binds digest, no-funds posture, and exact Pool", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m2a009-evidence-"));
  try {
    const directory = join(root, "artifacts", "testnet");
    await mkdir(directory, { recursive: true });
    const evidence = [];
    for (const [index, kind] of EVIDENCE_KINDS.entries()) {
      const path = `artifacts/testnet/m2a-009-fixture-${index}.json`;
      const bytes = Buffer.from(JSON.stringify({
        poolAddress: M2A009_POOL,
        testAssetsOnly: true,
        productionFundsMoved: false
      }));
      await writeFile(join(root, path), bytes);
      evidence.push({ kind, path, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const fixture = candidate({ evidence });
    assert.equal((await verifyM2A009EvidenceDigests(fixture, { root })).length, 4);
    await writeFile(join(root, evidence[0].path), JSON.stringify({
      poolAddress: M2A009_POOL,
      testAssetsOnly: false,
      productionFundsMoved: true
    }));
    await assert.rejects(
      verifyM2A009EvidenceDigests(fixture, { root }),
      /m2a009_evidence_digest_mismatch/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deterministic recovery drill covers restart, reorg, freeze, protective repay, and dual control", async () => {
  const receipt = await runM2A009DeterministicRecoveryDrill(candidate());
  assert.equal(receipt.status, "PASS");
  assert.deepEqual(receipt.replayDispositions, ["duplicate", "duplicate"]);
  assert.equal(receipt.reorgInvalidationCount, 1);
  assert.equal(receipt.providerFailureReasonCode, "provider_disagreement");
  assert.equal(receipt.oracleFailureReasonCode, "projection_mismatch");
  assert.equal(receipt.borrowAllowedDuringFailure, false);
  assert.equal(receipt.repaymentAllowedDuringFailure, true);
  assert.equal(receipt.singleApprovalRejected, true);
  assert.equal(receipt.dualControlRecovered, true);
  assert.equal(receipt.transactionPrimitivePresent, false);
});

test("dual-control wrapper rejects a single owner before calling the indexer", async () => {
  let called = false;
  const indexer = { approveRecovery: async () => { called = true; } };
  await assert.rejects(
    approveM2A009DualRecovery({
      indexer,
      reconciliationId: `0x${"3".repeat(64)}`,
      ownerApprovals: candidate().recovery.ownerApprovals.slice(0, 1)
    }),
    /m2a009_dual_control_required/
  );
  assert.equal(called, false);
});

test("M2A-009 recovery implementation contains no wallet, signer, or broadcast primitive", async () => {
  const source = await readFile(new URL("../m2a-009-recovery-candidate.mjs", import.meta.url), "utf8");
  for (const primitive of [
    "createWalletClient",
    "privateKeyToAccount",
    ".sendTransaction(",
    ".writeContract(",
    ".signTransaction("
  ]) assert.equal(source.includes(primitive), false, `forbidden primitive: ${primitive}`);
  assert.match(source, /createPublicClient/);
  assert.match(source, /configurationObservationBlockNumber/);
  assert.doesNotMatch(source, /functionName,\n\s+blockNumber: poolReceiptA\.blockNumber/);
  assert.match(source, /transactionPrimitivePresent: false/);
});
