import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { spawnSync } from "node:child_process";
const out="output/playwright/web-027/k1";
await mkdir(out,{recursive:true});
const state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime";
const browser=await chromium.launch({headless:true});
const actions=[], results=[], requests=[];
const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json","utf8")).source;
async function walletContext(account) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, reducedMotion: "reduce" });
  await context.exposeFunction("__web027QaSign", message => account.signMessage({ message: { raw: message } }));
  await context.exposeFunction("__web027QaTyped", data => account.signTypedData(data));
  await context.addInitScript(({ address }) => {
    const provider = { async request({ method, params }) {
      if (["eth_requestAccounts", "eth_accounts"].includes(method)) return [address];
      if (method === "eth_chainId") return "0x14a34";
      if (["wallet_switchEthereumChain", "wallet_revokePermissions"].includes(method)) return null;
      if (method === "personal_sign") return window.__web027QaSign(params[0]);
      if (method === "eth_signTypedData_v4") return window.__web027QaTyped(JSON.parse(params[1]));
      throw Object.assign(new Error("Test wallet rejects unsupported operations"), { code: 4200 });
    }, on() {}, removeListener() {} };
    window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
      info: { uuid: "02702702-7000-4000-8000-000000000001", name: "WEB027 isolated test wallet", rdns: "local.web027.test", icon: "data:image/png;base64,iVBORw0KGgo=" }, provider
    } })));
  }, { address: account.address });
  return context;
}
async function login(page, port, role) {
  await page.goto(`http://127.0.0.1:${port}/#${role === "controller" ? "agent-console" : "request-credit"}`);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated", { timeout: 20_000 });
  await expect(page.locator("#accessLayer")).toBeHidden();
}
async function navigate(page,view) {
 const nav=page.locator(`.nav-item[data-view="${view}"]`);
 if(!await nav.isVisible()) await page.locator("#sidebarMoreBtn").click();
 await nav.click();await expect(page.locator(`[data-view-panel="${view}"]`)).toBeVisible();
}
async function operation(page,selector,operationId) {
 const pending=page.waitForResponse(r=>r.url().endsWith("/tenant/v1/operations") && r.request().postDataJSON()?.operationId===operationId).catch(error=>error);
 await page.locator(selector).click();const response=await pending;if(response instanceof Error)throw response;const result=await response.json();
 if(!response.ok()) throw Error(`${operationId}: ${response.status()} ${result.code ?? "operation_failed"}`);
 return result.response;
}

