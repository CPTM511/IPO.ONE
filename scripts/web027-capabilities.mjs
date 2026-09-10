import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";
import { createHash } from "node:crypto";
import { DEFAULT_PRIVATE_PILOT_PROFILE } from "../apps/private-pilot/src/private-pilot-profile.js";

const out="output/playwright/web-027/capabilities";
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
async function verifyCase(page,role,name,fn){
 try {const data=await fn();operations.push({role,name,passed:true,result:data??null});}
 catch(error){operations.push({role,name,passed:false,error:error.message.slice(0,500)});await writeFile(`${out}/${role}-${name}-failure.txt`,await page.locator("#mainContent").innerText());}
 await writeFile(out+"/operations.json",JSON.stringify({source,apiMocks:false,fixtureQuery:false,operations},null,2));
}
async function commonOperations(page,role){
 await navigate(page,"obligations");
 await verifyCase(page,role,"portfolio",async()=>{
  await operation(page,"#obligationPortfolioRefreshBtn","pilotReadOwnObligation");
  await page.locator(".obligation-portfolio-position").first().click();
  const v=await operation(page,"#obligationDetailRefreshBtn","pilotReadOwnObligation");
  await expect(page.locator("#obligationDetailContent")).toBeVisible();
  return {status:v.obligation.status,outstanding:v.obligation.outstandingPrincipalMinor,readAsOf:v.asOf};
 });
 for(const format of ["json","csv"]){
  await navigate(page,"reports-exports");
  await verifyCase(page,role,"report-"+format,async()=>{
   await page.locator("#officialReportFormat").selectOption(format);
   await operation(page,"#createOfficialReportBtn","pilotCreateOfficialReport");
   await expect(page.locator("#officialReportAccessStatus")).toHaveText("Active");
   const id=await page.locator("#officialReportId").inputValue();
   await operation(page,"#readOfficialReportBtn","pilotReadOfficialReport");
   const pending=page.waitForEvent("download");
   await operation(page,"#retrieveOfficialReportBtn","pilotRetrieveOfficialReport");
   const download=await pending;const path=`${out}/${role}-report.${format}`;await download.saveAs(path);
   const expected=await page.locator("#officialReportSha256").innerText();
   const actual=createHash("sha256").update(await readFile(path)).digest("hex");expect(actual).toBe(expected.replace(/^(?:0x|sha256:)/,""));
   await operation(page,"#revokeOfficialReportBtn","pilotRevokeOfficialReport");
   await expect(page.locator("#officialReportEffectiveStatus")).toHaveText("Revoked");
   await page.reload();await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
   await page.locator("#officialReportId").fill(id);await operation(page,"#readOfficialReportBtn","pilotReadOfficialReport");
   await expect(page.locator("#officialReportEffectiveStatus")).toHaveText("Revoked");
   return {format,downloadDigestMatches:true,revocationSurvivesRefresh:true};
  });
 }
 await navigate(page,"wallet-permissions");
 await verifyCase(page,role,"wallet-capability-discovery",async()=>{
  const value=await operation(page,"#executionDiscoverBtn","walletDiscoverCapabilities");
  expect(value.items[0].adapterId).toBe("local_sandbox");expect(value.transactionsAllowed).toBe(false);
  return {serverDescriptor:true,noTransactions:true,supportedChains:value.items[0].supportedChains};
 });
 await verifyCase(page,role,"execution-binding",async()=>{
  await page.locator("#walletPermissionsAccessBtn").click();
  await page.getByRole("button",{name:/WEB027 isolated test wallet/}).click();
  await page.locator("#accessCloseBtn").click();
  await page.locator("#executionConnectBtn").click();
  // Repeated acceptance resumes an existing durable binding instead of
  // attempting to create it again. Preparation errors must be recorded as such.
  await operation(page,"#executionRefreshBindingsBtn","walletReadAccountBindings");
  if (await page.locator("#executionBindBtn").isEnabled()) {
    const prepared = page.waitForResponse(r=>r.url().endsWith("/tenant/v1/operations") && r.request().postDataJSON()?.operationId==="walletPrepareAccountBinding");
    const submitted = page.waitForResponse(r=>r.url().endsWith("/tenant/v1/operations") && r.request().postDataJSON()?.operationId==="walletSubmitAccountBinding").catch(()=>null);
    await page.locator("#executionBindBtn").click();
    const preparation=await prepared;
    if (!preparation.ok()) { const rejected=await preparation.json();throw Error(`walletPrepareAccountBinding: ${preparation.status()} ${rejected.code}`); }
    const result=await submitted;if(!result)throw Error("Account proof was not submitted");
    const bound=await result.json();if(!result.ok())throw Error(`walletSubmitAccountBinding: ${result.status()} ${bound.code}`);
    expect(bound.response.accountBinding.status).toBe("active");
  }
  await operation(page,"#executionRefreshBindingsBtn","walletReadAccountBindings");
  const capability=await operation(page,"#executionDiscoverBtn","walletDiscoverCapabilities");
  await operation(page,"#executionRevokeBindingBtn","walletRevokeAccountBinding");
  await page.locator("#executionDisconnectBtn").click();
  return {bound:true,read:true,capabilityRead:true,revoked:true,disconnected:true};
 });

 await navigate(page,"credit-track-record");
 await verifyCase(page,role,"credit-track-record",async()=>{
  const r=await operation(page,"#loadCreditTrackRecordBtn","pilotReadOwnCreditState");return {serverRead:true,schemaVersion:r.schemaVersion};
 });
 if(role==="borrower"){
  await verifyCase(page,role,"decision-passport",async()=>{
   // A revoked artifact is deliberately not reissued for the same exact
   // Decision/reviewer. Prepare a fresh, unaccepted Decision via the Human UI.
   await navigate(page,"request-credit");
   if (await page.locator("#humanGuideSecondaryBtn").getAttribute("data-human-guide-action") === "return-current") {
    await page.locator("#humanGuideSecondaryBtn").click();
   }
   await page.locator("#newHumanApplicationBtn").click();
   await expect(page.locator("#humanGuidePrimaryBtn")).toHaveText("Create scoped Consent");
   await page.locator("#humanGuidePrimaryBtn").click();
   await page.locator("#humanCreditAmount").fill("20.00");
   await page.locator("#submitHumanCreditBtn").click();
   await expect(page.locator("#humanApplicationStatus")).toHaveText("Offer ready");
   await navigate(page,"credit-passport");
   await page.locator("#restoreCreditPassportBtn").click();
   await expect(page.locator("#creditPassportStateTitle")).toHaveText("Verified Decision Passport ready");
   await page.getByText("Advanced: share with an exact invited reviewer",{exact:true}).click();
   // This isolated round trip binds the existing QA borrower as its own exact
   // verifier. It cannot prove a different role's UI or disclosure authority.
   await page.locator("#creditPassportVerifierActorId").fill(DEFAULT_PRIVATE_PILOT_PROFILE.identities.borrower.actorId);
   const issued=await operation(page,"#issueCreditPassportBtn","pilotCreateCreditPassportArtifact");
   await page.getByText("Recover an existing Passport by technical ID",{exact:true}).click();
   await operation(page,"#readCreditPassportBtn","pilotReadOwnCreditPassportArtifact");
   await page.getByText("Verify a received proof online",{exact:true}).click();
   const verified=await operation(page,"#verifyCreditPassportBtn","pilotVerifyCreditPassportArtifact");
   expect(verified.verification.verified).toBe(true);
   await operation(page,"#revokeCreditPassportBtn","pilotRevokeCreditPassportArtifact");
   await expect(page.locator("#creditPassportArtifactStatus")).toContainText(/revoked/i);
   return {freshUnacceptedDecision:true,issued:true,read:true,exactQaVerifier:true,verified:true,revoked:true};
  });
  await navigate(page,"request-credit");
  await verifyCase(page,role,"owned-evidence",async()=>{
   await navigate(page,"obligations");
   await page.locator(".obligation-portfolio-position").first().click();
   const r=await operation(page,"#obligationDetailEvidenceBtn","pilotReadOwnObligationEvidence");
   return {count:r.items?.length,hasMore:r.hasMore};
  });
  await navigate(page,"request-credit");
  await verifyCase(page,role,"feedback",async()=>{
   await page.getByText("Share product feedback",{exact:true}).click();
   const r=await operation(page,"#submitPilotFeedbackBtn","pilotSubmitPilotFeedback");
   await expect(page.locator("#pilotFeedbackHelper")).toContainText("Feedback recorded");return {recorded:true};
  });
  await verifyCase(page,role,"case",async()=>{
   await page.getByText("Get help with a record · Cases & corrections",{exact:true}).click();
   await page.locator("#pilotCaseTarget").selectOption({index:1});
   await operation(page,"#filePilotCaseBtn","pilotFileCase");
   const r=await operation(page,"#refreshPilotCasesBtn","pilotListOwnCases");
   await expect(page.locator("#pilotCaseRows")).not.toHaveText("");return {listed:true};
  });
 }
}

try {
 for(const [role,port] of [["borrower",8935],["controller",8936]]) {
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
  if(process.argv[2]==="operations") await commonOperations(page,role);
  await context.close();
 }
 await writeFile(out+"/controls.json",JSON.stringify(results,null,2));
}finally{await browser.close();}
