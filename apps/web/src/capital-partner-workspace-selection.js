const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

function invalid(message) {
  throw new TypeError(`Capital Partner workspace response is invalid: ${message}`);
}

function exactKeys(value, keys) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function normalizeApplication(item) {
  if (
    !exactKeys(item, ["resource", "reviewContext", "summary"]) ||
    !exactKeys(item.resource, ["resourceType", "resourceId"]) ||
    item.resource.resourceType !== "credit_passport_artifact" ||
    !IDENTIFIER_PATTERN.test(item.resource.resourceId) ||
    !exactKeys(item.reviewContext, ["creditIntentId", "artifactHash", "artifactVersion"]) ||
    !IDENTIFIER_PATTERN.test(item.reviewContext.creditIntentId) ||
    !HASH_PATTERN.test(item.reviewContext.artifactHash) ||
    !Number.isSafeInteger(item.reviewContext.artifactVersion) ||
    item.reviewContext.artifactVersion < 1 ||
    !exactKeys(item.summary, ["claimCount", "purpose", "issuedAt", "expiresAt"]) ||
    !Number.isSafeInteger(item.summary.claimCount) ||
    item.summary.claimCount < 1 ||
    item.summary.claimCount > 9 ||
    item.summary.purpose !== "private_credit_review" ||
    !validDate(item.summary.issuedAt) ||
    !validDate(item.summary.expiresAt)
  ) invalid("authorized application shape");
  return Object.freeze(structuredClone(item));
}

export function createCapitalPartnerInboxSelection(inboxResponse) {
  if (
    !exactKeys(inboxResponse, [
      "items",
      "count",
      "hasMore",
      "fundsAuthority",
      "serverTruth",
      "readOnly",
      "schemaVersion"
    ]) ||
    !Array.isArray(inboxResponse.items) ||
    inboxResponse.items.length > 16 ||
    inboxResponse.count !== inboxResponse.items.length ||
    inboxResponse.hasMore !== false ||
    inboxResponse.fundsAuthority !== false ||
    inboxResponse.serverTruth !== true ||
    inboxResponse.readOnly !== true ||
    inboxResponse.schemaVersion !== "tenant_capital_partner_passport_inbox_view.v1"
  ) invalid("authorized Inbox shape");

  const applications = Object.freeze(inboxResponse.items.map(normalizeApplication));
  const ids = new Set(applications.map(({ resource }) => resource.resourceId));
  if (ids.size !== applications.length) invalid("duplicate authorized application");
  return Object.freeze({
    applications,
    status: applications.length === 0
      ? "empty"
      : applications.length === 1
        ? "selected"
        : "choice_required",
    selected: applications.length === 1 ? applications[0] : null
  });
}

export function createCapitalPartnerWorkspaceSelection(selfResponse, inboxResponse) {
  if (
    !exactKeys(selfResponse, [
      "resource",
      "profile",
      "fundsAuthority",
      "serverTruth",
      "readOnly",
      "schemaVersion"
    ]) ||
    !exactKeys(selfResponse.resource, ["resourceType", "resourceId"]) ||
    selfResponse.resource.resourceType !== "capital_partner_profile" ||
    !IDENTIFIER_PATTERN.test(selfResponse.resource.resourceId) ||
    !exactKeys(selfResponse.profile, ["capitalPartnerId", "displayName"]) ||
    selfResponse.profile.capitalPartnerId !== selfResponse.resource.resourceId ||
    typeof selfResponse.profile.displayName !== "string" ||
    selfResponse.profile.displayName.trim().length < 1 ||
    selfResponse.profile.displayName.length > 160 ||
    selfResponse.fundsAuthority !== false ||
    selfResponse.serverTruth !== true ||
    selfResponse.readOnly !== true ||
    selfResponse.schemaVersion !== "tenant_capital_partner_self_view.v1"
  ) invalid("own Profile shape");
  const inbox = createCapitalPartnerInboxSelection(inboxResponse);
  return Object.freeze({
    profile: Object.freeze(structuredClone(selfResponse.profile)),
    resource: Object.freeze(structuredClone(selfResponse.resource)),
    ...inbox
  });
}

export function chooseCapitalPartnerApplication(applications, resourceId) {
  if (!Array.isArray(applications) || !IDENTIFIER_PATTERN.test(resourceId ?? "")) {
    invalid("application selection");
  }
  const matches = applications.filter(
    ({ resource }) => resource.resourceId === resourceId
  );
  if (matches.length !== 1) invalid("application selection is not exact");
  return matches[0];
}

export function sameCapitalPartnerApplication(left, right) {
  return Boolean(left && right) &&
    left.resource?.resourceType === "credit_passport_artifact" &&
    right.resource?.resourceType === "credit_passport_artifact" &&
    left.resource.resourceId === right.resource.resourceId &&
    left.reviewContext?.creditIntentId === right.reviewContext?.creditIntentId &&
    left.reviewContext?.artifactHash === right.reviewContext?.artifactHash &&
    left.reviewContext?.artifactVersion === right.reviewContext?.artifactVersion;
}

export function capitalPartnerApplicationLabel(application, position) {
  const issued = new Date(application.summary.issuedAt);
  const expires = new Date(application.summary.expiresAt);
  if (
    !Number.isSafeInteger(position) ||
    position < 1 ||
    !Number.isFinite(issued.getTime()) ||
    !Number.isFinite(expires.getTime())
  ) {
    invalid("application label");
  }
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
  return `Application ${position} · shared ${date.format(issued)} · expires ${date.format(expires)} · ${application.summary.claimCount} verified claim${application.summary.claimCount === 1 ? "" : "s"}`;
}
