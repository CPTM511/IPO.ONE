import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";
import { createHash } from "node:crypto";
import { DEFAULT_PRIVATE_PILOT_PROFILE } from "../apps/private-pilot/src/private-pilot-profile.js";

const out="output/playwright/web-027/capital";
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
const contexts=[];
try {
 const borrower=await walletContext();contexts.push(borrower);const h=await borrower.newPage();await login(h,8935,"borrower");
 await navigate(h,"request-credit");await h.locator("#newHumanApplicationBtn").click();await expect(h.locator("#humanGuidePrimaryBtn")).toHaveText("Create scoped Consent");await h.locator("#humanGuidePrimaryBtn").click();await h.locator("#humanCreditAmount").fill("20.00");await h.locator("#submitHumanCreditBtn").click();await expect(h.locator("#humanApplicationStatus")).toHaveText("Offer ready");
 await navigate(h,"credit-passport");await h.locator("#restoreCreditPassportBtn").click();await expect(h.locator("#creditPassportStateTitle")).toHaveText("Verified Decision Passport ready");
 await h.getByText("Advanced: share with an exact invited reviewer",{exact:true}).click();await h.locator("#creditPassportVerifierActorId").fill(DEFAULT_PRIVATE_PILOT_PROFILE.identities.capitalPartner.actorId);
 await operation(h,"#issueCreditPassportBtn","pilotCreateCreditPassportArtifact");
 const partner=await walletContext();contexts.push(partner);const c=await partner.newPage();await login(c,8938,"capitalPartner");await navigate(c,"capital-partners");
 await c.locator("#capitalPartnerRefreshWorkspaceBtn").click();const selection=c.locator("#capitalPartnerApplicationPicker button").first();await expect(c.locator("#capitalPartnerInboxState")).toContainText(/current authorized application/,{timeout:20000});if(await selection.isVisible())await selection.click();await expect(c.locator("#capitalPartnerOfferForm")).toBeVisible();
 await c.locator("#capitalPartnerPrincipal").fill("20");await c.locator("#capitalPartnerPerDrawCap").fill("20");
 await operation(c,"#capitalPartnerAuthorOfferBtn","pilotAuthorCapitalPartnerOffer");await expect(c.locator("#capitalPartnerWithdrawOfferBtn")).toBeVisible();
 await c.reload();await expect(c.locator("#sidebarApiStatus")).toHaveText("Authenticated");await expect(c.locator("#capitalPartnerOfferCount")).not.toHaveText("0");
 if(await c.locator("#capitalPartnerApplicationPicker button").first().isVisible())await c.locator("#capitalPartnerApplicationPicker button").first().click();await expect(c.locator("#capitalPartnerWithdrawOfferBtn")).toBeVisible();
 const withdrawn=await operation(c,"#capitalPartnerWithdrawOfferBtn","pilotTransitionCapitalPartnerOffer");expect(withdrawn.offer.status).toBe("withdrawn");await expect(c.locator("#capitalPartnerOfferStatus")).toContainText(/withdrawn/i);
 await h.getByText("Recover an existing Passport by technical ID",{exact:true}).click();await operation(h,"#revokeCreditPassportBtn","pilotRevokeCreditPassportArtifact");
 const refresh=c.waitForResponse(r=>r.request().postDataJSON()?.operationId==="pilotReadCapitalPartnerPassportInbox");await c.locator("#capitalPartnerRefreshWorkspaceBtn").click();const inbox=(await(await refresh).json()).response;const revokedId=await h.locator("#creditPassportArtifactId").inputValue();expect(JSON.stringify(inbox)).not.toContain(revokedId);await expect(c.locator("#capitalPartnerRefreshWorkspaceBtn")).toBeEnabled();await expect(c.locator("#capitalPartnerAccessState")).toContainText("invited operator active");
 operations.push({sharedWithExactPartner:true,inboxSelection:true,issuedExactOffer:true,portfolioRefresh:true,withdrawal:true,passportRevocationRemovesAccess:true});
 await c.screenshot({path:out+"/partner.png"});await writeFile(out+"/partner.txt",await c.locator("body").innerText());
} catch(e) {operations.push({error:e.message});for(const [i,context] of contexts.entries()){const p=context.pages()[0];await p.screenshot({path:out+"/failure-"+i+".png"});await writeFile(out+"/failure-"+i+".txt",await p.locator("body").innerText());}throw e;}
finally {await writeFile(out+"/operations.json",JSON.stringify({source,apiMocks:false,fixtureQuery:false,operations},null,2));for(const c of contexts)await c.close();await browser.close();}
