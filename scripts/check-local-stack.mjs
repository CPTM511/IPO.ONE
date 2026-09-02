import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  stackText,
  compose,
  worker,
  privatePilotDatabase,
  task,
  readme,
  packageText,
  gitignore,
  dockerignore,
  localStackScript,
  localAcceptance,
  localAgent,
  localProfile,
  evidenceAnchorCompose,
  localEvidenceAnchor,
  localReleaseIdentity
] = await Promise.all([
  source("deploy/local/stack.v1.json"),
  source("deploy/local/compose.yaml"),
  source("apps/private-pilot/src/local-worker.js"),
  source("apps/private-pilot/src/private-pilot-database.js"),
  source("docs/codex/tasks/LOCAL_STACK_001_LOCAL_MULTI_CONTAINER_PILOT.md"),
  source("deploy/local/README.md"),
  source("package.json"),
  source(".gitignore"),
  source(".dockerignore"),
  source("scripts/local-stack.mjs"),
  source("scripts/local-stack-acceptance.mjs"),
  source("scripts/local-agent.mjs"),
  source("deploy/local/private-pilot-profile.v1.json"),
  source("deploy/local/evidence-anchor.compose.yaml"),
  source("scripts/local-evidence-anchor.mjs"),
  source("scripts/local-release-identity.mjs")
]);

const stack = parseLocalStack(stackText);
const manifest = JSON.parse(packageText);

