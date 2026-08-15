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
  connector,
  source,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (
    connector === null ||
    connector === undefined ||
    typeof connector !== "object"
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
    if (typeof connector.disconnect === "function") {
      const result = await bounded(() => connector.disconnect({
        revokePermissions: source !== "mobile_walletconnect"
      }), timeoutMs);
      if (result === TIMEOUT) return releaseResult("app_state_cleared");
      if (new Set([
        "wallet_disconnected",
        "account_permission_revoked",
        "app_state_cleared"
      ]).has(result?.status)) {
        return releaseResult(result.status);
      }
    }
  } catch {
    // Not every injected EIP-1193 wallet implements programmatic revocation.
  }
  return releaseResult("app_state_cleared");
}
