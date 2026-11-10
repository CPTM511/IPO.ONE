import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {createB4HostedTestRuntime} from '../../../scripts/test-support/b4-hosted-runtime.mjs';
import {closeB4BrowserContext,createB4BrowserRole} from '../../../scripts/test-support/b4-browser-context.mjs';
test('B4-H named roles sign in through visible controls and receive their distinct server-owned workspace', {timeout:90000},async()=>{
 const fixture=await createB4HostedTestRuntime();const browser=await chromium.launch({headless:true});
 try {
  for(const role of ['capitalPartner','operations','riskReviewer','operationsReviewer','auditor']) {
   const {context,page,options,errors}=await createB4BrowserRole({browser,fixture,role,nativeMfa:role!=='capitalPartner'});
   console.log('B4-H observed role discovery',role,{active:options.sessionActive,role:options.sessionWorkspaceRole,workspace:options.sessionGovernedWorkspace,governed:options.governedManagement});
   assert.equal(options.sessionActive,true);assert.equal(options.sessionGovernedWorkspace,role);
   const view=role==='capitalPartner'?'capital-partners':'risk-operations';
   await expect(page.locator(`[data-view="${view}"]`).filter({visible:true}).first()).toBeVisible();
   assert.deepEqual(errors,[]);await closeB4BrowserContext(context);
  }
 } finally {await browser.close();await fixture.close();}
});

test('B4-H native HTTPS proof is one-use and expires independently of an active Human session', {timeout:90000},async()=>{
 const {callB4BrowserApi}=await import('../../../scripts/test-support/b4-browser-context.mjs');
 const fixture=await createB4HostedTestRuntime();const browser=await chromium.launch({headless:true});
 try {
  const original=await createB4BrowserRole({browser,fixture,role:'operations',nativeMfa:true});
  const {page,context}=original;
  let finish;
  page.on('request',request=>{if(request.url().endsWith('/auth/v1/passkey/finish'))finish=request.postDataJSON();});
  await page.locator('#registerRiskPasskeyBtn').click();await expect(page.locator('#verifyRiskPasskeyBtn')).toBeVisible();
  await Promise.all([page.waitForResponse(response=>response.url().endsWith('/auth/v1/passkey/finish') && response.status()===200),page.locator('#verifyRiskPasskeyBtn').click()]);await expect(page.locator('#riskPasskeyBadge')).toHaveText('Recently verified');
  assert.ok(finish);
  const replay=await callB4BrowserApi(page,'/auth/v1/passkey/finish',{body:finish});
  assert.equal(replay.status,400);assert.equal(replay.body.code,'passkey_verification_rejected');
  const sourceQuery={schemaVersion:'tenant_protocol_request.v1',operationId:'pilotReadSyntheticFeeCorrectionCases',payload:{},requestId:'request_b4h_native_expiry_0001',correlationId:'correlation_b4h_native_expiry_0001'};
  assert.equal((await callB4BrowserApi(page,'/tenant/v1/operations',{body:sourceQuery})).status,200);
  await fixture.restart({clock:()=>new Date(Date.now()+14*60000)});
  assert.equal((await callB4BrowserApi(page,'/auth/v1/options',{method:'GET'})).body.sessionActive,true);
  assert.equal((await callB4BrowserApi(page,'/auth/v1/passkey/status',{method:'GET'})).body.verified,true);
  await fixture.restart({clock:()=>new Date(Date.now()+16*60000)});
  assert.equal((await callB4BrowserApi(page,'/auth/v1/options',{method:'GET'})).body.sessionActive,true);
  assert.equal((await callB4BrowserApi(page,'/auth/v1/passkey/status',{method:'GET'})).body.verified,false);
  const expired=await callB4BrowserApi(page,'/tenant/v1/operations',{body:{...sourceQuery,requestId:'request_b4h_native_expiry_0002'}});
  assert.equal(expired.status,404);assert.equal(expired.body.code,'authorization_denied');
  await page.reload();await expect(page.locator('#riskPasskeyBadge')).toHaveText('Verification required');
  await Promise.all([page.waitForResponse(response=>response.url().endsWith('/auth/v1/passkey/finish') && response.status()===200),page.locator('#verifyRiskPasskeyBtn').click()]);await expect(page.locator('#riskPasskeyBadge')).toHaveText('Recently verified');
  // Gateway admission uses the database clock. An authentication clock in
  // the future must not make a future-dated proof executable.
  assert.equal((await callB4BrowserApi(page,'/tenant/v1/operations',{body:{...sourceQuery,requestId:'request_b4h_native_expiry_0003'}})).status,404);
  const credentials=(await original.cdp.send('WebAuthn.getCredentials',{authenticatorId:original.authenticatorId})).credentials;
  await fixture.restart({clock:()=>new Date()});
  // A fresh legitimate wallet session cannot inherit another session's proof.
  // Import only this disposable virtual authenticator's key in memory, modelling
  // the same hardware credential in a new browser session; no real key is used.
  const renewed=await createB4BrowserRole({browser,fixture,role:'operations',nativeMfa:true});
  for(const credential of credentials)await renewed.cdp.send('WebAuthn.addCredential',{authenticatorId:renewed.authenticatorId,credential});
  assert.equal((await callB4BrowserApi(renewed.page,'/tenant/v1/operations',{body:{...sourceQuery,requestId:'request_b4h_native_expiry_0004'}})).status,404);
  await Promise.all([renewed.page.waitForResponse(response=>response.url().endsWith('/auth/v1/passkey/finish') && response.status()===200),renewed.page.locator('#verifyRiskPasskeyBtn').click()]);
  assert.equal((await callB4BrowserApi(renewed.page,'/tenant/v1/operations',{body:{...sourceQuery,requestId:'request_b4h_native_expiry_0005'}})).status,200);
  await closeB4BrowserContext(renewed.context);
  await closeB4BrowserContext(context);
 } finally {await browser.close();await fixture.close();}
});
