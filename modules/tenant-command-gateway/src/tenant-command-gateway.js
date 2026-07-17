import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  TENANT_PROTOCOL_RESULT_SCHEMA_VERSION,
  assertTenantProtocolRequest,
  assertTenantProtocolResult
} from "../../../packages/api-contract/src/index.js";
import { assertAuthenticationContext } from "../../authentication/src/index.js";
import {
  AbuseControlService,
  AdmissionDisposition,
  AdmissionOutcome,
  PostgresQuotaStore,
  RequestMetric
} from "../../abuse-control/src/index.js";
import {
  AuthorizationService,
  PostgresAuthorizationAuditStore,
  PostgresAuthorizationDirectory
} from "../../authorization/src/index.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContextFromAuthentication,
  createTenantSecurityContextFromAuthorization,
  setTenantTransactionContext
} from "../../persistence/src/index.js";
import { TenantCommandExecutionStore } from "./tenant-command-execution-store.js";
import { TenantCommandHandlerRegistry } from "./tenant-command-handler-registry.js";

const ENVELOPE_REQUIRED_KEYS = new Set([
  "authenticationContext",
  "operationId",
  "payload",
  "requestId",
  "correlationId",
  "schemaVersion"
]);
const ENVELOPE_OPTIONAL_KEYS = new Set([
  "idempotencyKey",
  "resource",
  "purpose",
  "reasonCode",
  "approvalArtifact",
  "networkContext",
  "retryAttempt"
]);
const RESERVED_PAYLOAD_AUTHORITY_KEYS = new Set([
  "tenantId",
  "commandActorId",
  "clientId",
  "credentialId",
  "credentialVersion",
  "policyVersion",
  "roles",
  "authorizationDecision",
  "admissionId"
]);
const MAX_BODY_BYTES = 64 * 1024;
const TRUSTED_ENVELOPE_KEYS = new Set(["authenticationContext", "networkContext"]);

function assertIdentifier(name, value, { minimum = 1, maximum = 2048 } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new DomainError("invalid_tenant_command", `${name} is invalid`);
  }
  return value;
}

function assertPlainObject(name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DomainError("invalid_tenant_command", `${name} must be a plain object`);
  }
  return value;
}

function assertCallerRequest(input) {
  assertPlainObject("tenant command envelope", input);
  const request = Object.fromEntries(
    Object.entries(input).filter(([key]) => !TRUSTED_ENVELOPE_KEYS.has(key))
  );
  assertTenantProtocolRequest(request);
  return request;
}

function requireResourceBaselines(plan, resourceDeltas) {
  const expectedKinds = Object.entries(resourceDeltas)
    .filter(([, units]) => units > 0)
    .map(([kind]) => kind)
    .sort();
  if (expectedKinds.length === 0) {
    if (plan.resourceBaselines !== undefined) {
      throw new DomainError("invalid_tenant_command_plan", "unexpected resource baselines");
    }
    return undefined;
  }
  const baselines = assertPlainObject("tenant command resource baselines", plan.resourceBaselines);
  const actualKinds = Object.keys(baselines).sort();
  if (
    actualKinds.length !== expectedKinds.length ||
    actualKinds.some((kind, index) => kind !== expectedKinds[index]) ||
    Object.values(baselines).some((count) => !Number.isSafeInteger(count) || count < 0)
  ) {
    throw new DomainError("invalid_tenant_command_plan", "resource baselines do not match admission deltas");
  }
  return baselines;
}

