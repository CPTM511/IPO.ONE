import {chromium,expect} from "@playwright/test";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
const out="output/playwright/web-027/j1";await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const legacy=JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json"));
async function walletPage(key,behavior='sign'){
 const account=privateKeyToAccount(key);const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 let signatures=0;await context.exposeFunction('__web026hSign',async raw=>{signatures++;if(behavior==='cancel')throw Error('cancel');return account.signMessage({message:{raw}});});
 await context.addInitScript(({address,behavior})=>{
  const provider={async request({method,params}){
   if(['eth_requestAccounts','eth_accounts'].includes(method))return[address];if(method==='eth_chainId')return'0x14a34';
   if(['wallet_switchEthereumChain','wallet_revokePermissions'].includes(method))return null;
   if(method==='personal_sign'){if(behavior==='cancel')throw Object.assign(new Error('User rejected signature'),{code:4001});return window.__web026hSign(params[0]);}
   throw Object.assign(new Error('Unsupported QA wallet operation'),{code:4200});
  },on(){},removeListener(){}};
  const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'02602602-6000-4000-8000-000000000008',name:'WEB027 access test wallet',rdns:'local.web026h.test',icon:'data:image/png;base64,iVBORw0KGgo='},provider}}));
  window.addEventListener('eip6963:requestProvider',announce);
 },{address:account.address,behavior});
 const page=await context.newPage();const responses=[];
 page.on('pageerror',e=>errors.push(e.message));page.on("requestfailed",r=>errors.push({url:new URL(r.url()).pathname,error:r.failure()?.errorText}));page.on('response',r=>{if(r.url().includes('/auth/'))responses.push({path:new URL(r.url()).pathname,status:r.status()});});
 return{page,context,signatures:()=>signatures,responses};
}

try{
 for(const [port,role,hash] of [[8937,"risk_operator","risk-operations"],[8938,"capital_partner_operator","capital-partners"]]){
  for(const invited of [true,false]){
   const w=await walletPage(invited?legacy.privateKey:generatePrivateKey());
   try{
    await w.page.goto(`http://127.0.0.1:${port}/#${hash}`);await w.page.getByRole("button",{name:"Log in",exact:true}).click();
    await expect(w.page.locator(`[data-wallet-workspace-role="${role}"]`)).toHaveAttribute("aria-checked","true");
    await w.page.getByRole("button",{name:/WEB027 access test wallet/}).click();
    const pending=w.page.waitForResponse(r=>r.url().endsWith("/auth/v1/wallet/verify"));
    await w.page.locator("#walletSignInBtn").click();const r=await pending;const response=invited?null:await r.json();
    if(invited){
     assert.equal(r.status(),200);
     await expect(w.page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:20000});
     await expect(w.page.locator("#accessLayer")).toBeHidden();
     const options=await w.page.evaluate(async()=> (await fetch("/auth/v1/options")).json());
     assert.equal(options.sessionWorkspaceRole,role);assert.equal(options.sessionActive,true);
     await expect(w.page.locator("#accessLayer")).toBeHidden({timeout:20000});
     await w.page.reload();await expect(w.page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:20000});await expect(w.page.locator("#accessLayer")).toBeHidden();
     await w.page.getByRole("button",{name:"Sign out",exact:true}).click();
     await expect(w.page.getByRole("button",{name:"Log in",exact:true})).toBeVisible();
     await w.page.getByRole("button",{name:"Log in",exact:true}).click();await w.page.getByRole("button",{name:/WEB027 access test wallet/}).click();await w.page.locator("#walletSignInBtn").click();
     await expect(w.page.locator("#sidebarApiStatus")).toHaveText("Authenticated",{timeout:20000});await expect(w.page.locator("#accessLayer")).toBeHidden();
     results.push({role,invited:true,sessionRole:options.sessionWorkspaceRole,login:true,refresh:true,logoutLogin:true,workspaceStatus:await w.page.locator("#sidebarApiStatus").innerText()});
    }else{assert.ok(r.status()>=400);await expect(w.page.locator("#accessLayer")).toBeVisible();results.push({role,invited:false,denied:true,code:response.code});}
    await w.page.screenshot({path:`${out}/${role}-${invited}.png`});await writeFile(`${out}/${role}-${invited}.txt`,await w.page.locator("body").innerText());
   }catch(e){results.push({role,invited,error:e.message.slice(0,700),responses:w.responses});await w.page.screenshot({path:`${out}/${role}-${invited}-failure.png`});await writeFile(`${out}/${role}-${invited}-failure.txt`,await w.page.locator("body").innerText());}
   finally{await w.context.close();}
  }
 }
}finally{await writeFile(out+"/roles.json",JSON.stringify({source:JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source,apiMocks:false,results,errors},null,2));await browser.close();console.log(JSON.stringify(results));}
