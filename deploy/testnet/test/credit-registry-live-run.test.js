import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertCreditRegistryGasCap,
  buildSyntheticCreditRegistryLifecycle,
  readCreditRegistryRuntimeInput
} from "../run-credit-registry-once.mjs";

const validEnvironment = Object.freeze({
  IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY: "CHAIN-001D",
  IPO_ONE_TESTNET_CHAIN_ID: "eip155:84532",
  IPO_ONE_TESTNET_PROVIDER_SLOT: "primary",
  IPO_ONE_TESTNET_KEY_FILE: "/private/tmp/ipo-one-chain-001d/test.key",
  IPO_ONE_TESTNET_RUN_ID: "chain-001d-live-20260728-001",
  IPO_ONE_TESTNET_OPERATOR_ID:
    "local_codex_executor_under_project_owner_approval"
});

test("CHAIN-001D runtime input is exact and rejects permission or chain drift", () => {
  assert.deepEqual(readCreditRegistryRuntimeInput(validEnvironment), {
    chainId: "eip155:84532",
    providerSlot: "primary",
    keyFile: "/private/tmp/ipo-one-chain-001d/test.key",
    runId: "chain-001d-live-20260728-001",
    operatorId: "local_codex_executor_under_project_owner_approval"
  });
  for (const environment of [
    { ...validEnvironment, IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY: "CHAIN-001B" },
    { ...validEnvironment, IPO_ONE_TESTNET_CHAIN_ID: "eip155:1" },
    { ...validEnvironment, IPO_ONE_TESTNET_CHAIN_ID: "eip155:1952" },
    {
      ...validEnvironment,
      IPO_ONE_TESTNET_KEY_FILE: "/private/tmp/ipo-one-chain-001b/test.key"
    },
    { ...validEnvironment, IPO_ONE_TESTNET_PROVIDER_SLOT: "caller-rpc" },
    {
      ...validEnvironment,
      IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS:
        "0x2222222222222222222222222222222222222222"
    },
    { ...validEnvironment, CI: "true" }
  ]) {
    assert.throws(
      () => readCreditRegistryRuntimeInput(environment),
      /invalid_credit_registry_run_config/
    );
  }
  assert.deepEqual(readCreditRegistryRuntimeInput({
    ...validEnvironment,
    IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS:
      "0x2222222222222222222222222222222222222222",
    IPO_ONE_TESTNET_RESUME_DEPLOYMENT_TRANSACTION_HASH:
      `0x${"3".repeat(64)}`,
    IPO_ONE_TESTNET_RESUME_PUBLICATION_TRANSACTION_HASH:
      `0x${"4".repeat(64)}`,
    IPO_ONE_TESTNET_RESUME_PROOF_UPDATE_TRANSACTION_HASH:
      `0x${"5".repeat(64)}`,
    IPO_ONE_TESTNET_RESUME_CLOSE_TRANSACTION_HASH:
      `0x${"6".repeat(64)}`,
    IPO_ONE_TESTNET_RESUME_PAUSE_TRANSACTION_HASH:
      `0x${"7".repeat(64)}`
  }), {
    chainId: "eip155:84532",
    providerSlot: "primary",
    keyFile: "/private/tmp/ipo-one-chain-001d/test.key",
    runId: "chain-001d-live-20260728-001",
    operatorId: "local_codex_executor_under_project_owner_approval",
    resumeContractAddress: "0x2222222222222222222222222222222222222222",
    resumeDeploymentTransactionHash: `0x${"3".repeat(64)}`,
    resumePublicationTransactionHash: `0x${"4".repeat(64)}`,
    resumeProofUpdateTransactionHash: `0x${"5".repeat(64)}`,
    resumeCloseTransactionHash: `0x${"6".repeat(64)}`,
    resumePauseTransactionHash: `0x${"7".repeat(64)}`
  });
  assert.throws(
    () => readCreditRegistryRuntimeInput({
      ...validEnvironment,
      IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS:
        "0x2222222222222222222222222222222222222222",
      IPO_ONE_TESTNET_RESUME_DEPLOYMENT_TRANSACTION_HASH:
        `0x${"3".repeat(64)}`,
      IPO_ONE_TESTNET_RESUME_CLOSE_TRANSACTION_HASH:
        `0x${"6".repeat(64)}`
    }),
    /invalid_credit_registry_run_config/
  );
});

