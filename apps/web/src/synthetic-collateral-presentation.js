export function syntheticCollateralAmount(assets) {
  if (typeof assets !== "string" || !/^[0-9]{1,78}$/.test(assets)) return "—";
  const n = BigInt(assets), scale = 10n ** 18n;
  const fraction = (n % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return `${n / scale}${fraction ? `.${fraction}` : ""}`;
}

export function createSyntheticCollateralPresentation(obligation) {
  const c = obligation?.syntheticCollateral;
  if (!c) return { present: false, executionBlocked: false };
  const state = {
    awaiting_confirmation: "Awaiting synthetic collateral confirmation",
    confirmed: "Synthetic collateral confirmed",
    released: "Synthetic collateral released"
  }[c.state] ?? "Synthetic collateral unavailable";
  return {
    present: true, state,
    amount: syntheticCollateralAmount(c.terms?.requiredAssets),
    remaining: syntheticCollateralAmount(c.amountAssets),
    confirm: c.state === "awaiting_confirmation" && obligation.executionStatus === "pending",
    release: c.state === "confirmed" && obligation.status === "fully_repaid" &&
      ["outstandingPrincipalMinor", "outstandingInterestMinor", "outstandingFeesMinor"]
        .every(key => obligation[key] === "0"),
    executionBlocked: obligation.executionStatus === "pending" && c.state !== "confirmed",
    receipt: c.lastReceipt?.receiptId ?? "—"
  };
}
