import {createTenantSecurityContext,setTenantTransactionContext} from "../../../modules/persistence/src/index.js";
import {verifyB4HostedRestore} from "../../../scripts/test-support/b4-hosted-restore.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {createB4HostedTestRuntime} from '../../../scripts/test-support/b4-hosted-runtime.mjs';
import {closeB4BrowserContext,createB4BrowserRole} from '../../../scripts/test-support/b4-browser-context.mjs';
import {createAuthenticatedProtocolActionConfirmation,economicActionTypeForOperation} from '../../../modules/tenant-command-gateway/src/economic-action-confirmation.js';
import {IpoOneSyntheticCollateralClient} from '../../../packages/sdk/src/synthetic-collateral-client.js';
import {createSyntheticCollateralMcpAdapter} from '../../agent-mcp/src/synthetic-collateral-mcp-adapter.js';
import {hashId,createHostedSyntheticFeeGovernance} from '../../../packages/domain/src/index.js';
import {createProductionMcpHandle} from '../../private-pilot/src/vercel-golden-flow-agent.js';
import {IpoOneAgentMcpClient} from '../../../packages/sdk/src/agent-mcp-client.js';
import {createApplicationReadyAgentHandoffManifest} from '../src/agent-handoff-manifest.js';
import {verifyVisibleSourceCredit} from './support/b4-hosted-source-credit-browser.mjs';
const envelope=(operationId,payload={},resource,command=true)=>({schemaVersion:'tenant_protocol_request.v1',operationId,payload,...(resource?{resource}:{}),requestId:`request_${randomUUID()}`,correlationId:`correlation_${randomUUID()}`,...(command?{idempotencyKey:`b4h_${randomUUID()}`}:{})});
const protectedRequest=request=>economicActionTypeForOperation(request.operationId)?{...request,payload:{...request.payload,actionConfirmation:createAuthenticatedProtocolActionConfirmation(request)}}:request;

