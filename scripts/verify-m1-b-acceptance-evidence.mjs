import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  MAX_LAUNCH_JSON_BYTES,
  parseCanonicalJson
} from "../packages/release-governance/src/index.js";
import {
  M1BAcceptanceEvidenceError,
  verifyM1BAcceptanceEvidence,
  verifyM1BHostedCapabilityDocument,
  verifyM1BHostedReadinessDocument
} from "../packages/release-governance/src/m1-b-acceptance-evidence.js";
import {
  verifyM1BArtifactFiles,
  verifyM1BCurrentGitSource
} from "./m1-b-acceptance-evidence-files.mjs";

async function readBoundedUtf8(path, label) {
  let handle;
  try {
    handle = await open(resolve(path), "r");
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_LAUNCH_JSON_BYTES) {
      throw new Error(`${label} must be a regular file no larger than 128 KiB.`);
    }
    const bytes = Buffer.alloc(stats.size);
    await handle.read(bytes, 0, bytes.length, 0);
    return bytes.toString("utf8");
  } finally {
    await handle?.close();
  }
}

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-m1-b-acceptance-evidence.mjs \\",
    "    --evidence <private-evidence.local.json> \\",
    "    --evidence-root <repository-root> \\",
    "    --expected-sha <40-character-git-sha>",
    "",
    "The verifier performs read-only HTTPS release-identity checks for every hosted role origin."
  ].join("\n");
}

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: false,
    strict: true,
    options: {
      evidence: { type: "string" },
      "evidence-root": { type: "string" },
      "expected-sha": { type: "string" }
    }
  }));
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(2);
}

if (!values.evidence || !values["evidence-root"] || !values["expected-sha"]) {
  console.error(usage());
  process.exit(2);
}

try {
  const evidence = parseCanonicalJson(
    await readBoundedUtf8(values.evidence, "M1-B acceptance Evidence"),
    "M1-B acceptance Evidence"
  );
  const expectedCommitSha = values["expected-sha"];
  const result = verifyM1BAcceptanceEvidence(evidence, {
    expectedCommitSha
  });
  verifyM1BCurrentGitSource(evidence, expectedCommitSha, {
    root: resolve(fileURLToPath(new URL("..", import.meta.url)))
  });
  await verifyM1BArtifactFiles(evidence.artifacts, {
    evidenceRoot: values["evidence-root"]
  });
  const hostedChecks = [];
  for (const surface of evidence.runtime.hosted.surfaces) {
    const [capabilityResponse, readinessResponse] = await Promise.all([
      fetch(surface.capabilityUrl, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      }),
      fetch(surface.readinessUrl, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      })
    ]);
    if (!capabilityResponse.ok || !readinessResponse.ok) {
      throw new M1BAcceptanceEvidenceError([
        `${surface.deploymentRole} hosted release identity returned ` +
          `${capabilityResponse.status}/${readinessResponse.status}.`
      ]);
    }
    const [capability, readiness] = await Promise.all([
      capabilityResponse.json(),
      readinessResponse.json()
    ]);
    verifyM1BHostedCapabilityDocument(capability, { expectedCommitSha });
    verifyM1BHostedReadinessDocument(readiness, { expectedCommitSha });
    hostedChecks.push({
      deploymentRole: surface.deploymentRole,
      origin: surface.origin,
      releaseId: expectedCommitSha,
      status: "verified"
    });
  }
  console.log(JSON.stringify({
    ...result,
    hostedChecks
  }));
} catch (error) {
  if (error instanceof M1BAcceptanceEvidenceError) {
    console.error(error.message);
    for (const issue of error.issues.slice(0, 100)) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.error(error.message);
  process.exit(1);
}
