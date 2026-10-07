// Real hosted Human/Principal UI reads using the existing isolated QA wallets.
// No API mocks, enrollment changes, economic actions or user-wallet access.
import {chromium,expect} from '@playwright/test';
import {privateKeyToAccount} from 'viem/accounts';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {workspaceContrastJourney} from '../apps/web/test/support/workspace-contrast-journey.mjs';
import {renderedContrast} from '../apps/web/test/support/rendered-contrast.mjs';
const origin=process.env.WEB027_CONTRAST_ORIGIN||'https://ipo.one';
const out=process.env.WEB027_CONTRAST_OUTPUT||'output/playwright/web-027/formal/contrast';
const local=new URL(origin).hostname==='127.0.0.1';
const readiness=local?JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json')):await(await fetch(origin+'/readyz')).json();
const source=local?readiness.source:readiness.releaseId;
assert.match(source||'',/^[a-f0-9]{40}$/);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:7890',bypass:'127.0.0.1,localhost'}}),results=[];
try {
 for(const role of ['human','principal']) {
  const filename=local?'/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json':`/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime/web027-formal-${role}-wallet.json`;
  const account=privateKeyToAccount(JSON.parse(await readFile(filename)).privateKey);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.exposeFunction('__contrastSign',raw=>account.signMessage({message:{raw}}));
  await context.addInitScript(({address})=>{
   const provider={async request({method,params}){if(['eth_accounts','eth_requestAccounts'].includes(method))return[address];if(method==='eth_chainId')return'0x14a34';if(['wallet_switchEthereumChain','wallet_revokePermissions'].includes(method))return null;if(method==='personal_sign')return window.__contrastSign(params[0]);throw Error('Unsupported contrast acceptance wallet action');},on(){},removeListener(){}};
   window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'02702702-7000-4000-8000-000000000017',name:'WEB027 contrast acceptance wallet',rdns:'acceptance.web027.contrast',icon:'data:image/png;base64,iVBORw0KGgo='},provider}})));
  },{address:account.address});
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const roleOrigin=local?`http://127.0.0.1:${role==='human'?8935:8936}`:origin;
  await page.goto(roleOrigin+'/');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  if(!local)await page.locator(role==='human'?'#borrowerWorkspaceRoleBtn':'#principalWorkspaceRoleBtn').click();
  await page.getByRole('button',{name:/WEB027 contrast acceptance wallet/}).click();
  await page.locator('#walletSignInBtn').click();
  await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:45000});
  await expect(page.locator('#accessLayer')).toBeHidden();
  const reports=await workspaceContrastJourney(page,{role,screenshots:out+'/screenshots'});
  await page.getByRole('combobox',{name:'Appearance',exact:true}).selectOption('dark');
  await page.reload();await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
  await expect(page.locator('html')).toHaveAttribute('data-ipo-theme','dark');
  reports.push({role,state:'authenticated dark refresh',...await renderedContrast(page)});
  const result={role,reports,signIn:true,darkPreferenceSurvivedRefresh:true};
  results.push(result);await writeFile(`${out}/${role}.json`,JSON.stringify({source,...result},null,2));
  assert.deepEqual(reports.flatMap(r=>r.failures.map(f=>({view:r.view,theme:r.theme,width:r.width,...f}))),[]);
  assert.deepEqual(reports.flatMap(r=>r.manual),[]);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await context.close();
  console.log(JSON.stringify({role,source,states:reports.length,checked:reports.reduce((n,r)=>n+r.checked,0),failures:0}));
 }
} finally {
 await writeFile(`${out}/result.json`,JSON.stringify({source,origin,results,apiMocks:false,assetMocks:false},null,2));
 await browser.close();
}
