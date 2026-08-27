import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { hashId } from "../../packages/domain/src/index.js";
import {
  M2B_HYPERLIQUID_LAUNCH_PROFILE
} from "../../modules/hypercore-venue-adapter/src/index.js";

const CURRENT_POOL_PROFILE = "live_testnet_secured_pool";

function fail(message) {
  throw Object.assign(new Error(message), { code: "invalid_m2b_002_prewrite" });
}

export function inspectM2B002PrewritePolicy(launchPolicy, {
  inspectedAt = new Date(),
  releaseCommitSha = null
} = {}) {
  if (!launchPolicy || typeof launchPolicy !== "object" || Array.isArray(launchPolicy) ||
    launchPolicy.schemaVersion !== "ipo.one.launch-policy/v1" ||
    typeof launchPolicy.policyVersion !== "string" ||
    !launchPolicy.profiles || typeof launchPolicy.profiles !== "object") {
    fail("launch policy does not satisfy the closed M2B-002 inspection contract");
  }
  if (!(inspectedAt instanceof Date) || !Number.isFinite(inspectedAt.getTime())) {
    fail("inspectedAt must be a trusted Date");
  }
  if (releaseCommitSha !== null && !/^[a-f0-9]{40}$/.test(releaseCommitSha)) {
    fail("releaseCommitSha must be an exact commit or null");
  }
  const exactProfile = launchPolicy.profiles[M2B_HYPERLIQUID_LAUNCH_PROFILE] ?? null;
  const poolProfile = launchPolicy.profiles[CURRENT_POOL_PROFILE] ?? null;
  const blockers = [];
  if (exactProfile === null) blockers.push("distinct_agent_venue_launch_profile_missing");
  if (poolProfile?.capabilities?.agentVenueExecutionEnabled !== true) {
    blockers.push("secured_pool_profile_agent_venue_execution_disabled");
  }
  blockers.push(
    "durable_exact_composition_not_supplied",
    "fresh_reconciled_hyperliquid_account_observation_missing",
    "fresh_non_exporting_signer_handoff_missing",
    "exact_one_use_founder_run_approval_missing"
  );
  const policyInspectionHash = hashId("m2b_002_launch_policy_inspection", {
    policyVersion: launchPolicy.policyVersion,
    requestedProfileId: M2B_HYPERLIQUID_LAUNCH_PROFILE,
    requestedProfilePresent: exactProfile !== null,
    currentPoolProfileId: CURRENT_POOL_PROFILE,
    currentPoolAgentVenueExecutionEnabled:
      poolProfile?.capabilities?.agentVenueExecutionEnabled ?? null
  });
  return Object.freeze({
    status: "BLOCKED_PREWRITE",
    policyVersion: launchPolicy.policyVersion,
    policyInspectionHash,
    requestedProfileId: M2B_HYPERLIQUID_LAUNCH_PROFILE,
    requestedProfilePresent: exactProfile !== null,
    currentPoolProfileId: CURRENT_POOL_PROFILE,
    currentPoolAgentVenueExecutionEnabled:
      poolProfile?.capabilities?.agentVenueExecutionEnabled ?? null,
    blockers: Object.freeze(blockers),
    releaseCommitSha,
    inspectedAt: inspectedAt.toISOString(),
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    exchangeRequestCreated: false,
    profileMutated: false,
    submissionAuthorizedByReport: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "m2b_002_prewrite_stop_report.v1"
  });
}

async function main() {
  if (process.argv.length !== 2) fail("M2B-002 pre-write runner accepts no arguments");
  const policyPath = resolve(process.cwd(), "deploy/launch-policy.v1.json");
  const launchPolicy = JSON.parse(await readFile(policyPath, "utf8"));
  const report = inspectM2B002PrewritePolicy(launchPolicy);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
