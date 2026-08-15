const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

const REFERENCE_CONTRACTS = Object.freeze({
  risk_portfolio: Object.freeze({
    schemaVersion: "tenant_risk_portfolio_reference_view.v1"
  }),
  servicing_queue: Object.freeze({
    schemaVersion: "tenant_servicing_queue_reference_view.v1"
  })
});

const RESPONSE_KEYS = Object.freeze([
  "readOnly",
  "resource",
  "schemaVersion",
  "serverTruth"
]);
const RESOURCE_KEYS = Object.freeze(["resourceId", "resourceType"]);

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected)
  );
}

export function selectRiskWorkspaceReference(response, expectedResourceType) {
  const contract = REFERENCE_CONTRACTS[expectedResourceType];
  if (
    !contract ||
    !exactKeys(response, RESPONSE_KEYS) ||
    response.serverTruth !== true ||
    response.readOnly !== true ||
    response.schemaVersion !== contract.schemaVersion
  ) {
    return Object.freeze({ status: "ambiguous", resourceId: null });
  }
  if (response.resource === null) {
    return Object.freeze({ status: "empty", resourceId: null });
  }
  if (
    !exactKeys(response.resource, RESOURCE_KEYS) ||
    response.resource.resourceType !== expectedResourceType ||
    typeof response.resource.resourceId !== "string" ||
    !IDENTIFIER.test(response.resource.resourceId)
  ) {
    return Object.freeze({ status: "ambiguous", resourceId: null });
  }
  return Object.freeze({
    status: "selected",
    resourceId: response.resource.resourceId
  });
}
