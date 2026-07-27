import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireFromApiContract = createRequire(
  new URL("../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const root = process.cwd();
const packagePath =
  "docs/codex/audits/REALVALUE-001/decision-package.v1.json";
const schemaPath =
  "schemas/v2/real-value-pilot-decision-package.schema.json";
const releaseMatrixPath =
  "docs/codex/audits/RELEASE-001/acceptance-matrix.md";

async function read(path) {
  return readFile(resolve(root, path));
}

const [packageBytes, schemaBytes, releaseMatrixBytes] = await Promise.all([
  read(packagePath),
  read(schemaPath),
  read(releaseMatrixPath)
]);
const decisionPackage = JSON.parse(packageBytes);
const schema = JSON.parse(schemaBytes);
const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
})
  .addFormat("date-time", {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  })
  .compile(schema);

assert.equal(
  validate(decisionPackage),
  true,
  JSON.stringify(validate.errors, null, 2)
);

const expectedDecisionIds = Array.from(
  { length: 16 },
  (_, index) => `RV-P0-${String(index + 1).padStart(2, "0")}`
);
assert.deepEqual(
  decisionPackage.decisions.map(({ decisionId }) => decisionId),
  expectedDecisionIds,
  "REALVALUE-001 must contain every ordered P0 decision exactly once"
);
assert.equal(
  new Set(decisionPackage.decisions.map(({ domain }) => domain)).size,
  16,
  "REALVALUE-001 decision domains must be unique"
);

for (const decision of decisionPackage.decisions) {
  assert.equal(decision.decisionStatus, "REJECT_LOCKED");
  assert.equal(decision.approvalRecord, null);
  assert.notEqual(decision.evidenceStatus, "VERIFIED");
  for (const approver of decision.requiredApprovers) {
    assert.notEqual(
      approver.approvalStatus,
      "APPROVE",
      `${decision.decisionId} must not contain a Codex-created approval`
    );
    assert.equal(
      approver.assignmentStatus === "ASSIGNED",
      approver.assignee !== null,
      `${decision.decisionId} approver assignment must be truthful`
    );
  }
}

assert.deepEqual(decisionPackage.safetyBoundary, {
  decisionPackageOnly: true,
  codexApprovalAuthority: "NONE",
  launchPolicyRevisionAuthorized: false,
  realFundsAuthorized: false,
  mainnetAuthorized: false,
  productionSignerAuthorized: false,
  exchangeWriteAuthorized: false,
  deploymentAuthorized: false,
  withdrawalsOrTransfersAuthorized: false,
  capitalMovementAuthorized: false
});
assert.equal(decisionPackage.overallGate.launchDecision, "REJECT_LOCKED");
assert.equal(decisionPackage.overallGate.launchAllowed, false);
assert.equal(decisionPackage.overallGate.unresolvedP0Count, 16);
assert.equal(
  decisionPackage.sourceRelease.acceptanceMatrixSha256,
  createHash("sha256").update(releaseMatrixBytes).digest("hex"),
  "RELEASE-001 acceptance matrix hash drifted"
);

console.log(
  "REALVALUE-001 decision package is complete for human review; 16/16 P0 decisions and launch remain REJECT_LOCKED."
);
