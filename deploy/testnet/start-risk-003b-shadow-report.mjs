import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ARTIFACT =
  "artifacts/risk-003b/risk-003b-shadow-run-20260901-001.json";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (index === process.argv.length - 1) {
    throw new Error(`${name} requires a value`);
  }
  return process.argv[index + 1];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percentFromBps(value) {
  return `${(Number(value) / 100).toFixed(2)}%`;
}

function page(report) {
  const features = report.featureSnapshot.outcomeFeatures;
  const outcome = report.outcomeLabel;
  const challenger = report.challenger;
  const offline = report.offlineReport;
  const missing = offline.missingness
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IPO.ONE RISK-003B Shadow Report</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#071018;color:#edf6ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#12304a 0,transparent 35%),#071018}main{max-width:1080px;margin:auto;padding:48px 22px 80px}.eyebrow{color:#66e3c4;letter-spacing:.13em;text-transform:uppercase;font:700 13px/1.4 ui-monospace,monospace}h1{font-size:clamp(38px,7vw,72px);line-height:.98;letter-spacing:-.05em;margin:14px 0 18px}.lead{font-size:18px;line-height:1.6;color:#bcd0df;max-width:800px}.banner{border:1px solid #2d856f;background:#0c2b2a;padding:16px 18px;border-radius:14px;margin:28px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{border:1px solid #29445c;background:#0b1824;padding:20px;border-radius:16px}.label{color:#8da8bc;font-size:13px}.value{font-size:28px;font-weight:750;margin-top:7px}.warn{color:#ffd38a}.good{color:#74e7c3}section{margin-top:34px}h2{font-size:22px}table{width:100%;border-collapse:collapse;background:#0b1824;border-radius:14px;overflow:hidden}th,td{text-align:left;padding:13px;border-bottom:1px solid #20364a}th{color:#8da8bc;font-weight:600}code{font-family:ui-monospace,monospace;color:#b6f3e3;overflow-wrap:anywhere}details{margin-top:24px;border:1px solid #29445c;border-radius:14px;padding:15px;background:#0b1824}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#bcd0df}.foot{color:#7892a5;margin-top:32px;font-size:13px}@media(max-width:640px){main{padding-top:30px}th,td{display:block}th{padding-bottom:0;border:0}}
</style></head><body><main>
<p class="eyebrow">RISK-003B · SHADOW ONLY · NON-AUTHORIZING</p>
<h1>Finalized Testnet<br>Shadow Learning</h1>
<p class="lead">一条已终局、已对账的 Hyperliquid Testnet 结果已进入影子评估。报告保留真实的未结清损失，但不会修改现行授信政策、Offer、额度、定价或外部执行权限。</p>
<div class="banner"><strong class="good">影子运行成功</strong> · Active policy hash 前后一致 · 任何模型提升和自动应用均关闭</div>
<div class="grid">
  <article class="card"><div class="label">样本量</div><div class="value">${offline.sampleSize}</div></article>
  <article class="card"><div class="label">还款比例</div><div class="value">${percentFromBps(outcome.repaymentRatioBps)}</div></article>
  <article class="card"><div class="label">未结清损失</div><div class="value warn">${escapeHtml(outcome.outstandingPrincipalMinor)} minor</div></article>
  <article class="card"><div class="label">Challenger</div><div class="value warn">Insufficient sample</div></article>
</div>
<section><h2>点时结果</h2><table>
<tr><th>Outcome label</th><td><code>${escapeHtml(outcome.label)}</code></td></tr>
<tr><th>Utilization</th><td>${percentFromBps(features.utilizationBps)}</td></tr>
<tr><th>Effective leverage</th><td>${percentFromBps(features.effectiveLeverageBps)} of 1x</td></tr>
<tr><th>Reconciliation quality</th><td>${percentFromBps(features.reconciliationQualityBps)}</td></tr>
<tr><th>Unknown / intervention</th><td>${features.unknownOutcomeCount} / ${features.manualInterventionCount}</td></tr>
<tr><th>Uncertainty</th><td><code>${escapeHtml(offline.uncertainty)}</code></td></tr>
</table></section>
<section><h2>Challenger verdict</h2><div class="card"><p><strong>${escapeHtml(challenger.recommendation)}</strong></p><p>${challenger.reasonCodes.map(escapeHtml).join(" · ")}</p><p>Promotion: <code>${escapeHtml(challenger.promotionState)}</code> · autoApplied: <code>false</code> · proposed policy change: <code>null</code></p></div></section>
<section><h2>明确缺失</h2><div class="card"><ul>${missing}</ul><p>单个 Testnet 样本不支持生产有效性、校准、漂移、误批或误拒结论。</p></div></section>
<details><summary>高级 Evidence</summary><pre>${escapeHtml(JSON.stringify({shadowRunHash:report.shadowRunHash,sourceManifestHash:report.sourceManifest.sourceManifestHash,featureSnapshotHash:report.featureSnapshot.featureSnapshotHash,outcomeLabelHash:report.outcomeLabel.outcomeLabelHash,challengerHash:challenger.challengerHash,offlineReportHash:offline.offlineReportHash,activePolicyHashBefore:report.activePolicyHashBefore,activePolicyHashAfter:report.activePolicyHashAfter,schemaVersion:report.schemaVersion},null,2))}</pre></details>
<p class="foot">No PII · No raw credentials · No mainnet · No real value · No policy mutation</p>
</main></body></html>`;
}

export async function startRisk003BShadowReport({
  cwd = process.cwd(),
  artifactPath = DEFAULT_ARTIFACT,
  port = 4195
} = {}) {
  const report = JSON.parse(await readFile(resolve(cwd, artifactPath), "utf8"));
  if (
    report.schemaVersion !== "risk_003b_shadow_run.v1" ||
    report.issueId !== "RISK-003B" ||
    report.mode !== "shadow" ||
    report.activePolicyUnchanged !== true ||
    report.authorizing !== false
  ) {
    throw new Error("risk_003b_report_invalid: artifact is not safe to serve");
  }
  const html = page(report);
  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "ok", issueId: "RISK-003B", mode: "shadow", authorizing: false }));
      return;
    }
    if (request.url === "/report.json") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(report));
      return;
    }
    if (request.url !== "/") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    if (request.method === "HEAD") response.end();
    else response.end(html);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = await startRisk003BShadowReport({
    cwd: argument("--cwd", process.cwd()),
    artifactPath: argument("--artifact", DEFAULT_ARTIFACT),
    port: Number(argument("--port", "4195"))
  });
  process.stdout.write(`RISK-003B shadow report ready at ${host.url}\n`);
}
