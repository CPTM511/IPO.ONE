import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApiBoundaryError,
  createProblemDetails,
  createRequestId
} from "../../../packages/api-contract/src/index.js";
import { createInteractiveDemo } from "../../../packages/mvp-flow/src/index.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const webDir = join(rootDir, "apps", "web", "src");
const openApiPath = join(rootDir, "api", "openapi", "ipo-one.v1.json");
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 256;
const MAX_JSON_STRING_LENGTH = 2048;
const MAX_REQUEST_TARGET_LENGTH = 2048;
const MAX_SANDBOX_MUTATIONS = 32;
const GLOBAL_REQUESTS_PER_MINUTE = 600;
const MAX_CONCURRENT_REQUESTS = 64;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const browserSecurityHeaders = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'"
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

const sandboxSessions = new Map();
const SANDBOX_SESSION_TTL_MS = 30 * 60 * 1000;
const SANDBOX_SESSION_LIMIT = 128;
const SANDBOX_SESSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const JSON_CONTENT_TYPE_PATTERN = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;.*)?$/i;
const GLOBAL_METHODS = new Set(["GET", "HEAD", "POST"]);
const API_METHODS = new Set(["GET", "POST"]);
const BODY_FIELDS = [
  { pattern: /^\/v1\/agents$/, fields: new Set(["displayName"]) },
  { pattern: /^\/v1\/agents\/[^/]+\/wallet-bindings$/, fields: new Set(["accountId"]) },
  { pattern: /^\/v1\/agents\/[^/]+\/(?:lockbox|credit-line)$/, fields: new Set() },
  { pattern: /^\/v1\/spend-requests$/, fields: new Set(["agentId", "providerId", "amountMinor", "purposeCode"]) },
  { pattern: /^\/v1\/settlements$/, fields: new Set(["spendRequestId"]) },
  { pattern: /^\/v1\/revenue-capture$/, fields: new Set(["agentId", "amountMinor"]) },
  { pattern: /^\/v1\/repayments\/auto$/, fields: new Set(["agentId"]) },
  { pattern: /^\/v1\/credit-learning\/evaluate$/, fields: new Set(["agentId"]) },
  { pattern: /^\/v1\/demo\/cycles\/(?:healthy|risky|recovery)$/, fields: new Set(["agentId"]) },
  { pattern: /^\/v1\/demo\/reset$/, fields: new Set() }
];
const FIELD_LENGTH_LIMITS = new Map([
  ["displayName", 120],
  ["accountId", 200],
  ["agentId", 160],
  ["providerId", 160],
  ["spendRequestId", 160],
  ["amountMinor", 78],
  ["purposeCode", 80]
]);
let globalWindowStartedAt = Date.now();
let globalWindowRequestCount = 0;
let activeRequestCount = 0;

function admitRequest() {
  const now = Date.now();
  if (now - globalWindowStartedAt >= 60_000) {
    globalWindowStartedAt = now;
    globalWindowRequestCount = 0;
  }
  if (globalWindowRequestCount >= GLOBAL_REQUESTS_PER_MINUTE) {
    throw new ApiBoundaryError("global_rate_limit_exceeded", "The sandbox request budget is temporarily exhausted.", {
      status: 429,
      headers: { "retry-after": "60" }
    });
  }
  if (activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
    throw new ApiBoundaryError("server_busy", "The sandbox is processing its maximum concurrent request count.", {
      status: 503,
      headers: { "retry-after": "1" }
    });
  }
  globalWindowRequestCount += 1;
  activeRequestCount += 1;
}

function sandboxSessionId(headers) {
  const supplied = Array.isArray(headers["x-ipo-one-sandbox-session"])
    ? headers["x-ipo-one-sandbox-session"][0]
    : headers["x-ipo-one-sandbox-session"];
  return typeof supplied === "string" && SANDBOX_SESSION_PATTERN.test(supplied)
    ? supplied
    : `sandbox_${randomUUID()}`;
}

