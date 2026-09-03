import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import test from "node:test";
import { createProductionTenantHost } from "../src/production-tenant-host.js";
import { createAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";

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

function post(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = httpRequest({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        ...headers
      }
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
    request.end(payload);
  });
}

async function fixture({
  authenticationReferenceHash = {
    mode: "overlap_v2_write_v1_lookup",
    writeKeyVersion: "v2",
    legacyLookupKeyVersion: "v1"
  },
  deploymentRole = "primary"
} = {}) {
  const port = await unusedPort();
  let ready = true;
  let gatewayCalls = 0;
  const host = createProductionTenantHost({
    authenticationReferenceHash,
    gateway: { async execute() { gatewayCalls += 1; } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    deploymentRole,
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

async function workspaceFixture(workspaceName) {
  const port = await unusedPort();
  const host = createProductionTenantHost({
    authenticationReferenceHash: {
      mode: "single_v2",
      writeKeyVersion: "v2",
      legacyLookupKeyVersion: null
    },
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    deploymentRole: "primary",
    workspaceNameProvider: async () => workspaceName,
    readinessCheck: async () => true,
    verifyEdgeRequest: async () => true,
    publicOrigin: "https://ipo.one",
    port,
    releaseId: "a".repeat(40)
  });
  await host.listen();
  return { host, port };
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
  assert.deepEqual(JSON.parse(ready.body), {
    status: "unavailable",
    releaseId: "a".repeat(40),
    deploymentRole: "primary",
    profile: "closed_non_funds_pilot",
    realFundsEnabled: false,
    authenticationReferenceHash: {
      mode: "overlap_v2_write_v1_lookup",
      writeKeyVersion: "v2",
      legacyLookupKeyVersion: "v1"
    },
    schemaVersion: "production_readiness.v2"
  });
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

test("production Host publishes the active no-funds remote Agent HTTPS contract behind the approved edge", async (t) => {
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
    "active_public_authenticated_no_funds"
  );
  assert.equal(
    contract.paths["/.well-known/ipo-one.json"].get.operationId,
    "getDeployedChainCapability"
  );
  assert.deepEqual(
    contract.paths["/.well-known/ipo-one.json"].get.security,
    []
  );
  assert.deepEqual(
    contract.paths["/tenant/v1/operations"].post.security,
    [
      { workloadBearer: [], mutualTls: [] },
      { workloadBearer: [], dpopProof: [] }
    ]
  );
  assert.equal(
    contract.paths["/tenant/v1/operations"].post[
      "x-ipo-one-idempotency"
    ].unknownOutcomeMustNotUseNewIdempotencyKey,
    true
  );
  assert.equal(
    contract["x-ipo-one-safety"].remoteParticipantAccessEnabled,
    true
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
  assert.equal(document.deployment.deploymentRole, "primary");
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
  assert.equal(document.providers.syntheticMeteredResource.status, "UNAVAILABLE");
  assert.equal(
    document.providers.hyperCoreProductionExecution,
    "BLOCKED_EXTERNAL_DEPENDENCY"
  );
  assert.equal(document.safety.productionSignerAuthorityEnabled, false);
  assert.equal(document.safety.venueWriteAuthorityEnabled, false);
  assert.deepEqual(document.chainEvidence, {
    status: "DISABLED",
    reasonCode: "approved_testnet_authority_unavailable",
    currentUserWritesEnabled: false,
    hashOnly: true,
    network: null,
    contractAddress: null,
    transactionSubmissionConfigured: false,
    observationConfigured: false,
    finalityConfigured: false,
    reconciliationConfigured: false,
    historicalArtifactsAreCurrentUserEvidence: false,
    lifecycleStates: [
      "queued",
      "submitted",
      "observed",
      "finalized",
      "reconciled",
      "failed"
    ],
    releaseId: "a".repeat(40),
    schemaVersion: "ipo_one_chain_capability.v1"
  });
  assert.equal(runtime.gatewayCalls, 0);
});

test("production Host exposes the synthetic Metered Resource only through authenticated Agent transport", async (t) => {
  const port = await unusedPort();
  const authenticationContext = createAuthenticationContext({
    tenantId: "tenant_metered_host",
    actorId: "actor_metered_agent",
    actorType: "agent",
    clientId: "client_metered_agent",
    credentialId: "credential_metered_agent",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["obligation.read.owned"],
    roles: ["agent_runtime"],
    tokenJtiHash: "a".repeat(64),
    authenticationMethod: "private_key_jwt",
    senderConstraintMethod: "dpop",
    authenticatedAt: new Date(),
    amr: []
  });
  let consumed;
  const host = createProductionTenantHost({
    authenticationReferenceHash: {
      mode: "single_v2",
      writeKeyVersion: "v2",
      legacyLookupKeyVersion: null
    },
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { return authenticationContext; } },
    createNetworkContext: async () => ({ trusted: true }),
    csrfTokenProvider: async () => undefined,
    deploymentRole: "primary",
    readinessCheck: async () => true,
    verifyEdgeRequest: async () => true,
    publicOrigin: "https://ipo.one",
    port,
    releaseId: "a".repeat(40),
    syntheticMeteredResourceService: {
      profile: { status: "AVAILABLE" },
      async consume(input) {
        consumed = input;
        return {
          status: "consumed",
          obligationId: input.body.obligationId,
          schemaVersion: "ipo_one_synthetic_metered_resource_receipt.v1"
        };
      }
    }
  });
  await host.listen();
  t.after(() => host.close());
  const body = {
    schemaVersion: "ipo_one_synthetic_metered_resource_request.v1",
    obligationId: "obligation_metered_host_001",
    quantity: "250",
    idempotencyKey: "hosted-metered-resource-0001"
  };
  const response = await post(port, "/tenant/v1/synthetic-metered-resource", body, {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https",
    authorization: "Bearer test",
    "x-request-id": "request-metered-host-0001"
  });
  assert.equal(response.status, 200);
  assert.deepEqual(consumed.body, body);
  assert.equal(consumed.authenticationContext.actorId, "actor_metered_agent");
  assert.deepEqual(consumed.networkContext, { trusted: true });
});

test("production Host publishes the exact configured deployment role", async (t) => {
  const runtime = await fixture({ deploymentRole: "risk" });
  t.after(() => runtime.host.close());

  const capability = await get(runtime.port, "/.well-known/ipo-one.json", {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https",
    "x-ipo-edge": "approved"
  });
  const readiness = await get(runtime.port, "/readyz", {
    host: `127.0.0.1:${runtime.port}`
  });
  assert.equal(JSON.parse(capability.body).deployment.deploymentRole, "risk");
  assert.equal(JSON.parse(readiness.body).deploymentRole, "risk");
});

test("production Host requires all real authentication and edge adapters", () => {
  assert.throws(
    () => createProductionTenantHost({}),
    (error) => error?.code === "invalid_production_tenant_host_config"
  );
});

test("production Host rejects a reference-hash readiness claim inconsistent with its mode", async () => {
  await assert.rejects(
    () => fixture({
      authenticationReferenceHash: {
        mode: "single_v2",
        writeKeyVersion: "v1",
        legacyLookupKeyVersion: null
      }
    }),
    (error) => error?.code === "invalid_production_tenant_host_config"
  );
});

test("production Host injects only the configured public Agent account into the web shell", async (t) => {
  const port = await unusedPort();
  const account = `0x${"4".repeat(40)}`;
  const host = createProductionTenantHost({
    authenticationReferenceHash: {
      mode: "single_v2",
      writeKeyVersion: "v2",
      legacyLookupKeyVersion: null
    },
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    deploymentRole: "primary",
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

for (const workspaceName of ["controller", "risk"]) {
  test(`production Host injects one exact ${workspaceName} workspace name into the web shell`, async (t) => {
    const runtime = await workspaceFixture(workspaceName);
    t.after(() => runtime.host.close());
    const response = await get(runtime.port, "/", {
      host: "ipo.one",
      "x-forwarded-host": "ipo.one",
      "x-forwarded-proto": "https"
    });
    assert.equal(response.status, 200);
    assert.match(
      response.body,
      new RegExp(`meta name="ipo-one-workspace-name" content="${workspaceName}"`)
    );
    assert.equal(
      response.body.match(/meta name="ipo-one-workspace-name"/g)?.length,
      1
    );
  });
}

test("production Host rejects an invalid injected workspace name", async (t) => {
  const runtime = await workspaceFixture("unexpected workspace");
  t.after(() => runtime.host.close());
  const response = await get(runtime.port, "/", {
    host: "ipo.one",
    "x-forwarded-host": "ipo.one",
    "x-forwarded-proto": "https"
  });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).code, "invalid_tenant_workspace_bootstrap");
  assert.equal(response.body.includes("unexpected workspace"), false);
});
