import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
}

test("root development and Vercel entry points select one durable product truth", async () => {
  const [packageText, rootVercelText, runtimeMapText] = await Promise.all([
    source("package.json"),
    source("vercel.json"),
    source("deploy/canonical-product-runtime.v1.json")
  ]);
  const packageManifest = JSON.parse(packageText);
  const rootVercel = JSON.parse(rootVercelText);
  const runtimeMap = JSON.parse(runtimeMapText);

  assert.equal(packageManifest.scripts.dev, "node scripts/local-stack.mjs up");
  assert.equal(
    packageManifest.scripts["dev:api"],
    "node apps/private-pilot/src/start.js"
  );
  assert.equal(
    packageManifest.scripts["dev:legacy-demo"],
    "node apps/api/src/server.js"
  );

  assert.ok(rootVercel.functions["api/vercel-sandbox.mjs"]);
  assert.ok(rootVercel.functions["api/vercel-sandbox-cron.mjs"]);
  assert.equal(rootVercel.functions["api/index.mjs"], undefined);
  assert.deepEqual(rootVercel.rewrites.at(-1), {
    source: "/(.*)",
    destination: "/api/vercel-sandbox"
  });

  assert.equal(runtimeMap.productTruth.transportBoundary, "tenant_protocol");
  assert.equal(runtimeMap.productTruth.commandBoundary, "tenant_command_gateway");
  assert.equal(runtimeMap.productTruth.kernel, "shared_human_agent_obligation_kernel");
  assert.equal(runtimeMap.productTruth.canonicalState, "postgresql");
  assert.equal(runtimeMap.local.canonicalProductTruth, true);
  assert.equal(runtimeMap.hosted.canonicalProductTruth, true);
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
  assert.deepEqual(runtimeMap.authority, {
    realFundsEnabled: false,
    externalFundsMovementEnabled: false,
    productionCreditEnabled: false,
    realHumanLendingEnabled: false,
    mainnetEnabled: false,
    protocolFeesEnabled: false,
    signerAuthorityEnabled: false,
    withdrawalAuthorityEnabled: false,
    venueWriteAuthorityEnabled: false
  });
});

test("legacy demo exposes a fail-closed non-authoritative runtime contract", async () => {
  const [runtimeSource, serverSource] = await Promise.all([
    source("apps/api/src/runtime-config.js"),
    source("apps/api/src/server.js")
  ]);

  assert.match(runtimeSource, /canonicalProductTruth:\s*false/);
  assert.match(runtimeSource, /releaseEligible:\s*false/);
  assert.match(runtimeSource, /stateDurability:\s*"process_local_ephemeral"/);
  assert.match(serverSource, /canonicalProductTruth:\s*runtimeConfig\.canonicalProductTruth/);
  assert.match(serverSource, /releaseEligible:\s*runtimeConfig\.releaseEligible/);
  assert.match(serverSource, /stateDurability:\s*runtimeConfig\.stateDurability/);
});