function normalizeEnvelope(input, handler) {
  assertPlainObject("tenant command envelope", input);
  const keys = Object.keys(input);
  if (
    [...ENVELOPE_REQUIRED_KEYS].some((key) => !Object.hasOwn(input, key)) ||
    keys.some((key) => !ENVELOPE_REQUIRED_KEYS.has(key) && !ENVELOPE_OPTIONAL_KEYS.has(key))
  ) {
    throw new DomainError("invalid_tenant_command", "tenant command envelope has an invalid shape");
  }
  const authenticationContext = assertAuthenticationContext(input.authenticationContext);
  const payload = structuredClone(assertPlainObject("payload", input.payload));
  if (Object.keys(payload).some((key) => RESERVED_PAYLOAD_AUTHORITY_KEYS.has(key))) {
    throw new DomainError(
      "invalid_tenant_command",
      "tenant command payload cannot provide authentication or Tenant authority"
    );
  }
  assertNoRawPiiReference(payload, "tenantCommand.payload");
  let resource;
  if (input.resource !== undefined) {
    assertPlainObject("resource", input.resource);
    if (
      Object.keys(input.resource).length !== 2 ||
      !Object.hasOwn(input.resource, "resourceType") ||
      !Object.hasOwn(input.resource, "resourceId")
    ) {
      throw new DomainError("invalid_tenant_command", "resource reference is invalid");
    }
    resource = Object.freeze({
      resourceType: assertIdentifier("resource.resourceType", input.resource.resourceType, { maximum: 128 }),
      resourceId: assertIdentifier("resource.resourceId", input.resource.resourceId, { maximum: 256 })
    });
  }
  const idempotencyKey = input.idempotencyKey === undefined
    ? undefined
    : assertIdentifier("idempotencyKey", input.idempotencyKey, { minimum: 16, maximum: 256 });
  if (
    (handler.kind === "command" && idempotencyKey === undefined) ||
    (handler.kind === "query" && idempotencyKey !== undefined)
  ) {
    throw new DomainError(
      "invalid_tenant_command",
      handler.kind === "command"
        ? "durable tenant commands require idempotency"
        : "tenant queries do not accept command idempotency"
    );
  }
  const retryAttempt = input.retryAttempt ?? 0;
  if (!Number.isSafeInteger(retryAttempt) || retryAttempt < 0 || retryAttempt > 16) {
    throw new DomainError("invalid_tenant_command", "retryAttempt is invalid");
  }
  let approvalArtifact;
  if (input.approvalArtifact !== undefined) {
    approvalArtifact = Object.freeze(structuredClone(assertPlainObject("approvalArtifact", input.approvalArtifact)));
  }
  const normalized = Object.freeze({
    authenticationContext,
    operationId: assertIdentifier("operationId", input.operationId, { maximum: 128 }),
    payload: Object.freeze(payload),
    requestId: assertIdentifier("requestId", input.requestId, { minimum: 8, maximum: 128 }),
    correlationId: assertIdentifier("correlationId", input.correlationId, { minimum: 8, maximum: 128 }),
    idempotencyKey,
    resource,
    purpose: input.purpose === undefined
      ? undefined
      : assertIdentifier("purpose", input.purpose, { maximum: 128 }),
    reasonCode: input.reasonCode === undefined
      ? undefined
      : assertIdentifier("reasonCode", input.reasonCode, { maximum: 128 }),
    approvalArtifact,
    networkContext: input.networkContext,
    retryAttempt,
    schemaVersion: input.schemaVersion
  });
  const bodyBytes = Buffer.byteLength(JSON.stringify({
    operationId: normalized.operationId,
    payload: normalized.payload,
    requestId: normalized.requestId,
    correlationId: normalized.correlationId,
    idempotencyKey: normalized.idempotencyKey,
    resource: normalized.resource,
    purpose: normalized.purpose,
    reasonCode: normalized.reasonCode,
    approvalArtifact: normalized.approvalArtifact,
    retryAttempt: normalized.retryAttempt,
    schemaVersion: normalized.schemaVersion
  }));
  if (bodyBytes > MAX_BODY_BYTES) {
    throw new DomainError("tenant_command_too_large", "tenant command exceeds the gateway limit");
  }
  return { normalized, bodyBytes };
}

