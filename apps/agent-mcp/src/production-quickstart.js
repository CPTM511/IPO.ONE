import { readFile } from "node:fs/promises";
import { ProductionAgentClient } from "../../../packages/sdk/src/production-agent-client.js";

async function boundedFile(path, name, maximum = 64 * 1024) {
  if (typeof path !== "string" || !path.startsWith("/")) throw new Error(`${name} file is required`);
  const bytes = await readFile(path);
  if (bytes.length < 1 || bytes.length > maximum || bytes.includes(0)) throw new Error(`${name} file is invalid`);
  return bytes.toString("utf8").trim();
}

try {
  const requestFile = process.argv[2];
  if (typeof requestFile !== "string") throw new Error("usage: pnpm agent:production:call -- /absolute/request.json");
  const [source, accessToken, cert, key, ca] = await Promise.all([
    boundedFile(requestFile, "Tenant request"),
    boundedFile(process.env.IPO_ONE_AGENT_ACCESS_TOKEN_FILE, "Agent access token", 16_384),
    boundedFile(process.env.IPO_ONE_AGENT_MTLS_CERT_FILE, "Agent mTLS certificate"),
    boundedFile(process.env.IPO_ONE_AGENT_MTLS_KEY_FILE, "Agent mTLS private key"),
    process.env.IPO_ONE_AGENT_MTLS_CA_FILE === undefined
      ? undefined
      : boundedFile(process.env.IPO_ONE_AGENT_MTLS_CA_FILE, "Agent trusted CA")
  ]);
  const request = JSON.parse(source);
  const client = new ProductionAgentClient({
    baseUrl: process.env.IPO_ONE_AGENT_API_ORIGIN,
    accessTokenProvider: async () => accessToken,
    cert,
    key,
    ...(ca === undefined ? {} : { ca })
  });
  process.stdout.write(`${JSON.stringify(await client.execute(request))}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "production_agent_call_failed",
    code: error?.code ?? "agent_call_failed",
    message: error?.message ?? "Production Agent call failed",
    requestId: error?.requestId
  })}\n`);
  process.exitCode = 1;
}
