import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const browser=await chromium.launch({headless:true});
const actions=[],results=[];
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

try {
 const account=privateKeyToAccount(generatePrivateKey());const context=await walletContext(account);const page=await context.newPage();
 await login(page,8935,"human");
 await expect(page.locator("#createHumanSubjectBtn")).toBeEnabled();await operation(page,"#createHumanSubjectBtn","pilotCreateHumanSubject");
 await expect(page.locator("#createHumanConsentBtn")).toBeEnabled();await operation(page,"#createHumanConsentBtn","pilotCreateConsent");
 for(const width of [1440,390]) for(const theme of ["light","dark"]) {
  await page.setViewportSize({width,height:1024});
  await page.getByRole("combobox",{name:"Appearance",exact:true}).selectOption(theme);
  await click(page,"#activateSandboxHumanBtn");await expect(page.locator("#humanActivationDialog")).toBeVisible();
  const data=await page.locator("#humanActivationDialog").evaluate(d=>{
   const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
   const bg=lum(getComputedStyle(d).backgroundColor);
   const ratios=[...d.querySelectorAll("h2,p")].map(n=>{const fg=lum(getComputedStyle(n).color);return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});
   const rect=d.getBoundingClientRect();return{ratios,dialogFits:rect.left>=0&&rect.right<=innerWidth,modalOpen:d.open};
  });
  expect(data.dialogFits).toBe(true);for(const ratio of data.ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:`output/playwright/web-027/k1/dialog-${width}-${theme}.png`});
  await page.keyboard.press("Escape");await expect(page.locator("#humanActivationDialog")).toBeHidden();
  results.push({width,theme,...data,escapeCancelled:true});
 }
 await context.close();
} finally {await browser.close();await writeFile("output/playwright/web-027/k1/visual.json",JSON.stringify({source,results,actions},null,2));}
console.log(JSON.stringify(results));
