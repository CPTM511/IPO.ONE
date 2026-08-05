import { handleVercelSandboxRequest } from "../apps/private-pilot/src/vercel-sandbox-runtime.js";

function unavailable(response, requestId, releaseId) {
  const body = JSON.stringify({
    type: "https://ipo.one/problems/sandbox-runtime-unavailable",
    title: "Sandbox runtime unavailable",
    status: 503,
    detail: "The durable sandbox runtime is not ready.",
    requestId,
    releaseId,
    schemaVersion: "vercel_sandbox_runtime_problem.v1"
  });
  response.writeHead(503, {
    "cache-control": "no-store",
    "content-type": "application/problem+json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "retry-after": "5",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
}

export default async function handler(request, response) {
  try {
    return await handleVercelSandboxRequest(request, response);
  } catch (error) {
    const requestId = globalThis.crypto.randomUUID();
    process.stderr.write(`${JSON.stringify({
      event: "vercel_sandbox_runtime_unavailable",
      code: error?.code ?? "runtime_initialization_failed",
      requestId,
      releaseId: process.env.IPO_ONE_RELEASE_ID ?? "unknown",
      realFundsEnabled: false
    })}\n`);
    return unavailable(
      response,
      requestId,
      process.env.IPO_ONE_RELEASE_ID ?? "unknown"
    );
  }
}
