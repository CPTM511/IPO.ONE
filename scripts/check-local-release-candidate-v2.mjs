import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readMigrationSet } from "./migrate.mjs";

const manifestPath = "deploy/local/release-candidate.v2.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

assert.equal(manifest.schemaVersion, "ipo_one_local_release_candidate.v2");
assert.match(
  manifest.releaseCandidateId,
  /^ipo-one-local-rc-[0-9]{8}-[0-9]{3}$/
);
assert.equal(manifest.status, "sealed");
assert.equal(manifest.profile, "local_no_funds");
assert.equal(
  manifest.predecessor.releaseCandidateId,
  "ipo-one-local-rc-20260730-003"
);
assert.equal(
  await sha256(manifest.predecessor.path),
  manifest.predecessor.sha256,
  "the sealed predecessor manifest drifted"
);

assert.equal(
  manifest.sourceBinding.mode,
  "git_commit_containing_manifest"
);
assert.equal(manifest.sourceBinding.sealedCommit, true);
assert.equal(manifest.sourceBinding.sealAuthorizedOn, "2026-07-31");
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
assert.equal(
  packageManifest.packageManager,
  `pnpm@${manifest.runtime.pnpmVersion}`
);
assert.equal(
  packageManifest.scripts["check:local-rc"],
  "node scripts/check-local-release-candidate-v2.mjs"
);
assert.equal(stack.database.majorVersion, manifest.runtime.postgresMajorVersion);
assert.equal(stack.pilot.nodeVersion, manifest.runtime.nodeVersion);

const migrations = await readMigrationSet();
assert.equal(migrations.length, manifest.database.migrationCount);
assert.equal(migrations.at(-1).name, manifest.database.latestMigration);
assert.equal(
  migrations.at(-1).checksum,
  manifest.database.latestMigrationChecksum
);

const pinnedEntries = [
  ...manifest.contracts,
  ...manifest.testData,
  ...manifest.productSources,
  ...manifest.operationalSources
];
const pinnedPaths = new Set();
for (const entry of pinnedEntries) {
  assert.match(entry.path, /^[A-Za-z0-9_./-]+$/);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(pinnedPaths.has(entry.path), false, `${entry.path} is duplicated`);
  pinnedPaths.add(entry.path);
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
assert.equal(tenantProtocol.protocolVersion, manifest.contracts[1].version);
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
  "phase2_bilateral_marketplace_four_paths",
  "database_and_projection_restart",
  "duplicate_command_idempotency",
  "durable_admission_execution_retention",
  "session_restart_rotation_and_revocation",
  "login_expiry_and_revocation",
  "wallet_change_quarantine",
  "agent_credential_revocation",
  "reference_agent_application_bounded",
  "reference_agent_runtime_exact_offer",
  "reference_agent_http_principal_gate",
  "reference_agent_account_proof_redaction",
  "browser_operable_human_agent_credit",
  "agent_decision_passport_mandate_evidence",
  "offer_acceptance_stale_hash_closed",
  "offer_acceptance_authority_current",
  "venue_unknown_terminal_no_resend",
  "unknown_reconciliation_resolution",
  "suspended_agent_blocked",
  "tenant_global_pause",
  "facility_freeze",
  "transport_003_timeout_unknown",
  "economic_action_confirmation_required",
  "evidence_anchor_coverage_reorg_retry",
  "evidence_anchor_partial_rpc_retry",
  "evidence_anchor_reorg_observer",
  "evidence_anchor_unknown_no_resend",
  "live_local_stack_attestor_and_persistence",
  "live_reference_agent_shared_lifecycle"
]);
assert.equal(manifest.acceptanceMatrix.length, requiredAcceptanceIds.size);
for (const acceptance of manifest.acceptanceMatrix) {
  assert.equal(requiredAcceptanceIds.delete(acceptance.id), true);
  assert.match(acceptance.sha256, /^[0-9a-f]{64}$/);
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
  "pnpm run local:acceptance",
  "pnpm run local:agent:acceptance",
  "pnpm run local:restart",
  "pnpm run local:acceptance",
  "pnpm run local:agent:acceptance"
]);
assert.deepEqual(manifest.verification, {
  verifiedOn: "2026-07-31",
  repositoryTests: {
    passed: 678,
    failed: 0
  },
  postgresTests: {
    passed: 82,
    failed: 0,
    freshDatabase: true,
    ephemeralContainerRemoved: true
  },
  localStack: {
    migrationCount: 48,
    liveAcceptancePasses: 2,
    referenceAgentAcceptancePasses: 2,
    fullRestartBetweenPasses: true,
    persistentVolumeRetained: true,
    pendingOutboxAfterRestartDrain: 0,
    transientOutboxGateCaught: true,
    durableHumanAuthentication: true,
    durableAgentCredential: true,
    referenceAgentEvidenceEventCountPerPass: 11,
    invitedWalletPrivateKeyStored: false,
    evidenceEnvelopeAnchorCoverage: true,
    misrepresentedEvidenceHashCount: 0,
    evidenceAnchorFailedCount: 0,
    evidenceAttestorConfigured: true,
    evidenceAttestorMode: "base_sepolia_zero_value_hash_only"
  }
});

assert.equal(manifest.liveTestnetCheckpoint.chainId, "eip155:84532");
assert.equal(
  manifest.liveTestnetCheckpoint.contractAddress,
  "0x78ba26d4a9211e8d4b0158c9e5443305278c1df0"
);
assert.equal(
  manifest.liveTestnetCheckpoint.attestorAddress,
  "0x66f0acF3457e7B73845FD33c764947fC5A220f2a"
);
assert.equal(
  manifest.liveTestnetCheckpoint.activity,
  "active_separately_approved_zero_value_hash_attestation"
);
assert.equal(
  manifest.liveTestnetCheckpoint.releaseGrantsNewWriteAuthority,
  false
);
assert.equal(manifest.liveTestnetCheckpoint.nativeValuePerAnchor, "0");
assert.equal(manifest.liveTestnetCheckpoint.productionFundsMoved, false);
assert.equal(
  manifest.liveTestnetCheckpoint.observationSnapshot.totalEvidenceAnchors,
  Object.values(
    manifest.liveTestnetCheckpoint.observationSnapshot.statusCounts
  ).reduce((total, count) => total + count, 0)
);
assert.equal(
  manifest.liveTestnetCheckpoint.observationSnapshot.pendingOutbox,
  0
);
assert.equal(
  manifest.liveTestnetCheckpoint.observationSnapshot.nonSandboxCount,
  0
);
assert.equal(
  manifest.liveTestnetCheckpoint.observationSnapshot.productionFundsMovedCount,
  0
);
assert.equal(
  manifest.liveTestnetCheckpoint.observationSnapshot.missingTransactionHashCount,
  0
);
assert.equal(
  manifest.liveTestnetCheckpoint.continuousTailEnabledAtSeal,
  true
);
assert.equal(manifest.liveTestnetCheckpoint.privateKeyIncluded, false);
assert.equal(
  Object.values(manifest.authority).every((value) => value === false),
  true
);

console.log(
  "LOCAL-RC-002 manifest passed: the immutable v1 predecessor, runtime, " +
    "48 migrations, contracts, fixtures, browser-operable Human/Agent product " +
    "sources, restart acceptance, and truthful Base Sepolia Evidence states " +
    "are pinned with all deployment and real-value authority disabled."
);
