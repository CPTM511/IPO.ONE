/* Pre-paint presentation only; no identity, authority or business state. */
(() => {
  const root = document.documentElement;
  const review = new URLSearchParams(location.search).get("founder_review");
  if (review === "web-012b" || (root.hasAttribute("data-ipo-startup") && (!review || review === "web-026"))) root.dataset.ipoReview = "web-012b";
  if (root.hasAttribute("data-ipo-startup")) {
    // This server hint selects only the initial canvas; it grants no access.
    if (document.querySelector('meta[name="ipo-one-csrf-token"]')?.content) root.dataset.ipoStartupSurface = "workspace";
    let feedbackTimer;
    let feedbackFrame;
    const cancelFeedback = () => {
      clearTimeout(feedbackTimer);
      cancelAnimationFrame(feedbackFrame);
    };
    const waitForPaint = () => {
      if (root.dataset.ipoStartup !== "loading") return;
      if (!document.getElementById("appStartup")?.getClientRects().length) {
        feedbackFrame = requestAnimationFrame(waitForPaint);
        return;
      }
      // Fast loads reveal the page directly. Start the delay at the styled
      // canvas, so a slow stylesheet cannot cause a one-frame loading flash.
      feedbackTimer = setTimeout(() => {
        if (root.dataset.ipoStartup === "loading") root.dataset.ipoStartup = "waiting";
      }, 1200);
    };
    feedbackFrame = requestAnimationFrame(waitForPaint);
    let failureMessage;
    const applyStartupFailure = () => {
      if (!failureMessage || !document.body) return;
      // This recovery must work even if all product styles failed to load.
      // Trusted property assignments preserve the strict no-inline-styles CSP.
      if (stylesheetFailed) {
        for (const child of document.body.children) {
          if (child.id !== "appStartup") child.style.setProperty("display", "none", "important");
        }
        const frame = document.getElementById("appStartup");
        if (!frame) return;
        const dark = root.dataset.ipoTheme === "dark";
        for (const [key, value] of Object.entries({display:"block", minHeight:"100vh", padding:"48px", boxSizing:"border-box", background:dark?"#0d1419":"#f4f7f6", color:dark?"#edf3f2":"#152420"})) frame.style[key] = value;
        for (const id of ["appStartupTitle", "appStartupStatus", "appStartupReload"]) document.getElementById(id)?.style.setProperty("display", "block", "important");
      }
      const status = document.getElementById("appStartupStatus");
      if (status) status.textContent = failureMessage;
    };
    document.addEventListener("DOMContentLoaded", applyStartupFailure, {once:true});
    const failed = (message) => {
      if (root.dataset.ipoStartup === "ready") return;
      cancelFeedback();
      root.dataset.ipoStartup = "failed";
      failureMessage = message;
      applyStartupFailure();
    };
    const timer = setTimeout(() => failed("Loading is taking longer than expected. Check your connection and reload to try again."), 20000);
    let workspaceReady = false;
    let stylesheetFailed = false;
    const revealWorkspace = () => {
      if (!workspaceReady || stylesheetFailed || !document.getElementById("ipoWorkspaceStyles")?.sheet) return;
      clearTimeout(timer);
      cancelFeedback();
      root.dataset.ipoStartup = "ready";
    };
    document.addEventListener("ipo-workspace-ready", () => {
      workspaceReady = true;
      revealWorkspace();
    }, { once: true });
    window.addEventListener("load", event => {
      if (event.target === document.getElementById("ipoWorkspaceStyles")) revealWorkspace();
    }, true);
    document.addEventListener("ipo-workspace-failed", () => {
      clearTimeout(timer);
      failed("IPO.ONE could not finish loading. Reload to try again.");
    }, { once: true });
    window.addEventListener("error", event => {
      // The browser reports a failed module graph on its entry script. Wallet
      // extensions and optional scripts must not fail the workspace or cancel
      // its stalled-load recovery while the application is still starting.
      if (event.target === document.getElementById("ipoWorkspaceStyles")) {
        stylesheetFailed = true;
        clearTimeout(timer);
        failed("The current IPO.ONE interface could not load. Reload to try again.");
      }
      if (event.target instanceof HTMLScriptElement && event.target === document.getElementById("ipoWorkspaceEntry")) {
        clearTimeout(timer);
        failed("IPO.ONE could not finish loading. Reload to try again.");
      }
    }, true);
    document.addEventListener("click", event => {
      if (event.target.closest?.("#appStartupReload")) location.reload();
    });
  }
  const key = "ipo-one-theme";
  const choices = ["system", "light", "dark"];
  const media = matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try { preference = localStorage.getItem(key) ?? localStorage.getItem("ipo-one-whitepaper-theme") ?? "system"; } catch { /* Storage is optional. */ }
  if (!choices.includes(preference)) preference = "system";
  const apply = () => {
    const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.ipoTheme = resolved;
    document.documentElement.dataset.ipoThemePreference = preference;
    document.dispatchEvent(new CustomEvent("ipo-theme-change", { detail: { preference, resolved } }));
  };
  document.addEventListener("ipo-theme-select", ({ detail }) => {
    if (!choices.includes(detail)) return;
    preference = detail;
    try { localStorage.setItem(key, preference); } catch { /* Keep the in-memory selection. */ }
    apply();
  });
  media.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    preference = choices.includes(event.newValue) ? event.newValue : "system";
    apply();
  });
  apply();
})();
