import { open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  provisionProductionGoldenFlowAgent,
  revokeProductionGoldenFlowAgentCredential
} from "../apps/private-pilot/src/production-bootstrap.js";

const [action, ...args] = process.argv.slice(2);

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length < 1 || /[\0\r\n]/.test(value)) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function boundedFile(path, name, maximum = 64 * 1024) {
  if (!isAbsolute(path ?? "")) throw new Error(`${name} path must be absolute`);
  const exact = await realpath(path);
  const metadata = await stat(exact);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximum) {
    throw new Error(`${name} file is invalid`);
  }
  return readFile(exact, "utf8");
}

async function referenceHashKey() {
  const value = (await boundedFile(
    required("IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE"),
    "authentication reference hash key",
    256
  )).trim();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 32 || bytes.length > 64 || bytes.toString("base64url") !== value) {
    throw new Error("authentication reference hash key is invalid");
  }
  return bytes;
}

async function writeExclusiveJson(path, payload) {
  if (!isAbsolute(path ?? "")) throw new Error("output path must be absolute");
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

function commonInput() {
  return {
    adminConnectionString: required("IPO_ONE_ADMIN_DATABASE_URL"),
    tenantId: required("IPO_ONE_TENANT_ID"),
    actorId: required("IPO_ONE_GOLDEN_FLOW_AGENT_ACTOR_ID"),
    performedByActorId: required("IPO_ONE_SYSTEM_ACTOR_ID")
  };
}

try {
  if (action === "provision" && args.length === 2) {
    const [publicSpecPath, outputPath] = args;
    const publicSpec = JSON.parse(await boundedFile(publicSpecPath, "Agent public key spec"));
    if (
      publicSpec?.schemaVersion !== "vercel_golden_flow_agent_public_key.v1" ||
      publicSpec.privateKeyIncluded !== false ||
      typeof publicSpec.senderThumbprint !== "string" ||
      publicSpec.publicJwk?.kty !== "EC" ||
      publicSpec.publicJwk?.crv !== "P-256" ||
      Object.hasOwn(publicSpec.publicJwk, "d")
    ) {
      throw new Error("Agent public key spec is invalid");
    }
    const result = await provisionProductionGoldenFlowAgent({
      ...commonInput(),
      referenceHashKey: await referenceHashKey(),
      controllerActorId: required("IPO_ONE_GOLDEN_FLOW_CONTROLLER_ACTOR_ID"),
      clientId: required("IPO_ONE_GOLDEN_FLOW_AGENT_CLIENT_ID"),
      issuer: required("IPO_ONE_GOLDEN_FLOW_AGENT_ISSUER"),
      externalSubject: required("IPO_ONE_GOLDEN_FLOW_AGENT_EXTERNAL_SUBJECT"),
      invitationId: required("IPO_ONE_GOLDEN_FLOW_AGENT_INVITATION_ID"),
      senderThumbprint: publicSpec.senderThumbprint,
      expiresAt: required("IPO_ONE_GOLDEN_FLOW_AGENT_EXPIRES_AT")
    });
    await writeExclusiveJson(outputPath, {
      ...result.runnerBootstrap,
      workloadPublicJwk: publicSpec.publicJwk,
      privateKeyIncluded: false,
      productionFundsAuthority: false
    });
    process.stdout.write(`${JSON.stringify({
      event: "golden_flow_agent_provisioned",
      actorId: result.actorId,
      replayed: result.replayed,
      privateKeyIncluded: false,
      outputPath
    })}\n`);
  } else if (action === "revoke" && args.length === 0) {
    const result = await revokeProductionGoldenFlowAgentCredential(commonInput());
    process.stdout.write(`${JSON.stringify({
      event: "golden_flow_agent_revoked",
      actorId: result.actorId,
      status: result.status,
      replayed: result.replayed,
      privateKeyIncluded: false
    })}\n`);
  } else {
    throw new Error(
      "usage: manage-production-golden-flow-agent.mjs provision <absolute-public-spec.json> " +
      "<absolute-bootstrap-output.json> | revoke"
    );
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "golden_flow_agent_management_failed",
    code: error?.code ?? "golden_flow_agent_management_failed",
    message: error?.message ?? "Golden Flow Agent management failed"
  })}\n`);
  process.exitCode = 1;
}
