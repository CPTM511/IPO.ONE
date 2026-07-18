import { createOperationalId, hashId } from "../../../packages/domain/src/index.js";
import {
  assertAuthenticationContext,
  assertRecentPhishingResistantAuthentication
} from "../../authentication/src/index.js";
import {
  AUTHORIZATION_DECISION_SCHEMA_VERSION,
  ApprovalRequirement,
  AuthorizationDecisionValue,
  IdempotencyRequirement,
  OwnershipRule
} from "./authorization-constants.js";
import {
  assertAuthorizationIdentifier,
  assertAuthorizationList,
  assertAuthorizationShape,
  assertAuthorizationString,
  assertReasonCode,
  authorizationError,
  authorizationTimestamp,
  cloneAuthorization,
  deepFreezeAuthorization
} from "./authorization-utils.js";

const trustedAuthorizationDecisions = new WeakSet();
const authorizationFacts = new WeakMap();
const trustedApprovalPreparations = new WeakSet();

function decisionVersion(name, value, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw authorizationError("invalid_authorization_decision", `${name} is invalid`);
  }
  return value;
}

function createAuthorizationDecision(input, facts) {
  const authorizedAt = authorizationTimestamp("authorizedAt", input.authorizedAt);
  const expiresAt = authorizationTimestamp("expiresAt", input.expiresAt);
  if (expiresAt <= authorizedAt) {
    throw authorizationError("invalid_authorization_decision", "authorization decision expiry is invalid");
  }
  if (
    (input.accessGrantId === undefined) !== (input.accessGrantVersion === undefined) ||
    (input.approvalProposalId === undefined) !== (input.approvalProposalVersion === undefined)
  ) {
    throw authorizationError(
      "invalid_authorization_decision",
      "authorization decision reference is incomplete"
    );
  }
  const decision = {
    decisionId: createOperationalId("authorization_decision"),
    tenantId: assertAuthorizationIdentifier("tenantId", input.tenantId),
    actorId: assertAuthorizationIdentifier("actorId", input.actorId),
    actorType: assertAuthorizationIdentifier("actorType", input.actorType),
    clientId: assertAuthorizationIdentifier("clientId", input.clientId),
    credentialId: assertAuthorizationIdentifier("credentialId", input.credentialId),
    operationId: assertAuthorizationIdentifier("operationId", input.operationId),
    action: assertAuthorizationIdentifier("action", input.action),
    resourceType: assertAuthorizationIdentifier("resourceType", input.resourceType),
    resourceId: assertAuthorizationIdentifier("resourceId", input.resourceId),
    authorizationDecision: AuthorizationDecisionValue.ALLOW,
    policyVersion: assertAuthorizationIdentifier("policyVersion", input.policyVersion),
    requiredCapability: assertAuthorizationIdentifier("requiredCapability", input.requiredCapability),
    membershipId: assertAuthorizationIdentifier("membershipId", input.membershipId),
    membershipVersion: decisionVersion("membershipVersion", input.membershipVersion, { minimum: 1 }),
    revalidationCount: decisionVersion("revalidationCount", input.revalidationCount),
    resourceVersion: decisionVersion("resourceVersion", input.resourceVersion),
    liveStateVersion: decisionVersion("liveStateVersion", input.liveStateVersion),
    ...(input.accessGrantId === undefined
      ? {}
      : {
          accessGrantId: assertAuthorizationIdentifier("accessGrantId", input.accessGrantId),
          accessGrantVersion: decisionVersion("accessGrantVersion", input.accessGrantVersion, {
            minimum: 1
          })
        }),
    tokenJtiHash: assertAuthorizationString("tokenJtiHash", input.tokenJtiHash, {
      minimum: 32,
      maximum: 128,
      pattern: /^[A-Za-z0-9_-]+$/
    }),
    authorizationRequestHash: assertAuthorizationString(
      "authorizationRequestHash",
      input.authorizationRequestHash,
      { minimum: 32, maximum: 128, pattern: /^[A-Za-z0-9_-]+$/ }
    ),
    commandPayloadHash: assertAuthorizationString("commandPayloadHash", input.commandPayloadHash, {
      minimum: 66,
      maximum: 66,
      pattern: /^0x[0-9a-f]{64}$/
    }),
    commandHash: assertAuthorizationString("commandHash", input.commandHash, {
      minimum: 66,
      maximum: 66,
      pattern: /^0x[0-9a-f]{64}$/
    }),
    ...(input.idempotencyKeyHash === undefined
      ? {}
      : {
          idempotencyKeyHash: assertAuthorizationString(
            "idempotencyKeyHash",
            input.idempotencyKeyHash,
            { minimum: 32, maximum: 128, pattern: /^[A-Za-z0-9_-]+$/ }
          )
        }),
    approvalIds: assertAuthorizationList("approvalIds", input.approvalIds, {
      maximumItems: 8,
      itemValidator: assertAuthorizationIdentifier
    }),
    ...(input.approvalProposalId === undefined
      ? {}
      : {
          approvalProposalId: assertAuthorizationIdentifier(
            "approvalProposalId",
            input.approvalProposalId
          ),
          approvalProposalVersion: decisionVersion(
            "approvalProposalVersion",
            input.approvalProposalVersion,
            { minimum: 1 }
          )
        }),
    authorizedAt: authorizedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    schemaVersion: AUTHORIZATION_DECISION_SCHEMA_VERSION
  };
  deepFreezeAuthorization(decision);
  trustedAuthorizationDecisions.add(decision);
  authorizationFacts.set(decision, deepFreezeAuthorization(cloneAuthorization(facts)));
  return decision;
}