test("synthetic lifecycle is deterministic, hash-only, and closes one test account", () => {
  const input = {
    runId: validEnvironment.IPO_ONE_TESTNET_RUN_ID,
    accountAddress: "0x1111111111111111111111111111111111111111",
    now: new Date("2026-07-28T12:00:00.000Z")
  };
  const first = buildSyntheticCreditRegistryLifecycle(input);
  const second = buildSyntheticCreditRegistryLifecycle(input);
  assert.deepEqual(first, second);
  assert.equal(first.syntheticOnly, true);
  assert.equal(first.rawPiiIncluded, false);
  assert.equal(first.realProductAccountIncluded, false);
  assert.equal(first.initialProjection.chainId, "eip155:84532");
  assert.equal(first.initialProjection.sandboxOnly, true);
  assert.equal(first.initialProjection.productionFundsMoved, false);
  assert.equal(first.initialProjection.validUntil, "2026-07-28T14:00:00.000Z");
  assert.equal(
    first.settledProjection.authorizationHash,
    first.initialProjection.authorizationHash
  );
  assert.equal(
    first.repaidProjection.creditStateHash,
    first.repaidCreditStateHash
  );
  assert.equal(
    first.repaidProjection.obligationProofHash,
    first.repaymentProofHash
  );
  assert.equal(
    first.settledProjection.creditStateHash,
    first.repaidCreditStateHash
  );
  assert.equal(
    first.settledProjection.obligationProofHash,
    first.settledObligationProofHash
  );
  for (const value of [
    first.initialProjection.authorizationHash,
    first.initialProjection.subjectAccountHash,
    first.initialProjection.acceptedOfferHash,
    first.initialProjection.policyHash,
    first.initialProjection.providerScopeHash,
    first.initialProjection.creditStateHash,
    first.initialProjection.obligationProofHash,
    first.repaidCreditStateHash,
    first.repaymentProofHash,
    first.settledObligationProofHash
  ]) {
    assert.match(value, /^0x[0-9a-f]{64}$/);
  }
  const serialized = JSON.stringify(first).toLowerCase();
  for (const forbidden of [
    "passport",
    "phone",
    "email",
    "privatekey",
    "mnemonic",
    "seed phrase",
    "strategy"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("credit Registry run gas caps fail closed before the approved maximum", () => {
  assert.equal(
    assertCreditRegistryGasCap(100_000n, 1_000_000_000n, 0n),
    100_000_000_000_000n
  );
  assert.throws(
    () => assertCreditRegistryGasCap(6_000_000n, 1_000_000_000n, 0n),
    /credit_registry_gas_cap_exceeded/
  );
  assert.throws(
    () => assertCreditRegistryGasCap(
      1_000_000n,
      1_000_000_000n,
      14_500_000_000_000_000n
    ),
    /credit_registry_gas_cap_exceeded/
  );
});

test("live runner source preserves five zero-value writes, safe finality, and key destruction", async () => {
  const source = await readFile(
    new URL("../run-credit-registry-once.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /const MAX_TRANSACTION_COUNT = 5/);
  assert.match(source, /value: 0n/);
  assert.match(source, /blockTag: "safe"/);
  assert.match(source, /getContractAddress/);
  assert.match(source, /getAddress\(deploymentTransaction\.from\)/);
  assert.match(source, /pendingNonce !== acceptedCheckpointCount/);
  assert.match(source, /deploymentTransaction\.input !== deployData/);
  assert.match(source, /resumePublicationTransactionHash/);
  assert.match(source, /resumeProofUpdateTransactionHash/);
  assert.match(source, /resumeCloseTransactionHash/);
  assert.match(source, /resumePauseTransactionHash/);
  assert.match(source, /waitForAuthorizationState/);
  assert.match(source, /finalState\.status !== "closed"/);
  assert.match(source, /finalState\.version !== 3/);
  assert.match(source, /paused !== true/);
  assert.match(source, /destroyEphemeralTestnetKey/);
  assert.doesNotMatch(source, /process\.env\.PRIVATE_KEY|process\.env\.MNEMONIC/);
});
