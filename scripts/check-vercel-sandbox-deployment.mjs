import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  manifestText,
  vercelText,
  riskVercelText,
  packageText,
  apiSource,
  cronApiSource,
  cronSource,
  environmentSource,
  bundleSource
] = await Promise.all([
  source("deploy/vercel/m1-b-sandbox.manifest.v1.json"),
  source("deploy/vercel/vercel.m1-b-sandbox.json"),
  source("deploy/vercel/vercel.m1-b-sandbox-risk.json"),
  source("deploy/vercel/package.m1-b-sandbox.json"),
  source("api/vercel-sandbox.mjs"),
  source("api/vercel-sandbox-cron.mjs"),
  source("apps/private-pilot/src/vercel-sandbox-cron.js"),
  source("apps/private-pilot/src/production-environment.js"),
  source("scripts/build-vercel-sandbox-bundle.mjs")
]);

const manifest = JSON.parse(manifestText);
const vercel = JSON.parse(vercelText);
const riskVercel = JSON.parse(riskVercelText);
const deploymentPackage = JSON.parse(packageText);

assert.equal(manifest.schemaVersion, "ipo.one.vercel-m1-b-sandbox/v1");
assert.equal(manifest.productProfile, "deployable_sandbox_vertical_slice");
assert.equal(manifest.vercelTargetEnvironment, "production");
assert.equal(manifest.vercelTargetReason, "Vercel Cron invokes only production deployments");
for (const boundary of [
  "productProductionClaim",
  "releaseClaim",
  "realFundsEnabled",
  "protocolFeesEnabled",
  "signerAuthorityEnabled",
  "withdrawalAuthorityEnabled",
  "venueWriteAuthorityEnabled"
]) assert.equal(manifest[boundary], false, `${boundary} must remain false`);
assert.equal(manifest.topology.continuousWorker, false);
assert.equal(manifest.topology.projectCount, 2);
assert.equal(manifest.topology.externalQueue, false);
assert.equal(manifest.topology.externalCache, false);
assert.equal(manifest.runtime.cronSchedule, "*/5 * * * *");
assert.equal(manifest.authority.vercelProConfirmed, true);
assert.equal(manifest.authority.rcBranchAuthorized, false);
assert.equal(manifest.authority.releaseTagAuthorized, false);

assert.equal(deploymentPackage.engines.node, "24.x");
assert.equal(vercel.fluid, true);
assert.equal(vercel.crons.length, 1);
assert.deepEqual(vercel.crons[0], {
  path: "/api/cron",
  schedule: "*/5 * * * *"
});
assert.equal(vercel.functions["api/vercel-sandbox.mjs"].maxDuration, 30);
assert.equal(vercel.functions["api/vercel-sandbox-cron.mjs"].maxDuration, 30);
assert.equal(Object.hasOwn(vercel, "env"), false);
assert.equal(riskVercel.fluid, true);
assert.equal(Object.hasOwn(riskVercel, "crons"), false);
assert.equal(Object.hasOwn(riskVercel.functions, "api/vercel-sandbox-cron.mjs"), false);

assert.match(apiSource, /handleVercelSandboxRequest/);
assert.match(cronApiSource, /CRON_SECRET/);
assert.match(cronApiSource, /timingSafeEqual/);
assert.match(cronSource, /pg_try_advisory_lock/);
assert.match(cronSource, /vercel-sandbox-reconciliation-/);
assert.match(cronSource, /realFundsEnabled: false/);
assert.match(environmentSource, /VERCEL_PROJECT_PRODUCTION_URL/);
assert.match(environmentSource, /x-vercel-deployment-url/);
assert.match(environmentSource, /allowExitOnIdle: vercelSandbox/);
assert.match(bundleSource, /Deployment bundles require a clean exact source worktree/);
assert.match(bundleSource, /target: "node24"/);
assert.doesNotMatch(
  `${vercelText}\n${manifestText}`,
  /(?:PASSWORD|PRIVATE_KEY|DATABASE_URL|CRON_SECRET)\s*":\s*"[^"$]/
);

process.stdout.write(
  "Vercel M1-B Sandbox static gate passed: Pro five-minute Cron, Node 24 " +
  "Functions, PostgreSQL durability, exact bundle provenance, and no-real-funds boundaries are explicit.\n"
);
