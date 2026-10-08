import assert from "node:assert/strict";
import test from "node:test";
import { keccak256 } from "viem";
import { createAnvilReadonlyEvidenceAdapter } from "../src/anvil-readonly-evidence.js";
import { ANVIL_IMPLEMENTATION_SLOT, ANVIL_SOURCE_REVISION } from "../src/anvil-readonly-abi.js";
import { BLOCK, BLOCK_HASH, EVENT_ARGS, PROFILE, STATE, TX, eventLog, fixtureRpc, legacyCreationLog } from "./fixtures/anvil-readonly.js";

function adapter(rpc = fixtureRpc(), profile = PROFILE, options = {}) {
  return createAnvilReadonlyEvidenceAdapter({ enabled: true, rpc, profile, clock: () => "2026-10-07T00:00:00.000Z", ...options });
}

test("default off and explicit false never access an injected transport", async () => {
  const rpc = { call() { assert.fail("disabled adapter called RPC"); } };
  for (const options of [{}, { enabled: false, rpc, profile: { invalid: true } }]) {
    const instance = createAnvilReadonlyEvidenceAdapter(options);
    assert.equal(instance.getDescriptor().reason, "anvil_disabled");
    await assert.rejects(instance.observeTransaction(TX), { code: "anvil_disabled" });
    await assert.rejects(instance.readLOC(), { code: "anvil_disabled" });
  }
});

test("only exact separately configured pinned profiles are admitted", () => {
  for (const change of [
    { contractVersion: "2.0.0" }, { sourceRevision: "main" }, { chainId: "ethereum" },
    { chainId: { toString: () => PROFILE.chainId } },
    { dataMode: "live" }, { sourceRef: "https://host/key" },
    { deploymentVerificationRef: "token=credential" }, { implementationCodeHash: "0x" },
    { contractAddress: `0x${"0".repeat(40)}` }
  ]) assert.throws(() => adapter(fixtureRpc(), { ...PROFILE, ...change }), { name: "DomainError" });
  assert.equal(adapter().getDescriptor().sourceRevision, ANVIL_SOURCE_REVISION);
  assert.throws(() => createAnvilReadonlyEvidenceAdapter({ enabled: "true" }), { code: "anvil_invalid_config" });
});

for (const eventName of Object.keys(EVENT_ARGS)) {
  test(`${eventName} preserves contract facts without repayment/default/credit meaning`, async () => {
    const rpc = fixtureRpc({ logs: [eventLog(eventName)] });
    const [result] = await adapter(rpc).observeTransaction(TX);
    assert.equal(result.kind, eventName);
    assert.equal(result.locId, "7");
    assert.equal(result.transactionHash, TX);
    assert.equal(result.blockHash, BLOCK_HASH);
    assert.equal(result.dataMode, "synthetic");
    assert.equal(result.businessSemantics, "unknown");
    assert.equal(result.mappingStatus, "unmapped");
    assert.equal(result.finality, "unverified");
    assert.equal(result.reconciliation, "unreconciled");
    assert.equal(result.creditDecisionEligible, false);
    assert.equal(result.evidence.sourceFinality, "pending");
    assert.equal(result.evidence.recordedAt, "2026-10-07T00:00:00.000Z");
    assert.equal(result.versionVerification, "block_end_bytecode_match");
    for (const key of ["subjectId", "obligationId", "paymentId", "creditScore", "default", "repaid"]) {
      assert.equal(Object.hasOwn(result, key), false);
      assert.equal(Object.hasOwn(result.evidence, key), false);
    }
    if (eventName === "LOCCreatedV3") {
      assert.equal(result.facts.collateralTokenAmount, STATE.collateralTokenAmount.toString());
      assert.equal(result.facts.tagHash, keccak256(EVENT_ARGS.LOCCreatedV3.tag));
      assert.equal(JSON.stringify(result).includes(EVENT_ARGS.LOCCreatedV3.tag), false);
    }
    assert.equal(Object.hasOwn(adapter(rpc), "sendTransaction"), false);
    assert.ok(rpc.calls.every(({ method }) => /^eth_(chainId|getTransactionReceipt|getBlockByHash|getBlockByNumber|getStorageAt|getCode)$/.test(method)));
  });
}

