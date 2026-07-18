import { createHmac } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import {
  createAgentAccountBindingTypedData,
  normalizeEvmCaip10
} from "../../../modules/chain-adapter/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const APPROVED_CHAINS = new Set(["eip155:84532", "eip155:1952"]);
const LEGACY_LOCAL_TENANT_ID = "tenant_ipo_one_local_pilot";
const CHALLENGE_KEYS = Object.freeze([
  "accountHash",
  "chainId",
  "challengeId",
  "expiresAt",
  "issuedAt",
  "nonce",
  "oneUse",
  "protocolVersion",
  "purpose",
  "schemaVersion",
  "subjectId",
  "typedData",
  "typedDataHash"
]);

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function invalidChallenge() {
  throw new DomainError(
    "invalid_private_pilot_agent_challenge",
    "Agent account challenge is not an approved IPO.ONE private-pilot request"
  );
}

export function derivePrivatePilotAgentAccount(secret, { tenantId = "tenant_ipo_one_local_pilot" } = {}) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) {
    throw new DomainError("invalid_private_pilot_secret", "Private pilot secret is invalid");
  }
  if (typeof tenantId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,127}$/.test(tenantId)) {
    throw new DomainError("invalid_private_pilot_profile", "Private pilot Tenant ID is invalid");
  }
  const tenantBound = tenantId !== LEGACY_LOCAL_TENANT_ID;
  for (let counter = 0; counter < 256; counter += 1) {
    const derivation = createHmac("sha256", secret)
      .update(tenantBound
        ? "IPO_ONE_PRIVATE_PILOT_AGENT_KEY_V2_TENANT_BOUND"
        : "IPO_ONE_PRIVATE_PILOT_AGENT_KEY_V1")
      .update("\0");
    if (tenantBound) derivation.update(tenantId).update("\0");
    const privateKey = `0x${derivation.update(String(counter)).digest("hex")}`;
    try {
      const account = privateKeyToAccount(privateKey);
      return Object.freeze({
        address: account.address,
        accountIds: Object.freeze(Object.fromEntries(
          [...APPROVED_CHAINS].map((chainId) => [
            chainId,
            `${chainId}:${account.address.toLowerCase()}`
          ])
        )),
        signTypedData: account.signTypedData
      });
    } catch {
      // A digest outside the secp256k1 scalar range is deterministically skipped.
    }
  }
  throw new DomainError("private_pilot_agent_key_unavailable", "Unable to derive local Agent key");
}

export function preparePrivatePilotAgentProof(challenge, account, { now = new Date() } = {}) {
  if (
    !exactKeys(challenge, CHALLENGE_KEYS) ||
    challenge.schemaVersion !== "tenant_agent_account_challenge_created.v1" ||
    challenge.oneUse !== true ||
    challenge.protocolVersion !== "1.1" ||
    !APPROVED_CHAINS.has(challenge.chainId) ||
    typeof challenge.challengeId !== "string" ||
    !/^agent_account_challenge_[0-9a-f-]{36}$/.test(challenge.challengeId) ||
    typeof challenge.subjectId !== "string" ||
    !/^subject_[0-9a-f-]{36}$/.test(challenge.subjectId) ||
    !challenge.typedData ||
    typeof challenge.typedData !== "object" ||
    Array.isArray(challenge.typedData) ||
    !challenge.typedData.message ||
    new Date(challenge.expiresAt).getTime() <= now.getTime()
  ) invalidChallenge();

  const accountId = account.accountIds?.[challenge.chainId];
  if (typeof accountId !== "string") invalidChallenge();
  const normalized = normalizeEvmCaip10(accountId, challenge.chainId);
  if (normalized.accountHash !== challenge.accountHash) invalidChallenge();
  const prepared = createAgentAccountBindingTypedData({
    chainId: challenge.chainId,
    tenantHash: challenge.typedData.message.tenantHash,
    subjectHash: challenge.typedData.message.subjectHash,
    accountHash: challenge.accountHash,
    purpose: challenge.purpose,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    protocolVersion: challenge.protocolVersion
  });
  if (prepared.typedDataHash !== challenge.typedDataHash) invalidChallenge();
  return Object.freeze({
    accountId: normalized.accountId,
    challengeId: challenge.challengeId,
    subjectId: challenge.subjectId,
    typedData: prepared.typedData
  });
}
