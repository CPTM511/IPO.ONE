import {
  AccountPurpose,
  CreditLearningSignalType,
  PrincipalType,
  SubjectType
} from "../../../packages/domain/src/index.js";
import { createMvpServices } from "./services.js";
import { MVP_ASSET_ID, runVerticalSlice } from "./vertical-slice.js";

const PROVIDER_FIXTURES = [
  {
    key: "compute",
    name: "Compute Provider",
    settlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333",
    category: "compute"
  },
  {
    key: "data-api",
    name: "Data API Provider",
    settlementAccountId: "eip155:8453:0x4444444444444444444444444444444444444444",
    category: "data"
  },
  {
    key: "agent-tools",
    name: "Agent Tool Provider",
    settlementAccountId: "eip155:8453:0x5555555555555555555555555555555555555555",
    category: "workflow"
  }
];

function latest(values) {
  return values.at(-1);
}

function publicProvider(provider, policy) {
  return {
    providerId: provider.providerId,
    key: provider.key,
    name: provider.name,
    status: provider.status,
    riskTier: provider.riskTier,
    settlementAccountIdRef: provider.settlementAccountIdRef,
    spendPolicyId: policy?.spendPolicyId,
    category: policy?.category
  };
}

export function createInteractiveDemo() {
  return new InteractiveDemo();
}

export class InteractiveDemo {
  constructor() {
    this.reset();
  }

  reset() {
    this.services = createMvpServices();
    this.state = {
      principal: undefined,
      subject: undefined,
      walletBinding: undefined,
      lockbox: undefined,
      providers: [],
      policiesByProviderId: new Map(),
      creditLineResult: undefined,
      creditLine: undefined,
      spendRequests: [],
      obligations: [],
      paymentInstructions: [],
      settlements: [],
      repayments: [],
      lastCycle: undefined
    };

    for (const fixture of PROVIDER_FIXTURES) {
      const provider = this.services.spendPolicyService.allowProvider({
        name: fixture.name,
        settlementAccountId: fixture.settlementAccountId,
        riskTier: "tier_1"
      });
      this.state.providers.push({ ...provider, key: fixture.key, category: fixture.category });
    }

    return this.getStatus();
  }

  createAgent({ displayName = "IPO.ONE Demo Agent" } = {}) {
    if (this.state.subject) return this.getStatus();
    const principal = this.services.identityService.createPrincipal({
      principalType: PrincipalType.DEVELOPER,
      jurisdiction: "US"
    });
    const pendingSubject = this.services.identityService.createSubject({
      subjectType: SubjectType.AGENT,
      primaryPrincipalId: principal.principalId,
      displayName
    });
    const subject = this.services.identityService.activateSubject(pendingSubject.subjectId);
    this.state.principal = principal;
    this.state.subject = subject;
    this.services.creditLearningService.createProfile({
      subjectId: subject.subjectId,
      initialScore: 500,
      currentCreditLimitMinor: "0"
    });
    this.#ensurePolicies();
    return this.getStatus();
  }

  bindWallet(agentId = this.#subjectId(), { accountId } = {}) {
    this.#requireAgent(agentId);
    if (this.state.walletBinding) return this.getStatus();
    const walletBinding = this.services.identityService.bindAccount({
      subjectId: agentId,
      accountId: accountId ?? "eip155:8453:0x1111111111111111111111111111111111111111",
      signature: "0xdemo-wallet-signature",
      nonce: `wallet-${Date.now()}`,
      purpose: AccountPurpose.EXECUTION
    });
    this.state.walletBinding = walletBinding;
    return this.getStatus();
  }

  createLockbox(agentId = this.#subjectId()) {
    this.#requireAgent(agentId);
    if (this.state.lockbox) return this.getStatus();
    const lockbox = this.services.lockboxService.createLockbox({
      subjectId: agentId,
      assetId: MVP_ASSET_ID,
      accountId: "eip155:8453:0x2222222222222222222222222222222222222222"
    });
    this.state.lockbox = this.services.lockboxService.activateLockbox(lockbox.lockboxId);
    return this.getStatus();
  }

