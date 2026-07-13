import { createOperationalId } from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/constants.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  AccessGrantCapability,
  AccessGrantStatus,
  MembershipStatus,
  ROLE_BUNDLE_CAPABILITIES
} from "./authorization-constants.js";
import {
  assertAuthorizationIdentifier,
  assertAuthorizationList,
  assertAuthorizationShape,
  assertCapability,
  assertPositiveCapacity,
  assertReasonCode,
  authorizationError,
  authorizationTimestamp,
  cloneAuthorization,
  deepFreezeAuthorization
} from "./authorization-utils.js";

const ACTOR_TYPES = new Set(Object.values(ActorType));
const MEMBERSHIP_STATUSES = new Set(Object.values(MembershipStatus));
const ACCESS_GRANT_CAPABILITIES = new Set(Object.values(AccessGrantCapability));
const RESOURCE_STATUSES = new Set(["active", "frozen", "closed"]);

function timestampWindow({ validFrom, expiresAt, now, maximumLifetimeMs }) {
  const from = authorizationTimestamp("validFrom", validFrom ?? now);
  const expires = expiresAt === undefined ? undefined : authorizationTimestamp("expiresAt", expiresAt);
  if (
    (expires && expires <= from) ||
    (expires && maximumLifetimeMs !== undefined && expires.getTime() - from.getTime() > maximumLifetimeMs)
  ) {
    throw authorizationError("invalid_authorization_input", "authorization validity window is invalid");
  }
  return { validFrom: from.toISOString(), expiresAt: expires?.toISOString() };
}

function resourceKey(resourceType, resourceId) {
  return `${resourceType}\0${resourceId}`;
}

function membershipKey(tenantId, actorId) {
  return `${tenantId}\0${actorId}`;
}

function grantKey(grant) {
  return [
    grant.tenantId,
    grant.granteeTenantId,
    grant.granteeActorId,
    grant.capability,
    grant.resourceType,
    grant.resourceId,
    grant.purpose
  ].join("\0");
}

export class InMemoryAuthorizationDirectory {
  #memberships = new Map();
  #membershipIdsByActor = new Map();
  #resources = new Map();
  #accessGrants = new Map();
  #accessGrantIdsByScope = new Map();

  constructor({
    maximumMemberships = 10_000,
    maximumResources = 50_000,
    maximumAccessGrants = 10_000,
    maximumGrantLifetimeMs = 30 * 24 * 60 * 60 * 1000
  } = {}) {
    this.maximumMemberships = assertPositiveCapacity("maximumMemberships", maximumMemberships);
    this.maximumResources = assertPositiveCapacity("maximumResources", maximumResources);
    this.maximumAccessGrants = assertPositiveCapacity("maximumAccessGrants", maximumAccessGrants);
    if (
      !Number.isSafeInteger(maximumGrantLifetimeMs) ||
      maximumGrantLifetimeMs < 60_000 ||
      maximumGrantLifetimeMs > 90 * 24 * 60 * 60 * 1000
    ) {
      throw authorizationError("invalid_authorization_configuration", "maximumGrantLifetimeMs is invalid");
    }
    this.maximumGrantLifetimeMs = maximumGrantLifetimeMs;
    Object.freeze(this);
  }

