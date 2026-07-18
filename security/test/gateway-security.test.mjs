import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

async function source(path) {
  return readFile(`${rootDir}/${path}`, "utf8");
}

test("anonymous public sandbox has no durable Tenant Gateway import or database path", async () => {
  const [server, runtime] = await Promise.all([
    source("apps/api/src/server.js"),
    source("apps/api/src/runtime-config.js")
  ]);
  for (const body of [server, runtime]) {
    assert.doesNotMatch(body, /TenantCommandGateway|tenant-command-gateway|PostgresCoreRepository|DATABASE_URL/);
  }
  assert.match(server, /createInteractiveDemo/);
});

test("commercial Human access stays provider-bound, same-origin, cookie-only, and private", async () => {
  const [publicServer, accessRoutes, tenantTransport, loginStore, humanBff] = await Promise.all([
    source("apps/api/src/server.js"),
    source("apps/tenant-api/src/human-access-routes.js"),
    source("apps/tenant-api/src/tenant-http-adapter.js"),
    source("modules/authentication/src/login-transaction-store.js"),
    source("modules/authentication/src/human-bff.js")
  ]);
  assert.match(publicServer, /enabled: false/);
  assert.match(publicServer, /walletAuthentication: false/);
  assert.doesNotMatch(publicServer, /wallet\/challenge|wallet\/verify|HumanOidcBff|HumanWalletBff/);
  for (const required of [
    "csrf_origin_rejected",
    "parseStrictJson",
    "TRANSACTION_COOKIE_NAME",
    "SESSION_COOKIE_NAME",
    "HttpOnly",
    "SameSite",
    "providerId",
    "Authentication proves presence"
  ]) {
    assert.match(accessRoutes, new RegExp(required));
  }
  assert.match(accessRoutes, /config\.bff\.providerId !== checkedProviderId/);
  assert.match(accessRoutes, /cookie\.domain !== undefined/);
  assert.match(accessRoutes, /cookie\.secure !== true/);
  assert.doesNotMatch(accessRoutes, /accessToken|refreshToken|clientSecret|localStorage|sessionStorage/);
  assert.match(loginStore, /providerId: assertSafeIdentifier/);
  assert.match(loginStore, /const checkedProvider = assertSafeIdentifier/);
  assert.match(loginStore, /transaction\.providerId !== checkedProvider/);
  assert.match(loginStore, /this\.#transactions\.delete\(reference\);\s+return Object\.freeze/);
  assert.match(humanBff, /this\.providerId = assertSafeIdentifier/);
  assert.match(tenantTransport, /host !== TENANT_HTTP_HOST/);
  assert.match(tenantTransport, /environment === "production"/);
});

test("Gateway derives authority from Authentication Context and binds exact payload", async () => {
  const gateway = await source("modules/tenant-command-gateway/src/tenant-command-gateway.js");
  for (const required of [
    "assertAuthenticationContext",
    "RESERVED_PAYLOAD_AUTHORITY_KEYS",
    "commandPayloadHash",
    "requestIdentityHash",
    "lockAdmissionForTransaction",
    "findCommandInTransaction",
    "completeAdmissionInTransaction",
    "createTenantSecurityContextFromAuthorization"
  ]) {
    assert.match(gateway, new RegExp(required));
  }
  assert.doesNotMatch(gateway, /input\.tenantId|input\.actorId|input\.clientId/);
  assert.doesNotMatch(gateway, /accessToken|refreshToken|privateKey|rawIp|x-forwarded-for/i);
});

test("durable Gateway authority is Tenant-scoped, append-only, and non-secret", async () => {
  const migration = await source("db/migrations/0008_durable_tenant_command_gateway.up.sql");
  for (const required of [
    "ALTER TABLE authorization_resources FORCE ROW LEVEL SECURITY",
    "authorization_audit_events_immutable",
    "tenant_command_executions_immutable",
    "FOREIGN KEY (tenant_id, actor_id)",
    "REFERENCES memberships(tenant_id, actor_id)",
    "client_ref_hash",
    "command_payload_hash",
    "memberships_controller_fk",
    "controller_actor_id",
    "pg_advisory_xact_lock",
    "BEFORE UPDATE OR DELETE ON memberships",
    "BEFORE UPDATE OR DELETE ON access_grants",
    "BEFORE UPDATE OR DELETE ON authorization_resources",
    "BEFORE UPDATE OR DELETE ON authorization_resource_bindings",
    "Actor immutable fields cannot change",
    "actor_authorization_lock_update",
    "access_grants_participant_lock_update",
    "authorization_resources_participant_lock_update"
  ]) {
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(migration, /access_token|refresh_token|private_key|raw_ip|request_body|kyc_payload/i);
});

test("durable draft Mandate management can only reduce authority", async () => {
  const [handlers, gateway, server] = await Promise.all([
    source("modules/tenant-command-gateway/src/mandate-handlers.js"),
    source("modules/tenant-command-gateway/src/tenant-command-gateway.js"),
    source("apps/api/src/server.js")
  ]);
  for (const required of [
    "pilotReadMandate",
    "pilotRevokeDraftMandate",
    "MandateStatus.REVOKED",
    'expectedStatus: "active"',
    'nextStatus: "closed"'
  ]) {
    assert.match(handlers, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const required of [
    "authorizationResourceTransition",
    "authorizationDecision.resourceType",
    "authorizationDecision.resourceId",
    "authorizationDecision.resourceVersion"
  ]) {
    assert.match(gateway, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(handlers, /MandateStatus\.ACTIVE|activateMandate|signature|walletProof/i);
  assert.doesNotMatch(server, /pilotReadMandate|pilotRevokeDraftMandate|tenant-command-gateway/);
});

test("durable Subject freeze is protective, reason-coded, and private", async () => {
  const [handlers, livePolicy, clients, catalogBody, server] = await Promise.all([
    source("modules/tenant-command-gateway/src/subject-risk-handlers.js"),
    source("modules/tenant-command-gateway/src/postgres-live-policy-adapter.js"),
    source("modules/tenant-command-gateway/src/tenant-command-clients.js"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("apps/api/src/server.js")
  ]);
  for (const required of [
    "pilotFreezeSubject",
    "SubjectStatus.SUSPENDED",
    "SubjectTransitions",
    "PROTECTIVE_REASON_CODES",
    "SUBJECT_STATUS_CHANGED"
  ]) {
    assert.match(handlers, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(livePolicy, /\["risk", "freeze"\]/);
  assert.match(clients, /OperatorTenantCommandClient/);
  assert.doesNotMatch(handlers, /SubjectStatus\.ACTIVE|unfreeze|approvalArtifact/i);
  const catalog = JSON.parse(catalogBody);
  const freeze = catalog.operations.find(({ operationId }) => operationId === "pilotFreezeSubject");
  assert.deepEqual(freeze.actorTypes, ["risk_operator", "operations_operator"]);
  assert.equal(freeze.quotaClass, "privileged");
  assert.equal(freeze.fundsAuthority, false);
  assert.equal(catalog.operations.some(({ operationId }) => operationId === "pilotUnfreezeSubject"), false);
  assert.doesNotMatch(server, /pilotFreezeSubject|subject-risk-handlers|tenant-command-gateway/);
});

test("Tenant risk portfolio is aggregate-only, bounded, MFA-gated, and private", async () => {
  const [resultSchemaBody, catalogBody, policy, handler, server] = await Promise.all([
    source("schemas/v2/tenant-protocol-result.schema.json"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("modules/authorization/src/authorization-policy.js"),
    source("modules/tenant-command-gateway/src/tenant-risk-query-handlers.js"),
    source("apps/api/src/server.js")
  ]);
  const resultSchema = JSON.parse(resultSchemaBody);
  const catalog = JSON.parse(catalogBody);
  const operation = catalog.operations.find(
    ({ operationId }) => operationId === "pilotReadTenantRisk"
  );
  assert.deepEqual(operation.actorTypes, ["risk_operator", "auditor"]);
  assert.equal(operation.resourceType, "risk_portfolio");
  assert.equal(operation.requiredCapability, "risk.read.tenant");
  assert.equal(operation.quotaClass, "read");
  assert.equal(operation.idempotency, "prohibited");
  assert.equal(operation.public, false);
  assert.equal(operation.fundsAuthority, false);
  assert.match(policy, /requiresRecentMfaActorTypes: \[ActorType\.RISK_OPERATOR, ActorType\.AUDITOR\]/);

  const propertyNames = new Set();
  const seenDefinitions = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) {
      const definition = node.$ref.slice("#/$defs/".length);
      if (!seenDefinitions.has(definition)) {
        seenDefinitions.add(definition);
        visit(resultSchema.$defs[definition]);
      }
    }
    if (node.properties) {
      for (const [name, value] of Object.entries(node.properties)) {
        propertyNames.add(name);
        visit(value);
      }
    }
    if (node.items) visit(node.items);
  }
  visit(resultSchema.$defs.tenantRiskPortfolioView);
  for (const forbidden of [
    "tenantId",
    "subjectId",
    "displayName",
    "principalId",
    "primaryPrincipalId",
    "accountIdRef",
    "providerId",
    "eventId",
    "evidenceId",
    "kycRef",
    "kypRef"
  ]) {
    assert.equal(propertyNames.has(forbidden), false, `${forbidden} must not be exposed`);
  }
  assert.equal(
    resultSchema.$defs.tenantRiskPortfolioView.properties.assetExposures.maxItems,
    50
  );
  assert.doesNotMatch(handler, /displayName|principalId|accountIdRef|providerId|evidence|kyc|kyp/i);
  assert.doesNotMatch(server, /pilotReadTenantRisk|tenant-risk-query-handlers|tenant-command-gateway/);
});

test("Pilot health analytics are aggregate-only, MFA-gated, tracker-free, and private", async () => {
  const [resultSchemaBody, catalogBody, policy, handler, server] = await Promise.all([
    source("schemas/v2/tenant-protocol-result.schema.json"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("modules/authorization/src/authorization-policy.js"),
    source("modules/tenant-command-gateway/src/pilot-health-query-handlers.js"),
    source("apps/api/src/server.js")
  ]);
  const resultSchema = JSON.parse(resultSchemaBody);
  const catalog = JSON.parse(catalogBody);
  const operation = catalog.operations.find(
    ({ operationId }) => operationId === "pilotReadPilotHealth"
  );
  assert.deepEqual(operation.actorTypes, ["risk_operator", "operations_operator", "auditor"]);
  assert.equal(operation.resourceType, "risk_portfolio");
  assert.equal(operation.requiredCapability, "pilot.health.read");
  assert.equal(operation.quotaClass, "read");
  assert.equal(operation.idempotency, "prohibited");
  assert.equal(operation.public, false);
  assert.equal(operation.fundsAuthority, false);
  assert.match(policy, /operationId: "pilotReadPilotHealth"[\s\S]*?requiresRecentMfaActorTypes/);

  const serialized = JSON.stringify(resultSchema.$defs.tenantPilotHealthView);
  for (const forbidden of ["subjectId", "principalId", "actorId", "authorityRef", "kycRef", "email"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
  assert.match(serialized, /"piiIncluded":\{"const":false\}/);
  assert.match(serialized, /"thirdPartyAnalytics":\{"const":false\}/);
  assert.match(handler, /COUNT\(/);
  assert.doesNotMatch(handler, /fetch\(|https?:\/\//);
  assert.doesNotMatch(server, /pilotReadPilotHealth|pilot-health-query-handlers|tenant-command-gateway/);
});

test("Servicing Operations queue is bounded, PII-free, MFA-gated, and private", async () => {
  const [resultSchemaBody, catalogBody, policy, handler, protocolGate, server] = await Promise.all([
    source("schemas/v2/tenant-protocol-result.schema.json"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("modules/authorization/src/authorization-policy.js"),
    source("modules/tenant-command-gateway/src/servicing-queue-query-handlers.js"),
    source("scripts/check-tenant-protocol.mjs"),
    source("apps/api/src/server.js")
  ]);
  const resultSchema = JSON.parse(resultSchemaBody);
  const catalog = JSON.parse(catalogBody);
  const operation = catalog.operations.find(
    ({ operationId }) => operationId === "pilotReadServicingQueue"
  );
  assert.deepEqual(operation.actorTypes, ["risk_operator", "operations_operator"]);
  assert.equal(operation.resourceType, "servicing_queue");
  assert.equal(operation.requiredCapability, "servicing.queue.read");
  assert.equal(operation.quotaClass, "read");
  assert.equal(operation.idempotency, "prohibited");
  assert.equal(operation.public, false);
  assert.equal(operation.fundsAuthority, false);
  assert.match(
    policy,
    /requiresRecentMfaActorTypes: \[ActorType\.RISK_OPERATOR, ActorType\.OPERATIONS_OPERATOR\]/
  );

  const propertyNames = new Set();
  const seenDefinitions = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) {
      const definition = node.$ref.slice("#/$defs/".length);
      if (!seenDefinitions.has(definition)) {
        seenDefinitions.add(definition);
        visit(resultSchema.$defs[definition]);
      }
    }
    if (node.properties) {
      for (const [name, value] of Object.entries(node.properties)) {
        propertyNames.add(name);
        visit(value);
      }
    }
    if (node.items) visit(node.items);
  }
  visit(resultSchema.$defs.tenantServicingQueueView);
  for (const forbidden of [
    "displayName",
    "principalId",
    "accountIdRef",
    "providerId",
    "kycRef",
    "kypRef",
    "email",
    "phone"
  ]) {
    assert.equal(propertyNames.has(forbidden), false, `${forbidden} must not be exposed`);
  }
  assert.equal(resultSchema.$defs.tenantServicingQueueView.properties.cases.maxItems, 50);
  assert.doesNotMatch(handler, /displayName|principalId|accountIdRef|providerId|kyc|kyp|email|phone/i);
  assert.match(protocolGate, /pilotReadServicingQueue/);
  assert.match(protocolGate, /Agent MCP exposed a forbidden operation/);
  assert.doesNotMatch(server, /pilotReadServicingQueue|servicing-queue-query-handlers|tenant-command-gateway/);
});

test("Tenant protocol contracts are closed, non-authoritative, and private", async () => {
  const [
    requestSchemaBody,
    resultSchemaBody,
    catalogBody,
    gateway,
    clients,
    server,
    webApp,
    webHandoff,
    webCapabilityManifest,
    webHtml,
    handoffSchemaBody,
    handoffPlan,
    handoffCli,
    mcpHost,
    agentPilotHost,
    mcpWorkflow,
    agentSdkWorkflow,
    humanWorkflow,
    dualNativeParity,
    humanWorkflowSchemaBody,
    tenantPilotHost,
    tenantWebAssets,
    ownedObligationHandler
  ] = await Promise.all([
    source("schemas/v2/tenant-protocol-request.schema.json"),
    source("schemas/v2/tenant-protocol-result.schema.json"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("modules/tenant-command-gateway/src/tenant-command-gateway.js"),
    source("modules/tenant-command-gateway/src/tenant-command-clients.js"),
    source("apps/api/src/server.js"),
    source("apps/web/src/app.js"),
    source("apps/web/src/agent-handoff-manifest.js"),
    source("apps/web/src/agent-pilot-capability-manifest.js"),
    source("apps/web/src/index.html"),
    source("schemas/v2/agent-handoff-manifest.schema.json"),
    source("apps/agent-mcp/src/agent-handoff-plan.js"),
    source("apps/agent-mcp/src/handoff-cli.js"),
    source("apps/agent-mcp/src/agent-mcp-host.js"),
    source("apps/agent-mcp/src/agent-pilot-host.js"),
    source("apps/agent-mcp/src/agent-credit-offer-workflow.js"),
    source("packages/sdk/src/agent-mcp-client.js"),
    source("apps/web/src/human-credit-offer-workflow-receipt.js"),
    source("packages/api-contract/src/dual-native-credit-offer-parity.js"),
    source("schemas/v2/human-credit-offer-workflow-receipt.schema.json"),
    source("apps/tenant-api/src/tenant-pilot-host.js"),
    source("apps/tenant-api/src/tenant-web-assets.js"),
    source("modules/tenant-command-gateway/src/owned-obligation-query-handlers.js")
  ]);
  const requestSchema = JSON.parse(requestSchemaBody);
  const resultSchema = JSON.parse(resultSchemaBody);
  const catalog = JSON.parse(catalogBody);
  const handoffSchema = JSON.parse(handoffSchemaBody);
  const humanWorkflowSchema = JSON.parse(humanWorkflowSchemaBody);

  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(resultSchema.additionalProperties, false);
  for (const property of [
    "authenticationContext",
    "tenantId",
    "actorId",
    "actorType",
    "clientId",
    "credentialId",
    "roles",
    "authorizationDecision",
    "networkContext"
  ]) {
    assert.equal(Object.hasOwn(requestSchema.properties, property), false);
  }
  assert.deepEqual(catalog.availability.enabledTransports, [
    "local_in_process",
    "authenticated_http_loopback",
    "mcp_stdio_local"
  ]);
  assert.equal(catalog.availability.publicEndpointEnabled, false);
  assert.equal(catalog.availability.authenticatedHttpEnabled, true);
  assert.equal(catalog.availability.authenticatedHttpProfile, "loopback_test_only");
  assert.equal(catalog.availability.mcpStdioLocalEnabled, true);
  assert.equal(catalog.availability.mcpA2aEnabled, false);
  assert.equal(catalog.availability.authenticationContextSource, "trusted_transport_adapter");
  assert.equal(catalog.availability.networkContextSource, "trusted_ingress_adapter");
  assert.deepEqual(catalog.safety, {
    realFundsEnabled: false,
    productionCreditEnabled: false,
    humanCreditEnabled: false,
    humanCreditIntentEnabled: true,
    agentCreditIntentEnabled: true,
    humanCreditDecisionEnabled: true,
    agentCreditDecisionEnabled: true,
    offerAcceptanceEnabled: true,
    sandboxExecutionEnabled: true,
    sandboxRepaymentEnabled: true,
    sandboxServicingEnabled: true,
    sandboxResolutionEnabled: true,
    agentAccountProofEnabled: true,
    mandateActivationEnabled: true,
    providerSandboxEnabled: true,
    productionIdentityEnabled: false,
    rawPiiAllowed: false
  });
  assert.equal(catalog.operations.every((operation) => !operation.public && !operation.fundsAuthority), true);
  const ownedObligationRead = catalog.operations.find(
    (operation) => operation.operationId === "pilotReadOwnObligation"
  );
  assert.deepEqual(ownedObligationRead, {
    operationId: "pilotReadOwnObligation",
    kind: "query",
    actorTypes: ["human", "agent"],
    resourceType: "obligation",
    requiredCapability: "obligation.read.owned",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: "tenant_protocol_request.v1",
    responseSchemaVersion: "tenant_owned_obligation_view.v1",
    public: false,
    fundsAuthority: false
  });
  assert.equal(resultSchema.$defs.ownedObligationView.additionalProperties, false);
  assert.match(ownedObligationHandler, /resource\.resourceId/);
  assert.match(ownedObligationHandler, /getObligationInTransaction/);
  assert.match(ownedObligationHandler, /productionFundsMoved !== false/);
  assert.doesNotMatch(
    ownedObligationHandler,
    /tenantId|actorId|authenticationContext|listOwned|searchObligation/
  );

  assert.ok(gateway.indexOf("assertCallerRequest(input)") < gateway.indexOf("abuseControl.admitTenant"));
  assert.ok(
    gateway.indexOf("const plannedResult = createProtocolResult") <
      gateway.indexOf("commitCommandInTransaction")
  );
  assert.match(gateway, /assertTenantProtocolResult\(result\)/);
  assert.ok(
    clients.indexOf("assertTenantProtocolRequest(request)") <
      clients.indexOf("authenticationContextProvider\(\)")
  );
  assert.doesNotMatch(server, /tenant-protocol|TENANT_PROTOCOL|pilotCreateAgentSubject/);
  assert.match(webApp, /from "\.\/agent-handoff-manifest\.js"/);
  assert.match(webApp, /from "\.\/agent-pilot-capability-manifest\.js"/);
  for (const required of [
    'AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION = "agent_handoff_manifest.v1"',
    'credentialDelivery: "out_of_band"',
    "credentialsIncluded: false",
    "publicEndpointEnabled: false",
    "remoteMcpEnabled: false",
    "fundsAuthority: false"
  ]) {
    assert.match(webHandoff, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(handoffSchema.additionalProperties, false);
  for (const required of [
    "agent_pilot_capability_manifest.v1",
    "economicMcpToolsEnabled: true",
    "liveChainExecution: false",
    "productionFundsApproved: false",
    "fundsAuthority: false"
  ]) {
    assert.match(
      webCapabilityManifest,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(webCapabilityManifest, /accessToken|privateKey|authenticationContext/);
  assert.equal(handoffSchema.properties.nonAuthorizing.const, true);
  assert.equal(handoffSchema.properties.credentialsIncluded.const, false);
  assert.equal(handoffSchema.properties.publicEndpointEnabled.const, false);
  assert.equal(handoffSchema.properties.remoteMcpEnabled.const, false);
  assert.equal(handoffSchema.properties.fundsAuthority.const, false);
  assert.match(webHtml, /Non-authorizing manifest/);
  assert.match(webHtml, /authenticated Tenant HTTPS · closed_non_funds_pilot/);
  assert.match(webHtml, /JWT ≤300s bound to mTLS certificate/);
  assert.doesNotMatch(webHtml, /Local stdio only|Remote endpoint\s*Disabled|no remote MCP/i);
  assert.doesNotMatch(webApp, /accessToken|privateKey|authenticationContext/);
  assert.doesNotMatch(webHandoff, /accessToken|privateKey|authenticationContext/);
  assert.match(webHtml, /credentials, mTLS keys, and funds authority never enter the packet/i);
  assert.doesNotMatch(
    webHtml,
    /(?:name|id)=["'][^"']*(?:access.?token|private.?key|authentication.?context)/i
  );
  assert.match(handoffPlan, /hostCompositionRequired: true/);
  assert.match(handoffPlan, /credentialDelivery: "out_of_band"/);
  assert.match(handoffPlan, /remoteMcpEnabled: false/);
  assert.match(handoffPlan, /fundsAuthority: false/);
  assert.doesNotMatch(handoffPlan, /process\.env|node:fs|fetch\(|node:http|node:https|listen\(/);
  assert.doesNotMatch(handoffCli, /process\.env|node:fs|fetch\(|node:http|node:https|listen\(/);
  assert.match(mcpHost, /HOST_CONFIG_KEYS = new Set\(\["client", "manifest"\]\)/);
  assert.match(mcpHost, /mcp_subject_scope_denied/);
  assert.match(mcpHost, /mcp_mandate_scope_denied/);
  assert.match(mcpHost, /mcp_application_handoff_required/);
  assert.doesNotMatch(
    mcpHost,
    /accessToken|authenticationContext|tenantId|roles|process\.env|node:fs|fetch\(|node:http|node:https|listen\(/
  );
  assert.match(agentPilotHost, /CONFIG_KEYS = new Set\(\[/);
  assert.match(agentPilotHost, /AgentTenantCommandClient/);
  assert.match(agentPilotHost, /context\.actorType !== ActorType\.AGENT/);
  assert.match(agentPilotHost, /verifyAgentSubjectBinding\(\{/);
  assert.match(agentPilotHost, /subjectId: manifest\.subjectId/);
  assert.match(agentPilotHost, /agent_pilot_host_identity_mismatch/);
  assert.doesNotMatch(
    agentPilotHost,
    /accessToken|privateKey|tenantId|roles|process\.env|node:fs|fetch\(|node:http|node:https|listen\(/
  );
  assert.match(mcpWorkflow, /WORKFLOW_CONFIG_KEYS = Object\.freeze\(\[/);
  assert.match(mcpWorkflow, /runSdkAgentCreditOfferWorkflow/);
  assert.doesNotMatch(
    mcpWorkflow,
    /accessToken|authenticationContext|tenantId|roles|privateKey|process\.env|node:fs|fetch\(|node:http|node:https|listen\(/
  );
  assert.match(agentSdkWorkflow, /transportProfile !== "mcp_stdio_local"/);
  assert.match(agentSdkWorkflow, /authorityId: manifest\.mandateId/);
  assert.match(agentSdkWorkflow, /nonAuthorizing: true/);
  assert.match(agentSdkWorkflow, /fundsAuthority: false/);
  assert.doesNotMatch(
    agentSdkWorkflow,
    /accessToken|authenticationContext|tenantId|roles|privateKey|process\.env|node:fs|fetch\(|node:http|node:https|listen\(/
  );
  assert.equal(humanWorkflowSchema.additionalProperties, false);
  assert.equal(humanWorkflowSchema.properties.nonAuthorizing.const, true);
  assert.equal(humanWorkflowSchema.properties.credentialsIncluded.const, false);
  assert.equal(humanWorkflowSchema.properties.publicEndpointEnabled.const, false);
  assert.equal(humanWorkflowSchema.properties.remoteMcpEnabled.const, false);
  assert.equal(humanWorkflowSchema.properties.fundsAuthority.const, false);
  assert.match(humanWorkflow, /REQUIRED_CONSENT_PURPOSES/);
  assert.match(humanWorkflow, /item\.syntheticOnly === true/);
  assert.match(humanWorkflow, /item\.productionVerified === false/);
  assert.match(humanWorkflow, /nonAuthorizing: true/);
  assert.match(humanWorkflow, /fundsAuthority: false/);
  assert.doesNotMatch(
    humanWorkflow,
    /accessToken|authenticationContext|tenantId|roles|privateKey|csrfToken|cookie|process\.env|node:fs|fetch\(|node:http|node:https|listen\(/
  );
  assert.match(dualNativeParity, /DUAL_NATIVE_OFFER_ECONOMICS_SCHEMA_VERSION/);
  assert.match(dualNativeParity, /firstPaymentOffsetMs/);
  assert.match(dualNativeParity, /maturityOffsetMs/);
  assert.match(dualNativeParity, /validityOffsetMs/);
  assert.match(dualNativeParity, /nonAuthorizing: true/);
  assert.match(dualNativeParity, /fundsAuthority: false/);
  assert.doesNotMatch(
    dualNativeParity,
    /subjectId|principalId|consentId|mandateId|creditIntentId|riskDecisionId|creditOfferId|decisionHash|termsHash|reasonCodes|accessToken|privateKey|tenantId|roles|process\.env|node:fs|fetch\(|node:http|node:https|listen\(/
  );
  assert.match(tenantPilotHost, /CONFIG_KEYS = new Set\(\[/);
  assert.match(tenantPilotHost, /host: "127\.0\.0\.1"/);
  assert.match(tenantPilotHost, /trustProxy: false/);
  assert.match(tenantPilotHost, /environment: "development"/);
  assert.match(tenantPilotHost, /credentialSource: "local_test"/);
  assert.doesNotMatch(
    tenantPilotHost,
    /accessToken|privateKey|tenantId|actorId|roles|process\.env|node:fs|node:http|node:https|fetch\(|listen\(/
  );
  assert.match(tenantWebAssets, /"\/human-credit-offer-workflow-receipt\.js"/);
  assert.doesNotMatch(tenantWebAssets, /request\.url|pathname\s*\)|join\(|resolve\(/);
});
