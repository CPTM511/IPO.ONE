// Recover the three existing local servicing plans and owner Evidence using visible controls only.
// No dates, clocks, canonical records, or API responses are replaced.
import {chromium,expect} from "@playwright/test";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
const state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime",out="output/playwright/web-027/n-acceptance";
await mkdir(out,{recursive:true});const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source;
const browser=await chromium.launch({headless:true}),results=[],actions=[],contexts=[];
async function click(page,selector){const button=page.locator(selector);await expect(button).toBeVisible();await expect(button).toBeEnabled();actions.push({label:await button.innerText(),at:new Date().toISOString()});await button.click();}
async function walletPage(name){const path=`${state}/web027m-servicing-${name}-wallet.json`;const wallet=JSON.parse(await readFile(path));
 const account=privateKeyToAccount(wallet.privateKey),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});contexts.push(context);
 await context.exposeFunction("__web027mPreparationSign",raw=>account.signMessage({message:{raw}}));
 await context.addInitScript(({address})=>{const provider={async request({method,params}){if(["eth_accounts","eth_requestAccounts"].includes(method))return[address];if(method==="eth_chainId")return"0x14a34";if(["wallet_switchEthereumChain","wallet_revokePermissions"].includes(method))return null;if(method==="personal_sign")return window.__web027mPreparationSign(params[0]);throw Error("Unsupported acceptance wallet action");},on(){},removeListener(){}};window.addEventListener("eip6963:requestProvider",()=>window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:{info:{uuid:"02702702-7000-4000-8000-000000000014",name:"WEB027 servicing preparation wallet",rdns:"local.web027m.preparation",icon:"data:image/png;base64,iVBORw0KGgo="},provider}})));},{address:account.address});
 return context.newPage();
}

async function navigate(page,view){const nav=page.locator(`.nav-item[data-view="${view}"]`);if(!await nav.isVisible())await click(page,"#sidebarMoreBtn");await expect(nav).toBeVisible();await nav.click();actions.push({label:await nav.innerText(),at:new Date().toISOString()});}
async function login(page){await page.goto("http://127.0.0.1:8935/#request-credit");await page.getByRole("button",{name:"Log in",exact:true}).click();await page.getByRole("button",{name:/WEB027 servicing preparation wallet/}).click();await click(page,"#walletSignInBtn");await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:30000});await expect(page.locator("#accessLayer")).toBeHidden();}
const operations=[];
try{for(const name of ["restructure","repurchase","writeoff"]){
 const page=await walletPage(name);page.setDefaultTimeout(20000);
 page.on("response",async response=>{if(response.url().endsWith("/tenant/v1/operations")){const body=await response.json();operations.push({name,operationId:response.request().postDataJSON()?.operationId,status:response.status(),receipt:body.response,code:body.code});}});
 await login(page);
 for(const phase of ["first","refresh","relogin"]){
  if(phase==="refresh")await page.reload();
  if(phase==="relogin"){await page.getByRole("button",{name:"Sign out",exact:true}).click();await login(page);}
  await navigate(page,"repay-settle");await click(page,"#refreshOwnedPositionsBtn");await expect(page.locator("#ownedPositionList button[data-obligation-id]")).toHaveCount(1);await click(page,"#ownedPositionList button[data-obligation-id]");
  await expect(page.locator("#privatePaymentsRepaid")).toHaveText("$0.00 repaid");
  await expect(page.locator("#privatePaymentsStatus")).toHaveText(name==="restructure"?/restructured/i:name==="writeoff"?/written.off/i:/grace period|delinquent|repurchased/i);
  const paymentText=await page.locator("#servicingCasePanel").innerText();
  await page.screenshot({path:`${out}/human-${name}-${phase}.png`});
  await click(page,"#openServicingEvidenceBtn");await expect(page.locator("#ownedEvidencePanel")).toBeVisible();
  await expect(page.locator("#ownedEvidenceCount")).not.toHaveText("0");
  results.push({name,phase,paymentText,evidenceText:await page.locator("#ownedEvidencePanel").innerText()});
 }
 }}catch(e){results.push({error:e.message});const page=contexts.at(-1)?.pages()[0];if(page){await page.screenshot({path:`out/human-recovery-failure.png`.replace('out/',out+'/')});await writeFile(`${out}/human-recovery-failure.txt`,await page.locator("body").innerText());}process.exitCode=1;}
finally{await writeFile(`${out}/human-recovery.json`,JSON.stringify({source,apiMocks:false,realFunds:false,results,operations,actions},null,2));await browser.close();console.log(JSON.stringify({source,results:results.map(({name,phase,error})=>({name,phase,error})),operations:operations.length,visibleClicks:actions.length}));}
