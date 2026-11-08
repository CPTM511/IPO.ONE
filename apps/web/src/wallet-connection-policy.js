// Founder-approved B2 renewal; see B2_MOBILE_NO_FUNDS_20261108.json.
// This permits the existing connection/signature transport, never transactions.
export const MOBILE_WALLET_APPROVAL = Object.freeze({
  id: "b2-mobile-no-funds-20261108",
  expiresAt: "2026-12-08T15:59:59.999Z",
  origin: "https://ipo.one"
});

export function mobileWalletApprovalIsCurrent(now = new Date()) {
  return now instanceof Date && Number.isFinite(now.getTime()) &&
    now.getTime() <= Date.parse(MOBILE_WALLET_APPROVAL.expiresAt);
}

export function assertMobileWalletApproval(now = new Date()) {
  if (!mobileWalletApprovalIsCurrent(now)) {
    throw new TypeError("Mobile wallet connector approval has expired");
  }
}
