export const M1_B_OPERATIONAL_DENIAL_CONFIRMATION_BRIDGE =
  "__ipoOneM1BOperationalOfferDenialConfirmation";

const HASH = /^0x[0-9a-f]{64}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RESOURCE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const BRIDGE_INPUT_KEYS = Object.freeze([
  "schemaVersion",
  "operationId",
  "resourceId",
  "expectedOfferHash",
  "expectedTermsHash",
  "disclosureRef",
  "requestId"
]);
const CONFIRMATION_KEYS = Object.freeze([
  "actionType",
  "resourceId",
  "resourceHash",
  "payloadHash",
  "requestId",
  "requestNonce",
  "requestedAt",
  "confirmedAt",
  "expiresAt",
  "confirmationMethod",
  "confirmationHash",
  "messageHash",
  "rawSignaturePersisted",
  "blockchainTransactionSubmitted",
  "schemaVersion"
]);

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function exactKeys(value, keys) {
  return plainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function isLoopbackLocation(location) {
  return location?.protocol === "http:" &&
    new Set(["127.0.0.1", "localhost"]).has(location?.hostname);
}

function validReference(value) {
  return typeof value === "string" &&
    value.length >= 8 && value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !/^data:/i.test(value);
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertInput(input) {
  if (
    !exactKeys(input, BRIDGE_INPUT_KEYS) ||
    input.schemaVersion !== "m1_b_operational_offer_denial_confirmation_request.v1" ||
    input.operationId !== "pilotAcceptCreditOffer" ||
    !RESOURCE_IDENTIFIER.test(input.resourceId ?? "") ||
    !HASH.test(input.expectedOfferHash ?? "") ||
    !HASH.test(input.expectedTermsHash ?? "") ||
    !validReference(input.disclosureRef) ||
    !REQUEST_IDENTIFIER.test(input.requestId ?? "")
  ) {
    throw Object.assign(
      new Error("The exact denied Offer confirmation request is invalid."),
      { code: "m1_b_operational_denial_confirmation_invalid" }
    );
  }
}

function assertConfirmation(value, input, payloadHash) {
  if (
    !exactKeys(value, CONFIRMATION_KEYS) ||
    value.actionType !== "accept_offer" ||
    value.resourceId !== input.resourceId ||
    value.resourceHash !== input.expectedOfferHash ||
    value.payloadHash !== payloadHash ||
    value.requestId !== input.requestId ||
    value.confirmationMethod !== "wallet_personal_sign" ||
    !/^human_action_confirmation_[0-9a-f-]{36}$/.test(value.requestNonce ?? "") ||
    !validTimestamp(value.requestedAt) ||
    !validTimestamp(value.confirmedAt) ||
    !validTimestamp(value.expiresAt) ||
    !HASH.test(value.confirmationHash ?? "") ||
    !HASH.test(value.messageHash ?? "") ||
    value.rawSignaturePersisted !== false ||
    value.blockchainTransactionSubmitted !== false ||
    value.schemaVersion !== "economic_action_confirmation_result.v1"
  ) {
    throw Object.assign(
      new Error("The wallet confirmation did not bind the exact denied Offer request."),
      { code: "m1_b_operational_denial_confirmation_invalid" }
    );
  }
}

export function createM1BOperationalOfferDenialConfirmationBridge({
  location,
  getRuntimeState,
  requestEconomicActionConfirmation,
  sha256Hex
}) {
  if (
    !isLoopbackLocation(location) ||
    typeof getRuntimeState !== "function" ||
    typeof requestEconomicActionConfirmation !== "function" ||
    typeof sha256Hex !== "function"
  ) {
    throw Object.assign(
      new Error("The local denied Offer confirmation bridge is unavailable."),
      { code: "m1_b_operational_denial_bridge_unavailable" }
    );
  }
  return Object.freeze(async (input) => {
    assertInput(input);
    const runtime = getRuntimeState();
    if (
      !exactKeys(runtime, [
        "connected",
        "authenticationMethod",
        "authenticationProfile",
        "workspaceKind",
        "walletAuthorityAvailable"
      ]) ||
      runtime.connected !== true ||
      runtime.authenticationMethod !== "siwe" ||
      runtime.authenticationProfile !== "local_no_funds" ||
      runtime.workspaceKind !== "human_borrower" ||
      runtime.walletAuthorityAvailable !== true
    ) {
      throw Object.assign(
        new Error("A fresh local SIWE wallet session is required."),
        { code: "m1_b_operational_denial_siwe_required" }
      );
    }
    const payloadHash = await sha256Hex(JSON.stringify({
      expectedOfferHash: input.expectedOfferHash,
      expectedTermsHash: input.expectedTermsHash,
      disclosureRef: input.disclosureRef,
      sandboxOnly: true,
      productionFundsAuthority: false
    }));
    const confirmation = await requestEconomicActionConfirmation({
      actionType: "accept_offer",
      title: "Confirm fail-closed Offer probe",
      resourceId: input.resourceId,
      resourceHash: input.expectedOfferHash,
      payloadHash,
      requestId: input.requestId,
      effect: "Attempt this exact unavailable sandbox Offer; the expected result is denial with no economic effect."
    });
    if (!confirmation) {
      throw Object.assign(
        new Error("Wallet confirmation was cancelled. Nothing was submitted."),
        { code: "m1_b_operational_denial_confirmation_cancelled" }
      );
    }
    assertConfirmation(confirmation, input, payloadHash);
    return Object.freeze({ ...confirmation });
  });
}

export function installM1BOperationalOfferDenialConfirmationBridge({
  globalObject,
  ...dependencies
}) {
  if (
    !globalObject ||
    typeof globalObject !== "object" ||
    Object.hasOwn(globalObject, M1_B_OPERATIONAL_DENIAL_CONFIRMATION_BRIDGE)
  ) {
    throw Object.assign(
      new Error("The local denied Offer confirmation bridge cannot be installed."),
      { code: "m1_b_operational_denial_bridge_unavailable" }
    );
  }
  const bridge = createM1BOperationalOfferDenialConfirmationBridge(dependencies);
  Object.defineProperty(globalObject, M1_B_OPERATIONAL_DENIAL_CONFIRMATION_BRIDGE, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: bridge
  });
  return bridge;
}
