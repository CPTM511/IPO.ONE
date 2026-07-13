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
  readAgentSelfQueryHandler
} from "../src/index.js";

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
  const handlers = [createAgentSubjectCommandHandler(), readAgentSelfQueryHandler()];
  const registry = new TenantCommandHandlerRegistry(handlers);
  assert.deepEqual(registry.listOperationIds(), ["pilotCreateAgentSubject", "pilotReadAgentSelf"]);
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

test("Agent Subject plan binds Human controller and Agent subject without caller Tenant authority", async () => {
  const handler = createAgentSubjectCommandHandler();
  const coreRepository = { findPrincipalByHashInTransaction: async () => undefined };
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

test("Human and Agent clients inject only their verified context into one protocol", async () => {
  const calls = [];
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
    authenticationContextProvider: async () => humanContext
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
  await agent.getSelf({
    subjectId: "subject_alpha",
    requestId: "request_agent_001",
    correlationId: "correlation_agent_001"
  });

  assert.equal(calls[0].authenticationContext, humanContext);
  assert.equal(calls[0].operationId, "pilotCreateAgentSubject");
  assert.equal(calls[1].authenticationContext, agentContext);
  assert.equal(calls[1].operationId, "pilotReadAgentSelf");
  assert.equal(Object.hasOwn(calls[0], "tenantId"), false);
  assert.equal(Object.hasOwn(calls[1], "actorId"), false);
});
