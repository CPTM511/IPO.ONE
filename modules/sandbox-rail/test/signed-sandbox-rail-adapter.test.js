import assert from "node:assert/strict";
import test from "node:test";
import { SignedSandboxRailAdapter } from "../src/index.js";

const REQUEST = Object.freeze({
  obligationId: "obligation_sandbox_test",
  assetId: "urn:ipo-one:sandbox-asset:usd-cent",
  amountMinor: "10000",
  requestId: "request-sandbox-0001",
  correlationId: "correlation-sandbox-0001",
  issuedAt: "2026-07-16T00:00:00.000Z"
});

test("signed sandbox rail receipt is exact, non-redeemable, and verifiable", async () => {
  const adapter = new SignedSandboxRailAdapter();
  const receipt = await adapter.execute(REQUEST);
  assert.equal(adapter.verify(receipt, REQUEST), true);
  assert.equal(receipt.sandboxOnly, true);
  assert.equal(receipt.productionFundsMoved, false);
  assert.equal(receipt.withdrawable, false);
});

test("signed sandbox rail rejects amount, correlation, and signature mutation", async () => {
  const adapter = new SignedSandboxRailAdapter();
  const receipt = await adapter.execute(REQUEST);
  for (const mutation of [
    { ...receipt, amountMinor: "9999" },
    { ...receipt, correlationId: "correlation-sandbox-wrong" },
    { ...receipt, signature: `${receipt.signature.slice(0, -2)}aa` }
  ]) {
    assert.throws(
      () => adapter.verify(mutation, REQUEST),
      (error) => error.code === "sandbox_rail_unavailable"
    );
  }
});
