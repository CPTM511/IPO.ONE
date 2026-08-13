import { createHmac } from "node:crypto";
import { DomainError } from "../../../packages/domain/src/index.js";

const EXACT_RELEASE = /^[0-9a-f]{40}$/;
const ACCEPTANCE_PHASES = new Set(["before_restart", "after_restart"]);

export function loadReferenceAgentAcceptanceScope(environment = {}) {
  const candidateReleaseId = environment.IPO_ONE_M1_B_RELEASE_SHA;
  const acceptancePhase = environment.IPO_ONE_M1_B_ACCEPTANCE_PHASE;
  if (candidateReleaseId === undefined && acceptancePhase === undefined) {
    return Object.freeze({ mode: "developer" });
  }
  if (
    !EXACT_RELEASE.test(candidateReleaseId ?? "") ||
    !ACCEPTANCE_PHASES.has(acceptancePhase)
  ) {
    throw new DomainError(
      "invalid_reference_agent_acceptance_scope",
      "exact Agent acceptance requires one 40-character release ID and an explicit restart phase"
    );
  }
  return Object.freeze({
    mode: "exact_release",
    candidateReleaseId,
    acceptancePhase,
    displayName: `IPO.ONE M1-B Agent ${candidateReleaseId}`,
    mandateNonce: `m1b.agent.${candidateReleaseId}`
  });
}

export function requireReferenceAgentAcceptanceAction(scope, currentSubject) {
  if (scope?.mode !== "exact_release") {
    return currentSubject?.recovery ? "recover" : "execute";
  }
  if (scope.acceptancePhase === "after_restart") {
    if (!currentSubject?.recovery) {
      throw new DomainError(
        "reference_agent_candidate_recovery_unavailable",
        "post-restart acceptance requires the exact candidate's completed lifecycle"
      );
    }
    return "recover";
  }
  // A repeated pre-restart run must still cross the current MCP transport. The
  // exact Candidate markers make the resulting mutations safe idempotent
  // replays, while treating the lifecycle as recovery here would turn retained
  // database state into false transport evidence.
  return "execute";
}

export function deriveReferenceAgentAcceptanceSecret(
  databaseSecret,
  tenantId,
  candidateReleaseId
) {
  if (
    typeof databaseSecret !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(databaseSecret) ||
    typeof tenantId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,127}$/.test(tenantId) ||
    !EXACT_RELEASE.test(candidateReleaseId ?? "")
  ) {
    throw new DomainError(
      "invalid_reference_agent_acceptance_scope",
      "candidate Agent account derivation requires the exact private-pilot scope"
    );
  }
  return createHmac("sha256", databaseSecret)
    .update("IPO_ONE_M1_B_AGENT_ACCOUNT_V1")
    .update("\0")
    .update(tenantId)
    .update("\0")
    .update(candidateReleaseId)
    .digest("base64url");
}
