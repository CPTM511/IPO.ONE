import assert from "node:assert/strict";
import test from "node:test";
import { acceptCreditSnapshot, createCreditSnapshotLoader, creditSnapshotPresentation } from "../src/credit-snapshot-browser.js";
import { readOwnCreditStateQueryHandler } from "../../../modules/tenant-command-gateway/src/credit-state-query-handlers.js";

const view = subjectId => ({ schemaVersion: "tenant_owned_credit_state_view.v1", asOf: "2026-10-12T00:00:00.000Z",
  lastRefreshAttemptAt: "2026-10-11T23:45:00.000Z", creditState: {
    subjectId, schemaVersion: "credit_state_projection.v1", creditStateHash: `0x${"1".repeat(64)}`,
    updatedAt: "2026-10-11T00:00:00.000Z", projectionVersion: 1, metrics: { completedCycleCount: 1 },
    trackRecord: [{}], latestOutcome: { outcomeLabel: "on_time_repaid" }, factors: {},
    authorizing: false, automaticLimitChange: false, fundsAuthority: false, piiIncluded: false,
    productionAuthority: false, productionFundsMoved: false, rawTransactionDataIncluded: false,
    scoreAuthoritative: false, sandboxOnly: true
  } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("empty credit read keeps its existing response shape and worker metadata is explicit opt-in", async () => {
  const original = view("subject_one");
  const execute = payload => readOwnCreditStateQueryHandler().execute({
    client: { async query(sql) { return sql.startsWith("SELECT p.projection") ? { rowCount: 1, rows: [{
      projection: original.creditState, as_of: new Date(original.asOf), complete: true,
      last_refresh_attempt_at: new Date(original.lastRefreshAttemptAt)
    }] } : { rowCount: 0, rows: [] }; } },
    resource: { resourceType: "subject", resourceId: "subject_one" }, payload, now: new Date(original.asOf)
  });
  assert.deepEqual(Object.keys(await execute({})).sort(), ["asOf", "creditState", "schemaVersion"]);
  assert.equal((await execute({ includeRefreshMetadata: true })).lastRefreshAttemptAt, original.lastRefreshAttemptAt);
  assert.equal("lastRefreshAttemptAt" in await execute({ includeRefreshMetadata: false }), false);
  await assert.rejects(execute({ includeRefreshMetadata: "true" }), { code: "tenant_resource_unavailable" });
});

test("credit snapshots validate Subject, time, complete counts and non-authorizing flags", () => {
  assert.equal(acceptCreditSnapshot(view("subject_one"), "subject_one").creditState.subjectId, "subject_one");
  for (const change of [v => { v.creditState.subjectId = "subject_other"; }, v => { v.asOf = "invalid"; },
    v => { v.creditState.updatedAt = "2026-10-13T00:00:00.000Z"; }, v => { v.creditState.trackRecord = []; }, v => { v.lastRefreshAttemptAt = "2026-10-13T00:00:00.000Z"; },
    v => { v.creditState.fundsAuthority = true; }]) {
    const candidate = view("subject_one"); change(candidate);
    assert.throws(() => acceptCreditSnapshot(candidate, "subject_one"));
  }
});

for (const late of ["success", "failure"]) {
  test(`identity/Subject change discards late snapshot ${late} without ending a newer read`, async () => {
    let context = { epoch: 1, subjectId: "subject_one" };
    const state = {};
    const first = deferred(), second = deferred();
    let reads = 0;
    const notifications = [];
    const loader = createCreditSnapshotLoader({ state, getContext: () => context,
      read: () => (++reads === 1 ? first.promise : second.promise), render() {},
      notify: text => notifications.push(text), onAuthenticationError() { assert.fail("stale error reached authentication handler"); } });
    const oldRead = loader.load();
    context = { epoch: 2, subjectId: "subject_two" };
    loader.synchronize();
    assert.equal(state.projection, null);
    const newRead = loader.load();
    if (late === "success") first.resolve(view("subject_one")); else first.reject(new Error("stale private error"));
    await oldRead;
    assert.equal(state.busy, true);
    assert.equal(state.projection, null);
    assert.deepEqual(notifications, []);
    second.resolve(view("subject_two")); await newRead;
    assert.equal(state.busy, false);
    assert.equal(state.projection.subjectId, "subject_two");
    assert.equal(notifications.length, 1);
  });
}

test("snapshot reload clears old values and distinguishes wait, empty, resource and transport failures", async () => {
  const state = {}; let failure;
  const notifications = [];
  const loader = createCreditSnapshotLoader({ state, getContext: () => ({ epoch: 1, subjectId: "subject_one" }),
    read: async () => { if (failure) throw Object.assign(new Error("private server detail"), { code: failure }); return view("subject_one"); },
    render() { if (state.busy) { assert.equal(state.projection, null); assert.equal(state.asOf, null); } },
    notify: message => notifications.push(message), onAuthenticationError() {} });
  await loader.load();
  assert.match(creditSnapshotPresentation(state).copy, /15 minutes/);
  assert.match(creditSnapshotPresentation(state).copy, /Last successful worker attempt/);
  for (const [code, label] of [["credit_state_projection_incomplete", "Awaiting complete refresh"],
    ["credit_state_resource_limit", "Refresh blocked"], ["credit_state_no_finalized_outcomes", "No finalized outcomes"],
    ["gateway_unavailable", "Read failed"]]) {
    failure = code; await loader.load();
    assert.equal(state.projection, null); assert.equal(state.asOf, null);
    assert.equal(creditSnapshotPresentation(state).label, label);
    assert.doesNotMatch(creditSnapshotPresentation(state).copy, /private server detail/);
    assert.doesNotMatch(notifications.at(-1), /previous snapshot is cleared while this read/i);
  }
});
