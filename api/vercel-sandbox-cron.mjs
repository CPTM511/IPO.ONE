import { timingSafeEqual } from "node:crypto";
import { runVercelSandboxCronCycle } from "../apps/private-pilot/src/vercel-sandbox-cron.js";

function authorized(actual, secret) {
  if (
    typeof actual !== "string" ||
    typeof secret !== "string" ||
    secret.length < 16 ||
    secret.length > 256
  ) return false;
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

export default async function handler(request, response) {
  if (!new Set(["GET", "POST"]).has(request.method)) {
    response.setHeader("allow", "GET, POST");
    return json(response, 405, { status: "method_not_allowed" });
  }
  if (!authorized(request.headers.authorization, process.env.CRON_SECRET)) {
    return json(response, 401, { status: "unauthorized" });
  }
  try {
    const result = await runVercelSandboxCronCycle();
    process.stdout.write(`${JSON.stringify({
      event: "vercel_sandbox_cron_completed",
      trigger: request.headers["user-agent"] === "vercel-cron/1.0"
        ? "vercel_cron"
        : "authenticated_recovery",
      ...result
    })}\n`);
    return json(response, 200, result);
  } catch (error) {
    const failureId = globalThis.crypto.randomUUID();
    process.stderr.write(`${JSON.stringify({
      event: "vercel_sandbox_cron_failed",
      code: error?.code ?? "cron_cycle_failed",
      failureId,
      releaseId: process.env.IPO_ONE_RELEASE_ID ?? "unknown",
      realFundsEnabled: false
    })}\n`);
    return json(response, 503, {
      status: "unavailable",
      failureId,
      releaseId: process.env.IPO_ONE_RELEASE_ID ?? "unknown",
      realFundsEnabled: false
    });
  }
}
