export const AUTHENTICATION_AVAILABILITY_PRESENTATION_SCHEMA_VERSION =
  "authentication_availability_presentation.v1";

const OPTIONS_STATES = new Set(["checking", "ready", "failed"]);
const WALLET_PROVIDER_STATES = new Set(["discovering", "ready", "disposed"]);
const WALLET_AUTHORITY_STATES = new Set([
  "available",
  "invalidated",
  "pending",
  "unavailable"
]);
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;

function safeProviderIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((item) => typeof item === "string" && PROVIDER_ID.test(item))
    .sort((left, right) => left.localeCompare(right, "en"))
    .slice(0, 8);
}

function providerPresentation(providerId) {
  if (providerId === "google") {
    return Object.freeze({
      providerId,
      label: "Continue with Google",
      detail: "Use your existing Google Account"
    });
  }
  if (providerId === "email") {
    return Object.freeze({
      providerId,
      label: "Continue with email",
      detail: "Passwordless email through the approved identity provider"
    });
  }
  return Object.freeze({
    providerId,
    label: "Continue with approved account",
    detail: `Use the configured ${providerId} identity provider`
  });
}

export function createAuthenticationAvailabilityPresentation(input = {}) {
  const optionsState = OPTIONS_STATES.has(input.optionsState)
    ? input.optionsState
    : "failed";
  const walletProviderState = WALLET_PROVIDER_STATES.has(input.walletProviderState)
    ? input.walletProviderState
    : "disposed";
  const walletAuthorityState = WALLET_AUTHORITY_STATES.has(input.walletAuthorityState)
    ? input.walletAuthorityState
    : "unavailable";
  const authenticated = input.authenticated === true;
  const localSessionEnded = input.localSessionEnded === true;
  const optionsBusy = input.optionsBusy === true;
  const providerIds = optionsState === "ready" && input.oidcAuthenticationEnabled === true
    ? safeProviderIds(input.oidcProviderIds)
    : [];
  const walletConfigured =
    optionsState === "ready" && input.walletAuthenticationEnabled === true;
  const walletProviderCount = Number.isSafeInteger(input.walletProviderCount) &&
    input.walletProviderCount > 0
    ? Math.min(input.walletProviderCount, 16)
    : 0;
  const selectedWalletProvider =
    walletProviderCount > 0 && input.selectedWalletProvider === true;
  const walletDiscoveryComplete = walletProviderState === "ready";
  const walletCanAuthenticate =
    walletAuthorityState === "available" || walletAuthorityState === "invalidated";
  const walletAuthorityPending = walletAuthorityState === "pending";
  const walletAuthorityUnavailable = walletAuthorityState === "unavailable";
  const walletAuthorityCanRetry = input.walletAuthorityCanRetry === true;
  const showSignInMethods = !authenticated && !localSessionEnded;
  const walletReconnectSession =
    authenticated && input.walletSession === true && walletConfigured;
  const showWalletSurface =
    (showSignInMethods || walletReconnectSession) && walletConfigured;
  const oidcProviders = showSignInMethods
    ? providerIds.map(providerPresentation)
    : [];
  const showWalletPicker =
    showWalletSurface && !walletAuthorityPending && !walletAuthorityUnavailable && walletProviderCount > 0;
  const showWalletSignIn =
    showWalletPicker && selectedWalletProvider && walletCanAuthenticate;
  const showNetworks = showWalletSignIn;
  const showWalletRediscovery =
    showWalletSurface && !walletAuthorityPending && !walletAuthorityUnavailable &&
    walletDiscoveryComplete && walletProviderCount === 0;
  const showWalletAuthorityRetry =
    showWalletSurface && walletAuthorityUnavailable && walletAuthorityCanRetry;
  const noConfiguredMethods =
    showSignInMethods && optionsState === "ready" && providerIds.length === 0 && !walletConfigured;
  const showOptionsRetry =
    showSignInMethods && (optionsState === "failed" || noConfiguredMethods);
  const showAccessDiagnostics =
    showOptionsRetry || showWalletRediscovery ||
    (walletAuthorityUnavailable && showWalletSurface);

  let recoveryKind = "none";
  let status = "Choose one available sign-in method.";
  if (optionsState === "checking") {
    recoveryKind = "checking_options";
    status = "Checking available sign-in methods…";
  } else if (optionsState === "failed" && showOptionsRetry) {
    recoveryKind = "options_failed";
    status = "IPO.ONE could not verify the available sign-in methods.";
  } else if (walletAuthorityPending && showWalletSurface) {
    recoveryKind = "wallet_authority_pending";
    status = "Protected work is paused while the previous wallet session is safely invalidated.";
  } else if (walletAuthorityUnavailable && showWalletSurface) {
    recoveryKind = "wallet_authority_unavailable";
    status = showWalletAuthorityRetry
      ? "IPO.ONE could not confirm that the previous wallet session was invalidated."
      : "This tab cannot safely retry the previous wallet-session reset. Return to the tab where the wallet changed.";
  } else if (walletConfigured && walletProviderState === "discovering") {
    recoveryKind = "discovering_wallets";
    status = oidcProviders.length > 0
      ? "Account sign-in is ready. Checking this browser for compatible wallets…"
      : "Checking this browser for compatible wallets…";
  } else if (showWalletRediscovery) {
    recoveryKind = "wallet_unavailable";
    status = "No compatible wallet is open in this browser.";
  } else if (showWalletPicker && !selectedWalletProvider) {
    recoveryKind = "select_wallet";
    status = "Select one discovered wallet. Selection alone requests no account or signature.";
  } else if (selectedWalletProvider && !walletCanAuthenticate) {
    recoveryKind = "wallet_authority_blocked";
    status = "Wallet sign-in remains blocked while the previous session authority is safely invalidated.";
  } else if (showWalletSignIn) {
    status = "Wallet selected. Choose an approved test network, then sign in.";
  } else if (noConfiguredMethods) {
    recoveryKind = "no_methods";
    status = "No public Beta sign-in method is currently available.";
  }

  return Object.freeze({
    schemaVersion: AUTHENTICATION_AVAILABILITY_PRESENTATION_SCHEMA_VERSION,
    optionsState,
    optionsBusy,
    oidcProviders: Object.freeze(oidcProviders),
    walletConfigured,
    walletProviderCount,
    showWalletPicker,
    showWalletSignIn,
    walletCanAuthenticate,
    showNetworks,
    showWalletRediscovery,
    showWalletAuthorityRetry,
    showOptionsRetry,
    showAccessDiagnostics,
    showSignedOutPrimaryAction: !authenticated && !localSessionEnded && optionsState !== "checking",
    recoveryKind,
    status,
    nonAuthorizing: true,
    fundsAuthority: false
  });
}

