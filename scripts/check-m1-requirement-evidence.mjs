import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifestPath = "product/traceability/ipo-one.m1-requirement-evidence.v1.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const constitution = await readFile(manifest.constitution.path, "utf8");

const allowedClassifications = [
  "NOT_IMPLEMENTED",
  "WIRED_MOCK",
  "IMPLEMENTED_UNVERIFIED",
  "VERIFIED_SANDBOX",
  "VERIFIED_REAL",
  "PRODUCTION_READY"
];
const runtimeEvidenceKinds = new Set([
  "AUTHENTICATED_DURABLE_RUNTIME",
  "DATABASE_MIGRATION_RUNTIME",
  "LOCAL_STACK_RUNTIME",
  "AUTHENTICATED_GOLDEN_FLOW",
  "REAL_BROWSER_RUNTIME"
]);

assert.equal(manifest.schemaVersion, "ipo_one_m1_requirement_evidence.v1");
assert.deepEqual(manifest.classificationVocabulary, allowedClassifications);
assert.equal(manifest.constitution.stableRequirementCount, 45);
assert.equal(
  createHash("sha256").update(constitution).digest("hex"),
  manifest.constitution.sha256,
  "Product Constitution hash drifted"
);

const constitutionRequirementIds = [...constitution.matchAll(/^\| (REQ-[A-Z0-9-]+) \|/gm)]
  .map((match) => match[1]);
assert.equal(constitutionRequirementIds.length, 45);
assert.equal(new Set(constitutionRequirementIds).size, 45);

const evidenceById = new Map();
for (const evidence of manifest.evidenceCatalog) {
  assert.equal(evidenceById.has(evidence.evidenceId), false, `duplicate evidence ${evidence.evidenceId}`);
  assert.match(evidence.sha256, /^[0-9a-f]{64}$/);
  const artifact = await readFile(evidence.artifact);
  assert.equal(
    createHash("sha256").update(artifact).digest("hex"),
    evidence.sha256,
    `${evidence.evidenceId} artifact hash drifted`
  );
  assert.ok(["PASS", "FAIL"].includes(evidence.result));
  evidenceById.set(evidence.evidenceId, evidence);
}

assert.deepEqual(
  manifest.requirements.map(({ requirementId }) => requirementId),
  constitutionRequirementIds,
  "requirement registry must match the Constitution exactly and in order"
);

for (const requirement of manifest.requirements) {
  assert.ok(allowedClassifications.includes(requirement.classification));
  assert.ok(["REAL", "SANDBOX", "MOCK", "ABSENT"].includes(requirement.implementationMode));
  assert.equal(new Set(requirement.implementationPaths).size, requirement.implementationPaths.length);
  for (const path of requirement.implementationPaths) await readFile(path);
  for (const binding of requirement.evidenceBindings) {
    assert.ok(binding.assertion.length >= 20, `${requirement.requirementId} has an unbounded evidence assertion`);
    assert.ok(evidenceById.has(binding.evidenceId), `${requirement.requirementId} references unknown evidence`);
  }

  if (requirement.classification === "VERIFIED_SANDBOX") {
    assert.ok(["REAL", "SANDBOX"].includes(requirement.implementationMode));
    assert.ok(requirement.implementationPaths.length > 0);
    assert.ok(
      requirement.evidenceBindings.some((binding) => {
        const evidence = evidenceById.get(binding.evidenceId);
        return evidence.result === "PASS" && runtimeEvidenceKinds.has(evidence.kind);
      }),
      `${requirement.requirementId} lacks passing executable runtime evidence`
    );
  }
  if (requirement.classification === "IMPLEMENTED_UNVERIFIED") {
    assert.ok(requirement.implementationPaths.length > 0);
    assert.ok(requirement.blockers.length > 0);
  }
  if (requirement.classification === "NOT_IMPLEMENTED") {
    assert.equal(requirement.implementationMode, "ABSENT");
    assert.equal(requirement.implementationPaths.length, 0);
    assert.ok(requirement.blockers.length > 0);
  }
  if (requirement.classification === "WIRED_MOCK") {
    assert.equal(requirement.implementationMode, "MOCK");
  }
}

const byId = new Map(manifest.requirements.map((entry) => [entry.requirementId, entry]));
assert.equal(byId.get("REQ-CREDIT-009").classification, "IMPLEMENTED_UNVERIFIED");
assert.equal(byId.get("REQ-EXEC-003").classification, "VERIFIED_SANDBOX");
assert.equal(byId.get("REQ-PAY-002").classification, "IMPLEMENTED_UNVERIFIED");
assert.equal(byId.get("REQ-UX-001").classification, "IMPLEMENTED_UNVERIFIED");
assert.equal(byId.get("REQ-UX-002").classification, "VERIFIED_SANDBOX");
assert.equal(byId.get("REQ-UX-005").classification, "IMPLEMENTED_UNVERIFIED");
assert.equal(byId.get("REQ-PILOT-001").classification, "NOT_IMPLEMENTED");
assert.equal(byId.get("REQ-TRADE-005").classification, "IMPLEMENTED_UNVERIFIED");
assert.equal(manifest.explicitExclusions.strategyVaultApproved, false);
assert.equal(manifest.explicitExclusions.feeRuntimeFrozen, true);
assert.equal(manifest.requirements.some(({ classification }) => classification === "VERIFIED_REAL"), false);
assert.equal(manifest.requirements.some(({ classification }) => classification === "PRODUCTION_READY"), false);

const counts = Object.fromEntries(allowedClassifications.map((value) => [value, 0]));
for (const requirement of manifest.requirements) counts[requirement.classification] += 1;

console.log("M1 requirement evidence gate passed for the exact 45 Constitution IDs.");
console.log(JSON.stringify(counts));
console.log("No requirement is VERIFIED_REAL or PRODUCTION_READY.");
