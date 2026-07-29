const WALLET_RELEASE_RESULT_SCHEMA_VERSION = "wallet_release_result.v1";
const DEFAULT_TIMEOUT_MS = 1_500;
const TIMEOUT = Symbol("wallet-release-timeout");

function releaseResult(status) {
  return Object.freeze({
    schemaVersion: WALLET_RELEASE_RESULT_SCHEMA_VERSION,
    status,
    accountDataRetained: false,
    credentialsIncluded: false,
    fundsAuthority: false
  });
}

async function bounded(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve) => {
        timer = globalThis.setTimeout(() => resolve(TIMEOUT), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}

export async function releaseSelectedWallet({
  provider,
  source,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (
    provider === null ||
    provider === undefined ||
    (typeof provider !== "object" && typeof provider !== "function")
  ) {
    return releaseResult("no_wallet_selected");
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 5_000
  ) {
    throw new TypeError("Wallet release timeout is invalid");
  }

  try {
    if (
      source === "mobile_walletconnect" &&
      typeof provider.disconnect === "function"
    ) {
      const result = await bounded(() => provider.disconnect(), timeoutMs);
      return releaseResult(
        result === TIMEOUT ? "app_state_cleared" : "wallet_disconnected"
      );
    }
    if (typeof provider.request === "function") {
      const result = await bounded(
        () => provider.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }]
        }),
        timeoutMs
      );
      return releaseResult(
        result === TIMEOUT
          ? "app_state_cleared"
          : "account_permission_revoked"
      );
    }
  } catch {
    // Not every injected EIP-1193 wallet implements programmatic revocation.
  }
  return releaseResult("app_state_cleared");
}
