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
const AUTH_PATH = join(
  homedir(),
  "Library/Application Support/com.vercel.cli/auth.json"
);
const CLASSIFICATION_PATH = process.argv[2];
const EVIDENCE_PATH = process.argv[3];
const EXECUTION_FLAG = process.argv[4];
const VERCEL_BIN = process.env.VERCEL_BIN;

if (
  !CLASSIFICATION_PATH ||
  !EVIDENCE_PATH ||
  EXECUTION_FLAG !== "--execute-authn-008-retire" ||
  !VERCEL_BIN
) {
  throw new Error(
    "classification path, Evidence path, exact execution flag and VERCEL_BIN are required"
  );
}

const classification = JSON.parse(
  await readFile(CLASSIFICATION_PATH, "utf8")
);
const { token } = JSON.parse(await readFile(AUTH_PATH, "utf8"));
if (!token) {
  throw new Error("Vercel token is unavailable");
}

async function api(path, options = {}) {
  const response = await fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.text();
  let parsed = null;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

async function activitySince(deploymentId, since) {
  try {
    const { stdout } = await execFileAsync(
      VERCEL_BIN,
      [
        "logs",
        deploymentId,
        "--scope",
        "cptm-111-s-projects",
        "--since",
        since,
        "--limit",
        "1",
        "--json"
      ],
      { maxBuffer: 1024 * 1024, timeout: 30_000 }
    );
    return stdout
      .trim()
      .split(/\n/)
      .filter(Boolean)
      .reduce((count, line) => {
        try {
          JSON.parse(line);
          return count + 1;
        } catch {
          return count;
        }
      }, 0);
  } catch {
    return null;
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

if (
  classification.currentDeploymentId !== CURRENT_DEPLOYMENT_ID ||
  classification.readyProductionCount !== 58 ||
  classification.counts?.DELETE !== 54
) {
  throw new Error("classification identity or expected count changed");
}

const proposed = classification.records.filter(
  (record) => record.classification === "DELETE"
);
if (
  proposed.some(
    (record) =>
      record.deploymentId === CURRENT_DEPLOYMENT_ID ||
      record.aliases.length > 0 ||
      !record.recentActivity.observable ||
      record.recentActivity.requestCount !== 0 ||
      record.executableRepositoryReferences.length > 0 ||
      (!record.predatesSingleV2 && !record.hasLegacyV1Environment)
  )
) {
  throw new Error("classification contains an unsafe DELETE record");
}

const current = await api(
  `/v13/deployments/${CURRENT_DEPLOYMENT_ID}?teamId=${TEAM_ID}`
);
const currentAliases = await api(
  `/v2/deployments/${CURRENT_DEPLOYMENT_ID}/aliases?teamId=${TEAM_ID}`
);
if (
  !current.ok ||
  current.body?.readyState !== "READY" ||
  current.body?.target !== "production" ||
  !currentAliases.ok ||
  !(currentAliases.body?.aliases ?? []).some(
    (entry) => (entry.alias ?? entry) === "ipo.one"
  )
) {
  throw new Error("current Production identity is not stable");
}

const rollbackId = classification.designatedRollbackDeploymentId;
const rollback = await api(`/v13/deployments/${rollbackId}?teamId=${TEAM_ID}`);
const rollbackNames = Array.isArray(rollback.body?.env) ? rollback.body.env : [];
if (
  !rollback.ok ||
  rollback.body?.readyState !== "READY" ||
  rollbackNames.includes("IPO_ONE_AUTH_REFERENCE_HASH_KEY") ||
  rollbackNames.includes("IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF") ||
  !rollbackNames.includes("IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY") ||
  !rollbackNames.includes("IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF")
) {
  throw new Error("designated clean single_v2 rollback is unavailable");
}

const revalidated = await mapLimited(proposed, 6, async (record) => {
  const [detail, aliases, newActivityCount] = await Promise.all([
    api(`/v13/deployments/${record.deploymentId}?teamId=${TEAM_ID}`),
    api(`/v2/deployments/${record.deploymentId}/aliases?teamId=${TEAM_ID}`),
    activitySince(record.deploymentId, classification.observedAt)
  ]);
  const aliasNames = (aliases.body?.aliases ?? []).map(
    (entry) => entry.alias ?? entry
  );
  const safe =
    detail.ok &&
    detail.body?.readyState === "READY" &&
    detail.body?.target === "production" &&
    aliases.ok &&
    aliasNames.length === 0 &&
    newActivityCount === 0;
  return {
    deploymentId: record.deploymentId,
    safe,
    readyState: detail.body?.readyState ?? null,
    target: detail.body?.target ?? null,
    aliases: aliasNames,
    requestsSinceClassification: newActivityCount,
    reason: safe
      ? "exact DELETE conditions revalidated"
      : "state changed or could not be observed; retained for REVIEW"
  };
});

const finalDeleteIds = revalidated
  .filter((record) => record.safe)
  .map((record) => record.deploymentId);
const retainedForReview = revalidated.filter((record) => !record.safe);
const deletionResults = [];

for (const deploymentId of finalDeleteIds) {
  const deleted = await api(
    `/v13/deployments/${deploymentId}?teamId=${TEAM_ID}`,
    { method: "DELETE" }
  );
  deletionResults.push({
    deploymentId,
    httpStatus: deleted.status,
    deleted: deleted.ok,
    providerState: deleted.body?.state ?? deleted.body?.status ?? null
  });
}

const remaining = await api(
  `/v7/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}` +
    "&target=production&state=READY&limit=100"
);
const remainingIds = (remaining.body?.deployments ?? []).map(
  (deployment) => deployment.uid
);
const failedDeletionIds = deletionResults
  .filter(
    (result) =>
      !result.deleted || remainingIds.includes(result.deploymentId)
  )
  .map((result) => result.deploymentId);

const evidence = {
  schemaVersion: "authn_008_retire_deletion.v1",
  executedAt: new Date().toISOString(),
  classificationObservedAt: classification.observedAt,
  projectId: PROJECT_ID,
  teamId: TEAM_ID,
  currentDeploymentId: CURRENT_DEPLOYMENT_ID,
  currentProductionPreserved: remainingIds.includes(CURRENT_DEPLOYMENT_ID),
  designatedCleanRollbackDeploymentId: rollbackId,
  designatedCleanRollbackPreserved: remainingIds.includes(rollbackId),
  proposedDeleteCount: proposed.length,
  finalDeleteCount: finalDeleteIds.length,
  retainedForReview,
  deletionResults,
  failedDeletionIds,
  readyProductionCountAfterDeletion: remainingIds.length,
  remainingReadyProductionDeploymentIds: remainingIds,
  secretValuesRead: false,
  secretValuesPrinted: false,
  databaseMutation: false,
  runtimeRoleMutation: false,
  businessDataMutation: false,
  fundsMutation: false,
  chainMutation: false,
  passed:
    failedDeletionIds.length === 0 &&
    remainingIds.includes(CURRENT_DEPLOYMENT_ID) &&
    remainingIds.includes(rollbackId)
};

await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600
});
console.log(
  JSON.stringify({
    evidencePath: EVIDENCE_PATH,
    proposedDeleteCount: proposed.length,
    finalDeleteCount: finalDeleteIds.length,
    retainedForReview: retainedForReview.length,
    failedDeletionCount: failedDeletionIds.length,
    readyProductionCountAfterDeletion: remainingIds.length,
    passed: evidence.passed
  })
);
