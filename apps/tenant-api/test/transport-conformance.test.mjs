import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  SESSION_COOKIE_NAME,
  SenderConstraintMethod
} from "../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";
import { AgentTenantCommandClient } from "../../../modules/tenant-command-gateway/src/index.js";
import { createAgentMcpAdapter, createAgentMcpJsonRpcHandler } from "../../agent-mcp/src/index.js";
import {
  TENANT_HTTP_ROUTES,
  createTenantAuthenticationResolver,
  createTenantHttpServer,
  createTenantPilotHost,
  createTenantWebAssetHandler
} from "../src/index.js";

const tenantProtocolFixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json", import.meta.url),
  "utf8"
));

function agentContext() {
  return createAuthenticationContext({
    tenantId: "tenant_transport_test",
    actorId: "actor_transport_agent",
    actorType: ActorType.AGENT,
    clientId: "client_transport_agent",
    credentialId: "credential_transport_agent",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: [],
    roles: [],
    tokenJtiHash: "token_jti_hash_transport_test_00000000000000000000",
    authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: SenderConstraintMethod.DPOP,
    authenticatedAt: "2026-07-15T00:00:00.000Z"
  });
}

function humanContext() {
  return createAuthenticationContext({
    tenantId: "tenant_transport_test",
    actorId: "actor_transport_human",
    actorType: ActorType.HUMAN,
    clientId: "client_transport_human",
    credentialId: "credential_transport_human",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["subject.read.self"],
    roles: ["borrower"],
    tokenJtiHash: "token_jti_hash_transport_human_000000000000000000",
    authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
    senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
    authenticatedAt: "2026-07-15T00:00:00.000Z",
    authTime: "2026-07-15T00:00:00.000Z",
    acr: "urn:ipo.one:acr:phishing-resistant",
    amr: ["webauthn"]
  });
}

function fixtureResult(operationId) {
  return structuredClone(
    tenantProtocolFixtures.validResults.find((result) => result.operationId === operationId)
  );
}

function protocolResult(command) {
  return {
    operationId: command.operationId,
    replayed: false,
    response: {
      operationId: command.operationId,
      payload: structuredClone(command.payload),
      resource: structuredClone(command.resource)
    },
    schemaVersion: "tenant_protocol_result.v1"
  };
}

test("local client, loopback HTTP, and local MCP preserve one normalized Agent operation", async () => {
  const context = agentContext();
  const calls = [];
  const gateway = {
    async execute(command) {
      calls.push(command);
      assert.equal(command.authenticationContext, context);
      assert.equal(Object.hasOwn(command.payload, "authenticationContext"), false);
      return protocolResult(command);
    }
  };
  const client = new AgentTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => context,
    networkContextProvider: async () => ({ source: "local_test" })
  });
  const local = await client.evaluateCreditApplication({
    creditIntentId: "credit_intent_transport",
    idempotencyKey: "transport-evaluate-0001",
    requestId: "request-transport-local",
    correlationId: "correlation-transport-local"
  });

  const listener = createTenantHttpServer({
    gateway,
    resolveAuthenticationContext: async () => context,
    createNetworkContext: async () => ({ source: "local_test" })
  });
  const address = await listener.listen();
  try {
    const httpResponse = await fetch(
      `http://${address.host}:${address.port}${TENANT_HTTP_ROUTES.operations}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: "pilotEvaluateCreditApplication",
          payload: {},
          resource: { resourceType: "credit_intent", resourceId: "credit_intent_transport" },
          idempotencyKey: "transport-evaluate-0001",
          requestId: "request-transport-http",
          correlationId: "correlation-transport-http",
          schemaVersion: "tenant_protocol_request.v1"
        })
      }
    );
    assert.equal(httpResponse.status, 200);
    const http = await httpResponse.json();

    const rpc = createAgentMcpJsonRpcHandler({ adapter: createAgentMcpAdapter({ client }) });
    const mcpResponse = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "ipo_one_evaluate_credit_application",
        arguments: {
          creditIntentId: "credit_intent_transport",
          idempotencyKey: "transport-evaluate-0001",
          requestId: "request-transport-mcp",
          correlationId: "correlation-transport-mcp"
        }
      }
    });
    const mcp = mcpResponse.result.structuredContent;

    assert.deepEqual(http.response, local.response);
    assert.deepEqual(mcp.response, local.response);
    assert.equal(calls.length, 3);
    assert.equal(calls.every((call) => call.operationId === "pilotEvaluateCreditApplication"), true);
  } finally {
    await listener.close();
  }
});

test("authenticated Pool market read is independent from a Subject resource", async () => {
  const context = humanContext();
  let authLookups = 0;
  let marketReads = 0;
  const snapshot = Object.freeze({
    market: Object.freeze({ status: "deployed_not_indexed" }),
    submission: Object.freeze({
      state: "unavailable",
      reasonCode: "pool_submission_unavailable",
      transactionHash: null
    }),
    serverDerived: true,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "secured_pool_market_snapshot.v1"
  });
  const listener = createTenantHttpServer({
    gateway: { execute: async () => assert.fail("market read reached Tenant Gateway") },
    resolveAuthenticationContext: async () => {
      authLookups += 1;
      return context;
    },
    createNetworkContext: async () => ({}),
    securedPoolMarketProvider: async ({ authenticationContext }) => {
      marketReads += 1;
      assert.equal(authenticationContext, context);
      return snapshot;
    }
  });
  const address = await listener.listen();
  try {
    const response = await fetch(
      `http://${address.host}:${address.port}${TENANT_HTTP_ROUTES.securedPoolMarket}`
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), snapshot);
    assert.equal(authLookups, 1);
    assert.equal(marketReads, 1);
  } finally {
    await listener.close();
  }
});