assert.equal(stack.launchBlocked, true);
assert.equal(
  stack.virtualization.portForwarding,
  "lima_hostagent_loopback_only"
);
assert.equal(stack.database.macHostPublished, false);
assert.equal(stack.pilot.hostBinding, "127.0.0.1");
assert.equal(stack.pilot.processLocalCanonicalStateAllowed, false);
assert.equal(Object.values(stack.authority).every((value) => value === false), true);
assert.match(compose, new RegExp(stack.database.image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(compose, /127\.0\.0\.2:55432:5432/);
assert.doesNotMatch(compose, /0\.0\.0\.0:/);
assert.match(compose, /network_mode: host/);
assert.match(compose, /read_only: true/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /cap_drop:\n\s+- ALL/);
assert.match(compose, /ipo-one-local-postgres-data/);
assert.match(worker, /I_UNDERSTAND_SYNTHETIC_OUTBOX_ONLY/);
assert.match(worker, /claimOutboxBatch/);
assert.match(worker, /PostgresReconciliationService/);
assert.match(worker, /PostgresCreditOutcomeMaterializer/);
assert.match(
  privatePilotDatabase,
  /credit_passport_artifacts,\s+credit_outcomes,\s+credit_state_projections,\s+tenant_command_pauses/
);
assert.match(privatePilotDatabase, /seedCapitalPartnerProfile/);
assert.match(compose, /IPO_ONE_PILOT_PROFILE_FILE: \/app\/deploy\/local\/private-pilot-profile\.v1\.json/g);
assert.match(
  compose,
  /BUILD_REVISION: \$\{IPO_ONE_M1_B_RELEASE_SHA:-local-stack\}/
);
const profile = JSON.parse(localProfile);
assert.equal(profile.mode, "local_no_funds");
assert.equal(profile.syntheticDataOnly, true);
assert.equal(profile.realFundsEnabled, false);
assert.equal(profile.remoteAccessEnabled, false);
assert.deepEqual(Object.keys(profile.identities).sort(), [
  "agent",
  "borrower",
  "capitalPartner",
  "controller",
  "risk"
]);
assert.match(task, /Status: Implemented locally/);
assert.match(readme, /pnpm run local:up/);
assert.match(gitignore, /^\.ipo-one\/$/m);
assert.match(
  dockerignore,
  /^!deploy\/local\/private-pilot-profile\.v1\.json$/m
);
assert.match(
  dockerignore,
  /^!deploy\/approvals\/public-authenticated-no-funds-beta\.pending\.json$/m
);
assert.match(dockerignore, /^\.ipo-one$/m);
assert.match(localStackScript, /hostAgentPID/);
assert.match(localStackScript, /limaHostAgentOwnsProductPorts/);
assert.match(localStackScript, /lsof/);
assert.match(localStackScript, /ipo_one_authentication_options\.v1/);
assert.match(localStackScript, /authentication-server\.v1\.json/);
assert.match(localStackScript, /agent-key\.v1\.json/);
assert.match(localStackScript, /assertExactLocalReleaseSource/);
assert.match(localStackScript, /IPO_ONE_M1_B_RELEASE_SHA=/);
assert.match(localStackScript, /IPO_ONE_M1_B_PORT_BASE=/);
assert.match(localStackScript, /IPO_ONE_M1_B_BUILD_CONTEXT=/);
assert.match(localStackScript, /prepareLocalReleaseBuildContext/);
assert.match(localReleaseIdentity, /requested SHA/);
assert.match(localReleaseIdentity, /requires a clean source worktree/);
assert.match(localAcceptance, /authenticationOptions\.profile,\s*"local_no_funds"/);
assert.match(localAcceptance, /authenticationOptions\.sessionActive,\s*false/);
assert.match(localAcceptance, /authenticationOptions\.walletAuthentication,\s*true/);
assert.match(localAcceptance, /createLocalAgentProof/);
assert.match(localAcceptance, /org\.opencontainers\.image\.revision/);
assert.match(localAcceptance, /releaseIdentity\.exactCandidate/);
assert.match(localAcceptance, /m1_b_local_release_identity\.v1/);
assert.match(localAcceptance, /local-release-identity\.json/);
assert.match(localAcceptance, /exact-candidate output must be one real directory/);
assert.ok(
  localAcceptance.indexOf("assert.equal(pendingOutbox, 0)") <
    localAcceptance.indexOf("schemaVersion: \"m1_b_local_release_identity.v1\""),
  "exact release identity must be published only after all live acceptance assertions pass"
);
assert.match(localAgent, /docker",\s*"compose"/);
assert.match(localAgent, /--no-deps/);
assert.match(localAgent, /CONTAINER_INPUT/);
assert.doesNotMatch(localAgent, /IPO_ONE_LOCAL_POSTGRES_PASSWORD/);
assert.equal(manifest.scripts["local:up"], "node scripts/local-stack.mjs up");
assert.equal(
  manifest.scripts["local:auth:init"],
  "node scripts/local-stack.mjs auth-init"
);
assert.equal(
  manifest.scripts["local:acceptance"],
  "node scripts/local-stack-acceptance.mjs"
);
assert.equal(
  manifest.scripts["local:agent:prove"],
  "node scripts/local-agent.mjs prove"
);
assert.equal(manifest.scripts["local:agent"], "node scripts/local-agent.mjs run");
assert.equal(
  manifest.scripts["local:evidence-attestor:init"],
  "node scripts/local-evidence-anchor.mjs init"
);
assert.equal(
  manifest.scripts["local:evidence-anchor:enable"],
  "node scripts/local-evidence-anchor.mjs enable"
);
assert.match(
  evidenceAnchorCompose,
  /0x78ba26d4a9211e8d4b0158c9e5443305278c1df0/
);
assert.match(
  evidenceAnchorCompose,
  /I_UNDERSTAND_BASE_SEPOLIA_ZERO_VALUE_HASH_ANCHORS/
);
assert.match(
  evidenceAnchorCompose,
  /evidence-attestor\.key:\/private\/tmp\/ipo-one-chain-001f\/evidence-attestor\.key:ro/
);
assert.match(
  evidenceAnchorCompose,
  /IPO_ONE_LOCAL_WORKER_INTERVAL_MS: "1000"/
);
assert.match(
  evidenceAnchorCompose,
  /IPO_ONE_EVIDENCE_ANCHOR_PROVIDER_SLOT: secondary/
);
assert.match(
  worker,
  /createEvidenceAnchorNonceReader\(\{\s+contractAddress: evidenceAnchorContractAddress,\s+providerSlot: evidenceAnchorProviderSlot/
);
assert.match(
  worker,
  /createEvidenceAnchorObserver\(\{\s+contractAddress: evidenceAnchorContractAddress,\s+providerSlot: evidenceAnchorProviderSlot/
);
assert.match(localEvidenceAnchor, /IPO_ONE_APPROVE_LOCAL_EVIDENCE_ATTESTOR/);
assert.match(localEvidenceAnchor, /IPO_ONE_APPROVE_LOCAL_EVIDENCE_ANCHOR_WRITES/);
assert.match(localEvidenceAnchor, /MAX_BALANCE_WEI = 10_000_000_000_000_000n/);
assert.doesNotMatch(localEvidenceAnchor, /privateKey.*process\.stdout/);
assert.doesNotMatch(evidenceAnchorCompose, /mainnet|PRIVATE_KEY|MNEMONIC/i);

console.log(
  "LOCAL-STACK-001 static contract passed: rootless Lima, pinned PostgreSQL 17, " +
    "verified Lima host-agent loopback forwarding, four workspaces, separate default-unsigned worker, " +
    "opt-in capped CHAIN-001F attestor boundary, persistent state, and no cloud/real-funds authority."
);
