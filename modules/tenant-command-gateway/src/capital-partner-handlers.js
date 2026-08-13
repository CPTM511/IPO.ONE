import {
  CreditEventType,
  CreditOfferStatus,
  DomainError,
  createCapitalPartnerCreditOffer,
  createCapitalPartnerPortfolio,
  createCreditEvent,
  createFacilityView,
  hashId,
  transitionCapitalPartnerCreditOffer,
  verifyCreditPassportArtifact
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const AUTHOR_KEYS = new Set([
  "creditIntentId",
  "artifactHash",
  "artifactVersion",
  "underwritingSnapshotHash",
  "assetId",
  "facilityLimitMinor",
  "approvedPrincipalMinor",
  "perDrawCapMinor",
  "annualRateBps",
  "originationFeeMinor",
  "repaymentFrequency",
  "installmentCount",
  "firstPaymentAt",
  "maturityAt",
  "permittedPurposeCode",
  "conditions",
  "undrawnRevocationRule",
  "validUntil",
  "reasonCodes",
  "disclosureRef",
  "schemaVersion"
]);
const TRANSITION_KEYS = new Set(["nextStatus", "supersedingOfferId", "schemaVersion"]);
const MANAGEABLE_STATUS_SET = new Set([
  CreditOfferStatus.WITHDRAWN,
  CreditOfferStatus.EXPIRED,
  CreditOfferStatus.SUPERSEDED
]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function exactObject(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.size &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function normalizeAuthorPayload(payload) {
  if (
    !exactObject(payload, AUTHOR_KEYS) ||
    payload.schemaVersion !== "capital_partner_offer_authoring.v1" ||
    typeof payload.creditIntentId !== "string" ||
    !IDENTIFIER_PATTERN.test(payload.creditIntentId) ||
    typeof payload.artifactHash !== "string" ||
    !HASH_PATTERN.test(payload.artifactHash) ||
    !Number.isSafeInteger(payload.artifactVersion) ||
    payload.artifactVersion < 1 ||
    typeof payload.underwritingSnapshotHash !== "string" ||
    !HASH_PATTERN.test(payload.underwritingSnapshotHash)
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Capital Partner Offer authoring payload is invalid"
    );
  }
  return structuredClone(payload);
}

function normalizeTransitionPayload(payload) {
  if (
    !exactObject(payload, TRANSITION_KEYS) ||
    payload.schemaVersion !== "capital_partner_offer_transition.v1" ||
    !MANAGEABLE_STATUS_SET.has(payload.nextStatus) ||
    (
      payload.nextStatus === CreditOfferStatus.SUPERSEDED
        ? (
            typeof payload.supersedingOfferId !== "string" ||
            !IDENTIFIER_PATTERN.test(payload.supersedingOfferId)
          )
        : payload.supersedingOfferId !== null
    )
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Capital Partner Offer transition payload is invalid"
    );
  }
  return structuredClone(payload);
}

function normalizeEmptyPayload(payload) {
  if (!exactObject(payload, new Set())) unavailable();
}

function hmacRef(referenceHasher, namespace, value) {
  if (typeof referenceHasher?.hash !== "function") {
    throw new DomainError(
      "invalid_tenant_command_handler",
      "Capital Partner reference hashing is unavailable"
    );
  }
  return `0x${Buffer.from(referenceHasher.hash(namespace, value), "base64url").toString("hex")}`;
}

function offerView(offer) {
  return structuredClone(offer);
}

async function loadProfile(coreRepository, client, authenticationContext, { lock = false } = {}) {
  const profile = await coreRepository.getCapitalPartnerProfileByOperatorInTransaction(
    client,
    authenticationContext.actorId,
    { lock }
  );
  if (
    !profile ||
    profile.operatorActorId !== authenticationContext.actorId ||
    profile.tenantId !== authenticationContext.tenantId ||
    profile.status !== "active" ||
    profile.invitationOnly !== true ||
    profile.sameTenantOnly !== true ||
    profile.sandboxOnly !== true ||
    profile.productionFundsAuthority !== false ||
    profile.schemaVersion !== "capital_partner_profile.v1"
  ) unavailable();
  return profile;
}

export async function loadPassport({
  client,
  coreRepository,
  artifactId,
  artifactHash,
  artifactVersion,
  operatorActorId,
  referenceHasher,
  now,
  lock
}) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
    artifactId,
    { lock }
  );
  const artifact = state?.value;
  if (
    !artifact ||
    artifact.creditPassportArtifactId !== artifactId ||
    artifact.verifierActorRefHash !== hmacRef(
      referenceHasher,
      "credit_passport.verifier_actor",
      operatorActorId
    ) ||
    artifact.purpose !== "private_credit_review" ||
    artifact.sameTenantOnly !== true ||
    artifact.sandboxOnly !== true ||
    artifact.productionAuthority !== false
  ) unavailable();
  const sourceDecision = await coreRepository.getProjectionInTransaction(
    client,
    CoreProjectionType.RISK_DECISION,
    artifact.sourceRiskDecisionId,
    { lock: false }
  );
  const verification = verifyCreditPassportArtifact({
    artifact,
    presentedArtifactHash: artifactHash,
    presentedVersion: artifactVersion,
    sourceDecision,
    now
  });
  if (!verification.verified) {
    throw new DomainError(
      "capital_partner_passport_not_current",
      "Credit Passport is expired, revoked, superseded, or no longer current"
    );
  }
  return { state, artifact, sourceDecision, verification };
}