function entryForSession(sessionId) {
  const now = Date.now();
  const expiresBefore = now - SANDBOX_SESSION_TTL_MS;
  for (const [id, entry] of sandboxSessions) {
    if (entry.lastSeenAt < expiresBefore) sandboxSessions.delete(id);
  }

  const existing = sandboxSessions.get(sessionId);
  if (existing) {
    existing.lastSeenAt = now;
    sandboxSessions.delete(sessionId);
    sandboxSessions.set(sessionId, existing);
    return existing;
  }

  while (sandboxSessions.size >= SANDBOX_SESSION_LIMIT) {
    sandboxSessions.delete(sandboxSessions.keys().next().value);
  }
  const entry = {
    demo: createInteractiveDemo(),
    lastSeenAt: now,
    mutationCount: 0,
    verticalSliceSummary: undefined,
    queue: Promise.resolve()
  };
  sandboxSessions.set(sessionId, entry);
  return entry;
}

function queueSessionOperation(entry, operation) {
  const pending = entry.queue.then(operation, operation);
  entry.queue = pending.catch(() => undefined);
  return pending;
}

function isMutationPath(pathname) {
  return BODY_FIELDS.some(({ pattern }) => pattern.test(pathname));
}

function consumeMutationBudget(entry, pathname) {
  if (pathname === "/v1/demo/reset") return;
  if (entry.mutationCount >= MAX_SANDBOX_MUTATIONS) {
    throw new ApiBoundaryError(
      "sandbox_mutation_limit_exceeded",
      "This sandbox session reached its mutation budget. Reset the demo or start a new session.",
      { status: 429, headers: { "retry-after": "1" } }
    );
  }
  entry.mutationCount += 1;
}

function responseHeaders(response, headers = {}) {
  return {
    ...browserSecurityHeaders,
    "x-request-id": response.ipoOneRequestId,
    ...(response.ipoOneSandboxSessionId
      ? { "x-ipo-one-sandbox-session": response.ipoOneSandboxSessionId }
      : {}),
    ...headers
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, responseHeaders(response, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  }));
  response.end(body);
}

function sendProblem(response, error) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const problem = createProblemDetails(error, { requestId: response.ipoOneRequestId });
  const body = JSON.stringify(problem, null, 2);
  response.writeHead(problem.status, responseHeaders(response, {
    ...(error instanceof ApiBoundaryError ? error.headers : {}),
    "content-type": "application/problem+json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  }));
  response.end(body);
}

function validateJsonShape(value) {
  let nodes = 0;

  function visit(candidate, depth) {
    nodes += 1;
    if (nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
      throw new ApiBoundaryError("invalid_json_body", "Request JSON exceeds structural limits.");
    }
    if (typeof candidate === "string" && candidate.length > MAX_JSON_STRING_LENGTH) {
      throw new ApiBoundaryError("invalid_json_body", "Request JSON contains an oversized string.");
    }
    if (candidate === null || typeof candidate !== "object") return;

    const entries = Array.isArray(candidate)
      ? candidate.map((nested, index) => [String(index), nested])
      : Object.entries(candidate);
    if (entries.length > 64) {
      throw new ApiBoundaryError("invalid_json_body", "Request JSON contains too many entries.");
    }
    for (const [key, nested] of entries) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new ApiBoundaryError("invalid_json_body", "Request JSON contains a prohibited key.");
      }
      visit(nested, depth + 1);
    }
  }

  visit(value, 0);
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new ApiBoundaryError("invalid_json_body", "Request body must be a JSON object.");
  }
}

function validateRequestFields(pathname, body) {
  const contract = BODY_FIELDS.find(({ pattern }) => pattern.test(pathname));
  if (!contract) return;
  for (const [field, value] of Object.entries(body)) {
    if (!contract.fields.has(field)) {
      throw new ApiBoundaryError("invalid_request_field", `Request field ${field} is not accepted by this operation.`);
    }
    const lengthLimit = FIELD_LENGTH_LIMITS.get(field);
    if (typeof value !== "string" || (lengthLimit && value.length > lengthLimit)) {
      throw new ApiBoundaryError("invalid_request_field", `Request field ${field} has an invalid type or length.`);
    }
  }
}

