import { readFile } from "node:fs/promises";
import {
  PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY,
  OperationalSignalType,
  assertOperationalAlertPolicy
} from "../modules/operations-control/src/index.js";

const policy = assertOperationalAlertPolicy(PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY);
const signalSchema = JSON.parse(await readFile(
  new URL("../schemas/v2/operational-signal.schema.json", import.meta.url),
  "utf8"
));
const alertSchema = JSON.parse(await readFile(
  new URL("../schemas/v2/operational-alert.schema.json", import.meta.url),
  "utf8"
));
const policySchema = JSON.parse(await readFile(
  new URL("../schemas/v2/operational-alert-policy.schema.json", import.meta.url),
  "utf8"
));

const failures = [];
const expectedSignalTypes = Object.values(OperationalSignalType).sort();
const policySignalTypes = policy.rules.map(({ signalType }) => signalType).sort();
const schemaSignalTypes = [...signalSchema.properties.signalType.enum].sort();
const alertSignalTypes = [...alertSchema.properties.signalType.enum].sort();
const policySchemaSignalTypes = [
  ...policySchema.properties.rules.items.properties.signalType.enum
].sort();
const policyAlertTypes = policy.rules.map(({ alertType }) => alertType).sort();
const schemaAlertTypes = [...alertSchema.properties.alertType.enum].sort();

for (const [name, actual] of [
  ["policy", policySignalTypes],
  ["signal schema", schemaSignalTypes],
  ["alert schema", alertSignalTypes],
  ["policy schema", policySchemaSignalTypes]
]) {
  if (JSON.stringify(actual) !== JSON.stringify(expectedSignalTypes)) {
    failures.push(`${name} signal coverage drifted`);
  }
}
if (JSON.stringify(policyAlertTypes) !== JSON.stringify(schemaAlertTypes)) {
  failures.push("alert type schema drifted from policy");
}
if (
  policySchema.properties.policyVersion.const !== policy.policyVersion ||
  alertSchema.properties.policyVersion.const !== policy.policyVersion
) failures.push("policy version schema drifted");
if (
  policy.safetyBoundary.automaticActionsEnabled !== false ||
  policy.safetyBoundary.realFundsActionsEnabled !== false ||
  policy.safetyBoundary.productionReleaseAuthority !== false
) failures.push("operations safety boundary is not fail-closed");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Operations policy checks passed (${policy.rules.length} event-presence rules).`);
