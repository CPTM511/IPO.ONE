import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";
import { assertAuthorizationDecision } from "../../authorization/src/index.js";
import {
  DelegatedWalletGrantStatus,
  PendingExposureStatus,
  verifyDelegatedWalletGrant,
  verifyExecutionTargetPolicy
} from "./agentic-execution-grant.js";

export const PREPARED_EXECUTION_SCHEMA_VERSION = "prepared_execution.v1";
export const SIMULATION_REPORT_SCHEMA_VERSION = "simulation_report.v1";
export const TRANSACTION_PREFLIGHT_RECEIPT_SCHEMA_VERSION =
  "transaction_preflight_receipt.v1";

export const ExecutionDecision = Object.freeze({
  ALLOW: "ALLOW",
  STEP_UP: "STEP_UP",
  DENY: "DENY",
  QUARANTINE: "QUARANTINE"
});

export const SimulationStatus = Object.freeze({
  SUCCEEDED: "succeeded",
  REVERTED: "reverted",
  UNAVAILABLE: "unavailable"
});

const BYTES32 = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const SELECTOR = /^0x[0-9a-f]{8}$/;
const HEX_DATA = /^0x(?:[0-9a-f]{2})*$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const SIGNED_INTEGER = /^(?:0|-?[1-9][0-9]{0,77})$/;
const UNSIGNED_INTEGER = /^(?:0|[1-9][0-9]{0,77})$/;
const BLOCK_NUMBER = /^(?:0|[1-9][0-9]{0,19})$/;
const SUPPORTED_CHAIN_IDS = new Set(["eip155:84532", "eip155:1952"]);
const MAX_CALLDATA_BYTES = 32 * 1024;
const MAX_PREPARED_LIFETIME_MS = 5 * 60 * 1000;
const MAX_SIMULATION_LIFETIME_MS = 2 * 60 * 1000;
const MAX_PREFLIGHT_LIFETIME_MS = 2 * 60 * 1000;
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC721_SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";
const UNLIMITED_ALLOWANCE = (2n ** 256n) - 1n;

function invalid(code, message, details) {
  throw new DomainError(code, message, details);
}

function freeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

function exactShape(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    invalid("invalid_agentic_execution_preflight_input", `${name} has an invalid closed shape`);
  }
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be a bounded identifier`);
  }
  return value;
}

function bytes32(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be lowercase bytes32`);
  }
  return value;
}

function address(name, value) {
  const normalized = String(value).toLowerCase();
  if (!ADDRESS.test(normalized)) {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be a lowercase EVM address`);
  }
  return normalized;
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_agentic_execution_preflight_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function unsigned(name, value) {
  if (typeof value !== "string" || !UNSIGNED_INTEGER.test(value)) {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be canonical unsigned units`);
  }
  return BigInt(value);
}

function signed(name, value) {
  if (typeof value !== "string" || !SIGNED_INTEGER.test(value) || value === "-0") {
    invalid("invalid_agentic_execution_preflight_input", `${name} must be canonical signed units`);
  }
  return BigInt(value);
}

function uniqueReasonCodes(values) {
  if (
    !Array.isArray(values) || values.length < 1 || values.length > 32 ||
    values.some((value) => typeof value !== "string" || !/^[a-z][a-z0-9_]{1,95}$/.test(value)) ||
    new Set(values).size !== values.length
  ) {
    invalid("invalid_agentic_execution_preflight_receipt", "reasonCodes must be a bounded unique list");
  }
  return [...values].sort();
}

function authorizationHash(decision) {
  return hashId("agentic_execution_authorization", {
    decisionId: decision.decisionId,
    tenantId: decision.tenantId,
    actorId: decision.actorId,
    operationId: decision.operationId,
    action: decision.action,
    resourceType: decision.resourceType,
    resourceId: decision.resourceId,
    commandHash: decision.commandHash,
    commandPayloadHash: decision.commandPayloadHash,
    policyVersion: decision.policyVersion,
    authorizedAt: decision.authorizedAt,
    expiresAt: decision.expiresAt,
    revalidationCount: decision.revalidationCount
  });
}