test("Tenant HTTP fails closed outside loopback and rejects caller authority fields", async () => {
  const context = agentContext();
  assert.throws(() => createTenantHttpServer({
    gateway: { execute: async () => ({}) },
    resolveAuthenticationContext: async () => context,
    createNetworkContext: async () => ({}),
    host: "0.0.0.0"
  }), (error) => error.code === "unsafe_tenant_transport_config");
  assert.throws(() => createTenantHttpServer({
    gateway: { execute: async () => ({}) },
    resolveAuthenticationContext: async () => context,
    createNetworkContext: async () => ({}),
    environment: "production"
  }), (error) => error.code === "unsafe_tenant_transport_config");

  let authLookups = 0;
  const listener = createTenantHttpServer({
    gateway: { execute: async () => assert.fail("invalid request reached Gateway") },
    resolveAuthenticationContext: async () => {
      authLookups += 1;
      return context;
    },
    createNetworkContext: async () => ({})
  });
  const address = await listener.listen();
  try {
    const response = await fetch(
      `http://${address.host}:${address.port}${TENANT_HTTP_ROUTES.operations}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: "pilotReadAgentSelf",
          payload: {},
          resource: { resourceType: "subject", resourceId: "subject_transport" },
          requestId: "request-transport-invalid",
          correlationId: "correlation-transport-invalid",
          authenticationContext: { tenantId: "caller" },
          schemaVersion: "tenant_protocol_request.v1"
        })
      }
    );
    const problem = await response.json();
    assert.equal(response.status, 400);
    assert.equal(problem.code, "invalid_tenant_protocol_request");
    assert.equal(authLookups, 0);
  } finally {
    await listener.close();
  }
});

test("loopback Tenant host can serve the Human pilot shell without exposing private operations", async () => {
  const context = agentContext();
  const csrfToken = "q".repeat(43);
  const localAgentAccount = `0x${"2".repeat(40)}`;
  let authLookups = 0;
  const listener = createTenantHttpServer({
    gateway: { execute: async () => assert.fail("static asset request reached Gateway") },
    resolveAuthenticationContext: async () => {
      authLookups += 1;
      return context;
    },
    createNetworkContext: async () => ({}),
    serveWebAsset: createTenantWebAssetHandler({
      csrfTokenProvider: async () => csrfToken,
      localAgentAccountProvider: async () => localAgentAccount
    })
  });
  const address = await listener.listen();
  const baseUrl = `http://${address.host}:${address.port}`;
  try {
    const pageResponse = await fetch(`${baseUrl}/`);
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get("content-type"), /^text\/html/);
    assert.match(
      pageResponse.headers.get("content-security-policy"),
      /connect-src 'self' wss:\/\/relay\.walletconnect\.org https:\/\/sepolia\.base\.org https:\/\/testrpc\.xlayer\.tech/
    );
    assert.equal(pageResponse.headers.get("x-frame-options"), "DENY");
    const page = await pageResponse.text();
    assert.match(page, /Request and price no-funds credit/);
    assert.match(page, /Create, review, and activate Agent authority/);
    assert.match(page, /Principal → Agent capability packet/);
    assert.match(page, /One manifest\. Thirteen local tools\. No ambient authority\./);
    assert.match(page, /Approved local stdio MCP tools/);
    assert.match(page, /Three staged workflows/);
    assert.match(page, /local stdio MCP · closed_non_funds_pilot/);
    assert.match(page, /Obligation Evidence/);
    assert.match(page, /Durable audit timeline/);
    assert.match(page, /New Subjects remain pending/);
    assert.match(page, /no credential creation/);
    assert.match(page, new RegExp(`name="ipo-one-csrf-token" content="${csrfToken}"`));
    assert.match(
      page,
      new RegExp(`name="ipo-one-local-agent-account" content="${localAgentAccount}"`)
    );
    assert.doesNotMatch(page, /privateKey|signatureHex/);
    assert.equal(pageResponse.headers.get("vary"), "cookie");

    const whitepaperResponse = await fetch(`${baseUrl}/whitepaper`);
    assert.equal(whitepaperResponse.status, 200);
    assert.match(whitepaperResponse.headers.get("content-type"), /^text\/html/);
    assert.equal(whitepaperResponse.headers.get("vary"), null);
    const whitepaper = await whitepaperResponse.text();
    assert.match(whitepaper, /Founding Edition II/);
    assert.match(whitepaper, /The Credit Layer for the <em>Agentic Economy<\/em>/);
    assert.match(whitepaper, /No offer of credit, securities, tokens, or investment products/);

    const whitepaperScriptResponse = await fetch(`${baseUrl}/whitepaper.js`, { method: "HEAD" });
    assert.equal(whitepaperScriptResponse.status, 200);
    assert.match(whitepaperScriptResponse.headers.get("content-type"), /^text\/javascript/);
    assert.equal(await whitepaperScriptResponse.text(), "");

    const pdfResponse = await fetch(
      `${baseUrl}/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_II.pdf`,
      { method: "HEAD" }
    );
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
    assert.equal(Number(pdfResponse.headers.get("content-length")), 2310065);
    assert.equal(await pdfResponse.text(), "");

    const openApiResponse = await fetch(`${baseUrl}${TENANT_HTTP_ROUTES.openapi}`);
    assert.equal(openApiResponse.status, 200);
    const openApi = await openApiResponse.json();
    assert.equal(openApi.openapi, "3.1.2");
    assert.equal(
      openApi.jsonSchemaDialect,
      "https://json-schema.org/draft/2020-12/schema"
    );
    assert.equal(openApi.servers[0].url, baseUrl);
    assert.equal(openApi["x-ipo-one-schema-version"], "tenant_openapi.v1");
    assert.equal(openApi["x-ipo-one-profile"], "closed_non_funds_pilot");
    assert.equal(openApi["x-real-funds-enabled"], false);
    assert.deepEqual(Object.keys(openApi.paths).sort(), [
      "/.well-known/ipo-one.json",
      "/tenant/v1/catalog",
      "/tenant/v1/operations",
      "/tenant/v1/secured-pool/market"
    ]);
    assert.equal(
      openApi.paths["/.well-known/ipo-one.json"].get.operationId,
      "getDeployedChainCapability"
    );

    const scriptResponse = await fetch(`${baseUrl}/app.js`, { method: "HEAD" });
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type"), /^text\/javascript/);
    assert.equal(await scriptResponse.text(), "");

    const scriptBodyResponse = await fetch(`${baseUrl}/app.js`);
    const script = await scriptBodyResponse.text();
    assert.match(script, /from "\.\/agent-console-presentation\.js"/);
    assert.match(script, /from "\.\/agent-handoff-manifest\.js"/);
    assert.match(script, /from "\.\/agent-lifecycle-next-action\.js"/);
    assert.match(script, /from "\.\/agent-pilot-capability-manifest\.js"/);
    assert.match(script, /from "\.\/authentication-availability-presentation\.js"/);
    assert.match(script, /from "\.\/capital-network-presentation\.js"/);
    assert.match(script, /from "\.\/capital-partner-presentation\.js"/);
    assert.match(script, /from "\.\/risk-operations-presentation\.js"/);
    assert.match(script, /from "\.\/secured-pool-presentation\.js"/);
    assert.match(script, /from "\.\/risk-workspace-selection\.js"/);
    assert.match(script, /from "\.\/credit-passport-presentation\.js"/);
    assert.match(script, /from "\.\/decision-passport-presentation\.js"/);
    assert.match(script, /from "\.\/evidence-receipt-presentation\.js"/);
    assert.match(script, /from "\.\/human-credit-offer-workflow-receipt\.js"/);
    assert.match(script, /from "\.\/human-sandbox-obligation-workflow-receipt\.js"/);
    assert.match(script, /from "\.\/obligation-portfolio-presentation\.js"/);
    assert.match(script, /from "\.\/official-report-download\.js"/);
    assert.match(script, /from "\.\/owned-evidence-presentation\.js"/);
    assert.match(script, /from "\.\/principal-workspace-access\.js"/);
    assert.match(script, /from "\.\/principal-agent-workspace-selection\.js"/);
    assert.match(script, /from "\.\/request-credit-review-binding\.js"/);
    assert.match(script, /from "\.\/servicing-case-presentation\.js"/);
    assert.match(script, /from "\.\/servicing-position-index\.js"/);
    assert.match(script, /from "\.\/trading-capital-product-presentation\.js"/);
    assert.match(script, /from "\.\/wallet-authority-lifecycle\.js"/);
    assert.match(script, /from "\.\/wallet-provider-registry\.js"/);
    assert.match(script, /from "\.\/wallet-sign-out\.js"/);
    assert.match(script, /from "\.\/workspace-navigation\.js"/);
    assert.match(script, /from "\.\/workspace-surface-access\.js"/);
    assert.match(script, /from "\.\/v9-trust-surfaces\.js"/);
    assert.match(script, /tenantApi\("pilotReadEvidence"/);
    assert.match(script, /resourceType: "evidence"/);

    const relativeModules = [...script.matchAll(/from "\.\/([^"?]+\.js)"/g)]
      .map((match) => `/${match[1]}`);
    assert.deepEqual(relativeModules.sort(), [
      "/agent-console-presentation.js",
      "/agent-handoff-manifest.js",
      "/agent-lifecycle-next-action.js",
      "/agent-pilot-capability-manifest.js",
      "/authentication-availability-presentation.js",
      "/capital-network-presentation.js",
      "/capital-partner-presentation.js",
      "/capital-partner-workspace-selection.js",
      "/credit-passport-presentation.js",
      "/decision-passport-presentation.js",
      "/evidence-receipt-presentation.js",
      "/human-credit-offer-workflow-receipt.js",
      "/human-sandbox-obligation-workflow-receipt.js",
      "/obligation-portfolio-presentation.js",
      "/official-report-download.js",
      "/owned-evidence-presentation.js",
      "/principal-agent-workspace-selection.js",
      "/principal-workspace-access.js",
      "/request-credit-review-binding.js",
      "/risk-operations-presentation.js",
      "/risk-workspace-selection.js",
      "/secured-pool-presentation.js",
      "/servicing-case-presentation.js",
      "/servicing-position-index.js",
      "/trading-capital-product-presentation.js",
      "/v9-trust-surfaces.js",
      "/wallet-authority-lifecycle.js",
      "/wallet-provider-registry.js",
      "/wallet-sign-out.js",
      "/workspace-navigation.js",
      "/workspace-surface-access.js"
    ]);
    for (const modulePath of relativeModules) {
      const moduleResponse = await fetch(`${baseUrl}${modulePath}`);
      assert.equal(moduleResponse.status, 200, `${modulePath} is missing from the fixed asset allowlist`);
      assert.match(moduleResponse.headers.get("content-type"), /^text\/javascript/);
    }

    const handoffResponse = await fetch(`${baseUrl}/agent-handoff-manifest.js`);
    assert.equal(handoffResponse.status, 200);
    assert.match(handoffResponse.headers.get("content-type"), /^text\/javascript/);
    const handoff = await handoffResponse.text();
    assert.match(handoff, /agent_handoff_manifest\.v1/);
    assert.match(handoff, /credentialDelivery: "out_of_band"/);
    assert.match(handoff, /credentialsIncluded: false/);
    assert.match(handoff, /remoteMcpEnabled: false/);
    assert.match(handoff, /fundsAuthority: false/);
    assert.doesNotMatch(script, /accessToken/);
    assert.doesNotMatch(script, /authenticationContext/);
    assert.doesNotMatch(handoff, /accessToken|privateKey|authenticationContext/);

    const capabilityResponse = await fetch(`${baseUrl}/agent-pilot-capability-manifest.js`);
    assert.equal(capabilityResponse.status, 200);
    assert.match(capabilityResponse.headers.get("content-type"), /^text\/javascript/);
    const capabilityManifest = await capabilityResponse.text();
    assert.match(capabilityManifest, /agent_pilot_capability_manifest\.v1/);
    assert.match(capabilityManifest, /economicMcpToolsEnabled: true/);
    assert.match(capabilityManifest, /liveChainExecution: false/);
    assert.doesNotMatch(capabilityManifest, /accessToken|privateKey|authenticationContext/);

    const consolePresentationResponse = await fetch(
      `${baseUrl}/agent-console-presentation.js`
    );
    assert.equal(consolePresentationResponse.status, 200);
    const consolePresentation = await consolePresentationResponse.text();
    assert.match(consolePresentation, /agent_console_presentation\.v1/);
    assert.match(consolePresentation, /catalogParity/);
    assert.match(consolePresentation, /productionFundsApproved: false/);
    assert.doesNotMatch(
      consolePresentation,
      /accessToken|privateKey|authenticationContext/
    );

    const unknownResponse = await fetch(`${baseUrl}/not-an-asset`);
    assert.equal(unknownResponse.status, 404);
    assert.equal(authLookups, 0, "public shell assets must not synthesize authenticated authority");
  } finally {
    await listener.close();
  }
});

test("named Tenant pilot Host composes one authenticated Human UI and operation path", async () => {
  const context = humanContext();
  const csrfToken = "c".repeat(43);
  const sessionHandle = "s".repeat(43);
  const localAgentAccount = `0x${"3".repeat(40)}`;
  const authenticationCalls = [];
  const gatewayCalls = [];
  const host = createTenantPilotHost({
    gateway: {
      async execute(command) {
        gatewayCalls.push(command);
        assert.equal(command.authenticationContext, context);
        assert.deepEqual(command.networkContext, { source: "local_test" });
        assert.equal(Object.hasOwn(command, "tenantId"), false);
        return fixtureResult(command.operationId);
      }
    },
    humanBff: {
      authenticateSession(input) {
        authenticationCalls.push(input);
        assert.equal(input.sessionHandle, sessionHandle);
        return context;
      }
    },
    machineAuthenticator: {
      async authenticate() {
        assert.fail("Human session reached the Agent workload verifier");
      }
    },
    createNetworkContext: async () => ({ source: "local_test" }),
    sessionHandleProvider: async () => sessionHandle,
    localAgentAccountProvider: async () => localAgentAccount,
    csrfTokenProvider: async ({ request }) => {
      assert.equal(request.headers.cookie, `${SESSION_COOKIE_NAME}=${sessionHandle}`);
      return csrfToken;
    }
  });
  const address = await host.listen();
  const baseUrl = `http://${address.host}:${address.port}`;
  const cookie = `${SESSION_COOKIE_NAME}=${sessionHandle}`;
  try {
    const pageResponse = await fetch(`${baseUrl}/`, { headers: { cookie } });
    assert.equal(pageResponse.status, 200);
    assert.equal(
      pageResponse.headers.get("set-cookie"),
      `${SESSION_COOKIE_NAME}=${sessionHandle}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
    );
    const page = await pageResponse.text();
    assert.match(page, new RegExp(`name="ipo-one-csrf-token" content="${csrfToken}"`));
    assert.match(
      page,
      new RegExp(`name="ipo-one-local-agent-account" content="${localAgentAccount}"`)
    );
    assert.equal(authenticationCalls.length, 0, "static UI must not synthesize Authentication Context");

    const moduleResponse = await fetch(`${baseUrl}/human-credit-offer-workflow-receipt.js`);
    assert.equal(moduleResponse.status, 200);
    assert.match(await moduleResponse.text(), /human_credit_offer_workflow_receipt\.v1/);

    const reviewBindingResponse = await fetch(
      `${baseUrl}/request-credit-review-binding.js`
    );
    assert.equal(reviewBindingResponse.status, 200);
    assert.match(
      await reviewBindingResponse.text(),
      /request_credit_review_binding\.v1/
    );

    const passportModuleResponse = await fetch(
      `${baseUrl}/decision-passport-presentation.js`
    );
    assert.equal(passportModuleResponse.status, 200);
    assert.match(
      await passportModuleResponse.text(),
      /risk_decision_passport\.v1/
    );

    const obligationModuleResponse = await fetch(
      `${baseUrl}/human-sandbox-obligation-workflow-receipt.js`
    );
    assert.equal(obligationModuleResponse.status, 200);
    assert.match(
      await obligationModuleResponse.text(),
      /human_sandbox_obligation_workflow_receipt\.v1/
    );

    const servicingModuleResponse = await fetch(
      `${baseUrl}/servicing-case-presentation.js`
    );
    assert.equal(servicingModuleResponse.status, 200);
    assert.match(
      await servicingModuleResponse.text(),
      /servicing_case_presentation\.v1/
    );

    const servicingPositionIndexResponse = await fetch(
      `${baseUrl}/servicing-position-index.js`
    );
    assert.equal(servicingPositionIndexResponse.status, 200);
    assert.match(
      await servicingPositionIndexResponse.text(),
      /servicing_position_index\.v1/
    );

    const obligationPortfolioResponse = await fetch(
      `${baseUrl}/obligation-portfolio-presentation.js`
    );
    assert.equal(obligationPortfolioResponse.status, 200);
    assert.match(
      await obligationPortfolioResponse.text(),
      /obligation_portfolio_presentation\.v1/
    );

    const catalogResponse = await fetch(`${baseUrl}${TENANT_HTTP_ROUTES.catalog}`, {
      headers: { cookie }
    });
    assert.equal(catalogResponse.status, 200);
    assert.equal((await catalogResponse.json()).schemaVersion, "tenant_protocol_catalog.v1");

    const operationResponse = await fetch(`${baseUrl}${TENANT_HTTP_ROUTES.operations}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: baseUrl,
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        operationId: "pilotReadHumanSelf",
        payload: {},
        resource: { resourceType: "subject", resourceId: "subject_human_fixture" },
        requestId: "request-tenant-pilot-host-human-self",
        correlationId: "correlation-tenant-pilot-host-human-self",
        schemaVersion: "tenant_protocol_request.v1"
      })
    });
    assert.equal(operationResponse.status, 200);
    assert.equal((await operationResponse.json()).operationId, "pilotReadHumanSelf");
    assert.equal(authenticationCalls.length, 2);
    assert.equal(authenticationCalls[0].requestMethod, "GET");
    assert.equal(authenticationCalls[0].csrfToken, undefined);
    assert.equal(authenticationCalls[1].requestMethod, "POST");
    assert.equal(authenticationCalls[1].requestOrigin, baseUrl);
    assert.equal(authenticationCalls[1].csrfToken, csrfToken);
    assert.equal(gatewayCalls.length, 1);
  } finally {
    await host.close();
  }

  assert.throws(
    () => createTenantPilotHost({
      gateway: { execute: async () => ({}) },
      humanBff: { authenticateSession: () => context },
      machineAuthenticator: { authenticate: async () => context },
      createNetworkContext: async () => ({ source: "local_test" }),
      csrfTokenProvider: async () => csrfToken,
      accessToken: "prohibited"
    }),
    (error) => error.code === "invalid_tenant_pilot_host_config"
  );
});

