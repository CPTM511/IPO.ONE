import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";
import { readMigrationSet } from "./migrate.mjs";
import {
  loadLocalAgentKeyMaterial
} from "../apps/private-pilot/src/local-authentication-material.js";
import {
  createLocalAgentProof
} from "../apps/private-pilot/src/local-durable-agent-authentication.js";
import {
  createLocalPilotIdentities
} from "../apps/private-pilot/src/local-pilot-identities.js";
import {
  loadPrivatePilotProfile
} from "../apps/private-pilot/src/private-pilot-profile.js";
import {
  assertExactLocalReleaseSource,
  prepareLocalReleaseBuildContext,
  resolveLocalReviewPorts,
  resolveLocalReleaseIdentity
} from "./local-release-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const ENV_FILE = resolve(ROOT, ".ipo-one/local-stack/stack.env");
const CONTRACT_FILE = resolve(ROOT, "deploy/local/stack.v1.json");
const AGENT_KEY_FILE = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-key.v1.json"
);
const P0_5_OUTPUT_DIRECTORY = resolve(
  ROOT,
  "output/playwright/m1-b-p0-5"
);
const releaseIdentity = resolveLocalReleaseIdentity();
assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
const localReviewPorts = resolveLocalReviewPorts({ releaseIdentity });
const releaseBuildContext = await prepareLocalReleaseBuildContext(
  releaseIdentity,
  { root: ROOT }
);

function docker(args, { capture = false } = {}) {
  const result = spawnSync(
    "limactl",
    [
      "shell",
      "--workdir",
      ROOT,
      INSTANCE,
      "docker",
      ...args
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    }
  );
  if (result.error || result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error("local stack Docker command failed");
  }
  return capture ? result.stdout.trim() : "";
}

function compose(args, { capture = false } = {}) {
  const result = spawnSync(
    "limactl",
    [
      "shell",
      "--workdir",
      ROOT,
      INSTANCE,
      "env",
      `IPO_ONE_M1_B_RELEASE_SHA=${releaseIdentity.revision}`,
      `IPO_ONE_M1_B_PORT_BASE=${localReviewPorts.basePort}`,
      `IPO_ONE_M1_B_BUILD_CONTEXT=${releaseBuildContext}`,
      "docker",
      "compose",
      "--project-name",
      "ipo-one-local",
      "--env-file",
      ENV_FILE,
      "--file",
      COMPOSE_FILE,
      ...args
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    }
  );
  if (result.error || result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error("local stack compose command failed");
  }
  return capture ? result.stdout.trim() : "";
}

async function waitForHttp(url, attempts = 30) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(2_000)
      });
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  throw lastError;
}

const stack = parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
const migrations = await readMigrationSet();
const revisionLabel = "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}";
const [pilotContainerId, workerContainerId] = ["pilot", "worker"].map(
  (service) => compose(["ps", "--quiet", service], { capture: true })
);
assert.match(pilotContainerId, /^[0-9a-f]{64}$/);
assert.match(workerContainerId, /^[0-9a-f]{64}$/);
const runtimeRevisions = Object.freeze({
  image: docker(
    ["image", "inspect", stack.pilot.image, "--format", revisionLabel],
    { capture: true }
  ),
  pilot: docker(
    ["inspect", pilotContainerId, "--format", revisionLabel],
    { capture: true }
  ),
  worker: docker(
    ["inspect", workerContainerId, "--format", revisionLabel],
    { capture: true }
  )
});
for (const [surface, revision] of Object.entries(runtimeRevisions)) {
  assert.equal(
    revision,
    releaseIdentity.revision,
    `${surface} OCI revision must match the requested local release identity`
  );
}

let releaseIdentityArtifactPath;

for (const port of localReviewPorts.ports) {
  const health = await waitForHttp(
    `http://127.0.0.1:${port}/tenant/v1/healthz`
  );
  const body = await health.json();
  assert.equal(body.schemaVersion, "tenant_transport_health.v1");

  const page = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(2_000)
  });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(page.headers.get("set-cookie"), null);
  assert.match(await page.text(), /IPO\.ONE/);

  const authentication = await fetch(
    `http://127.0.0.1:${port}/auth/v1/options`,
    {
      headers: {
        accept: "application/json"
      },
      signal: AbortSignal.timeout(2_000)
    }
  );
  assert.equal(authentication.status, 200);
  const authenticationOptions = await authentication.json();
  assert.equal(
    authenticationOptions.schemaVersion,
    "ipo_one_authentication_options.v1"
  );
  assert.equal(authenticationOptions.profile, "local_no_funds");
  assert.equal(authenticationOptions.enabled, true);
  assert.equal(authenticationOptions.sessionActive, false);
  assert.equal(authenticationOptions.walletAuthentication, true);
}

