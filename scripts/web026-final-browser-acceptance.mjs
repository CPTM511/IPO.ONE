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
try {
 await login(8915);
 await expect(page.locator('#humanObligationRepaid')).toHaveText('$5.00',{timeout:15000});
 await expect(page.locator('#humanObligationOutstanding')).toHaveText('$38.21');
 const contrast=[];
 for(const theme of ['light','dark']){
  await page.getByRole('combobox',{name:'Appearance',exact:true}).selectOption(theme);
  await page.locator('#humanObligationCard').scrollIntoViewIfNeeded();
  const ratios=await page.evaluate(()=>{
    function l(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
    const bg=l(getComputedStyle(document.querySelector('.obligation-card')).backgroundColor);
    return [...document.querySelectorAll('.obligation-card-heading strong,.obligation-card-heading small,.obligation-schedule strong,.obligation-schedule span')].map(n=>{const fg=l(getComputedStyle(n).color);return(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)});
  });
  expect(ratios.length).toBeGreaterThan(3);for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
  contrast.push({theme,minimumRatio:Math.min(...ratios)});
  await page.screenshot({path:out+'/final-human-'+theme+'.png'});
 }
 for(const view of ['obligations','activity-proofs','request-credit']){await page.locator(`.nav-item[data-view="${view}"]`).click();await expect(page.locator(`.view[data-view-panel="${view}"]`)).toBeVisible();}
 await page.reload();await expect(page.locator('#humanObligationRepaid')).toHaveText('$5.00');
 await page.locator('#topbarSignOutBtn').click();
 await login(8916,'principal_controller');await expect(page.locator('#viewTitle')).toHaveText('Agent tasks');
 await page.screenshot({path:out+'/final-agent.png'});
 const live=await browser.newPage();await live.goto('http://127.0.0.1:8895/');await live.getByRole('button',{name:'Log in',exact:true}).click();await expect(live.locator('#accessLayer')).toBeVisible();await expect(live.locator('#walletUnavailablePanel')).toBeVisible();await live.screenshot({path:out+'/live-login.png'});
 if(errors.length)throw Error(JSON.stringify(errors));
 const result={passed:true,source:'d00f1ce747e357e9df4e442e32417922f6e7411b',apiMocks:false,isolatedDurableCopy:true,existingRepaymentRecovered:true,humanAndPrincipalSignatureLogin:true,visibleNavigation:true,contrast,liveLoginPage:true,founderSignatureVerified:false};
 await writeFile(out+'/final-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} catch(error){console.log(JSON.stringify({responses,errors}));throw Error(error.message.split('Call log:')[0]);} finally {await browser.close();}