function createApprovalPreparation(input) {
  const preparedAt = authorizationTimestamp("preparedAt", input.preparedAt);
  const expiresAt = authorizationTimestamp("expiresAt", input.expiresAt);
  if (expiresAt <= preparedAt || expiresAt.getTime() - preparedAt.getTime() > 60_000) {
    throw authorizationError("invalid_approval_preparation", "approval preparation expiry is invalid");
  }
  const preparation = deepFreezeAuthorization({
    preparationId: createOperationalId("approval_preparation"),
    tenantId: assertAuthorizationIdentifier("tenantId", input.tenantId),
    commandActorId: assertAuthorizationIdentifier("commandActorId", input.commandActorId),
    commandActorType: assertAuthorizationIdentifier("commandActorType", input.commandActorType),
    commandClientId: assertAuthorizationIdentifier("commandClientId", input.commandClientId),
    operationId: assertAuthorizationIdentifier("operationId", input.operationId),
    action: assertAuthorizationIdentifier("action", input.action),
    resourceType: assertAuthorizationIdentifier("resourceType", input.resourceType),
    resourceId: assertAuthorizationIdentifier("resourceId", input.resourceId),
    resourceVersion: decisionVersion("resourceVersion", input.resourceVersion),
    liveStateVersion: decisionVersion("liveStateVersion", input.liveStateVersion),
    policyVersion: assertAuthorizationIdentifier("policyVersion", input.policyVersion),
    reasonCode: assertReasonCode("reasonCode", input.reasonCode),
    commandPayloadHash: assertAuthorizationString("commandPayloadHash", input.commandPayloadHash, {
      minimum: 66,
      maximum: 66,
      pattern: /^0x[0-9a-f]{64}$/
    }),
    commandHash: assertAuthorizationString("commandHash", input.commandHash, {
      minimum: 66,
      maximum: 66,
      pattern: /^0x[0-9a-f]{64}$/
    }),
    idempotencyKeyHash: assertAuthorizationString(
      "idempotencyKeyHash",
      input.idempotencyKeyHash,
      { minimum: 32, maximum: 128, pattern: /^[A-Za-z0-9_-]+$/ }
    ),
    preparedAt: preparedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    schemaVersion: "approval_preparation.v2"
  });
  trustedApprovalPreparations.add(preparation);
  return preparation;
}

