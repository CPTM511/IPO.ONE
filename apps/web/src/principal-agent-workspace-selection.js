const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const RESUME_RESOURCE_TYPES = new Set([
  "subject",
  "consent",
  "credit_intent",
  "mandate",
  "obligation"
]);
const RESUME_RESOURCE_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const PRINCIPAL_AGENT_RESOURCE_TYPES = new Set(["subject", "mandate"]);
const CONTINUATION_VIEW_KEYS = new Set([
  "continuationReceiptId",
  "receiptHash",
  "subjectId",
  "mandateId",
  "creditOfferId",
  "creditOfferHash",
  "offerAggregateVersion",
  "expiresAt",
  "receipt",
  "serverTruth",
  "schemaVersion"
]);
const HASH = /^0x[0-9a-f]{64}$/;

function exactUniqueIdentifiers(values) {
  if (!Array.isArray(values)) return null;
  if (values.some((value) => typeof value !== "string" || !IDENTIFIER.test(value))) {
    return null;
  }
  const unique = [...new Set(values)];
  return unique.length === values.length ? unique : null;
}

function exactControlledAgentOptions(value, actorIds) {
  if (!Array.isArray(value) || value.length !== actorIds.length) return null;
  const options = value.map((option) => {
    if (
      !exactObject(option, new Set(["actorId", "label", "setupStatus"])) ||
      !IDENTIFIER.test(option.actorId ?? "") ||
      typeof option.label !== "string" || option.label.length < 1 || option.label.length > 80 ||
      !new Set(["configured", "setup_required"]).has(option.setupStatus)
    ) return null;
    return Object.freeze({
      actorId: option.actorId,
      label: option.label,
      setupStatus: option.setupStatus
    });
  });
  if (options.some((option) => option === null)) return null;
  if (options.some((option, index) => option.actorId !== actorIds[index])) return null;
  return options;
}

function exactObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.has(key));
}

function exactWorkspaceResources(value) {
  if (!Array.isArray(value)) return null;
  if (value.some((resource) => (
    !exactObject(resource, new Set(["resourceType", "resourceId", "relationship"])) ||
    !RESUME_RESOURCE_TYPES.has(resource.resourceType) ||
    typeof resource.resourceId !== "string" ||
    !IDENTIFIER.test(resource.resourceId) ||
    !RESUME_RESOURCE_RELATIONSHIPS.has(resource.relationship)
  ))) return null;
  if (value.some((resource) =>
    PRINCIPAL_AGENT_RESOURCE_TYPES.has(resource.resourceType) &&
    resource.relationship !== "controller"
  )) return null;
  const resources = value.filter((resource) =>
    PRINCIPAL_AGENT_RESOURCE_TYPES.has(resource.resourceType)
  );
  const keys = resources.map(({ resourceType, resourceId }) => `${resourceType}\0${resourceId}`);
  return new Set(keys).size === keys.length ? resources : null;
}

function exactContinuationReceiptView(value) {
  if (
    !exactObject(value, CONTINUATION_VIEW_KEYS) ||
    !IDENTIFIER.test(value.continuationReceiptId ?? "") ||
    !HASH.test(value.receiptHash ?? "") ||
    !IDENTIFIER.test(value.subjectId ?? "") ||
    !IDENTIFIER.test(value.mandateId ?? "") ||
    !IDENTIFIER.test(value.creditOfferId ?? "") ||
    !HASH.test(value.creditOfferHash ?? "") ||
    !Number.isSafeInteger(value.offerAggregateVersion) ||
    value.offerAggregateVersion < 1 ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(new Date(value.expiresAt).getTime()) ||
    value.serverTruth !== true ||
    value.schemaVersion !== "workspace_continuation_receipt_view.v1"
  ) return false;
  const receipt = value.receipt;
  return (
    receipt && typeof receipt === "object" && !Array.isArray(receipt) &&
    receipt.schemaVersion === "agent_credit_offer_workflow_receipt.v1" &&
    receipt.status === "offer_ready" &&
    receipt.subjectId === value.subjectId &&
    receipt.mandateId === value.mandateId &&
    receipt.offer && typeof receipt.offer === "object" && !Array.isArray(receipt.offer) &&
    receipt.offer.creditOfferId === value.creditOfferId &&
    receipt.offer.creditOfferHash === value.creditOfferHash
  );
}

export function selectPrincipalAgentWorkspace(input = {}) {
  if (
    input?.serverTruth !== true ||
    input?.schemaVersion !== "tenant_workspace_resume_view.v2" ||
    input?.workspaceKind !== "principal_controller"
  ) return Object.freeze({ status: "unavailable" });
  if (!exactObject(input, new Set([
    "workspaceKind",
    "resources",
    "controlledAgentActorIds",
    "controlledAgentOptions",
    "selectedAgentActorId",
    "continuationReceipts",
    "hasMore",
    "serverTruth",
    "schemaVersion"
  ]))) return Object.freeze({ status: "ambiguous" });
  if (!Array.isArray(input.continuationReceipts)) {
    return Object.freeze({ status: "ambiguous" });
  }

  const actorIds = exactUniqueIdentifiers(input.controlledAgentActorIds);
  const resources = exactWorkspaceResources(input.resources);
  if (
    !actorIds || !resources ||
    typeof input.hasMore !== "boolean" || input.hasMore
  ) {
    return Object.freeze({ status: "ambiguous" });
  }
  if (actorIds.length === 0) {
    return Object.freeze({
      status: resources.length === 0 && input.continuationReceipts.length === 0
        ? "empty"
        : "ambiguous"
    });
  }
  const hasPickerContract = input.controlledAgentOptions !== undefined ||
    input.selectedAgentActorId !== undefined;
  const options = hasPickerContract
    ? exactControlledAgentOptions(input.controlledAgentOptions, actorIds)
    : undefined;
  if (hasPickerContract && !options) return Object.freeze({ status: "ambiguous" });
  const selectedActorId = input.selectedAgentActorId === null
    ? undefined
    : input.selectedAgentActorId;
  if (
    selectedActorId !== undefined &&
    (typeof selectedActorId !== "string" || !actorIds.includes(selectedActorId))
  ) return Object.freeze({ status: "ambiguous" });
  if (actorIds.length !== 1 && selectedActorId === undefined) {
    if (!options) return Object.freeze({ status: "ambiguous" });
    return Object.freeze({ status: "selection_required", options });
  }
  const actorId = selectedActorId ?? actorIds[0];

  const subjects = resources.filter(({ resourceType }) => resourceType === "subject");
  const mandates = resources.filter(({ resourceType }) => resourceType === "mandate");
  if (subjects.length > 1 || mandates.length > 1) {
    return Object.freeze({ status: "ambiguous" });
  }
  if (mandates.length === 1 && subjects.length !== 1) {
    return Object.freeze({ status: "ambiguous" });
  }
  if (input.continuationReceipts.length > 0) {
    if (
      input.continuationReceipts.length !== 1 ||
      subjects.length !== 1 || mandates.length !== 1 ||
      !exactContinuationReceiptView(input.continuationReceipts[0]) ||
      input.continuationReceipts[0].subjectId !== subjects[0].resourceId ||
      input.continuationReceipts[0].mandateId !== mandates[0].resourceId
    ) return Object.freeze({ status: "ambiguous" });
  }
  return Object.freeze({
    status: "selected",
    actorId,
    subjectId: subjects[0]?.resourceId ?? null,
    mandateId: mandates[0]?.resourceId ?? null,
    ...(options === undefined ? {} : { options })
  });
}
