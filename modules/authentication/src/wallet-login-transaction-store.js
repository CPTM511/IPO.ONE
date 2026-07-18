import { randomBytes } from "node:crypto";
import { createSiweMessage } from "viem/siwe";
import { getAddress } from "viem";
import {
  assertBoundedString,
  authenticationError,
  randomOpaqueValue
} from "./security-utils.js";

const APPROVED_CHAIN_IDS = new Set([84532, 1952]);

function exactHttpsUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return parsed;
}

function normalizeAddress(value) {
  try {
    return getAddress(assertBoundedString("wallet address", value, {
      minimum: 42,
      maximum: 42,
      pattern: /^0x[0-9a-fA-F]{40}$/
    }));
  } catch {
    throw authenticationError("invalid_authentication_input", "wallet address is invalid");
  }
}

function normalizeChainId(value) {
  if (!Number.isSafeInteger(value) || !APPROVED_CHAIN_IDS.has(value)) {
    throw authenticationError("wallet_chain_rejected", "wallet chain is not approved");
  }
  return value;
}

export class InMemoryWalletLoginTransactionStore {
  #transactions = new Map();

  constructor({
    referenceHasher,
    domain,
    uri,
    statement = "Sign in to the IPO.ONE no-funds credit workspace.",
    ttlMs = 5 * 60_000,
    maximumTransactions = 1_000
  }) {
    if (!referenceHasher?.hash) {
      throw authenticationError("invalid_authentication_configuration", "referenceHasher is required");
    }
    const parsedUri = exactHttpsUrl("wallet login URI", uri);
    if (parsedUri.host !== domain || parsedUri.origin !== `https://${domain}`) {
      throw authenticationError("invalid_authentication_configuration", "wallet login origin is invalid");
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 10 * 60_000) {
      throw authenticationError("invalid_authentication_configuration", "wallet login lifetime is invalid");
    }
    if (!Number.isSafeInteger(maximumTransactions) || maximumTransactions < 1 || maximumTransactions > 10_000) {
      throw authenticationError("invalid_authentication_configuration", "wallet login capacity is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.domain = domain;
    this.uri = parsedUri.href;
    this.statement = assertBoundedString("wallet login statement", statement, { maximum: 256 });
    this.ttlMs = ttlMs;
    this.maximumTransactions = maximumTransactions;
  }

  create({ address, chainId, now = new Date() }) {
    this.#prune(now);
    if (this.#transactions.size >= this.maximumTransactions) {
      throw authenticationError("wallet_transaction_capacity_exceeded", "wallet login capacity is exhausted");
    }
    const checkedAddress = normalizeAddress(address);
    const checkedChainId = normalizeChainId(chainId);
    const handle = randomOpaqueValue();
    const nonce = randomBytes(16).toString("hex");
    const expirationTime = new Date(now.getTime() + this.ttlMs);
    const message = createSiweMessage({
      address: checkedAddress,
      chainId: checkedChainId,
      domain: this.domain,
      expirationTime,
      issuedAt: now,
      nonce,
      statement: this.statement,
      uri: this.uri,
      version: "1"
    });
    const reference = this.referenceHasher.hash("siwe.transaction", handle);
    this.#transactions.set(reference, {
      address: checkedAddress,
      chainId: checkedChainId,
      message,
      expiresAt: expirationTime.toISOString()
    });
    return Object.freeze({
      handle,
      address: checkedAddress,
      chainId: checkedChainId,
      message,
      expiresAt: expirationTime.toISOString()
    });
  }

  consume({ handle, now = new Date() }) {
    const reference = this.referenceHasher.hash(
      "siwe.transaction",
      assertBoundedString("wallet transaction handle", handle, { minimum: 32, maximum: 128 })
    );
    const transaction = this.#transactions.get(reference);
    this.#transactions.delete(reference);
    if (!transaction || new Date(transaction.expiresAt) <= now) {
      throw authenticationError("wallet_transaction_rejected", "wallet login transaction is not active");
    }
    return Object.freeze({ ...transaction });
  }

  #prune(now) {
    for (const [reference, transaction] of this.#transactions) {
      if (new Date(transaction.expiresAt) <= now) this.#transactions.delete(reference);
    }
  }
}

export { APPROVED_CHAIN_IDS };