test("reads getLOC at the exact canonical block and preserves unknown business semantics", async () => {
  const rpc = fixtureRpc();
  const result = await adapter(rpc).readLOC({ locId: "7", blockHash: BLOCK_HASH });
  assert.equal(result.kind, "getLOC");
  assert.equal(result.transactionHash, null);
  assert.equal(result.facts.recordPresence, "present");
  assert.equal(result.facts.creditedTokenAmount, "900");
  assert.equal(result.facts.collateralFactorBasisPoints, "0");
  assert.equal(result.businessSemantics, "unknown");
  for (const { method, params } of rpc.calls) {
    if (["eth_call", "eth_getStorageAt", "eth_getCode"].includes(method)) {
      assert.deepEqual(params.at(-1), { blockHash: BLOCK_HASH, requireCanonical: true });
    }
    if (method === "eth_getStorageAt") assert.equal(params[1], ANVIL_IMPLEMENTATION_SLOT);
  }
});

test("zero tuple is absent or deleted, never default/repayment proof", async () => {
  const state = Object.fromEntries(Object.entries(STATE).map(([key, value]) => [
    key, typeof value === "string" ? `0x${"0".repeat(40)}` : typeof value === "number" ? 0 : 0n
  ]));
  const result = await adapter(fixtureRpc({ state })).readLOC({ locId: "7", blockHash: BLOCK_HASH });
  assert.equal(result.facts.recordPresence, "absent_or_deleted");
  assert.equal(result.businessSemantics, "unknown");
});

test("replay is deterministic and delivery order is canonical", async () => {
  const instance = adapter(fixtureRpc({ logs: [eventLog("LOCCanceled", 2), eventLog("LOCRedeemed", 1)] }));
  const first = await instance.observeTransaction(TX);
  assert.deepEqual(first.map(({ logIndex }) => logIndex), ["1", "2"]);
  assert.deepEqual(await instance.observeTransaction(TX), first);
});

test("profile is snapshotted and returned facts cannot alter future observations", async () => {
  const profile = { ...PROFILE };
  const instance = adapter(fixtureRpc(), profile);
  profile.chainId = "eip155:1";
  const [result] = await instance.observeTransaction(TX);
  result.facts.creditedTokenAmount = "99999";
  const [replayed] = await instance.observeTransaction(TX);
  assert.equal(replayed.facts.creditedTokenAmount, "500");
  assert.equal(replayed.chainId, PROFILE.chainId);
});

for (const [method, value, code] of [
  ["eth_chainId", "0x1", "anvil_chain_mismatch"],
  ["eth_getStorageAt", `0x${"0".repeat(64)}`, "anvil_version_mismatch"],
  ["eth_getCode", "0x", "anvil_version_mismatch"],
  ["eth_getCode", "0x6001", "anvil_version_mismatch"],
  ["eth_getBlockByHash", { ...BLOCK, hash: TX }, "anvil_invalid_receipt"],
  ["eth_getBlockByNumber", { ...BLOCK, hash: TX }, "anvil_reorg"]
]) test(`${method} mismatch rejects evidence (${code})`, async () => {
  const rpc = fixtureRpc({ override: (name, _, fallback) => name === method ? value : fallback });
  await assert.rejects(adapter(rpc).observeTransaction(TX), { code });
  assert.equal(rpc.calls.some(({ method: name }) => name === "eth_call"), false);
});

test("reorg occurring during observation rejects the whole result", async () => {
  let count = 0;
  const rpc = fixtureRpc({ override: (method, _, fallback) =>
    method === "eth_getBlockByNumber" && ++count === 2 ? { ...BLOCK, hash: TX } : fallback
  });
  await assert.rejects(adapter(rpc).observeTransaction(TX), { code: "anvil_reorg" });
});

for (const changes of [
  { removed: true }, { transactionHash: BLOCK_HASH }, { blockHash: TX }, { blockNumber: "0x11" },
  { topics: [TX] }, { data: "0x" }, { data: `0x${"ab".repeat(16_385)}` }
]) test(`malformed/unsupported log fails closed: ${Object.keys(changes)[0]}`, async () => {
  await assert.rejects(adapter(fixtureRpc({ logs: [eventLog("LOCRedeemed", 0, changes)] })).observeTransaction(TX), { name: "DomainError" });
});

