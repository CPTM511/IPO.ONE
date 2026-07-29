import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { readMigrationSet } from "./migrate.mjs";

const manifestPath = "deploy/local/release-candidate.v1.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

assert.equal(
  manifest.schemaVersion,
  "ipo_one_local_release_candidate.v1"
);
assert.match(
  manifest.releaseCandidateId,
  /^ipo-one-local-rc-[0-9]{8}-[0-9]{3}$/
);
assert.equal(manifest.status, "sealed");
assert.equal(manifest.profile, "local_no_funds");
assert.equal(manifest.sourceBinding.mode, "git_commit_containing_manifest");
assert.equal(manifest.sourceBinding.sealedCommit, true);
assert.equal(manifest.sourceBinding.sealAuthorizedOn, "2026-07-29");
assert.equal(manifest.sourceBinding.sealBlockedBy, null);
assert.equal(
  execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8"
  }).trim(),
  manifest.sourceBinding.branch
);
execFileSync(
  "git",
  [
    "merge-base",
    "--is-ancestor",
    manifest.sourceBinding.baseCommit,
    "HEAD"
  ],
  { stdio: "ignore" }
);

const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const stack = JSON.parse(await readFile("deploy/local/stack.v1.json", "utf8"));
assert.equal(
  packageManifest.engines.node,
  `>=${manifest.runtime.nodeVersion} <27`
);
assert.equal(packageManifest.packageManager, `pnpm@${manifest.runtime.pnpmVersion}`);
assert.equal(stack.database.majorVersion, manifest.runtime.postgresMajorVersion);
assert.equal(stack.pilot.nodeVersion, manifest.runtime.nodeVersion);

const migrations = await readMigrationSet();
assert.equal(migrations.length, manifest.database.migrationCount);
assert.equal(migrations.at(-1).name, manifest.database.latestMigration);
assert.equal(
  migrations.at(-1).checksum,
  manifest.database.latestMigrationChecksum
);

for (const entry of [...manifest.contracts, ...manifest.testData]) {
  assert.match(entry.path, /^[A-Za-z0-9_./-]+$/);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(await sha256(entry.path), entry.sha256, `${entry.path} drifted`);
}

const humanOpenApi = JSON.parse(
  await readFile("api/openapi/ipo-one.v1.json", "utf8")
);
const tenantProtocol = JSON.parse(
  await readFile(
    "api/tenant-protocol/ipo-one.tenant-protocol.v1.json",
    "utf8"
  )
);
const agentOpenApi = JSON.parse(
  await readFile("api/tenant-protocol/ipo-one.agent-https.v1.json", "utf8")
);
assert.equal(humanOpenApi.openapi, "3.1.2");
assert.equal(humanOpenApi.info.version, manifest.contracts[0].version);
assert.equal(
  tenantProtocol.protocolVersion,
  manifest.contracts[1].version
);
assert.equal(agentOpenApi.openapi, "3.1.2");
assert.equal(
  agentOpenApi["x-ipo-one-schema-version"],
  manifest.contracts[2].version
);
assert.equal(
  agentOpenApi["x-ipo-one-activation"],
  "disabled_pending_named_deployment_approval"
);

const requiredAcceptanceIds = new Set([
  "complete_dual_native_credit_lifecycle_and_outcome_retry",
  "database_and_projection_restart",
  "duplicate_command_idempotency",
  "durable_admission_execution_retention",
  "login_expiry_and_revocation",
  "wallet_change_quarantine",
  "agent_credential_revocation",
  "venue_unknown_terminal_no_resend",
  "unknown_reconciliation_resolution",
  "suspended_agent_blocked",
  "tenant_global_pause",
  "facility_freeze",
  "transport_003_timeout_unknown",
  "economic_action_confirmation_required",
  "evidence_anchor_coverage_reorg_retry",
  "evidence_anchor_reorg_observer",
  "evidence_anchor_unknown_no_resend",
  "live_local_stack_attestor_and_persistence"
]);
assert.equal(manifest.acceptanceMatrix.length, requiredAcceptanceIds.size);
for (const acceptance of manifest.acceptanceMatrix) {
  assert.equal(requiredAcceptanceIds.delete(acceptance.id), true);
  assert.equal(
    await sha256(acceptance.source),
    acceptance.sha256,
    `${acceptance.source} acceptance source drifted`
  );
  const source = await readFile(acceptance.source, "utf8");
  assert.equal(
    source.includes(acceptance.testName),
    true,
    `${acceptance.id} test name is absent`
  );
}
assert.equal(requiredAcceptanceIds.size, 0);

assert.deepEqual(manifest.requiredChecks, [
  "pnpm run check",
  "pnpm run test:postgres",
  "pnpm run local:up",
  "pnpm run local:acceptance",
  "pnpm run local:restart",
  "pnpm run local:acceptance"
]);
assert.deepEqual(manifest.verification, {
  verifiedOn: "2026-07-29",
  repositoryTests: {
    passed: 647,
    failed: 0
  },
  postgresTests: {
    passed: 81,
    failed: 0,
    freshDatabase: true
  },
  localStack: {
    migrationCount: 47,
    liveAcceptancePasses: 2,
    fullRestartBetweenPasses: true,
    persistentVolumeRetained: true,
    pendingOutboxAfterRestart: 0,
    authenticationCredentialCount: 4,
    durableHumanAuthentication: true,
    durableAgentCredential: true,
    invitedWalletPrivateKeyStored: false,
    evidenceEnvelopeAnchorCoverage: true,
    misrepresentedEvidenceHashCount: 0,
    evidenceAnchorFailedCount: 0,
    evidenceAttestorConfigured: true,
    evidenceAttestorMode: "base_sepolia_zero_value_hash_only"
  }
});
assert.deepEqual(manifest.liveTestnetCheckpoint, {
  chainId: "eip155:84532",
  contractAddress: "0x78ba26d4a9211e8d4b0158c9e5443305278c1df0",
  attestorAddress: "0x66f0acF3457e7B73845FD33c764947fC5A220f2a",
  activity: "active_separately_approved_zero_value_hash_attestation",
  releaseGrantsNewWriteAuthority: false,
  nativeValuePerAnchor: "0",
  productionFundsMoved: false,
  historicalSnapshot: {
    artifact:
      "artifacts/testnet/eip155-84532-chain-001f-evidence-catchup-20260729-001.json",
    finalizedEvidenceCount: 622,
    minimumNonce: 0,
    maximumNonce: 621,
    errorCount: 0
  },
  continuousTailEnabledAtSeal: true,
  privateKeyIncluded: false
});
assert.equal(
  Object.values(manifest.authority).every((value) => value === false),
  true
);

console.log(
  "LOCAL-RC-001 manifest passed: runtime, 47 migrations, contracts, fixed " +
    "test data, failure-path and Evidence-anchor matrices, and disabled authority are pinned; " +
    "the candidate is source-sealed by the Git commit containing this manifest."
);
