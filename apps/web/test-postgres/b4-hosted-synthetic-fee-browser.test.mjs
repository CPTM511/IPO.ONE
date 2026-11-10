// Real local HTTP Gateway and PostgreSQL, with an ephemeral signing EOA and
// read-only RPC metadata fixture. No financial endpoint is mocked; this is not
// production wallet-brand or user acceptance evidence.
import test from 'node:test';
import pg from 'pg';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {createB4HostedTestRuntime} from '../../../scripts/test-support/b4-hosted-runtime.mjs';
import {closeB4BrowserContext} from '../../../scripts/test-support/b4-browser-context.mjs';
import {HOSTED_SYNTHETIC_FEE_PROFILE} from '../../../packages/domain/src/index.js';
import {PRODUCT_LANGUAGES,normalizeCopy,translateCopy} from '../src/product-i18n.js';

test('B4-H production composition: visible Human and institution lifecycle, canonical WebAuthn and durable source credit', {timeout:300000}, async()=>{
  const fixture=await createB4HostedTestRuntime();
  const origin=fixture.origin,account=fixture.accounts.borrower;
  await mkdir('output/playwright',{recursive:true});
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await fixture.proxy(context);
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
    const openView=async(target,view)=>{
      await expect(target.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
      const entry=()=>target.locator(`[data-view="${view}"],[data-go-view="${view}"]`).filter({visible:true}).first();
      const menu=target.getByRole('button',{name:'Open navigation',exact:true});
      await expect.poll(async()=>await entry().count() || await menu.count()).toBeTruthy();
      if(!await entry().count())await menu.click();
      await entry().click();
    };
    const confirm=async()=>{await expect(page.locator('#economicActionLayer')).toBeVisible();await click('economicActionConfirmBtn');await expect(page.locator('#economicActionLayer')).toBeHidden();};
    const login=async()=>{
      await page.getByRole('button',{name:'Open IPO.ONE',exact:true}).filter({visible:true}).first().click();
      await page.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();
      await page.locator('[data-wallet-chain="84532"]').click(); await click('walletSignInBtn');
      await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
      await openView(page,'request-credit');
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
    await page.locator('[data-view="request-credit"]').filter({visible:true}).first().click();
    await click('createHumanSubjectBtn');await expect(page.locator('#createHumanConsentBtn')).toBeEnabled();
    await click('createHumanConsentBtn');await expect(page.locator('#submitHumanCreditBtn')).toBeEnabled();
    await expect(page.locator('#humanCreditCollateral')).toBeEnabled();await page.locator('#humanCreditCollateral').check();
    await click('submitHumanCreditBtn');await expect(page.locator('#humanOfferAcknowledge')).toBeEnabled();
    await expect(page.locator('#humanOfferCollateralDisclosure')).toContainText('0.08');
    await expect(page.locator('#humanOfferFeeDisclosure')).toBeVisible();
    await expect(page.locator('#humanFeePlatform')).toHaveText('$0.12');
    await expect(page.locator('#humanFeeNetProceeds')).toHaveText('$120.00');
    const resumeResponse=page.waitForResponse(response=>response.url().endsWith('/tenant/v1/operations')&&response.request().postDataJSON()?.operationId==='pilotReadWorkspaceResume');
    await page.reload();await openView(page,'request-credit');
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
    // Dialog text is independently checked, not inferred from translated Offer
    // labels. Cancelling each preview must not accept the exact Offer.
    for(const language of ['en','zh','es','fr','ru','vi']){
      await page.locator('.workspace-options > summary').click();await page.locator('#productLanguage').selectOption(language);await page.locator('.workspace-options > summary').click();
      await page.locator('#humanOfferAcknowledge').check();await click('acceptHumanOfferBtn');
      await expect(page.locator('#economicActionLayer')).toBeVisible();
      const {formatMinorAmount}=await import('../src/product-i18n.js');
      const source=`Net proceeds ${formatMinorAmount('12000','USD',language)}; platform service fee ${formatMinorAmount('12','USD',language)}; repay principal plus the fee and accrued interest. Synthetic only.`;
      await expect(page.locator('#economicActionEffect')).toHaveText(translateCopy(source,language).text);
      const dialogAudit=await page.evaluate(async()=>(await import('/product-localization.js')).productLocalizationAudit());if(dialogAudit.missing.length)console.log('B4 dialog missing copy',dialogAudit.missing);
      await expect(page.locator('html')).toHaveAttribute('data-product-translation-missing','0');
      await click('economicActionCancelBtn');await expect(page.locator('#economicActionLayer')).toBeHidden();await expect(page.locator('#acceptHumanOfferBtn')).toBeEnabled();
    }
    assert.equal(requests.includes('pilotAcceptCreditOffer'),false);
    await page.locator('.workspace-options > summary').click();await page.locator('#productLanguage').selectOption('en');await page.locator('.workspace-options > summary').click();
    await page.locator('#humanOfferAcknowledge').check();await click('acceptHumanOfferBtn');await confirm();
    await expect(page.locator('#syntheticCollateralPanel')).toBeVisible();
    await checkOfferLanguages();
    await expect(page.locator('#executeHumanObligationBtn')).toBeDisabled();
    await click('confirmSyntheticCollateralBtn');await confirm();
    await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral confirmed');
    const receipt=await page.locator('#syntheticCollateralReceipt').textContent();
    await page.reload();await openView(page,'request-credit');await expect(page.locator('#syntheticCollateralState')).toHaveText('Synthetic collateral confirmed');
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
    await fixture.restart();await page.reload();await openView(page,'request-credit');
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
      await page.locator('#humanSyntheticFeeSummary').screenshot({path:`output/playwright/b4h-fee-${language}-${theme}.png`});
      await page.locator('#syntheticCollateralPanel').screenshot({path:`output/playwright/b4h-fee-${language}-${theme}.png`});
    }
    // A separately labeled, controlled-clock kernel scenario supplies nonzero
    // interest to the institution screen; it is not a real wallet transaction.
    assert.ok(acceptedLoan);
    const {persistSyntheticFeeInterestScenario}=await import('../../../modules/tenant-command-gateway/test-postgres/support/synthetic-fee-interest-fixture.mjs');
    const activeBorrower=(await fixture.db.pool.query("SELECT actor_id FROM authentication_sessions WHERE tenant_id=$1 AND roles ? 'human_borrower' ORDER BY created_at DESC LIMIT 1",[fixture.governance.tenantId])).rows[0].actor_id;
    const fixtureOptions={pool:fixture.db.pool,tenantId:fixture.governance.tenantId,actorId:activeBorrower,subjectId:acceptedLoan.subjectId,principalId:acceptedLoan.principalId,consentId:acceptedLoan.authorityId,feeProfile:HOSTED_SYNTHETIC_FEE_PROFILE,feeInstitutionId:fixture.governance.institutionId};
    const normalScenario=await persistSyntheticFeeInterestScenario(fixtureOptions);
    await persistSyntheticFeeInterestScenario({...fixtureOptions,assessmentEnabled:false});
    await page.setViewportSize({width:1440,height:1000});
    await click("topbarSignOutBtn");await expect(page.locator("#humanObligationCard")).toBeHidden();
    const cpContext=await browser.newContext({viewport:{width:1440,height:1000}});await fixture.proxy(cpContext);
    await cpContext.exposeBinding('signLocalTestMessage',async(_,message)=>fixture.accounts.capitalPartner.signMessage({message:{raw:message}}));
    await cpContext.addInitScript(address=>{
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
    },fixture.accounts.capitalPartner.address);
    const cp=await cpContext.newPage();cp.on('pageerror',e=>errors.push(e.message));
    cp.on('request',r=>{if(r.url().endsWith('/tenant/v1/operations'))requests.push(r.postDataJSON().operationId);});
    await cp.goto(`${origin}/#capital-partners`);
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
    await cp.reload();await openView(cp,'capital-partners');await cp.locator('#syntheticFeeMonth').fill('2026-10');await cp.locator('#loadSyntheticFeeStatementBtn').click();
    await expect(cp.locator('#syntheticFeeStatementReference')).toHaveText(statementId);
    await expect(cp.locator('#syntheticFeeSettled')).toHaveText('$0.00');
    for(const language of ['en','zh','es','fr','ru','vi'])for(const theme of ['light','dark'])for(const width of [1440,390]){
      await cp.setViewportSize({width,height:1000});
      await cp.locator('.workspace-options > summary').click();await cp.locator('#productLanguage').selectOption(language);await cp.locator('.workspace-options > summary').click();
      await cp.locator('#web009AppContext .b-theme select').selectOption(theme);
      const audit=await cp.evaluate(async()=>(await import('/product-localization.js')).productLocalizationAudit());if(audit.missing.length)console.log('B4 institution missing copy',audit.missing);
      await expect(cp.locator('html')).toHaveAttribute('data-product-translation-missing','0');
      await expect(cp.locator('#syntheticFeeSettlementTitle')).toHaveText(translateCopy('Institution service fee',language).text);
      await expect(cp.locator('#loadSyntheticFeeStatementBtn')).toHaveText(translateCopy('View monthly statement',language).text);
      await expect(cp.locator('#closeSyntheticFeeStatementBtn')).toHaveText(translateCopy('Freeze completed monthly statement',language).text);
      // Pending fees admitted now belong to the current UTC month, not this
      // October statement. Its previously verified 98 cents must stay fixed.
      const {formatMinorAmount}=await import('../src/product-i18n.js');await expect(cp.locator('#syntheticFeeAdditions')).toHaveText(formatMinorAmount('98','USD',language));
      assert.ok(await cp.locator('#syntheticFeeSettlementPanel').evaluate(e=>e.scrollWidth-e.clientWidth)<=1);
      await cp.locator('#syntheticFeeSettlementPanel').screenshot({path:`output/playwright/b4h-institution-${language}-${theme}-${width}.png`});
    }
    await cp.locator("#topbarSignOutBtn").click();await expect(cp.locator("#syntheticFeeSettlementPanel")).toBeHidden();
    await cp.close();
    console.log('B4 institution visible portal: controlled-clock interest/fee receipts, exact pending assessment, frozen UTC statement, reload, six languages/two themes/narrow screen; settled amount remains0');
    const {verifyVisibleSourceCredit}=await import('./support/b4-hosted-source-credit-browser.mjs');
    // Execute the existing trusted materializer as a separate local worker
    // prerequisite; it is not a hidden Human action or a public mutation.
    const {PostgresCreditOutcomeMaterializer}=await import('../../../modules/credit-learning/src/index.js');
    await new PostgresCreditOutcomeMaterializer({eventRepository:normalScenario.eventRepository}).run();
    const ownerRead=new pg.Client({connectionString:fixture.db.connectionString});await ownerRead.connect();
    let originalOutcome;
    try{
      await expect.poll(async()=>{const rows=await ownerRead.query('SELECT outcome_hash FROM credit_outcomes WHERE obligation_id=$1',[acceptedLoan.obligationId]);return rows.rows[0]?.outcome_hash;},{timeout:15000}).toBeTruthy();
      originalOutcome=(await ownerRead.query('SELECT outcome_hash FROM credit_outcomes WHERE obligation_id=$1',[acceptedLoan.obligationId])).rows[0].outcome_hash;
      await verifyVisibleSourceCredit({browser,fixture,accounts:fixture.accounts,errors,loanId:acceptedLoan.obligationId});
      const outcomes=await ownerRead.query('SELECT outcome_hash FROM credit_outcomes WHERE obligation_id=$1',[acceptedLoan.obligationId]);
      assert.equal(outcomes.rowCount,1);assert.equal(outcomes.rows[0].outcome_hash,originalOutcome);
    }finally{await ownerRead.end();}
    await page.locator('#publicProductLanguage').selectOption('en');
    await page.reload();await login();await page.reload();await openView(page,'request-credit');
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
      await page.locator('#humanSyntheticFeeSummary').screenshot({path:`output/playwright/b4h-f1-human-${language}-${theme}-${width}.png`});
    }
    await page.locator('.workspace-options > summary').click();await page.locator('#productLanguage').selectOption('en');await page.locator('.workspace-options > summary').click();
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    const moreTools=page.getByRole('button',{name:'More tools',exact:true});
    if(await moreTools.getAttribute('aria-expanded')!=='true')await moreTools.click();
    await page.locator('[data-view="credit-track-record"]').filter({visible:true}).first().click();
    const creditRead=page.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotReadOwnCreditState');
    await page.locator('#loadCreditTrackRecordBtn').click();const creditResponse=await creditRead;assert.equal(creditResponse.status(),200,await creditResponse.text());
    console.log('F1 original finalized Outcome hash/count retained; corrected source and fee credits recover in the same Human wallet, six-language amounts/receipts and owned credit-state read remain available');
    assert.deepEqual(errors,[]);
    for(const operation of ['pilotConfirmSyntheticCollateral','pilotExecuteSandboxObligation','pilotPostSandboxRepayment','pilotReleaseSyntheticCollateral'])assert.ok(requests.includes(operation),operation);
    console.log('B4 actual HTTP/PostgreSQL fee disclosure, $120 partial + $0.12 final, persisted fee receipts and Human loop: confirm, execute, repay, release, refresh and process restart; six languages/two themes/narrow screen');
  } catch(error) {
    for(const [i,context] of (browser?.contexts()??[]).entries())for(const [j,page] of context.pages().entries()) {
      console.log('B4-H failed browser surface',page.url(),await page.locator('button').filter({visible:true}).allTextContents());
      await page.screenshot({path:`output/playwright/b4h-failure-${i}-${j}.png`});
    }
    throw error;
  } finally {
    for(const context of browser?.contexts()??[])await closeB4BrowserContext(context);
    await browser?.close();await fixture.close();
  }
});
