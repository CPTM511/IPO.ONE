import { chromium, expect } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const out="output/playwright/web-027/j4";
await mkdir(out,{recursive:true});
const state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime";
const stage=process.argv[2]??"first";
const keyPath=state+"/web027j-"+stage+"-principal.json";
let wallet;try {wallet=JSON.parse(await readFile(keyPath));} catch(e) {if(e.code!=="ENOENT")throw e;wallet={privateKey:generatePrivateKey()};await writeFile(keyPath,JSON.stringify(wallet),{mode:0o600});}
const account=privateKeyToAccount(wallet.privateKey);
const browser=await chromium.launch({headless:true});
const actionEvidence=[],results=[];
const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source;
async function click(page, selector) {
  const control = page.locator(selector);
  await expect(control).toBeEnabled();
  const label = await control.innerText();
  await control.click();
  actionEvidence.push({ selector, label, at: new Date().toISOString() });
}
async function completeHumanRepayment(page) {
  const outstanding = await page.locator("#humanObligationOutstanding").innerText();
  expect(outstanding).toMatch(/^\$[\d,.]+$/);
  if (outstanding !== "$0.00") {
    await click(page, "#humanGuidePrimaryBtn");
    await page.locator("#humanRepaymentAmount").fill(outstanding.replace(/[$,]/g, ""));
    await click(page, "#postHumanRepaymentBtn");
    if (await page.locator("#accessLayer").isVisible()) {
      await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
      await page.locator("#walletSignInBtn").click();
      if (await page.locator("#accessLayer").isVisible()) await page.locator("#accessCloseBtn").click();
      await click(page, "#postHumanRepaymentBtn");
    }
    await expect(page.locator("#economicActionLayer")).toBeVisible();
    await click(page, "#economicActionConfirmBtn");
    await expect(page.locator("#humanObligationOutstanding")).toHaveText("$0.00");
  }
  await page.reload();
  await expect(page.locator("#humanObligationOutstanding")).toHaveText("$0.00");
  await page.screenshot({ path: out + "/durable-human-fully-repaid.png" });
}
async function humanLifecycle(page) {
  await click(page, "#humanGuideSecondaryBtn");
  await click(page, "#humanGuidePrimaryBtn");
  actionEvidence.push({ selector: "Create scoped Consent", label: "Create scoped Consent", at: new Date().toISOString() });
  await page.locator("#humanCreditAmount").fill("24.50");
  await writeFile(out + "/human-application-before-submit.txt", await page.locator("#mainContent").innerText());
  await expect(page.locator("#submitHumanCreditBtn")).toBeEnabled({ timeout: 5000 });
  await click(page, "#submitHumanCreditBtn");
  await expect(page.locator("#humanApplicationStatus")).toHaveText("Offer ready", { timeout: 20_000 });
  await page.locator("#humanOfferAcknowledge").check();
  await click(page, "#acceptHumanOfferBtn");
  if (await page.locator("#accessLayer").isVisible()) {
    await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
    if (await page.locator("#walletSignInBtn").isEnabled()) await page.locator("#walletSignInBtn").click();
    if (await page.locator("#accessLayer").isVisible()) await page.locator("#accessCloseBtn").click();
    await click(page, "#acceptHumanOfferBtn");
  }
  await expect(page.locator("#economicActionLayer")).toBeVisible();
  await click(page, "#economicActionConfirmBtn");
  await expect(page.locator("#humanObligationCard")).toBeVisible({ timeout: 20_000 });
  await click(page, "#executeHumanObligationBtn");
  await expect(page.locator("#economicActionLayer")).toBeVisible();
  await click(page, "#economicActionConfirmBtn");
  await expect(page.locator("#humanObligationExecution")).toContainText("Executed", { timeout: 20_000 });
  await page.locator("#humanRepaymentAmount").fill("2.50");
  await click(page, "#postHumanRepaymentBtn");
  await expect(page.locator("#economicActionLayer")).toBeVisible();
  await click(page, "#economicActionConfirmBtn");
  await expect(page.locator("#humanObligationRepaid")).toHaveText("$2.50", { timeout: 20_000 });
  await page.reload();
  await expect(page.locator("#humanObligationRepaid")).toHaveText("$2.50", { timeout: 20_000 });
  await page.screenshot({ path: out + "/durable-human-repayment.png" });
}
async function agentLifecycle(page) {
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  if (await page.locator("#createPrivateAgentSubjectBtn").isVisible()) {
    await page.locator("#agentAuthorityDisplayName").fill("WEB027 verification Agent");
    await click(page, "#createPrivateAgentSubjectBtn");
    await expect(page.locator("#createAccountChallengeBtn")).toBeVisible();
  }
  if (await page.locator("#createAccountChallengeBtn").isVisible()) {
    await click(page, "#createAccountChallengeBtn");
    await expect(page.locator("#proveAccountOnlineBtn")).toBeEnabled();
    await click(page, "#proveAccountOnlineBtn");
    await expect(page.locator("#agentAccountActivationStatus")).toContainText("active", { ignoreCase: true, timeout: 20_000 });
  }
  if (await page.locator("#createDraftMandateBtn").isVisible()) {
    await page.locator("#agentMandatePerActionLimit").fill("100");
    await page.locator("#agentMandateAggregateLimit").fill("500");
    await click(page, "#createDraftMandateBtn");
    await expect(page.locator("#agentAuthorityStatus")).toContainText("Draft", { timeout: 20_000 });
  }
  if ((await page.locator("#agentAuthorityStatus").innerText()).includes("Draft")) {
    await click(page, "#openAgentApplicationHandoffBtn");
    await expect(page.locator("#agentOnlineRunBtn")).toHaveText("Review and activate this Mandate", { timeout: 30_000 });
    await click(page, "#agentOnlineRunBtn");
    await expect(page.locator("#activateMandateBtn")).toBeDisabled();
    await page.locator("#principalMandateAcknowledge").check();
    await click(page, "#activateMandateBtn");
    await expect(page.locator("#agentAuthorityStatus")).toContainText("Active", { timeout: 20_000 });
  }
  await page.screenshot({ path: out + "/durable-agent-authority.png" });
  await click(page, "#continueAgentCreditBtn");
  if (await page.locator("#agentOnlineRunBtn").isVisible() && await page.locator("#agentOnlineRunBtn").isEnabled()) await click(page, "#agentOnlineRunBtn");
  await expect(page.locator("#agentOnlineReviewBtn")).toBeVisible({ timeout: 30_000 });
  await writeFile(out + "/durable-agent-result.txt", await page.locator("#mainContent").innerText());
  await page.screenshot({ path: out + "/durable-agent-result.png" });
  await click(page, "#agentOnlineReviewBtn");
  await expect(page.locator('[data-view-panel="obligations"]')).toBeVisible();
  await page.reload();
  await expect(page.locator("#obligationDetailStatus")).toContainText("Fully Repaid", { timeout: 20_000 });
  await writeFile(out + "/durable-agent-obligation-restored.txt", await page.locator("#mainContent").innerText());
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.locator("#agentOnlineRunBtn")).toHaveText("Verify Agent Evidence");
  const economicReplays = [];
  page.on("request", request => { if (request.url().endsWith("/local/v1/reference-agent/runtime")) economicReplays.push(request.url()); });
  await click(page,"#agentOnlineRunBtn");
  await expect(page.locator("#agentOnlineStatus")).toHaveText("Lifecycle verified", { timeout: 20_000 });
  expect(economicReplays).toEqual([]);
}
async function walletContext(account) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, reducedMotion: "reduce" });
  await context.exposeFunction("__web027QaSign", message => account.signMessage({ message: { raw: message } }));
  await context.addInitScript(({ address }) => {
    const provider = { async request({ method, params }) {
      if (["eth_requestAccounts", "eth_accounts"].includes(method)) return [address];
      if (method === "eth_chainId") return "0x14a34";
      if (["wallet_switchEthereumChain", "wallet_revokePermissions"].includes(method)) return null;
      if (method === "personal_sign") return window.__web027QaSign(params[0]);
      throw Object.assign(new Error("Test wallet rejects unsupported operations"), { code: 4200 });
    }, on() {}, removeListener() {} };
    window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
      info: { uuid: "02702702-7000-4000-8000-000000000001", name: "WEB027 isolated test wallet", rdns: "local.web027.test", icon: "data:image/png;base64,iVBORw0KGgo=" }, provider
    } })));
  }, { address: account.address });
  return context;
}
async function login(page, port, role) {
  await page.goto(`http://127.0.0.1:${port}/#${({controller:"agent-console",borrower:"request-credit",risk:"risk-operations",capitalPartner:"capital-partners"})[role]}`);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated", { timeout: 20_000 });
  await expect(page.locator("#accessLayer")).toBeHidden();
}

