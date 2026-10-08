import { createTenantHttpServer, createTenantWebAssetHandler } from "../../../tenant-api/src/index.js";
import { DomainError } from "../../../../packages/domain/src/index.js";

// Review endpoint deliberately stops after connecting a real injected wallet.
// Browser regression cases intercept challenge responses with explicit fixtures.
const listener = createTenantHttpServer({
  port: Number(process.env.IPO_ONE_WALLET_REVIEW_PORT ?? 42919),
  gateway: { async execute() { throw new DomainError("authorization_denied", "Local wallet review has no Tenant authority"); } },
  async resolveAuthenticationContext() { throw new DomainError("authorization_denied", "Local wallet review has no session"); },
  async createNetworkContext() { return { source: "local_wallet_sign_in_review" }; },
  async serveAuthentication({ request, response, url }) {
    let payload;
    if (request.method === "GET" && url.pathname === "/auth/v1/options") payload = {
      schemaVersion: "ipo_one_authentication_options.v1",
      profile: "public_authenticated_no_funds_beta", enabled: true,
      oidcProviders: [], walletAuthentication: true, riskPasskey: false,
      walletWorkspaceRoles: ["human_borrower", "principal_controller"],
      sessionActive: false, sessionAuthenticationMethod: null
    };
    else if (url.pathname.startsWith("/auth/v1/wallet/")) payload = {
      code: "local_review_signature_boundary",
      detail: "Local review stops before signing. Wallet account and network connection finished; no sign-in challenge or signature will be requested."
    };
    else return false;
    response.writeHead(request.method === "GET" ? 200 : 503, {
      "content-type": "application/json", "cache-control": "no-store"
    });
    response.end(JSON.stringify(payload));
    return true;
  },
  serveWebAsset: createTenantWebAssetHandler()
});
const address = await listener.listen();
process.stdout.write(`Local no-funds wallet review: http://${address.host}:${address.port}/ (stops before signing)\n`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await listener.close(); process.exit(0); });
