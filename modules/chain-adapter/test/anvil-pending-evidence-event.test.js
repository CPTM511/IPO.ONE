import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceEnvelope, hashId } from "../../../packages/domain/src/index.js";
import { createAnvilReadonlyEvidenceAdapter } from "../src/anvil-readonly-evidence.js";
import { ANVIL_PENDING_BATCH_LIMITS, createAnvilPendingEvidenceEvent, prepareAnvilPendingEvidenceBatch } from "../src/anvil-pending-evidence-event.js";
import { BLOCK_HASH, EVENT_ARGS, PROFILE, STATE, TX, eventLog, fixtureRpc } from "./fixtures/anvil-readonly.js";

const TENANT = "tenant_anvil_local";
const FIRST_TIME = "2026-10-07T00:00:00.000Z";
function reader({ logs, state, clock = FIRST_TIME, profile = PROFILE } = {}) {
  return createAnvilReadonlyEvidenceAdapter({ enabled: true, profile, rpc: fixtureRpc({ logs, state }), clock: () => clock });
}
async function observed(options) { return (await reader(options).observeTransaction(TX))[0]; }
function convert(observation, overrides = {}) {
  return createAnvilPendingEvidenceEvent({ tenantId: TENANT, profile: PROFILE, observation, ...overrides });
}
function batch(observations, priorRecords = [], overrides = {}) {
  return prepareAnvilPendingEvidenceBatch({ tenantId: TENANT, profile: PROFILE, observations, priorRecords, ...overrides });
}

// Local hashes are not attestations. Recompute them to exercise semantic checks
// against internally consistent but unsupported source claims.
function forged(source, mutate) {
  const result = structuredClone(source);
  const { evidence: _, observedAt, observationId: _id, tupleId: _tuple, ...core } = result;
  mutate(core);
  const observationId = hashId("anvil_observation", core);
  return {
    ...core, observationId, tupleId: result.tupleId, observedAt,
    evidence: createEvidenceEnvelope({
      ...result.evidence, eventId: observationId, correlationId: observationId,
      idempotencyKey: observationId, payload: core
    })
  };
}

for (const kind of Object.keys(EVENT_ARGS)) test(`${kind} converts only to a pending external fact candidate`, async () => {
  const observation = await observed({ logs: [eventLog(kind)] });
  const result = convert(observation);
  assert.equal(result.event.eventType, "external.anvil.fact_observed");
  assert.equal(result.event.finalityStatus, "pending");
  assert.equal(result.event.schemaVersion, "event.v1");
  assert.equal(result.event.payloadHash, hashId("event_payload", result.event.payload));
  assert.deepEqual(result.event.payload.sourceObservation, observation);
  assert.equal(result.sourceSystem, "anvil_synthetic_fixture");
  assert.equal(result.event.payload.sourceObservation.evidence.sourceFinality, "pending");
  assert.equal(result.event.payload.sourceObservation.creditDecisionEligible, false);
  for (const key of ["subjectId", "obligationId", "paymentId", "ledgerTransactionId", "creditScore", "repaid", "default"]) {
    assert.equal(Object.hasOwn(result, key), false);
    assert.equal(Object.hasOwn(result.event, key), false);
    assert.equal(Object.hasOwn(result.event.payload, key), false);
  }
});

test("state candidates retain snapshot provenance, unknown interpretation and null transaction identity", async () => {
  const observation = await reader().readLOC({ locId: "7", blockHash: BLOCK_HASH });
  const source = convert(observation).event.payload.sourceObservation;
  assert.equal(source.transactionHash, null);
  assert.equal(source.logIndex, null);
  assert.equal(source.mappingStatus, "unmapped");
  assert.equal(source.reconciliation, "unreconciled");
  assert.equal(source.finality, "unverified");
  assert.equal(source.businessSemantics, "unknown");
  assert.deepEqual(source.stateInterpretation, observation.stateInterpretation);
  assert.deepEqual(source.evidence, observation.evidence);
});

