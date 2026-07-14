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
}
