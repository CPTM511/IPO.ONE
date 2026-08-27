const AVAILABLE = Object.freeze({
  state: "available",
  reason: null,
  recoveryCondition: null
});

function view(label, eyebrow, { pageTitle = label, capability = AVAILABLE } = {}) {
  return Object.freeze({
    label,
    eyebrow,
    pageTitle,
    capability
  });
}

function entry(viewId, placement) {
  return Object.freeze({
    allowed: true,
    placement,
    viewId
  });
}

function workspace(defaultView, views) {
  return Object.freeze({
    defaultView,
    views: Object.freeze(views)
  });
}

export const WORKSPACE_NAVIGATION_MANIFEST = Object.freeze({
  schemaVersion: "workspace_navigation_manifest.v1",
  views: Object.freeze({
    overview: view("Home", "Private credit workspace", {
      pageTitle: "Your portfolio overview"
    }),
    "request-credit": view("Credit", "Human entry · shared kernel"),
    "secured-pool": view("Secured Pool", "Base Sepolia · read-only test assets", {
      pageTitle: "Secured Pool market and positions"
    }),
    "repay-settle": view("Repay & Settle", "Obligation workspace"),
    "credit-passport": view("Credit Passport", "Explainable Decision Evidence"),
    obligations: view("Obligations", "Shared obligation kernel"),
    "agent-console": view("Agent Console", "Principal-controlled workspace"),
    "capital-partners": view("Capital Partners", "Synthetic bilateral marketplace"),
    "capital-network": view("Provider Network", "Provider sandbox boundary"),
    "trading-capital": view("Trading Capital", "Hyperliquid MVP · local no-funds"),
    "wallet-permissions": view("Wallet & Permissions", "Authentication + execution boundaries"),
    "activity-proofs": view("Activity & Proofs", "Protocol Evidence"),
    "credit-track-record": view("Credit Track Record", "Evidence-derived record"),
    "reports-exports": view("Reports & Exports", "Artifact maturity"),
    "risk-operations": view("Risk & Operations", "Permissioned controls"),
    architecture: view("Architecture", "Machine-readable protocol")
  }),
  workspaces: Object.freeze({
    borrower: workspace("overview", [
      entry("overview", "primary"),
      entry("request-credit", "primary"),
      entry("secured-pool", "primary"),
      entry("obligations", "primary"),
      entry("activity-proofs", "advanced"),
      entry("repay-settle", "advanced"),
      entry("credit-passport", "advanced"),
      entry("wallet-permissions", "advanced"),
      entry("credit-track-record", "advanced"),
      entry("reports-exports", "advanced")
    ]),
    controller: workspace("overview", [
      entry("overview", "primary"),
      entry("request-credit", "primary"),
      entry("secured-pool", "primary"),
      entry("agent-console", "primary"),
      entry("obligations", "advanced"),
      entry("wallet-permissions", "advanced"),
      entry("activity-proofs", "advanced"),
      entry("credit-track-record", "advanced"),
      entry("reports-exports", "advanced"),
      entry("architecture", "advanced")
    ]),
    risk: workspace("risk-operations", [
      entry("risk-operations", "primary")
    ]),
    capitalPartner: workspace("capital-partners", [
      entry("capital-partners", "primary")
    ])
  })
});

const FAIL_CLOSED_WORKSPACE = workspace("overview", [
  entry("overview", "primary")
]);

function selectedWorkspace(workspaceName) {
  return typeof workspaceName === "string"
    ? WORKSPACE_NAVIGATION_MANIFEST.workspaces[workspaceName] ?? FAIL_CLOSED_WORKSPACE
    : FAIL_CLOSED_WORKSPACE;
}

export function workspaceViewCatalog() {
  return WORKSPACE_NAVIGATION_MANIFEST.views;
}

export function workspaceSurfaceAccess(workspaceName) {
  const selected = selectedWorkspace(workspaceName);
  const entries = new Map(selected.views.map((item) => [item.viewId, item]));
  const allowedViews = new Set(
    selected.views.filter((item) => item.allowed).map((item) => item.viewId)
  );
  const primaryViews = new Set(
    selected.views
      .filter((item) => item.allowed && item.placement === "primary")
      .map((item) => item.viewId)
  );
  const advancedViews = new Set(
    selected.views
      .filter((item) => item.allowed && item.placement === "advanced")
      .map((item) => item.viewId)
  );
  return Object.freeze({
    defaultView: selected.defaultView,
    entries,
    primaryViews,
    advancedViews,
    allowedViews,
    // Compatibility for callers that only need addressability. Placement is
    // deliberately separate and must never remove an allowed entry point.
    visibleViews: new Set(allowedViews)
  });
}

export function canonicalWorkspaceView(workspaceName, requestedView) {
  const access = workspaceSurfaceAccess(workspaceName);
  return access.allowedViews.has(requestedView)
    ? requestedView
    : access.defaultView;
}
