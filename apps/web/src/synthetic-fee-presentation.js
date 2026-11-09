import { formatMinorAmount } from "./product-i18n.js";

const language = () => document.getElementById("productLanguage")?.value || "en";
const money = value => formatMinorAmount(String(value), "USD", language());
const el = id => document.getElementById(id);

export function syntheticFeeEffect(value) {
  const terms = value?.feeTerms ?? value?.syntheticFees?.terms;
  if (!terms) return "";
  return `Net proceeds ${money(terms.netProceedsMinor)}; platform service fee ${money(terms.borrowerFeeAtFullFundingMinor)}; repay principal plus the fee and accrued interest. Synthetic only.`;
}

export function syntheticSourceCreditClosureLabel(obligation) {
  return obligation?.syntheticFees?.sourceCorrectionCount>0 && obligation.syntheticFees.fundedBaseMinor==="0" && obligation.status==="fully_repaid"
    ? "Cleared by source credit" : null;
}

let renderedObligationId;
export function renderSyntheticFeePanels(offer, obligation) {
  if (renderedObligationId !== obligation?.obligationId) {
    renderedObligationId = obligation?.obligationId;el("humanFeeReceiptRows").replaceChildren();
  }
  const terms = offer?.feeTerms;
  el("humanOfferFeeDisclosure").hidden = !terms;
  if (terms) {
    for (const [id, value] of Object.entries({
      humanFeeNetProceeds: terms.netProceedsMinor,
      humanFeePlatform: terms.borrowerFeeAtFullFundingMinor,
      humanFeeProvider: terms.providerOriginationFeeMinor,
      humanFeeInterestEstimate: terms.scheduledInterestEstimateMinor,
      humanFeeRepaymentEstimate: terms.estimatedTotalRepaymentMinor,
      humanFeeCostEstimate: terms.estimatedTotalCostMinor
    })) el(id).textContent = money(value);
  }
  const fees = obligation?.syntheticFees;
  el("humanSyntheticFeeSummary").hidden = !fees;
  if (!fees) { el("humanFeeReceiptRows").replaceChildren();return; }
  el("humanFeeAssessed").textContent = money(fees.borrowerAssessedMinor);
  el("humanFeePaid").textContent = money(fees.borrowerPaidMinor);
  el("humanFeeBalance").textContent = money(obligation.outstandingFeesMinor);
  el("humanFeeRefundDue").textContent = money(fees.borrowerRefundDueMinor);
  el("humanSourceCreditSummary").hidden=!(fees.sourceCorrectionCount>0);
  el("humanSourcePrincipalCredit").textContent=money(fees.principalUnpaidCreditMinor??"0");
  el("humanSourceRefundCredit").textContent=money((BigInt(fees.principalRefundCreditDueMinor??"0")+BigInt(fees.interestRefundCreditDueMinor??"0")).toString());
}

