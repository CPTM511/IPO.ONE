import {
  CreditEventType,
  DomainError,
  MandateCapability,
  MandateStatus,
  ProviderStatus,
  SpendPolicyStatus,
  SpendRequestStatus,
  admitMeteredUsageEvidence,
  createCreditEvent,
  createMeteredUsageEvidence,
  createMeteredUsageLedgerPosting,
  createMeteredUsagePolicy,
  hashId
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const EVIDENCE_KEYS = Object.freeze([
  "usageEvidenceId", "providerEventId", "nonce", "tenantId", "subjectId",
  "correctionOfUsageEvidenceId",
  "principalId", "mandateId", "facilityId", "authorizationId", "obligationId",
  "providerId", "resourceClass", "measurementUnit", "quantity",
  "priceScheduleHash", "unitPriceMinor", "chargeMinor", "assetId",
  "windowStartedAt", "windowEndedAt", "observedAt", "finality",
  "reconciliation", "providerKeyId", "providerPayloadHash", "usageEvidenceHash",
  "sandboxOnly", "productionFundsMoved", "schemaVersion"
]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function closed(value, keys) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) unavailable();
  return value;
}

function normalizePayload(payload) {
  const value = closed(payload, ["evidence", "expectedPolicyHash", "providerSignature"]);
  if (!/^0x[0-9a-f]{64}$/.test(value.expectedPolicyHash ?? "")) unavailable();
  if (typeof value.providerSignature !== "string" || value.providerSignature.length < 16 || value.providerSignature.length > 2048) {
    unavailable();
  }
  const suppliedEvidence = closed(value.evidence, EVIDENCE_KEYS);
  const evidence = createMeteredUsageEvidence(suppliedEvidence);
  if (
    suppliedEvidence.usageEvidenceHash !== evidence.usageEvidenceHash ||
    suppliedEvidence.sandboxOnly !== true || suppliedEvidence.productionFundsMoved !== false ||
    suppliedEvidence.schemaVersion !== "metered_usage_evidence.v1"
  ) unavailable();
  return {
    evidence,
    expectedPolicyHash: value.expectedPolicyHash,
    providerSignature: value.providerSignature
  };
}

async function projection(client, coreRepository, type, id) {
  const state = await coreRepository.getProjectionStateInTransaction(client, type, id, { lock: true });
  if (!state?.value) unavailable();
  return state;
}

function assertExactAuthority({
  context,
  expectedPolicyHash,
  evidence,
  policy,
  obligation,
  mandate,
  lockbox,
  spendPolicy,
  provider
}) {
  const authentication = context.authenticationContext;
  const authorization = context.authorizationDecision;
  if (
    authentication?.actorType !== ActorType.SYSTEM_WORKER ||
    authorization?.resourceType !== "obligation" ||
    authorization.resourceId !== evidence.obligationId ||
    authentication.tenantId !== evidence.tenantId ||
    policy.tenantId !== authentication.tenantId ||
    policy.policyHash !== expectedPolicyHash
  ) unavailable();
  if (
    obligation.schemaVersion !== "obligation.v2" ||
    obligation.obligationId !== evidence.obligationId ||
    obligation.subjectId !== evidence.subjectId ||
    obligation.principalId !== evidence.principalId ||
    obligation.mandateId !== evidence.mandateId ||
    obligation.creditOfferAcceptanceId !== evidence.authorizationId ||
    obligation.assetId !== evidence.assetId ||
    obligation.executionStatus !== "executed" || obligation.status !== "active" ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    obligation.withdrawable !== false
  ) unavailable();
  if (
    mandate.schemaVersion !== "mandate.v3" || mandate.status !== MandateStatus.ACTIVE ||
    mandate.mandateId !== evidence.mandateId || mandate.subjectId !== evidence.subjectId ||
    mandate.principalId !== evidence.principalId || mandate.sandboxOnly !== true ||
    mandate.productionAuthority !== false || !mandate.capabilities.includes(MandateCapability.PROVIDER_SPEND) ||
    !mandate.allowedProviderIds.includes(evidence.providerId) ||
    !mandate.assetIds.includes(evidence.assetId) ||
    new Date(mandate.validFrom) > context.now || new Date(mandate.expiresAt) <= context.now ||
    BigInt(evidence.chargeMinor) > BigInt(mandate.perActionLimitMinor) ||
    BigInt(mandate.utilizedMinor) + BigInt(evidence.chargeMinor) > BigInt(mandate.aggregateLimitMinor)
  ) unavailable();
  if (
    lockbox.schemaVersion !== "lockbox.v2" || lockbox.status !== "active" ||
    lockbox.obligationId !== evidence.obligationId || lockbox.subjectId !== evidence.subjectId ||
    lockbox.principalId !== evidence.principalId || lockbox.mandateId !== evidence.mandateId ||
    lockbox.creditLineId !== evidence.facilityId || lockbox.assetId !== evidence.assetId ||
    lockbox.sandboxOnly !== true || lockbox.productionFundsMoved !== false ||
    lockbox.withdrawable !== false || !lockbox.allowedProviderIds.includes(evidence.providerId)
  ) unavailable();
  if (
    spendPolicy.schemaVersion !== "spend_policy.v1" || spendPolicy.status !== SpendPolicyStatus.ACTIVE ||
    spendPolicy.spendPolicyId !== policy.policyId || spendPolicy.subjectId !== evidence.subjectId ||
    spendPolicy.providerId !== evidence.providerId || spendPolicy.assetId !== evidence.assetId ||
    BigInt(evidence.chargeMinor) > BigInt(spendPolicy.perTxLimitMinor) ||
    BigInt(evidence.chargeMinor) > BigInt(spendPolicy.obligationCapMinor)
  ) unavailable();
  if (
    provider.schemaVersion !== "provider.v1" || provider.status !== ProviderStatus.ALLOWLISTED ||
    provider.providerId !== evidence.providerId
  ) unavailable();
}

