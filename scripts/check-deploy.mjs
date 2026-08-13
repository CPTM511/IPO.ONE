import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  dockerfile,
  dockerignore,
  service,
  workflow,
  packageJson,
  nodeVersion,
  nvmVersion,
  closedPilotStackText,
  closedPilotService,
  closedPilotMigrationJob,
  closedPilotArmor,
  closedPilotPendingText,
  closedPilotAudit,
  productionContainerSmoke
] = await Promise.all([
  source("Dockerfile"),
  source(".dockerignore"),
  source("deploy/gcp/cloud-run-service.yaml.tmpl"),
  source(".github/workflows/quality.yml"),
  source("package.json"),
  source(".node-version"),
  source(".nvmrc"),
  source("deploy/gcp/closed-pilot/stack.v1.json"),
  source("deploy/gcp/closed-pilot/cloud-run-service.yaml.tmpl"),
  source("deploy/gcp/closed-pilot/cloud-run-migration-job.yaml.tmpl"),
  source("deploy/gcp/closed-pilot/cloud-armor-policy.yaml"),
  source("deploy/approvals/closed-non-funds-pilot.pending.json"),
  source("scripts/audit-closed-pilot-cloud.mjs"),
  source("scripts/prepare-production-container-smoke.mjs")
]);

assert.match(dockerfile, /node:26\.5\.0-bookworm-slim@sha256:[a-f0-9]{64}/);
assert.match(dockerfile, /gcr\.io\/distroless\/nodejs26-debian13:nonroot@sha256:[a-f0-9]{64}/);
assert.match(dockerfile, /^USER 65532:65532$/m);
assert.match(dockerfile, /^HEALTHCHECK /m);
assert.match(dockerfile, /^ENTRYPOINT \["\/nodejs\/bin\/node"\]$/m);
assert.match(dockerfile, /pnpm install --frozen-lockfile --prod --ignore-scripts/);
assert.doesNotMatch(dockerfile, /IPO_ONE_PUBLIC_SANDBOX_ACK=/);

for (const requiredIgnore of [".git", ".env", "node_modules", "docs", "security"]) {
  assert.match(dockerignore, new RegExp(`^${requiredIgnore.replace(".", "\\.")}$`, "m"));
}

