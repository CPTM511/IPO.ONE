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
      maximum: 4_096,
      pattern: /^0x[0-9a-fA-F]+$/
    });
    let verified = false;
    try {
      verified = await this.signatureVerifier.verify({
        address: transaction.address,
        chainId: transaction.chainId,
        message: transaction.message,
        signature: checkedSignature
      });
    } catch {
      verified = false;
    }
    if (verified !== true) {
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
      amr: ["wallet", "siwe"],
      now
    });
  }
}
