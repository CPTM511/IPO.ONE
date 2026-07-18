import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runSandboxObligationPortabilityConformance } from "../src/index.js";

const agentObligationFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

test("Agent SDK exposes the local no-network Obligation portability workflow", async () => {
  const workflowReceipt = agentObligationFixtures.valid[0];
  const receipt = await runSandboxObligationPortabilityConformance({ workflowReceipt });
  assert.equal(receipt.entryMode, "agent");
  assert.equal(receipt.sourceReceiptSchemaVersion, workflowReceipt.schemaVersion);
  assert.equal(receipt.obligationId, workflowReceipt.obligation.obligationId);
  assert.equal(receipt.paymentId, workflowReceipt.repayment.repaymentId);
  assert.deepEqual(receipt.profiles.map((profile) => profile.displayName), [
    "Base Sepolia",
    "X Layer Testnet"
  ]);
  assert.equal(receipt.invariants.canonicalPaymentChainNeutral, true);
  assert.equal(receipt.invariants.ledgerReferencesBound, true);
  assert.equal(receipt.networkCallsMade, false);
  assert.equal(receipt.liveTestnetExecution, false);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.privateKeysIncluded, false);
  assert.equal(receipt.fundsAuthority, false);
  assert.equal(Object.isFrozen(receipt), true);
});
