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
  bundleSource,
  rootVercelText,
  runtimeMapText,
  legacyRuntimeSource,
  legacyServerSource
] = await Promise.all([
  source("deploy/vercel/m1-b-sandbox.manifest.v1.json"),
  source("deploy/vercel/vercel.m1-b-sandbox.json"),
  source("deploy/vercel/vercel.m1-b-sandbox-risk.json"),
  source("deploy/vercel/package.m1-b-sandbox.json"),
  source("api/vercel-sandbox.mjs"),
  source("api/vercel-sandbox-cron.mjs"),
  source("apps/private-pilot/src/vercel-sandbox-cron.js"),
  source("apps/private-pilot/src/production-environment.js"),
  source("scripts/build-vercel-sandbox-bundle.mjs"),
  source("vercel.json"),
  source("deploy/canonical-product-runtime.v1.json"),
  source("apps/api/src/runtime-config.js"),
  source("apps/api/src/server.js")
]);

const manifest = JSON.parse(manifestText);
const vercel = JSON.parse(vercelText);
const riskVercel = JSON.parse(riskVercelText);
const deploymentPackage = JSON.parse(packageText);
const rootVercel = JSON.parse(rootVercelText);
const runtimeMap = JSON.parse(runtimeMapText);

assert.equal(manifest.schemaVersion, "ipo.one.vercel-m1-b-sandbox/v1");
assert.equal(manifest.productProfile, "deployable_sandbox_vertical_slice");
assert.equal(manifest.vercelTargetEnvironment, "production");
assert.equal(manifest.vercelTargetReason, "Vercel Cron invokes only production deployments");
assert.equal(manifest.productionHostingClaim, true);
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
assert.equal(manifest.authority.customDomainAuthorized, true);
assert.equal(manifest.authority.customDomain, "ipo.one");
assert.equal(manifest.authority.zeroFundedRealValueSupportAuthorized, true);
assert.equal(manifest.authority.realValueActivationAuthorized, false);

assert.equal(deploymentPackage.engines.node, "24.x");
assert.equal(vercel.fluid, true);
assert.equal(vercel.crons.length, 1);
assert.deepEqual(vercel.crons[0], {
  path: "/api/cron",
  schedule: "*/5 * * * *"
});
assert.equal(vercel.functions["api/vercel-sandbox.mjs"].maxDuration, 30);
assert.equal(vercel.functions["api/vercel-sandbox-cron.mjs"].maxDuration, 30);
assert.deepEqual(vercel.redirects, [{
  source: "/(.*)",
  has: [{ type: "host", value: "www.ipo.one" }],
  destination: "https://ipo.one/$1",
  permanent: true
}]);
assert.equal(Object.hasOwn(vercel, "env"), false);
assert.ok(rootVercel.functions["api/vercel-sandbox.mjs"]);
assert.ok(rootVercel.functions["api/vercel-sandbox-cron.mjs"]);
assert.equal(rootVercel.functions["api/index.mjs"], undefined);
assert.deepEqual(rootVercel.rewrites, vercel.rewrites);
assert.deepEqual(rootVercel.redirects, vercel.redirects);
assert.deepEqual(rootVercel.crons, vercel.crons);
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
assert.match(bundleSource, /--untracked-files=no/);
assert.match(bundleSource, /sourceMaterialization: "tracked_git_archive"/);
assert.match(bundleSource, /untrackedInputIncluded: false/);
assert.match(bundleSource, /materializeTrackedGitSource/);
assert.match(bundleSource, /"--frozen-lockfile", "--ignore-scripts"/);
assert.match(bundleSource, /nodePaths: \[resolve\(trackedSource, "node_modules"\)\]/);
assert.match(bundleSource, /target: "node24"/);
assert.equal(runtimeMap.schemaVersion, "ipo.one.canonical-product-runtime/v1");
assert.equal(runtimeMap.productTruth.transportBoundary, "tenant_protocol");
assert.equal(runtimeMap.productTruth.commandBoundary, "tenant_command_gateway");
assert.equal(runtimeMap.productTruth.kernel, "shared_human_agent_obligation_kernel");
assert.equal(runtimeMap.productTruth.canonicalState, "postgresql");
assert.equal(runtimeMap.local.canonicalProductTruth, true);
assert.equal(runtimeMap.hosted.canonicalProductTruth, true);
assert.equal(runtimeMap.hosted.rootConfiguration, "vercel.json");
assert.equal(
  runtimeMap.hosted.releaseBundleConfiguration,
  "deploy/vercel/vercel.m1-b-sandbox.json"
);
assert.equal(
  runtimeMap.hosted.exactBundleBuilder,
  "scripts/build-vercel-sandbox-bundle.mjs"
);
assert.equal(runtimeMap.legacyDemo.canonicalProductTruth, false);
assert.equal(runtimeMap.legacyDemo.releaseEligible, false);
assert.equal(runtimeMap.legacyDemo.state, "process_local_ephemeral");
assert.match(legacyRuntimeSource, /canonicalProductTruth:\s*false/);
assert.match(legacyRuntimeSource, /releaseEligible:\s*false/);
assert.match(legacyRuntimeSource, /stateDurability:\s*"process_local_ephemeral"/);
assert.match(legacyServerSource, /canonicalProductTruth:\s*runtimeConfig\.canonicalProductTruth/);
assert.match(legacyServerSource, /releaseEligible:\s*runtimeConfig\.releaseEligible/);
assert.doesNotMatch(
  `${vercelText}\n${manifestText}`,
  /(?:PASSWORD|PRIVATE_KEY|DATABASE_URL|CRON_SECRET)\s*":\s*"[^"$]/
);

process.stdout.write(
  "Vercel M1-B Sandbox static gate passed: Pro five-minute Cron, Node 24 " +
  "Functions, PostgreSQL durability, exact bundle provenance, and no-real-funds boundaries are explicit.\n"
);
