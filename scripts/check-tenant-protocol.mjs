import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TENANT_PROTOCOL_CATALOG,
  TENANT_PROTOCOL_OPERATIONS,
  assertDualNativeCreditOfferParity,
  assertDualNativeSandboxObligationParity,
  createAgentPilotCapabilityManifest,
  isAgentCreditOfferWorkflowReceipt,
  isAgentSandboxObligationWorkflowReceipt,
  isHumanCreditOfferWorkflowReceipt,
  isHumanSandboxObligationWorkflowReceipt,
  isSandboxObligationPortabilityReceipt,
  isAgentHandoffManifest,
  isAgentPilotCapabilityManifest,
  isTenantProtocolCatalog,
  isTenantProtocolRequest,
  isTenantProtocolResult
} from "../packages/api-contract/src/index.js";
import { TENANT_OPERATION_POLICIES } from "../modules/authorization/src/index.js";
import { TENANT_ABUSE_OPERATION_POLICIES } from "../modules/abuse-control/src/index.js";
import { createTenantFoundationHandlers } from "../modules/tenant-command-gateway/src/index.js";
import { AGENT_MCP_TOOLS } from "../apps/agent-mcp/src/index.js";
import { AGENT_HANDOFF_TOOLS } from "../apps/web/src/agent-handoff-manifest.js";
import {
  AGENT_PILOT_MCP_TOOLS,
  createAgentPilotCapabilityManifest as createBrowserAgentPilotCapabilityManifest
} from "../apps/web/src/agent-pilot-capability-manifest.js";
import { AGENT_MCP_CLIENT_TOOLS } from "../packages/sdk/src/agent-mcp-client.js";

const root = process.cwd();
const failures = [];

function fail(condition, message) {
  if (!condition) failures.push(message);
}

function collectPropertyNames(value, names = new Set()) {
  if (!value || typeof value !== "object") return names;
  if (value.properties && typeof value.properties === "object") {
    for (const name of Object.keys(value.properties)) names.add(name);
  }
  for (const nested of Object.values(value)) collectPropertyNames(nested, names);
  return names;
}

function openApiOperationIds(spec) {
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  const ids = new Set();
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (methods.has(method) && typeof operation.operationId === "string") {
        ids.add(operation.operationId);
      }
    }
  }
  return ids;
}

function applyFixtureMutation(source, mutation) {
  const result = structuredClone(source);
  let target = result;
  for (const segment of mutation.path.slice(0, -1)) target = target[segment];
  target[mutation.path.at(-1)] = mutation.value;
  return result;
}

