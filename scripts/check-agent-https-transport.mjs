import { readFile } from "node:fs/promises";
import {
  AGENT_HTTPS_OPENAPI_SCHEMA_VERSION,
  createAgentHttpsOpenApiDocument
} from "../apps/tenant-api/src/tenant-openapi.js";

const contractPath =
  "api/tenant-protocol/ipo-one.agent-https.v1.json";
const launchPolicyPath = "deploy/launch-policy.v1.json";
const packagePath = "packages/sdk/package.json";
const clientPath = "packages/sdk/src/production-agent-client.js";
const hostPath = "apps/tenant-api/src/production-tenant-host.js";

const [
  contractSource,
  launchPolicySource,
  packageSource,
  clientSource,
  hostSource
] = await Promise.all([
  readFile(contractPath, "utf8"),
  readFile(launchPolicyPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(clientPath, "utf8"),
  readFile(hostPath, "utf8")
]);

const contract = JSON.parse(contractSource);
const launchPolicy = JSON.parse(launchPolicySource);
const sdkPackage = JSON.parse(packageSource);
const runtimeContract = createAgentHttpsOpenApiDocument(
  "https://closed-pilot.invalid"
);
const failures = [];

function requireEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(message);
}

if (contract.openapi !== "3.1.2") {
  failures.push("Remote Agent OpenAPI must use 3.1.2");
}
if (
  contract.jsonSchemaDialect !==
  "https://json-schema.org/draft/2020-12/schema"
) {
  failures.push("Remote Agent OpenAPI must use JSON Schema 2020-12");
}
if (
  contract["x-ipo-one-schema-version"] !==
  AGENT_HTTPS_OPENAPI_SCHEMA_VERSION
) {
  failures.push("Remote Agent OpenAPI schema version drifted");
}
if (contract.servers?.[0]?.url !== "https://closed-pilot.invalid") {
  failures.push("Published contract must use the non-routable .invalid origin");
}

const operation = contract.paths?.["/tenant/v1/operations"]?.post;
const runtimeOperation =
  runtimeContract.paths?.["/tenant/v1/operations"]?.post;
requireEqual(
  operation?.security,
  [
    { workloadBearer: [], mutualTls: [] },
    { workloadBearer: [], dpopProof: [] }
  ],
  "Agent operation must require workload JWT plus one approved sender constraint"
);
requireEqual(
  operation?.security,
  runtimeOperation?.security,
  "Published and runtime Agent security requirements drifted"
);
requireEqual(
  operation?.["x-ipo-one-idempotency"],
  runtimeOperation?.["x-ipo-one-idempotency"],
  "Published and runtime idempotency semantics drifted"
);
if (
  operation?.requestBody?.content?.["application/json"]?.schema?.$ref !==
  "../../schemas/v2/tenant-protocol-request.schema.json"
) {
  failures.push("Remote Agent request must reference the canonical Tenant request schema");
}
if (
  operation?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref !==
  "../../schemas/v2/tenant-protocol-result.schema.json"
) {
  failures.push("Remote Agent result must reference the canonical Tenant result schema");
}
if (
  operation?.["x-ipo-one-timeout-outcome"] !==
  "unknown_after_submission"
) {
  failures.push("Remote Agent timeout must be represented as an unknown outcome");
}
if (
  contract.paths?.["/tenant/v1/synthetic-metered-resource"]?.post?.operationId !==
    "consumeSyntheticMeteredResource" ||
  !clientSource.includes('new URL("/tenant/v1/synthetic-metered-resource"') ||
  !hostSource.includes('syntheticMeteredResource: "/tenant/v1/synthetic-metered-resource"')
) {
  failures.push("Synthetic Metered Resource route is not aligned across contract, client, and host");
}

if (contract["x-ipo-one-safety"]?.remoteParticipantAccessEnabled !== true) {
  failures.push("Remote Agent access must match the active public authenticated no-funds product");
}
for (const key of [
  "realFundsEnabled", "humanCreditEnabled", "testnetWritesEnabled",
  "venueSignerEnabled", "arbitraryWithdrawalEnabled"
]) if (contract["x-ipo-one-safety"]?.[key] !== false) {
  failures.push(`Remote Agent safety flag ${key} must remain false`);
}
if (
  contract["x-ipo-one-activation"] !==
  "active_public_authenticated_no_funds"
) {
  failures.push("Remote Agent contract must match the active L2 product");
}
if (
  launchPolicy.profiles?.public_authenticated_no_funds_beta?.releaseEnabled !== true ||
  launchPolicy.profiles.public_authenticated_no_funds_beta.capabilities
    ?.syntheticMeteredResourceEnabled !== true ||
  launchPolicy.profiles.public_authenticated_no_funds_beta.capabilities
    ?.externalProviderExecutionEnabled !== false
) {
  failures.push("Remote Agent transport drifted from the canonical L2 launch policy");
}

const productionExport =
  sdkPackage.exports?.["./production-agent-client"];
if (
  productionExport?.import !== "./src/production-agent-client.js" ||
  productionExport?.types !== "./production-agent-client.d.ts"
) {
  failures.push("Remote Agent conformance client export is incomplete");
}
for (const requiredSource of [
  "replay_exact_request_with_same_idempotency_key",
  "payload.operationId !== protocolRequest.operationId",
  "requestId !== protocolRequest.requestId",
  "rejectUnauthorized: true",
  "minVersion: \"TLSv1.2\""
]) {
  if (!clientSource.includes(requiredSource)) {
    failures.push(`Remote Agent client is missing: ${requiredSource}`);
  }
}
if (
  !hostSource.includes("PRODUCTION_TENANT_ROUTES.agentOpenApi") ||
  !hostSource.includes("createAgentHttpsOpenApiDocument")
) {
  failures.push("Production Host does not publish the reviewed Agent contract");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "Agent HTTPS checks passed (active L2 contract, sender-bound client, synthetic Metered Resource, unknown-outcome semantics)."
);
