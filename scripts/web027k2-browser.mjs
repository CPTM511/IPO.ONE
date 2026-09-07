import {chromium,expect} from "@playwright/test";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {readFile,writeFile,mkdir,chmod} from "node:fs/promises";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const out="output/playwright/web-027/k2";await mkdir(out,{recursive:true});
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
async function post(action,body){return w.page.evaluate(async({action,body})=>{const token=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;const response=await fetch('/auth/v1/passkey/'+action,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(body)});return{status:response.status(),body:await response.json()};},{action,body});}
try {
 w=await walletPage(legacy.privateKey);w.page.on("request",r=>{if(r.url().endsWith("/auth/v1/passkey/finish"))lastCeremony=r.postDataJSON();});cdp=await w.context.newCDPSession(w.page);await cdp.send('WebAuthn.enable');
 ({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
 try{for(const credential of JSON.parse(await readFile(statePath,'utf8')).credentials)await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});}catch(e){if(e.code!=='ENOENT')throw e;}
 await w.page.goto('http://127.0.0.1:8937/#risk-operations');assert.equal(new URL(w.page.url()).hostname,'localhost');
 results.push({name:'visible IP entry redirects to exact localhost',pass:true});await login();
 const before=await status();assert.equal(before.verified,false);results.push({name:'wallet alone does not grant recent MFA',pass:true});
 await clickCeremony(before.keys.length?'#verifyRiskPasskeyBtn':'#registerRiskPasskeyBtn');
 results.push({name:before.keys.length?'existing key assertion':'fresh registration with real authenticator cryptography',pass:true});
 await expect(w.page.locator('#refreshRiskWorkspaceBtn')).toBeEnabled();await w.page.locator('#refreshRiskWorkspaceBtn').click();
 await expect.poll(async()=>await w.page.locator('#riskPortfolioReference').innerText(),{timeout:20000}).not.toBe('Not recovered');
 await w.page.screenshot({path:out+'/verified-risk-desktop.png',fullPage:true});
 await writeFile(out+'/verified-risk.txt',await w.page.locator('body').innerText());
 results.push({name:'visible Risk refresh',pass:true,portfolio:await w.page.locator('#riskPortfolioHelper').innerText()});
 await w.page.reload();await expect(w.page.locator('#riskPasskeyBadge')).toHaveText('Recently verified',{timeout:20000});results.push({name:'refresh recovers durable MFA',pass:true});
 const restart=spawnSync('limactl',['shell','--workdir','/Users/cptmao/Documents/IPO.ONE','ipo-one-local','docker','restart','ipo-one-web027-candidate'],{encoding:'utf8'});assert.equal(restart.status,0);
 await expect.poll(async()=>{try{return(await fetch('http://localhost:8937/tenant/v1/healthz')).status}catch{return 0}},{timeout:30000}).toBe(200);
 await w.page.reload();await expect(w.page.locator('#riskPasskeyBadge')).toHaveText('Recently verified',{timeout:20000});results.push({name:'process restart recovers durable MFA',pass:true});
 await w.page.getByRole('button',{name:'Sign out',exact:true}).click();await login();assert.equal((await status()).verified,false);results.push({name:'logout/login invalidates previous session MFA',pass:true});
 await clickCeremony('#verifyRiskPasskeyBtn');results.push({name:'fresh native assertion restores access after sign-in',pass:true});
} catch(e){
 if(lastCeremony){const response=lastCeremony.response;const data=JSON.parse(Buffer.from(response.response.clientDataJSON,"base64url"));
  let library;try{const {verifyRegistrationResponse}=await import('@simplewebauthn/server');const check=await verifyRegistrationResponse({response,expectedChallenge:data.challenge,expectedOrigin:'http://localhost:8937',expectedRPID:'localhost',requireUserPresence:true,requireUserVerification:true,supportedAlgorithmIDs:[-7]});library={verified:check.verified,fmt:check.registrationInfo?.fmt,userVerified:check.registrationInfo?.userVerified};}catch(error){library={error:error.message};}
  results.push({diagnostic:{outerKeys:Object.keys(response),responseKeys:Object.keys(response.response),clientDataKeys:Object.keys(data),crossOrigin:data.crossOrigin,origin:data.origin,library}});
 }
 results.push({error:e.message,stack:e.stack?.split('\n').slice(0,4)});if(w){await w.page.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure.txt',await w.page.locator('body').innerText());}process.exitCode=1;}
finally{await saveAuthenticator();await writeFile(out+'/browser.json',JSON.stringify({source:JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json')).source,apiMocks:false,virtualAuthenticator:true,founderDeviceVerified:false,results,operationResults,errors,responses:w?.responses},null,2));await browser.close();console.log(JSON.stringify(results));}