const [
  staticCatalog,
  fixtures,
  handoffFixtures,
  capabilityManifestFixtures,
  workflowReceiptFixtures,
  humanWorkflowReceiptFixtures,
  agentObligationReceiptFixtures,
  humanObligationReceiptFixtures,
  obligationPortabilityReceiptFixtures,
  requestSchema,
  openApi,
  serverBody,
  typeDeclarations,
  sdkTypeDeclarations
] = await Promise.all([
  readFile(join(root, "api", "tenant-protocol", "ipo-one.tenant-protocol.v1.json"), "utf8").then(JSON.parse),
  readFile(
    join(root, "api", "tenant-protocol", "conformance", "tenant-protocol.v1.fixtures.json"),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(root, "api", "tenant-protocol", "conformance", "agent-handoff-manifest.v1.fixtures.json"),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(
      root,
      "api",
      "tenant-protocol",
      "conformance",
      "agent-pilot-capability-manifest.v1.fixtures.json"
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(
      root,
      "api",
      "tenant-protocol",
      "conformance",
      "agent-credit-offer-workflow-receipt.v1.fixtures.json"
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(
      root,
      "api",
      "tenant-protocol",
      "conformance",
      "human-credit-offer-workflow-receipt.v1.fixtures.json"
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(
      root,
      "api",
      "tenant-protocol",
      "conformance",
      "agent-sandbox-obligation-workflow-receipt.v1.fixtures.json"
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(
      root,
      "api",
      "tenant-protocol",
      "conformance",
      "human-sandbox-obligation-workflow-receipt.v1.fixtures.json"
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(
    join(
      root,
      "api",
      "tenant-protocol",
      "conformance",
      "sandbox-obligation-portability-receipt.v1.fixtures.json"
    ),
    "utf8"
  ).then(JSON.parse),
  readFile(join(root, "schemas", "v2", "tenant-protocol-request.schema.json"), "utf8").then(JSON.parse),
  readFile(join(root, "api", "openapi", "ipo-one.v1.json"), "utf8").then(JSON.parse),
  readFile(join(root, "apps", "api", "src", "server.js"), "utf8"),
  readFile(join(root, "packages", "api-contract", "index.d.ts"), "utf8"),
  readFile(join(root, "packages", "sdk", "index.d.ts"), "utf8")
]);

fail(isTenantProtocolCatalog(staticCatalog), "static Tenant protocol catalog is invalid");
try {
  assert.deepEqual(staticCatalog, TENANT_PROTOCOL_CATALOG);
} catch {
  failures.push("static and runtime Tenant protocol catalogs drifted");
}

const handlers = createTenantFoundationHandlers();
const handlerByOperation = new Map(handlers.map((handler) => [handler.operationId, handler]));
const authorizationByOperation = new Map(
  TENANT_OPERATION_POLICIES.map((policy) => [policy.operationId, policy])
);
const abuseByOperation = new Map(
  TENANT_ABUSE_OPERATION_POLICIES.map((policy) => [policy.operationId, policy])
);
const catalogIds = new Set(TENANT_PROTOCOL_OPERATIONS.map((operation) => operation.operationId));
const mcpOperationIds = new Set(AGENT_MCP_TOOLS.map((tool) => tool.operationId));

fail(handlerByOperation.size === TENANT_PROTOCOL_OPERATIONS.length, "handler/catalog operation count drifted");
fail(catalogIds.size === TENANT_PROTOCOL_OPERATIONS.length, "catalog operation IDs must be unique");
fail(AGENT_MCP_TOOLS.length === 11, "Agent MCP must expose exactly eleven approved tools");
fail(mcpOperationIds.size === 11, "Agent MCP operation IDs must be unique");
try {
  assert.deepEqual(
    AGENT_MCP_CLIENT_TOOLS,
    AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId }))
  );
} catch {
  failures.push("Agent SDK tool/operation pairs drifted from Agent MCP registry");
}
try {
  assert.deepEqual(
    AGENT_HANDOFF_TOOLS,
    AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId }))
  );
} catch {
  failures.push("browser handoff tool/operation pairs drifted from Agent MCP registry");
}
try {
  assert.deepEqual(
    AGENT_PILOT_MCP_TOOLS,
    AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId }))
  );
} catch {
  failures.push("Agent capability manifest tools drifted from Agent MCP registry");
}
fail(
  JSON.stringify(TENANT_PROTOCOL_CATALOG.availability.enabledTransports) ===
    JSON.stringify(["local_in_process", "authenticated_http_loopback", "mcp_stdio_local"]),
  "approved Tenant transport availability drifted"
);
fail(TENANT_PROTOCOL_CATALOG.availability.publicEndpointEnabled === false,
  "Tenant catalog enabled a public endpoint");
fail(
  new Set(TENANT_PROTOCOL_OPERATIONS.map((operation) => operation.responseSchemaVersion)).size ===
    TENANT_PROTOCOL_OPERATIONS.length,
  "response schema versions must be unique per operation"
);

