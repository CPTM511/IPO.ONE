#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TEAM_ID = "team_f6TQU7mloG5OnQGNmtXwFkOi";
const PROJECT_ID = "prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y";
const CURRENT_DEPLOYMENT_ID = "dpl_GqX1Z5y232pmos2WyZLoxicfu88f";
const CUTOVER_AT = "2026-08-27T04:27:16Z";
const AUTH_PATH = join(
  homedir(),
  "Library/Application Support/com.vercel.cli/auth.json"
);
const VERCEL_BIN = process.env.VERCEL_BIN;

if (!VERCEL_BIN) {
  throw new Error("VERCEL_BIN is required");
}

const { token } = JSON.parse(await readFile(AUTH_PATH, "utf8"));
if (!token) {
  throw new Error("Vercel token is unavailable");
}

async function api(path) {
  const response = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`Vercel API ${response.status} for ${path}`);
  }
  return response.json();
}

function flattenFiles(files, parent = "", result = []) {
  for (const file of files ?? []) {
    const path = `${parent}/${file.name}`;
    result.push({ ...file, path });
    if (file.children) {
      flattenFiles(file.children, path, result);
    }
  }
  return result;
}

async function sourceCommit(deploymentId) {
  const tree = await api(
    `/v6/deployments/${deploymentId}/files?teamId=${TEAM_ID}`
  );
  const manifest = flattenFiles(Array.isArray(tree) ? tree : tree.files).find(
    (file) => file.path === "/src/deployment-artifact-manifest.json"
  );
  if (!manifest) {
    return null;
  }
  const contents = await api(
    `/v8/deployments/${deploymentId}/files/${manifest.uid}?teamId=${TEAM_ID}`
  );
  const decoded = JSON.parse(Buffer.from(contents.data, "base64").toString());
  return decoded.sourceCommit ?? null;
}

async function activity(deploymentId) {
  try {
    const { stdout } = await execFileAsync(
      VERCEL_BIN,
      [
        "logs",
        deploymentId,
        "--scope",
        "cptm-111-s-projects",
        "--since",
        CUTOVER_AT,
        "--limit",
        "20",
        "--json"
      ],
      { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 }
    );
    const rows = stdout
      .trim()
      .split(/\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
    return {
      observable: true,
      requestCount: rows.length,
      firstAt: rows.length
        ? new Date(Math.min(...rows.map((row) => row.timestamp))).toISOString()
        : null,
      lastAt: rows.length
        ? new Date(Math.max(...rows.map((row) => row.timestamp))).toISOString()
        : null,
      domains: [...new Set(rows.map((row) => row.domain).filter(Boolean))],
      statuses: Object.fromEntries(
        [...new Set(rows.map((row) => row.responseStatusCode))]
          .sort()
          .map((status) => [
            status,
            rows.filter((row) => row.responseStatusCode === status).length
          ])
      )
      ,paths: [...new Set(rows.map((row) => row.requestPath).filter(Boolean))],
      observedReleaseIds: [
        ...new Set(
          rows
            .flatMap((row) => [
              row.message,
              ...(row.logs ?? []).map((entry) => entry.message)
            ])
            .filter(Boolean)
            .flatMap((message) =>
              [...message.matchAll(/"releaseId":"([0-9a-f]{40})"/g)].map(
                (match) => match[1]
              )
            )
        )
      ]
    };
  } catch (error) {
    return {
      observable: false,
      requestCount: null,
      error: error.killed ? "timeout" : "log_query_failed"
    };
  }
}

async function repositoryReferences(deploymentId) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["grep", "-n", "-F", deploymentId, "--"],
      { maxBuffer: 1024 * 1024, timeout: 10_000 }
    );
    return stdout
      .trim()
      .split(/\n/)
      .filter(Boolean)
      .map((line) => ({
        file: line.slice(0, line.indexOf(":")),
        line: Number(line.split(":", 2)[1])
      }));
  } catch (error) {
    if (error.code === 1) {
      return [];
    }
    throw error;
  }
}

async function mapLimited(values, limit, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        result[index] = await operation(values[index], index);
      }
    })
  );
  return result;
}

