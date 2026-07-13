import { createCreditEvent, hashId } from "../../../packages/domain/src/index.js";
import {
  assertAuthenticationContext,
  assertRecentPhishingResistantAuthentication
} from "../../authentication/src/index.js";
import {
  BREAK_GLASS_ACTIVATION_WINDOW_MS,
  BREAK_GLASS_PROHIBITED_ACTION_PREFIXES,
  BREAK_GLASS_PROTECTIVE_ACTIONS,
  BREAK_GLASS_REVIEW_WINDOW_MS,
  MAX_BREAK_GLASS_WINDOW_MS,
  ApprovalProjectionType,
  BreakGlassIncidentStatus,
  BreakGlassReviewStatus
} from "./approval-constants.js";
import {
  createBreakGlassCustodianDecision,
  createBreakGlassIncident,
  createBreakGlassReview,
  transitionBreakGlassIncident
} from "./break-glass-models.js";
import {
  approvalError,
  assertApprovalIdentifier,
  assertApprovalList,
  assertApprovalReason,
  assertApprovalReferenceHash,
  assertApprovalShape,
  assertApprovalTimestamp,
  assertApprovalVersion,
  assertNoSensitiveApprovalFields,
  cloneApproval,
  deepFreezeApproval
} from "./approval-utils.js";

const trustedBreakGlassAuthorizations = new WeakSet();
const HARDWARE_KEY_METHODS = new Set(["hwk", "webauthn", "fido"]);

function event(eventType, payload, now) {
  assertNoSensitiveApprovalFields(payload, "breakGlassEvent");
  return createCreditEvent({ eventType, payload, now });
}

export function createBreakGlassRuntimeConfig({
  enabled = false,
  environment = "local",
  deploymentApprovalRef,
  requesterActorIds,
  custodianActorIds,
  reviewOwnerActorId,
  notificationTargetRef,
  maximumSessionMs = MAX_BREAK_GLASS_WINDOW_MS
} = {}) {
  if (!enabled) return Object.freeze({ enabled: false, environment });
  if (!Number.isSafeInteger(maximumSessionMs) || maximumSessionMs < 60_000 || maximumSessionMs > MAX_BREAK_GLASS_WINDOW_MS) {
    throw approvalError("invalid_break_glass_configuration", "break-glass duration is invalid");
  }
  const requesters = assertApprovalList("requesterActorIds", requesterActorIds, {
    minimumItems: 1,
    maximumItems: 8
  });
  const custodians = assertApprovalList("custodianActorIds", custodianActorIds, {
    minimumItems: 2,
    maximumItems: 2
  });
  const reviewOwner = assertApprovalIdentifier("reviewOwnerActorId", reviewOwnerActorId);
  if (
    requesters.some((actorId) => custodians.includes(actorId)) ||
    custodians.includes(reviewOwner) ||
    requesters.includes(reviewOwner)
  ) {
    throw approvalError("invalid_break_glass_configuration", "break-glass duties are not separated");
  }
  return deepFreezeApproval({
    enabled: true,
    environment: assertApprovalIdentifier("environment", environment),
    deploymentApprovalRef: assertApprovalIdentifier("deploymentApprovalRef", deploymentApprovalRef),
    requesterActorIds: requesters,
    custodianActorIds: custodians,
    reviewOwnerActorId: reviewOwner,
    notificationTargetRef: assertApprovalIdentifier("notificationTargetRef", notificationTargetRef),
    maximumSessionMs
  });
}

function assertTrustedBreakGlassAuthorization(value, { now = new Date() } = {}) {
  if (!value || typeof value !== "object" || !trustedBreakGlassAuthorizations.has(value)) {
    throw approvalError("break_glass_authorization_required", "break-glass authorization is unavailable");
  }
  if (new Date(value.expiresAt) <= assertApprovalTimestamp("now", now)) {
    throw approvalError("break_glass_authorization_expired", "break-glass authorization expired");
  }
  return value;
}

