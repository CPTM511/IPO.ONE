import {formatMinorAmount,translateCopy} from './product-i18n.js';
const el=id=>document.getElementById(id);
const language=()=>document.documentElement.lang||'en';
const copy=text=>translateCopy(text,language()).text;
const money=value=>formatMinorAmount(String(value),'USD',language());
const effectLabels={unpaidPrincipalCreditMinor:'Unpaid principal credit',writtenOffPrincipalCreditMinor:'Written-off principal credit',principalRefundCreditMinor:'Principal refund credit due',interestRefundCreditMinor:'Interest refund credit due',unpaidFeeCreditMinor:'Unpaid fee credit',writtenOffFeeCreditMinor:'Written-off fee credit',paidFeeCreditMinor:'Paid fee refund credit due',nextOutstandingPrincipalMinor:'Principal balance after credit',nextOutstandingInterestMinor:'Interest balance after credit',nextOutstandingFeesMinor:'Fee balance after credit'};
export function sourceCorrectionImpact(review){
  return [copy('Synthetic credit only. No payment or cash refund is recorded. Prior interest is not repriced.'),
    ...Object.entries(effectLabels).map(([key,label])=>`${copy(label)}: ${money(review.effects[key])}`)].join('\n');
}
export function createSyntheticFeeCorrectionWorkspace({api,getState,has,run,showReview}){
  let cases=[],review,draft,epoch=0;
  const panel=el('syntheticFeeCorrectionPanel');
  const allowed=()=>(['http://localhost:8967','http://localhost:8981'].includes(globalThis.location?.origin) || (globalThis.location?.origin==='https://ipo.one' && getState().hostedGoverned===true)) && getState().signedIn && getState().workspace==='operations' && has('pilotCorrectSyntheticFeeSource');
  const message=text=>el('syntheticFeeCorrectionStatus').textContent=copy(text);
  const invalidate=()=>{epoch++;review=undefined;draft=undefined;el('syntheticFeeCorrectionAcknowledge').checked=false;el('syntheticFeeCorrectionImpact').textContent='';render();};
  function render(){
    panel.hidden=!allowed();
    el('reviewSyntheticFeeCorrectionBtn').disabled=!allowed() || !cases.length;
    el('proposeSyntheticFeeCorrectionBtn').disabled=!allowed() || !review || !el('syntheticFeeCorrectionAcknowledge').checked;
    if(review)el('syntheticFeeCorrectionImpact').textContent=sourceCorrectionImpact(review);
  }
  el('loadSyntheticFeeCorrectionCasesBtn').addEventListener('click',()=>run(async current=>{
    const result=await api('pilotReadSyntheticFeeCorrectionCases',{payload:{},idempotent:false});if(!current())return;
    cases=result.response.cases;invalidate();const select=el('syntheticFeeCorrectionSource');select.replaceChildren();
    for(const [i,c]of cases.entries()){
      const option=document.createElement('option');option.value=String(i);
      option.textContent=`${copy(c.kind==='borrower'?'Successful synthetic funding':'Received normal interest')} · ${c.reference} · ${money(c.remainingSourceBaseMinor)}`;select.append(option);
    }
    message(cases.length?'Select the original source and review the exact credit amount.':'No eligible source is available.');render();
  }));
  for(const id of ['syntheticFeeCorrectionSource','syntheticFeeCorrectionAmount'])el(id).addEventListener('input',invalidate);
  el('syntheticFeeCorrectionAcknowledge').addEventListener('change',render);
  el('reviewSyntheticFeeCorrectionBtn').addEventListener('click',()=>run(async current=>{
    invalidate();const source=cases[Number(el('syntheticFeeCorrectionSource').value)],value=el('syntheticFeeCorrectionAmount').value.trim();
    if(!source || !/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))throw new Error(copy('Enter a positive USD amount with at most two decimal places.'));
    const [whole,decimal='']=value.split('.');const amountMinor=(BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'))).toString();
    if(amountMinor==='0' || BigInt(amountMinor)>BigInt(source.remainingSourceBaseMinor))throw new Error(copy('Credit cannot exceed the remaining original source amount.'));
    const owner=++epoch;
    const result=await api('pilotReviewSyntheticFeeCorrection',{resource:{resourceType:'obligation',resourceId:source.obligationId},payload:{sourceFeeEntryId:source.sourceFeeEntryId,amountMinor},idempotent:false});
    if(!current() || owner!==epoch)return;
    review=result.response;message('Review the credit, balances and refund credits before proposing.');render();
  }));
  el('proposeSyntheticFeeCorrectionBtn').addEventListener('click',()=>run(async current=>{
    if(!allowed() || !review || !el('syntheticFeeCorrectionAcknowledge').checked)return;
    draft??={command:{operationId:'pilotCorrectSyntheticFeeSource',resource:{resourceType:'obligation',resourceId:review.obligationId},payload:{sourceFeeEntryId:review.sourceFeeEntryId,amountMinor:review.amountMinor,expectedFeeStateHash:review.expectedFeeStateHash,expectedEffectsHash:review.expectedEffectsHash,sourcePolicyHash:review.sourcePolicyHash},reasonCode:'synthetic_fee_source_correction',idempotencyKey:`source_execute_${crypto.randomUUID()}`},expiresAt:new Date(Date.now()+10*60_000).toISOString(),idempotencyKey:`source_propose_${crypto.randomUUID()}`};
    const result=await api('pilotProposeApproval',{payload:{command:draft.command,expiresAt:draft.expiresAt},idempotencyKey:draft.idempotencyKey});
    if(current()){showReview(result.response);invalidate();message('Proposal recorded. Two independent approvals are required before execution.');}
  }));
  return {render,clear(){epoch++;cases=[];invalidate();el('syntheticFeeCorrectionSource').replaceChildren();panel.hidden=true;}};
}