test("Tenant web shell fails closed for an invalid CSRF bootstrap provider", async () => {
  assert.throws(
    () => createTenantWebAssetHandler({ csrfTokenProvider: "caller-field" }),
    (error) => error.code === "invalid_tenant_web_config"
  );
  assert.throws(
    () => createTenantWebAssetHandler({ localAgentAccountProvider: "caller-field" }),
    (error) => error.code === "invalid_tenant_web_config"
  );
  const handler = createTenantWebAssetHandler({ csrfTokenProvider: async () => "too-short" });
  await assert.rejects(
    () => handler({
      request: { method: "GET" },
      response: {},
      pathname: "/",
      requestId: "request-invalid-csrf-bootstrap"
    }),
    (error) => error.code === "invalid_tenant_csrf_bootstrap"
  );
  const invalidAccountHandler = createTenantWebAssetHandler({
    localAgentAccountProvider: async () => "not-an-account"
  });
  await assert.rejects(
    () => invalidAccountHandler({
      request: { method: "GET" },
      response: {},
      pathname: "/",
      requestId: "request-invalid-agent-account-bootstrap"
    }),
    (error) => error.code === "invalid_tenant_agent_account_bootstrap"
  );
});

test("transport authentication resolver uses Human session or sender-constrained Agent verifier out of band", async () => {
  const context = agentContext();
  const calls = [];
  const resolver = createTenantAuthenticationResolver({
    humanBff: {
      authenticateSession(input) {
        calls.push(["human", input]);
        return context;
      }
    },
    machineAuthenticator: {
      async authenticate(input) {
        calls.push(["agent", input]);
        return context;
      }
    }
  });
  await resolver({
    request: {
      method: "POST",
      headers: {
        authorization: "Bearer opaque-test-token",
        dpop: "opaque-test-proof"
      }
    },
    requestUrl: "http://127.0.0.1:9000/tenant/v1/operations"
  });
  assert.equal(calls[0][0], "agent");
  assert.equal(calls[0][1].accessToken, "opaque-test-token");
  assert.equal(calls[0][1].dpopProof, "opaque-test-proof");
  assert.equal(Object.hasOwn(calls[0][1], "tenantId"), false);
});

