import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";
import { createHash } from "node:crypto";
import { DEFAULT_PRIVATE_PILOT_PROFILE } from "../apps/private-pilot/src/private-pilot-profile.js";

const out="output/playwright/web-027/l-acceptance";
await mkdir(out,{recursive:true});
const account = privateKeyToAccount(JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json", "utf8")).privateKey);
const browser=await chromium.launch({headless:true});
const results=[], operations=[];
const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json","utf8")).source;
async function walletContext() {
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
const context=await walletContext();const p=await context.newPage();const responses=[];p.on('response',async r=>{if(r.url().endsWith('/tenant/v1/operations'))responses.push({operation:r.request().postDataJSON()?.operationId,status:r.status(),body:await r.json()});});
try{await login(p,8938,'capitalPartner');await navigate(p,'capital-partners');await expect(p.locator('#capitalPartnerRefreshWorkspaceBtn')).toBeEnabled({timeout:20000});await expect(p.locator('#capitalPartnerRepaidAmount')).toHaveText(/^\$[0-9,.]+$/);
 for(const width of [1440,390,320])for(const theme of ['light','dark']){await p.setViewportSize({width,height:1000});await p.getByRole('combobox',{name:'Appearance',exact:true}).selectOption(theme);await p.locator('button[data-capital-facility]').first().click();await expect(p.locator('#capitalPartnerFacilityDetail')).toContainText('repaid');expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path:out+`/capital-${width}-${theme}.png`});responses.push({visual:true,width,theme,overflow:false});}
 await writeFile(out+'/capital-read.txt',await p.locator('body').innerText());
}finally{await writeFile(out+'/capital-visual.json',JSON.stringify(responses,null,2));console.log(JSON.stringify(responses.map(r=>({operation:r.operation,status:r.status,code:r.body?.code,visual:r.visual,width:r.width,theme:r.theme}))));await browser.close();}