export function createAccessSupportDiagnostic(input = {}) {
  const requestId = typeof input.requestId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.requestId)
    ? input.requestId
    : "unavailable";
  const errorCode = typeof input.errorCode === "string" &&
    /^[a-z][a-z0-9_.:-]{1,127}$/.test(input.errorCode)
    ? input.errorCode
    : "authentication_unavailable";
  const origin = typeof input.origin === "string" &&
    /^https?:\/\/(?:127\.0\.0\.1|localhost|\[[0-9a-f:]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?$/.test(input.origin)
    ? input.origin
    : "unavailable";
  const workspace = typeof input.workspace === "string" &&
    /^[a-z][A-Za-z0-9]{1,63}$/.test(input.workspace)
    ? input.workspace
    : "unavailable";
  const observedAt = typeof input.observedAt === "string" &&
    !Number.isNaN(Date.parse(input.observedAt))
    ? new Date(input.observedAt).toISOString()
    : "unavailable";
  const walletProviderState = WALLET_PROVIDER_STATES.has(input.walletProviderState)
    ? input.walletProviderState
    : "unavailable";
  const walletProviderCount = Number.isSafeInteger(input.walletProviderCount) &&
    input.walletProviderCount >= 0
    ? Math.min(input.walletProviderCount, 16)
    : 0;

  return Object.freeze({
    schemaVersion: "ipo_one_access_support_diagnostic.v1",
    origin,
    workspace,
    optionsState: OPTIONS_STATES.has(input.optionsState) ? input.optionsState : "failed",
    errorCode,
    requestId,
    walletProviderState,
    walletProviderCount,
    observedAt,
    instruction: "Send this privacy-safe diagnostic to IPO.ONE support.",
    credentialsIncluded: false,
    privateResourceIdentifiersIncluded: false,
    fundsAuthority: false
  });
}
