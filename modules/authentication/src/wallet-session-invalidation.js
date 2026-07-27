import {
  assertBoundedString,
  authenticationError
} from "./security-utils.js";

export const WALLET_SESSION_INVALIDATION_SCHEMA_VERSION =
  "wallet_session_invalidation_result.v1";

export const WalletSessionInvalidationReason = Object.freeze({
  HUMAN_LOGOUT: "human_logout",
  ACCOUNT_CHANGED: "wallet_account_changed",
  CHAIN_CHANGED: "wallet_chain_changed",
  PROVIDER_CHANGED: "wallet_provider_changed",
  PROVIDER_DISCONNECTED: "wallet_provider_disconnected"
});

const REASONS = new Set(Object.values(WalletSessionInvalidationReason));
const RESULT = Object.freeze({
  schemaVersion: WALLET_SESSION_INVALIDATION_SCHEMA_VERSION,
  status: "invalidated",
  reauthenticationRequired: true,
  authorityAvailable: false,
  credentialsIncluded: false,
  fundsAuthority: false
});

export function assertWalletSessionInvalidationReason(value) {
  const reason = assertBoundedString("wallet invalidation reason", value, {
    maximum: 96,
    pattern: /^[a-z][a-z0-9_]+$/
  });
  if (!REASONS.has(reason)) {
    throw authenticationError(
      "authentication_input_rejected",
      "wallet invalidation reason is invalid"
    );
  }
  return reason;
}

export function assertWalletSessionInvalidationIdempotencyKey(value) {
  return assertBoundedString("wallet invalidation idempotency key", value, {
    minimum: 32,
    maximum: 128,
    pattern: /^[A-Za-z0-9_-]+$/
  });
}

export function walletSessionInvalidationResult() {
  return RESULT;
}