// Transport and presentation only. The server resolves all amounts, ownership,
// source receipts, cost disclosures and statement admission.
export function initializeSyntheticFeeControls({ query, currentObligation }) {
  let feeReadSequence = 0;
  let lastOwnFeeView;
  function renderOwnFeeView(){
    el("humanFeeReceiptRows").replaceChildren();
    if(lastOwnFeeView?.obligationId!==currentObligation()?.obligationId)return;
      for (const entry of lastOwnFeeView.entries) {
        const row=document.createElement("p"), title=document.createElement("strong"), details=document.createElement("details"), summary=document.createElement("summary"), reference=document.createElement("code");
        const kind=document.createElement("span"),amount=document.createElement("span");
        kind.textContent=entry.kind === "borrower" ? "Borrower platform fee" : "Institution service fee";amount.textContent=money(entry.feeDeltaMinor);
        title.append(kind,document.createTextNode(" · "),amount);
        summary.textContent="Receipt details";reference.textContent=entry.feeEntryId;
        details.append(summary,reference);row.append(title,details);el("humanFeeReceiptRows").append(row);
      }
      for(const receipt of lastOwnFeeView.sourceCorrections){
        const row=document.createElement("p"),label=document.createElement("strong"),details=document.createElement("details"),summary=document.createElement("summary"),reference=document.createElement("code");
        const sourceLabel=document.createElement("span"),sourceAmount=document.createElement("span");
        sourceLabel.textContent="Synthetic source credit";sourceAmount.textContent=money(receipt.amountMinor);
        label.append(sourceLabel,document.createTextNode(" · "),sourceAmount);
        summary.textContent="Receipt details";reference.textContent=JSON.stringify({receiptId:receipt.receiptId,originalSourceId:receipt.originalSourceId,originalSourceHash:receipt.originalSourceHash,approvalExecutionId:receipt.approvalExecutionId,sourceLedgerTransactionId:receipt.sourceLedgerTransactionId,feeLedgerTransactionId:receipt.feeLedgerTransactionId,refundStatus:receipt.refundStatus,effects:receipt.effects},null,2);
        details.append(summary,reference);const hint=document.createElement("span");hint.textContent="Synthetic credit only. No payment or cash refund is recorded. Prior interest is not repriced.";row.append(label,document.createTextNode(" · "),hint,details);el("humanFeeReceiptRows").append(row);
      }
      if (!lastOwnFeeView.entries.length) el("humanFeeReceiptRows").textContent="No fee has been assessed. Successful funding is required.";
  }
  el("humanReadFeesBtn").addEventListener("click", async () => {
    const obligation = currentObligation(), sequence = ++feeReadSequence;
    if (!obligation?.syntheticFees) return;
    const button=el("humanReadFeesBtn");button.disabled=true;
    el("humanFeeReceiptRows").replaceChildren();
    try {
      const result = await query("pilotReadSyntheticFees", { resource: { resourceType: "obligation", resourceId: obligation.obligationId }, payload: {}, idempotent: false });
      if (sequence !== feeReadSequence || currentObligation()?.obligationId !== obligation.obligationId) return;
      lastOwnFeeView=result.response;renderOwnFeeView();
    } catch {
      if (sequence === feeReadSequence) el("humanFeeReceiptRows").textContent="Fee reconciliation is unavailable. Retry before relying on these amounts.";
    } finally { button.disabled=false; }
  });
  const month=el("syntheticFeeMonth");month.value=new Date().toISOString().slice(0,7);
  let statement, pendingPreview, generation=0;
  const show = value => {
    statement=value;
    for (const [id, field] of Object.entries({ syntheticFeeOpening:"openingMinor",syntheticFeeAdditions:"additionsMinor",syntheticFeeReversals:"reversalsMinor",syntheticFeeSettled:"settledMinor",syntheticFeeClosing:"closingMinor" })) el(id).textContent=money(value[field]);
    el("syntheticFeeStatementReference").textContent=value.statementId;
    el("syntheticFeeSettlementStatus").textContent=value.closed?"Statement frozen; payment remains separate.":"Statement preview; no payment recorded.";
    el("closeSyntheticFeeStatementBtn").disabled=value.closed || new Date(value.periodEnd)>new Date();
  };
  const load=async()=>{
    const current=++generation;statement=undefined;el("closeSyntheticFeeStatementBtn").disabled=true;
    el("syntheticFeeStatementValues").hidden=true;
    try {
      const result=await query("pilotReadSyntheticFeeSettlement",{payload:{month:month.value},idempotent:false});
      if(current!==generation)return;
      pendingPreview=result.response;
      el("syntheticFeePendingAmount").textContent=money(pendingPreview.pendingAssessmentMinor);
      el("reconcileSyntheticFeesBtn").disabled=!pendingPreview.enabled || pendingPreview.pendingAssessmentMinor==="0";
      show(result.response.statement);el("syntheticFeeStatementValues").hidden=false;
      if(pendingPreview.pendingBaseMinor!=="0") {el("closeSyntheticFeeStatementBtn").disabled=true;el("syntheticFeeSettlementStatus").textContent="Pending interest receipts must be assessed before this period can be frozen.";}
    } catch { if(current===generation)el("syntheticFeeSettlementStatus").textContent="Local synthetic institution settlement is unavailable for this account."; }
  };
  el("loadSyntheticFeeStatementBtn").addEventListener("click",load);
  el("reconcileSyntheticFeesBtn").addEventListener("click",()=>{
    if(!pendingPreview || !pendingPreview.enabled)return;
    el("syntheticFeeReconcileAmount").textContent=money(pendingPreview.pendingAssessmentMinor);
    el("syntheticFeeReconcileDialog").showModal();
  });
  el("syntheticFeeReconcileCancelBtn").addEventListener("click",()=>el("syntheticFeeReconcileDialog").close());
  el("syntheticFeeReconcileConfirmBtn").addEventListener("click",async()=>{
    if(!pendingPreview)return;
    const button=el("syntheticFeeReconcileConfirmBtn");button.disabled=true;
    try {
      const expectedStateHash=pendingPreview.pendingAssessmentStateHash;
      await query("pilotReconcileSyntheticFees",{payload:{expectedStateHash},idempotencyKey:`b4-assess-${expectedStateHash}`,requestId:`request_${crypto.randomUUID()}`,correlationId:`correlation_${crypto.randomUUID()}`});
      el("syntheticFeeReconcileDialog").close();await load();
    } catch {el("syntheticFeeSettlementStatus").textContent="Fee assessment could not be confirmed. Reload the current preview before retrying.";el("syntheticFeeReconcileDialog").close();}
    finally {button.disabled=false;}
  });
  month.addEventListener("change",()=>{generation++;statement=undefined;el("syntheticFeeStatementValues").hidden=true;el("closeSyntheticFeeStatementBtn").disabled=true;});
  el("closeSyntheticFeeStatementBtn").addEventListener("click",()=>{
    if(!statement || statement.month!==month.value || statement.closed)return;
    el("syntheticFeeCloseMonth").textContent=statement.month;
    el("syntheticFeeCloseDialog").showModal();
  });
  el("syntheticFeeCloseConfirmBtn").addEventListener("click",async()=>{
    if(!statement || statement.month!==month.value)return;
    const selected=statement.month, button=el("syntheticFeeCloseConfirmBtn");button.disabled=true;
    try {
      const result=await query("pilotCloseSyntheticFeeStatement",{payload:{month:selected},
        idempotencyKey:`b4-fee-statement-${selected}`,requestId:`request_${crypto.randomUUID()}`,correlationId:`correlation_${crypto.randomUUID()}`});
      if(month.value===selected)show(result.response.statement);
      el("syntheticFeeCloseDialog").close();
    } catch { el("syntheticFeeSettlementStatus").textContent="Statement could not be frozen. No payment was made; reload and retry.";el("syntheticFeeCloseDialog").close(); }
    finally {button.disabled=false;}
  });
  el("syntheticFeeCloseCancelBtn").addEventListener("click",()=>el("syntheticFeeCloseDialog").close());
  return { refreshPresentation() {
    if(lastOwnFeeView)renderOwnFeeView();
    if(statement)show(statement);
    if(pendingPreview)el("syntheticFeePendingAmount").textContent=money(pendingPreview.pendingAssessmentMinor);
  }, reset() {
    generation++;feeReadSequence++;lastOwnFeeView=undefined;statement=undefined;pendingPreview=undefined;
    el("reconcileSyntheticFeesBtn").disabled=true;el("syntheticFeePendingAmount").textContent="—";
    if(el("syntheticFeeReconcileDialog").open)el("syntheticFeeReconcileDialog").close();
    el("humanFeeReceiptRows").replaceChildren();el("syntheticFeeStatementValues").hidden=true;
    el("closeSyntheticFeeStatementBtn").disabled=true;
    if(el("syntheticFeeCloseDialog").open)el("syntheticFeeCloseDialog").close();
  } };
}
