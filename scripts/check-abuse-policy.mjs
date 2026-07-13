import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TENANT_OPERATION_POLICIES } from "../modules/authorization/src/index.js";
import {
  ABUSE_CONTROL_POLICY,
  ABUSE_POLICY_VERSION,
  HARD_CEILINGS,
  QUOTA_PROFILES,
  QuotaClass,
  RequestMetric,
  TENANT_ABUSE_OPERATION_POLICIES
} from "../modules/abuse-control/src/index.js";

const failures = [];
const fail = (condition, message) => { if (!condition) failures.push(message); };
const byOperation = new Map(TENANT_ABUSE_OPERATION_POLICIES.map((item) => [item.operationId, item]));

fail(ABUSE_CONTROL_POLICY.policyVersion === ABUSE_POLICY_VERSION, "policy version drifted");
fail(Object.isFrozen(ABUSE_CONTROL_POLICY), "policy snapshot must be frozen");
fail(byOperation.size === TENANT_OPERATION_POLICIES.length, "tenant operation coverage drifted");
for (const authorization of TENANT_OPERATION_POLICIES) {
  const abuse = byOperation.get(authorization.operationId);
  fail(Boolean(abuse), `missing operation classification: ${authorization.operationId}`);
  if (!abuse) continue;
  fail(abuse.action === authorization.action, `action classification drifted: ${authorization.operationId}`);
  if (abuse.profile.idempotencyRequired) {
    fail(
      authorization.idempotencyRequirement === "required",
      `abuse policy requires idempotency but authorization does not: ${authorization.operationId}`
    );
  }
}

const secD08 = [
  [QUOTA_PROFILES.discovery.rate.network, 30, "discovery network"],
  [QUOTA_PROFILES.read.rate.actor, 600, "read actor"],
  [QUOTA_PROFILES.read.rate.tenant, 3_000, "read tenant"],
  [QUOTA_PROFILES.mutation.rate.actor, 120, "mutation actor"],
  [QUOTA_PROFILES.mutation.rate.tenant, 600, "mutation tenant"],
  [QUOTA_PROFILES.economic.rate.actor, 30, "economic actor"],
  [QUOTA_PROFILES.credential.windowMs, 600_000, "credential window"],
  [QUOTA_PROFILES.credential.rate.account, 10, "credential account"],
  [QUOTA_PROFILES.credential.rate.network, 10, "credential network"],
  [QUOTA_PROFILES.privileged.rate.actor, 30, "privileged actor"],
  [QUOTA_PROFILES.batch.rate.tenant, 6, "batch tenant"]
];
for (const [actual, expected, name] of secD08) fail(actual === expected, `SEC-D08 drifted: ${name}`);

for (const profile of Object.values(QUOTA_PROFILES)) {
  fail(profile.windowMs <= HARD_CEILINGS.rate.windowMs, `${profile.quotaClass} window exceeds ceiling`);
  for (const [scope, value] of Object.entries(profile.rate)) {
    fail(value <= HARD_CEILINGS.rate[scope], `${profile.quotaClass}.${scope} exceeds rate ceiling`);
  }
  for (const [scope, value] of Object.entries(profile.concurrency)) {
    fail(value <= HARD_CEILINGS.concurrency[scope], `${profile.quotaClass}.${scope} exceeds concurrency ceiling`);
  }
  for (const [metric, value] of Object.entries(profile.metrics)) {
    fail(value <= HARD_CEILINGS.metrics[metric], `${profile.quotaClass}.${metric} exceeds metric ceiling`);
  }
  fail(profile.admissionLeaseMs <= HARD_CEILINGS.admissionLeaseMs,
    `${profile.quotaClass} lease exceeds ceiling`);
  fail(profile.maxAutomaticRetries <= HARD_CEILINGS.automaticRetries,
    `${profile.quotaClass} retry count exceeds ceiling`);
}
for (const quotaClass of [QuotaClass.ECONOMIC, QuotaClass.PRIVILEGED, QuotaClass.BATCH]) {
  fail(QUOTA_PROFILES[quotaClass].maxAutomaticRetries === 0,
    `${quotaClass} must prohibit automatic retry`);
  fail(QUOTA_PROFILES[quotaClass].idempotencyRequired, `${quotaClass} must require idempotency`);
}
fail(QUOTA_PROFILES.batch.metrics[RequestMetric.EXPORT_ROWS] === 10_000,
  "batch export row bound drifted");

const schema = JSON.parse(await readFile(
  join(process.cwd(), "schemas", "v2", "abuse-control-policy.schema.json"),
  "utf8"
));
const schemaOperations = schema.properties?.operations?.properties ?? {};
fail(
  JSON.stringify(Object.keys(schemaOperations).sort()) ===
    JSON.stringify(Object.keys(ABUSE_CONTROL_POLICY.operations).sort()),
  "policy schema operation coverage drifted"
);
for (const [operationId, quotaClass] of Object.entries(ABUSE_CONTROL_POLICY.operations)) {
  fail(schemaOperations[operationId]?.const === quotaClass,
    `policy schema classification drifted: ${operationId}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Abuse-control policy checks passed (${byOperation.size} tenant operations).`);
