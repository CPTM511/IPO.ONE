import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public MVP UI includes all required screens and route calls", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  for (const label of [
    "Agent Setup",
    "Lockbox",
    "Credit Line",
    "Provider Spend",
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
    "/v1/demo/reset"
  ]) {
    assert.ok(js.includes(route), `${route} call missing`);
  }

  assert.ok(html.includes("No real lending"));
  assert.ok(html.includes("No real funds"));
});