function createCommandIdentity(envelope, referenceHasher) {
  const context = envelope.authenticationContext;
  const commandPayloadHash = hashId("tenant_command_payload", {
    operationId: envelope.operationId,
    schemaVersion: envelope.schemaVersion,
    payload: envelope.payload,
    resource: envelope.resource ?? null,
    purpose: envelope.purpose ?? null,
    reasonCode: envelope.reasonCode ?? null,
    approvalArtifact: envelope.approvalArtifact ?? null
  });
  const clientRefHash = referenceHasher.hash(
    "authorization.client",
    `${context.tenantId}\0${context.clientId}`
  );
  if (envelope.idempotencyKey === undefined) {
    return { commandPayloadHash, clientRefHash };
  }
  const clientIdempotencyHash = hashId("tenant_command_client_idempotency", {
    tenantId: context.tenantId,
    actorId: context.actorId,
    clientId: context.clientId,
    operationId: envelope.operationId,
    idempotencyKey: envelope.idempotencyKey
  });
  const repositoryIdempotencyKey = hashId("tenant_command_repository_idempotency", {
    tenantId: context.tenantId,
    actorId: context.actorId,
    clientId: context.clientId,
    operationId: envelope.operationId,
    clientIdempotencyHash
  });
  const requestIdentityHash = hashId("tenant_command_identity", {
    tenantId: context.tenantId,
    actorId: context.actorId,
    actorType: context.actorType,
    clientId: context.clientId,
    operationId: envelope.operationId,
    commandPayloadHash,
    clientIdempotencyHash
  });
  return {
    commandPayloadHash,
    clientRefHash,
    repositoryIdempotencyKey,
    requestIdentityHash
  };
}

function assertCredentialMatchesContext(credential, context) {
  if (
    !credential ||
    credential.tenantId !== context.tenantId ||
    credential.actorId !== context.actorId ||
    credential.actorType !== context.actorType ||
    credential.clientId !== context.clientId ||
    credential.credentialId !== context.credentialId ||
    credential.version !== context.credentialVersion ||
    credential.policyVersion !== context.policyVersion
  ) {
    throw new DomainError("authorization_denied", "The requested operation is not available.");
  }
}

function stableConcurrencyError(error) {
  if (error?.code === "40001" || error?.code === "40P01") {
    return new DomainError(
      "stale_aggregate_version",
      "The command state changed concurrently; submit a new command after reloading state."
    );
  }
  return error;
}

function normalizeJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new DomainError("invalid_tenant_protocol_result", "tenant protocol result is not JSON-safe");
  }
  if (typeof value !== "object") {
    throw new DomainError("invalid_tenant_protocol_result", "tenant protocol result is not JSON-safe");
  }
  if (ancestors.has(value)) {
    throw new DomainError("invalid_tenant_protocol_result", "tenant protocol result is not JSON-safe");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (!Object.hasOwn(value, index) || item === undefined) {
          throw new DomainError("invalid_tenant_protocol_result", "tenant protocol result is not JSON-safe");
        }
        return normalizeJsonValue(item, ancestors);
      });
    }
    if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      throw new DomainError("invalid_tenant_protocol_result", "tenant protocol result is not JSON-safe");
    }
    const normalized = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) normalized[key] = normalizeJsonValue(item, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function assertResponseSafety(response) {
  const normalized = normalizeJsonValue(response);
  assertNoRawPiiReference(normalized, "tenantProtocol.response");
  const bytes = Buffer.byteLength(JSON.stringify(normalized));
  if (bytes > 256 * 1024) {
    throw new DomainError("command_response_too_large", "tenant response exceeds the gateway limit");
  }
  return normalized;
}

function createProtocolResult(envelope, response, replayed) {
  const result = {
    operationId: envelope.operationId,
    replayed,
    response: assertResponseSafety(response),
    schemaVersion: TENANT_PROTOCOL_RESULT_SCHEMA_VERSION
  };
  assertTenantProtocolResult(result);
  return Object.freeze(result);
}

export class TenantCommandGateway {
  constructor({
    pool,
    handlers,
    policyRegistry,
    credentialRegistry,
    referenceHasher,
    approvalVerifier,
    livePolicyAdapterFactory,
    abuseTelemetry
  }) {
    if (
      !pool ||
      typeof pool.connect !== "function" ||
      !policyRegistry?.getAuthenticated ||
      !credentialRegistry?.assertActive ||
      !referenceHasher?.hash ||
      (livePolicyAdapterFactory !== undefined && typeof livePolicyAdapterFactory !== "function")
    ) {
      throw new DomainError("invalid_tenant_gateway_config", "tenant command gateway dependencies are invalid");
    }
    this.pool = pool;
    this.handlers = handlers instanceof TenantCommandHandlerRegistry
      ? handlers
      : new TenantCommandHandlerRegistry(handlers);
    this.policyRegistry = policyRegistry;
    this.credentialRegistry = credentialRegistry;
    this.referenceHasher = referenceHasher;
    this.approvalVerifier = approvalVerifier;
    this.livePolicyAdapterFactory = livePolicyAdapterFactory;
    this.abuseTelemetry = abuseTelemetry;
    Object.freeze(this);
  }

  async execute(input) {
    const callerRequest = assertCallerRequest(input);
    const operationId = assertIdentifier("operationId", callerRequest.operationId, { maximum: 128 });
    const handler = this.handlers.require(operationId);
    const { normalized: envelope, bodyBytes } = normalizeEnvelope(input, handler);
    if (envelope.operationId !== handler.operationId) {
      throw new DomainError("tenant_operation_unavailable", "The requested operation is not available.");
    }
    if (handler.preflight) {
      await handler.preflight({
        payload: structuredClone(envelope.payload),
        resource: envelope.resource,
        operationId: envelope.operationId
      });
    }
    const identity = createCommandIdentity(envelope, this.referenceHasher);
    const tenantContext = createTenantSecurityContextFromAuthentication(envelope.authenticationContext);
    const eventRepository = new PostgresEventRepository({
      pool: this.pool,
      tenantContext,
      transactionRetries: 0
    });
    const coreRepository = new PostgresCoreRepository({
      pool: this.pool,
      eventRepository
    });
    const quotaStore = new PostgresQuotaStore({
      eventRepository: new PostgresEventRepository({
        pool: this.pool,
        tenantContext,
        transactionRetries: 3
      })
    });
    const abuseControl = new AbuseControlService({
      store: quotaStore,
      ...(this.abuseTelemetry === undefined ? {} : { telemetry: this.abuseTelemetry })
    });
    const resourceDeltas = handler.resourceDeltas?.(structuredClone(envelope.payload)) ?? {};
    const requiresResourceBaseline = Object.values(resourceDeltas).some((units) => units > 0);
    if (requiresResourceBaseline && typeof handler.loadResourceBaselines !== "function") {
      throw new DomainError(
        "invalid_tenant_command_handler",
        "persistent resource handler requires a baseline loader"
      );
    }
    const resourceBaselineLoader = !requiresResourceBaseline
      ? undefined
      : ({ client, resourceKinds }) => handler.loadResourceBaselines({
          client,
          coreRepository,
          resourceKinds
        });
    const admission = await abuseControl.admitTenant({
      authenticationContext: envelope.authenticationContext,
      operationId: envelope.operationId,
      ...(envelope.networkContext === undefined ? {} : { networkContext: envelope.networkContext }),
      ...(envelope.idempotencyKey === undefined ? {} : { idempotencyKey: envelope.idempotencyKey }),
      requestMetrics: {
        [RequestMetric.BODY_BYTES]: bodyBytes,
        [RequestMetric.COMMAND_BYTES]: handler.kind === "command" ? bodyBytes : 0
      },
      resourceDeltas,
      retryAttempt: envelope.retryAttempt
    }, resourceBaselineLoader === undefined ? {} : { resourceBaselineLoader });

    let admissionLocked = false;
    let transactionCommitted = false;
    try {
      const outcome = await coreRepository.withTenantTransaction(async (client) => {
        const admissionLock = await abuseControl.lockAdmissionForTransaction({
          admission,
          client,
          authenticationContext: envelope.authenticationContext,
          operationId: envelope.operationId
        });
        admissionLocked = true;
        const transactionNow = new Date(admissionLock.lockedAt);

        if (handler.kind === "command") {
          const replay = await coreRepository.findCommandInTransaction(client, {
            idempotencyKey: identity.repositoryIdempotencyKey,
            commandHash: identity.requestIdentityHash,
            lock: true
          });
          if (replay) {
            const activeCredential = await this.credentialRegistry.assertActive(
              envelope.authenticationContext.credentialId,
              transactionNow
            );
            assertCredentialMatchesContext(activeCredential, envelope.authenticationContext);
            const executionStore = new TenantCommandExecutionStore({
              client,
              authenticationContext: envelope.authenticationContext
            });
            await executionStore.assertReplay({
              idempotencyKey: identity.repositoryIdempotencyKey,
              operationId: envelope.operationId,
              requestIdentityHash: identity.requestIdentityHash,
              commandPayloadHash: identity.commandPayloadHash,
              clientRefHash: identity.clientRefHash,
              response: replay.response
            });
            const result = createProtocolResult(envelope, replay.response, true);
            await abuseControl.completeAdmissionInTransaction({
              admission,
              client,
              outcome: AdmissionOutcome.SUCCEEDED,
              retainPersistentResources: false
            });
            return { kind: "success", result };
          }
          if (admission.disposition === AdmissionDisposition.REPLAY) {
            throw new DomainError(
              "tenant_command_replay_unavailable",
              "idempotent accounting indicates a replay but no durable command response exists"
            );
          }
        }

        const directory = new PostgresAuthorizationDirectory({
          client,
          authenticationContext: envelope.authenticationContext
        });
        const auditStore = new PostgresAuthorizationAuditStore({
          client,
          authenticationContext: envelope.authenticationContext,
          referenceHasher: this.referenceHasher
        });
        const livePolicyAdapter = this.livePolicyAdapterFactory?.({
          client,
          coreRepository,
          authenticationContext: envelope.authenticationContext,
          handler,
          payload: structuredClone(envelope.payload)
        });
        const authorizationService = new AuthorizationService({
          policyRegistry: this.policyRegistry,
          directory,
          credentialRegistry: this.credentialRegistry,
          auditStore,
          referenceHasher: this.referenceHasher,
          livePolicyAdapter,
          approvalVerifier: this.approvalVerifier
        });
        let authorizationDecision;
        try {
          const authorizationRequest = {
            authenticationContext: envelope.authenticationContext,
            operationId: envelope.operationId,
            requestId: envelope.requestId,
            correlationId: envelope.correlationId,
            commandPayloadHash: identity.commandPayloadHash,
            ...(envelope.resource === undefined ? {} : { resource: envelope.resource }),
            ...(envelope.purpose === undefined ? {} : { purpose: envelope.purpose }),
            ...(envelope.reasonCode === undefined ? {} : { reasonCode: envelope.reasonCode }),
            ...(envelope.idempotencyKey === undefined ? {} : { idempotencyKey: envelope.idempotencyKey }),
            ...(envelope.approvalArtifact === undefined ? {} : { approvalArtifact: envelope.approvalArtifact }),
            ...(envelope.networkContext?.referenceHash === undefined
              ? {}
              : { sourceNetworkRefHash: envelope.networkContext.referenceHash }),
            now: transactionNow
          };
          const initialDecision = await authorizationService.authorize(authorizationRequest);
          authorizationDecision = await authorizationService.revalidate({
            decision: initialDecision,
            authenticationContext: envelope.authenticationContext,
            now: transactionNow
          });
        } catch (error) {
          if (error instanceof DomainError && error.code === "authorization_denied") {
            await abuseControl.completeAdmissionInTransaction({
              admission,
              client,
              outcome: AdmissionOutcome.FAILED,
              retainPersistentResources: false
            });
            return { kind: "denied", error };
          }
          throw error;
        }

        const authorizedContext = createTenantSecurityContextFromAuthorization({
          authenticationContext: envelope.authenticationContext,
          authorizationDecision,
          now: transactionNow
        });
        await setTenantTransactionContext(client, authorizedContext);

        if (handler.kind === "query") {
          const response = await handler.execute({
            client,
            coreRepository,
            authenticationContext: envelope.authenticationContext,
            authorizationDecision,
            payload: structuredClone(envelope.payload),
            resource: envelope.resource,
            now: transactionNow,
            requestId: envelope.requestId,
            correlationId: envelope.correlationId
          });
          const result = createProtocolResult(envelope, response, false);
          await abuseControl.completeAdmissionInTransaction({
            admission,
            client,
            outcome: AdmissionOutcome.SUCCEEDED,
            retainPersistentResources: false
          });
          return { kind: "success", result };
        }

        const plan = await handler.plan({
          client,
          coreRepository,
          directory,
          authenticationContext: envelope.authenticationContext,
          authorizationDecision,
          payload: structuredClone(envelope.payload),
          reasonCode: envelope.reasonCode,
          now: transactionNow,
          requestId: envelope.requestId,
          correlationId: envelope.correlationId
        });
        assertPlainObject("tenant command plan", plan);
        if (
          plan.additionalAuthorizationResources !== undefined &&
          (!Array.isArray(plan.additionalAuthorizationResources) ||
            plan.additionalAuthorizationResources.length < 1 ||
            plan.additionalAuthorizationResources.length > 8)
        ) {
          throw new DomainError(
            "invalid_tenant_command_plan",
            "additional authorization resources must be a bounded non-empty list"
          );
        }
        if (
          (plan.authorizationResource !== undefined ||
            plan.additionalAuthorizationResources !== undefined) &&
          plan.authorizationResourceTransition !== undefined
        ) {
          throw new DomainError(
            "invalid_tenant_command_plan",
            "tenant command cannot register and transition authorization resources"
          );
        }
        if (plan.authorizationResourceTransition !== undefined) {
          const transition = assertPlainObject(
            "tenant command authorization resource transition",
            plan.authorizationResourceTransition
          );
          if (
            transition.resourceType !== authorizationDecision.resourceType ||
            transition.resourceId !== authorizationDecision.resourceId ||
            transition.expectedVersion !== authorizationDecision.resourceVersion
          ) {
            throw new DomainError(
              "invalid_tenant_command_plan",
              "authorization resource transition does not match the current decision"
            );
          }
        }
        const plannedResult = createProtocolResult(envelope, plan.response, false);
        const resourceBaselines = requireResourceBaselines(plan, resourceDeltas);
        if (resourceBaselines !== undefined) {
          await abuseControl.synchronizePersistentResourcesInTransaction({
            admission,
            client,
            resourceBaselines
          });
        }
        const committed = await coreRepository.commitCommandInTransaction(client, {
          aggregateType: plan.aggregateType,
          aggregateId: plan.aggregateId,
          idempotencyKey: identity.repositoryIdempotencyKey,
          commandHash: identity.requestIdentityHash,
          events: plan.events,
          writes: plan.writes,
          response: plannedResult.response
        });
        if (committed.replayed) {
          throw new DomainError("tenant_command_transaction_conflict", "command changed during execution");
        }
        const committedResult = createProtocolResult(envelope, committed.response, false);
        if (plan.authorizationResource !== undefined) {
          await directory.registerResource({
            ...plan.authorizationResource,
            now: transactionNow
          });
        }
        for (const resource of plan.additionalAuthorizationResources ?? []) {
          await directory.registerResource({
            ...assertPlainObject("additional authorization resource", resource),
            now: transactionNow
          });
        }
        if (plan.authorizationResourceTransition !== undefined) {
          if (typeof directory.transitionResource !== "function") {
            throw new DomainError(
              "invalid_tenant_command_plan",
              "authorization resource transition is unavailable"
            );
          }
          await directory.transitionResource({
            ...plan.authorizationResourceTransition,
            now: transactionNow
          });
        }
        const executionStore = new TenantCommandExecutionStore({
          client,
          authenticationContext: envelope.authenticationContext
        });
        await executionStore.record({
          idempotencyKey: identity.repositoryIdempotencyKey,
          operationId: envelope.operationId,
          requestIdentityHash: identity.requestIdentityHash,
          commandPayloadHash: identity.commandPayloadHash,
          clientRefHash: identity.clientRefHash,
          authorizationDecisionId: authorizationDecision.decisionId,
          admissionId: admission.admissionId,
          businessEventId: committed.event.eventId,
          response: committed.response,
          completedAt: transactionNow
        });
        await abuseControl.completeAdmissionInTransaction({
          admission,
          client,
          outcome: AdmissionOutcome.SUCCEEDED,
          retainPersistentResources: true
        });
        return { kind: "success", result: committedResult };
      });
      transactionCommitted = true;
      abuseControl.confirmAdmissionTransactionCommit({ admission });
      if (outcome.kind === "denied") throw outcome.error;
      return outcome.result;
    } catch (error) {
      if (!transactionCommitted) {
        try {
          if (admissionLocked) {
            await abuseControl.failAdmissionAfterTransactionRollback({ admission });
          } else {
            await abuseControl.complete({ admission, outcome: AdmissionOutcome.FAILED });
          }
        } catch (completionError) {
          throw completionError;
        }
      }
      throw stableConcurrencyError(error);
    }
  }
}
