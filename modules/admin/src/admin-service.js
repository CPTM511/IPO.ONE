import { CreditEventType, createAdminAction, createCreditEvent } from "../../../packages/domain/src/index.js";

export class AdminService {
  constructor({ eventStore, riskService, obligationService }) {
    this.eventStore = eventStore;
    this.riskService = riskService;
    this.obligationService = obligationService;
    this.adminActions = new Map();
  }

  getSubjectTimeline(subjectId) {
    return this.eventStore.timeline(subjectId);
  }

  getAuditLog() {
    return {
      creditEvents: this.eventStore.listCreditEvents(),
      auditEvents: this.eventStore.listAuditEvents(),
      evidenceEnvelopes: this.eventStore.listEvidenceEnvelopes()
    };
  }

  getExposure() {
    const creditLines = this.riskService.listCreditLines();
    const obligations = this.obligationService.listObligations();
    const outstandingMinor = obligations.reduce((sum, obligation) => sum + BigInt(obligation.outstandingPrincipalMinor), 0n);
    const utilizedMinor = creditLines.reduce((sum, line) => sum + BigInt(line.utilizedMinor), 0n);
    const limitMinor = creditLines.reduce((sum, line) => sum + BigInt(line.limitMinor), 0n);

    return {
      creditLineCount: creditLines.length,
      obligationCount: obligations.length,
      outstandingMinor: outstandingMinor.toString(),
      utilizedMinor: utilizedMinor.toString(),
      limitMinor: limitMinor.toString()
    };
  }

  freezeCreditLine({ adminId, creditLineId, reason }) {
    const action = createAdminAction({
      adminId,
      actionType: "freeze_credit_line",
      targetType: "credit_line",
      targetId: creditLineId,
      reason
    });
    this.adminActions.set(action.adminActionId, action);
    const line = this.riskService.freezeCreditLine({ creditLineId, adminId, reason });
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.ADMIN_ACTION_RECORDED,
        subjectId: line.subjectId,
        payload: action
      })
    );
    return { action: structuredClone(action), creditLine: line };
  }
}
