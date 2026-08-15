import policy from "../policy/agent-credit-hyperliquid-testnet.v2.json" with {
  type: "json"
};
import { DomainError, hashId } from "../../../packages/domain/src/index.js";

export const AGENT_CREDIT_EXECUTION_POLICY = Object.freeze(
  structuredClone(policy)
);

const OPEN_KEYS = Object.freeze([
  "kind",
  "market",
  "requestedNotionalMinor"
]);
const CLOSE_KEYS = Object.freeze(["kind", "market", "openExecutionId"]);
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;

function closed(value, keys) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
  );
}

function denied(reasonCode, message) {
  throw new DomainError(reasonCode, message);
}

export function authorizeAgentExecutionIntent({
  facility,
  intent,
  mandate,
  now,
  reconciliationBlocked,
  frozen
}) {
  const closing = closed(intent, CLOSE_KEYS) && intent.kind === "close";
  if (
    !facility ||
    facility.lifecycleStatus !== "active" ||
    facility.riskState !== "NORMAL" ||
    mandate?.status !== "active" ||
    mandate.subjectId !== facility.subjectId ||
    now >= new Date(mandate.expiresAt) ||
    ((frozen === true || reconciliationBlocked === true) && !closing)
  ) {
    denied(
      "agent_credit_authority_unavailable",
      "Facility, Mandate or reconciliation state does not admit new risk"
    );
  }
  if (closed(intent, OPEN_KEYS) && intent.kind === "open") {
    if (
      intent.market !== "BTC" ||
      !POSITIVE_MINOR.test(intent.requestedNotionalMinor ?? "") ||
      BigInt(intent.requestedNotionalMinor) >
        BigInt(AGENT_CREDIT_EXECUTION_POLICY.execution.maxOrderNotionalMinor) ||
      facility.openOrderCount !== 0 ||
      facility.syntheticExposureMinor !== "0"
    ) {
      denied(
        "agent_credit_execution_limit_denied",
        "Execution Intent is outside the server authorization envelope"
      );
    }
    return Object.freeze({
      actionKind: "order",
      market: "BTC",
      requestedNotionalMinor: intent.requestedNotionalMinor,
      policyDecisionHash: hashId("agent_credit_execution_policy_decision", {
        facilityHash: facility.facilityHash,
        facilityStateHash: facility.stateHash,
        intent,
        policyVersion: AGENT_CREDIT_EXECUTION_POLICY.policyVersion
      }),
      reduceOnly: false
    });
  }
  if (closing) {
    if (
      intent.market !== "BTC" ||
      typeof intent.openExecutionId !== "string" ||
      intent.openExecutionId.length < 8 ||
      facility.openOrderCount !== 1 ||
      facility.syntheticExposureMinor === "0"
    ) {
      denied(
        "agent_credit_execution_close_denied",
        "Close Intent does not match one open bounded position"
      );
    }
    return Object.freeze({
      actionKind: "reduceOnlyOrder",
      market: "BTC",
      openExecutionId: intent.openExecutionId,
      policyDecisionHash: hashId("agent_credit_execution_policy_decision", {
        facilityHash: facility.facilityHash,
        facilityStateHash: facility.stateHash,
        intent,
        policyVersion: AGENT_CREDIT_EXECUTION_POLICY.policyVersion
      }),
      reduceOnly: true
    });
  }
  denied(
    "agent_credit_execution_action_denied",
    "Unknown, transfer, withdrawal, raw or open venue actions are denied"
  );
}

export function agentCreditExecutionCapabilityDescriptor() {
  return Object.freeze({
    facilityType: AGENT_CREDIT_EXECUTION_POLICY.facilityType,
    mode: AGENT_CREDIT_EXECUTION_POLICY.mode,
    provider: AGENT_CREDIT_EXECUTION_POLICY.venue.provider,
    environment: AGENT_CREDIT_EXECUTION_POLICY.venue.environment,
    allowedMarkets: [...AGENT_CREDIT_EXECUTION_POLICY.execution.allowedMarkets],
    allowedActions: [...AGENT_CREDIT_EXECUTION_POLICY.execution.allowedActions],
    maxConcurrentPositions:
      AGENT_CREDIT_EXECUTION_POLICY.execution.maxConcurrentPositions,
    maxOrderNotionalMinor:
      AGENT_CREDIT_EXECUTION_POLICY.execution.maxOrderNotionalMinor,
    maxLeverage: AGENT_CREDIT_EXECUTION_POLICY.execution.maxLeverage,
    withdrawalAllowed: false,
    transferAllowed: false,
    agentCustodyAllowed: false,
    networkAvailable: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "agent_credit_execution_capabilities.v1"
  });
}
