import {
  M1BAcceptanceNormalResponseCaptureError,
  createM1BAcceptanceNormalResponseCapture
} from "./m1-b-acceptance-normal-response-capture.js";

function fail(message) {
  throw new M1BAcceptanceNormalResponseCaptureError(
    "m1_b_capture_unavailable",
    message
  );
}

export function installM1BAcceptanceNormalResponseCapturePanel({
  document,
  location,
  getRuntimeState,
  performRead,
  clipboard,
  announce = () => {},
  now
}) {
  const ids = [
    "m1BAcceptanceCapturePanel",
    "m1BAcceptanceArmToken",
    "m1BAcceptanceArmBtn",
    "m1BAcceptanceRunReadBtn",
    "m1BAcceptanceCopyResponseBtn",
    "m1BAcceptanceCaptureStatus"
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [id, document?.getElementById?.(id)])
  );
  if (
    ids.some((id) => !elements[id]) || typeof performRead !== "function"
  ) fail("Normal-response capture panel is unavailable.");
  const writeClipboard = typeof clipboard?.writeText === "function"
    ? (value) => clipboard.writeText(value)
    : async () => {
        throw new Error("Clipboard API unavailable.");
      };
  const capture = createM1BAcceptanceNormalResponseCapture({
    location,
    getRuntimeState,
    ...(now ? { now } : {})
  });
  let busy = false;
  const statusMessage = (state) => ({
    idle: "Paste the current CLI arm token. No request is triggered by arming.",
    armed: state.readOnly
      ? `Armed for ${state.operationId}. Use Run armed read.`
      : `Armed for ${state.operationId}. Use the normal product action.`,
    ready: "One exact safe response is ready to copy.",
    consumed: "Response copied and removed from page memory. This challenge cannot be reused.",
    failed: "Capture failed closed. Obtain and arm the current CLI token again."
  }[state.phase] ?? "Capture unavailable.");
  const renderPanel = (state) => {
    const panel = elements.m1BAcceptanceCapturePanel;
    panel.hidden = !state.runtimeAvailable;
    elements.m1BAcceptanceArmToken.disabled = busy || state.phase === "ready";
    elements.m1BAcceptanceArmBtn.disabled = busy || state.phase === "ready";
    elements.m1BAcceptanceRunReadBtn.hidden = !state.readOnly;
    elements.m1BAcceptanceRunReadBtn.disabled = busy || state.phase !== "armed";
    elements.m1BAcceptanceCopyResponseBtn.disabled = busy || state.phase !== "ready";
    elements.m1BAcceptanceCaptureStatus.textContent = statusMessage(state);
    panel.dataset.captureState = state.phase;
  };
  capture.subscribe(renderPanel);

  elements.m1BAcceptanceArmBtn.addEventListener("click", () => {
    try {
      capture.arm(elements.m1BAcceptanceArmToken.value);
      announce("M1-B safe response capture armed. No request was submitted.");
    } catch {
      capture.invalidate("arm_rejected");
      announce("M1-B capture token rejected. No request was submitted.");
    } finally {
      elements.m1BAcceptanceArmToken.value = "";
    }
  });
  elements.m1BAcceptanceRunReadBtn.addEventListener("click", async () => {
    const operationId = capture.armedReadOperation();
    if (!operationId || busy) return;
    busy = true;
    renderPanel(capture.snapshot());
    try {
      await performRead(operationId);
      if (capture.snapshot().phase === "armed") {
        capture.invalidate("read_response_missing");
      }
    } catch {
      capture.invalidate("read_action_failed");
    } finally {
      busy = false;
      renderPanel(capture.snapshot());
    }
  });
  elements.m1BAcceptanceCopyResponseBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    renderPanel(capture.snapshot());
    try {
      const response = capture.consume();
      await writeClipboard(JSON.stringify(response));
      announce("M1-B safe response copied and removed from page memory.");
    } catch {
      announce("M1-B response copy failed closed; the observation cannot be reused.");
    } finally {
      busy = false;
      renderPanel(capture.snapshot());
    }
  });
  return capture;
}
