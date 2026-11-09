import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
export async function verifyVisibleSourceCredit({browser,accounts,errors,loanId}){
  const sessions=[];
  async function operator(name,port){
    const account=accounts[name],context=await browser.newContext({viewport:{width:1440,height:1000}});
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
    page.on('response',async r=>{if(r.url().includes('/auth/v1/passkey/') && r.status()>=400){const error=await r.json().catch(()=>({}));console.log('F1 native verification error',r.status(),error.code??error.type,error.detail??error.title);}if(r.url().endsWith('/tenant/v1/operations') && r.status()>=400)console.log('F1 rejected operation',r.request().postDataJSON()?.operationId,r.status(),await r.text());});
    const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    await page.goto(`http://localhost:${port}/#risk-operations`);
    await page.getByRole('button',{name:'Open IPO.ONE',exact:true}).filter({visible:true}).first().click();
    await page.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();await page.locator('[data-wallet-chain="84532"]').click();await page.locator('#walletSignInBtn').click();
    await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
    if(name==='operations') {
      await expect(page.locator('#syntheticFeeCorrectionPanel')).toBeVisible();
      const denied=page.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotReadSyntheticFeeCorrectionCases');
      await page.locator('#loadSyntheticFeeCorrectionCasesBtn').click();assert.equal((await denied).status(),404,'No source history is disclosed before native MFA');
    }
    await expect(page.locator('#registerRiskPasskeyBtn')).toBeVisible();await page.locator('#registerRiskPasskeyBtn').click();
    await expect(page.locator('#verifyRiskPasskeyBtn')).toBeVisible({timeout:15000});
    await page.locator('#verifyRiskPasskeyBtn').click();await expect(page.locator('#riskPasskeyTime')).toContainText('Verified',{timeout:15000});
    return page;
  }
  try{
    const ops=await operator('operations',8981);
    await expect(ops.locator('#syntheticFeeCorrectionPanel')).toBeVisible();
    await ops.locator('#loadSyntheticFeeCorrectionCasesBtn').click();
    const select=ops.locator('#syntheticFeeCorrectionSource');
    await expect(select.locator('option')).not.toHaveCount(0);
    const options=await select.locator('option').allTextContents();const index=options.findIndex(v=>v.includes(loanId.slice(-8))&&v.includes('Successful synthetic funding'));
    assert.ok(index>=0,'Server picker exposes the actual paid synthetic funding source');
    await select.selectOption(String(index));await ops.locator('#syntheticFeeCorrectionAmount').fill('30.00');
    await ops.locator('#reviewSyntheticFeeCorrectionBtn').click();
    await expect(ops.locator('#syntheticFeeCorrectionImpact')).toContainText('Principal refund credit due: $30.00');
    await expect(ops.locator('#syntheticFeeCorrectionImpact')).toContainText('Paid fee refund credit due: $0.03');
    await ops.locator('#syntheticFeeCorrectionAcknowledge').check();await ops.locator('#proposeSyntheticFeeCorrectionBtn').click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · pending');
    await ops.locator('#localApprovalAcknowledge').check();await expect(ops.locator('#executeLocalProposalBtn')).toBeDisabled();
    const risk=await operator('riskReviewer',8983),reviewer=await operator('operationsReviewer',8984);
    for(const p of [risk,reviewer]){
      await p.locator('#refreshLocalApprovalsBtn').click();await expect(p.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await p.locator('#localApprovalList button').filter({hasText:'synthetic source credit'}).first().click();
      await expect(p.locator('#localApprovalImpact')).toContainText('Principal refund credit due: $30.00');
      await p.locator('#localApprovalAcknowledge').check();await p.locator('#approveLocalProposalBtn').click();
      await expect(p.locator('#localReviewMessage')).toContainText('decision was recorded');
      if(p===risk){await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await ops.locator('#localApprovalList button').first().click();await ops.locator('#localApprovalAcknowledge').check();await expect(ops.locator('#executeLocalProposalBtn')).toBeDisabled();}
    }
    await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await ops.locator('#localApprovalList button').first().click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · approved');
    await ops.locator('#localApprovalAcknowledge').check();
    const responsePromise=ops.waitForResponse(r=>r.url().endsWith('/tenant/v1/operations') && r.request().postDataJSON()?.operationId==='pilotCorrectSyntheticFeeSource');
    await ops.locator('#executeLocalProposalBtn').click();const response=await responsePromise;const result=await response.json();
    assert.equal(response.status(),200,JSON.stringify(result));
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · executed');
    assert.equal(result.response.receipt.refundStatus,'credit_due_only');assert.equal(result.response.receipt.effects.principalRefundCreditMinor,'3000');
    assert.equal(result.response.fees.borrowerRefundDueMinor,'3');assert.equal(result.response.fees.principalRefundCreditDueMinor,'3000');
    await ops.reload();await ops.locator('#refreshLocalApprovalsBtn').click();await expect(ops.locator('#refreshLocalApprovalsBtn')).toBeEnabled();await ops.locator('#localApprovalList button').first().click();
    await expect(ops.locator('#localApprovalTitle')).toHaveText('Synthetic source credit · executed');
    await ops.locator('#localReviewPanel').screenshot({path:'output/playwright/b4-f1-dual-review-executed.png'});
    console.log('F1 visible source picker → exact $30/$0.03 credit preview → proposal → native WebAuthn with three distinct fixture identities → Risk and Operations reviews → execution → reload; no actual human sign-off or cash refund claimed');
    return result.response;
  }catch(e){for(const [i,s]of sessions.entries()){console.log('F1 MFA visible message',await s.page.locator('#riskPasskeyMessage').textContent());await s.page.screenshot({path:`output/playwright/b4-f1-failure-${i}.png`});}throw e;}
  finally{for(const s of sessions)await s.context.close();}
}
