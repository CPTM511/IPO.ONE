import { pathToFileURL } from "node:url";
import {
  authorizeAgentCreditHyperliquidRegistration
} from "./start-hypercore-002d-handoff.mjs";

export async function authorizeAgentCreditHyperliquidRegistrationCli({
  requestHash = process.env.IPO_ONE_HYPERLIQUID_TESTNET_REGISTRATION_REQUEST_HASH,
  runId = process.env.IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID,
  candidateCommit = process.env.IPO_ONE_AGENT_CREDIT_CANDIDATE_COMMIT,
  env = process.env,
  write = console.log
} = {}) {
  const result = await authorizeAgentCreditHyperliquidRegistration({
    requestHash,
    runId,
    candidateCommit,
    env
  });
  write(`AGENT_CREDIT_HYPERLIQUID_REGISTRATION_AUTHORIZED ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  authorizeAgentCreditHyperliquidRegistrationCli().catch((error) => {
    console.error(`AGENT_CREDIT_HYPERLIQUID_REGISTRATION_BLOCKED ${error.message}`);
    process.exitCode = 1;
  });
}