test("duplicate log identity, failed/missing receipt and oversized receipt are rejected", async () => {
  await assert.rejects(adapter(fixtureRpc({ logs: [eventLog(), eventLog()] })).observeTransaction(TX), { code: "anvil_duplicate_log" });
  for (const receipt of [null, { status: "0x0" }, { status: "0x1", transactionHash: TX, logs: Array(513).fill(eventLog()) }]) {
    const rpc = fixtureRpc({ override: (method, _, fallback) => method === "eth_getTransactionReceipt" ? receipt : fallback });
    await assert.rejects(adapter(rpc).observeTransaction(TX), { code: "anvil_invalid_receipt" });
  }
});

test("unrelated contracts are excluded without manufacturing LOC evidence", async () => {
  assert.deepEqual(await adapter(fixtureRpc({ logs: [eventLog("LOCRedeemed", 0, { address: PROFILE.implementationAddress })] })).observeTransaction(TX), []);
});

test("invalid LOC IDs reject before transport; malformed state rejects", async () => {
  for (const locId of ["0", "07", "-1", "79228162514264337593543950336", 7]) {
    const rpc = fixtureRpc();
    await assert.rejects(adapter(rpc).readLOC({ locId, blockHash: BLOCK_HASH }), { code: "anvil_invalid_loc_id" });
    assert.equal(rpc.calls.length, 0);
  }
  const rpc = fixtureRpc({ override: (method, _, fallback) => method === "eth_call" ? "0x" : fallback });
  await assert.rejects(adapter(rpc).readLOC({ locId: "7", blockHash: BLOCK_HASH }), { code: "anvil_decode_failed" });
});

test("transport failure hides provider errors and slow transports time out", async () => {
  await assert.rejects(adapter({ call() { throw new Error("https://rpc/private-key-sensitive"); } }).observeTransaction(TX), (error) =>
    error.code === "anvil_rpc_unavailable" && !error.message.includes("sensitive")
  );
  await assert.rejects(adapter({ call() { return new Promise(() => {}); } }, PROFILE, { timeoutMs: 10 }).observeTransaction(TX), { code: "anvil_rpc_timeout" });
});

test("provider errors cannot impersonate the adapter timeout and bypass sanitization", async () => {
  const providerError = Object.assign(new Error("synthetic-private-endpoint"), {
    code: "anvil_rpc_timeout", details: { credential: "synthetic-secret" }
  });
  await assert.rejects(adapter({ call() { throw providerError; } }).observeTransaction(TX), (error) => {
    assert.notEqual(error, providerError);
    assert.equal(error.name, "DomainError");
    assert.equal(error.code, "anvil_rpc_unavailable");
    assert.deepEqual(error.details, {});
    assert.equal(error.message.includes("private"), false);
    assert.equal(JSON.stringify(error).includes("secret"), false);
    return true;
  });
});

test("non-string or malformed receipt identities fail with a sanitized domain error", async () => {
  for (const transactionHash of [123, null, {}, [], "invalid"]) {
    const rpc = fixtureRpc({ override: (method, _, fallback) => method === "eth_getTransactionReceipt"
      ? { ...fallback, transactionHash } : fallback });
    await assert.rejects(adapter(rpc).observeTransaction(TX), { name: "DomainError", code: "anvil_invalid_receipt" });
    assert.deepEqual(rpc.calls.map(({ method }) => method), ["eth_getTransactionReceipt"]);
  }
});

test("logs with missing or malformed emitting addresses cannot disappear silently", async () => {
  for (const address of [undefined, null, 123, {}, [], "invalid"]) {
    await assert.rejects(adapter(fixtureRpc({ logs: [eventLog("LOCRedeemed", 0, { address })] })).observeTransaction(TX),
      { name: "DomainError", code: "anvil_invalid_log" });
  }
  for (const log of [null, 123, [], "invalid"]) {
    await assert.rejects(adapter(fixtureRpc({ logs: [log] })).observeTransaction(TX), { code: "anvil_invalid_log" });
  }
});

