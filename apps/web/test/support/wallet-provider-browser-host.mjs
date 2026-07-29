import {
  createTenantHttpServer,
  createTenantWebAssetHandler
} from "../../../tenant-api/src/index.js";
import { DomainError } from "../../../../packages/domain/src/index.js";

function json(response, status, value, requestId) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
}

const listener = createTenantHttpServer({
  gateway: {
    async execute() {
      throw new DomainError("authorization_denied", "Wallet browser fixture has no Tenant authority");
    }
  },
  async resolveAuthenticationContext() {
    throw new DomainError("authorization_denied", "Wallet browser fixture has no authenticated session");
  },
  async createNetworkContext() {
    return Object.freeze({ source: "local_wallet_browser_fixture" });
  },
  async serveAuthentication({ request, response, url, requestId }) {
    if (request.method === "GET" && url.pathname === "/auth/v1/options") {
      json(response, 200, {
        enabled: true,
        oidcProviders: [],
        walletAuthentication: true,
        sessionActive: false,
        schemaVersion: "ipo_one_authentication_options.v1"
      }, requestId);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/v1/wallet/challenge") {
      json(response, 201, {
        schemaVersion: "ipo_one_wallet_challenge.v1",
        handle: "wallet_browser_challenge_000000000000000001",
        message: "Sign in to the IPO.ONE no-funds browser fixture.",
        expiresAt: "2026-07-27T12:05:00.000Z"
      }, requestId);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/v1/wallet/verify") {
      json(response, 200, {
        schemaVersion: "ipo_one_authentication_result.v1",
        status: "authenticated",
        authenticationMethod: "siwe"
      }, requestId);
      return true;
    }
    return false;
  },
  serveWebAsset: createTenantWebAssetHandler()
});

const address = await listener.listen();
process.stdout.write(`${JSON.stringify({
  url: `http://${address.host}:${address.port}`,
  fixture: "wallet_provider_browser.v1",
  realFundsEnabled: false
})}\n`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await listener.close();
}

process.once("SIGINT", async () => {
  await stop();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await stop();
  process.exit(0);
});

await new Promise(() => {});