for (const operation of TENANT_PROTOCOL_OPERATIONS) {
  const handler = handlerByOperation.get(operation.operationId);
  const authorization = authorizationByOperation.get(operation.operationId);
  const abuse = abuseByOperation.get(operation.operationId);
  fail(Boolean(handler), `catalog operation has no handler: ${operation.operationId}`);
  fail(Boolean(authorization), `catalog operation has no authorization policy: ${operation.operationId}`);
  fail(Boolean(abuse), `catalog operation has no abuse policy: ${operation.operationId}`);
  if (!handler || !authorization || !abuse) continue;

  fail(handler.kind === operation.kind, `handler kind drifted: ${operation.operationId}`);
  fail(
    JSON.stringify(authorization.allowedActorTypes) === JSON.stringify(operation.actorTypes),
    `Actor types drifted: ${operation.operationId}`
  );
  fail(
    authorization.requiredCapability === operation.requiredCapability,
    `required capability drifted: ${operation.operationId}`
  );
  fail(
    authorization.resourceType === operation.resourceType,
    `authorization resource type drifted: ${operation.operationId}`
  );
  fail(
    operation.idempotency === (handler.kind === "command" ? "required" : "prohibited"),
    `protocol idempotency drifted: ${operation.operationId}`
  );
  fail(abuse.quotaClass === operation.quotaClass, `quota class drifted: ${operation.operationId}`);
  fail(operation.public === false, `Tenant operation became public: ${operation.operationId}`);
  fail(operation.fundsAuthority === false, `Tenant operation gained funds authority: ${operation.operationId}`);
  fail(typeDeclarations.includes(`\"${operation.operationId}\"`),
    `TypeScript declarations omit operation: ${operation.operationId}`);
  fail(typeDeclarations.includes(`\"${operation.responseSchemaVersion}\"`),
    `TypeScript declarations omit response schema: ${operation.responseSchemaVersion}`);
}

for (const operationId of handlerByOperation.keys()) {
  fail(catalogIds.has(operationId), `handler is missing from catalog: ${operationId}`);
}

for (const operationId of mcpOperationIds) {
  const operation = TENANT_PROTOCOL_OPERATIONS.find((item) => item.operationId === operationId);
  const authorization = authorizationByOperation.get(operationId);
  fail(Boolean(operation), `MCP tool operation is missing from catalog: ${operationId}`);
  fail(Boolean(authorization), `MCP tool operation is missing authorization: ${operationId}`);
  fail(operation?.actorTypes.includes("agent") === true,
    `MCP tool operation is not Agent-authorized: ${operationId}`);
  fail(authorization?.allowedActorTypes.includes("agent") === true,
    `MCP tool authorization drifted from Agent boundary: ${operationId}`);
}
for (const forbiddenMcpOperation of [
  "pilotActivateSandboxMandate",
  "pilotCreateConsent",
  "pilotCreateDraftMandate",
  "pilotFreezeSubject",
  "pilotAcknowledgeProviderIntent",
  "pilotReadMandate",
  "pilotReadProviderIntent",
  "pilotReadServicingQueue",
  "pilotReadTenantRisk",
  "pilotReadPilotHealth",
  "pilotReadEvidence",
  "workerProcessInbox"
]) {
  fail(!mcpOperationIds.has(forbiddenMcpOperation),
    `Agent MCP exposed a forbidden operation: ${forbiddenMcpOperation}`);
}