test("tenant identities are closed bounded opaque data, never inferred from source addresses", async () => {
  const observation = await observed();
  for (const tenantId of [undefined, null, 7, "", " tenant", "https://host/key", "x".repeat(161)]) {
    assert.throws(() => convert(observation, { tenantId }), { name: "DomainError", code: "anvil_pending_invalid_value" });
  }
  assert.equal(convert(observation, { tenantId: "x".repeat(160) }).tenantId.length, 160);
  const other = convert(observation, { tenantId: "tenant_other" });
  const first = convert(observation);
  assert.notEqual(other.event.eventId, first.event.eventId);
  assert.notEqual(other.aggregateId, first.aggregateId);
  assert.notEqual(other.commandHash, first.commandHash);
  assert.equal(other.observationId, first.observationId);
  assert.equal(other.tupleId, first.tupleId);
});

test("mapping fields and executable integration hooks are rejected without calling them", async () => {
  const observation = await observed();
  let calls = 0;
  for (const extra of [
    { subjectId: "subject_1" }, { obligationId: "obligation_1" },
    { rpc: () => calls++ }, { repository: () => calls++ }, { onPrepared: () => calls++ }
  ]) assert.throws(() => convert(observation, extra), { code: "anvil_pending_invalid_shape" });
  assert.equal(calls, 0);
});

test("only the trusted pinned profile or enabled descriptor can match source provenance", async () => {
  const observation = await observed();
  assert.deepEqual(convert(observation, { profile: reader().getDescriptor() }), convert(observation));
  for (const change of [
    { chainId: "eip155:1" }, { contractAddress: PROFILE.implementationAddress },
    { sourceRef: "fixture:other" }, { deploymentVerificationRef: "fixture:other" },
    { implementationCodeHash: TX }, { dataMode: "public_readonly" },
    { contractVersion: "2.0.0" }, { sourceRevision: "main" }, { enabled: false }
  ]) assert.throws(() => convert(observation, { profile: { ...PROFILE, ...change } }), { name: "DomainError" });
});

test("public-readonly source labels are preserved using simulated profile inputs", async () => {
  const profile = { ...PROFILE, dataMode: "public_readonly" };
  const observation = await observed({ profile });
  const result = convert(observation, { profile });
  assert.equal(result.sourceSystem, "anvil_public_contract");
  assert.equal(result.event.finalityStatus, "pending");
  assert.equal(result.event.payload.sourceObservation.creditDecisionEligible, false);
});

test("changed outer facts, source payloads, envelope hashes and receipt metadata are rejected", async () => {
  const source = await observed();
  for (const mutate of [
    (value) => value.facts.creditedTokenAmount = "999",
    (value) => value.evidence.payload.facts.creditedTokenAmount = "999",
    (value) => value.evidence.evidenceHash = TX,
    (value) => value.evidence.payloadHash = TX,
    (value) => value.evidence.sourceFinality = "finalized",
    (value) => value.evidence.sourceSystem = "verified_credit",
    (value) => value.evidence.actorRef = "other_actor",
    (value) => value.observedAt = "2026-10-07T01:00:00.000Z",
    (value) => value.observationId = TX,
    (value) => value.tupleId = TX,
    (value) => value.evidence.subjectId = "subject_1"
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => convert(changed), { code: "anvil_pending_invalid_hash" });
  }
});

test("rehashed source claims still cannot upgrade finality, mapping or economic meaning", async () => {
  const source = await observed();
  for (const [key, value] of [
    ["finality", "finalized"], ["observationStatus", "finalized"], ["mappingStatus", "mapped"],
    ["reconciliation", "reconciled"], ["businessSemantics", "repaid"], ["creditDecisionEligible", true]
  ]) assert.throws(() => convert(forged(source, (core) => core[key] = value)), { code: "anvil_pending_invalid_semantics" });
});

