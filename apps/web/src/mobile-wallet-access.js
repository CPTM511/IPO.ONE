import { MOBILE_WALLET_APPROVAL, mobileWalletApprovalIsCurrent } from "./wallet-connection-policy.js";
import { PHONE_WALLET_TARGETS, phoneWalletLinks } from "./mobile-wallet-links.js";

const BUNDLE_PATH = "/vendor/walletconnect-ethereum-provider-2.23.10.iife.js";
const PROJECT_ID = /^[0-9a-f]{32}$/i;
const PAIRING_URI = /^wc:[A-Za-z0-9._~%:@/?&=+-]{1,2045}$/;

export function mobileWalletAvailability({ origin, projectId, now = new Date() }) {
  if (origin !== MOBILE_WALLET_APPROVAL.origin) return { available: false, reason: "Phone wallet pairing is available on the approved IPO.ONE website." };
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) return { available: false, reason: "External wallet / QR connection is paused. Open IPO.ONE in your wallet app's browser, or select an installed browser wallet below." };
  if (!mobileWalletApprovalIsCurrent(now)) return { available: false, reason: "Phone wallet pairing approval has expired. Operator renewal is required." };
  return { available: true, reason: "Select phone wallet, choose your network, then connect. Scan the QR code using your wallet's WalletConnect scanner." };
}

