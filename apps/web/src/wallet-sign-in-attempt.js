// A wallet RPC cannot generally be aborted. Discard its late result instead of
// allowing an interrupted request to advance to a signature or verification.
export function createWalletSignInAttempt({
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis)
} = {}) {
  const controller = new AbortController();
  let phase = "connect";
  function assertActive() {
    if (controller.signal.aborted) {
      throw Object.assign(new Error("Wallet sign-in was interrupted."), {
        code: "wallet_sign_in_interrupted"
      });
    }
  }
  return Object.freeze({
    signal: controller.signal,
    get phase() { return phase; },
    isActive: () => !controller.signal.aborted,
    assertActive,
    cancel: () => controller.abort(),
    run(action, { phase: nextPhase, timeoutMs }) {
      assertActive();
      phase = nextPhase;
      return new Promise((resolve, reject) => {
        let settled = false;
        function finish(callback, value) {
          if (settled) return;
          settled = true;
          clearTimer(timer);
          controller.signal.removeEventListener("abort", interrupted);
          callback(value);
        }
        function interrupted() {
          finish(reject, Object.assign(new Error("Wallet sign-in was interrupted."), {
            code: "wallet_sign_in_interrupted"
          }));
        }
        const timer = setTimer(() => {
          finish(reject, Object.assign(new Error("Wallet sign-in timed out."), {
            code: "wallet_sign_in_timeout", phase: nextPhase
          }));
          controller.abort();
        }, timeoutMs);
        controller.signal.addEventListener("abort", interrupted, { once: true });
        // Invoke synchronously to preserve the click's wallet user activation.
        try {
          Promise.resolve(action()).then(
            value => finish(resolve, value), error => finish(reject, error)
          );
        } catch (error) { finish(reject, error); }
      }).then(value => { assertActive(); return value; });
    }
  });
}

export function walletSignInErrorMessage(error, { phase = error?.phase } = {}) {
  if (phase === "verify" && (!error?.status || error.status >= 500)) {
    return "Your sign-in result could not be confirmed. Reload this page to check your session before trying again.";
  }
  if (Number(error?.code) === 4001) {
    return "Wallet request rejected. Sign-in was not completed. Click Connect & sign in to try again.";
  }
  if (Number(error?.code) === -32002) {
    return "A request is already open in your wallet. Open the wallet extension and approve or dismiss it before trying again.";
  }
  if (error?.code === "wallet_sign_in_timeout") {
    return phase === "connect" || phase === "signature"
      ? "The wallet has not responded. Open the selected wallet and dismiss any pending request, then click Connect & sign in to try again. IPO.ONE will ignore the earlier response."
      : "The sign-in service has not responded. Check your connection, then click Connect & sign in to try again.";
  }
  if ([4900, 4901].includes(Number(error?.code))) {
    return "Your wallet is disconnected from the selected network. Open the wallet, check its connection, then try again.";
  }
  if (Number(error?.code) === 4100) {
    return "The wallet has not authorized account access. Open the wallet and review this site's connection, then try again.";
  }
  if (Number(error?.code) === 4200) {
    return "This wallet does not support the requested sign-in step. Select another discovered EVM wallet and keep the same BNB network.";
  }
  // Preserve explicit provider/service restrictions without guessing geography
  // from a generic HTTP 403 or substituting an endpoint to bypass a restriction.
  const message = typeof error?.message === "string" ? error.message.slice(0, 400) : "";
  return message
    ? `${message} Sign-in was not completed. Review the selected wallet or sign-in service before trying again.`
    : "Wallet sign-in failed. Open the selected wallet, check its connection, then try again.";
}
