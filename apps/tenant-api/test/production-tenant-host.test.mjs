import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import test from "node:test";
import { createProductionTenantHost } from "../src/production-tenant-host.js";

async function unusedPort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

async function fixture() {
  const port = await unusedPort();
  let ready = true;
  let gatewayCalls = 0;
  const host = createProductionTenantHost({
    gateway: { async execute() { gatewayCalls += 1; } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    readinessCheck: async () => ready,
    verifyEdgeRequest: async (request) => request.headers["x-ipo-edge"] === "approved",
    publicOrigin: "https://ipo.one",
    port,
    releaseId: "a".repeat(40)
  });
  await host.listen();
  return {
    host,
    port,
    setReady(value) { ready = value; },
    get gatewayCalls() { return gatewayCalls; }
  };
}

test("production Host exposes bounded liveness/readiness without a DEMO route", async (t) => {
  const runtime = await fixture();
  t.after(() => runtime.host.close());

  const live = await get(runtime.port, "/livez", {
    host: `127.0.0.1:${runtime.port}`
  });
  assert.equal(live.status, 200);
  assert.deepEqual(JSON.parse(live.body), {
    status: "alive",
    releaseId: "a".repeat(40),
    schemaVersion: "production_liveness.v1"
  });

  runtime.setReady(false);
  const ready = await get(runtime.port, "/readyz", {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https",
    "x-ipo-edge": "approved"
  });
  assert.equal(ready.status, 503);
  assert.equal(JSON.parse(ready.body).status, "unavailable");
  assert.match(ready.headers["strict-transport-security"], /max-age=63072000/);

  const demo = await get(runtime.port, "/v1/demo/reset", {
    host: "ipo.one",
    "x-forwarded-proto": "https",
    "x-ipo-edge": "approved"
  });
  assert.equal(demo.status, 404);
  assert.equal(runtime.gatewayCalls, 0);
});

test("production Host rejects direct and downgraded traffic before authentication", async (t) => {
  const runtime = await fixture();
  t.after(() => runtime.host.close());

  for (const headers of [
    { host: "ipo.one", "x-forwarded-proto": "https" },
    { host: "ipo.one", "x-forwarded-proto": "http", "x-ipo-edge": "approved" },
    { host: "attacker.example", "x-forwarded-proto": "https", "x-ipo-edge": "approved" }
  ]) {
    const response = await get(runtime.port, "/tenant/v1/healthz", headers);
    assert.equal(response.status, 421);
  }
  assert.equal(runtime.gatewayCalls, 0);
});

test("production Host publishes the disabled remote Agent HTTPS contract behind the approved edge", async (t) => {
  const runtime = await fixture();
  t.after(() => runtime.host.close());

  const response = await get(runtime.port, "/agent-openapi.json", {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https",
    "x-ipo-edge": "approved"
  });
  assert.equal(response.status, 200);
  const contract = JSON.parse(response.body);
  assert.equal(contract.openapi, "3.1.2");
  assert.equal(contract["x-ipo-one-schema-version"], "agent_https_openapi.v1");
  assert.equal(
    contract["x-ipo-one-activation"],
    "disabled_pending_named_deployment_approval"
  );
  assert.deepEqual(
    contract.paths["/tenant/v1/operations"].post.security,
    [{ workloadBearer: [], mutualTls: [] }]
  );
  assert.equal(
    contract.paths["/tenant/v1/operations"].post[
      "x-ipo-one-idempotency"
    ].unknownOutcomeMustNotUseNewIdempotencyKey,
    true
  );
  assert.equal(
    contract["x-ipo-one-safety"].remoteParticipantAccessEnabled,
    false
  );
  assert.equal(runtime.gatewayCalls, 0);
});

test("production Host publishes zero-funded real-value and Provider capability truth", async (t) => {
  const runtime = await fixture();
  t.after(() => runtime.host.close());

  const response = await get(runtime.port, "/.well-known/ipo-one.json", {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https",
    "x-ipo-edge": "approved"
  });
  assert.equal(response.status, 200);
  const document = JSON.parse(response.body);
  assert.equal(document.schemaVersion, "ipo_one_deployment_capability.v1");
  assert.equal(document.deployment.hostingStatus, "PRODUCTION_HOSTED");
  assert.equal(document.deployment.releaseId, "a".repeat(40));
  assert.equal(document.interfaces.humanConsole, "https://ipo.one");
  assert.equal(
    document.realValue.supportStatus,
    "SUPPORTED_INACTIVE_ZERO_FUNDED"
  );
  assert.equal(document.realValue.activationStatus, "DISABLED");
  assert.equal(document.realValue.realFundsEnabled, false);
  assert.equal(document.realValue.productionFundsMoved, false);
  assert.equal(document.providers.providerSandbox, "AVAILABLE");
  assert.equal(document.providers.externalProviderExecution, "DISABLED");
  assert.equal(
    document.providers.hyperCoreProductionExecution,
    "BLOCKED_EXTERNAL_DEPENDENCY"
  );
  assert.equal(document.safety.productionSignerAuthorityEnabled, false);
  assert.equal(document.safety.venueWriteAuthorityEnabled, false);
  assert.equal(runtime.gatewayCalls, 0);
});

test("production Host requires all real authentication and edge adapters", () => {
  assert.throws(
    () => createProductionTenantHost({}),
    (error) => error?.code === "invalid_production_tenant_host_config"
  );
});

test("production Host injects only the configured public Agent account into the web shell", async (t) => {
  const port = await unusedPort();
  const account = `0x${"4".repeat(40)}`;
  const host = createProductionTenantHost({
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    localAgentAccountProvider: async () => account,
    readinessCheck: async () => true,
    verifyEdgeRequest: async () => true,
    publicOrigin: "https://ipo.one",
    port,
    releaseId: "a".repeat(40)
  });
  await host.listen();
  t.after(() => host.close());
  const response = await get(port, "/", {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https"
  });
  assert.equal(response.status, 200);
  assert.match(
    response.body,
    new RegExp(`meta name="ipo-one-local-agent-account" content="${account}"`)
  );
  assert.equal(
    response.body.match(/meta name="ipo-one-local-agent-account"/g)?.length,
    1
  );
});
