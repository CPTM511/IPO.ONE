import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BASE_SEPOLIA_PROFILE,
  SandboxChainAdapter,
  X_LAYER_TESTNET_PROFILE,
  createChainProfile,
  listSandboxChainProfiles,
  runMultiChainConformance,
  runSandboxObligationPortabilityConformance,
  runSandboxChainAdapterConformance
} from "../src/index.js";

const humanObligationFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const agentObligationFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

test("ratified Base Sepolia and X Layer profiles share one provider-neutral conformance suite", async () => {
  const adapters = listSandboxChainProfiles().map((profile) => new SandboxChainAdapter({ profile }));
  const result = await runMultiChainConformance(adapters);

  assert.deepEqual(result.chainIds, ["eip155:1952", "eip155:84532"]);
  assert.equal(result.reports.length, 2);
  assert.equal(new Set(result.reports.map((report) => report.kernelInvariantHash)).size, 1);
  assert.equal(new Set(result.reports.map((report) => report.canonicalPaymentRef)).size, 1);
  assert.equal(result.reports.every((report) => report.selectedProviderSlot === "secondary"), true);
  assert.equal(result.reports.every((report) => report.productionFundsMoved === false), true);
  assert.equal(result.conformant, true);
});

test("Human and Agent sandbox Obligations produce one immutable two-profile portability receipt", async () => {
  for (const [entryMode, workflowReceipt] of [
    ["human", humanObligationFixtures.valid[0]],
    ["agent", agentObligationFixtures.valid[0]]
  ]) {
    const before = structuredClone(workflowReceipt);
    const receipt = await runSandboxObligationPortabilityConformance({ workflowReceipt });
    assert.deepEqual(workflowReceipt, before);
    assert.equal(receipt.entryMode, entryMode);
    assert.equal(receipt.obligationId, workflowReceipt.obligation.obligationId);
    assert.equal(receipt.paymentId, workflowReceipt.repayment.repaymentId);
    assert.equal(receipt.principalLedgerTransactionId, workflowReceipt.principalLedgerTransactionId);
    assert.equal(receipt.paymentLedgerTransactionId, workflowReceipt.repayment.ledgerTransactionId);
    assert.deepEqual(receipt.profiles.map((profile) => profile.chainId), ["eip155:84532", "eip155:1952"]);
    assert.equal(new Set(receipt.profiles.map((profile) => profile.canonicalPaymentRef)).size, 1);
    assert.equal(receipt.profiles.every((profile) => profile.sourceFinality === "finalized"), true);
    assert.equal(receipt.networkCallsMade, false);
    assert.equal(receipt.liveTestnetExecution, false);
    assert.equal(receipt.productionFundsMoved, false);
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.profiles), true);
    assert.equal(Object.isFrozen(receipt.profiles[0]), true);
  }
});

test("Obligation portability rejects authority expansion, linkage drift, accessors, and cap overflow", async () => {
  const workflowReceipt = humanObligationFixtures.valid[0];
  await assert.rejects(
    runSandboxObligationPortabilityConformance({ workflowReceipt, rpcUrl: "https://example.invalid" }),
    /invalid_obligation_portability_input/
  );

  let getterCalled = false;
  const accessorInput = {};
  Object.defineProperty(accessorInput, "workflowReceipt", {
    enumerable: true,
    get() {
      getterCalled = true;
      return workflowReceipt;
    }
  });
  await assert.rejects(
    runSandboxObligationPortabilityConformance(accessorInput),
    /invalid_obligation_portability_input/
  );
  assert.equal(getterCalled, false);

  const linkageDrift = structuredClone(workflowReceipt);
  linkageDrift.repayment.obligationId = "obligation_drifted";
  await assert.rejects(
    runSandboxObligationPortabilityConformance({ workflowReceipt: linkageDrift }),
    /obligation_portability_linkage_mismatch/
  );

  const capOverflow = structuredClone(workflowReceipt);
  capOverflow.repayment.appliedMinor = "100001";
  await assert.rejects(
    runSandboxObligationPortabilityConformance({ workflowReceipt: capOverflow }),
    /chain_execution_cap_exceeded/
  );
});

test("chain profiles reject mainnet, production claims, embedded RPC fields, and unsafe caps", () => {
  const { profileHash, schemaVersion, ...baseInput } = BASE_SEPOLIA_PROFILE;
  assert.throws(() => createChainProfile({ ...baseInput, chainId: "eip155:8453" }), /chain_profile_not_approved/);
  assert.throws(() => createChainProfile({ ...baseInput, productionApproved: true }), /production_chain_not_approved/);
  assert.throws(
    () => createChainProfile({ ...baseInput, rpcUrl: "https:\/\/example.invalid\/?apiKey=secret" }),
    /closed profile contract/
  );
  assert.throws(
    () =>
      createChainProfile({
        ...baseInput,
        caps: { ...baseInput.caps, maxExecutionMinor: "1000001", maxExposureMinor: "1000000" }
      }),
    /per-execution cap cannot exceed/
  );
  assert.equal(profileHash, BASE_SEPOLIA_PROFILE.profileHash);
  assert.equal(schemaVersion, "chain_profile.v1");
});

test("chain adapter conformance is deterministic per profile and bounded by logical provider slots", async () => {
  const adapter = new SandboxChainAdapter({ profile: X_LAYER_TESTNET_PROFILE });
  const first = await runSandboxChainAdapterConformance(adapter);
  const second = await runSandboxChainAdapterConformance(adapter);

  assert.equal(first.kernelInvariantHash, second.kernelInvariantHash);
  assert.deepEqual(first.providerAttempts, ["primary", "secondary"]);
  assert.equal(first.executionCapFailsClosed, true);
  assert.equal(first.deterministicReplay, true);
});

test("runtime chain contracts stay aligned with their closed JSON schemas", async () => {
  const adapter = new SandboxChainAdapter({ profile: BASE_SEPOLIA_PROFILE });
  const report = await runSandboxChainAdapterConformance(adapter);
  const proof = adapter.normalizeObservation({
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    transactionHash: `0x${"1".repeat(64)}`,
    eventOrdinal: 0,
    blockNumber: "100",
    blockHash: `0x${"2".repeat(64)}`,
    obligationId: "obligation_schema_1",
    paymentId: "payment_schema_1",
    assetId: "asset:synthetic-usd",
    amountMinor: "100",
    observationStatus: "included",
    confirmations: 1,
    observedAt: "2026-07-15T00:00:00.000Z"
  });
  const cases = [
    ["chain-profile.schema.json", BASE_SEPOLIA_PROFILE],
    ["chain-finality-proof.schema.json", proof]
  ];
  for (const [file, value] of cases) {
    const schema = JSON.parse(await readFile(new URL(`../../../schemas/v2/${file}`, import.meta.url), "utf8"));
    const serialized = JSON.parse(JSON.stringify(value));
    assert.deepEqual(
      Object.keys(serialized).filter((key) => !Object.hasOwn(schema.properties, key)),
      [],
      `${file} does not declare all runtime fields`
    );
    assert.deepEqual(
      schema.required.filter((key) => !Object.hasOwn(serialized, key)),
      [],
      `${file} requires fields missing from runtime output`
    );
    assert.equal(serialized.schemaVersion, schema.properties.schemaVersion.const);
  }
  assert.equal(report.conformant, true);
});
