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
const PROVIDER_REQUEST = Object.freeze({
  ...REQUEST,
  providerId: "provider_gateway_compute",
  providerCategory: "compute",
  purposeCode: "compute"
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

test("signed sandbox rail binds the exact allowlisted Provider and purpose", async () => {
  const adapter = new SignedSandboxRailAdapter();
  const receipt = await adapter.execute(PROVIDER_REQUEST);
  assert.equal(receipt.providerId, PROVIDER_REQUEST.providerId);
  assert.equal(receipt.providerCategory, PROVIDER_REQUEST.providerCategory);
  assert.equal(receipt.purposeCode, PROVIDER_REQUEST.purposeCode);
  assert.equal(adapter.verify(receipt, PROVIDER_REQUEST), true);
  for (const expected of [
    { ...PROVIDER_REQUEST, providerId: "provider_unknown" },
    { ...PROVIDER_REQUEST, providerCategory: "unrestricted" },
    { ...PROVIDER_REQUEST, purposeCode: "unrestricted_transfer" }
  ]) {
    assert.throws(
      () => adapter.verify(receipt, expected),
      (error) => error.code === "sandbox_rail_unavailable"
    );
  }
  for (const mutation of [
    { ...receipt, providerId: "provider_unknown" },
    { ...receipt, providerCategory: "unrestricted" },
    { ...receipt, purposeCode: "unrestricted_transfer" }
  ]) {
    assert.throws(
      () => adapter.verify(mutation, PROVIDER_REQUEST),
      (error) => error.code === "sandbox_rail_unavailable"
    );
  }
});