  requestCreditLine(agentId = this.#subjectId()) {
    this.#requireAgent(agentId);
    if (!this.state.lockbox) this.createLockbox(agentId);
    this.#ensurePolicies();

    const outstanding = this.state.obligations.reduce(
      (sum, obligation) => sum + BigInt(obligation.outstandingPrincipalMinor),
      0n
    );
    const creditProfile = this.services.creditLearningService.getProfile(agentId);
    const recommendedCap =
      BigInt(creditProfile.recommendedNextCreditLimitMinor) > 0n
        ? creditProfile.recommendedNextCreditLimitMinor
        : "500000";
    const result = this.services.riskService.requestCreditLine({
      subjectId: agentId,
      assetId: MVP_ASSET_ID,
      inputs: {
        capturedRevenue30dMinor: "1000000",
        capturedRevenue7dMinor: "400000",
        existingOutstandingMinor: outstanding.toString(),
        repaymentSuccessCount: this.state.repayments.length,
        overdueCount: this.state.obligations.filter((obligation) => obligation.status === "overdue").length,
        allowlistedProviderCount: this.state.providers.length,
        principalStatus: this.state.principal.status,
        lockboxStatus: this.state.lockbox.status,
        subjectAgeDays: 1,
        providerRiskTier: "tier_1",
        revenueCaptureRatioBps: 9500,
        perChainCapRemainingMinor: "1000000",
        providerCapRemainingMinor: recommendedCap
      }
    });
    this.state.creditLineResult = result;
    this.state.creditLine = result.creditLine;
    this.services.creditLearningService.evaluate({
      subjectId: agentId,
      currentCreditLimitMinor: result.creditLine?.limitMinor ?? "0",
      currentDemoInterestRateBps: creditProfile.recommendedDemoInterestRateBps,
      signals: [CreditLearningSignalType.LOW_UTILIZATION],
      repaymentPerformanceBps: this.state.repayments.length > 0 ? 10000 : 0,
      utilizationBehaviorBps: 0,
      revenueConsistencyBps: 9500
    });
    return this.getStatus();
  }

