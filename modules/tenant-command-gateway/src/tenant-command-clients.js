import { DomainError } from "../../../packages/domain/src/index.js";
import {
  TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
  assertTenantProtocolRequest
} from "../../../packages/api-contract/src/index.js";
import { ActorType, assertAuthenticationContext } from "../../authentication/src/index.js";
import {
  createAuthenticatedProtocolActionConfirmation,
  economicActionTypeForOperation
} from "./economic-action-confirmation.js";

const HUMAN_CLIENT_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);

const OPERATOR_CLIENT_ACTOR_TYPES = new Set([
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR
]);

const RISK_QUERY_CLIENT_ACTOR_TYPES = new Set([
  ActorType.RISK_OPERATOR,
  ActorType.AUDITOR
]);

class TenantProtocolClient {
  #allowedActorTypes;

  constructor({
    gateway,
    authenticationContextProvider,
    networkContextProvider,
    allowedActorTypes
  }) {
    if (
      !gateway ||
      typeof gateway.execute !== "function" ||
      typeof authenticationContextProvider !== "function" ||
      (networkContextProvider !== undefined && typeof networkContextProvider !== "function") ||
      !(allowedActorTypes instanceof Set) ||
      allowedActorTypes.size === 0
    ) {
      throw new DomainError("invalid_tenant_protocol_client", "tenant protocol client dependencies are invalid");
    }
    this.gateway = gateway;
    this.authenticationContextProvider = authenticationContextProvider;
    this.networkContextProvider = networkContextProvider;
    this.#allowedActorTypes = new Set(allowedActorTypes);
    Object.freeze(this);
  }

  async execute(command) {
    const needsEconomicConfirmation = Boolean(economicActionTypeForOperation(command.operationId));
    const payload = needsEconomicConfirmation && !command.payload?.actionConfirmation
      ? {
          ...command.payload,
          actionConfirmation: createAuthenticatedProtocolActionConfirmation({
            operationId: command.operationId,
            payload: command.payload,
            resource: command.resource,
            requestId: command.requestId
          })
        }
      : command.payload;
    const request = {
      ...command,
      payload,
      schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION
    };
    assertTenantProtocolRequest(request);
    const authenticationContext = assertAuthenticationContext(await this.authenticationContextProvider());
    if (!this.#allowedActorTypes.has(authenticationContext.actorType)) {
      throw new DomainError("tenant_protocol_client_mismatch", "authenticated Actor cannot use this client");
    }
    const networkContext = await this.networkContextProvider?.();
    return this.gateway.execute({
      ...request,
      authenticationContext,
      ...(networkContext === undefined ? {} : { networkContext })
    });
  }
}

