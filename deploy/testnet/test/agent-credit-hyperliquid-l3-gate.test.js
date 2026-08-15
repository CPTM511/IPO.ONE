import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createAgentCreditHyperliquidL3Preparation,
  revalidateAgentCreditHyperliquidL3Preparation,
  evaluateAgentCreditHyperliquidL3Gate
} from "../agent-credit-hyperliquid-l3-gate.mjs";
import { runAgentCreditHyperliquidL3Cli } from "../agent-credit-hyperliquid-l3.mjs";

const RUN_ID = "agent-credit-exec-001-l3-new-signer-001";
const ENVIRONMENT = {
  IPO_ONE_EXECUTION_VENUE: "hyperliquid",
  IPO_ONE_EXECUTION_ENVIRONMENT: "testnet",
  IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN:
    "https://api.hyperliquid-testnet.xyz"
};
const BASE = {
  ...ENVIRONMENT,
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
const BINDING = {
  authorizationVersion: "agent_credit_authorization.v1",
  expiresAt: "2026-08-15T00:00:00.000Z",
  facilityId: "agent_credit_facility_security_001",
  market: "BTC",
  maximumLeverage: 1,
  maximumNotionalUsd: "12",
  obligationId: "agent_credit_obligation_security_001",
  policyVersion: "agent_credit_hyperliquid_testnet.v2"
};
const NO_EFFECT_KEYS = [
  "signatureCreated",
  "adapterInvoked",
  "externalExecution",
  "economicMutation",
  "authorityExpanded",
  "silentRetry"
];

test("preflight blocks missing environment authority and remains no-write", () => {
  const lines = [];
  const output = runAgentCreditHyperliquidL3Cli({
    operation: "preflight",
    env: {},
    write: (line) => lines.push(line)
  });
  assert.equal(output.exitCode, 1);
  assert.equal(output.result.approved, false);
  assert.equal(output.result.externalRequestPerformed, false);
  assert.equal(output.result.mainnetInteraction, false);
  assert.equal(output.result.realFundsMoved, false);
  assert.equal(lines.length, 1);
});

test("preflight accepts only the explicit exact Testnet environment", () => {
  const output = runAgentCreditHyperliquidL3Cli({
    operation: "preflight",
    env: ENVIRONMENT,
    write: () => {}
  });
  assert.equal(output.exitCode, 0);
  assert.equal(output.result.status, "READY_FOR_L3_APPROVAL");
  assert.equal(output.result.externalRequestPerformed, false);
  assert.equal(output.result.mainnetInteraction, false);
  assert.equal(output.result.realFundsMoved, false);
});

test("missing, empty, wrong, ambiguous, mainnet, and malformed environments deny", () => {
  const mutations = [
    { IPO_ONE_EXECUTION_VENUE: undefined },
    { IPO_ONE_EXECUTION_ENVIRONMENT: undefined },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: undefined },
    {
      IPO_ONE_EXECUTION_VENUE: undefined,
      IPO_ONE_EXECUTION_ENVIRONMENT: undefined,
      IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: undefined
    },
    { IPO_ONE_EXECUTION_VENUE: "" },
    { IPO_ONE_EXECUTION_ENVIRONMENT: "" },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "" },
    { IPO_ONE_EXECUTION_VENUE: "other" },
    { IPO_ONE_EXECUTION_ENVIRONMENT: "unknown" },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "https://api.hyperliquid.xyz" },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "https://unknown.invalid" },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "not-a-url" },
    { IPO_ONE_EXECUTION_VENUE: "Hyperliquid" },
    { IPO_ONE_EXECUTION_ENVIRONMENT: "TESTNET" },
    {
      IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN:
        "https://api.hyperliquid-testnet.xyz/"
    }
  ];
  for (const mutation of mutations) {
    const result = evaluateAgentCreditHyperliquidL3Gate({
      operation: "preflight",
      env: { ...ENVIRONMENT, ...mutation }
    });
    assert.equal(result.approved, false, JSON.stringify(mutation));
    assert.equal(result.externalRequestPerformed, false);
  }
});

