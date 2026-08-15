import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  parseClosedPilotOperations,
  parseDeployTopology,
  parseProviderSelection
} from "../packages/deployment-topology/src/index.js";

const operations = parseClosedPilotOperations(
  await readFile("deploy/closed-pilot/operations.v1.json", "utf8")
);
const topology = parseDeployTopology(
  await readFile("deploy/closed-pilot/topology.v1.json", "utf8")
);
const providers = parseProviderSelection(
  await readFile("deploy/closed-pilot/provider-selection.pending.json", "utf8")
);
const releaseManifestBytes = await readFile(
  operations.sourceRelease.manifestPath
);
const releaseManifest = JSON.parse(releaseManifestBytes);
const manifestSha = createHash("sha256")
  .update(releaseManifestBytes)
  .digest("hex");

assert.equal(releaseManifest.status, "sealed");
assert.equal(
  releaseManifest.releaseCandidateId,
  operations.sourceRelease.releaseCandidateId
);
assert.equal(manifestSha, operations.sourceRelease.manifestSha256);

execFileSync(
  "git",
  ["cat-file", "-e", `${operations.sourceRelease.commitSha}^{commit}`],
  { stdio: "ignore" }
);
const sealedManifestBytes = execFileSync(
  "git",
  [
    "show",
    `${operations.sourceRelease.commitSha}:${operations.sourceRelease.manifestPath}`
  ]
);
assert.equal(
  createHash("sha256").update(sealedManifestBytes).digest("hex"),
  operations.sourceRelease.manifestSha256
);

assert.equal(topology.launchBlocked, true);
assert.equal(topology.activationGates.includes("OPS-004"), true);
assert.equal(providers.provisioningBlocked, true);
assert.equal(providers.recommendation.workerActivation, "disabled");
assert.equal(operations.launchBlocked, true);
assert.deepEqual(operations.satisfiedActivationGates, []);
assert.equal(
  Object.values(operations.authority).every((value) => value === false),
  true
);

const operationsRunbook = await readFile(operations.runbooks.operations, "utf8");
const task = await readFile(operations.runbooks.task, "utf8");
for (const marker of [
  "Restore drill",
  "Reconciliation and synthetic checks",
  "Alerting and ownership",
  "Secret rotation",
  "Rollback"
]) {
  assert.match(operationsRunbook, new RegExp(marker, "i"));
}
assert.match(task, /Status: Implemented locally; activation blocked/);

const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(
  packageManifest.scripts["check:closed-pilot-operations"],
  "node scripts/check-closed-pilot-operations.mjs"
);
assert.match(
  packageManifest.scripts.check,
  /pnpm run check:closed-pilot-operations/
);

console.log(
  "OPS-004 contract passed: the sealed RC is bound to fail-closed backup, " +
    "restore, reconciliation, synthetics, alerts, secret rotation, and rollback gates; " +
    "cloud mutation and launch remain disabled."
);
