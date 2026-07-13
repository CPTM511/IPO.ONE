import {
  assertAuthorizationIdentifier,
  assertAuthorizationList,
  assertAuthorizationShape,
  assertPositiveCapacity,
  assertReasonCode,
  authorizationError,
  cloneAuthorization,
  deepFreezeAuthorization
} from "./authorization-utils.js";

function keyFor(input) {
  return [input.tenantId, input.operationId, input.resourceType, input.resourceId].join("\0");
}

export class InMemoryLivePolicyAdapter {
  #states = new Map();

  constructor({ maximumStates = 50_000 } = {}) {
    this.maximumStates = assertPositiveCapacity("maximumStates", maximumStates);
    Object.freeze(this);
  }

  register(input) {
    assertAuthorizationShape("live policy state", input, {
      required: ["tenantId", "operationId", "resourceType", "resourceId", "checks", "allowed"],
      optional: ["reasonCode"]
    });
    if (this.#states.size >= this.maximumStates) {
      throw authorizationError("authorization_live_policy_capacity_exceeded", "live policy capacity is exhausted");
    }
    const state = deepFreezeAuthorization({
      tenantId: assertAuthorizationIdentifier("tenantId", input.tenantId),
      operationId: assertAuthorizationIdentifier("operationId", input.operationId),
      resourceType: assertAuthorizationIdentifier("resourceType", input.resourceType),
      resourceId: assertAuthorizationIdentifier("resourceId", input.resourceId),
      checks: assertAuthorizationList("checks", input.checks, { allowEmpty: false }),
      allowed: input.allowed === true,
      reasonCode: input.reasonCode === undefined
        ? "live_policy_rejected"
        : assertReasonCode("reasonCode", input.reasonCode),
      version: 1,
      schemaVersion: "authorization_live_policy_state.v1"
    });
    const key = keyFor(state);
    if (this.#states.has(key)) {
      throw authorizationError("authorization_live_policy_conflict", "live policy state already exists");
    }
    this.#states.set(key, state);
    return cloneAuthorization(state);
  }

  setDecision(input) {
    assertAuthorizationShape("live policy transition", input, {
      required: ["tenantId", "operationId", "resourceType", "resourceId", "expectedVersion", "allowed"],
      optional: ["checks", "reasonCode"]
    });
    const key = keyFor(input);
    const current = this.#states.get(key);
    if (!current || current.version !== input.expectedVersion) {
      throw authorizationError("authorization_live_policy_rejected", "live policy state is stale");
    }
    const updated = deepFreezeAuthorization({
      ...current,
      checks: input.checks === undefined
        ? current.checks
        : assertAuthorizationList("checks", input.checks, { allowEmpty: false }),
      allowed: input.allowed === true,
      reasonCode: input.reasonCode === undefined
        ? current.reasonCode
        : assertReasonCode("reasonCode", input.reasonCode),
      version: current.version + 1
    });
    this.#states.set(key, updated);
    return cloneAuthorization(updated);
  }

  async evaluate({ tenantId, policy, resource }) {
    if (policy.liveChecks.length === 0) {
      return Object.freeze({ liveStateVersion: 0, evaluatedChecks: Object.freeze([]) });
    }
    if (!resource) {
      throw authorizationError("authorization_live_policy_rejected", "live policy resource is required");
    }
    const state = this.#states.get(keyFor({
      tenantId,
      operationId: policy.operationId,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId
    }));
    if (
      !state ||
      !state.allowed ||
      policy.liveChecks.some((check) => !state.checks.includes(check))
    ) {
      throw authorizationError("authorization_live_policy_rejected", "live policy rejected the operation");
    }
    return Object.freeze({
      liveStateVersion: state.version,
      evaluatedChecks: Object.freeze([...policy.liveChecks])
    });
  }
}
