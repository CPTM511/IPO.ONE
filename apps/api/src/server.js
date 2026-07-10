import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createInteractiveDemo } from "../../../packages/mvp-flow/src/index.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const demo = createInteractiveDemo();
const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const webDir = join(rootDir, "apps", "web", "src");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
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
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(matched[index + 1])]));
}

async function sendStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requested).replace(/^[/\\]+/, "").replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(webDir, normalized);
  if (!filePath.startsWith(webDir)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "content-length": body.length
    });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "not_found" });
  }
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { ok: true, service: "ipo-one-api", mode: "interactive-public-mvp" });
    return;
  }

  const body = request.method === "POST" ? await readJson(request) : {};

  if (request.method === "POST" && pathname === "/v1/agents") {
    sendJson(response, 201, demo.createAgent(body));
    return;
  }

  let params = match(pathname, "/v1/agents/:id/wallet-bindings");
  if (request.method === "POST" && params) {
    sendJson(response, 200, demo.bindWallet(params.id, body));
    return;
  }

  params = match(pathname, "/v1/agents/:id/lockbox");
  if (request.method === "POST" && params) {
    sendJson(response, 200, demo.createLockbox(params.id));
    return;
  }

  params = match(pathname, "/v1/agents/:id/credit-line");
  if (request.method === "POST" && params) {
    sendJson(response, 200, demo.requestCreditLine(params.id));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/spend-requests") {
    sendJson(response, 200, demo.submitSpendRequest(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/settlements") {
    sendJson(response, 200, demo.recordSettlement(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/revenue-capture") {
    sendJson(response, 200, demo.captureRevenue(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/repayments/auto") {
    sendJson(response, 200, demo.autoRepay(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/credit-learning/evaluate") {
    sendJson(response, 200, demo.evaluateCreditLearning(body));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/cycles/healthy") {
    sendJson(response, 200, demo.runCycle("healthy", body.agentId));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/cycles/risky") {
    sendJson(response, 200, demo.runCycle("risky", body.agentId));
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/cycles/recovery") {
    sendJson(response, 200, demo.runCycle("recovery", body.agentId));
    return;
  }

  params = match(pathname, "/v1/agents/:id/status");
  if (request.method === "GET" && params) {
    sendJson(response, 200, demo.getStatus(params.id));
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

  if (request.method === "GET" && pathname === "/v1/demo/vertical-slice") {
    const summary = demo.runVerticalSlice();
    sendJson(response, 200, {
      subjectId: summary.subject.subjectId,
      spendRequestStatus: summary.spendRequest.status,
      obligationStatus: summary.obligation.status,
      outstandingMinor: summary.obligation.outstandingPrincipalMinor,
      creditLineUtilizedMinor: summary.creditLine.utilizedMinor,
      productionFundsMoved: summary.paymentInstruction.productionFundsMoved,
      adminExposure: summary.adminExposure,
      timelineEvents: summary.adminTimeline.length
    });
    return;
  }

  if (request.method === "POST" && pathname === "/v1/demo/reset") {
    sendJson(response, 200, demo.reset());
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? `${host}:${port}`}`);
  try {
    if (url.pathname === "/healthz" || url.pathname.startsWith("/v1/")) {
      await handleApi(request, response, url);
      return;
    }
    await sendStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 400, { error: "request_failed", message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`IPO.ONE interactive MVP listening on http://${host}:${port}`);
});
