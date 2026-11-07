// Stable summaries over server error codes. This changes presentation only;
// callers retain the original code/status/requestId and existing deny logic.
const AUTHENTICATION = new Set(["authentication_required", "authentication_session_expired", "authentication_session_rejected", "authenticated_session_ended", "invalid_session", "session_expired"]);
const ACCESS = new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]);
const STALE = new Set(["credit_offer_expired", "credit_offer_terms_changed", "review_binding_invalid", "request_credit_review_stale", "aggregate_version_conflict", "idempotency_conflict"]);
export function workspaceKindLabel(kind) {
  // An accountable role must not share the monetary "Principal" label.
  return { human_borrower: "Borrower", principal_controller: "Principal Controller" }[kind] ?? "another role";
}
export function workspaceSessionPresentation(expectedKind, receivedKind) {
  const expected = workspaceKindLabel(expectedKind);
  const received = workspaceKindLabel(receivedKind);
  return {
    requiredTitle: `${expected} session required`,
    requiredMessage: `This page requires the ${expected} role. End the current ${received} session, then sign in again on this workspace.`,
    switchMessage: `The browser is signed in as ${received}, while this page requires ${expected}. Switching signs out the current role and requires a fresh wallet signature.`,
    switchAction: `Switch to ${expected} session`,
    receivedWorkspaceMessage: `This ${expected} workspace received a ${received} session from another local port. Switch roles and sign in again; permissions will not be widened automatically.`,
    detectedTitle: `${received} session detected`,
    cookieMismatchMessage: `This page requires the ${expected} role, but the shared host cookie currently identifies a ${received} session. Switch sessions, then sign in again with your connected wallet.`,
    receivedFromOtherPortMessage: `This page received a ${received} session from another local workspace. Switch roles and sign in again.`
  };
}
export const PRODUCT_ERROR_COPY = Object.freeze({
  session: "Your secure session ended. Sign in again, then reload your record before retrying an action.",
  access: "This record is unavailable or you do not have permission to access it. Check the selected account and role.",
  stale: "The reviewed terms or server state changed. Reload and review the current terms before confirming again.",
  restriction: "The sign-in service has explicitly restricted access. Review the service notice or contact support; do not bypass the restriction.",
  rate: "Too many requests. Wait before trying again; check your record before repeating any financial action.",
  invalid: "Some request details are invalid. Check the highlighted fields and exact terms before submitting again.",
  unknown: "The result could not be confirmed. Reload the server record before retrying any action that could create or repay an Obligation."
});
export const AUTHENTICATION_ERROR_COPY = Object.freeze({
  unavailable: "Sign-in service unavailable. Check your connection or the service notice before trying again.",
  rejected: "Sign-in was rejected. Check the selected wallet account and workspace role before starting again.",
  rate: "Too many sign-in attempts. Wait before trying again.",
  other: "Sign-in could not be completed. Review the original service notice before trying again."
});
export function authenticationErrorCopy(error) {
  if (new Set(["country_restricted", "region_restricted", "provider_access_restricted", "jurisdiction_restricted"]).has(error?.code)) return PRODUCT_ERROR_COPY.restriction;
  if (error?.code === "authentication_unavailable" || error?.status >= 500) return AUTHENTICATION_ERROR_COPY.unavailable;
  if (error?.status === 401) return AUTHENTICATION_ERROR_COPY.rejected;
  if (error?.status === 429) return AUTHENTICATION_ERROR_COPY.rate;
  return AUTHENTICATION_ERROR_COPY.other;
}
export function productErrorCopy(error) {
  const code = error?.code;
  if (AUTHENTICATION.has(code) || error?.status === 401) return PRODUCT_ERROR_COPY.session;
  if (ACCESS.has(code)) return PRODUCT_ERROR_COPY.access;
  if (STALE.has(code) || error?.status === 409) return PRODUCT_ERROR_COPY.stale;
  if (new Set(["country_restricted", "region_restricted", "provider_access_restricted", "jurisdiction_restricted"]).has(code)) return PRODUCT_ERROR_COPY.restriction;
  if (error?.status === 429) return PRODUCT_ERROR_COPY.rate;
  if (error?.status === 400 || error?.status === 422) return PRODUCT_ERROR_COPY.invalid;
  return PRODUCT_ERROR_COPY.unknown;
}