  submitSpendRequest({ agentId = this.#subjectId(), providerId, amountMinor = "50000", purposeCode = "compute" } = {}) {
    this.#requireAgent(agentId);
    if (!this.state.creditLine) this.requestCreditLine(agentId);
    const provider = this.state.providers.find((candidate) => candidate.providerId === providerId) ?? this.state.providers[0];
    const policy = this.state.policiesByProviderId.get(provider?.providerId) ?? { spendPolicyId: "missing_policy" };
    const creditAvailableMinor = (
      BigInt(this.state.creditLine.limitMinor) - BigInt(this.state.creditLine.utilizedMinor)
    ).toString();
    const spendRequest = this.services.spendPolicyService.requestSpend({
      subjectId: agentId,
      providerId: providerId ?? provider.providerId,
      spendPolicyId: policy.spendPolicyId,
      assetId: MVP_ASSET_ID,
      amountMinor,
      purposeCode,
      creditAvailableMinor
    });
    this.state.spendRequests.push(spendRequest);

    if (spendRequest.status === "approved") {
      this.state.creditLine = this.services.riskService.reserveUtilization({
        creditLineId: this.state.creditLine.creditLineId,
        amountMinor: spendRequest.amountMinor
      });
      const obligation = this.services.obligationService.activateObligation(
        this.services.obligationService.createObligation({
          subjectId: agentId,
          principalId: this.state.principal.principalId,
          assetId: MVP_ASSET_ID,
          amountMinor: spendRequest.amountMinor,
          dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
          spendPolicyId: policy.spendPolicyId,
          cashflowRouteId: `route_${this.state.lockbox.lockboxId}`,
          nonce: spendRequest.spendRequestId
        }).obligationId
      );
      this.state.obligations.push(obligation);
      const paymentInstruction = this.services.paymentService.prepareProviderPayment({
        spendRequest,
        providerSettlementAccountId: provider.settlementAccountIdRef
      });
      this.state.paymentInstructions.push(paymentInstruction);
    }

    return this.getStatus();
  }

  rejectRiskySpend(agentId = this.#subjectId()) {
    return this.submitSpendRequest({
      agentId,
      providerId: "provider_not_allowlisted",
      amountMinor: "50000",
      purposeCode: "unapproved_destination"
    });
  }

  recordSettlement({ spendRequestId = latest(this.state.spendRequests)?.spendRequestId } = {}) {
    const spendRequest = this.state.spendRequests.find((request) => request.spendRequestId === spendRequestId);
    if (!spendRequest || spendRequest.status !== "approved") return this.getStatus();
    const settlement = this.services.settlementService.recordSettlement({
      spendRequestId,
      providerId: spendRequest.providerId,
      assetId: spendRequest.assetId,
      amountMinor: spendRequest.amountMinor
    });
    const completed = this.services.settlementService.settle(settlement.settlementId);
    this.services.spendPolicyService.settleSpend(spendRequestId);
    this.state.settlements.push(completed);
    this.state.spendRequests = this.state.spendRequests.map((request) =>
      request.spendRequestId === spendRequestId ? this.services.spendPolicyService.getSpendRequest(spendRequestId) : request
    );
    return this.getStatus();
  }

  captureRevenue({ agentId = this.#subjectId(), amountMinor = "65000" } = {}) {
    this.#requireAgent(agentId);
    if (!this.state.lockbox) this.createLockbox(agentId);
    this.state.lockbox = this.services.lockboxService.captureRevenue({
      lockboxId: this.state.lockbox.lockboxId,
      amountMinor,
      source: "interactive_demo_revenue"
    });
    return this.getStatus();
  }

  autoRepay({ agentId = this.#subjectId() } = {}) {
    this.#requireAgent(agentId);
    if (!this.state.lockbox) return this.getStatus();
    const activeObligations = this.services.obligationService
      .listObligations({ subjectId: agentId })
      .filter((obligation) => ["active", "partially_repaid", "overdue"].includes(obligation.status));
    if (activeObligations.length === 0 || BigInt(this.state.lockbox.balanceMinor) <= 0n) return this.getStatus();
    const result = this.services.repaymentRouter.applyLockboxRevenue({
      lockboxId: this.state.lockbox.lockboxId,
      obligationIds: activeObligations.map((obligation) => obligation.obligationId),
      creditLineId: this.state.creditLine?.creditLineId,
      amountMinor: this.state.lockbox.balanceMinor
    });
    this.state.repayments.push(...result.repayments);
    this.state.lockbox = this.services.lockboxService.getLockbox(this.state.lockbox.lockboxId);
    this.state.creditLine = this.state.creditLine
      ? this.services.riskService.getCreditLine(this.state.creditLine.creditLineId)
      : undefined;
    this.state.obligations = this.services.obligationService.listObligations({ subjectId: agentId });
    return this.getStatus();
  }

  evaluateCreditLearning({ agentId = this.#subjectId(), signals } = {}) {
    this.#requireAgent(agentId);
    const profile = this.services.creditLearningService.getProfile(agentId);
    const limit = this.state.creditLine?.limitMinor ?? profile.currentCreditLimitMinor ?? "0";
    const utilizationBps =
      this.state.creditLine && BigInt(this.state.creditLine.limitMinor) > 0n
        ? Number((BigInt(this.state.creditLine.utilizedMinor) * 10000n) / BigInt(this.state.creditLine.limitMinor))
        : 0;
    const hasFullRepayment = this.state.obligations.some((obligation) => obligation.status === "fully_repaid");
    const hasRejectedSpend = this.state.spendRequests.some((request) => request.status === "rejected");
    const derivedSignals =
      signals ??
      [
        ...(hasFullRepayment ? [CreditLearningSignalType.ON_TIME_REPAYMENT, CreditLearningSignalType.FULL_REPAYMENT] : []),
        ...(BigInt(this.state.lockbox?.capturedRevenueMinor ?? "0") > 0n ? [CreditLearningSignalType.HIGH_REVENUE_CAPTURE] : []),
        ...(utilizationBps <= 5000 ? [CreditLearningSignalType.LOW_UTILIZATION] : [CreditLearningSignalType.HIGH_UTILIZATION]),
        ...(hasRejectedSpend ? [CreditLearningSignalType.REJECTED_RISKY_SPEND] : [])
      ];
    this.state.lastCycle = this.services.creditLearningService.evaluate({
      subjectId: agentId,
      signals: derivedSignals,
      currentCreditLimitMinor: limit,
      currentDemoInterestRateBps: profile.recommendedDemoInterestRateBps,
      repaymentPerformanceBps: hasFullRepayment ? 10000 : 5000,
      utilizationBehaviorBps: utilizationBps,
      revenueConsistencyBps: BigInt(this.state.lockbox?.capturedRevenueMinor ?? "0") > 0n ? 9500 : 0
    });
    return this.getStatus();
  }

  runCycle(cycleType, agentId = this.#subjectId()) {
    this.#requireAgent(agentId);
    const profile = this.services.creditLearningService.getProfile(agentId);
    const context = {
      currentCreditLimitMinor: this.state.creditLine?.limitMinor ?? profile.currentCreditLimitMinor,
      currentDemoInterestRateBps: profile.recommendedDemoInterestRateBps
    };

    if (cycleType === "healthy") {
      if (!this.state.lockbox) this.createLockbox(agentId);
      this.captureRevenue({ agentId, amountMinor: "90000" });
      this.autoRepay({ agentId });
      this.state.lastCycle = this.services.creditLearningService.runHealthyCycle(agentId, context);
    } else if (cycleType === "risky") {
      this.rejectRiskySpend(agentId);
      this.state.lastCycle = this.services.creditLearningService.runRiskyCycle(agentId, context);
    } else if (cycleType === "recovery") {
      this.captureRevenue({ agentId, amountMinor: "40000" });
      this.autoRepay({ agentId });
      this.state.lastCycle = this.services.creditLearningService.runRecoveryCycle(agentId, context);
    }

    return this.getStatus();
  }

  getCreditProfile(agentId = this.#subjectId()) {
    this.#requireAgent(agentId);
    return this.services.creditLearningService.getProfile(agentId);
  }

  getAudit() {
    const audit = this.services.adminService.getAuditLog();
    return {
      ...audit,
      timeline: [...audit.creditEvents.map((event) => ({ kind: "credit", ...event })), ...audit.auditEvents.map((event) => ({ kind: "audit", ...event }))]
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    };
  }

  getStatus(agentId = this.state.subject?.subjectId) {
    let profile;
    if (agentId) {
      try {
        profile = this.services.creditLearningService.getProfile(agentId);
      } catch {
        profile = undefined;
      }
    }
    const exposure = this.services.adminService.getExposure();
    const audit = this.getAudit();
    return {
      safety: {
        noRealLending: true,
        noRealFunds: true,
        noFinancialAdvice: true,
        demoCreditScoreOnly: true,
        demoInterestRateOnly: true
      },
      assetId: MVP_ASSET_ID,
      principal: this.state.principal,
      agent: this.state.subject,
      walletBinding: this.state.walletBinding,
      lockbox: this.state.lockbox,
      providers: this.state.providers.map((provider) => publicProvider(provider, this.state.policiesByProviderId.get(provider.providerId))),
      creditLineDecision: this.state.creditLineResult?.decision,
      creditLine: this.state.creditLine,
      spendRequests: this.state.spendRequests,
      paymentInstructions: this.state.paymentInstructions,
      settlements: this.state.settlements,
      obligations: this.services.obligationService.listObligations(agentId ? { subjectId: agentId } : {}),
      repayments: this.state.repayments,
      creditProfile: profile,
      lastCycle: this.state.lastCycle,
      adminExposure: exposure,
      auditTimeline: audit.timeline
    };
  }

  runVerticalSlice() {
    return runVerticalSlice().summary;
  }

  #ensurePolicies() {
    if (!this.state.subject) return;
    for (const provider of this.state.providers) {
      if (this.state.policiesByProviderId.has(provider.providerId)) continue;
      const policy = this.services.spendPolicyService.createSpendPolicy({
        subjectId: this.state.subject.subjectId,
        providerId: provider.providerId,
        assetId: MVP_ASSET_ID,
        perTxLimitMinor: "100000",
        dailyLimitMinor: "250000",
        obligationCapMinor: "100000",
        category: provider.category
      });
      this.state.policiesByProviderId.set(provider.providerId, policy);
    }
  }

  #subjectId() {
    return this.state.subject?.subjectId;
  }

  #requireAgent(agentId) {
    if (!agentId || !this.state.subject || this.state.subject.subjectId !== agentId) {
      throw new Error("Create a demo Agent first.");
    }
  }
}