const localProfile = await loadPrivatePilotProfile();
const localIdentities = createLocalPilotIdentities({
  profile: localProfile
});
const agentIdentity = localIdentities.identities.agent;
const agentKey = await loadLocalAgentKeyMaterial(AGENT_KEY_FILE);
const agentProof = await createLocalAgentProof({
  keyMaterial: agentKey,
  tenantId: localProfile.tenantId,
  clientId: agentIdentity.clientId,
  policyVersion: agentIdentity.createContext().policyVersion,
  audience: `urn:ipo.one:local:tenant-http:${localReviewPorts.basePort + 1}`
});
const agentCatalog = await fetch(
  `http://127.0.0.1:${localReviewPorts.basePort + 1}/tenant/v1/catalog`,
  {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${agentProof}`
    },
    signal: AbortSignal.timeout(2_000)
  }
);
assert.equal(agentCatalog.status, 200, await agentCatalog.text());

const databaseEvidence = compose(
  [
    "exec",
    "--no-TTY",
    "postgres",
    "psql",
    "--username",
    "ipo_one_owner",
    "--dbname",
    "ipo_one_private_pilot",
    "--tuples-only",
    "--no-align",
    "--command",
    `SELECT json_build_object(
       'major', current_setting('server_version_num')::int / 10000,
       'migrationCount', (SELECT count(*) FROM schema_migrations),
       'tenantCount', (SELECT count(*) FROM tenants),
       'forcedRlsTables', (
         SELECT count(*) FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p')
           AND c.relrowsecurity AND c.relforcerowsecurity
       ),
       'appRoleSafe', (
         SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
           AND NOT rolcreaterole AND NOT rolreplication
         FROM pg_roles WHERE rolname='ipo_one_private_pilot_app'
       ),
       'authenticationRoleSafe', (
         SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
           AND NOT rolcreaterole AND NOT rolreplication
         FROM pg_roles WHERE rolname='ipo_one_private_pilot_auth'
       ),
       'authenticationCredentialCount', (
         SELECT count(*) FROM authentication_credentials
       ),
       'activeAuthenticationCredentialCount', (
         SELECT count(*) FROM authentication_credentials WHERE status = 'active'
       ),
       'currentActiveAuthenticationCredentialCount', (
         SELECT count(*)
           FROM authentication_credentials
          WHERE status = 'active'
            AND issuer = ANY(ARRAY[
              'https://127.0.0.1:${localReviewPorts.basePort}',
              'https://127.0.0.1:${localReviewPorts.basePort + 1}',
              'https://127.0.0.1:${localReviewPorts.basePort + 2}',
              'https://127.0.0.1:${localReviewPorts.basePort + 3}',
              'https://workload.local.ipo.one'
            ]::text[])
       ),
       'currentActiveAuthenticationActorCount', (
         SELECT count(DISTINCT actor_id)
           FROM authentication_credentials
          WHERE status = 'active'
            AND issuer = ANY(ARRAY[
              'https://127.0.0.1:${localReviewPorts.basePort}',
              'https://127.0.0.1:${localReviewPorts.basePort + 1}',
              'https://127.0.0.1:${localReviewPorts.basePort + 2}',
              'https://127.0.0.1:${localReviewPorts.basePort + 3}',
              'https://workload.local.ipo.one'
            ]::text[])
       ),
       'capitalPartnerProfileCount', (
         SELECT count(*) FROM capital_partner_profiles
       ),
       'evidenceEnvelopeCount', (
         SELECT count(*) FROM evidence_envelopes
       ),
       'evidenceAnchorCount', (
         SELECT count(*) FROM evidence_chain_anchors
       ),
       'missingEvidenceAnchorCount', (
         SELECT count(*)
           FROM evidence_envelopes e
          WHERE NOT EXISTS (
            SELECT 1
              FROM evidence_chain_anchors a
             WHERE a.tenant_id = e.tenant_id
               AND a.evidence_event_id = e.id
               AND a.evidence_hash = e.evidence_hash
          )
       ),
       'orphanEvidenceAnchorCount', (
         SELECT count(*)
           FROM evidence_chain_anchors a
          WHERE NOT EXISTS (
            SELECT 1
              FROM evidence_envelopes e
             WHERE e.tenant_id = a.tenant_id
               AND e.id = a.evidence_event_id
               AND e.evidence_hash = a.evidence_hash
          )
       ),
       'misrepresentedEvidenceHashCount', (
         SELECT count(*)
           FROM evidence_chain_anchors
          WHERE transaction_hash = evidence_hash
       ),
       'failedEvidenceAnchorCount', (
         SELECT count(*)
           FROM evidence_chain_anchors
          WHERE status = 'failed'
       ),
       'unprovedFinalizedAnchorCount', (
         SELECT count(*)
           FROM evidence_chain_anchors a
          WHERE a.status = 'finalized'
            AND NOT EXISTS (
              SELECT 1
                FROM evidence_chain_anchor_observations o
               WHERE o.tenant_id = a.tenant_id
                 AND o.anchor_id = a.id
                 AND o.status = 'finalized'
            )
       )
     );`
  ],
  { capture: true }
);
const database = JSON.parse(databaseEvidence);
assert.equal(database.major, 17);
assert.equal(Number(database.migrationCount), migrations.length);
assert.equal(Number(database.tenantCount), 1);
assert.ok(Number(database.forcedRlsTables) > 0);
assert.equal(database.appRoleSafe, true);
assert.equal(database.authenticationRoleSafe, true);
assert.ok(Number(database.authenticationCredentialCount) >= 5);
assert.ok(
  Number(database.activeAuthenticationCredentialCount) >=
    Number(database.currentActiveAuthenticationCredentialCount)
);
assert.equal(
  Number(database.currentActiveAuthenticationCredentialCount),
  Object.keys(localIdentities.identities).length
);
assert.equal(
  Number(database.currentActiveAuthenticationActorCount),
  Object.keys(localIdentities.identities).length
);
assert.equal(Number(database.capitalPartnerProfileCount), 1);
assert.equal(
  Number(database.evidenceAnchorCount),
  Number(database.evidenceEnvelopeCount)
);
assert.equal(Number(database.missingEvidenceAnchorCount), 0);
assert.equal(Number(database.orphanEvidenceAnchorCount), 0);
assert.equal(Number(database.misrepresentedEvidenceHashCount), 0);
assert.equal(Number(database.failedEvidenceAnchorCount), 0);
assert.equal(Number(database.unprovedFinalizedAnchorCount), 0);

const heartbeatText = compose(
  [
    "exec",
    "--no-TTY",
    "worker",
    "/nodejs/bin/node",
    "-e",
    "process.stdout.write(require('node:fs').readFileSync('/tmp/ipo-one-local-worker-heartbeat.json','utf8'))"
  ],
  { capture: true }
);
const heartbeat = JSON.parse(heartbeatText);
assert.equal(heartbeat.schemaVersion, "ipo_one_local_worker_heartbeat.v1");
assert.equal(heartbeat.healthy, true);
assert.equal(heartbeat.syntheticOnly, true);
assert.equal(heartbeat.realFundsEnabled, false);
assert.equal(
  new Set([
    "not_configured",
    "unknown",
    "included",
    "safe",
    "finalized"
  ]).has(heartbeat.evidenceAnchorStatus),
  true
);
assert.equal(heartbeat.evidenceAnchorManualReconciliationRequired, false);
assert.equal(
  Number.isSafeInteger(heartbeat.creditOutcomeMaterializedCount),
  true
);
assert.ok(
  heartbeat.reconciliationStatus === "passed" ||
    heartbeat.reconciliationStatus === "not_due"
);

const pendingOutbox = Number(
  compose(
    [
      "exec",
      "--no-TTY",
      "postgres",
      "psql",
      "--username",
      "ipo_one_owner",
      "--dbname",
      "ipo_one_private_pilot",
      "--tuples-only",
      "--no-align",
      "--command",
      "SELECT count(*) FROM outbox_messages WHERE published_at IS NULL AND dead_lettered_at IS NULL;"
    ],
    { capture: true }
  )
);
assert.equal(pendingOutbox, 0);

// Publish exact runtime identity only after every HTTP, authentication,
// PostgreSQL, RLS, worker, reconciliation, Evidence, and outbox assertion has
// passed. A failed acceptance run must not leave a verifier-eligible receipt.
if (releaseIdentity.exactCandidate) {
  const artifact = {
    schemaVersion: "m1_b_local_release_identity.v1",
    releaseId: releaseIdentity.revision,
    imageRevision: runtimeRevisions.image,
    pilotRevision: runtimeRevisions.pilot,
    workerRevision: runtimeRevisions.worker,
    postgresBacked: true,
    fixtureHost: false
  };
  await mkdir(P0_5_OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
  const outputMetadata = await lstat(P0_5_OUTPUT_DIRECTORY);
  assert.equal(
    outputMetadata.isDirectory() && !outputMetadata.isSymbolicLink(),
    true,
    "P0-5 Evidence output must be one real directory"
  );
  await chmod(P0_5_OUTPUT_DIRECTORY, 0o700);
  releaseIdentityArtifactPath = resolve(
    P0_5_OUTPUT_DIRECTORY,
    `${releaseIdentity.revision}.local-release-identity.json`
  );
  const temporaryPath = `${releaseIdentityArtifactPath}.${process.pid}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    await rename(temporaryPath, releaseIdentityArtifactPath);
    await chmod(releaseIdentityArtifactPath, 0o600);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // Preserve the original artifact-write failure.
    }
    throw error;
  }
}

const releaseScope = releaseIdentity.exactCandidate
  ? `exact M1-B candidate ${releaseIdentity.revision}`
  : "developer revision local-stack; this result cannot satisfy M1-B P0-5 exact-commit acceptance";
process.stdout.write(
  `LOCAL-STACK-001 live acceptance passed for ${releaseScope}: PostgreSQL 17, ${migrations.length} ` +
    "migrations, wallet-gated Human/Principal/Risk/Capital Partner workspaces and a durable Agent proof through the " +
    "verified Lima host-agent loopback forwarding, least-privilege forced RLS, worker heartbeat, " +
    "reconciliation, failure-free one-to-one Evidence anchor coverage without fake transaction " +
    "hashes, and " +
    "an empty pending outbox.\n"
);
if (releaseIdentityArtifactPath) {
  process.stdout.write(
    `LOCAL-STACK-001 exact release identity receipt: ${releaseIdentityArtifactPath}\n`
  );
}