test("even consistently hashed unsupported fact fields or ABI values are rejected", async () => {
  const source = await observed();
  for (const key of ["repaid", "default", "creditScore", "subjectId", "tag"]) {
    assert.throws(() => convert(forged(source, (core) => core.facts[key] = "unsupported")), { code: "anvil_pending_invalid_shape" });
  }
  for (const value of ["01", "-1", (2n ** 256n).toString()]) {
    assert.throws(() => convert(forged(source, (core) => core.facts.creditedTokenAmount = value)), { code: "anvil_pending_invalid_value" });
  }
  assert.throws(() => convert(forged(source, (core) => core.facts.id = "8")), { code: "anvil_pending_invalid_provenance" });
  assert.throws(() => convert(forged(source, (core) => core.kind = "LOCCreatedV2")), { code: "anvil_pending_unsupported_kind" });
});

test("state interpretation, record presence and transaction identity remain constrained", async () => {
  const source = await reader().readLOC({ locId: "7", blockHash: BLOCK_HASH });
  for (const mutate of [
    (core) => core.stateInterpretation.zeroTuple = "default",
    (core) => core.facts.recordPresence = "absent_or_deleted"
  ]) assert.throws(() => convert(forged(source, mutate)), { code: "anvil_pending_invalid_semantics" });
  assert.throws(() => convert(forged(source, (core) => core.transactionHash = TX)), { code: "anvil_pending_invalid_provenance" });
});

test("candidate snapshots are detached and deeply immutable", async () => {
  const source = await observed();
  const before = structuredClone(source);
  const result = convert(source);
  assert.deepEqual(source, before);
  source.facts.creditedTokenAmount = "999";
  source.evidence.payload.facts.creditedTokenAmount = "999";
  assert.equal(result.event.payload.sourceObservation.facts.creditedTokenAmount, "500");
  assert.throws(() => result.event.finalityStatus = "finalized", TypeError);
  assert.throws(() => result.event.payload.sourceObservation.evidence.payload.facts.id = "8", TypeError);
});

test("later delivery time replays to the first source receipt without changing command identity", async () => {
  const first = await observed();
  const later = await observed({ clock: "2026-10-07T01:00:00.000Z" });
  assert.equal(convert(first).event.eventId, convert(later).event.eventId);
  assert.equal(convert(first).commandHash, convert(later).commandHash);
  assert.notEqual(convert(first).event.payloadHash, convert(later).event.payloadHash);
  const initial = batch([first]);
  const replayed = batch([later], JSON.parse(JSON.stringify(initial.records)));
  assert.equal(replayed.events.length, 0);
  assert.equal(replayed.results[0].disposition, "replayed");
  assert.deepEqual(replayed.records, initial.records);
  assert.equal(replayed.records[0].event.payload.sourceObservation.observedAt, FIRST_TIME);
});

test("duplicate delivery within one batch prepares only the first immutable receipt", async () => {
  const first = await observed();
  const later = await observed({ clock: "2026-10-07T01:00:00.000Z" });
  const result = batch([first, later, first]);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.results.map(({ disposition }) => disposition), ["prepared", "replayed", "replayed"]);
  assert.deepEqual(result.records[0], convert(first));
});

test("conflicting facts for an event tuple reject the whole preparation without changing prior records", async () => {
  const first = await observed();
  const conflict = await observed({ logs: [eventLog("LOCRedeemed", 0, {}, { creditedTokenAmount: 501n })] });
  const unrelated = await observed({ logs: [eventLog("LOCCanceled", 1)] });
  const prior = JSON.parse(JSON.stringify(batch([first]).records));
  const before = structuredClone(prior);
  assert.throws(() => batch([unrelated, conflict], prior), { code: "anvil_pending_conflict" });
  assert.deepEqual(prior, before);
  assert.throws(() => batch([first, conflict]), { code: "anvil_pending_conflict" });
});