export function admitMeteredUsageCommandHandler({
  meteredUsagePolicyResolver = async () => undefined,
  meteredUsageSignatureVerifier = async () => false
} = {}) {
  if (typeof meteredUsagePolicyResolver !== "function" || typeof meteredUsageSignatureVerifier !== "function") {
    throw new DomainError("invalid_metered_usage_handler", "Metered Usage dependencies are invalid");
  }
  return Object.freeze({
    operationId: "workerAdmitMeteredUsage",
    kind: "command",
    async preflight({ payload }) {
      const input = normalizePayload(payload);
      if (!await meteredUsageSignatureVerifier({
        evidence: input.evidence,
        providerSignature: input.providerSignature
      })) {
        throw new DomainError("metered_usage_signature_rejected", "Metered Usage signature is unavailable");
      }
    },
    async plan(context) {
      const input = normalizePayload(context.payload);
      const evidence = input.evidence;
      const policyValue = await meteredUsagePolicyResolver({
        tenantId: context.authenticationContext.tenantId,
        providerId: evidence.providerId,
        evidence: structuredClone(evidence),
        now: context.now
      });
      if (!policyValue) unavailable();
      const policy = createMeteredUsagePolicy(policyValue);

      const identities = await context.coreRepository.findMeteredUsageEvidenceIdentityInTransaction(
        context.client,
        {
          usageEvidenceId: evidence.usageEvidenceId,
          providerId: evidence.providerId,
          providerEventId: evidence.providerEventId,
          nonceHash: hashId("metered_usage_nonce", evidence.nonce)
        },
        { lock: true }
      );
      if (identities.length > 0) {
        throw new DomainError("metered_usage_replay_conflict", "Metered Usage identity was already consumed");
      }

      const obligationState = await projection(
        context.client,
        context.coreRepository,
        CoreProjectionType.OBLIGATION,
        evidence.obligationId
      );
      const obligation = obligationState.value;
      const mandate = (await projection(
        context.client,
        context.coreRepository,
        CoreProjectionType.MANDATE,
        evidence.mandateId
      )).value;
      const lockbox = await context.coreRepository.findAgentLockboxByObligationInTransaction(
        context.client,
        evidence.obligationId,
        { lock: true }
      );
      if (!lockbox) unavailable();
      const spendPolicy = (await projection(
        context.client,
        context.coreRepository,
        CoreProjectionType.SPEND_POLICY,
        policy.policyId
      )).value;
      const provider = (await projection(
        context.client,
        context.coreRepository,
        CoreProjectionType.PROVIDER,
        evidence.providerId
      )).value;
      assertExactAuthority({
        context,
        expectedPolicyHash: input.expectedPolicyHash,
        evidence,
        policy,
        obligation,
        mandate,
        lockbox,
        spendPolicy,
        provider
      });

      const windowChargeBeforeMinor = await context.coreRepository.getMeteredUsageWindowChargeInTransaction(
        context.client,
        {
          policyId: policy.policyId,
          windowStartedAt: evidence.windowStartedAt,
          windowEndedAt: evidence.windowEndedAt
        }
      );
      let priorEvidence;
      let priorAdmission;
      let priorReservation;
      if (evidence.correctionOfUsageEvidenceId !== null) {
        const existingCorrection = await context.coreRepository.getMeteredUsageCorrectionByPriorEvidenceInTransaction(
          context.client,
          evidence.correctionOfUsageEvidenceId,
          { lock: true }
        );
        if (existingCorrection) {
          throw new DomainError("metered_usage_replay_conflict", "Metered Usage correction source was already consumed");
        }
        priorEvidence = await context.coreRepository.getMeteredUsageEvidence(
          evidence.correctionOfUsageEvidenceId
        );
        priorAdmission = await context.coreRepository.getMeteredUsageAdmissionByEvidenceInTransaction(
          context.client,
          evidence.correctionOfUsageEvidenceId,
          { lock: true }
        );
        if (priorAdmission) {
          priorReservation = await context.coreRepository.getMandateReservation(
            `metered_reservation_${priorAdmission.admissionHash.slice(2)}`
          );
        }
      }
      const admission = admitMeteredUsageEvidence({
        policy,
        evidence,
        priorEvidence,
        priorAdmission,
        windowChargeBeforeMinor,
        admittedAt: context.now.toISOString()
      });
      const ledgerDraft = createMeteredUsageLedgerPosting({
        obligation,
        admission,
        now: context.now.toISOString()
      });
      const ledger = {
        ...ledgerDraft,
        accounts: await Promise.all(ledgerDraft.accounts.map(async (account) => (
          await context.coreRepository.getLedgerAccount(account.ledgerAccountId) ?? account
        )))
      };
      const chargeDelta = BigInt(admission.chargeDeltaMinor);
      const reservation = chargeDelta > 0n ? {
        reservationId: `metered_reservation_${admission.admissionHash.slice(2)}`,
        reservationHash: hashId("mandate_reservation", {
          mandateId: mandate.mandateId,
          reservationId: `metered_reservation_${admission.admissionHash.slice(2)}`,
          subjectId: evidence.subjectId,
          capability: MandateCapability.PROVIDER_SPEND,
          providerId: evidence.providerId,
          category: spendPolicy.category,
          assetId: evidence.assetId,
          amountMinor: admission.chargeDeltaMinor
        }),
        mandateId: mandate.mandateId,
        subjectId: evidence.subjectId,
        capability: MandateCapability.PROVIDER_SPEND,
        providerId: evidence.providerId,
        category: spendPolicy.category,
        assetId: evidence.assetId,
        amountMinor: admission.chargeDeltaMinor,
        releasedMinor: "0",
        createdAt: context.now.toISOString(),
        schemaVersion: "mandate_reservation.v1"
      } : undefined;
      let correctedReservation;
      let correctionRelease;
      if (chargeDelta < 0n) {
        const releaseMinor = -chargeDelta;
        if (
          !priorReservation || priorReservation.mandateId !== mandate.mandateId ||
          BigInt(priorReservation.releasedMinor) + releaseMinor > BigInt(priorReservation.amountMinor)
        ) unavailable();
        correctedReservation = {
          ...priorReservation,
          releasedMinor: (BigInt(priorReservation.releasedMinor) + releaseMinor).toString()
        };
        const releaseBody = {
          mandateId: mandate.mandateId,
          reservationId: priorReservation.reservationId,
          amountMinor: releaseMinor.toString(),
          reason: "metered_usage_correction",
          createdAt: context.now.toISOString(),
          schemaVersion: "mandate_release.v1"
        };
        const releaseHash = hashId("mandate_release", releaseBody);
        correctionRelease = {
          releaseId: `metered_release_${releaseHash.slice(2)}`,
          releaseHash,
          ...releaseBody
        };
      }
      const nextMandateUtilized = BigInt(mandate.utilizedMinor) + chargeDelta;
      if (nextMandateUtilized < 0n) unavailable();
      const nextMandate = {
        ...mandate,
        utilizedMinor: nextMandateUtilized.toString(),
        updatedAt: context.now.toISOString()
      };
      const dailySpentBefore = spendPolicy.dailySpentDate === context.now.toISOString().slice(0, 10)
        ? BigInt(spendPolicy.dailySpentMinor)
        : 0n;
      const dailySpentAfter = dailySpentBefore + chargeDelta;
      if (dailySpentAfter < 0n || dailySpentAfter > BigInt(spendPolicy.dailyLimitMinor)) unavailable();
      const nextSpendPolicy = {
        ...spendPolicy,
        dailySpentMinor: dailySpentAfter.toString(),
        dailySpentDate: context.now.toISOString().slice(0, 10),
        updatedAt: context.now.toISOString()
      };
      const spendRequest = chargeDelta > 0n ? {
        spendRequestId: `metered_spend_${admission.admissionHash.slice(2)}`,
        subjectId: evidence.subjectId,
        mandateId: evidence.mandateId,
        providerId: evidence.providerId,
        spendPolicyId: policy.policyId,
        assetId: evidence.assetId,
        amountMinor: admission.chargeDeltaMinor,
        purposeCode: spendPolicy.category,
        status: SpendRequestStatus.SETTLED,
        createdAt: context.now.toISOString(),
        updatedAt: context.now.toISOString(),
        schemaVersion: "spend_request.v1"
      } : undefined;
      const event = createCreditEvent({
        eventType: evidence.correctionOfUsageEvidenceId === null
          ? CreditEventType.METERED_USAGE_ADMITTED
          : CreditEventType.METERED_USAGE_CORRECTED,
        subjectId: evidence.subjectId,
        obligationId: evidence.obligationId,
        payload: {
          usageEvidenceId: evidence.usageEvidenceId,
          usageEvidenceHash: evidence.usageEvidenceHash,
          correctionOfUsageEvidenceId: evidence.correctionOfUsageEvidenceId,
          meteredUsageAdmissionId: admission.meteredUsageAdmissionId,
          admissionHash: admission.admissionHash,
          obligationId: evidence.obligationId,
          providerId: evidence.providerId,
          resourceClass: evidence.resourceClass,
          measurementUnit: evidence.measurementUnit,
          quantity: evidence.quantity,
          chargeMinor: evidence.chargeMinor,
          chargeDeltaMinor: admission.chargeDeltaMinor,
          assetId: evidence.assetId,
          policyHash: admission.policyHash,
          ledgerTransactionId: ledger.transaction.ledgerTransactionId,
          actorId: context.authenticationContext.actorId,
          causationId: context.requestId,
          correlationId: context.correlationId,
          sandboxOnly: true,
          productionFundsMoved: false
        },
        now: context.now
      });
      return {
        aggregateType: "obligation",
        aggregateId: evidence.obligationId,
        events: [{
          aggregateType: "obligation",
          aggregateId: evidence.obligationId,
          expectedVersion: obligationState.aggregateVersion,
          event
        }],
        writes: [
          { type: CoreProjectionType.OBLIGATION, value: obligation, eventId: event.eventId },
          { type: CoreProjectionType.METERED_USAGE_EVIDENCE, value: evidence, eventId: event.eventId },
          { type: CoreProjectionType.METERED_USAGE_ADMISSION, value: admission, eventId: event.eventId },
          ...(reservation
            ? [{ type: CoreProjectionType.MANDATE_RESERVATION, value: reservation, eventId: event.eventId }]
            : []),
          ...(correctedReservation
            ? [{ type: CoreProjectionType.MANDATE_RESERVATION, value: correctedReservation, eventId: event.eventId }]
            : []),
          ...(correctionRelease
            ? [{ type: CoreProjectionType.MANDATE_RELEASE, value: correctionRelease, eventId: event.eventId }]
            : []),
          { type: CoreProjectionType.MANDATE, value: nextMandate, eventId: event.eventId },
          { type: CoreProjectionType.SPEND_POLICY, value: nextSpendPolicy, eventId: event.eventId },
          ...(spendRequest
            ? [{ type: CoreProjectionType.SPEND_REQUEST, value: spendRequest, eventId: event.eventId }]
            : []),
          ...ledger.accounts.map((value) => ({ type: CoreProjectionType.LEDGER_ACCOUNT, value, eventId: event.eventId })),
          { type: CoreProjectionType.LEDGER_TRANSACTION, value: ledger.transaction, eventId: event.eventId }
        ],
        response: {
          evidence: structuredClone(evidence),
          admission: structuredClone(admission),
          spendRequestId: spendRequest?.spendRequestId ?? null,
          ledgerTransactionId: ledger.transaction.ledgerTransactionId,
          obligationId: evidence.obligationId,
          facilityId: evidence.facilityId,
          nextAction: "review_metered_usage_receipt",
          sandboxOnly: true,
          productionFundsMoved: false,
          schemaVersion: "tenant_metered_usage_admitted.v1"
        }
      };
    }
  });
}

export function createMeteredUsageHandlers(options) {
  return Object.freeze([admitMeteredUsageCommandHandler(options)]);
}
