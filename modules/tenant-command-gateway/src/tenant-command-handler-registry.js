import { DomainError } from "../../../packages/domain/src/index.js";

const HANDLER_KINDS = new Set(["command", "query"]);

function assertIdentifier(name, value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  ) {
    throw new DomainError("invalid_tenant_command_handler", `${name} is invalid`);
  }
  return value;
}

export class TenantCommandHandlerRegistry {
  #handlers;

  constructor(handlers) {
    if (!Array.isArray(handlers) || handlers.length === 0 || handlers.length > 64) {
      throw new DomainError(
        "invalid_tenant_command_handler",
        "tenant command handlers must be a non-empty bounded list"
      );
    }
    this.#handlers = new Map();
    for (const handler of handlers) {
      if (!handler || typeof handler !== "object" || !HANDLER_KINDS.has(handler.kind)) {
        throw new DomainError("invalid_tenant_command_handler", "tenant command handler is invalid");
      }
      const operationId = assertIdentifier("operationId", handler.operationId);
      if (
        (handler.kind === "command" && typeof handler.plan !== "function") ||
        (handler.kind === "query" && typeof handler.execute !== "function") ||
        (handler.resourceDeltas !== undefined && typeof handler.resourceDeltas !== "function") ||
        (handler.loadResourceBaselines !== undefined && typeof handler.loadResourceBaselines !== "function") ||
        this.#handlers.has(operationId)
      ) {
        throw new DomainError("invalid_tenant_command_handler", "tenant command handler contract is invalid", {
          operationId
        });
      }
      this.#handlers.set(operationId, Object.freeze({ ...handler, operationId }));
    }
    Object.freeze(this);
  }

  require(operationId) {
    const handler = this.#handlers.get(assertIdentifier("operationId", operationId));
    if (!handler) {
      throw new DomainError("tenant_operation_unavailable", "The requested operation is not available.");
    }
    return handler;
  }

  listOperationIds() {
    return Object.freeze([...this.#handlers.keys()].sort());
  }
}
