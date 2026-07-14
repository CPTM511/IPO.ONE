import assert from "node:assert/strict";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../authentication/src/index.js";
import { createAuthenticationContext } from "../../authentication/src/authentication-context.js";
import {
  AgentTenantCommandClient,
  HumanTenantCommandClient,
  TenantCommandHandlerRegistry,
  createAgentSubjectCommandHandler,
  createDraftMandateCommandHandler,
  createTenantFoundationHandlers,
  normalizeDraftMandatePayload,
  readAgentSelfQueryHandler,
  readMandateQueryHandler,
  revokeDraftMandateCommandHandler
} from "../src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

function authenticationContext(actorType, actorId) {
  return createAuthenticationContext({
    tenantId: "tenant_gateway_test",
    actorId,
    actorType,
    clientId: `client_${actorId}`,
    credentialId: `credential_${actorId}`,
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: [],
    roles: [],
    tokenJtiHash: "token_jti_hash_gateway_test_00000000000000000000",
    authenticationMethod: actorType === ActorType.HUMAN
      ? ClientAuthenticationMethod.OIDC_PKCE_BFF
      : ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: actorType === ActorType.HUMAN
      ? SenderConstraintMethod.HOST_SESSION
      : SenderConstraintMethod.MTLS,
    authenticatedAt: "2026-07-14T00:00:00.000Z"
  });
}

test("handler registry is closed, unique, and distinguishes commands from queries", () => {
  const handlers = [
    createAgentSubjectCommandHandler(),
    readAgentSelfQueryHandler(),
    readMandateQueryHandler(),
    revokeDraftMandateCommandHandler()
  ];
  const registry = new TenantCommandHandlerRegistry(handlers);
  assert.deepEqual(registry.listOperationIds(), [
    "pilotCreateAgentSubject",
    "pilotReadAgentSelf",
    "pilotReadMandate",
    "pilotRevokeDraftMandate"
  ]);
  assert.equal(registry.require("pilotCreateAgentSubject").kind, "command");
  assert.equal(registry.require("pilotReadAgentSelf").kind, "query");
  assert.throws(
    () => new TenantCommandHandlerRegistry([...handlers, handlers[0]]),
    (error) => error.code === "invalid_tenant_command_handler"
  );
  assert.throws(
    () => registry.require("unknownOperation"),
    (error) => error.code === "tenant_operation_unavailable"
  );
});

test("foundation registry exposes only the reviewed durable operations", () => {
  const registry = new TenantCommandHandlerRegistry(createTenantFoundationHandlers());
  assert.deepEqual(registry.listOperationIds(), [
    "pilotCreateAgentSubject",
    "pilotCreateDraftMandate",
    "pilotReadAgentSelf",
    "pilotReadMandate",
    "pilotRevokeDraftMandate"
  ]);
});

