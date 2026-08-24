import { pathToFileURL } from "node:url";
import { deployM2A008PoolRecovery } from "./m2a-008-secured-pool-runner.mjs";

const PRIVATE_DIRECTORY = "/private/tmp/ipo-one-m2a-008";

function inputFromEnvironment(env = process.env) {
  if (
    env.IPO_ONE_M2A008_MODE !== "pool-recovery" ||
    env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY !== "M2A-008" ||
    !env.IPO_ONE_M2A008_DECISION_FILE?.startsWith(`${PRIVATE_DIRECTORY}/`) ||
    !env.IPO_ONE_M2A008_LAUNCH_EVIDENCE_FILE ||
    !/^[a-f0-9]{40}$/.test(env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA ?? "") ||
    env.CI === "true" ||
    env.GITHUB_ACTIONS === "true"
  ) {
    throw new Error(
      "invalid_m2a008_pool_recovery_environment: closed local single-Pool recovery environment is required"
    );
  }
  return Object.freeze({
    decisionFile: env.IPO_ONE_M2A008_DECISION_FILE,
    launchEvidenceFile: env.IPO_ONE_M2A008_LAUNCH_EVIDENCE_FILE,
    expectedCommitSha: env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await deployM2A008PoolRecovery(inputFromEnvironment());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
