import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const pg = createRequire(process.cwd() + "/package.json")("pg");

// Observe existing calls. Never preload SQL, alter a returned promise/callback,
// log SQL/values, or handle a custom Query object's error event.
const events = [], invocations = [], sqlFiles = new Map(), owners = new WeakMap();
const resourceStart = process.resourceUsage();
let origin, pending, sampling, sampler, busy = false, queryOrdinal = 0;
const offset = () => origin === undefined ? null : performance.now() - origin;
const emit = (kind, data) => events.push({ kind, offsetMs: offset(), ...data });
const originalRead = fs.promises.readFile;
const originalQuery = pg.Client.prototype.query;
const originalTimer = globalThis.setTimeout;
globalThis.setTimeout = function (callback, delay, ...args) {
  if (!(new Error().stack ?? "").split("\n")[2]?.includes("postgres-event-runtime.test.mjs:573:")) return Reflect.apply(originalTimer, this, [callback, delay, ...args]);
  const start = offset();
  return Reflect.apply(originalTimer, this, [function (...values) {
    emit("quota-window-wait", { startMs: start, requestedMs: delay, elapsedMs: offset() - start });
    return Reflect.apply(callback, this, values);
  }, delay, ...args]);
};
function startSampling() {
  sampler = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "ipo-one-diagnostic-observer" });
  sampler.connect().then(() => {
    sampler.connection.stream.unref();
    sampling = setInterval(async () => {
      if (busy) return;
      busy = true;
      const start = offset();
      try {
        const result = await Reflect.apply(originalQuery, sampler, ["SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocking_pids FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY pid"]);
        emit("database-waits", { startMs: start, elapsedMs: offset() - start, rows: result.rows });
      } catch (error) { emit("sampler-error", { code: error.code ?? error.name }); }
      finally { busy = false; }
    }, 250);
    sampling.unref();
  }, error => emit("sampler-error", { code: error.code ?? error.name }));
}
fs.promises.readFile = function (...args) {
  const path = String(args[0]);
  const migration = path.includes("/migrations/") && path.endsWith(".sql");
  if (migration && path.endsWith("0001_mvp_foundation.up.sql")) {
    if (origin === undefined) { origin = performance.now(); fs.writeSync(1, "DIAG_ORIGIN " + JSON.stringify({ epochMs: performance.timeOrigin + origin }) + "\n"); startSampling(); }
    const stack = new Error().stack ?? "";
    const type = stack.match(/(?:async )?(migrationStatus|migrateUp|migrateDown)\b/)?.[1] ?? "unknown";
    pending = { ordinal: invocations.length + 1, type, startMs: offset(), fileReads: 0, fileReadSumMs: 0, sqlSteps: 0, sqlSumMs: 0, transactionSumMs: 0, metadataSumMs: 0 };
    invocations.push(pending);
  }
  const invocation = migration ? pending : null, start = performance.now();
  const result = Reflect.apply(originalRead, this, args);
  if (migration) result.then(sql => {
    const elapsed = performance.now() - start;
    const name = path.split("/").at(-1), hash = createHash("sha256").update(sql).digest("hex");
    const names = sqlFiles.get(hash) ?? []; if (!names.includes(name)) names.push(name); sqlFiles.set(hash, names);
    if (invocation) { invocation.fileReads++; invocation.fileReadSumMs += elapsed; invocation.fileReadEndMs = offset(); }
  }, error => emit("migration-read-error", { code: error.code ?? error.name }));
  return result;
};
syncBuiltinESMExports();
pg.Client.prototype.query = function (...args) {
  const sql = typeof args[0] === "string" ? args[0] : args[0]?.text ?? "";
  if (/^SELECT pg_advisory_lock\(/.test(sql) && pending) { owners.set(this, pending); pending.lockStartMs = offset(); }
  const invocation = owners.get(this), names = sqlFiles.get(createHash("sha256").update(sql).digest("hex"));
  const reset = /^\s*TRUNCATE\b/i.test(sql);
  const category = names ? "migration-sql" : reset ? "fixture-reset" : invocation ? /^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql) ? "migration-transaction" : "migration-metadata" : "runtime-query";
  const start = offset(), startClock = performance.now(), ordinal = ++queryOrdinal, pid = this.processID;
  const resetKind = reset ? sql.includes("break_glass_reviews") ? "resetCoreRuntime" : sql.includes("abuse_command_charges") ? "resetAbuseRuntime" : "resetRuntime" : undefined;
  let done = false;
  const finish = (error) => {
    if (done) return; done = true;
    const elapsed = performance.now() - startClock;
    if (invocation) {
      if (category === "migration-sql") { invocation.sqlSteps++; invocation.sqlSumMs += elapsed; }
      else if (category === "migration-transaction") invocation.transactionSumMs += elapsed;
      else invocation.metadataSumMs += elapsed;
    }
    if (reset || elapsed >= 25 || category === "migration-sql" && error) emit("query", { ordinal, startMs: start, elapsedMs: elapsed, pid, category, resetKind, migrationInvocation: invocation?.ordinal, migrationNames: names, errorCode: error?.code });
    if (/^SELECT pg_advisory_unlock\(/.test(sql) && invocation) {
      invocation.endMs = offset(); invocation.elapsedMs = invocation.endMs - invocation.startMs;
      invocation.fileSpanMs = invocation.fileReadEndMs - invocation.startMs;
      owners.delete(this);
      emit("migration-invocation", invocation);
    }
  };
  const last = args.length - 1, callback = typeof args[last] === "function" ? args[last] : null;
  if (callback) args[last] = function (...values) { finish(values[0]); return Reflect.apply(callback, this, values); };
  try {
    const result = Reflect.apply(originalQuery, this, args);
    if (!callback && typeof result?.then === "function") result.then(() => finish(), error => finish(error));
    return result;
  } catch (error) { finish(error); throw error; }
};
process.once("exit", () => {
  clearInterval(sampling);
  if (origin === undefined) return;
  const name = process.env.IPO_ONE_DIAG_NAME ?? "smoke";
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid diagnostic file name");
  const directory = process.cwd() + "/.ipo-one/event-diagnostics";
  fs.mkdirSync(directory, { recursive: true });
  const summary = { originEpochMs: performance.timeOrigin + origin, queries: queryOrdinal, invocations, resourceStart, resourceEnd: process.resourceUsage(), note: "Observer preserves original promises, callbacks, arguments, order and errors. No SQL preload; diagnostic read-only sampling every 250 ms. Query timing includes client/scheduling; root acceptance remains original 60 s. No SQL, values, secrets or custom Query listeners. CPU resourceEnd is captured before trace serialization." };
  const lines = events.map(event => "DIAG_EVENT " + JSON.stringify(event));
  lines.push("DIAG_SUMMARY " + JSON.stringify(summary));
  const destination = `${directory}/${name}.${process.pid}.jsonl`;
  fs.writeFileSync(destination, lines.join("\n") + "\n");
  console.log("DIAG_FILE " + destination);
});
