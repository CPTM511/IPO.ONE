import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  TENANT_PROTOCOL_CATALOG,
  TENANT_PROTOCOL_OPERATIONS
} from "../packages/api-contract/src/index.js";
import { TENANT_OPERATION_POLICIES } from "../modules/authorization/src/index.js";
import { TENANT_ABUSE_OPERATION_POLICIES } from "../modules/abuse-control/src/index.js";
import { createTenantFoundationHandlers } from "../modules/tenant-command-gateway/src/index.js";
import {
  validateExactTenantCatalogCoverage,
  validateTraceabilityReleaseMaturity
} from "./product-traceability-contract.mjs";

const requireFromApiContract = createRequire(
  new URL("../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const root = process.cwd();
const manifestPath = "product/traceability/ipo-one.v9-product-traceability.v1.json";
const schemaPath = "schemas/v2/v9-product-traceability.schema.json";
const failures = [];

function fail(condition, message) {
  if (!condition) failures.push(message);
}

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const [manifest, schema, staticCatalog, launchPolicy] = await Promise.all([
  json(manifestPath),
  json(schemaPath),
  json("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
  json("deploy/launch-policy.v1.json")
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  for (const error of validate.errors ?? []) {
    failures.push(`manifest schema ${error.instancePath || "/"} ${error.message}`);
  }
}

const classifications = [
  "REAL_LOCAL",
  "REAL_TESTNET_READ",
  "SIMULATION_ONLY",
  "SPECIFIED_DISABLED",
  "ABSENT"
];
const destinations = [
  ["overview", "Overview"],
  ["request_credit", "Request Credit"],
  ["secured_pool", "Secured Pool"],
  ["repay_settle", "Repay & Settle"],
  ["credit_passport", "Credit Passport"],
  ["obligations", "Obligations"],
  ["agent_console", "Agent Console"],
  ["capital_network", "Capital Network"],
  ["wallet_permissions", "Wallet & Permissions"],
  ["activity_proofs", "Activity & Proofs"],
  ["credit_track_record", "Credit Track Record"],
  ["reports_exports", "Reports & Exports"],
  ["risk_operations", "Risk & Operations"],
  ["architecture", "Architecture"]
];
const sharedContracts = {
  tenantCatalog: "api/tenant-protocol/ipo-one.tenant-protocol.v1.json",
  requestSchema: "schemas/v2/tenant-protocol-request.schema.json",
  resultSchema: "schemas/v2/tenant-protocol-result.schema.json",
  handlerRegistry: "modules/tenant-command-gateway/src/tenant-foundation-handlers.js",
  authorizationPolicy: "modules/authorization/src/authorization-policy.js",
  admissionPolicy: "modules/abuse-control/src/abuse-policy.js",
  persistenceComposition: "modules/persistence/src/postgres-core-repository.js",
  eventOutboxRepository: "modules/persistence/src/postgres-event-repository.js",
  reconciliationService: "modules/persistence/src/postgres-reconciliation-service.js",
  launchPolicy: "deploy/launch-policy.v1.json"
};

try {
  assert.deepEqual(manifest.classifications, classifications);
} catch {
  failures.push("classification vocabulary or order drifted");
}
try {
  assert.deepEqual(manifest.sharedContracts, sharedContracts);
} catch {
  failures.push("shared product authority references drifted");
}
try {
  assert.deepEqual(staticCatalog, TENANT_PROTOCOL_CATALOG);
} catch {
  failures.push("static and runtime Tenant protocol catalogs drifted");
}

fail(manifest.prototypeAuthority === false, "reference prototype became an authority source");
fail(manifest.status === "IMPLEMENTED_UNVERIFIED", "PRODUCT-002 status must remain IMPLEMENTED_UNVERIFIED");
fail(
  manifest.releaseMaturity?.tenantProtocolMaturity === TENANT_PROTOCOL_CATALOG.maturity,
  "traceability maturity drifted from the Tenant catalog"
);
fail(
  manifest.releaseMaturity?.realFundsEnabled === TENANT_PROTOCOL_CATALOG.safety.realFundsEnabled,
  "traceability real-funds boundary drifted from the Tenant catalog"
);
fail(
  manifest.releaseMaturity?.productionCreditEnabled ===
    TENANT_PROTOCOL_CATALOG.safety.productionCreditEnabled,
  "traceability production-credit boundary drifted from the Tenant catalog"
);

failures.push(...validateTraceabilityReleaseMaturity({
  launchPolicy,
  releaseMaturity: manifest.releaseMaturity
}));

for (const [index, expected] of destinations.entries()) {
  const actual = manifest.destinations?.[index];
  fail(actual?.destinationId === expected[0], `V9 destination ${index + 1} ID drifted`);
  fail(actual?.label === expected[1], `V9 destination ${index + 1} label drifted`);
  fail(actual?.order === index + 1, `V9 destination ${index + 1} order drifted`);
  fail((actual?.actions?.length ?? 0) > 0, `V9 destination ${expected[0]} has no classified actions`);
}
fail(manifest.destinations?.length === destinations.length, "V9 destination count drifted");

const handlerByOperation = new Map(
  createTenantFoundationHandlers().map((handler) => [handler.operationId, handler])
);
const authorizationByOperation = new Map(
  TENANT_OPERATION_POLICIES.map((policy) => [policy.operationId, policy])
);
const admissionByOperation = new Map(
  TENANT_ABUSE_OPERATION_POLICIES.map((policy) => [policy.operationId, policy])
);
const catalogByOperation = new Map(
  TENANT_PROTOCOL_OPERATIONS.map((operation) => [operation.operationId, operation])
);
const bindingByOperation = new Map();

for (const binding of manifest.operationBindings ?? []) {
  if (bindingByOperation.has(binding.operationId)) {
    failures.push(`duplicate operation binding: ${binding.operationId}`);
    continue;
  }
  bindingByOperation.set(binding.operationId, binding);
  const operation = catalogByOperation.get(binding.operationId);
  const handler = handlerByOperation.get(binding.operationId);
  const authorization = authorizationByOperation.get(binding.operationId);
  const admission = admissionByOperation.get(binding.operationId);
  fail(Boolean(operation), `traceability binding is outside the Tenant catalog: ${binding.operationId}`);
  fail(Boolean(handler), `traceability binding has no runtime handler: ${binding.operationId}`);
  fail(Boolean(authorization), `traceability binding has no AuthZ policy: ${binding.operationId}`);
  fail(Boolean(admission), `traceability binding has no admission policy: ${binding.operationId}`);
  if (!operation || !handler || !authorization || !admission) continue;

  fail(
    binding.requestSchemaVersion === operation.requestSchemaVersion,
    `request schema drifted: ${binding.operationId}`
  );
  fail(
    binding.responseSchemaVersion === operation.responseSchemaVersion,
    `response schema drifted: ${binding.operationId}`
  );
  fail(handler.kind === operation.kind, `handler kind drifted: ${binding.operationId}`);
  fail(
    JSON.stringify(authorization.allowedActorTypes) === JSON.stringify(operation.actorTypes),
    `AuthZ actor types drifted: ${binding.operationId}`
  );
  fail(
    authorization.requiredCapability === operation.requiredCapability,
    `AuthZ capability drifted: ${binding.operationId}`
  );
  fail(
    authorization.resourceType === operation.resourceType,
    `AuthZ resource type drifted: ${binding.operationId}`
  );
  fail(admission.quotaClass === operation.quotaClass, `admission quota drifted: ${binding.operationId}`);
  fail(operation.public === false, `operation became public: ${binding.operationId}`);
  fail(operation.fundsAuthority === false, `operation gained funds authority: ${binding.operationId}`);
  fail(
    binding.authorizationPolicyModule === sharedContracts.authorizationPolicy,
    `AuthZ source drifted: ${binding.operationId}`
  );
  fail(
    binding.admissionPolicyModule === sharedContracts.admissionPolicy,
    `admission source drifted: ${binding.operationId}`
  );
  fail(
    binding.persistenceModules.includes(sharedContracts.persistenceComposition),
    `core persistence source missing: ${binding.operationId}`
  );
  fail(
    binding.persistenceModules.includes(sharedContracts.eventOutboxRepository),
    `event/outbox persistence source missing: ${binding.operationId}`
  );
  try {
    const handlerSource = await readFile(resolve(root, binding.handlerModule), "utf8");
    fail(
      handlerSource.includes(binding.operationId),
      `declared handler module does not name operation: ${binding.operationId}`
    );
  } catch (error) {
    failures.push(`could not read handler module for ${binding.operationId}: ${error.message}`);
  }
}

const catalogIds = [...catalogByOperation.keys()].sort();
const bindingIds = [...bindingByOperation.keys()].sort();

const allActions = [
  ...(manifest.destinations ?? []).flatMap((destination) => destination.actions ?? []),
  ...(manifest.crossCuttingAreas ?? []).flatMap((area) => area.actions ?? [])
];
const actionIds = new Set();
const classifiedCatalogIds = new Set();
const classificationCounts = Object.fromEntries(classifications.map((value) => [value, 0]));

for (const action of allActions) {
  if (actionIds.has(action.actionId)) failures.push(`duplicate action ID: ${action.actionId}`);
  actionIds.add(action.actionId);
  if (Object.hasOwn(classificationCounts, action.classification)) {
    classificationCounts[action.classification] += 1;
  }

  for (const operationId of action.operationIds) {
    fail(
      catalogByOperation.has(operationId),
      `action references an unknown Tenant operation: ${action.actionId} -> ${operationId}`
    );
    fail(
      bindingByOperation.has(operationId),
      `action references an unbound Tenant operation: ${action.actionId} -> ${operationId}`
    );
  }

  if (action.classification === "REAL_LOCAL") {
    fail(action.authorityType !== "none", `REAL_LOCAL action has no authority: ${action.actionId}`);
    if (action.authorityType === "tenant_protocol") {
      fail(
        action.operationIds.length > 0,
        `Tenant-backed REAL_LOCAL action has no server operation: ${action.actionId}`
      );
      for (const operationId of action.operationIds) classifiedCatalogIds.add(operationId);
    } else {
      fail(
        action.operationIds.length === 0,
        `non-Tenant REAL_LOCAL action claims Tenant operations: ${action.actionId}`
      );
      fail(
        action.authorityReferences.length > 0,
        `non-Tenant REAL_LOCAL action has no checked-in authority reference: ${action.actionId}`
      );
    }
    fail(action.uiAdapters.length > 0, `REAL_LOCAL action has no UI/transport adapter: ${action.actionId}`);
    fail(action.testFiles.length > 0, `REAL_LOCAL action has no affected test: ${action.actionId}`);
  } else if (action.classification === "REAL_TESTNET_READ") {
    fail(
      action.authorityType === "testnet_read_adapter",
      `REAL_TESTNET_READ action lacks a testnet-read authority: ${action.actionId}`
    );
    fail(action.operationIds.length === 0, `REAL_TESTNET_READ action claims a Tenant mutation: ${action.actionId}`);
    fail(
      action.authorityReferences.length > 0,
      `REAL_TESTNET_READ action has no checked-in adapter reference: ${action.actionId}`
    );
  } else {
    fail(action.authorityType === "none", `non-real action claims an authority source: ${action.actionId}`);
    fail(action.operationIds.length === 0, `non-real action claims server operations: ${action.actionId}`);
    fail(
      action.authorityReferences.length === 0,
      `non-real action claims checked-in runtime authority: ${action.actionId}`
    );
    fail(action.uiAdapters.length === 0, `non-real action claims a UI adapter: ${action.actionId}`);
    fail(action.testFiles.length === 0, `non-real action claims runtime test coverage: ${action.actionId}`);
    fail(action.nextTaskIds.length > 0, `non-real action has no explicit successor task: ${action.actionId}`);
  }
}

failures.push(...validateExactTenantCatalogCoverage({
  catalogIds,
  bindingIds,
  classifiedCatalogIds
}));

fail(allActions.length >= 1, "traceability manifest has no classified actions");
for (const classification of classifications.filter((value) => value !== "REAL_TESTNET_READ")) {
  fail(
    classificationCounts[classification] > 0,
    `traceability manifest does not exercise classification ${classification}`
  );
}

const declaredPaths = new Set(Object.values(manifest.sharedContracts ?? {}));
for (const binding of manifest.operationBindings ?? []) {
  declaredPaths.add(binding.handlerModule);
  declaredPaths.add(binding.authorizationPolicyModule);
  declaredPaths.add(binding.admissionPolicyModule);
  for (const path of binding.persistenceModules) declaredPaths.add(path);
  for (const path of binding.uiAdapters) declaredPaths.add(path);
  for (const path of binding.testFiles) declaredPaths.add(path);
}
for (const action of allActions) {
  for (const path of action.authorityReferences) declaredPaths.add(path);
  for (const path of action.uiAdapters) declaredPaths.add(path);
  for (const path of action.testFiles) declaredPaths.add(path);
}

for (const path of declaredPaths) {
  if (isAbsolute(path) || path.split("/").includes("..")) {
    failures.push(`traceability path escapes the repository: ${path}`);
    continue;
  }
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === "..") {
    failures.push(`traceability path resolves outside the repository: ${path}`);
    continue;
  }
  try {
    const information = await stat(absolute);
    fail(information.isFile(), `traceability path is not a file: ${path}`);
  } catch {
    failures.push(`traceability path does not exist: ${path}`);
  }
}

if (failures.length > 0) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}

console.log(
  `Product traceability checks passed (${destinations.length} destinations, ` +
  `${allActions.length} actions, ${catalogIds.length} bound operations; ` +
  `${classifications.map((value) => `${value}=${classificationCounts[value]}`).join(", ")}).`
);