async function snapshot(page,name) {await page.screenshot({path:out+"/"+name+".png"});await writeFile(out+"/"+name+".txt",await page.locator("body").innerText());}
try {
 const context=await walletContext(account);const page=await context.newPage();
 const failures=[];page.on("pageerror",e=>failures.push(e.message));
 const responseErrors=[];page.on("response",async r=>{if(r.status()>=400 && (r.url().includes("/local/")||r.url().includes("/tenant/")||r.url().includes("/auth/"))) {let body;try{body=await r.json()}catch{}responseErrors.push({path:new URL(r.url()).pathname,status:r.status(),code:body?.code});}});
 try {
  await login(page,8936,"controller");
  await page.getByRole("button",{name:"Agents",exact:true}).click();
  if(await page.locator("#createLocalSandboxAgentBtn").isVisible()) {
    await click(page,"#createLocalSandboxAgentBtn");
    await expect(page.locator("#createAccountChallengeBtn")).toBeVisible({timeout:20000});
  }
  await snapshot(page,"created");
  await agentLifecycle(page);
  results.push({freshPrincipalLifecycle:true,fullyRepaid:true,visibleClicks:true});
  await page.getByRole("button",{name:"Agents",exact:true}).click();
  await expect(page.locator("#revokeLocalSandboxAgentBtn")).toBeVisible();
  await snapshot(page,"before-restart");
  const restart=spawnSync("limactl",["shell","--workdir","/Users/cptmao/Documents/IPO.ONE","ipo-one-local","docker","restart","ipo-one-web027-candidate"],{encoding:"utf8"});assert.equal(restart.status,0);
  await expect.poll(async()=>{try{return(await fetch("http://127.0.0.1:8935/tenant/v1/healthz")).status}catch{return 0}},{timeout:30000}).toBe(200);
  await page.reload();await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
  await expect(page.locator("#revokeLocalSandboxAgentBtn")).toBeVisible();
  await click(page,"#revokeLocalSandboxAgentBtn");
  await expect(page.locator("#localSandboxAgentStatus")).toContainText("revoked");
  await page.reload();await expect(page.locator("#localSandboxAgentStatus")).toContainText("revoked");
  results.push({restartRecovery:true,credentialRevocation:true,revocationAfterRefresh:true});
  assert.deepEqual(failures,[]);
 } catch(e){await snapshot(page,"failure");console.log(JSON.stringify({error:e.message,failures,responseErrors}));throw e;}
 finally {await context.close();}
} finally {await writeFile(out+"/"+stage+".json",JSON.stringify({source,apiMocks:false,results,actionEvidence},null,2));await browser.close();}
