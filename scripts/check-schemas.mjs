import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const schemaDirectory = join(process.cwd(), "schemas", "v2");
const requiredFiles = new Set([
  "access-grant.schema.json",
  "approval-decision.schema.json",
  "approval-execution.schema.json",
  "approval-proposal.schema.json",
  "authentication-context.schema.json",
  "authentication-event.schema.json",
  "authorization-audit-event.schema.json",
  "authorization-decision.schema.json",
  "break-glass-custodian-decision.schema.json",
  "break-glass-incident.schema.json",
  "break-glass-review.schema.json",
  "evidence-event.schema.json",
  "ledger-transaction.schema.json",
  "mandate.schema.json",
  "membership.schema.json",
  "plugin-manifest.schema.json",
  "rail-descriptor.schema.json",
  "settlement-receipt.schema.json",
  "transfer-intent.schema.json",
  "transfer-quote.schema.json"
]);
const failures = [];
const ids = new Set();
const files = (await readdir(schemaDirectory)).filter((file) => file.endsWith(".schema.json")).sort();

for (const requiredFile of requiredFiles) {
  if (!files.includes(requiredFile)) failures.push(`missing schema: ${requiredFile}`);
}

for (const file of files) {
  let schema;
  try {
    schema = JSON.parse(await readFile(join(schemaDirectory, file), "utf8"));
  } catch (error) {
    failures.push(`${file} is not valid JSON: ${error.message}`);
    continue;
  }
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    failures.push(`${file} must use JSON Schema draft 2020-12`);
  }
  if (typeof schema.$id !== "string" || !schema.$id.startsWith("https://schemas.ipo.one/v2/")) {
    failures.push(`${file} has an invalid canonical $id`);
  } else if (ids.has(schema.$id)) {
    failures.push(`${file} duplicates schema id ${schema.$id}`);
  } else {
    ids.add(schema.$id);
  }
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    failures.push(`${file} must be a closed top-level object schema`);
  }
  if (!schema.required?.includes("schemaVersion") || typeof schema.properties?.schemaVersion?.const !== "string") {
    failures.push(`${file} must require a constant schemaVersion`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Schema checks passed (${files.length} contracts).`);
