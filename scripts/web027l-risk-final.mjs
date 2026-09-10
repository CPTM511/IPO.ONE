import {chromium,expect} from "@playwright/test";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {readFile,writeFile,mkdir,chmod} from "node:fs/promises";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const out="output/playwright/web-027/l-acceptance";await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[],operationResults=[];
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
 page.on('pageerror',e=>errors.push(e.message));page.on("response",async r=>{if(r.url().endsWith("/tenant/v1/operations")){try{const body=await r.json();operationResults.push({port:new URL(r.url()).port,operationId:r.request().postDataJSON()?.operationId,status:r.status(),code:body.code,schemaVersion:body.response?.schemaVersion});}catch{}}});page.on("requestfailed",r=>errors.push({url:new URL(r.url()).pathname,error:r.failure()?.errorText}));page.on('response',r=>{if(r.url().includes('/auth/'))responses.push({path:new URL(r.url()).pathname,status:r.status()});});
 return{page,context,signatures:()=>signatures,responses};
}
const statePath="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime/web027k2-risk-authenticator.json";
let w,cdp,authenticatorId, lastCeremony;
const status = async()=>w.page.evaluate(async()=> (await fetch('/auth/v1/passkey/status')).json());
async function login(){
 await w.page.getByRole('button',{name:'Log in',exact:true}).click();
 await w.page.getByRole('button',{name:/WEB027 access test wallet/}).click();
 const response=w.page.waitForResponse(r=>r.url().endsWith('/auth/v1/wallet/verify'));
 await w.page.locator('#walletSignInBtn').click();assert.equal((await response).status(),200);
 await expect(w.page.locator('#accessLayer')).toBeHidden({timeout:20000});
 await expect(w.page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:20000});
 await expect(w.page.locator('#riskPasskeyPanel')).toBeVisible();
}
async function saveAuthenticator(){if(cdp&&authenticatorId){const credentials=await cdp.send('WebAuthn.getCredentials',{authenticatorId});await writeFile(statePath,JSON.stringify(credentials),{mode:0o600});await chmod(statePath,0o600);}}
async function clickCeremony(selector){const pending=w.page.waitForResponse(r=>r.url().endsWith('/auth/v1/passkey/finish'));await w.page.locator(selector).click();const response=await pending;assert.equal(response.status(),200,JSON.stringify(await response.json()));await expect(w.page.locator('#riskPasskeyBadge')).toHaveText('Recently verified');await saveAuthenticator();}
async function post(action,body){return w.page.evaluate(async({action,body})=>{const token=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;const response=await fetch('/auth/v1/passkey/'+action,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};},{action,body});}
try {
 const h=(await walletPage(legacy.privateKey)).page;await h.goto('http://127.0.0.1:8935/#request-credit');await h.getByRole('button',{name:'Log in',exact:true}).click();await h.getByRole('button',{name:/WEB027 access test wallet/}).click();await h.locator('#walletSignInBtn').click();await expect(h.locator('#sidebarApiStatus')).toHaveText('Authenticated');
 await h.locator('#newHumanApplicationBtn').click();await h.locator('#humanGuidePrimaryBtn').click();await h.locator('#humanCreditAmount').fill('25.00');await h.locator('#submitHumanCreditBtn').click();await expect(h.locator('#humanApplicationStatus')).toHaveText('Offer ready');
 await h.getByText('Get help with a record · Cases & corrections',{exact:true}).click();const cases=[];
 for(const reason of ['context_missing','record_inaccurate']) {
  await h.locator('#pilotCaseTarget').selectOption({index:1});await h.locator('#pilotCaseReason').selectOption(reason);
  const pending=h.waitForResponse(r=>r.request().postDataJSON()?.operationId==='pilotFileCase');await h.locator('#filePilotCaseBtn').click();const response=await pending;assert.equal(response.status(),200);cases.push((await response.json()).response);
 }
 results.push({name:'Human visibly files two final-source synthetic cases',receipts:cases});
 w=await walletPage(legacy.privateKey);cdp=await w.context.newCDPSession(w.page);await cdp.send('WebAuthn.enable');({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
 for(const credential of JSON.parse(await readFile(statePath,'utf8')).credentials)await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});
 await w.page.goto('http://localhost:8937/#risk-operations');await login();await clickCeremony('#verifyRiskPasskeyBtn');await expect(w.page.locator('#refreshRiskWorkspaceBtn')).toBeEnabled({timeout:20000});await expect(w.page.locator('#riskPortfolioHelper')).toContainText('Authorized point-in-time exposure loaded');
 await w.page.locator('#loadPilotCaseQueueBtn').click();await expect(w.page.locator('#pilotCaseQueueHelper')).toContainText('Queue loaded');
 for(const [i,c] of cases.entries()) {
  const id=c.pilotCase?.pilotCaseId??c.pilotCaseId;assert.ok(id,'Case receipt identity');
  for(const transition of ['assign',i===0?'uphold':'correct']){
   const button=w.page.locator(`button[data-pilot-case-id="${id}"][data-pilot-case-transition="${transition}"]`);await expect(button).toBeVisible();await expect(button).toBeEnabled({timeout:20000});
   if(transition==='correct')await w.page.locator(`select[data-pilot-case-correction="${id}"]`).selectOption('status_context_added');
   const pending=w.page.waitForResponse(r=>r.request().postDataJSON()?.operationId==='pilotTransitionCase');await button.click();const response=await pending;assert.equal(response.status(),200,JSON.stringify(await response.json()));results.push({name:'Risk visible Case '+transition,receipt:(await response.json()).response});
  }
 }
 await w.page.reload();await expect(w.page.locator('#riskPasskeyBadge')).toHaveText('Recently verified');await w.page.locator('#loadPilotCaseQueueBtn').click();await expect(w.page.locator('#loadPilotCaseQueueBtn')).toBeEnabled();
 await h.locator('#refreshPilotCasesBtn').click();await expect(h.locator('#pilotCaseRows')).toContainText('Resolved');results.push({name:'Both sides recover terminal Case status',humanText:await h.locator('#pilotCaseRows').innerText()});
 results.push({name:'Current servicing queue observed',count:await w.page.locator('#servicingQueueCaseCount').innerText(),text:await w.page.locator('.servicing-queue-card').innerText()});
 await w.page.locator('#refreshRiskSecuredPoolBtn').click();await expect(w.page.locator('#refreshRiskSecuredPoolBtn')).toBeEnabled({timeout:20000});results.push({name:'Visible current Pool boundary read',text:await w.page.locator('#riskSecuredPoolHelper').innerText(),status:await w.page.locator('#riskSecuredPoolStatus').innerText()});
 await w.page.screenshot({path:out+'/risk-cases.png',fullPage:true});await writeFile(out+'/risk-cases.txt',await w.page.locator('body').innerText());
} catch(e){results.push({error:e.message,stack:e.stack?.split('\n').slice(0,3)});if(w){await w.page.screenshot({path:out+'/risk-failure.png',fullPage:true});await writeFile(out+'/risk-failure.txt',await w.page.locator('body').innerText());}process.exitCode=1;}
finally{await saveAuthenticator();await writeFile(out+'/risk-final.json',JSON.stringify({source:JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json')).source,apiMocks:false,virtualAuthenticator:true,results,operationResults,errors},null,2));await browser.close();console.log(JSON.stringify(results.map(x=>({name:x.name,error:x.error,count:x.count}))));}
