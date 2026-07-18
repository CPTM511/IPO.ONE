import { readFile } from "node:fs/promises";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { AgentTenantCommandClient } from "../../../modules/tenant-command-gateway/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import { loadOrCreatePrivatePilotDatabaseSecret } from "./private-pilot-database.js";
import {
  derivePrivatePilotAgentAccount,
  preparePrivatePilotAgentProof
} from "./private-pilot-agent-account.js";
import { createPrivatePilotGateway } from "./private-pilot-runtime.js";

const cliArguments = process.argv.slice(2);
const challengePath = cliArguments[0] === "--" ? cliArguments[1] : cliArguments[0];
const databaseUrl = process.env.DATABASE_URL;

if (!challengePath || cliArguments.length > (cliArguments[0] === "--" ? 2 : 1)) {
  process.stderr.write("Usage: pnpm run pilot:agent:prove -- <agent-account-challenge.json>\n");
  process.exit(1);
}

let runtime;
try {
  const raw = await readFile(challengePath);
  if (raw.length < 2 || raw.length > 64 * 1024) {
    throw new Error("agent_account_challenge_size_rejected");
  }
  const challenge = parseStrictJson(raw.toString("utf8"), {
    maximumBytes: 64 * 1024,
    maximumDepth: 12,
    maximumKeys: 128
  });
  const secret = await loadOrCreatePrivatePilotDatabaseSecret();
  runtime = await createPrivatePilotGateway(databaseUrl);
  const account = derivePrivatePilotAgentAccount(secret, {
    tenantId: runtime.authentication.profile.tenantId
  });
  const proof = preparePrivatePilotAgentProof(challenge, account);
  const signature = await account.signTypedData(proof.typedData);
  const agentIdentity = runtime.authentication.identities.agent;
  const client = new AgentTenantCommandClient({
    gateway: runtime.gateway,
    authenticationContextProvider: async () => agentIdentity.createContext(),
    networkContextProvider: async () => createTrustedNetworkContext({
      networkRefHash: hashId("private_pilot_network", "local_agent_account_proof"),
      source: "local_test"
    })
  });
  const result = await client.submitAccountProof({
    subjectId: proof.subjectId,
    payload: {
      challengeId: proof.challengeId,
      accountId: proof.accountId,
      signature
    },
    idempotencyKey: `private-pilot-agent-proof-${proof.challengeId}`,
    requestId: `request-${proof.challengeId}`,
    correlationId: `correlation-${proof.challengeId}`
  });
  const binding = result.response.accountBinding;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "private_pilot_agent_account_proof_receipt.v1",
    subjectId: result.response.subjectId,
    subjectStatus: result.response.status,
    chainId: binding.chainId,
    accountHash: binding.accountHash,
    proofHash: binding.proofHash,
    challengeConsumed: result.response.challengeConsumed,
    privateKeyIncluded: false,
    signatureIncluded: false,
    productionAuthority: false,
    fundsAuthority: false
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Agent account proof failed: ${error?.code ?? error?.message ?? "proof_failed"}\n`);
  process.exitCode = 1;
} finally {
  await runtime?.pool.end();
}
