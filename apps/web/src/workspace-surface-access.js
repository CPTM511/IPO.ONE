const WORKSPACE_SURFACES = Object.freeze({
  borrower: Object.freeze({
    defaultView: "overview",
    primaryViews: Object.freeze([
      "overview",
      "request-credit",
      "obligations",
      "activity-proofs"
    ]),
    allowedViews: Object.freeze([
      "overview",
      "request-credit",
      "repay-settle",
      "credit-passport",
      "obligations",
      "wallet-permissions",
      "activity-proofs",
      "credit-track-record",
      "reports-exports"
    ])
  }),
  controller: Object.freeze({
    defaultView: "overview",
    primaryViews: Object.freeze([
      "overview",
      "request-credit",
      "agent-console",
      "obligations"
    ]),
    allowedViews: Object.freeze([
      "overview",
      "request-credit",
      "obligations",
      "agent-console",
      "wallet-permissions",
      "activity-proofs",
      "credit-track-record",
      "reports-exports",
      "architecture"
    ])
  }),
  risk: Object.freeze({
    defaultView: "risk-operations",
    primaryViews: Object.freeze(["risk-operations"]),
    allowedViews: Object.freeze(["risk-operations"])
  }),
  capitalPartner: Object.freeze({
    defaultView: "capital-partners",
    primaryViews: Object.freeze(["capital-partners"]),
    allowedViews: Object.freeze(["capital-partners"])
  })
});

const FAIL_CLOSED_SURFACES = Object.freeze({
  defaultView: "overview",
  primaryViews: Object.freeze(["overview"]),
  allowedViews: Object.freeze(["overview"])
});

export function workspaceSurfaceAccess(workspaceName) {
  const policy = typeof workspaceName === "string"
    ? WORKSPACE_SURFACES[workspaceName]
    : undefined;
  const selected = policy ?? FAIL_CLOSED_SURFACES;
  return Object.freeze({
    defaultView: selected.defaultView,
    primaryViews: new Set(selected.primaryViews),
    allowedViews: new Set(selected.allowedViews),
    // Retain the original public shape for callers that only need to know
    // whether a destination is addressable. Primary navigation is deliberately
    // narrower than contextual routing.
    visibleViews: new Set(selected.allowedViews)
  });
}

export function canonicalWorkspaceView(workspaceName, requestedView) {
  const access = workspaceSurfaceAccess(workspaceName);
  return access.allowedViews.has(requestedView)
    ? requestedView
    : access.defaultView;
}
