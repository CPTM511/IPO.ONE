import { pathToFileURL } from "node:url";
import {
  AGENT_CREDIT_HYPERLIQUID_L3_PROFILE,
  evaluateAgentCreditHyperliquidL3Gate
} from "./agent-credit-hyperliquid-l3-gate.mjs";

export function runAgentCreditHyperliquidL3Cli({
  operation,
  env = process.env,
  write = console.log
}) {
  const result = evaluateAgentCreditHyperliquidL3Gate({ operation, env });
  if (!result.approved) {
    write(`AGENT_CREDIT_HYPERLIQUID_L3_BLOCKED ${JSON.stringify(result)}`);
    return { exitCode: 1, result };
  }
  if (operation === "preflight") {
    const readiness = {
      ...result,
      status: "READY_FOR_L3_APPROVAL",
      nextAuthority: "one exact Founder approval bound to a newly provisioned signer, account, and run",
      externalRequestPerformed: false
    };
    write(`AGENT_CREDIT_HYPERLIQUID_L3_PREFLIGHT ${JSON.stringify(readiness)}`);
    return { exitCode: 0, result: readiness };
  }

  const handoff = {
    ...result,
    status: "BLOCKED",
    blocker: "reviewed_action_artifact_and_isolated_signer_handoff_required",
    message:
      "The exact run approval passed, but this command will not synthesize or reuse a signer/action artifact. Complete the reviewed HyperCore handoff before any venue request.",
    externalRequestPerformed: false
  };
  write(`AGENT_CREDIT_HYPERLIQUID_L3_HANDOFF_REQUIRED ${JSON.stringify(handoff)}`);
  return { exitCode: 1, result: handoff };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.argv[2] ?? "preflight";
  try {
    const output = runAgentCreditHyperliquidL3Cli({ operation });
    process.exitCode = output.exitCode;
  } catch (error) {
    console.error(`AGENT_CREDIT_HYPERLIQUID_L3_ERROR ${error.message}`);
    process.exitCode = 1;
  }
}

export { AGENT_CREDIT_HYPERLIQUID_L3_PROFILE };
