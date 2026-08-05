import { createServicingCasePresentation } from "./servicing-case-presentation.js";

export const SERVICING_POSITION_INDEX_VERSION = "servicing_position_index.v1";
export const SERVICING_POSITION_INDEX_LIMIT = 8;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const WORKSPACE_RESOURCE_TYPES = new Set([
  "subject",
  "consent",
  "credit_intent",
  "mandate",
  "obligation"
]);
const WORKSPACE_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const WORKSPACE_KINDS = new Set(["human_borrower", "principal_controller"]);

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedRecord(value, required, optional = []) {
  if (!plainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value");
  });
}

function validTimestamp(value) {
  return typeof value === "string" &&
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime());
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeWorkspace(workspace) {
  if (
    !closedRecord(
      workspace,
      ["workspaceKind", "resources", "hasMore", "serverTruth", "schemaVersion"],
      ["continuationReceipts", "controlledAgentActorIds"]
    ) ||
    !WORKSPACE_KINDS.has(workspace.workspaceKind) ||
    workspace.serverTruth !== true ||
    workspace.schemaVersion !== "tenant_workspace_resume_view.v1" ||
    typeof workspace.hasMore !== "boolean" ||
    !Array.isArray(workspace.resources) ||
    workspace.resources.length > 32
  ) return null;
  if (
    workspace.continuationReceipts !== undefined &&
    (!Array.isArray(workspace.continuationReceipts) || workspace.continuationReceipts.length !== 0)
  ) return null;
  if (workspace.controlledAgentActorIds !== undefined) {
    if (
      workspace.workspaceKind !== "principal_controller" ||
      !Array.isArray(workspace.controlledAgentActorIds) ||
      workspace.controlledAgentActorIds.length > 8 ||
      new Set(workspace.controlledAgentActorIds).size !== workspace.controlledAgentActorIds.length ||
      workspace.controlledAgentActorIds.some((actorId) => !IDENTIFIER.test(actorId ?? ""))
    ) return null;
  }

  const resources = [];
  const keys = new Set();
  for (const resource of workspace.resources) {
    if (
      !closedRecord(resource, ["resourceType", "resourceId", "relationship"]) ||
      !WORKSPACE_RESOURCE_TYPES.has(resource.resourceType) ||
      !IDENTIFIER.test(resource.resourceId ?? "") ||
      !WORKSPACE_RELATIONSHIPS.has(resource.relationship)
    ) return null;
    const key = `${resource.resourceType}:${resource.resourceId}`;
    if (keys.has(key)) return null;
    keys.add(key);
    resources.push({
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      relationship: resource.relationship
    });
  }
  return {
    workspaceKind: workspace.workspaceKind,
    resources,
    hasMore: workspace.hasMore
  };
}

function normalizeOwnedView(view, expectedObligationId) {
  if (
    !closedRecord(
      view,
      [
        "obligation",
        "asOf",
        "sandboxOnly",
        "productionFundsMoved",
        "withdrawable",
        "schemaVersion"
      ],
      ["latestServicingAction"]
    ) ||
    view.schemaVersion !== "tenant_owned_obligation_view.v1" ||
    view.sandboxOnly !== true ||
    view.productionFundsMoved !== false ||
    view.withdrawable !== false ||
    !validTimestamp(view.asOf) ||
    view.obligation?.obligationId !== expectedObligationId
  ) return null;

  const presentation = createServicingCasePresentation(
    view.obligation,
    view.latestServicingAction
  );
  if (
    !presentation ||
    new Date(view.asOf).getTime() < new Date(presentation.servicingEffectiveAt).getTime()
  ) return null;
  return { presentation, asOf: view.asOf };
}

export function acceptServicingPositionRefresh(previousView, nextView) {
  const obligationId = nextView?.obligation?.obligationId;
  if (!IDENTIFIER.test(obligationId ?? "")) return null;
  const next = normalizeOwnedView(nextView, obligationId);
  if (!next) return null;
  if (previousView !== undefined && previousView !== null) {
    const previous = normalizeOwnedView(previousView, obligationId);
    if (
      !previous ||
      new Date(next.asOf).getTime() < new Date(previous.asOf).getTime() ||
      new Date(next.presentation.servicingEffectiveAt).getTime() <
        new Date(previous.presentation.servicingEffectiveAt).getTime() ||
      next.presentation.scheduleSequence < previous.presentation.scheduleSequence ||
      BigInt(next.presentation.totalRepaidMinor) <
        BigInt(previous.presentation.totalRepaidMinor)
    ) return null;
  }
  return deepFreeze(structuredClone(nextView));
}

