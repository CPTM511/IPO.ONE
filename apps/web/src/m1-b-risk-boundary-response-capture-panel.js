import {
  M1BRiskBoundaryResponseCaptureError,
  createM1BRiskBoundaryResponseCapture
} from "./m1-b-risk-boundary-response-capture.js";

function fail(message) {
  throw new M1BRiskBoundaryResponseCaptureError(
    "m1_b_risk_boundary_unavailable",
    message
  );
}

export function installM1BRiskBoundaryResponseCapturePanel({
  document,
  location,
  getRuntimeState,
  performBoundary,
  announce = () => {},
  now
}) {
  const ids = [
    "m1BRiskBoundaryControls",
    "m1BRiskBoundaryArmToken",
    "m1BRiskBoundaryArmBtn",
    "m1BRiskBoundaryRunBtn",
    "m1BRiskBoundaryStatus"
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [id, document?.getElementById?.(id)])
  );
  if (ids.some((id) => !elements[id]) || typeof performBoundary !== "function") {
    fail("Risk boundary capture panel is unavailable.");
  }
  const capture = createM1BRiskBoundaryResponseCapture({
    location,
    getRuntimeState,
    ...(now ? { now } : {})
  });
  let busy = false;
  const statusMessage = (state) => ({
    idle: "Paste the current CLI Risk boundary arm token. Arming submits nothing.",
    armed: "Risk boundary armed. Run the two fixed fail-closed probes once.",
    running: "The two fixed Risk probes are in progress.",
    consumed: "Both exact denials were observed. Response bodies were discarded.",
    failed: "Risk boundary capture failed closed. Obtain a fresh CLI token."
  }[state.phase] ?? "Risk boundary capture unavailable.");
  const renderPanel = (state) => {
    elements.m1BRiskBoundaryControls.hidden = !state.runtimeAvailable;
    elements.m1BRiskBoundaryArmToken.disabled =
      busy || state.phase === "armed" || state.phase === "running";
    elements.m1BRiskBoundaryArmBtn.disabled =
      busy || state.phase === "armed" || state.phase === "running";
    elements.m1BRiskBoundaryRunBtn.disabled = busy || state.phase !== "armed";
    elements.m1BRiskBoundaryStatus.textContent = statusMessage(state);
    elements.m1BRiskBoundaryControls.dataset.captureState = state.phase;
  };
  capture.subscribe(renderPanel);

  elements.m1BRiskBoundaryArmBtn.addEventListener("click", () => {
    try {
      capture.arm(elements.m1BRiskBoundaryArmToken.value);
      announce("M1-B Risk boundary armed. No request was submitted.");
    } catch {
      capture.invalidate("arm_rejected");
      announce("M1-B Risk boundary token rejected. No request was submitted.");
    } finally {
      elements.m1BRiskBoundaryArmToken.value = "";
    }
  });
  elements.m1BRiskBoundaryRunBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    renderPanel(capture.snapshot());
    try {
      const attempt = capture.begin();
      const result = await performBoundary(attempt);
      if (!capture.complete(result)) {
        throw new Error("Risk boundary result was rejected.");
      }
      announce(
        "M1-B Risk boundary observed both exact denials and discarded their responses."
      );
    } catch {
      capture.invalidate("probe_action_failed");
      announce("M1-B Risk boundary failed closed. Obtain a fresh CLI token.");
    } finally {
      busy = false;
      renderPanel(capture.snapshot());
    }
  });
  return capture;
}