test("transport authentication resolver honors an explicit Human session mode without unioning workload authority", async () => {
  const context = humanContext();
  const calls = [];
  const sessionHandle = "s".repeat(43);
  const resolver = createTenantAuthenticationResolver({
    humanBff: {
      authenticateSession(input) {
        calls.push(["human", input]);
        return context;
      }
    },
    machineAuthenticator: {
      async authenticate() {
        calls.push(["agent"]);
        assert.fail("Explicit Human session selection reached the Agent verifier");
      }
    }
  });

  const result = await resolver({
    request: {
      method: "POST",
      headers: {
        authorization: "Bearer platform-injected-credential",
        cookie: `${SESSION_COOKIE_NAME}=${sessionHandle}`,
        origin: "https://ipo.one",
        "x-csrf-token": "c".repeat(43),
        "x-ipo-one-authentication-mode": "human_session"
      }
    },
    requestUrl: "https://ipo.one/tenant/v1/operations"
  });

  assert.equal(result, context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "human");
  assert.equal(calls[0][1].sessionHandle, sessionHandle);
});

test("transport authentication resolver rejects ambiguous or mismatched authentication selection", async () => {
  const context = humanContext();
  const sessionHandle = "s".repeat(43);
  const resolver = createTenantAuthenticationResolver({
    humanBff: { authenticateSession: async () => context },
    machineAuthenticator: { authenticate: async () => context }
  });
  const requestUrl = "https://ipo.one/tenant/v1/operations";

  await assert.rejects(
    () => resolver({
      request: {
        method: "POST",
        headers: {
          authorization: "Bearer opaque-test-token",
          cookie: `${SESSION_COOKIE_NAME}=${sessionHandle}`
        }
      },
      requestUrl
    }),
    (error) => error.code === "authentication_required"
  );
  await assert.rejects(
    () => resolver({
      request: {
        method: "POST",
        headers: {
          authorization: "Bearer opaque-test-token",
          cookie: `${SESSION_COOKIE_NAME}=${sessionHandle}`,
          "x-ipo-one-authentication-mode": "workload_bearer"
        }
      },
      requestUrl
    }),
    (error) => error.code === "authentication_required"
  );
  await assert.rejects(
    () => resolver({
      request: {
        method: "POST",
        headers: {
          authorization: "Bearer opaque-test-token",
          "x-ipo-one-authentication-mode": "human_session"
        }
      },
      requestUrl
    }),
    (error) => error.code === "authentication_required"
  );
});
