import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAgentCreditHyperliquidL3Gate
} from "../agent-credit-hyperliquid-l3-gate.mjs";
import { runAgentCreditHyperliquidL3Cli } from "../agent-credit-hyperliquid-l3.mjs";

const RUN_ID = "agent-credit-exec-001-l3-new-signer-001";
const BASE = {
  IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID: RUN_ID,
  IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: RUN_ID,
  IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS:
    "0x1111111111111111111111111111111111111111",
  IPO_ONE_HYPERLIQUID_TESTNET_API_WALLET_ADDRESS:
    "0x2222222222222222222222222222222222222222",
  IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE:
    "isolated:agent-credit:new-signer-001",
  IPO_ONE_HYPERLIQUID_ACTION: "order"
};

test("preflight is CI-safe, no-write, and ready for a separate L3 approval", () => {
  const lines = [];
  const output = runAgentCreditHyperliquidL3Cli({
    operation: "preflight",
    env: {},
    write: (line) => lines.push(line)
  });
  assert.equal(output.exitCode, 0);
  assert.equal(output.result.status, "READY_FOR_L3_APPROVAL");
  assert.equal(output.result.externalRequestPerformed, false);
  assert.equal(output.result.mainnetInteraction, false);
  assert.equal(lines.length, 1);
});

test("missing/wrong approval, CI, mainnet, venue, action, account, and signer deny", () => {
  const mutations = [
    { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: undefined },
    { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: "wrong-run-id-000" },
    { CI: "true" },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "https://api.hyperliquid.xyz" },
    { IPO_ONE_EXECUTION_VENUE: "unknown" },
    { IPO_ONE_HYPERLIQUID_ACTION: "withdraw3" },
    { IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS: undefined },
    { IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE: undefined },
    { IPO_ONE_HYPERLIQUID_PRIVATE_KEY: "must-not-enter" }
  ];
  for (const mutation of mutations) {
    const env = { ...BASE, ...mutation };
    const result = evaluateAgentCreditHyperliquidL3Gate({
      operation: "run-once",
      env
    });
    assert.equal(result.approved, false);
    assert.equal(result.externalRequestPerformed, false);
  }
});

test("exact run approval still stops before network without reviewed action handoff", () => {
  const output = runAgentCreditHyperliquidL3Cli({
    operation: "run-once",
    env: BASE,
    write: () => {}
  });
  assert.equal(output.exitCode, 1);
  assert.equal(output.result.status, "BLOCKED");
  assert.equal(output.result.externalRequestPerformed, false);
  assert.equal(
    output.result.blocker,
    "reviewed_action_artifact_and_isolated_signer_handoff_required"
  );
});

test("emergency-close permits only restrictive cancellation actions", () => {
  for (const action of ["cancel", "cancelByCloid", "scheduleCancel"]) {
    const result = evaluateAgentCreditHyperliquidL3Gate({
      operation: "emergency-close",
      env: { ...BASE, IPO_ONE_HYPERLIQUID_ACTION: action }
    });
    assert.equal(result.approved, true);
  }
  assert.equal(evaluateAgentCreditHyperliquidL3Gate({
    operation: "emergency-close",
    env: BASE
  }).approved, false);
});
