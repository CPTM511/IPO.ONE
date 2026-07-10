import { AccountPurpose, PrincipalType, SubjectType } from "../../../packages/domain/src/index.js";
import { createMvpServices } from "./services.js";

export const MVP_ASSET_ID = "eip155:8453/erc20:usdc";

export function runVerticalSlice() {
  const services = createMvpServices();
  const {
    adminService,
    identityService,
    lockboxService,
    obligationService,
    paymentService,
    repaymentRouter,
    riskService,
    settlementService,
    spendPolicyService
  } = services;

  const principal = identityService.createPrincipal({
    principalType: PrincipalType.DEVELOPER,
    jurisdiction: "US"
  });
  const pendingSubject = identityService.createSubject({
    subjectType: SubjectType.AGENT,
    primaryPrincipalId: principal.principalId,
    displayName: "invoice-agent-alpha"
  });
  const subject = identityService.activateSubject(pendingSubject.subjectId);
  const executionBinding = identityService.bindAccount({
    subjectId: subject.subjectId,
    accountId: "eip155:8453:0x1111111111111111111111111111111111111111",
    signature: "0xagent-signature",
    nonce: "agent-nonce-1",
    purpose: AccountPurpose.EXECUTION
  });
  const lockbox = lockboxService.activateLockbox(
    lockboxService.createLockbox({
      subjectId: subject.subjectId,
      assetId: MVP_ASSET_ID,
      accountId: "eip155:8453:0x2222222222222222222222222222222222222222"
    }).lockboxId
  );
  const provider = spendPolicyService.allowProvider({
    name: "Model API Provider",
    settlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333",
    riskTier: "tier_1"
  });
  const spendPolicy = spendPolicyService.createSpendPolicy({
    subjectId: subject.subjectId,
    providerId: provider.providerId,
    assetId: MVP_ASSET_ID,
    perTxLimitMinor: "100000",
    dailyLimitMinor: "200000",
    obligationCapMinor: "100000",
    category: "model_api"
  });
  const creditLineResult = riskService.requestCreditLine({
    subjectId: subject.subjectId,
    assetId: MVP_ASSET_ID,
    inputs: {
      capturedRevenue30dMinor: "1000000",
      capturedRevenue7dMinor: "400000",
      existingOutstandingMinor: "0",
      repaymentSuccessCount: 0,
      overdueCount: 0,
      allowlistedProviderCount: 1,
      principalStatus: principal.status,
      lockboxStatus: lockbox.status,
      subjectAgeDays: 1,
      providerRiskTier: provider.riskTier,
      revenueCaptureRatioBps: 9500,
      perChainCapRemainingMinor: "1000000",
      providerCapRemainingMinor: "500000"
    }
  });
  const creditLine = creditLineResult.creditLine;
  const spendRequest = spendPolicyService.requestSpend({
    subjectId: subject.subjectId,
    providerId: provider.providerId,
    spendPolicyId: spendPolicy.spendPolicyId,
    assetId: MVP_ASSET_ID,
    amountMinor: "50000",
    purposeCode: "model_api",
    creditAvailableMinor: creditLine.limitMinor
  });
  riskService.reserveUtilization({ creditLineId: creditLine.creditLineId, amountMinor: spendRequest.amountMinor });
  const cashflowRouteId = `route_${lockbox.lockboxId}`;
  const obligation = obligationService.activateObligation(
    obligationService.createObligation({
      subjectId: subject.subjectId,
      principalId: principal.principalId,
      assetId: MVP_ASSET_ID,
      amountMinor: spendRequest.amountMinor,
      dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      spendPolicyId: spendPolicy.spendPolicyId,
      cashflowRouteId,
      nonce: spendRequest.spendRequestId
    }).obligationId
  );
  const paymentInstruction = paymentService.prepareProviderPayment({
    spendRequest,
    providerSettlementAccountId: provider.settlementAccountIdRef
  });
  const settlement = settlementService.settle(
    settlementService.recordSettlement({
      spendRequestId: spendRequest.spendRequestId,
      providerId: provider.providerId,
      assetId: MVP_ASSET_ID,
      amountMinor: spendRequest.amountMinor
    }).settlementId
  );
  const settledSpend = spendPolicyService.settleSpend(spendRequest.spendRequestId);
  const fundedLockbox = lockboxService.captureRevenue({
    lockboxId: lockbox.lockboxId,
    amountMinor: "65000",
    source: "provider_sandbox_revenue"
  });
  const repaymentResult = repaymentRouter.applyLockboxRevenue({
    lockboxId: lockbox.lockboxId,
    obligationIds: [obligation.obligationId],
    creditLineId: creditLine.creditLineId,
    amountMinor: "65000"
  });
  const finalObligation = obligationService.getObligation(obligation.obligationId);
  const finalCreditLine = riskService.getCreditLine(creditLine.creditLineId);
  const adminExposure = adminService.getExposure();
  const adminTimeline = adminService.getSubjectTimeline(subject.subjectId);

  return {
    services,
    summary: {
      principal,
      subject,
      executionBinding,
      lockbox: lockboxService.getLockbox(lockbox.lockboxId),
      provider,
      spendPolicy,
      creditLineDecision: creditLineResult.decision,
      creditLine: finalCreditLine,
      spendRequest: settledSpend,
      obligation: finalObligation,
      paymentInstruction,
      settlement,
      fundedLockbox,
      repaymentResult,
      adminExposure,
      adminTimeline
    }
  };
}