async function borrowerBindings({ directory, subjectId, authorityType, now }) {
  const bindings = await directory.listActiveResourceBindings({
    resourceType: "subject",
    resourceId: subjectId,
    now
  });
  const borrower = bindings.find((binding) => (
    authorityType === "consent"
      ? binding.actorType === ActorType.HUMAN &&
        new Set(["owner", "controller"]).has(binding.relationship)
      : binding.actorType === ActorType.AGENT && binding.relationship === "subject"
  ));
  if (!borrower) unavailable();
  return {
    actorId: borrower.actorId,
    actorType: borrower.actorType,
    relationship: "owner"
  };
}

export function authorCapitalPartnerOfferCommandHandler() {
  return Object.freeze({
    operationId: "pilotAuthorCapitalPartnerOffer",
    kind: "command",
    preflight({ payload }) {
      normalizeAuthorPayload(payload);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      referenceHasher,
      payload,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeAuthorPayload(payload);
      if (
        authorizationDecision.resourceType !== "credit_passport_artifact" ||
        authenticationContext.actorType !== ActorType.HUMAN
      ) unavailable();
      const profile = await loadProfile(coreRepository, client, authenticationContext);
      const {
        artifact,
        sourceDecision,
        verification
      } = await loadPassport({
        client,
        coreRepository,
        artifactId: authorizationDecision.resourceId,
        artifactHash: input.artifactHash,
        artifactVersion: input.artifactVersion,
        operatorActorId: authenticationContext.actorId,
        referenceHasher,
        now,
        lock: true
      });
      const intentState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CREDIT_INTENT,
        input.creditIntentId,
        { lock: true }
      );
      const creditIntent = intentState?.value;
      if (
        !creditIntent ||
        creditIntent.creditIntentId !== input.creditIntentId ||
        creditIntent.status !== "decided" ||
        creditIntent.subjectId !== artifact.subjectId ||
        sourceDecision.creditIntentId !== creditIntent.creditIntentId
      ) unavailable();
      const authored = await coreRepository.listCapitalPartnerOffersInTransaction(
        client,
        profile.capitalPartnerId,
        { limit: 200, lock: true }
      );
      if (authored.hasMore) {
        throw new DomainError(
          "capital_partner_portfolio_capacity_exceeded",
          "Capital Partner Offer inventory exceeds the private-pilot bound"
        );
      }
      if (authored.items.some((offer) => (
        offer.creditIntentId === creditIntent.creditIntentId &&
        offer.status === CreditOfferStatus.OFFERED
      ))) {
        throw new DomainError(
          "capital_partner_offer_conflict",
          "Credit Intent already has an active Capital Partner Offer"
        );
      }
      const preliminaryOffer =
        await coreRepository.findCreditOfferByIntentInTransaction(
          client,
          creditIntent.creditIntentId,
          { lock: true }
        );
      const preliminaryOfferState = preliminaryOffer?.schemaVersion === "credit_offer.v1"
        ? await coreRepository.getProjectionStateInTransaction(
            client,
            CoreProjectionType.CREDIT_OFFER,
            preliminaryOffer.creditOfferId,
            { lock: true }
          )
        : undefined;
      if (
        preliminaryOffer &&
        (
          preliminaryOffer.schemaVersion !== "credit_offer.v1" ||
          preliminaryOffer.status !== CreditOfferStatus.OFFERED ||
          !preliminaryOfferState
        )
      ) {
        throw new DomainError(
          "capital_partner_offer_conflict",
          "Credit Intent does not have one replaceable preliminary Offer"
        );
      }
      const offer = createCapitalPartnerCreditOffer({
        creditIntent,
        decision: sourceDecision,
        passportArtifact: artifact,
        passportVerification: verification,
        capitalPartnerId: profile.capitalPartnerId,
        capitalPartnerOperatorId: profile.operatorActorId,
        underwritingSnapshotHash: input.underwritingSnapshotHash,
        assetId: input.assetId,
        facilityLimitMinor: input.facilityLimitMinor,
        approvedPrincipalMinor: input.approvedPrincipalMinor,
        perDrawCapMinor: input.perDrawCapMinor,
        annualRateBps: input.annualRateBps,
        originationFeeMinor: input.originationFeeMinor,
        repaymentFrequency: input.repaymentFrequency,
        installmentCount: input.installmentCount,
        firstPaymentAt: input.firstPaymentAt,
        maturityAt: input.maturityAt,
        permittedPurposeCode: input.permittedPurposeCode,
        conditions: input.conditions,
        undrawnRevocationRule: input.undrawnRevocationRule,
        validUntil: input.validUntil,
        reasonCodes: input.reasonCodes,
        disclosureRef: input.disclosureRef,
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.CREDIT_OFFER_CREATED,
        subjectId: creditIntent.subjectId,
        payload: {
          creditOfferId: offer.creditOfferId,
          creditOfferHash: offer.creditOfferHash,
          termsHash: offer.termsHash,
          creditIntentId: offer.creditIntentId,
          riskDecisionId: offer.riskDecisionId,
          capitalPartnerRefHash: hashId("capital_partner", offer.capitalPartnerId),
          operatorRefHash: hashId("actor", offer.capitalPartnerOperatorId),
          creditPassportArtifactHash: offer.creditPassportArtifactHash,
          passportVerificationHash: offer.passportVerificationHash,
          underwritingSnapshotHash: offer.underwritingSnapshotHash,
          status: offer.status,
          validUntil: offer.validUntil,
          sandboxOnly: true,
          productionFundsApproved: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      const preliminaryOfferClosed = preliminaryOffer
        ? {
            ...preliminaryOffer,
            status: CreditOfferStatus.DECLINED,
            updatedAt: now.toISOString()
          }
        : undefined;
      const preliminaryOfferEvent = preliminaryOffer
        ? createCreditEvent({
            eventType: CreditEventType.CREDIT_OFFER_STATUS_CHANGED,
            subjectId: creditIntent.subjectId,
            payload: {
              creditOfferId: preliminaryOffer.creditOfferId,
              previousStatus: preliminaryOffer.status,
              nextStatus: CreditOfferStatus.DECLINED,
              replacementOfferId: offer.creditOfferId,
              reasonCode: "capital_partner_offer_authored",
              sandboxOnly: true,
              productionFundsApproved: false,
              causationId: requestId,
              correlationId
            },
            now
          })
        : undefined;
      const borrower = await borrowerBindings({
        directory,
        subjectId: creditIntent.subjectId,
        authorityType: creditIntent.authorityType,
        now
      });
      return {
        aggregateType: "credit_offer",
        aggregateId: offer.creditOfferId,
        events: [
          ...(preliminaryOfferEvent
            ? [{
                aggregateType: "credit_offer",
                aggregateId: preliminaryOffer.creditOfferId,
                expectedVersion: preliminaryOfferState.aggregateVersion,
                event: preliminaryOfferEvent
              }]
            : []),
          {
            aggregateType: "credit_offer",
            aggregateId: offer.creditOfferId,
            expectedVersion: 0,
            event
          }
        ],
        writes: [
          ...(preliminaryOfferEvent
            ? [{
                type: CoreProjectionType.CREDIT_OFFER,
                value: preliminaryOfferClosed,
                eventId: preliminaryOfferEvent.eventId
              }]
            : []),
          {
            type: CoreProjectionType.CREDIT_OFFER,
            value: offer,
            eventId: event.eventId
          }
        ],
        response: {
          offer: offerView(offer),
          capitalPartner: {
            capitalPartnerId: profile.capitalPartnerId,
            displayName: profile.displayName
          },
          fundsAuthority: false,
          schemaVersion: "tenant_capital_partner_offer_authored.v1"
        },
        authorizationResource: {
          resourceType: "credit_offer",
          resourceId: offer.creditOfferId,
          actorBindings: [{
            actorId: authenticationContext.actorId,
            actorType: authenticationContext.actorType,
            relationship: "owner"
          }, borrower]
        }
      };
    }
  });
}

export function transitionCapitalPartnerOfferCommandHandler() {
  return Object.freeze({
    operationId: "pilotTransitionCapitalPartnerOffer",
    kind: "command",
    async plan({
      client,
      coreRepository,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeTransitionPayload(payload);
      if (authorizationDecision.resourceType !== "credit_offer") unavailable();
      const profile = await loadProfile(coreRepository, client, authenticationContext);
      const state = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CREDIT_OFFER,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const offer = state?.value;
      if (
        !offer ||
        offer.schemaVersion !== "credit_offer.v2" ||
        offer.capitalPartnerId !== profile.capitalPartnerId ||
        offer.capitalPartnerOperatorId !== authenticationContext.actorId
      ) unavailable();
      if (input.nextStatus === CreditOfferStatus.SUPERSEDED) {
        const replacement = await coreRepository.getProjectionInTransaction(
          client,
          CoreProjectionType.CREDIT_OFFER,
          input.supersedingOfferId,
          { lock: false }
        );
        if (
          !replacement ||
          replacement.schemaVersion !== "credit_offer.v2" ||
          replacement.capitalPartnerId !== offer.capitalPartnerId ||
          replacement.creditIntentId !== offer.creditIntentId ||
          replacement.status !== CreditOfferStatus.OFFERED
        ) unavailable();
      }
      const transitioned = transitionCapitalPartnerCreditOffer({
        offer,
        nextStatus: input.nextStatus,
        capitalPartnerId: profile.capitalPartnerId,
        capitalPartnerOperatorId: authenticationContext.actorId,
        ...(input.supersedingOfferId
          ? { supersedingOfferId: input.supersedingOfferId }
          : {}),
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.CREDIT_OFFER_STATUS_CHANGED,
        subjectId: offer.subjectId,
        payload: {
          creditOfferId: offer.creditOfferId,
          previousStatus: offer.status,
          nextStatus: transitioned.status,
          ...(transitioned.supersedingOfferId
            ? { supersedingOfferId: transitioned.supersedingOfferId }
            : {}),
          capitalPartnerRefHash: hashId("capital_partner", offer.capitalPartnerId),
          operatorRefHash: hashId("actor", authenticationContext.actorId),
          sandboxOnly: true,
          productionFundsApproved: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "credit_offer",
        aggregateId: offer.creditOfferId,
        events: [{
          aggregateType: "credit_offer",
          aggregateId: offer.creditOfferId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.CREDIT_OFFER,
          value: transitioned,
          eventId: event.eventId
        }],
        response: {
          offer: offerView(transitioned),
          schemaVersion: "tenant_capital_partner_offer_transitioned.v1"
        },
        authorizationResourceTransition: {
          resourceType: "credit_offer",
          resourceId: offer.creditOfferId,
          expectedStatus: "active",
          nextStatus: "closed",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

async function facilityForObligation({ client, coreRepository, obligation, asOf }) {
  const offer = await coreRepository.getProjectionInTransaction(
    client,
    CoreProjectionType.CREDIT_OFFER,
    obligation.creditOfferId,
    { lock: false }
  );
  if (
    !offer ||
    offer.schemaVersion !== "credit_offer.v2" ||
    offer.status !== CreditOfferStatus.ACCEPTED
  ) unavailable();
  const latestServicingAction =
    await coreRepository.findLatestSandboxServicingActionInTransaction(
      client,
      obligation.obligationId
    );
  const evidenceCoverage =
    await coreRepository.getEvidenceAnchorCoverageForObligationInTransaction(
      client,
      obligation.obligationId
    );
  return createFacilityView({
    offer,
    obligation,
    latestServicingAction,
    evidenceCoverage,
    asOf
  });
}

export function readCapitalPartnerFacilityQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCapitalPartnerFacility",
    kind: "query",
    async execute({
      client,
      coreRepository,
      authenticationContext,
      resource,
      payload,
      now
    }) {
      normalizeEmptyPayload(payload);
      if (resource?.resourceType !== "obligation") unavailable();
      const profile = await loadProfile(coreRepository, client, authenticationContext);
      const obligation = await coreRepository.getObligationInTransaction(
        client,
        resource.resourceId,
        { lock: false }
      );
      if (!obligation) unavailable();
      const facility = await facilityForObligation({
        client,
        coreRepository,
        obligation,
        asOf: now
      });
      if (facility.capitalPartnerId !== profile.capitalPartnerId) unavailable();
      return {
        facility,
        schemaVersion: "tenant_capital_partner_facility_view.v1"
      };
    }
  });
}

export function readCapitalPartnerPortfolioQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCapitalPartnerPortfolio",
    kind: "query",
    async execute({
      client,
      coreRepository,
      authenticationContext,
      resource,
      payload,
      now
    }) {
      normalizeEmptyPayload(payload);
      const profile = await loadProfile(coreRepository, client, authenticationContext);
      if (
        resource?.resourceType !== "capital_partner_profile" ||
        resource.resourceId !== profile.capitalPartnerId
      ) unavailable();
      const [offers, obligations] = await Promise.all([
        coreRepository.listCapitalPartnerOffersInTransaction(
          client,
          profile.capitalPartnerId,
          { limit: 200 }
        ),
        coreRepository.listCapitalPartnerObligationsInTransaction(
          client,
          profile.capitalPartnerId,
          { limit: 200 }
        )
      ]);
      if (offers.hasMore || obligations.hasMore) {
        throw new DomainError(
          "capital_partner_portfolio_capacity_exceeded",
          "Capital Partner portfolio exceeds the private-pilot read bound"
        );
      }
      const facilities = [];
      for (const obligation of obligations.items) {
        facilities.push(await facilityForObligation({
          client,
          coreRepository,
          obligation,
          asOf: now
        }));
      }
      return {
        profile: structuredClone(profile),
        portfolio: createCapitalPartnerPortfolio({
          capitalPartnerId: profile.capitalPartnerId,
          offers: offers.items,
          facilities,
          asOf: now
        }),
        schemaVersion: "tenant_capital_partner_portfolio_view.v1"
      };
    }
  });
}

export function createCapitalPartnerHandlers() {
  return Object.freeze([
    authorCapitalPartnerOfferCommandHandler(),
    transitionCapitalPartnerOfferCommandHandler(),
    readCapitalPartnerFacilityQueryHandler(),
    readCapitalPartnerPortfolioQueryHandler()
  ]);
}
