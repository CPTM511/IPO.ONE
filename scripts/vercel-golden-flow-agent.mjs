import { randomUUID } from "node:crypto";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  mkdir,
  open,
  readFile,
  realpath,
  stat
} from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import {
  createVercelGoldenFlowAgentClient,
  runVercelAgentApplication,
  runVercelAgentRecovery,
  runVercelAgentRuntime,
  submitVercelAgentAccountProof
} from "../apps/private-pilot/src/vercel-golden-flow-agent.js";

const [action, ...paths] = process.argv.slice(2);

async function boundedFile(path, name, maximum = 1024 * 1024) {
  if (!isAbsolute(path ?? "")) throw new Error(`${name} path must be absolute`);
  const exact = await realpath(path);
  const metadata = await stat(exact);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximum) {
    throw new Error(`${name} file is invalid`);
  }
  return readFile(exact, "utf8");
}

async function jsonFile(path, name) {
  return JSON.parse(await boundedFile(path, name));
}

async function writeExclusiveJson(path, payload) {
  if (!isAbsolute(path ?? "")) throw new Error("output path must be absolute");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

function usage() {
  throw new Error(
    "usage: vercel-golden-flow-agent.mjs provision-workload <absolute-private-jwk-file> <absolute-public-spec-file> | " +
    "provision-account <absolute-key-file> | " +
    "prove <challenge.json> <bootstrap.json> <workload-private.jwk.json> <account-key-file> [absolute-output.json] | " +
    "application <handoff.json> <bootstrap.json> <workload-private.jwk.json> [absolute-output.json] | " +
    "runtime <handoff.json> <offer-receipt.json> <bootstrap.json> <workload-private.jwk.json> [absolute-output.json] | " +
    "recovery <handoff.json> <recovery-input.json> <bootstrap.json> <workload-private.jwk.json> [absolute-output.json]"
  );
}

try {
  if (action === "provision-workload" && paths.length === 2) {
    const [privateDestination, publicDestination] = paths;
    if (!isAbsolute(privateDestination) || !isAbsolute(publicDestination)) usage();
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const kid = `golden-flow-${randomUUID()}`;
    const [privateMaterial, publicMaterial] = await Promise.all([
      exportJWK(privateKey),
      exportJWK(publicKey)
    ]);
    const publicJwk = {
      ...publicMaterial,
      alg: "ES256",
      use: "sig",
      key_ops: ["verify"],
      kid
    };
    const workloadPrivateJwk = {
      ...privateMaterial,
      alg: "ES256",
      use: "sig",
      key_ops: ["sign"],
      kid
    };
    const senderThumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
    await writeExclusiveJson(privateDestination, workloadPrivateJwk);
    await writeExclusiveJson(publicDestination, {
      schemaVersion: "vercel_golden_flow_agent_public_key.v1",
      publicJwk,
      senderThumbprint,
      privateKeyIncluded: false,
      browserStorageAllowed: false,
      vercelPrivateKeyAllowed: false
    });
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "vercel_golden_flow_agent_workload_key.v1",
      kid,
      senderThumbprint,
      privateKeyIncluded: false,
      privateKeyMode: "owner_only_0600"
    })}\n`);
  } else if (action === "provision-account" && paths.length === 1) {
    const destination = paths[0];
    if (!isAbsolute(destination)) usage();
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const handle = await open(destination, "wx", 0o600);
    const privateKey = generatePrivateKey();
    try {
      await handle.writeFile(`${privateKey}\n`, "utf8");
    } finally {
      await handle.close();
    }
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "vercel_golden_flow_agent_account_key.v1",
      address: privateKeyToAccount(privateKey).address.toLowerCase(),
      privateKeyIncluded: false,
      transactionAuthority: false
    })}\n`);
  } else {
    const requiredPathCount = action === "application" ? 3 : 4;
    if (
      !["prove", "application", "runtime", "recovery"].includes(action) ||
      ![requiredPathCount, requiredPathCount + 1].includes(paths.length)
    ) usage();
    const outputPath = paths.length === requiredPathCount + 1
      ? paths[requiredPathCount]
      : null;
    const bootstrapPath = action === "prove" ? paths[1] : action === "application" ? paths[1] : paths[2];
    const workloadPath = action === "prove" ? paths[2] : action === "application" ? paths[2] : paths[3];
    const [bootstrap, workloadPrivateJwk] = await Promise.all([
      jsonFile(bootstrapPath, "bootstrap"),
      jsonFile(workloadPath, "workload private JWK")
    ]);
    const client = await createVercelGoldenFlowAgentClient({
      origin: process.env.IPO_ONE_AGENT_API_ORIGIN,
      ...(process.env.IPO_ONE_AGENT_API_AUDIENCE === undefined
        ? {}
        : { audience: process.env.IPO_ONE_AGENT_API_AUDIENCE }),
      bootstrap,
      workloadPrivateJwk
    });
    let result;
    if (action === "prove") {
      result = await submitVercelAgentAccountProof({
        client,
        challenge: await jsonFile(paths[0], "Agent account challenge"),
        accountPrivateKey: (await boundedFile(paths[3], "Agent account key", 256)).trim()
      });
    } else if (action === "application") {
      result = await runVercelAgentApplication({
        client,
        manifest: await jsonFile(paths[0], "Agent application handoff")
      });
    } else if (action === "runtime") {
      result = await runVercelAgentRuntime({
        client,
        manifest: await jsonFile(paths[0], "Agent runtime handoff"),
        offerReceipt: await jsonFile(paths[1], "Agent Offer receipt")
      });
    } else if (action === "recovery") {
      const recoveryInput = await jsonFile(paths[1], "Agent recovery input");
      if (
        recoveryInput?.schemaVersion !== "vercel_golden_flow_agent_recovery_input.v1" ||
        typeof recoveryInput.obligationId !== "string" ||
        (recoveryInput.passportArtifactId !== undefined &&
          typeof recoveryInput.passportArtifactId !== "string")
      ) {
        throw new Error("Agent recovery input is invalid");
      }
      result = await runVercelAgentRecovery({
        client,
        manifest: await jsonFile(paths[0], "Agent runtime handoff"),
        obligationId: recoveryInput.obligationId,
        ...(recoveryInput.passportArtifactId === undefined
          ? {}
          : { passportArtifactId: recoveryInput.passportArtifactId })
      });
    } else {
      usage();
    }
    if (outputPath) {
      await writeExclusiveJson(outputPath, result);
      process.stdout.write(`${JSON.stringify({
        event: "vercel_golden_flow_agent_result_written",
        action,
        outputPath,
        schemaVersion: result.schemaVersion,
        status: result.status ?? "completed"
      })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "vercel_golden_flow_agent_failed",
    code: error?.code ?? "vercel_golden_flow_agent_failed",
    message: error?.message ?? "Vercel Golden Flow Agent failed",
    requestId: error?.requestId
  })}\n`);
  process.exitCode = 1;
}
