import {
  CreditEventType,
  CreditLineStatus,
  LockboxStatus,
  PrincipalStatus,
  RiskAction,
  createAuditEvent,
  createCreditEvent,
  createCreditLine,
  createRiskDecision
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

function minBigInt(values) {
  return values.reduce((min, value) => (value < min ? value : min));
}

export class RiskService {
  constructor({ eventStore, globalSubjectCapMinor = "1000000", advanceRate30dBps = 3000, advanceRate7dBps = 9000 }) {
    this.eventStore = eventStore;
    this.globalSubjectCapMinor = BigInt(globalSubjectCapMinor);
    this.advanceRate30dBps = BigInt(advanceRate30dBps);
    this.advanceRate7dBps = BigInt(advanceRate7dBps);
    this.creditLines = new Map();
    this.decisions = new Map();
  }

  requestCreditLine({ subjectId, assetId, inputs }) {
    const reasons = [];
    let status = CreditLineStatus.APPROVED;
    let action = RiskAction.NONE;

    if (inputs.lockboxStatus !== LockboxStatus.ACTIVE) {
      reasons.push({ code: "lockbox_not_active", message: "Lockbox must be active before credit approval." });
      status = CreditLineStatus.REJECTED;
    }
    if (inputs.principalStatus !== PrincipalStatus.ACTIVE) {
      reasons.push({ code: "principal_not_active", message: "Principal must be active." });
      status = CreditLineStatus.REJECTED;
    }
    if ((inputs.allowlistedProviderCount ?? 0) <= 0) {
      reasons.push({ code: "no_allowlisted_provider", message: "At least one allowlisted Provider is required." });
      status = CreditLineStatus.REJECTED;
    }
    if ((inputs.overdueCount ?? 0) > 0) {
      reasons.push({ code: "overdue_obligation", message: "Open overdue obligations freeze new credit." });
      status = CreditLineStatus.FROZEN;
      action = RiskAction.FREEZE_LOCKBOX;
    }
    if ((inputs.revenueCaptureRatioBps ?? 10000) < 9000) {
      reasons.push({ code: "capture_ratio_below_threshold", message: "Revenue capture ratio is below the MVP threshold." });
      status = CreditLineStatus.FROZEN;
      action = RiskAction.REDUCE_LIMIT;
    }

    const captured30d = BigInt(inputs.capturedRevenue30dMinor ?? "0");
    const captured7d = BigInt(inputs.capturedRevenue7dMinor ?? "0");
    const existingOutstanding = BigInt(inputs.existingOutstandingMinor ?? "0");
    const perChainRemaining = BigInt(inputs.perChainCapRemainingMinor ?? this.globalSubjectCapMinor.toString());
    const providerCapRemaining = BigInt(inputs.providerCapRemainingMinor ?? this.globalSubjectCapMinor.toString());
    const limitFrom30d = (captured30d * this.advanceRate30dBps) / 10000n;
    const limitFrom7d = (captured7d * this.advanceRate7dBps) / 10000n;
    const grossLimit = minBigInt([limitFrom30d, limitFrom7d, this.globalSubjectCapMinor, perChainRemaining, providerCapRemaining]);
    const availableLimit = grossLimit > existingOutstanding ? grossLimit - existingOutstanding : 0n;

    if (availableLimit <= 0n && status === CreditLineStatus.APPROVED) {
      reasons.push({ code: "no_available_limit", message: "Calculated credit line is zero." });
      status = CreditLineStatus.REJECTED;
    }
    if (status === CreditLineStatus.APPROVED) {
      reasons.push({ code: "approved_by_rules_v0", message: "Deterministic v0 rules approved the request." });
    }

    const decision = createRiskDecision({
      subjectId,
      assetId,
      status,
      limitMinor: status === CreditLineStatus.APPROVED ? availableLimit.toString() : "0",
      action,
      reasons
    });
    this.decisions.set(decision.riskDecisionId, decision);

    let creditLine;
    if (status === CreditLineStatus.APPROVED) {
      creditLine = createCreditLine({
        subjectId,
        assetId,
        limitMinor: availableLimit.toString(),
        riskSnapshotId: decision.riskDecisionId
      });
      this.creditLines.set(creditLine.creditLineId, creditLine);
    }

    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.RISK_DECISION_CREATED,
        subjectId,
        payload: { decision, creditLine }
      })
    );
    if (creditLine) {
      this.eventStore.appendCreditEvent(
        createCreditEvent({
          eventType: CreditEventType.CREDIT_LINE_GRANTED,
          subjectId,
          payload: {
            creditLineId: creditLine.creditLineId,
            limitMinor: creditLine.limitMinor,
            riskDecisionId: decision.riskDecisionId
          }
        })
      );
    }

    return { decision: structuredClone(decision), creditLine: creditLine ? structuredClone(creditLine) : undefined };
  }

  reserveUtilization({ creditLineId, amountMinor }) {
    const line = this.#requireCreditLine(creditLineId);
    if (line.status !== CreditLineStatus.APPROVED) {
      throw new DomainError("credit_line_not_approved", "credit line is not approved", { creditLineId, status: line.status });
    }
    const nextUtilized = BigInt(line.utilizedMinor) + BigInt(amountMinor);
    if (nextUtilized > BigInt(line.limitMinor)) {
      throw new DomainError("credit_line_limit_exceeded", "credit line utilization exceeds limit", {
        creditLineId,
        amountMinor
      });
    }
    line.utilizedMinor = nextUtilized.toString();
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LINE_UTILIZED,
        subjectId: line.subjectId,
        payload: { creditLineId, amountMinor, utilizedMinor: line.utilizedMinor }
      })
    );
    return structuredClone(line);
  }

  releaseUtilization({ creditLineId, amountMinor }) {
    const line = this.#requireCreditLine(creditLineId);
    const releaseAmount = BigInt(amountMinor);
    const utilized = BigInt(line.utilizedMinor);
    line.utilizedMinor = (releaseAmount > utilized ? 0n : utilized - releaseAmount).toString();
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LINE_RELEASED,
        subjectId: line.subjectId,
        payload: { creditLineId, amountMinor, utilizedMinor: line.utilizedMinor }
      })
    );
    return structuredClone(line);
  }

  freezeCreditLine({ creditLineId, adminId = "system", reason }) {
    return this.#setCreditLineStatus({ creditLineId, nextStatus: CreditLineStatus.FROZEN, adminId, reason });
  }

  adjustCreditLine({ creditLineId, limitMinor, adminId = "system", reason }) {
    const line = this.#requireCreditLine(creditLineId);
    if (BigInt(limitMinor) < BigInt(line.utilizedMinor)) {
      throw new DomainError("limit_below_utilization", "new limit cannot be below utilization", { creditLineId });
    }
    line.limitMinor = limitMinor;
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendAuditEvent(
      createAuditEvent({
        actorId: adminId,
        actionType: "adjust_credit_line",
        targetType: "credit_line",
        targetId: creditLineId,
        reason,
        payload: { subjectId: line.subjectId, limitMinor }
      })
    );
    return structuredClone(line);
  }

  closeCreditLine({ creditLineId, adminId = "system", reason }) {
    return this.#setCreditLineStatus({ creditLineId, nextStatus: CreditLineStatus.CLOSED, adminId, reason });
  }

  getCreditLine(creditLineId) {
    return structuredClone(this.#requireCreditLine(creditLineId));
  }

  listCreditLines(filter = {}) {
    return [...this.creditLines.values()]
      .filter((line) => Object.entries(filter).every(([key, value]) => value === undefined || line[key] === value))
      .map((line) => structuredClone(line));
  }

  #setCreditLineStatus({ creditLineId, nextStatus, adminId, reason }) {
    const line = this.#requireCreditLine(creditLineId);
    const previousStatus = line.status;
    line.status = nextStatus;
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LINE_STATUS_CHANGED,
        subjectId: line.subjectId,
        payload: { creditLineId, previousStatus, newStatus: nextStatus, reason }
      })
    );
    this.eventStore.appendAuditEvent(
      createAuditEvent({
        actorId: adminId,
        actionType: `credit_line_${nextStatus}`,
        targetType: "credit_line",
        targetId: creditLineId,
        reason,
        payload: { subjectId: line.subjectId, previousStatus, newStatus: nextStatus }
      })
    );
    return structuredClone(line);
  }

  #requireCreditLine(creditLineId) {
    const line = this.creditLines.get(creditLineId);
    if (!line) throw new DomainError("credit_line_not_found", "credit line not found", { creditLineId });
    return line;
  }
}
