import {
  TENANT_PROTOCOL_CATALOG
} from "../../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../../packages/domain/src/index.js";
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

const csrfToken = "capital_network_browser_qa_csrf_token_00000001";
const transferIntentId = "transfer_intent_capital_network_browser_qa";
const deliveryId = "provider_delivery_capital_network_browser_qa";
const deliveryHash = `0x${"71".repeat(32)}`;
const transferIntentHash = `0x${"82".repeat(32)}`;
const issuedAt = new Date(Date.now() - 5_000);
const expiresAt = new Date(issuedAt.getTime() + 300_000);
let status = "pending";
let acknowledgement = null;
const idempotencyResults = new Map();

function providerView() {
  return {
    deliveryId,
    deliveryHash,
    transferIntentId,
    transferIntentHash,
    providerId: "provider_capital_network_browser_qa",
    purposeCode: "compute_services",
    sourceAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
    sourceAmountMinor: "12000",
    destinationAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
    status,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "provider_intent_view.v1"
  };
}

function protocolResult(operationId, response, replayed = false) {
  return {
    operationId,
    replayed,
    response: structuredClone(response),
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function assertExactAssignment(command) {
  if (
    command.resource?.resourceType !== "transfer_intent" ||
    command.resource.resourceId !== transferIntentId ||
    command.purpose !== "provider_intent_delivery"
  ) {
    throw new DomainError(
      "tenant_resource_unavailable",
      "The requested resource is not available."
    );
  }
}

const authenticationContext = createAuthenticationContext({
  tenantId: "tenant_capital_network_browser_qa",
  actorId: "actor_provider_capital_network_browser_qa",
  actorType: ActorType.PROVIDER,
  clientId: "client_capital_network_browser_qa",
  credentialId: "credential_capital_network_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: TENANT_PROTOCOL_CATALOG.operations
    .filter((operation) => operation.actorTypes.includes("provider"))
    .map((operation) => operation.requiredCapability),
  roles: ["provider_sandbox"],
  tokenJtiHash: "token_jti_hash_capital_network_browser_qa_00000000000",
  authenticationMethod: ClientAuthenticationMethod.MTLS,
  senderConstraintMethod: SenderConstraintMethod.MTLS,
  authenticatedAt: new Date().toISOString()
});

async function serveAuthentication({ request, response, url, requestId }) {
  if (request.method !== "GET" || url.pathname !== "/auth/v1/options") return false;
  const body = JSON.stringify({
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "closed_non_funds_pilot",
    enabled: true,
    sessionActive: true,
    sessionAuthenticationMethod: "oidc_pkce_bff",
    oidcProviders: [],
    walletAuthentication: false,
    supportedChains: ["eip155:84532", "eip155:1952"],
    boundary:
      "Authentication proves Provider identity; exact AccessGrant and policy separately decide assignment access."
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
      if (command.operationId === "pilotReadWorkspaceResume") {
        return protocolResult(command.operationId, {
          workspaceKind: "principal_controller",
          resources: [],
          hasMore: false,
          serverTruth: true,
          schemaVersion: "tenant_workspace_resume_view.v1"
        });
      }
      assertExactAssignment(command);
      if (command.operationId === "pilotReadProviderIntent") {
        return protocolResult(command.operationId, providerView());
      }
      if (command.operationId === "pilotAcknowledgeProviderIntent") {
        if (command.payload?.deliveryHash !== deliveryHash) {
          throw new DomainError(
            "provider_intent_unavailable",
            "The requested Provider intent is not available."
          );
        }
        const replay = idempotencyResults.get(command.idempotencyKey);
        if (replay) return protocolResult(command.operationId, replay, true);
        if (status !== "pending") {
          throw new DomainError(
            "provider_intent_already_acknowledged",
            "Provider intent is no longer pending acknowledgement."
          );
        }
        acknowledgement = {
          acknowledgementId:
            "provider_acknowledgement_capital_network_browser_qa",
          deliveryId,
          deliveryHash,
          transferIntentId,
          providerId: "provider_capital_network_browser_qa",
          acknowledgedAt: new Date().toISOString(),
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          schemaVersion: "provider_intent_acknowledgement.v1"
        };
        idempotencyResults.set(command.idempotencyKey, acknowledgement);
        // Browser QA observes the canonical aggregate after the fixture's
        // signed callback worker has completed. Production code never performs
        // this transition in the browser.
        status = "callback_completed";
        return protocolResult(command.operationId, acknowledgement);
      }
      throw new DomainError(
        "tenant_operation_unavailable",
        "The requested operation is not available."
      );
    }
  },
  resolveAuthenticationContext: async ({ request }) => {
    if (
      request.method === "POST" &&
      request.headers["x-csrf-token"] !== csrfToken
    ) {
      throw new DomainError(
        "invalid_tenant_csrf",
        "Capital Network browser QA CSRF is invalid."
      );
    }
    return authenticationContext;
  },
  createNetworkContext: async () => ({ source: "capital_network_browser_qa" }),
  serveAuthentication,
  serveWebAsset: createTenantWebAssetHandler({
    csrfTokenProvider: async () => csrfToken
  })
});

const address = await host.listen();
console.log(
  `CAPITAL_NETWORK_BROWSER_QA_URL=http://${address.host}:${address.port}/#capital-network`
);
console.log(`CAPITAL_NETWORK_BROWSER_QA_INTENT=${transferIntentId}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
