import { DomainError } from "../../../packages/domain/src/index.js";

function normalizeEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Tenant risk portfolio payload must be empty"
    );
  }
}

export function readTenantRiskPortfolioQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadTenantRisk",
    kind: "query",
    async execute({ client, coreRepository, authorizationDecision, payload, now }) {
      normalizeEmptyPayload(payload);
      if (
        authorizationDecision?.resourceType !== "risk_portfolio" ||
        typeof authorizationDecision.resourceId !== "string" ||
        authorizationDecision.resourceId.length === 0
      ) {
        throw new DomainError(
          "tenant_resource_unavailable",
          "The requested resource is not available."
        );
      }
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
      }
      const portfolio = await coreRepository.getTenantRiskPortfolioInTransaction(
        client,
        { assetLimit: 50 }
      );
      return {
        portfolioId: authorizationDecision.resourceId,
        asOf: now.toISOString(),
        ...portfolio,
        schemaVersion: "tenant_risk_portfolio_view.v1"
      };
    }
  });
}

export function createTenantRiskQueryHandlers() {
  return Object.freeze([readTenantRiskPortfolioQueryHandler()]);
}
