import {
  CreditEventType,
  DomainError,
  MandateCapability,
  ProviderStatus,
  SpendPolicyStatus,
  SpendRequestStatus,
  SpendRequestTransitions,
  assertCAIP10,
  assertNonEmptyString,
  assertNonNegativeMinorUnits,
  assertPositiveMinorUnits,
  assertTransition,
  createCreditEvent,
  createProvider,
  createSpendPolicy,
  createSpendRequest
} from "../../../packages/domain/src/index.js";

export class SpendPolicyService {
  constructor({ eventStore, authorizationService }) {
    this.eventStore = eventStore;
    this.authorizationService = authorizationService;
    this.providers = new Map();
    this.policies = new Map();
    this.spendRequests = new Map();
  }

  allowProvider(input) {
    assertCAIP10(input.settlementAccountId);
    const provider = createProvider(input);
    this.providers.set(provider.providerId, provider);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.PROVIDER_ALLOWLISTED,
        payload: {
          providerId: provider.providerId,
          providerHash: provider.providerHash,
          riskTier: provider.riskTier
        }
      })
    );
    return structuredClone(provider);
  }

  createSpendPolicy(input) {
    const provider = this.#requireProvider(input.providerId);
    if (provider.status !== ProviderStatus.ALLOWLISTED) {
      throw new DomainError("provider_not_allowlisted", "spend policy requires allowlisted provider", {
        providerId: input.providerId
      });
    }
    assertPositiveMinorUnits(input.perTxLimitMinor, "perTxLimitMinor");
    assertPositiveMinorUnits(input.dailyLimitMinor, "dailyLimitMinor");
    assertPositiveMinorUnits(input.obligationCapMinor, "obligationCapMinor");
    if (BigInt(input.perTxLimitMinor) > BigInt(input.dailyLimitMinor)) {
      throw new DomainError("invalid_spend_policy_limits", "per transaction limit cannot exceed daily limit");
    }
    const policy = createSpendPolicy(input);
    this.policies.set(policy.spendPolicyId, policy);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SPEND_POLICY_CREATED,
        subjectId: policy.subjectId,
        payload: {
          spendPolicyId: policy.spendPolicyId,
          providerId: policy.providerId,
          assetId: policy.assetId,
          policyHash: policy.spendPolicyHash
        }
      })
    );
    return structuredClone(policy);
  }

  requestSpend({ mandateId, subjectId, providerId, spendPolicyId, assetId, amountMinor, purposeCode, creditAvailableMinor }) {
    const request = createSpendRequest({ mandateId, subjectId, providerId, spendPolicyId, assetId, amountMinor, purposeCode });
    const provider = this.providers.get(providerId);
    const policy = this.policies.get(spendPolicyId);
    const amount = assertPositiveMinorUnits(amountMinor);
    const creditAvailable = assertNonNegativeMinorUnits(creditAvailableMinor, "creditAvailableMinor");
    assertNonEmptyString("purposeCode", purposeCode);
    let rejectionReason;

    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SPEND_REQUESTED,
        subjectId,
        payload: {
          spendRequestId: request.spendRequestId,
          mandateId,
          providerId,
          spendPolicyId,
          assetId,
          amountMinor: amount.toString(),
          purposeCode
        }
      })
    );

    const today = new Date().toISOString().slice(0, 10);
    if (policy && policy.dailySpentDate !== today) {
      policy.dailySpentMinor = "0";
      policy.dailySpentDate = today;
    }

    if (!provider || provider.status !== ProviderStatus.ALLOWLISTED) {
      rejectionReason = "provider_not_allowlisted";
    } else if (!policy || policy.status !== SpendPolicyStatus.ACTIVE) {
      rejectionReason = "policy_not_active";
    } else if (policy.subjectId !== subjectId || policy.providerId !== providerId || policy.assetId !== assetId) {
      rejectionReason = "policy_scope_mismatch";
    } else if (policy.category !== purposeCode) {
      rejectionReason = "purpose_not_allowed";
    } else if (!this.authorizationService) {
      rejectionReason = "authorization_unavailable";
    } else {
      try {
        this.authorizationService.assertAuthorized({
          mandateId,
          subjectId,
          capability: MandateCapability.PROVIDER_SPEND,
          providerId,
          category: purposeCode,
          assetId,
          amountMinor
        });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        rejectionReason = error.code;
      }
    }

    if (!rejectionReason && amount > BigInt(policy.perTxLimitMinor)) {
      rejectionReason = "per_tx_limit_exceeded";
    } else if (!rejectionReason && amount + BigInt(policy.dailySpentMinor) > BigInt(policy.dailyLimitMinor)) {
      rejectionReason = "daily_limit_exceeded";
    } else if (!rejectionReason && amount > BigInt(policy.obligationCapMinor)) {
      rejectionReason = "obligation_cap_exceeded";
    } else if (!rejectionReason && amount > creditAvailable) {
      rejectionReason = "credit_available_exceeded";
    }

    const nextStatus = rejectionReason ? SpendRequestStatus.REJECTED : SpendRequestStatus.APPROVED;
    assertTransition("spend_request", SpendRequestTransitions, request.status, nextStatus);
    request.status = nextStatus;
    request.rejectionReason = rejectionReason;
    request.updatedAt = new Date().toISOString();

    if (!rejectionReason) {
      this.authorizationService.reserveUtilization({
        mandateId,
        reservationId: request.spendRequestId,
        subjectId,
        capability: MandateCapability.PROVIDER_SPEND,
        providerId,
        category: purposeCode,
        assetId,
        amountMinor
      });
      policy.dailySpentMinor = (BigInt(policy.dailySpentMinor) + amount).toString();
    }

    this.spendRequests.set(request.spendRequestId, request);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: rejectionReason ? CreditEventType.SPEND_REJECTED : CreditEventType.SPEND_APPROVED,
        subjectId,
        payload: {
          spendRequestId: request.spendRequestId,
          mandateId,
          providerId,
          spendPolicyId,
          assetId,
          amountMinor,
          rejectionReason
        }
      })
    );
    return structuredClone(request);
  }

  settleSpend(spendRequestId) {
    const request = this.#requireSpendRequest(spendRequestId);
    assertTransition("spend_request", SpendRequestTransitions, request.status, SpendRequestStatus.SETTLED);
    request.status = SpendRequestStatus.SETTLED;
    request.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SPEND_SETTLED,
        subjectId: request.subjectId,
        payload: { spendRequestId, providerId: request.providerId, amountMinor: request.amountMinor }
      })
    );
    return structuredClone(request);
  }

  getProvider(providerId) {
    return structuredClone(this.#requireProvider(providerId));
  }

  getSpendPolicy(spendPolicyId) {
    const policy = this.policies.get(spendPolicyId);
    if (!policy) throw new DomainError("spend_policy_not_found", "spend policy not found", { spendPolicyId });
    return structuredClone(policy);
  }

  getSpendRequest(spendRequestId) {
    return structuredClone(this.#requireSpendRequest(spendRequestId));
  }

  #requireProvider(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new DomainError("provider_not_found", "provider not found", { providerId });
    return provider;
  }

  #requireSpendRequest(spendRequestId) {
    const request = this.spendRequests.get(spendRequestId);
    if (!request) throw new DomainError("spend_request_not_found", "spend request not found", { spendRequestId });
    return request;
  }
}
