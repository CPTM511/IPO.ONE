import {
  createTenantHttpServer,
  createTenantWebAssetHandler
} from "../../../tenant-api/src/index.js";
import { DomainError } from "../../../../packages/domain/src/index.js";

const scenario = process.env.IPO_ONE_BROWSER_QA_AUTH_SCENARIO ?? "google";
const AUTHENTICATION_SCENARIOS = new Set(["google", "fail_once"]);
if (!AUTHENTICATION_SCENARIOS.has(scenario)) {
  throw new Error("invalid_browser_qa_authentication_scenario");
}

let optionsRequestCount = 0;

function json(response, status, value, requestId, contentType = "application/json; charset=utf-8") {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
}

function authenticationOptions() {
  return {
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "closed_non_funds_pilot",
    enabled: true,
    sessionActive: false,
    sessionAuthenticationMethod: null,
    oidcProviders: ["google"],
    walletAuthentication: false,
    supportedChains: ["eip155:84532", "eip155:1952"],
    boundary: "Authentication proves presence; internal policy and Mandates separately decide authority."
  };
}

async function serveAuthentication({ request, response, url, requestId }) {
  if (
    request.method === "GET" &&
    url.pathname === "/fixture-state.json" &&
    url.search === ""
  ) {
    json(response, 200, {
      schemaVersion: "ipo_one_authentication_browser_fixture_state.v1",
      scenario,
      optionsRequestCount,
      sessionActive: false,
      realFundsEnabled: false
    }, requestId);
    return true;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/auth/v1/options" &&
    url.search === ""
  ) {
    optionsRequestCount += 1;
    if (scenario === "fail_once" && optionsRequestCount === 1) {
      json(response, 503, {
        type: "about:blank",
        title: "Authentication discovery unavailable",
        status: 503,
        code: "authentication_unavailable",
        detail: "The browser QA fixture rejected the first authentication discovery request.",
        requestId
      }, requestId, "application/problem+json; charset=utf-8");
      return true;
    }
    json(response, 200, authenticationOptions(), requestId);
    return true;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/auth/v1/login" &&
    url.searchParams.size === 1 &&
    url.searchParams.get("provider") === "google"
  ) {
    response.writeHead(303, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      location: "/?login=observed",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end();
    return true;
  }

  return false;
}

const listener = createTenantHttpServer({
  gateway: {
    async execute() {
      throw new DomainError(
        "authorization_denied",
        "Authentication browser fixture has no Tenant authority"
      );
    }
  },
  async resolveAuthenticationContext() {
    throw new DomainError(
      "authorization_denied",
      "Authentication browser fixture has no authenticated session"
    );
  },
  async createNetworkContext() {
    return Object.freeze({ source: "local_authentication_browser_fixture" });
  },
  serveAuthentication,
  serveWebAsset: createTenantWebAssetHandler()
});

const address = await listener.listen();
process.stdout.write(`${JSON.stringify({
  url: `http://${address.host}:${address.port}`,
  fixture: "authentication_browser.v1",
  scenario,
  sessionActive: false,
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