test("Agent Subject plan binds Human controller and Agent subject without caller Tenant authority", async () => {
  const handler = createAgentSubjectCommandHandler();
  const coreRepository = {
    countAgentSubjectsForCapacityInTransaction: async () => 7,
    findPrincipalByHashInTransaction: async () => undefined
  };
  const plan = await handler.plan({
    client: {},
    coreRepository,
    payload: {
      subjectActorId: "actor_agent_alpha",
      displayName: "Alpha Treasury Agent",
      jurisdiction: "US"
    },
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_owner",
      actorType: ActorType.HUMAN
    },
    now: new Date("2026-07-14T00:00:00.000Z"),
    requestId: "request_create_agent_001",
    correlationId: "correlation_create_agent_001"
  });
  assert.equal(plan.aggregateType, "subject");
  assert.equal(plan.events.length, 2);
  assert.equal(plan.writes.length, 2);
  assert.equal(plan.response.subjectType, "agent");
  assert.deepEqual(handler.resourceDeltas(), { agent_subjects: 1 });
  assert.deepEqual(plan.resourceBaselines, { agent_subjects: 7 });
  assert.deepEqual(plan.authorizationResource.actorBindings, [
    { actorId: "actor_human_owner", actorType: ActorType.HUMAN, relationship: "controller" },
    {
      actorId: "actor_agent_alpha",
      actorType: ActorType.AGENT,
      relationship: "subject",
      controllerActorId: "actor_human_owner"
    }
  ]);
  await assert.rejects(
    () => handler.plan({
      client: {},
      coreRepository,
      payload: {
        tenantId: "tenant_attacker",
        subjectActorId: "actor_agent_alpha",
        displayName: "Alpha"
      },
      authenticationContext: {
        tenantId: "tenant_gateway_test",
        actorId: "actor_human_owner",
        actorType: ActorType.HUMAN
      },
      now: new Date("2026-07-14T00:00:00.000Z"),
      requestId: "request_create_agent_002",
      correlationId: "correlation_create_agent_002"
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("draft Mandate normalizes bounded terms and derives all authority from durable state", async () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const payload = {
    capabilities: ["provider_spend", "request_credit"],
    allowedProviderIds: ["provider_alpha"],
    allowedCategories: ["compute"],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: "100",
    aggregateLimitMinor: "1000",
    validFrom: now.toISOString(),
    expiresAt: "2027-01-14T00:00:00.000Z",
    nonce: "mandate-nonce-alpha-0001",
    termsRef: "urn:ipo.one:terms:mandate-alpha:v1"
  };
  const handler = createDraftMandateCommandHandler();
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type) {
      if (type === CoreProjectionType.SUBJECT) {
        return {
          aggregateVersion: 1,
          value: {
            subjectId: "subject_alpha",
            subjectType: "agent",
            primaryPrincipalId: "principal_owner",
            status: "pending"
          }
        };
      }
      return {
        aggregateVersion: 1,
        value: { principalId: "principal_owner", status: "active" }
      };
    },
    findMandateByPrincipalNonceInTransaction: async () => undefined,
    countMandatesForCapacityInTransaction: async () => 3
  };
  const directory = {
    async listActiveResourceBindings() {
      return [
        {
          actorId: "actor_human_owner",
          actorType: ActorType.HUMAN,
          relationship: "controller",
          version: 1
        },
        {
          actorId: "actor_agent_alpha",
          actorType: ActorType.AGENT,
          relationship: "subject",
          controllerActorId: "actor_human_owner",
          version: 1
        }
      ];
    }
  };
  const plan = await handler.plan({
    client: {},
    coreRepository,
    directory,
    payload,
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_owner",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: { resourceType: "subject", resourceId: "subject_alpha" },
    now,
    requestId: "request_mandate_001",
    correlationId: "correlation_mandate_001"
  });
  assert.equal(plan.writes[0].value.subjectId, "subject_alpha");
  assert.equal(plan.writes[0].value.principalId, "principal_owner");
  assert.equal(plan.writes[0].value.status, "draft");
  assert.deepEqual(plan.writes[0].value.capabilities, ["provider_spend", "request_credit"]);
  assert.deepEqual(handler.resourceDeltas(), { mandates: 1 });
  assert.deepEqual(plan.resourceBaselines, { mandates: 3 });
  assert.deepEqual(plan.authorizationResource.actorBindings, [
    { actorId: "actor_human_owner", actorType: ActorType.HUMAN, relationship: "controller" },
    {
      actorId: "actor_agent_alpha",
      actorType: ActorType.AGENT,
      relationship: "subject",
      controllerActorId: "actor_human_owner"
    }
  ]);

  assert.throws(
    () => normalizeDraftMandatePayload({ ...payload, subjectId: "subject_attacker" }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      capabilities: ["request_credit"],
      allowedProviderIds: ["provider_alpha"]
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      termsRef: "https://user@example.com/mandate"
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      termsRef: "https://example.com/mandate?tenant=secret"
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      validFrom: "2026-08-14T00:00:00.000Z"
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("draft Mandate management reads exact state and plans terminal resource closure", async () => {
  const now = new Date("2026-07-14T01:00:00.000Z");
  const mandate = {
    mandateId: "mandate_alpha",
    mandateHash: "0x" + "a".repeat(64),
    principalId: "principal_owner",
    subjectId: "subject_alpha",
    capabilities: ["request_credit", "provider_spend"],
    allowedProviderIds: ["provider_alpha"],
    allowedCategories: ["compute"],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: "100",
    aggregateLimitMinor: "1000",
    utilizedMinor: "0",
    validFrom: "2026-07-14T00:00:00.000Z",
    expiresAt: "2027-01-14T00:00:00.000Z",
    nonce: "mandate-nonce-alpha-0001",
    termsRef: "urn:ipo.one:terms:mandate-alpha:v1",
    status: "draft",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    schemaVersion: "mandate.v2"
  };
  const reads = [];
  const coreRepository = {
    async getProjectionInTransaction(_client, type, id, options) {
      reads.push({ kind: "read", type, id, options });
      return mandate;
    },
    async getProjectionStateInTransaction(_client, type, id, options) {
      reads.push({ kind: "state", type, id, options });
      return { aggregateVersion: 4, value: mandate };
    }
  };
  const resource = { resourceType: "mandate", resourceId: mandate.mandateId };
  const view = await readMandateQueryHandler().execute({
    client: {},
    coreRepository,
    resource,
    payload: {}
  });
  assert.equal(view.schemaVersion, "tenant_mandate_view.v1");
  assert.deepEqual(view.mandate, mandate);
  assert.notEqual(view.mandate.capabilities, mandate.capabilities);

  const plan = await revokeDraftMandateCommandHandler().plan({
    client: {},
    coreRepository,
    payload: {},
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_owner",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: {
      resourceType: "mandate",
      resourceId: mandate.mandateId,
      resourceVersion: 3
    },
    reasonCode: "operator_request",
    now,
    requestId: "request_revoke_mandate_001",
    correlationId: "correlation_revoke_mandate_001"
  });
  assert.equal(plan.aggregateType, "mandate");
  assert.equal(plan.aggregateId, mandate.mandateId);
  assert.equal(plan.events[0].expectedVersion, 4);
  assert.equal(plan.events[0].event.eventType, "mandate_status_changed");
  assert.equal(plan.events[0].event.payload.previousStatus, "draft");
  assert.equal(plan.events[0].event.payload.nextStatus, "revoked");
  assert.equal(plan.events[0].event.payload.reasonCode, "operator_request");
  assert.equal(plan.writes[0].value.status, "revoked");
  assert.equal(plan.response.status, "revoked");
  assert.deepEqual(plan.authorizationResourceTransition, {
    resourceType: "mandate",
    resourceId: mandate.mandateId,
    expectedStatus: "active",
    nextStatus: "closed",
    expectedVersion: 3
  });
  assert.deepEqual(reads, [
    { kind: "read", type: CoreProjectionType.MANDATE, id: mandate.mandateId, options: { lock: false } },
    { kind: "state", type: CoreProjectionType.MANDATE, id: mandate.mandateId, options: { lock: true } }
  ]);

  await assert.rejects(
    () => revokeDraftMandateCommandHandler().plan({
      client: {},
      coreRepository,
      payload: { activate: true },
      authenticationContext: { actorId: "actor_human_owner" },
      authorizationDecision: { resourceType: "mandate", resourceId: mandate.mandateId },
      reasonCode: "operator_request",
      now,
      requestId: "request_revoke_mandate_002",
      correlationId: "correlation_revoke_mandate_002"
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("Human and Agent clients inject only their verified context into one protocol", async () => {
  const calls = [];
  let authenticationContextLookups = 0;
  let networkContextLookups = 0;
  const gateway = {
    async execute(command) {
      calls.push(command);
      return { response: { accepted: true } };
    }
  };
  const humanContext = authenticationContext(ActorType.HUMAN, "actor_human_owner");
  const agentContext = authenticationContext(ActorType.AGENT, "actor_agent_alpha");
  const human = new HumanTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => {
      authenticationContextLookups += 1;
      return humanContext;
    },
    networkContextProvider: async () => {
      networkContextLookups += 1;
      return { source: "trusted_test_adapter" };
    }
  });
  const agent = new AgentTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => agentContext
  });

  await human.createAgentSubject({
    payload: { subjectActorId: "actor_agent_alpha", displayName: "Alpha" },
    idempotencyKey: "create-agent-alpha-0001",
    requestId: "request_human_001",
    correlationId: "correlation_human_001"
  });
  await human.createDraftMandate({
    subjectId: "subject_alpha",
    payload: {
      capabilities: ["provider_spend", "request_credit"],
      allowedProviderIds: ["provider_alpha"],
      allowedCategories: ["compute"],
      assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      perActionLimitMinor: "100",
      aggregateLimitMinor: "1000",
      validFrom: "2026-07-14T00:00:00.000Z",
      expiresAt: "2027-01-14T00:00:00.000Z",
      nonce: "mandate-nonce-alpha-0002",
      termsRef: "urn:ipo.one:terms:mandate-alpha:v1"
    },
    idempotencyKey: "create-mandate-alpha-0001",
    requestId: "request_human_002",
    correlationId: "correlation_human_002"
  });
  await human.getMandate({
    mandateId: "mandate_alpha",
    requestId: "request_human_003",
    correlationId: "correlation_human_003"
  });
  await human.revokeDraftMandate({
    mandateId: "mandate_alpha",
    reasonCode: "operator_request",
    idempotencyKey: "revoke-mandate-alpha-0001",
    requestId: "request_human_004",
    correlationId: "correlation_human_004"
  });
  await agent.getSelf({
    subjectId: "subject_alpha",
    requestId: "request_agent_001",
    correlationId: "correlation_agent_001"
  });

  assert.equal(calls[0].authenticationContext, humanContext);
  assert.deepEqual(calls[0].networkContext, { source: "trusted_test_adapter" });
  assert.equal(calls[0].operationId, "pilotCreateAgentSubject");
  assert.equal(calls[1].authenticationContext, humanContext);
  assert.equal(calls[1].operationId, "pilotCreateDraftMandate");
  assert.deepEqual(calls[1].resource, { resourceType: "subject", resourceId: "subject_alpha" });
  assert.equal(calls[2].operationId, "pilotReadMandate");
  assert.deepEqual(calls[2].resource, { resourceType: "mandate", resourceId: "mandate_alpha" });
  assert.equal(calls[3].operationId, "pilotRevokeDraftMandate");
  assert.equal(calls[3].reasonCode, "operator_request");
  assert.deepEqual(calls[3].payload, {});
  assert.equal(calls[4].authenticationContext, agentContext);
  assert.equal(calls[4].operationId, "pilotReadAgentSelf");
  assert.equal(Object.hasOwn(calls[0], "tenantId"), false);
  assert.equal(Object.hasOwn(calls[4], "actorId"), false);
  assert.equal(calls.every((call) => call.schemaVersion === "tenant_protocol_request.v1"), true);
  assert.equal(authenticationContextLookups, 4);
  assert.equal(networkContextLookups, 4);

  const lookupsBeforeInvalidRequest = authenticationContextLookups;
  await assert.rejects(
    () => human.execute({
      operationId: "pilotCreateAgentSubject",
      payload: { subjectActorId: "actor_agent_alpha", displayName: "Alpha" },
      idempotencyKey: "create-agent-alpha-invalid-0001",
      requestId: "request_human_invalid_001",
      correlationId: "correlation_human_invalid_001",
      authenticationContext: { tenantId: "caller_controlled" }
    }),
    (error) => error.code === "invalid_tenant_protocol_request"
  );
  assert.equal(authenticationContextLookups, lookupsBeforeInvalidRequest);
  assert.equal(calls.length, 5);
});
