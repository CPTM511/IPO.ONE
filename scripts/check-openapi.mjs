import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUBLIC_SANDBOX_OPERATION_POLICIES } from "../modules/authorization/src/authorization-policy.js";

const root = process.cwd();
const specPath = join(root, "api", "openapi", "ipo-one.v1.json");
const serverPath = join(root, "apps", "api", "src", "server.js");
const sdkPath = join(root, "packages", "sdk", "src", "index.js");
const [specBody, serverBody, sdkBody] = await Promise.all([
  readFile(specPath, "utf8"),
  readFile(serverPath, "utf8"),
  readFile(sdkPath, "utf8")
]);
const failures = [];

let spec;
try {
  spec = JSON.parse(specBody);
} catch (error) {
  console.error(`OpenAPI JSON is invalid: ${error.message}`);
  process.exit(1);
}

if (spec.openapi !== "3.1.2") failures.push("OpenAPI version must be 3.1.2");
if (spec.jsonSchemaDialect !== "https://json-schema.org/draft/2020-12/schema") {
  failures.push("OpenAPI must use JSON Schema 2020-12");
}
if (!Array.isArray(spec.security) || spec.security.length !== 0) {
  failures.push("API-001 must not advertise unimplemented authentication");
}
for (const name of ["realFunds", "realLending", "productionAuthentication", "productionCommandIdempotency", "humanCreditExecution"]) {
  if (spec["x-ipo-one-safety"]?.[name] !== false) failures.push(`x-ipo-one-safety.${name} must be false`);
}
if (spec["x-ipo-one-safety"]?.sandboxSessionAuthentication !== false) {
  failures.push("sandbox session partitioning must not be represented as authentication");
}

const literalPaths = [...serverBody.matchAll(/(?:pathname|request\.url)\s*===\s*"(\/(?:healthz|v1\/)[^"]*)"/g)].map(
  (match) => match[1]
);
const matchedPaths = [...serverBody.matchAll(/match\(pathname,\s*"(\/v1\/[^"]+)"\)/g)].map((match) =>
  match[1].replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}")
);
const implementedPaths = new Set([...literalPaths, ...matchedPaths]);
const documentedPaths = new Set(Object.keys(spec.paths ?? {}));

for (const path of implementedPaths) {
  if (!documentedPaths.has(path)) failures.push(`implemented path is missing from OpenAPI: ${path}`);
}
for (const path of documentedPaths) {
  if (!implementedPaths.has(path)) failures.push(`OpenAPI advertises an unimplemented path: ${path}`);
}

const operationIds = new Set();
const documentedOperations = new Map();
const methods = new Set(["get", "post", "put", "patch", "delete"]);
let operationCount = 0;
for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue;
    operationCount += 1;
    if (typeof operation.operationId !== "string" || operation.operationId.length === 0) {
      failures.push(`${method.toUpperCase()} ${path} is missing operationId`);
    } else if (operationIds.has(operation.operationId)) {
      failures.push(`duplicate operationId: ${operation.operationId}`);
    } else {
      operationIds.add(operation.operationId);
      documentedOperations.set(operation.operationId, {
        method: method.toUpperCase(),
        path
      });
    }
    if (operation["x-ipo-one-maturity"] !== "demo") {
      failures.push(`${method.toUpperCase()} ${path} must declare demo maturity`);
    }
    if (!operation.parameters?.some((parameter) => parameter.$ref === "#/components/parameters/RequestId")) {
      failures.push(`${method.toUpperCase()} ${path} is missing X-Request-ID`);
    }
    if (!operation.parameters?.some((parameter) => parameter.$ref === "#/components/parameters/SandboxSessionId")) {
      failures.push(`${method.toUpperCase()} ${path} is missing the sandbox session partition header`);
    }
    if (!Object.keys(operation.responses ?? {}).some((status) => /^2\d\d$/.test(status))) {
      failures.push(`${method.toUpperCase()} ${path} is missing a success response`);
    }
    if (operation.responses?.default?.$ref !== "#/components/responses/Problem") {
      failures.push(`${method.toUpperCase()} ${path} is missing the default Problem response`);
    }
    if (method === "post" && !operation.requestBody) {
      failures.push(`POST ${path} is missing requestBody`);
    }
  }
}

