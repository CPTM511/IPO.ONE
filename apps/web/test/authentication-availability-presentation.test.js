import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHENTICATION_AVAILABILITY_PRESENTATION_SCHEMA_VERSION,
  createAccessSupportDiagnostic,
  createAuthenticationAvailabilityPresentation
} from "../src/authentication-availability-presentation.js";

function presentation(overrides = {}) {
  return createAuthenticationAvailabilityPresentation({
    optionsState: "ready",
    oidcAuthenticationEnabled: true,
    oidcProviderIds: [],
    walletAuthenticationEnabled: false,
    walletProviderState: "ready",
    walletProviderCount: 0,
    selectedWalletProvider: false,
    walletAuthorityState: "available",
    authenticated: false,
    localSessionEnded: false,
    ...overrides
  });
}

test("checking and failed options expose no stale method", () => {
  const checking = presentation({
    optionsState: "checking",
    oidcProviderIds: ["google"],
    walletAuthenticationEnabled: true,
    walletProviderCount: 1,
    selectedWalletProvider: true
  });
  assert.equal(checking.schemaVersion, AUTHENTICATION_AVAILABILITY_PRESENTATION_SCHEMA_VERSION);
  assert.deepEqual(checking.oidcProviders, []);
  assert.equal(checking.showWalletSignIn, false);
  assert.equal(checking.showNetworks, false);
  assert.equal(checking.showOptionsRetry, false);
  assert.equal(checking.recoveryKind, "checking_options");

  const failed = presentation({
    optionsState: "failed",
    oidcProviderIds: ["google"],
    walletAuthenticationEnabled: true,
    walletProviderCount: 1,
    selectedWalletProvider: true
  });
  assert.deepEqual(failed.oidcProviders, []);
  assert.equal(failed.showWalletSignIn, false);
  assert.equal(failed.showOptionsRetry, true);
  assert.equal(failed.showAccessDiagnostics, true);
  assert.equal(failed.recoveryKind, "options_failed");
});

test("OIDC methods reflect only safe exact server provider identifiers", () => {
  const result = presentation({
    oidcProviderIds: ["email", "google", "partner_oidc", "google", "bad provider"]
  });
  assert.deepEqual(result.oidcProviders, [
    {
      providerId: "email",
      label: "Continue with email",
      detail: "Passwordless email through the approved identity provider"
    },
    {
      providerId: "google",
      label: "Continue with Google",
      detail: "Use your existing Google Account"
    },
    {
      providerId: "partner_oidc",
      label: "Continue with approved account",
      detail: "Use the configured partner_oidc identity provider"
    }
  ]);
  assert.equal(result.showWalletPicker, false);
  assert.equal(result.showNetworks, false);

  const disabled = presentation({
    oidcAuthenticationEnabled: false,
    oidcProviderIds: ["google"]
  });
  assert.deepEqual(disabled.oidcProviders, []);
});

