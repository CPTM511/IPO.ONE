import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  verifyHypercoreTestnetActionAuthorization,
  verifyHypercoreTestnetExchangeEnvelope
} from "./hypercore-testnet-proof.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const RECOVERY_REASONS = new Set([
  "PROCESS_RESTART",
  "TRANSPORT_FAILURE",
  "RESPONSE_LOSS",
  "RESULT_PERSISTENCE_FAILURE"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_durable_execution_clock", `${name} must be trusted`);
  }
  return new Date(value.getTime());
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_durable_execution_input", `${name} is invalid`);
  }
  return value;
}

export class HypercoreDurableTestnetExecutionService {
  #repository;
  #transport;
  #clock;
  #faultInjector;

  constructor({
    repository,
    transport,
    clock = () => new Date(),
    faultInjector = null,
    ...unknown
  } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !repository ||
      !["find", "claim", "resolve", "recoverUnknown"].every(
        (method) => typeof repository[method] === "function"
      ) ||
      !transport ||
      typeof transport.submit !== "function" ||
      transport.profile?.environment !== "hyperliquid_testnet" ||
      transport.profile?.endpoint !==
        "https://api.hyperliquid-testnet.xyz/exchange" ||
      transport.profile?.automaticRetry !== false ||
      typeof clock !== "function" ||
      (faultInjector !== null && typeof faultInjector !== "function")
    ) {
      fail(
        "invalid_hypercore_durable_execution_service",
        "closed repository, Testnet transport and clock ports are required"
      );
    }
    this.#repository = repository;
    this.#transport = transport;
    this.#clock = clock;
    this.#faultInjector = faultInjector;
  }

  async #fault(stage, context) {
    if (this.#faultInjector) {
      await this.#faultInjector({ stage, ...context });
    }
  }

  async submitExact({ executionId, authorization, envelope, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_hypercore_durable_execution_input", "submission input is open");
    }
    identifier("executionId", executionId);
    verifyHypercoreTestnetActionAuthorization(authorization);
    verifyHypercoreTestnetExchangeEnvelope(envelope);
    if (envelope.authorizationHash !== authorization.authorizationHash) {
      fail(
        "hypercore_durable_execution_binding_denied",
        "authorization and Exchange envelope differ"
      );
    }
    const attempt = await this.#repository.find(executionId);
    if (
      !attempt ||
      attempt.state !== "APPROVED" ||
      attempt.preparedActionHash !== authorization.preparedActionHash ||
      attempt.policyHash !== authorization.policyHash ||
      attempt.riskSnapshotHash !== authorization.riskSnapshotHash ||
      attempt.accountBindingHash !== authorization.accountBindingHash ||
      attempt.delegateHash !== authorization.delegateHash ||
      attempt.signerReferenceHash !== authorization.signerReferenceHash
    ) {
      fail(
        "hypercore_durable_execution_binding_denied",
        "durable attempt is missing, stale or drifted"
      );
    }
    const claimedAt = trustedDate("clock", this.#clock());
    const safeContext = {
      executionId,
      executionHash: attempt.executionHash,
      authorizationHash: authorization.authorizationHash,
      requestBodyHash: envelope.requestBodyHash,
      signatureHash: envelope.signatureHash
    };
    await this.#fault("before_claim", safeContext);
    await this.#repository.claim({
      executionId,
      authorization,
      requestBodyHash: envelope.requestBodyHash,
      signatureHash: envelope.signatureHash,
      claimHash: hashId("hypercore_testnet_submission_claim", {
        ...safeContext,
        claimedAt: claimedAt.toISOString()
      }),
      now: claimedAt
    });
    await this.#fault("after_claim_before_transport", safeContext);

    let result;
    try {
      result = await this.#transport.submit(envelope);
    } catch (error) {
      const observedAt = trustedDate("clock", this.#clock());
      return this.#repository.recoverUnknown({
        executionId,
        reasonHash: hashId("hypercore_testnet_submission_unknown", {
          ...safeContext,
          reasonCode: "TRANSPORT_FAILURE",
          errorName: error?.name ?? "Error",
          observedAt: observedAt.toISOString()
        }),
        now: observedAt
      });
    }
    await this.#fault("after_transport_before_result_persistence", {
      ...safeContext,
      resultHash: result.resultHash,
      disposition: result.disposition
    });
    return this.#repository.resolve({
      executionId,
      result,
      now: trustedDate("clock", this.#clock())
    });
  }

  async recoverInFlight({ executionId, reasonCode, ...unknown }) {
    if (
      Object.keys(unknown).length !== 0 ||
      !RECOVERY_REASONS.has(reasonCode)
    ) {
      fail(
        "invalid_hypercore_durable_execution_recovery",
        "recovery reason is closed"
      );
    }
    identifier("executionId", executionId);
    const observedAt = trustedDate("clock", this.#clock());
    return this.#repository.recoverUnknown({
      executionId,
      reasonHash: hashId("hypercore_testnet_submission_unknown", {
        executionId,
        reasonCode,
        observedAt: observedAt.toISOString()
      }),
      now: observedAt
    });
  }
}