const authorizationPolicies = new Map(
  PUBLIC_SANDBOX_OPERATION_POLICIES.map((policy) => [policy.operationId, policy])
);
for (const [operationId, operation] of documentedOperations) {
  const policy = authorizationPolicies.get(operationId);
  if (!policy) {
    failures.push(`operation is missing public-sandbox authorization classification: ${operationId}`);
    continue;
  }
  if (policy.transport.method !== operation.method || policy.transport.path !== operation.path) {
    failures.push(`authorization classification does not match OpenAPI: ${operationId}`);
  }
  if (
    policy.surface !== "public_sandbox" ||
    policy.ownershipRule !== "sandbox_partition" ||
    policy.auditRequirement !== "http_boundary"
  ) {
    failures.push(`public operation has an unsafe authorization classification: ${operationId}`);
  }
}
for (const operationId of authorizationPolicies.keys()) {
  if (!documentedOperations.has(operationId)) {
    failures.push(`authorization classification references an unknown OpenAPI operation: ${operationId}`);
  }
}

for (const [name, response] of Object.entries(spec.components?.responses ?? {})) {
  if (response.headers?.["X-Request-ID"]?.$ref !== "#/components/headers/RequestId") {
    failures.push(`response ${name} is missing X-Request-ID`);
  }
  if (response.headers?.["X-IPO-ONE-Sandbox-Session"]?.$ref !== "#/components/headers/SandboxSessionId") {
    failures.push(`response ${name} is missing the sandbox session partition header`);
  }
}
if (!spec.components?.responses?.Problem?.content?.["application/problem+json"]) {
  failures.push("Problem response must use application/problem+json");
}
if (spec.components?.schemas?.ProblemDetails?.additionalProperties !== false) {
  failures.push("ProblemDetails must be a closed schema");
}

function resolvePointer(pointer) {
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, part) => value?.[part], spec);
}

function checkReferences(value, path = "#") {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string" && value.$ref.startsWith("#/") && resolvePointer(value.$ref) === undefined) {
    failures.push(`unresolved reference at ${path}: ${value.$ref}`);
  }
  for (const [key, nested] of Object.entries(value)) checkReferences(nested, `${path}/${key}`);
}
checkReferences(spec);

const sdkMethodsByOperation = {
  getHealth: "health",
  getDemoState: "getDemoState",
  createAgent: "createAgent",
  bindAgentWallet: "bindWallet",
  createAgentLockbox: "createLockbox",
  requestAgentCreditLine: "requestCreditLine",
  submitSpendRequest: "submitSpendRequest",
  recordSettlement: "recordSettlement",
  captureRevenue: "captureRevenue",
  autoRepay: "autoRepay",
  evaluateCreditLearning: "evaluateCreditLearning",
  runHealthyCycle: "runCycle",
  runRiskyCycle: "runCycle",
  runRecoveryCycle: "runCycle",
  getAgentStatus: "getAgentStatus",
  getCreditProfile: "getCreditProfile",
  getDemoAudit: "getAudit",
  listSandboxRails: "listRails",
  getTransferIntent: "getTransferIntent",
  runVerticalSlice: "runVerticalSlice",
  resetDemo: "resetDemo"
};
for (const operationId of operationIds) {
  const sdkMethod = sdkMethodsByOperation[operationId];
  if (!sdkMethod) {
    failures.push(`operation is missing an SDK mapping: ${operationId}`);
  } else if (!new RegExp(`\\n\\s{2}${sdkMethod}\\(`).test(sdkBody)) {
    failures.push(`SDK method is missing for ${operationId}: ${sdkMethod}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`OpenAPI checks passed (${documentedPaths.size} paths, ${operationCount} operations).`);