  registerMembership(input) {
    assertAuthorizationShape("membership", input, {
      required: [
        "tenantId",
        "actorId",
        "actorType",
        "roleBundle",
        "capabilities",
        "clientIds",
        "policyVersion"
      ],
      optional: ["membershipId", "status", "validFrom", "expiresAt", "now"]
    });
    if (this.#memberships.size >= this.maximumMemberships) {
      throw authorizationError("authorization_directory_capacity_exceeded", "membership capacity is exhausted");
    }
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const tenantId = assertAuthorizationIdentifier("tenantId", input.tenantId);
    const actorId = assertAuthorizationIdentifier("actorId", input.actorId);
    if (!ACTOR_TYPES.has(input.actorType)) {
      throw authorizationError("invalid_authorization_input", "actorType is invalid");
    }
    const roleCapabilities = ROLE_BUNDLE_CAPABILITIES[input.roleBundle];
    if (!roleCapabilities) {
      throw authorizationError("invalid_authorization_input", "roleBundle is invalid");
    }
    const capabilities = assertAuthorizationList("capabilities", input.capabilities, { allowEmpty: false });
    if (capabilities.some((capability) => !roleCapabilities.includes(capability))) {
      throw authorizationError("invalid_authorization_input", "membership capability exceeds the role bundle");
    }
    const clientIds = assertAuthorizationList("clientIds", input.clientIds, {
      allowEmpty: false,
      maximumItems: 16,
      itemValidator: assertAuthorizationIdentifier
    });
    const status = input.status ?? MembershipStatus.ACTIVE;
    if (!MEMBERSHIP_STATUSES.has(status)) {
      throw authorizationError("invalid_authorization_input", "membership status is invalid");
    }
    const window = timestampWindow({
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      now
    });
    const id = input.membershipId === undefined
      ? createOperationalId("membership")
      : assertAuthorizationIdentifier("membershipId", input.membershipId);
    const actorKey = membershipKey(tenantId, actorId);
    if (this.#memberships.has(id) || this.#membershipIdsByActor.has(actorKey)) {
      throw authorizationError("authorization_membership_conflict", "membership already exists");
    }
    const membership = deepFreezeAuthorization({
      membershipId: id,
      tenantId,
      actorId,
      actorType: input.actorType,
      roleBundle: input.roleBundle,
      capabilities,
      clientIds,
      policyVersion: assertAuthorizationIdentifier("policyVersion", input.policyVersion),
      status,
      validFrom: window.validFrom,
      expiresAt: window.expiresAt,
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      schemaVersion: "membership.v1"
    });
    this.#memberships.set(id, membership);
    this.#membershipIdsByActor.set(actorKey, id);
    return cloneAuthorization(membership);
  }