function normalizeAssetDeltas(input) {
  if (!Array.isArray(input) || input.length > 32) {
    invalid("invalid_agentic_execution_effects", "assetDeltas must be a bounded array");
  }
  const values = input.map((delta) => {
    exactShape("asset delta", delta, ["assetId", "accountRefHash", "deltaMinor"]);
    return {
      assetId: identifier("assetId", delta.assetId),
      accountRefHash: bytes32("accountRefHash", delta.accountRefHash),
      deltaMinor: signed("deltaMinor", delta.deltaMinor).toString()
    };
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (new Set(values.map((value) => `${value.assetId}\0${value.accountRefHash}`)).size !== values.length) {
    invalid("invalid_agentic_execution_effects", "assetDeltas cannot contain duplicate asset/account pairs");
  }
  return values;
}

function normalizeAllowanceDeltas(input) {
  if (!Array.isArray(input) || input.length > 16) {
    invalid("invalid_agentic_execution_effects", "allowanceDeltas must be a bounded array");
  }
  const values = input.map((delta) => {
    exactShape("allowance delta", delta, [
      "assetId", "spenderAddress", "previousAllowanceMinor", "nextAllowanceMinor"
    ]);
    return {
      assetId: identifier("assetId", delta.assetId),
      spenderAddress: address("spenderAddress", delta.spenderAddress),
      previousAllowanceMinor: unsigned("previousAllowanceMinor", delta.previousAllowanceMinor).toString(),
      nextAllowanceMinor: unsigned("nextAllowanceMinor", delta.nextAllowanceMinor).toString()
    };
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (new Set(values.map((value) => `${value.assetId}\0${value.spenderAddress}`)).size !== values.length) {
    invalid("invalid_agentic_execution_effects", "allowanceDeltas cannot contain duplicate asset/spender pairs");
  }
  return values;
}

export function normalizeExecutionEffects(input) {
  exactShape("execution effects", input, [
    "nativeDeltaMinor", "assetDeltas", "allowanceDeltas", "withdrawal", "transfer"
  ]);
  if (input.withdrawal !== false || input.transfer !== false) {
    invalid("invalid_agentic_execution_effects", "withdrawal and transfer effects are prohibited");
  }
  const effects = {
    nativeDeltaMinor: signed("nativeDeltaMinor", input.nativeDeltaMinor).toString(),
    assetDeltas: normalizeAssetDeltas(input.assetDeltas),
    allowanceDeltas: normalizeAllowanceDeltas(input.allowanceDeltas),
    withdrawal: false,
    transfer: false,
    schemaVersion: "normalized_execution_effects.v1"
  };
  assertNoRawPiiReference(effects, "normalizedExecutionEffects");
  return cloneFreeze({
    effectsHash: hashId("normalized_execution_effects", effects),
    ...effects
  });
}

function effectsCore(effects) {
  return {
    nativeDeltaMinor: effects.nativeDeltaMinor,
    assetDeltas: effects.assetDeltas,
    allowanceDeltas: effects.allowanceDeltas,
    withdrawal: effects.withdrawal,
    transfer: effects.transfer
  };
}

export function verifyNormalizedExecutionEffects(effects) {
  exactShape("normalized execution effects", effects, [
    "effectsHash", "nativeDeltaMinor", "assetDeltas", "allowanceDeltas",
    "withdrawal", "transfer", "schemaVersion"
  ]);
  if (effects.schemaVersion !== "normalized_execution_effects.v1") {
    invalid("invalid_agentic_execution_effects", "effects schema is unavailable");
  }
  const rebuilt = normalizeExecutionEffects(effectsCore(effects));
  if (JSON.stringify(rebuilt) !== JSON.stringify(effects)) {
    invalid("invalid_agentic_execution_effects", "effects hash or normalization is inconsistent");
  }
  return true;
}

function exactPayloadCore(payload) {
  return {
    payloadKind: payload.payloadKind,
    chainId: payload.chainId,
    accountRefHash: payload.accountRefHash,
    targetAddress: payload.targetAddress,
    functionSelector: payload.functionSelector,
    calldata: payload.calldata,
    nativeValueMinor: payload.nativeValueMinor,
    callType: payload.callType,
    schemaVersion: payload.schemaVersion
  };
}

export function constructExactEvmPayload(input) {
  exactShape("resolved EVM action", input, [
    "chainId", "accountRefHash", "targetAddress", "calldata", "nativeValueMinor"
  ]);
  if (!SUPPORTED_CHAIN_IDS.has(input.chainId)) {
    invalid("agentic_execution_wrong_chain", "the resolved action chain is not enabled");
  }
  const calldata = String(input.calldata).toLowerCase();
  if (!HEX_DATA.test(calldata) || calldata.length < 10 || (calldata.length - 2) / 2 > MAX_CALLDATA_BYTES) {
    invalid("invalid_agentic_execution_preflight_input", "calldata must be bounded canonical hex with a selector");
  }
  const payload = {
    payloadKind: "evm_call_v1",
    chainId: input.chainId,
    accountRefHash: bytes32("accountRefHash", input.accountRefHash),
    targetAddress: address("targetAddress", input.targetAddress),
    functionSelector: calldata.slice(0, 10),
    calldata,
    nativeValueMinor: unsigned("nativeValueMinor", input.nativeValueMinor).toString(),
    callType: "call",
    schemaVersion: "exact_evm_payload.v1"
  };
  const exactPayloadHash = hashId("exact_evm_payload", payload);
  return cloneFreeze({ exactPayloadHash, ...payload });
}

export function verifyExactEvmPayload(payload) {
  exactShape("exact EVM payload", payload, [
    "exactPayloadHash", "payloadKind", "chainId", "accountRefHash", "targetAddress",
    "functionSelector", "calldata", "nativeValueMinor", "callType", "schemaVersion"
  ]);
  if (
    payload.payloadKind !== "evm_call_v1" || payload.callType !== "call" ||
    payload.schemaVersion !== "exact_evm_payload.v1" ||
    !SUPPORTED_CHAIN_IDS.has(payload.chainId) || !SELECTOR.test(payload.functionSelector) ||
    !HEX_DATA.test(payload.calldata) || payload.calldata.slice(0, 10) !== payload.functionSelector ||
    (payload.calldata.length - 2) / 2 > MAX_CALLDATA_BYTES ||
    !ADDRESS.test(payload.targetAddress) ||
    hashId("exact_evm_payload", exactPayloadCore(payload)) !== payload.exactPayloadHash
  ) {
    invalid("invalid_exact_execution_payload", "exact EVM payload is inconsistent");
  }
  bytes32("accountRefHash", payload.accountRefHash);
  unsigned("nativeValueMinor", payload.nativeValueMinor);
  return true;
}

function preparedCore(value) {
  return {
    subjectId: value.subjectId,
    principalId: value.principalId,
    accountBindingId: value.accountBindingId,
    obligationId: value.obligationId,
    transferIntentId: value.transferIntentId,
    grantId: value.grantId,
    grantHash: value.grantHash,
    targetPolicyId: value.targetPolicyId,
    targetPolicyHash: value.targetPolicyHash,
    authorizationDecisionId: value.authorizationDecisionId,
    authorizationHash: value.authorizationHash,
    reservationId: value.reservationId,
    reservationHash: value.reservationHash,
    sessionEpoch: value.sessionEpoch,
    payload: value.payload,
    expectedEffects: value.expectedEffects,
    stepUpRequired: value.stepUpRequired,
    validFrom: value.validFrom,
    expiresAt: value.expiresAt,
    transactionsAllowed: value.transactionsAllowed,
    sandboxOnly: value.sandboxOnly,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

export function constructPreparedExecution({
  grant,
  targetPolicy,
  reservation,
  authorizationDecision,
  transferIntentId,
  resolvedAction,
  expectedEffects,
  stepUpRequired = false,
  expiresAt,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyDelegatedWalletGrant(grant, { now: current, requireUsable: true });
  verifyExecutionTargetPolicy(targetPolicy, { now: current });
  if (
    targetPolicy.targetPolicyId !== reservation?.targetPolicyId ||
    grant.grantId !== reservation?.grantId ||
    reservation.status !== PendingExposureStatus.RESERVED ||
    reservation.sessionEpoch !== grant.sessionEpoch ||
    !grant.allowedTargetPolicyIds.includes(targetPolicy.targetPolicyId)
  ) {
    invalid("agentic_execution_reservation_invalid", "an exact active pending-exposure reservation is required");
  }
  const decision = assertAuthorizationDecision(authorizationDecision, { now: current });
  if (
    decision.operationId !== "walletPrepareExecution" ||
    decision.resourceType !== "delegated_wallet_grant" ||
    decision.resourceId !== grant.grantId || decision.revalidationCount < 1
  ) {
    invalid("agentic_execution_authorization_stale", "fresh exact wallet preparation authorization is required");
  }
  const payload = constructExactEvmPayload(resolvedAction);
  const normalizedExpectedEffects = normalizeExecutionEffects(expectedEffects);
  const validUntil = timestamp("expiresAt", expiresAt);
  if (
    validUntil <= current || validUntil.getTime() - current.getTime() > MAX_PREPARED_LIFETIME_MS ||
    validUntil > new Date(grant.expiresAt) || validUntil > new Date(targetPolicy.expiresAt) ||
    validUntil > new Date(reservation.expiresAt)
  ) {
    invalid("agentic_execution_prepared_expiry_invalid", "prepared execution expiry exceeds current authority");
  }
  const value = {
    subjectId: grant.subjectId,
    principalId: grant.principalId,
    accountBindingId: grant.accountBindingId,
    obligationId: grant.obligationId,
    transferIntentId: identifier("transferIntentId", transferIntentId),
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    targetPolicyId: targetPolicy.targetPolicyId,
    targetPolicyHash: targetPolicy.policyHash,
    authorizationDecisionId: decision.decisionId,
    authorizationHash: authorizationHash(decision),
    reservationId: reservation.reservationId,
    reservationHash: reservation.reservationHash,
    sessionEpoch: grant.sessionEpoch,
    payload,
    expectedEffects: normalizedExpectedEffects,
    stepUpRequired: stepUpRequired === true,
    validFrom: current.toISOString(),
    expiresAt: validUntil.toISOString(),
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: PREPARED_EXECUTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "preparedExecution");
  const preparedExecutionHash = hashId("prepared_execution", value);
  return cloneFreeze({
    executionId: `wallet_execution_${preparedExecutionHash.slice(2)}`,
    preparedExecutionHash,
    ...value,
    createdAt: current.toISOString()
  });
}

export function verifyPreparedExecution(value, { now = new Date(), allowExpired = false } = {}) {
  exactShape("PreparedExecution", value, [
    "executionId", "preparedExecutionHash", "subjectId", "principalId", "accountBindingId",
    "obligationId", "transferIntentId", "grantId", "grantHash", "targetPolicyId", "targetPolicyHash",
    "authorizationDecisionId", "authorizationHash", "reservationId", "reservationHash",
    "sessionEpoch", "payload", "expectedEffects", "stepUpRequired", "validFrom",
    "expiresAt", "transactionsAllowed", "sandboxOnly", "productionAuthority",
    "fundsAuthority", "schemaVersion", "createdAt"
  ]);
  const current = trustedNow(now);
  const validFrom = timestamp("validFrom", value.validFrom);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  verifyExactEvmPayload(value.payload);
  verifyNormalizedExecutionEffects(value.expectedEffects);
  for (const key of ["grantHash", "targetPolicyHash", "authorizationHash", "reservationHash", "preparedExecutionHash"]) {
    bytes32(key, value[key]);
  }
  identifier("transferIntentId", value.transferIntentId);
  if (
    value.schemaVersion !== PREPARED_EXECUTION_SCHEMA_VERSION ||
    value.executionId !== `wallet_execution_${value.preparedExecutionHash.slice(2)}` ||
    hashId("prepared_execution", preparedCore(value)) !== value.preparedExecutionHash ||
    !Number.isSafeInteger(value.sessionEpoch) || value.sessionEpoch < 0 ||
    typeof value.stepUpRequired !== "boolean" || value.transactionsAllowed !== false ||
    value.sandboxOnly !== true || value.productionAuthority !== false || value.fundsAuthority !== false ||
    timestamp("createdAt", value.createdAt).getTime() !== validFrom.getTime() || expiresAt <= validFrom ||
    (!allowExpired && (validFrom > current || expiresAt <= current))
  ) {
    invalid("invalid_prepared_execution", "prepared execution is inconsistent or stale");
  }
  return true;
}

function simulationCore(report) {
  return {
    executionId: report.executionId,
    preparedExecutionHash: report.preparedExecutionHash,
    exactPayloadHash: report.exactPayloadHash,
    simulatorId: report.simulatorId,
    simulatorVersion: report.simulatorVersion,
    simulatorMode: report.simulatorMode,
    status: report.status,
    chainId: report.chainId,
    blockNumber: report.blockNumber,
    blockHash: report.blockHash,
    observedCodeHash: report.observedCodeHash,
    observedProxyImplementationHash: report.observedProxyImplementationHash,
    simulatedEffects: report.simulatedEffects,
    threatCheckStatus: report.threatCheckStatus,
    revertReasonHash: report.revertReasonHash,
    simulatedAt: report.simulatedAt,
    expiresAt: report.expiresAt,
    externalCallPerformed: report.externalCallPerformed,
    sandboxOnly: report.sandboxOnly,
    productionAuthority: report.productionAuthority,
    fundsAuthority: report.fundsAuthority,
    schemaVersion: report.schemaVersion
  };
}

export function createSimulationReport({
  preparedExecution,
  simulatorId,
  simulatorVersion,
  result,
  expiresAt,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyPreparedExecution(preparedExecution, { now: current });
  exactShape("simulation result", result, [
    "status", "chainId", "blockNumber", "blockHash", "observedCodeHash",
    "observedProxyImplementationHash", "effects", "threatCheckStatus", "revertReasonHash"
  ]);
  if (!Object.values(SimulationStatus).includes(result.status)) {
    invalid("invalid_agentic_execution_simulation", "simulation status is invalid");
  }
  if (!SUPPORTED_CHAIN_IDS.has(result.chainId) || typeof result.blockNumber !== "string" || !BLOCK_NUMBER.test(result.blockNumber)) {
    invalid("invalid_agentic_execution_simulation", "simulation chain snapshot is invalid");
  }
  const validUntil = timestamp("expiresAt", expiresAt);
  if (
    validUntil <= current || validUntil > new Date(preparedExecution.expiresAt) ||
    validUntil.getTime() - current.getTime() > MAX_SIMULATION_LIFETIME_MS
  ) {
    invalid("invalid_agentic_execution_simulation", "simulation expiry is outside the prepared execution");
  }
  const simulatedEffects = normalizeExecutionEffects(result.effects);
  const report = {
    executionId: preparedExecution.executionId,
    preparedExecutionHash: preparedExecution.preparedExecutionHash,
    exactPayloadHash: preparedExecution.payload.exactPayloadHash,
    simulatorId: identifier("simulatorId", simulatorId),
    simulatorVersion: identifier("simulatorVersion", simulatorVersion),
    simulatorMode: "local_deterministic",
    status: result.status,
    chainId: result.chainId,
    blockNumber: result.blockNumber,
    blockHash: bytes32("blockHash", result.blockHash),
    observedCodeHash: bytes32("observedCodeHash", result.observedCodeHash),
    observedProxyImplementationHash: result.observedProxyImplementationHash === null
      ? null
      : bytes32("observedProxyImplementationHash", result.observedProxyImplementationHash),
    simulatedEffects,
    threatCheckStatus: result.threatCheckStatus,
    revertReasonHash: result.revertReasonHash === null ? null : bytes32("revertReasonHash", result.revertReasonHash),
    simulatedAt: current.toISOString(),
    expiresAt: validUntil.toISOString(),
    externalCallPerformed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: SIMULATION_REPORT_SCHEMA_VERSION
  };
  if (!new Set(["passed", "failed", "unavailable"]).has(report.threatCheckStatus)) {
    invalid("invalid_agentic_execution_simulation", "threat check status is invalid");
  }
  if ((report.status === SimulationStatus.REVERTED) !== (report.revertReasonHash !== null)) {
    invalid("invalid_agentic_execution_simulation", "revert reason binding is inconsistent");
  }
  const simulationHash = hashId("agentic_execution_simulation", report);
  return cloneFreeze({
    simulationReportId: `simulation_report_${simulationHash.slice(2)}`,
    simulationHash,
    ...report
  });
}

export function verifySimulationReport(report, { now = new Date(), allowExpired = false } = {}) {
  exactShape("SimulationReport", report, [
    "simulationReportId", "simulationHash", "executionId", "preparedExecutionHash",
    "exactPayloadHash", "simulatorId", "simulatorVersion", "simulatorMode", "status",
    "chainId", "blockNumber", "blockHash", "observedCodeHash",
    "observedProxyImplementationHash", "simulatedEffects", "threatCheckStatus",
    "revertReasonHash", "simulatedAt", "expiresAt", "externalCallPerformed",
    "sandboxOnly", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  const simulatedAt = timestamp("simulatedAt", report.simulatedAt);
  const expiresAt = timestamp("expiresAt", report.expiresAt);
  verifyNormalizedExecutionEffects(report.simulatedEffects);
  const stale = !allowExpired && expiresAt <= current;
  if (
    report.schemaVersion !== SIMULATION_REPORT_SCHEMA_VERSION ||
    report.simulatorMode !== "local_deterministic" || report.externalCallPerformed !== false ||
    report.sandboxOnly !== true || report.productionAuthority !== false || report.fundsAuthority !== false ||
    !Object.values(SimulationStatus).includes(report.status) || !SUPPORTED_CHAIN_IDS.has(report.chainId) ||
    !BLOCK_NUMBER.test(report.blockNumber) || expiresAt <= simulatedAt ||
    report.simulationReportId !== `simulation_report_${report.simulationHash.slice(2)}` ||
    hashId("agentic_execution_simulation", simulationCore(report)) !== report.simulationHash ||
    stale
  ) {
    invalid(
      stale ? "stale_agentic_execution_simulation" : "invalid_agentic_execution_simulation",
      stale ? "simulation report is stale" : "simulation report is inconsistent"
    );
  }
  for (const key of ["simulationHash", "preparedExecutionHash", "exactPayloadHash", "blockHash", "observedCodeHash"]) {
    bytes32(key, report[key]);
  }
  if (report.observedProxyImplementationHash !== null) bytes32("observedProxyImplementationHash", report.observedProxyImplementationHash);
  if (report.revertReasonHash !== null) bytes32("revertReasonHash", report.revertReasonHash);
  return true;
}

export function assertSimulationPort(port) {
  if (!port || typeof port.simulate !== "function" || Object.keys(port).some((key) => key !== "simulate")) {
    invalid("invalid_agentic_execution_simulator", "a closed simulation port is required");
  }
  return port;
}

export async function runPreparedExecutionSimulation({
  port,
  preparedExecution,
  expiresAt,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyPreparedExecution(preparedExecution, { now: current });
  const simulator = assertSimulationPort(port);
  const output = await simulator.simulate(cloneFreeze({ preparedExecution }));
  exactShape("simulation port output", output, ["simulatorId", "simulatorVersion", "result"]);
  return createSimulationReport({
    preparedExecution,
    simulatorId: output.simulatorId,
    simulatorVersion: output.simulatorVersion,
    result: output.result,
    expiresAt,
    now: current
  });
}

function approvalFromCalldata(payload) {
  if (payload.functionSelector !== ERC20_APPROVE_SELECTOR || payload.calldata.length !== 138) return null;
  const spender = `0x${payload.calldata.slice(34, 74)}`;
  const amount = BigInt(`0x${payload.calldata.slice(74, 138)}`);
  return { spender, amount };
}

function chooseDecision(hardDenials, quarantines, stepUpRequired) {
  if (hardDenials.length > 0) return ExecutionDecision.DENY;
  if (quarantines.length > 0) return ExecutionDecision.QUARANTINE;
  if (stepUpRequired) return ExecutionDecision.STEP_UP;
  return ExecutionDecision.ALLOW;
}

function receiptCore(receipt) {
  return {
    executionId: receipt.executionId,
    preparedExecutionHash: receipt.preparedExecutionHash,
    authorizationHash: receipt.authorizationHash,
    grantId: receipt.grantId,
    grantHash: receipt.grantHash,
    exactPayloadHash: receipt.exactPayloadHash,
    targetSnapshot: receipt.targetSnapshot,
    simulationSnapshot: receipt.simulationSnapshot,
    expectedEffectsHash: receipt.expectedEffectsHash,
    simulatedEffectsHash: receipt.simulatedEffectsHash,
    allowanceDeltaHash: receipt.allowanceDeltaHash,
    assetDeltaHash: receipt.assetDeltaHash,
    riskChecksHash: receipt.riskChecksHash,
    reservationHash: receipt.reservationHash,
    decision: receipt.decision,
    reasonCodes: receipt.reasonCodes,
    createdAt: receipt.createdAt,
    expiresAt: receipt.expiresAt,
    transactionsAllowed: receipt.transactionsAllowed,
    sandboxOnly: receipt.sandboxOnly,
    productionAuthority: receipt.productionAuthority,
    fundsAuthority: receipt.fundsAuthority,
    schemaVersion: receipt.schemaVersion
  };
}

export function evaluateTransactionPreflight({
  preparedExecution,
  currentGrant,
  targetPolicy,
  reservation,
  simulationReport,
  currentChainId,
  currentSessionEpoch,
  adapterPaused = false,
  chainPaused = false,
  globalPaused = false,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyPreparedExecution(preparedExecution, { now: current });
  verifyDelegatedWalletGrant(currentGrant, { now: current });
  verifyExecutionTargetPolicy(targetPolicy, { now: current, allowExpired: true });
  verifySimulationReport(simulationReport, { now: current });
  const hardDenials = [];
  const quarantines = [];
  const payload = preparedExecution.payload;

  if (currentGrant.status !== DelegatedWalletGrantStatus.ACTIVE) hardDenials.push("grant_not_active");
  if (
    preparedExecution.grantId !== currentGrant.grantId ||
    preparedExecution.grantHash !== currentGrant.grantHash ||
    preparedExecution.sessionEpoch !== currentGrant.sessionEpoch ||
    currentSessionEpoch !== currentGrant.sessionEpoch
  ) hardDenials.push("grant_context_mismatch");
  if (currentChainId !== payload.chainId || !currentGrant.chainIds.includes(payload.chainId)) {
    hardDenials.push("wrong_chain");
  }
  if (globalPaused || adapterPaused || chainPaused) hardDenials.push("execution_paused");
  if (
    reservation?.status !== PendingExposureStatus.RESERVED ||
    reservation.grantId !== currentGrant.grantId ||
    reservation.reservationHash !== preparedExecution.reservationHash ||
    new Date(reservation.expiresAt) <= current
  ) hardDenials.push("pending_exposure_unavailable");
  if (
    preparedExecution.targetPolicyId !== targetPolicy.targetPolicyId ||
    preparedExecution.targetPolicyHash !== targetPolicy.policyHash ||
    targetPolicy.chainId !== payload.chainId || targetPolicy.targetAddress !== payload.targetAddress
  ) hardDenials.push("target_policy_mismatch");
  if (!targetPolicy.allowedFunctionSelectors.includes(payload.functionSelector)) {
    hardDenials.push("unknown_selector");
  }
  if (BigInt(payload.nativeValueMinor) > BigInt(targetPolicy.maxNativeValueMinor)) {
    hardDenials.push("native_value_exceeds_policy");
  }
  const approval = approvalFromCalldata(payload);
  if (
    payload.functionSelector === ERC721_SET_APPROVAL_FOR_ALL_SELECTOR ||
    (approval && (
      targetPolicy.approvalMode === "none" ||
      !targetPolicy.allowedTokenSpenders.includes(approval.spender) ||
      approval.amount > BigInt(targetPolicy.maxTokenAllowanceMinor)
    ))
  ) hardDenials.push(approval?.amount === UNLIMITED_ALLOWANCE ? "unlimited_approval_denied" : "approval_denied");

  if (
    simulationReport.executionId !== preparedExecution.executionId ||
    simulationReport.preparedExecutionHash !== preparedExecution.preparedExecutionHash ||
    simulationReport.exactPayloadHash !== payload.exactPayloadHash
  ) quarantines.push("simulation_payload_drift");
  if (simulationReport.status !== SimulationStatus.SUCCEEDED) quarantines.push("simulation_not_successful");
  if (simulationReport.chainId !== payload.chainId) quarantines.push("simulation_chain_drift");
  if (simulationReport.observedCodeHash !== targetPolicy.codeHash) quarantines.push("code_hash_changed");
  if (simulationReport.observedProxyImplementationHash !== targetPolicy.proxyImplementationHash) {
    quarantines.push("proxy_implementation_changed");
  }
  if (simulationReport.threatCheckStatus !== "passed") quarantines.push("threat_check_unavailable_or_failed");
  if (simulationReport.simulatedEffects.effectsHash !== preparedExecution.expectedEffects.effectsHash) {
    quarantines.push("simulated_effects_diverged");
  }

  const decision = chooseDecision(hardDenials, quarantines, preparedExecution.stepUpRequired);
  const reasonCodes = uniqueReasonCodes([
    ...hardDenials,
    ...quarantines,
    ...(decision === ExecutionDecision.ALLOW ? ["preflight_passed"] : []),
    ...(decision === ExecutionDecision.STEP_UP ? ["exact_human_approval_required"] : [])
  ]);
  const expiresAt = new Date(Math.min(
    new Date(preparedExecution.expiresAt).getTime(),
    new Date(simulationReport.expiresAt).getTime(),
    new Date(currentGrant.expiresAt).getTime(),
    new Date(targetPolicy.expiresAt).getTime(),
    current.getTime() + MAX_PREFLIGHT_LIFETIME_MS
  ));
  if (expiresAt <= current) invalid("stale_transaction_preflight", "preflight context is already stale");
  const targetSnapshot = {
    chainId: payload.chainId,
    targetAddress: payload.targetAddress,
    functionSelector: payload.functionSelector,
    codeHash: simulationReport.observedCodeHash,
    proxyImplementationHash: simulationReport.observedProxyImplementationHash,
    targetPolicyHash: targetPolicy.policyHash
  };
  const simulationSnapshot = {
    simulationReportId: simulationReport.simulationReportId,
    simulationHash: simulationReport.simulationHash,
    blockNumber: simulationReport.blockNumber,
    blockHash: simulationReport.blockHash
  };
  const riskChecks = {
    grantActive: currentGrant.status === DelegatedWalletGrantStatus.ACTIVE,
    reservationCurrent: !hardDenials.includes("pending_exposure_unavailable"),
    chainCurrent: !hardDenials.includes("wrong_chain"),
    targetAllowed: !hardDenials.includes("target_policy_mismatch"),
    selectorAllowed: !hardDenials.includes("unknown_selector"),
    approvalAllowed: !hardDenials.some((code) => code.includes("approval")),
    codeCurrent: !quarantines.includes("code_hash_changed"),
    proxyCurrent: !quarantines.includes("proxy_implementation_changed"),
    effectsMatched: !quarantines.includes("simulated_effects_diverged"),
    paused: globalPaused || adapterPaused || chainPaused
  };
  const receipt = {
    executionId: preparedExecution.executionId,
    preparedExecutionHash: preparedExecution.preparedExecutionHash,
    authorizationHash: preparedExecution.authorizationHash,
    grantId: currentGrant.grantId,
    grantHash: currentGrant.grantHash,
    exactPayloadHash: payload.exactPayloadHash,
    targetSnapshot,
    simulationSnapshot,
    expectedEffectsHash: preparedExecution.expectedEffects.effectsHash,
    simulatedEffectsHash: simulationReport.simulatedEffects.effectsHash,
    allowanceDeltaHash: hashId("execution_allowance_deltas", simulationReport.simulatedEffects.allowanceDeltas),
    assetDeltaHash: hashId("execution_asset_deltas", {
      nativeDeltaMinor: simulationReport.simulatedEffects.nativeDeltaMinor,
      assetDeltas: simulationReport.simulatedEffects.assetDeltas
    }),
    riskChecksHash: hashId("execution_risk_checks", riskChecks),
    reservationHash: preparedExecution.reservationHash,
    decision,
    reasonCodes,
    createdAt: current.toISOString(),
    expiresAt: expiresAt.toISOString(),
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: TRANSACTION_PREFLIGHT_RECEIPT_SCHEMA_VERSION
  };
  const preflightHash = hashId("transaction_preflight_receipt", receipt);
  return cloneFreeze({
    preflightReceiptId: `transaction_preflight_receipt_${preflightHash.slice(2)}`,
    preflightHash,
    ...receipt
  });
}

export function verifyTransactionPreflightReceipt(receipt, { now = new Date(), allowExpired = false } = {}) {
  exactShape("TransactionPreflightReceipt", receipt, [
    "preflightReceiptId", "preflightHash", "executionId", "preparedExecutionHash",
    "authorizationHash", "grantId", "grantHash", "exactPayloadHash", "targetSnapshot",
    "simulationSnapshot", "expectedEffectsHash", "simulatedEffectsHash",
    "allowanceDeltaHash", "assetDeltaHash", "riskChecksHash", "reservationHash",
    "decision", "reasonCodes", "createdAt", "expiresAt", "transactionsAllowed",
    "sandboxOnly", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  const createdAt = timestamp("createdAt", receipt.createdAt);
  const expiresAt = timestamp("expiresAt", receipt.expiresAt);
  for (const key of [
    "preflightHash", "preparedExecutionHash", "authorizationHash", "grantHash",
    "exactPayloadHash", "expectedEffectsHash", "simulatedEffectsHash", "allowanceDeltaHash",
    "assetDeltaHash", "riskChecksHash", "reservationHash"
  ]) bytes32(key, receipt[key]);
  uniqueReasonCodes(receipt.reasonCodes);
  if (
    receipt.schemaVersion !== TRANSACTION_PREFLIGHT_RECEIPT_SCHEMA_VERSION ||
    !Object.values(ExecutionDecision).includes(receipt.decision) ||
    receipt.preflightReceiptId !== `transaction_preflight_receipt_${receipt.preflightHash.slice(2)}` ||
    hashId("transaction_preflight_receipt", receiptCore(receipt)) !== receipt.preflightHash ||
    expiresAt <= createdAt || receipt.transactionsAllowed !== false || receipt.sandboxOnly !== true ||
    receipt.productionAuthority !== false || receipt.fundsAuthority !== false ||
    (!allowExpired && expiresAt <= current)
  ) {
    invalid(
      expiresAt <= current ? "stale_transaction_preflight" : "invalid_transaction_preflight_receipt",
      expiresAt <= current ? "transaction preflight is stale" : "transaction preflight receipt is inconsistent"
    );
  }
  return true;
}

export function assertWalletSubmissionDisabled({
  preparedExecution,
  preflightReceipt,
  currentGrant,
  targetPolicy,
  reservation,
  currentChainId,
  currentSessionEpoch,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyPreparedExecution(preparedExecution, { now: current });
  verifyTransactionPreflightReceipt(preflightReceipt, { now: current });
  verifyDelegatedWalletGrant(currentGrant, { now: current });
  verifyExecutionTargetPolicy(targetPolicy, { now: current });
  const target = preflightReceipt.targetSnapshot;
  if (
    preflightReceipt.decision !== ExecutionDecision.ALLOW ||
    preflightReceipt.executionId !== preparedExecution.executionId ||
    preflightReceipt.preparedExecutionHash !== preparedExecution.preparedExecutionHash ||
    preflightReceipt.exactPayloadHash !== preparedExecution.payload.exactPayloadHash ||
    preflightReceipt.authorizationHash !== preparedExecution.authorizationHash ||
    preflightReceipt.grantId !== currentGrant.grantId ||
    preflightReceipt.grantHash !== currentGrant.grantHash ||
    preparedExecution.grantId !== currentGrant.grantId ||
    preparedExecution.grantHash !== currentGrant.grantHash ||
    preflightReceipt.reservationHash !== preparedExecution.reservationHash ||
    preflightReceipt.expectedEffectsHash !== preparedExecution.expectedEffects.effectsHash ||
    target.targetPolicyHash !== preparedExecution.targetPolicyHash ||
    target.targetPolicyHash !== targetPolicy.policyHash ||
    target.chainId !== preparedExecution.payload.chainId ||
    target.targetAddress !== preparedExecution.payload.targetAddress ||
    target.functionSelector !== preparedExecution.payload.functionSelector ||
    target.codeHash !== targetPolicy.codeHash ||
    target.proxyImplementationHash !== targetPolicy.proxyImplementationHash ||
    reservation?.reservationId !== preparedExecution.reservationId ||
    reservation?.reservationHash !== preparedExecution.reservationHash ||
    reservation?.grantId !== currentGrant.grantId ||
    reservation?.status !== PendingExposureStatus.RESERVED ||
    new Date(reservation.expiresAt) <= current ||
    currentGrant.status !== DelegatedWalletGrantStatus.ACTIVE ||
    currentChainId !== preparedExecution.payload.chainId ||
    currentSessionEpoch !== preparedExecution.sessionEpoch ||
    currentGrant.sessionEpoch !== preparedExecution.sessionEpoch
  ) {
    invalid("execution_submission_binding_invalid", "wallet submission binding is not currently allowed");
  }
  invalid(
    "execution_submission_disabled_l0_local_no_funds",
    "wallet submission is disabled in the L0 local no-funds delivery profile"
  );
}

export function describeAgenticExecutionPreflightBoundary() {
  return cloneFreeze({
    schemaVersion: "agentic_execution_preflight_boundary.v1",
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    exactPayloadConstruction: true,
    localDeterministicSimulation: true,
    externalSimulation: false,
    decisions: Object.values(ExecutionDecision),
    rawTransactionInput: false,
    transactionsAllowed: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
