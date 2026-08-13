import {
  canonicalWorkspaceView,
  workspaceSurfaceAccess
} from "./workspace-surface-access.js";

const PRODUCT_VIEW_ALIASES = Object.freeze({
  human: "request-credit",
  risk: "risk-operations"
});

const DOCUMENT_ANCHORS = new Set(["mainContent"]);
export const POST_LOGIN_VIEW_INTENT_TTL_MS = 10 * 60_000;
const POST_LOGIN_VIEW_INTENT_KEYS = Object.freeze([
  "createdAt",
  "schemaVersion",
  "view"
]);

function fragmentValue(fragment) {
  return typeof fragment === "string" ? fragment.replace(/^#/, "") : "";
}

export function resolveWorkspaceLocation(workspaceName, fragment) {
  const requestedFragment = fragmentValue(fragment);
  if (DOCUMENT_ANCHORS.has(requestedFragment)) {
    return Object.freeze({
      kind: "document_anchor",
      fragment: requestedFragment
    });
  }

  const requestedView = PRODUCT_VIEW_ALIASES[requestedFragment] ?? (
    requestedFragment || workspaceSurfaceAccess(workspaceName).defaultView
  );
  const view = canonicalWorkspaceView(workspaceName, requestedView);
  return Object.freeze({
    kind: "product_view",
    view,
    canonicalFragment: view,
    requiresReplace: requestedFragment !== view
  });
}

export function createPostLoginViewIntent(workspaceName, view, createdAt) {
  const location = resolveWorkspaceLocation(workspaceName, view);
  if (
    location.kind !== "product_view" ||
    location.requiresReplace ||
    location.view !== view ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0
  ) {
    throw new TypeError("Post-login view intent is invalid");
  }
  return Object.freeze({
    createdAt,
    schemaVersion: "post_login_view_intent.v1",
    view
  });
}

export function readPostLoginViewIntent(
  workspaceName,
  value,
  { now, ttlMs = POST_LOGIN_VIEW_INTENT_TTL_MS } = {}
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== POST_LOGIN_VIEW_INTENT_KEYS.join("|") ||
    value.schemaVersion !== "post_login_view_intent.v1" ||
    typeof value.view !== "string" ||
    !Number.isSafeInteger(value.createdAt) ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1 ||
    now < value.createdAt ||
    now - value.createdAt > ttlMs
  ) return null;

  const location = resolveWorkspaceLocation(workspaceName, value.view);
  return location.kind === "product_view" &&
    location.requiresReplace === false &&
    location.view === value.view
    ? value.view
    : null;
}
