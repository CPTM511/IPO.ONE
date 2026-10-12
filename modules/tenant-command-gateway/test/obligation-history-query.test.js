import assert from "node:assert/strict";
import test from "node:test";
import { parseObligationHistory, readObligationHistory } from "../src/obligation-history-query.js";
import { readWorkspaceResumeQueryHandler } from "../src/workspace-resume-handlers.js";

const context = { tenantId: "tenant_one", actorId: "actor_one", roles: ["human_borrower"], capabilities: ["obligation.read.owned"] };
const now = new Date("2026-10-12T00:00:00.000Z");
const row = id => ({ id, state: "fully_repaid", created_at: "2026-10-11T00:00:00.000456Z", as_of: now });
function input(rows = [row("obligation_z"), row("obligation_y")]) {
  const calls = [];
  return { calls, client: { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM obligations o")) return { rows, rowCount: rows.length };
    return { rows: [{ actor_id: "agent_one", as_of: now }], rowCount: 1 };
  } }, directory: {
    async requireActiveMembership() { return { capabilities: ["obligation.read.owned"] }; },
    async resolveResource() { return { status: "active", actorAuthorized: true, bindingRelationship: "owner" }; }
  },
    authenticationContext: context, kind: "human_borrower", now, history: parseObligationHistory({ subjectId: "subject_one", limit: 1 }) };
}

test("history is a bounded discovery page using existing workspace read and exact Subject scope", async () => {
  const args = input();
  const result = await readWorkspaceResumeQueryHandler().execute({ ...args, payload: { obligationHistory: { subjectId: "subject_one", limit: 1 } } });
  assert.equal(result.schemaVersion, "tenant_workspace_resume_view.v2");
  assert.equal(result.obligationHistory.items.length, 1);
  assert.equal(result.obligationHistory.hasMore, true);
  assert.equal(result.obligationHistory.nonAuthorizing, true);
  const sql = args.calls.find(call => call.sql.includes("FROM obligations o"));
  assert.deepEqual(sql.values.slice(0, 4), ["tenant_one", "subject_one", "actor_one", "owner"]);
  assert.equal(sql.values.at(-1), 2);
  assert.match(sql.sql, /b.status = 'active' AND r.status = 'active'/);
  assert.match(sql.sql, /FOR SHARE OF b, r/);
  assert.deepEqual(result.resources, []);
  assert.equal("metrics" in result.obligationHistory, false);
});

test("history cursors preserve microseconds and reject changed identity, Subject, role or filters", async () => {
  const args = input();
  const first = await readObligationHistory(args);
  const cursor = first.nextCursor;
  const next = input([row("obligation_y")]); next.history.cursor = cursor;
  assert.equal((await readObligationHistory(next)).hasMore, false);
  assert.equal(next.calls.at(-1).values[7], "2026-10-11T00:00:00.000456Z");
  for (const change of [a => { a.authenticationContext = { ...context, tenantId: "tenant_other" }; },
    a => { a.authenticationContext = { ...context, actorId: "actor_other" }; }, a => { a.history.subjectId = "subject_other"; },
    a => { a.history.state = "written_off"; }, a => { a.history.createdFrom = "2026-10-01T00:00:00.000Z"; },
    a => { a.kind = "agent_runtime"; a.directory.resolveResource = async () => ({ status: "active", actorAuthorized: true, bindingRelationship: "subject" }); }]) {
    const candidate = input(); candidate.history.cursor = cursor; change(candidate);
    await assert.rejects(readObligationHistory(candidate), { code: "invalid_tenant_command_payload" });
  }
});

test("history rejects missing authority, wrong Subject relationship, malformed input and unselected Principal", async () => {
  for (const payload of [{ subjectId: "bad id" }, { subjectId: "subject_one", actorId: "actor_other" },
    { subjectId: "subject_one", limit: 51 }, { subjectId: "subject_one", state: "unknown" },
    { subjectId: "subject_one", createdFrom: "2026-02-31T00:00:00.000Z" },
    { subjectId: "subject_one", createdFrom: "2026-10-12T00:00:00.000Z", createdBefore: "2026-10-01T00:00:00.000Z" }]) {
    assert.throws(() => parseObligationHistory(payload), { code: "invalid_tenant_command_payload" });
  }
  for (const change of [a => { a.authenticationContext = { ...context, capabilities: [] }; },
    a => { a.directory.requireActiveMembership = async () => ({ capabilities: ["workspace.resume.self"] }); },
    a => { a.directory.resolveResource = async () => undefined; },
    a => { a.directory.resolveResource = async () => ({ status: "active", actorAuthorized: true, bindingRelationship: "controller" }); },
    a => { a.kind = "principal_controller"; a.directory.resolveResource = async () => ({ status: "active", actorAuthorized: true, bindingRelationship: "controller" }); }]) {
    const candidate = input(); change(candidate);
    await assert.rejects(readObligationHistory(candidate), { code: "tenant_resource_unavailable" });
    assert.equal(candidate.calls.some(call => call.sql.includes("FROM obligations o")), false);
  }
});

test("history normalizes RFC3339 offsets and fractions without rounding microseconds", () => {
  for (const [value, expected] of [
    ["2026-10-01T00:00:00Z", "2026-10-01T00:00:00.000000Z"],
    ["2026-10-01T01:00:00.000456+01:00", "2026-10-01T00:00:00.000456Z"],
    ["2026-09-30T23:00:00.1-01:00", "2026-10-01T00:00:00.100000Z"]
  ]) assert.equal(parseObligationHistory({ subjectId: "subject_one", createdFrom: value }).createdFrom, expected);
  for (const value of ["2026-02-31T00:00:00Z", "2026-10-01T00:00:00+24:00", "2026-10-01T00:00:00.0000001Z"]) {
    assert.throws(() => parseObligationHistory({ subjectId: "subject_one", createdFrom: value }), { code: "invalid_tenant_command_payload" });
  }
  assert.throws(() => parseObligationHistory({ subjectId: "subject_one",
    createdFrom: "2026-10-01T01:00:00+01:00", createdBefore: "2026-10-01T00:00:00Z" }), { code: "invalid_tenant_command_payload" });
});
