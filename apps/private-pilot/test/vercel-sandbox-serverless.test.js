import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";
import { exportJWK, generateKeyPair } from "jose";
import cronHandler from "../../../api/vercel-sandbox-cron.mjs";
import {
  createProductionTenantRequestHandler
} from "../../tenant-api/src/production-tenant-host.js";
import { loadProductionClosedPilotEnvironment } from "../src/production-environment.js";
import { runVercelSandboxCronCycle } from "../src/vercel-sandbox-cron.js";

const workloadKeyPair = await generateKeyPair("ES256", { extractable: true });
const workloadPublicJwk = await exportJWK(workloadKeyPair.publicKey);
Object.assign(workloadPublicJwk, {
  alg: "ES256",
  kid: "m1-b-workload-001",
  key_ops: ["verify"],
  use: "sig"
});

function secretRef(name, value) {
  return `vercel://environment/production/${name}@sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;
}

function vercelEnvironment(overrides = {}) {
  const key = Buffer.alloc(32, 7).toString("base64url");
  const identity = JSON.stringify({
    schemaVersion: "ipo_one_production_identity_config.v2",
    oidcProviders: [],
    wallet: {
      enabled: true,
      issuer: "https://ipo-one-internal.vercel.app",
      clientId: "ipo_one_wallet"
    },
    workload: {
      issuer: "https://workload.ipo.one",
      audience: "https://ipo-one-internal.vercel.app",
      publicJwks: {
        keys: [workloadPublicJwk]
      },
      allowedAlgorithms: ["ES256"]
    }
  });
  return {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_TARGET_ENV: "production",
    VERCEL_URL: "ipo-one-internal-example.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "ipo-one-internal.vercel.app",
    IPO_ONE_DEPLOYMENT_PROFILE: "vercel_sandbox",
    IPO_ONE_DEPLOYMENT_MODE: "vercel_sandbox",
    IPO_ONE_VERCEL_PROJECT_ROLE: "primary",
    IPO_ONE_NO_REAL_FUNDS_ACK: "I_UNDERSTAND_DEPLOYABLE_SANDBOX_NO_REAL_FUNDS",
    IPO_ONE_PUBLIC_ORIGIN: "https://ipo-one-internal.vercel.app",
    IPO_ONE_GATEWAY_DATABASE_URL: "postgresql://gateway:secret@db.invalid/ipo_one?sslmode=require",
    IPO_ONE_AUTH_DATABASE_URL: "postgresql://authentication:secret@db.invalid/ipo_one?sslmode=require",
    IPO_ONE_TENANT_ID: "tenant_m1_b_sandbox",
    IPO_ONE_SYSTEM_ACTOR_ID: "actor_authentication_system",
    IPO_ONE_POLICY_VERSION: "security_001.v1",
    IPO_ONE_RELEASE_ID: "a".repeat(40),
    IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
    IPO_ONE_IDP_VENDOR_ID: "wallet_only",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "b".repeat(40),
    IPO_ONE_IDP_CONFIGURATION_REF: secretRef("IPO_ONE_IDENTITY_CONFIG_JSON", identity),
    IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: secretRef("IPO_ONE_AUTH_REFERENCE_HASH_KEY", key),
    IPO_ONE_AUTH_ENCRYPTION_KEY_REF: secretRef("IPO_ONE_AUTH_ENCRYPTION_KEY", key),
    IPO_ONE_AUTH_REFERENCE_HASH_KEY: key,
    IPO_ONE_AUTH_ENCRYPTION_KEY: key,
    IPO_ONE_IDENTITY_CONFIG_JSON: identity,
    ...overrides
  };
}

function responseCapture() {
  let resolve;
  const completed = new Promise((done) => { resolve = done; });
  return {
    status: undefined,
    headers: {},
    body: "",
    completed,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    setTimeout() {},
    destroy() {},
    writeHead(status, headers = {}) {
      this.status = status;
      for (const [name, value] of Object.entries(headers)) {
        this.headers[name.toLowerCase()] = value;
      }
    },
    end(body = "") {
      this.body = body?.toString() ?? "";
      resolve();
    }
  };
}

function request({ method = "GET", url = "/livez", headers = {} } = {}) {
  const value = Readable.from([]);
  value.method = method;
  value.url = url;
  value.headers = headers;
  return value;
}

test("Vercel Sandbox environment accepts only exact inline secret digests and bounded pools", async (t) => {
  const configuration = await loadProductionClosedPilotEnvironment(vercelEnvironment());
  t.after(() => Promise.allSettled([
    configuration.gatewayPool.end(),
    configuration.authenticationPool.end()
  ]));
  assert.equal(configuration.gatewayPool.options.max, 1);
  assert.equal(configuration.authenticationPool.options.max, 1);
  assert.equal(configuration.gatewayPool.options.allowExitOnIdle, true);
  assert.equal(configuration.authenticationPool.options.allowExitOnIdle, true);
  assert.equal(configuration.browserOrigin, "https://ipo-one-internal.vercel.app");
  assert.equal(configuration.deploymentRole, "primary");
  assert.ok(await configuration.machineResolver.resolve({
    alg: "ES256",
    kid: "m1-b-workload-001"
  }));
});

test("Vercel Sandbox environment rejects a mismatched inline secret digest", async () => {
  await assert.rejects(
    () => loadProductionClosedPilotEnvironment(vercelEnvironment({
      IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF:
        `vercel://environment/production/IPO_ONE_AUTH_REFERENCE_HASH_KEY@sha256:${"0".repeat(64)}`
    })),
    (error) => error?.code === "invalid_production_environment"
  );
});

