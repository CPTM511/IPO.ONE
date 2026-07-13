import { DomainError } from "../../../packages/domain/src/index.js";
import { ActorType, assertAuthenticationContext } from "../../authentication/src/index.js";

const HUMAN_CLIENT_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);

class TenantProtocolClient {
  #allowedActorTypes;

  constructor({ gateway, authenticationContextProvider, allowedActorTypes }) {
    if (
      !gateway ||
      typeof gateway.execute !== "function" ||
      typeof authenticationContextProvider !== "function" ||
      !(allowedActorTypes instanceof Set) ||
      allowedActorTypes.size === 0
    ) {
      throw new DomainError("invalid_tenant_protocol_client", "tenant protocol client dependencies are invalid");
    }
    this.gateway = gateway;
    this.authenticationContextProvider = authenticationContextProvider;
    this.#allowedActorTypes = new Set(allowedActorTypes);
    Object.freeze(this);
  }

  async execute(command) {
    const authenticationContext = assertAuthenticationContext(await this.authenticationContextProvider());
    if (!this.#allowedActorTypes.has(authenticationContext.actorType)) {
      throw new DomainError("tenant_protocol_client_mismatch", "authenticated Actor cannot use this client");
    }
    return this.gateway.execute({ ...command, authenticationContext });
  }
}

export class HumanTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: HUMAN_CLIENT_ACTOR_TYPES });
  }

  async createAgentSubject({ payload, idempotencyKey, requestId, correlationId, networkContext }) {
    return this.execute({
      operationId: "pilotCreateAgentSubject",
      payload,
      idempotencyKey,
      requestId,
      correlationId,
      ...(networkContext === undefined ? {} : { networkContext })
    });
  }
}

export class AgentTenantCommandClient extends TenantProtocolClient {
  constructor(input) {
    super({ ...input, allowedActorTypes: new Set([ActorType.AGENT]) });
  }

  async getSelf({ subjectId, requestId, correlationId, networkContext }) {
    return this.execute({
      operationId: "pilotReadAgentSelf",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      requestId,
      correlationId,
      ...(networkContext === undefined ? {} : { networkContext })
    });
  }
}
