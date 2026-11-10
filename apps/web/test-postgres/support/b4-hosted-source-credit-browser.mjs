import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {closeB4BrowserContext} from '../../../../scripts/test-support/b4-browser-context.mjs';
export async function verifyVisibleSourceCredit({browser,fixture,accounts,errors,loanId,settlement='paid'}){
  const sessions=[];
  const principalCreditLabel=settlement==='unpaid'?'Unpaid principal credit':'Principal refund credit due';
  const feeCreditLabel=settlement==='unpaid'?'Unpaid fee credit':'Paid fee refund credit due';
  async function operator(name){
    const account=accounts[name],context=await browser.newContext({viewport:{width:1440,height:1000}});
    await fixture.proxy(context);
    await context.exposeBinding('signLocalTestMessage',async(_,message)=>account.signMessage({message:{raw:message}}));
    await context.addInitScript(address=>{
      localStorage.setItem('ipo-one-language','en');
      const provider={on(){},removeListener(){},async request({method,params}){
        if(['eth_requestAccounts','eth_accounts'].includes(method))return[address];if(method==='eth_chainId')return'0x14a34';if(method==='wallet_switchEthereumChain')return null;
        if(method==='personal_sign')return window.signLocalTestMessage(params[0]);throw new Error(`Unsupported test wallet method ${method}`);
      }};window.ethereum=provider;
      window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{provider,info:{uuid:'12345678-1234-4234-9234-123456789012',name:'MetaMask',rdns:'io.metamask',icon:'data:image/png;base64,iVBORw0KGgo='}}})));
    },account.address);
    const page=await context.newPage();sessions.push({page,context});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',async r=>{if(r.url().includes('/auth/v1/passkey/') && r.status()>=400){const error=await r.json().catch(()=>({}));console.log('F1 native verification error',r.status(),error.code??error.type,error.detail??error.title);}if(r.url().endsWith('/tenant/v1/operations') && r.status()>=400){const problem=await r.json().catch(()=>({}));console.log('F1 rejected operation',r.request().postDataJSON()?.operationId,r.status(),problem.code??'closed response');}});
    const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    await page.goto(`${fixture.origin}/#risk-operations`);
    await page.getByRole('button',{name:'Open IPO.ONE',exact:true}).filter({visible:true}).first().click();
    await page.locator(`[data-wallet-workspace-role="${name==='riskReviewer'?'risk_operator':'operations_operator'}"]`).click();
    await page.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();await page.locator('[data-wallet-chain="84532"]').click();await page.locator('#walletSignInBtn').click();
    await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
    if(name==='operations') {
      await expect(page.locator('#syntheticFeeCorrectionPanel')).toBeVisible();
      const denied=page.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotReadSyntheticFeeCorrectionCases');
      await page.locator('#loadSyntheticFeeCorrectionCasesBtn').click();assert.equal((await denied).status(),404,'No source history is disclosed before native MFA');
    }
    await expect(page.locator('#registerRiskPasskeyBtn')).toBeVisible();await page.locator('#registerRiskPasskeyBtn').click();
    await expect(page.locator('#verifyRiskPasskeyBtn')).toBeVisible({timeout:15000});
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/auth/v1/passkey/finish') && response.status()===200),page.locator('#verifyRiskPasskeyBtn').click()]);await expect(page.locator('#riskPasskeyTime')).toContainText('Verified',{timeout:15000});
    return page;
  }
  try{
    const ops=await operator('operations');
    await expect(ops.locator('#syntheticFeeCorrectionPanel')).toBeVisible();
    await ops.locator('#loadSyntheticFeeCorrectionCasesBtn').click();
    const select=ops.locator('#syntheticFeeCorrectionSource');
    await expect(select.locator('option')).not.toHaveCount(0);
    const options=await select.locator('option').allTextContents();const index=options.findIndex(v=>v.includes(loanId.slice(-8))&&v.includes('Successful synthetic funding'));
    assert.ok(index>=0,'Server picker exposes the actual paid synthetic funding source');
    await select.selectOption(String(index));await ops.locator('#syntheticFeeCorrectionAmount').fill('30.00');
    await ops.locator('#reviewSyntheticFeeCorrectionBtn').click();
    await expect(ops.locator('#syntheticFeeCorrectionImpact')).toContainText(`${principalCreditLabel}: $30.00`);
    await expect(ops.locator('#syntheticFeeCorrectionImpact')).toContainText(`${feeCreditLabel}: $0.03`);
    await ops.locator('#syntheticFeeCorrectionAcknowledge').check();await ops.locator('#proposeSyntheticFeeCorrectionBtn').click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · pending');
    await ops.locator('#localApprovalAcknowledge').check();await expect(ops.locator('#executeLocalProposalBtn')).toBeDisabled();
    const risk=await operator('riskReviewer'),reviewer=await operator('operationsReviewer');
    for(const p of [risk,reviewer]){
      await p.locator('#refreshLocalApprovalsBtn').click();await expect(p.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await p.locator('#localApprovalList button').filter({hasText:'synthetic source credit'}).first().click();
      await expect(p.locator('#localApprovalImpact')).toContainText(`${principalCreditLabel}: $30.00`);
      await p.locator('#localApprovalAcknowledge').check();await p.locator('#approveLocalProposalBtn').click();
      await expect(p.locator('#localReviewMessage')).toContainText('decision was recorded');
      if(p===risk){await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await ops.locator('#localApprovalList button').first().click();await ops.locator('#localApprovalAcknowledge').check();await expect(ops.locator('#executeLocalProposalBtn')).toBeDisabled();}
    }
    await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await ops.locator('#localApprovalList button').first().click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · approved');
    await ops.locator('#localApprovalAcknowledge').check();
    const financialTables=['obligations','obligation_installments','synthetic_fee_entries','synthetic_fee_source_corrections','ledger_transactions','ledger_entries','repayment_events','credit_lines','credit_outcomes','approval_proposals','approval_decisions','approval_executions','domain_events','credit_events','evidence_envelopes','command_idempotency','projection_registry','projection_snapshots','aggregate_stream_heads','outbox_messages','command_events'];
    const snapshot=async()=>Object.fromEntries(await Promise.all(financialTables.map(async table=>[table,(await fixture.db.pool.query(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${table} t`)).rows[0].hash])));
    const beforeFailure=await snapshot();
    await fixture.db.pool.query(`CREATE FUNCTION b4h_reject_source_credit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'B4-H injected deferred source-credit failure'; END $$ LANGUAGE plpgsql;
      CREATE CONSTRAINT TRIGGER b4h_reject_source_credit AFTER INSERT ON synthetic_fee_source_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b4h_reject_source_credit()`);
    const rejected=ops.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotCorrectSyntheticFeeSource');
    await ops.locator('#executeLocalProposalBtn').click();assert.equal((await rejected).status(),500);
    await expect(ops.locator('#executeLocalProposalBtn')).toBeEnabled();
    assert.deepEqual(await snapshot(),beforeFailure,'Deferred failure must roll back financial facts, approvals, Events, Evidence and idempotency together');
    await fixture.db.pool.query('DROP TRIGGER b4h_reject_source_credit ON synthetic_fee_source_corrections; DROP FUNCTION b4h_reject_source_credit()');
    const responsePromise=ops.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotCorrectSyntheticFeeSource');
    await ops.locator('#executeLocalProposalBtn').click();const response=await responsePromise;const result=await response.json();
    assert.equal(response.status(),200,JSON.stringify(result));
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · executed');
    assert.equal(result.response.receipt.refundStatus,'credit_due_only');assert.equal(result.response.receipt.effects[settlement==='unpaid'?'unpaidPrincipalCreditMinor':'principalRefundCreditMinor'],'3000');
    assert.equal(result.response.fees.borrowerRefundDueMinor,settlement==='unpaid'?'0':'3');assert.equal(result.response.fees.principalRefundCreditDueMinor,settlement==='unpaid'?'0':'3000');
    await ops.reload();await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await ops.locator('#localApprovalList button').first().click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · executed');
    await ops.locator('#localReviewPanel').screenshot({path:'output/playwright/b4h-f1-dual-review-executed.png'});
    // A second exact proposal proves that execution rechecks the original
    // native reviewer proof after approval. The first completed credit stays intact.
    await ops.locator('#loadSyntheticFeeCorrectionCasesBtn').click();
    await expect(ops.locator('#syntheticFeeCorrectionSource option')).not.toHaveCount(0);
    const nextOptions=await ops.locator('#syntheticFeeCorrectionSource option').allTextContents();
    const nextIndex=nextOptions.findIndex(text=>text.includes(loanId.slice(-8)) && text.includes('Successful synthetic funding'));
    assert.ok(nextIndex>=0);await ops.locator('#syntheticFeeCorrectionSource').selectOption(String(nextIndex));
    await ops.locator('#syntheticFeeCorrectionAmount').fill('1.00');await ops.locator('#reviewSyntheticFeeCorrectionBtn').click();
    await expect(ops.locator('#syntheticFeeCorrectionImpact')).toContainText(`${principalCreditLabel}: $1.00`);
    await ops.locator('#syntheticFeeCorrectionAcknowledge').check();await ops.locator('#proposeSyntheticFeeCorrectionBtn').click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · pending');
    for(const p of [risk,reviewer]) {
      await p.locator('#refreshLocalApprovalsBtn').click();await expect(p.locator('#refreshLocalApprovalsBtn')).toBeEnabled();
      await p.locator('#localApprovalList button').first().click();await p.locator('#localApprovalAcknowledge').check();
      await p.locator('#approveLocalProposalBtn').click();await expect(p.locator('#localReviewMessage')).toContainText('decision was recorded');
    }
    await risk.locator('#riskPasskeyKeys button').first().click();await risk.locator('#confirmRiskPasskeyRevokeBtn').click();
    await expect(risk.locator('#riskPasskeyBadge')).toHaveText('Verification required');
    await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();
    await ops.locator('#localApprovalList button').first().click();await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · approved');
    await ops.locator('#localApprovalAcknowledge').check();const beforeRevoked=await snapshot();
    const revoked=ops.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotCorrectSyntheticFeeSource');
    await ops.locator('#executeLocalProposalBtn').click();assert.equal((await revoked).status(),404);
    await expect(ops.locator('#executeLocalProposalBtn')).toBeEnabled();
    assert.deepEqual(await snapshot(),beforeRevoked,'Revoked native reviewer proof must block execution without consuming approval or changing balances');
    console.log('F1 visible source picker → exact $30/$0.03 credit preview → proposal → native WebAuthn with three distinct fixture identities → Risk and Operations reviews → execution → reload; no actual human sign-off or cash refund claimed');
    return result.response;
  }catch(e){for(const [i,s]of sessions.entries()){console.log('F1 MFA visible message',await s.page.locator('#riskPasskeyMessage').textContent());await s.page.screenshot({path:`output/playwright/b4h-f1-failure-${i}.png`});}throw e;}
  finally{for(const s of sessions)await closeB4BrowserContext(s.context);}
}