function assertJsonMediaType(request) {
  const contentType = request.headers["content-type"];
  const contentEncoding = request.headers["content-encoding"];
  if (contentEncoding && String(contentEncoding).toLowerCase() !== "identity") {
    throw new ApiBoundaryError("unsupported_content_encoding", "Compressed request bodies are not accepted.", { status: 415 });
  }
  if (request.headers["transfer-encoding"] && request.headers["content-length"]) {
    throw new ApiBoundaryError("ambiguous_body_framing", "Ambiguous request body framing is not accepted.");
  }
  const hasBody = Boolean(request.headers["transfer-encoding"]) || Number(request.headers["content-length"] ?? 0) > 0;
  if (contentType === undefined && !hasBody) return;
  if (typeof contentType !== "string" || !JSON_CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new ApiBoundaryError("unsupported_media_type", "POST request bodies must use application/json.", { status: 415 });
  }
}

function readJson(request, pathname) {
  assertJsonMediaType(request);
  const contentLength = request.headers["content-length"];
  if (
    contentLength !== undefined &&
    (!/^[0-9]+$/.test(String(contentLength)) || Number(contentLength) > MAX_JSON_BODY_BYTES)
  ) {
    request.resume();
    return Promise.reject(new ApiBoundaryError("payload_too_large", "Request body exceeds 64 KiB."));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bodyBytes = 0;
    let rejected = false;
    request.on("data", (chunk) => {
      if (rejected) return;
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_JSON_BODY_BYTES) {
        rejected = true;
        reject(new ApiBoundaryError("payload_too_large", "Request body exceeds 64 KiB."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        const body = chunks.length === 0
          ? {}
          : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bodyBytes)));
        validateJsonShape(body);
        validateRequestFields(pathname, body);
        resolve(body);
      } catch (error) {
        reject(error instanceof ApiBoundaryError
          ? error
          : new ApiBoundaryError("invalid_json", "Request body must contain valid UTF-8 JSON."));
      }
    });
    request.on("aborted", () => reject(new ApiBoundaryError("invalid_json", "Request body was aborted.")));
    request.on("error", reject);
  });
}

function match(pathname, pattern) {
  const names = [];
  const regex = new RegExp(
    `^${pattern
      .split("/")
      .map((part) => {
        if (part.startsWith(":")) {
          names.push(part.slice(1));
          return "([^/]+)";
        }
        return part;
      })
      .join("/")}$`
  );
  const matched = regex.exec(pathname);
  if (!matched) return undefined;
  try {
    const values = names.map((name, index) => [name, decodeURIComponent(matched[index + 1])]);
    if (values.some(([, value]) => value.length === 0 || value.length > 160)) {
      throw new ApiBoundaryError("invalid_path_parameter", "Path parameter length is invalid.");
    }
    return Object.fromEntries(values);
  } catch {
    throw new ApiBoundaryError("invalid_path_parameter", "Path parameter encoding is invalid.");
  }
}

async function sendFile(request, response, filePath, cacheControl) {
  if (!["GET", "HEAD"].includes(request.method)) {
    sendProblem(response, new ApiBoundaryError("method_not_allowed", "Only GET and HEAD are available for this resource.", { status: 405 }));
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, responseHeaders(response, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "content-length": body.length,
      "cache-control": cacheControl
    }));
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    sendProblem(response, new ApiBoundaryError("not_found", "Static resource was not found.", { status: 404 }));
  }
}