export function createServicingPositionIndex(input) {
  if (
    !closedRecord(input, ["workspace", "views"], ["selectedObligationId"]) ||
    !Array.isArray(input.views) ||
    input.views.length > SERVICING_POSITION_INDEX_LIMIT ||
    (input.selectedObligationId !== undefined &&
      input.selectedObligationId !== null &&
      !IDENTIFIER.test(input.selectedObligationId))
  ) return null;

  const workspace = normalizeWorkspace(input.workspace);
  if (!workspace) return null;
  const references = workspace.resources
    .filter(({ resourceType }) => resourceType === "obligation")
    .slice(0, SERVICING_POSITION_INDEX_LIMIT);
  const referenceIds = new Set(references.map(({ resourceId }) => resourceId));
  if (
    input.selectedObligationId !== undefined &&
    input.selectedObligationId !== null &&
    !referenceIds.has(input.selectedObligationId)
  ) return null;

  const views = new Map();
  for (const entry of input.views) {
    if (
      !closedRecord(entry, ["obligationId", "view"]) ||
      !IDENTIFIER.test(entry.obligationId ?? "") ||
      !referenceIds.has(entry.obligationId) ||
      views.has(entry.obligationId)
    ) return null;
    const normalized = normalizeOwnedView(entry.view, entry.obligationId);
    if (!normalized) return null;
    views.set(entry.obligationId, normalized);
  }

  const positions = references.map((reference) => {
    const current = views.get(reference.resourceId);
    if (!current) {
      return {
        obligationId: reference.resourceId,
        relationship: reference.relationship,
        availability: "not_loaded",
        schemaVersion: "servicing_position_summary.v1"
      };
    }
    const { presentation, asOf } = current;
    return {
      obligationId: reference.resourceId,
      relationship: reference.relationship,
      availability: "server_current",
      lifecycleStatus: presentation.lifecycleStatus,
      servicingClassification: presentation.classification,
      daysPastDue: presentation.daysPastDue,
      outstandingMinor: presentation.outstandingMinor,
      pastDueMinor: presentation.pastDueMinor,
      totalRepaidMinor: presentation.totalRepaidMinor,
      nextDueAt: presentation.nextDueAt,
      asOf,
      repaymentAvailable: presentation.repaymentAvailable,
      privilegedDisposition: presentation.privilegedDisposition,
      serverAuthoritative: true,
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "servicing_position_summary.v1"
    };
  });

  const complete = workspace.hasMore === false &&
    references.length === workspace.resources.filter(
      ({ resourceType }) => resourceType === "obligation"
    ).length &&
    positions.every(({ availability }) => availability === "server_current");
  const aggregate = complete
    ? {
        outstandingMinor: String(positions.reduce(
          (sum, position) => sum + BigInt(position.outstandingMinor),
          0n
        )),
        pastDueMinor: String(positions.reduce(
          (sum, position) => sum + BigInt(position.pastDueMinor),
          0n
        )),
        totalRepaidMinor: String(positions.reduce(
          (sum, position) => sum + BigInt(position.totalRepaidMinor),
          0n
        )),
        adversePositionCount: positions.filter(
          ({ daysPastDue }) => Number.isSafeInteger(daysPastDue) && daysPastDue > 0
        ).length,
        schemaVersion: "servicing_position_aggregate.v1"
      }
    : null;

  return deepFreeze({
    workspaceKind: workspace.workspaceKind,
    selectedObligationId: input.selectedObligationId ?? null,
    referenceCount: references.length,
    reviewedCount: views.size,
    coverage: complete ? "complete" : "partial",
    hasMoreReferences: workspace.hasMore ||
      workspace.resources.filter(({ resourceType }) => resourceType === "obligation").length >
        SERVICING_POSITION_INDEX_LIMIT,
    positions,
    aggregate,
    serverAuthoritative: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: SERVICING_POSITION_INDEX_VERSION
  });
}