test("wallet prerequisites never become a disabled sign-in action", () => {
  const discovering = presentation({
    walletAuthenticationEnabled: true,
    walletProviderState: "discovering"
  });
  assert.equal(discovering.recoveryKind, "discovering_wallets");
  assert.equal(discovering.showWalletSignIn, false);
  assert.equal(discovering.showWalletRediscovery, false);

  const none = presentation({ walletAuthenticationEnabled: true });
  assert.equal(none.recoveryKind, "wallet_unavailable");
  assert.equal(none.showWalletRediscovery, true);
  assert.equal(none.showWalletSignIn, false);
  assert.equal(none.showNetworks, false);

  const unselected = presentation({
    walletAuthenticationEnabled: true,
    walletProviderCount: 2
  });
  assert.equal(unselected.recoveryKind, "select_wallet");
  assert.equal(unselected.showWalletPicker, true);
  assert.equal(unselected.showWalletSignIn, false);
  assert.equal(unselected.showNetworks, false);

  const selected = presentation({
    walletAuthenticationEnabled: true,
    walletProviderCount: 2,
    selectedWalletProvider: true
  });
  assert.equal(selected.showWalletPicker, true);
  assert.equal(selected.showWalletSignIn, true);
  assert.equal(selected.showNetworks, true);

  const quarantined = presentation({
    walletAuthenticationEnabled: true,
    walletProviderCount: 2,
    selectedWalletProvider: true,
    walletAuthorityState: "pending"
  });
  assert.equal(quarantined.recoveryKind, "wallet_authority_pending");
  assert.equal(quarantined.showWalletSignIn, false);

  const unavailable = presentation({
    walletAuthenticationEnabled: true,
    walletProviderCount: 2,
    selectedWalletProvider: true,
    walletAuthorityState: "unavailable",
    walletAuthorityCanRetry: true
  });
  assert.equal(unavailable.recoveryKind, "wallet_authority_unavailable");
  assert.equal(unavailable.showWalletPicker, false);
  assert.equal(unavailable.showWalletAuthorityRetry, true);
  assert.equal(unavailable.showAccessDiagnostics, true);

  const otherTabUnavailable = presentation({
    walletAuthenticationEnabled: true,
    walletProviderCount: 2,
    selectedWalletProvider: true,
    walletAuthorityState: "unavailable",
    walletAuthorityCanRetry: false
  });
  assert.equal(otherTabUnavailable.recoveryKind, "wallet_authority_unavailable");
  assert.equal(otherTabUnavailable.showWalletAuthorityRetry, false);
  assert.equal(otherTabUnavailable.showAccessDiagnostics, true);

  const pending = presentation({
    walletAuthenticationEnabled: true,
    walletProviderCount: 2,
    selectedWalletProvider: true,
    walletAuthorityState: "pending"
  });
  assert.equal(pending.recoveryKind, "wallet_authority_pending");
  assert.equal(pending.showWalletPicker, false);
  assert.equal(pending.showWalletAuthorityRetry, false);
});

test("authenticated and explicitly ended sessions do not advertise new methods", () => {
  for (const input of [{ authenticated: true }, { localSessionEnded: true }]) {
    const result = presentation({
      oidcProviderIds: ["google"],
      walletAuthenticationEnabled: true,
      walletProviderCount: 1,
      selectedWalletProvider: true,
      ...input
    });
    assert.deepEqual(result.oidcProviders, []);
    assert.equal(result.showWalletPicker, false);
    assert.equal(result.showWalletSignIn, false);
    assert.equal(result.showOptionsRetry, false);
    assert.equal(result.showSignedOutPrimaryAction, false);
  }

  const walletReconnect = presentation({
    authenticated: true,
    walletSession: true,
    walletAuthenticationEnabled: true,
    walletProviderCount: 1,
    selectedWalletProvider: true
  });
  assert.deepEqual(walletReconnect.oidcProviders, []);
  assert.equal(walletReconnect.showWalletPicker, true);
  assert.equal(walletReconnect.showWalletSignIn, true);
  assert.equal(walletReconnect.showNetworks, true);
  assert.equal(walletReconnect.showSignedOutPrimaryAction, false);
});

test("no configured method keeps explicit retry and safe diagnostics actionable", () => {
  const result = presentation();
  assert.equal(result.recoveryKind, "no_methods");
  assert.equal(result.showOptionsRetry, true);
  assert.equal(result.showAccessDiagnostics, true);
  assert.equal(result.showSignedOutPrimaryAction, true);
});

test("support diagnostic is bounded and contains no private account truth", () => {
  const diagnostic = createAccessSupportDiagnostic({
    origin: "http://127.0.0.1:8787",
    workspace: "borrower",
    optionsState: "failed",
    errorCode: "authentication_unavailable",
    requestId: "trace:auth.123",
    walletProviderState: "ready",
    walletProviderCount: 0,
    observedAt: "2026-08-12T10:00:00.000Z",
    cookie: "must-not-appear",
    walletAddress: "0x1111111111111111111111111111111111111111"
  });
  assert.equal(diagnostic.origin, "http://127.0.0.1:8787");
  assert.equal(diagnostic.workspace, "borrower");
  assert.equal(diagnostic.requestId, "trace:auth.123");
  assert.equal(diagnostic.credentialsIncluded, false);
  assert.equal(diagnostic.privateResourceIdentifiersIncluded, false);
  assert.equal(JSON.stringify(diagnostic).includes("must-not-appear"), false);
  assert.equal(JSON.stringify(diagnostic).includes("0x1111"), false);

  assert.equal(createAccessSupportDiagnostic({ requestId: "short" }).requestId, "unavailable");
  assert.equal(
    createAccessSupportDiagnostic({ requestId: "request<script>" }).requestId,
    "unavailable"
  );
});
