import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  RISK_003B_APPROVAL_MARKER,
  runRisk003BFinalizedTestnetShadow
} from "../risk-003b-shadow-run.mjs";
import { startRisk003BShadowReport } from "../start-risk-003b-shadow-report.mjs";

const execFileAsync = promisify(execFile);
const cwd = resolve(new URL("../../..", import.meta.url).pathname);
const artifactPath =
  "artifacts/risk-003b/risk-003b-shadow-run-20260901-001.json";
const evaluatedAt = "2026-09-01T02:33:27.000Z";

test("RISK-003B exact runner reproduces the committed shadow result", async () => {
  const expected = JSON.parse(await readFile(resolve(cwd, artifactPath), "utf8"));
  const result = await runRisk003BFinalizedTestnetShadow({ cwd, evaluatedAt });

  assert.deepEqual(result, expected);
  assert.equal(
    result.shadowRunHash,
    "0x30989bd247b0e355f29f26331e30df7e3e52af405a607b12bfe6189d20b780a2"
  );
  assert.equal(result.activePolicyUnchanged, true);
  assert.equal(result.externalActionPerformed, false);
});

test("RISK-003B CLI requires the exact approval marker", async () => {
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "deploy/testnet/risk-003b-shadow-run.mjs",
        "--cwd",
        cwd,
        "--evaluated-at",
        evaluatedAt
      ],
      {
        cwd,
        env: {
          ...process.env,
          IPO_ONE_APPROVE_RISK_003B_SHADOW_RUN: ""
        }
      }
    ),
    /exact shadow-run approval is required/
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "deploy/testnet/risk-003b-shadow-run.mjs",
      "--cwd",
      cwd,
      "--evaluated-at",
      evaluatedAt
    ],
    {
      cwd,
      env: {
        ...process.env,
        IPO_ONE_APPROVE_RISK_003B_SHADOW_RUN: RISK_003B_APPROVAL_MARKER
      }
    }
  );
  assert.match(stdout, /^RISK_003B_SHADOW_RUN /);
  assert.match(stdout, /"activePolicyUnchanged":true/);
});

test("RISK-003B runner rejects source-byte drift before domain admission", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ipo-one-risk-003b-"));
  const sourceDirectory = join(temporary, "artifacts", "testnet");
  await mkdir(sourceDirectory, { recursive: true });
  const original = await readFile(
    resolve(
      cwd,
      "artifacts/testnet/hl-testnet-001b-live-20260901-001.json"
    ),
    "utf8"
  );
  await writeFile(
    join(sourceDirectory, "hl-testnet-001b-live-20260901-001.json"),
    `${original.trim()}\n `,
    "utf8"
  );
  await assert.rejects(
    runRisk003BFinalizedTestnetShadow({ cwd: temporary, evaluatedAt }),
    /source SHA-256 mismatch/
  );
});

test("RISK-003B local report is read-only, aggregate and queryable", async (t) => {
  const host = await startRisk003BShadowReport({
    cwd,
    artifactPath,
    port: 0
  });
  t.after(() => new Promise((resolveClose) => host.server.close(resolveClose)));

  const [page, health, report] = await Promise.all([
    fetch(`${host.url}/`),
    fetch(`${host.url}/health`),
    fetch(`${host.url}/report.json`)
  ]);
  const html = await page.text();
  const healthBody = await health.json();
  const reportBody = await report.json();

  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'none'/
  );
  assert.match(html, /Shadow Learning/);
  assert.match(html, /Insufficient sample/);
  assert.match(html, /No PII/);
  assert.equal(html.includes("subject_52fe853c"), false);
  assert.deepEqual(healthBody, {
    status: "ok",
    issueId: "RISK-003B",
    mode: "shadow",
    authorizing: false
  });
  assert.equal(
    reportBody.shadowRunHash,
    "0x30989bd247b0e355f29f26331e30df7e3e52af405a607b12bfe6189d20b780a2"
  );
  assert.equal(reportBody.authorizing, false);

  const mutation = await fetch(`${host.url}/`, { method: "POST" });
  assert.equal(mutation.status, 405);
});
