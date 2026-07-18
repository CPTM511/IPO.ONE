import { readFile } from "node:fs/promises";
import { SESSION_COOKIE_NAME } from "../../../modules/authentication/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const WEB_ASSET_ROOT = new URL("../../web/src/", import.meta.url);
const WEB_ASSETS = Object.freeze({
  "/": Object.freeze({ file: "index.html", contentType: "text/html; charset=utf-8" }),
  "/index.html": Object.freeze({ file: "index.html", contentType: "text/html; charset=utf-8" }),
  "/app.js": Object.freeze({ file: "app.js", contentType: "text/javascript; charset=utf-8" }),
  "/agent-handoff-manifest.js": Object.freeze({ file: "agent-handoff-manifest.js", contentType: "text/javascript; charset=utf-8" }),
  "/agent-pilot-capability-manifest.js": Object.freeze({ file: "agent-pilot-capability-manifest.js", contentType: "text/javascript; charset=utf-8" }),
  "/decision-passport-presentation.js": Object.freeze({ file: "decision-passport-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/human-credit-offer-workflow-receipt.js": Object.freeze({ file: "human-credit-offer-workflow-receipt.js", contentType: "text/javascript; charset=utf-8" }),
  "/human-sandbox-obligation-workflow-receipt.js": Object.freeze({ file: "human-sandbox-obligation-workflow-receipt.js", contentType: "text/javascript; charset=utf-8" }),
  "/servicing-case-presentation.js": Object.freeze({ file: "servicing-case-presentation.js", contentType: "text/javascript; charset=utf-8" }),
  "/styles.css": Object.freeze({ file: "styles.css", contentType: "text/css; charset=utf-8" }),
  "/icons.svg": Object.freeze({ file: "icons.svg", contentType: "image/svg+xml" }),
  "/favicon.svg": Object.freeze({ file: "favicon.svg", contentType: "image/svg+xml" }),
  "/manifest.webmanifest": Object.freeze({ file: "manifest.webmanifest", contentType: "application/manifest+json" })
});
const CSRF_META_PLACEHOLDER = '<meta name="ipo-one-csrf-token" content="" />';
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const SESSION_HANDLE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
});

export function createTenantWebAssetHandler({ csrfTokenProvider, sessionHandleProvider } = {}) {
  if (
    (csrfTokenProvider !== undefined && typeof csrfTokenProvider !== "function") ||
    (sessionHandleProvider !== undefined && typeof sessionHandleProvider !== "function")
  ) {
    throw new DomainError("invalid_tenant_web_config", "Tenant CSRF token provider must be a function");
  }
  return async function serveTenantWebAsset({ request, response, pathname, requestId }) {
    if (!request || !response || typeof pathname !== "string" || typeof requestId !== "string") {
      throw new DomainError("invalid_tenant_web_request", "Tenant web asset request is invalid");
    }
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const asset = WEB_ASSETS[pathname];
    if (!asset) return false;
    let body = await readFile(new URL(asset.file, WEB_ASSET_ROOT));
    let sessionHandle;
    if (asset.file === "index.html" && (csrfTokenProvider || sessionHandleProvider)) {
      const [csrfToken, providedSessionHandle] = await Promise.all([
        csrfTokenProvider?.({ request, requestId }),
        sessionHandleProvider?.({ request, requestId })
      ]);
      if (csrfToken !== undefined && !CSRF_TOKEN_PATTERN.test(csrfToken)) {
        throw new DomainError("invalid_tenant_csrf_bootstrap", "Tenant CSRF bootstrap token is invalid");
      }
      if (providedSessionHandle !== undefined && !SESSION_HANDLE_PATTERN.test(providedSessionHandle)) {
        throw new DomainError("invalid_tenant_session_bootstrap", "Tenant session bootstrap handle is invalid");
      }
      sessionHandle = providedSessionHandle;
      if (csrfToken !== undefined) {
        const html = body.toString("utf8");
        if (html.split(CSRF_META_PLACEHOLDER).length !== 2) {
          throw new DomainError("invalid_tenant_web_asset", "Tenant web shell CSRF placeholder is invalid");
        }
        body = Buffer.from(html.replace(
          CSRF_META_PLACEHOLDER,
          `<meta name="ipo-one-csrf-token" content="${csrfToken}" />`
        ));
      }
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
