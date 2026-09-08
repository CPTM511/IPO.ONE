// Prepare three real local synthetic schedules through visible Human controls.
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
 await page.goto("https://ipo.one/#request-credit");await page.getByRole("button",{name:/^(Log in|Sign in)$/,exact:true}).click();await page.getByRole("button",{name:/WEB027 formal acceptance wallet/}).click();await click(page,"#walletSignInBtn");await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:45000});await expect(page.locator("#accessLayer")).toBeHidden();
 await page.screenshot({path:out+"/baseline-human.png"});await writeFile(out+"/baseline-human.txt",await page.locator("body").innerText());results.push({baseline:true,source,humanSignedIn:true});
} catch(e){results.push({error:e.message});const page=contexts.at(-1)?.pages()[0];if(page)await writeFile(out+"/baseline-failure.txt",await page.locator("body").innerText());process.exitCode=1;}
finally{await writeFile(out+"/baseline.json",JSON.stringify({source,results,actions,apiMocks:false},null,2));await browser.close();console.log(JSON.stringify(results));}