for (const fixture of fixtures.validRequests ?? []) {
  fail(isTenantProtocolRequest(fixture), `valid request fixture failed: ${fixture.operationId ?? "unknown"}`);
}
for (const fixture of fixtures.invalidRequests ?? []) {
  fail(!isTenantProtocolRequest(fixture), `invalid request fixture passed: ${fixture.operationId ?? "unknown"}`);
}
for (const fixture of fixtures.validResults ?? []) {
  fail(isTenantProtocolResult(fixture), `valid result fixture failed: ${fixture.operationId ?? "unknown"}`);
}
for (const fixture of fixtures.invalidResults ?? []) {
  fail(!isTenantProtocolResult(fixture), `invalid result fixture passed: ${fixture.operationId ?? "unknown"}`);
}
for (const fixture of handoffFixtures.valid ?? []) {
  fail(isAgentHandoffManifest(fixture), `valid Agent handoff fixture failed: ${fixture.status ?? "unknown"}`);
}
for (const fixture of handoffFixtures.invalid ?? []) {
  fail(!isAgentHandoffManifest(fixture), `invalid Agent handoff fixture passed: ${fixture.status ?? "unknown"}`);
}
fail((fixtures.validRequests ?? []).length === TENANT_PROTOCOL_OPERATIONS.length, "valid request coverage drifted");
fail((fixtures.validResults ?? []).length === TENANT_PROTOCOL_OPERATIONS.length, "valid result coverage drifted");
fail((handoffFixtures.valid ?? []).length === 3, "Agent handoff valid fixture coverage drifted");
fail((handoffFixtures.invalid ?? []).length >= 4, "Agent handoff invalid fixture coverage drifted");
for (const fixture of capabilityManifestFixtures.valid ?? []) {
  fail(isAgentPilotCapabilityManifest(fixture),
    `valid Agent capability manifest failed: ${fixture.status ?? "unknown"}`);
  try {
    assert.equal(
      JSON.stringify(createAgentPilotCapabilityManifest(fixture.handoff)),
      JSON.stringify(createBrowserAgentPilotCapabilityManifest(fixture.handoff))
    );
  } catch {
    failures.push(`browser/API Agent capability builders drifted: ${fixture.status ?? "unknown"}`);
  }
}
for (const mutation of capabilityManifestFixtures.invalidMutations ?? []) {
  fail(
    !isAgentPilotCapabilityManifest(
      applyFixtureMutation(capabilityManifestFixtures.valid[0], mutation)
    ),
    `invalid Agent capability manifest mutation passed: ${mutation.name ?? "unknown"}`
  );
}
fail((capabilityManifestFixtures.valid ?? []).length === 3,
  "Agent capability manifest state coverage drifted");
fail((capabilityManifestFixtures.invalidMutations ?? []).length >= 8,
  "Agent capability manifest invalid mutation coverage drifted");
fail(typeDeclarations.includes("AgentPilotCapabilityManifest"),
  "TypeScript declarations omit Agent pilot capability manifest");
for (const fixture of workflowReceiptFixtures.valid ?? []) {
  fail(isAgentCreditOfferWorkflowReceipt(fixture), "valid Agent workflow receipt fixture failed");
}
for (const mutation of workflowReceiptFixtures.invalidMutations ?? []) {
  fail(
    !isAgentCreditOfferWorkflowReceipt(
      applyFixtureMutation(workflowReceiptFixtures.valid[0], mutation)
    ),
    `invalid Agent workflow receipt mutation passed: ${mutation.name ?? "unknown"}`
  );
}
fail((workflowReceiptFixtures.valid ?? []).length === 1,
  "Agent workflow receipt valid fixture coverage drifted");
fail((workflowReceiptFixtures.invalidMutations ?? []).length >= 7,
  "Agent workflow receipt invalid fixture coverage drifted");
fail(typeDeclarations.includes("AgentCreditOfferWorkflowReceipt"),
  "TypeScript declarations omit Agent workflow receipt");
for (const fixture of humanWorkflowReceiptFixtures.valid ?? []) {
  fail(isHumanCreditOfferWorkflowReceipt(fixture), "valid Human workflow receipt fixture failed");
}
for (const mutation of humanWorkflowReceiptFixtures.invalidMutations ?? []) {
  fail(
    !isHumanCreditOfferWorkflowReceipt(
      applyFixtureMutation(humanWorkflowReceiptFixtures.valid[0], mutation)
    ),
    `invalid Human workflow receipt mutation passed: ${mutation.name ?? "unknown"}`
  );
}
fail((humanWorkflowReceiptFixtures.valid ?? []).length === 1,
  "Human workflow receipt valid fixture coverage drifted");
fail((humanWorkflowReceiptFixtures.invalidMutations ?? []).length >= 8,
  "Human workflow receipt invalid fixture coverage drifted");
fail(typeDeclarations.includes("HumanCreditOfferWorkflowReceipt"),
  "TypeScript declarations omit Human workflow receipt");