export class BreakGlassService {
  constructor({
    repository,
    directory,
    credentialRegistry,
    referenceHasher,
    config = createBreakGlassRuntimeConfig(),
    clock = () => new Date()
  }) {
    if (
      !repository?.commitCommand ||
      !repository?.findCommand ||
      !repository?.getBreakGlassIncident ||
      !repository?.listBreakGlassCustodianDecisions ||
      !directory?.requireActiveMembership ||
      !credentialRegistry?.assertActive ||
      !referenceHasher?.hash ||
      typeof clock !== "function"
    ) {
      throw approvalError("invalid_break_glass_configuration", "break-glass adapters are required");
    }
    this.repository = repository;
    this.directory = directory;
    this.credentialRegistry = credentialRegistry;
    this.referenceHasher = referenceHasher;
    this.config = config;
    this.clock = clock;
    Object.freeze(this);
  }

  async declareIncident({
    authenticationContext,
    reasonCode,
    allowedActions,
    resourceScopes,
    idempotencyKey,
    now = this.clock()
  }) {
    this.#assertDeploymentGate();
    const currentTime = assertApprovalTimestamp("now", now);
    const context = await this.#assertConfiguredActor(authenticationContext, this.config.requesterActorIds, currentTime);
    const reason = assertApprovalReason("reasonCode", reasonCode);
    const actions = assertApprovalList("allowedActions", allowedActions, {
      minimumItems: 1,
      maximumItems: 8
    });
    if (
      actions.some((action) => !BREAK_GLASS_PROTECTIVE_ACTIONS.includes(action)) ||
      actions.some((action) => BREAK_GLASS_PROHIBITED_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix)))
    ) {
      throw approvalError("break_glass_scope_prohibited", "break-glass action is prohibited");
    }
    if (!Array.isArray(resourceScopes) || resourceScopes.length === 0 || resourceScopes.length > 16) {
      throw approvalError("invalid_break_glass_scope", "break-glass resource scope is invalid");
    }
    const normalizedScopes = resourceScopes.map((scope) => {
      assertApprovalShape("resourceScope", scope, { required: ["resourceType", "resourceId"] });
      return {
        resourceType: assertApprovalIdentifier("resourceType", scope.resourceType),
        resourceId: assertApprovalIdentifier("resourceId", scope.resourceId)
      };
    });
    if (new Set(normalizedScopes.map(({ resourceType, resourceId }) => `${resourceType}\0${resourceId}`)).size !== normalizedScopes.length) {
      throw approvalError("invalid_break_glass_scope", "break-glass resource scope is duplicated");
    }
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    const deploymentApprovalRefHash = this.referenceHasher.hash(
      "break_glass.deployment_approval",
      this.config.deploymentApprovalRef
    );
    const notificationTargetRefHash = this.referenceHasher.hash(
      "break_glass.notification_target",
      this.config.notificationTargetRef
    );
    const activationDeadline = new Date(currentTime.getTime() + BREAK_GLASS_ACTIVATION_WINDOW_MS);
    const commandHash = hashId("break_glass_declare_command", {
      tenantId: context.tenantId,
      requestedByActorId: context.actorId,
      reasonCode: reason,
      allowedActions: actions,
      resourceScopes: normalizedScopes,
      custodianActorIds: this.config.custodianActorIds,
      reviewOwnerActorId: this.config.reviewOwnerActorId,
      deploymentApprovalRefHash,
      notificationTargetRefHash,
      maximumSessionMs: this.config.maximumSessionMs,
      activationWindowMs: BREAK_GLASS_ACTIVATION_WINDOW_MS
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const incident = createBreakGlassIncident({
      tenantId: context.tenantId,
      reasonCode: reason,
      allowedActions: actions,
      resourceScopes: normalizedScopes,
      requesterContext: context,
      custodianActorIds: this.config.custodianActorIds,
      reviewOwnerActorId: this.config.reviewOwnerActorId,
      deploymentApprovalRefHash,
      notificationTargetRefHash,
      maximumSessionMs: this.config.maximumSessionMs,
      activationDeadline,
      now: currentTime
    });
    const created = event("break_glass_incident_declared", {
      breakGlassIncidentId: incident.breakGlassIncidentId,
      incidentHash: incident.incidentHash,
      requestedByActorId: incident.requestedByActorId,
      allowedActions: incident.allowedActions,
      resourceScopes: incident.resourceScopes,
      activationDeadline: incident.activationDeadline,
      maximumSessionMs: incident.maximumSessionMs,
      notificationTargetRefHash
    }, currentTime);
    return this.#commitIncident({
      incident,
      previousVersion: 0,
      idempotencyKey: commandKey,
      commandHash,
      events: [created],
      writes: [],
      response: { incident },
      replayedEventId: created.eventId
    });
  }

  async confirmCustodian({
    breakGlassIncidentId,
    expectedVersion,
    authenticationContext,
    hardwareKeyRefHash,
    idempotencyKey,
    now = this.clock()
  }) {
    this.#assertDeploymentGate();
    const currentTime = assertApprovalTimestamp("now", now);
    const context = await this.#assertConfiguredActor(authenticationContext, this.config.custodianActorIds, currentTime, {
      hardwareKeyRequired: true
    });
    const incidentId = assertApprovalIdentifier("breakGlassIncidentId", breakGlassIncidentId);
    const version = assertApprovalVersion("expectedVersion", expectedVersion, { minimum: 1 });
    const keyRefHash = assertApprovalReferenceHash("hardwareKeyRefHash", hardwareKeyRefHash);
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    const commandHash = hashId("break_glass_confirm_command", {
      incidentId,
      expectedVersion: version,
      custodianActorId: context.actorId,
      hardwareKeyRefHash: keyRefHash
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const incident = await this.#requireIncident(incidentId);
    const existing = await this.repository.listBreakGlassCustodianDecisions(incidentId);
    if (
      incident.version !== version ||
      incident.tenantId !== context.tenantId ||
      incident.status !== BreakGlassIncidentStatus.PENDING_CUSTODIANS ||
      incident.requestedByActorId === context.actorId ||
      !incident.custodianActorIds.includes(context.actorId) ||
      new Date(incident.activationDeadline) <= currentTime ||
      existing.some(({ custodianActorId }) => custodianActorId === context.actorId)
    ) {
      throw approvalError("break_glass_confirmation_rejected", "break-glass confirmation is unavailable");
    }
    const decision = createBreakGlassCustodianDecision({
      incident,
      context,
      hardwareKeyRefHash: keyRefHash,
      now: currentTime
    });
    const decisions = [...existing, decision];
    const active = new Set(decisions.map(({ custodianActorId }) => custodianActorId)).size === 2;
    const expiresAt = active
      ? new Date(currentTime.getTime() + incident.maximumSessionMs)
      : undefined;
    const updated = transitionBreakGlassIncident(incident, {
      status: active ? BreakGlassIncidentStatus.ACTIVE : BreakGlassIncidentStatus.PENDING_CUSTODIANS,
      reviewStatus: BreakGlassReviewStatus.NOT_REQUIRED,
      expiresAt,
      reviewDueAt: active
        ? new Date(expiresAt.getTime() + BREAK_GLASS_REVIEW_WINDOW_MS)
        : undefined,
      now: currentTime
    });
    const decisionEvent = event("break_glass_custodian_confirmed", {
      breakGlassIncidentId: incidentId,
      breakGlassCustodianDecisionId: decision.breakGlassCustodianDecisionId,
      decisionHash: decision.decisionHash,
      custodianActorId: decision.custodianActorId,
      incidentVersion: incident.version
    }, currentTime);
    const incidentEvent = event(active ? "break_glass_incident_activated" : "break_glass_incident_progressed", {
      breakGlassIncidentId: incidentId,
      incidentHash: incident.incidentHash,
      status: updated.status,
      confirmationCount: decisions.length,
      expiresAt: updated.expiresAt,
      reviewDueAt: updated.reviewDueAt,
      notificationTargetRefHash: incident.notificationTargetRefHash,
      version: updated.version
    }, currentTime);
    return this.#commitIncident({
      incident: updated,
      previousVersion: incident.version,
      idempotencyKey: commandKey,
      commandHash,
      events: [decisionEvent, incidentEvent],
      writes: [{
        type: ApprovalProjectionType.BREAK_GLASS_CUSTODIAN_DECISION,
        value: decision,
        eventId: decisionEvent.eventId
      }],
      response: { incident: updated, custodianDecisions: decisions },
      replayedEventId: incidentEvent.eventId
    });
  }

  async assertProtectiveScope({
    breakGlassIncidentId,
    action,
    resourceType,
    resourceId,
    authenticationContext,
    now = this.clock()
  }) {
    this.#assertDeploymentGate();
    const currentTime = assertApprovalTimestamp("now", now);
    const context = assertAuthenticationContext(authenticationContext);
    if (!this.config.requesterActorIds.includes(context.actorId)) {
      throw approvalError("break_glass_actor_rejected", "break-glass actor is not configured");
    }
    const incident = await this.#requireIncident(breakGlassIncidentId);
    if (
      incident.tenantId !== context.tenantId ||
      incident.requestedByActorId !== context.actorId
    ) {
      throw approvalError("break_glass_scope_rejected", "break-glass scope does not allow this action");
    }
    if (incident.status === BreakGlassIncidentStatus.ACTIVE && new Date(incident.expiresAt) <= currentTime) {
      await this.#expireIncident(incident, currentTime);
      throw approvalError("break_glass_incident_expired", "break-glass incident expired");
    }
    await this.#assertConfiguredActor(context, this.config.requesterActorIds, currentTime);
    const normalizedAction = assertApprovalIdentifier("action", action);
    const normalizedType = assertApprovalIdentifier("resourceType", resourceType);
    const normalizedId = assertApprovalIdentifier("resourceId", resourceId);
    if (
      incident.status !== BreakGlassIncidentStatus.ACTIVE ||
      !incident.allowedActions.includes(normalizedAction) ||
      BREAK_GLASS_PROHIBITED_ACTION_PREFIXES.some((prefix) => normalizedAction.startsWith(prefix)) ||
      !incident.resourceScopes.some((scope) =>
        scope.resourceType === normalizedType && scope.resourceId === normalizedId
      )
    ) {
      throw approvalError("break_glass_scope_rejected", "break-glass scope does not allow this action");
    }
    const immutable = {
      breakGlassIncidentId: incident.breakGlassIncidentId,
      tenantId: incident.tenantId,
      action: normalizedAction,
      resourceType: normalizedType,
      resourceId: normalizedId,
      incidentHash: incident.incidentHash,
      incidentVersion: incident.version,
      executorActorId: context.actorId,
      executorClientId: context.clientId,
      executorCredentialId: context.credentialId,
      executorCredentialVersion: context.credentialVersion,
      policyVersion: context.policyVersion,
      issuedAt: currentTime.toISOString(),
      expiresAt: incident.expiresAt,
      authorizationDecision: "protective_only",
      schemaVersion: "break_glass_authorization.v1"
    };
    const authorization = deepFreezeApproval({
      ...immutable,
      authorizationHash: hashId("break_glass_authorization", immutable)
    });
    trustedBreakGlassAuthorizations.add(authorization);
    return authorization;
  }

  async revalidateProtectiveAuthorization({
    breakGlassAuthorization,
    authenticationContext,
    now = this.clock()
  }) {
    this.#assertDeploymentGate();
    const currentTime = assertApprovalTimestamp("now", now);
    const authorization = assertTrustedBreakGlassAuthorization(breakGlassAuthorization, {
      now: currentTime
    });
    const context = await this.#assertConfiguredActor(
      authenticationContext,
      this.config.requesterActorIds,
      currentTime
    );
    const incident = await this.#requireIncident(authorization.breakGlassIncidentId);
    if (
      incident.status === BreakGlassIncidentStatus.ACTIVE &&
      new Date(incident.expiresAt) <= currentTime
    ) {
      await this.#expireIncident(incident, currentTime);
      throw approvalError("break_glass_incident_expired", "break-glass incident expired");
    }
    if (
      incident.status !== BreakGlassIncidentStatus.ACTIVE ||
      incident.version !== authorization.incidentVersion ||
      incident.incidentHash !== authorization.incidentHash ||
      incident.tenantId !== authorization.tenantId ||
      incident.tenantId !== context.tenantId ||
      incident.requestedByActorId !== context.actorId ||
      authorization.executorActorId !== context.actorId ||
      authorization.executorClientId !== context.clientId ||
      authorization.executorCredentialId !== context.credentialId ||
      authorization.executorCredentialVersion !== context.credentialVersion ||
      authorization.policyVersion !== context.policyVersion ||
      !incident.allowedActions.includes(authorization.action) ||
      BREAK_GLASS_PROHIBITED_ACTION_PREFIXES.some((prefix) =>
        authorization.action.startsWith(prefix)
      ) ||
      !incident.resourceScopes.some((scope) =>
        scope.resourceType === authorization.resourceType &&
        scope.resourceId === authorization.resourceId
      )
    ) {
      throw approvalError(
        "break_glass_authorization_stale",
        "break-glass authorization is no longer current"
      );
    }
    return authorization;
  }

  async close({
    breakGlassIncidentId,
    expectedVersion,
    authenticationContext,
    idempotencyKey,
    now = this.clock()
  }) {
    this.#assertDeploymentGate();
    const currentTime = assertApprovalTimestamp("now", now);
    const allowedActors = [...this.config.requesterActorIds, ...this.config.custodianActorIds];
    const context = await this.#assertConfiguredActor(authenticationContext, allowedActors, currentTime);
    const version = assertApprovalVersion("expectedVersion", expectedVersion, { minimum: 1 });
    const incidentId = assertApprovalIdentifier("breakGlassIncidentId", breakGlassIncidentId);
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    const commandHash = hashId("break_glass_close_command", {
      incidentId,
      expectedVersion: version,
      actorId: context.actorId
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const incident = await this.#requireIncident(incidentId);
    if (
      incident.status === BreakGlassIncidentStatus.ACTIVE &&
      new Date(incident.expiresAt) <= currentTime
    ) {
      await this.#expireIncident(incident, currentTime);
      throw approvalError("break_glass_incident_expired", "break-glass incident expired");
    }
    if (
      incident.version !== version ||
      incident.tenantId !== context.tenantId ||
      incident.status !== BreakGlassIncidentStatus.ACTIVE ||
      (
        incident.requestedByActorId !== context.actorId &&
        !incident.custodianActorIds.includes(context.actorId)
      )
    ) {
      throw approvalError("break_glass_close_rejected", "break-glass incident cannot be closed");
    }
    const updated = transitionBreakGlassIncident(incident, {
      status: BreakGlassIncidentStatus.CLOSED,
      reviewStatus: BreakGlassReviewStatus.PENDING,
      reviewDueAt: new Date(currentTime.getTime() + BREAK_GLASS_REVIEW_WINDOW_MS),
      now: currentTime
    });
    const closed = event("break_glass_incident_closed", {
      breakGlassIncidentId: incident.breakGlassIncidentId,
      closedByActorId: context.actorId,
      reviewDueAt: updated.reviewDueAt,
      notificationTargetRefHash: incident.notificationTargetRefHash,
      version: updated.version
    }, currentTime);
    return this.#commitIncident({
      incident: updated,
      previousVersion: incident.version,
      idempotencyKey: commandKey,
      commandHash,
      events: [closed],
      writes: [],
      response: { incident: updated },
      replayedEventId: closed.eventId
    });
  }

  async review({
    breakGlassIncidentId,
    expectedVersion,
    authenticationContext,
    findingsRefHash,
    idempotencyKey,
    now = this.clock()
  }) {
    this.#assertDeploymentGate();
    const currentTime = assertApprovalTimestamp("now", now);
    const context = await this.#assertConfiguredActor(
      authenticationContext,
      [this.config.reviewOwnerActorId],
      currentTime
    );
    const version = assertApprovalVersion("expectedVersion", expectedVersion, { minimum: 1 });
    const incidentId = assertApprovalIdentifier("breakGlassIncidentId", breakGlassIncidentId);
    const findingsHash = assertApprovalReferenceHash("findingsRefHash", findingsRefHash);
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    const commandHash = hashId("break_glass_review_command", {
      incidentId,
      expectedVersion: version,
      reviewerActorId: context.actorId,
      findingsRefHash: findingsHash
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const incident = await this.#requireIncident(incidentId);
    if (
      incident.version !== version ||
      incident.tenantId !== context.tenantId ||
      incident.reviewOwnerActorId !== context.actorId ||
      ![BreakGlassIncidentStatus.CLOSED, BreakGlassIncidentStatus.EXPIRED].includes(incident.status) ||
      ![BreakGlassReviewStatus.PENDING, BreakGlassReviewStatus.OVERDUE].includes(incident.reviewStatus) ||
      await this.repository.getBreakGlassReview(incident.breakGlassIncidentId)
    ) {
      throw approvalError("break_glass_review_rejected", "break-glass review is unavailable");
    }
    const review = createBreakGlassReview({
      incident,
      reviewerContext: context,
      findingsRefHash: findingsHash,
      now: currentTime
    });
    const updated = transitionBreakGlassIncident(incident, {
      status: incident.status,
      reviewStatus: BreakGlassReviewStatus.COMPLETED,
      now: currentTime
    });
    const reviewEvent = event("break_glass_review_completed", {
      breakGlassIncidentId: incident.breakGlassIncidentId,
      breakGlassReviewId: review.breakGlassReviewId,
      reviewHash: review.reviewHash,
      reviewerActorId: review.reviewerActorId,
      completedAt: review.completedAt,
      notificationTargetRefHash: incident.notificationTargetRefHash
    }, currentTime);
    const incidentEvent = event("break_glass_incident_reviewed", {
      breakGlassIncidentId: incident.breakGlassIncidentId,
      reviewStatus: updated.reviewStatus,
      version: updated.version
    }, currentTime);
    return this.#commitIncident({
      incident: updated,
      previousVersion: incident.version,
      idempotencyKey: commandKey,
      commandHash,
      events: [reviewEvent, incidentEvent],
      writes: [{
        type: ApprovalProjectionType.BREAK_GLASS_REVIEW,
        value: review,
        eventId: reviewEvent.eventId
      }],
      response: { incident: updated, review },
      replayedEventId: incidentEvent.eventId
    });
  }

  async #expireIncident(incident, now) {
    if (incident.status !== BreakGlassIncidentStatus.ACTIVE) return incident;
    const updated = transitionBreakGlassIncident(incident, {
      status: BreakGlassIncidentStatus.EXPIRED,
      reviewStatus: new Date(incident.reviewDueAt) <= now
        ? BreakGlassReviewStatus.OVERDUE
        : BreakGlassReviewStatus.PENDING,
      now
    });
    const idempotencyKey = `break-glass-expire:${incident.breakGlassIncidentId}:${incident.version}`;
    const commandHash = hashId("break_glass_expire_command", {
      incidentId: incident.breakGlassIncidentId,
      expectedVersion: incident.version,
      expiresAt: incident.expiresAt
    });
    const expired = event("break_glass_incident_expired", {
      breakGlassIncidentId: incident.breakGlassIncidentId,
      expiredAt: now.toISOString(),
      reviewDueAt: incident.reviewDueAt,
      notificationTargetRefHash: incident.notificationTargetRefHash,
      version: updated.version
    }, now);
    const result = await this.#commitIncident({
      incident: updated,
      previousVersion: incident.version,
      idempotencyKey,
      commandHash,
      events: [expired],
      writes: [],
      response: { incident: updated },
      replayedEventId: expired.eventId
    });
    return result.incident;
  }

  async #commitIncident({
    incident,
    previousVersion,
    idempotencyKey,
    commandHash,
    events,
    writes,
    response,
    replayedEventId
  }) {
    const descriptors = events.map((item, index) => index === events.length - 1
      ? {
          aggregateType: ApprovalProjectionType.BREAK_GLASS_INCIDENT,
          aggregateId: incident.breakGlassIncidentId,
          expectedVersion: previousVersion,
          event: item
        }
      : {
          aggregateType: writes[index]?.type,
          aggregateId:
            writes[index]?.value?.breakGlassCustodianDecisionId ??
            writes[index]?.value?.breakGlassReviewId,
          expectedVersion: 0,
          event: item
        });
    const committed = await this.repository.commitCommand({
      aggregateType: ApprovalProjectionType.BREAK_GLASS_INCIDENT,
      aggregateId: incident.breakGlassIncidentId,
      idempotencyKey,
      commandHash,
      events: descriptors,
      writes: [
        ...writes,
        {
          type: ApprovalProjectionType.BREAK_GLASS_INCIDENT,
          value: incident,
          eventId: replayedEventId
        }
      ],
      response: { ...cloneApproval(response), schemaVersion: "break_glass_command_response.v1" }
    });
    return { ...cloneApproval(committed.response), replayed: committed.replayed };
  }

  async #assertConfiguredActor(authenticationContext, actorIds, now, { hardwareKeyRequired = false } = {}) {
    const context = assertAuthenticationContext(authenticationContext);
    if (!actorIds.includes(context.actorId)) {
      throw approvalError("break_glass_actor_rejected", "break-glass actor is not configured");
    }
    const credential = await this.credentialRegistry.assertActive(context.credentialId, now);
    await this.directory.requireActiveMembership({
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorType: context.actorType,
      clientId: context.clientId,
      policyVersion: context.policyVersion,
      now
    });
    if (
      credential.tenantId !== context.tenantId ||
      credential.actorId !== context.actorId ||
      credential.actorType !== context.actorType ||
      credential.clientId !== context.clientId ||
      credential.version !== context.credentialVersion ||
      credential.policyVersion !== context.policyVersion
    ) {
      throw approvalError("break_glass_actor_rejected", "break-glass credential changed");
    }
    assertRecentPhishingResistantAuthentication(context, { now });
    if (
      hardwareKeyRequired &&
      !context.amr.some((method) => HARDWARE_KEY_METHODS.has(method.toLowerCase()))
    ) {
      throw approvalError("break_glass_hardware_key_required", "hardware-key authentication is required");
    }
    return context;
  }

  async #requireIncident(incidentId) {
    const incident = await this.repository.getBreakGlassIncident(
      assertApprovalIdentifier("breakGlassIncidentId", incidentId)
    );
    if (!incident) throw approvalError("break_glass_incident_not_found", "break-glass incident is unavailable");
    return incident;
  }

  #assertDeploymentGate() {
    if (!this.config?.enabled) {
      throw approvalError(
        "break_glass_deployment_gate_closed",
        "break-glass custodians and review ownership are not deployment-approved"
      );
    }
  }
}