export function createMobileWalletAccess({ document, window, registry, selectProvider, onStatus }) {
  const button = document.getElementById("mobileWalletBtn");
  const status = document.getElementById("mobileWalletStatus");
  const pairing = document.getElementById("mobileWalletPairing");
  const qr = document.getElementById("mobileWalletQr");
  const launchers = document.getElementById("mobileWalletLinks");
  const signatureButton = document.getElementById("mobileWalletSignatureBtn");
  const copyButton = document.getElementById("copyMobileWalletLinkBtn");
  const projectId = document.querySelector('meta[name="ipo-one-walletconnect-project-id"]')?.content ?? "";
  const availability = () => mobileWalletAvailability({ origin: window.location.origin, projectId });
  let mobile;
  let scriptPromise;
  let epoch = 0;
  let preparing = false;
  let renderState = {};
  let signatureGate;
  let idleStatus;
  const clearLinks = () => {
    launchers.hidden = true;
    for (const { id } of PHONE_WALLET_TARGETS) document.getElementById(id).removeAttribute("href");
  };
  const clearPairing = () => {
    pairing.hidden = true; qr.hidden = true; qr.removeAttribute("src"); clearLinks();
  };
  function showLinks(uri) {
    if (!availability().available) { clearLinks(); return; }
    for (const { id, href } of phoneWalletLinks(uri)) document.getElementById(id).href = href;
    launchers.hidden = false;
  }
  for (const { id } of PHONE_WALLET_TARGETS) {
    document.getElementById(id).addEventListener?.("click", event => {
      if (!availability().available) { event.preventDefault(); void dispose(); render(renderState); }
    });
  }
  signatureButton.hidden = true;
  signatureButton.addEventListener?.("click", () => signatureGate?.run());
  copyButton.addEventListener?.("click", async () => {
    try {
      await window.navigator.clipboard.writeText(MOBILE_WALLET_APPROVAL.origin);
      status.textContent = "IPO.ONE link copied. Open it in your wallet app's browser, then select your wallet.";
    } catch {
      status.textContent = "Open https://ipo.one in your wallet app's browser to continue. This link contains no private record.";
    }
  });
  function render({ busy = false, walletEnabled = false } = {}) {
    renderState = { busy, walletEnabled };
    const current = availability();
    if (mobile && busy) pairing.hidden = false;
    button.disabled = !current.available || busy || preparing || !walletEnabled;
    if (!current.available) status.textContent = current.reason;
    else if (!mobile && !preparing) status.textContent = idleStatus ?? current.reason;
    if (!current.available) {
      clearLinks();
      signatureGate?.cancel();
      if (mobile) void dispose();
    }
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
    if (!availability().available || preparing || renderState.busy || !renderState.walletEnabled) {
      render(renderState);
      return;
    }
    if (mobile) { selectProvider(mobile.descriptor.providerId); return; }
    const requestEpoch = ++epoch;
    idleStatus = undefined;
    preparing = true;
    button.disabled = true;
    status.textContent = "Preparing phone wallet…";
    try {
      const bundle = await loadBundle();
      if (requestEpoch !== epoch || !availability().available) return;
      if (!mobile) {
        mobile = bundle.createMobileWalletConnector({
          projectId, expectedOrigin: window.location.origin, currentOrigin: window.location.origin,
          loadEthereumProvider: bundle.loadApprovedWalletConnectEthereumProvider,
          onSignatureRequest() { signatureGate?.ready(); },
          async onDisplayUri(uri) {
            if (requestEpoch !== epoch || !availability().available || !PAIRING_URI.test(uri)) return;
            pairing.hidden = false;
            showLinks(uri);
            try {
            const svg = await bundle.createPairingQrSvg(uri, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
            if (requestEpoch !== epoch || !availability().available) return;
            qr.src = `data:image/svg+xml;base64,${window.btoa(svg)}`;
            qr.hidden = false;
            pairing.hidden = false;
            status.textContent = "On this phone, open your installed wallet below. On another device, scan the QR code. Approve only the selected network.";
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
      idleStatus = error.message;
      onStatus(error.message);
      status.textContent = error.message;
    } finally {
      if (requestEpoch === epoch) preparing = false;
      render(renderState);
    }
  }
  async function dispose() {
    epoch += 1;
    preparing = false;
    signatureGate?.cancel();
    signatureButton.hidden = true;
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
    idleStatus = "Phone wallet connection cancelled. Select phone wallet to start again.";
    status.textContent = idleStatus;
    onStatus(status.textContent);
  }
  async function failAttempt(message) {
    // A timed-out QR must never remain scannable or keep its SDK request alive.
    // Drop the connector before exposing a fresh user-driven retry.
    idleStatus = message;
    await dispose();
    status.textContent = availability().available ? idleStatus : availability().reason;
    onStatus(status.textContent);
  }
  function requestSignature({ action, signal }) {
    if (!mobile || signatureGate || !availability().available || signal?.aborted || typeof action !== "function") {
      return Promise.reject(Object.assign(new Error("Phone wallet login was interrupted."), { code: 4001 }));
    }
    return new Promise((resolve, reject) => {
      let settled = false, running = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", cancel);
        signatureGate = undefined;
        signatureButton.hidden = true;
        clearPairing();
        callback(value);
      };
      const cancel = () => finish(reject, Object.assign(new Error("Phone wallet login was interrupted."), { code: 4001 }));
      signatureGate = { cancel, run() {
        if (running || settled) return;
        if (!availability().available || signal?.aborted) { cancel(); return; }
        running = true; signatureButton.disabled = true;
        status.textContent = "Preparing one-use wallet sign-in…";
        clearLinks();
        // Invoke inside this click, not in a Promise callback: preserve the
        // wallet request's user activation. Opening the app is a separate link.
        try { Promise.resolve(action()).then(value => finish(resolve, value), error => finish(reject, error)); }
        catch (error) { finish(reject, error); }
      }, ready() {
        if (!running || settled || !availability().available || signal?.aborted) return;
        status.textContent = "Login signature requested. Open your wallet below, review the message, then return to this page.";
        showLinks();
      } };
      signal?.addEventListener("abort", cancel, { once: true });
      signatureButton.hidden = false; signatureButton.disabled = false;
      pairing.hidden = false; qr.hidden = true;
      status.textContent = "Phone connected. Request the one-use login signature, then open your wallet to review it.";
    });
  }
  const refreshAvailability = () => render(renderState);
  window.addEventListener?.("pageshow", refreshAvailability);
  document.addEventListener?.("visibilitychange", refreshAvailability);
  return Object.freeze({ render, prepare, cancel, clearPairing, requestSignature, failAttempt, dispose });
}