for (const fixture of agentObligationReceiptFixtures.valid ?? []) {
  fail(
    isAgentSandboxObligationWorkflowReceipt(fixture),
    "valid Agent sandbox Obligation workflow receipt fixture failed"
  );
}
for (const mutation of agentObligationReceiptFixtures.invalidMutations ?? []) {
  fail(
    !isAgentSandboxObligationWorkflowReceipt(
      applyFixtureMutation(agentObligationReceiptFixtures.valid[0], mutation)
    ),
    `invalid Agent sandbox Obligation receipt mutation passed: ${mutation.name ?? "unknown"}`
  );
}
fail((agentObligationReceiptFixtures.valid ?? []).length === 1,
  "Agent sandbox Obligation receipt valid fixture coverage drifted");
fail((agentObligationReceiptFixtures.invalidMutations ?? []).length >= 6,
  "Agent sandbox Obligation receipt invalid fixture coverage drifted");
fail(typeDeclarations.includes("AgentSandboxObligationWorkflowReceipt"),
  "TypeScript declarations omit Agent sandbox Obligation receipt");
for (const fixture of humanObligationReceiptFixtures.valid ?? []) {
  fail(
    isHumanSandboxObligationWorkflowReceipt(fixture),
    "valid Human sandbox Obligation workflow receipt fixture failed"
  );
}
for (const mutation of humanObligationReceiptFixtures.invalidMutations ?? []) {
  fail(
    !isHumanSandboxObligationWorkflowReceipt(
      applyFixtureMutation(humanObligationReceiptFixtures.valid[0], mutation)
    ),
    `invalid Human sandbox Obligation receipt mutation passed: ${mutation.name ?? "unknown"}`
  );
}
fail((humanObligationReceiptFixtures.valid ?? []).length === 1,
  "Human sandbox Obligation receipt valid fixture coverage drifted");
fail((humanObligationReceiptFixtures.invalidMutations ?? []).length >= 6,
  "Human sandbox Obligation receipt invalid fixture coverage drifted");
fail(typeDeclarations.includes("HumanSandboxObligationWorkflowReceipt"),
  "TypeScript declarations omit Human sandbox Obligation receipt");
for (const fixture of obligationPortabilityReceiptFixtures.valid ?? []) {
  fail(
    isSandboxObligationPortabilityReceipt(fixture),
    "valid sandbox Obligation portability receipt fixture failed"
  );
}
for (const mutation of obligationPortabilityReceiptFixtures.invalidMutations ?? []) {
  fail(
    !isSandboxObligationPortabilityReceipt(
      applyFixtureMutation(obligationPortabilityReceiptFixtures.valid[0], mutation)
    ),
    `invalid sandbox Obligation portability receipt mutation passed: ${mutation.name ?? "unknown"}`
  );
}
fail((obligationPortabilityReceiptFixtures.valid ?? []).length === 1,
  "sandbox Obligation portability receipt valid fixture coverage drifted");
fail((obligationPortabilityReceiptFixtures.invalidMutations ?? []).length >= 5,
  "sandbox Obligation portability receipt invalid fixture coverage drifted");
fail(typeDeclarations.includes("SandboxObligationPortabilityReceipt"),
  "TypeScript declarations omit sandbox Obligation portability receipt");
try {
  const parity = assertDualNativeCreditOfferParity({
    humanReceipt: humanWorkflowReceiptFixtures.valid[0],
    agentReceipt: workflowReceiptFixtures.valid[0]
  });
  fail(parity.schemaVersion === "dual_native_offer_economics.v1",
    "dual-native Offer parity profile drifted");
  fail(parity.matched === true, "dual-native Offer fixtures are not economically equivalent");
} catch {
  failures.push("Human and Agent workflow receipt economics drifted");
}
fail(typeDeclarations.includes("DualNativeOfferEconomicParity"),
  "TypeScript declarations omit dual-native Offer parity");
