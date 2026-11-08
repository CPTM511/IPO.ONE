// Frozen from the approved SDK's official Reown directory on 2026-11-08.
// No runtime directory request, caller-provided target or redirect is accepted.
export const PHONE_WALLET_TARGETS = Object.freeze([
  { id: "mobileWalletBinanceLink", base: "bnc://app.binance.com/cedefi/" },
  { id: "mobileWalletOkxAppLink", base: "okex://main/" },
  { id: "mobileWalletOkxWalletLink", base: "okxwallet://main/" },
  { id: "mobileWalletMetaMaskLink", base: "metamask://" }
].map(Object.freeze));

export function phoneWalletLinks(pairingUri) {
  if (pairingUri !== undefined &&
    (typeof pairingUri !== "string" || !/^wc:[A-Za-z0-9._~%:@/?&=+-]{1,2045}$/.test(pairingUri))) {
    throw new TypeError("Phone wallet connection URI is invalid");
  }
  return PHONE_WALLET_TARGETS.map(({ id, base }) => ({
    id, href: pairingUri === undefined ? base : `${base}wc?uri=${encodeURIComponent(pairingUri)}`
  }));
}
