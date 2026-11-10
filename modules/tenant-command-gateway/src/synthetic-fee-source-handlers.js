import { checkedHostedFeeGovernance, assertSyntheticFeeLoanContext } from "./synthetic-fee-context.js";
import { assertHostedSyntheticFeeActor } from "../../../packages/domain/src/hosted-synthetic-fee-governance.js";
import { HOSTED_SYNTHETIC_FEE_PROFILE, SYNTHETIC_FEE_PROFILE } from "../../../packages/domain/src/synthetic-fees.js";
import { DomainError,hashId,createOperationalId,createCreditEvent,reviewSyntheticFeeSourceCorrection,correctSyntheticFeeSource,
  releaseAgentCreditLineForSourceCredit,updateAgentLockboxAfterRepayment } from '../../../packages/domain/src/index.js';
import { SYNTHETIC_FEE_SOURCE_POLICY_HASH, HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH } from '../../../packages/domain/src/synthetic-fee-source-policy.js';
import { CoreProjectionType as P } from '../../persistence/src/index.js';
import { ApprovalProjectionType as A,ApprovalProposalStatus,createApprovalExecution,transitionApprovalProposal } from '../../approval/src/index.js';
import { verifiedSyntheticFeeEntries } from './synthetic-fee-handlers.js';
import { planSyntheticFeeWrites } from './credit-execution-handlers.js';
const denied=()=>{throw new DomainError('tenant_resource_unavailable','The requested resource is not available.');};
export function normalizeSyntheticFeeCorrectionPayload(payload,{review=false}={}) {
  const keys=review?['sourceFeeEntryId','amountMinor']:['sourceFeeEntryId','amountMinor','expectedFeeStateHash','expectedEffectsHash','sourcePolicyHash'];
  if(!payload || Object.keys(payload).length!==keys.length || keys.some(k=>!Object.hasOwn(payload,k)) ||
    !/^[1-9][0-9]*$/.test(payload.amountMinor) || keys.filter(k=>k!=='amountMinor').some(k=>!/^0x[0-9a-f]{64}$/.test(payload[k])) ||
    (!review && ![SYNTHETIC_FEE_SOURCE_POLICY_HASH,HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH].includes(payload.sourcePolicyHash))) throw new DomainError('invalid_tenant_command_payload','An exact approved synthetic source credit is required');
  return payload;
}
export async function loadSyntheticFeeCorrectionReview(input,{lock=false}={}) {
  const state=await input.coreRepository.getProjectionStateInTransaction(input.client,P.OBLIGATION,input.authorizationDecision.resourceId,{lock});
  const obligation=state?.value;
  if(!obligation?.syntheticFees || obligation.sandboxOnly!==true || obligation.productionFundsMoved!==false || obligation.executionStatus!=='executed')denied();
  const entries=await verifiedSyntheticFeeEntries(input,{obligationId:obligation.obligationId});
  const originalEntry=entries.find(e=>e.feeEntryId===input.payload.sourceFeeEntryId && BigInt(e.baseDeltaMinor)>0n);
  if(!originalEntry)denied();
  const remainingSourceBaseMinor=entries.filter(e=>e.reversesEntryId===originalEntry.feeEntryId)
    .reduce((n,e)=>n+BigInt(e.baseDeltaMinor),BigInt(originalEntry.baseDeltaMinor)).toString();
  const review=reviewSyntheticFeeSourceCorrection(obligation,{originalEntry,amountMinor:input.payload.amountMinor,remainingSourceBaseMinor,now:input.now});
  if(input.payload.sourcePolicyHash!==undefined && input.payload.sourcePolicyHash!==review.sourcePolicyHash)throw new DomainError("invalid_tenant_command_payload","The source policy does not match the exact accepted loan");
  return {state,obligation,originalEntry,remainingSourceBaseMinor,review};
}
export function createSyntheticFeeSourceHandlers({syntheticFeeCorrectionsEnabled=false,syntheticFeesLocalContext=false,hostedSyntheticFeeGovernance}={}) {
  const feeGovernance=checkedHostedFeeGovernance(hostedSyntheticFeeGovernance);
  const gate=input=>{
    if(feeGovernance){if(syntheticFeeCorrectionsEnabled!==true)throw new DomainError("synthetic_fee_source_corrections_disabled","Synthetic source correction is disabled. A reviewed governed activation is required; existing approval history remains readable.");return assertHostedSyntheticFeeActor(feeGovernance,input.authenticationContext);}
    if(syntheticFeeCorrectionsEnabled!==true || syntheticFeesLocalContext!==true ||
      !['actor_web027m_operations','actor_web027m_auditor','actor_web027m_risk_reviewer','actor_web027n_operations_reviewer'].includes(input.authenticationContext.actorId))denied();
  };
  return [
    {operationId:'pilotReadSyntheticFeeCorrectionCases',kind:'query',async execute(input){
      gate(input);if(!input.payload || Object.keys(input.payload).length)throw new DomainError('invalid_tenant_command_payload','Empty query required');
      const rows=await input.client.query(`SELECT id FROM obligations WHERE synthetic_fees IS NOT NULL AND execution_status='executed' AND synthetic_fees#>>'{terms,profile}'=$1 AND ($2::text IS NULL OR synthetic_fees#>>'{terms,institutionId}'=$2) ORDER BY updated_at DESC,id DESC LIMIT 26`,[feeGovernance?HOSTED_SYNTHETIC_FEE_PROFILE:SYNTHETIC_FEE_PROFILE,feeGovernance?.institutionId??null]);
      const cases=[];
      for(const row of rows.rows.slice(0,25)) {
        const loan=await input.coreRepository.getProjectionInTransaction(input.client,P.OBLIGATION,row.id);
        const entries=await verifiedSyntheticFeeEntries(input,{obligationId:row.id});
        for(const source of entries.filter(e=>BigInt(e.baseDeltaMinor)>0n)) {
          const remaining=entries.filter(e=>e.reversesEntryId===source.feeEntryId).reduce((n,e)=>n+BigInt(e.baseDeltaMinor),BigInt(source.baseDeltaMinor));
          if(remaining>0n)cases.push({obligationId:row.id,reference:row.id.slice(-8),status:loan.status,sourceFeeEntryId:source.feeEntryId,kind:source.kind,sourceId:source.sourceId,sourceHash:source.sourceHash,remainingSourceBaseMinor:remaining.toString(),occurredAt:source.occurredAt});
        }
      }
      return {schemaVersion:'tenant_synthetic_fee_correction_cases.v1',cases,hasMore:rows.rows.length>25,asOf:input.now.toISOString(),syntheticOnly:true,productionFundsMoved:false};
    }},
    {operationId:'pilotReviewSyntheticFeeCorrection',kind:'query',async execute(input){
      gate(input);normalizeSyntheticFeeCorrectionPayload(input.payload,{review:true});
      const data=await loadSyntheticFeeCorrectionReview(input);
      assertSyntheticFeeLoanContext(feeGovernance,input,data.obligation);
      return {schemaVersion:'tenant_synthetic_fee_correction_review.v1',obligationId:data.obligation.obligationId,sourceFeeEntryId:data.originalEntry.feeEntryId,amountMinor:input.payload.amountMinor,...data.review};
    }},
    {operationId:'pilotCorrectSyntheticFeeSource',kind:'command',async plan(input){
      gate(input);normalizeSyntheticFeeCorrectionPayload(input.payload);
      if(input.reasonCode!=='synthetic_fee_source_correction')denied();
      const data=await loadSyntheticFeeCorrectionReview(input,{lock:true});
      assertSyntheticFeeLoanContext(feeGovernance,input,data.obligation);
      const proposalState=await input.coreRepository.getProjectionStateInTransaction(input.client,A.APPROVAL_PROPOSAL,input.authorizationDecision.approvalProposalId,{lock:true});
      const proposal=proposalState?.value;
      if(!proposal || proposal.status!==ApprovalProposalStatus.APPROVED || proposal.version!==input.authorizationDecision.approvalProposalVersion)throw new DomainError('approved_execution_rejected','An exact independent dual approval is required');
      const approvalExecutionId=createOperationalId('approval_execution');
      const result=correctSyntheticFeeSource(data.obligation,{...input.payload,...data,actorId:input.authenticationContext.actorId,approvalExecutionId,now:input.now});
      const feePlan=planSyntheticFeeWrites(result,{...input,obligation:data.obligation});
      const businessEvent=createCreditEvent({eventType:'synthetic_fee_source_corrected',subjectId:data.obligation.subjectId,obligationId:data.obligation.obligationId,
        payload:{...result.receipt,causationId:input.requestId,correlationId:input.correlationId},now:input.now});
      const events=[...feePlan.events],writes=[...feePlan.writes];
      for(const tx of [result.interestTransaction,result.sourceTransaction].filter(Boolean)) {
        const event=createCreditEvent({eventType:'ledger_transaction_posted',subjectId:data.obligation.subjectId,obligationId:data.obligation.obligationId,payload:{ledgerTransactionId:tx.ledgerTransactionId,transactionHash:tx.transactionHash,syntheticOnly:true,productionFundsMoved:false},now:input.now});
        events.push(event);writes.push({type:P.LEDGER_TRANSACTION,value:tx,eventId:event.eventId});
      }
      for(const account of Object.values(result.accounts)) {
        if(!await input.coreRepository.getProjectionInTransaction(input.client,P.LEDGER_ACCOUNT,account.ledgerAccountId))writes.unshift({type:P.LEDGER_ACCOUNT,value:account,eventId:businessEvent.eventId});
      }
      if(data.obligation.authorityType==='mandate' && result.receipt.effects.unpaidPrincipalCreditMinor!=='0') {
        const currentProjection=await input.coreRepository.findCreditLineBySubjectAssetInTransaction(input.client,data.obligation.subjectId,data.obligation.assetId);
        const exposure=await input.coreRepository.getAgentCreditExposureInTransaction(input.client,data.obligation.subjectId,data.obligation.assetId);
        const value=releaseAgentCreditLineForSourceCredit({currentProjection,exposure,obligationId:data.obligation.obligationId,principalCreditMinor:result.receipt.effects.unpaidPrincipalCreditMinor,now:input.now});
        const event=createCreditEvent({eventType:'credit_line_released',subjectId:data.obligation.subjectId,obligationId:data.obligation.obligationId,
          payload:{creditLineId:value.creditLineId,previousUtilizedMinor:currentProjection.utilizedMinor,utilizedMinor:value.utilizedMinor,sourceCorrectionReceiptId:result.receipt.receiptId,creditLineProjection:value,principalCreditMinor:result.receipt.effects.unpaidPrincipalCreditMinor,actualRepayment:false},now:input.now});
        events.push(event);writes.push({type:P.CREDIT_LINE,value,eventId:event.eventId});
        const lockbox=await input.coreRepository.findAgentLockboxByObligationInTransaction(input.client,data.obligation.obligationId);
        if(!lockbox)throw new DomainError('agent_lockbox_unavailable','Canonical source credit requires the Agent Lockbox');
        const next=updateAgentLockboxAfterRepayment(lockbox,result.obligation,{now:input.now});
        writes.push({type:P.LOCKBOX,value:next,eventId:businessEvent.eventId});
      }
      events.push(businessEvent);
      const response={schemaVersion:'tenant_synthetic_fee_source_corrected.v1',obligationId:data.obligation.obligationId,fees:result.obligation.syntheticFees,receipt:result.receipt,syntheticOnly:true,productionFundsMoved:false};
      const execution=createApprovalExecution({proposal,authorizationDecision:input.authorizationDecision,approvalExecutionId,idempotencyKeyHash:input.authorizationDecision.idempotencyKeyHash,businessEventIds:events.map(e=>e.eventId),resultHash:hashId('approved_command_result',response),now:input.now});
      const updated=transitionApprovalProposal(proposal,{status:ApprovalProposalStatus.EXECUTED,executionId:approvalExecutionId,now:input.now});
      const executionEvent=createCreditEvent({eventType:'approval_execution_recorded',payload:{approvalExecutionId,approvalProposalId:proposal.approvalProposalId,executionHash:execution.executionHash,businessEventIds:execution.businessEventIds,resultHash:execution.resultHash,actorId:input.authenticationContext.actorId,causationId:input.requestId,correlationId:input.correlationId},now:input.now});
      const proposalEvent=createCreditEvent({eventType:'approval_proposal_executed',payload:{approvalProposalId:proposal.approvalProposalId,approvalExecutionId,commandHash:proposal.commandHash,version:updated.version,actorId:input.authenticationContext.actorId,causationId:input.requestId,correlationId:input.correlationId},now:input.now});
      // FK order: execution and all Ledger entries precede the source receipt.
      writes.push({type:P.OBLIGATION,value:result.obligation,eventId:businessEvent.eventId},
        {type:A.APPROVAL_EXECUTION,value:execution,eventId:executionEvent.eventId},
        {type:A.APPROVAL_PROPOSAL,value:updated,eventId:proposalEvent.eventId},
        {type:P.SYNTHETIC_FEE_SOURCE_CORRECTION,value:result.receipt,eventId:businessEvent.eventId});
      return {aggregateType:'obligation',aggregateId:data.obligation.obligationId,
        events:[...events.map((event,i)=>({aggregateType:'obligation',aggregateId:data.obligation.obligationId,expectedVersion:data.state.aggregateVersion+i,event})),
          {aggregateType:A.APPROVAL_EXECUTION,aggregateId:approvalExecutionId,expectedVersion:0,event:executionEvent},
          {aggregateType:A.APPROVAL_PROPOSAL,aggregateId:proposal.approvalProposalId,expectedVersion:proposalState.aggregateVersion,event:proposalEvent}],writes,response};
    }}
  ];
}