test('B4 accepts signed Agent traffic while fees are OFF, then prepares, funds and services the exact $120 fee-only offer', {timeout:150000},async()=>{
  const fixture=await createB4HostedTestRuntime({withAgent:true,feesEnabled:false,correctionsEnabled:false});
  let browser,principal;
  try {
    const agent=fixture.agent;
    const execute=(...args)=>agent.execute(protectedRequest(envelope(...args)));
    const resume=async()=> (await execute('pilotReadWorkspaceResume',{},undefined,false)).response;
    const initial=await resume();
    assert.equal(initial.workspaceKind,'agent_runtime');
    assert.deepEqual(initial.resources,[]);

    browser=await chromium.launch();
    principal=await createB4BrowserRole({browser,fixture,role:'controller'});
    const {page}=principal;
    const openAuthority=()=>page.getByRole('button',{name:'Agents',exact:true}).click();
    const operation=async(name,action)=>{
      const received=page.waitForResponse(response=>response.url().endsWith('/tenant/v1/operations')&&
        response.request().postDataJSON()?.operationId===name);
      await action();
      const response=await received;
      const result=await response.json();
      assert.equal(response.status(),200,`${name}: ${result.code??response.status()}`);
      return result.response;
    };
    await openAuthority();
    const subjectCreated=await operation('pilotCreateAgentSubject',()=>page.getByRole('button',{name:'Create Agent Subject',exact:true}).click());
    const subject={resourceType:'subject',resourceId:subjectCreated.subjectId};
    const account=fixture.accounts.agent;
    const accountId=`eip155:84532:${account.address}`;
    await page.getByLabel('EVM account',{exact:true}).fill(account.address);
    const challenge=await operation('pilotCreateAgentAccountChallenge',()=>page.getByRole('button',{name:'Create signing request',exact:true}).click());
    await execute('pilotSubmitAgentAccountProof',{challengeId:challenge.challengeId,accountId,signature:await account.signTypedData(challenge.typedData)},subject);
    await operation('pilotReadAgentAccountBinding',()=>page.getByRole('button',{name:'Refresh binding',exact:true}).click());
    await page.getByLabel('Per action (USD)',{exact:true}).fill('120');
    await page.getByLabel('Aggregate (USD)',{exact:true}).fill('120');
    await page.getByLabel('Validity (days)',{exact:true}).fill('1');
    const draft=(await operation('pilotReadMandate',()=>page.getByRole('button',{name:'Create Draft Mandate',exact:true}).click())).mandate;
    assert.equal(draft.perActionLimitMinor,'12000');
    assert.equal(draft.aggregateLimitMinor,'12000');
    const manifest=createApplicationReadyAgentHandoffManifest(draft);
    assert(manifest);

    const {governanceHash:_,...governance}=fixture.governance;
    const feeOnly=createHostedSyntheticFeeGovernance({...governance,operationsActorId:null,riskReviewerActorId:null,operationsReviewerActorId:null,auditorActorId:null});
    await fixture.restart({hostedSyntheticFeeGovernance:feeOnly,syntheticFeesEnabled:true,syntheticFeeCorrectionsEnabled:false});
    const application=new IpoOneAgentMcpClient({handle:createProductionMcpHandle(agent),manifest,transportProfile:'mcp_stdio_local'});
    const request={workflowId:`b4_fee_only_${randomUUID()}`,creditRequest:{
      assetId:'urn:ipo-one:sandbox-asset:usd-cent',requestedPrincipalMinor:'12000',purposeCode:'compute',requestedTermDays:60,
      repaymentFrequency:'monthly',installmentCount:2,collateralProfile:'m2_synthetic_weth_usd_cent.v1'
    }};
    const receipt=await application.runCreditOfferWorkflow(request);
    assert.equal(receipt.offer.approvedPrincipalMinor,'12000');
    assert.equal(receipt.offer.feeTerms.borrowerFeeAtFullFundingMinor,'12');
    assert.equal((await application.runCreditOfferWorkflow(request)).offer.creditOfferId,receipt.offer.creditOfferId);
    const offer={resourceType:'credit_offer',resourceId:receipt.offer.creditOfferId};
    await execute('pilotPersistAgentContinuationReceipt',{receipt},offer);
    await page.reload();
    await openAuthority();
    const activate=page.getByRole('button',{name:'Activate sandbox Mandate',exact:true});
    await expect(activate).toBeDisabled();
    await page.locator('#principalMandateAcknowledge').check();
    await operation('pilotActivateSandboxMandate',()=>activate.click());
    const accepted=(await execute('pilotAcceptCreditOffer',{
      expectedOfferHash:receipt.offer.creditOfferHash,expectedTermsHash:receipt.offer.termsHash,
      acknowledgementHash:hashId('b4_fee_only_terms',receipt.offer.termsHash)
    },offer)).response.obligation;
    const obligation={resourceType:'obligation',resourceId:accepted.obligationId};
    const terms=accepted.syntheticCollateral.terms;
    await execute('pilotConfirmSyntheticCollateral',{
      expectedVersion:0,termsHash:terms.termsHash,chainId:terms.chainId,amountAssets:terms.requiredAssets
    },obligation);
    const fund=protectedRequest(envelope('pilotExecuteSandboxObligation',{providerId:'provider_gateway_compute',providerCategory:'compute'},obligation));
    const funded=(await agent.execute(fund)).response.obligation;
    assert.equal(funded.syntheticFees.fundedBaseMinor,'12000');
    assert.equal(funded.syntheticFees.borrowerAssessedMinor,'12');
    assert.equal((await agent.execute(fund)).replayed,true);

    await fixture.restart({hostedSyntheticFeeGovernance:feeOnly,syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:false});
    const repaid=(await execute('pilotPostSandboxRepayment',{amountMinor:'12012',sourceCode:'synthetic_wallet'},obligation)).response.obligation;
    assert.equal(repaid.status,'fully_repaid');
    assert.equal(repaid.syntheticFees.borrowerPaidMinor,'12');
    await execute('pilotReleaseSyntheticCollateral',{
      expectedVersion:repaid.syntheticCollateral.version,termsHash:terms.termsHash,chainId:terms.chainId,amountAssets:terms.requiredAssets
    },obligation);
    const readBack=(await execute('pilotReadOwnObligation',{},obligation,false)).response.obligation;
    assert.equal(readBack.syntheticCollateral.state,'released');
    assert.equal(readBack.totalRepaidMinor,'12012');
    const databaseClient=await fixture.db.pool.connect();
    try {
      await databaseClient.query('BEGIN');
      await setTenantTransactionContext(databaseClient,createTenantSecurityContext({
        tenantId:fixture.governance.tenantId,actorId:fixture.input.systemActorId,policyVersion:fixture.input.policyVersion,source:'system_worker'
      }));
      const revoked=await databaseClient.query(`UPDATE authentication_credentials SET status='revoked',updated_at=now()
        WHERE tenant_id=$1 AND actor_id=$2 AND status='active'`,[fixture.governance.tenantId,fixture.actors.agent]);
      assert.equal(revoked.rowCount,1);
      await databaseClient.query('COMMIT');
    } finally {
      await databaseClient.query('ROLLBACK').catch(()=>{});
      databaseClient.release();
    }
    await assert.rejects(resume(),error=>error.code==='authentication_credential_rejected');
    assert.deepEqual(principal.errors,[]);
  } finally {
    try {
      if(principal)await closeB4BrowserContext(principal.context);
      await browser?.close();
    } finally {
      await fixture.close();
    }
  }
});

