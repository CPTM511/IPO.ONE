import { readFile } from "node:fs/promises";
import {
  AGENT_HTTPS_OPENAPI_SCHEMA_VERSION,
  createAgentHttpsOpenApiDocument
} from "../apps/tenant-api/src/tenant-openapi.js";

const contractPath =
  "api/tenant-protocol/ipo-one.agent-https.v1.json";
const topologyPath = "deploy/closed-pilot/topology.v1.json";
const packagePath = "packages/sdk/package.json";
const clientPath = "packages/sdk/src/production-agent-client.js";
const hostPath = "apps/tenant-api/src/production-tenant-host.js";

const [
  contractSource,
  topologySource,
  packageSource,
  clientSource,
  hostSource
] = await Promise.all([
  readFile(contractPath, "utf8"),
  readFile(topologyPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(clientPath, "utf8"),
  readFile(hostPath, "utf8")
]);

const contract = JSON.parse(contractSource);
const topology = JSON.parse(topologySource);
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
  [{ workloadBearer: [], mutualTls: [] }],
  "Agent operation must require both workload JWT and mutual TLS"
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

for (const [key, value] of Object.entries(
  contract["x-ipo-one-safety"] ?? {}
)) {
  if (value !== false) failures.push(`Remote Agent safety flag ${key} must remain false`);
}
if (
  contract["x-ipo-one-activation"] !==
  "disabled_pending_named_deployment_approval"
) {
  failures.push("Remote Agent contract must remain deployment-disabled");
}
if (
  topology.authority?.remoteParticipantAccessEnabled !== false ||
  topology.edge?.activation !== "disabled" ||
  topology.launchBlocked !== true
) {
  failures.push("TRANSPORT-003 must not activate the closed-pilot topology");
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
  "TRANSPORT-003 checks passed (disabled remote Agent contract, mTLS client, unknown-outcome semantics)."
);