export function assertApprovalPreparation(
  preparation,
  { now = new Date(), allowExpired = false } = {}
) {
  if (!preparation || typeof preparation !== "object" || !trustedApprovalPreparations.has(preparation)) {
    throw authorizationError(
      "approval_preparation_required",
      "a server-created approval preparation is required"
    );
  }
  if (!allowExpired && new Date(preparation.expiresAt) <= authorizationTimestamp("now", now)) {
    throw authorizationError("approval_preparation_expired", "approval preparation has expired");
  }
  return preparation;
}

export function assertAuthorizationDecision(decision, { now } = {}) {
  if (
    !decision ||
    typeof decision !== "object" ||
    !trustedAuthorizationDecisions.has(decision) ||
    decision.authorizationDecision !== AuthorizationDecisionValue.ALLOW
  ) {
    throw authorizationError("authorization_decision_required", "a server-created allow decision is required");
  }
  if (now !== undefined && new Date(decision.expiresAt) <= authorizationTimestamp("now", now)) {
    throw authorizationError("authorization_decision_expired", "authorization decision has expired");
  }
  return decision;
}

function getAuthorizationDecisionFacts(decision) {
  assertAuthorizationDecision(decision);
  const facts = authorizationFacts.get(decision);
  if (!facts) {
    throw authorizationError("authorization_decision_required", "authorization decision facts are unavailable");
  }
  return facts;
}

class AuthorizationStageError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.reasonCode = reasonCode;
  }
}

class AuthorizationAuditUnavailable extends Error {}

async function stage(reasonCode, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code === "40001" || error?.code === "40P01") throw error;
    throw new AuthorizationStageError(reasonCode);
  }
}

function compareCredential(context, credential) {
  return (
    credential.tenantId === context.tenantId &&
    credential.actorId === context.actorId &&
    credential.actorType === context.actorType &&
    credential.clientId === context.clientId &&
    credential.credentialId === context.credentialId &&
    credential.version === context.credentialVersion &&
    credential.policyVersion === context.policyVersion
  );
}

function normalizeRequest(input) {
  assertAuthorizationShape("authorization request", input, {
    required: [
      "authenticationContext",
      "operationId",
      "requestId",
      "correlationId",
      "commandPayloadHash"
    ],
    optional: [
      "resource",
      "purpose",
      "reasonCode",
      "idempotencyKey",
      "approvalArtifact",
      "sourceNetworkRefHash",
      "now"
    ]
  });
  const authenticationContext = assertAuthenticationContext(input.authenticationContext);
  let resource;
  if (input.resource !== undefined) {
    assertAuthorizationShape("authorization resource reference", input.resource, {
      required: ["resourceType", "resourceId"]
    });
    resource = Object.freeze({
      resourceType: assertAuthorizationIdentifier("resourceType", input.resource.resourceType),
      resourceId: assertAuthorizationIdentifier("resourceId", input.resource.resourceId)
    });
  }
  return Object.freeze({
    authenticationContext,
    operationId: assertAuthorizationIdentifier("operationId", input.operationId),
    requestId: assertAuthorizationIdentifier("requestId", input.requestId),
    correlationId: assertAuthorizationIdentifier("correlationId", input.correlationId),
    commandPayloadHash: assertAuthorizationString("commandPayloadHash", input.commandPayloadHash, {
      minimum: 66,
      maximum: 66,
      pattern: /^0x[0-9a-f]{64}$/
    }),
    resource,
    purpose: input.purpose === undefined ? undefined : assertAuthorizationIdentifier("purpose", input.purpose),
    reasonCode: input.reasonCode === undefined ? undefined : assertReasonCode("reasonCode", input.reasonCode),
    idempotencyKey: input.idempotencyKey === undefined
      ? undefined
      : assertAuthorizationString("idempotencyKey", input.idempotencyKey, {
          minimum: 16,
          maximum: 256,
          pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
        }),
    approvalArtifact: snapshotApprovalArtifact(input.approvalArtifact),
    sourceNetworkRefHash: input.sourceNetworkRefHash === undefined
      ? undefined
      : assertAuthorizationString("sourceNetworkRefHash", input.sourceNetworkRefHash, {
          minimum: 32,
          maximum: 128,
          pattern: /^[A-Za-z0-9_-]+$/
        }),
    now: authorizationTimestamp("now", input.now ?? new Date())
  });
}

