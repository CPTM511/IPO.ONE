import { pathToFileURL } from "node:url";
import { reconcileM2A008PoolRecovery } from "./m2a-008-secured-pool-runner.mjs";

function inputFromEnvironment(env = process.env) {
  if (
    !env.IPO_ONE_M2A008_DECISION_FILE?.startsWith("/private/tmp/ipo-one-m2a-008/") ||
    !env.IPO_ONE_M2A008_LAUNCH_EVIDENCE_FILE ||
    !/^[a-f0-9]{40}$/.test(env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA ?? "") ||
    !/^0x[0-9a-f]{64}$/.test(env.IPO_ONE_M2A008_POOL_TRANSACTION_HASH ?? "")
  ) {
    throw new Error(
      "invalid_m2a008_pool_reconciliation_environment: exact read-only Pool recovery input is required"
    );
  }
  return Object.freeze({
    decisionFile: env.IPO_ONE_M2A008_DECISION_FILE,
    launchEvidenceFile: env.IPO_ONE_M2A008_LAUNCH_EVIDENCE_FILE,
    expectedCommitSha: env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA,
    poolTransactionHash: env.IPO_ONE_M2A008_POOL_TRANSACTION_HASH
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await reconcileM2A008PoolRecovery(inputFromEnvironment());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
