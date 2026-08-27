import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { hashId } from "../../packages/domain/src/index.js";

function fail(message) {
  throw Object.assign(new Error(message), { code: "invalid_m2b_003_recovery_prewrite" });
}

export function inspectM2B003RecoveryPrewrite(launchPolicy, {
  inspectedAt = new Date(),
  releaseCommitSha = null
} = {}) {
  if (!launchPolicy || typeof launchPolicy !== "object" || Array.isArray(launchPolicy) ||
    launchPolicy.schemaVersion !== "ipo.one.launch-policy/v1" ||
    typeof launchPolicy.policyVersion !== "string") {
    fail("launch policy does not satisfy the closed M2B-003 inspection contract");
  }
  if (!(inspectedAt instanceof Date) || !Number.isFinite(inspectedAt.getTime())) {
    fail("inspectedAt must be a trusted Date");
  }
  if (releaseCommitSha !== null && !/^[a-f0-9]{40}$/.test(releaseCommitSha)) {
    fail("releaseCommitSha must be an exact commit or null");
  }
  const blockers = Object.freeze([
    "fresh_dual_risk_snapshot_missing",
    "durable_recovery_incident_missing",
    "external_protective_run_approval_missing"
  ]);
  const inspectionHash = hashId("m2b_003_recovery_prewrite_inspection", {
    policyVersion: launchPolicy.policyVersion,
    blockers
  });
  return Object.freeze({
    status: "BLOCKED_RECOVERY_PREWRITE",
    policyVersion: launchPolicy.policyVersion,
    inspectionHash,
    combinedRiskState: "UNKNOWN",
    currentStage: "FREEZE_NEW_RISK",
    stageOrder: Object.freeze([
      "FREEZE_NEW_RISK", "CANCEL", "REDUCE_OR_FLATTEN", "RECONCILE",
      "REPAY_OR_LIQUIDATE", "SETTLEMENT_REVIEW"
    ]),
    blockers,
    releaseCommitSha,
    inspectedAt: inspectedAt.toISOString(),
    launchPolicyMutated: false,
    externalWriteAuthorized: false,
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    protectiveAuthorityCanExpandRisk: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "m2b_003_recovery_prewrite_stop_report.v1"
  });
}

async function main() {
  if (process.argv.length !== 2) fail("M2B-003 recovery pre-write runner accepts no arguments");
  const policyPath = resolve(process.cwd(), "deploy/launch-policy.v1.json");
  const launchPolicy = JSON.parse(await readFile(policyPath, "utf8"));
  const report = inspectM2B003RecoveryPrewrite(launchPolicy);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