async function click(page, selector) {
 const c=page.locator(selector);await expect(c).toBeVisible();await expect(c).toBeEnabled();
 actions.push({selector,label:await c.innerText(),at:new Date().toISOString()});await c.click();
}
async function prove(page) {
 await navigate(page,"wallet-permissions");
 await click(page,"#walletPermissionsAccessBtn");
 await page.getByRole("button",{name:/WEB027 isolated test wallet/}).click();
 await click(page,"#accessCloseBtn");
 await click(page,"#executionConnectBtn");
 await operation(page,"#executionRefreshBindingsBtn","walletReadAccountBindings");
 const submitted=page.waitForResponse(r=>r.url().endsWith("/tenant/v1/operations")&&r.request().postDataJSON()?.operationId==="walletSubmitAccountBinding");
 await click(page,"#executionBindBtn");
 const response=await submitted;expect(response.status()).toBe(200);
 const bound=(await response.json()).response;expect(bound.accountBinding.status).toBe("active");
 await operation(page,"#executionRefreshBindingsBtn","walletReadAccountBindings");
 await operation(page,"#executionDiscoverBtn","walletDiscoverCapabilities");
 await operation(page,"#executionRevokeBindingBtn","walletRevokeAccountBinding");
 await click(page,"#executionDisconnectBtn");
 return {bound:true,read:true,capabilityRead:true,revoked:true,disconnected:true};
}
try {
 for(const stage of ["fresh","existing"]) {
  let wallet;
  if(stage==="existing") wallet=JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json","utf8"));
  else {const filename=state+"/web027k-human-final.json";try {wallet=JSON.parse(await readFile(filename,"utf8"));}catch {wallet={privateKey:generatePrivateKey()};await writeFile(filename,JSON.stringify(wallet),{mode:0o600});}}
  const context=await walletContext(privateKeyToAccount(wallet.privateKey));const page=await context.newPage();
  page.on("response",async r=>{if(r.url().endsWith("/tenant/v1/operations")){const q=r.request().postDataJSON();requests.push({stage,operationId:q?.operationId,status:r.status()});}});
  await login(page,8935,"human");
  await expect(page.locator("#humanApplication")).toBeVisible();
  if(stage==="fresh") {
   if(await page.locator("#createHumanSubjectBtn").innerText() === "Create Human Subject") { await expect(page.locator("#createHumanSubjectBtn")).toBeEnabled();await operation(page,"#createHumanSubjectBtn","pilotCreateHumanSubject"); }
   if(await page.locator("#createHumanConsentBtn").innerText() === "Create scoped Consent") { await expect(page.locator("#createHumanConsentBtn")).toBeEnabled();await operation(page,"#createHumanConsentBtn","pilotCreateConsent"); }
  }
  if(await page.locator("#activateSandboxHumanBtn").innerText() !== "Sandbox profile active") {
   await expect(page.locator("#activateSandboxHumanBtn")).toBeEnabled();
   await click(page,"#activateSandboxHumanBtn");await expect(page.locator("#humanActivationDialog")).toBeVisible();
   await click(page,"#cancelSandboxHumanActivationBtn");await expect(page.locator("#humanActivationDialog")).toBeHidden();
   expect(requests.filter(r=>r.stage===stage&&r.operationId==="pilotActivateSandboxHumanSubject")).toHaveLength(0);
   await click(page,"#activateSandboxHumanBtn");await expect(page.locator("#humanActivationDialog")).toBeVisible();
   await page.screenshot({path:out+"/"+stage+"-activation-review.png"});
   await operation(page,"#confirmSandboxHumanActivationBtn","pilotActivateSandboxHumanSubject");
  }
  await expect(page.locator("#activateSandboxHumanBtn")).toHaveText("Sandbox profile active");
  await expect(page.locator("#activateSandboxHumanBtn")).toBeDisabled();
  await page.reload();await expect(page.locator("#activateSandboxHumanBtn")).toHaveText("Sandbox profile active");
  // The legacy QA wallet already has a revoked Principal binding on Base Sepolia.
  // Fresh Human proves the whole binding lifecycle with its distinct test account.
  const binding=stage==="fresh"?await prove(page):{alreadyUsedPrincipalAccount:true};
  await navigate(page,"request-credit");
  await page.screenshot({path:out+"/"+stage+"-active.png"});
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(page.getByRole("button",{name:"Log in",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Log in",exact:true}).click();
  await page.getByRole("button",{name:/WEB027 isolated test wallet/}).click();
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#activateSandboxHumanBtn")).toHaveText("Sandbox profile active");
  const restarted=spawnSync("limactl",["shell","--workdir","/Users/cptmao/Documents/IPO.ONE","ipo-one-local","docker","restart","ipo-one-web027-candidate"],{encoding:"utf8"});
  expect(restarted.status).toBe(0);
  await expect.poll(async()=>{try{return(await fetch("http://127.0.0.1:8935/tenant/v1/healthz")).status;}catch{return 0;}},{timeout:30000}).toBe(200);
  await page.reload();await expect(page.locator("#activateSandboxHumanBtn")).toHaveText("Sandbox profile active");
  results.push({stage,activation:true,cancelNoMutation:true,refresh:true,logoutLogin:true,processRestart:true,binding});
  await context.close();
 }
} catch(error) { results.push({passed:false,error:error.message}); }
finally {await writeFile(out+"/human.json",JSON.stringify({source,apiMocks:false,fixtureQuery:false,results,actions,requests},null,2));await browser.close();}
console.log(JSON.stringify({source,results}));
if(results.some(r=>r.passed===false))process.exitCode=1;