test('B4-H Agent real JWT/DPoP HTTP + SDK/MCP shares hosted fees, protected source credit and OFF servicing', {timeout:150000},async()=>{
 const fixture=await createB4HostedTestRuntime({withAgent:true});const browser=await chromium.launch({headless:true});
 try {
  const principal=await createB4BrowserRole({browser,fixture,role:'controller'});
  const human=async request=>{
   const result=await principal.page.evaluate(async({request})=>{
    const token=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;
    const response=await fetch('/tenant/v1/operations',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token??'','x-request-id':request.requestId},body:JSON.stringify(request)});
    return {status:response.status,body:await response.json()};
   },{request});
   assert.equal(result.status,200,`${request.operationId}: ${result.body.code??result.body.detail??result.status}`);return result.body;
  };
  const execute=request=>fixture.agent.execute(protectedRequest(request));
  const created=(await human(envelope('pilotCreateAgentSubject',{subjectActorId:fixture.actors.agent,displayName:'B4-H disposable Agent',jurisdiction:'US'}))).response;
  const subject={resourceType:'subject',resourceId:created.subjectId};
  const account=fixture.accounts.agent,accountId=`eip155:84532:${account.address}`;
  const challenge=(await human(envelope('pilotCreateAgentAccountChallenge',{accountId,purpose:'primary'},subject))).response;
  await execute(envelope('pilotSubmitAgentAccountProof',{challengeId:challenge.challengeId,accountId,signature:await account.signTypedData(challenge.typedData)},subject));
  const mandate=(await human(envelope('pilotCreateDraftMandate',{
   capabilities:['request_credit','accept_credit_offer','execute_sandbox_credit','provider_spend','capture_revenue','route_repayment'],
   allowedProviderIds:['provider_b4h_synthetic_compute'],allowedCategories:['compute'],assetIds:['urn:ipo-one:sandbox-asset:usd-cent'],perActionLimitMinor:'100000',aggregateLimitMinor:'500000',
   validFrom:new Date(Date.now()-30000).toISOString(),expiresAt:new Date(Date.now()+86400000*180).toISOString(),nonce:`b4h_${randomUUID()}`,termsRef:'urn:ipo.one:test:b4h:mandate:v1'
  },subject))).response;
  const requested=(await execute(envelope('pilotRequestCredit',{authorityId:mandate.mandateId,assetId:'urn:ipo-one:sandbox-asset:usd-cent',requestedPrincipalMinor:'12000',purposeCode:'working_capital',requestedTermDays:60,repaymentFrequency:'monthly',installmentCount:2,collateralProfile:'m2_synthetic_weth_usd_cent.v1'},subject))).response;
  const offer=(await execute(envelope('pilotEvaluateCreditApplication',{}, {resourceType:'credit_intent',resourceId:requested.creditIntent.creditIntentId}))).response.offer;
  assert.equal(offer.feeTerms.profile,'synthetic_usd_platform_fee_hosted.v1');assert.equal(offer.feeTerms.borrowerFeeAtFullFundingMinor,'12');
  const view=(await human(envelope('pilotReadMandate',{}, {resourceType:'mandate',resourceId:mandate.mandateId},false))).response.mandate;
  await human(envelope('pilotActivateSandboxMandate',{expectedMandateHash:view.mandateHash,acknowledgedTermsHash:view.termsHash,acknowledgementCode:'principal_authorizes_sandbox_credit_v1'},{resourceType:'mandate',resourceId:mandate.mandateId}));
  const accepted=(await execute(envelope('pilotAcceptCreditOffer',{expectedOfferHash:offer.creditOfferHash,expectedTermsHash:offer.termsHash,acknowledgementHash:hashId('b4h_agent_terms',offer.termsHash)},{resourceType:'credit_offer',resourceId:offer.creditOfferId}))).response.obligation;
  const resource={resourceType:'obligation',resourceId:accepted.obligationId};
  const sdk=new IpoOneSyntheticCollateralClient({transportProfile:'local_in_process',execute:request=>fixture.agent.execute(request)});
  const mcp=createSyntheticCollateralMcpAdapter({client:sdk});
  const terms=accepted.syntheticCollateral.terms;
  const confirm=protectedRequest(envelope('pilotConfirmSyntheticCollateral',{expectedVersion:0,termsHash:terms.termsHash,chainId:terms.chainId,amountAssets:terms.requiredAssets},resource));
  const wrong=protectedRequest(envelope('pilotConfirmSyntheticCollateral',{...confirm.payload,amountAssets:'1'},resource));
  await assert.rejects(fixture.agent.execute(wrong));
  const confirmed=(await mcp.callTool('ipo_one_confirm_synthetic_collateral',{resourceId:resource.resourceId,payload:confirm.payload,requestId:confirm.requestId,correlationId:confirm.correlationId,idempotencyKey:confirm.idempotencyKey})).structuredContent;
  assert.equal(confirmed.response.obligation.syntheticCollateral.state,'confirmed');
  const funding=protectedRequest(envelope('pilotExecuteSandboxObligation',{providerId:'provider_b4h_synthetic_compute',providerCategory:'compute'},resource));
  const executed=await fixture.agent.execute(funding);
  const replay=await Promise.all([fixture.agent.execute(funding),fixture.agent.execute(funding)]);
  assert.equal(replay.every(result=>result.replayed===true),true);
  assert.equal(executed.response.obligation.syntheticFees.borrowerAssessedMinor,'12');
  const sourceCredit=await verifyVisibleSourceCredit({browser,fixture,accounts:fixture.accounts,errors:[],loanId:resource.resourceId,settlement:'unpaid'});
  assert.equal(sourceCredit.receipt.effects.unpaidPrincipalCreditMinor,'3000');
  assert.equal((await execute(envelope('pilotReadOwnObligation',{},resource,false))).response.obligation.totalRepaidMinor,'0','Source credit is not an actual repayment');
  await fixture.restart({syntheticFeesEnabled:false});
  const repaid=(await execute(envelope('pilotPostSandboxRepayment',{amountMinor:'9009',sourceCode:'synthetic_wallet'},resource))).response;
  assert.equal(repaid.obligation.status,'fully_repaid');assert.equal(repaid.obligation.syntheticFees.borrowerPaidMinor,'9');
  const release=protectedRequest(envelope('pilotReleaseSyntheticCollateral',{expectedVersion:repaid.obligation.syntheticCollateral.version,termsHash:terms.termsHash,chainId:terms.chainId,amountAssets:terms.requiredAssets},resource));
  await mcp.callTool('ipo_one_release_synthetic_collateral',{resourceId:resource.resourceId,payload:release.payload,requestId:release.requestId,correlationId:release.correlationId,idempotencyKey:release.idempotencyKey});
  const fees=(await execute(envelope('pilotReadSyntheticFees',{},resource,false))).response;
  assert.equal(fees.fees.principalUnpaidCreditMinor,'3000');assert.equal(fees.fees.borrowerRefundDueMinor,'0');
  assert.equal(fees.sourceCorrections[0].scope,'L2_PUBLIC_AUTHENTICATED_NO_FUNDS');
  const owned=(await execute(envelope('pilotReadOwnObligation',{},resource,false))).response;
  assert.equal(owned.obligation.totalRepaidMinor,'9009');assert.equal(owned.obligation.syntheticFees.fundedBaseMinor,'9000');
  await fixture.restart({syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:false});
  const recovered=(await execute(envelope('pilotReadSyntheticFees',{},resource,false))).response;
  assert.deepEqual(recovered.fees,fees.fees);
  const {PostgresCreditOutcomeMaterializer}=await import('../../../modules/credit-learning/src/index.js');
  const {PostgresEventRepository}=await import('../../../modules/persistence/src/index.js');
  const repository=new PostgresEventRepository({pool:fixture.db.pool,tenantContext:createTenantSecurityContext({tenantId:fixture.governance.tenantId,actorId:fixture.input.systemActorId,policyVersion:'security_001.v1',source:'system_worker'})});
  await new PostgresCreditOutcomeMaterializer({eventRepository:repository}).run();
  const credit=(await fixture.db.pool.query('SELECT synthetic_fee_credit_context FROM credit_outcomes WHERE obligation_id=$1',[resource.resourceId])).rows;
  assert.equal(credit.length,1);assert.equal(credit[0].synthetic_fee_credit_context.scope,'L2_PUBLIC_AUTHENTICATED_NO_FUNDS');
  assert.equal(credit[0].synthetic_fee_credit_context.effectivePrincipalMinor,'9000');assert.equal(credit[0].synthetic_fee_credit_context.netRepaidMinor,'9009');
  await execute(envelope('pilotReadOwnCreditState',{},subject,false));
  const sql=(await fixture.db.pool.query('SELECT utilized_minor::text FROM credit_lines WHERE subject_id=$1',[subject.resourceId])).rows;
  assert.equal(sql.every(row=>row.utilized_minor==='0'),true);
  await assert.rejects(execute(envelope('pilotReadSyntheticFeeSettlement',{month:'2026-10'},undefined,false)),error=>error.code==='authorization_denied');
  const databaseClient=await fixture.input.gatewayPool.connect();
  try {
   await databaseClient.query('BEGIN');
   await setTenantTransactionContext(databaseClient,createTenantSecurityContext({tenantId:fixture.governance.tenantId,actorId:fixture.actors.agent,policyVersion:'security_001.v1',source:'local_test'}));
   const positive=await databaseClient.query('SELECT count(*)::int AS count FROM synthetic_fee_entries');assert.ok(positive.rows[0].count>0);
   await databaseClient.query('SAVEPOINT wrong_hosted_policy');
   await assert.rejects(databaseClient.query(`INSERT INTO credit_offers SELECT (jsonb_populate_record(NULL::credit_offers,to_jsonb(o)||jsonb_build_object('id',$2::text,'fee_terms',jsonb_set(o.fee_terms,'{scope}','"L0_LOCAL_NO_FUNDS"'::jsonb)))).* FROM credit_offers o WHERE id=$1`,[offer.creditOfferId,`credit_offer_${randomUUID()}`]),error=>error.code==='23514');
   await databaseClient.query('ROLLBACK TO SAVEPOINT wrong_hosted_policy');
   await databaseClient.query('ROLLBACK');await databaseClient.query('BEGIN');
   await setTenantTransactionContext(databaseClient,createTenantSecurityContext({tenantId:'tenant_b4h_unrelated',actorId:fixture.actors.agent,policyVersion:'security_001.v1',source:'local_test'}));
   for(const table of ['synthetic_fee_entries','synthetic_fee_source_corrections','ledger_transactions'])assert.equal((await databaseClient.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,0,'RLS must hide actual populated financial facts from another Tenant');
   await databaseClient.query('ROLLBACK');
  } finally {databaseClient.release();}
  assert.deepEqual(principal.errors,[]);await closeB4BrowserContext(principal.context);
  await verifyB4HostedRestore(fixture,async()=>{
    const restored=(await execute(envelope('pilotReadSyntheticFees',{},resource,false))).response;
    assert.deepEqual(restored.fees,fees.fees);assert.deepEqual(restored.sourceCorrections,fees.sourceCorrections);
  });
  console.log('B4-H actual Agent JWT/DPoP, Principal authority, EIP712 account proof, REST + SDK/MCP, exact concurrent replay, OFF repayment and native dual-approved source credit passed; no chain transaction or refund');
 } finally {await browser.close();await fixture.close();}
});