export function runRejectedSpendPath() {
  const { summary } = runVerticalSlice();
  const services = createMvpServices();
  const principal = services.identityService.createPrincipal({ principalType: PrincipalType.DEVELOPER });
  const pending = services.identityService.createSubject({
    subjectType: SubjectType.AGENT,
    primaryPrincipalId: principal.principalId,
    displayName: "reject-agent"
  });
  const subject = services.identityService.activateSubject(pending.subjectId);
  const provider = services.spendPolicyService.allowProvider({
    name: "Allowed Provider",
    settlementAccountId: "eip155:8453:0x4444444444444444444444444444444444444444"
  });
  const policy = services.spendPolicyService.createSpendPolicy({
    subjectId: subject.subjectId,
    providerId: provider.providerId,
    assetId: MVP_ASSET_ID,
    perTxLimitMinor: "100",
    dailyLimitMinor: "100",
    obligationCapMinor: "100"
  });
  const rejected = services.spendPolicyService.requestSpend({
    subjectId: subject.subjectId,
    providerId: "provider_not_allowed",
    spendPolicyId: policy.spendPolicyId,
    assetId: MVP_ASSET_ID,
    amountMinor: "50",
    purposeCode: "model_api",
    creditAvailableMinor: "100"
  });

  return { happyPathEventCount: summary.adminTimeline.length, rejected };
}

export function runOverdueDefaultRepresentation() {
  const { services, summary } = runVerticalSlice();
  const obligation = services.obligationService.createObligation({
    subjectId: summary.subject.subjectId,
    principalId: summary.principal.principalId,
    assetId: MVP_ASSET_ID,
    amountMinor: "1000",
    dueAt: new Date(Date.now() - 86400_000).toISOString(),
    spendPolicyId: summary.spendPolicy.spendPolicyId,
    cashflowRouteId: `route_${summary.lockbox.lockboxId}`,
    nonce: "overdue-default-demo"
  });
  services.obligationService.activateObligation(obligation.obligationId);
  const overdue = services.obligationService.markOverdue(obligation.obligationId);
  const defaulted = services.obligationService.markDefault(obligation.obligationId, {
    dpd: 91,
    reasonCode: "dpd_91"
  });

  return {
    overdue,
    defaulted,
    timeline: services.adminService.getSubjectTimeline(summary.subject.subjectId)
  };
}
