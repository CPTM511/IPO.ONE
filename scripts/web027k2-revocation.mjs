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
async function post(action,body){return w.page.evaluate(async({action,body})=>{const token=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;const response=await fetch('/auth/v1/passkey/'+action,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};},{action,body});}async function prepareAssertion(){
 const begin=await post('begin',{purpose:'verify'});assert.equal(begin.status,200,JSON.stringify(begin.body));
 const response=await w.page.evaluate(async options=>{const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));options.challenge=decode(options.challenge);options.allowCredentials=options.allowCredentials.map(c=>({...c,id:decode(c.id)}));return (await navigator.credentials.get({publicKey:options})).toJSON();},begin.body.options);
 return{challengeId:begin.body.challengeId,response};
}
async function signInAgain(){await w.page.getByRole('button',{name:'Sign out',exact:true}).click();await login();}
try {
 w=await walletPage(legacy.privateKey);cdp=await w.context.newCDPSession(w.page);await cdp.send('WebAuthn.enable');
 ({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
 for(const credential of JSON.parse(await readFile(statePath,'utf8')).credentials)await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});
 await w.page.goto('http://localhost:8937/#risk-operations');await login();assert.equal((await status()).verified,false);
 await clickCeremony('#verifyRiskPasskeyBtn');
 // A second authenticator permits revocation testing while preserving a usable Risk key.
 const oldIds=(await status()).keys.map(k=>k.id);
 await cdp.send('WebAuthn.setAutomaticPresenceSimulation',{authenticatorId,enabled:false});
 const backup=(await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})).authenticatorId;
 await clickCeremony('#registerRiskPasskeyBtn');
 const afterAdd=await status();assert.equal(afterAdd.keys.length,oldIds.length+1);const added=afterAdd.keys.find(k=>!oldIds.includes(k.id));
 const newIndex=afterAdd.keys.findIndex(k=>k.id===added.id)+1;
 await w.page.getByRole('button',{name:`Revoke Passkey ${newIndex}`,exact:true}).click();
 await w.page.locator('#cancelRiskPasskeyRevokeBtn').click();assert.equal((await status()).keys.length,afterAdd.keys.length);results.push({name:'visible revoke cancellation preserves key',pass:true});
 await w.page.getByRole('button',{name:`Revoke Passkey ${newIndex}`,exact:true}).click();
 const revocation=w.page.waitForResponse(r=>r.url().endsWith('/auth/v1/passkey/revoke'));
 await w.page.locator('#confirmRiskPasskeyRevokeBtn').click();assert.equal((await revocation).status(),200);
 assert.equal((await status()).verified,false);results.push({name:'revoking the key immediately invalidates its session evidence',pass:true});
 await expect(w.page.locator('#riskPasskeyBadge')).toHaveText('Verification required');
 assert.equal((await post('begin',{purpose:'register'})).status,400);results.push({name:'revocation cannot downgrade enrollment to wallet-only',pass:true});
 await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:backup});
 await cdp.send('WebAuthn.setAutomaticPresenceSimulation',{authenticatorId,enabled:true});
 await clickCeremony('#verifyRiskPasskeyBtn');results.push({name:'surviving Passkey restores protected Risk access',pass:true});
 await signInAgain();const expired=await prepareAssertion();console.log('Waiting for the real two-minute challenge expiry while other independent checks may proceed.');
 await new Promise(resolve=>setTimeout(resolve,121000));
 assert.equal((await post('finish',expired)).status,400);assert.equal((await status()).verified,false);results.push({name:'real elapsed challenge expiry denies verification',pass:true});
 await clickCeremony('#verifyRiskPasskeyBtn');await saveAuthenticator();
} catch(e){results.push({error:e.message,stack:e.stack?.split('\n').slice(0,4)});if(w){await w.page.screenshot({path:out+'/revocation-failure.png',fullPage:true});await writeFile(out+'/revocation-failure.txt',await w.page.locator('body').innerText());}process.exitCode=1;}
finally{await saveAuthenticator();await writeFile(out+'/revocation.json',JSON.stringify({source:JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json')).source,apiMocks:false,virtualAuthenticator:true,founderDeviceVerified:false,results,operationResults,errors},null,2));await browser.close();console.log(JSON.stringify(results));}
