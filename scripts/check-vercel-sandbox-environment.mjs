import assert from "node:assert/strict";
import { loadProductionClosedPilotEnvironment } from "../apps/private-pilot/src/production-environment.js";

const PROHIBITED_EXACT = new Set([
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "PGHOST",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE"
]);
const PROHIBITED_PATTERN = /(?:MAINNET|PRIVATE_KEY|SIGNER|WITHDRAW|CUSTODY|VENUE_WRITE|FEE_RUNTIME|EVIDENCE_ATTESTOR)/;

for (const name of Object.keys(process.env)) {
  if (PROHIBITED_EXACT.has(name) || PROHIBITED_PATTERN.test(name)) {
    throw new Error(`prohibited Vercel Sandbox runtime variable is present: ${name}`);
  }
}
assert.equal(
  process.env.IPO_ONE_VERCEL_PROJECT_ROLE,
  "primary",
  "current M1-B v2 environment certification is Primary-only; Risk remains a deferred M1-C/L2 interface"
);
assert.match(
  process.env.IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS ?? "",
  /^0x[a-fA-F0-9]{40}$/,
  "Primary IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS must be one public EVM address"
);
assert.ok(
  typeof process.env.CRON_SECRET === "string" &&
  process.env.CRON_SECRET.length >= 16 &&
  process.env.CRON_SECRET.length <= 256,
  "Primary CRON_SECRET must contain 16-256 characters"
);
assert.notEqual(
  process.env.IPO_ONE_GATEWAY_DATABASE_URL,
  process.env.IPO_ONE_AUTH_DATABASE_URL,
  "Gateway and authentication roles must use distinct connection URLs"
);

const configuration = await loadProductionClosedPilotEnvironment(process.env);
try {
  assert.equal(configuration.gatewayPool.options.max, 1);
  assert.equal(configuration.authenticationPool.options.max, 1);
  assert.equal(configuration.gatewayPool.options.allowExitOnIdle, true);
  assert.equal(configuration.authenticationPool.options.allowExitOnIdle, true);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "ipo.one.vercel-sandbox-environment-validation/v1",
    status: "passed",
    releaseId: configuration.releaseId,
    browserOrigin: configuration.browserOrigin,
    tenantId: configuration.tenantId,
    policyVersion: configuration.policyVersion,
    deploymentRole: configuration.deploymentRole,
    sandboxAgentAccountConfigured:
      typeof configuration.agentAccountAddress === "string",
    gatewayPoolMaximum: configuration.gatewayPool.options.max,
    authenticationPoolMaximum: configuration.authenticationPool.options.max,
    walletOnly: configuration.oidcProviders.length === 0 && configuration.wallet !== undefined,
    realFundsEnabled: false,
    secretValuesRecorded: false
  })}\n`);
} finally {
  await Promise.allSettled([
    configuration.gatewayPool.end(),
    configuration.authenticationPool.end()
  ]);
}
