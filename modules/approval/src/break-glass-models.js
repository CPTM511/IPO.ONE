import { createOperationalId, hashId } from "../../../packages/domain/src/index.js";
import {
  BREAK_GLASS_CUSTODIAN_DECISION_SCHEMA_VERSION,
  BREAK_GLASS_INCIDENT_SCHEMA_VERSION,
  BREAK_GLASS_ACTIVATION_WINDOW_MS,
  BREAK_GLASS_PROHIBITED_ACTION_PREFIXES,
  BREAK_GLASS_PROTECTIVE_ACTIONS,
  BREAK_GLASS_REVIEW_SCHEMA_VERSION,
  MAX_BREAK_GLASS_WINDOW_MS,
  BreakGlassIncidentStatus,
  BreakGlassReviewStatus
} from "./approval-constants.js";
import {
  approvalError,
  assertApprovalIdentifier,
  assertApprovalList,
  assertApprovalReason,
  assertApprovalReferenceHash,
  assertApprovalTimestamp,
  assertApprovalVersion,
  assertNoSensitiveApprovalFields,
  cloneApproval,
  deepFreezeApproval
} from "./approval-utils.js";

const INCIDENT_STATUSES = new Set(Object.values(BreakGlassIncidentStatus));
const HARDWARE_KEY_METHODS = new Set(["hwk", "webauthn", "fido"]);

export function createBreakGlassIncident({
  tenantId,
  reasonCode,
  allowedActions,
  resourceScopes,
  requesterContext,
  custodianActorIds,
  reviewOwnerActorId,
  deploymentApprovalRefHash,
  notificationTargetRefHash,
  maximumSessionMs,
  activationDeadline,
  now
}) {
  const declaredAt = assertApprovalTimestamp("now", now);
  if (
    !Number.isSafeInteger(maximumSessionMs) ||
    maximumSessionMs < 60_000 ||
    maximumSessionMs > MAX_BREAK_GLASS_WINDOW_MS
  ) {
    throw approvalError("invalid_break_glass_window", "break-glass session window is invalid");
  }
  if (requesterContext.tenantId !== tenantId) {
    throw approvalError("break_glass_actor_rejected", "break-glass requester tenant is invalid");
  }
  const actions = assertApprovalList("allowedActions", allowedActions, {
    minimumItems: 1,
    maximumItems: 8
  });
  if (
    actions.some((action) => !BREAK_GLASS_PROTECTIVE_ACTIONS.includes(action)) ||
    actions.some((action) =>
      BREAK_GLASS_PROHIBITED_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))
    )
  ) {
    throw approvalError("break_glass_scope_prohibited", "break-glass action is prohibited");
  }
  if (!Array.isArray(resourceScopes) || resourceScopes.length === 0 || resourceScopes.length > 16) {
    throw approvalError("invalid_break_glass_scope", "break-glass resource scope is invalid");
  }
  const scopes = resourceScopes.map(({ resourceType, resourceId }) => ({
    resourceType: assertApprovalIdentifier("resourceType", resourceType),
    resourceId: assertApprovalIdentifier("resourceId", resourceId)
  }));
  if (
    new Set(scopes.map(({ resourceType, resourceId }) => `${resourceType}\0${resourceId}`)).size !==
    scopes.length
  ) {
    throw approvalError("invalid_break_glass_scope", "break-glass resource scope is duplicated");
  }
  const custodians = assertApprovalList("custodianActorIds", custodianActorIds, {
    minimumItems: 2,
    maximumItems: 2
  });
  const reviewOwner = assertApprovalIdentifier("reviewOwnerActorId", reviewOwnerActorId);
  if (
    custodians.includes(requesterContext.actorId) ||
    custodians.includes(reviewOwner) ||
    requesterContext.actorId === reviewOwner
  ) {
    throw approvalError("invalid_break_glass_configuration", "break-glass duties are not separated");
  }
  const deadline = assertApprovalTimestamp("activationDeadline", activationDeadline);
  if (
    deadline <= declaredAt ||
    deadline.getTime() - declaredAt.getTime() > BREAK_GLASS_ACTIVATION_WINDOW_MS
  ) {
    throw approvalError("invalid_break_glass_window", "break-glass activation window is invalid");
  }
  const breakGlassIncidentId = createOperationalId("break_glass_incident");
  const immutable = {
    breakGlassIncidentId,
    tenantId: assertApprovalIdentifier("tenantId", tenantId),
    reasonCode: assertApprovalReason("reasonCode", reasonCode),
    allowedActions: actions,
    resourceScopes: scopes,
    requestedByActorId: assertApprovalIdentifier("requestedByActorId", requesterContext.actorId),
    requestedByClientId: assertApprovalIdentifier("requestedByClientId", requesterContext.clientId),
    custodianActorIds: custodians,
    reviewOwnerActorId: reviewOwner,
    deploymentApprovalRefHash: assertApprovalReferenceHash(
      "deploymentApprovalRefHash",
      deploymentApprovalRefHash
    ),
    notificationTargetRefHash: assertApprovalReferenceHash(
      "notificationTargetRefHash",
      notificationTargetRefHash
    ),
    maximumSessionMs,
    activationDeadline: deadline.toISOString(),
    declaredAt: declaredAt.toISOString(),
    schemaVersion: BREAK_GLASS_INCIDENT_SCHEMA_VERSION
  };
  const incident = {
    ...immutable,
    incidentHash: hashId("break_glass_incident", immutable),
    status: BreakGlassIncidentStatus.PENDING_CUSTODIANS,
    reviewStatus: BreakGlassReviewStatus.NOT_REQUIRED,
    version: 1,
    updatedAt: declaredAt.toISOString()
  };
  assertNoSensitiveApprovalFields(incident);
  return deepFreezeApproval(incident);
}