function denialResource(normalized, policy) {
  return {
    resourceType: policy?.resourceType ?? normalized.resource?.resourceType ?? "unknown_resource",
    resourceId: normalized.resource?.resourceId ?? "resource_pending"
  };
}

function snapshotApprovalArtifact(value) {
  if (value === undefined) return undefined;
  assertAuthorizationShape("approvalArtifact", value, {
    required: ["proposalId", "proposalVersion"]
  });
  return deepFreezeAuthorization({
    proposalId: assertAuthorizationIdentifier("proposalId", value.proposalId),
    proposalVersion: decisionVersion("proposalVersion", value.proposalVersion, { minimum: 1 })
  });
}

export class AuthorizationService {
  constructor({
    policyRegistry,
    directory,
    credentialRegistry,
    auditStore,
    referenceHasher,
    livePolicyAdapter,
    approvalVerifier,
    decisionTtlMs = 30_000
  }) {
    if (
      !policyRegistry?.getAuthenticated ||
      !directory?.requireActiveMembership ||
      !directory?.resolveResource ||
      !directory?.findActiveAccessGrant ||
      !credentialRegistry?.assertActive ||
      !auditStore?.append ||
      !referenceHasher?.hash
    ) {
      throw authorizationError("invalid_authorization_configuration", "authorization adapters are required");
    }
    if (!Number.isSafeInteger(decisionTtlMs) || decisionTtlMs < 1_000 || decisionTtlMs > 60_000) {
      throw authorizationError("invalid_authorization_configuration", "decisionTtlMs is invalid");
    }
    this.policyRegistry = policyRegistry;
    this.directory = directory;
    this.credentialRegistry = credentialRegistry;
    this.auditStore = auditStore;
    this.referenceHasher = referenceHasher;
    this.livePolicyAdapter = livePolicyAdapter;
    this.approvalVerifier = approvalVerifier;
    this.decisionTtlMs = decisionTtlMs;
    Object.freeze(this);
  }

  async authorize(input) {
    const normalized = normalizeRequest(input);
    return this.#evaluate(normalized);
  }

  async prepareApproval(input) {
    const normalized = normalizeRequest(input);
    return this.#evaluate(normalized, {}, { prepareApproval: true });
  }