test("Vercel Sandbox environment rejects preview and project-origin drift", async () => {
  for (const overrides of [
    { VERCEL_ENV: "preview" },
    { VERCEL_TARGET_ENV: "preview" },
    { IPO_ONE_PUBLIC_ORIGIN: "https://different.vercel.app" },
    { IPO_ONE_VERCEL_PROJECT_ROLE: "unknown" }
  ]) {
    await assert.rejects(
      () => loadProductionClosedPilotEnvironment(vercelEnvironment(overrides)),
      (error) => error?.code === "invalid_production_environment"
    );
  }
});

test("Vercel Sandbox edge verification binds injected request and deployment headers", async (t) => {
  const configuration = await loadProductionClosedPilotEnvironment(vercelEnvironment());
  t.after(() => Promise.allSettled([
    configuration.gatewayPool.end(),
    configuration.authenticationPool.end()
  ]));
  assert.equal(configuration.verifyEdgeRequest({ headers: {
    "x-vercel-id": "sfo1::iad1::example-123",
    "x-vercel-deployment-url": "ipo-one-internal-example.vercel.app"
  }}), true);
  assert.equal(configuration.verifyEdgeRequest({ headers: {
    "x-vercel-id": "sfo1::iad1::example-123",
    "x-vercel-deployment-url": "different.vercel.app"
  }}), false);
  assert.equal(configuration.getTrustedMtlsEvidence({ headers: {
    authorization: "Bearer opaque"
  }}), undefined);
  assert.throws(
    () => configuration.getTrustedMtlsEvidence({ headers: {
      authorization: "Bearer opaque",
      "x-ipo-one-client-cert-sha256": "m".repeat(43)
    }}),
    (error) => error?.code === "invalid_production_environment"
  );
});

test("production request handler runs without opening a listening socket", async () => {
  const handleRequest = createProductionTenantRequestHandler({
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    readinessCheck: async () => true,
    verifyEdgeRequest: async () => true,
    publicOrigin: "https://ipo.one",
    port: 8080,
    releaseId: "a".repeat(40)
  });
  const response = responseCapture();
  await handleRequest(request(), response);
  await response.completed;
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).status, "alive");
});

test("serverless request handler fails closed on missing Vercel edge headers", async () => {
  const configuration = await loadProductionClosedPilotEnvironment(vercelEnvironment());
  const handleRequest = createProductionTenantRequestHandler({
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: configuration.createNetworkContext,
    csrfTokenProvider: async () => undefined,
    readinessCheck: async () => true,
    verifyEdgeRequest: configuration.verifyEdgeRequest,
    publicOrigin: configuration.browserOrigin,
    port: 8080,
    releaseId: "a".repeat(40)
  });
  const response = responseCapture();
  await handleRequest(request({
    url: "/tenant/v1/healthz",
    headers: {
      host: "ipo-one-internal.vercel.app",
      "x-forwarded-host": "ipo-one-internal.vercel.app",
      "x-forwarded-proto": "https"
    }
  }), response);
  await response.completed;
  await Promise.allSettled([
    configuration.gatewayPool.end(),
    configuration.authenticationPool.end()
  ]);
  assert.equal(response.status, 421);
});

test("Cron handler rejects missing credentials before any database work", async () => {
  const response = responseCapture();
  await cronHandler(request({ url: "/api/cron" }), response);
  await response.completed;
  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), { status: "unauthorized" });
});

test("Cron cycle rejects a non-Vercel runtime before opening PostgreSQL", async () => {
  await assert.rejects(
    () => runVercelSandboxCronCycle({ environment: { NODE_ENV: "production" } }),
    (error) => error?.code === "invalid_vercel_sandbox_cron_configuration"
  );
});

