// One-shot formal Human lifecycle acceptance using a dedicated no-funds wallet.
// After the recorded run, use web027-formal-recovery.mjs for read-only rechecks.
// No dates, clocks, canonical records, or API responses are replaced.
import {chromium,expect} from "@playwright/test";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
const state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime",out="output/playwright/web-027/formal";
await mkdir(out,{recursive:true});const source=(await(await fetch("https://ipo.one/readyz")).json()).releaseId;
const browser=await chromium.launch({headless:true,proxy:{server:"http://127.0.0.1:7890",bypass:"127.0.0.1,localhost"}}),results=[],actions=[],contexts=[];
async function click(page,selector){const button=page.locator(selector);await expect(button).toBeVisible();await expect(button).toBeEnabled();actions.push({label:await button.innerText(),at:new Date().toISOString()});await button.click();}
async function walletPage(name){const path=`${state}/web027-formal-${name}-wallet.json`;let wallet;try{wallet=JSON.parse(await readFile(path));}catch(e){if(e.code!=="ENOENT")throw e;wallet={privateKey:generatePrivateKey()};await writeFile(path,JSON.stringify(wallet),{mode:0o600});}
 const account=privateKeyToAccount(wallet.privateKey),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});contexts.push(context);
 await context.exposeFunction("__web027mPreparationSign",raw=>account.signMessage({message:{raw}}));
 await context.addInitScript(({address})=>{const provider={async request({method,params}){if(["eth_accounts","eth_requestAccounts"].includes(method))return[address];if(method==="eth_chainId")return"0x14a34";if(["wallet_switchEthereumChain","wallet_revokePermissions"].includes(method))return null;if(method==="personal_sign")return window.__web027mPreparationSign(params[0]);throw Error("Unsupported acceptance wallet action");},on(){},removeListener(){}};window.addEventListener("eip6963:requestProvider",()=>window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:{info:{uuid:"02702702-7000-4000-8000-000000000014",name:"WEB027 formal acceptance wallet",rdns:"acceptance.web027.formal",icon:"data:image/png;base64,iVBORw0KGgo="},provider}})));},{address:account.address});
 return context.newPage();
}

try {
 const page=await walletPage("human");page.setDefaultTimeout(30000);
 page.on("response",async r=>{if(/\/(tenant|auth)\//.test(new URL(r.url()).pathname)){let b={};try{b=await r.json()}catch{};const item={path:new URL(r.url()).pathname,status:r.status(),code:b.code,operationId:r.request().method()==="POST"?r.request().postDataJSON()?.operationId:undefined,sessionActive:b.sessionActive,sessionRole:b.sessionWorkspaceRole};results.push(item);}});
 await page.goto("https://ipo.one/#request-credit");await page.getByRole("button",{name:/^(Log in|Sign in)$/,exact:true}).click();await page.getByRole("button",{name:/WEB027 formal acceptance wallet/}).click();const verified=page.waitForResponse(r=>r.url().endsWith("/auth/v1/wallet/verify"));await click(page,"#walletSignInBtn");assert.equal((await verified).status(),200);if(source==="7ce4b9500ea98744afd9df4087e6a2f203c8b36c"){await page.reload();results.push({baselineManualReloadRequired:true});}await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:45000});await expect(page.locator("#accessLayer")).toBeHidden();
 
 if(source!=="7ce4b9500ea98744afd9df4087e6a2f203c8b36c"){
  const nav=page.locator('.nav-item[data-view="request-credit"]');if(!await nav.isVisible())await click(page,"#sidebarMoreBtn");await nav.click();
  await expect(page.locator("#humanGuidePrimaryBtn")).toBeVisible();await expect(page.locator("#humanGuidePrimaryBtn")).toBeEnabled({timeout:30000});
  const action=await page.locator("#humanGuidePrimaryBtn").getAttribute("data-human-guide-action");
  if(action==="create-subject"){await click(page,"#humanGuideSecondaryBtn");await click(page,"#humanGuidePrimaryBtn");await expect(page.locator("#humanGuidePrimaryBtn")).toHaveAttribute("data-human-guide-action","create-consent",{timeout:30000});}
  if(await page.locator("#humanGuidePrimaryBtn").getAttribute("data-human-guide-action")==="create-consent")await click(page,"#humanGuidePrimaryBtn");
  await expect(page.locator("#submitHumanCreditBtn")).toBeEnabled({timeout:30000});await page.locator("#humanCreditAmount").fill("24.50");await page.locator("#humanCreditTerm").fill("60");await page.locator("#humanInstallments").fill("2");await click(page,"#submitHumanCreditBtn");await expect(page.locator("#humanApplicationStatus")).toHaveText("Offer ready",{timeout:30000});
  await page.locator("#humanOfferAcknowledge").check();await click(page,"#acceptHumanOfferBtn");
  if(await page.locator("#accessLayer").isVisible()){await page.getByRole("button",{name:/WEB027 formal acceptance wallet/}).click();await click(page,"#walletSignInBtn");await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:30000});if(await page.locator("#accessLayer").isVisible())await click(page,"#accessCloseBtn");if(await page.locator("#acceptHumanOfferBtn").isEnabled())await click(page,"#acceptHumanOfferBtn");}
  await expect(page.locator("#economicActionLayer")).toBeVisible();await click(page,"#economicActionConfirmBtn");await expect(page.locator("#humanObligationOutstanding")).toHaveText("$24.50");
  await click(page,"#executeHumanObligationBtn");await click(page,"#economicActionConfirmBtn");await expect(page.locator("#humanObligationExecution")).toContainText("Executed",{timeout:30000});
  await page.locator("#humanRepaymentAmount").fill("24.50");await click(page,"#postHumanRepaymentBtn");await click(page,"#economicActionConfirmBtn");await expect(page.locator("#humanObligationOutstanding")).toHaveText("$0.00",{timeout:30000});
  await click(page,"#loadOwnedEvidenceBtn");await expect(page.locator("#ownedEvidenceCount")).not.toHaveText("0");await page.reload();await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:30000});await page.locator('.nav-item[data-view="request-credit"]').click();await expect(page.locator("#humanObligationStatus")).toBeVisible();await expect(page.locator("#humanObligationStatus")).toHaveText(/Fully repaid/i,{timeout:30000});await expect(page.locator("#humanObligationOutstanding")).toHaveText("$0.00");results.push({humanCreditLifecycle:true,fullyRepaid:true,evidence:true,refreshRecovery:true,realFunds:false});
 }
 await page.screenshot({path:out+"/baseline-human.png"});await writeFile(out+"/baseline-human.txt",await page.locator("body").innerText());results.push({baseline:true,source,humanSignedIn:true});
} catch(e){results.push({error:e.message});const page=contexts.at(-1)?.pages()[0];if(page)await writeFile(out+"/baseline-failure.txt",await page.locator("body").innerText());process.exitCode=1;}
finally{await writeFile(out+"/baseline.json",JSON.stringify({source,results,actions,apiMocks:false},null,2));await browser.close();console.log(JSON.stringify(results));}
