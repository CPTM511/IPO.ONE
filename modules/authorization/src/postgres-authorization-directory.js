import { ActorType, assertAuthenticationContext } from "../../authentication/src/index.js";
import {
  assertAuthorizationIdentifier,
  assertAuthorizationShape,
  authorizationError,
  authorizationTimestamp,
  cloneAuthorization
} from "./authorization-utils.js";

const RESOURCE_STATUSES = new Set(["active", "frozen", "closed"]);
const RESOURCE_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);

function assertClient(client) {
  if (!client || typeof client.query !== "function") {
    throw authorizationError(
      "invalid_authorization_configuration",
      "PostgreSQL authorization requires an active transaction client"
    );
  }
}

function safeVersion(value, name) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw authorizationError("authorization_directory_corrupt", `${name} is invalid`);
  }
  return version;
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function jsonArray(value, name) {
  const normalized = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(normalized)) {
    throw authorizationError("authorization_directory_corrupt", `${name} is invalid`);
  }
  return normalized;
}

function mapMembership(row) {
  return {
    membershipId: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    actorType: row.actor_type,
    roleBundle: row.role_bundle,
    capabilities: jsonArray(row.capabilities, "membership capabilities"),
    clientIds: jsonArray(row.client_ids, "membership client IDs"),
    controllerActorId: row.controller_actor_id ?? undefined,
    policyVersion: row.policy_version,
    status: row.status,
    validFrom: timestamp(row.valid_from),
    expiresAt: row.expires_at ? timestamp(row.expires_at) : undefined,
    version: safeVersion(row.version, "membership version"),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapAccessGrant(row) {
  if (!row) return undefined;
  return {
    accessGrantId: row.id,
    tenantId: row.tenant_id,
    granteeTenantId: row.grantee_tenant_id,
    granteeActorId: row.grantee_actor_id,
    capability: row.capability,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    purpose: row.purpose,
    createdByActorId: row.created_by_actor_id,
    policyVersion: row.policy_version,
    status: row.status,
    validFrom: timestamp(row.valid_from),
    expiresAt: timestamp(row.expires_at),
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : undefined,
    version: safeVersion(row.version, "AccessGrant version"),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

export class PostgresAuthorizationDirectory {
  constructor({ client, authenticationContext }) {
    assertClient(client);
    this.client = client;
    this.authenticationContext = assertAuthenticationContext(authenticationContext);
    Object.freeze(this);
  }

  async requireActiveMembership({ tenantId, actorId, actorType, clientId, policyVersion, now = new Date() }) {
    const context = this.authenticationContext;
    if (
      tenantId !== context.tenantId ||
      actorId !== context.actorId ||
      actorType !== context.actorType ||
      clientId !== context.clientId ||
      policyVersion !== context.policyVersion
    ) {
      throw authorizationError("authorization_membership_rejected", "membership is not active");
    }
    const at = authorizationTimestamp("now", now);
    await this.client.query(
      "SELECT pg_advisory_xact_lock(hashtext('authorization_actor'), hashtext($1))",
      [actorId]
    );
    await this.client.query(
      "SELECT pg_advisory_xact_lock(hashtext('authorization_membership:' || $1), hashtext($2))",
      [tenantId, actorId]
    );
    const result = await this.client.query(
      `SELECT m.*, a.actor_type
         FROM memberships m
         JOIN actors a ON a.id = m.actor_id
        WHERE m.tenant_id = $1
          AND m.actor_id = $2
          AND a.actor_type = $3
          AND a.status = 'active'
          AND m.status = 'active'
          AND m.valid_from <= $4
          AND (m.expires_at IS NULL OR m.expires_at > $4)
          AND m.policy_version = $5
          AND m.client_ids ? $6
        FOR SHARE OF m, a`,
      [tenantId, actorId, actorType, at, policyVersion, clientId]
    );
    if (result.rowCount !== 1) {
      throw authorizationError("authorization_membership_rejected", "membership is not active");
    }
    return cloneAuthorization(mapMembership(result.rows[0]));
  }

  async resolveResource({ resourceType, resourceId, tenantId, actorId }) {
    const context = this.authenticationContext;
    if (
      (tenantId !== undefined && tenantId !== context.tenantId) ||
      (actorId !== undefined && actorId !== context.actorId)
    ) {
      throw authorizationError("authorization_resource_rejected", "resource is unavailable");
    }
    const type = assertAuthorizationIdentifier("resourceType", resourceType);
    const id = assertAuthorizationIdentifier("resourceId", resourceId);
    await this.client.query(
      "SELECT pg_advisory_xact_lock(hashtext('authorization_resource:' || $1), hashtext($2))",
      [type, id]
    );
    const result = await this.client.query(
      `SELECT *
         FROM authorization_resources
        WHERE resource_type = $1 AND resource_id = $2
        FOR SHARE`,
      [type, id]
    );
    if (result.rowCount !== 1) return undefined;
    const row = result.rows[0];
    const binding = await this.client.query(
      `SELECT actor_id, relationship, version
         FROM authorization_resource_bindings
        WHERE tenant_id = $1
          AND resource_type = $2
          AND resource_id = $3
          AND actor_id = $4
          AND status = 'active'
        FOR SHARE`,
      [row.tenant_id, type, id, context.actorId]
    );
    if (binding.rowCount > 1) return undefined;
    const bindingRow = binding.rows[0];
    const actorAuthorized = bindingRow?.actor_id === context.actorId;
    return cloneAuthorization({
      tenantId: row.tenant_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ownerActorId: actorAuthorized ? context.actorId : undefined,
      actorAuthorized,
      bindingRelationship: actorAuthorized ? bindingRow.relationship : undefined,
      bindingVersion: actorAuthorized ? safeVersion(bindingRow.version, "resource binding version") : undefined,
      status: row.status,
      version: safeVersion(row.version, "authorization resource version"),
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
      schemaVersion: row.schema_version
    });
  }

  async listActiveResourceBindings({ resourceType, resourceId, now = new Date() }) {
    const type = assertAuthorizationIdentifier("resourceType", resourceType);
    const id = assertAuthorizationIdentifier("resourceId", resourceId);
    const at = authorizationTimestamp("now", now);
    await this.client.query(
      "SELECT pg_advisory_xact_lock(hashtext('authorization_resource:' || $1), hashtext($2))",
      [type, id]
    );
    const result = await this.client.query(
      `SELECT b.actor_id, b.relationship, b.version,
              a.actor_type, m.controller_actor_id
         FROM authorization_resource_bindings b
         JOIN actors a ON a.id = b.actor_id
         JOIN memberships m
           ON m.tenant_id = b.tenant_id AND m.actor_id = b.actor_id
        WHERE b.tenant_id = $1
          AND b.resource_type = $2
          AND b.resource_id = $3
          AND b.status = 'active'
          AND a.status = 'active'
          AND m.status = 'active'
          AND m.valid_from <= $4
          AND (m.expires_at IS NULL OR m.expires_at > $4)
        ORDER BY b.actor_id
        LIMIT 17
        FOR SHARE OF b, a, m`,
      [this.authenticationContext.tenantId, type, id, at]
    );
    if (result.rowCount > 16) {
      throw authorizationError("authorization_directory_corrupt", "resource binding count is invalid");
    }
    return result.rows.map((row) => cloneAuthorization({
      actorId: row.actor_id,
      actorType: row.actor_type,
      relationship: row.relationship,
      controllerActorId: row.controller_actor_id ?? undefined,
      version: safeVersion(row.version, "resource binding version")
    }));
  }

  async findActiveAccessGrant({
    tenantId,
    granteeTenantId,
    granteeActorId,
    capability,
    resourceType,
    resourceId,
    purpose,
    policyVersion,
    now = new Date()
  }) {
    const context = this.authenticationContext;
    if (granteeTenantId !== context.tenantId || granteeActorId !== context.actorId) return undefined;
    const at = authorizationTimestamp("now", now);
    const result = await this.client.query(
      `SELECT *
         FROM access_grants
        WHERE tenant_id = $1
          AND grantee_tenant_id = $2
          AND grantee_actor_id = $3
          AND capability = $4
          AND resource_type = $5
          AND resource_id = $6
          AND purpose = $7
          AND policy_version = $8
          AND status = 'active'
          AND valid_from <= $9
          AND expires_at > $9
        FOR SHARE`,
      [
        tenantId,
        granteeTenantId,
        granteeActorId,
        capability,
        resourceType,
        resourceId,
        purpose,
        policyVersion,
        at
      ]
    );
    return result.rowCount === 1 ? cloneAuthorization(mapAccessGrant(result.rows[0])) : undefined;
  }

  async registerResource({ resourceType, resourceId, actorBindings = [], status = "active", now = new Date() }) {
    const type = assertAuthorizationIdentifier("resourceType", resourceType);
    const id = assertAuthorizationIdentifier("resourceId", resourceId);
    if (!RESOURCE_STATUSES.has(status) || !Array.isArray(actorBindings) || actorBindings.length > 16) {
      throw authorizationError("invalid_authorization_input", "authorization resource registration is invalid");
    }
    const normalizedBindings = actorBindings.map((binding) => {
      assertAuthorizationShape("authorization resource binding", binding, {
        required: ["actorId", "actorType", "relationship"],
        optional: ["controllerActorId"]
      });
      if (!RESOURCE_RELATIONSHIPS.has(binding.relationship)) {
        throw authorizationError("invalid_authorization_input", "authorization resource relationship is invalid");
      }
      const controllerActorId = binding.controllerActorId === undefined
        ? undefined
        : assertAuthorizationIdentifier("controllerActorId", binding.controllerActorId);
      const isAgentSubject = binding.relationship === "subject" && binding.actorType === ActorType.AGENT;
      if (
        (isAgentSubject && controllerActorId !== this.authenticationContext.actorId) ||
        (!isAgentSubject && controllerActorId !== undefined)
      ) {
        throw authorizationError("invalid_authorization_input", "authorization resource controller is invalid");
      }
      return {
        actorId: assertAuthorizationIdentifier("actorId", binding.actorId),
        actorType: assertAuthorizationIdentifier("actorType", binding.actorType),
        relationship: binding.relationship,
        ...(controllerActorId === undefined ? {} : { controllerActorId })
      };
    });
    if (new Set(normalizedBindings.map(({ actorId }) => actorId)).size !== normalizedBindings.length) {
      throw authorizationError("authorization_resource_conflict", "authorization resource binding is duplicated");
    }
    const occurredAt = authorizationTimestamp("now", now);
    for (const actorId of normalizedBindings.map(({ actorId }) => actorId).sort()) {
      await this.client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authorization_actor'), hashtext($1))",
        [actorId]
      );
      await this.client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authorization_membership:' || $1), hashtext($2))",
        [this.authenticationContext.tenantId, actorId]
      );
    }
    for (const binding of normalizedBindings) {
      const result = await this.client.query(
        `SELECT m.actor_id
           FROM memberships m
           JOIN actors a ON a.id = m.actor_id
          WHERE m.tenant_id = $1
            AND m.actor_id = $2
            AND a.actor_type = $3
            AND m.status = 'active'
            AND a.status = 'active'
            AND m.valid_from <= $4
            AND (m.expires_at IS NULL OR m.expires_at > $4)
            AND ($5::text IS NULL OR m.controller_actor_id = $5)
          FOR SHARE OF m, a`,
        [
          this.authenticationContext.tenantId,
          binding.actorId,
          binding.actorType,
          occurredAt,
          binding.controllerActorId ?? null
        ]
      );
      if (result.rowCount !== 1) {
        throw authorizationError("authorization_resource_rejected", "resource binding is unavailable");
      }
    }
    await this.client.query(
      `INSERT INTO authorization_resources(
         tenant_id, resource_type, resource_id, status, version,
         created_at, updated_at, schema_version
       ) VALUES ($1, $2, $3, $4, 1, $5, $5, 'authorization_resource.v1')`,
      [this.authenticationContext.tenantId, type, id, status, occurredAt]
    );
    for (const binding of normalizedBindings) {
      await this.client.query(
        `INSERT INTO authorization_resource_bindings(
           tenant_id, resource_type, resource_id, actor_id, relationship,
           status, version, created_at, updated_at, schema_version
         )
         VALUES ($1, $2, $3, $4, $5,
                 'active', 1, $6, $6, 'authorization_resource_binding.v1')`,
        [
          this.authenticationContext.tenantId,
          type,
          id,
          binding.actorId,
          binding.relationship,
          occurredAt
        ]
      );
    }
    return {
      tenantId: this.authenticationContext.tenantId,
      resourceType: type,
      resourceId: id,
      status,
      version: 1,
      actorBindings: cloneAuthorization(normalizedBindings),
      createdAt: occurredAt.toISOString(),
      updatedAt: occurredAt.toISOString(),
      schemaVersion: "authorization_resource.v1"
    };
  }
}
