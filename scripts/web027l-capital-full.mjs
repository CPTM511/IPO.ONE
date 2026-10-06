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
const contexts=[];
try {
 const borrower=await walletContext();contexts.push(borrower);const h=await borrower.newPage();await login(h,8935,"borrower");
 await navigate(h,"request-credit");await h.locator("#newHumanApplicationBtn").click();await expect(h.locator("#humanGuidePrimaryBtn")).toHaveText("Create scoped Consent");await h.locator("#humanGuidePrimaryBtn").click();await h.locator("#humanCreditAmount").fill("23.00");await h.locator("#submitHumanCreditBtn").click();await expect(h.locator("#humanApplicationStatus")).toHaveText("Offer ready");
 await navigate(h,"credit-passport");await h.locator("#restoreCreditPassportBtn").click();await expect(h.locator("#creditPassportStateTitle")).toHaveText("Verified Decision Passport ready");
 await h.getByText("Advanced: share with an exact invited reviewer",{exact:true}).click();await h.locator("#creditPassportVerifierActorId").fill(DEFAULT_PRIVATE_PILOT_PROFILE.identities.capitalPartner.actorId);await operation(h,"#issueCreditPassportBtn","pilotCreateCreditPassportArtifact");
 const partner=await walletContext();contexts.push(partner);const c=await partner.newPage();await login(c,8938,"capitalPartner");await navigate(c,"capital-partners");
 await c.locator("#capitalPartnerRefreshWorkspaceBtn").click();await expect(c.locator("#capitalPartnerInboxState")).toContainText(/current authorized application/,{timeout:20000});const selection=c.locator("#capitalPartnerApplicationPicker button").first();if(await selection.isVisible())await selection.click();await expect(c.locator("#capitalPartnerOfferForm")).toBeVisible();
 const repaidBefore=await c.locator('#capitalPartnerRepaidAmount').innerText();
 const expectedRepaid='$'+(Number(repaidBefore.replace(/[$,]/g,''))+23).toFixed(2);
 await c.locator("#capitalPartnerPrincipal").fill("23");await c.locator("#capitalPartnerPerDrawCap").fill("23");await c.locator("#capitalPartnerAnnualRate").fill("0");
 const issued=await operation(c,"#capitalPartnerAuthorOfferBtn","pilotAuthorCapitalPartnerOffer");operations.push({step:"partner-issued",offer:issued.offer});
 await h.reload();await expect(h.locator("#sidebarApiStatus")).toHaveText("Authenticated");await navigate(h,"request-credit");
 await writeFile(out+"/human-after-capital-offer.txt",await h.locator("body").innerText());await h.screenshot({path:out+"/human-after-capital-offer.png"});
 const resumed=await h.evaluate(async()=> (await fetch('/tenant/v1/healthz')).status);operations.push({step:"human-recovered",health:resumed,status:await h.locator("#humanApplicationStatus").innerText(),principal:await h.locator("#humanOfferPrincipal").innerText()});
 await expect(h.locator('#humanApplicationInbox')).toBeVisible();await h.locator(`button[data-human-review-offer="${issued.offer.creditOfferId}"]`).click();
 await expect(h.locator("#humanOfferPrincipal")).toHaveText("$23.00");await h.locator("#humanOfferAcknowledge").check();await h.locator("#acceptHumanOfferBtn").click();
 if(await h.locator('#accessLayer').isVisible()){
  await h.getByRole('button',{name:/WEB027 isolated test wallet/}).click();if(await h.locator('#walletSignInBtn').isEnabled())await h.locator('#walletSignInBtn').click();if(await h.locator('#accessLayer').isVisible())await h.locator('#accessCloseBtn').click();await h.locator('#acceptHumanOfferBtn').click();
 }
 await expect(h.locator("#economicActionLayer")).toBeVisible();
 const pending=h.waitForResponse(r=>r.request().postDataJSON()?.operationId==='pilotAcceptCreditOffer');await h.locator("#economicActionConfirmBtn").click();const accepted=await pending;const acceptance=await accepted.json();expect(accepted.status()).toBe(200);expect(acceptance.response.obligation.creditOfferId).toBe(issued.offer.creditOfferId);operations.push({step:"exact-lender-offer-accepted",receipt:acceptance.response});
 await h.locator("#executeHumanObligationBtn").click();await h.locator("#economicActionConfirmBtn").click();await expect(h.locator("#humanObligationExecution")).toContainText("Executed");
 await h.locator("#humanRepaymentAmount").fill("23.00");await h.locator("#postHumanRepaymentBtn").click();await h.locator("#economicActionConfirmBtn").click();await expect(h.locator("#humanObligationOutstanding")).toHaveText("$0.00");
 await c.locator("#capitalPartnerRefreshWorkspaceBtn").click();await expect(c.locator("#capitalPartnerRefreshWorkspaceBtn")).toBeEnabled({timeout:20000});await expect(c.locator("#capitalPartnerFacilityRows")).toContainText(/Repaid/i);operations.push({step:"capital-facility-fully-repaid",visible:await c.locator("#capitalPartnerFacilityRows").innerText()});
 const obligationId=acceptance.response.obligation.obligationId;
 const detail=await operation(c,`button[data-capital-facility="${obligationId}"]`,'pilotReadCapitalPartnerFacility');expect(detail.facility.obligationId).toBe(obligationId);expect(detail.facility.outstandingMinor).toBe('0');expect(detail.facility.repaidMinor).toBe('2300');await expect(c.locator('#capitalPartnerFacilityDetail')).toContainText('$23.00 repaid');operations.push({step:'owned-Facility-details',receipt:detail});
 await c.reload();await expect(c.locator('#capitalPartnerRepaidAmount')).toHaveText(expectedRepaid);await h.reload();await expect(h.locator('#humanObligationOutstanding')).toHaveText('$0.00');operations.push({step:'both-sides-refresh-durable',pass:true});
 for(const page of [h,c]){await page.getByRole('button',{name:'Sign out',exact:true}).click();if(page===c)await expect(c.locator('#capitalPartnerFacilityDetail')).toBeHidden();await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('button',{name:/WEB027 isolated test wallet/}).click();await page.locator('#walletSignInBtn').click();await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');}
 await expect(c.locator('#capitalPartnerRepaidAmount')).toHaveText(expectedRepaid);operations.push({step:'logout-login-durable',pass:true});await c.screenshot({path:out+'/capital-verified.png',fullPage:true});

} catch(e){operations.push({error:e.message});for(const [i,context] of contexts.entries()){const p=context.pages()[0];await p.screenshot({path:out+"/failure-"+i+".png"});await writeFile(out+"/failure-"+i+".txt",await p.locator("body").innerText());}process.exitCode=1;}
finally{await writeFile(out+"/capital-full.json",JSON.stringify({source,apiMocks:false,fixtureQuery:false,operations},null,2));await browser.close();console.log(JSON.stringify(operations.map(x=>({step:x.step,error:x.error,status:x.status,principal:x.principal}))));}
