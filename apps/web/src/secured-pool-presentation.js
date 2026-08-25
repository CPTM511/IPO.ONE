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

export function createSecuredPoolPresentation({ workspace, review, risk } = {}) {
  const market = workspace?.market ?? risk?.market ?? null;
  const indexed = market?.status === "local_synthetic_indexed";
  const deployed = indexed || market?.status === "deployed_not_indexed";
  const position = workspace?.position ?? null;
  return Object.freeze({
    workspaceState: workspace ? (indexed ? "Synthetic state loaded" : "Awaiting indexed state") : "Not loaded",
    market: indexed
      ? `${text(market.debtAsset)} / ${text(market.collateralAsset)} · Base Sepolia test Pool deployed · local synthetic projection`
      : deployed
        ? `${text(market.contractAddress)} · Base Sepolia test Pool deployed · local indexer state unavailable`
        : "Base Sepolia reference market · not deployed",
    liquidity: market?.accounting ? market.accounting.cashAssets : "0",
    position: position
      ? `${position.supplyShares} supply shares · ${position.debtAssets} debt`
      : "No server-derived position",
    health: position?.health?.state ?? "Unavailable",
    submission: workspace?.submission?.state === "unavailable" || risk?.submission?.state === "unavailable"
      ? "Unavailable in this local synthetic view · no chain transaction will be submitted"
      : "Not configured",
    reviewState: review?.reviewState ?? "No action reviewed",
    reviewAction: review ? ACTION_LABELS[review.actionType] ?? review.actionType : "—",
    reviewAmount: review?.amountAssets ?? "—",
    reviewBlockers: review?.blockerReasonCodes?.join(" · ") ?? "Review an exact action; no transaction will be submitted.",
    riskState: risk ? "Aggregate server state loaded" : "Not loaded",
    riskPositions: risk ? String(risk.positionCount) : "0",
    riskLiquidatable: risk ? String(risk.liquidatablePositionCount) : "0",
    riskDiscrepancies: risk ? String(risk.discrepancyCount) : "0"
  });
}
