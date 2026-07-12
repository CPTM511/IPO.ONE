import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public beta control plane includes required workflows and launch safeguards", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const icons = await readFile(new URL("../src/icons.svg", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../src/manifest.webmanifest", import.meta.url), "utf8"));

  for (const label of [
    "Agent Setup",
    "Lockbox",
    "Credit Line",
    "Provider Spend",
    "Settlement finality",
    "Revenue Capture & Repayment",
    "Credit Learning Dashboard",
    "Admin Dashboard"
  ]) {
    assert.ok(html.includes(label), `${label} screen missing`);
  }

  for (const route of [
    "/v1/agents",
    "/v1/spend-requests",
    "/v1/settlements",
    "/v1/revenue-capture",
    "/v1/repayments/auto",
    "/v1/credit-learning/evaluate",
    "/v1/demo/cycles/healthy",
    "/v1/demo/cycles/risky",
    "/v1/demo/cycles/recovery",
    "/v1/demo/state",
    "/v1/demo/reset"
  ]) {
    assert.ok(js.includes(route), `${route} call missing`);
  }

  for (const label of [
    "No real lending",
    "No real funds",
    "Human Operator",
    "Agent Runtime",
    "21 operations",
    "Run verified flow",
    "Mandate scope",
    "Ledger integrity",
    "Plugin Contracts",
    "Evidence Stream",
    "Rail Contracts",
    "Event replay"
  ]) {
    assert.ok(html.includes(label), `${label} boundary or surface missing`);
  }

  for (const view of ["overview", "agent", "credit", "transfers", "evidence", "risk", "developer"]) {
    assert.ok(html.includes(`data-view-panel="${view}"`), `${view} view missing`);
  }

  for (const control of [
    "runFullFlowBtn",
    "createAgentBtn",
    "bindWalletBtn",
    "createLockboxBtn",
    "requestCreditBtn",
    "submitSpendBtn",
    "recordSettlementBtn",
    "captureRevenueBtn",
    "autoRepayBtn",
    "resetBtn"
  ]) {
    assert.ok(html.includes(`id="${control}"`), `${control} control missing`);
  }

  for (const id of ["railName", "transferStatus", "settlementFinality", "railReplayStatus", "railList"]) {
    assert.ok(js.includes(`el("${id}")`), `${id} renderer missing`);
  }

  assert.ok(html.includes("class=\"skip-link\""));
  assert.ok(html.includes("aria-controls=\"sidebar\""));
  assert.ok(html.includes("aria-expanded=\"false\""));
  assert.ok(html.includes("id=\"mainShell\""));
  assert.ok(html.includes("aria-live=\"polite\""));
  assert.ok(html.includes("rel=\"manifest\""));
  assert.ok(html.includes("rel=\"icon\""));
  assert.ok(html.includes("/icons.svg#"));
  assert.ok(icons.includes("id=\"layout-dashboard\""));
  assert.ok(icons.includes("id=\"shield-check\""));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.ok(css.includes("@media (max-width: 640px)"));
  assert.equal(/<script[^>]+https?:\/\//.test(html), false, "runtime scripts must remain same-origin");
  assert.ok(js.includes("toggleAttribute(\"inert\""));
  assert.ok(js.includes("mainShell\").toggleAttribute(\"inert\""));
  assert.ok(js.includes("event.key === \"Escape\""));
  assert.ok(js.includes("x-ipo-one-sandbox-session"));
  assert.ok(js.includes("sessionStorage.getItem"));
  assert.ok(js.includes("baseUrl: ${JSON.stringify(window.location.origin)}"));
  assert.equal(html.includes("baseUrl: \"http://127.0.0.1:3000\""), false);
  assert.equal(js.includes(".innerHTML"), false, "API-controlled values must use text-safe DOM rendering");
});

test("public beta launch configuration is bounded and supply-chain pinned", async () => {
  const server = await readFile(new URL("../../api/src/server.js", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../../.github/workflows/quality.yml", import.meta.url), "utf8");

  for (const header of [
    "content-security-policy",
    "cross-origin-opener-policy",
    "permissions-policy",
    "x-content-type-options",
    "x-frame-options"
  ]) {
    assert.ok(server.includes(`\"${header}\"`), `${header} is missing from the live server`);
  }
  assert.ok(server.includes("SANDBOX_SESSION_TTL_MS = 30 * 60 * 1000"));
  assert.ok(server.includes("SANDBOX_SESSION_LIMIT = 128"));
  assert.ok(server.includes("MAX_SANDBOX_MUTATIONS = 32"));
  assert.ok(server.includes("MAX_JSON_BODY_BYTES = 64 * 1024"));
  assert.ok(server.includes("GLOBAL_REQUESTS_PER_MINUTE = 600"));
  assert.ok(server.includes("MAX_CONCURRENT_REQUESTS = 64"));
  assert.ok(server.includes("server.requestTimeout = 15_000"));
  assert.ok(server.includes("server.maxHeadersCount = 100"));
  assert.ok(server.includes("server.maxConnections = 256"));
  assert.ok(server.includes("x-ipo-one-sandbox-session"));
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(workflow, /pnpm\/action-setup@[a-f0-9]{40}/);
  assert.equal(/uses:\s+[^\s]+@v\d/.test(workflow), false, "CI actions must be pinned to immutable SHAs");
  assert.ok(workflow.includes("pnpm run test:postgres"));
  assert.ok(workflow.includes("pnpm run test:security"));
  assert.ok(workflow.includes("pnpm run smoke:api"));
  assert.ok(workflow.includes("pnpm audit --prod"));
});
