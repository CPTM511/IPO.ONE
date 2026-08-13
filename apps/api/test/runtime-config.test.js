import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_SANDBOX_ACKNOWLEDGEMENT,
  isAllowedRequestHost,
  loadRuntimeConfig,
  requestHostname,
  requestUsesHttps
} from "../src/runtime-config.js";

const productionEnvironment = {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  PORT: "8080",
  IPO_ONE_ALLOWED_HOSTS: "ipo.one,www.ipo.one",
  IPO_ONE_DEPLOYMENT_MODE: "public_sandbox",
  IPO_ONE_HSTS_MAX_AGE: "86400",
  IPO_ONE_PUBLIC_ORIGIN: "https://ipo.one",
  IPO_ONE_PUBLIC_SANDBOX_ACK: PUBLIC_SANDBOX_ACKNOWLEDGEMENT,
  IPO_ONE_RELEASE_SHA: "commit_0123456789abcdef",
  IPO_ONE_TRUST_PROXY: "true"
};

test("local runtime defaults remain loopback-only and explicit", () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.equal(config.deploymentMode, "local_sandbox");
  assert.equal(config.publicOrigin, "http://127.0.0.1:3000");
  assert.equal(config.production, false);
  assert.equal(config.canonicalProductTruth, false);
  assert.equal(config.releaseEligible, false);
  assert.equal(config.stateDurability, "process_local_ephemeral");
  assert.equal(isAllowedRequestHost("localhost:3000", config), true);
  assert.equal(isAllowedRequestHost("attacker.invalid", config), false);
});

test("production runtime accepts only the acknowledged HTTPS public sandbox contract", () => {
  const config = loadRuntimeConfig(productionEnvironment);
  assert.equal(config.production, true);
  assert.equal(config.publicOrigin, "https://ipo.one");
  assert.equal(config.canonicalProductTruth, false);
  assert.equal(config.releaseEligible, false);
  assert.equal(config.stateDurability, "process_local_ephemeral");
  assert.deepEqual(config.allowedHosts, ["ipo.one", "www.ipo.one"]);
  assert.equal(isAllowedRequestHost("IPO.ONE", config), true);
  assert.equal(isAllowedRequestHost("127.0.0.1:8080", config), false);
  assert.equal(isAllowedRequestHost("127.0.0.1:8080", config, { operational: true }), true);
  assert.equal(requestUsesHttps({ "x-forwarded-proto": "https" }, config), true);
  assert.equal(requestUsesHttps({ "x-forwarded-proto": "https, http" }, config), false);
});

test("Vercel production derives only exact platform hostnames and the no-funds origin", () => {
  const config = loadRuntimeConfig({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_URL: "ipo-one-git-internal-cptm-111-s-projects.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "ipo-one-internal.vercel.app",
    VERCEL_GIT_COMMIT_SHA: "",
    VERCEL_DEPLOYMENT_ID: "dpl_safeDeployment123",
    IPO_ONE_DEPLOYMENT_MODE: undefined,
    IPO_ONE_PUBLIC_SANDBOX_ACK: undefined
  });
  assert.equal(config.managedVercel, true);
  assert.equal(config.publicOrigin, "https://ipo-one-internal.vercel.app");
  assert.equal(config.release, "dpl_safeDeployment123");
  assert.equal(config.trustProxy, true);
  assert.equal(config.hstsMaxAge, 86_400);
  assert.deepEqual(config.allowedHosts, [
    "ipo-one-git-internal-cptm-111-s-projects.vercel.app",
    "ipo-one-internal.vercel.app"
  ]);
});

test("production runtime fails closed for unsafe or ambiguous configuration", () => {
  for (const override of [
    { IPO_ONE_PUBLIC_SANDBOX_ACK: undefined },
    { IPO_ONE_PUBLIC_ORIGIN: "http://ipo.one" },
    { IPO_ONE_PUBLIC_ORIGIN: "https://user:secret@ipo.one" },
    { IPO_ONE_SECURITY_CONTACT: "https://github.com/CPTM511/IPO.ONE/security?token=unsafe" },
    { IPO_ONE_TRUST_PROXY: "false" },
    { IPO_ONE_HSTS_MAX_AGE: "0" },
    { IPO_ONE_ALLOWED_HOSTS: "*" },
    { HOST: "127.0.0.1" },
    { IPO_ONE_DEPLOYMENT_MODE: "pilot" }
  ]) {
    assert.throws(() => loadRuntimeConfig({ ...productionEnvironment, ...override }), {
      name: "RuntimeConfigurationError"
    });
  }
  assert.throws(() => loadRuntimeConfig({
    ...productionEnvironment,
    VERCEL: "1",
    VERCEL_URL: "attacker.invalid/path"
  }), {
    name: "RuntimeConfigurationError"
  });
});

test("request host and proxy parsing reject malformed or mixed values", () => {
  const config = loadRuntimeConfig(productionEnvironment);
  assert.equal(requestHostname("ipo.one:443"), "ipo.one");
  assert.equal(requestHostname("bad host"), undefined);
  assert.equal(requestHostname("attacker@ipo.one"), undefined);
  assert.equal(requestHostname("ipo.one/path"), undefined);
  assert.equal(requestHostname("ipo.one:"), undefined);
  assert.equal(requestHostname(["ipo.one", "attacker.invalid"]), undefined);
  assert.equal(isAllowedRequestHost("ipo.one.attacker.invalid", config), false);
  assert.equal(requestUsesHttps({ "x-forwarded-proto": "HTTPS" }, config), true);
  assert.equal(requestUsesHttps({ "x-forwarded-proto": "https,https" }, config), true);
});
