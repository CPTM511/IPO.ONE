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

test("Risk workspace references are narrow, MFA-gated, PII-free locators", async () => {
  const [catalogBody, policy, handler, server] = await Promise.all([
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("modules/authorization/src/authorization-policy.js"),
    source("modules/tenant-command-gateway/src/risk-workspace-reference-handlers.js"),
    source("apps/api/src/server.js")
  ]);
  const catalog = JSON.parse(catalogBody);
  const portfolio = catalog.operations.find(
    ({ operationId }) => operationId === "pilotReadTenantRiskPortfolioReference"
  );
  const queue = catalog.operations.find(
    ({ operationId }) => operationId === "pilotReadServicingQueueReference"
  );
  assert.deepEqual(portfolio.actorTypes, ["risk_operator", "auditor"]);
  assert.equal(portfolio.resourceType, "workspace");
  assert.equal(portfolio.requiredCapability, "risk.read.tenant");
  assert.equal(portfolio.responseSchemaVersion, "tenant_risk_portfolio_reference_view.v1");
  assert.deepEqual(queue.actorTypes, ["risk_operator", "operations_operator"]);
  assert.equal(queue.resourceType, "workspace");
  assert.equal(queue.requiredCapability, "servicing.queue.read");
  assert.equal(queue.responseSchemaVersion, "tenant_servicing_queue_reference_view.v1");
  for (const operation of [portfolio, queue]) {
    assert.equal(operation.kind, "query");
    assert.equal(operation.quotaClass, "read");
    assert.equal(operation.idempotency, "prohibited");
    assert.equal(operation.public, false);
    assert.equal(operation.fundsAuthority, false);
  }
  assert.match(policy, /operationId: "pilotReadTenantRiskPortfolioReference"[\s\S]*?OwnershipRule\.NONE[\s\S]*?requiresRecentMfaActorTypes/);
  assert.match(policy, /operationId: "pilotReadServicingQueueReference"[\s\S]*?OwnershipRule\.NONE[\s\S]*?requiresRecentMfaActorTypes/);
  assert.match(handler, /FROM authorization_resources/);
  assert.match(handler, /status = 'active'/);
  assert.match(handler, /LIMIT 2/);
  assert.doesNotMatch(handler, /authorization_resource_bindings/);
  assert.doesNotMatch(handler, /tenantId|actorId|subjectId|displayName|kyc|kyp|evidence|hash/i);
  assert.doesNotMatch(server, /pilotReadTenantRiskPortfolioReference|pilotReadServicingQueueReference|risk-workspace-reference-handlers/);
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
    creditPassportArtifactsEnabled: true,
    officialReportArtifactsEnabled: true,
    tradingCapitalNoFundsEvidenceEnabled: true,
    tradingCapitalNoFundsMatchingEnabled: true,
    tradingCapitalNoFundsSettlementEnabled: true,
    agenticWalletPreflightEnabled: true,
    walletSubmissionEnabled: false,
    securedPoolWorkspaceEnabled: true,
    securedPoolSubmissionEnabled: false,
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
  assert.match(
    webHtml,
    /local stdio MCP · public_authenticated_no_funds_beta/
  );
  assert.match(webHtml, /Host context injected out of band/);
  assert.match(webApp, /No HTTP, SSE, WebSocket or public MCP listener/);
  assert.match(webApp, /No token, client certificate or private key is issued here/);
  assert.doesNotMatch(webApp, /accessToken|privateKey|authenticationContext/);
  assert.doesNotMatch(webHandoff, /accessToken|privateKey|authenticationContext/);
  assert.match(webHtml, /credentials and funds authority never enter the packet/i);
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
  assert.match(tenantWebAssets, /const asset = WEB_ASSETS\[pathname\]/);
  assert.match(tenantWebAssets, /readFile\(join\(WEB_ASSET_ROOT, asset\.file\)\)/);
  assert.doesNotMatch(
    tenantWebAssets,
    /request\.url|readFile\([^\n]*(?:pathname|request)|join\(WEB_ASSET_ROOT,\s*pathname\)|resolve\(/
  );
});

test("TC-201 Hyperliquid read plane is fixed, Testnet-only, and signer-free", async () => {
  const [adapterSource, liveContract, readme, snapshotSchema] = await Promise.all([
    source("modules/hyperliquid-info/src/index.js"),
    source("modules/hyperliquid-info/test-live/hyperliquid-testnet-info.contract.mjs"),
    source("modules/hyperliquid-info/README.md"),
    source("schemas/v2/hyperliquid-info-account-snapshot.schema.json").then(JSON.parse)
  ]);
  for (const required of [
    'origin: "https://api.hyperliquid-testnet.xyz"',
    'path: "/info"',
    'endpoint: "https://api.hyperliquid-testnet.xyz/info"',
    'method: "POST"',
    'credentials: "omit"',
    'redirect: "error"',
    'referrerPolicy: "no-referrer"',
    "AbortSignal.timeout",
    "boundedResponseText",
    "parseExternalJson",
    "MAXIMUM_JSON_DEPTH",
    "MAXIMUM_JSON_KEYS",
    "hyperliquid_info_query_denied",
    "actual master or subaccount address"
  ]) {
    assert.match(
      adapterSource,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    adapterSource,
    /api\.hyperliquid\.xyz|["']\/exchange["']|authorization|privateKey|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer|process\.env|node:net|node:tls|node:dns/
  );
  assert.match(liveContract, /IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ/);
  assert.match(liveContract, /TC201_LIVE_EVIDENCE/);
  assert.doesNotMatch(liveContract, /privateKey|authorization|\/exchange/);
  assert.match(readme, /TC-202/);
  assert.equal(
    snapshotSchema.properties.origin.const,
    "https://api.hyperliquid-testnet.xyz"
  );
  assert.equal(snapshotSchema.properties.path.const, "/info");
  assert.equal(snapshotSchema.properties.method.const, "POST");
  for (const property of [
    "readOnly",
    "testnetOnly",
    "testnetData",
    "externalSystemQueried"
  ]) {
    assert.equal(snapshotSchema.properties[property].const, true);
  }
  for (const property of [
    "realFunds",
    "authorizing",
    "signerAvailable",
    "exchangeEndpointAvailable",
    "credentialsUsed",
    "externalOrderSubmitted",
    "productionAuthority",
    "fundsAuthority",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(snapshotSchema.properties[property].const, false);
  }
});

test("TC-202 account binding is authorized, one-use, hash-only, and non-authorizing", async () => {
  const [
    handlerSource,
    proofSource,
    domainSource,
    profileSchema,
    migrationSource
  ] = await Promise.all([
    source("modules/tenant-command-gateway/src/trading-capital-evidence-handlers.js"),
    source("modules/hyperliquid-info/src/binding-proof.js"),
    source("packages/domain/src/trading-capital-real-evidence.js"),
    source("schemas/v2/trading-real-credit-profile.schema.json").then(JSON.parse),
    source("db/migrations/0033_trading_real_evidence_binding.up.sql")
  ]);
  const authorizationIndex = handlerSource.indexOf(
    "await requireRelationship(directory"
  );
  const proofIndex = handlerSource.indexOf(
    "await proofVerifier.verify"
  );
  const relationshipIndex = handlerSource.indexOf(
    "await infoAdapter.verifyMasterSubaccountBinding"
  );
  const historyIndex = handlerSource.indexOf(
    "await infoAdapter.readFillHistory"
  );
  assert.equal(authorizationIndex >= 0, true);
  assert.equal(proofIndex > authorizationIndex, true);
  assert.equal(relationshipIndex > proofIndex, true);
  assert.equal(historyIndex > relationshipIndex, true);
  for (const required of [
    "eip155:998",
    "hyperliquid_testnet",
    "IPO.ONE Hyperliquid Account Binding",
    "rawSignaturePersisted: false",
    "reusableSignature: false",
    "verifyTypedData",
    "SECP256K1_HALF_ORDER"
  ]) {
    assert.match(
      proofSource,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  for (const forbidden of [
    "approveAgent",
    "withdraw3",
    "usdSend",
    "spotSend",
    "sendAsset",
    "vaultTransfer",
    '"/exchange"',
    "api.hyperliquid.xyz"
  ]) {
    assert.equal(
      `${handlerSource}\n${proofSource}\n${domainSource}`.includes(forbidden),
      false
    );
  }
  assert.equal(profileSchema.properties.syntheticOnly.const, false);
  assert.equal(profileSchema.properties.testnetOnly.const, true);
  assert.equal(profileSchema.properties.realFunds.const, false);
  assert.equal(profileSchema.properties.productionAuthority.const, false);
  assert.equal(profileSchema.properties.fundsAuthority.const, false);
  assert.equal(profileSchema.properties.creditApproval.const, false);
  assert.equal(profileSchema.properties.rawTransactionsIncluded.const, false);
  assert.match(migrationSource, /finalized[\s\S]*challenge_pending/);
  assert.match(migrationSource, /external_system_queried/);
  assert.match(domainSource, /single_snapshot_capital_decision_prohibited/);
  assert.match(domainSource, /priorEvidenceInvalidation/);
});

test("TC-203 Shadow Risk is point-in-time, non-economic, and threshold-free", async () => {
  const [domainSource, handlerSource, profileSchema, catalog] =
    await Promise.all([
      source("packages/domain/src/trading-capital-real-evidence.js"),
      source(
        "modules/tenant-command-gateway/src/trading-capital-evidence-handlers.js"
      ),
      source("schemas/v2/trading-real-credit-profile.schema.json").then(
        JSON.parse
      ),
      source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
        JSON.parse
      )
    ]);
  const shadow = profileSchema.$defs.shadowRiskProfile;
  for (const property of [
    "authorizing",
    "economicStateMutation",
    "newRiskAuthority",
    "fundsAuthority"
  ]) {
    assert.equal(shadow.properties[property].const, false);
  }
  assert.equal(shadow.properties.modelOutput.const, false);
  assert.equal(shadow.properties.recommendationOnly.const, true);
  assert.equal(
    shadow.properties.pointInTime.properties.maxAgePolicyApproved.const,
    false
  );
  assert.equal(
    shadow.properties.pointInTime.properties.antiLeakagePassed.const,
    true
  );
  assert.deepEqual(
    shadow.properties.driftMonitor.properties.state,
    { const: "insufficient" }
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  assert.doesNotMatch(
    `${domainSource}\n${handlerSource}`,
    /approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer|["']\/exchange["']/
  );
  assert.doesNotMatch(
    domainSource,
    /recommendedLimit:\s*\{\s*available:\s*true|creditDecision:\s*\{\s*performed:\s*true|thresholdApplied:\s*true/
  );
  assert.match(domainSource, /approved_max_age_policy_unavailable/);
  assert.match(domainSource, /future_outcome_window_unavailable/);
  assert.match(domainSource, /approved_drift_threshold_unavailable/);
});

test("TC-301 execution writer is typed, simulated, durable, and live-fail-closed", async () => {
  const [sourceBody, readme, executionSchema, migration, catalog] =
    await Promise.all([
      source("modules/hyperliquid-execution/src/index.js"),
      source("modules/hyperliquid-execution/README.md"),
      source(
        "schemas/v2/hyperliquid-testnet-execution-record.schema.json"
      ).then(JSON.parse),
      source("db/migrations/0034_trading_testnet_execution.up.sql"),
      source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
        JSON.parse
      )
    ]);

  for (const required of [
    'origin: "https://api.hyperliquid-testnet.xyz"',
    'path: "/exchange"',
    'endpoint: "https://api.hyperliquid-testnet.xyz/exchange"',
    "liveTransportApproved: false",
    "liveSignerApproved: false",
    "apiWalletProvisioningApproved: false",
    "HyperliquidExecutionActionKind",
    "REDUCE_ONLY_ORDER",
    "deterministicCloid",
    "serverReduceOnlyProven",
    "hyperliquid_execution_action_denied",
    "hyperliquid_execution_idempotency_conflict",
    "HyperliquidExecutionNonceState.UNKNOWN",
    "PostgresHyperliquidExecutionRepository"
  ]) {
    assert.match(
      sourceBody,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    sourceBody,
    /\bfetch\s*\(|process\.env|console\.|node:net|node:tls|node:dns|api\.hyperliquid\.xyz/
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  assert.deepEqual(
    executionSchema.properties.actionKind.enum,
    ["order", "reduceOnlyOrder", "cancel", "cancelByCloid", "modify"]
  );
  for (const property of [
    "simulationOnly",
    "reconciled",
    "signerIsolated"
  ]) {
    assert.equal(executionSchema.properties[property].const, true);
  }
  for (const property of [
    "externalSystemQueried",
    "externalOrderSubmitted",
    "externalReconciliationRequired",
    "keyExportable",
    "rawActionAccepted",
    "rawResponsePersisted",
    "reusableSignaturePersisted",
    "withdrawalAuthority",
    "transferAuthority",
    "accountAdministrationAuthority",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(executionSchema.properties[property].const, false);
  }
  for (const required of [
    "trading_testnet_execution_records_signer_nonce_key",
    "trading_testnet_execution_records_tenant_idempotency_key",
    "trading_execution_nonce_heads_transition_guard",
    "trading_testnet_execution_records_transition_guard",
    "trading_testnet_execution_transitions_immutable_guard",
    "FORCE ROW LEVEL SECURITY",
    "external_system_queried = FALSE",
    "external_order_submitted = FALSE",
    "reusable_signature_persisted = FALSE",
    "withdrawal_authority = FALSE",
    "transfer_authority = FALSE",
    "mainnet_authority = FALSE",
    "funds_authority = FALSE",
    "secrets_included = FALSE"
  ]) {
    assert.match(
      migration,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  for (const required of [
    "real signer",
    "new human approval",
    "UNKNOWN",
    "never resubmitted",
    "no private key",
    "raw signature"
  ]) {
    assert.match(readme.toLowerCase(), new RegExp(required.toLowerCase()));
  }
});

test("TC-302 Risk Guardian is monotonic, protective-only, durable, and live-fail-closed", async () => {
  const [sourceBody, readme, controlSchema, migration, catalog] =
    await Promise.all([
      source("modules/hyperliquid-risk-guardian/src/index.js"),
      source("modules/hyperliquid-risk-guardian/README.md"),
      source(
        "schemas/v2/hyperliquid-testnet-protective-control.schema.json"
      ).then(JSON.parse),
      source("db/migrations/0035_trading_testnet_risk_guardian.up.sql"),
      source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
        JSON.parse
      )
    ]);

  for (const required of [
    "HyperliquidRiskFreshness",
    "HyperliquidProtectiveControlStatus",
    "mostRestrictive",
    "venue_snapshot_stale",
    "venue_snapshot_unknown",
    "risk_increasing_kill_switch_closed",
    "external_write_outcome_unknown",
    "reduce_only_blocks_risk_increase",
    "flatten_blocks_non_protective_action",
    "createHyperliquidRiskGuardianPolicyEvaluator",
    "SimulatedHyperliquidProtectiveExecutor",
    "PostgresHyperliquidRiskGuardianRepository",
    "automaticRecovery: false",
    "withdrawalAuthority: false",
    "transferAuthority: false",
    "strategyAuthority: false"
  ]) {
    assert.match(
      sourceBody,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    sourceBody,
    /\bfetch\s*\(|process\.env|console\.|node:net|node:tls|node:dns|api\.hyperliquid\.xyz|privateKey|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer/
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  assert.deepEqual(
    controlSchema.properties.targetRiskState.$ref,
    "#/$defs/riskState"
  );
  for (const property of [
    "simulationOnly",
    "simulationFixtureOnly"
  ]) {
    assert.equal(controlSchema.properties[property].const, true);
  }
  for (const property of [
    "productionPolicyApproved",
    "externalSystemQueried",
    "externalOrderSubmitted",
    "liveTransportApproved",
    "liveSignerApproved",
    "apiWalletApproved",
    "withdrawalAuthority",
    "transferAuthority",
    "accountAdministrationAuthority",
    "strategyAuthority",
    "economicRepricingAuthority",
    "automaticRecovery",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(controlSchema.properties[property].const, false);
  }
  for (const required of [
    "trading_testnet_protective_controls_tenant_idempotency_key",
    "trading_testnet_protective_controls_transition_guard",
    "trading_testnet_protective_transitions_immutable_guard",
    "FORCE ROW LEVEL SECURITY",
    "simulation_fixture_only = TRUE",
    "external_system_queried = FALSE",
    "external_order_submitted = FALSE",
    "withdrawal_authority = FALSE",
    "transfer_authority = FALSE",
    "strategy_authority = FALSE",
    "automatic_recovery = FALSE",
    "mainnet_authority = FALSE",
    "production_authority = FALSE",
    "funds_authority = FALSE",
    "secrets_included = FALSE"
  ]) {
    assert.match(
      migration,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  for (const required of [
    "new, precise human approval",
    "synthetic scenario fixtures only",
    "no automatic-recovery",
    "unknown",
    "no generic order",
    "live exchange writes remain unavailable"
  ]) {
    assert.match(readme.toLowerCase(), new RegExp(required.toLowerCase()));
  }
});

test("TC-303 reconciliation is cumulative, inbox-idempotent, bounded, and live-fail-closed", async () => {
  const [sourceBody, readme, recordSchema, migration, catalog] =
    await Promise.all([
      source("modules/hyperliquid-reconciliation/src/index.js"),
      source("modules/hyperliquid-reconciliation/README.md"),
      source(
        "schemas/v2/hyperliquid-testnet-reconciliation-record.schema.json"
      ).then(JSON.parse),
      source(
        "db/migrations/0036_trading_testnet_reconciliation_recovery.up.sql"
      ),
      source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
        JSON.parse
      )
    ]);

  for (const required of [
    "HyperliquidReconciliationStatus",
    "HyperliquidVenueOrderStatus",
    "cumulativeFilledSize",
    "cumulativeFillNotionalMinor",
    "latestEconomicDeltaNotionalMinor",
    "canonical_ledger_changed",
    "cumulative_fill_regressed",
    "poll_budget_exhausted",
    "circuitBreakerOpen",
    "manualSafeStop",
    "processInbox",
    "appendCommandBatchInTransaction",
    "PostgresHyperliquidReconciliationRepository",
    "ledgerPostingRequired: false",
    "ledgerMutationCreated: false",
    "secondLedgerCreated: false",
    "facilityMutationCreated: false",
    "riskRecoveryAuthority: false"
  ]) {
    assert.match(
      sourceBody,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    sourceBody,
    /\bfetch\s*\(|process\.env|console\.|node:net|node:tls|node:dns|api\.hyperliquid\.xyz|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer/
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  assert.deepEqual(recordSchema.properties.status.enum, [
    "PENDING",
    "PARTIAL",
    "UNKNOWN",
    "RECONCILED",
    "REJECTED",
    "INCIDENT",
    "SAFE_STOPPED"
  ]);
  for (const property of [
    "simulationOnly",
    "protectedTestnetE2EOnly",
    "canonicalLedger"
  ]) {
    assert.equal(recordSchema.properties[property].const, true);
  }
  for (const property of [
    "externalSystemQueried",
    "externalOrderSubmitted",
    "liveTransportApproved",
    "liveSignerApproved",
    "apiWalletApproved",
    "ledgerPostingRequired",
    "ledgerMutationCreated",
    "ledgerPostingAuthority",
    "secondLedgerCreated",
    "facilityMutationCreated",
    "facilityMutationAuthority",
    "riskRecoveryAuthority",
    "withdrawalAuthority",
    "transferAuthority",
    "accountAdministrationAuthority",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "rawResponsePersisted",
    "reusableSignaturePersisted",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(recordSchema.properties[property].const, false);
  }
  for (const required of [
    "trading_testnet_reconciliation_runs_tenant_idempotency_key",
    "trading_testnet_reconciliation_runs_execution_key",
    "trading_testnet_reconciliation_runs_transition_guard",
    "FORCE ROW LEVEL SECURITY",
    "simulation_only = TRUE",
    "external_system_queried = FALSE",
    "external_order_submitted = FALSE",
    "ledger_mutation_created = FALSE",
    "second_ledger_created = FALSE",
    "facility_mutation_created = FALSE",
    "mainnet_authority = FALSE",
    "production_authority = FALSE",
    "funds_authority = FALSE",
    "secrets_included = FALSE"
  ]) {
    assert.match(
      migration,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  for (const required of [
    "new, precise human approval",
    "unknown",
    "never become a false success",
    "manual safe stop",
    "not a ledger account",
    "order is resent"
  ]) {
    assert.match(readme.toLowerCase(), new RegExp(required.toLowerCase()));
  }
});

test("TC-401 Facility funding is exact, non-redeemable, separated, and live-fail-closed", async () => {
  const [sourceBody, readme, recordSchema, migration, catalog] =
    await Promise.all([
      source("modules/hyperliquid-facility-funding/src/index.js"),
      source("modules/hyperliquid-facility-funding/README.md"),
      source(
        "schemas/v2/hyperliquid-testnet-facility-funding-record.schema.json"
      ).then(JSON.parse),
      source(
        "db/migrations/0037_trading_testnet_facility_funding.up.sql"
      ),
      source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
        JSON.parse
      )
    ]);

  for (const required of [
    "HyperliquidTestnetFacilityFundingStatus",
    "HyperliquidTestnetContributionRole",
    "SUBJECT_FIRST_LOSS",
    "PROVIDER_PRINCIPAL",
    "REORG_INVALIDATION",
    "wrong_destination",
    "wrong_asset",
    "wrong_amount",
    "canonical_ledger_changed",
    "directFacilityDestination: true",
    "traderWalletPassThrough: false",
    "traderWithdrawalAuthority: false",
    "masterWithdrawalAuthoritySeparated: true",
    "executionSignerSeparated: true",
    "secondFacilityCreated: false",
    "ledgerMutationCreated: false",
    "secondLedgerCreated: false",
    "processInbox",
    "commitCommandInTransaction",
    "PostgresHyperliquidFacilityFundingRepository"
  ]) {
    assert.match(
      sourceBody,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    sourceBody,
    /\bfetch\s*\(|process\.env|console\.|node:net|node:tls|node:dns|api\.hyperliquid\.xyz|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer|privateKey|mnemonic|seedPhrase/
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  assert.deepEqual(recordSchema.properties.status.enum, [
    "AWAITING_CONTRIBUTIONS",
    "AWAITING_SUBJECT",
    "AWAITING_PROVIDER",
    "READY",
    "ACTIVE",
    "INCIDENT"
  ]);
  for (const property of [
    "testnetOnly",
    "simulationOnly",
    "protectedTestnetE2EOnly",
    "nonRedeemable",
    "directFacilityDestination",
    "masterWithdrawalAuthoritySeparated",
    "executionSignerSeparated",
    "canonicalFacility",
    "canonicalLedger"
  ]) {
    assert.equal(recordSchema.properties[property].const, true);
  }
  for (const property of [
    "pooledCapital",
    "traderWalletPassThrough",
    "traderWithdrawalAuthority",
    "externalSystemQueried",
    "externalContributionSubmitted",
    "liveTransportApproved",
    "liveAccountsApproved",
    "apiWalletApproved",
    "rawAddressPersisted",
    "rawResponsePersisted",
    "reusableSignaturePersisted",
    "secondFacilityCreated",
    "ledgerMutationCreated",
    "secondLedgerCreated",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "realFunds",
    "productionFundsMoved",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(recordSchema.properties[property].const, false);
  }
  for (const required of [
    "trading_testnet_facility_funding_controls_tenant_idempotency_key",
    "trading_testnet_facility_funding_controls_facility_key",
    "trading_testnet_facility_funding_controls_authority_separation",
    "trading_testnet_facility_funding_controls_transition_guard",
    "FORCE ROW LEVEL SECURITY",
    "simulation_only = TRUE",
    "non_redeemable = TRUE",
    "direct_facility_destination = TRUE",
    "trader_wallet_pass_through = FALSE",
    "trader_withdrawal_authority = FALSE",
    "ledger_mutation_created = FALSE",
    "second_facility_created = FALSE",
    "second_ledger_created = FALSE",
    "mainnet_authority = FALSE",
    "production_authority = FALSE",
    "funds_authority = FALSE",
    "secrets_included = FALSE"
  ]) {
    assert.match(
      migration,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  for (const required of [
    "new, precise human approval",
    "does not connect to hyperliquid",
    "never pass through",
    "reorg invalidation",
    "not a second facility",
    "network-disabled",
    "not live-testnet or production-readiness evidence"
  ]) {
    assert.match(readme.toLowerCase(), new RegExp(required.toLowerCase()));
  }
});

test("TC-402 final settlement is reconciled, principal-safe, atomic, and live-fail-closed", async () => {
  const [sourceBody, readme, recordSchema, migration, catalog] =
    await Promise.all([
      source("modules/hyperliquid-settlement/src/index.js"),
      source("modules/hyperliquid-settlement/README.md"),
      source(
        "schemas/v2/hyperliquid-testnet-settlement-record.schema.json"
      ).then(JSON.parse),
      source(
        "db/migrations/0038_trading_testnet_settlement.up.sql"
      ),
      source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
        JSON.parse
      )
    ]);

  for (const required of [
    "HyperliquidTestnetSettlementStatus",
    "HyperliquidTestnetFinalityStatus",
    "HyperliquidTestnetReconciliationStatus",
    "calculateTestnetSettlementWaterfall",
    "providerPrincipalReturnMinor",
    "subjectFirstLossMinor",
    "providerFixedReturnGrossMinor",
    "providerPerformanceParticipationGrossMinor",
    "ipoOneFeeBasisMinor",
    "principalFeeApplied: false",
    "unrealizedPnlFeeApplied: false",
    "providerPrincipalGuaranteed: false",
    "payoutExecuted: false",
    "secondFacilityCreated: false",
    "secondObligationCreated: false",
    "secondLedgerCreated: false",
    "processInbox",
    "commitCommandInTransaction",
    "PostgresHyperliquidSettlementRepository"
  ]) {
    assert.match(
      sourceBody,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    sourceBody,
    /\bfetch\s*\(|process\.env|console\.|node:net|node:tls|node:dns|api\.hyperliquid\.xyz|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer|privateKey|mnemonic|seedPhrase/
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  assert.deepEqual(recordSchema.properties.status.enum, [
    "AWAITING_FINALITY",
    "READY_TO_SETTLE",
    "SETTLED",
    "EVIDENCE_ACTIVE",
    "EVIDENCE_REVOKED",
    "INCIDENT"
  ]);
  for (const property of [
    "economicTermsImmutable",
    "feePolicyVersioned",
    "finalReconciliationRequired",
    "noPayoutBeforeFinality",
    "performanceEvidenceRevocable",
    "testnetOnly",
    "simulationOnly",
    "protectedTestnetE2EOnly",
    "nonRedeemable",
    "canonicalFacility",
    "canonicalObligation",
    "canonicalLedger"
  ]) {
    assert.equal(recordSchema.properties[property].const, true);
  }
  for (const property of [
    "payoutExecuted",
    "withdrawalExecuted",
    "transferExecuted",
    "externalSystemQueried",
    "externalCloseSubmitted",
    "liveTransportApproved",
    "liveAccountsApproved",
    "apiWalletApproved",
    "rawAddressPersisted",
    "rawResponsePersisted",
    "reusableSignaturePersisted",
    "secondFacilityCreated",
    "secondObligationCreated",
    "secondLedgerCreated",
    "principalGuaranteeCreated",
    "syntheticReceivableCreated",
    "dynamicRepricingApplied",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "realFunds",
    "productionFundsMoved",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(recordSchema.properties[property].const, false);
  }
  for (const required of [
    "trading_testnet_settlement_runs_tenant_idempotency_key",
    "trading_testnet_settlement_runs_facility_key",
    "trading_testnet_settlement_runs_transition_guard",
    "trading_testnet_settlement_runs_ledger_transaction_fk",
    "DEFERRABLE INITIALLY DEFERRED",
    "FORCE ROW LEVEL SECURITY",
    "simulation_only = TRUE",
    "payout_executed = FALSE",
    "second_facility_created = FALSE",
    "second_obligation_created = FALSE",
    "second_ledger_created = FALSE",
    "principal_guarantee_created = FALSE",
    "synthetic_receivable_created = FALSE",
    "dynamic_repricing_applied = FALSE",
    "mainnet_authority = FALSE",
    "production_authority = FALSE",
    "funds_authority = FALSE",
    "secrets_included = FALSE"
  ]) {
    assert.match(
      migration,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  for (const required of [
    "new, precise human approval",
    "does not connect to hyperliquid",
    "no fee is charged on principal or unrealized pnl",
    "provider principal is returned first, without a guarantee",
    "append-only, revocable, and supersedable",
    "not live-testnet or production-readiness evidence"
  ]) {
    assert.match(readme.toLowerCase(), new RegExp(required.toLowerCase()));
  }
});

test("TC-403 operability gate is restore-complete, failure-safe, bounded, and cannot self-review", async () => {
  const [
    sourceBody,
    policy,
    recordSchema,
    readme,
    runbook,
    independentReviewHandoff,
    drScript,
    packageDocument,
    catalog
  ] = await Promise.all([
    source("modules/hyperliquid-operability/src/index.js"),
    source(
      "modules/hyperliquid-operability/policy/testnet-facility-operability-policy.v1.json"
    ).then(JSON.parse),
    source(
      "schemas/v2/hyperliquid-testnet-operability-assurance.schema.json"
    ).then(JSON.parse),
    source("modules/hyperliquid-operability/README.md"),
    source(
      "docs/operations/TRADING_CAPITAL_TESTNET_OPERABILITY_RUNBOOK.md"
    ),
    source("docs/security/TC_403_INDEPENDENT_REVIEW_HANDOFF.md"),
    source("scripts/run-tc403-disaster-recovery-drill.mjs"),
    source("package.json").then(JSON.parse),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json").then(
      JSON.parse
    )
  ]);

  for (const required of [
    "createHyperliquidRestoreManifest",
    "compareHyperliquidRestoreManifests",
    "createHyperliquidFailureDrill",
    "evaluateHyperliquidOperabilitySignal",
    "runHyperliquidOperabilityCapacityProbe",
    "evaluateHyperliquidTestnetOperabilityAssurance",
    "BLOCKED_INDEPENDENT_REVIEW",
    "external human or organization",
    "source-approved policy artifact",
    "artifactSetHash",
    "launchBlocked: true",
    "open_p0_p1_findings",
    "unknownOutcomeCriticalAfterMs",
    "uncertainEffectRetried !== false",
    "externalWriteSubmitted !== false",
    "credentialOperationPerformed !== false",
    "exchangeWritesEnabled: false",
    "apiWalletOperationsEnabled: false",
    "mainnetAuthority: false",
    "productionAuthority: false",
    "fundsAuthority: false",
    "realFunds: false"
  ]) {
    assert.match(
      sourceBody,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    sourceBody,
    /\bfetch\s*\(|process\.env|console\.|node:net|node:tls|node:dns|api\.hyperliquid\.xyz|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer|privateKey|mnemonic|seedPhrase/
  );

  assert.equal(policy.environment, "hyperliquid_testnet");
  assert.equal(policy.mode, "simulation_and_local_drill_only");
  assert.equal(policy.accountability.incidentOwner, "ipo_one_founder");
  assert.equal(policy.accountability.independentReviewer, null);
  assert.equal(policy.accountability.independentReviewerType, null);
  assert.equal(policy.requiredFailureScenarios.length, 7);
  assert.equal(policy.alerts.length, 7);
  assert.ok(policy.alerts.every(({ blocksNewRisk }) => blocksNewRisk));
  assert.ok(
    Object.values(policy.safetyBoundary).every((value) => value === false)
  );

  for (const property of [
    "automaticRecoveryEnabled",
    "automaticUnfreezeEnabled",
    "automaticKeyOperationEnabled",
    "notificationDeliveryEnabled",
    "protectedSchedulingEnabled",
    "exchangeWritesEnabled",
    "apiWalletOperationsEnabled",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "realFunds",
    "productionFundsMoved",
    "piiIncluded",
    "secretsIncluded"
  ]) {
    assert.equal(recordSchema.properties[property].const, false);
  }
  assert.ok(
    recordSchema.properties.releaseStatus.enum.includes(
      "BLOCKED_INDEPENDENT_REVIEW"
    )
  );
  assert.equal(
    recordSchema.properties.schemaVersion.const,
    "hyperliquid_testnet_operability_assurance.v1"
  );
  assert.equal(recordSchema.properties.launchBlocked.const, true);

  for (const required of [
    "localhost database whose name contains 'test'",
    "IPO_ONE_TC403_DRILL_APPROVAL",
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    "sourceDatabaseMutated: false",
    "externalSystemQueried: false",
    "exchangeWriteSubmitted: false",
    "credentialOperationPerformed: false",
    "productionFundsMoved: false",
    "TRUSTED_POSTGRES_PREFIXES",
    "must resolve to a non-writable PostgreSQL 17 binary",
    "DROP DATABASE IF EXISTS",
    "rm(workingDirectory"
  ]) {
    assert.match(
      drScript,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
  assert.doesNotMatch(
    drScript,
    /api\.hyperliquid\.xyz|approveAgent|withdraw3|usdSend|spotSend|sendAsset|vaultTransfer|privateKey|mnemonic|seedPhrase/
  );
  assert.equal(
    packageDocument.scripts["test:tc403:dr"],
    "node scripts/run-tc403-disaster-recovery-drill.mjs"
  );
  assert.equal(
    catalog.operations.filter(({ operationId }) =>
      operationId.startsWith("trading")
    ).length,
    25
  );
  for (const required of [
    "not a Credential",
    "cannot mark its own work independently reviewed",
    "BLOCKED_INDEPENDENT_REVIEW",
    "machine result always",
    "content-addressed dirty-worktree"
  ]) {
    assert.match(readme, new RegExp(required));
  }
  for (const required of [
    "Never resubmit the action or reuse its nonce",
    "The source database is never mutated",
    "Any open or accepted-launch-blocker P0/P1 finding blocks release",
    "Codex tests, this runbook, and the TC-403 audit are not independent review"
  ]) {
    assert.match(runbook, new RegExp(required));
  }
  for (const required of [
    "review `NOT_PERFORMED`",
    "must not be Codex or the author approving its own implementation",
    "Until then, TC-403 remains `IMPLEMENTED_UNVERIFIED`"
  ]) {
    assert.match(independentReviewHandoff, new RegExp(required));
  }
});
