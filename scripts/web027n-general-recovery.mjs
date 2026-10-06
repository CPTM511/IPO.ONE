import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";
import { createHash } from "node:crypto";
import { DEFAULT_PRIVATE_PILOT_PROFILE } from "../apps/private-pilot/src/private-pilot-profile.js";

const out="output/playwright/web-027/n-acceptance";
await mkdir(out,{recursive:true});
const account = privateKeyToAccount(JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json", "utf8")).privateKey);
const browser=await chromium.launch({headless:true});
const operations=[];
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
const results=[];const network=[];
try {
 const context=await walletContext();const h=await context.newPage();await login(h,8935,'borrower');
 const choices=h.locator('button[data-human-review-offer]');if(await choices.count()>1){expect(await choices.count()).toBeGreaterThan(1);await choices.first().focus();await h.keyboard.press('Enter');await expect(h.locator('#humanOfferAcknowledge')).not.toBeChecked();await expect(h.locator('#economicActionLayer')).toBeHidden();results.push({name:'Keyboard Offer selection revalidates without accepting',count:await choices.count(),labels:await choices.allTextContents()});
}else{results.push({name:"Prior pending Offers are no longer available; historical keyboard acceptance retained",count:await choices.count()});}
 for(const width of [1440,390,320])for(const theme of ['light','dark']){await h.setViewportSize({width,height:1000});await h.getByRole('combobox',{name:'Appearance',exact:true}).selectOption(theme);await h.locator('#humanGuidePrimaryBtn').scrollIntoViewIfNeeded();expect(await h.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await h.screenshot({path:out+`/human-offers-${width}-${theme}.png`});results.push({name:'Current Human page fits',width,theme});}
 await h.setViewportSize({width:1440,height:1000});h.on('response',async r=>{if(r.url().endsWith('/tenant/v1/operations')){const b=await r.json();network.push({operationId:r.request().postDataJSON()?.operationId,status:r.status(),schemaVersion:b.response?.schemaVersion,code:b.code});}});
 await navigate(h,'secured-pool');await h.locator('#refreshSecuredPoolBtn').click();await expect(h.locator('#refreshSecuredPoolBtn')).toBeEnabled();results.push({name:'Human Pool visible read boundary',text:await h.locator('[data-view-panel="secured-pool"]').innerText()});
 await navigate(h,'request-credit');results.push({name:'Metered Resource deployment state',text:await h.locator('#syntheticMeteredResourceCopy').innerText()});
 const partner=await walletContext();const c=await partner.newPage();await login(c,8938,'capitalPartner');await navigate(c,'capital-partners');await expect(c.locator('#capitalPartnerRefreshWorkspaceBtn')).toBeEnabled();const accepted=JSON.parse(await readFile("output/playwright/web-027/l-acceptance/capital-full.json")).operations.find(x=>x.step==='owned-Facility-details').receipt.facility;
 const view=await operation(c,`button[data-capital-facility="${accepted.obligationId}"]`,'pilotReadCapitalPartnerFacility');expect(view.facility.outstandingMinor).toBe('0');expect(view.facility.repaidMinor).toBe(accepted.repaidMinor);results.push({name:'Capital exact Facility survives Agent-triggered process restart',pass:true});await c.setViewportSize({width:390,height:1000});await c.getByRole('combobox',{name:'Appearance',exact:true}).selectOption('light');await c.locator('#capitalPartnerFacilityDetail').scrollIntoViewIfNeeded();expect(await c.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await c.screenshot({path:out+'/capital-final-mobile.png'});
} catch(e){results.push({error:e.message});process.exitCode=1;}
finally{await writeFile(out+'/recovery.json',JSON.stringify({source,apiMocks:false,results,network},null,2));console.log(JSON.stringify(results.map(x=>({name:x.name,error:x.error,width:x.width,theme:x.theme,count:x.count}))));await browser.close();}