test("missing/wrong approval, CI, action, account, and signer deny", () => {
  const mutations = [
    { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: undefined },
    { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: "wrong-run-id-000" },
    { CI: "true" },
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

test("preparation binds exact environment authority into hash and idempotency identity", () => {
  const preparation = createAgentCreditHyperliquidL3Preparation({
    binding: BINDING,
    env: BASE
  });
  assert.equal(preparation.venue, "hyperliquid");
  assert.equal(preparation.environment, "testnet");
  assert.equal(preparation.origin, "https://api.hyperliquid-testnet.xyz");
  assert.equal(preparation.account, BASE.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS);
  assert.equal(preparation.action, "order");
  assert.equal(preparation.maximumNotionalUsd, "12");
  assert.equal(preparation.policyVersion, "agent_credit_hyperliquid_testnet.v2");
  assert.equal(preparation.environmentAuthoritySource, "server_operator_configuration");
  assert.equal(preparation.callerEnvironmentAuthorityAccepted, false);
  assert.match(preparation.preparationHash, /^0x[0-9a-f]{64}$/);
  assert.match(preparation.idempotencyIdentity, /^0x[0-9a-f]{64}$/);

  const {
    preparationId: _preparationId,
    preparationHash: _preparationHash,
    idempotencyIdentity: _idempotencyIdentity,
    environmentAuthoritySource: _source,
    callerEnvironmentAuthorityAccepted: _callerAccepted,
    externalRequestPerformed: _externalRequestPerformed,
    schemaVersion: _schemaVersion,
    ...core
  } = preparation;
  assert.notEqual(
    hashId("agent_credit_hyperliquid_l3_preparation", {
      ...core,
      origin: "https://api.hyperliquid.xyz"
    }),
    preparation.preparationHash
  );
  assert.throws(
    () => createAgentCreditHyperliquidL3Preparation({
      binding: { ...BINDING, origin: "https://api.hyperliquid.xyz" },
      env: BASE
    }),
    /preparation_binding_invalid/
  );
});

test("environment drift after preparation denies before every side effect", () => {
  const preparation = createAgentCreditHyperliquidL3Preparation({
    binding: BINDING,
    env: BASE
  });
  const drifts = [
    { IPO_ONE_EXECUTION_ENVIRONMENT: "mainnet" },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "https://api.hyperliquid.xyz" },
    { IPO_ONE_EXECUTION_VENUE: "other" },
    { IPO_ONE_EXECUTION_ENVIRONMENT: undefined },
    { IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: undefined }
  ];
  for (const drift of drifts) {
    const result = revalidateAgentCreditHyperliquidL3Preparation({
      binding: BINDING,
      env: { ...BASE, ...drift },
      preparation
    });
    assert.equal(result.approved, false, JSON.stringify(drift));
    assert.equal(result.reasonCode, "EXECUTION_ENVIRONMENT_DRIFT");
    assert.equal(result.requiresNewPreparation, true);
    for (const key of NO_EFFECT_KEYS) assert.equal(result[key], false, key);
  }
});

test("account, action, authorization, and policy drift require a new preparation", () => {
  const preparation = createAgentCreditHyperliquidL3Preparation({
    binding: BINDING,
    env: BASE
  });
  const mutations = [
    { env: { ...BASE, IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS: "0x3333333333333333333333333333333333333333" }, binding: BINDING },
    { env: { ...BASE, IPO_ONE_HYPERLIQUID_ACTION: "cancel" }, binding: BINDING },
    { env: BASE, binding: { ...BINDING, authorizationVersion: "changed_authorization.v2" } },
    { env: BASE, binding: { ...BINDING, policyVersion: "changed_policy.v2" } }
  ];
  for (const mutation of mutations) {
    const result = revalidateAgentCreditHyperliquidL3Preparation({
      ...mutation,
      preparation
    });
    assert.equal(result.approved, false);
    assert.equal(result.reasonCode, "EXECUTION_PREPARATION_DRIFT");
    assert.equal(result.requiresNewPreparation, true);
    for (const key of NO_EFFECT_KEYS) assert.equal(result[key], false, key);
  }
});

test("exact unchanged preparation revalidates without creating any side effect", () => {
  const preparation = createAgentCreditHyperliquidL3Preparation({
    binding: BINDING,
    env: BASE
  });
  const result = revalidateAgentCreditHyperliquidL3Preparation({
    binding: BINDING,
    env: BASE,
    preparation
  });
  assert.equal(result.approved, true);
  assert.equal(result.requiresNewPreparation, false);
  for (const key of NO_EFFECT_KEYS) assert.equal(result[key], false, key);
});
