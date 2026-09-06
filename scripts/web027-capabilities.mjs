import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";
import { createHash } from "node:crypto";

const out="output/playwright/web-027/capabilities";
await mkdir(out,{recursive:true});
const account = privateKeyToAccount(JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json", "utf8")).privateKey);
const browser=await chromium.launch({headless:true});
const results=[];
async function walletContext() {
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
  await page.goto(`http://127.0.0.1:${port}/#${role === "controller" ? "agent-console" : "request-credit"}`);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated", { timeout: 20_000 });
  await expect(page.locator("#accessLayer")).toBeHidden();
}
try {
 for(const [role,port] of [["borrower",8935],["controller",8946]]) {
  const context=await walletContext();const page=await context.newPage();page.setDefaultTimeout(15_000);
  page.on("response",async response=>{
   if (!response.url().endsWith("/tenant/v1/operations"))return;
   const request=response.request().postDataJSON();
   if (request.operationId === "pilotReadOwnObligation" && response.ok()) {
    const data=await response.json();
    await writeFile(`${out}/${role}-owned-view.json`,JSON.stringify(data,null,2));
   }
  });
  await login(page,port,role);
  for(const {viewId} of WORKSPACE_NAVIGATION_MANIFEST.workspaces[role].views){
   const nav=page.locator(`.nav-item[data-view="${viewId}"]`);
   if(!await nav.isVisible())await page.locator("#sidebarMoreBtn").click();
   await nav.click();
   await expect(page.locator(`[data-view-panel="${viewId}"]`)).toBeVisible();
   const panel=page.locator(`[data-view-panel="${viewId}"]`);
   await writeFile(`${out}/${role}-${viewId}.txt`,await panel.innerText());
   const buttons=await panel.locator("button:visible").evaluateAll(nodes=>nodes.map(n=>({id:n.id,label:n.textContent.trim(),disabled:n.disabled})));
   results.push({role,viewId,buttons});
  }
  await context.close();
 }
 await writeFile(out+"/controls.json",JSON.stringify(results,null,2));
}finally{await browser.close();}