for (const requiredSetting of [
  "run.googleapis.com/default-url-disabled: \"true\"",
  "run.googleapis.com/ingress: internal-and-cloud-load-balancing",
  "IPO_ONE_DEPLOYMENT_MODE",
  "I_UNDERSTAND_NO_REAL_FUNDS",
  "IPO_ONE_TRUST_PROXY",
  "https://ipo.one",
  "startupProbe:",
  "livenessProbe:",
  "serviceAccountName: ${SERVICE_ACCOUNT_EMAIL}",
  "image: ${IMAGE_URI}"
]) {
  assert.ok(service.includes(requiredSetting), `missing deployment guard: ${requiredSetting}`);
}
assert.doesNotMatch(
  service,
  /^\s+readinessProbe:/m,
  "Cloud Run readiness probes cannot carry the localhost Host header required by the production runtime"
);
assert.doesNotMatch(service, /(PASSWORD|PRIVATE_KEY|API_TOKEN|DATABASE_URL)/);
assert.match(workflow, /postgres:17\.10-alpine3\.23@sha256:[a-f0-9]{64}/);
assert.equal(/uses:\s+[^\s]+@v\d/.test(workflow), false, "GitHub Actions must use immutable commits");
for (const requiredContainerSmokeGuard of [
  "prepare-production-container-smoke.mjs prepare",
  "prepare-production-container-smoke.mjs cleanup",
  "prepare-production-container-smoke.mjs redact",
  "apps/private-pilot/src/bootstrap-production.js",
  "--add-host host.docker.internal:host-gateway",
  "--env-file \"$smoke_root/runtime.env\"",
  "target=/run/ipo-one-smoke,readonly",
  "docker run --detach --name ipo-one-ci",
  "sudo chown -R 65532:65532 \"$smoke_root/secrets\"",
  "sudo chown -R \"$(id -u):$(id -g)\" \"$smoke_root/secrets\"",
  "docker logs ipo-one-ci",
  "trap - EXIT",
  "--write-out '%{http_code}'",
  "= \"421\"",
  "Production container did not become ready"
]) {
  assert.ok(
    workflow.includes(requiredContainerSmokeGuard),
    `missing production container smoke guard: ${requiredContainerSmokeGuard}`
  );
}
assert.doesNotMatch(
  workflow,
  /--env IPO_ONE_DEPLOYMENT_MODE=public_sandbox/,
  "the canonical production container cannot be smoked through the legacy public sandbox mode"
);
assert.doesNotMatch(
  workflow,
  /docker run --detach --rm --name ipo-one-ci/,
  "the production smoke container must remain inspectable after an early crash"
);
for (const requiredFixtureGuard of [
  "ipo_one_container_smoke_test_",
  "ipo_one_production_bootstrap.v2",
  "IPO_ONE_DEPLOYMENT_MODE: \"closed_pilot\"",
  "IPO_ONE_AUTHENTICATION_MODE: \"closed_pilot\"",
  "gateway and authentication URLs must remain distinct",
  "DROP DATABASE IF EXISTS",
  "DROP ROLE IF EXISTS",
  "mode: 0o700",
  "mode: 0o600",
  "environment.CI !== \"true\"",
  "dirname(directory) !== runnerTemp",
  "DATABASE_URL must target a loopback CI test database",
  "CI_ONLY_NON_SECRET_GATEWAY_PASSWORD",
  "CI_ONLY_NON_SECRET_AUTHENTICATION_PASSWORD",
  "const gatewayPassword = CI_ONLY_NON_SECRET_GATEWAY_PASSWORD",
  "const authenticationPassword = CI_ONLY_NON_SECRET_AUTHENTICATION_PASSWORD",
  "[REDACTED]"
]) {
  assert.ok(
    productionContainerSmoke.includes(requiredFixtureGuard),
    `missing isolated production container fixture guard: ${requiredFixtureGuard}`
  );
}
assert.doesNotMatch(
  productionContainerSmoke,
  /log_min_error_statement/,
  "the CI service role cannot change privileged PostgreSQL logging settings"
);
assert.doesNotMatch(
  productionContainerSmoke,
  /const (?:gatewayPassword|authenticationPassword) = randomBytes\(/,
  "role-management SQL must never receive generated credential material that PostgreSQL could log"
);

const manifest = JSON.parse(packageJson);
assert.equal(manifest.engines?.node, ">=26.5.0 <27");
assert.equal(nodeVersion.trim(), "26.5.0");
assert.equal(nvmVersion.trim(), nodeVersion.trim());
assert.match(workflow, /node-version-file:\s*\.node-version/);

const closedPilotStack = JSON.parse(closedPilotStackText);
assert.equal(closedPilotStack.schemaVersion, "ipo.one.closed-pilot-stack/v1");
assert.equal(closedPilotStack.releaseProfile, "closed_non_funds_pilot");
assert.deepEqual(closedPilotStack.capabilities, {
  realFundsEnabled: false,
  humanCreditEnabled: false,
  privateTenantDataEnabled: true,
  externalProviderExecutionEnabled: false
});
assert.equal(closedPilotStack.cloudSql.databaseVersion, "POSTGRES_17");
assert.equal(closedPilotStack.cloudSql.availabilityType, "REGIONAL");
assert.equal(closedPilotStack.cloudSql.deletionProtection, true);
assert.equal(closedPilotStack.cloudSql.connectorEnforcement, "REQUIRED");
assert.equal(closedPilotStack.cloudSql.publicIpv4Enabled, true);
assert.equal(closedPilotStack.cloudSql.sslMode, "ENCRYPTED_ONLY");
assert.equal(closedPilotStack.cloudSql.automatedBackups, true);
assert.ok(closedPilotStack.cloudSql.retainedBackups >= 14);
assert.equal(closedPilotStack.cloudSql.pointInTimeRecovery, true);
assert.ok(closedPilotStack.cloudSql.transactionLogRetentionDays >= 7);
assert.equal(new Set(closedPilotStack.secrets).size, closedPilotStack.secrets.length);

for (const requiredSetting of [
  "run.googleapis.com/default-url-disabled: \"true\"",
  "run.googleapis.com/ingress: internal-and-cloud-load-balancing",
  "run.googleapis.com/cloudsql-instances: ${CLOUD_SQL_CONNECTION_NAME}",
  "serviceAccountName: ${RUNTIME_SERVICE_ACCOUNT_EMAIL}",
  "image: ${IMAGE_URI}",
  "apps/private-pilot/src/start-production.js",
  "IPO_ONE_DEPLOYMENT_MODE",
  "closed_pilot",
  "IPO_ONE_AUTHENTICATION_MODE",
  "IPO_ONE_GATEWAY_DATABASE_URL",
  "IPO_ONE_AUTH_DATABASE_URL",
  "IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE",
  "IPO_ONE_AUTH_ENCRYPTION_KEY_FILE",
  "IPO_ONE_IDENTITY_CONFIG_FILE",
  "IPO_ONE_EDGE_ASSERTION_KEY_FILE",
  "path: /readyz",
  "path: /livez"
]) {
  assert.ok(closedPilotService.includes(requiredSetting), `missing closed-pilot deployment guard: ${requiredSetting}`);
}
assert.doesNotMatch(closedPilotService, /(?:PASSWORD|PRIVATE_KEY|BEARER_TOKEN):/);
assert.doesNotMatch(closedPilotService, /versions\/(?:latest|0)(?:\b|\})/);
assert.doesNotMatch(closedPilotService, /run\.googleapis\.com\/(?:network-interfaces|vpc-access-egress)/);
assert.doesNotMatch(closedPilotService, /IPO_ONE_OIDC_PROVIDER_CONFIG_FILE/);
assert.doesNotMatch(closedPilotService, /httpHeaders:/);
assert.doesNotMatch(closedPilotService, /- name: PORT\b/);
assert.match(closedPilotService, /secretName: ipo-one-identity-config/);
assert.match(closedPilotService, /secretName: ipo-one-edge-assertion-key/);
assert.equal(closedPilotStack.edge.edgeAssertionHeader, "x-ipo-one-edge-assertion");
assert.equal(closedPilotStack.edge.clientCertificateHeader, "x-ipo-one-client-cert-sha256");
assert.match(closedPilotMigrationJob, /serviceAccountName: \$\{MIGRATION_SERVICE_ACCOUNT_EMAIL\}/);
assert.match(closedPilotMigrationJob, /name: ipo-one-migration-database-url/);
assert.match(closedPilotMigrationJob, /apps\/private-pilot\/src\/bootstrap-production\.js/);
for (const secret of [
  "ipo-one-bootstrap-config",
  "ipo-one-gateway-database-password",
  "ipo-one-auth-database-password",
  "ipo-one-auth-reference-hash-key"
]) {
  assert.match(closedPilotMigrationJob, new RegExp(`secretName: ${secret}`));
}
assert.match(closedPilotMigrationJob, /maxRetries: 0/);
assert.doesNotMatch(closedPilotMigrationJob, /RUNTIME_SERVICE_ACCOUNT_EMAIL/);
for (const priority of [100, 150, 160, 200, 300, 310, 2147483647]) {
  assert.match(closedPilotArmor, new RegExp(`priority: ${priority}\\b`));
}
assert.match(closedPilotArmor, /auth\/v1\/\(\?:login\|wallet\/challenge\)/);
assert.match(closedPilotArmor, /auth\/v1\/\(\?:callback\|wallet\/verify\)/);
assert.match(closedPilotArmor, /wallet\/verify/);
assert.equal((closedPilotArmor.match(/preview: false/g) ?? []).length, 7);
assert.doesNotMatch(closedPilotArmor, /preview: true/);

const closedPilotPending = JSON.parse(closedPilotPendingText);
assert.equal(closedPilotPending.profile, "closed_non_funds_pilot");
assert.deepEqual(closedPilotPending.capabilities, closedPilotStack.capabilities);
assert.equal(closedPilotPending.gates.length, 8);
assert.ok(closedPilotPending.gates.every((gate) => gate.status === "pending"));
assert.match(closedPilotAudit, /ipo\.one\.closed-pilot-cloud-observation\/v1/);
assert.match(closedPilotAudit, /--output must end in \.local\.json/);
assert.match(closedPilotAudit, /cloud_sql_successful_backup_exists/);
assert.match(closedPilotAudit, /edge_authentication_admission/);
assert.match(closedPilotAudit, /closed_pilot_alerts_with_notification/);

console.log("Deployment artifacts satisfy the public-sandbox and closed-pilot static baselines.");
