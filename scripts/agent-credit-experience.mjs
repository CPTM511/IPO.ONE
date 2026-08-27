import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createReferenceEconomicAgent } from "../packages/reference-economic-agent/src/index.js";
import { createAgentCreditExecutionRuntime } from "../modules/agent-credit-execution/src/index.js";

const HOST = process.env.IPO_ONE_AGENT_CREDIT_HOST ?? "127.0.0.1";
const PORT = Number(process.env.IPO_ONE_AGENT_CREDIT_PORT ?? 4177);
const CLOCK = new Date("2026-08-14T08:00:00.000Z").getTime();

function response(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

export async function runScenario(name) {
  const healthy = name === "healthy";
  if (!healthy && name !== "loss") throw new Error("unknown_scenario");
  const suffix = randomUUID().replaceAll("-", "");
  const runtime = createAgentCreditExecutionRuntime({
    clock: () => CLOCK,
    finalEquityMinor: healthy ? "1100" : "960"
  });
  const agent = createReferenceEconomicAgent({
    economicAgentWallet: `local_economic_agent_${suffix}`,
    creditProvider: runtime.creditProvider,
    executionVenue: runtime.executionVenue
  });
  const result = await agent.run({
    requestedPrincipalMinor: "1000",
    runId: `agent_credit_experience_${suffix}`
  });
  const observed = runtime.inspect();
  return {
    scenario: name,
    mode: "L0_LOCAL_NO_FUNDS",
    stage: observed.state.stage,
    facilityId: result.facility.facilityId,
    executionCount: observed.executionSubmissionCount,
    reconciliationStatus: observed.state.reconciliation.status,
    appliedPrincipalMinor: result.repayment.appliedPrincipalMinor,
    outstandingPrincipalMinor: result.repayment.outstandingPrincipalMinor,
    residualReleaseMinor: result.repayment.residualReleaseMinor,
    creditState: result.performance.creditState,
    creditOutcomeStatus: result.creditOutcome.status,
    creditOutcomeLabel:
      result.creditOutcome.creditOutcome?.outcomeLabel ?? "not_terminal",
    creditOutcomeHash:
      result.creditOutcome.creditOutcome?.outcomeHash ?? null,
    sharedCreditStateStatus: result.creditState.status,
    sharedCreditStateHash:
      result.creditState.creditState?.creditStateHash ?? null,
    sharedCreditStateVersion:
      result.creditState.creditState?.projectionVersion ?? 0,
    creditStateAuthorizing: result.creditState.authorizing,
    automaticLimitChange: result.creditState.automaticLimitChange,
    collateralRelief: result.creditState.collateralRelief,
    riskState: result.performance.riskState,
    evidenceCount: result.evidence.count,
    agentCustody: result.account.agentCustody,
    withdrawalAuthority: result.account.withdrawalAuthority,
    transferAuthority: result.account.transferAuthority,
    externalOrderSubmitted: false,
    realFundsMoved: false,
    mainnetInteraction: false,
    testnetAssetUsed: false
  };
}

const PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IPO.ONE M2B-004 Agent Repayment and Credit State</title>
<style>
:root{color-scheme:dark;--bg:#07110e;--panel:#0d1b16;--line:#234438;--ink:#eefbf5;--muted:#99b9ac;--mint:#74f0bd;--amber:#ffd47a;--red:#ff8f8f}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#173429 0,transparent 35%),var(--bg);font:15px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink)}main{width:min(1080px,calc(100% - 32px));margin:0 auto;padding:54px 0 70px}.eyebrow{color:var(--mint);letter-spacing:.16em;text-transform:uppercase}h1{max-width:760px;font:600 clamp(36px,7vw,76px)/.98 Inter,system-ui,sans-serif;letter-spacing:-.05em;margin:16px 0}.lead{max-width:720px;color:var(--muted);font:18px/1.65 Inter,system-ui,sans-serif}.truth{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0}.chip{border:1px solid var(--line);background:#0a1712;border-radius:999px;padding:8px 12px;color:var(--muted)}.chip b{color:var(--mint)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:34px}.card{border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#0f211a,#091510);padding:22px}.card h2{font:600 22px Inter,system-ui,sans-serif;margin:0 0 8px}.card p{color:var(--muted);min-height:48px}.loss h2{color:var(--amber)}button{appearance:none;border:0;border-radius:10px;background:var(--mint);color:#06110d;font:700 14px ui-monospace,monospace;padding:12px 16px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.loss button{background:var(--amber)}pre{margin:18px 0 0;min-height:270px;white-space:pre-wrap;word-break:break-word;border-top:1px solid var(--line);padding-top:18px;color:#cde4da}.path{margin-top:22px;padding:20px;border:1px solid var(--line);border-radius:14px;color:var(--muted)}.path strong{color:var(--ink)}@media(max-width:760px){.grid{grid-template-columns:1fr}main{padding-top:34px}}
</style></head><body><main>
<p class="eyebrow">M2B-004 · Founder / Risk Review</p><h1>Agent Repayment → Shared Credit State</h1>
<p class="lead">外部 Agent 只通过可替换的 CreditProvider / ExecutionVenue 接口，完成授信、受控执行、对账、优先还款与证据回写。全额还款后才生成共享终局 Credit Outcome 与非授权 Credit State。这里运行的是确定性 L0 模拟，不连接 Testnet，不移动资金。</p>
<div class="truth"><span class="chip"><b>L0</b> no funds</span><span class="chip"><b>BTC</b> bounded intent</span><span class="chip"><b>1×</b> leverage cap</span><span class="chip"><b>false</b> custody / withdraw / transfer</span></div>
<div class="grid">
<section class="card"><h2>终局闭环</h2><p>最终权益 1,100；本金 1,000 先回款，剩余 100 后释放，再生成终局 Outcome / Credit State。</p><button data-scenario="healthy">运行终局流程</button><pre id="healthy">等待运行…</pre></section>
<section class="card loss"><h2>未终局亏损</h2><p>最终权益 960；部分回款后保留 40 未偿，不生成正向终局 Outcome，也不伪装为已结清。</p><button data-scenario="loss">运行亏损流程</button><pre id="loss">等待运行…</pre></section>
</div>
<div class="path"><strong>实际路径</strong><br>External Agent → authenticate → CreditIntent → Capital Partner Offer → Facility → controlled account → open/close → reconcile → canonical repayment → terminal Credit Outcome → shared Credit State<br><br><strong>权限边界</strong><br>Credit State 仅记录已终局结果，不自动提高额度、不释放抵押、不解冻风险，也不授权新资金。</div>
</main><script>
const labels={stage:'生命周期',facilityId:'Facility',executionCount:'受控执行数',reconciliationStatus:'对账',appliedPrincipalMinor:'已还本金',outstandingPrincipalMinor:'未偿本金',residualReleaseMinor:'后释放余额',creditState:'偿还状态',creditOutcomeStatus:'Outcome 终局',creditOutcomeLabel:'Outcome 结果',sharedCreditStateStatus:'共享状态',sharedCreditStateVersion:'状态版本',creditStateAuthorizing:'状态可授权',automaticLimitChange:'自动改额度',collateralRelief:'自动释抵押',riskState:'RiskState',evidenceCount:'证据数',agentCustody:'Agent 托管',withdrawalAuthority:'提款权限',transferAuthority:'转账权限',realFundsMoved:'真实资金',mainnetInteraction:'主网交互',testnetAssetUsed:'Testnet 资产'};
for(const button of document.querySelectorAll('button'))button.addEventListener('click',async()=>{const scenario=button.dataset.scenario;const target=document.getElementById(scenario);button.disabled=true;target.textContent='运行中…';try{const res=await fetch('/api/run?scenario='+scenario,{method:'POST'});const data=await res.json();if(!res.ok)throw new Error(data.error);target.textContent=Object.entries(labels).map(([key,label])=>label.padEnd(12,' ')+' '+String(data[key])).join('\\n')}catch(error){target.textContent='FAIL '+error.message}finally{button.disabled=false}});
</script></body></html>`;

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") {
    response(res, 200, PAGE, "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204, { "cache-control": "no-store" });
    res.end();
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run") {
    try {
      response(
        res,
        200,
        JSON.stringify(await runScenario(url.searchParams.get("scenario"))),
        "application/json; charset=utf-8"
      );
    } catch (error) {
      response(res, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
    }
    return;
  }
  response(res, 404, "not found", "text/plain; charset=utf-8");
});

export function startAgentCreditExperience() {
  return server.listen(PORT, HOST, () => {
    console.log(`AGENT_CREDIT_EXPERIENCE http://${HOST}:${PORT}/`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startAgentCreditExperience();
}
