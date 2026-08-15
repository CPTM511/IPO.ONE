import {
  M1BOperationalLiveNegativeCaptureError,
  createM1BOperationalLiveNegativeResponseCapture
} from "./m1-b-operational-live-negative-response-capture.js";

function fail(message) {
  throw new M1BOperationalLiveNegativeCaptureError(
    "m1_b_live_negative_unavailable",
    message
  );
}

export function installM1BOperationalLiveNegativeResponseCapturePanel({
  document,
  location,
  getRuntimeState,
  performDenial,
  clipboard,
  announce = () => {},
  now
}) {
  const ids = [
    "m1BOperationalLiveNegativeControls",
    "m1BOperationalLiveNegativeArmToken",
    "m1BOperationalLiveNegativeArmBtn",
    "m1BOperationalLiveNegativeRunBtn",
    "m1BOperationalLiveNegativeCopyBtn",
    "m1BOperationalLiveNegativeStatus"
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [id, document?.getElementById?.(id)])
  );
  if (
    ids.some((id) => !elements[id]) || typeof performDenial !== "function"
  ) fail("Live-negative response panel is unavailable.");
  const writeClipboard = typeof clipboard?.writeText === "function"
    ? (value) => clipboard.writeText(value)
    : async () => {
        throw new Error("Clipboard API unavailable.");
      };
  const capture = createM1BOperationalLiveNegativeResponseCapture({
    location,
    getRuntimeState,
    ...(now ? { now } : {})
  });
  let busy = false;
  const statusMessage = (state) => ({
    idle: "Paste the current live-negative arm token. Arming submits nothing.",
    armed: state.readOnly
      ? "Read-only denial armed. Run the fixed cross-role probe."
      : "Offer denial armed. Run the probe and approve the exact wallet confirmation.",
    running: state.readOnly
      ? "Fixed read-only fail-closed probe is in progress."
      : "Wallet confirmation and fail-closed denial are in progress.",
    ready: "One exact live-negative receipt is ready to copy.",
    consumed: "Live-negative receipt copied and removed from page memory.",
    failed: "Live-negative capture failed closed. Obtain a fresh CLI token."
  }[state.phase] ?? "Live-negative capture unavailable.");
  const render = (state) => {
    elements.m1BOperationalLiveNegativeControls.hidden = !state.runtimeAvailable;
    elements.m1BOperationalLiveNegativeArmToken.disabled = busy || state.phase === "ready";
    elements.m1BOperationalLiveNegativeArmBtn.disabled = busy || state.phase === "ready";
    elements.m1BOperationalLiveNegativeRunBtn.disabled = busy || state.phase !== "armed";
    elements.m1BOperationalLiveNegativeCopyBtn.disabled = busy || state.phase !== "ready";
    elements.m1BOperationalLiveNegativeStatus.textContent = statusMessage(state);
    elements.m1BOperationalLiveNegativeControls.dataset.captureState = state.phase;
  };
  capture.subscribe(render);

  elements.m1BOperationalLiveNegativeArmBtn.addEventListener("click", () => {
    try {
      capture.arm(elements.m1BOperationalLiveNegativeArmToken.value);
      announce("M1-B live-negative capture armed. No request was submitted.");
    } catch {
      capture.invalidate("arm_rejected");
      announce("M1-B live-negative arm rejected. No request was submitted.");
    } finally {
      elements.m1BOperationalLiveNegativeArmToken.value = "";
    }
  });
  elements.m1BOperationalLiveNegativeRunBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    render(capture.snapshot());
    try {
      const attempt = capture.begin();
      const result = await performDenial(attempt);
      if (!capture.complete(result)) throw new Error("Live denial was rejected.");
    } catch {
      capture.invalidate("denial_action_failed");
      announce("M1-B live-negative probe failed closed. Obtain a fresh CLI token.");
    } finally {
      busy = false;
      render(capture.snapshot());
    }
  });
  elements.m1BOperationalLiveNegativeCopyBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    render(capture.snapshot());
    try {
      const value = capture.consume();
      await writeClipboard(JSON.stringify(value));
      announce("M1-B live-negative receipt copied and removed from page memory.");
    } catch {
      announce("M1-B live-negative copy failed closed; the observation cannot be reused.");
    } finally {
      busy = false;
      render(capture.snapshot());
    }
  });
  return capture;
}
