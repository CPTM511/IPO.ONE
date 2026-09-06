import { chromium, expect } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const main='/Users/cptmao/Documents/IPO.ONE',state=main+'/.ipo-one/web027-runtime',out=process.cwd()+'/output/playwright/web-027/access';
const base=Number(process.argv[2]??8935);const stage=process.argv[3]??'candidate';
await mkdir(out,{recursive:true});
const path=state+'/web026h-'+stage+'-qa-wallet.json';
let wallet;try{wallet=JSON.parse(await readFile(path));}catch(e){if(e.code!=='ENOENT')throw e;wallet={privateKey:generatePrivateKey()};await writeFile(path,JSON.stringify(wallet),{mode:0o600});}
const browser=await chromium.launch({headless:true});const results=[],errors=[];
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
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/auth/'))responses.push({path:new URL(r.url()).pathname,status:r.status()});});
 return{page,context,signatures:()=>signatures,responses};
}
async function signIn(w,port,role,hash){
 const {page}=w;await page.goto(`http://127.0.0.1:${port}/${hash}`);
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await expect(page.locator(`[data-wallet-workspace-role="${role}"]`)).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:/WEB027 access test wallet/}).click();await page.locator('#walletSignInBtn').click();
 await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:20000});
 await expect(page.locator('#accessLayer')).toBeHidden();
 await expect(page.locator('#viewTitle')).toHaveText(role==='principal_controller'?'Agent tasks':/Your next step|Credit workspace/);
}
try{
 for(const [offset,role,hash]of[[1,'principal_controller','#agent-console'],[0,'human_borrower','#request-credit']]){
  const w=await walletPage(wallet.privateKey);try{
   await signIn(w,base+offset,role,hash);
   const session=await w.page.evaluate(async()=>{const r=await fetch('/auth/v1/options',{credentials:'include'});return r.json();});
   if(role==='human_borrower' && stage.startsWith('fresh-onboarding')) {
    await expect(w.page.locator('#humanGuidePrimaryBtn')).toHaveText('Create sandbox profile');
    await w.page.locator('#humanGuidePrimaryBtn').click();
    await expect(w.page.locator('#humanGuidePrimaryBtn')).toHaveText('Create scoped Consent');
    await w.page.locator('#humanGuidePrimaryBtn').click();
    await expect(w.page.locator('#humanGuidePrimaryBtn')).toHaveText('Choose request terms');
    await w.page.locator('#humanCreditAmount').fill('20.00');
    await w.page.locator('#submitHumanCreditBtn').click();
    await expect(w.page.locator('#humanApplicationStatus')).toHaveText('Offer ready');
    results.push({freshHumanProfileConsentAndOffer:true});
   }
   if(role==='principal_controller') {
    await w.page.getByRole('button',{name:'Agents',exact:true}).click();
    await expect(w.page.locator('#agentWorkspaceSelectionStatus')).not.toHaveText('Checking Agent assignment');
    results.push({newPrincipalAssignment:await w.page.locator('#agentWorkspaceSelectionStatus').innerText(),note:'No assignment is never counted as an operable Agent lifecycle'});
    await w.page.getByRole('button',{name:'Tasks',exact:true}).click();
   }

   await w.page.screenshot({path:out+'/'+stage+'-'+role+'.png'});
   if(process.argv[4]==='restart' && offset===1){
    const restarted=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker','restart','ipo-one-web027-candidate'],{encoding:'utf8'});assert.equal(restarted.status,0);
    let ready=false;for(let attempt=0;attempt<60;attempt++){try{ready=(await fetch(`http://127.0.0.1:${base}/tenant/v1/healthz`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert.equal(ready,true);
   }
   await w.page.reload();await expect(w.page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
   await expect(w.page.locator('#accessLayer')).toBeHidden();
   await w.page.locator('#topbarSignOutBtn').click();await signIn(w,base+offset,role,hash);
   const after=await w.page.evaluate(async()=>{const r=await fetch('/auth/v1/options',{credentials:'include'});return r.json();});
   assert.equal(session.sessionActive,true);assert.equal(after.sessionActive,true);
   assert.equal(session.sessionWorkspaceRole,role);assert.equal(after.sessionWorkspaceRole,role);
   results.push({role,registered:true,automaticEntry:true,refresh:true,relogin:true,signatures:w.signatures(),responses:w.responses});
  }catch(e){console.log(JSON.stringify({role,responses:w.responses,status:await w.page.locator('#accessAuthStatus').textContent()}));throw e;}finally{await w.context.close();}
 }
 if(stage.startsWith('copy')){
  const old=JSON.parse(await readFile(state+'/isolated-qa-wallet.json'));const w=await walletPage(old.privateKey);try{await signIn(w,base,'human_borrower','#request-credit');await expect(w.page.locator('#humanObligationOutstanding')).toHaveText('$38.21');results.push({legacyInvitedWallet:true,existingObligationPreserved:true});}finally{await w.context.close();}
 }
 const canceled=await walletPage(generatePrivateKey(),'cancel');try{
  await canceled.page.goto(`http://127.0.0.1:${base+1}/#agent-console`);await canceled.page.getByRole('button',{name:'Log in',exact:true}).click();await canceled.page.getByRole('button',{name:/WEB027 access test wallet/}).click();await canceled.page.locator('#walletSignInBtn').click();
  await expect(canceled.page.locator('#accessLayer')).toBeVisible();await expect(canceled.page.locator('#accessAuthStatus')).toContainText(/cancel|reject/i);await expect(canceled.page.locator('#walletSignInBtn')).toBeEnabled();results.push({canceledSignatureRecoverable:true});
 }finally{await canceled.context.close();}

 if(stage.startsWith('fresh-onboarding')) for(const [port,role] of [[base+2,'risk'],[base+3,'capitalPartner']]) {
  const legacy=JSON.parse(await readFile(main+'/.ipo-one/web026-runtime/isolated-qa-wallet.json'));
  const w=await walletPage(legacy.privateKey);
  try {
   await w.page.goto(`http://127.0.0.1:${port}/`);
   await w.page.getByRole('button',{name:'Log in',exact:true}).click();
   await w.page.getByRole('button',{name:/WEB027 access test wallet/}).click();
   const pending=w.page.waitForResponse(r=>r.url().endsWith('/auth/v1/wallet/verify'));
   await w.page.locator('#walletSignInBtn').click();
   const response=await pending;const body=await response.json();
   await expect(w.page.locator('#accessLayer')).toBeVisible();
   await w.page.screenshot({path:out+'/'+role+'-login-blocked.png'});
   results.push({role,port,passed:false,blocked:true,status:response.status(),code:body.code??body.error?.code,visibleMessage:await w.page.locator('#accessAuthStatus').innerText()});
  }finally{await w.context.close();}
 }
 assert.deepEqual(errors,[]);
 const result={ordinaryAuthenticationPassed:true,fullScopePassed:false,scope:'Authentication only; no all-capability verdict',source:JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json','utf8')).source,stage,basePort:base,apiMocks:false,durableDatabase:true,continueButtonClicks:0,serviceRestartRecovered:process.argv[4]==='restart',results};
 await writeFile(out+'/'+stage+'-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
