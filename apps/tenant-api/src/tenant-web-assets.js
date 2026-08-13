import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SESSION_COOKIE_NAME } from "../../../modules/authentication/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const WEB_ASSET_ROOT = join(process.cwd(), "apps", "web", "src");
const WEB_ASSETS = Object.freeze({
  "/": Object.freeze({ file: "index.html", contentType: "text/html; charset=utf-8" }),
  "/index.html": Object.freeze({ file: "index.html", contentType: "text/html; charset=utf-8" }),
  "/app.js": Object.freeze({ file: "app.js", contentType: "text/javascript; charset=utf-8" }),
  "/agent-console-presentation.js": Object.freeze({ file: "agent-console-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/agent-handoff-manifest.js": Object.freeze({ file: "agent-handoff-manifest.js", contentType: "text/javascript; charset=utf-8" }),
  "/agent-lifecycle-next-action.js": Object.freeze({ file: "agent-lifecycle-next-action.js", contentType: "text/javascript; charset=utf-8" }),
  "/agent-pilot-capability-manifest.js": Object.freeze({ file: "agent-pilot-capability-manifest.js", contentType: "text/javascript; charset=utf-8" }),
  "/authentication-availability-presentation.js": Object.freeze({ file: "authentication-availability-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/capital-network-presentation.js": Object.freeze({ file: "capital-network-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/capital-partner-presentation.js": Object.freeze({ file: "capital-partner-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/capital-partner-workspace-selection.js": Object.freeze({ file: "capital-partner-workspace-selection.js", contentType: "text/javascript; charset=utf-8" }),
  "/credit-passport-presentation.js": Object.freeze({ file: "credit-passport-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/decision-passport-presentation.js": Object.freeze({ file: "decision-passport-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/evidence-receipt-presentation.js": Object.freeze({ file: "evidence-receipt-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/human-credit-offer-workflow-receipt.js": Object.freeze({ file: "human-credit-offer-workflow-receipt.js", contentType: "text/javascript; charset=utf-8" }),
  "/human-sandbox-obligation-workflow-receipt.js": Object.freeze({ file: "human-sandbox-obligation-workflow-receipt.js", contentType: "text/javascript; charset=utf-8" }),
  "/mobile-wallet-connector.js": Object.freeze({ file: "mobile-wallet-connector.js", contentType: "text/javascript; charset=utf-8" }),
  "/evm-wallet-connector.js": Object.freeze({ file: "evm-wallet-connector.js", contentType: "text/javascript; charset=utf-8" }),
  "/obligation-portfolio-presentation.js": Object.freeze({ file: "obligation-portfolio-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/official-report-download.js": Object.freeze({ file: "official-report-download.js", contentType: "text/javascript; charset=utf-8" }),
  "/owned-evidence-presentation.js": Object.freeze({ file: "owned-evidence-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/principal-workspace-access.js": Object.freeze({ file: "principal-workspace-access.js", contentType: "text/javascript; charset=utf-8" }),
  "/principal-agent-workspace-selection.js": Object.freeze({ file: "principal-agent-workspace-selection.js", contentType: "text/javascript; charset=utf-8" }),
  "/request-credit-review-binding.js": Object.freeze({ file: "request-credit-review-binding.js", contentType: "text/javascript; charset=utf-8" }),
  "/risk-operations-presentation.js": Object.freeze({ file: "risk-operations-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/risk-workspace-selection.js": Object.freeze({ file: "risk-workspace-selection.js", contentType: "text/javascript; charset=utf-8" }),
  "/servicing-case-presentation.js": Object.freeze({ file: "servicing-case-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/servicing-position-index.js": Object.freeze({ file: "servicing-position-index.js", contentType: "text/javascript; charset=utf-8" }),
  "/trading-capital-product-presentation.js": Object.freeze({ file: "trading-capital-product-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/wallet-authority-lifecycle.js": Object.freeze({ file: "wallet-authority-lifecycle.js", contentType: "text/javascript; charset=utf-8" }),
  "/wallet-provider-registry.js": Object.freeze({ file: "wallet-provider-registry.js", contentType: "text/javascript; charset=utf-8" }),
  "/wallet-sign-out.js": Object.freeze({ file: "wallet-sign-out.js", contentType: "text/javascript; charset=utf-8" }),
  "/workspace-navigation.js": Object.freeze({ file: "workspace-navigation.js", contentType: "text/javascript; charset=utf-8" }),
  "/workspace-surface-access.js": Object.freeze({ file: "workspace-surface-access.js", contentType: "text/javascript; charset=utf-8" }),
  "/v9-trust-surfaces.js": Object.freeze({ file: "v9-trust-surfaces.js", contentType: "text/javascript; charset=utf-8" }),
  "/vendor/walletconnect-ethereum-provider-2.23.10.iife.js": Object.freeze({ file: "vendor/walletconnect-ethereum-provider-2.23.10.iife.js", contentType: "text/javascript; charset=utf-8" }),
  "/vendor/walletconnect-community-license.txt": Object.freeze({ file: "vendor/walletconnect-community-license.txt", contentType: "text/plain; charset=utf-8" }),
  "/styles.css": Object.freeze({ file: "styles.css", contentType: "text/css; charset=utf-8" }),
  "/icons.svg": Object.freeze({ file: "icons.svg", contentType: "image/svg+xml" }),
  "/favicon.svg": Object.freeze({ file: "favicon.svg", contentType: "image/svg+xml" }),
  "/favicon.ico": Object.freeze({ file: "favicon.svg", contentType: "image/svg+xml" }),
  "/manifest.webmanifest": Object.freeze({ file: "manifest.webmanifest", contentType: "application/manifest+json" })
});
const CSRF_META_PLACEHOLDER = '<meta name="ipo-one-csrf-token" content="" />';
const LOCAL_AGENT_ACCOUNT_META_PLACEHOLDER =
  '<meta name="ipo-one-local-agent-account" content="" />';
const WORKSPACE_NAME_META_PLACEHOLDER =
  '<meta name="ipo-one-workspace-name" content="" />';
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const SESSION_HANDLE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const EVM_ACCOUNT_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const WORKSPACE_NAME_PATTERN = /^[a-z][A-Za-z0-9]{1,63}$/;

const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self' wss://relay.walletconnect.org https://sepolia.base.org https://testrpc.xlayer.tech; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
});

export function createTenantWebAssetHandler({
  csrfTokenProvider,
  sessionHandleProvider,
  localAgentAccountProvider,
  workspaceNameProvider
} = {}) {
  if (
    (csrfTokenProvider !== undefined && typeof csrfTokenProvider !== "function") ||
    (sessionHandleProvider !== undefined && typeof sessionHandleProvider !== "function") ||
    (localAgentAccountProvider !== undefined && typeof localAgentAccountProvider !== "function") ||
    (workspaceNameProvider !== undefined && typeof workspaceNameProvider !== "function")
  ) {
    throw new DomainError("invalid_tenant_web_config", "Tenant web bootstrap providers must be functions");
  }
  return async function serveTenantWebAsset({ request, response, pathname, requestId }) {
    if (!request || !response || typeof pathname !== "string" || typeof requestId !== "string") {
      throw new DomainError("invalid_tenant_web_request", "Tenant web asset request is invalid");
    }
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const asset = WEB_ASSETS[pathname];
    if (!asset) return false;
    let body = await readFile(join(WEB_ASSET_ROOT, asset.file));
    let sessionHandle;
    if (
      asset.file === "index.html" &&
      (
        csrfTokenProvider ||
        sessionHandleProvider ||
        localAgentAccountProvider ||
        workspaceNameProvider
      )
    ) {
      const [
        csrfToken,
        providedSessionHandle,
        localAgentAccount,
        workspaceName
      ] = await Promise.all([
        csrfTokenProvider?.({ request, requestId }),
        sessionHandleProvider?.({ request, requestId }),
        localAgentAccountProvider?.({ request, requestId }),
        workspaceNameProvider?.({ request, requestId })
      ]);
      if (csrfToken !== undefined && !CSRF_TOKEN_PATTERN.test(csrfToken)) {
        throw new DomainError("invalid_tenant_csrf_bootstrap", "Tenant CSRF bootstrap token is invalid");
      }
      if (providedSessionHandle !== undefined && !SESSION_HANDLE_PATTERN.test(providedSessionHandle)) {
        throw new DomainError("invalid_tenant_session_bootstrap", "Tenant session bootstrap handle is invalid");
      }
      if (localAgentAccount !== undefined && !EVM_ACCOUNT_PATTERN.test(localAgentAccount)) {
        throw new DomainError(
          "invalid_tenant_agent_account_bootstrap",
          "Tenant local Agent account bootstrap is invalid"
        );
      }
      if (
        workspaceName !== undefined &&
        !WORKSPACE_NAME_PATTERN.test(workspaceName)
      ) {
        throw new DomainError(
          "invalid_tenant_workspace_bootstrap",
          "Tenant workspace bootstrap name is invalid"
        );
      }
      sessionHandle = providedSessionHandle;
      let html = body.toString("utf8");
      if (csrfToken !== undefined) {
        if (html.split(CSRF_META_PLACEHOLDER).length !== 2) {
          throw new DomainError("invalid_tenant_web_asset", "Tenant web shell CSRF placeholder is invalid");
        }
        html = html.replace(
          CSRF_META_PLACEHOLDER,
          `<meta name="ipo-one-csrf-token" content="${csrfToken}" />`
        );
      }
      if (localAgentAccount !== undefined) {
        if (html.split(LOCAL_AGENT_ACCOUNT_META_PLACEHOLDER).length !== 2) {
          throw new DomainError(
            "invalid_tenant_web_asset",
            "Tenant web shell local Agent account placeholder is invalid"
          );
        }
        html = html.replace(
          LOCAL_AGENT_ACCOUNT_META_PLACEHOLDER,
          `<meta name="ipo-one-local-agent-account" content="${localAgentAccount}" />`
        );
      }
      if (workspaceName !== undefined) {
        if (html.split(WORKSPACE_NAME_META_PLACEHOLDER).length !== 2) {
          throw new DomainError(
            "invalid_tenant_web_asset",
            "Tenant web shell workspace placeholder is invalid"
          );
        }
        html = html.replace(
          WORKSPACE_NAME_META_PLACEHOLDER,
          `<meta name="ipo-one-workspace-name" content="${workspaceName}" />`
        );
      }
      body = Buffer.from(html);
    }
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "content-type": asset.contentType,
      "content-length": body.length,
      ...(asset.file === "index.html" ? { vary: "cookie" } : {}),
      ...(sessionHandle === undefined ? {} : {
        "set-cookie": `${SESSION_COOKIE_NAME}=${sessionHandle}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
      }),
      "x-request-id": requestId
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return true;
  };
}
