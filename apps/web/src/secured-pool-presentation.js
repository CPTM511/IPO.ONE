const ACTION_LABELS = Object.freeze({
  supply: "Supply liquidity",
  withdraw: "Withdraw liquidity",
  deposit_collateral: "Deposit collateral",
  borrow: "Borrow",
  repay: "Repay",
  release_collateral: "Release collateral"
});

function text(value, fallback = "Unavailable") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function short(value) {
  return typeof value === "string" && value.length > 18
    ? `${value.slice(0, 10)}…${value.slice(-6)}`
    : text(value);
}

function availableAmount(value) {
  return typeof value === "string" ? value : "Unavailable";
}

function stateLabel(value) {
  return text(value).replaceAll("_", " ");
}

function deploymentPresentation(deployment) {
  if (deployment?.state === "verified") {
    return {
      state: "Exact deployment verified",
      detail: `${deployment.chainId} · code + configuration match`
    };
  }
  if (deployment?.state === "configured") {
    return {
      state: "Deployment configured",
      detail: "Exact onchain verification is currently unavailable"
    };
  }
  if (deployment?.state === "verification_failed") {
    return {
      state: "Verification failed",
      detail: "Live code or configuration did not match the approved profile"
    };
  }
  return { state: "Unavailable", detail: "No approved deployment profile" };
}

function rpcPresentation(rpc) {
  if (rpc?.state === "available") {
    return {
      state: "Connected",
      detail: `${text(rpc.providerSlot)} · safe block ${text(rpc.blockNumber)}`
    };
  }
  return {
    state: "Unavailable",
    detail: stateLabel(rpc?.reasonCode ?? "No safe block observed")
  };
}

function indexerPresentation(indexer) {
  return indexer?.state === "indexed"
    ? {
        state: "Indexed",
        detail: `Finalized projection · ${text(indexer.recordedAt, "time unavailable")}`
      }
    : {
        state: "Unavailable",
        detail: stateLabel(indexer?.reasonCode ?? "finalized projection unavailable")
      };
}

function reconciliationPresentation(reconciliation) {
  if (reconciliation?.state === "reconciled") {
    return {
      state: "Reconciled",
      detail: text(reconciliation.checkedAt, "Checked time unavailable")
    };
  }
  if (reconciliation?.state === "discrepancy") {
    return {
      state: "Discrepancy",
      detail: stateLabel(reconciliation.reasonCode)
    };
  }
  return {
    state: "Unavailable",
    detail: stateLabel(reconciliation?.reasonCode ?? "reconciliation unavailable")
  };
}

export function createSecuredPoolPresentation({
  marketSnapshot,
  workspace,
  review,
  risk
} = {}) {
  const market = workspace?.market ?? marketSnapshot?.market ?? risk?.market ?? null;
  const live = market?.status === "live_testnet_read_only";
  const indexed = market?.status === "local_synthetic_indexed";
  const deployed = live || indexed || market?.status === "deployed_not_indexed";
  const deployment = deploymentPresentation(market?.deployment);
  const rpc = rpcPresentation(market?.rpc);
  const indexer = indexerPresentation(market?.indexer);
  const reconciliation = reconciliationPresentation(market?.reconciliation);
  const position = workspace?.position ?? null;
  const accountBinding = workspace?.accountBindingAvailable === true;
  const positionAvailable = Boolean(position);
  const accounting = market?.accounting ?? null;
  const marketCurrent = live || indexed;
  const marketLabel = marketCurrent
    ? `test USDC / WETH · ${text(market.contractAddress)}`
    : deployed
      ? `${text(market.contractAddress)} · exact deployment known; live market values unavailable`
      : "Base Sepolia exact Pool unavailable";
  const oracle = market?.oracle ?? null;
  const riskControl = market?.riskControl ?? null;
  return Object.freeze({
    workspaceState: market
      ? live
        ? "Live read-only state"
        : indexed
          ? "Local projection loaded"
          : "Deployment known · state unavailable"
      : "Not loaded",
    deploymentState: deployment.state,
    deploymentDetail: deployment.detail,
    rpcState: rpc.state,
    rpcDetail: rpc.detail,
    indexerState: indexer.state,
    indexerDetail: indexer.detail,
    reconciliationState: reconciliation.state,
    reconciliationDetail: reconciliation.detail,
    marketState: marketCurrent ? (live ? "Current safe-block read" : "Local indexed projection") : "Unavailable",
    marketDetail: marketCurrent
      ? `${availableAmount(accounting?.cashAssets)} available asset units`
      : "No market amount is asserted",
    market: marketLabel,
    liquidity: availableAmount(accounting?.cashAssets),
    grossDebt: availableAmount(accounting?.grossDebtAssets),
    utilization: typeof accounting?.utilizationBps === "string"
      ? `${accounting.utilizationBps} bps`
      : "Unavailable",
    lpClaim: availableAmount(accounting?.lpClaimAssets),
    contractAddress: text(market?.contractAddress),
    marketId: short(market?.marketId),
    safeBlock: text(market?.rpc?.blockNumber),
    observedAt: text(market?.rpc?.observedAt),
    oracle: oracle?.state
      ? `${stateLabel(oracle.state)} · ${text(oracle.observedAt, "observation time unavailable")}`
      : "Unavailable",
    riskControl: riskControl
      ? `${riskControl.newRiskFrozen ? "New risk frozen" : "New risk open"} · protocol ${riskControl.protocolNewRiskPaused === true ? "paused" : riskControl.protocolNewRiskPaused === false ? "active" : "unknown"}`
      : "Unavailable",
    accountBinding: accountBinding
      ? "Verified for current Subject"
      : "Unavailable for current Subject",
    positionState: positionAvailable
      ? position.source === "base_sepolia_safe_block"
        ? "Current safe-block position"
        : "Indexed position"
      : accountBinding
        ? "Position read unavailable"
        : "No authorized AccountBinding",
    position: positionAvailable
      ? `${text(position.supplyShares)} supply shares · ${text(position.debtAssets)} debt`
      : "Unavailable",
    supplyClaim: positionAvailable ? text(position.supplyClaimAssets, "0") : "Unavailable",
    health: position?.health?.state ? stateLabel(position.health.state) : "Unavailable",
    submission: workspace?.submission?.state === "unavailable" ||
      marketSnapshot?.submission?.state === "unavailable" ||
      risk?.submission?.state === "unavailable"
      ? "Unavailable · no chain transaction will be submitted"
      : "Unavailable",
    submissionState: "Disabled by task authority",
    reviewState: review?.reviewState ?? "No scenario reviewed",
    reviewAction: review ? ACTION_LABELS[review.actionType] ?? review.actionType : "—",
    reviewAmount: review?.amountAssets ?? "—",
    reviewBlockers: review?.blockerReasonCodes?.join(" · ") ??
      "Review is optional and read-only; no transaction will be submitted.",
    riskState: risk ? "Aggregate server state loaded" : "Not loaded",
    riskPositions: risk?.positionCount === null || risk?.positionCount === undefined
      ? "Unavailable"
      : String(risk.positionCount),
    riskLiquidatable: risk?.liquidatablePositionCount === null ||
      risk?.liquidatablePositionCount === undefined
      ? "Unavailable"
      : String(risk.liquidatablePositionCount),
    riskDiscrepancies: risk?.discrepancyCount === null || risk?.discrepancyCount === undefined
      ? "Unavailable"
      : String(risk.discrepancyCount)
  });
}
