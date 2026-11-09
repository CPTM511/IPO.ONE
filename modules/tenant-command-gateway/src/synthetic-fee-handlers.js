import { planSyntheticFeeWrites } from "./credit-execution-handlers.js";
import {
  DomainError, CreditEventType, hashId, createCreditEvent,
  createSyntheticFeeStatement, transitionSyntheticFeeBasis, createSyntheticFeePosting, syntheticFeeTarget
} from "../../../packages/domain/src/index.js";
import { SYNTHETIC_FEE_POLICY } from "../../../packages/domain/src/synthetic-fees.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const INSTITUTION = "urn:ipo-one:local:synthetic-capital-partner:b4";
const unavailable = () => { throw new DomainError("tenant_resource_unavailable", "The requested resource is not available."); };
function monthPayload(payload) {
  if (!payload || Object.keys(payload).length !== 1 || !/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(payload.month)) {
    throw new DomainError("invalid_tenant_command_payload", "An exact UTC calendar month is required");
  }
  return payload.month;
}
export async function verifiedSyntheticFeeEntries(input, scope) {
  const { client, coreRepository } = input;
  const pending = message => { throw new DomainError("synthetic_fee_reconciliation_pending", message); };
  const entries = await coreRepository.listSyntheticFeeEntriesInTransaction(client, scope);
  const loans = await client.query(`SELECT id,synthetic_fees FROM obligations WHERE synthetic_fees IS NOT NULL
    AND ($1::text IS NULL OR id=$1) AND ($2::text IS NULL OR synthetic_fees#>>'{terms,institutionId}'=$2)`,[scope.obligationId??null,scope.institutionId??null]);
  const states=new Map();
  for(const row of loans.rows) {
    const loan=await coreRepository.getProjectionInTransaction(client,CoreProjectionType.OBLIGATION,row.id);
    if(!loan || hashId("fee_state",loan.syntheticFees)!==hashId("fee_state",row.synthetic_fees))pending("Canonical fee balances and their stored projection differ");
    states.set(row.id,{loan,borrower:{base:0n,fee:0n,pending:0n,ids:[]},institution:{base:0n,fee:0n,pending:0n,ids:[]}});
  }
  const records=new Map(entries.map(e=>[e.feeEntryId,e]));
  for (const entry of [...entries].sort((a,b)=>a.obligationId.localeCompare(b.obligationId)||a.revision-b.revision)) {
    const state = await coreRepository.getProjectionInTransaction(client, CoreProjectionType.SYNTHETIC_FEE_ENTRY, entry.feeEntryId);
    if (!state || hashId("fee_document", state) !== hashId("fee_document", entry)) pending("Fee evidence and its stored projection do not reconcile");
    const group=states.get(entry.obligationId), aggregate=group?.[entry.kind];
    if(!aggregate || entry.institutionId!==group.loan.syntheticFees.terms.institutionId || entry.termsHash!==group.loan.syntheticFees.terms.termsHash || entry.policyHash!==group.loan.syntheticFees.terms.policyHash)pending("Fee belongs to another loan, payer or accepted policy");
    if(BigInt(entry.baseDeltaMinor)>0n) {
      const kind=entry.kind==='borrower'?CoreProjectionType.SANDBOX_EXECUTION_RECEIPT:CoreProjectionType.REPAYMENT;
      const source=await coreRepository.getProjectionInTransaction(client,kind,entry.sourceId);
      if(!source || source.obligationId!==entry.obligationId || source.productionFundsMoved!==false ||
        (entry.kind==='borrower'?source.receiptHash:source.repaymentHash)!==entry.sourceHash ||
        (entry.kind==='borrower'?source.amountMinor:source.appliedInterestMinor)!==entry.baseDeltaMinor)pending("Fee basis does not match its successful canonical source receipt");
    }
    if(BigInt(entry.baseDeltaMinor)<0n) {
      const original=records.get(entry.reversesEntryId);
      const receipt=await coreRepository.getProjectionInTransaction(client,CoreProjectionType.SYNTHETIC_FEE_SOURCE_CORRECTION,entry.sourceId);
      const sourceLedger=receipt && await coreRepository.getProjectionInTransaction(client,CoreProjectionType.LEDGER_TRANSACTION,receipt.sourceLedgerTransactionId);
      const execution=receipt && await coreRepository.getProjectionInTransaction(client,CoreProjectionType.APPROVAL_EXECUTION,receipt.approvalExecutionId);
      const proposal=execution && await coreRepository.getProjectionInTransaction(client,CoreProjectionType.APPROVAL_PROPOSAL,execution.approvalProposalId);
      const stored=receipt && await client.query("SELECT document FROM synthetic_fee_source_corrections WHERE id=$1",[receipt.receiptId]);
      if(!original || BigInt(original.baseDeltaMinor)<=0n || !receipt || !sourceLedger || !execution ||
        receipt.receiptId!==entry.sourceHash || receipt.feeEntryId!==entry.feeEntryId || receipt.sourceFeeEntryId!==original.feeEntryId ||
        receipt.originalSourceId!==original.sourceId || receipt.originalSourceHash!==original.sourceHash || receipt.kind!==entry.kind ||
        receipt.obligationId!==entry.obligationId || -BigInt(entry.baseDeltaMinor)!==BigInt(receipt.amountMinor) ||
        hashId("fee_document",receipt)!==hashId("fee_document",stored?.rows[0]?.document) ||
        sourceLedger.referenceId!==receipt.receiptId || sourceLedger.debitTotalMinor!==receipt.amountMinor || sourceLedger.creditTotalMinor!==receipt.amountMinor ||
        proposal?.operationId!=="pilotCorrectSyntheticFeeSource" || proposal.resourceId!==entry.obligationId || proposal.executionId!==execution.approvalExecutionId) pending("Source correction, dual approval and compensating Ledger do not reconcile");
      const sourceStored=await client.query('SELECT transaction_hash,metadata_hash,debit_total_minor::text,credit_total_minor::text FROM ledger_transactions WHERE id=$1',[sourceLedger.ledgerTransactionId]);
      const sourceLines=await client.query('SELECT account_id AS ledger_account_id,direction,amount_minor::text,sequence FROM ledger_entries WHERE transaction_id=$1 ORDER BY sequence',[sourceLedger.ledgerTransactionId]);
      if(sourceStored.rows[0]?.transaction_hash!==sourceLedger.transactionHash || sourceStored.rows[0]?.metadata_hash!==sourceLedger.metadataHash ||
        sourceStored.rows[0]?.debit_total_minor!==receipt.amountMinor || sourceStored.rows[0]?.credit_total_minor!==receipt.amountMinor || sourceLedger.metadata.receiptId!==receipt.receiptId ||
        hashId('source_ledger_lines',sourceLines.rows)!==hashId('source_ledger_lines',sourceLedger.entries.map(e=>({ledger_account_id:e.ledgerAccountId,direction:e.direction,amount_minor:e.amountMinor,sequence:e.sequence}))))pending("Source credit Ledger lines do not reconcile");
      const reversed=entries.filter(e=>e.reversesEntryId===original.feeEntryId).reduce((n,e)=>n-BigInt(e.baseDeltaMinor),0n);
      if(reversed>BigInt(original.baseDeltaMinor))pending("Source credits exceed the original canonical funding or received interest");
    }
    aggregate.base+=BigInt(entry.baseDeltaMinor);
    aggregate.fee+=BigInt(entry.feeDeltaMinor);
    if(entry.assessmentStatus==='pending_profile_disabled') {
      if(entry.kind!=='institution' || entry.feeDeltaMinor!=='0' || entry.reconcilesPendingEntryIds.length)pending("Pending basis was charged or admitted incorrectly");
      aggregate.pending+=BigInt(entry.baseDeltaMinor);aggregate.ids.push(entry.feeEntryId);
    } else if(entry.reconcilesPendingEntryIds.length) {
      if(hashId("pending_ids",[...entry.reconcilesPendingEntryIds].sort())!==hashId("pending_ids",[...aggregate.ids].sort()))pending("Pending source receipt admission is incomplete or duplicated");
      for(const id of entry.reconcilesPendingEntryIds)if(!records.has(id))pending("Pending source receipt is missing");
      aggregate.pending=0n;aggregate.ids=[];
    }
    if(aggregate.base<0n || aggregate.base.toString()!==entry.cumulativeBaseMinor || aggregate.fee.toString()!==entry.cumulativeFeeMinor ||
      syntheticFeeTarget(entry.kind,(aggregate.base-aggregate.pending).toString())!==entry.cumulativeFeeMinor)pending("Cumulative fee bases, rounding or balances do not reconcile");
    if (entry.ledgerTransactionId) {
      const ledger = await coreRepository.getProjectionInTransaction(client, CoreProjectionType.LEDGER_TRANSACTION, entry.ledgerTransactionId);
      const amount = BigInt(entry.feeDeltaMinor), absolute = (amount < 0n ? -amount : amount).toString();
      const stored=await client.query('SELECT transaction_hash,metadata_hash,debit_total_minor::text,credit_total_minor::text FROM ledger_transactions WHERE id=$1',[entry.ledgerTransactionId]);
      const lines=await client.query('SELECT account_id AS ledger_account_id,direction,amount_minor::text,sequence FROM ledger_entries WHERE transaction_id=$1 ORDER BY sequence',[entry.ledgerTransactionId]);
      const expectedLines=ledger?.entries?.map(e=>({ledger_account_id:e.ledgerAccountId,direction:e.direction,amount_minor:e.amountMinor,sequence:e.sequence}));
      if (!ledger || ledger.referenceId !== entry.feeEntryId || ledger.debitTotalMinor !== absolute || ledger.creditTotalMinor !== absolute ||
        stored.rows[0]?.transaction_hash!==ledger.transactionHash || stored.rows[0]?.metadata_hash!==ledger.metadataHash ||
        stored.rows[0]?.debit_total_minor!==absolute || stored.rows[0]?.credit_total_minor!==absolute ||
        hashId("fee_ledger_lines",lines.rows)!==hashId("fee_ledger_lines",expectedLines)) pending("Fee Ledger entries do not reconcile");
    } else if (entry.feeDeltaMinor !== "0") pending("A charged fee has no Ledger receipt");
  }
  for(const {loan,borrower,institution} of states.values()) {
    const fee=loan.syntheticFees;
    if(borrower.base.toString()!==fee.fundedBaseMinor || borrower.fee.toString()!==fee.borrowerAssessedMinor || institution.base.toString()!==fee.normalInterestBaseMinor || institution.fee.toString()!==fee.institutionAssessedMinor || institution.pending.toString()!==fee.pendingNormalInterestMinor ||
      hashId("pending_ids",[...institution.ids].sort())!==hashId("pending_ids",[...fee.pendingEntryIds].sort()))pending("Fee history is incomplete for the authoritative loan balance");
  }
  return entries;
}
export function createSyntheticFeeHandlers({ syntheticFeesEnabled = false, syntheticFeeOperatorActorId, syntheticFeesLocalContext = false } = {}) {
  const assertOperator = input => {
    if (syntheticFeesLocalContext !== true || typeof syntheticFeeOperatorActorId !== "string" ||
        input.authenticationContext.actorId !== syntheticFeeOperatorActorId) unavailable();
  };
  const assessmentPreview = async input => {
    const rows=await input.client.query("SELECT id,synthetic_fees FROM obligations WHERE synthetic_fees#>>'{terms,institutionId}'=$1 AND (synthetic_fees->>'pendingNormalInterestMinor')::NUMERIC>0 ORDER BY id",[INSTITUTION]);
    const states=[];let total=0n;
    for (const row of rows.rows) {
      const value=await input.coreRepository.getProjectionInTransaction(input.client,CoreProjectionType.OBLIGATION,row.id);
      if (!value || hashId("fee_state",value.syntheticFees)!==hashId("fee_state",row.synthetic_fees)) throw new DomainError("synthetic_fee_reconciliation_pending","Pending fee state and its canonical evidence do not reconcile");
      total+=BigInt(syntheticFeeTarget("institution",value.syntheticFees.normalInterestBaseMinor))-BigInt(value.syntheticFees.institutionAssessedMinor);
      states.push({obligationId:row.id,fees:value.syntheticFees});
    }
    return {amountMinor:total.toString(),stateHash:hashId("synthetic_fee_assessment_preview",states)};
  };
  const pendingBases = async (input, month) => {
    const rows=await input.client.query("SELECT id,synthetic_fees FROM obligations WHERE synthetic_fees#>>'{terms,institutionId}'=$1",[INSTITUTION]);
    const ids=new Set(rows.rows.flatMap(row=>row.synthetic_fees.pendingEntryIds));
    const entries=await verifiedSyntheticFeeEntries(input,{institutionId:INSTITUTION});
    const end=new Date(`${month}-01T00:00:00Z`);end.setUTCMonth(end.getUTCMonth()+1);
    return entries.filter(entry=>ids.has(entry.feeEntryId) && new Date(entry.occurredAt)<end)
      .reduce((sum,entry)=>sum+BigInt(entry.baseDeltaMinor),0n).toString();
  };
  return [
    {
      operationId: "pilotReconcileSyntheticFees", kind: "command",
      async plan(input) {
        assertOperator(input);
        if (syntheticFeesEnabled !== true) throw new DomainError("synthetic_fees_disabled","Enable the approved local fee profile before assessing pending bases");
        if (!input.payload || Object.keys(input.payload).length!==1 || !/^0x[0-9a-f]{64}$/.test(input.payload.expectedStateHash)) throw new DomainError("invalid_tenant_command_payload","An exact pending assessment preview is required");
        if ((await assessmentPreview(input)).stateHash!==input.payload.expectedStateHash) throw new DomainError("synthetic_fee_preview_stale","Pending fee bases changed; reload and review the assessment");
        const candidates=await input.client.query("SELECT id FROM obligations WHERE synthetic_fees#>>'{terms,institutionId}'=$1 AND (synthetic_fees->>'pendingNormalInterestMinor')::NUMERIC>0 ORDER BY id",[INSTITUTION]);
        const events=[],writes=[],feeEntryIds=[];
        for (const row of candidates.rows) {
          const state=await input.coreRepository.getProjectionStateInTransaction(input.client,CoreProjectionType.OBLIGATION,row.id,{lock:true});
          const obligation=state?.value;
          if (!obligation?.syntheticFees || BigInt(obligation.syntheticFees.pendingNormalInterestMinor)===0n) continue;
          const receipts=await verifiedSyntheticFeeEntries(input,{obligationId:row.id});
          const pending=receipts.filter(entry=>obligation.syntheticFees.pendingEntryIds.includes(entry.feeEntryId));
          if (pending.length!==obligation.syntheticFees.pendingEntryIds.length || pending.reduce((sum,e)=>sum+BigInt(e.baseDeltaMinor),0n).toString()!==obligation.syntheticFees.pendingNormalInterestMinor) throw new DomainError("synthetic_fee_reconciliation_pending","Pending source receipts do not reconcile");
          const source={pendingEntryIds:pending.map(e=>e.feeEntryId).sort(),obligationId:row.id};
          const sourceHash=hashId("synthetic_fee_pending_admission",source);
          const assessment=transitionSyntheticFeeBasis(obligation.syntheticFees,{obligationId:row.id,kind:"institution",sourceId:sourceHash,sourceHash,baseDeltaMinor:"0",now:input.now});
          const next={...obligation,syntheticFees:assessment.state,updatedAt:input.now.toISOString()};
          const plan=planSyntheticFeeWrites({feeEntry:assessment.entry,feeTransaction:createSyntheticFeePosting(next,assessment.entry,{now:input.now})},{...input,obligation});
          events.push(...plan.events.map((event,index)=>({aggregateType:"obligation",aggregateId:row.id,expectedVersion:state.aggregateVersion+index,event})));
          writes.push(...plan.writes,{type:CoreProjectionType.OBLIGATION,value:next,eventId:plan.events.at(-1).eventId});
          feeEntryIds.push(assessment.entry.feeEntryId);
        }
        const root=hashId("synthetic_fee_reconciliation",{requestId:input.requestId});
        if (!events.length) {
          const event=createCreditEvent({eventType:CreditEventType.SYNTHETIC_FEES_RECONCILED,payload:{institutionId:INSTITUTION,assessedCount:0,actorId:input.authenticationContext.actorId,syntheticOnly:true,productionFundsMoved:false},now:input.now});
          events.push({aggregateType:"synthetic_fee_reconciliation",aggregateId:root,expectedVersion:0,event});
        }
        return {aggregateType:"synthetic_fee_reconciliation",aggregateId:root,events,writes,response:{schemaVersion:"tenant_synthetic_fees_reconciled.v1",assessedCount:feeEntryIds.length,feeEntryIds,syntheticOnly:true,productionFundsMoved:false}};
      }
    },
    {
      operationId: "pilotReadSyntheticFees", kind: "query",
      async execute(input) {
        if (!input.payload || Object.keys(input.payload).length) throw new DomainError("invalid_tenant_command_payload", "Fee query accepts an empty payload");
        const obligation = await input.coreRepository.getProjectionInTransaction(input.client, CoreProjectionType.OBLIGATION, input.authorizationDecision.resourceId);
        if (!obligation || !obligation.syntheticFees) unavailable();
        const entries = await verifiedSyntheticFeeEntries(input, { obligationId: obligation.obligationId });
        const sourceCorrections=[];
        for(const id of new Set(entries.filter(e=>BigInt(e.baseDeltaMinor)<0n).map(e=>e.sourceId))) {
          sourceCorrections.push(await input.coreRepository.getProjectionInTransaction(input.client,CoreProjectionType.SYNTHETIC_FEE_SOURCE_CORRECTION,id));
        }
        return { schemaVersion: "tenant_synthetic_fees.v1", obligationId: obligation.obligationId,
          fees: obligation.syntheticFees, entries, sourceCorrections, syntheticOnly: true, productionFundsMoved: false };
      }
    },
    {
      operationId: "pilotReadSyntheticFeeSettlement", kind: "query",
      async execute(input) {
        assertOperator(input);const month = monthPayload(input.payload);
        const entries = await verifiedSyntheticFeeEntries(input, { institutionId: INSTITUTION });
        const existing = await input.client.query("SELECT document FROM synthetic_fee_statements WHERE institution_id=$1 AND month=$2",[INSTITUTION,month]);
        const statement = existing.rows[0]?.document ?? createSyntheticFeeStatement({ institutionId: INSTITUTION,
          month, entries: entries.filter(e=>e.kind==="institution" && e.assessmentStatus==="assessed"), now: input.now });
        const preview=await assessmentPreview(input);
        return { schemaVersion: "tenant_synthetic_fee_settlement.v1", enabled: syntheticFeesEnabled === true,
          pendingAssessmentMinor: preview.amountMinor, pendingAssessmentStateHash: preview.stateHash,
          policy: SYNTHETIC_FEE_POLICY, pendingBaseMinor: await pendingBases(input,month), statement, syntheticOnly: true, productionFundsMoved: false };
      }
    },
    {
      operationId: "pilotCloseSyntheticFeeStatement", kind: "command",
      async plan(input) {
        assertOperator(input);const month = monthPayload(input.payload);
        if (await pendingBases(input,month) !== "0") throw new DomainError("synthetic_fee_reconciliation_pending","Assess pending interest bases before freezing this period");
        // One deterministic institution/month root serializes concurrent closes.
        const key = hashId("synthetic_fee_statement_key", { institutionId: INSTITUTION, month });
        await input.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]);
        const existing = await input.client.query("SELECT document FROM synthetic_fee_statements WHERE institution_id=$1 AND month=$2",[INSTITUTION,month]);
        if (existing.rows[0]) throw new DomainError("synthetic_fee_statement_already_closed", "This month already has a frozen statement; read its existing receipt", {statementId:existing.rows[0].document.statementId});
        const entries = await verifiedSyntheticFeeEntries(input, { institutionId: INSTITUTION });
        const statement = createSyntheticFeeStatement({ institutionId: INSTITUTION, month,
          entries: entries.filter(e=>e.kind==="institution" && e.assessmentStatus==="assessed"), now: input.now, closed: true });
        const event = createCreditEvent({ eventType: CreditEventType.SYNTHETIC_FEE_STATEMENT_CLOSED,
          payload: { statementId: statement.statementId, month, institutionId: INSTITUTION,
            actorId: input.authenticationContext.actorId, causationId: input.requestId,
            correlationId: input.correlationId, syntheticOnly: true, productionFundsMoved: false }, now: input.now });
        return { aggregateType: "synthetic_fee_statement", aggregateId: key,
          events: [{ aggregateType: "synthetic_fee_statement", aggregateId: key, expectedVersion: 0, event }],
          writes: [{ type: CoreProjectionType.SYNTHETIC_FEE_STATEMENT, value: statement, eventId: event.eventId }],
          response: { schemaVersion: "tenant_synthetic_fee_statement_closed.v1", statement, syntheticOnly: true, productionFundsMoved: false } };
      }
    }
  ];
}