export function createBreakGlassCustodianDecision({ incident, context, hardwareKeyRefHash, now }) {
  if (
    context.tenantId !== incident.tenantId ||
    context.actorId === incident.requestedByActorId ||
    !incident.custodianActorIds.includes(context.actorId) ||
    !context.amr.some((method) => HARDWARE_KEY_METHODS.has(method.toLowerCase()))
  ) {
    throw approvalError("break_glass_confirmation_rejected", "break-glass custodian is invalid");
  }
  const createdAt = assertApprovalTimestamp("now", now).toISOString();
  const breakGlassCustodianDecisionId = createOperationalId("break_glass_custodian_decision");
  const immutable = {
    breakGlassCustodianDecisionId,
    tenantId: incident.tenantId,
    breakGlassIncidentId: incident.breakGlassIncidentId,
    incidentVersion: incident.version,
    incidentHash: incident.incidentHash,
    custodianActorId: assertApprovalIdentifier("custodianActorId", context.actorId),
    custodianClientId: assertApprovalIdentifier("custodianClientId", context.clientId),
    custodianCredentialId: assertApprovalIdentifier("custodianCredentialId", context.credentialId),
    custodianCredentialVersion: assertApprovalVersion(
      "custodianCredentialVersion",
      context.credentialVersion,
      { minimum: 1 }
    ),
    hardwareKeyRefHash: assertApprovalReferenceHash("hardwareKeyRefHash", hardwareKeyRefHash),
    authTime: assertApprovalTimestamp("authTime", context.authTime).toISOString(),
    authenticationMethods: assertApprovalList("authenticationMethods", context.amr, {
      minimumItems: 1,
      maximumItems: 8
    }),
    createdAt,
    schemaVersion: BREAK_GLASS_CUSTODIAN_DECISION_SCHEMA_VERSION,
    version: 1
  };
  const decision = {
    ...immutable,
    decisionHash: hashId("break_glass_custodian_decision", immutable)
  };
  assertNoSensitiveApprovalFields(decision);
  return deepFreezeApproval(decision);
}

export function transitionBreakGlassIncident(
  incident,
  { status, reviewStatus, now, expiresAt, reviewDueAt }
) {
  if (!INCIDENT_STATUSES.has(status)) {
    throw approvalError("invalid_break_glass_transition", "break-glass status is invalid");
  }
  const allowed = new Map([
    [BreakGlassIncidentStatus.PENDING_CUSTODIANS, new Set([
      BreakGlassIncidentStatus.PENDING_CUSTODIANS,
      BreakGlassIncidentStatus.ACTIVE,
      BreakGlassIncidentStatus.CANCELED
    ])],
    [BreakGlassIncidentStatus.ACTIVE, new Set([
      BreakGlassIncidentStatus.EXPIRED,
      BreakGlassIncidentStatus.CLOSED
    ])],
    [BreakGlassIncidentStatus.EXPIRED, new Set([BreakGlassIncidentStatus.EXPIRED])],
    [BreakGlassIncidentStatus.CLOSED, new Set([BreakGlassIncidentStatus.CLOSED])]
  ]);
  if (!allowed.get(incident.status)?.has(status)) {
    throw approvalError("invalid_break_glass_transition", "break-glass transition is invalid");
  }
  const occurredAt = assertApprovalTimestamp("now", now).toISOString();
  const fields = {};
  if (status === BreakGlassIncidentStatus.ACTIVE && incident.status !== status) {
    fields.activatedAt = occurredAt;
    fields.expiresAt = assertApprovalTimestamp("expiresAt", expiresAt).toISOString();
  }
  if (status === BreakGlassIncidentStatus.EXPIRED && incident.status !== status) {
    fields.expiredAt = occurredAt;
  }
  if (status === BreakGlassIncidentStatus.CLOSED && incident.status !== status) {
    fields.closedAt = occurredAt;
  }
  if (status === BreakGlassIncidentStatus.CANCELED && incident.status !== status) {
    fields.canceledAt = occurredAt;
  }
  if (reviewDueAt !== undefined) {
    fields.reviewDueAt = assertApprovalTimestamp("reviewDueAt", reviewDueAt).toISOString();
  }
  return deepFreezeApproval({
    ...cloneApproval(incident),
    ...fields,
    status,
    reviewStatus,
    version: incident.version + 1,
    updatedAt: occurredAt
  });
}

export function createBreakGlassReview({ incident, reviewerContext, findingsRefHash, now }) {
  if (
    reviewerContext.tenantId !== incident.tenantId ||
    reviewerContext.actorId !== incident.reviewOwnerActorId
  ) {
    throw approvalError("break_glass_review_rejected", "break-glass reviewer is invalid");
  }
  const completedAt = assertApprovalTimestamp("now", now).toISOString();
  const breakGlassReviewId = createOperationalId("break_glass_review");
  const immutable = {
    breakGlassReviewId,
    tenantId: incident.tenantId,
    breakGlassIncidentId: incident.breakGlassIncidentId,
    incidentHash: incident.incidentHash,
    reviewerActorId: assertApprovalIdentifier("reviewerActorId", reviewerContext.actorId),
    reviewerClientId: assertApprovalIdentifier("reviewerClientId", reviewerContext.clientId),
    findingsRefHash: assertApprovalReferenceHash("findingsRefHash", findingsRefHash),
    completedAt,
    schemaVersion: BREAK_GLASS_REVIEW_SCHEMA_VERSION,
    version: 1
  };
  const review = { ...immutable, reviewHash: hashId("break_glass_review", immutable) };
  assertNoSensitiveApprovalFields(review);
  return deepFreezeApproval(review);
}
