import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createAgentCreditHyperliquidHandoffProfile,
  createHypercore002dHandoffHost
} from "./start-hypercore-002d-handoff.mjs";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (index === process.argv.length - 1 || process.argv.indexOf(name, index + 1) >= 0) {
    throw new Error(`invalid ${name}`);
  }
  return process.argv[index + 1];
}

export async function startAgentCreditHyperliquidL3Handoff({
  runId,
  candidateCommit,
  signerKeyPath,
  port = 4194,
  registrationResume = null
}) {
  const profile = createAgentCreditHyperliquidHandoffProfile({
    runId,
    candidateCommit
  });
  return createHypercore002dHandoffHost({
    port,
    signerKeyPath,
    registrationResume,
    profile
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const signerKeyPath = resolve(argument("--signer-key", ""));
  const runId = argument("--run-id");
  const candidateCommit = argument("--candidate-commit");
  const port = Number(argument("--port", "4194"));
  const resumeNonce = argument("--registration-nonce");
  const resumeHash = argument("--registration-request-hash");
  const registrationResume = resumeNonce === null && resumeHash === null
    ? null
    : { nonce: Number(resumeNonce), signingRequestHash: resumeHash ?? "" };
  const host = await startAgentCreditHyperliquidL3Handoff({
    runId,
    candidateCommit,
    signerKeyPath,
    port,
    registrationResume
  });
  process.stdout.write(
    `AGENT-CREDIT-EXEC-001 handoff ready at ${host.url}\n`
  );
}
