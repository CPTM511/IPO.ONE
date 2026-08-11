import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "./constants.js";
import {
  assertBoundedString,
  assertSafeIdentifier,
  authenticationError
} from "./security-utils.js";

const HUMAN_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);
const EIP191_VERIFICATION_METHODS = new Set([
  "eip191_eoa_v1",
  "eip1271_eip191_v1",
  "eip6492_eip191_v1"
]);

function exactHttpsOrigin(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return parsed.origin;
}

function acceptedWalletVerification(value, transaction) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== "wallet_signature_verification.v1" ||
    value.chainId !== `eip155:${transaction.chainId}` ||
    !new Set(["eoa", "contract", "counterfactual"]).has(value.walletType) ||
    !new Set(["eoa", "erc1271", "erc6492"]).has(value.signatureType) ||
    !EIP191_VERIFICATION_METHODS.has(value.verificationMethod) ||
    (
      value.walletType === "eoa" &&
      value.verificationMethod !== "eip191_eoa_v1"
    ) ||
    (
      value.walletType === "contract" &&
      value.verificationMethod !== "eip1271_eip191_v1"
    ) ||
    (
      value.walletType === "counterfactual" &&
      (
        value.signatureType !== "erc6492" ||
        value.verificationMethod !== "eip6492_eip191_v1"
      )
    ) ||
    (value.walletType === "eoa" && value.signatureType !== "eoa") ||
    (value.walletType === "contract" && value.signatureType !== "erc1271") ||
    value.authenticationEligible !== true ||
    value.rawSignaturePersisted !== false ||
    value.credentialsIncluded !== false ||
    value.productionFundsMoved !== false
  ) {
    throw authenticationError(
      "wallet_signature_rejected",
      "wallet signature verification result is not eligible for authentication"
    );
  }
  return value;
}

export class HumanWalletBff {
  constructor({
    issuer,
    tenantId,
    clientId,
    transactionStore,
    sessionStore,
    credentialRegistry,
    referenceHasher,
    signatureVerifier
  }) {
    if (
      !transactionStore?.create ||
      !transactionStore?.consume ||
      !sessionStore?.create ||
      !credentialRegistry?.findBySubject ||
      !referenceHasher?.hash ||
      typeof signatureVerifier?.verify !== "function"
    ) {
      throw authenticationError("invalid_authentication_configuration", "Human wallet BFF adapters are required");
    }
    this.issuer = exactHttpsOrigin("wallet issuer", issuer);
    this.tenantId = assertSafeIdentifier("tenantId", tenantId);
    this.clientId = assertSafeIdentifier("clientId", clientId);
    this.transactionStore = transactionStore;
    this.sessionStore = sessionStore;
    this.credentialRegistry = credentialRegistry;
    this.referenceHasher = referenceHasher;
    this.signatureVerifier = signatureVerifier;
  }

  async beginLogin(input) {
    return this.transactionStore.create(input);
  }

  async completeLogin({ transactionHandle, signature, now = new Date() }) {
    const transaction = await this.transactionStore.consume({ handle: transactionHandle, now });
    const checkedSignature = assertBoundedString("wallet signature", signature, {
      minimum: 132,
      maximum: 8_194,
      pattern: /^0x(?:[0-9a-fA-F]{2}){65,4096}$/
    });
    let verification;
    try {
      verification = acceptedWalletVerification(
        await this.signatureVerifier.verify({
          address: transaction.address,
          chainId: transaction.chainId,
          message: transaction.message,
          signature: checkedSignature
        }),
        transaction
      );
    } catch {
      verification = undefined;
    }
    if (verification === undefined) {
      throw authenticationError("wallet_signature_rejected", "wallet signature verification failed");
    }
    const credential = await this.credentialRegistry.findBySubject({
      issuer: this.issuer,
      tenantId: this.tenantId,
      externalSubject: `eip155:${transaction.chainId}:${transaction.address.toLowerCase()}`,
      clientId: this.clientId,
      now
    });
    if (
      !HUMAN_ACTOR_TYPES.has(credential.actorType) ||
      credential.clientAuthenticationMethod !== ClientAuthenticationMethod.SIWE ||
      credential.senderConstraint.method !== SenderConstraintMethod.HOST_SESSION
    ) {
      throw authenticationError("authentication_binding_rejected", "wallet is not bound to an active Human credential");
    }
    return this.sessionStore.create({
      tenantId: credential.tenantId,
      actorId: credential.actorId,
      actorType: credential.actorType,
      clientId: credential.clientId,
      credentialId: credential.credentialId,
      credentialVersion: credential.version,
      policyVersion: credential.policyVersion,
      capabilities: credential.allowedCapabilities,
      roles: credential.roles,
      tokenJtiHash: this.referenceHasher.hash("siwe.signature", checkedSignature),
      authenticationMethod: ClientAuthenticationMethod.SIWE,
      authTime: now,
      acr: "urn:ipo.one:acr:wallet",
      amr: ["wallet", "siwe", verification.verificationMethod],
      now
    });
  }
}
