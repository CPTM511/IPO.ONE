import { runVerticalSlice } from "./vertical-slice.js";

const { summary } = await runVerticalSlice();

console.log(
  JSON.stringify(
    {
      subjectId: summary.subject.subjectId,
      mandateStatus: summary.mandate.status,
      obligationStatus: summary.obligation.status,
      outstandingMinor: summary.obligation.outstandingPrincipalMinor,
      creditLineUtilizedMinor: summary.creditLine.utilizedMinor,
      ledgerBalanced: summary.ledger.integrity.balanced,
      ledgerTransactionCount: summary.ledger.transactionCount,
      railId: summary.transferIntent.railId,
      transferIntentStatus: summary.transferIntent.status,
      settlementFinality: summary.settlementReceipt.finality,
      railReplayable: summary.railReplayProof.replayable,
      evidenceEnvelopeCount: summary.evidenceEnvelopeCount,
      adminExposure: summary.adminExposure,
      timelineEvents: summary.adminTimeline.length
    },
    null,
    2
  )
);
