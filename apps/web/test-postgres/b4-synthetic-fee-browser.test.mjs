// Real local HTTP Gateway and PostgreSQL, with an ephemeral signing EOA and
// read-only RPC metadata fixture. No financial endpoint is mocked; this is not
// production wallet-brand or user acceptance evidence.
import test from 'node:test';
import pg from 'pg';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createPrivatePilotRuntime} from '../../private-pilot/src/private-pilot-runtime.js';
import {PRODUCT_LANGUAGES,normalizeCopy,translateCopy} from '../src/product-i18n.js';

const origin='http://127.0.0.1:8921';
test('B4 visible Human lifecycle uses durable services, recovers and is localized', {timeout:180000}, async()=>{
  assert.equal(process.env.DATABASE_URL,'postgresql://cptmao@127.0.0.1:59989/b4_fee_browser_test_20261109');
  // This exact disposable browser database is never the Founder review database.
  const reset=new pg.Client({connectionString:process.env.DATABASE_URL});
  await reset.connect();
  try {await reset.query('DROP SCHEMA public CASCADE');await reset.query('CREATE SCHEMA public');} finally {await reset.end();}
  const account=privateKeyToAccount(generatePrivateKey());
  const dir=new URL('../../../.ipo-one/b4-browser/',import.meta.url);
  await mkdir(dir,{recursive:true});
  const invitation=JSON.parse(await readFile(new URL('../../../.ipo-one/local-stack/authentication-invitation.v1.json',import.meta.url),'utf8'));
  invitation.walletAddress=account.address;
  const file=new URL('invitation.json',dir); await writeFile(file,JSON.stringify(invitation),{mode:0o600});
  const sourceAccounts=Object.fromEntries(['operations','auditor','riskReviewer','operationsReviewer'].map(name=>[name,privateKeyToAccount(generatePrivateKey())]));
  const envNames=['IPO_ONE_LOCAL_AUTH_INVITATION_FILE','IPO_ONE_LOCAL_SYNTHETIC_FEE_CORRECTIONS','IPO_ONE_B4_SOURCE_REVIEW_PORTS','IPO_ONE_LOCAL_SPECIAL_ROLE_INVITATIONS_FILE','IPO_ONE_LOCAL_OPERATIONS_REVIEWER_INVITATION_FILE'];
  const previousEnv=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
  process.env.IPO_ONE_LOCAL_SYNTHETIC_FEE_CORRECTIONS='b4_f1_v1';process.env.IPO_ONE_B4_SOURCE_REVIEW_PORTS='browser_v1';
  const special=new URL('source-invitations.json',dir),independent=new URL('source-reviewer-invitation.json',dir);
  await writeFile(special,JSON.stringify(Object.fromEntries(['operations','auditor','riskReviewer'].map(n=>[n,sourceAccounts[n].address.toLowerCase()]))),{mode:0o600});
  await writeFile(independent,JSON.stringify({operationsReviewer:sourceAccounts.operationsReviewer.address.toLowerCase()}),{mode:0o600});
  process.env.IPO_ONE_LOCAL_SPECIAL_ROLE_INVITATIONS_FILE=special.pathname;process.env.IPO_ONE_LOCAL_OPERATIONS_REVIEWER_INVITATION_FILE=independent.pathname;
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
  const start=()=>createPrivatePilotRuntime({ownerConnectionString:process.env.DATABASE_URL,basePort:8921,syntheticCollateralEnabled:true,syntheticFeesEnabled:true,syntheticFeeCorrectionsEnabled:true});
  try{
    runtime=await start(); browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const requests=[],errors=[];let acceptedLoan;
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
    const page=await context.newPage(); page.on('pageerror',e=>{errors.push(e.message);console.log('B4 browser error:',e.message);});
    page.on('response',async response=>{if(response.url().endsWith('/tenant/v1/operations') && response.status()>=400){const body=await response.json().catch(()=>({}));console.log('B4 failed operation:',response.request().postDataJSON()?.operationId,response.status(),body.code??body.type,body.detail??body.title);}});
    page.on('request',r=>{if(r.url().endsWith('/tenant/v1/operations'))requests.push(r.postDataJSON().operationId);});
    page.on('response',async r=>{if(r.url().endsWith('/tenant/v1/operations')&&r.status()===200&&r.request().postDataJSON()?.operationId==='pilotAcceptCreditOffer')acceptedLoan=(await r.json()).response.obligation;});
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
    let recoveredHistoryOffer;
    const checkOfferLanguages=async({history=false}={})=>{
      await page.setViewportSize({width:390,height:1000});
      if(history){
        await expect(page.locator('#humanApplicationOptions button')).toHaveCount(1);
        await page.locator('#humanCreditAmount').fill('123');
      }
      const requestCount=requests.length;
      for(const language of ['en','zh','es','fr','ru','vi']){
        await page.locator('.workspace-options > summary').click();
        await page.locator('#productLanguage').selectOption(language);
        await page.locator('.workspace-options > summary').click();
        await expect.poll(async()=>(await page.evaluate(async()=>
          (await import('/product-localization.js')).productLocalizationAudit())).missing).toEqual([]);
        await expect(page.locator('html')).toHaveAttribute('data-product-translation-missing','0');
        await expect(page.locator('#productTranslationWarning')).toBeHidden();
        if(history){
          const locale=PRODUCT_LANGUAGES.find(item=>item.code===language).locale;
          const money=new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(120);
          const date=new Intl.DateTimeFormat(locale,{timeZone:'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(recoveredHistoryOffer.createdAt));
          const expected=translateCopy(`Sandbox evaluation · ${money} · 9% APR · 2 payments · ${date} · Review Offer`,language).text;
          await expect.poll(async()=>normalizeCopy(await page.locator('#humanApplicationOptions button').innerText())).toBe(normalizeCopy(expected));
          await expect(page.locator('#humanApplicationOptions button')).toHaveAttribute('aria-pressed','true');
          await expect(page.locator('#humanOfferTermsHash')).toHaveAttribute('title',recoveredHistoryOffer.termsHash);
          await expect(page.locator('#humanCreditAmount')).toHaveValue('123');
          if(language!=='en') await expect(page.locator('#humanApplicationOptions button').first()).not.toContainText('payments');
        }
      }
      assert.equal(requests.length,requestCount,'Changing language must not send protocol operations');
      await page.locator('.workspace-options > summary').click();
      if(history) await page.locator('#humanCreditAmount').fill('120');
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
    await expect(page.locator('#humanOfferFeeDisclosure')).toBeVisible();
    await expect(page.locator('#humanFeePlatform')).toHaveText('$0.12');
    await expect(page.locator('#humanFeeNetProceeds')).toHaveText('$120.00');
    const resumeResponse=page.waitForResponse(response=>response.url().endsWith('/tenant/v1/operations')&&response.request().postDataJSON()?.operationId==='pilotReadWorkspaceResume');
    await page.reload();
    const resume=(await (await resumeResponse).json()).response;
    recoveredHistoryOffer=resume.humanOfferReviews[0].offer;
    assert.equal(recoveredHistoryOffer.approvedPrincipalMinor,'12000');
    assert.equal(recoveredHistoryOffer.annualRateBps,900);
    assert.equal(recoveredHistoryOffer.installmentCount,2);
    await expect(page.locator('#humanCreditCollateral')).toBeChecked();
    await expect(page.locator('#humanOfferCollateralDisclosure')).toContainText('0.08');
    await expect(page.locator('#acceptHumanOfferBtn')).toHaveText('Reconnect wallet to continue');
    await checkOfferLanguages({history:true});
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
    await click('humanReadFeesBtn');await expect(page.locator('#humanFeeReceiptRows strong')).toHaveCount(1);
    await expect(page.locator('#humanFeeAssessed')).toHaveText('$0.12');
    await page.locator('#humanRepaymentAmount').fill('120');await click('postHumanRepaymentBtn');await confirm();
    await expect(page.locator('#releaseSyntheticCollateralBtn')).toBeDisabled();
    await expect(page.locator('#humanObligationOutstanding')).toHaveText('$0.12');
    await page.locator('#humanRepaymentAmount').fill('0.12');await click('postHumanRepaymentBtn');await confirm();
    await expect(page.locator('#humanObligationOutstanding')).toHaveText('$0.00');
    await expect(page.locator('#humanFeePaid')).toHaveText('$0.12');
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
      const feeOverflow=await page.locator('#humanSyntheticFeeSummary').evaluate(el=>el.scrollWidth-el.clientWidth);
      assert.ok(feeOverflow<=1,`${language}/${theme} fee panel overflow ${feeOverflow}`);
      await page.locator('#humanSyntheticFeeSummary').screenshot({path:`output/playwright/b4-fee-${language}-${theme}.png`});
      await page.locator('#syntheticCollateralPanel').screenshot({path:`output/playwright/b4-fee-${language}-${theme}.png`});
    }
    // A separately labeled, controlled-clock kernel scenario supplies nonzero
    // interest to the institution screen; it is not a real wallet transaction.
    assert.ok(acceptedLoan);
    const {persistSyntheticFeeInterestScenario}=await import('../../../modules/tenant-command-gateway/test-postgres/support/synthetic-fee-interest-fixture.mjs');
    const fixtureOptions={pool:runtime.pool,tenantId:runtime.profile.tenantId,actorId:runtime.profile.identities.borrower.actorId,subjectId:acceptedLoan.subjectId,principalId:acceptedLoan.principalId,consentId:acceptedLoan.authorityId};
    const normalScenario=await persistSyntheticFeeInterestScenario(fixtureOptions);
    await persistSyntheticFeeInterestScenario({...fixtureOptions,assessmentEnabled:false});
    await page.setViewportSize({width:1440,height:1000});
    await click("topbarSignOutBtn");await expect(page.locator("#humanObligationCard")).toBeHidden();
    const cp=await context.newPage();cp.on('pageerror',e=>errors.push(e.message));
    cp.on('request',r=>{if(r.url().endsWith('/tenant/v1/operations'))requests.push(r.postDataJSON().operationId);});
    await cp.goto('http://127.0.0.1:8924/#capital-partners');
    await cp.getByRole('button',{name:'Open IPO.ONE',exact:true}).filter({visible:true}).first().click();
    await expect(cp.locator('#capitalPartnerWorkspaceRoleBtn')).toBeVisible();await cp.locator('#capitalPartnerWorkspaceRoleBtn').click();
    await cp.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();
    await cp.locator('[data-wallet-chain="84532"]').click();await cp.locator('#walletSignInBtn').click();
    await expect(cp.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
    await cp.locator('[data-view="capital-partners"]').filter({visible:true}).first().click();
    await cp.locator('#syntheticFeeMonth').fill('2026-10');await cp.locator('#loadSyntheticFeeStatementBtn').click();
    await expect(cp.locator('#syntheticFeeStatementValues')).toBeVisible();
    await expect(cp.locator('#syntheticFeeAdditions')).toHaveText('$0.98');
    await expect(cp.locator('#syntheticFeePendingAmount')).toHaveText('$0.98');
    await expect(cp.locator('#closeSyntheticFeeStatementBtn')).toBeDisabled();
    await cp.locator('#reconcileSyntheticFeesBtn').click();await expect(cp.locator('#syntheticFeeReconcileDialog')).toBeVisible();
    await cp.locator('#syntheticFeeReconcileConfirmBtn').click();await expect(cp.locator('#syntheticFeePendingAmount')).toHaveText('$0.00');
    await expect(cp.locator('#closeSyntheticFeeStatementBtn')).toBeEnabled();
    await cp.locator('#closeSyntheticFeeStatementBtn').click();await expect(cp.locator('#syntheticFeeCloseDialog')).toBeVisible();
    await cp.locator('#syntheticFeeCloseConfirmBtn').click();await expect(cp.locator('#syntheticFeeSettlementStatus')).toHaveText('Statement frozen; payment remains separate.');
    const statementId=await cp.locator('#syntheticFeeStatementReference').textContent();
    await cp.reload();await cp.locator('#syntheticFeeMonth').fill('2026-10');await cp.locator('#loadSyntheticFeeStatementBtn').click();
    await expect(cp.locator('#syntheticFeeStatementReference')).toHaveText(statementId);
    await expect(cp.locator('#syntheticFeeSettled')).toHaveText('$0.00');
    for(const language of ['en','zh','es','fr','ru','vi'])for(const theme of ['light','dark']){
      await cp.setViewportSize({width:390,height:1000});
      await cp.locator('.workspace-options > summary').click();await cp.locator('#productLanguage').selectOption(language);await cp.locator('.workspace-options > summary').click();
      await cp.locator('#web009AppContext .b-theme select').selectOption(theme);
      const audit=await cp.evaluate(async()=>(await import('/product-localization.js')).productLocalizationAudit());if(audit.missing.length)console.log('B4 institution missing copy',audit.missing);
      await expect(cp.locator('html')).toHaveAttribute('data-product-translation-missing','0');
      assert.ok(await cp.locator('#syntheticFeeSettlementPanel').evaluate(e=>e.scrollWidth-e.clientWidth)<=1);
      await cp.locator('#syntheticFeeSettlementPanel').screenshot({path:`output/playwright/b4-institution-${language}-${theme}.png`});
    }
    await cp.locator("#topbarSignOutBtn").click();await expect(cp.locator("#syntheticFeeSettlementPanel")).toBeHidden();
    await cp.close();
    console.log('B4 institution visible portal: controlled-clock interest/fee receipts, exact pending assessment, frozen UTC statement, reload, six languages/two themes/narrow screen; settled amount remains0');
    const {verifyVisibleSourceCredit}=await import('./support/b4-source-credit-browser.mjs');
    // Execute the existing trusted materializer as a separate local worker
    // prerequisite; it is not a hidden Human action or a public mutation.
    const {PostgresCreditOutcomeMaterializer}=await import('../../../modules/credit-learning/src/index.js');
    await new PostgresCreditOutcomeMaterializer({eventRepository:normalScenario.eventRepository}).run();
    const ownerRead=new pg.Client({connectionString:process.env.DATABASE_URL});await ownerRead.connect();
    let originalOutcome;
    try{
      await expect.poll(async()=>{const rows=await ownerRead.query('SELECT outcome_hash FROM credit_outcomes WHERE obligation_id=$1',[acceptedLoan.obligationId]);return rows.rows[0]?.outcome_hash;},{timeout:15000}).toBeTruthy();
      originalOutcome=(await ownerRead.query('SELECT outcome_hash FROM credit_outcomes WHERE obligation_id=$1',[acceptedLoan.obligationId])).rows[0].outcome_hash;
      await verifyVisibleSourceCredit({browser,accounts:sourceAccounts,errors,loanId:acceptedLoan.obligationId});
      const outcomes=await ownerRead.query('SELECT outcome_hash FROM credit_outcomes WHERE obligation_id=$1',[acceptedLoan.obligationId]);
      assert.equal(outcomes.rowCount,1);assert.equal(outcomes.rows[0].outcome_hash,originalOutcome);
    }finally{await ownerRead.end();}
    await page.locator('#publicProductLanguage').selectOption('en');
    await page.reload();await login();await page.reload();
    await expect(page.locator('#humanSourceCreditSummary')).toBeVisible();await expect(page.locator('#humanSourceRefundCredit')).toHaveText('$30.00');await expect(page.locator('#humanFeeRefundDue')).toHaveText('$0.03');
    await page.locator('#humanReadFeesBtn').click();await expect(page.locator('#humanFeeReceiptRows')).toContainText('Synthetic source credit');
    for(const language of ['en','zh','es','fr','ru','vi'])for(const theme of ['light','dark'])for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await page.locator('.workspace-options > summary').click();await page.locator('#productLanguage').selectOption(language);await page.locator('.workspace-options > summary').click();
      await page.locator('#web009AppContext .b-theme select').selectOption(theme);
      const sourceAudit=await page.evaluate(async()=>(await import('/product-localization.js')).productLocalizationAudit());if(sourceAudit.missing.length)console.log('F1 missing copy',sourceAudit.missing);
      await expect(page.locator('html')).toHaveAttribute('data-product-translation-missing','0');
      const {formatMinorAmount}=await import('../src/product-i18n.js');await expect(page.locator('#humanSourceRefundCredit')).toHaveText(formatMinorAmount('3000','USD',language));
      await expect(page.locator('#humanFeeAssessed')).toHaveText(formatMinorAmount('9','USD',language));
      assert.ok(await page.locator('#humanSyntheticFeeSummary').evaluate(node=>node.scrollWidth-node.clientWidth)<=1);
      await page.locator('#humanSyntheticFeeSummary').screenshot({path:`output/playwright/b4-f1-human-${language}-${theme}-${width}.png`});
    }
    await page.locator('.workspace-options > summary').click();await page.locator('#productLanguage').selectOption('en');await page.locator('.workspace-options > summary').click();
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    await page.getByRole('button',{name:'More tools',exact:true}).click();
    await page.locator('[data-view="credit-track-record"]').filter({visible:true}).first().click();
    const creditRead=page.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotReadOwnCreditState');
    await page.locator('#loadCreditTrackRecordBtn').click();const creditResponse=await creditRead;assert.equal(creditResponse.status(),200,await creditResponse.text());
    console.log('F1 original finalized Outcome hash/count retained; corrected source and fee credits recover in the same Human wallet, six-language amounts/receipts and owned credit-state read remain available');
    assert.deepEqual(errors,[]);
    for(const operation of ['pilotConfirmSyntheticCollateral','pilotExecuteSandboxObligation','pilotPostSandboxRepayment','pilotReleaseSyntheticCollateral'])assert.ok(requests.includes(operation),operation);
    console.log('B4 actual HTTP/PostgreSQL fee disclosure, $120 partial + $0.12 final, persisted fee receipts and Human loop: confirm, execute, repay, release, refresh and process restart; six languages/two themes/narrow screen');
  }finally{
    if(browser){for(const [i,p] of browser.contexts()[0].pages().entries()){console.log("B4 browser surface",p.url(),(await p.locator("button").filter({visible:true}).allTextContents()).slice(0,8));await p.screenshot({path:`output/playwright/b4-state-${i}.png`});}const last=browser.contexts()[0]?.pages()[0];if(last){for(const id of ["humanApplicationHelper","humanOfferReviewState","humanDecisionPassportState"]){console.log("B4 visible state",id,await last.locator(`#${id}`).textContent());}await last.screenshot({path:"output/playwright/b4-last-state.png",fullPage:false});}}
    await browser?.close();await runtime?.close();globalThis.fetch=originalFetch;
    for(const name of envNames){if(previousEnv[name]===undefined)delete process.env[name];else process.env[name]=previousEnv[name];}
  }
});