test("malformed log hashes fail with domain errors instead of native type errors", async () => {
  for (const key of ["blockHash", "transactionHash"]) {
    for (const value of [undefined, null, 123, {}, [], "invalid"]) {
      await assert.rejects(adapter(fixtureRpc({ logs: [eventLog("LOCRedeemed", 0, { [key]: value })] })).observeTransaction(TX),
        { name: "DomainError", code: "anvil_invalid_log" });
    }
  }
});

test("RPC quantities are canonical and bounded before BigInt conversion", async () => {
  for (const value of ["0x01", "0x-1", `0x1${"0".repeat(64)}`]) {
    await assert.rejects(adapter(fixtureRpc({ logs: [eventLog("LOCRedeemed", 0, { logIndex: value })] })).observeTransaction(TX),
      { code: "anvil_invalid_input" });
    for (const method of ["eth_chainId", "eth_getBlockByHash", "eth_getBlockByNumber"]) {
      const rpc = fixtureRpc({ override: (name, _, fallback) => name === method
        ? method === "eth_chainId" ? value : { ...fallback, number: value } : fallback });
      await assert.rejects(adapter(rpc).readLOC({ locId: "7", blockHash: BLOCK_HASH }), { code: "anvil_invalid_input" });
    }
  }
});

test("synthetic envelopes preserve their source label separately from public-readonly profiles", async () => {
  for (const dataMode of ["synthetic", "public_readonly"]) {
    // Both transports are fixtures; this verifies the trusted configuration contract only.
    const reader = adapter(fixtureRpc(), { ...PROFILE, dataMode });
    const observations = [
      ...(await reader.observeTransaction(TX)),
      await reader.readLOC({ locId: "7", blockHash: BLOCK_HASH })
    ];
    for (const result of observations) {
      assert.equal(result.evidence.sourceSystem, dataMode === "synthetic" ? "anvil_synthetic_fixture" : "anvil_public_contract");
      assert.equal(result.evidence.payload.dataMode, dataMode);
      assert.equal(result.evidence.sourceFinality, "pending");
      assert.equal(result.evidence.payload.creditDecisionEligible, false);
    }
  }
});

test("observation time changes independently of block time and stable fact identity", async () => {
  let observedAt = "2026-10-07T15:00:00.000Z";
  const instance = adapter(fixtureRpc(), PROFILE, { clock: () => observedAt });
  const [first] = await instance.observeTransaction(TX);
  observedAt = "2026-10-07T15:01:00.000Z";
  const [second] = await instance.observeTransaction(TX);
  assert.equal(first.observationId, second.observationId);
  assert.equal(first.tupleId, second.tupleId);
  assert.equal(first.occurredAt, second.occurredAt);
  assert.notEqual(first.observedAt, first.occurredAt);
  assert.notEqual(first.evidence.recordedAt, second.evidence.recordedAt);
  assert.equal(second.evidence.recordedAt, observedAt);
});

