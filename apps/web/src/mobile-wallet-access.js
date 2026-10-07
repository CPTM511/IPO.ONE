const BUNDLE_PATH = "/vendor/walletconnect-ethereum-provider-2.23.10.iife.js";
const PROJECT_ID = /^[0-9a-f]{32}$/i;
const PAIRING_URI = /^wc:[A-Za-z0-9._~%:@/?&=+-]{1,2045}$/;

export function mobileWalletAvailability({ origin, projectId, now = new Date() }) {
  if (origin !== "https://ipo.one") return { available: false, reason: "Phone wallet pairing is available on the approved IPO.ONE website." };
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) return { available: false, reason: "Phone wallet pairing is awaiting operator configuration. Browser wallets remain available." };
  if (now.getTime() > Date.parse("2026-09-22T23:59:59.999Z")) return { available: false, reason: "Phone wallet pairing approval has expired. Operator renewal is required." };
  return { available: true, reason: "Select phone wallet, choose your network, then connect. Scan the QR code using your wallet's WalletConnect scanner." };
}

export function createMobileWalletAccess({ document, window, registry, selectProvider, onStatus }) {
  const button = document.getElementById("mobileWalletBtn");
  const status = document.getElementById("mobileWalletStatus");
  const pairing = document.getElementById("mobileWalletPairing");
  const qr = document.getElementById("mobileWalletQr");
  const projectId = document.querySelector('meta[name="ipo-one-walletconnect-project-id"]')?.content ?? "";
  const availability = mobileWalletAvailability({ origin: window.location.origin, projectId });
  let mobile;
  let scriptPromise;
  let epoch = 0;
  let preparing = false;
  let renderState = {};
  const clearPairing = () => { pairing.hidden = true; qr.hidden = true; qr.removeAttribute("src"); };
  function render({ busy = false, walletEnabled = false } = {}) {
    renderState = { busy, walletEnabled };
    if (mobile && busy) pairing.hidden = false;
    button.disabled = !availability.available || busy || preparing || !walletEnabled;
    if (!mobile && !preparing) status.textContent = availability.reason;
  }
  function loadBundle() {
    if (window.IpoOneWalletConnectBundle) return Promise.resolve(window.IpoOneWalletConnectBundle);
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BUNDLE_PATH;
      script.async = true;
      script.dataset.ipoOptional = "walletconnect";
      script.onload = () => {
        if (window.IpoOneWalletConnectBundle) resolve(window.IpoOneWalletConnectBundle);
        else { script.remove(); scriptPromise = undefined; reject(new Error("Phone wallet bundle is unavailable. Try again.")); }
      };
      script.onerror = () => { script.remove(); scriptPromise = undefined; reject(new Error("Phone wallet could not load. Try again.")); };
      document.head.append(script);
    });
    return scriptPromise;
  }
  async function prepare() {
    if (!availability.available || preparing || renderState.busy || !renderState.walletEnabled) return;
    if (mobile) { selectProvider(mobile.descriptor.providerId); return; }
    const requestEpoch = ++epoch;
    preparing = true;
    button.disabled = true;
    status.textContent = "Preparing phone wallet…";
    try {
      const bundle = await loadBundle();
      if (requestEpoch !== epoch) return;
      if (!mobile) {
        mobile = bundle.createMobileWalletConnector({
          projectId, expectedOrigin: window.location.origin, currentOrigin: window.location.origin,
          loadEthereumProvider: bundle.loadApprovedWalletConnectEthereumProvider,
          async onDisplayUri(uri) {
            if (requestEpoch !== epoch || !PAIRING_URI.test(uri)) return;
            try {
            const svg = await bundle.createPairingQrSvg(uri, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
            if (requestEpoch !== epoch) return;
            qr.src = `data:image/svg+xml;base64,${window.btoa(svg)}`;
            qr.hidden = false;
            pairing.hidden = false;
            status.textContent = "Scan with Binance Wallet or another WalletConnect-compatible phone wallet. Approve only the selected network and login message.";
            } catch {
              if (requestEpoch === epoch) {
                status.textContent = "Connection QR could not be displayed. Cancel phone connection and try again.";
                pairing.hidden = false;
                onStatus(status.textContent);
              }
            }
          }
        });
        if (!registry.registerConnector({ descriptor: mobile.descriptor, connector: mobile.connector })) throw new Error("Phone wallet could not be registered. Reload and retry.");
      }
      selectProvider(mobile.descriptor.providerId);
      status.textContent = "Phone wallet selected. Choose your network, then use Connect & sign in with wallet.";
    } catch (error) {
      if (requestEpoch !== epoch) return;
      await dispose();
      onStatus(error.message);
      status.textContent = error.message;
    } finally { preparing = false; button.disabled = !availability.available || renderState.busy || !renderState.walletEnabled; }
  }
  async function dispose() {
    epoch += 1;
    clearPairing();
    const previous = mobile;
    mobile = undefined;
    if (previous) {
      registry.removeProvider(previous.descriptor.providerId);
      await previous.dispose();
    }
  }
  async function cancel() {
    await dispose();
    status.textContent = "Phone wallet connection cancelled. Select phone wallet to start again.";
    onStatus(status.textContent);
  }
  return Object.freeze({ render, prepare, cancel, clearPairing, dispose });
}
