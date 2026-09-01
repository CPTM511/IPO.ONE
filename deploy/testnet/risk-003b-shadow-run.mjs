import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRisk003BShadowRun } from "../../packages/domain/src/index.js";

export const RISK_003B_APPROVAL_MARKER =
  "RISK-003B:FINALIZED_TESTNET_SHADOW:20260901-001";
export const RISK_003B_SOURCE_PATH =
  "artifacts/testnet/hl-testnet-001b-live-20260901-001.json";
export const RISK_003B_SOURCE_SHA256 =
  "eeb1f5e77de5397d7f2317c080770da44412cca3876145752ad1a2837f50aaa3";

const EXPECTED_SCOPE = Object.freeze({
  subjectReferenceHash:
    "0x11c8f1afced90e80a836e394fbe547182a59e52e584172d9999530a398aac74d",
  principalReferenceHash:
    "0xa858cb56e1c5d08b99578ce2d40e823842ea607a1538d573bb668c4f440a7931"
});

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (index === process.argv.length - 1) {
    throw new Error(`risk_003b_cli_invalid: ${name} requires a value`);
  }
  return process.argv[index + 1];
}
function requireApproval(env) {
  if (env.IPO_ONE_APPROVE_RISK_003B_SHADOW_RUN !== RISK_003B_APPROVAL_MARKER) {
    throw new Error(
      "risk_003b_authority_denied: exact shadow-run approval is required"
    );
  }
  if (env.CI === "true" || env.GITHUB_ACTIONS === "true") {
    throw new Error("risk_003b_authority_denied: live Evidence run is disabled in CI");
  }
}

export async function runRisk003BFinalizedTestnetShadow({
  cwd = process.cwd(),
  evaluatedAt,
  challengerEnabled = true,
  admittedAt = "2026-09-01T02:30:00.000Z"
} = {}) {
  const absoluteSource = resolve(cwd, RISK_003B_SOURCE_PATH);
  const bytes = await readFile(absoluteSource);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== RISK_003B_SOURCE_SHA256) {
    throw new Error(
      "risk_003b_source_integrity_failed: finalized source SHA-256 mismatch"
    );
  }
  const sourceEvidence = JSON.parse(bytes.toString("utf8"));
  return createRisk003BShadowRun({
    sources: [
      {
        sourceEvidence,
        sourceArtifactPath: RISK_003B_SOURCE_PATH,
        sourceArtifactSha256: actualSha256,
        scope: EXPECTED_SCOPE,
        admission: {
          owner: "risk_operations_shadow_owner",
          privacyReview: "passed",
          finality: "finalized",
          reconciled: true,
          revoked: false,
          invalidated: false,
          admittedAt
        },
        activePolicySnapshot: {
          policyId: "agent_credit_hyperliquid_testnet",
          policyVersion: "agent_credit_hyperliquid_testnet.v2",
          authorizationVersion: "agent_credit_authorization.v1",
          decisionMode: "deterministic_active",
          maximumNotionalUsd: "12",
          maximumEffectiveLeverage: 1,
          candidateCommit: "eb3c0fa718bb82c141c34a7717df3e8ac7597033",
          authorizingSource: "hl_testnet_001b_exact_run"
        }
      }
    ],
    expectedScope: EXPECTED_SCOPE,
    candidateVersion: "risk_003b_challenger.v1",
    challengerEnabled,
    evaluatedAt
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireApproval(process.env);
  const evaluatedAt = argument("--evaluated-at");
  if (!evaluatedAt) {
    throw new Error(
      "risk_003b_cli_invalid: --evaluated-at is required for deterministic replay"
    );
  }
  const result = await runRisk003BFinalizedTestnetShadow({
    cwd: argument("--cwd", process.cwd()),
    evaluatedAt,
    challengerEnabled: !process.argv.includes("--challenger-disabled")
  });
  process.stdout.write(`RISK_003B_SHADOW_RUN ${JSON.stringify(result)}\n`);
}
