import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadProductionClosedPilotEnvironment } from "../src/production-environment.js";
import { loadProductionBootstrapConfig } from "../src/production-bootstrap.js";
import { createProductionClosedPilotRuntime } from "../src/production-runtime.js";

const SECRET_REF = "projects/ipo-one-prod/secrets/example/versions/1";

test("production environment supports reviewed wallet-only access without an OIDC client secret", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-production-env-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = Buffer.alloc(32, 7).toString("base64url");
  const referenceKey = join(directory, "reference-key");
  const encryptionKey = join(directory, "encryption-key");
  const edgeKey = join(directory, "edge-key");
  const identityConfig = join(directory, "identity.json");
  await Promise.all([
    writeFile(referenceKey, key),
    writeFile(encryptionKey, key),
    writeFile(edgeKey, key),
    writeFile(identityConfig, JSON.stringify({
      schemaVersion: "ipo_one_production_identity_config.v1",
      oidcProviders: [],
      wallet: {
        enabled: true,
        issuer: "https://ipo.one",
        clientId: "ipo_one_wallet"
      },
      workload: {
        issuer: "https://workload.ipo.one",
        audience: "https://ipo.one",
        jwksUri: "https://workload.ipo.one/.well-known/jwks.json",
        allowedAlgorithms: ["ES256"]
      }
    }))
  ]);
  const environment = {
    NODE_ENV: "production",
    PORT: "8080",
    IPO_ONE_PUBLIC_ORIGIN: "https://ipo.one",
    IPO_ONE_GATEWAY_DATABASE_URL: "postgresql://gateway:secret@10.0.0.2:5432/ipo_one",
    IPO_ONE_AUTH_DATABASE_URL: "postgresql://authentication:secret@10.0.0.2:5432/ipo_one",
    IPO_ONE_TENANT_ID: "tenant_design_partner",
    IPO_ONE_SYSTEM_ACTOR_ID: "actor_authentication_system",
    IPO_ONE_POLICY_VERSION: "security_001.v1",
    IPO_ONE_RELEASE_ID: "a".repeat(40),
    IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
    IPO_ONE_IDP_VENDOR_ID: "wallet_only",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "b".repeat(40),
    IPO_ONE_IDP_CONFIGURATION_REF: SECRET_REF,
    IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF: SECRET_REF,
    IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: SECRET_REF,
    IPO_ONE_AUTH_ENCRYPTION_KEY_REF: SECRET_REF,
    IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE: referenceKey,
    IPO_ONE_AUTH_ENCRYPTION_KEY_FILE: encryptionKey,
    IPO_ONE_EDGE_ASSERTION_KEY_FILE: edgeKey,
    IPO_ONE_IDENTITY_CONFIG_FILE: identityConfig
  };
  const configuration = await loadProductionClosedPilotEnvironment(environment);
  t.after(async () => Promise.allSettled([
    configuration.gatewayPool.end(),
    configuration.authenticationPool.end()
  ]));
  assert.equal(configuration.oidcProviders.length, 0);
  assert.equal(configuration.wallet.clientId, "ipo_one_wallet");
  assert.equal(configuration.browserOrigin, "https://ipo.one");
  assert.equal(Object.hasOwn(environment, "IPO_ONE_OIDC_CLIENT_SECRET_FILE"), false);
});

test("production environment has no disabled or local-test identity fallback", async () => {
  await assert.rejects(
    () => loadProductionClosedPilotEnvironment({ NODE_ENV: "production" }),
    (error) => error?.code === "invalid_production_environment"
  );
});

test("production bootstrap config derives closed roles and rejects permission input", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-bootstrap-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "bootstrap.json");
  await writeFile(path, JSON.stringify({
    schemaVersion: "ipo_one_production_bootstrap.v1",
    gatewayRole: "ipo_one_gateway",
    authenticationRole: "ipo_one_authentication",
    tenant: {
      tenantId: "tenant_design_partner",
      organizationRef: "urn:ipo.one:organization:design-partner",
      displayName: "Design Partner",
      pilotJurisdiction: "PRIVATE_NO_FUNDS",
      retentionOwnerRef: "urn:ipo.one:retention:owner"
    },
    systemActor: {
      actorId: "actor_authentication_system",
      clientId: "client_authentication_system"
    },
    policyVersion: "security_001.v1",
    credentials: [{
      kind: "human_wallet",
      profile: "principal_controller",
      actorId: "actor_principal_controller",
      clientId: "client_principal_controller",
      issuer: "https://ipo.one",
      externalSubject: "eip155:84532:0x1111111111111111111111111111111111111111"
    }, {
      kind: "agent_mtls",
      profile: "agent_runtime",
      actorId: "actor_agent_runtime",
      clientId: "client_agent_runtime",
      issuer: "https://workload.ipo.one",
      externalSubject: "agent-runtime-production",
      controllerActorId: "actor_principal_controller",
      senderThumbprint: "m".repeat(43)
    }]
  }));
  const config = await loadProductionBootstrapConfig(path);
  assert.equal(config.credentials[0].profile.roleBundle, "principal_controller");
  assert.equal(config.credentials[1].profile.roleBundle, "agent_runtime");
  assert.equal(Object.hasOwn(config.credentials[0], "capabilities"), false);
});

test("production runtime closes both pools when startup validation fails", async () => {
  let gatewayClosed = 0;
  let authenticationClosed = 0;
  const gatewayPool = {
    connect() {},
    query() {},
    async end() { gatewayClosed += 1; }
  };
  const authenticationPool = {
    connect() {},
    query() {},
    async end() { authenticationClosed += 1; }
  };
  await assert.rejects(
    () => createProductionClosedPilotRuntime({ gatewayPool, authenticationPool }),
    (error) => error?.code === "invalid_production_runtime_config"
  );
  assert.equal(gatewayClosed, 1);
  assert.equal(authenticationClosed, 1);
});
