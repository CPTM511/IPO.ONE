import {
  M1BAcceptanceDenialResponseCaptureError,
  createM1BAcceptanceDenialResponseCapture
} from "./m1-b-acceptance-denial-response-capture.js";

function fail(message) {
  throw new M1BAcceptanceDenialResponseCaptureError(
    "m1_b_denial_capture_unavailable",
    message
  );
}

export function installM1BAcceptanceDenialResponseCapturePanel({
  document,
  location,
  getRuntimeState,
  performDenial,
  clipboard,
  announce = () => {},
  now
}) {
  const ids = [
    "m1BAcceptanceDenialControls",
    "m1BAcceptanceDenialArmToken",
    "m1BAcceptanceDenialArmBtn",
    "m1BAcceptanceRunDenialBtn",
    "m1BAcceptanceCopyDenialBtn",
    "m1BAcceptanceDenialStatus"
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [id, document?.getElementById?.(id)])
  );
  if (
    ids.some((id) => !elements[id]) || typeof performDenial !== "function"
  ) fail("Denial response capture panel is unavailable.");
  const writeClipboard = typeof clipboard?.writeText === "function"
    ? (value) => clipboard.writeText(value)
    : async () => {
        throw new Error("Clipboard API unavailable.");
      };
  const capture = createM1BAcceptanceDenialResponseCapture({
    location,
    getRuntimeState,
    ...(now ? { now } : {})
  });
  let busy = false;
  const statusMessage = (state) => ({
    idle: "Paste the current CLI denial arm token. Arming submits nothing.",
    armed: "Denial armed. Run the visible probe and approve its exact wallet confirmation.",
    running: "Wallet confirmation and fail-closed denial are in progress.",
    ready: "One exact denial receipt is ready to copy.",
    consumed: "Denial copied and removed from page memory.",
    failed: "Denial capture failed closed. Obtain a fresh CLI token."
  }[state.phase] ?? "Denial capture unavailable.");
  const renderPanel = (state) => {
    elements.m1BAcceptanceDenialControls.hidden = !state.runtimeAvailable;
    elements.m1BAcceptanceDenialArmToken.disabled = busy || state.phase === "ready";
    elements.m1BAcceptanceDenialArmBtn.disabled = busy || state.phase === "ready";
    elements.m1BAcceptanceRunDenialBtn.disabled = busy || state.phase !== "armed";
    elements.m1BAcceptanceCopyDenialBtn.disabled = busy || state.phase !== "ready";
    elements.m1BAcceptanceDenialStatus.textContent = statusMessage(state);
    elements.m1BAcceptanceDenialControls.dataset.captureState = state.phase;
  };
  capture.subscribe(renderPanel);

  elements.m1BAcceptanceDenialArmBtn.addEventListener("click", () => {
    try {
      capture.arm(elements.m1BAcceptanceDenialArmToken.value);
      announce("M1-B denial response capture armed. No request was submitted.");
    } catch {
      capture.invalidate("arm_rejected");
      announce("M1-B denial token rejected. No request was submitted.");
    } finally {
      elements.m1BAcceptanceDenialArmToken.value = "";
    }
  });
  elements.m1BAcceptanceRunDenialBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    renderPanel(capture.snapshot());
    try {
      const attempt = capture.begin();
      const result = await performDenial(attempt);
      if (!capture.complete(result)) throw new Error("Denial result was rejected.");
    } catch {
      capture.invalidate("denial_action_failed");
      announce("M1-B denial probe failed closed. Obtain a fresh CLI token.");
    } finally {
      busy = false;
      renderPanel(capture.snapshot());
    }
  });
  elements.m1BAcceptanceCopyDenialBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    renderPanel(capture.snapshot());
    try {
      const response = capture.consume();
      await writeClipboard(JSON.stringify(response));
      announce("M1-B denial receipt copied and removed from page memory.");
    } catch {
      announce("M1-B denial copy failed closed; the observation cannot be reused.");
    } finally {
      busy = false;
      renderPanel(capture.snapshot());
    }
  });
  return capture;
}
