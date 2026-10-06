import { chromium, expect } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const main='/Users/cptmao/Documents/IPO.ONE';
const state=main+'/.ipo-one/web026-runtime';
const out=main+'/output/playwright/web-026-runtime';
await mkdir(out,{recursive:true});
const {privateKey}=JSON.parse(await readFile(state+'/isolated-qa-wallet.json'));
const account=privateKeyToAccount(privateKey);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.exposeFunction('__web026Sign', async message => account.signMessage({message:{raw:message}}));
await context.addInitScript(({address})=>{
  const provider={
    async request({method,params}){
      if(['eth_requestAccounts','eth_accounts'].includes(method))return [address];
      if(method==='eth_chainId')return '0x14a34';
      if(method==='wallet_switchEthereumChain'||method==='wallet_revokePermissions')return null;
      if(method==='personal_sign')return window.__web026Sign(params[0]);
      throw Object.assign(new Error('Isolated QA wallet rejects unsupported method'),{code:4200});
    },on(){},removeListener(){}
  };
  function announce(){window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'02602602-6000-4000-8000-000000000001',name:'WEB026 isolated test wallet',rdns:'local.web026.test',icon:'data:image/png;base64,iVBORw0KGgo='},provider}}));}
  window.addEventListener('eip6963:requestProvider',announce);
},{address:account.address});
const page=await context.newPage();
const responses=[];page.on('response',r=>{if(r.url().includes('/auth/')||r.status()>=400)responses.push({path:new URL(r.url()).pathname,status:r.status()});});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function login(port,role='human_borrower'){
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  if(role==='principal_controller')await page.locator('[data-wallet-workspace-role="principal_controller"]').click();
  await page.getByRole('button',{name:/WEB026 isolated test wallet/}).click();
  await page.locator('#walletSignInBtn').click();
  await expect(page.locator('#continueAuthenticatedSessionBtn')).toBeVisible({timeout:20000});
  await page.locator('#continueAuthenticatedSessionBtn').click();
  await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:20000});
  await expect(page.locator('#accessLayer')).toBeHidden();
}
try{
 await login(8915);
 const initialTitle=await page.locator('#viewTitle').innerText();
 await page.locator('#humanCreditAmount').fill('43.21');
 await page.locator('#submitHumanCreditBtn').click();
 await expect(page.locator('#humanApplicationStatus')).toHaveText('Offer ready',{timeout:15000});
 await page.locator('#humanOfferAcknowledge').check();
 await page.locator('#acceptHumanOfferBtn').click();
 await expect(page.locator('#accessLayer')).toBeVisible();
 await page.getByRole('button',{name:/WEB026 isolated test wallet/}).click();
 await page.locator('#walletSignInBtn').click();
 await expect(page.locator('#walletAddressStatus')).not.toHaveText('Not connected');
 await page.locator('#accessCloseBtn').click();
 async function confirm(button){await page.locator(button).click();await expect(page.locator('#economicActionLayer')).toBeVisible();await page.locator('#economicActionConfirmBtn').click();await expect(page.locator('#economicActionLayer')).toBeHidden({timeout:15000});}
 await confirm('#acceptHumanOfferBtn');
 await expect(page.locator('#humanObligationCard')).toBeVisible({timeout:15000});
 await confirm('#executeHumanObligationBtn');
 await expect(page.locator('#humanObligationExecution')).toContainText('Executed',{timeout:15000});
 await page.locator('#humanRepaymentAmount').fill('5');
 await confirm('#postHumanRepaymentBtn');
 await expect(page.locator('#humanObligationRepaid')).toHaveText('$5.00',{timeout:15000});
 const expected={id:await page.locator('#humanObligationId').textContent(),outstanding:await page.locator('#humanObligationOutstanding').textContent(),repaid:await page.locator('#humanObligationRepaid').textContent()};
 await page.screenshot({path:out+'/copy-human-repayment.png'});
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.reload();
 await expect(page.locator('#humanObligationId')).toHaveText(expected.id,{timeout:15000});
 await expect(page.locator('#humanObligationRepaid')).toHaveText(expected.repaid);
 await page.locator('#topbarSignOutBtn').click();
 await login(8915);
 await expect(page.locator('#humanObligationId')).toHaveText(expected.id,{timeout:15000});
 const restart=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker','restart','ipo-one-web026-copy-v3'],{encoding:'utf8'});
 if(restart.status!==0)throw Error('Isolated candidate restart failed');
 for(let i=0;i<20;i++){try{if((await fetch('http://127.0.0.1:8915/tenant/v1/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 await page.reload();
 await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
 await expect(page.locator('#humanObligationId')).toHaveText(expected.id);
 await expect(page.locator('#humanObligationOutstanding')).toHaveText(expected.outstanding);
 await expect(page.locator('#humanObligationRepaid')).toHaveText(expected.repaid);
 await page.locator('#topbarSignOutBtn').click();
 await login(8916,'principal_controller');
 await expect(page.locator('#viewTitle')).toHaveText('Agent tasks');
 await page.screenshot({path:out+'/copy-agent-authenticated.png'});
 await page.reload();
 await expect(page.locator('#viewTitle')).toHaveText('Agent tasks');
 const result={passed:true,source:'9d2caac9085b6d4e8c1f3575e8b7d5ad147d4e7e',environment:'isolated durable copy',testWalletOnly:true,apiMocks:false,humanVisibleJourney:['wallet signature login','request Offer','review and accept','confirm execution','repay 5 synthetic USD','clear browser storage','refresh','logout and re-login','restart service'],agentVisibleJourney:['wallet signature login as Principal','recover Agent tasks on refresh'],serverRecovery:true,actualFounderLoginVerified:false};
 await writeFile(out+'/copy-acceptance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 if(errors.length)throw Error(JSON.stringify(errors));
}catch(error){console.log(JSON.stringify({responses,access:await page.locator('#accessLayer').innerText(),errors}));throw Error(error.message.split('Call log:')[0]);}finally{await browser.close();}
