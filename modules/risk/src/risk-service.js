import {
  CreditEventType,
  CreditLineStatus,
  DomainError,
  LockboxStatus,
  MandateCapability,
  PrincipalStatus,
  RiskAction,
  assertNonEmptyString,
  assertNonNegativeMinorUnits,
  assertPositiveMinorUnits,
  createAuditEvent,
  createCreditEvent,
  createCreditLine,
  createRiskDecision
} from "../../../packages/domain/src/index.js";

function minBigInt(values) {
  return values.reduce((min, value) => (value < min ? value : min));
}

export class RiskService {
  constructor({
    eventStore,
    authorizationService,
    globalSubjectCapMinor = "1000000",
    advanceRate30dBps = 3000,
    advanceRate7dBps = 9000
  }) {
    this.eventStore = eventStore;
    this.authorizationService = authorizationService;
    this.globalSubjectCapMinor = BigInt(globalSubjectCapMinor);
    this.advanceRate30dBps = BigInt(advanceRate30dBps);
    this.advanceRate7dBps = BigInt(advanceRate7dBps);
    this.creditLines = new Map();
    this.creditLineIdsBySubjectAsset = new Map();
    this.decisions = new Map();
  }

  requestCreditLine({ subjectId, mandateId, assetId, inputs }) {
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

    const captured30d = assertNonNegativeMinorUnits(inputs.capturedRevenue30dMinor ?? "0", "capturedRevenue30dMinor");
    const captured7d = assertNonNegativeMinorUnits(inputs.capturedRevenue7dMinor ?? "0", "capturedRevenue7dMinor");
    const existingOutstanding = assertNonNegativeMinorUnits(
      inputs.existingOutstandingMinor ?? "0",
      "existingOutstandingMinor"
    );
    const perChainRemaining = assertNonNegativeMinorUnits(
      inputs.perChainCapRemainingMinor ?? this.globalSubjectCapMinor.toString(),
      "perChainCapRemainingMinor"
    );
    const providerCapRemaining = assertNonNegativeMinorUnits(
      inputs.providerCapRemainingMinor ?? this.globalSubjectCapMinor.toString(),
      "providerCapRemainingMinor"
    );
    const limitFrom30d = (captured30d * this.advanceRate30dBps) / 10000n;
    const limitFrom7d = (captured7d * this.advanceRate7dBps) / 10000n;
    const grossLimit = minBigInt([limitFrom30d, limitFrom7d, this.globalSubjectCapMinor, perChainRemaining, providerCapRemaining]);
    const availableLimit = grossLimit > existingOutstanding ? grossLimit - existingOutstanding : 0n;

    try {
      if (!this.authorizationService) {
        throw new DomainError("authorization_unavailable", "authorization service is unavailable");
      }
      this.authorizationService.assertAuthorized({
        mandateId,
        subjectId,
        capability: MandateCapability.REQUEST_CREDIT,
        assetId,
        amountMinor: availableLimit > 0n ? availableLimit.toString() : undefined,
        enforceAggregateLimit: false
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      reasons.push({ code: error.code, message: error.message });
      if (status === CreditLineStatus.APPROVED) status = CreditLineStatus.REJECTED;
    }

    if (availableLimit <= 0n && status === CreditLineStatus.APPROVED) {
      reasons.push({ code: "no_available_limit", message: "Calculated credit line is zero." });
      status = CreditLineStatus.REJECTED;
    }
    if (status === CreditLineStatus.APPROVED) {
      reasons.push({ code: "approved_by_rules_v0", message: "Deterministic v0 rules approved the request." });
    }

    const subjectAssetKey = `${subjectId}\0${assetId}`;
    const existingCreditLineId = this.creditLineIdsBySubjectAsset.get(subjectAssetKey);
    const existingCreditLine = existingCreditLineId ? this.#requireCreditLine(existingCreditLineId) : undefined;
    if (status === CreditLineStatus.APPROVED && existingCreditLine) {
      if (existingCreditLine.status === CreditLineStatus.CLOSED) {
        throw new DomainError("credit_line_closed", "closed credit lines require an explicit replacement workflow", {
          creditLineId: existingCreditLine.creditLineId
        });
      }
      if (BigInt(existingCreditLine.utilizedMinor) !== existingOutstanding) {
        throw new DomainError("risk_state_mismatch", "reported outstanding does not match credit line utilization", {
          creditLineId: existingCreditLine.creditLineId,
          reportedOutstandingMinor: existingOutstanding.toString(),
          utilizedMinor: existingCreditLine.utilizedMinor
        });
      }
      reasons.push({ code: "existing_credit_line_reused", message: "Existing subject and asset credit line was reused." });
    }

    const decision = createRiskDecision({
      subjectId,
      mandateId,
      assetId,
      status,
      limitMinor:
        status === CreditLineStatus.APPROVED
          ? existingCreditLine?.limitMinor ?? availableLimit.toString()
          : "0",
      utilizationMinor: existingCreditLine?.utilizedMinor ?? existingOutstanding.toString(),
      action,
      reasons
    });
    this.decisions.set(decision.riskDecisionId, decision);

    let creditLine;
    if (status === CreditLineStatus.APPROVED) {
      if (existingCreditLine) {
        existingCreditLine.riskSnapshotId = decision.riskDecisionId;
        existingCreditLine.mandateId = mandateId;
        existingCreditLine.updatedAt = new Date().toISOString();
        creditLine = existingCreditLine;
      } else {
        creditLine = createCreditLine({
          subjectId,
          mandateId,
          assetId,
          limitMinor: availableLimit.toString(),
          riskSnapshotId: decision.riskDecisionId
        });
        this.creditLines.set(creditLine.creditLineId, creditLine);
        this.creditLineIdsBySubjectAsset.set(subjectAssetKey, creditLine.creditLineId);
      }
    }

    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.RISK_DECISION_CREATED,
        subjectId,
        payload: { decision, creditLine }
      })
    );
    if (creditLine && !existingCreditLine) {
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
    const amount = assertPositiveMinorUnits(amountMinor);
    const nextUtilized = BigInt(line.utilizedMinor) + amount;
    if (nextUtilized > BigInt(line.limitMinor)) {
      throw new DomainError("credit_line_limit_exceeded", "credit line utilization exceeds limit", {
        creditLineId,
        amountMinor: amount.toString()
      });
    }
    line.utilizedMinor = nextUtilized.toString();
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LINE_UTILIZED,
        subjectId: line.subjectId,
        payload: { creditLineId, amountMinor: amount.toString(), utilizedMinor: line.utilizedMinor }
      })
    );
    return structuredClone(line);
  }

  releaseUtilization({ creditLineId, amountMinor }) {
    const line = this.#requireCreditLine(creditLineId);
    if (line.status === CreditLineStatus.CLOSED) {
      throw new DomainError("credit_line_closed", "closed credit line utilization cannot change", { creditLineId });
    }
    const releaseAmount = assertPositiveMinorUnits(amountMinor);
    const utilized = BigInt(line.utilizedMinor);
    if (releaseAmount > utilized) {
      throw new DomainError("release_exceeds_utilization", "released utilization exceeds the reserved amount", {
        creditLineId,
        amountMinor: releaseAmount.toString(),
        utilizedMinor: utilized.toString()
      });
    }
    line.utilizedMinor = (utilized - releaseAmount).toString();
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LINE_RELEASED,
        subjectId: line.subjectId,
        payload: { creditLineId, amountMinor: releaseAmount.toString(), utilizedMinor: line.utilizedMinor }
      })
    );
    return structuredClone(line);
  }

  freezeCreditLine({ creditLineId, adminId = "system", reason }) {
    return this.#setCreditLineStatus({ creditLineId, nextStatus: CreditLineStatus.FROZEN, adminId, reason });
  }

  adjustCreditLine({ creditLineId, limitMinor, adminId = "system", reason }) {
    const line = this.#requireCreditLine(creditLineId);
    assertNonEmptyString("reason", reason);
    const nextLimit = assertNonNegativeMinorUnits(limitMinor, "limitMinor");
    if (nextLimit < BigInt(line.utilizedMinor)) {
      throw new DomainError("limit_below_utilization", "new limit cannot be below utilization", { creditLineId });
    }
    const previousLimitMinor = line.limitMinor;
    line.limitMinor = nextLimit.toString();
    line.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LINE_ADJUSTED,
        subjectId: line.subjectId,
        payload: {
          creditLineId,
          previousLimitMinor,
          limitMinor: line.limitMinor,
          reason
        }
      })
    );
    this.eventStore.appendAuditEvent(
      createAuditEvent({
        actorId: adminId,
        actionType: "adjust_credit_line",
        targetType: "credit_line",
        targetId: creditLineId,
        reason,
        payload: { subjectId: line.subjectId, previousLimitMinor, limitMinor: line.limitMinor }
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
    assertNonEmptyString("reason", reason);
    if (line.status === CreditLineStatus.CLOSED) {
      throw new DomainError("credit_line_closed", "closed credit line status cannot change", { creditLineId });
    }
    if (line.status === nextStatus) return structuredClone(line);
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
