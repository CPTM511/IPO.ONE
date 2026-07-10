import { runVerticalSlice } from "./vertical-slice.js";

const { summary } = runVerticalSlice();

console.log(
  JSON.stringify(
    {
      subjectId: summary.subject.subjectId,
      obligationStatus: summary.obligation.status,
      outstandingMinor: summary.obligation.outstandingPrincipalMinor,
      creditLineUtilizedMinor: summary.creditLine.utilizedMinor,
      adminExposure: summary.adminExposure,
      timelineEvents: summary.adminTimeline.length
    },
    null,
    2
  )
);
