import assert from "node:assert/strict";
import test from "node:test";
import { createLocalProductCapability } from "../src/local-product-capability.js";

const input = {
  releaseId: "a".repeat(40), anchorConfigured: false,
  syntheticMeteredResource: {
    status: "AVAILABLE", syntheticOnly: true,
    productionFundsMoved: false, externalProviderExecutionEnabled: false
  }
};
test("local M3 capability names the sealed review without claiming hosted or chain execution", () => {
  const result = createLocalProductCapability(input);
  assert.equal(result.deployment.hostingStatus, "LOCAL_REVIEW");
  assert.equal(result.chainEvidence.releaseId, input.releaseId);
  assert.equal(result.chainEvidence.status, "DISABLED");
  for (const change of [
    {releaseId: undefined}, {anchorConfigured: true},
    {syntheticMeteredResource: {...input.syntheticMeteredResource, productionFundsMoved: true}},
    {syntheticMeteredResource: {...input.syntheticMeteredResource, externalProviderExecutionEnabled: true}}
  ]) assert.throws(() => createLocalProductCapability({...input, ...change}),
    (error) => error.code === "invalid_local_product_capability");
});
