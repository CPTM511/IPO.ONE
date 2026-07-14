import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TENANT_PROTOCOL_CATALOG,
  TENANT_PROTOCOL_OPERATIONS,
  isTenantProtocolCatalog,
  isTenantProtocolRequest,
  isTenantProtocolResult
} from "../packages/api-contract/src/index.js";
import { TENANT_OPERATION_POLICIES } from "../modules/authorization/src/index.js";
import { TENANT_ABUSE_OPERATION_POLICIES } from "../modules/abuse-control/src/index.js";
import { createTenantFoundationHandlers } from "../modules/tenant-command-gateway/src/index.js";

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

const [staticCatalog, fixtures, requestSchema, openApi, serverBody, typeDeclarations] = await Promise.all([
  readFile(join(root, "api", "tenant-protocol", "ipo-one.tenant-protocol.v1.json"), "utf8").then(JSON.parse),
  readFile(
    join(root, "api", "tenant-protocol", "conformance", "tenant-protocol.v1.fixtures.json"),
    "utf8"
  ).then(JSON.parse),
  readFile(join(root, "schemas", "v2", "tenant-protocol-request.schema.json"), "utf8").then(JSON.parse),
  readFile(join(root, "api", "openapi", "ipo-one.v1.json"), "utf8").then(JSON.parse),
  readFile(join(root, "apps", "api", "src", "server.js"), "utf8"),
  readFile(join(root, "packages", "api-contract", "index.d.ts"), "utf8")
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

fail(handlerByOperation.size === TENANT_PROTOCOL_OPERATIONS.length, "handler/catalog operation count drifted");
fail(catalogIds.size === TENANT_PROTOCOL_OPERATIONS.length, "catalog operation IDs must be unique");
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
fail((fixtures.validRequests ?? []).length === TENANT_PROTOCOL_OPERATIONS.length, "valid request coverage drifted");
fail((fixtures.validResults ?? []).length === TENANT_PROTOCOL_OPERATIONS.length, "valid result coverage drifted");

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
    `${fixtures.validResults.length + fixtures.invalidResults.length} result fixtures).`
);