test("Vercel Sandbox rejects file-mounted secrets instead of mixing providers", async () => {
  await assert.rejects(
    () => loadProductionClosedPilotEnvironment(vercelEnvironment({
      IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE: "/tmp/not-allowed"
    })),
    (error) => error?.code === "invalid_production_environment"
  );
});

function requestHandlerFixture(overrides = {}) {
  return createProductionTenantRequestHandler({
    gateway: { async execute() { throw new Error("not expected"); } },
    humanBff: { async authenticateSession() { throw new Error("not expected"); } },
    machineAuthenticator: { async authenticate() { throw new Error("not expected"); } },
    createNetworkContext: async () => { throw new Error("not expected"); },
    csrfTokenProvider: async () => undefined,
    readinessCheck: async () => true,
    verifyEdgeRequest: async () => true,
    publicOrigin: "https://ipo.one",
    port: 8080,
    releaseId: "a".repeat(40),
    ...overrides
  });
}

test("serverless concurrency is bounded before adapter execution", async () => {
  let releaseReadiness;
  const blockedReadiness = new Promise((resolve) => { releaseReadiness = resolve; });
  const handleRequest = requestHandlerFixture({
    maximumConcurrency: 1,
    readinessCheck: async () => blockedReadiness
  });
  const firstResponse = responseCapture();
  const first = handleRequest(request({ url: "/readyz" }), firstResponse);
  await new Promise((resolve) => setImmediate(resolve));
  const secondResponse = responseCapture();
  await handleRequest(request({ url: "/readyz" }), secondResponse);
  assert.equal(secondResponse.status, 503);
  assert.equal(JSON.parse(secondResponse.body).code, "server_busy");
  releaseReadiness(true);
  await first;
  assert.equal(firstResponse.status, 200);
});

test("fresh serverless handler instances derive the same liveness from explicit configuration", async () => {
  const results = [];
  for (let index = 0; index < 2; index += 1) {
    const response = responseCapture();
    await requestHandlerFixture()(request(), response);
    results.push(JSON.parse(response.body));
  }
  assert.deepEqual(results[0], results[1]);
});

test("Cron handler rejects a mismatched bearer credential", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "correct-cron-secret-0001";
  try {
    const response = responseCapture();
    await cronHandler(request({
      url: "/api/cron",
      headers: { authorization: "Bearer wrong-cron-secret-0001" }
    }), response);
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

test("Cron handler rejects unsupported methods before authentication", async () => {
  const response = responseCapture();
  await cronHandler(request({ method: "DELETE", url: "/api/cron" }), response);
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, "GET, POST");
});

test("Vercel deployment config binds Pro five-minute Cron to the exact bounded function", async () => {
  const config = JSON.parse(await readFile("deploy/vercel/vercel.m1-b-sandbox.json", "utf8"));
  const risk = JSON.parse(await readFile("deploy/vercel/vercel.m1-b-sandbox-risk.json", "utf8"));
  assert.equal(config.fluid, true);
  assert.deepEqual(config.crons, [{ path: "/api/cron", schedule: "*/5 * * * *" }]);
  assert.equal(config.functions["api/vercel-sandbox-cron.mjs"].maxDuration, 30);
  assert.equal(Object.hasOwn(config, "env"), false);
  assert.equal(risk.fluid, true);
  assert.equal(Object.hasOwn(risk, "crons"), false);
  assert.equal(Object.hasOwn(risk.functions, "api/vercel-sandbox-cron.mjs"), false);
});

test("Vercel deployment manifest keeps every prohibited authority disabled", async () => {
  const manifest = JSON.parse(await readFile(
    "deploy/vercel/m1-b-sandbox.manifest.v1.json",
    "utf8"
  ));
  assert.deepEqual({
    production: manifest.productProductionClaim,
    release: manifest.releaseClaim,
    funds: manifest.realFundsEnabled,
    fees: manifest.protocolFeesEnabled,
    signer: manifest.signerAuthorityEnabled,
    withdrawal: manifest.withdrawalAuthorityEnabled,
    venueWrite: manifest.venueWriteAuthorityEnabled
  }, {
    production: false,
    release: false,
    funds: false,
    fees: false,
    signer: false,
    withdrawal: false,
    venueWrite: false
  });
  assert.equal(manifest.topology.projectCount, 2);
  assert.deepEqual(manifest.topology.projectRoles, [
    "principal_agent_automation",
    "risk_admin_read_freeze"
  ]);
});
