// Real local HTTP Gateway and PostgreSQL, with an ephemeral signing EOA and
// read-only RPC metadata fixture. No financial endpoint is mocked; this is not
// production wallet-brand or user acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createPrivatePilotRuntime} from '../../private-pilot/src/private-pilot-runtime.js';

const origin='http://127.0.0.1:8891';
test('B3 visible Human lifecycle uses durable services, recovers and is localized', {timeout:180000}, async()=>{
  assert.equal(process.env.DATABASE_URL,'postgresql://cptmao@127.0.0.1:59989/b3_browser_test_20261108');
  const account=privateKeyToAccount(generatePrivateKey());
  const dir=new URL('../../../.ipo-one/b3-browser/',import.meta.url);
  await mkdir(dir,{recursive:true});
  const invitation=JSON.parse(await readFile(new URL('../../../.ipo-one/local-stack/authentication-invitation.v1.json',import.meta.url),'utf8'));
  invitation.walletAddress=account.address;
  const file=new URL('invitation.json',dir); await writeFile(file,JSON.stringify(invitation),{mode:0o600});
  const previous=process.env.IPO_ONE_LOCAL_AUTH_INVITATION_FILE;
  process.env.IPO_ONE_LOCAL_AUTH_INVITATION_FILE=file.pathname;
  const originalFetch=globalThis.fetch;
  // Only signature-verifier read metadata is synthetic. EIP-191 verification
  // uses the actual signature; auth, authorization, commands and DB are real.
  globalThis.fetch=async(url,options)=>{
    if(!String(url).startsWith('https://')) return originalFetch(url,options);
    const req=JSON.parse(options.body); let result;
    if(req.method==='eth_chainId') result='0x14a34';
    else if(req.method==='eth_getBlockByNumber') result={number:'0x123',hash:`0x${'77'.repeat(32)}`,timestamp:`0x${Math.floor(Date.now()/1000).toString(16)}`};
    else if(req.method==='eth_getCode') result='0x';
    else throw new Error('Unexpected RPC method in local EOA fixture');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{headers:{'content-type':'application/json'}});
  };
  let runtime,browser;
  const start=()=>createPrivatePilotRuntime({ownerConnectionString:process.env.DATABASE_URL,basePort:8891,syntheticCollateralEnabled:true});
  try{
    runtime=await start(); browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const requests=[],errors=[];
    await context.exposeBinding('signLocalTestMessage',async(_,message)=>account.signMessage({message:{raw:message}}));
    await context.addInitScript(address=>{
      localStorage.setItem('ipo-one-language','en');
      const provider={on(){},removeListener(){},async request({method,params}){
        if(method==='eth_requestAccounts'||method==='eth_accounts')return[address];
        if(method==='eth_chainId')return'0x14a34';
        if(method==='wallet_switchEthereumChain')return null;
        if(method==='personal_sign')return window.signLocalTestMessage(params[0]);
        throw new Error(`Unsupported test-wallet request ${method}`);
      }};
      window.ethereum=provider;
      window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{provider,info:{uuid:'12345678-1234-4234-9234-123456789012',name:'MetaMask',rdns:'io.metamask',icon:'data:image/png;base64,iVBORw0KGgo='}}})));
    },account.address);
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.url().endsWith('/tenant/v1/operations'))requests.push(r.postDataJSON().operationId);});
    const click=async id=>{await page.locator(`#${id}`).click();};
    const confirm=async()=>{await expect(page.locator('#economicActionLayer')).toBeVisible();await click('economicActionConfirmBtn');await expect(page.locator('#economicActionLayer')).toBeHidden();};
    const login=async()=>{
      await page.getByRole('button',{name:'Open IPO.ONE',exact:true}).filter({visible:true}).first().click();
      await page.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();
      await page.locator('[data-wallet-chain="84532"]').click(); await click('walletSignInBtn');
      await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
    };
    const reconnect=async()=>{
      await click('accessBtn');
      await page.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();
      await click('walletSignInBtn');await expect(page.locator('#walletAddressStatus')).not.toHaveText('Not connected');
      await click('accessCloseBtn');
    };
    const checkOfferLanguages=async()=>{
      await page.setViewportSize({width:390,height:1000});
      for(const language of ['en','zh','es','fr','ru','vi']){
        await page.locator('.workspace-options > summary').click();
        await page.locator('#productLanguage').selectOption(language);
        await page.locator('.workspace-options > summary').click();
        await expect.poll(async()=>(await page.evaluate(async()=>
          (await import('/product-localization.js')).productLocalizationAudit())).missing).toEqual([]);
        await expect(page.locator('html')).toHaveAttribute('data-product-translation-missing','0');
        await expect(page.locator('#productTranslationWarning')).toBeHidden();
      }
      await page.locator('.workspace-options > summary').click();
      await page.locator('#productLanguage').selectOption('en');
      await page.locator('.workspace-options > summary').click();
      await page.setViewportSize({width:1440,height:1000});
    };
    await page.goto(`${origin}/#request-credit`);await login();await reconnect();
    await click('createHumanSubjectBtn');await expect(page.locator('#createHumanConsentBtn')).toBeEnabled();
    await click('createHumanConsentBtn');await expect(page.locator('#submitHumanCreditBtn')).toBeEnabled();
    await expect(page.locator('#humanCreditCollateral')).toBeEnabled();await page.locator('#humanCreditCollateral').check();
    await click('submitHumanCreditBtn');await expect(page.locator('#humanOfferAcknowledge')).toBeEnabled();
    await expect(page.locator('#humanOfferCollateralDisclosure')).toContainText('0.08');
    await page.reload();await expect(page.locator('#humanCreditCollateral')).toBeChecked();
    await expect(page.locator('#humanOfferCollateralDisclosure')).toContainText('0.08');
    await expect(page.locator('#acceptHumanOfferBtn')).toHaveText('Reconnect wallet to continue');
    await checkOfferLanguages();
    await reconnect();
    await page.locator('#humanOfferAcknowledge').check();await click('acceptHumanOfferBtn');await confirm();
    await expect(page.locator('#syntheticCollateralPanel')).toBeVisible();
    await checkOfferLanguages();
    await expect(page.locator('#executeHumanObligationBtn')).toBeDisabled();
    await click('confirmSyntheticCollateralBtn');await confirm();
    await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral confirmed');
    const receipt=await page.locator('#syntheticCollateralReceipt').textContent();
    await page.reload();await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral confirmed');
    assert.equal(await page.locator('#syntheticCollateralReceipt').textContent(),receipt);
    await reconnect();await click('executeHumanObligationBtn');await confirm();
    await expect(page.locator('#postHumanRepaymentBtn')).toBeEnabled();
    await page.locator('#humanRepaymentAmount').fill('120');await click('postHumanRepaymentBtn');await confirm();
    await expect(page.locator('#releaseSyntheticCollateralBtn')).toBeEnabled();
    await click('releaseSyntheticCollateralBtn');await confirm();
    await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral released');
    const releaseReceipt=await page.locator('#syntheticCollateralReceipt').textContent();
    await runtime.close();runtime=await start();await page.reload();
    await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral released');
    assert.equal(await page.locator('#syntheticCollateralReceipt').textContent(),releaseReceipt);
    await click('topbarSignOutBtn');
    await expect(page.locator('#humanObligationCard')).toBeHidden();
    await login();await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral released');
    assert.equal(await page.locator('#syntheticCollateralReceipt').textContent(),releaseReceipt);
    await page.locator('#syntheticCollateralPanel details summary').click();
    for(const language of ['en','zh','es','fr','ru','vi'])for(const theme of ['light','dark']){
      await page.setViewportSize({width:390,height:1000});
      await page.locator('.workspace-options > summary').click();
      await page.locator('#productLanguage').selectOption(language);
      await page.locator('.workspace-options > summary').click();
      await page.locator('#web009AppContext .b-theme select').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('lang',language);
      await expect(page.locator('html')).toHaveAttribute('data-product-translation-missing','0');
      const overflow=await page.locator('#syntheticCollateralPanel').evaluate(el=>el.scrollWidth-el.clientWidth);
      assert.ok(overflow<=1,`${language}/${theme} collateral panel overflow ${overflow}`);
      await page.locator('#syntheticCollateralPanel').screenshot({path:`output/playwright/b3-${language}-${theme}.png`});
    }
    assert.deepEqual(errors,[]);
    for(const operation of ['pilotConfirmSyntheticCollateral','pilotExecuteSandboxObligation','pilotPostSandboxRepayment','pilotReleaseSyntheticCollateral'])assert.ok(requests.includes(operation),operation);
    console.log('B3 actual HTTP/PostgreSQL Human loop: confirm, execute, repay, release, refresh and process restart; six languages/two themes/narrow screen');
  }finally{
    await browser?.close();await runtime?.close();globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.IPO_ONE_LOCAL_AUTH_INVITATION_FILE;else process.env.IPO_ONE_LOCAL_AUTH_INVITATION_FILE=previous;
  }
});
