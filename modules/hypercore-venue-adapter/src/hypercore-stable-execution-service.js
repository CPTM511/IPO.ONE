import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  createHypercoreJitActionAuthorization,
  createHypercoreJitExchangeEnvelope,
  verifyHypercoreJitVenuePreflightReceipt,
  verifyHypercoreStableExecutionIntent,
  verifyHypercoreStableFounderApproval
} from "./hypercore-jit-execution.js";
import { verifyHypercorePreparedAction } from "./hypercore-action.js";
import { verifyHypercoreOfficialSigningRequest } from "./hypercore-official-signing.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_stable_service_clock", `${name} must be trusted`);
  }
  return new Date(value.getTime());
}

export class HypercoreStableExecutionService {
  #repository;
  #signer;
  #transport;
  #clock;
  #faultInjector;

  constructor({
    repository,
    signer,
    transport,
    clock = () => new Date(),
    faultInjector = null,
    ...unknown
  } = {}) {
    const repositoryMethods = [
      "find", "beginSigning", "claim", "resolve", "abortSigning", "recoverUnknown"
    ];
    if (
      Object.keys(unknown).length !== 0 || !repository ||
      !repositoryMethods.every((method) => typeof repository[method] === "function") ||
      !signer || typeof signer.sign !== "function" ||
      signer.profile?.environment !== "hyperliquid_testnet" ||
      !transport || typeof transport.submit !== "function" ||
      transport.profile?.environment !== "hyperliquid_testnet" ||
      transport.profile?.automaticRetry !== false || typeof clock !== "function" ||
      (faultInjector !== null && typeof faultInjector !== "function")
    ) fail("invalid_hypercore_stable_service", "closed repository, signer and Testnet transport required");
    this.#repository = repository;
    this.#signer = signer;
    this.#transport = transport;
    this.#clock = clock;
    this.#faultInjector = faultInjector;
  }

  async #fault(stage, context) {
    if (this.#faultInjector) await this.#faultInjector({ stage, ...context });
  }

  async submitExact({
    intent,
    approval,
    receipt,
    preparedAction,
    signingRequest,
    ...unknown
  }) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_hypercore_stable_service_input", "submission input is open");
    }
    verifyHypercoreStableExecutionIntent(intent);
    verifyHypercoreStableFounderApproval(approval);
    verifyHypercoreJitVenuePreflightReceipt(receipt);
    verifyHypercorePreparedAction(preparedAction);
    verifyHypercoreOfficialSigningRequest(signingRequest);
    const safe = {
      intentId: intent.intentId,
      intentHash: intent.intentHash,
      approvalHash: approval.approvalHash,
      preflightReceiptHash: receipt.receiptHash,
      signingRequestHash: signingRequest.signingRequestHash
    };
    await this.#fault("before_signing_claim", safe);
    const signing = await this.#repository.beginSigning({
      intentId: intent.intentId,
      approval,
      receipt,
      signingRequest,
      now: trustedDate("clock", this.#clock())
    });
    await this.#fault("after_signing_claim", safe);

    let signed;
    try {
      signed = await this.#signer.sign(signingRequest);
      await this.#fault("after_sign_before_submission_claim", {
        ...safe,
        signatureHash: signed.signatureHash
      });
    } catch (error) {
      await this.#repository.abortSigning({
        intentId: intent.intentId,
        reasonHash: hashId("hypercore_jit_signing_abort", {
          ...safe,
          errorName: error?.name ?? "Error",
          observedAt: trustedDate("clock", this.#clock()).toISOString()
        }),
        now: trustedDate("clock", this.#clock())
      });
      throw error;
    }

    const authorizationNow = trustedDate("clock", this.#clock());
    const authorization = createHypercoreJitActionAuthorization({
      intent: signing,
      approval,
      receipt,
      preparedAction,
      signingRequest,
      now: authorizationNow
    });
    const envelope = createHypercoreJitExchangeEnvelope({
      intent: signing,
      authorization,
      signingRequest,
      signed,
      now: authorizationNow
    });
    const claimHash = hashId("hypercore_jit_submission_claim", {
      ...safe,
      authorizationHash: authorization.authorizationHash,
      requestBodyHash: envelope.requestBodyHash,
      signatureHash: envelope.signatureHash,
      claimedAt: authorizationNow.toISOString()
    });
    await this.#repository.claim({
      intentId: intent.intentId,
      authorization,
      envelope,
      claimHash,
      now: authorizationNow
    });
    await this.#fault("after_submission_claim_before_transport", {
      ...safe,
      authorizationHash: authorization.authorizationHash,
      requestBodyHash: envelope.requestBodyHash
    });

    let result;
    try {
      result = await this.#transport.submit(envelope);
      await this.#fault("after_transport_before_result_persistence", {
        ...safe,
        resultHash: result.resultHash,
        disposition: result.disposition
      });
    } catch (error) {
      return this.#repository.recoverUnknown({
        intentId: intent.intentId,
        reasonHash: hashId("hypercore_jit_submission_unknown", {
          ...safe,
          errorName: error?.name ?? "Error",
          observedAt: trustedDate("clock", this.#clock()).toISOString()
        }),
        now: trustedDate("clock", this.#clock())
      });
    }
    return this.#repository.resolve({
      intentId: intent.intentId,
      result,
      now: trustedDate("clock", this.#clock())
    });
  }

  async recoverSigningClaim({ intentId, reasonCode }) {
    const intent = await this.#repository.find(intentId);
    if (!intent || intent.state !== "SIGNING") {
      fail("hypercore_jit_recovery_denied", "recoverable SIGNING intent missing");
    }
    return this.#repository.abortSigning({
      intentId,
      reasonHash: hashId("hypercore_jit_signing_recovery", {
        intentId,
        reasonCode,
        observedAt: trustedDate("clock", this.#clock()).toISOString()
      }),
      now: trustedDate("clock", this.#clock())
    });
  }
}
