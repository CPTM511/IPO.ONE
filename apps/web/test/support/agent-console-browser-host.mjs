import { readFile } from "node:fs/promises";
import {
  TENANT_PROTOCOL_CATALOG
} from "../../../../packages/api-contract/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../../modules/authentication/src/authentication-context.js";
import {
  createTenantHttpServer,
  createTenantWebAssetHandler
} from "../../../tenant-api/src/index.js";

const csrfToken = "agent_console_browser_qa_csrf_token_00000000001";
const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

function fixtureResult(operationId) {
  return structuredClone(
    fixtures.validResults.find((result) => result.operationId === operationId)
  );
}

const bindingResult = fixtureResult("pilotReadAgentAccountBinding");
const activationResult = fixtureResult("pilotActivateSandboxMandate");
const activeMandate = structuredClone(activationResult.response.mandate);
activeMandate.capabilities = [
  "request_credit",
  "accept_credit_offer",
  "execute_sandbox_credit",
  "route_repayment"
];
const mandateResult = {
  operationId: "pilotReadMandate",
  replayed: false,
  response: {
    mandate: activeMandate,
    schemaVersion: "tenant_mandate_view.v1"
  },
  schemaVersion: "tenant_protocol_result.v1"
};
const workspaceResult = {
  operationId: "pilotReadWorkspaceResume",
  replayed: false,
  response: {
    workspaceKind: "principal_controller",
    resources: [
      {
        resourceType: "subject",
        resourceId: activeMandate.subjectId,
        relationship: "controller"
      },
      {
        resourceType: "mandate",
        resourceId: activeMandate.mandateId,
        relationship: "controller"
      }
    ],
    hasMore: false,
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v1"
  },
  schemaVersion: "tenant_protocol_result.v1"
};

const results = new Map([
  ["pilotReadWorkspaceResume", workspaceResult],
  ["pilotReadAgentAccountBinding", bindingResult],
  ["pilotReadMandate", mandateResult]
]);

const authenticationContext = createAuthenticationContext({
  tenantId: "tenant_agent_console_browser_qa",
  actorId: "actor_agent_console_founder_qa",
  actorType: ActorType.HUMAN,
  clientId: "client_agent_console_browser_qa",
  credentialId: "credential_agent_console_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: TENANT_PROTOCOL_CATALOG.operations
    .filter((operation) => operation.actorTypes.includes("human"))
    .map((operation) => operation.requiredCapability),
  roles: ["principal_controller"],
  tokenJtiHash: "token_jti_hash_agent_console_browser_qa_0000000000000",
  authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
  senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
  authenticatedAt: "2026-07-24T13:46:27.622Z",
  authTime: "2026-07-24T13:46:27.622Z",
  acr: "urn:ipo.one:acr:phishing-resistant",
  amr: ["webauthn"]
});

async function serveAuthentication({ request, response, url, requestId }) {
  if (request.method !== "GET" || url.pathname !== "/auth/v1/options") return false;
  const body = JSON.stringify({
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "closed_non_funds_pilot",
    enabled: true,
    sessionActive: true,
    oidcProviders: [],
    walletAuthentication: false,
    supportedChains: ["eip155:84532", "eip155:1952"],
    boundary: "Authentication proves presence; internal policy and Mandates separately decide authority."
  });
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
  return true;
}

const host = createTenantHttpServer({
  environment: "development",
  credentialSource: "local_test",
  gateway: {
    async execute(command) {
      const result = results.get(command.operationId);
      if (!result) throw new Error(`unsupported_agent_console_qa_operation:${command.operationId}`);
      return structuredClone(result);
    }
  },
  resolveAuthenticationContext: async ({ request }) => {
    if (request.method === "POST" && request.headers["x-csrf-token"] !== csrfToken) {
      throw new Error("invalid_agent_console_qa_csrf");
    }
    return authenticationContext;
  },
  createNetworkContext: async () => ({ source: "agent_console_browser_qa" }),
  serveAuthentication,
  serveWebAsset: createTenantWebAssetHandler({
    csrfTokenProvider: async () => csrfToken
  })
});

const address = await host.listen();
console.log(`AGENT_CONSOLE_BROWSER_QA_URL=http://${address.host}:${address.port}/#agent-console`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