test("conflicting same-block LOC snapshots fail, while distinct LOC IDs remain distinct", async () => {
  const first = await reader().readLOC({ locId: "7", blockHash: BLOCK_HASH });
  const conflict = await reader({ state: { ...STATE, creditedTokenAmount: 901n } }).readLOC({ locId: "7", blockHash: BLOCK_HASH });
  assert.throws(() => batch([conflict], batch([first]).records), { code: "anvil_pending_conflict" });
  const other = await reader().readLOC({ locId: "8", blockHash: BLOCK_HASH });
  assert.equal(batch([first, other]).records.length, 2);
});

test("recovery rejects another tenant or modified candidate metadata", async () => {
  const source = await observed();
  const prior = batch([source]).records;
  assert.throws(() => batch([], prior, { tenantId: "tenant_other" }), { code: "anvil_pending_tenant_mismatch" });
  for (const mutate of [
    (record) => record.event.finalityStatus = "finalized",
    (record) => delete record.event.finalityStatus,
    (record) => record.event.payloadHash = TX,
    (record) => record.commandHash = TX,
    (record) => record.aggregateId = TX,
    (record) => record.event.eventId = TX,
    (record) => record.sourceSystem = "verified_credit"
  ]) {
    const changed = structuredClone(prior);
    mutate(changed[0]);
    assert.throws(() => batch([], changed), { code: "anvil_pending_invalid_hash" });
  }
});

test("bounded replay windows accept exactly 128 unique records and reject input or union overflow", async () => {
  const instance = reader();
  const observations = await Promise.all(Array.from({ length: 128 }, (_, index) => instance.readLOC({ locId: String(index + 1), blockHash: BLOCK_HASH })));
  const full = batch(observations);
  assert.equal(full.records.length, ANVIL_PENDING_BATCH_LIMITS.maxRecords);
  assert.ok(full.payloadBytes <= ANVIL_PENDING_BATCH_LIMITS.maxBatchPayloadBytes);
  assert.equal(batch([], JSON.parse(JSON.stringify(full.records))).events.length, 0);
  assert.throws(() => batch([...observations, observations[0]]), { code: "anvil_pending_batch_limit" });
  assert.throws(() => batch([], [...full.records, full.records[0]]), { code: "anvil_pending_batch_limit" });
  const extra = await instance.readLOC({ locId: "129", blockHash: BLOCK_HASH });
  assert.throws(() => batch([extra], full.records), { code: "anvil_pending_batch_limit" });
});

test("oversized, cyclic, hidden, accessor and malformed recovery data fail without executing input code", async () => {
  const source = await observed();
  assert.throws(() => convert({ ...source, sourceRef: "x".repeat(65_537) }), { code: "anvil_pending_size_limit" });
  let calls = 0;
  const accessor = structuredClone(source);
  Object.defineProperty(accessor.facts, "id", { enumerable: true, get() { calls++; return "7"; } });
  assert.throws(() => convert(accessor), { code: "anvil_pending_invalid_shape" });
  const cyclic = structuredClone(source);
  cyclic.facts.cycle = cyclic;
  assert.throws(() => convert(cyclic), { code: "anvil_pending_invalid_shape" });
  const hidden = structuredClone(source);
  Object.defineProperty(hidden, "obligationId", { value: "hidden" });
  assert.throws(() => convert(hidden), { code: "anvil_pending_invalid_shape" });
  const entries = [source];
  Object.defineProperty(entries, "0", { enumerable: true, get() { calls++; return source; } });
  assert.throws(() => batch(entries), { code: "anvil_pending_invalid_shape" });
  const sparse = Array(1);
  sparse.extra = source;
  assert.throws(() => batch(sparse), { code: "anvil_pending_invalid_shape" });
  for (const value of [null, [], "invalid", 7]) {
    assert.throws(() => convert(value), { name: "DomainError" });
    assert.throws(() => batch([], [value]), { name: "DomainError" });
  }
  assert.equal(calls, 0);
});