  async requireActiveMembership({ tenantId, actorId, actorType, clientId, policyVersion, now = new Date() }) {
    const id = this.#membershipIdsByActor.get(membershipKey(tenantId, actorId));
    let membership = this.#memberships.get(id);
    const currentTime = authorizationTimestamp("now", now);
    if (
      membership?.status === MembershipStatus.ACTIVE &&
      membership.expiresAt &&
      new Date(membership.expiresAt) <= currentTime
    ) {
      membership = deepFreezeAuthorization({
        ...membership,
        status: MembershipStatus.EXPIRED,
        version: membership.version + 1,
        updatedAt: currentTime.toISOString()
      });
      this.#memberships.set(id, membership);
    }
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      new Date(membership.validFrom) > currentTime ||
      (membership.expiresAt && new Date(membership.expiresAt) <= currentTime) ||
      membership.tenantId !== tenantId ||
      membership.actorId !== actorId ||
      membership.actorType !== actorType ||
      membership.policyVersion !== policyVersion ||
      !membership.clientIds.includes(clientId)
    ) {
      throw authorizationError("authorization_membership_rejected", "membership is not active");
    }
    return cloneAuthorization(membership);
  }

  setMembershipStatus(input) {
    assertAuthorizationShape("membership status transition", input, {
      required: ["membershipId", "expectedVersion", "status", "reasonCode"],
      optional: ["now"]
    });
    const id = assertAuthorizationIdentifier("membershipId", input.membershipId);
    const current = this.#memberships.get(id);
    if (
      !current ||
      current.version !== input.expectedVersion ||
      ![MembershipStatus.SUSPENDED, MembershipStatus.REVOKED].includes(input.status) ||
      current.status === MembershipStatus.REVOKED ||
      (current.status === MembershipStatus.SUSPENDED && input.status !== MembershipStatus.REVOKED)
    ) {
      throw authorizationError("authorization_membership_rejected", "membership is not active");
    }
    assertReasonCode("reasonCode", input.reasonCode);
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const updated = deepFreezeAuthorization({
      ...current,
      status: input.status,
      version: current.version + 1,
      updatedAt: now.toISOString()
    });
    this.#memberships.set(id, updated);
    return cloneAuthorization(updated);
  }

  getMembership(membershipId) {
    const membership = this.#memberships.get(membershipId);
    return membership ? cloneAuthorization(membership) : undefined;
  }

  registerResource(input) {
    assertAuthorizationShape("authorization resource", input, {
      required: ["tenantId", "resourceType", "resourceId"],
      optional: ["ownerActorId", "status", "now"]
    });
    if (this.#resources.size >= this.maximumResources) {
      throw authorizationError("authorization_directory_capacity_exceeded", "resource capacity is exhausted");
    }
    const tenantId = assertAuthorizationIdentifier("tenantId", input.tenantId);
    const resourceType = assertAuthorizationIdentifier("resourceType", input.resourceType);
    const resourceId = assertAuthorizationIdentifier("resourceId", input.resourceId);
    const key = resourceKey(resourceType, resourceId);
    if (this.#resources.has(key) || !RESOURCE_STATUSES.has(input.status ?? "active")) {
      throw authorizationError("authorization_resource_conflict", "resource registration is invalid");
    }
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const resource = deepFreezeAuthorization({
      tenantId,
      resourceType,
      resourceId,
      ownerActorId: input.ownerActorId === undefined
        ? undefined
        : assertAuthorizationIdentifier("ownerActorId", input.ownerActorId),
      status: input.status ?? "active",
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      schemaVersion: "authorization_resource.v1"
    });
    this.#resources.set(key, resource);
    return cloneAuthorization(resource);
  }

  async resolveResource({ resourceType, resourceId }) {
    const resource = this.#resources.get(resourceKey(resourceType, resourceId));
    return resource ? cloneAuthorization(resource) : undefined;
  }

  setResourceStatus(input) {
    assertAuthorizationShape("resource status transition", input, {
      required: ["resourceType", "resourceId", "expectedVersion", "status"],
      optional: ["now"]
    });
    const key = resourceKey(
      assertAuthorizationIdentifier("resourceType", input.resourceType),
      assertAuthorizationIdentifier("resourceId", input.resourceId)
    );
    const current = this.#resources.get(key);
    if (!current || current.version !== input.expectedVersion || !RESOURCE_STATUSES.has(input.status)) {
      throw authorizationError("authorization_resource_rejected", "resource state is stale");
    }
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const updated = deepFreezeAuthorization({
      ...current,
      status: input.status,
      version: current.version + 1,
      updatedAt: now.toISOString()
    });
    this.#resources.set(key, updated);
    return cloneAuthorization(updated);
  }

  registerAccessGrant(input) {
    assertAuthorizationShape("AccessGrant", input, {
      required: [
        "tenantId",
        "granteeTenantId",
        "granteeActorId",
        "capability",
        "resourceType",
        "resourceId",
        "purpose",
        "createdByActorId",
        "policyVersion",
        "expiresAt"
      ],
      optional: ["accessGrantId", "validFrom", "now"]
    });
    if (this.#accessGrants.size >= this.maximumAccessGrants) {
      throw authorizationError("authorization_directory_capacity_exceeded", "AccessGrant capacity is exhausted");
    }
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const tenantId = assertAuthorizationIdentifier("tenantId", input.tenantId);
    const granteeTenantId = assertAuthorizationIdentifier("granteeTenantId", input.granteeTenantId);
    if (tenantId === granteeTenantId || !ACCESS_GRANT_CAPABILITIES.has(input.capability)) {
      throw authorizationError("invalid_authorization_input", "AccessGrant scope is invalid");
    }
    const resourceType = assertAuthorizationIdentifier("resourceType", input.resourceType);
    const resourceId = assertAuthorizationIdentifier("resourceId", input.resourceId);
    const resource = this.#resources.get(resourceKey(resourceType, resourceId));
    if (!resource || resource.tenantId !== tenantId) {
      throw authorizationError("authorization_resource_rejected", "AccessGrant resource is unavailable");
    }
    const window = timestampWindow({
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      now,
      maximumLifetimeMs: this.maximumGrantLifetimeMs
    });
    const grant = deepFreezeAuthorization({
      accessGrantId: input.accessGrantId === undefined
        ? createOperationalId("access_grant")
        : assertAuthorizationIdentifier("accessGrantId", input.accessGrantId),
      tenantId,
      granteeTenantId,
      granteeActorId: assertAuthorizationIdentifier("granteeActorId", input.granteeActorId),
      capability: input.capability,
      resourceType,
      resourceId,
      purpose: assertCapability("purpose", input.purpose),
      createdByActorId: assertAuthorizationIdentifier("createdByActorId", input.createdByActorId),
      policyVersion: assertAuthorizationIdentifier("policyVersion", input.policyVersion),
      status: AccessGrantStatus.ACTIVE,
      validFrom: window.validFrom,
      expiresAt: window.expiresAt,
      revokedAt: undefined,
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      schemaVersion: "access_grant.v1"
    });
    const key = grantKey(grant);
    if (this.#accessGrants.has(grant.accessGrantId) || this.#accessGrantIdsByScope.has(key)) {
      throw authorizationError("authorization_access_grant_conflict", "AccessGrant already exists");
    }
    this.#accessGrants.set(grant.accessGrantId, grant);
    this.#accessGrantIdsByScope.set(key, grant.accessGrantId);
    return cloneAuthorization(grant);
  }

  async findActiveAccessGrant({
    tenantId,
    granteeTenantId,
    granteeActorId,
    capability,
    resourceType,
    resourceId,
    purpose,
    policyVersion = AUTHORIZATION_POLICY_VERSION,
    now = new Date()
  }) {
    const scope = grantKey({
      tenantId,
      granteeTenantId,
      granteeActorId,
      capability,
      resourceType,
      resourceId,
      purpose
    });
    const id = this.#accessGrantIdsByScope.get(scope);
    let grant = this.#accessGrants.get(id);
    const currentTime = authorizationTimestamp("now", now);
    if (
      grant?.status === AccessGrantStatus.ACTIVE &&
      new Date(grant.expiresAt) <= currentTime
    ) {
      grant = deepFreezeAuthorization({
        ...grant,
        status: AccessGrantStatus.EXPIRED,
        version: grant.version + 1,
        updatedAt: currentTime.toISOString()
      });
      this.#accessGrants.set(id, grant);
    }
    if (
      !grant ||
      grant.status !== AccessGrantStatus.ACTIVE ||
      new Date(grant.validFrom) > currentTime ||
      new Date(grant.expiresAt) <= currentTime ||
      grant.policyVersion !== policyVersion
    ) {
      return undefined;
    }
    return cloneAuthorization(grant);
  }

  revokeAccessGrant(input) {
    assertAuthorizationShape("AccessGrant revocation", input, {
      required: ["accessGrantId", "expectedVersion", "reasonCode"],
      optional: ["now"]
    });
    const id = assertAuthorizationIdentifier("accessGrantId", input.accessGrantId);
    const current = this.#accessGrants.get(id);
    if (!current || current.version !== input.expectedVersion || current.status !== AccessGrantStatus.ACTIVE) {
      throw authorizationError("authorization_access_grant_rejected", "AccessGrant is not active");
    }
    assertReasonCode("reasonCode", input.reasonCode);
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const updated = deepFreezeAuthorization({
      ...current,
      status: AccessGrantStatus.REVOKED,
      revokedAt: now.toISOString(),
      version: current.version + 1,
      updatedAt: now.toISOString()
    });
    this.#accessGrants.set(id, updated);
    return cloneAuthorization(updated);
  }

  getAccessGrant(accessGrantId) {
    const grant = this.#accessGrants.get(accessGrantId);
    return grant ? cloneAuthorization(grant) : undefined;
  }
}