const listing = await api(
  `/v7/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}` +
    "&target=production&state=READY&limit=100"
);
const deployments = listing.deployments ?? [];
const records = await mapLimited(deployments, 6, async (deployment) => {
  const detail = await api(
    `/v13/deployments/${deployment.uid}?teamId=${TEAM_ID}&withGitRepoInfo=true`
  );
  const environmentNames = Array.isArray(detail.env) ? detail.env : [];
  const legacyEnvironmentNames = environmentNames.filter((name) =>
    [
      "IPO_ONE_AUTH_REFERENCE_HASH_KEY",
      "IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF"
    ].includes(name)
  );
  const nextEnvironmentNames = environmentNames.filter((name) =>
    [
      "IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY",
      "IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF"
    ].includes(name)
  );
  const temporaryEnvironmentNames = environmentNames.filter((name) =>
    /(?:AUTHN_008|TEMP|TEMPORARY|JWKS|SIGNER|GOLDEN_FLOW|SCHEDULED_ACTION)/i.test(
      name
    )
  );
  const [commit, recentActivity, aliasResult, references] = await Promise.all([
    sourceCommit(deployment.uid),
    activity(deployment.uid),
    api(`/v2/deployments/${deployment.uid}/aliases?teamId=${TEAM_ID}`),
    repositoryReferences(deployment.uid)
  ]);
  return {
    deploymentId: deployment.uid,
    url: `https://${deployment.url}`,
    sourceSha: commit,
    sourceMetadata: commit ? "deployment artifact manifest" : "unavailable",
    createdAt: new Date(deployment.created).toISOString(),
    target: detail.target,
    readyState: detail.readyState,
    aliases: (aliasResult.aliases ?? []).map((entry) =>
      typeof entry === "string" ? entry : entry.alias
    ),
    isCurrentProduction: deployment.uid === CURRENT_DEPLOYMENT_ID,
    environmentNameCount: environmentNames.length,
    hasLegacyV1Environment: legacyEnvironmentNames.length > 0,
    legacyEnvironmentNames,
    hasV2Environment: nextEnvironmentNames.length === 2,
    temporaryEnvironmentNames,
    recentActivity,
    repositoryReferences: references,
    executableRepositoryReferences: references.filter(
      (reference) =>
        !reference.file.startsWith("docs/") &&
        !reference.file.startsWith("artifacts/")
    )
  };
});

const clean = records.filter(
  (record) =>
    record.hasV2Environment &&
    !record.hasLegacyV1Environment &&
    record.temporaryEnvironmentNames.length === 0
);
const firstCleanAt = clean
  .map((record) => record.createdAt)
  .sort()[0] ?? null;
const rollbackCandidate = clean
  .filter(
    (record) =>
      !record.isCurrentProduction &&
      record.recentActivity.observable &&
      record.recentActivity.requestCount > 0 &&
      !Object.keys(record.recentActivity.statuses).some(
        (status) => Number(status) >= 500
      )
  )
  .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

for (const record of records) {
  record.predatesSingleV2 = firstCleanAt
    ? record.createdAt < firstCleanAt
    : null;
  record.rollbackOrReferenceDependency = record.isCurrentProduction
    ? "current Production"
    : record.deploymentId === rollbackCandidate?.deploymentId
      ? "designated clean post-single_v2 rollback"
      : record.repositoryReferences.length > 0
        ? `historical documentation/Evidence only (${record.repositoryReferences.length} references); no executable workflow dependency`
        : "none observed in current Vercel metadata or repository";

  if (record.isCurrentProduction) {
    record.classification = "KEEP";
    record.classificationReason = "current Production deployment";
  } else if (record.deploymentId === rollbackCandidate?.deploymentId) {
    record.classification = "KEEP";
    record.classificationReason =
      "newest non-current clean single_v2 rollback candidate; no v1 or temporary auth environment name";
  } else if (
    record.aliases.length > 0 ||
    record.executableRepositoryReferences.length > 0 ||
    !record.recentActivity.observable ||
    record.recentActivity.requestCount > 0
  ) {
    record.classification = "REVIEW";
    record.classificationReason = record.aliases.length
      ? "non-current alias requires dependency review"
      : record.executableRepositoryReferences.length > 0
        ? "executable repository reference requires dependency review"
      : !record.recentActivity.observable
        ? "post-cutover activity could not be observed"
        : "post-cutover request activity requires review";
  } else if (
    record.hasLegacyV1Environment ||
    record.predatesSingleV2
  ) {
    record.classification = "DELETE";
    record.classificationReason = record.hasLegacyV1Environment
      ? "obsolete v1 auth environment retained; no alias or post-cutover activity"
      : "predates the clean single_v2 boundary; no alias or post-cutover activity";
  } else {
    record.classification = "KEEP";
    record.classificationReason =
      "clean single_v2 deployment outside the authorized deletion conditions";
  }
}

records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
const output = JSON.stringify(
  {
      schemaVersion: "authn_008_ready_production_classification.v1",
      observedAt: new Date().toISOString(),
      projectId: PROJECT_ID,
      teamId: TEAM_ID,
      cutoverAt: CUTOVER_AT,
      currentDeploymentId: CURRENT_DEPLOYMENT_ID,
      readyProductionCount: records.length,
      firstCleanSingleV2CreatedAt: firstCleanAt,
      designatedRollbackDeploymentId: rollbackCandidate?.deploymentId ?? null,
      counts: Object.fromEntries(
        ["KEEP", "DELETE", "REVIEW"].map((classification) => [
          classification,
          records.filter(
            (record) => record.classification === classification
          ).length
        ])
      ),
      valuesRead: false,
      valuesPrinted: false,
    records
  },
  null,
  2
);

if (process.argv[2]) {
  await writeFile(process.argv[2], `${output}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify({
      outputPath: process.argv[2],
      readyProductionCount: records.length,
      keep: records.filter((record) => record.classification === "KEEP").length,
      delete: records.filter((record) => record.classification === "DELETE").length,
      review: records.filter((record) => record.classification === "REVIEW").length
    })
  );
} else {
  console.log(output);
}