try {
  const parity = assertDualNativeSandboxObligationParity({
    humanReceipt: humanObligationReceiptFixtures.valid[0],
    agentReceipt: agentObligationReceiptFixtures.valid[0]
  });
  fail(parity.schemaVersion === "dual_native_obligation_economics.v1",
    "dual-native Obligation parity profile drifted");
  fail(parity.matched === true, "dual-native Obligation fixtures are not economically equivalent");
} catch {
  failures.push("Human and Agent sandbox Obligation economics drifted");
}
fail(typeDeclarations.includes("DualNativeObligationEconomicParity"),
  "TypeScript declarations omit dual-native Obligation parity");
fail(sdkTypeDeclarations.includes("IpoOneAgentMcpClient"),
  "SDK TypeScript declarations omit Agent MCP client");
fail(sdkTypeDeclarations.includes("AgentCreditOfferWorkflowReceipt"),
  "SDK TypeScript declarations omit Agent workflow receipt");
fail(sdkTypeDeclarations.includes("IpoOneAgentSandboxObligationClient"),
  "SDK TypeScript declarations omit Agent sandbox Obligation client");
fail(sdkTypeDeclarations.includes("AgentSandboxObligationWorkflowReceipt"),
  "SDK TypeScript declarations omit Agent sandbox Obligation receipt");
fail(sdkTypeDeclarations.includes("runSandboxObligationPortabilityConformance"),
  "SDK TypeScript declarations omit sandbox Obligation portability workflow");
fail(sdkTypeDeclarations.includes("createAgentPilotCapabilityManifest"),
  "SDK TypeScript declarations omit Agent pilot capability manifest builder");

const forbiddenAuthorityProperties = [
  "authenticationContext",
  "tenantId",
  "actorId",
  "actorType",
  "clientId",
  "credentialId",
  "credentialVersion",
  "policyVersion",
  "capabilities",
  "roles",
  "authorizationDecision",
  "networkContext"
];
const requestPropertyNames = new Set(Object.keys(requestSchema.properties ?? {}));
for (const property of forbiddenAuthorityProperties) {
  fail(!requestPropertyNames.has(property), `caller request schema exposes authority property: ${property}`);
}
const nestedPropertyNames = collectPropertyNames(requestSchema);
for (const property of forbiddenAuthorityProperties.filter((name) => name !== "capabilities")) {
  fail(!nestedPropertyNames.has(property), `caller request schema nests authority property: ${property}`);
}

const publicOperationIds = openApiOperationIds(openApi);
for (const operationId of catalogIds) {
  fail(!publicOperationIds.has(operationId), `private operation is advertised by public OpenAPI: ${operationId}`);
  fail(!serverBody.includes(operationId), `public server references private operation: ${operationId}`);
}
for (const forbiddenImport of [
  "tenant-command-gateway",
  "TenantCommandGateway",
  "tenant-protocol",
  "TENANT_PROTOCOL_CATALOG"
]) {
  fail(!serverBody.includes(forbiddenImport), `public server references private protocol runtime: ${forbiddenImport}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Tenant protocol checks passed (${TENANT_PROTOCOL_OPERATIONS.length} operations, ` +
    `${fixtures.validRequests.length + fixtures.invalidRequests.length} request fixtures, ` +
    `${fixtures.validResults.length + fixtures.invalidResults.length} result fixtures, ` +
    `${handoffFixtures.valid.length + handoffFixtures.invalid.length} handoff fixtures, ` +
    `${capabilityManifestFixtures.valid.length} capability manifests + ${capabilityManifestFixtures.invalidMutations.length} invalid mutations, ` +
    `${workflowReceiptFixtures.valid.length + humanWorkflowReceiptFixtures.valid.length + agentObligationReceiptFixtures.valid.length + humanObligationReceiptFixtures.valid.length + obligationPortabilityReceiptFixtures.valid.length} workflow receipt fixtures + ` +
    `${workflowReceiptFixtures.invalidMutations.length + humanWorkflowReceiptFixtures.invalidMutations.length + agentObligationReceiptFixtures.invalidMutations.length + humanObligationReceiptFixtures.invalidMutations.length + obligationPortabilityReceiptFixtures.invalidMutations.length} invalid mutations).`
);