  async revalidate(input) {
    assertAuthorizationShape("authorization revalidation", input, {
      required: ["decision", "authenticationContext"],
      optional: ["now"]
    });
    const now = authorizationTimestamp("now", input.now ?? new Date());
    const previous = assertAuthorizationDecision(input.decision, { now });
    const authenticationContext = assertAuthenticationContext(input.authenticationContext);
    if (
      previous.tenantId !== authenticationContext.tenantId ||
      previous.actorId !== authenticationContext.actorId ||
      previous.actorType !== authenticationContext.actorType ||
      previous.clientId !== authenticationContext.clientId ||
      previous.credentialId !== authenticationContext.credentialId ||
      previous.tokenJtiHash !== authenticationContext.tokenJtiHash
    ) {
      throw authorizationError("authorization_denied", "The requested operation is not available.");
    }
    const facts = getAuthorizationDecisionFacts(previous);
    return this.#evaluate(Object.freeze({
      ...facts,
      authenticationContext,
      now
    }), {
      membershipVersion: previous.membershipVersion,
      resourceVersion: previous.resourceVersion,
      accessGrantVersion: previous.accessGrantVersion,
      liveStateVersion: previous.liveStateVersion,
      commandHash: previous.commandHash,
      authorizationRequestHash: previous.authorizationRequestHash,
      revalidationCount: previous.revalidationCount + 1
    });
  }

  async #evaluate(normalized, expected = {}, { prepareApproval = false } = {}) {
    const context = normalized.authenticationContext;
    let policy;
    let membership;
    let resource;
    let accessGrant;
    let liveStateVersion = 0;
    let approval = { approvalIds: [] };
    let commandHash;
    try {
      policy = await stage("route_contract_rejected", async () => {
        const resolved = this.policyRegistry.getAuthenticated(normalized.operationId);
        if (!resolved || context.policyVersion !== this.policyRegistry.policyVersion) {
          throw new Error("operation policy is unavailable");
        }
        return resolved;
      });

      const credential = await stage("credential_status_rejected", async () => {
        const active = await this.credentialRegistry.assertActive(context.credentialId, normalized.now);
        if (!compareCredential(context, active)) throw new Error("credential binding changed");
        return active;
      });

      membership = await stage("membership_status_rejected", async () => {
        const active = await this.directory.requireActiveMembership({
          tenantId: context.tenantId,
          actorId: context.actorId,
          actorType: context.actorType,
          clientId: context.clientId,
          policyVersion: context.policyVersion,
          now: normalized.now
        });
        if (expected.membershipVersion !== undefined && active.version !== expected.membershipVersion) {
          throw new Error("membership changed");
        }
        return active;
      });

      await stage("actor_capability_rejected", async () => {
        if (
          !policy.allowedActorTypes.includes(context.actorType) ||
          !context.capabilities.includes(policy.requiredCapability) ||
          !credential.allowedCapabilities.includes(policy.requiredCapability) ||
          !membership.capabilities.includes(policy.requiredCapability)
        ) {
          throw new Error("actor or capability is not allowed");
        }
        if (policy.requiresRecentMfaActorTypes.includes(context.actorType)) {
          assertRecentPhishingResistantAuthentication(context, { now: normalized.now });
        }
      });

      ({ resource, accessGrant } = await stage("resource_access_denied", async () =>
        this.#resolveResourceAccess({ normalized, policy, context, expected })
      ));

      const liveResult = await stage("live_policy_rejected", async () => {
        if (policy.liveChecks.length === 0) {
          return { liveStateVersion: 0 };
        }
        if (!this.livePolicyAdapter?.evaluate) throw new Error("live policy adapter is unavailable");
        const result = await this.livePolicyAdapter.evaluate({
          tenantId: resource?.tenantId ?? context.tenantId,
          policy,
          resource,
          authenticationContext: context,
          now: normalized.now
        });
        if (
          !Number.isSafeInteger(result?.liveStateVersion) ||
          result.liveStateVersion < 1 ||
          (expected.liveStateVersion !== undefined && result.liveStateVersion !== expected.liveStateVersion)
        ) {
          throw new Error("live policy state changed");
        }
        return result;
      });
      liveStateVersion = liveResult.liveStateVersion;

      await stage("reason_requirement_rejected", async () => {
        if (
          policy.reasonPolicy.required &&
          (!normalized.reasonCode || !policy.reasonPolicy.allowedCodes.includes(normalized.reasonCode))
        ) {
          throw new Error("reason code is required");
        }
      });

      const idempotencyKeyHash = await stage("idempotency_requirement_rejected", async () => {
        if (
          (policy.idempotencyRequirement === IdempotencyRequirement.REQUIRED && !normalized.idempotencyKey) ||
          (policy.idempotencyRequirement === IdempotencyRequirement.PROHIBITED && normalized.idempotencyKey)
        ) {
          throw new Error("idempotency contract is not satisfied");
        }
        return normalized.idempotencyKey === undefined
          ? undefined
          : this.referenceHasher.hash("authorization.idempotency", normalized.idempotencyKey);
      });

      commandHash = hashId("authorization_command", {
        tenantId: context.tenantId,
        actorId: context.actorId,
        operationId: policy.operationId,
        action: policy.action,
        resourceType: policy.resourceType,
        resourceId: resource?.resourceId ?? "resource_pending",
        resourceVersion: resource?.version ?? 0,
        liveStateVersion,
        reasonCode: normalized.reasonCode ?? null,
        idempotencyKeyHash: idempotencyKeyHash ?? null,
        commandPayloadHash: normalized.commandPayloadHash,
        policyVersion: context.policyVersion
      });
      const authorizationRequestHash = this.referenceHasher.hash(
        "authorization.request",
        `${commandHash}\0${context.tokenJtiHash}`
      );
      if (
        (expected.commandHash !== undefined && commandHash !== expected.commandHash) ||
        (expected.authorizationRequestHash !== undefined && authorizationRequestHash !== expected.authorizationRequestHash)
      ) {
        throw new AuthorizationStageError("authorization_state_changed");
      }

      if (prepareApproval) {
        if (
          policy.approvalRequirement !== ApprovalRequirement.DUAL_CONTROL ||
          normalized.approvalArtifact !== undefined ||
          !normalized.reasonCode ||
          !idempotencyKeyHash
        ) {
          throw new AuthorizationStageError("approval_preparation_rejected");
        }
        const preparation = createApprovalPreparation({
          tenantId: context.tenantId,
          commandActorId: context.actorId,
          commandActorType: context.actorType,
          commandClientId: context.clientId,
          operationId: policy.operationId,
          action: policy.action,
          resourceType: policy.resourceType,
          resourceId: resource?.resourceId ?? "resource_pending",
          resourceVersion: resource?.version ?? 0,
          liveStateVersion,
          policyVersion: context.policyVersion,
          reasonCode: normalized.reasonCode,
          commandPayloadHash: normalized.commandPayloadHash,
          commandHash,
          idempotencyKeyHash,
          preparedAt: normalized.now,
          expiresAt: new Date(normalized.now.getTime() + this.decisionTtlMs)
        });
        await this.#appendAudit({
          normalized,
          context,
          policy,
          membership,
          resourceId: resource?.resourceId ?? "resource_pending",
          accessGrant,
          decision: AuthorizationDecisionValue.DENY,
          reasonCode: "approval_required",
          approvalIds: [],
          commandPayloadHash: normalized.commandPayloadHash,
          commandHash
        });
        return preparation;
      }

      approval = await stage("approval_requirement_rejected", async () =>
        this.#verifyApproval({ normalized, policy, context, resource, commandHash })
      );

      const resourceId = resource?.resourceId ?? "resource_pending";
      const facts = Object.freeze({
        operationId: normalized.operationId,
        requestId: normalized.requestId,
        correlationId: normalized.correlationId,
        resource: normalized.resource,
        purpose: normalized.purpose,
        reasonCode: normalized.reasonCode,
        idempotencyKey: normalized.idempotencyKey,
        approvalArtifact: normalized.approvalArtifact,
        sourceNetworkRefHash: normalized.sourceNetworkRefHash,
        commandPayloadHash: normalized.commandPayloadHash
      });
      const decision = createAuthorizationDecision({
        tenantId: context.tenantId,
        actorId: context.actorId,
        actorType: context.actorType,
        clientId: context.clientId,
        credentialId: context.credentialId,
        operationId: policy.operationId,
        action: policy.action,
        resourceType: policy.resourceType,
        resourceId,
        policyVersion: context.policyVersion,
        requiredCapability: policy.requiredCapability,
        membershipId: membership.membershipId,
        membershipVersion: membership.version,
        revalidationCount: expected.revalidationCount ?? 0,
        resourceVersion: resource?.version ?? 0,
        liveStateVersion,
        accessGrantId: accessGrant?.accessGrantId,
        accessGrantVersion: accessGrant?.version,
        tokenJtiHash: context.tokenJtiHash,
        authorizationRequestHash,
        commandPayloadHash: normalized.commandPayloadHash,
        commandHash,
        idempotencyKeyHash,
        approvalIds: approval.approvalIds,
        approvalProposalId: approval.proposalId,
        approvalProposalVersion: approval.proposalVersion,
        authorizedAt: normalized.now,
        expiresAt: new Date(normalized.now.getTime() + this.decisionTtlMs)
      }, facts);
      await this.#appendAudit({
        normalized,
        context,
        policy,
        membership,
        resourceId,
        accessGrant,
        decision: AuthorizationDecisionValue.ALLOW,
        reasonCode: normalized.reasonCode ?? "authorization_allowed",
        approvalIds: approval.approvalIds,
        approvalProposalId: approval.proposalId,
        approvalProposalVersion: approval.proposalVersion,
        authorizationDecisionId: decision.decisionId,
        commandPayloadHash: normalized.commandPayloadHash,
        commandHash
      });
      return decision;
    } catch (error) {
      if (error?.code === "40001" || error?.code === "40P01") throw error;
      if (error instanceof AuthorizationAuditUnavailable) {
        throw authorizationError("authorization_unavailable", "Authorization is temporarily unavailable.");
      }
      const reasonCode = error instanceof AuthorizationStageError
        ? error.reasonCode
        : "authorization_internal_rejected";
      const fallbackPolicy = policy ?? {
        operationId: normalized.operationId,
        action: "authorization.operation",
        resourceType: normalized.resource?.resourceType ?? "unknown_resource"
      };
      try {
        await this.#appendAudit({
          normalized,
          context,
          policy: fallbackPolicy,
          membership,
          resourceId: denialResource(normalized, fallbackPolicy).resourceId,
          accessGrant,
          decision: AuthorizationDecisionValue.DENY,
          reasonCode,
          approvalIds: [],
          commandPayloadHash: commandHash ? normalized.commandPayloadHash : undefined,
          commandHash
        });
      } catch {
        throw authorizationError("authorization_unavailable", "Authorization is temporarily unavailable.");
      }
      throw authorizationError("authorization_denied", "The requested operation is not available.");
    }
  }

  async #resolveResourceAccess({ normalized, policy, context, expected }) {
    if (policy.ownershipRule === OwnershipRule.NONE) {
      if (normalized.resource !== undefined || normalized.purpose !== undefined) {
        throw new Error("create operation cannot accept resource authority");
      }
      if (expected.resourceVersion !== undefined && expected.resourceVersion !== 0) {
        throw new Error("create authorization changed");
      }
      return { resource: undefined, accessGrant: undefined };
    }
    if (!normalized.resource || normalized.resource.resourceType !== policy.resourceType) {
      throw new Error("resource reference is invalid");
    }
    const resource = await this.directory.resolveResource({
      ...normalized.resource,
      tenantId: context.tenantId,
      actorId: context.actorId
    });
    if (
      !resource ||
      resource.resourceType !== policy.resourceType ||
      resource.resourceId !== normalized.resource.resourceId ||
      (expected.resourceVersion !== undefined && resource.version !== expected.resourceVersion)
    ) {
      throw new Error("resource is unavailable");
    }
    if (policy.ownershipRule === OwnershipRule.ACTOR) {
      if (
        resource.tenantId !== context.tenantId ||
        (resource.ownerActorId !== context.actorId && resource.actorAuthorized !== true)
      ) {
        throw new Error("actor does not own resource");
      }
      return { resource, accessGrant: undefined };
    }
    if (policy.ownershipRule === OwnershipRule.TENANT) {
      if (resource.tenantId !== context.tenantId) throw new Error("tenant does not own resource");
      return { resource, accessGrant: undefined };
    }
    if (policy.ownershipRule !== OwnershipRule.TENANT_OR_ACCESS_GRANT) {
      throw new Error("ownership rule is not supported");
    }
    if (resource.tenantId === context.tenantId) {
      if (normalized.purpose !== undefined) throw new Error("unused grant purpose is rejected");
      return { resource, accessGrant: undefined };
    }
    if (policy.purposePolicy !== "grant_only" || !normalized.purpose || !policy.accessGrantCapability) {
      throw new Error("AccessGrant purpose is required");
    }
    const accessGrant = await this.directory.findActiveAccessGrant({
      tenantId: resource.tenantId,
      granteeTenantId: context.tenantId,
      granteeActorId: context.actorId,
      capability: policy.accessGrantCapability,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      purpose: normalized.purpose,
      policyVersion: context.policyVersion,
      now: normalized.now
    });
    if (
      !accessGrant ||
      (expected.accessGrantVersion !== undefined && accessGrant.version !== expected.accessGrantVersion)
    ) {
      throw new Error("AccessGrant is unavailable");
    }
    return { resource, accessGrant };
  }

  async #verifyApproval({ normalized, policy, context, resource, commandHash }) {
    if (policy.approvalRequirement === ApprovalRequirement.PROHIBITED) {
      throw new Error("operation is prohibited");
    }
    if (policy.approvalRequirement !== ApprovalRequirement.DUAL_CONTROL) {
      if (normalized.approvalArtifact !== undefined) {
        throw new Error("unused approval authority is rejected");
      }
      return { approvalIds: [] };
    }
    if (!this.approvalVerifier?.assertApproved || normalized.approvalArtifact === undefined) {
      throw new Error("dual-control approval is unavailable");
    }
    const verified = await this.approvalVerifier.assertApproved({
      approvalArtifact: normalized.approvalArtifact,
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: policy.action,
      resourceType: policy.resourceType,
      resourceId: resource?.resourceId ?? "resource_pending",
      operationId: policy.operationId,
      resourceVersion: resource?.version ?? 0,
      reasonCode: normalized.reasonCode,
      commandHash,
      policyVersion: context.policyVersion,
      now: normalized.now
    });
    assertAuthorizationShape("verified approval", verified, {
      required: [
        "approvalIds",
        "approverActorIds",
        "commandHash",
        "proposalId",
        "proposalVersion"
      ]
    });
    const approvalIds = assertAuthorizationList("approvalIds", verified.approvalIds, {
      maximumItems: 8,
      allowEmpty: false,
      itemValidator: assertAuthorizationIdentifier
    });
    const approverActorIds = assertAuthorizationList("approverActorIds", verified.approverActorIds, {
      maximumItems: 8,
      allowEmpty: false,
      itemValidator: assertAuthorizationIdentifier
    });
    if (
      approvalIds.length < 2 ||
      approverActorIds.length !== approvalIds.length ||
      approverActorIds.includes(context.actorId) ||
      verified.commandHash !== commandHash ||
      verified.proposalId !== normalized.approvalArtifact.proposalId ||
      verified.proposalVersion !== normalized.approvalArtifact.proposalVersion
    ) {
      throw new Error("dual-control approval does not match the command");
    }
    return {
      approvalIds,
      proposalId: verified.proposalId,
      proposalVersion: decisionVersion("proposalVersion", verified.proposalVersion, { minimum: 1 })
    };
  }

  async #appendAudit({
    normalized,
    context,
    policy,
    membership,
    resourceId,
    accessGrant,
    decision,
    reasonCode,
    approvalIds,
    approvalProposalId,
    approvalProposalVersion,
    authorizationDecisionId,
    commandPayloadHash,
    commandHash
  }) {
    try {
      await this.auditStore.append({
        occurredAt: normalized.now,
        requestId: normalized.requestId,
        correlationId: normalized.correlationId,
        tenantId: context.tenantId,
        actorId: context.actorId,
        actorType: context.actorType,
        clientId: context.clientId,
        tokenJtiHash: context.tokenJtiHash,
        operationId: policy.operationId,
        action: policy.action,
        resourceType: policy.resourceType,
        resourceId,
        authorizationDecision: decision,
        policyVersion: context.policyVersion,
        reasonCode,
        approvalIds,
        ...(approvalProposalId === undefined
          ? {}
          : { approvalProposalId, approvalProposalVersion }),
        membershipId: membership?.membershipId ?? "membership_unresolved",
        ...(accessGrant ? { accessGrantId: accessGrant.accessGrantId } : {}),
        ...(normalized.sourceNetworkRefHash
          ? { sourceNetworkRefHash: normalized.sourceNetworkRefHash }
          : {}),
        ...(authorizationDecisionId ? { authorizationDecisionId } : {}),
        ...(commandPayloadHash ? { commandPayloadHash } : {}),
        ...(commandHash ? { commandHash } : {})
      });
    } catch {
      throw new AuthorizationAuditUnavailable();
    }
  }
}