export class HumanTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: HUMAN_CLIENT_ACTOR_TYPES });
  }

  async createAgentSubject({ payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotCreateAgentSubject",
      payload,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createAgentAccountChallenge({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotCreateAgentAccountChallenge",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getAgentAccountBinding({ subjectId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadAgentAccountBinding",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      requestId,
      correlationId
    });
  }

  async createHumanSubject({ idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotCreateHumanSubject",
      payload: {},
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getHumanSelf({ subjectId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadHumanSelf",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      requestId,
      correlationId
    });
  }

  async resumeWorkspace({ requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadWorkspaceResume",
      payload: {},
      requestId,
      correlationId
    });
  }

  async createConsent({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotCreateConsent",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getConsent({ consentId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadConsent",
      payload: {},
      resource: { resourceType: "consent", resourceId: consentId },
      requestId,
      correlationId
    });
  }

  async revokeConsent({ consentId, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotRevokeConsent",
      payload: {},
      resource: { resourceType: "consent", resourceId: consentId },
      reasonCode: "human_withdrawal",
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getIdentityReference({ identityReferenceId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadIdentityReference",
      payload: {},
      resource: {
        resourceType: "human_identity_reference",
        resourceId: identityReferenceId
      },
      requestId,
      correlationId
    });
  }

  async requestCredit({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotRequestCredit",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getCreditApplication({ creditIntentId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadCreditApplication",
      payload: {},
      resource: { resourceType: "credit_intent", resourceId: creditIntentId },
      requestId,
      correlationId
    });
  }

  async evaluateCreditApplication({ creditIntentId, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotEvaluateCreditApplication",
      payload: {},
      resource: { resourceType: "credit_intent", resourceId: creditIntentId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async acceptCreditOffer({ creditOfferId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotAcceptCreditOffer",
      payload,
      resource: { resourceType: "credit_offer", resourceId: creditOfferId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async authorCapitalPartnerOffer({
    creditPassportArtifactId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotAuthorCapitalPartnerOffer",
      payload,
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: creditPassportArtifactId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async transitionCapitalPartnerOffer({
    creditOfferId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotTransitionCapitalPartnerOffer",
      payload,
      resource: { resourceType: "credit_offer", resourceId: creditOfferId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getCapitalPartnerPortfolio({
    capitalPartnerId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCapitalPartnerPortfolio",
      payload: {},
      resource: {
        resourceType: "capital_partner_profile",
        resourceId: capitalPartnerId
      },
      requestId,
      correlationId
    });
  }

  async getCapitalPartnerFacility({
    obligationId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCapitalPartnerFacility",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      requestId,
      correlationId
    });
  }

  async executeSandboxObligation({ obligationId, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotExecuteSandboxObligation",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async postSandboxRepayment({ obligationId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotPostSandboxRepayment",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getOwnObligation({ obligationId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOwnObligation",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      requestId,
      correlationId
    });
  }

  async getOwnObligationEvidence({ obligationId, limit, cursor, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOwnObligationEvidence",
      payload: {
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor })
      },
      resource: { resourceType: "evidence", resourceId: obligationId },
      requestId,
      correlationId
    });
  }

  async getCreditRegistryEvidence({
    authorizationHash,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCreditRegistryEvidence",
      payload: {},
      resource: {
        resourceType: "credit_registry_evidence",
        resourceId: authorizationHash
      },
      requestId,
      correlationId
    });
  }

  async createOfficialReport({
    obligationId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotCreateOfficialReport",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getOfficialReport({ officialReportId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOfficialReport",
      payload: {},
      resource: { resourceType: "official_report", resourceId: officialReportId },
      requestId,
      correlationId
    });
  }

  async retrieveOfficialReport({ officialReportId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotRetrieveOfficialReport",
      payload: {},
      resource: { resourceType: "official_report", resourceId: officialReportId },
      requestId,
      correlationId
    });
  }

  async revokeOfficialReport({
    officialReportId,
    reasonCode,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotRevokeOfficialReport",
      payload: {},
      resource: { resourceType: "official_report", resourceId: officialReportId },
      reasonCode,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createCreditPassportArtifact({
    subjectId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotCreateCreditPassportArtifact",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getOwnCreditPassportArtifact({ artifactId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOwnCreditPassportArtifact",
      payload: {},
      resource: { resourceType: "credit_passport_artifact", resourceId: artifactId },
      requestId,
      correlationId
    });
  }

  async verifyCreditPassportArtifact({
    artifactId,
    payload,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotVerifyCreditPassportArtifact",
      payload,
      resource: { resourceType: "credit_passport_artifact", resourceId: artifactId },
      purpose: "private_credit_review",
      requestId,
      correlationId
    });
  }

  async revokeCreditPassportArtifact({
    artifactId,
    reasonCode,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotRevokeCreditPassportArtifact",
      payload: {},
      resource: { resourceType: "credit_passport_artifact", resourceId: artifactId },
      reasonCode,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async submitPilotFeedback({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotSubmitPilotFeedback",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createTradingAccountBindingChallenge({
    subjectId,
    masterAccountAddress,
    subaccountAddress,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateAccountBindingChallenge",
      payload: {
        environment: "hyperliquid_testnet",
        masterAccountAddress,
        subaccountAddress
      },
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async importTradingHistory({
    tradingCreditProfileId,
    masterAccountAddress,
    subaccountAddress,
    signature,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingImportHyperliquidHistory",
      payload: {
        masterAccountAddress,
        subaccountAddress,
        signature
      },
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async finalizeTradingEvidence({
    tradingCreditProfileId,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingFinalizeEvidenceSnapshot",
      payload: {},
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingCreditProfile({
    tradingCreditProfileId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingReadCreditProfile",
      payload: {},
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      requestId,
      correlationId
    });
  }

  async createTradingCapitalRequest({
    tradingCreditProfileId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateCapitalRequest",
      payload,
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async listCompatibleTradingMandates({
    tradingCapitalRequestId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingListCompatibleMandates",
      payload: {},
      resource: {
        resourceType: "trading_capital_request",
        resourceId: tradingCapitalRequestId
      },
      requestId,
      correlationId
    });
  }

  async createTradingMatchProposal({
    tradingCapitalRequestId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateMatchProposal",
      payload,
      resource: {
        resourceType: "trading_capital_request",
        resourceId: tradingCapitalRequestId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async acceptTradingMatchAsSubject({
    tradingMatchProposalId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingAcceptMatchAsSubject",
      payload,
      resource: {
        resourceType: "trading_match_proposal",
        resourceId: tradingMatchProposalId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createTradingFacility({
    tradingMatchProposalId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateFacility",
      payload,
      resource: {
        resourceType: "trading_match_proposal",
        resourceId: tradingMatchProposalId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async contributeTradingSubjectCollateral({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingContributeSubjectCollateral",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async activateTradingFacility({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingActivateFacility",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async submitTradingOrderIntent({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingSubmitOrderIntent",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async cancelTradingOrderIntent({
    tradingOrderIntentId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCancelOrderIntent",
      payload,
      resource: {
        resourceType: "trading_order_intent",
        resourceId: tradingOrderIntentId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingFacility({
    tradingFacilityId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingReadFacilityState",
      payload: {},
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      requestId,
      correlationId
    });
  }

  async requestTradingFacilityClose({
    tradingFacilityId, payload, idempotencyKey, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingRequestClose",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingSettlement({
    tradingSettlementId, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingReadSettlement",
      payload: {},
      resource: {
        resourceType: "trading_settlement",
        resourceId: tradingSettlementId
      },
      requestId,
      correlationId
    });
  }

  async issueTradingPerformanceProof({
    tradingSettlementId, payload, idempotencyKey, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingIssuePerformanceProof",
      payload,
      resource: {
        resourceType: "trading_settlement",
        resourceId: tradingSettlementId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingFacilityEvidence({
    tradingFacilityId, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingReadFacilityEvidence",
      payload: {},
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      requestId,
      correlationId
    });
  }

  async createDraftMandate({
    subjectId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotCreateDraftMandate",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getMandate({ mandateId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadMandate",
      payload: {},
      resource: { resourceType: "mandate", resourceId: mandateId },
      requestId,
      correlationId
    });
  }

  async activateSandboxMandate({
    mandateId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotActivateSandboxMandate",
      payload,
      resource: { resourceType: "mandate", resourceId: mandateId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async revokeDraftMandate({
    mandateId,
    reasonCode,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotRevokeDraftMandate",
      payload: {},
      resource: { resourceType: "mandate", resourceId: mandateId },
      reasonCode,
      idempotencyKey,
      requestId,
      correlationId
    });
  }
}

export class AgentTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: new Set([ActorType.AGENT]) });
  }

  async getSelf({ subjectId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadAgentSelf",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      requestId,
      correlationId
    });
  }

  async submitAccountProof({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotSubmitAgentAccountProof",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getAccountBinding({ subjectId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadAgentAccountBinding",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      requestId,
      correlationId
    });
  }

  async requestCredit({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotRequestCredit",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getCreditApplication({ creditIntentId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadCreditApplication",
      payload: {},
      resource: { resourceType: "credit_intent", resourceId: creditIntentId },
      requestId,
      correlationId
    });
  }

  async evaluateCreditApplication({ creditIntentId, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotEvaluateCreditApplication",
      payload: {},
      resource: { resourceType: "credit_intent", resourceId: creditIntentId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async acceptCreditOffer({ creditOfferId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotAcceptCreditOffer",
      payload,
      resource: { resourceType: "credit_offer", resourceId: creditOfferId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async executeSandboxObligation({ obligationId, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotExecuteSandboxObligation",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async postSandboxRepayment({ obligationId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotPostSandboxRepayment",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getOwnObligation({ obligationId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOwnObligation",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      requestId,
      correlationId
    });
  }

  async getOwnObligationEvidence({ obligationId, limit, cursor, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOwnObligationEvidence",
      payload: {
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor })
      },
      resource: { resourceType: "evidence", resourceId: obligationId },
      requestId,
      correlationId
    });
  }

  async getCreditRegistryEvidence({
    authorizationHash,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCreditRegistryEvidence",
      payload: {},
      resource: {
        resourceType: "credit_registry_evidence",
        resourceId: authorizationHash
      },
      requestId,
      correlationId
    });
  }

  async createOfficialReport({
    obligationId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotCreateOfficialReport",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getOfficialReport({ officialReportId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOfficialReport",
      payload: {},
      resource: { resourceType: "official_report", resourceId: officialReportId },
      requestId,
      correlationId
    });
  }

  async retrieveOfficialReport({ officialReportId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotRetrieveOfficialReport",
      payload: {},
      resource: { resourceType: "official_report", resourceId: officialReportId },
      requestId,
      correlationId
    });
  }

  async revokeOfficialReport({
    officialReportId,
    reasonCode,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotRevokeOfficialReport",
      payload: {},
      resource: { resourceType: "official_report", resourceId: officialReportId },
      reasonCode,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getOwnCreditPassportArtifact({ artifactId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadOwnCreditPassportArtifact",
      payload: {},
      resource: { resourceType: "credit_passport_artifact", resourceId: artifactId },
      requestId,
      correlationId
    });
  }

  async verifyCreditPassportArtifact({
    artifactId,
    payload,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotVerifyCreditPassportArtifact",
      payload,
      resource: { resourceType: "credit_passport_artifact", resourceId: artifactId },
      purpose: "private_credit_review",
      requestId,
      correlationId
    });
  }

  async submitPilotFeedback({ subjectId, payload, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotSubmitPilotFeedback",
      payload,
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createTradingAccountBindingChallenge({
    subjectId,
    masterAccountAddress,
    subaccountAddress,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateAccountBindingChallenge",
      payload: {
        environment: "hyperliquid_testnet",
        masterAccountAddress,
        subaccountAddress
      },
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async importTradingHistory({
    tradingCreditProfileId,
    masterAccountAddress,
    subaccountAddress,
    signature,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingImportHyperliquidHistory",
      payload: {
        masterAccountAddress,
        subaccountAddress,
        signature
      },
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async finalizeTradingEvidence({
    tradingCreditProfileId,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingFinalizeEvidenceSnapshot",
      payload: {},
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingCreditProfile({
    tradingCreditProfileId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingReadCreditProfile",
      payload: {},
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      requestId,
      correlationId
    });
  }

  async createTradingCapitalRequest({
    tradingCreditProfileId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateCapitalRequest",
      payload,
      resource: {
        resourceType: "trading_credit_profile",
        resourceId: tradingCreditProfileId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async listCompatibleTradingMandates({
    tradingCapitalRequestId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingListCompatibleMandates",
      payload: {},
      resource: {
        resourceType: "trading_capital_request",
        resourceId: tradingCapitalRequestId
      },
      requestId,
      correlationId
    });
  }

  async createTradingMatchProposal({
    tradingCapitalRequestId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateMatchProposal",
      payload,
      resource: {
        resourceType: "trading_capital_request",
        resourceId: tradingCapitalRequestId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async acceptTradingMatchAsSubject({
    tradingMatchProposalId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingAcceptMatchAsSubject",
      payload,
      resource: {
        resourceType: "trading_match_proposal",
        resourceId: tradingMatchProposalId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createTradingFacility({
    tradingMatchProposalId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateFacility",
      payload,
      resource: {
        resourceType: "trading_match_proposal",
        resourceId: tradingMatchProposalId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async contributeTradingSubjectCollateral({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingContributeSubjectCollateral",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async activateTradingFacility({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingActivateFacility",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async submitTradingOrderIntent({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingSubmitOrderIntent",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async cancelTradingOrderIntent({
    tradingOrderIntentId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCancelOrderIntent",
      payload,
      resource: {
        resourceType: "trading_order_intent",
        resourceId: tradingOrderIntentId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingFacility({
    tradingFacilityId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingReadFacilityState",
      payload: {},
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      requestId,
      correlationId
    });
  }

  async requestTradingFacilityClose({
    tradingFacilityId, payload, idempotencyKey, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingRequestClose",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingSettlement({
    tradingSettlementId, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingReadSettlement",
      payload: {},
      resource: {
        resourceType: "trading_settlement",
        resourceId: tradingSettlementId
      },
      requestId,
      correlationId
    });
  }

  async issueTradingPerformanceProof({
    tradingSettlementId, payload, idempotencyKey, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingIssuePerformanceProof",
      payload,
      resource: {
        resourceType: "trading_settlement",
        resourceId: tradingSettlementId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingFacilityEvidence({
    tradingFacilityId, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingReadFacilityEvidence",
      payload: {},
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      requestId,
      correlationId
    });
  }
}

export class OperatorTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: OPERATOR_CLIENT_ACTOR_TYPES });
  }

  async getCreditRegistryEvidence({
    authorizationHash,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCreditRegistryEvidence",
      payload: {},
      resource: {
        resourceType: "credit_registry_evidence",
        resourceId: authorizationHash
      },
      requestId,
      correlationId
    });
  }

  async freezeSubject({
    subjectId,
    reasonCode,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotFreezeSubject",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      reasonCode,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getServicingQueue({
    queueId,
    classifications,
    limit,
    cursor,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadServicingQueue",
      payload: {
        ...(classifications === undefined ? {} : { classifications }),
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor })
      },
      resource: { resourceType: "servicing_queue", resourceId: queueId },
      requestId,
      correlationId
    });
  }

  async restructureSandboxObligation({
    obligationId,
    payload,
    approvalArtifact,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotRestructureSandboxObligation",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      reasonCode: "sandbox_hardship_restructure",
      approvalArtifact,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async repurchaseSandboxObligation({
    obligationId,
    payload,
    approvalArtifact,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotRepurchaseSandboxObligation",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      reasonCode: "sandbox_contractual_repurchase",
      approvalArtifact,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async writeOffSandboxObligation({
    obligationId,
    payload,
    approvalArtifact,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotWriteOffSandboxObligation",
      payload,
      resource: { resourceType: "obligation", resourceId: obligationId },
      reasonCode: "sandbox_uncollectible_writeoff",
      approvalArtifact,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async evaluateTradingFacilityRisk({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingEvaluateRisk",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async pauseTradingFacilityNewRisk({
    tradingFacilityId,
    payload,
    reasonCode,
    approvalArtifact,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingPauseNewRisk",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      reasonCode,
      approvalArtifact,
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async flattenTradingFacility({
    tradingFacilityId,
    payload,
    reasonCode,
    approvalArtifact,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingFlattenFacility",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      reasonCode,
      approvalArtifact,
      idempotencyKey,
      requestId,
      correlationId
    });
  }
}

export class SystemWorkerTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: new Set([ActorType.SYSTEM_WORKER]) });
  }

  async advanceSandboxServicing({ obligationId, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "workerAdvanceSandboxServicing",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      reasonCode: "servicing_clock_tick",
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async processProviderCallback({ callback, idempotencyKey, requestId, correlationId }) {
    return this.execute({
      operationId: "workerProcessInbox",
      payload: callback,
      resource: { resourceType: "inbox_message", resourceId: callback.callbackId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async runTradingSettlement({
    tradingFacilityCloseRequestId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingRunSettlement",
      payload,
      resource: {
        resourceType: "trading_facility_close_request",
        resourceId: tradingFacilityCloseRequestId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }
}

export class ProviderTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: new Set([ActorType.PROVIDER]) });
  }

  async getAssignedIntent({ transferIntentId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadProviderIntent",
      payload: {},
      resource: { resourceType: "transfer_intent", resourceId: transferIntentId },
      purpose: "provider_intent_delivery",
      requestId,
      correlationId
    });
  }

  async acknowledgeAssignedIntent({
    transferIntentId,
    deliveryHash,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotAcknowledgeProviderIntent",
      payload: { deliveryHash },
      resource: { resourceType: "transfer_intent", resourceId: transferIntentId },
      purpose: "provider_intent_delivery",
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async createTradingProviderMandate({
    providerId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingCreateProviderMandate",
      payload,
      resource: { resourceType: "provider", resourceId: providerId },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async acceptTradingMatchAsProvider({
    tradingMatchProposalId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingAcceptMatchAsProvider",
      payload,
      resource: {
        resourceType: "trading_match_proposal",
        resourceId: tradingMatchProposalId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async recordTradingProviderFunding({
    tradingFacilityId,
    payload,
    idempotencyKey,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingRecordProviderFunding",
      payload,
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingFacility({
    tradingFacilityId,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "tradingReadFacilityState",
      payload: {},
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      requestId,
      correlationId
    });
  }

  async getTradingSettlement({
    tradingSettlementId, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingReadSettlement",
      payload: {},
      resource: {
        resourceType: "trading_settlement",
        resourceId: tradingSettlementId
      },
      requestId,
      correlationId
    });
  }

  async issueTradingPerformanceProof({
    tradingSettlementId, payload, idempotencyKey, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingIssuePerformanceProof",
      payload,
      resource: {
        resourceType: "trading_settlement",
        resourceId: tradingSettlementId
      },
      idempotencyKey,
      requestId,
      correlationId
    });
  }

  async getTradingFacilityEvidence({
    tradingFacilityId, requestId, correlationId
  }) {
    return this.execute({
      operationId: "tradingReadFacilityEvidence",
      payload: {},
      resource: {
        resourceType: "trading_facility",
        resourceId: tradingFacilityId
      },
      requestId,
      correlationId
    });
  }
}

export class RiskTenantQueryClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: RISK_QUERY_CLIENT_ACTOR_TYPES });
  }

  async getCreditRegistryEvidence({
    authorizationHash,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCreditRegistryEvidence",
      payload: {},
      resource: {
        resourceType: "credit_registry_evidence",
        resourceId: authorizationHash
      },
      requestId,
      correlationId
    });
  }

  async getPortfolio({ portfolioId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadTenantRisk",
      payload: {},
      resource: { resourceType: "risk_portfolio", resourceId: portfolioId },
      requestId,
      correlationId
    });
  }

  async getPilotHealth({ portfolioId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadPilotHealth",
      payload: {},
      resource: { resourceType: "risk_portfolio", resourceId: portfolioId },
      requestId,
      correlationId
    });
  }

  async getPilotFeedbackSummary({ portfolioId, requestId, correlationId }) {
    return this.execute({
      operationId: "pilotReadPilotFeedbackSummary",
      payload: {},
      resource: { resourceType: "risk_portfolio", resourceId: portfolioId },
      requestId,
      correlationId
    });
  }

  async getServicingQueue({
    queueId,
    classifications,
    limit,
    cursor,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadServicingQueue",
      payload: {
        ...(classifications === undefined ? {} : { classifications }),
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor })
      },
      resource: { resourceType: "servicing_queue", resourceId: queueId },
      requestId,
      correlationId
    });
  }
}

export class AuditorTenantQueryClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: new Set([ActorType.AUDITOR]) });
  }

  async getCreditRegistryEvidence({
    authorizationHash,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadCreditRegistryEvidence",
      payload: {},
      resource: {
        resourceType: "credit_registry_evidence",
        resourceId: authorizationHash
      },
      requestId,
      correlationId
    });
  }

  async getObligationEvidence({
    obligationId,
    limit,
    cursor,
    purpose,
    requestId,
    correlationId
  }) {
    return this.execute({
      operationId: "pilotReadEvidence",
      payload: {
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor })
      },
      resource: { resourceType: "evidence", resourceId: obligationId },
      ...(purpose === undefined ? {} : { purpose }),
      requestId,
      correlationId
    });
  }
}
