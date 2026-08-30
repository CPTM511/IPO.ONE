import assert from "node:assert/strict";

function exactOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) throw new Error("IPO_ONE_SMOKE_ORIGIN must be an exact HTTPS origin");
  return url.origin;
}

const origin = exactOrigin(process.env.IPO_ONE_SMOKE_ORIGIN);
const releaseId = process.env.IPO_ONE_SMOKE_RELEASE_ID;
assert.match(releaseId ?? "", /^[0-9a-f]{40}$/);

async function json(path, expectedStatus) {
  const response = await fetch(`${origin}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, `${path} returned ${response.status}`);
  return body;
}

const live = await json("/livez", 200);
assert.equal(live.status, "alive");
assert.equal(live.releaseId, releaseId);

const ready = await json("/readyz", 200);
assert.equal(ready.status, "ready");
assert.equal(ready.releaseId, releaseId);
assert.equal(ready.realFundsEnabled, false);

const auth = await json("/auth/v1/options", 200);
assert.equal(auth.profile, "public_authenticated_no_funds_beta");
assert.equal(auth.walletAuthentication, true);

const cron = await json("/api/cron", 401);
assert.equal(cron.status, "unauthorized");

process.stdout.write(`${JSON.stringify({
  schemaVersion: "ipo.one.vercel-sandbox-smoke/v1",
  status: "passed",
  origin,
  releaseId,
  checks: ["liveness", "readiness", "wallet_auth_options", "cron_rejects_unauthenticated"],
  realFundsEnabled: false
})}\n`);
