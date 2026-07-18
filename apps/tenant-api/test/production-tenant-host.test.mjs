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

test("production Host requires all real authentication and edge adapters", () => {
  assert.throws(
    () => createProductionTenantHost({}),
    (error) => error?.code === "invalid_production_tenant_host_config"
  );
});
