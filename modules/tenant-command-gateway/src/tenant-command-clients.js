import { DomainError } from "../../../packages/domain/src/index.js";
import {
  TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
  assertTenantProtocolRequest
} from "../../../packages/api-contract/src/index.js";
import { ActorType, assertAuthenticationContext } from "../../authentication/src/index.js";

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
    const request = {
      ...command,
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
}

export class OperatorTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: OPERATOR_CLIENT_ACTOR_TYPES });
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
}

export class RiskTenantQueryClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: RISK_QUERY_CLIENT_ACTOR_TYPES });
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