test("invalid observation clocks fail closed", async () => {
  for (const value of [null, "not-a-date", "123", "2026-10-07", "2026-02-30T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]) {
    const clock = () => value;
    await assert.rejects(adapter(fixtureRpc(), PROFILE, { clock }).observeTransaction(TX), { code: "anvil_invalid_clock" });
    await assert.rejects(adapter(fixtureRpc(), PROFILE, { clock }).readLOC({ locId: "7", blockHash: BLOCK_HASH }), { code: "anvil_invalid_clock" });
  }
  assert.throws(() => adapter(fixtureRpc(), PROFILE, { clock: null }), { code: "anvil_invalid_config" });
});

test("getLOC rejects a reorg after the pinned state read", async () => {
  let count = 0;
  const rpc = fixtureRpc({ override: (method, _, fallback) =>
    method === "eth_getBlockByNumber" && ++count === 2 ? { ...BLOCK, hash: TX } : fallback
  });
  await assert.rejects(adapter(rpc).readLOC({ locId: "7", blockHash: BLOCK_HASH }), { code: "anvil_reorg" });
  assert.ok(rpc.calls.some(({ method }) => method === "eth_call"));
});

test("getLOC cannot return state from an unknown implementation", async () => {
  const rpc = fixtureRpc({ override: (method, _, fallback) => method === "eth_getStorageAt"
    ? `0x${"0".repeat(64)}` : fallback });
  await assert.rejects(adapter(rpc).readLOC({ locId: "7", blockHash: BLOCK_HASH }), { code: "anvil_version_mismatch" });
  assert.equal(rpc.calls.some(({ method }) => method === "eth_call"), false);
});

for (const eventName of ["LOCCanceled", "LOCRedeemed", "LOCCreatedV3"]) {
  test(`${eventName} rejects extra data and indexed topics instead of silently decoding`, async () => {
    const log = eventLog(eventName);
    for (const changes of [{ data: `${log.data}00` }, { topics: [...log.topics, TX] }]) {
      await assert.rejects(adapter(fixtureRpc({ logs: [{ ...log, ...changes }] })).observeTransaction(TX), { code: "anvil_decode_failed" });
    }
  });
}

test("V3 event-only tags admit exactly 512 bytes and never expose the raw value", async () => {
  for (const size of [0, 512]) {
    const tag = `0x${"ab".repeat(size)}`;
    const [result] = await adapter(fixtureRpc({ logs: [eventLog("LOCCreatedV3", 0, {}, { tag })] })).observeTransaction(TX);
    assert.equal(result.facts.tagByteLength, String(size));
    assert.equal(result.facts.tagHash, keccak256(tag));
    assert.equal(Object.hasOwn(result.facts, "tag"), false);
    if (size) assert.equal(JSON.stringify(result).includes(tag), false);
  }
});

test("V3 tags above 512 bytes reject the entire observation", async () => {
  await assert.rejects(adapter(fixtureRpc({ logs: [eventLog("LOCCreatedV3", 0, {}, { tag: `0x${"ab".repeat(513)}` })] })).observeTransaction(TX), { code: "anvil_invalid_data" });
});

for (const eventName of ["LOCCreated", "LOCCreatedV2"]) {
  test(`${eventName} cannot silently enter the V3 codec`, async () => {
    await assert.rejects(adapter(fixtureRpc({ logs: [legacyCreationLog(eventName)] })).observeTransaction(TX), { code: "anvil_unsupported_event" });
  });
}

test("getLOC never invents an event tag or treats V3 deprecated factors as current configuration", async () => {
  for (const value of [0, 3_500]) {
    const result = await adapter(fixtureRpc({ state: { ...STATE, collateralFactorBasisPoints: value, liquidatorIncentiveBasisPoints: value } })).readLOC({ locId: "7", blockHash: BLOCK_HASH });
    assert.equal(result.facts.collateralFactorBasisPoints, String(value));
    assert.equal(result.facts.liquidatorIncentiveBasisPoints, String(value));
    for (const key of ["tag", "tagHash", "tagByteLength", "currentGlobalCollateralFactor", "healthy"]) {
      assert.equal(Object.hasOwn(result.facts, key), false);
    }
    assert.equal(result.stateInterpretation.tag, "event_only_not_stored");
    assert.equal(result.stateInterpretation.perLocFactors, "deprecated_not_current_global_configuration");
    assert.equal(result.stateInterpretation.creationHistory, "not_established_by_snapshot");
    assert.equal(result.creditDecisionEligible, false);
  }
});

test("a zero tuple cannot distinguish an unallocated ID from a deleted LOC", async () => {
  const state = Object.fromEntries(Object.entries(STATE).map(([key, value]) => [
    key, typeof value === "string" ? `0x${"0".repeat(40)}` : typeof value === "number" ? 0 : 0n
  ]));
  const reader = adapter(fixtureRpc({ state }));
  for (const locId of ["7", "999999"]) {
    const result = await reader.readLOC({ locId, blockHash: BLOCK_HASH });
    assert.equal(result.facts.recordPresence, "absent_or_deleted");
    assert.equal(result.stateInterpretation.creationHistory, "not_established_by_snapshot");
    assert.equal(result.stateInterpretation.zeroTuple, "absent_or_deleted");
    for (const key of ["exists", "created", "canceled", "redeemed", "default", "repaid"]) {
      assert.equal(Object.hasOwn(result.facts, key), false);
    }
  }
});