async function sendStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requested).replace(/^[/\\]+/, "").replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(webDir, normalized);
  const relativePath = relative(webDir, filePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    sendProblem(response, new ApiBoundaryError("path_forbidden", "Requested path is not available.", { status: 403 }));
    return;
  }
  const cacheControl = extname(filePath) === ".html"
    ? "no-store"
    : "public, max-age=0, must-revalidate";
  await sendFile(request, response, filePath, cacheControl);
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const demo = request.ipoOneDemo;

  if (request.method === "GET" && pathname === "/healthz") {
    sendJson(response, 200, { ok: true, service: "ipo-one-api", mode: "public-beta-sandbox" });
    return;
  }

  if (request.method === "GET" && pathname === "/v1/demo/state") {
    sendJson(response, 200, await demo.getStatus());
    return;
  }

  const body = request.ipoOneBody ?? {};

  if (request.method === "POST" && pathname === "/v1/agents") {
    sendJson(response, 201, await demo.createAgent(body));
    return;
  }

  let params = match(pathname, "/v1/agents/:id/wallet-bindings");
  if (request.method === "POST" && params) {
    sendJson(response, 200, await demo.bindWallet(params.id, body));
    return;
  }

  params = match(pathname, "/v1/agents/:id/lockbox");
  if (request.method === "POST" && params) {
    sendJson(response, 200, await demo.createLockbox(params.id));
    return;
  }

  params = match(pathname, "/v1/agents/:id/credit-line");
  if (request.method === "POST" && params) {
    sendJson(response, 200, await demo.requestCreditLine(params.id));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/spend-requests") {
    sendJson(response, 200, await demo.submitSpendRequest(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/settlements") {
    sendJson(response, 200, await demo.recordSettlement(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/revenue-capture") {
    sendJson(response, 200, await demo.captureRevenue(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/repayments/auto") {
    sendJson(response, 200, await demo.autoRepay(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/credit-learning/evaluate") {
    sendJson(response, 200, await demo.evaluateCreditLearning(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/cycles/healthy") {
    sendJson(response, 200, await demo.runCycle("healthy", body.agentId));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/cycles/risky") {
    sendJson(response, 200, await demo.runCycle("risky", body.agentId));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/cycles/recovery") {
    sendJson(response, 200, await demo.runCycle("recovery", body.agentId));
    return;
  }

  params = match(pathname, "/v1/agents/:id/status");
  if (request.method === "GET" && params) {
    sendJson(response, 200, await demo.getStatus(params.id));
    return;
  }

  params = match(pathname, "/v1/agents/:id/credit-profile");
  if (request.method === "GET" && params) {
    sendJson(response, 200, demo.getCreditProfile(params.id));
    return;
  }

  if (request.method === "GET" && pathname === "/v1/admin/audit") {
    sendJson(response, 200, demo.getAudit());
    return;
  }

  if (request.method === "GET" && pathname === "/v1/rails") {
    sendJson(response, 200, { rails: demo.getRails() });
    return;
  }

  params = match(pathname, "/v1/transfer-intents/:id");
  if (request.method === "GET" && params) {
    sendJson(response, 200, await demo.getTransferIntent(params.id));
    return;
  }

  if (request.method === "GET" && pathname === "/v1/demo/vertical-slice") {
    const summary = request.ipoOneSessionEntry.verticalSliceSummary ?? await demo.runVerticalSlice();
    request.ipoOneSessionEntry.verticalSliceSummary = summary;
    sendJson(response, 200, {
      subjectId: summary.subject.subjectId,
      mandateStatus: summary.mandate.status,
      spendRequestStatus: summary.spendRequest.status,
      obligationStatus: summary.obligation.status,
      outstandingMinor: summary.obligation.outstandingPrincipalMinor,
      creditLineUtilizedMinor: summary.creditLine.utilizedMinor,
      productionFundsMoved: summary.paymentInstruction.productionFundsMoved,
      railId: summary.transferIntent.railId,
      transferIntentStatus: summary.transferIntent.status,
      settlementFinality: summary.settlementReceipt.finality,
      railReplayable: summary.railReplayProof.replayable,
      ledgerBalanced: summary.ledger.integrity.balanced,
      ledgerTransactionCount: summary.ledger.transactionCount,
      evidenceEnvelopeCount: summary.evidenceEnvelopeCount,
      adminExposure: summary.adminExposure,
      timelineEvents: summary.adminTimeline.length
    });
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/reset") {
    const payload = await demo.reset();
    request.ipoOneSessionEntry.mutationCount = 0;
    request.ipoOneSessionEntry.verticalSliceSummary = undefined;
    sendJson(response, 200, payload);
    return;
  }

  sendProblem(response, new ApiBoundaryError("not_found", "API route was not found.", { status: 404 }));
}

const server = createServer({
  insecureHTTPParser: false,
  maxHeaderSize: 16 * 1024,
  rejectNonStandardBodyWrites: true
}, async (request, response) => {
  response.ipoOneRequestId = createRequestId(request.headers);
  let admitted = false;
  try {
    admitRequest();
    admitted = true;
    if (
      typeof request.url !== "string" ||
      !request.url.startsWith("/") ||
      request.url.startsWith("//") ||
      request.url.includes("\\") ||
      request.url.includes("#") ||
      request.url.length > MAX_REQUEST_TARGET_LENGTH
    ) {
      throw new ApiBoundaryError(
        request.url?.length > MAX_REQUEST_TARGET_LENGTH ? "uri_too_long" : "invalid_request_target",
        request.url?.length > MAX_REQUEST_TARGET_LENGTH
          ? "Request target exceeds 2048 characters."
          : "Request target must use origin form."
      );
    }
    const url = new URL(request.url, "http://ipo.one.local");
    const isApiResource = url.pathname === "/healthz" || url.pathname.startsWith("/v1/");
    if (isApiResource) {
      if (!API_METHODS.has(request.method)) {
        throw new ApiBoundaryError("method_not_allowed", "Only GET and POST are available for API resources.", {
          status: 405,
          headers: { allow: "GET, POST" }
        });
      }
    } else if (!GLOBAL_METHODS.has(request.method)) {
      throw new ApiBoundaryError("method_not_allowed", "This HTTP method is not available.", {
        status: 405,
        headers: { allow: "GET, HEAD, POST" }
      });
    }
    if (isApiResource) {
      response.ipoOneSandboxSessionId = sandboxSessionId(request.headers);
      if (url.pathname.startsWith("/v1/")) {
        request.ipoOneSessionEntry = entryForSession(response.ipoOneSandboxSessionId);
        request.ipoOneDemo = request.ipoOneSessionEntry.demo;
      }
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204, responseHeaders(response, {
        "cache-control": "public, max-age=86400",
      }));
      response.end();
      return;
    }
    if (url.pathname === "/openapi.json") {
      await sendFile(request, response, openApiPath, "public, max-age=0, must-revalidate");
      return;
    }
    if (url.pathname === "/healthz" || url.pathname.startsWith("/v1/")) {
      if (request.method === "POST") {
        request.ipoOneBody = await readJson(request, url.pathname);
      }
      if (request.ipoOneSessionEntry) {
        await queueSessionOperation(request.ipoOneSessionEntry, async () => {
          if (request.method === "POST" && isMutationPath(url.pathname)) {
            consumeMutationBudget(request.ipoOneSessionEntry, url.pathname);
          }
          await handleApi(request, response, url);
        });
      } else {
        await handleApi(request, response, url);
      }
      return;
    }
    await sendStatic(request, response, url.pathname);
  } catch (error) {
    sendProblem(response, error);
  } finally {
    if (admitted) activeRequestCount -= 1;
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.timeout = 20_000;
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 100;
server.maxConnections = 256;

server.on("clientError", (error, socket) => {
  if (!socket.writable) return;
  const status = error?.code === "HPE_HEADER_OVERFLOW"
    ? "431 Request Header Fields Too Large"
    : "400 Bad Request";
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
});

function shutdown() {
  server.closeIdleConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

server.listen(port, host, () => {
  console.log(`IPO.ONE public-beta control plane listening on http://${host}:${port}`);
});
