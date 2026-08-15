const ACTIVE_RUNTIME_STAGES = new Set([
  "runtime_execute",
  "runtime_repay",
  "runtime_evidence",
  "runtime_complete"
]);

export function deriveAgentLifecycleNextAction({
  applicationEligible,
  evidenceLatestProven,
  executionCompleted,
  mandateStatus,
  obligationPresent,
  offerPresent,
  outstandingMinor
}) {
  if (mandateStatus === "draft") {
    if (applicationEligible !== true) return "identity";
    return offerPresent ? "principal_activation" : "application";
  }
  if (mandateStatus !== "active") return "authority";
  if (obligationPresent) {
    if (!executionCompleted) return "runtime_execute";
    if (BigInt(outstandingMinor ?? 0) > 0n) return "runtime_repay";
    return evidenceLatestProven ? "runtime_complete" : "runtime_evidence";
  }
  return offerPresent ? "runtime_accept" : "active_recovery";
}

export function isAgentRuntimeStage(stage) {
  return ACTIVE_RUNTIME_STAGES.has(stage);
}

export function selectExactAgentContinuation({
  mandate,
  now = new Date(),
  recovery
}) {
  if (
    recovery?.serverTruth !== true ||
    recovery?.workspaceKind !== "principal_controller" ||
    typeof mandate?.mandateId !== "string" ||
    typeof mandate?.subjectId !== "string"
  ) return null;
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) return null;
  const matches = (Array.isArray(recovery.continuationReceipts)
    ? recovery.continuationReceipts
    : []
  ).filter((continuation) => (
    continuation?.serverTruth === true &&
    continuation?.schemaVersion === "workspace_continuation_receipt_view.v1" &&
    continuation.subjectId === mandate.subjectId &&
    continuation.mandateId === mandate.mandateId &&
    continuation.receipt?.subjectId === continuation.subjectId &&
    continuation.receipt?.mandateId === continuation.mandateId &&
    continuation.receipt?.offer?.creditOfferId === continuation.creditOfferId &&
    continuation.receipt?.offer?.creditOfferHash === continuation.creditOfferHash &&
    Number.isSafeInteger(continuation.offerAggregateVersion) &&
    continuation.offerAggregateVersion > 0 &&
    new Date(continuation.expiresAt).getTime() > nowMs
  ));
  return matches.length === 1 ? matches[0] : null;
}
