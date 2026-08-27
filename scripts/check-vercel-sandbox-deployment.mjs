import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function exactKeys(value, keys) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
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
  source("deploy/vercel/m1-b-sandbox.manifest.v2.json"),
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

exactKeys(manifest, [
  "schemaVersion",
  "status",
  "productProfile",
  "deliveryMode",
  "vercelTargetEnvironment",
  "vercelTargetReason",
  "productionTargetConfigured",
  "deploymentStatus",
  "deployedReleaseId",
  "productProductionClaim",
  "productionHostingClaim",
  "releaseClaim",
  "realFundsEnabled",
  "protocolFeesEnabled",
  "signerAuthorityEnabled",
  "withdrawalAuthorityEnabled",
  "venueWriteAuthorityEnabled",
  "topology",
  "runtime",
  "database",
  "authority",
  "conditionalInterfaces"
]);
assert.equal(manifest.schemaVersion, "ipo.one.vercel-m1-b-sandbox/v2");
assert.equal(
  manifest.status,
  "founder_authorized_staged_primary_deployment"
);
assert.equal(manifest.productProfile, "deployable_sandbox_vertical_slice");
assert.equal(manifest.deliveryMode, "L1_PUBLIC_SANDBOX");
assert.equal(manifest.vercelTargetEnvironment, "production");
assert.match(manifest.vercelTargetReason, /configuration, not hosting or deployment authority/);
assert.equal(manifest.productionTargetConfigured, true);
assert.equal(
  manifest.deploymentStatus,
  "STAGED_PRIMARY_DEPLOYMENT_AUTHORIZED"
);
assert.equal(manifest.deployedReleaseId, null);
for (const boundary of [
  "productProductionClaim",
  "productionHostingClaim",
  "releaseClaim",
  "realFundsEnabled",
  "protocolFeesEnabled",
  "signerAuthorityEnabled",
  "withdrawalAuthorityEnabled",
  "venueWriteAuthorityEnabled"
]) assert.equal(manifest[boundary], false, `${boundary} must remain false`);
assert.equal(manifest.topology.continuousWorker, false);
exactKeys(manifest.topology, [
  "projectCount",
  "projectRoles",
  "primaryProtocolCapabilities",
  "hostedBrowserAcceptanceRoles",
  "riskProjectIncluded",
  "riskProjectDeploymentTarget",
  "web",
  "api",
  "automation",
  "canonicalState",
  "durability",
  "continuousWorker",
  "externalQueue",
  "externalCache"
]);
assert.equal(manifest.topology.projectCount, 1);
assert.deepEqual(manifest.topology.projectRoles, [
  "primary_product_and_bounded_automation"
]);
assert.deepEqual(manifest.topology.primaryProtocolCapabilities, [
  "human_borrower",
  "principal_agent",
  "capital_partner",
  "bounded_automation"
]);
assert.deepEqual(manifest.topology.hostedBrowserAcceptanceRoles, [
  "principal_agent"
]);
assert.equal(manifest.topology.riskProjectIncluded, false);
assert.equal(manifest.topology.riskProjectDeploymentTarget, false);
assert.equal(manifest.topology.externalQueue, false);
assert.equal(manifest.topology.externalCache, false);
assert.equal(manifest.runtime.cronSchedule, "*/15 * * * *");
assert.equal(
  manifest.authority.currentAuthoritySource,
  "docs/PRODUCT_CONSTITUTION.md"
);
exactKeys(manifest.authority, [
  "currentAuthoritySource",
  "mergeAuthorized",
  "deploymentAuthorized",
  "deploymentEvidenceCollectionAuthorized",
  "deploymentPromotionAuthorized",
  "aliasMutationAuthorized",
  "dnsMutationAuthorized",
  "customDomainAuthorized",
  "customDomain",
  "releaseTagAuthorized",
  "releaseSealAuthorized",
  "paidExternalIntegrationAuthorized",
  "zeroFundedRealValueSupportAuthorized",
  "realValueActivationAuthorized",
  "maximumVercelProjectsAuthorizedForDeployment"
]);
assert.equal(manifest.authority.deploymentAuthorized, true);
assert.equal(manifest.authority.deploymentEvidenceCollectionAuthorized, true);
for (const boundary of [
  "mergeAuthorized",
  "deploymentPromotionAuthorized",
  "aliasMutationAuthorized",
  "dnsMutationAuthorized",
  "customDomainAuthorized",
  "releaseTagAuthorized",
  "releaseSealAuthorized",
  "paidExternalIntegrationAuthorized",
  "zeroFundedRealValueSupportAuthorized",
  "realValueActivationAuthorized"
]) {
  assert.equal(
    manifest.authority[boundary],
    false,
    `${boundary} must remain false in the current Vercel manifest`
  );
}
assert.equal(manifest.authority.customDomain, null);
assert.equal(manifest.authority.maximumVercelProjectsAuthorizedForDeployment, 1);

exactKeys(manifest.conditionalInterfaces, ["riskProject"]);
assert.deepEqual(manifest.conditionalInterfaces.riskProject, {
  targetMilestone: "M1_C_L2_CLOSED_NO_FUNDS",
  configurationPath: "deploy/vercel/vercel.m1-b-sandbox-risk.json",
  bundleBuilderRole: "risk",
  disposition: "PRESERVED_CONDITIONAL_FUTURE_COMPATIBILITY_ASSET",
  activeForCurrentRelease: false,
  deploymentTarget: false,
  deploymentAuthorized: false,
  requiredAssurance: "RECENT_PHISHING_RESISTANT_MFA",
  requiresSeparateFounderAuthorization: true
});
assert.equal(deploymentPackage.engines.node, "24.x");
assert.equal(vercel.fluid, true);
assert.equal(vercel.crons.length, 1);
assert.deepEqual(vercel.crons[0], {
  path: "/api/cron",
  schedule: "*/15 * * * *"
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
assert.equal(manifest.conditionalInterfaces.riskProject.activeForCurrentRelease, false);
assert.equal(manifest.conditionalInterfaces.riskProject.deploymentTarget, false);
assert.equal(manifest.conditionalInterfaces.riskProject.deploymentAuthorized, false);

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
  "Vercel Sandbox static gate passed: current Primary-only configuration " +
  "authorizes one staged unaliased deployment and Evidence collection, " +
  "promotion and alias authority remain false, the Risk bundle is a deferred " +
  "interface, and no-real-funds boundaries are explicit.\n"
);
