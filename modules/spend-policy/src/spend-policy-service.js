import {
  CreditEventType,
  ProviderStatus,
  SpendPolicyStatus,
  SpendRequestStatus,
  SpendRequestTransitions,
  assertCAIP10,
  assertPositiveMinorUnits,
  assertTransition,
  createCreditEvent,
  createProvider,
  createSpendPolicy,
  createSpendRequest
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class SpendPolicyService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
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

  requestSpend({ subjectId, providerId, spendPolicyId, assetId, amountMinor, purposeCode, creditAvailableMinor }) {
    const request = createSpendRequest({ subjectId, providerId, spendPolicyId, assetId, amountMinor, purposeCode });
    const provider = this.providers.get(providerId);
    const policy = this.policies.get(spendPolicyId);
    const amount = assertPositiveMinorUnits(amountMinor);
    let rejectionReason;

    if (!provider || provider.status !== ProviderStatus.ALLOWLISTED) {
      rejectionReason = "provider_not_allowlisted";
    } else if (!policy || policy.status !== SpendPolicyStatus.ACTIVE) {
      rejectionReason = "policy_not_active";
    } else if (policy.subjectId !== subjectId || policy.providerId !== providerId || policy.assetId !== assetId) {
      rejectionReason = "policy_scope_mismatch";
    } else if (amount > BigInt(policy.perTxLimitMinor)) {
      rejectionReason = "per_tx_limit_exceeded";
    } else if (amount + BigInt(policy.dailySpentMinor) > BigInt(policy.dailyLimitMinor)) {
      rejectionReason = "daily_limit_exceeded";
    } else if (amount > BigInt(policy.obligationCapMinor)) {
      rejectionReason = "obligation_cap_exceeded";
    } else if (amount > BigInt(creditAvailableMinor)) {
      rejectionReason = "credit_available_exceeded";
    }

    const nextStatus = rejectionReason ? SpendRequestStatus.REJECTED : SpendRequestStatus.APPROVED;
    assertTransition("spend_request", SpendRequestTransitions, request.status, nextStatus);
    request.status = nextStatus;
    request.rejectionReason = rejectionReason;
    request.updatedAt = new Date().toISOString();

    if (!rejectionReason) {
      policy.dailySpentMinor = (BigInt(policy.dailySpentMinor) + amount).toString();
    }

    this.spendRequests.set(request.spendRequestId, request);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: rejectionReason ? CreditEventType.SPEND_REJECTED : CreditEventType.SPEND_APPROVED,
        subjectId,
        payload: {
          spendRequestId: request.spendRequestId,
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
