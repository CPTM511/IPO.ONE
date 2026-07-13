import { abuseError, assertAbuseHash, deepFreezeAbuse } from "./abuse-utils.js";

const trustedNetworkContexts = new WeakSet();
const trustedAccountContexts = new WeakSet();
const NETWORK_SOURCES = new Set(["verified_proxy", "direct_socket", "local_test"]);
const ACCOUNT_SOURCES = new Set(["normalized_login_identifier", "recovery_identifier", "local_test"]);

function createHashedContext({ value, source, allowedSources, trustedSet, schemaVersion }) {
  if (!allowedSources.has(source)) {
    throw abuseError("invalid_abuse_control_input", "context source is not trusted");
  }
  const context = deepFreezeAbuse({
    referenceHash: assertAbuseHash("referenceHash", value),
    source,
    schemaVersion
  });
  trustedSet.add(context);
  return context;
}

export function createTrustedNetworkContext({ networkRefHash, source }) {
  return createHashedContext({
    value: networkRefHash,
    source,
    allowedSources: NETWORK_SOURCES,
    trustedSet: trustedNetworkContexts,
    schemaVersion: "trusted_network_context.v1"
  });
}

export function assertTrustedNetworkContext(context) {
  if (!context || typeof context !== "object" || !trustedNetworkContexts.has(context)) {
    throw abuseError(
      "trusted_network_context_required",
      "a server-created trusted network context is required"
    );
  }
  return context;
}

export function createTrustedAccountContext({ accountRefHash, source }) {
  return createHashedContext({
    value: accountRefHash,
    source,
    allowedSources: ACCOUNT_SOURCES,
    trustedSet: trustedAccountContexts,
    schemaVersion: "trusted_account_context.v1"
  });
}

export function assertTrustedAccountContext(context) {
  if (!context || typeof context !== "object" || !trustedAccountContexts.has(context)) {
    throw abuseError(
      "trusted_account_context_required",
      "a server-created trusted account context is required"
    );
  }
  return context;
}
