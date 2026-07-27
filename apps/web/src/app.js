import {
  createApplicationReadyAgentHandoffManifest,
  createAwaitingAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "./agent-handoff-manifest.js";
import { createAgentPilotCapabilityManifest } from "./agent-pilot-capability-manifest.js";
import { createAgentConsolePresentation } from "./agent-console-presentation.js";
import { createCapitalNetworkPresentation } from "./capital-network-presentation.js";
import {
  TRADING_CAPITAL_OPERATION_IDS,
  TRADING_CAPITAL_VIEW_DEFINITIONS,
  createTradingCapitalProductPresentation
} from "./trading-capital-product-presentation.js";
import {
  compactDecisionProofHash,
  createHumanDecisionPassportPresentation,
  hasVerifiedHumanDecisionPassport
} from "./decision-passport-presentation.js";
import {
  createCreditPassportPresentation,
  selectedCreditPassportClaims
} from "./credit-passport-presentation.js";
import { createHumanCreditOfferWorkflowReceipt } from "./human-credit-offer-workflow-receipt.js";
import { createHumanSandboxObligationWorkflowReceipt } from "./human-sandbox-obligation-workflow-receipt.js";
import {
  assertRequestCreditReviewCurrent,
  createRequestCreditReviewBinding,
  evaluateRequestCreditReviewBinding
} from "./request-credit-review-binding.js";
import { createRiskOperationsPresentation } from "./risk-operations-presentation.js";
import { createServicingCasePresentation } from "./servicing-case-presentation.js";
import {
  SERVICING_POSITION_INDEX_LIMIT,
  acceptServicingPositionRefresh,
  createServicingPositionIndex
} from "./servicing-position-index.js";
import { createObligationPortfolioPresentation } from "./obligation-portfolio-presentation.js";
import { createWalletAuthorityLifecycle } from "./wallet-authority-lifecycle.js";
import { createWalletProviderRegistry } from "./wallet-provider-registry.js";
import {
  V9_DESTINATION_OPERATION_MAP,
  createArchitectureCapabilityPresentation,
  createWalletPermissionPresentation
} from "./v9-trust-surfaces.js";
import {
  downloadVerifiedOfficialReport,
  verifyOfficialReportRetrieval
} from "./official-report-download.js";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const VIEW_META = {
  overview: { eyebrow: "Authenticated workspace", title: "Overview" },
  "request-credit": { eyebrow: "Human entry · shared kernel", title: "Request Credit" },
  "repay-settle": { eyebrow: "Obligation workspace", title: "Repay & Settle" },
  "credit-passport": { eyebrow: "Explainable Decision Evidence", title: "Credit Passport" },
  obligations: { eyebrow: "Shared obligation kernel", title: "Obligations" },
  "agent-console": { eyebrow: "Principal-controlled workspace", title: "Agent Console" },
  "capital-network": { eyebrow: "Provider sandbox boundary", title: "Capital Network" },
  "trading-capital": { eyebrow: "Shared Facility · local no-funds", title: "Trading Capital" },
  "wallet-permissions": { eyebrow: "Authentication boundary", title: "Wallet & Permissions" },
  "activity-proofs": { eyebrow: "Protocol Evidence", title: "Activity & Proofs" },
  "credit-track-record": { eyebrow: "Evidence-derived record", title: "Credit Track Record" },
  "reports-exports": { eyebrow: "Artifact maturity", title: "Reports & Exports" },
  "risk-operations": { eyebrow: "Permissioned controls", title: "Risk & Operations" },
  architecture: { eyebrow: "Machine-readable protocol", title: "Architecture" }
};

let currentView = "overview";
let interactionMode = "human";
let humanNewApplicationMode = false;
let requestLog = [];
let lastRequestId;
let serverCatalogOperations = new Set();
let serverCatalogSnapshot = null;
const tenantPilot = {
  checked: false,
  connected: false,
  busy: false,
  connectionLabel: "Checking private gateway",
  helper: "Connect through the local authenticated Human pilot host to begin.",
  intent: null,
  decision: null,
  offer: null,
  receipt: null,
  offerReview: null,
  obligationReceipt: null,
  obligationWorkflowId: null,
  obligationCorrelationId: null,
  acceptanceStep: null,
  executionStep: null,
  repaymentStep: null,
  repaymentSequence: 0,
  acceptance: null,
  obligation: null,
  executionReceipt: null,
  repayment: null,
  servicingAction: null,
  obligationReadAvailable: false,
  obligationHydrationBusy: false,
  obligationHydrationAsOf: null,
  obligationHydrationHelper: "Enter an exact Obligation ID or create one in Human Pilot.",
  obligationHydrationError: false,
  workspaceKind: null,
  workspaceResume: null,
  workspaceObligations: [],
  workspacePositionViews: new Map(),
  workspacePositionRefreshBusy: false,
  workspacePositionRefreshHelper:
    "Refresh to load current balances and trusted-time servicing state for these authorized references.",
  workspaceRecoveryHasMore: false,
  workspaceRecoveryState: "loading",
  workspaceRecoveryResourceCount: 0,
  workspaceRecoveryErrorCode: null
};
const capitalNetworkPilot = {
  busy: false,
  providerView: null,
  acknowledgement: null,
  presentation: null,
  helper:
    "Enter one exact assigned ID. Missing, expired, denied, and cross-Provider resources are not enumerated.",
  error: false
};
const tradingCapitalPilot = {
  activeView: "overview",
  busy: false,
  error: false,
  facility: null,
  closeRequest: null,
  settlement: null,
  performanceProof: null,
  evidence: null,
  helper:
    "Enter one exact bound ID. Denied, missing, and cross-Tenant resources remain non-enumerating."
};
const pilotFeedback = {
  catalogAvailable: false,
  busy: false,
  submitted: null,
  helper: "Create or restore your Human Subject to submit one immutable categorical receipt.",
  error: false
};
const agentAuthorityPilot = {
  busy: false,
  helper: "Connect through the authenticated Human Principal session to begin.",
  subject: null,
  accountChallenge: null,
  accountBinding: null,
  mandate: null,
  activationEvidenceHash: null
};
const auditorEvidence = {
  catalogAvailable: false,
  busy: false,
  queried: false,
  obligationId: null,
  items: [],
  nextCursor: null,
  hasMore: false,
  asOf: null,
  helper: "Enter an exact Obligation ID. Access is verified by the private Gateway.",
  error: false
};
const ownedEvidence = {
  catalogAvailable: false,
  busy: false,
  queried: false,
  obligationId: null,
  items: [],
  nextCursor: null,
  hasMore: false,
  capped: false,
  asOf: null,
  helper: "Load the redacted immutable Evidence for this exact Obligation.",
  error: false
};
const officialReportPilot = {
  createAvailable: false,
  readAvailable: false,
  retrieveAvailable: false,
  revokeAvailable: false,
  busy: false,
  report: null,
  retrievedAt: null,
  helper:
    "Load an owned Obligation first. Report content is generated and hashed by the server.",
  error: false
};
const OWNED_EVIDENCE_DISPLAY_LIMIT = 50;
const creditPassportPilot = {
  createAvailable: false,
  readAvailable: false,
  verifyAvailable: false,
  revokeAvailable: false,
  busy: false,
  artifact: null,
  presentation: null,
  verification: null,
  issueHelper:
    "Enter exact server-known IDs. The verifier is not discovered or suggested by the browser.",
  artifactHelper: "No artifact is trusted until an authenticated server read succeeds.",
  verificationHelper:
    "Verification requires the exact authenticated verifier, current same-Tenant Membership, purpose, hash, version, source, and trusted server time.",
  error: false
};
const riskOperations = {
  readCatalogAvailable: false,
  healthCatalogAvailable: false,
  feedbackCatalogAvailable: false,
  queueCatalogAvailable: false,
  freezeCatalogAvailable: false,
  busy: false,
  healthBusy: false,
  feedbackBusy: false,
  queueBusy: false,
  freezeBusy: false,
  queried: false,
  portfolio: null,
  health: null,
  healthQueried: false,
  healthHelper: "Load the Tenant portfolio to verify the product funnel.",
  healthError: false,
  feedback: null,
  feedbackQueried: false,
  feedbackHelper: "Load the Tenant portfolio to aggregate feedback.",
  feedbackError: false,
  helper: "Enter one exact portfolio ID. Catalog presence does not grant access; the Gateway verifies every read.",
  error: false,
  freezeResult: null,
  freezeHelper: "Risk or Operations authority is verified only when the command is submitted.",
  freezeError: false,
  queueQueried: false,
  queueId: null,
  queueClassification: "all",
  queueCases: [],
  queueNextCursor: null,
  queueHasMore: false,
  queueAsOf: null,
  queueHelper: "Risk or Operations access and recent phishing-resistant MFA are verified on every read.",
  queueError: false
};
const PROTECTIVE_REASON_CODES = new Set([
  "credential_compromise",
  "operator_request",
  "provider_failure",
  "reconciliation_failure",
  "risk_limit_breach",
  "security_incident",
  "stop_loss_triggered"
]);
const mobileNavigation = window.matchMedia("(max-width: 900px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const OWNED_OBLIGATION_SESSION_KEY = "ipo-one-owned-obligation-id.v1";
const HUMAN_SUBJECT_STORAGE_KEY = "ipo-one-human-subject-id.v1";
const HUMAN_CONSENT_STORAGE_KEY = "ipo-one-human-consent-id.v1";
const AGENT_SUBJECT_STORAGE_KEY = "ipo-one-agent-subject-id.v1";
const SUPPORTED_WALLET_CHAINS = Object.freeze({
  84532: Object.freeze({
    chainId: 84532,
    chainIdHex: "0x14a34",
    caip2: "eip155:84532",
    name: "Base Sepolia",
    nativeCurrency: Object.freeze({ name: "Ether", symbol: "ETH", decimals: 18 }),
    rpcUrls: Object.freeze(["https://sepolia.base.org/"]),
    blockExplorerUrls: Object.freeze(["https://sepolia-explorer.base.org"])
  }),
  1952: Object.freeze({
    chainId: 1952,
    chainIdHex: "0x7a0",
    caip2: "eip155:1952",
    name: "X Layer Testnet",
    nativeCurrency: Object.freeze({ name: "OKB", symbol: "OKB", decimals: 18 }),
    rpcUrls: Object.freeze(["https://testrpc.xlayer.tech/terigon"]),
    blockExplorerUrls: Object.freeze(["https://www.okx.com/web3/explorer/xlayer-test"])
  })
});
const accessState = {
  checked: false,
  authEnabled: false,
  providers: new Set(),
  walletAuthenticationEnabled: false,
  sessionActive: false,
  selectedChainId: 84532,
  connectedChainId: null,
  walletAddress: null,
  walletProviderStatus: "discovering",
  walletProviders: [],
  selectedWalletProviderId: null,
  busy: false,
  lastFocused: null,
  helper: "Checking available sign-in methods…"
};
let walletProviderEventCleanup = () => {};
let walletAuthoritySnapshot;

function walletAuthorityBroadcastChannel() {
  if (typeof globalThis.BroadcastChannel !== "function") return undefined;
  try {
    return new globalThis.BroadcastChannel("ipo-one-wallet-authority-v1");
  } catch {
    return undefined;
  }
}

function walletServerAuthorityActive() {
  return (
    accessState.sessionActive === true ||
    tenantPilot.connected === true ||
    tenantCsrfToken() !== undefined
  );
}

async function invalidateWalletServerSession({ reasonCode, idempotencyKey }) {
  const csrfToken = tenantCsrfToken();
  if (!csrfToken) {
    throw Object.assign(
      new Error("The wallet session cannot be invalidated without its CSRF binding."),
      { code: "wallet_invalidation_csrf_unavailable" }
    );
  }
  return authJson("/auth/v1/wallet/invalidate", {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey,
      "x-csrf-token": csrfToken
    },
    body: {
      schemaVersion: "wallet_session_invalidation_request.v1",
      reasonCode
    }
  });
}

function applyWalletAuthoritySnapshot(snapshot) {
  walletAuthoritySnapshot = snapshot;
  if (snapshot.status === "available") return;
  accessState.sessionActive = false;
  tenantPilot.connected = false;
  tenantPilot.connectionLabel = snapshot.status === "pending"
    ? "Wallet authority invalidation pending"
    : snapshot.status === "invalidated"
      ? "Fresh wallet sign-in required"
      : "Wallet authority unavailable";
  accessState.helper = snapshot.status === "pending"
    ? "Wallet context changed. Protected actions are blocked while the server session is invalidated."
    : snapshot.status === "invalidated"
      ? "The previous server session is invalid. Start a fresh wallet sign-in to continue."
      : "The server session could not be confirmed invalid. Protected actions remain blocked until invalidation can be retried.";
  if (document.readyState !== "loading") {
    setConnection(false);
    renderAccess();
    renderTenantPilot();
  }
}

const walletAuthorityLifecycle = createWalletAuthorityLifecycle({
  invalidateSession: invalidateWalletServerSession,
  broadcastChannel: walletAuthorityBroadcastChannel(),
  onChange: applyWalletAuthoritySnapshot
});

function handleMaterialWalletContextChange(reasonCode) {
  accessState.walletAddress = null;
  accessState.connectedChainId = null;
  const invalidation = walletAuthorityLifecycle.handleContextChange(reasonCode, {
    serverAuthorityActive: walletServerAuthorityActive()
  });
  invalidation.catch(() => {
    // The lifecycle remains quarantined and retries only the same idempotency key.
  });
  renderAccess();
  return invalidation;
}

function rememberedOpaqueId(key) {
  try {
    const value = localStorage.getItem(key) ?? "";
    return exactResourceId(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function rememberOpaqueId(key, value) {
  if (!exactResourceId(value)) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Manual exact-ID entry remains available when browser storage is disabled.
  }
}

const el = (id) => document.getElementById(id);

function shortWalletAddress(address) {
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address)
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "Not connected";
}

function renderWalletProviders() {
  const list = el("walletProviderList");
  const selectedProviderId = accessState.selectedWalletProviderId;
  list.replaceChildren(
    ...accessState.walletProviders.map((provider) => {
      const button = document.createElement("button");
      const identity = document.createElement("span");
      const name = document.createElement("strong");
      const detail = document.createElement("small");
      const state = document.createElement("em");
      button.type = "button";
      button.className = "wallet-provider-choice";
      button.dataset.walletProviderId = provider.providerId;
      button.disabled = accessState.busy;
      button.setAttribute("aria-pressed", String(provider.providerId === selectedProviderId));
      if (provider.iconDataUri) {
        const icon = document.createElement("img");
        icon.alt = "";
        icon.decoding = "async";
        icon.referrerPolicy = "no-referrer";
        icon.src = provider.iconDataUri;
        button.append(icon);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "wallet-provider-fallback";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = "W";
        button.append(fallback);
      }
      name.textContent = provider.name;
      detail.textContent = provider.source === "legacy_eip1193"
        ? "Legacy EIP-1193 fallback"
        : provider.source === "mobile_walletconnect"
          ? "Mobile / QR · memory-only session"
          : provider.rdns ?? "EIP-6963 wallet";
      state.textContent = provider.providerId === selectedProviderId ? "Selected" : "Select";
      identity.append(name, detail);
      button.append(identity, state);
      return button;
    })
  );
  el("walletProviderStatus").textContent = accessState.walletProviderStatus === "discovering"
    ? "Discovering browser wallets…"
    : accessState.walletProviders.length === 0
      ? "No compatible browser wallet announced itself."
      : selectedProviderId
        ? "One wallet is explicitly selected for this page session."
        : `${accessState.walletProviders.length} wallet${accessState.walletProviders.length === 1 ? "" : "s"} found. Select one before connecting.`;
}

function renderAccess() {
  const selected = SUPPORTED_WALLET_CHAINS[accessState.selectedChainId];
  const connected = SUPPORTED_WALLET_CHAINS[accessState.connectedChainId];
  const walletAuthority = walletAuthoritySnapshot ?? walletAuthorityLifecycle.getSnapshot();
  const googleEnabled = accessState.authEnabled && accessState.providers.has("google");
  const emailEnabled = accessState.authEnabled && accessState.providers.has("email");
  el("googleSignInBtn").disabled = accessState.busy || !googleEnabled;
  el("emailSignInBtn").disabled = accessState.busy || !emailEnabled;
  el("walletSignInBtn").disabled =
    accessState.busy ||
    !accessState.selectedWalletProviderId ||
    walletAuthority.canStartAuthentication !== true;
  el("connectNetworkBtn").disabled = accessState.busy || !accessState.selectedWalletProviderId;
  el("accessAuthStatus").textContent = accessState.helper;
  el("walletAddressStatus").textContent = shortWalletAddress(accessState.walletAddress);
  el("walletNetworkStatus").textContent = connected
    ? `${connected.name} connected`
    : `${selected.name} selected`;
  el("connectNetworkBtn").textContent = connected?.chainId === selected.chainId
    ? `${selected.name} connected`
    : `Connect ${selected.name}`;
  el("accessButtonLabel").textContent = accessState.sessionActive
    ? "Session active"
    : accessState.walletAddress
      ? shortWalletAddress(accessState.walletAddress)
      : "Sign in";
  renderWalletProviders();
  for (const button of document.querySelectorAll("[data-wallet-chain]")) {
    const chainId = Number(button.dataset.walletChain);
    button.classList.toggle("active", chainId === accessState.selectedChainId);
    const stateLabel = button.querySelector("[data-network-state]");
    if (stateLabel) {
      stateLabel.textContent = chainId === accessState.connectedChainId
        ? "Connected"
        : chainId === accessState.selectedChainId
          ? "Selected"
          : "Select";
    }
  }
  if (document.readyState !== "loading") renderV9ShellStates();
}

function clearWalletProviderEvents() {
  walletProviderEventCleanup();
  walletProviderEventCleanup = () => {};
}

function bindSelectedWalletProviderEvents() {
  clearWalletProviderEvents();
  const provider = walletProviderRegistry.getSelectedProvider();
  if (!provider || typeof provider.on !== "function") return;
  const accountsChanged = () => {
    handleMaterialWalletContextChange("wallet_account_changed");
  };
  const chainChanged = () => {
    handleMaterialWalletContextChange("wallet_chain_changed");
  };
  const disconnected = () => {
    handleMaterialWalletContextChange("wallet_provider_disconnected");
  };
  provider.on("accountsChanged", accountsChanged);
  provider.on("chainChanged", chainChanged);
  provider.on("disconnect", disconnected);
  walletProviderEventCleanup = () => {
    const remove = typeof provider.removeListener === "function"
      ? provider.removeListener.bind(provider)
      : typeof provider.off === "function"
        ? provider.off.bind(provider)
        : null;
    remove?.("accountsChanged", accountsChanged);
    remove?.("chainChanged", chainChanged);
    remove?.("disconnect", disconnected);
  };
}

const walletProviderRegistry = createWalletProviderRegistry({
  eventTarget: window,
  legacyProvider: globalThis.ethereum,
  onChange(snapshot) {
    const previousProviderId = accessState.selectedWalletProviderId;
    accessState.walletProviderStatus = snapshot.status;
    accessState.walletProviders = snapshot.providers;
    accessState.selectedWalletProviderId = snapshot.selectedProviderId ?? null;
    if (previousProviderId !== accessState.selectedWalletProviderId) {
      accessState.walletAddress = null;
      accessState.connectedChainId = null;
      bindSelectedWalletProviderEvents();
      if (previousProviderId !== null) {
        handleMaterialWalletContextChange(
          accessState.selectedWalletProviderId === null
            ? "wallet_provider_disconnected"
            : "wallet_provider_changed"
        );
      }
    }
    renderAccess();
  }
});

function selectWalletProvider(providerId) {
  const provider = accessState.walletProviders.find((item) => item.providerId === providerId);
  if (!provider || !walletProviderRegistry.selectProvider(providerId)) return;
  accessState.helper = `${provider.name} selected. No account, network, or signature was requested.`;
  renderAccess();
}

function disposeWalletProviders() {
  clearWalletProviderEvents();
  walletAuthorityLifecycle.dispose();
  walletProviderRegistry.dispose();
}

function openAccess() {
  accessState.lastFocused = document.activeElement;
  el("accessLayer").hidden = false;
  document.body.classList.add("access-open");
  el("mainShell").setAttribute("inert", "");
  el("sidebar").setAttribute("inert", "");
  requestAnimationFrame(() => el("accessLayer").querySelector(".access-dialog")?.focus());
  renderAccess();
}

function closeAccess() {
  el("accessLayer").hidden = true;
  document.body.classList.remove("access-open");
  syncNavigationAccessibility();
  accessState.lastFocused?.focus?.();
  accessState.lastFocused = null;
}

function handleAccessKeys(event) {
  if (el("accessLayer").hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeAccess();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...el("accessLayer").querySelectorAll("button:not(:disabled), a[href], input:not(:disabled)")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

async function authJson(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json, application/problem+json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const error = new Error(payload?.detail ?? "The sign-in service is unavailable.");
    error.status = response.status;
    error.code = payload?.code ?? "authentication_unavailable";
    throw error;
  }
  return payload;
}

async function probeAccessOptions() {
  try {
    const options = await authJson("/auth/v1/options");
    const authorityAvailable = walletAuthorityLifecycle.getSnapshot().status === "available";
    accessState.authEnabled = options?.enabled === true;
    accessState.providers = new Set(Array.isArray(options?.oidcProviders) ? options.oidcProviders : []);
    accessState.walletAuthenticationEnabled = options?.walletAuthentication === true;
    accessState.sessionActive =
      authorityAvailable &&
      (options?.sessionActive === true || tenantPilot.connected);
    if (authorityAvailable) {
      accessState.helper = accessState.sessionActive
        ? "Secure session active. You can connect either approved test network."
        : accessState.authEnabled
          ? "Choose Google, email, or a pre-provisioned wallet credential."
          : "Closed-pilot access is not enabled on this deployment. No product data is available without an authenticated session.";
    }
  } catch {
    accessState.authEnabled = false;
    const authorityAvailable = walletAuthorityLifecycle.getSnapshot().status === "available";
    accessState.sessionActive = authorityAvailable && tenantPilot.connected;
    if (authorityAvailable) {
      accessState.helper = tenantPilot.connected
        ? "Private pilot session active. Connect an approved test network when needed."
        : "The authenticated closed-pilot gateway is unavailable. Contact your pilot administrator for access.";
    }
  } finally {
    accessState.checked = true;
    renderAccess();
  }
}

async function switchWalletChain(provider, chain) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainIdHex }]
    });
  } catch (error) {
    if (Number(error?.code) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chain.chainIdHex,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [...chain.rpcUrls],
        blockExplorerUrls: [...chain.blockExplorerUrls]
      }]
    });
  }
}

async function connectApprovedNetwork({ authenticate = false } = {}) {
  if (accessState.busy) return;
  if (
    authenticate &&
    walletAuthorityLifecycle.getSnapshot().canStartAuthentication !== true
  ) {
    accessState.helper =
      "The previous wallet authority has not been safely invalidated. Protected sign-in remains blocked.";
    renderAccess();
    return;
  }
  const provider = walletProviderRegistry.getSelectedProvider();
  if (!provider) {
    accessState.helper = accessState.walletProviders.length > 0
      ? "Select one discovered wallet before requesting an account or network."
      : "No compatible EVM wallet was found. Install or open a browser wallet, then try again.";
    renderAccess();
    return;
  }
  accessState.busy = true;
  accessState.helper = "Waiting for wallet approval…";
  renderAccess();
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
      throw new Error("The wallet did not return one valid EVM account.");
    }
    const chain = SUPPORTED_WALLET_CHAINS[accessState.selectedChainId];
    await switchWalletChain(provider, chain);
    const connectedChainHex = await provider.request({ method: "eth_chainId" });
    const connectedChainId = Number.parseInt(String(connectedChainHex), 16);
    if (connectedChainId !== chain.chainId) {
      throw new Error(`The wallet did not switch to ${chain.name}.`);
    }
    accessState.walletAddress = address;
    accessState.connectedChainId = connectedChainId;
    accessState.helper = `${chain.name} connected. Connecting a network does not grant credit authority.`;

    if (authenticate) {
      if (!accessState.walletAuthenticationEnabled) {
        accessState.helper = `${chain.name} connected. Wallet session sign-in awaits closed-pilot credential provisioning.`;
        return;
      }
      const walletChallengeEpoch =
        walletAuthorityLifecycle.getSnapshot().contextEpoch;
      accessState.helper = "Preparing one-use wallet sign-in…";
      renderAccess();
      const challenge = await authJson("/auth/v1/wallet/challenge", {
        method: "POST",
        body: { address, chainId: connectedChainId }
      });
      walletAuthorityLifecycle.assertContextEpoch(walletChallengeEpoch);
      const signature = await provider.request({
        method: "personal_sign",
        params: [challenge.message, address]
      });
      walletAuthorityLifecycle.assertContextEpoch(walletChallengeEpoch);
      await authJson("/auth/v1/wallet/verify", {
        method: "POST",
        body: { transactionHandle: challenge.handle, signature }
      });
      walletAuthorityLifecycle.assertContextEpoch(walletChallengeEpoch);
      accessState.sessionActive = true;
      accessState.helper = "Wallet sign-in complete. Your internal roles and Mandates remain server-controlled.";
      window.location.reload();
    }
  } catch (error) {
    accessState.helper = error?.code === 4001
      ? "Wallet request cancelled. Nothing was signed or submitted."
      : error?.message ?? "Wallet connection failed.";
  } finally {
    accessState.busy = false;
    renderAccess();
  }
}

function beginOidcSignIn(provider) {
  if (!accessState.authEnabled || !accessState.providers.has(provider)) {
    accessState.helper = `${provider === "google" ? "Google" : "Email"} sign-in is not enabled for this closed-pilot deployment.`;
    renderAccess();
    return;
  }
  window.location.assign(`/auth/v1/login?provider=${encodeURIComponent(provider)}`);
}

function asBigInt(value) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function bpsToPercent(value) {
  if (value === null || value === undefined) return "No new credit";
  return `${percent.format(Number(value) / 100)}%`;
}

function titleize(value) {
  return String(value ?? "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function servicingClassificationLabel(value) {
  const normalized = String(value ?? "");
  if (normalized.startsWith("servicing_")) {
    return `Servicing ${servicingClassificationLabel(normalized.slice(10))}`;
  }
  return {
    current: "Current",
    grace_period: "Grace period",
    dpd_1_30: "DPD 1–30",
    dpd_31_60: "DPD 31–60",
    dpd_61_89: "DPD 61–89",
    defaulted: "Defaulted"
  }[normalized] ?? titleize(normalized);
}

function decisionReasonItem(reason) {
  const item = document.createElement("li");
  const content = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const canonicalCode = document.createElement("code");
  title.textContent = reason.title;
  detail.textContent = reason.detail;
  canonicalCode.textContent = reason.code;
  content.append(title, detail);
  item.append(content, canonicalCode);
  return item;
}

function decisionSourceRow(source) {
  const row = document.createElement("div");
  const sourceCell = document.createElement("span");
  const versionCell = document.createElement("span");
  const finalityCell = document.createElement("span");
  const proofCell = document.createElement("span");
  const evidence = document.createElement("code");
  const entity = document.createElement("small");
  row.className = "decision-source-row";
  row.setAttribute("role", "row");
  sourceCell.setAttribute("role", "cell");
  versionCell.setAttribute("role", "cell");
  finalityCell.setAttribute("role", "cell");
  proofCell.setAttribute("role", "cell");
  sourceCell.dataset.label = "Source";
  versionCell.dataset.label = "Version";
  finalityCell.dataset.label = "Finality";
  proofCell.dataset.label = "Proof";
  sourceCell.textContent = source.label;
  sourceCell.title = source.role;
  versionCell.textContent = `v${source.aggregateVersion}`;
  finalityCell.textContent = "Finalized";
  evidence.textContent = compactDecisionProofHash(source.evidenceHash);
  evidence.title = source.evidenceHash;
  entity.textContent = `Entity ${compactDecisionProofHash(source.entityHash)}`;
  entity.title = source.entityHash;
  proofCell.append(evidence, entity);
  row.append(sourceCell, versionCell, finalityCell, proofCell);
  return row;
}

function setProofHash(id, value) {
  const target = el(id);
  target.textContent = compactDecisionProofHash(value);
  target.title = value;
}

function renderDecisionPassport(decision) {
  const surface = el("humanDecisionPassport");
  const proof = el("humanDecisionPassportProof");
  const sources = el("humanDecisionSourceRows");
  const reasonList = el("humanDecisionReasonList");
  const presentation = createHumanDecisionPassportPresentation(decision);
  const verified = presentation !== null;
  surface.hidden = !decision;
  surface.classList.toggle("invalid", Boolean(decision) && !verified);
  reasonList.replaceChildren();
  sources.replaceChildren();

  if (!decision) {
    proof.open = false;
    el("copyDecisionPassportBtn").disabled = true;
    return false;
  }

  if (!verified) {
    el("humanDecisionPassportState").textContent = "Proof unavailable";
    el("humanDecisionPolicy").textContent = "Unavailable";
    el("humanDecisionEvidence").textContent = "Not verified";
    el("humanDecisionAsOf").textContent = "Unavailable";
    const item = document.createElement("li");
    item.textContent = "This result cannot be verified. Request a fresh evaluation before accepting an Offer.";
    reasonList.append(item);
    el("copyDecisionPassportBtn").disabled = true;
    proof.open = false;
    return false;
  }

  el("humanDecisionPassportState").textContent = `${titleize(presentation.status)} · verified`;
  el("humanDecisionPolicy").textContent = presentation.policyVersion;
  el("humanDecisionPolicy").title = presentation.policyHash;
  el("humanDecisionEvidence").textContent = presentation.evidenceSummary;
  el("humanDecisionAsOf").textContent = formatEvidenceTime(presentation.asOf, { short: true });
  el("humanDecisionPassportSchema").textContent = presentation.schemaVersion;
  el("humanDecisionFeatureSet").textContent = presentation.featureSetVersion;
  el("humanDecisionFeatureSet").title = presentation.featureSetVersion;
  setProofHash("humanDecisionPassportHash", presentation.decisionPassportHash);
  setProofHash("humanDecisionFeatureHash", presentation.featureSnapshotHash);
  setProofHash("humanDecisionRiskStateHash", presentation.riskStateHash);
  reasonList.replaceChildren(...presentation.reasons.map(decisionReasonItem));
  sources.replaceChildren(...presentation.sources.map(decisionSourceRow));
  el("copyDecisionPassportBtn").disabled = false;
  return true;
}

function compactItem(title, detail) {
  const item = document.createElement("div");
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  item.className = "compact-item";
  strong.textContent = title;
  span.textContent = detail;
  item.append(strong, span);
  return item;
}

function emptyRow(message) {
  const item = document.createElement("div");
  item.className = "empty-row";
  item.textContent = message;
  return item;
}

function setConnection(online) {
  el("connectionChip").classList.toggle("offline", !online);
  el("connectionStatus").textContent = online ? "Secure session active" : "Sign-in required";
  el("sidebarApiStatus").textContent = online ? "Authenticated" : "Locked";
}

function renderRuntimeGate() {
  const gate = el("authenticatedRuntimeGate");
  if (!gate) return;
  const connected = tenantPilot.connected;
  el("authenticatedRuntimeGateStatus").textContent = connected
    ? "Authenticated workspace"
    : tenantPilot.checked
      ? tenantPilot.connectionLabel
      : "Verifying secure session";
  el("authenticatedRuntimeGateCopy").textContent = connected
    ? "Tenant identity, role, policy, and CSRF bindings were verified. All product state below comes from the authenticated protocol."
    : tenantPilot.checked
      ? "Sign in with an approved pilot account. IPO.ONE will not substitute public fixtures or browser state when the secure gateway is unavailable."
      : "Checking the authenticated Tenant catalog and browser session. No product operation is available until verification completes.";
  el("authenticatedRuntimeGateAction").hidden = connected;
  gate.classList.toggle("connected", connected);
  gate.classList.toggle("blocked", tenantPilot.checked && !connected);
}

function recordRequest({ method, path, status, requestId }) {
  requestLog.unshift({ method, path, status, requestId, occurredAt: new Date().toISOString() });
  requestLog = requestLog.slice(0, 30);
  lastRequestId = requestId ?? lastRequestId;
  renderRuntime();
}

function tenantRequestToken(prefix) {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return `0x${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function tenantCsrfToken() {
  const token = document.querySelector('meta[name="ipo-one-csrf-token"]')?.content ?? "";
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : undefined;
}

async function tenantApi(operationId, {
  resource,
  payload = {},
  purpose,
  reasonCode,
  idempotent = true,
  correlationId = tenantRequestToken("web_tenant_correlation"),
  requestId = tenantRequestToken("web_tenant_request"),
  idempotencyKey,
  includeTransportMeta = false
} = {}) {
  walletAuthorityLifecycle.assertProtectedAvailable();
  const csrfToken = tenantCsrfToken();
  if (!csrfToken) throw new Error("The authenticated Human session is missing its CSRF bootstrap token.");
  const protocolRequest = {
    operationId,
    payload,
    requestId,
    correlationId,
    schemaVersion: "tenant_protocol_request.v1"
  };
  if (resource) protocolRequest.resource = resource;
  if (purpose) protocolRequest.purpose = purpose;
  if (reasonCode) protocolRequest.reasonCode = reasonCode;
  if (idempotent) {
    protocolRequest.idempotencyKey = idempotencyKey ?? tenantRequestToken("web_tenant_idempotency");
  }

  let response;
  try {
    response = await fetch("/tenant/v1/operations", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json, application/problem+json",
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
        "x-request-id": requestId
      },
      body: JSON.stringify(protocolRequest)
    });
  } catch (cause) {
    const error = new Error("The authenticated Human pilot gateway is unavailable.", { cause });
    error.requestId = requestId;
    throw error;
  }

  const responseRequestId = response.headers.get("x-request-id") ?? requestId;
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : undefined;
  } catch {
    const error = new Error("The private gateway returned an invalid response.");
    error.requestId = responseRequestId;
    recordRequest({ method: "POST", path: `/tenant:${operationId}`, status: response.status, requestId: responseRequestId });
    throw error;
  }
  recordRequest({ method: "POST", path: `/tenant:${operationId}`, status: response.status, requestId: responseRequestId });
  if (!response.ok) {
    const error = new Error(result?.detail ?? "The private operation was rejected.");
    error.code = result?.code ?? "unknown_tenant_error";
    error.status = response.status;
    error.requestId = result?.requestId ?? responseRequestId;
    throw error;
  }
  walletAuthorityLifecycle.assertProtectedAvailable();
  return includeTransportMeta
    ? Object.freeze({ correlationId, requestId: responseRequestId, result })
    : result;
}

function usdMinorToMoney(value) {
  return money.format(Number(asBigInt(value)) / 100);
}

function tenantInputValue(id) {
  return el(id).value.trim();
}

function humanObligationWorkflowIdentifier(workflowId, kind, step) {
  return `${kind}_human_obligation:${workflowId}:${step}`;
}

function rememberedOwnedObligationId() {
  try {
    const value = sessionStorage.getItem(OWNED_OBLIGATION_SESSION_KEY) ?? "";
    return exactResourceId(value) ? value : null;
  } catch {
    return null;
  }
}

function rememberOwnedObligationId(obligationId) {
  if (!exactResourceId(obligationId)) return;
  try {
    sessionStorage.setItem(OWNED_OBLIGATION_SESSION_KEY, obligationId);
  } catch {
    // Navigation recall is optional; server authorization remains authoritative.
  }
}

function forgetOwnedObligationId() {
  try {
    sessionStorage.removeItem(OWNED_OBLIGATION_SESSION_KEY);
  } catch {
    // Browser storage does not participate in authorization or canonical state.
  }
}

function resetHumanObligationWorkflow() {
  tenantPilot.obligationReceipt = null;
  tenantPilot.obligationWorkflowId = null;
  tenantPilot.obligationCorrelationId = null;
  tenantPilot.acceptanceStep = null;
  tenantPilot.executionStep = null;
  tenantPilot.repaymentStep = null;
  tenantPilot.repaymentSequence = 0;
  tenantPilot.acceptance = null;
  tenantPilot.obligation = null;
  tenantPilot.executionReceipt = null;
  tenantPilot.repayment = null;
  tenantPilot.servicingAction = null;
  tenantPilot.obligationHydrationAsOf = null;
  tenantPilot.obligationHydrationError = false;
  tenantPilot.obligationHydrationHelper = "Enter an exact Obligation ID or create one in Human Pilot.";
  forgetOwnedObligationId();
  ownedEvidence.busy = false;
  ownedEvidence.queried = false;
  ownedEvidence.obligationId = null;
  ownedEvidence.items = [];
  ownedEvidence.nextCursor = null;
  ownedEvidence.hasMore = false;
  ownedEvidence.capped = false;
  ownedEvidence.asOf = null;
  ownedEvidence.helper = "Load the redacted immutable Evidence for this exact Obligation.";
  ownedEvidence.error = false;
}

function requestedCreditTerms() {
  const amount = Number(el("humanCreditAmount").value);
  const termDays = Number(el("humanCreditTerm").value);
  const installmentCount = Number(el("humanInstallments").value);
  if (!Number.isFinite(amount) || amount < 1 || amount > 250) {
    throw new Error("Requested amount must be between $1 and $250 in the no-funds pilot.");
  }
  if (!Number.isSafeInteger(termDays) || termDays < 1 || termDays > 90) {
    throw new Error("Requested term must be between 1 and 90 days.");
  }
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > 3) {
    throw new Error("Installment count must be between 1 and 3.");
  }
  return {
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: String(Math.round(amount * 100)),
    purposeCode: el("humanCreditPurpose").value,
    requestedTermDays: termDays,
    repaymentFrequency: el("humanRepaymentFrequency").value,
    installmentCount
  };
}

function currentHumanCreditReviewInput() {
  return {
    authorityId: tenantInputValue("humanConsentId"),
    creditRequest: requestedCreditTerms(),
    entryMode: "human",
    subjectId: tenantInputValue("humanSubjectId")
  };
}

function humanCreditReviewState() {
  if (!tenantPilot.offerReview) {
    return Object.freeze({
      current: false,
      reasonCode: tenantPilot.offer ? "review_binding_invalid" : "offer_unavailable"
    });
  }
  try {
    return evaluateRequestCreditReviewBinding(
      tenantPilot.offerReview,
      currentHumanCreditReviewInput()
    );
  } catch {
    return Object.freeze({
      current: false,
      reasonCode: "request_economics_changed"
    });
  }
}

function humanCreditReviewMessage(reviewState) {
  if (reviewState.current) {
    return "Exact Subject, Consent, request economics, Offer hash, and terms hash match this review.";
  }
  const messages = {
    offer_unavailable: "Submit an authenticated no-funds request to receive an exact Offer review.",
    entry_mode_changed: "Return to Human mode and request a fresh Offer before acceptance.",
    subject_changed: "The visible Subject changed. Request a fresh Offer before acceptance.",
    authority_changed: "The visible Consent changed. Request a fresh Offer before acceptance.",
    request_economics_changed:
      "The visible amount, term, purpose, frequency, or installments changed. Request a fresh Offer before acceptance.",
    review_binding_invalid:
      "The exact server review binding is unavailable. Request a fresh Offer before acceptance."
  };
  return messages[reviewState.reasonCode] ?? messages.review_binding_invalid;
}

function normalizedServerReceipt(step) {
  if (!step) return null;
  if (step.operationId && step.responseSchemaVersion) return step;
  const result = step.result;
  if (!result?.operationId || !result.response?.schemaVersion) return null;
  return {
    operationId: result.operationId,
    replayed: result.replayed,
    requestId: step.requestId,
    responseSchemaVersion: result.response.schemaVersion
  };
}

function setServerReceiptStatus(id, step) {
  const target = el(id);
  const receipt = normalizedServerReceipt(step);
  target.classList.toggle("ready", Boolean(receipt));
  target.textContent = receipt
    ? `${receipt.responseSchemaVersion} · ${receipt.replayed ? "replayed" : "committed"}`
    : "Waiting for server";
  target.title = receipt
    ? `${receipt.operationId} · request ${receipt.requestId}`
    : "No server result has been returned for this step.";
}

function renderHumanRequestCreditReceipts() {
  const steps = new Map(
    (tenantPilot.offerReview?.serverReceipts ?? []).map((step) => [
      step.operationId,
      step
    ])
  );
  setServerReceiptStatus("humanReceiptPreflight", steps.get("pilotReadHumanSelf"));
  setServerReceiptStatus("humanReceiptIntent", steps.get("pilotRequestCredit"));
  setServerReceiptStatus(
    "humanReceiptApplication",
    steps.get("pilotReadCreditApplication")
  );
  setServerReceiptStatus(
    "humanReceiptDecision",
    steps.get("pilotEvaluateCreditApplication")
  );
  setServerReceiptStatus("humanReceiptAcceptance", tenantPilot.acceptanceStep);
  setServerReceiptStatus("humanReceiptExecution", tenantPilot.executionStep);
}

function requestedAgentMandateTerms() {
  const perAction = Number(el("agentMandatePerActionLimit").value);
  const aggregate = Number(el("agentMandateAggregateLimit").value);
  const validityDays = Number(el("agentMandateValidityDays").value);
  if (!Number.isFinite(perAction) || perAction < 1 || perAction > 250) {
    throw new Error("Per-action authority must be between $1 and $250 in the no-funds pilot.");
  }
  if (!Number.isFinite(aggregate) || aggregate < perAction || aggregate > 1000) {
    throw new Error("Aggregate authority must be at least the per-action limit and no more than $1,000.");
  }
  if (!Number.isSafeInteger(validityDays) || validityDays < 1 || validityDays > 365) {
    throw new Error("Mandate validity must be between 1 and 365 days.");
  }
  const validFrom = new Date();
  const expiresAt = new Date(validFrom.getTime() + validityDays * 24 * 60 * 60 * 1000);
  return {
    capabilities: [
      "request_credit",
      "accept_credit_offer",
      "execute_sandbox_credit",
      "route_repayment"
    ],
    allowedProviderIds: [],
    allowedCategories: [],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: String(Math.round(perAction * 100)),
    aggregateLimitMinor: String(Math.round(aggregate * 100)),
    validFrom: validFrom.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce: tenantRequestToken("web_principal_mandate"),
    termsRef: "urn:ipo.one:terms:agent-credit-sandbox:v1"
  };
}

function requestedAgentAccountProof() {
  const chainId = tenantInputValue("agentAccountChain");
  const address = tenantInputValue("agentAccountAddress").toLowerCase();
  const purpose = tenantInputValue("agentAccountPurpose");
  if (!new Set(["eip155:84532", "eip155:1952"]).has(chainId)) {
    throw new Error("Choose Base Sepolia or X Layer Testnet.");
  }
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    throw new Error("Enter one 20-byte EVM account address.");
  }
  return { accountId: `${chainId}:${address}`, purpose };
}

function currentAgentMcpHandoffPacket() {
  if (agentAuthorityPilot.mandate?.status === "draft") {
    return createApplicationReadyAgentHandoffManifest(agentAuthorityPilot.mandate);
  }
  return createReadyAgentHandoffManifest(agentAuthorityPilot.mandate);
}

function currentAgentPilotCapabilityPacket() {
  const handoff = currentAgentMcpHandoffPacket() ?? createAwaitingAgentHandoffManifest();
  return createAgentPilotCapabilityManifest(handoff);
}

function currentAgentConsolePresentation() {
  const accountBindingView = agentAuthorityPilot.accountBinding;
  const accountBinding = accountBindingView?.accountBinding ?? null;
  const mandate = agentAuthorityPilot.mandate;
  const subjectId = agentAuthorityPilot.subject?.subjectId ??
    accountBindingView?.subjectId ??
    mandate?.subjectId ??
    null;
  const subjectStatus = accountBindingView?.subjectStatus ??
    agentAuthorityPilot.subject?.status ??
    null;
  const principalId = mandate?.principalId ??
    agentAuthorityPilot.subject?.principalId ??
    null;
  const subject = subjectId && subjectStatus
    ? {
        subjectId,
        principalId,
        status: subjectStatus,
        schemaVersion: "agent_console_subject_snapshot.v1"
      }
    : null;
  const binding = accountBinding && accountBindingView?.subjectId
    ? {
        subjectId: accountBindingView.subjectId,
        status: accountBinding.status,
        chainId: accountBinding.chainId,
        purpose: accountBinding.purpose,
        accountHash: accountBinding.accountHash,
        proofHash: accountBinding.proofHash,
        verificationMethod: accountBinding.verificationMethod,
        boundAt: accountBinding.boundAt,
        schemaVersion: "agent_console_account_binding_snapshot.v1"
      }
    : null;
  const mandateSnapshot = mandate
    ? {
        mandateId: mandate.mandateId,
        subjectId: mandate.subjectId,
        principalId: mandate.principalId,
        status: mandate.status,
        capabilities: [...mandate.capabilities],
        assetIds: [...mandate.assetIds],
        perActionLimitMinor: mandate.perActionLimitMinor,
        aggregateLimitMinor: mandate.aggregateLimitMinor,
        utilizedMinor: mandate.utilizedMinor,
        expiresAt: mandate.expiresAt,
        mandateHash: mandate.mandateHash,
        termsHash: mandate.termsHash,
        sandboxOnly: mandate.sandboxOnly,
        productionAuthority: mandate.productionAuthority,
        schemaVersion: "agent_console_mandate_snapshot.v1"
      }
    : null;
  return createAgentConsolePresentation({
    manifest: currentAgentPilotCapabilityPacket(),
    catalogOperationIds: [...serverCatalogOperations].sort(),
    subject,
    accountBinding: binding,
    mandate: mandateSnapshot
  });
}

function agentConsoleToolRow(tool) {
  const row = document.createElement("div");
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  const detail = document.createElement("small");
  const status = document.createElement("em");
  row.className = "agent-console-tool-row";
  row.setAttribute("role", "listitem");
  name.textContent = tool.name;
  detail.textContent = `${tool.operationId} · ${titleize(tool.group)}`;
  status.textContent = {
    eligible_for_gateway_check: "Gateway check",
    handoff_required: "Handoff required",
    application_handoff_required: "Draft only",
    active_mandate_required: "Active Mandate",
    catalog_unavailable: "Catalog unavailable"
  }[tool.availability];
  row.classList.toggle("ready", tool.availability === "eligible_for_gateway_check");
  row.classList.toggle("unavailable", tool.availability === "catalog_unavailable");
  copy.append(name, detail);
  row.append(copy, status);
  return row;
}

function agentConsoleWorkflowRow(workflow) {
  const row = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("small");
  const status = document.createElement("em");
  row.className = "agent-console-workflow-row";
  title.textContent = {
    credit_offer: "Decision & Offer",
    sandbox_obligation: "Obligation & repayment",
    obligation_portability: "Dual-chain portability conformance"
  }[workflow.workflowId];
  detail.textContent =
    `${workflow.entryPoint} · ${workflow.interface} · ${workflow.outputSchemaVersion}`;
  status.textContent = {
    enabled: "Ready",
    locked: "Locked",
    input_required: "Receipt input"
  }[workflow.availability];
  row.classList.toggle("ready", workflow.availability === "enabled");
  row.classList.toggle("locked", workflow.availability === "locked");
  copy.append(title, detail);
  row.append(copy, status);
  return row;
}

function agentConsoleUnavailableRow(capability) {
  const labels = {
    remote_mcp: ["Remote MCP", "No HTTP, SSE, WebSocket or public MCP listener"],
    a2a: ["A2A", "No Agent-to-Agent transport or delegation surface"],
    production_workload_credentials: [
      "Production workload credentials",
      "No token, client certificate or private key is issued here"
    ],
    public_agent_endpoint: [
      "Public Agent endpoint",
      "The approved Host remains local and non-public"
    ],
    real_provider_execution: [
      "Real Provider execution",
      "Only the separately bounded local Provider sandbox exists"
    ],
    real_funds: ["Real funds", "No redeemable value, withdrawal or production credit"],
    active_mandate_edit: [
      "Active Mandate edit",
      "Create/review/revoke draft and activate exact scope only"
    ]
  };
  const row = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("small");
  const status = document.createElement("em");
  row.className = "agent-console-unavailable-row";
  [title.textContent, detail.textContent] = labels[capability];
  status.textContent = "Unavailable";
  copy.append(title, detail);
  row.append(copy, status);
  return row;
}

function renderAgentConsole() {
  const presentation = currentAgentConsolePresentation();
  const status = el("agentConsoleContractStatus");
  if (!presentation) {
    status.textContent = "Verification failed";
    status.className = "state-pill warning";
    el("agentConsoleManifestVersion").textContent = "Hidden";
    el("agentConsoleCatalogParity").textContent = "Hidden";
    el("agentConsoleTransport").textContent = "Hidden";
    el("agentConsoleWorkflowCount").textContent = "Hidden";
    el("agentConsoleHelper").textContent =
      "Agent integration state failed its closed presentation contract. No capability is implied.";
    el("agentConsoleHelper").classList.add("error");
    el("agentConsoleToolRows").replaceChildren(
      emptyRow("Registry unavailable until exact contract verification succeeds.")
    );
    el("agentConsoleWorkflowRows").replaceChildren(
      emptyRow("Workflow state unavailable.")
    );
    el("agentConsoleCopyManifestBtn").disabled = true;
    el("agentConsoleDownloadHandoffBtn").disabled = true;
    return;
  }

  const readyHandoff = presentation.status !== "waiting";
  status.textContent = {
    waiting: "Awaiting Principal",
    application_ready: "Application handoff",
    runtime_ready: "Runtime handoff"
  }[presentation.status];
  status.className = `state-pill ${
    presentation.registry.catalogParity && readyHandoff ? "" : "neutral"
  }`;
  el("agentConsoleManifestVersion").textContent = presentation.schemaVersion;
  el("agentConsoleCatalogParity").textContent =
    `${presentation.registry.catalogBoundCount}/${presentation.registry.toolCount} tools`;
  el("agentConsoleTransport").textContent = "Local stdio MCP";
  el("agentConsoleWorkflowCount").textContent =
    `${presentation.workflows.length} staged`;
  el("agentConsoleHelper").classList.remove("error");
  el("agentConsoleHelper").textContent = !presentation.registry.catalogParity
    ? "Manifest and authenticated server catalog differ. Tool use remains fail-closed."
    : presentation.status === "runtime_ready"
      ? "Active Principal-approved sandbox authority is loaded. Every Agent call still requires fresh Host authentication, admission and Gateway authorization."
      : presentation.status === "application_ready"
        ? "Draft application authority is loaded. Runtime economic and Evidence tools remain locked until exact Principal activation."
        : "Create or restore the exact Agent Subject, AccountBinding and Mandate before a handoff becomes available.";

  const canExport = readyHandoff && presentation.registry.catalogParity;
  el("agentConsoleCopyManifestBtn").disabled = !canExport;
  el("agentConsoleDownloadHandoffBtn").disabled = !canExport;

  el("agentConsolePrincipalStatus").textContent =
    presentation.principal.bound ? "Bound" : "Waiting";
  el("agentConsolePrincipalStatus").className =
    `state-pill ${presentation.principal.bound ? "" : "neutral"}`;
  el("agentConsolePrincipalId").textContent =
    presentation.principal.principalId
      ? compactOpaqueId(presentation.principal.principalId)
      : "Not loaded";
  el("agentConsolePrincipalId").title =
    presentation.principal.principalId ?? "";
  el("agentConsoleSubjectId").textContent =
    presentation.identity.subjectId
      ? compactOpaqueId(presentation.identity.subjectId)
      : "Not loaded";
  el("agentConsoleSubjectId").title = presentation.identity.subjectId ?? "";
  el("agentConsoleSubjectStatus").textContent =
    presentation.identity.subjectStatus
      ? titleize(presentation.identity.subjectStatus)
      : "Not loaded";

  const binding = presentation.identity.accountBinding;
  el("agentConsoleBindingStatus").textContent = binding ? "Verified" : "Waiting";
  el("agentConsoleBindingStatus").className =
    `state-pill ${binding ? "" : "neutral"}`;
  el("agentConsoleBindingChain").textContent = binding?.chainId ?? "Not loaded";
  el("agentConsoleBindingPurpose").textContent =
    binding ? titleize(binding.purpose) : "Not loaded";
  el("agentConsoleBindingMethod").textContent =
    binding ? titleize(binding.verificationMethod) : "Not loaded";
  el("agentConsoleBindingProof").textContent =
    binding ? compactOpaqueId(binding.proofHash) : "Not loaded";
  el("agentConsoleBindingProof").title = binding?.proofHash ?? "";

  const mandate = presentation.mandate;
  el("agentConsoleMandateStatus").textContent =
    mandate ? titleize(mandate.status) : "Waiting";
  el("agentConsoleMandateStatus").className =
    `state-pill ${mandate?.status === "active" ? "" : "neutral"}`;
  el("agentConsoleMandateId").textContent =
    mandate ? compactOpaqueId(mandate.mandateId) : "Not loaded";
  el("agentConsoleMandateId").title = mandate?.mandateId ?? "";
  el("agentConsoleMandateCapabilities").textContent = mandate
    ? mandate.capabilities.map(titleize).join(" · ")
    : "Not loaded";
  el("agentConsoleMandateLimits").textContent = mandate
    ? `${usdMinorToMoney(mandate.perActionLimitMinor)} / ${usdMinorToMoney(
        mandate.aggregateLimitMinor
      )} · ${usdMinorToMoney(mandate.utilizedMinor)} used`
    : "Not loaded";
  el("agentConsoleMandateExpiry").textContent =
    mandate ? privateDate(mandate.expiresAt) : "Not loaded";
  el("agentConsoleMandateBoundary").textContent = mandate
    ? `Hash ${compactOpaqueId(mandate.mandateHash)} · terms ${compactOpaqueId(
        mandate.termsHash
      )} · sandbox only · active scope cannot be edited in place.`
    : "Create or load an exact server Mandate. Active scope cannot be edited in place.";

  el("agentConsoleRegistryStatus").textContent =
    presentation.registry.catalogParity ? "11/11 parity" : "Drift blocked";
  el("agentConsoleRegistryStatus").className =
    `state-pill ${presentation.registry.catalogParity ? "" : "warning"}`;
  el("agentConsoleToolRows").replaceChildren(
    ...presentation.registry.tools.map(agentConsoleToolRow)
  );
  el("agentConsoleWorkflowRows").replaceChildren(
    ...presentation.workflows.map(agentConsoleWorkflowRow)
  );
  el("agentConsoleUnavailableRows").replaceChildren(
    ...presentation.unavailableCapabilities.map(agentConsoleUnavailableRow)
  );

  el("agentConsoleSdkSnippet").textContent = `import { IpoOneAgentMcpClient } from "@ipo-one/sdk";

const agent = new IpoOneAgentMcpClient({
  handle: localMcpHost.handle,
  manifest: applicationHandoff,
  transportProfile: "mcp_stdio_local"
});

const receipt = await agent.runCreditOfferWorkflow({
  creditRequest: {
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "9000",
    purposeCode: "compute",
    requestedTermDays: 30,
    repaymentFrequency: "end_of_term",
    installmentCount: 1
  },
  workflowId: "design-partner-application-0001"
});`;
  el("agentConsoleOpenApiSnippet").textContent =
`const response = await fetch(
  new URL("/openapi.json", globalThis.location.origin),
  { headers: { accept: "application/json" } }
);

if (!response.ok) throw new Error("local_openapi_unavailable");
const contract = await response.json();
console.log(contract.info.title, contract.info.version);`;
}

function agentIntegrationPresentation() {
  const subject = agentAuthorityPilot.subject;
  const accountBound = Boolean(
    agentAuthorityPilot.accountBinding?.subjectStatus === "active" &&
    agentAuthorityPilot.accountBinding?.accountBinding?.status === "active"
  );
  const mandate = agentAuthorityPilot.mandate;
  const packet = currentAgentPilotCapabilityPacket();
  if (!subject) {
    return {
      currentIndex: 0,
      title: "Authorize this Agent",
      copy: "A Human Principal creates the Agent Subject and sets exact sandbox limits before any machine workflow is available.",
      primaryLabel: "Authorize Agent",
      primaryAction: "principal-setup",
      identity: "Principal setup required",
      authority: "No Mandate",
      protocol: "Waiting for authority"
    };
  }
  if (!accountBound) {
    return {
      currentIndex: 1,
      title: "Prove the Agent controls its account",
      copy: "Create one short-lived signing request. The registered local Agent Host submits proof; this browser receives only the verified AccountBinding state.",
      primaryLabel: "Complete account proof",
      primaryAction: "principal-setup",
      identity: "Account proof required",
      authority: mandate?.status === "draft" ? "Draft Mandate" : "Awaiting Mandate",
      protocol: "Identity proof required"
    };
  }
  if (packet.status === "application_ready") {
    return {
      currentIndex: 2,
      title: "Hand off the first credit request",
      copy: "The credential-free application packet can now run read self, request credit, read application, and deterministic evaluation through the authenticated Agent API.",
      primaryLabel: "Open application handoff",
      primaryAction: "open-handoff",
      identity: "CAIP-10 proof verified",
      authority: "Application handoff ready",
      protocol: "Application tools ready"
    };
  }
  if (packet.status === "runtime_ready") {
    return {
      currentIndex: 3,
      title: "Run and verify sandbox credit",
      copy: "Use the active runtime handoff to accept the exact Offer, execute the no-funds Obligation, post repayment, and retain every receipt as Evidence.",
      primaryLabel: "Open runtime handoff",
      primaryAction: "open-handoff",
      identity: "CAIP-10 proof verified",
      authority: "Runtime handoff ready",
      protocol: "11 authenticated operations ready"
    };
  }
  return {
    currentIndex: mandate?.status === "draft" ? 2 : 1,
    title: mandate?.status === "draft" ? "Prepare the application handoff" : "Complete Principal authority",
    copy: "Load the exact reviewed Mandate before any Agent workflow becomes available. Authority remains Principal-controlled and sandbox-only.",
    primaryLabel: "Review Principal setup",
    primaryAction: "principal-setup",
    identity: accountBound ? "Account proof verified" : "Account proof required",
    authority: mandate?.status === "draft" ? "Draft Mandate" : "Awaiting Mandate",
    protocol: "Mandate review required"
  };
}

function renderAgentIntegrationGuide() {
  const guide = agentIntegrationPresentation();
  el("agentIntegrationGuideTitle").textContent = guide.title;
  el("agentIntegrationGuideCopy").textContent = guide.copy;
  el("agentIntegrationGuideStatus").textContent = `Step ${guide.currentIndex + 1} of 4`;
  el("agentIntegrationPrimaryBtn").textContent = guide.primaryLabel;
  el("agentIntegrationPrimaryBtn").dataset.agentGuideAction = guide.primaryAction;
  el("agentIntegrationSecondaryBtn").dataset.agentGuideAction = "view-protocol";
  el("agentRuntimePrimaryBtn").textContent = guide.primaryLabel;
  el("agentRuntimePrimaryBtn").dataset.agentGuideAction = guide.primaryAction;
  el("agentRuntimeSecondaryBtn").dataset.agentGuideAction = "view-protocol";
  el("agentRuntimeHeroCopy").textContent = guide.copy;
  el("agentRuntimeIdentity").textContent = guide.identity;
  el("agentRuntimeAuthority").textContent = guide.authority;
  el("agentWorkspaceHeroCopy").textContent = guide.copy;
  el("agentWorkspaceIdentity").textContent = guide.identity;
  el("agentWorkspaceAuthority").textContent = guide.authority;
  el("agentProtocolDisclosureStatus").textContent = guide.protocol;
  el("agentProtocolDisclosureStatus").classList.toggle("neutral", guide.currentIndex < 2);
  for (const [index, stage] of [...el("agentIntegrationJourney").children].entries()) {
    stage.classList.toggle("complete", index < guide.currentIndex);
    stage.classList.toggle("current", index === guide.currentIndex);
  }
}

function renderAgentRequestCreditJourney() {
  const handoff = currentAgentMcpHandoffPacket();
  const applicationHandoff = handoff?.status === "application_ready";
  const runtimeHandoff = handoff?.status === "ready";
  const applicationOperationsAvailable = [
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication"
  ].every((operationId) => serverCatalogOperations.has(operationId));
  const economicOperationsAvailable = [
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation"
  ].every((operationId) => serverCatalogOperations.has(operationId));
  const applicationReady = Boolean(handoff) && applicationOperationsAvailable;
  const runtimeReady = runtimeHandoff &&
    applicationOperationsAvailable &&
    economicOperationsAvailable;

  el("agentRequestCreditStatus").textContent = runtimeReady
    ? "Runtime journey ready"
    : applicationReady
      ? "Application journey ready"
      : tenantPilot.connected
        ? "Principal setup required"
        : "Authenticated session required";
  el("agentRequestCreditStatus").classList.toggle(
    "neutral",
    !applicationReady && !runtimeReady
  );
  el("agentRequestCreditAuthority").textContent = runtimeHandoff
    ? "Active Principal-approved Mandate"
    : applicationHandoff
      ? "Draft application Mandate"
      : "No eligible handoff";
  el("agentRequestCreditIntent").textContent = applicationReady
    ? "Ready · pilotRequestCredit"
    : "Locked pending bounded handoff";
  el("agentRequestCreditDecision").textContent = applicationReady
    ? "Ready · deterministic policy + Passport"
    : "Locked pending bounded handoff";
  el("agentRequestCreditAcceptance").textContent = runtimeReady
    ? "Ready · exact Offer and terms hashes"
    : "Locked pending active Mandate";
  el("agentRequestCreditExecution").textContent = runtimeReady
    ? "Ready · signed non-withdrawable receipt"
    : "Locked pending active Mandate";
  el("agentRequestCreditOfferReceipt").textContent = applicationReady
    ? "agent_credit_offer_workflow_receipt.v1"
    : "Returned only after Agent workflow";
  el("agentRequestCreditObligationReceipt").textContent = runtimeReady
    ? "agent_sandbox_obligation_workflow_receipt.v1"
    : "Returned only after active runtime workflow";
  el("agentRequestCreditCopy").textContent = applicationReady
    ? "The Agent can submit the same bounded request economics and receive the same deterministic policy, Offer terms, and Evidence-derived Decision Passport. The handoff contains no credential."
    : "A Human Principal must bind the Agent Subject and exact Consent-equivalent Mandate scope before the Agent application tools become available.";
}

function renderAgentMcpHandoff() {
  const handoff = currentAgentMcpHandoffPacket();
  const packet = currentAgentPilotCapabilityPacket();
  const ready = Boolean(handoff);
  const applicationReady = handoff?.status === "application_ready";
  const runtimeReady = handoff?.status === "ready";
  el("mcpHandoffPacket").textContent = JSON.stringify(packet, null, 2);
  el("copyMcpHandoffBtn").disabled = !ready;
  el("downloadMcpHandoffBtn").disabled = !ready;
  el("downloadMcpHandoffBtn").textContent = applicationReady
    ? "Download application handoff"
    : "Download runtime handoff";
  el("openAgentApiBtn").disabled = !ready;
  el("openAgentApiBtn").textContent = applicationReady
    ? "Open application handoff"
    : "Open Agent API handoff";
  el("runtimeHandoffStatus").textContent = applicationReady
    ? "Application ready"
    : runtimeReady
      ? "Runtime ready"
      : "Awaiting Mandate";
  el("runtimeHandoffStatus").classList.toggle("ready", ready);
  el("mcpToolReadiness").textContent = applicationReady
    ? "Application ready"
    : runtimeReady
      ? "Runtime ready"
      : "Waiting";
  el("mcpToolReadiness").classList.toggle("neutral", !ready);
  el("mcpHandoffEyebrow").textContent = applicationReady
    ? "Draft application authority"
    : runtimeReady
      ? "Active runtime authority"
      : "Non-authorizing manifest";
  el("mcpHandoffBoundaryNote").textContent = applicationReady
    ? "Application tools are Ready. Evidence and the three sandbox economic tools stay Locked until Principal activation; credentials and authority are never carried in this packet."
    : runtimeReady
      ? "Eleven local Agent operations are Ready, including exact owned Obligation state, Evidence, and three no-funds economic commands. Every call remains Host-, Tenant-, and Mandate-bound."
      : "This non-authorizing packet advertises eleven local Agent operations and three staged workflows. The loopback OpenAPI describes the server boundary; credentials and funds authority remain outside the packet.";
  el("agentHandoffPhase").textContent = applicationReady
    ? "Application handoff"
    : runtimeReady
      ? "Runtime handoff"
      : "Agent API handoff";
  el("agentHandoffScope").textContent = applicationReady
    ? "Draft Mandate · Decision & Offer"
    : runtimeReady
      ? "Active Mandate · Post-application"
      : "Subject ID + Mandate ID";
  el("agentHandoffDescription").textContent = applicationReady
      ? "Copy the bounded draft packet for read self, request credit, read application, and deterministic evaluation."
    : runtimeReady
      ? "Continue with the Principal-activated runtime packet. New applications remain draft-only."
      : "Load an eligible draft Mandate to create the application packet. Runtime Evidence and sandbox economic tools require an active Principal-approved Mandate.";
  const toolList = document.querySelector(".mcp-tool-list");
  toolList.classList.toggle("ready", ready);
  for (const status of document.querySelectorAll("[data-mcp-tool-status]")) {
    status.textContent = !ready
      ? "Waiting"
      : status.dataset.mcpToolStatus === "identity"
        ? agentAuthorityPilot.accountBinding
          ? "Verified"
          : "Ready"
      : status.dataset.mcpToolStatus === "application"
        ? runtimeReady ? "Draft only" : "Ready"
      : new Set(["economic", "evidence"]).has(status.dataset.mcpToolStatus)
        ? runtimeReady ? "Ready" : "Locked"
      : "Ready";
  }
  for (const status of document.querySelectorAll("[data-agent-workflow-status]")) {
    const workflow = packet.workflows.find(
      ({ workflowId }) => workflowId === status.dataset.agentWorkflowStatus
    );
    status.textContent = {
      enabled: "Ready",
      locked: "Locked",
      input_required: "Receipt input"
    }[workflow.availability];
    status.classList.toggle("ready", workflow.availability === "enabled");
    status.classList.toggle("warning", workflow.availability === "locked");
  }
  renderAgentIntegrationGuide();
  renderAgentRequestCreditJourney();
  renderAgentConsole();
}

function renderAgentAuthorityPilot() {
  const subjectId = tenantInputValue("agentAuthoritySubjectId");
  const mandateId = tenantInputValue("agentAuthorityMandateId");
  const mandate = agentAuthorityPilot.mandate;
  const subjectPending = agentAuthorityPilot.subject?.subjectId === subjectId && agentAuthorityPilot.subject.status === "pending";
  const accountBinding = agentAuthorityPilot.accountBinding?.subjectId === subjectId
    ? agentAuthorityPilot.accountBinding.accountBinding
    : null;
  const accountBound = Boolean(accountBinding && agentAuthorityPilot.accountBinding.subjectStatus === "active");
  const subjectKnownActive = agentAuthorityPilot.subject?.subjectId === subjectId && agentAuthorityPilot.subject.status === "active";
  const challenge = agentAuthorityPilot.accountChallenge?.subjectId === subjectId
    ? agentAuthorityPilot.accountChallenge
    : null;
  const challengeExpired = Boolean(challenge && new Date(challenge.expiresAt).getTime() <= Date.now());
  const challengeOpen = Boolean(challenge && !challengeExpired && !accountBound);
  const exactDraftLoaded = mandate?.mandateId === mandateId && mandate.status === "draft";
  const acknowledged = el("principalMandateAcknowledge").checked;
  const privateBusy = tenantPilot.busy || agentAuthorityPilot.busy;

  el("createPrivateAgentSubjectBtn").disabled = privateBusy || !tenantPilot.connected;
  el("createAccountChallengeBtn").disabled = privateBusy || !tenantPilot.connected || !subjectId || subjectKnownActive || accountBound || challengeOpen;
  el("copyAccountChallengeBtn").disabled = privateBusy || !challengeOpen;
  el("downloadAccountChallengeBtn").disabled = privateBusy || !challengeOpen;
  el("refreshAccountBindingBtn").disabled = privateBusy || !tenantPilot.connected || !subjectId;
  el("createDraftMandateBtn").disabled = privateBusy || !tenantPilot.connected || !subjectId;
  el("loadMandateBtn").disabled = privateBusy || !tenantPilot.connected || !mandateId;
  el("principalMandateAcknowledge").disabled = privateBusy || !exactDraftLoaded || !accountBound;
  el("activateMandateBtn").disabled = privateBusy || !tenantPilot.connected || !exactDraftLoaded || !acknowledged || !accountBound;
  el("agentAuthorityHelper").textContent = agentAuthorityPilot.helper;

  const statusLabel = mandate?.status === "active"
    ? "Active sandbox"
    : exactDraftLoaded
      ? subjectPending
        ? "Account proof required"
        : "Draft ready"
      : subjectPending
        ? "Subject pending"
        : "Not started";
  el("agentAuthorityStatus").textContent = statusLabel;
  el("agentAuthorityStatus").classList.toggle("neutral", !mandate || mandate.status !== "active");
  el("agentAuthorityStatus").classList.toggle("warning", subjectPending);
  el("agentAccountChallengeStatus").textContent = challengeExpired
    ? "Expired · create a new request"
    : challenge
    ? `Open · ${new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date(challenge.expiresAt))}`
    : accountBound
      ? "Consumed"
      : "Not created";
  el("agentAccountAgentAction").textContent = accountBound
    ? "Proof verified"
    : challengeExpired
      ? "New request required"
    : challenge
      ? "Run pilot:agent:prove"
      : "Waiting for signing request";
  el("agentAccountActivationStatus").textContent = accountBound
    ? "Subject active"
    : subjectPending
      ? "Subject pending"
      : "Load pending Subject";
  el("agentAccountChallengePreview").textContent = challenge
    ? `${challengeExpired ? "EXPIRED — do not sign or submit this request.\n\n" : ""}${JSON.stringify(challenge, null, 2)}`
    : "Create a signing request to view the closed EIP-712 payload.";
  el("mandateReviewStatus").textContent = mandate ? titleize(mandate.status) : "Awaiting draft";
  el("agentAuthorityPrincipalId").textContent = mandate?.principalId ?? agentAuthorityPilot.subject?.principalId ?? "—";
  el("agentAuthorityReviewSubjectId").textContent = (mandate?.subjectId ?? subjectId) || "—";
  el("agentAuthorityAccountChain").textContent = accountBinding?.chainId ?? challenge?.chainId ?? "—";
  el("agentAuthorityAccountHash").textContent = accountBinding?.accountHash ?? challenge?.accountHash ?? "—";
  el("agentAuthorityProofHash").textContent = accountBinding?.proofHash ?? "—";
  el("agentAuthorityReviewMandateId").textContent = (mandate?.mandateId ?? mandateId) || "—";
  el("agentAuthorityMandateHash").textContent = mandate?.mandateHash ?? "—";
  el("agentAuthorityTermsHash").textContent = mandate?.termsHash ?? "—";
  el("agentAuthorityLimits").textContent = mandate
    ? `${usdMinorToMoney(mandate.perActionLimitMinor)} / ${usdMinorToMoney(mandate.aggregateLimitMinor)}`
    : "—";
  el("agentAuthorityExpiry").textContent = mandate?.expiresAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(mandate.expiresAt))
    : "—";
  el("agentAuthorityEvidenceHash").textContent = agentAuthorityPilot.activationEvidenceHash ?? "—";

  for (const id of [
    "agentAuthorityPrincipalId",
    "agentAuthorityReviewSubjectId",
    "agentAuthorityAccountChain",
    "agentAuthorityAccountHash",
    "agentAuthorityProofHash",
    "agentAuthorityReviewMandateId",
    "agentAuthorityMandateHash",
    "agentAuthorityTermsHash",
    "agentAuthorityEvidenceHash"
  ]) {
    el(id).title = el(id).textContent;
  }
  renderAgentMcpHandoff();
}

function privateHumanLifecycleStatus() {
  const obligation = tenantPilot.obligation;
  if (obligation?.status === "fully_repaid") return "Fully repaid";
  if (obligation?.executionStatus === "executed") return titleize(obligation.status ?? "active");
  if (obligation) return "Obligation created";
  if (tenantPilot.offer) return "Offer ready";
  if (tenantPilot.decision) return titleize(tenantPilot.decision.status);
  if (tenantPilot.intent) return "Intent submitted";
  return "Not started";
}

function humanGuidePresentation() {
  const subjectReady = exactResourceId(tenantInputValue("humanSubjectId"));
  const consentReady = exactResourceId(tenantInputValue("humanConsentId"));
  const offer = tenantPilot.offer;
  const obligation = tenantPilot.obligation;
  const executed = obligation?.executionStatus === "executed";
  const repaid = obligation?.status === "fully_repaid";
  const checkpoints = [
    Boolean((subjectReady && consentReady) || tenantPilot.intent || offer || obligation),
    Boolean(tenantPilot.intent || offer || obligation),
    Boolean(obligation),
    Boolean(executed),
    Boolean(repaid)
  ];
  const currentIndex = checkpoints.findIndex((complete) => !complete);

  if (!tenantPilot.connected) {
    return {
      title: "Connect to your private sandbox",
      copy: "This guided experience uses an authenticated Human session so your position and permissions cannot be supplied by the page.",
      status: "Private access required",
      action: "none",
      actionLabel: "Waiting for private session",
      secondaryAction: "toggle-details",
      secondaryLabel: "See how it works",
      checkpoints,
      currentIndex: 0,
      journey: "Private session required"
    };
  }

  if (humanNewApplicationMode && obligation) {
    return {
      title: "Create another sandbox request",
      copy: "Your current position is preserved. Choose a new amount and schedule to receive a separate explainable Offer.",
      status: "New request",
      action: "focus-request",
      actionLabel: "Choose request terms",
      secondaryAction: "return-current",
      secondaryLabel: "Return to current credit",
      checkpoints,
      currentIndex: Math.min(currentIndex < 0 ? 4 : currentIndex, 1),
      journey: "Current position preserved"
    };
  }

  if (!subjectReady) {
    return {
      title: "Start with a private sandbox profile",
      copy: "We will create an opaque profile first. No name, bank login, wallet credential, or raw KYC is requested here.",
      status: "Step 1 of 5",
      action: "create-subject",
      actionLabel: "Create sandbox profile",
      secondaryAction: "toggle-details",
      secondaryLabel: "See how it works",
      checkpoints,
      currentIndex: 0,
      journey: "Ready to begin"
    };
  }

  if (!consentReady) {
    return {
      title: "Approve how this sandbox may be used",
      copy: "Create purpose-limited Consent for the amount, term, and identity reference used in this no-funds application.",
      status: "Step 1 of 5",
      action: "create-consent",
      actionLabel: "Create scoped Consent",
      secondaryAction: "toggle-details",
      secondaryLabel: "Why Consent is needed",
      checkpoints,
      currentIndex: 0,
      journey: "Profile ready"
    };
  }

  if (!tenantPilot.intent && !offer && !obligation) {
    return {
      title: "Choose the request that fits your plan",
      copy: "Set a sandbox amount, term, and repayment schedule. You will review an explainable Offer before accepting anything.",
      status: "Step 2 of 5",
      action: "focus-request",
      actionLabel: "Choose request terms",
      secondaryAction: "toggle-details",
      secondaryLabel: "See how offers work",
      checkpoints,
      currentIndex: 1,
      journey: "Ready to request"
    };
  }

  if (offer && !obligation) {
    return {
      title: "Review your exact Offer",
      copy: "Compare the approved amount, annual rate, maturity, and decision reasons. Nothing is created until you acknowledge and accept these exact terms.",
      status: "Step 3 of 5",
      action: "review-offer",
      actionLabel: "Review Offer",
      secondaryAction: "toggle-details",
      secondaryLabel: "How the decision works",
      checkpoints,
      currentIndex: 2,
      journey: "Offer ready for review"
    };
  }

  if (obligation && !executed) {
    return {
      title: "Activate your sandbox credit plan",
      copy: "Your exact Obligation and repayment schedule are recorded. Activate the signed sandbox receipt to begin—no withdrawable funds will be created.",
      status: "Step 4 of 5",
      action: "activate-obligation",
      actionLabel: "Review activation",
      secondaryAction: "start-new",
      secondaryLabel: "Start another request",
      checkpoints,
      currentIndex: 3,
      journey: "Obligation ready to activate"
    };
  }

  if (obligation && executed && !repaid) {
    const nextInstallment = privateNextInstallment(obligation);
    return {
      title: "Stay on track with your next payment",
      copy: nextInstallment
        ? `${usdMinorToMoney(privateInstallmentAmount(nextInstallment))} is next in the sandbox schedule, due ${privateDate(nextInstallment.dueAt)}. Review the allocation before posting a synthetic repayment.`
        : "Review the current balance and post a synthetic repayment against the exact shared Obligation.",
      status: "Step 5 of 5",
      action: "repay-obligation",
      actionLabel: "Review next payment",
      secondaryAction: "start-new",
      secondaryLabel: "Start another request",
      checkpoints,
      currentIndex: 4,
      journey: nextInstallment ? `Next payment ${privateDate(nextInstallment.dueAt, { month: "short", day: "numeric" })}` : "Repayment in progress"
    };
  }

  return {
    title: ownedEvidence.queried ? "Your sandbox lifecycle is complete" : "Verify your completed lifecycle",
    copy: ownedEvidence.queried
      ? "Your Obligation is fully repaid and its redacted immutable Evidence is available for review."
      : "Your Obligation is fully repaid. Load its redacted immutable timeline to verify the lifecycle from acceptance through repayment.",
    status: "Complete",
    action: "verify-evidence",
    actionLabel: ownedEvidence.queried ? "Review Evidence" : "Verify Evidence",
    secondaryAction: "start-new",
    secondaryLabel: "Start another request",
    checkpoints,
    currentIndex: -1,
    journey: "Lifecycle complete"
  };
}

function renderHumanGuide() {
  const guide = humanGuidePresentation();
  const obligation = tenantPilot.obligation;
  const applicationOpen = !obligation || humanNewApplicationMode;
  el("humanGuideTitle").textContent = guide.title;
  el("humanGuideCopy").textContent = guide.copy;
  el("humanGuideStatus").textContent = guide.status;
  el("humanGuideStatus").classList.toggle("neutral", guide.status !== "Complete");
  el("humanGuideStatus").classList.toggle("success", guide.status === "Complete");
  el("humanHeroJourney").textContent = guide.journey;
  el("humanHeroCopy").textContent = obligation
    ? "Keep your current plan, next payment, and verifiable Evidence in one clear view—all without real funds."
    : "See your terms before you accept, follow one clear repayment plan, and verify every lifecycle event—all without real funds.";

  for (const button of [el("humanGuidePrimaryBtn"), el("humanHeroPrimaryBtn")]) {
    button.dataset.humanGuideAction = guide.action;
    button.textContent = guide.actionLabel;
    button.disabled = guide.action === "none";
  }
  el("humanGuideSecondaryBtn").dataset.humanGuideAction = guide.secondaryAction;
  el("humanGuideSecondaryBtn").textContent = guide.secondaryLabel;

  const stages = [...document.querySelectorAll("[data-human-stage]")];
  stages.forEach((stage, index) => {
    const complete = Boolean(guide.checkpoints[index]);
    const current = index === guide.currentIndex;
    stage.classList.toggle("complete", complete);
    stage.classList.toggle("current", current);
    if (current) stage.setAttribute("aria-current", "step");
    else stage.removeAttribute("aria-current");
  });

  el("humanCreditForm").hidden = !applicationOpen;
  el("humanOfferConsole").hidden = !applicationOpen;
  el("humanApplication").classList.toggle("position-mode", Boolean(obligation && !humanNewApplicationMode));
  el("humanApplicationTitle").textContent = obligation && !humanNewApplicationMode
    ? "Your current sandbox credit"
    : humanNewApplicationMode
      ? "Request another no-funds Offer"
      : "Request and price no-funds credit";
  el("humanApplicationCopy").textContent = obligation && !humanNewApplicationMode
    ? "Review your recorded Obligation, activate it when ready, then follow the exact repayment schedule and Evidence."
    : "Choose an amount and schedule. You will see an explainable Offer before anything is created.";
  el("humanIdentitySummary").textContent = subjectReadyLabel();
}

function subjectReadyLabel() {
  const subjectReady = exactResourceId(tenantInputValue("humanSubjectId"));
  const consentReady = exactResourceId(tenantInputValue("humanConsentId"));
  if (subjectReady && consentReady) return "Profile ready · view privacy-safe references";
  if (subjectReady) return "Profile created · add scoped Consent";
  return "Advanced: load existing identity references";
}

function runHumanGuideAction(action) {
  if (action === "create-subject") return createHumanSubject();
  if (action === "create-consent") return createHumanConsent();
  if (action === "focus-request") return focusJumpTarget(el("humanApplication"));
  if (action === "review-offer") return focusJumpTarget(el("humanOfferConsole"));
  if (action === "activate-obligation" || action === "repay-obligation") {
    return focusJumpTarget(el("humanObligationCard"));
  }
  if (action === "verify-evidence") {
    showView("activity-proofs");
    return;
  }
  if (action === "start-new") {
    humanNewApplicationMode = true;
    startAnotherHumanApplication();
    return;
  }
  if (action === "return-current") {
    humanNewApplicationMode = false;
    renderTenantPilot();
    focusJumpTarget(el("humanGuide"));
    return;
  }
  if (action === "toggle-details") {
    const details = el("humanGuideDetails");
    details.open = !details.open;
    details.querySelector("summary")?.focus();
  }
}

function privateAgentLifecycleStatus() {
  const mandate = agentAuthorityPilot.mandate;
  const binding = agentAuthorityPilot.accountBinding?.accountBinding;
  if (mandate?.status === "active") return "Runtime ready";
  if (mandate?.status === "draft") return "Principal review";
  if (binding?.status === "active") return "Account verified";
  if (agentAuthorityPilot.subject) return "Identity pending";
  return "Principal setup";
}

function privateNextInstallment(obligation) {
  return obligation?.installments?.find((installment) =>
    !new Set(["paid", "satisfied", "waived"]).has(installment.status)
  ) ?? null;
}

function privateInstallmentAmount(installment) {
  if (!installment) return 0n;
  const scheduled = asBigInt(installment.scheduledPrincipalMinor) +
    asBigInt(installment.scheduledInterestMinor) +
    asBigInt(installment.scheduledFeeMinor);
  const paid = asBigInt(installment.paidPrincipalMinor) +
    asBigInt(installment.paidInterestMinor) +
    asBigInt(installment.paidFeeMinor);
  return scheduled > paid ? scheduled - paid : 0n;
}

function privateDate(value, options = { dateStyle: "medium" }) {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function privateCheckpoint(title, detail, { complete = false, current = false } = {}) {
  const item = compactItem(title, detail);
  item.className = "private-checkpoint";
  item.classList.toggle("complete", complete);
  item.classList.toggle("current", current);
  return item;
}

function servicingStageItem(stage) {
  const item = document.createElement("li");
  item.className = `servicing-stage-item ${stage.state}`;
  const marker = document.createElement("span");
  marker.className = "servicing-stage-marker";
  marker.setAttribute("aria-hidden", "true");
  const copy = document.createElement("div");
  const label = document.createElement("strong");
  const detail = document.createElement("span");
  label.textContent = stage.label;
  detail.textContent = stage.detail;
  copy.append(label, detail);
  item.append(marker, copy);
  if (stage.state === "current") item.setAttribute("aria-current", "step");
  return item;
}

function compactOpaqueId(value) {
  return value.length > 31 ? `${value.slice(0, 18)}…${value.slice(-8)}` : value;
}

function workspaceObligationResources(resources) {
  const positions = new Map();
  for (const resource of resources) {
    if (
      resource?.resourceType !== "obligation" ||
      !exactResourceId(resource.resourceId) ||
      !new Set(["owner", "controller"]).has(resource.relationship) ||
      positions.has(resource.resourceId)
    ) continue;
    positions.set(resource.resourceId, {
      resourceType: "obligation",
      resourceId: resource.resourceId,
      relationship: resource.relationship
    });
  }
  return [...positions.values()];
}

function rememberWorkspaceObligation(resourceId, relationship = "owner") {
  if (!exactResourceId(resourceId)) return;
  const existing = tenantPilot.workspaceObligations.find((item) => item.resourceId === resourceId);
  if (existing) return;
  tenantPilot.workspaceObligations = [
    { resourceType: "obligation", resourceId, relationship },
    ...tenantPilot.workspaceObligations
  ];
}

function currentServicingPositionIndex() {
  if (!tenantPilot.workspaceResume) return null;
  const referenceIds = new Set(
    tenantPilot.workspaceObligations
      .slice(0, SERVICING_POSITION_INDEX_LIMIT)
      .map(({ resourceId }) => resourceId)
  );
  const selectedObligationId = tenantPilot.obligation?.obligationId;
  return createServicingPositionIndex({
    workspace: tenantPilot.workspaceResume,
    views: [...tenantPilot.workspacePositionViews]
      .filter(([obligationId]) => referenceIds.has(obligationId))
      .map(([obligationId, view]) => ({ obligationId, view })),
    ...(referenceIds.has(selectedObligationId) ? { selectedObligationId } : {})
  });
}

function renderOwnedPositionPicker({ humanMode }) {
  const picker = el("ownedPositionPicker");
  const list = el("ownedPositionList");
  const index = currentServicingPositionIndex();
  const positions = index?.positions ?? [];
  const visible = humanMode &&
    tenantPilot.connected &&
    tenantPilot.workspaceKind === "human_borrower" &&
    tenantPilot.workspaceObligations.length > 0;
  const refresh = el("refreshOwnedPositionsBtn");
  picker.hidden = !visible;
  list.replaceChildren();
  refresh.disabled = !visible ||
    !tenantPilot.connected ||
    !tenantPilot.obligationReadAvailable ||
    tenantPilot.workspacePositionRefreshBusy ||
    tenantPilot.obligationHydrationBusy;
  refresh.toggleAttribute("aria-busy", tenantPilot.workspacePositionRefreshBusy);
  refresh.textContent = tenantPilot.workspacePositionRefreshBusy
    ? "Refreshing server state…"
    : "Refresh current positions";
  el("ownedPositionCount").textContent = index
    ? `${index.reviewedCount}/${index.referenceCount} current`
    : "Verification unavailable";
  el("ownedPositionRefreshState").textContent = index
    ? tenantPilot.workspacePositionRefreshHelper
    : "Position references failed the closed servicing index contract. Financial values are hidden.";
  el("ownedPositionRefreshState").classList.toggle("error", visible && !index);
  el("ownedPositionBoundary").textContent = index?.hasMoreReferences
    ? `Showing at most ${SERVICING_POSITION_INDEX_LIMIT} exact Actor-bound Obligation references. Additional references require a separately bounded server page.`
    : index?.coverage === "complete"
      ? "Every visible value was refreshed through an exact owner-authorized server read. Browser state is not financial truth."
      : "Unrefreshed references show no balance or status. Select one or refresh all to load exact authorized server state.";
  if (!visible) return;
  if (!index) return;

  positions.forEach((position, index) => {
    const selected = tenantPilot.obligation?.obligationId === position.obligationId;
    const item = document.createElement("div");
    const button = document.createElement("button");
    const label = document.createElement("span");
    const identifier = document.createElement("strong");
    const detail = document.createElement("small");
    const action = document.createElement("em");
    item.setAttribute("role", "listitem");
    button.type = "button";
    button.className = "owned-position-button";
    button.dataset.obligationId = position.obligationId;
    button.dataset.positionAvailability = position.availability;
    button.disabled = tenantPilot.obligationHydrationBusy ||
      tenantPilot.workspacePositionRefreshBusy;
    button.setAttribute("aria-pressed", String(selected));
    if (selected) button.setAttribute("aria-current", "true");
    label.textContent = `Position ${String(index + 1).padStart(2, "0")}`;
    identifier.textContent = compactOpaqueId(position.obligationId);
    identifier.title = position.obligationId;
    detail.textContent = position.availability === "server_current"
      ? `${servicingClassificationLabel(position.servicingClassification)} · ${usdMinorToMoney(position.outstandingMinor)} outstanding · DPD ${position.daysPastDue} · server ${privateDate(position.asOf, { month: "short", day: "numeric", timeZone: "UTC" })}`
      : position.relationship === "controller"
        ? "Controller-authorized reference · server state not loaded"
        : "Borrower-owned reference · server state not loaded";
    action.textContent = selected ? "Selected" : "View position";
    button.append(label, identifier, detail, action);
    item.append(button);
    list.append(item);
  });
}

function ownedEvidencePresentationPage(obligationId) {
  if (
    !ownedEvidence.queried ||
    ownedEvidence.obligationId !== obligationId ||
    !ownedEvidence.asOf
  ) return null;
  return {
    obligationId,
    asOf: ownedEvidence.asOf,
    items: ownedEvidence.items,
    hasMore: ownedEvidence.hasMore,
    ...(ownedEvidence.hasMore && ownedEvidence.nextCursor
      ? { nextCursor: ownedEvidence.nextCursor }
      : {}),
    schemaVersion: "tenant_owned_obligation_evidence_view.v1"
  };
}

function currentObligationPortfolioPresentation() {
  const obligationId = tenantPilot.obligation?.obligationId;
  if (!obligationId) return { presentation: null, evidenceStale: false };
  const view = tenantPilot.workspacePositionViews.get(obligationId);
  const relationship = tenantPilot.workspaceObligations.find(
    (reference) => reference.resourceId === obligationId
  )?.relationship;
  if (!view || !new Set(["owner", "controller"]).has(relationship)) {
    return { presentation: null, evidenceStale: false };
  }
  const evidence = ownedEvidencePresentationPage(obligationId);
  const input = {
    view,
    relationship,
    entryMode: interactionMode,
    evidence
  };
  const presentation = createObligationPortfolioPresentation(input);
  if (presentation || evidence === null) {
    return { presentation, evidenceStale: false };
  }
  return {
    presentation: createObligationPortfolioPresentation({
      ...input,
      evidence: null
    }),
    evidenceStale: true
  };
}

function obligationPortfolioPosition(position, index) {
  const selected = tenantPilot.obligation?.obligationId === position.obligationId;
  const item = document.createElement("button");
  const sequence = document.createElement("span");
  const body = document.createElement("span");
  const identifier = document.createElement("strong");
  const detail = document.createElement("small");
  const status = document.createElement("em");
  item.type = "button";
  item.className = "obligation-portfolio-position";
  item.dataset.obligationId = position.obligationId;
  item.dataset.positionAvailability = position.availability;
  item.disabled = tenantPilot.obligationHydrationBusy ||
    tenantPilot.workspacePositionRefreshBusy;
  item.setAttribute("role", "listitem");
  item.setAttribute("aria-pressed", String(selected));
  if (selected) item.setAttribute("aria-current", "true");
  sequence.textContent = String(index + 1).padStart(2, "0");
  body.className = "obligation-portfolio-position-copy";
  identifier.textContent = compactOpaqueId(position.obligationId);
  identifier.title = position.obligationId;
  if (position.availability === "server_current") {
    detail.textContent =
      `${servicingClassificationLabel(position.servicingClassification)} · DPD ${position.daysPastDue} · ${privateDate(position.nextDueAt, { month: "short", day: "numeric", timeZone: "UTC" })}`;
    status.textContent = usdMinorToMoney(position.outstandingMinor);
  } else {
    detail.textContent = position.relationship === "controller"
      ? "Controller-bound reference · exact state not loaded"
      : "Owner-bound reference · exact state not loaded";
    status.textContent = "Values hidden";
  }
  body.append(identifier, detail);
  item.append(sequence, body, status);
  return item;
}

function obligationSchedulePresentationRow(row) {
  const item = document.createElement("div");
  const marker = document.createElement("span");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("small");
  const amount = document.createElement("em");
  item.className = "obligation-detail-schedule-row";
  item.dataset.installmentStatus = row.status;
  marker.textContent = String(row.installmentNumber).padStart(2, "0");
  title.textContent = `${titleize(row.status)} · ${privateDate(row.dueAt, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })}`;
  detail.textContent =
    `${usdMinorToMoney(row.paidMinor)} paid of ${usdMinorToMoney(row.scheduledMinor)} · schedule v${row.scheduleSequence}`;
  amount.textContent = `${usdMinorToMoney(row.outstandingMinor)} due`;
  copy.append(title, detail);
  item.append(marker, copy, amount);
  return item;
}

function obligationHistoryPresentationRow(item) {
  const row = document.createElement("div");
  const marker = document.createElement("span");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("small");
  const badge = document.createElement("em");
  row.className = `obligation-detail-history-row ${item.historyKind}`;
  marker.setAttribute("aria-hidden", "true");
  title.textContent = titleize(item.eventType);
  detail.textContent =
    `${titleize(item.aggregateType)} v${item.aggregateVersion} · ${formatEvidenceTime(item.recordedAt, { short: true })} · ${compactDecisionProofHash(item.evidenceHash)}`;
  badge.textContent = item.historyKind === "explicit_correction"
    ? "Correction"
    : item.historyKind === "explicit_resolution"
      ? "Resolution"
      : item.historyKind === "invalidated_observation"
        ? titleize(item.sourceFinality)
        : titleize(item.sourceFinality);
  copy.append(title, detail);
  row.append(marker, copy, badge);
  return row;
}

function renderObligationPortfolio() {
  const index = currentServicingPositionIndex();
  const positions = index?.positions ?? [];
  const { presentation, evidenceStale } = currentObligationPortfolioPresentation();
  const connected = tenantPilot.connected;
  const refresh = el("obligationPortfolioRefreshBtn");
  refresh.disabled = !connected ||
    !tenantPilot.obligationReadAvailable ||
    positions.length === 0 ||
    tenantPilot.workspacePositionRefreshBusy ||
    tenantPilot.obligationHydrationBusy;
  refresh.toggleAttribute("aria-busy", tenantPilot.workspacePositionRefreshBusy);
  refresh.textContent = tenantPilot.workspacePositionRefreshBusy
    ? "Refreshing exact reads…"
    : "Refresh server state";

  el("obligationPortfolioList").replaceChildren(...(positions.length
    ? positions.map(obligationPortfolioPosition)
    : [emptyRow(connected
      ? "No Actor-bound Obligation reference was returned by the authenticated workspace."
      : "Sign in to recover bounded owned references.")]));
  el("obligationPortfolioCount").textContent = index
    ? `${index.reviewedCount}/${index.referenceCount}`
    : "0/0";
  el("obligationPortfolioCoverage").textContent = !index
    ? "Unavailable"
    : index.coverage === "complete"
      ? "Complete server coverage"
      : "Partial coverage";
  el("obligationPortfolioCoverage").className =
    `state-pill ${index?.coverage === "complete" ? "neutral" : "warning"}`;
  el("obligationPortfolioOutstanding").textContent = index?.aggregate
    ? usdMinorToMoney(index.aggregate.outstandingMinor)
    : "Hidden";
  el("obligationPortfolioPastDue").textContent = index?.aggregate
    ? usdMinorToMoney(index.aggregate.pastDueMinor)
    : "Hidden";
  el("obligationPortfolioRepaid").textContent = index?.aggregate
    ? usdMinorToMoney(index.aggregate.totalRepaidMinor)
    : "Hidden";
  el("obligationPortfolioHelper").textContent = !connected
    ? "Sign in to recover bounded Actor-owned Obligation references."
    : index
      ? tenantPilot.workspacePositionRefreshHelper
      : "Workspace references failed the closed portfolio contract. Financial values are hidden.";
  el("obligationPortfolioHelper").classList.toggle("error", connected && !index);
  el("obligationPortfolioBoundary").textContent = index?.hasMoreReferences
    ? `This view is capped at ${SERVICING_POSITION_INDEX_LIMIT} exact references. Additional resources are not enumerated.`
    : index?.coverage === "complete"
      ? "Every visible amount reconciles to the exact canonical Obligation schedule. Browser aggregation is read-only."
      : "Unrefreshed or denied references reveal no amount or lifecycle status.";

  const detailEmpty = el("obligationDetailEmpty");
  const detailContent = el("obligationDetailContent");
  if (!presentation) {
    detailEmpty.hidden = false;
    detailContent.hidden = true;
    el("obligationDetailEmptyCopy").textContent = tenantPilot.obligation
      ? "The selected state failed the closed amount, schedule, authority, rail, or Evidence contract. Refresh the exact server read."
      : "Refresh server state, then select one exact Obligation. Browser state is never financial truth.";
    return null;
  }

  detailEmpty.hidden = true;
  detailContent.hidden = false;
  el("obligationDetailIdentifier").textContent = compactOpaqueId(presentation.obligationId);
  el("obligationDetailIdentifier").title = presentation.obligationId;
  el("obligationDetailStatus").textContent =
    `${titleize(presentation.lifecycle.status)} · ${servicingClassificationLabel(presentation.lifecycle.servicingClassification)}`;
  el("obligationDetailStatus").className =
    `state-pill ${presentation.lifecycle.daysPastDue > 0 ? "warning" : "neutral"}`;
  el("obligationDetailAuthority").textContent =
    `${presentation.authority.label} · ${titleize(presentation.relationship)}`;
  el("obligationDetailAuthorityId").textContent = compactOpaqueId(presentation.authority.id);
  el("obligationDetailAuthorityId").title = presentation.authority.id;
  el("obligationDetailRail").textContent = presentation.executionRail.label;
  el("obligationDetailRailRef").textContent =
    presentation.executionRail.receiptReferenceId
      ? compactOpaqueId(presentation.executionRail.receiptReferenceId)
      : "No execution receipt";
  el("obligationDetailRailRef").title =
    presentation.executionRail.receiptReferenceId ?? "";
  const evidenceVersion = presentation.stateVersion.loadedEvidenceAggregateVersion;
  el("obligationDetailVersion").textContent =
    `Schedule v${presentation.stateVersion.scheduleSequence}${evidenceVersion
      ? ` · Evidence v${evidenceVersion}`
      : ""}`;
  el("obligationDetailAsOf").textContent =
    `Server ${formatEvidenceTime(presentation.stateVersion.trustedAsOf, { short: true })}`;
  el("obligationDetailServicing").textContent =
    `${servicingClassificationLabel(presentation.lifecycle.servicingClassification)} · DPD ${presentation.lifecycle.daysPastDue}`;
  el("obligationDetailReason").textContent =
    servicingClassificationLabel(presentation.lifecycle.reasonCode);
  el("obligationDetailPrincipal").textContent =
    usdMinorToMoney(presentation.amounts.outstandingPrincipalMinor);
  el("obligationDetailCharges").textContent = usdMinorToMoney(
    String(
      BigInt(presentation.amounts.outstandingInterestMinor) +
      BigInt(presentation.amounts.outstandingFeesMinor)
    )
  );
  el("obligationDetailPastDue").textContent =
    usdMinorToMoney(presentation.amounts.pastDueMinor);
  el("obligationDetailRepaid").textContent =
    usdMinorToMoney(presentation.amounts.totalRepaidMinor);
  el("obligationDetailSchedule").replaceChildren(
    ...presentation.schedule.map(obligationSchedulePresentationRow)
  );
  el("obligationDetailHistory").replaceChildren(...(presentation.history.items.length
    ? [...presentation.history.items].reverse().map(obligationHistoryPresentationRow)
    : [emptyRow(evidenceStale
      ? "Loaded Evidence predates the current server read. Reload it before verifying history."
      : "Load exact owner/controller Evidence to verify versioned state changes.")]));
  el("obligationDetailHistoryState").textContent = evidenceStale
    ? "Evidence is stale relative to current state and is not shown."
    : presentation.history.queried
      ? `${presentation.history.items.length} hash-only event${presentation.history.items.length === 1 ? "" : "s"} loaded${ownedEvidence.capped ? "; the 50-event browser display cap has been reached." : presentation.history.hasMore ? "; additional events remain behind the bounded cursor." : "."} Corrections and resolutions are explicit append-only events.`
      : "Evidence has not been queried. No history is inferred from browser state.";
  const detailBusy = tenantPilot.obligationHydrationBusy ||
    tenantPilot.workspacePositionRefreshBusy;
  el("obligationDetailRefreshBtn").disabled = detailBusy;
  el("obligationDetailEvidenceBtn").disabled =
    detailBusy || ownedEvidence.busy || !ownedEvidence.catalogAvailable;
  el("obligationDetailEvidenceBtn").toggleAttribute("aria-busy", ownedEvidence.busy);
  el("obligationDetailRepayBtn").disabled =
    interactionMode !== "human" || !presentation.lifecycle ||
    presentation.executionRail.status !== "executed";
  return presentation;
}

function validServicingRepaymentInput() {
  const amount = Number(el("servicingRepaymentAmount").value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1000;
}

function renderServicingCase({ humanMode, obligation, nextInstallment }) {
  const caseObligation = humanMode ? obligation : null;
  const presentation = caseObligation
    ? createServicingCasePresentation(caseObligation, tenantPilot.servicingAction)
    : null;
  const empty = el("servicingCaseEmpty");
  const content = el("servicingCaseContent");
  const actionButton = el("postServicingRepaymentBtn");
  const status = el("privatePaymentsStatus");
  const restore = el("ownedObligationRestore");
  const restoreInput = el("ownedObligationId");
  const restoreButton = el("loadOwnedObligationBtn");
  renderOwnedPositionPicker({ humanMode });
  restore.hidden = !humanMode;
  restoreInput.disabled = tenantPilot.obligationHydrationBusy || !tenantPilot.connected;
  restoreButton.disabled = tenantPilot.obligationHydrationBusy || !tenantPilot.connected ||
    !tenantPilot.obligationReadAvailable || !exactResourceId(restoreInput.value.trim());
  restoreButton.toggleAttribute("aria-busy", tenantPilot.obligationHydrationBusy);
  restoreButton.textContent = tenantPilot.obligationHydrationBusy
    ? "Loading server state…"
    : obligation
      ? "Refresh case"
      : "Load case";
  el("ownedObligationRestoreHelper").textContent = tenantPilot.obligationHydrationHelper;
  el("ownedObligationRestoreHelper").classList.toggle(
    "error",
    tenantPilot.obligationHydrationError
  );

  if (!humanMode) {
    empty.hidden = false;
    content.hidden = true;
    el("servicingCaseEmptyTitle").textContent = "Agent servicing entry";
    el("servicingCaseEmptyCopy").textContent = agentAuthorityPilot.mandate?.status === "active"
      ? "Use the approved authenticated Agent repayment workflow, then read the same Obligation Evidence. Human session state is never relabelled as Agent state."
      : "The Human Principal must activate a scoped Mandate before the Agent can use the existing repayment and Evidence tools.";
    status.textContent = agentAuthorityPilot.mandate?.status === "active" ? "Agent tools ready" : "Mandate required";
    status.className = "state-pill neutral";
    actionButton.disabled = true;
    return null;
  }

  if (!presentation) {
    empty.hidden = false;
    content.hidden = true;
    el("servicingCaseEmptyTitle").textContent = caseObligation
      ? "Case verification unavailable"
      : "No active case";
    el("servicingCaseEmptyCopy").textContent = caseObligation
      ? "This Obligation did not pass the closed lifecycle, schedule, trusted-time, and sandbox safety checks. Refresh it through an authenticated workflow before servicing."
      : "Accept and execute one exact sandbox Obligation to open its servicing view.";
    status.textContent = caseObligation ? "Verification failed" : "No Obligation";
    status.className = caseObligation ? "state-pill warning" : "state-pill neutral";
    actionButton.disabled = true;
    return null;
  }

  empty.hidden = true;
  content.hidden = false;
  status.textContent = presentation.classificationCopy.title;
  status.className = `state-pill ${presentation.adverse ? "warning" : "neutral"}`;
  el("servicingCaseObligation").textContent = presentation.obligationId;
  el("servicingCaseObligation").title = presentation.obligationId;
  el("servicingCasePolicy").textContent = presentation.policyVersion;
  el("servicingCaseAsOf").textContent = privateDate(
    tenantPilot.obligationHydrationAsOf ?? presentation.servicingEffectiveAt,
    {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
    }
  );
  el("servicingCasePastDue").textContent = usdMinorToMoney(presentation.pastDueMinor);
  el("servicingCasePastDueHelper").textContent = presentation.classificationCopy.detail;
  el("privatePaymentsOutstanding").textContent = usdMinorToMoney(presentation.outstandingMinor);
  el("servicingCaseScheduleVersion").textContent = `Schedule v${presentation.scheduleSequence}`;
  el("privatePaymentsDpd").textContent = String(presentation.daysPastDue);
  el("servicingCaseClassification").textContent = presentation.classificationCopy.title;
  el("privatePaymentsNextDue").textContent = presentation.nextDueAt
    ? privateDate(presentation.nextDueAt)
    : "—";
  el("privatePaymentsRepaid").textContent = `${usdMinorToMoney(presentation.totalRepaidMinor)} repaid`;
  el("servicingCaseStageStatus").textContent = presentation.classificationCopy.title;
  el("servicingCaseStages").replaceChildren(...presentation.stages.map(servicingStageItem));
  el("servicingCaseStageNote").textContent = presentation.latestAction
    ? `${titleize(presentation.latestAction.actionType)} recorded from ${titleize(presentation.latestAction.source)} at ${privateDate(presentation.latestAction.effectiveAt, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.`
    : "DPD is derived from authenticated trusted UTC; this page cannot change time or classification.";
  el("servicingPastDuePrincipal").textContent = usdMinorToMoney(presentation.pastDuePrincipalMinor);
  el("servicingPastDueInterest").textContent = usdMinorToMoney(presentation.pastDueInterestMinor);
  el("servicingPastDueFees").textContent = usdMinorToMoney(presentation.pastDueFeeMinor);
  el("servicingCureSummary").textContent = presentation.cureAvailable
    ? `Pay ${usdMinorToMoney(presentation.pastDueMinor)} across every past-due component; cure is confirmed only by the returned Obligation.`
    : presentation.classification === "cured"
      ? "The exact returned Obligation confirms cure. Future scheduled amounts remain repayable through the same waterfall."
      : presentation.repaymentAvailable
        ? "Post a synthetic repayment through the existing fee, interest, and principal waterfall."
        : "This lifecycle state does not accept another sandbox repayment.";

  const amountInput = el("servicingRepaymentAmount");
  const suggestionKey = `${presentation.obligationId}:${presentation.totalRepaidMinor}:${presentation.suggestedPaymentMinor}`;
  if (amountInput.dataset.suggestionKey !== suggestionKey && document.activeElement !== amountInput) {
    amountInput.value = (Number(asBigInt(presentation.suggestedPaymentMinor)) / 100).toFixed(2);
    amountInput.dataset.suggestionKey = suggestionKey;
    if (document.activeElement !== el("humanRepaymentAmount")) {
      el("humanRepaymentAmount").value = amountInput.value;
    }
  }
  const repayment = tenantPilot.repayment;
  el("servicingCaseActionResult").textContent = presentation.latestAction
    ? `${titleize(presentation.latestAction.actionType)} confirmed · ${presentation.latestAction.reasonCode} · no production funds moved.`
    : repayment
      ? `Applied ${usdMinorToMoney(repayment.appliedMinor)} through the deterministic waterfall.`
      : "Fee → interest → principal. Cure is confirmed only by the returned Obligation.";
  actionButton.disabled = tenantPilot.busy || !tenantPilot.connected ||
    !presentation.repaymentAvailable || !validServicingRepaymentInput();
  actionButton.lastChild.textContent = presentation.cureAvailable
    ? "Pay past due & cure"
    : "Post sandbox repayment";

  const scheduleItems = presentation.installments.map((installment) =>
    privateCheckpoint(
      `Installment ${installment.installmentNumber} · ${titleize(installment.status)}`,
      `${usdMinorToMoney(installment.outstandingMinor)} remaining · ${privateDate(installment.dueAt)}`,
      {
        complete: installment.status === "paid",
        current: installment.installmentId === presentation.oldestUnpaidInstallmentId
      }
    )
  );
  el("privatePaymentsSchedule").replaceChildren(...scheduleItems);
  el("openServicingEvidenceBtn").disabled = !caseObligation;
  return presentation;
}

function syncPrivateViewMeta() {
  if (![
    "overview",
    "obligations",
    "repay-settle",
    "activity-proofs",
    "risk-operations"
  ].includes(currentView)) return;
  el("viewEyebrow").textContent = interactionMode === "human"
    ? "Human entry · shared kernel"
    : "Agent entry · shared kernel";
}

function v9DestinationMaturity(destination) {
  if (!tenantPilot.checked) {
    return { state: "checking", label: "Checking server" };
  }
  if (destination === "wallet-permissions") {
    if (!accessState.checked) return { state: "checking", label: "Checking auth server" };
    const operationsAvailable = V9_DESTINATION_OPERATION_MAP[destination]
      .every((operationId) => serverCatalogOperations.has(operationId));
    return (accessState.authEnabled || accessState.walletAuthenticationEnabled) &&
      operationsAvailable
      ? { state: "available", label: "Server sign-in available" }
      : { state: "unavailable", label: "Unavailable in this runtime" };
  }
  if (destination === "architecture") {
    return createArchitectureCapabilityPresentation(serverCatalogSnapshot).available
      ? { state: "available", label: "Catalog contract verified" }
      : { state: "unavailable", label: "Catalog unavailable" };
  }
  if (!tenantPilot.connected) {
    return { state: "denied", label: "Sign-in or role required" };
  }
  const required = V9_DESTINATION_OPERATION_MAP[destination] ?? [];
  const available = required.length > 0 &&
    required.every((operationId) => serverCatalogOperations.has(operationId));
  return available
    ? { state: "available", label: "Server operation available" }
    : { state: "unavailable", label: "Unavailable in this session" };
}

function trustSurfaceRow([name, state, enabled]) {
  const row = document.createElement("div");
  const capability = document.createElement("strong");
  const effective = document.createElement("span");
  const availability = document.createElement("span");
  row.className = "wallet-permission-row";
  row.setAttribute("role", "row");
  capability.setAttribute("role", "cell");
  effective.setAttribute("role", "cell");
  availability.setAttribute("role", "cell");
  capability.textContent = name;
  effective.textContent = state;
  availability.textContent = enabled ? "Yes" : "No";
  availability.className = enabled ? "status-ok" : "status-error";
  row.append(capability, effective, availability);
  return row;
}

function renderWalletPermissionMatrix() {
  const selectedProvider = accessState.walletProviders.find(
    ({ providerId }) => providerId === accessState.selectedWalletProviderId
  );
  const authority = walletAuthoritySnapshot ?? walletAuthorityLifecycle.getSnapshot();
  const presentation = createWalletPermissionPresentation({
    accessChecked: accessState.checked,
    sessionActive: accessState.sessionActive,
    tenantConnected: tenantPilot.connected,
    walletAddress: accessState.walletAddress,
    connectedChainId: accessState.connectedChainId,
    selectedProviderName: selectedProvider?.name,
    authorityState: authority.status,
    catalog: serverCatalogSnapshot
  });
  el("walletPermissionMatrixStatus").textContent = !presentation.checked
    ? "Checking"
    : presentation.serverSessionActive
      ? "Server session active"
      : "No active session";
  el("walletPermissionMatrixStatus").className =
    `state-pill ${presentation.serverSessionActive ? "" : "neutral"}`.trim();
  el("walletPermissionProvider").textContent = presentation.selectedProviderName;
  el("walletPermissionAccount").textContent = presentation.walletAddress
    ? shortWalletAddress(presentation.walletAddress)
    : "Not bound";
  el("walletPermissionAccount").title = presentation.walletAddress ?? "";
  el("walletPermissionNetwork").textContent = presentation.connectedChainId
    ? SUPPORTED_WALLET_CHAINS[presentation.connectedChainId]?.name ??
      `Chain ${presentation.connectedChainId}`
    : "Not bound";
  el("walletPermissionAuthority").textContent = titleize(presentation.authorityState);
  el("walletPermissionRows").replaceChildren(
    ...presentation.powers.map(trustSurfaceRow)
  );
  el("walletPermissionBoundary").textContent =
    `Consent controls ${presentation.consentOperationsAvailable ? "available" : "unavailable"}; Mandate controls ${presentation.mandateOperationsAvailable ? "available" : "unavailable"}. No catalog entry grants token approval, arbitrary transaction, withdrawal, or funds authority.`;
}

function architectureCapabilityRow(destination) {
  const row = document.createElement("div");
  const name = document.createElement("strong");
  const operations = document.createElement("code");
  const state = document.createElement("span");
  row.className = "architecture-capability-row";
  row.setAttribute("role", "row");
  name.setAttribute("role", "cell");
  operations.setAttribute("role", "cell");
  state.setAttribute("role", "cell");
  name.textContent = VIEW_META[destination.destinationId]?.title ??
    destination.destinationId;
  operations.textContent = destination.requiredOperationIds.length > 0
    ? destination.requiredOperationIds.join(" · ")
    : "Checked-in catalog contract";
  state.textContent = destination.catalogBacked ? "Verified" : "Unavailable";
  state.className = destination.catalogBacked ? "status-ok" : "status-error";
  row.append(name, operations, state);
  return row;
}

function renderArchitectureContract() {
  const presentation = createArchitectureCapabilityPresentation(serverCatalogSnapshot);
  const verified = presentation.destinations.filter(
    ({ catalogBacked }) => catalogBacked
  ).length;
  el("architectureCatalogStatus").textContent = presentation.available
    ? "Catalog verified"
    : "Unavailable";
  el("architectureCatalogStatus").className =
    `state-pill ${presentation.available ? "" : "warning"}`.trim();
  el("architectureCatalogMaturity").textContent = presentation.maturity;
  el("architectureCatalogTransports").textContent = presentation.transports.length > 0
    ? presentation.transports.join(" · ")
    : "Unavailable";
  el("architectureDestinationCoverage").textContent =
    `${verified}/${presentation.destinationCount} verified`;
  el("architectureSafety").textContent = presentation.available
    ? `Real funds ${presentation.safety.realFundsEnabled ? "enabled" : "disabled"} · production credit ${presentation.safety.productionCreditEnabled ? "enabled" : "disabled"} · raw PII ${presentation.safety.rawPiiAllowed ? "allowed" : "prohibited"}`
    : "No capability inferred";
  el("architectureCapabilityRows").replaceChildren(
    ...presentation.destinations.map(architectureCapabilityRow)
  );
}

function renderOfficialReportPilot() {
  const report = officialReportPilot.report;
  const reportId = tenantInputValue("officialReportId");
  const exactReportId = exactResourceId(reportId);
  const createEnabled = Boolean(
    tenantPilot.connected &&
    tenantPilot.obligation?.obligationId &&
    officialReportPilot.createAvailable
  );
  el("createOfficialReportBtn").disabled =
    officialReportPilot.busy || !createEnabled;
  el("readOfficialReportBtn").disabled =
    officialReportPilot.busy || !officialReportPilot.readAvailable || !exactReportId;
  el("retrieveOfficialReportBtn").disabled =
    officialReportPilot.busy ||
    !officialReportPilot.retrieveAvailable ||
    !exactReportId ||
    report?.effectiveStatus !== "active";
  el("revokeOfficialReportBtn").disabled =
    officialReportPilot.busy ||
    !officialReportPilot.revokeAvailable ||
    !exactReportId ||
    report?.effectiveStatus !== "active";
  for (const id of [
    "createOfficialReportBtn",
    "readOfficialReportBtn",
    "retrieveOfficialReportBtn",
    "revokeOfficialReportBtn"
  ]) {
    el(id).toggleAttribute("aria-busy", officialReportPilot.busy);
  }
  el("officialReportCreateHelper").textContent = createEnabled
    ? "Ready: the server will reauthorize this exact owned Obligation and bound the source to 50 redacted Evidence events."
    : tenantPilot.obligation
      ? "The official report operations are unavailable in this authenticated catalog."
      : "Load an owned Obligation before creating an official report.";
  el("officialReportAccessHelper").textContent = officialReportPilot.helper;
  el("officialReportAccessHelper").classList.toggle("error", officialReportPilot.error);
  el("officialReportAccessStatus").textContent = report
    ? titleize(report.effectiveStatus)
    : "Not loaded";
  el("officialReportAccessStatus").className =
    `state-pill ${report?.effectiveStatus === "active" ? "" : "neutral"}`.trim();
  el("reportsExportsStateTitle").textContent = report
    ? `${titleize(report.effectiveStatus)} official report`
    : "No official report loaded";
  el("reportsExportsStateCopy").textContent = report
    ? `${report.format.toUpperCase()} metadata was returned by the authenticated server. Retrieval will recheck authorization and verify the exact SHA-256 before download.`
    : officialReportPilot.helper;
  el("officialReportEffectiveStatus").textContent = report
    ? titleize(report.effectiveStatus)
    : "Not loaded";
  el("officialReportEffectiveStatus").className =
    `state-pill ${report?.effectiveStatus === "active" ? "" : "neutral"}`.trim();
  el("officialReportSha256").textContent = report?.contentSha256 ?? "—";
  el("officialReportSha256").title = report?.contentSha256 ?? "";
  el("officialReportArtifactHash").textContent = report?.artifactHash ?? "—";
  el("officialReportArtifactHash").title = report?.artifactHash ?? "";
  el("officialReportEvidenceCount").textContent = report
    ? `${report.sourceEvidenceCount} persisted events`
    : "—";
  el("officialReportExpiresAt").textContent = report
    ? formatEvidenceTime(report.expiresAt, { short: true })
    : "—";
  el("officialReportAuthorization").textContent = officialReportPilot.retrievedAt
    ? `Revalidated ${formatEvidenceTime(officialReportPilot.retrievedAt, { short: true })}`
    : "Rechecked on every access";
  el("officialReportFeePolicy").textContent =
    report?.feeAuditPolicy?.availability === "unavailable" &&
      report.feeAuditPolicy.principalAsFeeBaseAllowed === false &&
      report.feeAuditPolicy.unrealizedPnlAsFeeBaseAllowed === false
      ? "Unavailable · principal and unrealized PnL excluded as fee bases"
      : "Unavailable · no production fee authority";
}

function setV9RuntimeState(state, title, copy) {
  const container = el("v9OverviewState");
  container.className = `v9-runtime-state ${state}`;
  el("v9OverviewStateTitle").textContent = title;
  el("v9OverviewStateCopy").textContent = copy;
}

function renderV9ShellStates() {
  for (const destination of Object.keys(VIEW_META)) {
    const maturity = v9DestinationMaturity(destination);
    for (const badge of document.querySelectorAll(`[data-v9-maturity="${destination}"]`)) {
      badge.classList.remove("checking", "available", "denied", "unavailable");
      badge.classList.add(maturity.state);
      badge.textContent = maturity.label;
    }
  }

  if (!tenantPilot.checked) {
    setV9RuntimeState(
      "loading",
      "Loading authenticated server truth",
      "Workspace recovery and owned reads are still pending. No amount is inferred in the browser."
    );
  } else if (!tenantPilot.connected) {
    setV9RuntimeState(
      "denied",
      "Authenticated workspace unavailable",
      "Sign in with an eligible role to load Actor-bound resources. Missing and denied resources are not enumerated."
    );
  } else if (tenantPilot.workspaceRecoveryState === "loading") {
    setV9RuntimeState(
      "loading",
      "Loading authenticated server truth",
      "Workspace recovery and owned reads are still pending. No amount is inferred in the browser."
    );
  } else if (tenantPilot.workspaceRecoveryState === "denied") {
    setV9RuntimeState(
      "denied",
      "Workspace recovery unavailable",
      "The authenticated Gateway did not expose an eligible workspace. No resource existence is disclosed."
    );
  } else if (tenantPilot.workspaceRecoveryState === "error") {
    setV9RuntimeState(
      "unavailable",
      "Workspace recovery could not complete",
      "Retry the authenticated server read. Browser state is not substituted for durable truth."
    );
  } else if (tenantPilot.workspaceRecoveryResourceCount === 0) {
    setV9RuntimeState(
      "empty",
      "Authenticated workspace is empty",
      "No Actor-bound Subject, Consent, Mandate, or Obligation was returned. Start an eligible no-funds lifecycle to continue."
    );
  } else {
    setV9RuntimeState(
      "restart",
      "Workspace recovered from durable server state",
      `${tenantPilot.workspaceRecoveryResourceCount} Actor-bound resource reference${tenantPilot.workspaceRecoveryResourceCount === 1 ? "" : "s"} restored after session verification.`
    );
  }

  if (tenantPilot.decision) {
    el("creditPassportStateTitle").textContent = "Verified Decision Passport ready";
    el("creditPassportStateCopy").textContent =
      "The current authenticated application returned a deterministic Decision, policy version, reason codes, and Evidence references.";
  } else {
    el("creditPassportStateTitle").textContent = "No Decision Passport loaded";
    el("creditPassportStateCopy").textContent = tenantPilot.connected
      ? "Complete or restore an authenticated credit application. This view will not manufacture a score, Decision, or shareable proof."
      : "Sign in to read an eligible application. Denied and missing applications are not enumerated.";
  }

  if (tenantPilot.obligation && ownedEvidence.queried) {
    el("creditTrackRecordStateTitle").textContent = "Verified lifecycle loaded";
    el("creditTrackRecordStateCopy").textContent =
      `${ownedEvidence.items.length} redacted Evidence event${ownedEvidence.items.length === 1 ? "" : "s"} loaded for the selected owned Obligation.`;
  } else if (tenantPilot.obligation) {
    el("creditTrackRecordStateTitle").textContent = "Owned Obligation loaded";
    el("creditTrackRecordStateCopy").textContent =
      "Load its authenticated Evidence before treating the lifecycle as a verified track record.";
  } else {
    el("creditTrackRecordStateTitle").textContent = "No verified lifecycle loaded";
    el("creditTrackRecordStateCopy").textContent = tenantPilot.connected
      ? "Restore an owned Obligation and load its Evidence. No positive history is inferred from an empty browser state."
      : "Sign in to load an eligible owned Obligation. Missing resources remain non-enumerating.";
  }

  if (accessState.sessionActive || tenantPilot.connected) {
    el("walletPermissionsStateTitle").textContent = "Authenticated server session active";
    el("walletPermissionsStateCopy").textContent = accessState.walletAddress
      ? `${shortWalletAddress(accessState.walletAddress)} is bound only to the current approved authentication context.`
      : "The current server session is active. No wallet identity or signing authority is inferred when the session uses another approved method.";
  } else if (!accessState.checked) {
    el("walletPermissionsStateTitle").textContent = "Checking authentication";
    el("walletPermissionsStateCopy").textContent =
      "No wallet or server-session authority is assumed before verification.";
  } else {
    el("walletPermissionsStateTitle").textContent = "No authenticated session";
    el("walletPermissionsStateCopy").textContent =
      "Choose an approved sign-in method. Connecting a wallet alone does not grant a server session or product authority.";
  }
  renderWalletPermissionMatrix();
  renderArchitectureContract();
  renderOfficialReportPilot();
  renderTradingCapital();
}

function setPrivateAction(button, action, label) {
  button.dataset.privateAction = action;
  button.textContent = label;
}

function renderPrivateProductSurfaces() {
  const privateConnected = tenantPilot.connected;
  const privateViewLabels = {
    overview: "privatePortfolioTitle",
    obligations: "privateCreditTitle",
    "repay-settle": "privatePaymentsTitle",
    "activity-proofs": "privateEvidenceTitle",
    "risk-operations": "privateRiskTitle"
  };
  for (const [view, privateLabel] of Object.entries(privateViewLabels)) {
    document.querySelector(`[data-view-panel="${view}"]`)?.setAttribute(
      "aria-labelledby",
      privateLabel
    );
  }
  for (const surface of document.querySelectorAll("[data-private-session-surface]")) {
    surface.hidden = false;
  }

  syncPrivateViewMeta();
  const humanMode = interactionMode === "human";
  const obligation = tenantPilot.obligation;
  const offer = tenantPilot.offer;
  const decision = tenantPilot.decision;
  const mandate = agentAuthorityPilot.mandate;
  const accountBinding = agentAuthorityPilot.accountBinding?.accountBinding;
  const nextInstallment = privateNextInstallment(obligation);
  const humanStatus = privateHumanLifecycleStatus();
  const agentStatus = privateAgentLifecycleStatus();
  const finalities = new Set(ownedEvidence.items.map((item) => item.sourceFinality));
  const evidenceFinality = finalities.size === 0
    ? "Waiting"
    : finalities.size === 1
      ? titleize([...finalities][0])
      : `${finalities.size} states`;

  el("privatePortfolioMode").textContent = humanMode ? "Human entry" : "Agent entry";
  el("privatePortfolioCopy").textContent = humanMode
    ? "Continue the Human no-funds lifecycle without leaving the authenticated private session."
    : "Carry Principal-approved identity and bounded authority into the same Obligation kernel through the approved local Agent Host.";
  el("privatePortfolioLifecycle").textContent = humanMode ? humanStatus : agentStatus;
  el("privatePortfolioOutstanding").textContent = obligation
    ? usdMinorToMoney(obligation.outstandingPrincipalMinor)
    : tenantPilot.connected
      ? "No selected Obligation"
      : "Unavailable";
  el("privatePortfolioNextPayment").textContent = nextInstallment
    ? `${usdMinorToMoney(privateInstallmentAmount(nextInstallment))} · ${privateDate(nextInstallment.dueAt, { month: "short", day: "numeric" })}`
    : "—";
  el("privatePortfolioAvailableCredit").textContent = "Unavailable";
  el("privatePortfolioAvailableCredit").title =
    "No authenticated server operation currently returns available credit.";
  el("privatePortfolioEvidence").textContent = ownedEvidence.queried
    ? `${ownedEvidence.items.length} loaded`
    : obligation
      ? "Available"
      : "Not loaded";
  setPrivateAction(
    el("privatePortfolioPrimaryBtn"),
    humanMode ? "human-credit" : mandate?.status === "active" ? "agent-api" : "principal-authority",
    humanMode ? obligation ? "Open Obligation" : "Open Human credit" : mandate?.status === "active" ? "Open Agent API" : "Configure Agent authority"
  );
  setPrivateAction(
    el("privatePortfolioSecondaryBtn"),
    humanMode ? "principal-authority" : "human-credit",
    humanMode ? "Configure Agent authority" : "Open Human credit"
  );

  el("privateHumanEntryStatus").textContent = humanStatus;
  el("privateHumanOfferStatus").textContent = offer
    ? `${titleize(offer.status)} · ${usdMinorToMoney(offer.approvedPrincipalMinor)}`
    : tenantPilot.intent
      ? "Decision pending"
      : "Not requested";
  el("privateHumanObligationStatus").textContent = obligation
    ? titleize(obligation.status)
    : "Not created";
  el("privateHumanServicingStatus").textContent = obligation
    ? `${servicingClassificationLabel(obligation.servicingClassification ?? "current")} · DPD ${obligation.daysPastDue ?? 0}`
    : "Not started";
  el("privateAgentEntryStatus").textContent = agentStatus;
  el("privateAgentSubjectStatus").textContent = agentAuthorityPilot.subject
    ? titleize(agentAuthorityPilot.subject.status)
    : "Not created";
  el("privateAgentAccountStatus").textContent = accountBinding
    ? `${titleize(accountBinding.status)} · ${accountBinding.chainId}`
    : agentAuthorityPilot.accountChallenge
      ? "Signing request open"
      : "Not submitted";
  el("privateAgentMandateStatus").textContent = mandate ? titleize(mandate.status) : "Not created";

  const checkpoints = [
    ["Identity & authority", tenantPilot.intent || offer || obligation ? "Human Consent verified" : agentAuthorityPilot.subject ? agentStatus : "Create Human Subject or Agent authority", Boolean(tenantPilot.intent || offer || obligation || agentAuthorityPilot.subject)],
    ["Decision & Offer", offer ? `${titleize(decision?.status)} · ${usdMinorToMoney(offer.approvedPrincipalMinor)}` : "Awaiting deterministic evaluation", Boolean(offer)],
    ["Shared Obligation", obligation ? `${titleize(obligation.status)} · schedule v${obligation.scheduleSequence ?? 1}` : "Awaiting exact Offer acceptance", Boolean(obligation)],
    ["Sandbox execution", obligation?.executionStatus === "executed" ? "Signed non-withdrawable receipt verified" : "No production funds can move", obligation?.executionStatus === "executed"],
    ["Repayment & Evidence", obligation?.status === "fully_repaid" ? "Lifecycle repaid" : ownedEvidence.queried ? `${ownedEvidence.items.length} Evidence events loaded` : "Owner and Agent reads remain permission-bound", obligation?.status === "fully_repaid" || ownedEvidence.queried]
  ];
  const firstIncomplete = checkpoints.findIndex((checkpoint) => !checkpoint[2]);
  el("privateLifecycleList").replaceChildren(...checkpoints.map((checkpoint, index) =>
    privateCheckpoint(checkpoint[0], checkpoint[1], {
      complete: checkpoint[2],
      current: index === firstIncomplete
    })
  ));

  const obligationPortfolio = renderObligationPortfolio();
  el("privateCreditEyebrow").textContent = humanMode
    ? "Human-owned obligations"
    : "Principal-controlled Agent obligations";
  el("privateCreditTitle").textContent = humanMode
    ? "Every position, reconciled to server truth."
    : "Agent entry, one shared obligation kernel.";
  el("privateCreditCopy").textContent = humanMode
    ? "Bounded workspace references are reauthorized one exact Obligation at a time before any amount or state appears."
    : "The Principal view labels Mandate entry without forking schedule, servicing, Ledger, Event, or Evidence truth.";
  el("privateCreditStatus").textContent = obligationPortfolio
    ? `${titleize(obligationPortfolio.lifecycle.status)} · ${servicingClassificationLabel(obligationPortfolio.lifecycle.servicingClassification)}`
    : tenantPilot.obligation
      ? "Verification failed"
      : "Not loaded";
  el("privateCreditStatus").className =
    `state-pill ${obligationPortfolio?.lifecycle.daysPastDue > 0 ? "warning" : "neutral"}`;
  el("privateCreditPrincipal").textContent = obligationPortfolio
    ? usdMinorToMoney(obligationPortfolio.amounts.originalPrincipalMinor)
    : "—";
  el("privateCreditRate").textContent = obligationPortfolio
    ? bpsToPercent(obligationPortfolio.terms.annualRateBps)
    : "—";
  el("privateCreditMaturity").textContent = obligationPortfolio
    ? privateDate(obligationPortfolio.terms.maturityAt)
    : "—";
  el("privateCreditOutstanding").textContent = obligationPortfolio
    ? usdMinorToMoney(obligationPortfolio.amounts.outstandingTotalMinor)
    : "—";
  el("privateCreditReasons").textContent = obligationPortfolio
    ? `${obligationPortfolio.authority.label} · ${titleize(obligationPortfolio.relationship)} · ${servicingClassificationLabel(obligationPortfolio.lifecycle.reasonCode)} · ${obligationPortfolio.executionRail.label}`
    : tenantPilot.connected
      ? "Refresh exact owner-authorized server state before relying on an amount, status, authority, or rail."
      : "Sign in to recover bounded owned references. Missing and denied resources remain non-enumerating.";
  el("privateCreditBoundary").textContent = humanMode
    ? "Human Consent is the entry authority; all state remains canonical obligation.v2 with immutable Evidence. This page adds no operation or browser Ledger."
    : "Agent Mandate changes authority presentation only. The same exact reads, amounts, schedule, servicing state, and Evidence contract are used.";
  setPrivateAction(
    el("privateCreditPrimaryBtn"),
    tenantPilot.workspaceObligations.length > 0
      ? "refresh-obligations"
      : humanMode
        ? "human-credit"
        : mandate?.status === "active"
          ? "agent-api"
          : "principal-authority",
    tenantPilot.workspaceObligations.length > 0
      ? "Refresh owned positions"
      : humanMode
        ? "Create first Obligation"
        : mandate?.status === "active"
          ? "Open Agent API"
          : "Configure Agent authority"
  );

  el("privatePaymentsEyebrow").textContent = humanMode ? "Human repayment" : "Agent repayment";
  el("privatePaymentsTitle").textContent = humanMode
    ? "Repay with the schedule in view."
    : "Route repayment through approved Agent authority.";
  el("privatePaymentsCopy").textContent = humanMode
    ? "Post synthetic repayment against the exact shared Obligation and inspect deterministic allocation."
    : "The Agent uses an approved authenticated HTTPS workflow; servicing, allocation, and Evidence stay in the shared kernel.";
  const servicingCase = renderServicingCase({ humanMode, obligation, nextInstallment });
  setPrivateAction(
    el("privatePaymentsPrimaryBtn"),
    humanMode ? servicingCase ? "servicing-cure" : obligation ? "human-obligation" : "human-credit" : mandate?.status === "active" ? "agent-api" : "principal-authority",
    humanMode ? servicingCase ? "Open Servicing Case" : obligation ? "Open Obligation" : "Open Human credit" : mandate?.status === "active" ? "Open Agent API" : "Configure Agent authority"
  );

  el("privateEvidenceEyebrow").textContent = humanMode ? "Owner Evidence" : "Agent Evidence";
  el("privateEvidenceTitle").textContent = humanMode
    ? "Verify the lifecycle, not a screenshot."
    : "Read the same immutable Evidence through the authenticated Agent API.";
  el("privateEvidenceCopy").textContent = humanMode
    ? "Load redacted immutable events for the exact Obligation owned by this authenticated Human session."
    : "The approved Agent Evidence tool returns the same obligation-bound timeline without expanding authority.";
  el("privateEvidenceStatus").textContent = ownedEvidence.queried
    ? `${ownedEvidence.items.length} loaded`
    : obligation
      ? "Available"
      : "Not loaded";
  el("privateEvidenceObligation").textContent = obligation?.obligationId ?? "Not created";
  el("privateEvidenceObligation").title = obligation?.obligationId ?? "";
  el("privateEvidenceCount").textContent = String(ownedEvidence.items.length);
  el("privateEvidenceFinality").textContent = evidenceFinality;
  el("privateEvidenceAsOf").textContent = ownedEvidence.asOf
    ? formatEvidenceTime(ownedEvidence.asOf, { short: true })
    : "Not queried";
  el("privateEvidenceList").replaceChildren(...(ownedEvidence.items.length
    ? ownedEvidence.items.slice(-5).reverse().map((item) => privateCheckpoint(
      titleize(item.eventType),
      `${titleize(item.sourceFinality)} · ${formatEvidenceTime(item.occurredAt, { short: true })}`,
      { complete: item.sourceFinality === "finalized" }
    ))
    : [emptyRow(obligation
      ? "Open the owner timeline or Agent API to load immutable Evidence."
      : "Create one shared Obligation before querying its Evidence.")]));
  setPrivateAction(
    el("privateEvidencePrimaryBtn"),
    humanMode ? obligation ? "human-evidence" : "human-credit" : mandate?.status === "active" ? "agent-api" : "principal-authority",
    humanMode ? obligation ? "Open owner timeline" : "Open Human credit" : mandate?.status === "active" ? "Open Agent API" : "Configure Agent authority"
  );

  if (!privateConnected) {
    el("privatePortfolioCopy").textContent =
      "Sign in to load your permission-bound Human or Agent workspace. No browser fixture or public fallback state will be substituted.";
    el("privatePortfolioLifecycle").textContent = tenantPilot.checked
      ? tenantPilot.connectionLabel
      : "Verifying secure session";
    for (const button of [
      el("privatePortfolioPrimaryBtn"),
      el("privatePortfolioSecondaryBtn"),
      el("privateCreditPrimaryBtn"),
      el("privatePaymentsPrimaryBtn"),
      el("privateEvidencePrimaryBtn")
    ]) {
      setPrivateAction(button, "open-access", "Sign in to continue");
    }
  }
  renderV9ShellStates();
}

function normalizePilotFeedbackControls({ changed } = {}) {
  const sentiment = el("pilotFeedbackSentiment");
  const outcome = el("pilotFeedbackOutcome");
  const blocker = el("pilotFeedbackBlocker");
  if (!sentiment || !outcome || !blocker) return;
  if (changed === "sentiment" && sentiment.value === "blocked" && outcome.value === "completed") {
    outcome.value = "needs_support";
  }
  if (outcome.value === "completed") {
    blocker.value = "none";
  } else if (sentiment.value === "blocked" && blocker.value === "none") {
    blocker.value = "other_no_text";
  }
}

function renderPilotFeedback() {
  if (!el("pilotFeedbackForm")) return;
  normalizePilotFeedbackControls();
  const subjectId = tenantInputValue("humanSubjectId");
  const ready = tenantPilot.connected && pilotFeedback.catalogAvailable && exactResourceId(subjectId);
  const status = el("pilotFeedbackStatus");
  status.classList.remove("neutral", "warning");
  if (!pilotFeedback.catalogAvailable) {
    status.textContent = "Operation unavailable";
    status.classList.add("warning");
  } else if (pilotFeedback.error) {
    status.textContent = "Action required";
    status.classList.add("warning");
  } else if (pilotFeedback.busy) {
    status.textContent = "Recording";
    status.classList.add("neutral");
  } else if (pilotFeedback.submitted) {
    status.textContent = `Recorded · ${titleize(pilotFeedback.submitted.sentiment)}`;
  } else if (ready) {
    status.textContent = "Structured feedback ready";
  } else {
    status.textContent = "Subject required";
    status.classList.add("neutral");
  }

  for (const control of el("pilotFeedbackForm").querySelectorAll("select")) {
    control.disabled = pilotFeedback.busy;
  }
  el("pilotFeedbackBlocker").disabled = pilotFeedback.busy || el("pilotFeedbackOutcome").value === "completed";
  const button = el("submitPilotFeedbackBtn");
  button.disabled = pilotFeedback.busy || !ready;
  button.toggleAttribute("aria-busy", pilotFeedback.busy);
  button.textContent = pilotFeedback.busy ? "Recording private feedback…" : "Submit private feedback";
  el("pilotFeedbackHelper").textContent = pilotFeedback.helper;
  el("pilotFeedbackHelper").classList.toggle("error", pilotFeedback.error);
}

async function submitPilotFeedback() {
  if (pilotFeedback.busy) return;
  normalizePilotFeedbackControls();
  const subjectId = tenantInputValue("humanSubjectId");
  if (!pilotFeedback.catalogAvailable || !tenantPilot.connected || !exactResourceId(subjectId)) {
    pilotFeedback.error = true;
    pilotFeedback.helper = "Create or restore your Human Subject before submitting feedback.";
    renderPilotFeedback();
    announce(pilotFeedback.helper);
    return;
  }

  pilotFeedback.busy = true;
  pilotFeedback.error = false;
  pilotFeedback.helper = "Verifying Subject ownership and recording one categorical Evidence receipt…";
  renderPilotFeedback();
  try {
    const result = await tenantApi("pilotSubmitPilotFeedback", {
      resource: { resourceType: "subject", resourceId: subjectId },
      payload: {
        surface: el("pilotFeedbackSurface").value,
        lifecycleStage: el("pilotFeedbackStage").value,
        sentiment: el("pilotFeedbackSentiment").value,
        outcome: el("pilotFeedbackOutcome").value,
        blockerCode: el("pilotFeedbackBlocker").value,
        schemaVersion: "pilot_feedback_record.v1"
      },
      idempotent: true
    });
    pilotFeedback.submitted = result.response;
    pilotFeedback.helper = "Feedback recorded as immutable categorical Evidence. No identifier, free text, or PII was returned.";
    toast("Private pilot feedback recorded");
    announce(pilotFeedback.helper);
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    pilotFeedback.error = true;
    pilotFeedback.helper = nonEnumerating
      ? "This authenticated Human session does not own the requested Subject."
      : `Feedback could not be recorded. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(pilotFeedback.helper, "error");
    announce(pilotFeedback.helper);
  } finally {
    pilotFeedback.busy = false;
    renderPilotFeedback();
  }
}

function creditPassportDisclosureRow(disclosure) {
  const row = document.createElement("div");
  const label = document.createElement("strong");
  const grade = document.createElement("span");
  const lineage = document.createElement("small");
  row.className = "credit-passport-disclosure";
  label.textContent = disclosure.claimLabel;
  grade.className = `state-pill ${disclosure.grade === "verified" ? "" : "neutral"}`;
  grade.textContent = disclosure.gradeLabel;
  lineage.textContent =
    `${disclosure.reasonCodes.length} canonical reason code${disclosure.reasonCodes.length === 1 ? "" : "s"} · ` +
    `${disclosure.evidenceCount} finalized Evidence reference${disclosure.evidenceCount === 1 ? "" : "s"}`;
  row.append(label, grade, lineage);
  return row;
}

function renderCreditPassportPilot() {
  const presentation = creditPassportPilot.presentation;
  const artifact = creditPassportPilot.artifact;
  const busy = creditPassportPilot.busy;
  const connected = tenantPilot.connected;
  const subjectInput = el("creditPassportSubjectId");
  const intentInput = el("creditPassportIntentId");
  if (!subjectInput.value && tenantPilot.decision?.subjectId) {
    subjectInput.value = tenantPilot.decision.subjectId;
  }
  if (!intentInput.value && tenantPilot.intent?.creditIntentId) {
    intentInput.value = tenantPilot.intent.creditIntentId;
  }

  el("creditPassportIssueHelper").textContent = creditPassportPilot.issueHelper;
  el("creditPassportIssueHelper").classList.toggle("error", creditPassportPilot.error);
  el("creditPassportArtifactHelper").textContent = creditPassportPilot.artifactHelper;
  el("creditPassportArtifactHelper").classList.toggle("error", creditPassportPilot.error);
  el("creditPassportVerificationHelper").textContent =
    creditPassportPilot.verificationHelper;
  el("creditPassportVerificationHelper").classList.toggle(
    "error",
    creditPassportPilot.error
  );

  const exactIssueInput =
    exactResourceId(tenantInputValue("creditPassportSubjectId")) &&
    exactResourceId(tenantInputValue("creditPassportIntentId")) &&
    exactResourceId(tenantInputValue("creditPassportVerifierActorId"));
  el("issueCreditPassportBtn").disabled =
    busy || !connected || !creditPassportPilot.createAvailable || !exactIssueInput;
  el("readCreditPassportBtn").disabled =
    busy ||
    !connected ||
    !creditPassportPilot.readAvailable ||
    !exactResourceId(tenantInputValue("creditPassportArtifactId"));

  const status = el("creditPassportArtifactStatus");
  status.classList.toggle("neutral", !presentation);
  status.classList.toggle(
    "warning",
    Boolean(presentation && presentation.statusTone === "warning")
  );
  status.textContent = presentation?.statusLabel ?? "Not loaded";
  el("creditPassportArtifactIdentity").textContent = presentation?.artifactLabel ?? "—";
  el("creditPassportArtifactIssuer").textContent = presentation?.issuerLabel ?? "—";
  el("creditPassportArtifactLifetime").textContent = presentation?.lifetimeLabel ?? "—";
  el("creditPassportSourceHash").textContent = artifact?.sourceDecisionPassportHash ?? "—";
  el("creditPassportArtifactHash").textContent = artifact?.artifactHash ?? "—";
  el("creditPassportDisclosureRows").replaceChildren(
    ...(presentation
      ? presentation.disclosures.map(creditPassportDisclosureRow)
      : [emptyRow("Issue or read an authorized artifact to inspect its selected, evidenced disclosures.")])
  );
  el("revokeCreditPassportBtn").disabled =
    busy ||
    !connected ||
    !creditPassportPilot.revokeAvailable ||
    artifact?.effectiveStatus !== "active";

  const verifyId = tenantInputValue("creditPassportVerifyArtifactId");
  const verifyHash = tenantInputValue("creditPassportVerifyHash");
  const verifyVersion = Number(el("creditPassportVerifyVersion").value);
  el("verifyCreditPassportBtn").disabled =
    busy ||
    !connected ||
    !creditPassportPilot.verifyAvailable ||
    !exactResourceId(verifyId) ||
    !/^0x[0-9a-f]{64}$/.test(verifyHash) ||
    !Number.isSafeInteger(verifyVersion) ||
    verifyVersion < 1;
  const verificationStatus = el("creditPassportVerificationStatus");
  verificationStatus.classList.toggle("neutral", !creditPassportPilot.verification);
  verificationStatus.classList.toggle(
    "warning",
    Boolean(
      creditPassportPilot.verification &&
      !creditPassportPilot.verification.verified
    )
  );
  verificationStatus.textContent = creditPassportPilot.verification
    ? creditPassportPilot.verification.verified
      ? "Verified active"
      : titleize(creditPassportPilot.verification.status)
    : "Not verified";

  const finalized = ownedEvidence.items.filter(
    ({ sourceFinality }) => sourceFinality === "finalized"
  ).length;
  const nonFinal = ownedEvidence.items.length - finalized;
  el("creditTrackRecordDecision").textContent = tenantPilot.decision?.decisionPassport
    ? `${titleize(tenantPilot.decision.status)} · ${compactDecisionProofHash(
        tenantPilot.decision.decisionPassport.decisionPassportHash
      )}`
    : "Not loaded";
  el("creditTrackRecordEvidenceCount").textContent =
    `${ownedEvidence.items.length} event${ownedEvidence.items.length === 1 ? "" : "s"}`;
  el("creditTrackRecordFinalizedCount").textContent = String(finalized);
  el("creditTrackRecordNonFinalCount").textContent = String(nonFinal);
  const finality = el("creditTrackRecordFinality");
  finality.classList.toggle("neutral", !ownedEvidence.queried);
  finality.classList.toggle("warning", ownedEvidence.queried && nonFinal > 0);
  finality.textContent = !ownedEvidence.queried
    ? "Not loaded"
    : nonFinal > 0
      ? "Mixed finality"
      : "Finalized only";
}

function capitalNetworkAmount(assetId, minor) {
  if (
    assetId === "urn:ipo-one:sandbox-asset:usd-cent" &&
    /^(?:0|[1-9][0-9]{0,77})$/.test(minor ?? "")
  ) {
    const value = BigInt(minor);
    return `$${(value / 100n).toLocaleString("en-US")}.${String(value % 100n).padStart(2, "0")}`;
  }
  return `${minor ?? "—"} minor units`;
}

function currentCapitalNetworkPresentation() {
  return createCapitalNetworkPresentation({
    catalogOperationIds: [...serverCatalogOperations],
    providerView: capitalNetworkPilot.providerView,
    acknowledgement: capitalNetworkPilot.acknowledgement
  });
}

function renderCapitalNetwork() {
  if (!el("capitalNetworkQueryForm")) return;
  const presentation = currentCapitalNetworkPresentation();
  capitalNetworkPilot.presentation = presentation;
  const contractStatus = el("capitalNetworkContractStatus");
  contractStatus.classList.remove("neutral", "warning");
  if (!presentation) {
    contractStatus.textContent = "Contract rejected";
    contractStatus.classList.add("warning");
  } else if (presentation.status === "unavailable") {
    contractStatus.textContent = "Operations unavailable";
    contractStatus.classList.add("warning");
  } else if (presentation.status === "empty") {
    contractStatus.textContent = "No-funds contract ready";
    contractStatus.classList.add("neutral");
  } else {
    contractStatus.textContent = "Server contract verified";
  }

  const readAvailable = Boolean(
    presentation?.availability.read &&
    tenantPilot.connected
  );
  const input = el("capitalNetworkTransferIntentId");
  const load = el("capitalNetworkLoadBtn");
  input.disabled = capitalNetworkPilot.busy || !readAvailable;
  load.disabled =
    capitalNetworkPilot.busy ||
    !readAvailable ||
    !exactResourceId(input.value.trim());
  load.toggleAttribute("aria-busy", capitalNetworkPilot.busy);
  load.textContent = capitalNetworkPilot.busy
    ? "Verifying assignment…"
    : "Load assigned intent";
  const helper = el("capitalNetworkHelper");
  helper.textContent = capitalNetworkPilot.helper;
  helper.classList.toggle("error", capitalNetworkPilot.error);

  const loaded = presentation?.mandate ? presentation : null;
  const stateTitle = el("capitalNetworkStateTitle");
  const stateCopy = el("capitalNetworkStateCopy");
  if (!presentation) {
    stateTitle.textContent = "Provider presentation rejected";
    stateCopy.textContent =
      "The exact server response failed the closed presentation contract. No Provider state or amount is displayed.";
  } else if (!readAvailable) {
    stateTitle.textContent = "Provider workspace unavailable";
    stateCopy.textContent =
      "An authenticated Provider role and the exact catalogued read are required. Catalog presence alone does not grant access.";
  } else if (!loaded) {
    stateTitle.textContent = "No Provider intent loaded";
    stateCopy.textContent =
      "The browser does not infer Provider exposure, facility state, earnings, or reconciliation from prototype data.";
  } else {
    const stateLabels = {
      assigned: "Exact sandbox assignment loaded",
      acknowledged: "Acknowledgement recorded",
      reconciled: "Signed callback processed"
    };
    stateTitle.textContent = stateLabels[loaded.status];
    stateCopy.textContent =
      `${titleize(loaded.delivery.status)} · server-derived Provider delivery · no production funds moved · nonwithdrawable.`;
  }

  const mandate = loaded?.mandate;
  const facility = loaded?.facility;
  const allocation = loaded?.allocation;
  const delivery = loaded?.delivery;
  const reconciliation = loaded?.reconciliation;
  const earnings = loaded?.earningsSimulation;
  const mandateStatus = el("capitalNetworkMandateStatus");
  mandateStatus.classList.toggle("warning", !mandate);
  mandateStatus.textContent = mandate ? "Assigned · no funds" : "Not loaded";
  for (const [id, value] of [
    ["capitalNetworkProviderId", mandate?.providerId],
    ["capitalNetworkPurpose", mandate ? titleize(mandate.purposeCode) : null],
    ["capitalNetworkIntent", mandate?.transferIntentId]
  ]) {
    const target = el(id);
    target.textContent = value ? compactOpaqueId(value) : "Server required";
    target.title = value ?? "";
  }
  el("capitalNetworkExposure").textContent = facility
    ? `${capitalNetworkAmount(facility.sourceAssetId, facility.sourceAmountMinor)} sandbox`
    : "No server amount";
  el("capitalNetworkAsset").textContent = facility
    ? `${facility.sourceAssetId} → ${facility.destinationAssetId}. Simulation only; not deployed capital.`
    : "Asset unavailable until an exact intent is loaded.";

  const deliveryStatus = el("capitalNetworkDeliveryStatus");
  deliveryStatus.classList.toggle("warning", !delivery || loaded.status !== "reconciled");
  deliveryStatus.textContent = delivery
    ? titleize(reconciliation.status)
    : "Waiting for server";
  const stageRank = {
    assigned: 0,
    acknowledged: 1,
    reconciled: 2
  }[loaded?.status] ?? -1;
  for (const [index, stage] of [
    ...el("capitalNetworkStageGrid").children
  ].entries()) {
    stage.classList.toggle("complete", index <= stageRank);
    stage.classList.toggle("current", index === stageRank);
  }

  const allocationReceipt = el("capitalNetworkAllocationReceipt");
  allocationReceipt.textContent = allocation
    ? compactDecisionProofHash(allocation.allocationReceiptRef)
    : "Not loaded";
  allocationReceipt.title = allocation?.allocationReceiptRef ?? "";
  el("capitalNetworkAllocationCopy").textContent = allocation
    ? `${allocation.allocatedMinor} sandbox minor units · server TransferIntent hash`
    : "Server TransferIntent hash required";
  const reconciliationReceipt = el("capitalNetworkReconciliationReceipt");
  reconciliationReceipt.textContent = reconciliation
    ? reconciliation.receiptId
      ? compactOpaqueId(reconciliation.receiptId)
      : compactDecisionProofHash(reconciliation.receiptRef)
    : "Not loaded";
  reconciliationReceipt.title =
    reconciliation?.receiptId ?? reconciliation?.receiptRef ?? "";
  el("capitalNetworkReconciliationCopy").textContent = reconciliation
    ? `${titleize(reconciliation.status)} · not a settlement or funds receipt`
    : "Not a settlement or funds receipt";
  const deliveryReceipt = el("capitalNetworkDeliveryReceipt");
  deliveryReceipt.textContent = delivery
    ? compactDecisionProofHash(delivery.deliveryHash)
    : "Not loaded";
  deliveryReceipt.title = delivery?.deliveryHash ?? "";
  el("capitalNetworkDeliveryCopy").textContent = delivery
    ? `Fixed loopback · expires ${privateDate(delivery.expiresAt, {
        dateStyle: "medium",
        timeStyle: "short"
      })}`
    : "Signed local boundary only";

  const acknowledge = el("capitalNetworkAcknowledgeBtn");
  const canAcknowledge = Boolean(
    loaded?.status === "assigned" &&
    loaded.availability.acknowledge &&
    tenantPilot.connected
  );
  acknowledge.disabled = capitalNetworkPilot.busy || !canAcknowledge;
  acknowledge.textContent = loaded?.status === "reconciled"
    ? "Signed callback processed"
    : loaded?.status === "acknowledged"
      ? "Assignment acknowledged"
      : capitalNetworkPilot.busy
        ? "Recording acknowledgement…"
        : "Acknowledge exact assignment";
  el("capitalNetworkAcknowledgeCopy").textContent = reconciliation
    ? `${titleize(reconciliation.status)}. Acknowledgement is not funding, settlement, custody, or withdrawal authority; exact retries cannot duplicate canonical state.`
    : "Acknowledgement is not funding, settlement, custody, or withdrawal authority. Exact retries reuse one idempotency key.";

  el("capitalNetworkEarnings").textContent = earnings
    ? `${capitalNetworkAmount(earnings.assetId, earnings.earningsMinor)} simulated`
    : "No simulation amount";
  el("capitalNetworkEarningsCopy").textContent = earnings
    ? `Historical example: ${Number(earnings.rateBasisPoints) / 100}% of the exact loaded sandbox amount. Unapproved, nonbinding, and not a pricing policy or Provider entitlement.`
    : "Example rate: 1.25% of an exact loaded sandbox amount. It is nonbinding, unapproved, and cannot create Ledger, Evidence, or Provider entitlement.";
}

function providerResourceUnavailable(error) {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    new Set([
      "authorization_denied",
      "tenant_resource_unavailable",
      "resource_not_found",
      "provider_intent_unavailable"
    ]).has(error.code)
  );
}

async function loadCapitalNetworkIntent({ quiet = false } = {}) {
  if (capitalNetworkPilot.busy) return null;
  const transferIntentId = tenantInputValue("capitalNetworkTransferIntentId");
  if (!exactResourceId(transferIntentId)) {
    capitalNetworkPilot.error = true;
    capitalNetworkPilot.helper =
      "Enter one exact TransferIntent ID with no spaces.";
    renderCapitalNetwork();
    return null;
  }
  capitalNetworkPilot.busy = true;
  capitalNetworkPilot.error = false;
  capitalNetworkPilot.helper =
    "Verifying Provider identity, exact AccessGrant, purpose, and current server state…";
  capitalNetworkPilot.providerView = null;
  capitalNetworkPilot.acknowledgement = null;
  renderCapitalNetwork();
  try {
    const result = await tenantApi("pilotReadProviderIntent", {
      resource: {
        resourceType: "transfer_intent",
        resourceId: transferIntentId
      },
      payload: {},
      purpose: "provider_intent_delivery",
      idempotent: false
    });
    capitalNetworkPilot.providerView = result.response;
    const presentation = currentCapitalNetworkPresentation();
    if (!presentation?.mandate) {
      throw new Error("provider_presentation_contract_rejected");
    }
    capitalNetworkPilot.helper =
      "Exact assigned intent loaded from the authenticated Provider Gateway. No browser state was substituted.";
    if (!quiet) {
      toast("Provider assignment loaded");
      announce(capitalNetworkPilot.helper);
    }
    return presentation;
  } catch (error) {
    capitalNetworkPilot.providerView = null;
    capitalNetworkPilot.acknowledgement = null;
    capitalNetworkPilot.error = true;
    capitalNetworkPilot.helper = providerResourceUnavailable(error)
      ? "Provider access is required, or the exact assignment is unavailable."
      : `Provider read failed. Request ID: ${error.requestId ?? "unavailable"}`;
    if (!quiet) {
      toast(capitalNetworkPilot.helper, "error");
      announce(capitalNetworkPilot.helper);
    }
    return null;
  } finally {
    capitalNetworkPilot.busy = false;
    renderCapitalNetwork();
  }
}

async function acknowledgeCapitalNetworkIntent() {
  if (capitalNetworkPilot.busy) return;
  const presentation = currentCapitalNetworkPresentation();
  if (
    presentation?.status !== "assigned" ||
    !presentation.availability.acknowledge
  ) return;
  capitalNetworkPilot.busy = true;
  capitalNetworkPilot.error = false;
  capitalNetworkPilot.helper =
    "Recording one exact, replay-safe no-funds acknowledgement…";
  renderCapitalNetwork();
  try {
    const transferIntentId = presentation.delivery.transferIntentId;
    const deliveryHash = presentation.delivery.deliveryHash;
    const acknowledgementResult = await tenantApi(
      "pilotAcknowledgeProviderIntent",
      {
        resource: {
          resourceType: "transfer_intent",
          resourceId: transferIntentId
        },
        payload: { deliveryHash },
        purpose: "provider_intent_delivery",
        idempotent: true,
        idempotencyKey:
          `capital_network_ack_${deliveryHash.slice(2, 42)}`
      }
    );
    const refreshed = await tenantApi("pilotReadProviderIntent", {
      resource: {
        resourceType: "transfer_intent",
        resourceId: transferIntentId
      },
      payload: {},
      purpose: "provider_intent_delivery",
      idempotent: false
    });
    capitalNetworkPilot.providerView = refreshed.response;
    capitalNetworkPilot.acknowledgement = acknowledgementResult.response;
    const accepted = currentCapitalNetworkPresentation();
    if (!accepted || accepted.status === "assigned") {
      throw new Error("provider_acknowledgement_contract_rejected");
    }
    capitalNetworkPilot.helper =
      "Idempotent acknowledgement and refreshed server state verified. This is not settlement or funding.";
    toast("Provider assignment acknowledged");
    announce(capitalNetworkPilot.helper);
  } catch (error) {
    capitalNetworkPilot.providerView = null;
    capitalNetworkPilot.acknowledgement = null;
    capitalNetworkPilot.error = true;
    capitalNetworkPilot.helper = providerResourceUnavailable(error)
      ? "Provider access is required, or the exact assignment is unavailable."
      : `Acknowledgement could not be re-verified from server truth. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(capitalNetworkPilot.helper, "error");
    announce(capitalNetworkPilot.helper);
  } finally {
    capitalNetworkPilot.busy = false;
    renderCapitalNetwork();
  }
}

function currentTradingCapitalPresentation() {
  if (!tradingCapitalPilot.facility) return null;
  return createTradingCapitalProductPresentation({
    entryMode: interactionMode,
    facility: tradingCapitalPilot.facility,
    closeRequest: tradingCapitalPilot.closeRequest,
    settlement: tradingCapitalPilot.settlement,
    performanceProof: tradingCapitalPilot.performanceProof,
    evidence: tradingCapitalPilot.evidence
  });
}

function tradingCapitalResourceUnavailable(error) {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    new Set([
      "authorization_denied",
      "tenant_resource_unavailable",
      "resource_not_found",
      "trading_settlement_unavailable"
    ]).has(error.code)
  );
}

function tradingCapitalSummaryItem(label, value) {
  const item = document.createElement("div");
  const name = document.createElement("span");
  const detail = document.createElement("strong");
  name.textContent = label;
  detail.textContent = value ?? "Unavailable";
  item.append(name, detail);
  return item;
}

function renderTradingCapital() {
  if (!el("tradingCapitalOperationCount")) return;
  const catalogCount = TRADING_CAPITAL_OPERATION_IDS.filter((operationId) =>
    serverCatalogOperations.has(operationId)
  ).length;
  const parity = catalogCount === TRADING_CAPITAL_OPERATION_IDS.length;
  const presentation = currentTradingCapitalPresentation();
  const view =
    TRADING_CAPITAL_VIEW_DEFINITIONS.find(
      ({ id }) => id === tradingCapitalPilot.activeView
    ) ?? TRADING_CAPITAL_VIEW_DEFINITIONS[0];

  el("tradingCapitalOperationCount").textContent =
    `${catalogCount} / ${TRADING_CAPITAL_OPERATION_IDS.length}`;
  el("tradingCapitalNavState").textContent = parity
    ? "25 local operations"
    : `${catalogCount} / 25 available`;
  el("tradingCapitalCatalogStatus").textContent = parity
    ? "Local contract verified"
    : "Contract unavailable";
  el("tradingCapitalCatalogStatus").classList.toggle("checking", !tenantPilot.checked);
  el("tradingCapitalCatalogStatus").classList.toggle("available", parity);
  el("tradingCapitalCatalogStatus").classList.toggle(
    "unavailable",
    tenantPilot.checked && !parity
  );
  el("tradingCapitalFacilityState").textContent = presentation
    ? `${presentation.lifecycleStatus} · ${presentation.riskState}`
    : tradingCapitalPilot.busy
      ? "Loading"
      : "Not loaded";
  el("tradingCapitalHelper").textContent = tradingCapitalPilot.helper;
  el("tradingCapitalHelper").classList.toggle("error", tradingCapitalPilot.error);
  el("tradingCapitalActiveEyebrow").textContent = view.label;
  el("tradingCapitalViewStatus").textContent = parity
    ? "Authenticated local contract"
    : "Catalog required";

  for (const button of document.querySelectorAll("[data-trading-capital-view]")) {
    const selected = button.dataset.tradingCapitalView === view.id;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) {
      el("tradingCapitalContract").setAttribute(
        "aria-labelledby",
        `${button.id} tradingCapitalContractTitle`
      );
    }
  }

  el("tradingCapitalSummary").replaceChildren(
    tradingCapitalSummaryItem("Facility", presentation?.facilityId),
    tradingCapitalSummaryItem(
      "Canonical Obligation",
      presentation?.obligationId
    ),
    tradingCapitalSummaryItem("Settlement", presentation?.settlementId),
    tradingCapitalSummaryItem(
      "Performance Proof",
      presentation?.performanceProofId
    )
  );

  el("tradingCapitalOperationList").replaceChildren(
    ...view.operationIds.map((operationId) => {
      const row = document.createElement("div");
      const name = document.createElement("strong");
      const status = document.createElement("small");
      const available = serverCatalogOperations.has(operationId);
      row.setAttribute("role", "listitem");
      row.classList.toggle("unavailable", !available);
      name.textContent = operationId;
      status.textContent = available
        ? "Catalogued · local no-funds"
        : "Unavailable in authenticated catalog";
      row.append(name, status);
      return row;
    })
  );

  const blocked =
    tradingCapitalPilot.busy || !tenantPilot.connected || !parity;
  el("tradingCapitalLoadStateBtn").disabled = blocked;
  el("tradingCapitalLoadEvidenceBtn").disabled = blocked;
  el("tradingCapitalRequestCloseBtn").disabled =
    blocked || presentation?.actions.requestCloseAvailable !== true;
  el("tradingCapitalIssueProofBtn").disabled =
    blocked ||
    presentation?.actions.issuePerformanceProofAvailable !== true;
}

async function loadTradingCapitalFacility({ evidence = false } = {}) {
  if (tradingCapitalPilot.busy) return;
  const facilityId = tenantInputValue("tradingCapitalFacilityId");
  if (!exactResourceId(facilityId)) {
    tradingCapitalPilot.error = true;
    tradingCapitalPilot.helper =
      "Enter one exact Facility ID with no spaces.";
    renderTradingCapital();
    return;
  }
  tradingCapitalPilot.busy = true;
  tradingCapitalPilot.error = false;
  tradingCapitalPilot.helper = evidence
    ? "Loading the bounded Facility Evidence view from the authenticated Gateway…"
    : "Loading exact Facility state from the authenticated Gateway…";
  renderTradingCapital();
  try {
    const result = await tenantApi(
      evidence ? "tradingReadFacilityEvidence" : "tradingReadFacilityState",
      {
        resource: {
          resourceType: "trading_facility",
          resourceId: facilityId
        },
        payload: {},
        idempotent: false
      }
    );
    if (evidence) {
      const value = result.response;
      tradingCapitalPilot.facility = value.facility;
      tradingCapitalPilot.closeRequest = value.closeRequest;
      tradingCapitalPilot.settlement = value.settlement;
      tradingCapitalPilot.performanceProof = value.performanceProof;
      tradingCapitalPilot.evidence = value;
    } else {
      tradingCapitalPilot.facility = result.response.facility;
      tradingCapitalPilot.closeRequest = null;
      tradingCapitalPilot.settlement = null;
      tradingCapitalPilot.performanceProof = null;
      tradingCapitalPilot.evidence = null;
    }
    if (!currentTradingCapitalPresentation()) {
      throw new Error("trading_capital_presentation_contract_rejected");
    }
    tradingCapitalPilot.helper = evidence
      ? "Facility, settlement, proof, and bounded Evidence reconciled to one server Facility."
      : "Current Facility state loaded. Settlement and proof remain unavailable until Evidence is loaded.";
    toast(evidence ? "Trading Facility Evidence loaded" : "Trading Facility state loaded");
    announce(tradingCapitalPilot.helper);
  } catch (error) {
    tradingCapitalPilot.facility = null;
    tradingCapitalPilot.closeRequest = null;
    tradingCapitalPilot.settlement = null;
    tradingCapitalPilot.performanceProof = null;
    tradingCapitalPilot.evidence = null;
    tradingCapitalPilot.error = true;
    tradingCapitalPilot.helper = tradingCapitalResourceUnavailable(error)
      ? "Bound access is required, or the exact Facility is unavailable."
      : `Trading Capital read failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(tradingCapitalPilot.helper, "error");
    announce(tradingCapitalPilot.helper);
  } finally {
    tradingCapitalPilot.busy = false;
    renderTradingCapital();
  }
}

async function requestTradingCapitalClose() {
  const presentation = currentTradingCapitalPresentation();
  if (
    tradingCapitalPilot.busy ||
    presentation?.actions.requestCloseAvailable !== true
  ) return;
  tradingCapitalPilot.busy = true;
  tradingCapitalPilot.error = false;
  tradingCapitalPilot.helper =
    "Recording one exact close request against the current Facility hash and version…";
  renderTradingCapital();
  try {
    const result = await tenantApi("tradingRequestClose", {
      resource: {
        resourceType: "trading_facility",
        resourceId: presentation.facilityId
      },
      payload: {
        expectedStateHash: presentation.facilityStateHash,
        expectedVersion: presentation.facilityVersion
      },
      idempotent: true
    });
    tradingCapitalPilot.closeRequest = result.response.closeRequest;
    tradingCapitalPilot.evidence = null;
    if (!currentTradingCapitalPresentation()) {
      throw new Error("trading_close_presentation_contract_rejected");
    }
    tradingCapitalPilot.helper =
      "Close requested. Deterministic settlement remains a System Worker operation and accepts no browser-supplied economics.";
    toast("Synthetic Facility close requested");
    announce(tradingCapitalPilot.helper);
  } catch (error) {
    tradingCapitalPilot.error = true;
    tradingCapitalPilot.helper = tradingCapitalResourceUnavailable(error)
      ? "Close authority is required, the state changed, or the Facility is unavailable."
      : `Close request failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(tradingCapitalPilot.helper, "error");
  } finally {
    tradingCapitalPilot.busy = false;
    renderTradingCapital();
  }
}

async function issueTradingCapitalProof() {
  const presentation = currentTradingCapitalPresentation();
  if (
    tradingCapitalPilot.busy ||
    presentation?.actions.issuePerformanceProofAvailable !== true
  ) return;
  tradingCapitalPilot.busy = true;
  tradingCapitalPilot.error = false;
  tradingCapitalPilot.helper =
    "Issuing one bounded, revocable synthetic Performance Proof…";
  renderTradingCapital();
  try {
    const result = await tenantApi("tradingIssuePerformanceProof", {
      resource: {
        resourceType: "trading_settlement",
        resourceId: presentation.settlementId
      },
      payload: {
        expectedSettlementHash:
          tradingCapitalPilot.settlement.settlementHash
      },
      idempotent: true
    });
    tradingCapitalPilot.performanceProof = result.response.performanceProof;
    tradingCapitalPilot.evidence = null;
    if (!currentTradingCapitalPresentation()) {
      throw new Error("trading_proof_presentation_contract_rejected");
    }
    tradingCapitalPilot.helper =
      "Performance Proof issued. It is not an official report, universal score, or external verification.";
    toast("Synthetic Performance Proof issued");
    announce(tradingCapitalPilot.helper);
  } catch (error) {
    tradingCapitalPilot.error = true;
    tradingCapitalPilot.helper = tradingCapitalResourceUnavailable(error)
      ? "Bound proof authority is required, or the Settlement is unavailable."
      : `Performance Proof failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(tradingCapitalPilot.helper, "error");
  } finally {
    tradingCapitalPilot.busy = false;
    renderTradingCapital();
  }
}

function renderTenantPilot() {
  const connection = el("tenantPilotConnection");
  if (!connection) return;
  connection.textContent = tenantPilot.connectionLabel;
  connection.classList.toggle("neutral", !tenantPilot.connected);
  connection.classList.toggle("warning", tenantPilot.checked && !tenantPilot.connected);

  const subjectId = tenantInputValue("humanSubjectId");
  const consentId = tenantInputValue("humanConsentId");
  const privateBusy = tenantPilot.busy || agentAuthorityPilot.busy;
  const reviewState = humanCreditReviewState();
  el("createHumanSubjectBtn").disabled = privateBusy || !tenantPilot.connected;
  el("createHumanConsentBtn").disabled = privateBusy || !tenantPilot.connected || !subjectId;
  el("submitHumanCreditBtn").disabled = privateBusy || !tenantPilot.connected ||
    !subjectId || !consentId || Boolean(tenantPilot.offer && reviewState.current);
  el("submitHumanCreditBtn").textContent = tenantPilot.offer && !reviewState.current
    ? "Request fresh Offer"
    : "Request & evaluate credit";
  el("newHumanApplicationBtn").hidden = !tenantPilot.offer || !tenantPilot.obligation;
  el("newHumanApplicationBtn").disabled = privateBusy;
  el("humanApplicationHelper").textContent = tenantPilot.helper;

  const decision = tenantPilot.decision;
  const offer = tenantPilot.offer;
  const intent = tenantPilot.intent;
  const acceptance = tenantPilot.acceptance;
  const obligation = tenantPilot.obligation;
  const offerAccepted = Boolean(obligation);
  const obligationExecuted = obligation?.executionStatus === "executed";
  const obligationRepaid = obligation?.status === "fully_repaid";
  const passportVerified = renderDecisionPassport(decision);
  if (offer && !reviewState.current) el("humanOfferAcknowledge").checked = false;
  el("humanApplicationStatus").textContent = offerAccepted
    ? "Obligation created"
    : offer
      ? "Offer ready"
    : decision
      ? titleize(decision.status)
      : intent
        ? "Intent submitted"
        : "Not started";
  el("humanDecisionStatus").textContent = decision ? titleize(decision.status) : "Pending";
  el("humanOfferPrincipal").textContent = offer ? usdMinorToMoney(offer.approvedPrincipalMinor) : "—";
  el("humanOfferRate").textContent = offer ? bpsToPercent(offer.annualRateBps) : "—";
  el("humanOfferFee").textContent = offer
    ? usdMinorToMoney(offer.originationFeeMinor)
    : "—";
  el("humanOfferRepayment").textContent = offer
    ? `${titleize(offer.repaymentFrequency)} · ${offer.installmentCount} installment${offer.installmentCount === 1 ? "" : "s"}`
    : "—";
  el("humanOfferMaturity").textContent = offer
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(offer.maturityAt))
    : "—";
  el("humanOfferValidUntil").textContent = offer
    ? formatEvidenceTime(offer.validUntil, { short: true })
    : "—";
  el("humanOfferDisclosure").textContent = offer?.disclosureRef ?? "—";
  el("humanOfferDisclosure").title = offer?.disclosureRef ?? "";
  el("humanOfferAuthority").textContent = tenantPilot.offerReview
    ? `Consent · ${compactOpaqueId(tenantPilot.offerReview.authorityId)}`
    : "—";
  el("humanOfferAuthority").title = tenantPilot.offerReview?.authorityId ?? "";
  el("humanOfferHash").textContent = offer
    ? compactDecisionProofHash(offer.creditOfferHash)
    : "—";
  el("humanOfferHash").title = offer?.creditOfferHash ?? "";
  el("humanOfferTermsHash").textContent = offer
    ? compactDecisionProofHash(offer.termsHash)
    : "—";
  el("humanOfferTermsHash").title = offer?.termsHash ?? "";
  el("humanOfferReviewState").textContent = humanCreditReviewMessage(reviewState);
  el("humanOfferReviewState").classList.toggle("ready", reviewState.current);
  el("humanOfferReviewState").classList.toggle(
    "warning",
    Boolean(offer) && !reviewState.current
  );
  el("humanIntentId").textContent = intent?.creditIntentId ?? "—";
  el("humanIntentId").title = intent?.creditIntentId ?? "";
  el("humanDecisionReasons").textContent = passportVerified
    ? `${decision.reasonCodes.length} deterministic checks are explained below. Canonical reason codes remain in the proof.`
    : decision
      ? "Decision proof is unavailable. Request a fresh evaluation before accepting an Offer."
      : "Decision reasons and Evidence lineage will appear here after evaluation.";
  el("humanReceiptStatus").textContent = tenantPilot.obligationReceipt
    ? `Lifecycle verified · ${titleize(tenantPilot.obligationReceipt.obligation.status)}`
    : tenantPilot.receipt
      ? "Offer verified · copy-safe"
    : "Available after evaluation";
  el("copyHumanReceiptBtn").disabled = !tenantPilot.receipt;
  el("copyHumanReceiptBtn").textContent = tenantPilot.obligationReceipt
    ? "Copy lifecycle receipt"
    : "Copy receipt";
  const acknowledgement = el("humanOfferAcknowledge");
  acknowledgement.disabled =
    privateBusy || !offer || offerAccepted || offer.status !== "offered" ||
    !passportVerified || !reviewState.current;
  el("acceptHumanOfferBtn").disabled =
    privateBusy || !tenantPilot.connected || !offer || offerAccepted ||
    offer.status !== "offered" || !passportVerified || !reviewState.current ||
    !acknowledgement.checked;
  el("acceptHumanOfferBtn").textContent = offerAccepted
    ? "Offer accepted"
    : tenantPilot.busy
      ? "Accepting exact Offer…"
      : "Review & accept Offer";

  const obligationCard = el("humanObligationCard");
  obligationCard.hidden = !obligation;
  el("humanObligationExecution").textContent = obligation
    ? `${titleize(obligation.executionStatus)} execution`
    : "Pending execution";
  el("humanObligationStatus").textContent = obligation ? titleize(obligation.status) : "Created";
  el("humanObligationServicing").textContent = obligation
    ? servicingClassificationLabel(obligation.servicingClassification ?? "current")
    : "Current";
  el("humanObligationDpd").textContent = String(obligation?.daysPastDue ?? 0);
  el("humanObligationScheduleVersion").textContent = obligation
    ? `v${obligation.scheduleSequence ?? 1}`
    : "v1";
  el("humanObligationOutstanding").textContent = obligation
    ? usdMinorToMoney(obligation.outstandingPrincipalMinor)
    : "$0.00";
  el("humanObligationInterest").textContent = obligation
    ? usdMinorToMoney(obligation.outstandingInterestMinor)
    : "$0.00";
  el("humanObligationRepaid").textContent = obligation
    ? usdMinorToMoney(obligation.totalRepaidMinor)
    : "$0.00";
  el("humanObligationId").textContent = obligation?.obligationId ?? "—";
  el("humanObligationId").title = obligation?.obligationId ?? "";
  const executionReference = tenantPilot.executionReceipt?.receiptHash ??
    obligation?.sandboxExecutionReceiptId ?? "Not executed";
  el("humanExecutionReceipt").textContent = executionReference;
  el("humanExecutionReceipt").title = executionReference === "Not executed" ? "" : executionReference;
  el("executeHumanObligationBtn").disabled =
    privateBusy || !tenantPilot.connected || !obligation || obligationExecuted;
  el("executeHumanObligationBtn").textContent = obligationExecuted
    ? "Sandbox credit active"
    : tenantPilot.busy
      ? "Executing signed sandbox credit…"
      : "Execute sandbox credit";
  el("postHumanRepaymentBtn").disabled =
    privateBusy || !tenantPilot.connected || !obligationExecuted || obligationRepaid;
  const repayment = tenantPilot.repayment;
  el("humanRepaymentAllocation").textContent = repayment
    ? `Applied ${usdMinorToMoney(repayment.appliedMinor)} · interest ${usdMinorToMoney(repayment.appliedInterestMinor)} · principal ${usdMinorToMoney(repayment.appliedPrincipalMinor)}${BigInt(repayment.surplusMinor) > 0n ? ` · surplus ${usdMinorToMoney(repayment.surplusMinor)} not posted` : ""}`
    : "Fee → interest → principal. Any surplus is returned without a ledger posting.";
  const schedule = el("humanObligationSchedule");
  schedule.replaceChildren();
  for (const installment of obligation?.installments ?? []) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    label.textContent = `#${installment.installmentNumber} · ${titleize(installment.status)} · ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(installment.dueAt))}`;
    value.textContent = usdMinorToMoney(
      BigInt(installment.scheduledPrincipalMinor) +
      BigInt(installment.scheduledInterestMinor) +
      BigInt(installment.scheduledFeeMinor)
    );
    item.append(label, value);
    schedule.append(item);
  }
  el("humanOfferBoundary").textContent = offerAccepted
    ? obligationExecuted
      ? "Signed sandbox receipt verified · balanced ledger posted · withdrawable balance remains disabled · no production funds moved."
      : "Obligation recorded · execute through the signed non-redeemable sandbox rail when ready. No production funds can move."
    : offer && !reviewState.current
      ? "Acceptance blocked: visible authority or request terms no longer match the exact server Offer. Request a fresh evaluation."
      : "Acceptance creates one auditable Obligation and deterministic schedule. No production funds can move.";
  renderHumanRequestCreditReceipts();
  renderOwnedEvidence();
  renderHumanGuide();
  renderAgentAuthorityPilot();
  renderCreditPassportPilot();
  renderPrivateProductSurfaces();
  renderRuntimeGate();
  renderPilotFeedback();
  renderCapitalNetwork();
}

async function runTenantAction(button, operation, successMessage) {
  if (tenantPilot.busy || agentAuthorityPilot.busy) return;
  tenantPilot.busy = true;
  button?.setAttribute("aria-busy", "true");
  tenantPilot.helper = "Private operation in progress…";
  renderTenantPilot();
  announce("Authenticated Human pilot operation in progress");
  try {
    await operation();
    tenantPilot.helper = successMessage;
    toast(successMessage);
    announce(successMessage);
  } catch (error) {
    const requestSuffix = error.requestId ? ` Request ID: ${error.requestId}` : "";
    tenantPilot.helper = `${error.message}${requestSuffix}`;
    toast(tenantPilot.helper, "error");
    announce(`Operation failed. ${error.message}`);
  } finally {
    tenantPilot.busy = false;
    button?.removeAttribute("aria-busy");
    renderTenantPilot();
  }
}

function acceptCreditPassportArtifact(artifact) {
  const presentation = createCreditPassportPresentation(artifact);
  creditPassportPilot.artifact = artifact;
  creditPassportPilot.presentation = presentation;
  el("creditPassportArtifactId").value = artifact.creditPassportArtifactId;
  el("creditPassportVerifyArtifactId").value = artifact.creditPassportArtifactId;
  el("creditPassportVerifyHash").value = artifact.artifactHash;
  el("creditPassportVerifyVersion").value = String(artifact.version);
  return presentation;
}

function creditPassportDenied(error) {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    new Set([
      "authorization_denied",
      "tenant_resource_unavailable",
      "resource_not_found"
    ]).has(error.code)
  );
}

async function runCreditPassportAction(button, operation) {
  if (creditPassportPilot.busy) return;
  creditPassportPilot.busy = true;
  creditPassportPilot.error = false;
  button?.setAttribute("aria-busy", "true");
  renderCreditPassportPilot();
  try {
    const message = await operation();
    toast(message);
    announce(message);
  } catch (error) {
    creditPassportPilot.error = true;
    const message = creditPassportDenied(error)
      ? "The artifact or exact Actor authority is unavailable."
      : `Credit Passport operation failed. Request ID: ${error.requestId ?? "unavailable"}`;
    creditPassportPilot.issueHelper = message;
    creditPassportPilot.artifactHelper = message;
    creditPassportPilot.verificationHelper = message;
    toast(message, "error");
    announce(message);
  } finally {
    creditPassportPilot.busy = false;
    button?.removeAttribute("aria-busy");
    renderCreditPassportPilot();
  }
}

async function issueCreditPassportArtifact() {
  const button = el("issueCreditPassportBtn");
  await runCreditPassportAction(button, async () => {
    const subjectId = tenantInputValue("creditPassportSubjectId");
    const creditIntentId = tenantInputValue("creditPassportIntentId");
    const verifierActorId = tenantInputValue("creditPassportVerifierActorId");
    if (
      !exactResourceId(subjectId) ||
      !exactResourceId(creditIntentId) ||
      !exactResourceId(verifierActorId)
    ) {
      throw new TypeError("Exact Subject, Credit Intent, and verifier Actor IDs are required.");
    }
    const lifetimeSeconds = Number(el("creditPassportLifetime").value);
    const claimSelectors = selectedCreditPassportClaims(el("creditPassportIssueForm"));
    const result = await tenantApi("pilotCreateCreditPassportArtifact", {
      resource: { resourceType: "subject", resourceId: subjectId },
      payload: {
        creditIntentId,
        verifierActorId,
        claimSelectors,
        lifetimeSeconds,
        schemaVersion: "credit_passport_artifact_create.v1"
      }
    });
    const presentation = acceptCreditPassportArtifact(result.response.artifact);
    creditPassportPilot.verification = null;
    creditPassportPilot.issueHelper = result.response.replaced
      ? `Replacement issued as v${presentation.artifact.version}; the prior hash is superseded.`
      : "Private proof issued from locked server Decision Evidence.";
    creditPassportPilot.artifactHelper =
      `${presentation.disclosures.length} selected disclosure${presentation.disclosures.length === 1 ? "" : "s"} · online verification required.`;
    creditPassportPilot.verificationHelper =
      "Authenticate as the exact bound verifier and verify the current hash and version online.";
    return result.response.replaced
      ? "Credit Passport replacement issued"
      : "Private Credit Passport issued";
  });
}

async function readOwnedCreditPassportArtifact() {
  const button = el("readCreditPassportBtn");
  await runCreditPassportAction(button, async () => {
    const artifactId = tenantInputValue("creditPassportArtifactId");
    if (!exactResourceId(artifactId)) throw new TypeError("Enter one exact Artifact ID.");
    const result = await tenantApi("pilotReadOwnCreditPassportArtifact", {
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: artifactId
      },
      payload: {},
      idempotent: false
    });
    const presentation = acceptCreditPassportArtifact(result.response.artifact);
    creditPassportPilot.artifactHelper =
      `${presentation.statusLabel} server state loaded at ${result.response.artifact.asOf}.`;
    return "Owned Credit Passport state loaded";
  });
}

async function verifyBoundCreditPassportArtifact() {
  const button = el("verifyCreditPassportBtn");
  await runCreditPassportAction(button, async () => {
    const artifactId = tenantInputValue("creditPassportVerifyArtifactId");
    const artifactHash = tenantInputValue("creditPassportVerifyHash");
    const artifactVersion = Number(el("creditPassportVerifyVersion").value);
    if (
      !exactResourceId(artifactId) ||
      !/^0x[0-9a-f]{64}$/.test(artifactHash) ||
      !Number.isSafeInteger(artifactVersion) ||
      artifactVersion < 1
    ) {
      throw new TypeError("Exact Artifact ID, hash, and version are required.");
    }
    const result = await tenantApi("pilotVerifyCreditPassportArtifact", {
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: artifactId
      },
      purpose: "private_credit_review",
      payload: {
        artifactHash,
        artifactVersion,
        purpose: "private_credit_review",
        schemaVersion: "credit_passport_verification_request.v1"
      },
      idempotent: false
    });
    creditPassportPilot.verification = result.response.verification;
    if (result.response.artifact) acceptCreditPassportArtifact(result.response.artifact);
    creditPassportPilot.verificationHelper =
      result.response.verification.verified
        ? `Verified against current source and server time at ${result.response.verification.checkedAt}.`
        : `Verification closed with ${result.response.verification.status}.`;
    return result.response.verification.verified
      ? "Credit Passport verified online"
      : "Credit Passport is not active";
  });
}

async function revokeOwnedCreditPassportArtifact() {
  const button = el("revokeCreditPassportBtn");
  await runCreditPassportAction(button, async () => {
    const artifactId = creditPassportPilot.artifact?.creditPassportArtifactId;
    if (!artifactId || creditPassportPilot.artifact.effectiveStatus !== "active") {
      throw new TypeError("Load one active owned artifact before revocation.");
    }
    const reasonCode = el("creditPassportRevocationReason").value;
    const result = await tenantApi("pilotRevokeCreditPassportArtifact", {
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: artifactId
      },
      payload: {},
      reasonCode
    });
    acceptCreditPassportArtifact(result.response.artifact);
    creditPassportPilot.verification = null;
    creditPassportPilot.artifactHelper =
      `Terminally revoked by the authenticated owner/controller with reason ${reasonCode}.`;
    creditPassportPilot.verificationHelper =
      "The revoked artifact cannot be verified or reactivated.";
    return "Credit Passport revoked";
  });
}

function officialReportUnavailable(error) {
  return error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    new Set([
      "authorization_denied",
      "tenant_resource_unavailable",
      "resource_not_found"
    ]).has(error.code);
}

async function runOfficialReportAction(action, successMessage) {
  if (officialReportPilot.busy) return;
  officialReportPilot.busy = true;
  officialReportPilot.error = false;
  officialReportPilot.helper = "Revalidating exact server authority…";
  renderOfficialReportPilot();
  try {
    await action();
    officialReportPilot.helper = successMessage;
    toast(successMessage);
    announce(successMessage);
  } catch (error) {
    officialReportPilot.error = true;
    officialReportPilot.helper = officialReportUnavailable(error)
      ? "Owner or controller access is required, or the report is unavailable."
      : `Official report operation failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(officialReportPilot.helper, "error");
    announce(officialReportPilot.helper);
  } finally {
    officialReportPilot.busy = false;
    renderOfficialReportPilot();
  }
}

async function createOfficialReport() {
  const obligationId = tenantPilot.obligation?.obligationId;
  if (!obligationId) return;
  await runOfficialReportAction(async () => {
    const format = el("officialReportFormat").value;
    const lifetimeSeconds = Number(el("officialReportLifetime").value);
    const result = await tenantApi("pilotCreateOfficialReport", {
      resource: { resourceType: "obligation", resourceId: obligationId },
      payload: {
        format,
        lifetimeSeconds,
        schemaVersion: "official_report_create.v1"
      },
      idempotent: true
    });
    officialReportPilot.report = result.response.report;
    officialReportPilot.retrievedAt = null;
    el("officialReportId").value = result.response.report.officialReportId;
  }, "Official report created from bounded server Evidence");
}

async function readOfficialReport() {
  const officialReportId = tenantInputValue("officialReportId");
  if (!exactResourceId(officialReportId)) return;
  await runOfficialReportAction(async () => {
    const result = await tenantApi("pilotReadOfficialReport", {
      resource: { resourceType: "official_report", resourceId: officialReportId },
      payload: {},
      idempotent: false
    });
    officialReportPilot.report = result.response.report;
    officialReportPilot.retrievedAt = null;
  }, "Official report metadata loaded after authorization recheck");
}

async function retrieveOfficialReport() {
  const officialReportId = tenantInputValue("officialReportId");
  if (!exactResourceId(officialReportId)) return;
  await runOfficialReportAction(async () => {
    const result = await tenantApi("pilotRetrieveOfficialReport", {
      resource: { resourceType: "official_report", resourceId: officialReportId },
      payload: {},
      idempotent: false
    });
    const verified = await verifyOfficialReportRetrieval(result.response);
    officialReportPilot.report = result.response.report;
    officialReportPilot.retrievedAt = result.response.authorizationRevalidatedAt;
    downloadVerifiedOfficialReport({ verified });
  }, "Authorization rechecked; exact server bytes verified and downloaded");
}

async function revokeOfficialReport() {
  const officialReportId = tenantInputValue("officialReportId");
  if (!exactResourceId(officialReportId)) return;
  await runOfficialReportAction(async () => {
    const result = await tenantApi("pilotRevokeOfficialReport", {
      resource: { resourceType: "official_report", resourceId: officialReportId },
      payload: {},
      reasonCode: "owner_withdrawal",
      idempotent: true
    });
    officialReportPilot.report = result.response.report;
    officialReportPilot.retrievedAt = null;
  }, "Official report revoked and access closed");
}

async function runAgentAuthorityAction(button, operation, successMessage) {
  if (tenantPilot.busy || agentAuthorityPilot.busy) return;
  agentAuthorityPilot.busy = true;
  button?.setAttribute("aria-busy", "true");
  agentAuthorityPilot.helper = "Private Principal operation in progress…";
  renderTenantPilot();
  announce("Authenticated Principal operation in progress");
  try {
    await operation();
    const message = typeof successMessage === "function" ? successMessage() : successMessage;
    agentAuthorityPilot.helper = message;
    toast(message);
    announce(message);
  } catch (error) {
    const requestSuffix = error.requestId ? ` Request ID: ${error.requestId}` : "";
    agentAuthorityPilot.helper = `${error.message}${requestSuffix}`;
    toast(agentAuthorityPilot.helper, "error");
    announce(`Operation failed. ${error.message}`);
  } finally {
    agentAuthorityPilot.busy = false;
    button?.removeAttribute("aria-busy");
    renderTenantPilot();
  }
}

async function readOwnedObligationView(obligationId) {
  const result = await tenantApi("pilotReadOwnObligation", {
    resource: { resourceType: "obligation", resourceId: obligationId },
    payload: {},
    idempotent: false
  });
  return result.response;
}

function cacheOwnedObligationView(obligationId, view) {
  const accepted = acceptServicingPositionRefresh(
    tenantPilot.workspacePositionViews.get(obligationId),
    view
  );
  if (!accepted || accepted.obligation.obligationId !== obligationId) {
    throw new Error("Current position failed trusted-time and servicing-state verification.");
  }
  tenantPilot.workspacePositionViews.set(obligationId, accepted);
  return accepted;
}

async function loadOwnedObligation({ obligationId, quiet = false } = {}) {
  if (tenantPilot.obligationHydrationBusy) return;
  const exactObligationId = (obligationId ?? tenantInputValue("ownedObligationId")).trim();
  if (!exactResourceId(exactObligationId)) {
    tenantPilot.obligationHydrationError = true;
    tenantPilot.obligationHydrationHelper = "Enter one exact Obligation ID with no spaces.";
    renderTenantPilot();
    return;
  }
  tenantPilot.obligationHydrationBusy = true;
  tenantPilot.obligationHydrationError = false;
  tenantPilot.obligationHydrationHelper = "Verifying ownership and loading current server state…";
  renderTenantPilot();
  try {
    const response = await readOwnedObligationView(exactObligationId);
    const sameObligation = tenantPilot.obligation?.obligationId === exactObligationId;
    if (!sameObligation) {
      tenantPilot.receipt = null;
      tenantPilot.offerReview = null;
      tenantPilot.obligationReceipt = null;
      tenantPilot.obligationWorkflowId = null;
      tenantPilot.obligationCorrelationId = null;
      tenantPilot.acceptanceStep = null;
      tenantPilot.executionStep = null;
      tenantPilot.repaymentStep = null;
      tenantPilot.repaymentSequence = 0;
      tenantPilot.acceptance = null;
      tenantPilot.intent = null;
      tenantPilot.decision = null;
      tenantPilot.offer = null;
      tenantPilot.executionReceipt = null;
      tenantPilot.repayment = null;
      ownedEvidence.queried = false;
      ownedEvidence.obligationId = null;
      ownedEvidence.items = [];
      ownedEvidence.nextCursor = null;
      ownedEvidence.hasMore = false;
      ownedEvidence.capped = false;
      ownedEvidence.asOf = null;
    }
    tenantPilot.obligation = response.obligation;
    tenantPilot.servicingAction = response.latestServicingAction ?? null;
    tenantPilot.obligationHydrationAsOf = response.asOf;
    cacheOwnedObligationView(exactObligationId, response);
    tenantPilot.workspacePositionRefreshHelper =
      "Selected position refreshed from the authenticated server. Refresh all to update every visible position.";
    tenantPilot.obligationHydrationHelper =
      "Current server state loaded. This browser retains only the opaque ID for reload navigation.";
    el("ownedObligationId").value = exactObligationId;
    rememberWorkspaceObligation(exactObligationId);
    rememberOwnedObligationId(exactObligationId);
    tenantPilot.helper = "Owned Obligation restored through the authenticated Gateway.";
    if (!quiet) {
      toast("Current Obligation state loaded");
      announce("Owned Obligation restored from the server");
    }
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"])
        .has(error.code);
    tenantPilot.obligationHydrationError = true;
    tenantPilot.obligationHydrationHelper = nonEnumerating
      ? "Owner access is required or the Obligation is unavailable."
      : `Obligation read failed. Request ID: ${error.requestId ?? "unavailable"}`;
    tenantPilot.workspacePositionViews.delete(exactObligationId);
    if (quiet) forgetOwnedObligationId();
    if (!quiet) {
      toast(tenantPilot.obligationHydrationHelper, "error");
      announce(tenantPilot.obligationHydrationHelper);
    }
  } finally {
    tenantPilot.obligationHydrationBusy = false;
    renderTenantPilot();
  }
}

async function refreshOwnedPositionIndex() {
  if (
    tenantPilot.workspacePositionRefreshBusy ||
    tenantPilot.obligationHydrationBusy ||
    !tenantPilot.connected ||
    !tenantPilot.obligationReadAvailable
  ) return;
  const references = tenantPilot.workspaceObligations.slice(
    0,
    SERVICING_POSITION_INDEX_LIMIT
  );
  if (references.length === 0) return;

  tenantPilot.workspacePositionRefreshBusy = true;
  tenantPilot.workspacePositionRefreshHelper =
    "Reauthorizing each exact position and loading current server state…";
  renderTenantPilot();
  let refreshed = 0;
  let unavailable = 0;
  try {
    for (const { resourceId } of references) {
      try {
        const view = await readOwnedObligationView(resourceId);
        cacheOwnedObligationView(resourceId, view);
        refreshed += 1;
      } catch {
        tenantPilot.workspacePositionViews.delete(resourceId);
        unavailable += 1;
      }
    }
    tenantPilot.workspacePositionRefreshHelper = unavailable === 0
      ? `${refreshed} current ${refreshed === 1 ? "position was" : "positions were"} loaded from exact owner-authorized server reads.`
      : `${refreshed} current ${refreshed === 1 ? "position" : "positions"} loaded; ${unavailable} unavailable reference${unavailable === 1 ? "" : "s"} reveal no financial state.`;
    toast(unavailable === 0 ? "Current positions refreshed" : "Position refresh completed with unavailable references");
    announce(tenantPilot.workspacePositionRefreshHelper);
  } finally {
    tenantPilot.workspacePositionRefreshBusy = false;
    renderTenantPilot();
  }
}

function recoveredResource(resources, resourceType) {
  return resources.find((item) =>
    item?.resourceType === resourceType && exactResourceId(item.resourceId)
  );
}

async function recoverAuthenticatedWorkspace() {
  tenantPilot.workspaceRecoveryState = "loading";
  tenantPilot.workspaceRecoveryErrorCode = null;
  const result = await tenantApi("pilotReadWorkspaceResume", {
    payload: {},
    idempotent: false
  });
  const recovery = result.response;
  const resources = Array.isArray(recovery.resources) ? recovery.resources : [];
  const subject = recoveredResource(resources, "subject");
  const obligation = recoveredResource(resources, "obligation");
  const consent = recoveredResource(resources, "consent");
  const mandate = recoveredResource(resources, "mandate");
  const workspaceObligations = workspaceObligationResources(resources);
  tenantPilot.workspaceKind = recovery.workspaceKind;
  tenantPilot.workspaceResume = recovery;
  tenantPilot.workspaceObligations = workspaceObligations;
  const recoveredObligationIds = new Set(
    workspaceObligations.map(({ resourceId }) => resourceId)
  );
  for (const obligationId of tenantPilot.workspacePositionViews.keys()) {
    if (!recoveredObligationIds.has(obligationId)) {
      tenantPilot.workspacePositionViews.delete(obligationId);
    }
  }
  tenantPilot.workspacePositionRefreshHelper = workspaceObligations.length > 0
    ? "Refresh to load current balances and trusted-time servicing state for these authorized references."
    : "No Actor-bound Obligation reference was returned by the authenticated workspace.";
  tenantPilot.workspaceRecoveryHasMore = recovery.hasMore === true;
  tenantPilot.workspaceRecoveryResourceCount = resources.length;
  tenantPilot.workspaceRecoveryState = resources.length > 0 ? "restored" : "empty";

  if (recovery.workspaceKind === "human_borrower") {
    if (subject) {
      el("humanSubjectId").value = subject.resourceId;
      rememberOpaqueId(HUMAN_SUBJECT_STORAGE_KEY, subject.resourceId);
    }
    if (consent) {
      el("humanConsentId").value = consent.resourceId;
      rememberOpaqueId(HUMAN_CONSENT_STORAGE_KEY, consent.resourceId);
    }
    const rememberedObligationId = rememberedOwnedObligationId();
    const selectedObligation = workspaceObligations.find(
      (item) => item.resourceId === rememberedObligationId
    ) ?? obligation;
    if (selectedObligation && tenantPilot.obligationReadAvailable) {
      el("ownedObligationId").value = selectedObligation.resourceId;
      await loadOwnedObligation({ obligationId: selectedObligation.resourceId, quiet: true });
    }
    tenantPilot.helper = resources.length > 0
      ? "Borrower workspace restored from authenticated PostgreSQL server truth."
      : "Authenticated Borrower workspace ready. Create a Human Subject to begin.";
    return;
  }

  if (recovery.workspaceKind === "principal_controller") {
    if (subject) {
      el("agentAuthoritySubjectId").value = subject.resourceId;
      rememberOpaqueId(AGENT_SUBJECT_STORAGE_KEY, subject.resourceId);
      const binding = await tenantApi("pilotReadAgentAccountBinding", {
        resource: { resourceType: "subject", resourceId: subject.resourceId },
        payload: {},
        idempotent: false
      });
      agentAuthorityPilot.accountBinding = binding.response;
      agentAuthorityPilot.subject = {
        subjectId: binding.response.subjectId,
        status: binding.response.subjectStatus
      };
    }
    if (mandate) await loadExactMandate(mandate.resourceId);
    agentAuthorityPilot.helper = resources.length > 0
      ? "Principal workspace restored from authenticated PostgreSQL server truth."
      : "Authenticated Principal workspace ready. Create an Agent Subject to begin.";
  }
}

async function probeTenantPilot() {
  if (accessState.checked && !accessState.authEnabled) {
    tenantPilot.connectionLabel = "Private access not enabled";
    tenantPilot.workspaceRecoveryState = "unavailable";
    tenantPilot.workspaceRecoveryErrorCode = "authentication_unavailable";
    tenantPilot.checked = true;
    serverCatalogOperations = new Set();
    serverCatalogSnapshot = null;
    renderTenantPilot();
    renderAuditorEvidence();
    renderRiskOperations();
    return;
  }
  try {
    walletAuthorityLifecycle.assertProtectedAvailable();
    const response = await fetch("/tenant/v1/catalog", {
      credentials: "same-origin",
      headers: { accept: "application/json, application/problem+json" }
    });
    if (!response.ok) {
      serverCatalogSnapshot = null;
      serverCatalogOperations = new Set();
      tenantPilot.connectionLabel = response.status === 401 || response.status === 403
        ? "Authenticated session required"
        : "Private gateway unavailable";
      return;
    }
    const catalog = await response.json();
    walletAuthorityLifecycle.assertProtectedAvailable();
    serverCatalogSnapshot = catalog;
    const requiredOperations = new Set([
      "pilotCreateHumanSubject",
      "pilotCreateConsent",
      "pilotReadHumanSelf",
      "pilotReadWorkspaceResume",
      "pilotRequestCredit",
      "pilotReadCreditApplication",
      "pilotEvaluateCreditApplication",
      "pilotAcceptCreditOffer",
      "pilotExecuteSandboxObligation",
      "pilotPostSandboxRepayment",
      "pilotReadOwnObligation",
      "pilotCreateAgentSubject",
      "pilotCreateAgentAccountChallenge",
      "pilotReadAgentAccountBinding",
      "pilotCreateDraftMandate",
      "pilotReadMandate",
      "pilotActivateSandboxMandate"
    ]);
    const available = new Set((catalog.operations ?? []).map((operation) => operation.operationId));
    serverCatalogOperations = available;
    auditorEvidence.catalogAvailable = available.has("pilotReadEvidence");
    ownedEvidence.catalogAvailable = available.has("pilotReadOwnObligationEvidence");
    creditPassportPilot.createAvailable =
      available.has("pilotCreateCreditPassportArtifact");
    creditPassportPilot.readAvailable =
      available.has("pilotReadOwnCreditPassportArtifact");
    creditPassportPilot.verifyAvailable =
      available.has("pilotVerifyCreditPassportArtifact");
    creditPassportPilot.revokeAvailable =
      available.has("pilotRevokeCreditPassportArtifact");
    officialReportPilot.createAvailable =
      available.has("pilotCreateOfficialReport");
    officialReportPilot.readAvailable =
      available.has("pilotReadOfficialReport");
    officialReportPilot.retrieveAvailable =
      available.has("pilotRetrieveOfficialReport");
    officialReportPilot.revokeAvailable =
      available.has("pilotRevokeOfficialReport");
    tenantPilot.obligationReadAvailable = available.has("pilotReadOwnObligation");
    pilotFeedback.catalogAvailable = available.has("pilotSubmitPilotFeedback");
    riskOperations.readCatalogAvailable = available.has("pilotReadTenantRisk");
    riskOperations.healthCatalogAvailable = available.has("pilotReadPilotHealth");
    riskOperations.feedbackCatalogAvailable = available.has("pilotReadPilotFeedbackSummary");
    riskOperations.queueCatalogAvailable = available.has("pilotReadServicingQueue");
    riskOperations.freezeCatalogAvailable = available.has("pilotFreezeSubject");
    const operationsAvailable = [...requiredOperations].every((operationId) => available.has(operationId));
    const csrfReady = Boolean(tenantCsrfToken());
    tenantPilot.connected = operationsAvailable && csrfReady;
    tenantPilot.connectionLabel = tenantPilot.connected
      ? "Private gateway connected"
      : operationsAvailable
        ? "CSRF bootstrap required"
        : "Required operations unavailable";
    tenantPilot.helper = tenantPilot.connected
      ? "Authenticated session verified. Create or load a Human Subject and Consent."
      : operationsAvailable
        ? "Complete the local Human BFF session bootstrap before submitting a private mutation."
        : "The private catalog does not expose the approved Human and Agent authority operations.";
    agentAuthorityPilot.helper = tenantPilot.connected
      ? "Authenticated Principal session verified. Create a Subject or load an existing Mandate."
      : operationsAvailable
        ? "Complete the local Human BFF session bootstrap before submitting a private mutation."
        : "The private catalog does not expose the approved Agent Subject and Mandate operations.";
    if (tenantPilot.connected && currentView !== "risk-operations") {
      try {
        await recoverAuthenticatedWorkspace();
      } catch (error) {
        const denied = new Set([
          "authorization_denied",
          "workspace_recovery_unavailable",
          "tenant_resource_unavailable"
        ]).has(error.code);
        tenantPilot.workspaceRecoveryState = denied ? "denied" : "error";
        tenantPilot.workspaceRecoveryErrorCode = denied ? "workspace_unavailable" : "recovery_failed";
        if (!denied) throw error;
      }
    }
    const rememberedHumanSubjectId = rememberedOpaqueId(HUMAN_SUBJECT_STORAGE_KEY);
    const rememberedHumanConsentId = rememberedOpaqueId(HUMAN_CONSENT_STORAGE_KEY);
    const rememberedAgentSubjectId = rememberedOpaqueId(AGENT_SUBJECT_STORAGE_KEY);
    if (rememberedHumanSubjectId && !tenantInputValue("humanSubjectId")) {
      el("humanSubjectId").value = rememberedHumanSubjectId;
    }
    if (rememberedHumanConsentId && !tenantInputValue("humanConsentId")) {
      el("humanConsentId").value = rememberedHumanConsentId;
    }
    if (rememberedAgentSubjectId && !tenantInputValue("agentAuthoritySubjectId")) {
      el("agentAuthoritySubjectId").value = rememberedAgentSubjectId;
    }
    const rememberedObligationId = rememberedOwnedObligationId();
    if (tenantPilot.connected && !tenantPilot.obligation && rememberedObligationId) {
      el("ownedObligationId").value = rememberedObligationId;
      await loadOwnedObligation({ obligationId: rememberedObligationId, quiet: true });
    }
  } catch {
    tenantPilot.connectionLabel = "Private gateway unavailable";
    tenantPilot.workspaceRecoveryState = "error";
    tenantPilot.workspaceRecoveryErrorCode = "gateway_unavailable";
    serverCatalogOperations = new Set();
    serverCatalogSnapshot = null;
    auditorEvidence.catalogAvailable = false;
    ownedEvidence.catalogAvailable = false;
    tenantPilot.obligationReadAvailable = false;
    pilotFeedback.catalogAvailable = false;
    riskOperations.readCatalogAvailable = false;
    riskOperations.healthCatalogAvailable = false;
    riskOperations.feedbackCatalogAvailable = false;
    riskOperations.queueCatalogAvailable = false;
    riskOperations.freezeCatalogAvailable = false;
    officialReportPilot.createAvailable = false;
    officialReportPilot.readAvailable = false;
    officialReportPilot.retrieveAvailable = false;
    officialReportPilot.revokeAvailable = false;
  } finally {
    tenantPilot.checked = true;
    renderTenantPilot();
    renderAuditorEvidence();
    renderRiskOperations();
  }
}

async function createHumanSubject() {
  await runTenantAction(
    el("createHumanSubjectBtn"),
    async () => {
      const result = await tenantApi("pilotCreateHumanSubject");
      el("humanSubjectId").value = result.response.subjectId;
      rememberOpaqueId(HUMAN_SUBJECT_STORAGE_KEY, result.response.subjectId);
      tenantPilot.intent = null;
      tenantPilot.decision = null;
      tenantPilot.offer = null;
      tenantPilot.receipt = null;
      tenantPilot.offerReview = null;
      pilotFeedback.submitted = null;
      pilotFeedback.error = false;
      pilotFeedback.helper = "Ready to record one immutable categorical receipt for this Human Subject.";
      resetHumanObligationWorkflow();
      el("humanOfferAcknowledge").checked = false;
    },
    "Human Subject created. Create scoped Consent next."
  );
}

async function createHumanConsent() {
  await runTenantAction(
    el("createHumanConsentBtn"),
    async () => {
      const subjectId = tenantInputValue("humanSubjectId");
      if (!subjectId) throw new Error("Create or enter a Human Subject ID first.");
      const terms = requestedCreditTerms();
      const validFrom = new Date();
      const expiresAt = new Date(validFrom.getTime() + 89 * 24 * 60 * 60 * 1000);
      const result = await tenantApi("pilotCreateConsent", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: {
          purposes: [
            "credit_application",
            "credit_decision",
            "credit_offer_acceptance",
            "obligation_servicing",
            "identity_reference_use"
          ],
          allowedAssetIds: [terms.assetId],
          allowedCreditPurposeCodes: [terms.purposeCode],
          allowedRepaymentFrequencies: [terms.repaymentFrequency],
          maxRequestedPrincipalMinor: terms.requestedPrincipalMinor,
          maxRequestedTermDays: terms.requestedTermDays,
          maxInstallmentCount: terms.installmentCount,
          termsRef: "urn:ipo.one:terms:human-credit-sandbox:v1",
          termsVersion: "human_credit_terms.v1",
          dataUsageRef: "urn:ipo.one:data-usage:human-credit-sandbox:v1",
          dataUsageVersion: "human_credit_data_usage.v1",
          disclosureRef: "urn:ipo.one:disclosure:no-real-funds:v1",
          expiresAt: expiresAt.toISOString()
        }
      });
      el("humanConsentId").value = result.response.consent.consentId;
      rememberOpaqueId(HUMAN_CONSENT_STORAGE_KEY, result.response.consent.consentId);
      tenantPilot.intent = null;
      tenantPilot.decision = null;
      tenantPilot.offer = null;
      tenantPilot.receipt = null;
      tenantPilot.offerReview = null;
      resetHumanObligationWorkflow();
      el("humanOfferAcknowledge").checked = false;
    },
    "Scoped Consent and its no-PII synthetic identity reference are ready. Request credit next."
  );
}

function startAnotherHumanApplication() {
  if (tenantPilot.busy || !tenantPilot.obligation) return;
  humanNewApplicationMode = true;
  tenantPilot.intent = null;
  tenantPilot.decision = null;
  tenantPilot.offer = null;
  tenantPilot.receipt = null;
  tenantPilot.offerReview = null;
  tenantPilot.obligationReceipt = null;
  tenantPilot.obligationWorkflowId = null;
  tenantPilot.obligationCorrelationId = null;
  tenantPilot.acceptanceStep = null;
  tenantPilot.executionStep = null;
  tenantPilot.repaymentStep = null;
  tenantPilot.acceptance = null;
  el("humanOfferAcknowledge").checked = false;
  tenantPilot.helper = "Current position preserved. Submit another scoped no-funds credit request when ready.";
  renderTenantPilot();
  focusJumpTarget(el("humanApplication"));
}

async function requestAndEvaluateHumanCredit() {
  await runTenantAction(
    el("submitHumanCreditBtn"),
    async () => {
      const subjectId = tenantInputValue("humanSubjectId");
      const authorityId = tenantInputValue("humanConsentId");
      if (!subjectId || !authorityId) throw new Error("Human Subject ID and Consent ID are required.");
      const creditRequest = requestedCreditTerms();
      const workflowId = tenantRequestToken("human_credit_offer_workflow");
      const correlationId = tenantRequestToken("web_tenant_human_credit");
      tenantPilot.receipt = null;
      tenantPilot.offerReview = null;
      resetHumanObligationWorkflow();
      el("humanOfferAcknowledge").checked = false;
      const selfStep = await tenantApi("pilotReadHumanSelf", {
        resource: { resourceType: "subject", resourceId: subjectId },
        idempotent: false,
        correlationId,
        includeTransportMeta: true
      });
      const requestResult = await tenantApi("pilotRequestCredit", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: { authorityId, ...creditRequest },
        correlationId,
        includeTransportMeta: true
      });
      tenantPilot.intent = requestResult.result.response.creditIntent;
      tenantPilot.decision = null;
      tenantPilot.offer = null;
      renderTenantPilot();
      const readStep = await tenantApi("pilotReadCreditApplication", {
        resource: {
          resourceType: "credit_intent",
          resourceId: tenantPilot.intent.creditIntentId
        },
        idempotent: false,
        correlationId,
        includeTransportMeta: true
      });
      const evaluationResult = await tenantApi("pilotEvaluateCreditApplication", {
        resource: {
          resourceType: "credit_intent",
          resourceId: tenantPilot.intent.creditIntentId
        },
        correlationId,
        includeTransportMeta: true
      });
      tenantPilot.receipt = createHumanCreditOfferWorkflowReceipt({
        consentId: authorityId,
        creditRequest,
        evaluationStep: evaluationResult,
        readStep,
        requestStep: requestResult,
        selfStep,
        subjectId,
        workflowId
      });
      tenantPilot.offerReview = tenantPilot.receipt.status === "offer_ready"
        ? createRequestCreditReviewBinding({
            entryMode: "human",
            receipt: tenantPilot.receipt
          })
        : null;
      tenantPilot.intent = evaluationResult.result.response.creditIntent;
      tenantPilot.decision = evaluationResult.result.response.decision;
      tenantPilot.offer = evaluationResult.result.response.offer;
    },
    "Deterministic Decision and Offer completed with no funds effect."
  );
}

async function acceptHumanCreditOffer() {
  await runTenantAction(
    el("acceptHumanOfferBtn"),
    async () => {
      const offer = tenantPilot.offer;
      if (!offer || offer.status !== "offered") {
        throw new Error("Complete a current deterministic Offer before acceptance.");
      }
      const reviewState = humanCreditReviewState();
      if (!reviewState.current) {
        throw new Error(humanCreditReviewMessage(reviewState));
      }
      assertRequestCreditReviewCurrent(
        tenantPilot.offerReview,
        currentHumanCreditReviewInput()
      );
      if (!el("humanOfferAcknowledge").checked) {
        throw new Error("Review and acknowledge the exact sandbox Offer terms first.");
      }
      const acknowledgementHash = await sha256Hex(JSON.stringify({
        acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
        creditOfferHash: offer.creditOfferHash,
        termsHash: offer.termsHash,
        disclosureRef: offer.disclosureRef,
        sandboxOnly: true,
        productionFundsAuthority: false
      }));
      const workflowId = tenantPilot.obligationWorkflowId ??
        tenantRequestToken("human_obligation_workflow");
      const correlationId = tenantPilot.obligationCorrelationId ??
        humanObligationWorkflowIdentifier(workflowId, "correlation", "credit");
      tenantPilot.obligationWorkflowId = workflowId;
      tenantPilot.obligationCorrelationId = correlationId;
      const step = await tenantApi("pilotAcceptCreditOffer", {
        resource: { resourceType: "credit_offer", resourceId: offer.creditOfferId },
        payload: {
          expectedOfferHash: offer.creditOfferHash,
          expectedTermsHash: offer.termsHash,
          acknowledgementHash
        },
        correlationId,
        requestId: humanObligationWorkflowIdentifier(workflowId, "request", "01"),
        idempotencyKey: humanObligationWorkflowIdentifier(workflowId, "idempotency", "01"),
        includeTransportMeta: true
      });
      tenantPilot.acceptanceStep = step;
      const result = step.result;
      tenantPilot.executionStep = null;
      tenantPilot.repaymentStep = null;
      tenantPilot.repaymentSequence = 0;
      tenantPilot.executionReceipt = null;
      tenantPilot.repayment = null;
      tenantPilot.servicingAction = null;
      tenantPilot.acceptance = result.response.acceptance;
      tenantPilot.obligation = result.response.obligation;
      humanNewApplicationMode = false;
      tenantPilot.obligationHydrationAsOf = null;
      tenantPilot.obligationHydrationHelper =
        "Current in-session Obligation created. Its opaque ID is retained for reload recovery.";
      el("ownedObligationId").value = result.response.obligation.obligationId;
      rememberWorkspaceObligation(result.response.obligation.obligationId);
      rememberOwnedObligationId(result.response.obligation.obligationId);
      tenantPilot.offer = {
        ...offer,
        status: result.response.offerStatus,
        acceptanceId: result.response.acceptance.creditOfferAcceptanceId,
        acceptedAt: result.response.acceptance.acceptedAt,
        updatedAt: result.response.acceptance.acceptedAt
      };
      await recoverAuthenticatedWorkspace();
    },
    "Offer accepted. One shared sandbox Obligation and deterministic schedule were created; signed sandbox execution is ready."
  );
}

async function executeHumanSandboxObligation() {
  await runTenantAction(
    el("executeHumanObligationBtn"),
    async () => {
      const obligation = tenantPilot.obligation;
      if (!obligation || obligation.executionStatus !== "pending") {
        throw new Error("Accept one current Offer before sandbox execution.");
      }
      const workflowId = tenantPilot.obligationWorkflowId ??
        tenantRequestToken("human_obligation_execution_workflow");
      tenantPilot.obligationWorkflowId = workflowId;
      tenantPilot.obligationCorrelationId ??=
        humanObligationWorkflowIdentifier(workflowId, "correlation", "execution");
      const step = await tenantApi("pilotExecuteSandboxObligation", {
        resource: { resourceType: "obligation", resourceId: obligation.obligationId },
        payload: {},
        correlationId: tenantPilot.obligationCorrelationId,
        requestId: humanObligationWorkflowIdentifier(workflowId, "request", "02"),
        idempotencyKey: humanObligationWorkflowIdentifier(workflowId, "idempotency", "02"),
        includeTransportMeta: true
      });
      tenantPilot.executionStep = step;
      const result = step.result;
      tenantPilot.obligation = result.response.obligation;
      tenantPilot.executionReceipt = result.response.executionReceipt;
      tenantPilot.obligationHydrationAsOf = null;
      rememberOwnedObligationId(result.response.obligation.obligationId);
      tenantPilot.obligationReceipt = null;
      tenantPilot.repaymentStep = null;
      tenantPilot.repaymentSequence = 0;
      tenantPilot.repayment = null;
      tenantPilot.servicingAction = null;
      await loadOwnedObligation({
        obligationId: result.response.obligation.obligationId,
        quiet: true
      });
    },
    "Signed sandbox execution completed. The principal ledger entry is balanced and no withdrawable funds were created."
  );
}

async function postHumanSandboxRepayment({
  amountInputId = "humanRepaymentAmount",
  sourceInputId = "humanRepaymentSource",
  buttonId = "postHumanRepaymentBtn"
} = {}) {
  await runTenantAction(
    el(buttonId),
    async () => {
      const obligation = tenantPilot.obligation;
      if (!obligation || obligation.executionStatus !== "executed") {
        throw new Error("Execute the sandbox Obligation before repayment.");
      }
      const amount = Number(el(amountInputId).value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
        throw new Error("Repayment must be greater than $0 and no more than $1,000 in the sandbox.");
      }
      const workflowId = tenantPilot.obligationWorkflowId ??
        tenantRequestToken("human_obligation_servicing_workflow");
      tenantPilot.obligationWorkflowId = workflowId;
      tenantPilot.obligationCorrelationId ??=
        humanObligationWorkflowIdentifier(workflowId, "correlation", "servicing");
      const nextRepaymentSequence = tenantPilot.repaymentSequence + 1;
      const repaymentStepId = `03-${String(nextRepaymentSequence).padStart(2, "0")}`;
      const step = await tenantApi("pilotPostSandboxRepayment", {
        resource: { resourceType: "obligation", resourceId: obligation.obligationId },
        payload: {
          amountMinor: String(Math.round(amount * 100)),
          sourceCode: el(sourceInputId).value
        },
        correlationId: tenantPilot.obligationCorrelationId,
        requestId: humanObligationWorkflowIdentifier(workflowId, "request", repaymentStepId),
        idempotencyKey: humanObligationWorkflowIdentifier(
          workflowId,
          "idempotency",
          repaymentStepId
        ),
        includeTransportMeta: true
      });
      tenantPilot.repaymentStep = step;
      tenantPilot.repaymentSequence = nextRepaymentSequence;
      const result = step.result;
      tenantPilot.obligation = result.response.obligation;
      tenantPilot.repayment = result.response.repayment;
      tenantPilot.servicingAction = result.response.servicingAction ?? null;
      tenantPilot.obligationHydrationAsOf = null;
      rememberOwnedObligationId(result.response.obligation.obligationId);
      el("humanRepaymentSource").value = el(sourceInputId).value;
      el("servicingRepaymentSource").value = el(sourceInputId).value;
      tenantPilot.obligationReceipt = tenantPilot.acceptanceStep &&
        tenantPilot.executionStep && tenantPilot.receipt
        ? createHumanSandboxObligationWorkflowReceipt({
            acceptanceStep: tenantPilot.acceptanceStep,
            executionStep: tenantPilot.executionStep,
            offerReceipt: tenantPilot.receipt,
            repaymentStep: tenantPilot.repaymentStep,
            repaymentSequence: tenantPilot.repaymentSequence,
            workflowId
          })
        : null;
      await loadOwnedObligation({
        obligationId: result.response.obligation.obligationId,
        quiet: true
      });
    },
    "Sandbox repayment posted through the deterministic fee, interest, and principal waterfall."
  );
}

async function createPrivateAgentSubject() {
  await runAgentAuthorityAction(
    el("createPrivateAgentSubjectBtn"),
    async () => {
      const subjectActorId = tenantInputValue("agentAuthorityActorId");
      const displayName = tenantInputValue("agentAuthorityDisplayName");
      const jurisdiction = tenantInputValue("agentAuthorityJurisdiction");
      if (!subjectActorId || !displayName || !jurisdiction) {
        throw new Error("Agent actor ID, display name, and jurisdiction are required.");
      }
      const idempotencyKey = `private-agent-subject-${await sha256Hex(JSON.stringify({
        subjectActorId,
        displayName,
        jurisdiction
      }))}`;
      const result = await tenantApi("pilotCreateAgentSubject", {
        payload: { subjectActorId, displayName, jurisdiction },
        idempotencyKey
      });
      agentAuthorityPilot.subject = result.response;
      agentAuthorityPilot.accountChallenge = null;
      const binding = await tenantApi("pilotReadAgentAccountBinding", {
        resource: { resourceType: "subject", resourceId: result.response.subjectId },
        idempotent: false
      });
      agentAuthorityPilot.accountBinding = binding.response;
      agentAuthorityPilot.subject = {
        ...agentAuthorityPilot.subject,
        status: binding.response.subjectStatus
      };
      agentAuthorityPilot.mandate = null;
      agentAuthorityPilot.activationEvidenceHash = null;
      el("agentAuthoritySubjectId").value = result.response.subjectId;
      rememberOpaqueId(AGENT_SUBJECT_STORAGE_KEY, result.response.subjectId);
      el("agentAuthorityMandateId").value = "";
      el("principalMandateAcknowledge").checked = false;
    },
    () => agentAuthorityPilot.subject?.status === "active"
      ? "Existing active Agent Subject recovered from the durable Gateway."
      : "Agent Subject created or recovered in pending state. Create the one-use CAIP-10 signing request next."
  );
}

async function createAgentAccountChallenge() {
  await runAgentAuthorityAction(
    el("createAccountChallengeBtn"),
    async () => {
      const subjectId = tenantInputValue("agentAuthoritySubjectId");
      if (!subjectId) throw new Error("Create or enter an Agent Subject ID first.");
      const result = await tenantApi("pilotCreateAgentAccountChallenge", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: requestedAgentAccountProof()
      });
      agentAuthorityPilot.accountChallenge = result.response;
      agentAuthorityPilot.accountBinding = null;
    },
    "One-use EIP-712 request created. Download it and run pilot:agent:prove before creating the Mandate."
  );
}

async function refreshAgentAccountBinding() {
  await runAgentAuthorityAction(
    el("refreshAccountBindingBtn"),
    async () => {
      const subjectId = tenantInputValue("agentAuthoritySubjectId");
      if (!subjectId) throw new Error("Create or enter an Agent Subject ID first.");
      const result = await tenantApi("pilotReadAgentAccountBinding", {
        resource: { resourceType: "subject", resourceId: subjectId },
        idempotent: false
      });
      agentAuthorityPilot.accountBinding = result.response;
      if (agentAuthorityPilot.subject?.subjectId === subjectId) {
        agentAuthorityPilot.subject = {
          ...agentAuthorityPilot.subject,
          status: result.response.subjectStatus
        };
      }
    },
    () => agentAuthorityPilot.accountBinding?.accountBinding
      ? "Verified CAIP-10 AccountBinding loaded. The Agent Subject is active."
      : "No verified AccountBinding yet. The registered local Agent Host must submit the one-use signature proof."
  );
}

async function loadExactMandate(mandateId) {
  const result = await tenantApi("pilotReadMandate", {
    resource: { resourceType: "mandate", resourceId: mandateId },
    idempotent: false
  });
  agentAuthorityPilot.mandate = result.response.mandate;
  agentAuthorityPilot.activationEvidenceHash = result.response.mandate.activationAcknowledgement?.evidenceHash ?? null;
  el("agentAuthoritySubjectId").value = result.response.mandate.subjectId;
  el("agentAuthorityMandateId").value = result.response.mandate.mandateId;
  el("principalMandateAcknowledge").checked = false;
}

async function createDraftAgentMandate() {
  await runAgentAuthorityAction(
    el("createDraftMandateBtn"),
    async () => {
      const subjectId = tenantInputValue("agentAuthoritySubjectId");
      if (!subjectId) throw new Error("Create or enter an Agent Subject ID first.");
      const result = await tenantApi("pilotCreateDraftMandate", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: requestedAgentMandateTerms()
      });
      el("agentAuthorityMandateId").value = result.response.mandateId;
      await loadExactMandate(result.response.mandateId);
    },
    () => agentAuthorityPilot.subject?.status === "pending"
      ? "Draft Mandate created and verified. The new Subject is pending, so exact activation remains blocked."
      : "Draft Mandate created. Review the exact server hashes before activation."
  );
}

async function loadAgentMandate() {
  await runAgentAuthorityAction(
    el("loadMandateBtn"),
    async () => {
      const mandateId = tenantInputValue("agentAuthorityMandateId");
      if (!mandateId) throw new Error("Enter an exact Mandate ID first.");
      await loadExactMandate(mandateId);
      if (agentAuthorityPilot.subject?.subjectId !== agentAuthorityPilot.mandate.subjectId) {
        agentAuthorityPilot.subject = null;
      }
    },
    "Exact Mandate loaded from the private protocol. Review hashes, limits, and expiry."
  );
}

async function activateExactAgentMandate() {
  await runAgentAuthorityAction(
    el("activateMandateBtn"),
    async () => {
      const mandate = agentAuthorityPilot.mandate;
      if (!mandate || mandate.status !== "draft") throw new Error("Load an exact draft Mandate first.");
      if (!el("principalMandateAcknowledge").checked) throw new Error("Confirm the exact Mandate and terms first.");
      const result = await tenantApi("pilotActivateSandboxMandate", {
        resource: { resourceType: "mandate", resourceId: mandate.mandateId },
        payload: {
          expectedMandateHash: mandate.mandateHash,
          acknowledgedTermsHash: mandate.termsHash,
          acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
        }
      });
      agentAuthorityPilot.mandate = result.response.mandate;
      agentAuthorityPilot.activationEvidenceHash = result.response.activationEvidenceHash;
      el("principalMandateAcknowledge").checked = false;
    },
    "Sandbox Mandate activated by the authenticated Human Principal. Agent API handoff is ready."
  );
}

function toast(message, type = "success") {
  const node = el("toast");
  node.textContent = message;
  node.classList.toggle("error", type === "error");
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 3200);
}

function announce(message) {
  el("operationStatus").textContent = message;
}

function setMode(mode) {
  const agentMode = mode === "agent";
  interactionMode = agentMode ? "agent" : "human";
  document.body.dataset.interactionMode = interactionMode;
  el("operatorModeBtn").classList.toggle("active", !agentMode);
  el("operatorModeBtn").setAttribute("aria-pressed", String(!agentMode));
  el("agentModeBtn").classList.toggle("active", agentMode);
  el("agentModeBtn").setAttribute("aria-pressed", String(agentMode));
  if (currentView === "request-credit") {
    el("viewEyebrow").textContent = agentMode
      ? "Agent entry · shared kernel"
      : "Human entry · shared kernel";
  }
  renderPrivateProductSurfaces();
}

function syncNavigationAccessibility() {
  const mobile = mobileNavigation.matches;
  const open = mobile && document.body.classList.contains("nav-open");
  el("mobileMenuBtn").setAttribute("aria-expanded", String(open));
  el("sidebar").toggleAttribute("inert", mobile && !open);
  el("mainShell").toggleAttribute("inert", open);
  if (mobile && !open) el("sidebar").setAttribute("aria-hidden", "true");
  else el("sidebar").removeAttribute("aria-hidden");
  if (open) el("mainShell").setAttribute("aria-hidden", "true");
  else el("mainShell").removeAttribute("aria-hidden");
}

function setNavigationOpen(open, { moveFocus = true } = {}) {
  document.body.classList.toggle("nav-open", mobileNavigation.matches && open);
  syncNavigationAccessibility();
  if (!moveFocus) return;
  if (open && mobileNavigation.matches) el("sidebarCloseBtn").focus();
  else if (mobileNavigation.matches) el("mobileMenuBtn").focus();
}

function handleNavigationKeys(event) {
  if (!document.body.classList.contains("nav-open")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    setNavigationOpen(false);
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...el("sidebar").querySelectorAll("button:not(:disabled), a[href]")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showView(viewName, { focus = true, updateHash = true } = {}) {
  const nextView = VIEW_META[viewName] ? viewName : "overview";
  currentView = nextView;
  for (const panel of document.querySelectorAll("[data-view-panel]")) {
    panel.classList.toggle("active", panel.dataset.viewPanel === nextView);
  }
  for (const button of document.querySelectorAll(".nav-item")) {
    const active = button.dataset.view === nextView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  el("viewEyebrow").textContent = nextView === "request-credit"
    ? `${interactionMode === "agent" ? "Agent" : "Human"} entry · shared kernel`
    : VIEW_META[nextView].eyebrow;
  el("viewTitle").textContent = VIEW_META[nextView].title;
  if (["agent-console", "architecture"].includes(nextView)) setMode("agent");
  else renderPrivateProductSurfaces();
  setNavigationOpen(false, { moveFocus: false });
  if (updateHash) history.replaceState(null, "", `#${nextView}`);
  if (focus) {
    el("mainContent").focus({ preventScroll: true });
    announce(`${VIEW_META[nextView].title} view selected`);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function focusJumpTarget(target) {
  if (!target) return;
  target.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

function openPrincipalAgentAuthority() {
  setMode("human");
  showView("request-credit");
  el("agentAuthorityDisclosure").open = true;
  requestAnimationFrame(() => focusJumpTarget(el("agentAuthority")));
  announce("Human Principal authority configuration opened");
}

function openAgentProtocolDetails({ targetId = "agentProtocolDetails" } = {}) {
  setMode("agent");
  showView("agent-console");
  requestAnimationFrame(() => focusJumpTarget(el(targetId)));
  announce("Local Agent integration contract opened");
}

function runAgentGuideAction(action) {
  if (action === "principal-setup") {
    openPrincipalAgentAuthority();
    return;
  }
  if (action === "open-agent-api") {
    openAgentProtocolDetails({ targetId: "agentConsoleProtocol" });
    return;
  }
  if (action === "open-handoff") {
    openAgentProtocolDetails({ targetId: "agentConsoleContract" });
    return;
  }
  openAgentProtocolDetails({ targetId: "agentConsoleProtocol" });
}

function openPrivateProductAction(action) {
  if (action === "open-access") {
    openAccess();
    announce("Authenticated pilot access required");
    return;
  }
  if (action === "refresh-obligations") {
    refreshOwnedPositionIndex();
    return;
  }
  if (action === "principal-authority") {
    openPrincipalAgentAuthority();
    return;
  }
  if (action === "agent-api") {
    setMode("agent");
    showView("architecture");
    return;
  }
  if (action === "servicing-cure") {
    showView("repay-settle");
    requestAnimationFrame(() => focusJumpTarget(el("servicingCureCard")));
    announce("Human Servicing Case repayment controls opened");
    return;
  }
  setMode("human");
  showView("request-credit");
  const target = action === "human-evidence"
    ? el("ownedEvidencePanel")
    : action === "human-obligation"
      ? el("humanObligationCard")
      : tenantPilot.obligation
        ? el("humanObligationCard")
        : el("humanApplication");
  requestAnimationFrame(() => focusJumpTarget(target));
  announce(action === "human-evidence"
    ? "Owner Obligation Evidence opened"
    : action === "human-obligation"
      ? "Human Obligation repayment controls opened"
      : "Human credit workbench opened");
}

function formatEvidenceTime(value, { short = false } = {}) {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", short
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(date);
}

function evidenceTextCell(label, primary, secondary) {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  cell.className = "auditor-evidence-cell";
  cell.dataset.label = label;
  strong.textContent = primary;
  cell.append(strong);
  if (secondary) {
    const small = document.createElement("small");
    small.textContent = secondary;
    small.title = secondary;
    cell.append(small);
  }
  return cell;
}

function evidenceTimeCell(item) {
  const cell = document.createElement("div");
  const occurred = document.createElement("time");
  const recorded = document.createElement("small");
  cell.className = "auditor-evidence-cell";
  cell.dataset.label = "Occurred";
  occurred.dateTime = item.occurredAt;
  occurred.textContent = formatEvidenceTime(item.occurredAt);
  recorded.textContent = `Recorded ${formatEvidenceTime(item.recordedAt, { short: true })}`;
  cell.append(occurred, recorded);
  return cell;
}

function evidenceHashCell(item) {
  const cell = document.createElement("div");
  const content = document.createElement("div");
  const code = document.createElement("code");
  const button = document.createElement("button");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  cell.className = "auditor-evidence-cell";
  cell.dataset.label = "Evidence hash";
  content.className = "auditor-evidence-hash";
  code.textContent = item.evidenceHash;
  code.title = item.evidenceHash;
  button.className = "icon-button";
  button.type = "button";
  button.title = "Copy Evidence hash";
  button.setAttribute("aria-label", `Copy Evidence hash for ${item.evidenceId}`);
  button.dataset.evidenceHash = item.evidenceHash;
  use.setAttribute("href", "/icons.svg#copy");
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  button.append(svg);
  content.append(code, button);
  cell.append(content);
  return cell;
}

function auditorEvidenceRow(item) {
  const row = document.createElement("div");
  row.className = "auditor-evidence-row";
  row.setAttribute("role", "row");
  row.append(
    evidenceTextCell("Event", titleize(item.eventType), item.evidenceId),
    evidenceTextCell("Aggregate", `${titleize(item.aggregateType)} v${item.aggregateVersion}`, item.aggregateId),
    evidenceTextCell("Finality", titleize(item.sourceFinality), item.schemaVersion),
    evidenceTimeCell(item),
    evidenceHashCell(item)
  );
  return row;
}

function renderOwnedEvidence() {
  const panel = el("ownedEvidencePanel");
  if (!panel) return;
  const obligationId = tenantPilot.obligation?.obligationId ?? null;
  const rows = ownedEvidence.items.map(auditorEvidenceRow);
  if (rows.length === 0) {
    const empty = emptyRow(ownedEvidence.queried
      ? "No immutable Evidence events were returned for this Obligation."
      : "Load the owner-authorized timeline after accepting the Offer.");
    empty.setAttribute("role", "row");
    rows.push(empty);
  }
  el("ownedEvidenceRows").replaceChildren(...rows);
  el("ownedEvidenceCount").textContent = String(ownedEvidence.items.length);
  const finalities = new Set(ownedEvidence.items.map((item) => item.sourceFinality));
  el("ownedEvidenceFinality").textContent = finalities.size === 0
    ? "Waiting"
    : finalities.size === 1
      ? titleize([...finalities][0])
      : `${finalities.size} states`;
  el("ownedEvidenceAsOf").textContent = ownedEvidence.asOf
    ? formatEvidenceTime(ownedEvidence.asOf, { short: true })
    : "Not queried";
  el("ownedEvidenceAccess").textContent = ownedEvidence.catalogAvailable
    ? "Owner / controller read"
    : "Operation unavailable";
  el("ownedEvidenceAccess").classList.toggle("warning", !ownedEvidence.catalogAvailable);
  el("ownedEvidenceHelper").textContent = ownedEvidence.helper;
  el("ownedEvidenceHelper").classList.toggle("error", ownedEvidence.error);
  const load = el("loadOwnedEvidenceBtn");
  load.disabled = ownedEvidence.busy || !ownedEvidence.catalogAvailable || !obligationId;
  load.toggleAttribute("aria-busy", ownedEvidence.busy);
  const more = el("loadMoreOwnedEvidenceBtn");
  more.hidden = !ownedEvidence.hasMore;
  more.disabled = ownedEvidence.busy || !ownedEvidence.nextCursor || !obligationId;
  more.toggleAttribute("aria-busy", ownedEvidence.busy);
}

async function loadOwnedEvidence({ append = false } = {}) {
  if (ownedEvidence.busy) return;
  const obligationId = tenantPilot.obligation?.obligationId;
  if (!obligationId) return;
  if (append && (!ownedEvidence.nextCursor || ownedEvidence.obligationId !== obligationId)) return;
  ownedEvidence.busy = true;
  ownedEvidence.error = false;
  ownedEvidence.helper = append
    ? "Loading the next immutable page…"
    : "Verifying exact owner/controller access and loading redacted Evidence…";
  if (!append) {
    ownedEvidence.items = [];
    ownedEvidence.nextCursor = null;
    ownedEvidence.hasMore = false;
    ownedEvidence.capped = false;
    ownedEvidence.asOf = null;
  }
  renderOwnedEvidence();
  try {
    const result = await tenantApi("pilotReadOwnObligationEvidence", {
      resource: { resourceType: "evidence", resourceId: obligationId },
      payload: {
        limit: 10,
        ...(append ? { cursor: ownedEvidence.nextCursor } : {})
      },
      idempotent: false
    });
    const response = result.response;
    const existing = append ? ownedEvidence.items : [];
    const seen = new Set(existing.map((item) => item.evidenceId));
    const mergedItems = [
      ...existing,
      ...response.items.filter((item) => !seen.has(item.evidenceId))
    ];
    ownedEvidence.capped =
      mergedItems.length > OWNED_EVIDENCE_DISPLAY_LIMIT ||
      (mergedItems.length >= OWNED_EVIDENCE_DISPLAY_LIMIT && response.hasMore);
    ownedEvidence.items = mergedItems.slice(0, OWNED_EVIDENCE_DISPLAY_LIMIT);
    ownedEvidence.obligationId = response.obligationId;
    ownedEvidence.nextCursor = ownedEvidence.capped
      ? null
      : response.nextCursor ?? null;
    ownedEvidence.hasMore = !ownedEvidence.capped &&
      Boolean(response.hasMore && response.nextCursor);
    ownedEvidence.asOf = response.asOf;
    ownedEvidence.queried = true;
    ownedEvidence.helper = ownedEvidence.capped
      ? `${ownedEvidence.items.length} redacted Evidence events loaded; the bounded browser display cap has been reached.`
      : `${response.items.length} redacted Evidence event${response.items.length === 1 ? "" : "s"} loaded from the shared immutable timeline.`;
    toast(append ? "Next owner Evidence page loaded" : "Your Obligation Evidence loaded");
    announce(ownedEvidence.helper);
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    ownedEvidence.error = true;
    ownedEvidence.helper = nonEnumerating
      ? "This Obligation is unavailable or is not bound to your active identity."
      : `Evidence query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(ownedEvidence.helper, "error");
    announce(ownedEvidence.helper);
  } finally {
    ownedEvidence.busy = false;
    renderTenantPilot();
  }
}

function renderAuditorEvidence() {
  const consoleElement = el("auditorEvidenceConsole");
  if (!consoleElement) return;
  const privateHost = Boolean(tenantCsrfToken());
  consoleElement.hidden = !privateHost;
  if (!privateHost) return;

  const rows = auditorEvidence.items.map(auditorEvidenceRow);
  if (rows.length === 0) {
    const empty = emptyRow(auditorEvidence.queried
      ? "No durable Evidence events were returned for this Obligation."
      : "Query an authorized Obligation to load its durable Evidence timeline.");
    empty.setAttribute("role", "row");
    rows.push(empty);
  }
  el("auditorEvidenceRows").replaceChildren(...rows);
  el("auditorEvidenceCount").textContent = String(auditorEvidence.items.length);
  const finalities = new Set(auditorEvidence.items.map((item) => item.sourceFinality));
  el("auditorEvidenceFinality").textContent = finalities.size === 0
    ? "Waiting"
    : finalities.size === 1
      ? titleize([...finalities][0])
      : `${finalities.size} states`;
  el("auditorEvidenceLastRecorded").textContent = auditorEvidence.items.length
    ? formatEvidenceTime(auditorEvidence.items.at(-1).recordedAt, { short: true })
    : "Not queried";
  el("auditorEvidenceAsOf").textContent = auditorEvidence.asOf && auditorEvidence.obligationId
    ? `Durable view as of ${formatEvidenceTime(auditorEvidence.asOf)} · ${auditorEvidence.obligationId}`
    : "No durable query yet.";
  el("auditorEvidenceAccess").textContent = auditorEvidence.catalogAvailable
    ? "Auditor access"
    : "Operation unavailable";
  el("auditorEvidenceAccess").classList.toggle("warning", !auditorEvidence.catalogAvailable);
  el("auditorEvidenceHelper").textContent = auditorEvidence.helper;
  el("auditorEvidenceHelper").classList.toggle("error", auditorEvidence.error);
  el("auditorEvidenceObligationId").disabled = auditorEvidence.busy;
  el("auditorEvidencePageSize").disabled = auditorEvidence.busy;
  el("loadAuditorEvidenceBtn").disabled = auditorEvidence.busy || !auditorEvidence.catalogAvailable;
  el("loadAuditorEvidenceBtn").toggleAttribute("aria-busy", auditorEvidence.busy);
  const loadMore = el("loadMoreAuditorEvidenceBtn");
  loadMore.hidden = !auditorEvidence.hasMore;
  loadMore.disabled = auditorEvidence.busy || !auditorEvidence.nextCursor;
  loadMore.toggleAttribute("aria-busy", auditorEvidence.busy);
}

function requestedEvidenceQuery() {
  const obligationId = tenantInputValue("auditorEvidenceObligationId");
  const limit = Number(el("auditorEvidencePageSize").value);
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(obligationId)) {
    throw new Error("Enter one valid Obligation ID with no spaces.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Evidence page size must be between 1 and 50.");
  }
  return { obligationId, limit };
}

async function loadAuditorEvidence({ append = false } = {}) {
  if (auditorEvidence.busy) return;
  let query;
  try {
    query = requestedEvidenceQuery();
  } catch (error) {
    auditorEvidence.error = true;
    auditorEvidence.helper = error.message;
    renderAuditorEvidence();
    announce(error.message);
    return;
  }
  if (append && (!auditorEvidence.nextCursor || auditorEvidence.obligationId !== query.obligationId)) return;

  auditorEvidence.busy = true;
  auditorEvidence.error = false;
  auditorEvidence.helper = append ? "Loading the next immutable page…" : "Verifying Auditor access and loading durable Evidence…";
  if (!append) {
    auditorEvidence.items = [];
    auditorEvidence.nextCursor = null;
    auditorEvidence.hasMore = false;
    auditorEvidence.asOf = null;
  }
  renderAuditorEvidence();
  try {
    const result = await tenantApi("pilotReadEvidence", {
      resource: { resourceType: "evidence", resourceId: query.obligationId },
      payload: {
        limit: query.limit,
        ...(append ? { cursor: auditorEvidence.nextCursor } : {})
      },
      idempotent: false
    });
    const response = result.response;
    const existing = append ? auditorEvidence.items : [];
    const seen = new Set(existing.map((item) => item.evidenceId));
    auditorEvidence.items = [...existing, ...response.items.filter((item) => !seen.has(item.evidenceId))];
    auditorEvidence.obligationId = response.obligationId;
    auditorEvidence.nextCursor = response.nextCursor ?? null;
    auditorEvidence.hasMore = Boolean(response.hasMore && response.nextCursor);
    auditorEvidence.asOf = response.asOf;
    auditorEvidence.queried = true;
    auditorEvidence.helper = `${response.items.length} Evidence event${response.items.length === 1 ? "" : "s"} loaded from the immutable timeline.`;
    toast(append ? "Next Evidence page loaded" : "Obligation Evidence loaded");
    announce(auditorEvidence.helper);
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    auditorEvidence.error = true;
    auditorEvidence.helper = nonEnumerating
      ? "Auditor access is required or the Obligation is unavailable."
      : `Evidence query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(auditorEvidence.helper, "error");
    announce(auditorEvidence.helper);
  } finally {
    auditorEvidence.busy = false;
    renderAuditorEvidence();
  }
}

function exactResourceId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(value);
}

function riskSummaryItem(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = String(value);
  wrapper.append(term, detail);
  return wrapper;
}

function utilizationLabel(utilizedMinor, limitMinor) {
  const utilized = asBigInt(utilizedMinor);
  const limit = asBigInt(limitMinor);
  if (limit <= 0n) return "0% utilization";
  const tenths = (utilized * 1000n) / limit;
  return `${percent.format(Number(tenths) / 10)}% utilization`;
}

function riskAssetRow(exposure) {
  const row = document.createElement("div");
  row.className = "risk-asset-row";
  row.setAttribute("role", "row");

  const cell = (label, primary, secondary) => {
    const element = document.createElement("span");
    const strong = document.createElement("strong");
    element.setAttribute("role", "cell");
    element.dataset.label = label;
    strong.textContent = primary;
    element.append(strong);
    if (secondary) {
      const small = document.createElement("small");
      small.textContent = secondary;
      element.append(small);
    }
    return element;
  };

  const adverse = exposure.overdueObligationCount +
    exposure.defaultedObligationCount +
    exposure.writtenOffObligationCount;
  row.append(
    cell("Asset", exposure.assetId, `${exposure.creditLineCount} line${exposure.creditLineCount === 1 ? "" : "s"}`),
    cell("Limits / utilized", usdMinorToMoney(exposure.limitMinor), `${usdMinorToMoney(exposure.utilizedMinor)} utilized`),
    cell("Outstanding", usdMinorToMoney(exposure.outstandingPrincipalMinor), `${exposure.openObligationCount} open`),
    cell("Adverse", String(adverse), `${exposure.overdueObligationCount} overdue · ${exposure.defaultedObligationCount} defaulted`)
  );
  return row;
}

function servicingQueueRow(item) {
  const row = document.createElement("div");
  row.className = `servicing-queue-row priority-${item.priority}`;
  row.setAttribute("role", "row");

  const cell = (label, primary, secondary, className = "") => {
    const element = document.createElement("span");
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    element.setAttribute("role", "cell");
    element.dataset.label = label;
    if (className) element.classList.add(className);
    strong.textContent = primary;
    small.textContent = secondary;
    element.append(strong, small);
    return element;
  };

  const stage = item.servicingClassification === "grace_period"
    ? "Grace period"
    : item.servicingClassification === "defaulted"
      ? "Defaulted"
      : item.servicingClassification.replace("dpd_", "DPD ").replace("_", "–");
  row.append(
    cell("Obligation", item.obligationId, `Subject ${item.subjectId}`, "servicing-case-id"),
    cell("Stage", stage, `${item.daysPastDue} days past due · oldest ${privateDate(item.oldestDueAt, { month: "short", day: "numeric", year: "numeric" })}`, "servicing-stage-cell"),
    cell("Past due", usdMinorToMoney(item.pastDueTotalMinor), `Principal ${usdMinorToMoney(item.pastDuePrincipalMinor)}`),
    cell("Outstanding", usdMinorToMoney(item.outstandingTotalMinor), `${item.assetId}`),
    cell("Review", titleize(item.reviewCode), `${titleize(item.servicingOwnerCode)} · read only`, "servicing-review-cell")
  );
  return row;
}

function pilotFeedbackTopBlocker(summary) {
  const entries = Object.entries(summary?.blockerCodes ?? {})
    .filter(([key, count]) => key !== "noneCount" && Number.isSafeInteger(count) && count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (entries.length === 0) return "None";
  const [key, count] = entries[0];
  const label = key
    .replace(/Count$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return `${label.replace(/^./, (character) => character.toUpperCase())} · ${count}`;
}

const RISK_AUTHORITY_LABELS = Object.freeze({
  borrower: "Borrower",
  risk_operator: "Risk",
  operations_operator: "Operations",
  auditor: "Auditor"
});

function riskAuthorityCell(allowed, allowedLabel) {
  const cell = document.createElement("span");
  cell.setAttribute("role", "cell");
  const indicator = document.createElement("strong");
  const detail = document.createElement("small");
  indicator.textContent = allowed ? "Eligible" : "—";
  detail.textContent = allowed ? allowedLabel : "Not allowed";
  cell.classList.toggle("eligible", allowed);
  cell.append(indicator, detail);
  return cell;
}

function riskAuthorityRow(authority) {
  const row = document.createElement("div");
  row.className = "risk-authority-row";
  row.setAttribute("role", "row");

  const actor = document.createElement("span");
  actor.setAttribute("role", "rowheader");
  const actorLabel = document.createElement("strong");
  actorLabel.textContent =
    RISK_AUTHORITY_LABELS[authority.actorType] ?? authority.actorType;
  const actorType = document.createElement("small");
  actorType.textContent = authority.actorType;
  actor.append(actorLabel, actorType);

  row.append(
    actor,
    riskAuthorityCell(authority.portfolio, "Aggregate"),
    riskAuthorityCell(authority.servicingQueue, "PII-free"),
    riskAuthorityCell(authority.freeze, "Protective"),
    riskAuthorityCell(authority.servicingResolution, "Dual control")
  );
  return row;
}

function renderRiskOperationsAssurance() {
  const presentation = createRiskOperationsPresentation({
    catalogOperationIds: [...serverCatalogOperations].sort()
  });
  if (!presentation) {
    const assuranceStatus = el("operationsAssuranceStatus");
    assuranceStatus.textContent = "Unavailable";
    assuranceStatus.classList.add("warning");
    el("operationsEvidenceBoundaryCopy").textContent =
      "The closed presentation contract rejected the catalog. No control state is inferred.";
    el("riskAuthorityRows").replaceChildren(
      emptyRow("Authority ceilings are unavailable until the catalog passes validation.")
    );
    return;
  }

  const { alerts, reconciliation, incidents, approvals, launch } =
    presentation.operationalEvidence;
  const assuranceStatus = el("operationsAssuranceStatus");
  assuranceStatus.classList.remove("neutral", "warning");
  assuranceStatus.textContent = "Checked-in evidence";

  el("operationsAlertEvidenceStatus").textContent =
    "Internal durable · not exposed";
  el("operationsAlertEvidenceCopy").textContent =
    `${alerts.ruleCount} closed rules are checked in; no live alert list was loaded.`;
  el("operationsAlertEvidenceMeta").textContent =
    `${alerts.policyVersion} · delivery ${alerts.notificationTargetStatus}`;

  el("operationsReconciliationEvidenceStatus").textContent =
    "Worker-only · not loaded";
  el("operationsReconciliationEvidenceCopy").textContent =
    "Full reconciliation is restart-tested internally; this browser has no summary read operation.";
  el("operationsReconciliationEvidenceMeta").textContent =
    `${reconciliation.schemaVersion} · automatic repair off`;

  el("operationsIncidentEvidenceStatus").textContent =
    "Runbook only · unconfigured";
  el("operationsIncidentEvidenceCopy").textContent =
    "Named owner, notification, acknowledgement, and resolution remain outside this surface.";
  el("operationsIncidentEvidenceMeta").textContent =
    `owner ${incidents.namedOwnerStatus} · notify ${incidents.notificationTargetStatus}`;

  el("operationsApprovalEvidenceStatus").textContent =
    approvals.state === "exact_external_artifact_required"
      ? "Exact artifact required"
      : "Operation unavailable";
  el("operationsApprovalEvidenceCopy").textContent =
    approvals.state === "exact_external_artifact_required"
      ? "Sandbox servicing resolutions require the exact command, current state hash, and distinct Risk + Operations approvals."
      : "The complete dual-controlled servicing operation set is not present in the catalog.";
  el("operationsApprovalEvidenceMeta").textContent =
    "Proposal ID + version are locators, not bearer authority";

  el("operationsEvidenceBoundaryCopy").textContent =
    `${alerts.policyVersion} and launch policy ${launch.policyVersion} are checked-in evidence only. ` +
    "No live alert, reconciliation, incident, approval, release, or funds authority is inferred.";
  el("riskAuthorityRows").replaceChildren(
    ...presentation.actorPolicyCeilings.map(riskAuthorityRow)
  );
}

function renderRiskOperations() {
  if (!el("privateRiskSurface")) return;
  renderRiskOperationsAssurance();
  const portfolio = riskOperations.portfolio;
  const status = el("privateRiskStatus");
  const catalogReady = riskOperations.readCatalogAvailable;
  status.classList.remove("neutral", "warning");
  if (!catalogReady) {
    status.textContent = "Operation unavailable";
    status.classList.add("warning");
  } else if (riskOperations.error) {
    status.textContent = "Access required";
    status.classList.add("warning");
  } else if (riskOperations.queried && portfolio) {
    status.textContent = "Verified";
  } else {
    status.textContent = "Not loaded";
    status.classList.add("neutral");
  }

  el("riskPortfolioHelper").textContent = riskOperations.helper;
  el("riskPortfolioHelper").classList.toggle("error", riskOperations.error);
  el("riskPortfolioAsOf").textContent = portfolio
    ? `Verified ${privateDate(portfolio.asOf, { dateStyle: "medium", timeStyle: "short" })} · ${portfolio.portfolioId}`
    : "No verified query yet.";
  el("riskExposureLimit").textContent = portfolio ? usdMinorToMoney(portfolio.creditLines.limitMinor) : "$0.00";
  el("riskCreditLineCount").textContent = `${portfolio?.creditLines.totalCount ?? 0} credit line${portfolio?.creditLines.totalCount === 1 ? "" : "s"}`;
  el("riskExposureUtilized").textContent = portfolio ? usdMinorToMoney(portfolio.creditLines.utilizedMinor) : "$0.00";
  el("riskUtilizationRate").textContent = portfolio
    ? utilizationLabel(portfolio.creditLines.utilizedMinor, portfolio.creditLines.limitMinor)
    : "0% utilization";
  el("riskExposureOutstanding").textContent = portfolio ? usdMinorToMoney(portfolio.obligations.outstandingPrincipalMinor) : "$0.00";
  el("riskOpenObligations").textContent = `${portfolio?.obligations.openCount ?? 0} open Obligation${portfolio?.obligations.openCount === 1 ? "" : "s"}`;
  el("riskAdverseObligations").textContent = portfolio
    ? String(portfolio.obligations.overdueCount + portfolio.obligations.defaultedCount)
    : "0";

  const subjects = portfolio?.subjects;
  el("riskSubjectsSummary").replaceChildren(...(subjects
    ? [
        riskSummaryItem("Active", subjects.activeCount),
        riskSummaryItem("Suspended", subjects.suspendedCount),
        riskSummaryItem("Pending", subjects.pendingCount),
        riskSummaryItem("Closed", subjects.closedCount)
      ]
    : [riskSummaryItem("Status", "Awaiting verified read")]));
  const creditLines = portfolio?.creditLines;
  el("riskCreditLinesSummary").replaceChildren(...(creditLines
    ? [
        riskSummaryItem("Approved", creditLines.approvedCount),
        riskSummaryItem("Frozen", creditLines.frozenCount),
        riskSummaryItem("Requested", creditLines.requestedCount),
        riskSummaryItem("Rejected", creditLines.rejectedCount)
      ]
    : [riskSummaryItem("Status", "Awaiting verified read")]));
  const obligations = portfolio?.obligations;
  el("riskObligationsSummary").replaceChildren(...(obligations
    ? [
        riskSummaryItem("Open", obligations.openCount),
        riskSummaryItem("Overdue", obligations.overdueCount),
        riskSummaryItem("Defaulted", obligations.defaultedCount),
        riskSummaryItem("Written off", obligations.writtenOffCount)
      ]
    : [riskSummaryItem("Status", "Awaiting verified read")]));

  const exposureRows = portfolio?.assetExposures?.map(riskAssetRow) ?? [];
  el("riskAssetRows").replaceChildren(...(exposureRows.length
    ? exposureRows
    : [emptyRow(portfolio ? "No asset exposure was returned for this portfolio." : "Load an authorized portfolio to inspect PII-free asset exposure.")]));
  el("riskAssetCoverage").textContent = portfolio
    ? `${portfolio.assetExposures.length} asset${portfolio.assetExposures.length === 1 ? "" : "s"}${portfolio.hasMoreAssetExposures ? " · capped view" : " · complete view"}`
    : "Not loaded";

  const health = riskOperations.health;
  const healthStatus = el("pilotHealthStatus");
  healthStatus.classList.remove("neutral", "warning");
  if (!riskOperations.healthCatalogAvailable) {
    healthStatus.textContent = "Operation unavailable";
    healthStatus.classList.add("warning");
  } else if (riskOperations.healthError) {
    healthStatus.textContent = "Access required";
    healthStatus.classList.add("warning");
  } else if (riskOperations.healthQueried && health) {
    healthStatus.textContent = titleize(health.readiness.stage);
  } else {
    healthStatus.textContent = "Not loaded";
    healthStatus.classList.add("neutral");
  }
  el("pilotHealthHelper").textContent = riskOperations.healthHelper;
  el("pilotHealthHelper").classList.toggle("error", riskOperations.healthError);
  el("pilotHealthIntentCount").textContent = String(health?.funnel.intentCount ?? 0);
  el("pilotHealthOfferConversion").textContent = `${bpsToPercent(health?.conversionBps.offer ?? 0)} offered`;
  el("pilotHealthAcceptedCount").textContent = String(health?.funnel.acceptedIntentCount ?? 0);
  el("pilotHealthAcceptanceConversion").textContent = `${bpsToPercent(health?.conversionBps.acceptance ?? 0)} of applications`;
  el("pilotHealthExecutedCount").textContent = String(health?.funnel.executedIntentCount ?? 0);
  el("pilotHealthExecutionConversion").textContent = `${bpsToPercent(health?.conversionBps.execution ?? 0)} of applications`;
  el("pilotHealthRepaidCount").textContent = String(health?.funnel.repaidIntentCount ?? 0);
  el("pilotHealthRepaymentConversion").textContent = `${bpsToPercent(health?.conversionBps.repayment ?? 0)} started repayment`;
  el("pilotHealthFullyRepaidCount").textContent = String(health?.funnel.fullyRepaidIntentCount ?? 0);
  el("pilotHealthFullRepaymentConversion").textContent = `${bpsToPercent(health?.conversionBps.fullRepayment ?? 0)} completed`;
  const humanIntentCount = health?.entryModes.humanIntentCount ?? 0;
  const agentIntentCount = health?.entryModes.agentIntentCount ?? 0;
  el("pilotHealthHumanCount").textContent = `${humanIntentCount} application${humanIntentCount === 1 ? "" : "s"}`;
  el("pilotHealthAgentCount").textContent = `${agentIntentCount} application${agentIntentCount === 1 ? "" : "s"}`;
  el("pilotHealthDualNative").textContent = health?.readiness.dualNativeObserved ? "Observed" : "Waiting";
  el("pilotHealthPositions").textContent = health
    ? `${health.positions.obligationCount} total · ${health.positions.openPositionCount} open`
    : "0 total · 0 open";

  const feedback = riskOperations.feedback;
  const feedbackStatus = el("pilotFeedbackSummaryStatus");
  feedbackStatus.classList.remove("neutral", "warning");
  if (!riskOperations.feedbackCatalogAvailable) {
    feedbackStatus.textContent = "Operation unavailable";
    feedbackStatus.classList.add("warning");
  } else if (riskOperations.feedbackError) {
    feedbackStatus.textContent = "Access required";
    feedbackStatus.classList.add("warning");
  } else if (riskOperations.feedbackBusy) {
    feedbackStatus.textContent = "Aggregating";
    feedbackStatus.classList.add("neutral");
  } else if (riskOperations.feedbackQueried && feedback) {
    feedbackStatus.textContent = feedback.totalCount > 0 ? "Signals verified" : "Ready for signals";
  } else {
    feedbackStatus.textContent = "Not loaded";
    feedbackStatus.classList.add("neutral");
  }
  el("pilotFeedbackSummaryHelper").textContent = riskOperations.feedbackHelper;
  el("pilotFeedbackSummaryHelper").classList.toggle("error", riskOperations.feedbackError);
  el("pilotFeedbackSummaryTotal").textContent = String(feedback?.totalCount ?? 0);
  el("pilotFeedbackSummaryModes").textContent = `${feedback?.entryModes.humanCount ?? 0} / ${feedback?.entryModes.agentCount ?? 0}`;
  el("pilotFeedbackSummaryCompleted").textContent = String(feedback?.outcomes.completedCount ?? 0);
  el("pilotFeedbackSummarySupport").textContent = String(feedback?.outcomes.needsSupportCount ?? 0);
  el("pilotFeedbackSummaryBlocked").textContent = String(feedback?.sentiments.blockedCount ?? 0);
  el("pilotFeedbackSummaryTopBlocker").textContent = pilotFeedbackTopBlocker(feedback);

  const queueReady = riskOperations.queueCatalogAvailable;
  const queueStatus = el("servicingQueueStatus");
  queueStatus.classList.remove("neutral", "warning");
  if (!queueReady) {
    queueStatus.textContent = "Operation unavailable";
    queueStatus.classList.add("warning");
  } else if (riskOperations.queueError) {
    queueStatus.textContent = "Access required";
    queueStatus.classList.add("warning");
  } else if (riskOperations.queueQueried) {
    queueStatus.textContent = riskOperations.queueCases.length > 0 ? "Review ready" : "Queue clear";
  } else {
    queueStatus.textContent = "Not loaded";
    queueStatus.classList.add("neutral");
  }
  el("servicingQueueHelper").textContent = riskOperations.queueHelper;
  el("servicingQueueHelper").classList.toggle("error", riskOperations.queueError);
  el("servicingQueueRows").replaceChildren(...(riskOperations.queueCases.length
    ? riskOperations.queueCases.map(servicingQueueRow)
    : [emptyRow(riskOperations.queueQueried
        ? "No adverse Obligations match this verified queue filter."
        : "Load an authorized queue to review trusted-time delinquency and default cases.")]));
  el("servicingQueueCaseCount").textContent = String(riskOperations.queueCases.length);
  el("servicingQueueCriticalCount").textContent = String(
    riskOperations.queueCases.filter((item) => item.priority === "critical").length
  );
  const visiblePastDue = riskOperations.queueCases.reduce(
    (sum, item) => sum + asBigInt(item.pastDueTotalMinor),
    0n
  );
  el("servicingQueuePastDue").textContent = usdMinorToMoney(visiblePastDue.toString());
  el("servicingQueueAsOf").textContent = riskOperations.queueAsOf
    ? privateDate(riskOperations.queueAsOf, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
  el("servicingQueueCoverage").textContent = riskOperations.queueQueried
    ? `${riskOperations.queueCases.length} visible case${riskOperations.queueCases.length === 1 ? "" : "s"}${riskOperations.queueHasMore ? " · more available" : " · end of verified queue"}`
    : "No verified queue loaded.";

  const queueId = tenantInputValue("servicingQueueId");
  el("servicingQueueId").disabled = riskOperations.queueBusy;
  el("servicingQueueClassification").disabled = riskOperations.queueBusy;
  const queueLoadButton = el("loadServicingQueueBtn");
  queueLoadButton.disabled = riskOperations.queueBusy || !queueReady || !exactResourceId(queueId);
  queueLoadButton.toggleAttribute("aria-busy", riskOperations.queueBusy);
  const queueMoreButton = el("loadMoreServicingQueueBtn");
  queueMoreButton.hidden = !riskOperations.queueHasMore;
  queueMoreButton.disabled = riskOperations.queueBusy || !riskOperations.queueNextCursor;
  queueMoreButton.toggleAttribute("aria-busy", riskOperations.queueBusy);

  const portfolioId = tenantInputValue("riskPortfolioId");
  el("riskPortfolioId").disabled = riskOperations.busy;
  el("loadRiskPortfolioBtn").disabled = riskOperations.busy || !catalogReady || !exactResourceId(portfolioId);
  el("loadRiskPortfolioBtn").toggleAttribute("aria-busy", riskOperations.busy);

  const subjectId = tenantInputValue("riskFreezeSubjectId");
  const reasonCode = el("riskFreezeReason").value;
  const acknowledged = el("riskFreezeAcknowledge").checked;
  const freezeButton = el("freezeRiskSubjectBtn");
  el("riskFreezeSubjectId").disabled = riskOperations.freezeBusy;
  el("riskFreezeReason").disabled = riskOperations.freezeBusy;
  el("riskFreezeAcknowledge").disabled = riskOperations.freezeBusy;
  freezeButton.disabled = riskOperations.freezeBusy || !riskOperations.freezeCatalogAvailable ||
    !exactResourceId(subjectId) || !PROTECTIVE_REASON_CODES.has(reasonCode) || !acknowledged;
  freezeButton.toggleAttribute("aria-busy", riskOperations.freezeBusy);
  el("riskFreezeHelper").textContent = riskOperations.freezeHelper;
  el("riskFreezeHelper").classList.toggle("error", riskOperations.freezeError);
  const freezeStatus = el("riskFreezeStatus");
  freezeStatus.hidden = !riskOperations.freezeResult;
  freezeStatus.textContent = riskOperations.freezeResult
    ? `${riskOperations.freezeResult.subjectId} · ${titleize(riskOperations.freezeResult.previousStatus)} → Suspended · ${titleize(riskOperations.freezeResult.reasonCode)}`
    : "";
}

async function loadPilotHealth({ quiet = false } = {}) {
  if (riskOperations.healthBusy || !riskOperations.healthCatalogAvailable) return;
  const portfolioId = tenantInputValue("riskPortfolioId");
  if (!exactResourceId(portfolioId)) return;
  riskOperations.healthBusy = true;
  riskOperations.healthError = false;
  riskOperations.healthHelper = "Verifying recent MFA and aggregating durable lifecycle facts…";
  renderRiskOperations();
  try {
    const result = await tenantApi("pilotReadPilotHealth", {
      resource: { resourceType: "risk_portfolio", resourceId: portfolioId },
      payload: {},
      idempotent: false
    });
    riskOperations.health = result.response;
    riskOperations.healthQueried = true;
    riskOperations.healthHelper = "Verified from Tenant-scoped PostgreSQL facts. No identifiers, PII, or third-party analytics were returned.";
    if (!quiet) {
      toast("Pilot lifecycle health loaded");
      announce(riskOperations.healthHelper);
    }
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    riskOperations.health = null;
    riskOperations.healthQueried = false;
    riskOperations.healthError = true;
    riskOperations.healthHelper = nonEnumerating
      ? "Risk, Operations, or Auditor access with recent MFA is required."
      : `Pilot health query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    if (!quiet) {
      toast(riskOperations.healthHelper, "error");
      announce(riskOperations.healthHelper);
    }
  } finally {
    riskOperations.healthBusy = false;
    renderRiskOperations();
  }
}

async function loadPilotFeedbackSummary({ quiet = false } = {}) {
  if (riskOperations.feedbackBusy || !riskOperations.feedbackCatalogAvailable) return;
  const portfolioId = tenantInputValue("riskPortfolioId");
  if (!exactResourceId(portfolioId)) return;
  riskOperations.feedbackBusy = true;
  riskOperations.feedbackError = false;
  riskOperations.feedbackHelper = "Verifying recent MFA and aggregating closed categorical signals…";
  renderRiskOperations();
  try {
    const result = await tenantApi("pilotReadPilotFeedbackSummary", {
      resource: { resourceType: "risk_portfolio", resourceId: portfolioId },
      payload: {},
      idempotent: false
    });
    riskOperations.feedback = result.response;
    riskOperations.feedbackQueried = true;
    riskOperations.feedbackHelper = "Verified aggregate only. Identifiers, free text, PII, and third-party analytics are excluded.";
    if (!quiet) {
      toast("Design-partner feedback loaded");
      announce(riskOperations.feedbackHelper);
    }
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    riskOperations.feedback = null;
    riskOperations.feedbackQueried = false;
    riskOperations.feedbackError = true;
    riskOperations.feedbackHelper = nonEnumerating
      ? "Risk, Operations, or Auditor access with recent MFA is required."
      : `Pilot feedback query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    if (!quiet) {
      toast(riskOperations.feedbackHelper, "error");
      announce(riskOperations.feedbackHelper);
    }
  } finally {
    riskOperations.feedbackBusy = false;
    renderRiskOperations();
  }
}

async function loadRiskPortfolio({ quiet = false } = {}) {
  if (riskOperations.busy) return;
  const portfolioId = tenantInputValue("riskPortfolioId");
  if (!exactResourceId(portfolioId)) {
    riskOperations.error = true;
    riskOperations.helper = "Enter one valid portfolio ID with no spaces.";
    renderRiskOperations();
    announce(riskOperations.helper);
    return;
  }
  riskOperations.busy = true;
  riskOperations.error = false;
  riskOperations.helper = "Verifying Risk or Auditor access and loading aggregate exposure…";
  if (!quiet) riskOperations.portfolio = null;
  renderRiskOperations();
  try {
    const result = await tenantApi("pilotReadTenantRisk", {
      resource: { resourceType: "risk_portfolio", resourceId: portfolioId },
      payload: {},
      idempotent: false
    });
    riskOperations.portfolio = result.response;
    riskOperations.queried = true;
    riskOperations.helper = "Authorized point-in-time exposure loaded. No raw KYC or PII was returned.";
    // Keep authenticated Tenant reads sequential. The Gateway records and
    // revalidates each authorization decision transactionally; parallel reads
    // for the same exact portfolio can correctly conflict on that live audit
    // state even though every individual query is read-only.
    await loadPilotHealth({ quiet: true });
    await loadPilotFeedbackSummary({ quiet: true });
    if (!quiet) {
      toast("Tenant risk posture loaded");
      announce(riskOperations.helper);
    }
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    riskOperations.portfolio = null;
    riskOperations.queried = false;
    riskOperations.health = null;
    riskOperations.healthQueried = false;
    riskOperations.healthError = false;
    riskOperations.healthHelper = "Load the Tenant portfolio to verify the product funnel.";
    riskOperations.feedback = null;
    riskOperations.feedbackQueried = false;
    riskOperations.feedbackError = false;
    riskOperations.feedbackHelper = "Load the Tenant portfolio to aggregate feedback.";
    riskOperations.error = true;
    riskOperations.helper = nonEnumerating
      ? "Risk or Auditor access is required, or the portfolio is unavailable."
      : `Risk posture query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(riskOperations.helper, "error");
    announce(riskOperations.helper);
  } finally {
    riskOperations.busy = false;
    renderRiskOperations();
  }
}

async function loadServicingQueue({ append = false } = {}) {
  if (riskOperations.queueBusy) return;
  const queueId = tenantInputValue("servicingQueueId");
  const classification = el("servicingQueueClassification").value;
  if (!exactResourceId(queueId)) {
    riskOperations.queueError = true;
    riskOperations.queueHelper = "Enter one valid queue ID with no spaces.";
    renderRiskOperations();
    announce(riskOperations.queueHelper);
    return;
  }
  if (
    append &&
    (queueId !== riskOperations.queueId || classification !== riskOperations.queueClassification)
  ) {
    riskOperations.queueError = true;
    riskOperations.queueHelper = "Queue ID or stage changed. Load the first page again.";
    renderRiskOperations();
    announce(riskOperations.queueHelper);
    return;
  }

  riskOperations.queueBusy = true;
  riskOperations.queueError = false;
  riskOperations.queueHelper = append
    ? "Verifying the next stable queue page…"
    : "Verifying Risk or Operations access, recent MFA, and Tenant scope…";
  if (!append) {
    riskOperations.queueQueried = false;
    riskOperations.queueCases = [];
    riskOperations.queueNextCursor = null;
    riskOperations.queueHasMore = false;
  }
  renderRiskOperations();
  try {
    const result = await tenantApi("pilotReadServicingQueue", {
      resource: { resourceType: "servicing_queue", resourceId: queueId },
      payload: {
        ...(classification === "all" ? {} : { classifications: [classification] }),
        limit: 25,
        ...(append && riskOperations.queueNextCursor
          ? { cursor: riskOperations.queueNextCursor }
          : {})
      },
      idempotent: false
    });
    const incoming = result.response.cases;
    const existingIds = new Set(riskOperations.queueCases.map((item) => item.obligationId));
    if (append && incoming.some((item) => existingIds.has(item.obligationId))) {
      throw new Error("servicing_queue_page_overlap");
    }
    riskOperations.queueCases = append
      ? [...riskOperations.queueCases, ...incoming]
      : incoming;
    riskOperations.queueId = queueId;
    riskOperations.queueClassification = classification;
    riskOperations.queueNextCursor = result.response.page.nextCursor ?? null;
    riskOperations.queueHasMore = result.response.page.hasMore;
    riskOperations.queueAsOf = result.response.asOf;
    riskOperations.queueQueried = true;
    riskOperations.queueHelper = incoming.length === 0 && !append
      ? "Authorized queue loaded. No adverse Obligations match this stage."
      : "Authorized PII-free cases loaded in deterministic severity order.";
    toast(append ? "Next servicing page loaded" : "Servicing queue loaded");
    announce(riskOperations.queueHelper);
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    if (!append) {
      riskOperations.queueQueried = false;
      riskOperations.queueCases = [];
      riskOperations.queueNextCursor = null;
      riskOperations.queueHasMore = false;
      riskOperations.queueAsOf = null;
    }
    riskOperations.queueError = true;
    riskOperations.queueHelper = nonEnumerating
      ? "Risk or Operations access is required, or the queue is unavailable."
      : `Servicing queue query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(riskOperations.queueHelper, "error");
    announce(riskOperations.queueHelper);
  } finally {
    riskOperations.queueBusy = false;
    renderRiskOperations();
  }
}

async function freezeRiskSubject() {
  if (riskOperations.freezeBusy) return;
  const subjectId = tenantInputValue("riskFreezeSubjectId");
  const reasonCode = el("riskFreezeReason").value;
  if (!exactResourceId(subjectId) || !PROTECTIVE_REASON_CODES.has(reasonCode) || !el("riskFreezeAcknowledge").checked) {
    riskOperations.freezeError = true;
    riskOperations.freezeHelper = "Enter one exact Agent Subject, select an approved protective reason, and confirm the suspension.";
    renderRiskOperations();
    announce(riskOperations.freezeHelper);
    return;
  }
  riskOperations.freezeBusy = true;
  riskOperations.freezeError = false;
  riskOperations.freezeResult = null;
  riskOperations.freezeHelper = "Verifying step-up authority and recording the protective suspension…";
  renderRiskOperations();
  try {
    const result = await tenantApi("pilotFreezeSubject", {
      resource: { resourceType: "subject", resourceId: subjectId },
      payload: {},
      reasonCode,
      idempotent: true
    });
    riskOperations.freezeResult = result.response;
    riskOperations.freezeHelper = "Protective suspension verified and recorded with immutable Evidence.";
    el("riskFreezeAcknowledge").checked = false;
    toast("Agent Subject frozen");
    announce(riskOperations.freezeHelper);
    if (riskOperations.portfolio) await loadRiskPortfolio({ quiet: true });
  } catch (error) {
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    riskOperations.freezeError = true;
    riskOperations.freezeHelper = nonEnumerating
      ? "Risk or Operations authority is required, or the Agent Subject is unavailable."
      : `Protective command failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(riskOperations.freezeHelper, "error");
    announce(riskOperations.freezeHelper);
  } finally {
    riskOperations.freezeBusy = false;
    renderRiskOperations();
  }
}

function renderRuntime() {
  if (!el("requestLog")) return;
  const architecture = createArchitectureCapabilityPresentation(serverCatalogSnapshot);
  const agentManifest = currentAgentPilotCapabilityPacket();
  el("runtimeBaseUrl").textContent = window.location.origin;
  el("runtimeTenantOperationCount").textContent =
    architecture.available
      ? `${architecture.operationCount} catalogued operations`
      : "Catalog unavailable";
  el("runtimeProtocolVersion").textContent = architecture.protocolVersion;
  el("runtimeAgentWorkflowCount").textContent =
    `${agentManifest.workflows.length} checked-in workflows`;
  el("runtimeAgentToolCount").textContent =
    `${agentManifest.mcp.toolCount} checked-in stdio tools`;
  el("sdkSnippet").textContent = `import { IpoOneAgentMcpClient } from "@ipo-one/sdk";

const agent = new IpoOneAgentMcpClient({
  handle: localMcpHost.handle,
  manifest: applicationHandoff,
  transportProfile: "mcp_stdio_local"
});

const receipt = await agent.runCreditOfferWorkflow({
  creditRequest,
  workflowId: "design-partner-application-0001"
});`;
  el("runtimeSessionId").textContent = tenantPilot.connected
    ? "Authenticated"
    : "No active session";
  el("lastRequestId").textContent = lastRequestId ?? "None";
  el("requestLogCount").textContent = `${requestLog.length} request${requestLog.length === 1 ? "" : "s"}`;
  if (requestLog.length === 0) {
    el("requestLog").replaceChildren(emptyRow("API requests will appear in this session log."));
    return;
  }
  el("requestLog").replaceChildren(
    ...requestLog.map((request) => {
      const row = document.createElement("div");
      const method = document.createElement("span");
      const path = document.createElement("span");
      const status = document.createElement("span");
      const requestId = document.createElement("span");
      row.className = "request-row";
      method.className = "method";
      method.textContent = request.method;
      path.textContent = request.path;
      status.className = request.status >= 400 ? "status-error" : "status-ok";
      status.textContent = String(request.status);
      requestId.className = "request-id";
      requestId.textContent = request.requestId ?? "-";
      row.append(method, path, status, requestId);
      return row;
    })
  );
}

function render() {
  renderAuditorEvidence();
  renderRiskOperations();
  renderTradingCapital();
  renderRuntime();
  renderTenantPilot();
}

function bindActions() {
  el("accessBtn").addEventListener("click", openAccess);
  el("walletPermissionsAccessBtn").addEventListener("click", openAccess);
  el("accessCloseBtn").addEventListener("click", closeAccess);
  el("accessScrim").addEventListener("click", closeAccess);
  el("googleSignInBtn").addEventListener("click", () => beginOidcSignIn("google"));
  el("emailSignInBtn").addEventListener("click", () => beginOidcSignIn("email"));
  el("walletSignInBtn").addEventListener("click", () => connectApprovedNetwork({ authenticate: true }));
  el("connectNetworkBtn").addEventListener("click", () => connectApprovedNetwork());
  el("walletProviderList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-wallet-provider-id]");
    if (button) selectWalletProvider(button.dataset.walletProviderId);
  });
  for (const button of document.querySelectorAll("[data-wallet-chain]")) {
    button.addEventListener("click", () => {
      accessState.selectedChainId = Number(button.dataset.walletChain);
      renderAccess();
    });
  }
  document.addEventListener("keydown", handleAccessKeys);
  window.addEventListener("online", () => {
    walletAuthorityLifecycle.retryInvalidation().catch(() => {
      // Network recovery never restores authority; the lifecycle remains quarantined.
    });
  });
  window.addEventListener("pagehide", disposeWalletProviders, { once: true });
  walletProviderRegistry.start();
  for (const button of document.querySelectorAll(".nav-item")) {
    button.addEventListener("click", () => showView(button.dataset.view));
  }
  for (const button of document.querySelectorAll("[data-go-view]")) {
    button.addEventListener("click", () => showView(button.dataset.goView));
  }
  for (const button of document.querySelectorAll("[data-scroll-target]")) {
    button.addEventListener("click", () => {
      const target = el(button.dataset.scrollTarget);
      target?.closest("details")?.setAttribute("open", "");
      focusJumpTarget(target);
    });
  }
  for (const button of [el("humanGuidePrimaryBtn"), el("humanGuideSecondaryBtn"), el("humanHeroPrimaryBtn")]) {
    button.addEventListener("click", () => runHumanGuideAction(button.dataset.humanGuideAction));
  }
  for (const button of document.querySelectorAll("[data-agent-guide-action]")) {
    button.addEventListener("click", () => runAgentGuideAction(button.dataset.agentGuideAction));
  }
  el("mobileMenuBtn").addEventListener("click", () => setNavigationOpen(true));
  el("sidebarCloseBtn").addEventListener("click", () => setNavigationOpen(false));
  el("sidebarScrim").addEventListener("click", () => setNavigationOpen(false));
  el("operatorModeBtn").addEventListener("click", () => {
    setMode("human");
    showView("request-credit");
  });
  el("agentModeBtn").addEventListener("click", () => {
    setMode("agent");
    showView("overview");
  });
  for (const button of [
    el("privatePortfolioPrimaryBtn"),
    el("privatePortfolioSecondaryBtn"),
    el("privateCreditPrimaryBtn"),
    el("privatePaymentsPrimaryBtn"),
    el("privateEvidencePrimaryBtn")
  ]) {
    button.addEventListener("click", () => openPrivateProductAction(button.dataset.privateAction));
  }
  el("authenticatedRuntimeGateAction").addEventListener("click", openAccess);
  el("capitalNetworkQueryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadCapitalNetworkIntent();
  });
  el("capitalNetworkAcknowledgeBtn").addEventListener(
    "click",
    acknowledgeCapitalNetworkIntent
  );
  el("tradingCapitalQueryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadTradingCapitalFacility();
  });
  el("tradingCapitalLoadEvidenceBtn").addEventListener("click", () =>
    loadTradingCapitalFacility({ evidence: true })
  );
  el("tradingCapitalRequestCloseBtn").addEventListener(
    "click",
    requestTradingCapitalClose
  );
  el("tradingCapitalIssueProofBtn").addEventListener(
    "click",
    issueTradingCapitalProof
  );
  const tradingCapitalTabs = [
    ...document.querySelectorAll("[data-trading-capital-view]")
  ];
  const selectTradingCapitalTab = (button, { focus = false } = {}) => {
      tradingCapitalPilot.activeView = button.dataset.tradingCapitalView;
      renderTradingCapital();
      if (focus) button.focus();
      announce(`${button.textContent} Trading Capital view selected`);
  };
  for (const [index, button] of tradingCapitalTabs.entries()) {
    button.addEventListener("click", () => selectTradingCapitalTab(button));
    button.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % tradingCapitalTabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex =
          (index - 1 + tradingCapitalTabs.length) %
          tradingCapitalTabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tradingCapitalTabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      selectTradingCapitalTab(tradingCapitalTabs[nextIndex], { focus: true });
    });
  }
  el("tradingCapitalFacilityId").addEventListener("input", () => {
    if (
      tradingCapitalPilot.facility?.tradingFacilityId ===
      tenantInputValue("tradingCapitalFacilityId")
    ) {
      return;
    }
    tradingCapitalPilot.facility = null;
    tradingCapitalPilot.closeRequest = null;
    tradingCapitalPilot.settlement = null;
    tradingCapitalPilot.performanceProof = null;
    tradingCapitalPilot.evidence = null;
    tradingCapitalPilot.error = false;
    tradingCapitalPilot.helper =
      "Enter one exact bound ID. Denied, missing, and cross-Tenant resources remain non-enumerating.";
    renderTradingCapital();
  });
  el("capitalNetworkTransferIntentId").addEventListener("input", () => {
    const loadedId = capitalNetworkPilot.providerView?.transferIntentId;
    if (loadedId === tenantInputValue("capitalNetworkTransferIntentId")) {
      renderCapitalNetwork();
      return;
    }
    capitalNetworkPilot.providerView = null;
    capitalNetworkPilot.acknowledgement = null;
    capitalNetworkPilot.error = false;
    capitalNetworkPilot.helper =
      "Enter one exact assigned ID. Missing, expired, denied, and cross-Provider resources are not enumerated.";
    renderCapitalNetwork();
  });
  el("createHumanSubjectBtn").addEventListener("click", createHumanSubject);
  el("createHumanConsentBtn").addEventListener("click", createHumanConsent);
  el("humanCreditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    requestAndEvaluateHumanCredit();
  });
  el("pilotFeedbackForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitPilotFeedback();
  });
  el("officialReportCreateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    createOfficialReport();
  });
  el("officialReportAccessForm").addEventListener("submit", (event) => {
    event.preventDefault();
    readOfficialReport();
  });
  el("retrieveOfficialReportBtn").addEventListener("click", retrieveOfficialReport);
  el("revokeOfficialReportBtn").addEventListener("click", revokeOfficialReport);
  el("officialReportId").addEventListener("input", () => {
    if (
      officialReportPilot.report?.officialReportId !==
      tenantInputValue("officialReportId")
    ) {
      officialReportPilot.report = null;
      officialReportPilot.retrievedAt = null;
      officialReportPilot.error = false;
      officialReportPilot.helper =
        "Every read and retrieval revalidates active same-Tenant ownership. Expired or revoked artifacts are unavailable.";
    }
    renderOfficialReportPilot();
  });
  el("creditPassportIssueForm").addEventListener("submit", (event) => {
    event.preventDefault();
    issueCreditPassportArtifact();
  });
  el("creditPassportReadForm").addEventListener("submit", (event) => {
    event.preventDefault();
    readOwnedCreditPassportArtifact();
  });
  el("creditPassportVerifyForm").addEventListener("submit", (event) => {
    event.preventDefault();
    verifyBoundCreditPassportArtifact();
  });
  el("revokeCreditPassportBtn").addEventListener(
    "click",
    revokeOwnedCreditPassportArtifact
  );
  for (const control of el("creditPassportIssueForm").querySelectorAll("input, select")) {
    control.addEventListener("input", renderCreditPassportPilot);
    control.addEventListener("change", renderCreditPassportPilot);
  }
  for (const control of [
    el("creditPassportArtifactId"),
    el("creditPassportVerifyArtifactId"),
    el("creditPassportVerifyHash"),
    el("creditPassportVerifyVersion")
  ]) {
    control.addEventListener("input", renderCreditPassportPilot);
  }
  for (const control of el("pilotFeedbackForm").querySelectorAll("select")) {
    control.addEventListener("change", () => {
      normalizePilotFeedbackControls({
        changed: control.id === "pilotFeedbackSentiment"
          ? "sentiment"
          : control.id === "pilotFeedbackOutcome"
            ? "outcome"
            : undefined
      });
      pilotFeedback.submitted = null;
      pilotFeedback.error = false;
      pilotFeedback.helper = "Ready to record one immutable categorical receipt for this Human Subject.";
      renderPilotFeedback();
    });
  }
  el("humanOfferAcknowledge").addEventListener("change", renderTenantPilot);
  el("acceptHumanOfferBtn").addEventListener("click", acceptHumanCreditOffer);
  el("newHumanApplicationBtn").addEventListener("click", startAnotherHumanApplication);
  el("executeHumanObligationBtn").addEventListener("click", executeHumanSandboxObligation);
  el("postHumanRepaymentBtn").addEventListener("click", postHumanSandboxRepayment);
  el("postServicingRepaymentBtn").addEventListener("click", () => postHumanSandboxRepayment({
    amountInputId: "servicingRepaymentAmount",
    sourceInputId: "servicingRepaymentSource",
    buttonId: "postServicingRepaymentBtn"
  }));
  el("ownedObligationRestore").addEventListener("submit", (event) => {
    event.preventDefault();
    loadOwnedObligation();
  });
  el("refreshOwnedPositionsBtn").addEventListener("click", refreshOwnedPositionIndex);
  el("obligationPortfolioRefreshBtn").addEventListener(
    "click",
    refreshOwnedPositionIndex
  );
  el("ownedPositionList").addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("button[data-obligation-id]")
      : null;
    if (!button || !el("ownedPositionList").contains(button)) return;
    const obligationId = button.dataset.obligationId ?? "";
    if (!exactResourceId(obligationId)) return;
    el("ownedObligationId").value = obligationId;
    loadOwnedObligation({ obligationId });
  });
  el("obligationPortfolioList").addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("button[data-obligation-id]")
      : null;
    if (!button || !el("obligationPortfolioList").contains(button)) return;
    const obligationId = button.dataset.obligationId ?? "";
    if (!exactResourceId(obligationId)) return;
    el("ownedObligationId").value = obligationId;
    loadOwnedObligation({ obligationId });
  });
  el("obligationDetailRefreshBtn").addEventListener("click", () => {
    const obligationId = tenantPilot.obligation?.obligationId;
    if (obligationId) loadOwnedObligation({ obligationId });
  });
  el("obligationDetailEvidenceBtn").addEventListener("click", () => {
    loadOwnedEvidence();
  });
  el("obligationDetailRepayBtn").addEventListener("click", () => {
    showView("repay-settle");
    requestAnimationFrame(() => focusJumpTarget(el("servicingCasePanel")));
    announce("Selected Obligation repayment workspace opened");
  });
  el("ownedObligationId").addEventListener("input", renderTenantPilot);
  el("servicingRepaymentAmount").addEventListener("input", () => {
    el("humanRepaymentAmount").value = el("servicingRepaymentAmount").value;
    renderPrivateProductSurfaces();
  });
  el("servicingRepaymentSource").addEventListener("change", () => {
    el("humanRepaymentSource").value = el("servicingRepaymentSource").value;
    renderPrivateProductSurfaces();
  });
  el("humanRepaymentSource").addEventListener("change", () => {
    el("servicingRepaymentSource").value = el("humanRepaymentSource").value;
  });
  el("humanRepaymentAmount").addEventListener("input", () => {
    el("servicingRepaymentAmount").value = el("humanRepaymentAmount").value;
    renderPrivateProductSurfaces();
  });
  el("openServicingEvidenceBtn").addEventListener("click", () => openPrivateProductAction(
    interactionMode === "human" ? "human-evidence" : "agent-api"
  ));
  el("loadOwnedEvidenceBtn").addEventListener("click", () => loadOwnedEvidence());
  el("loadMoreOwnedEvidenceBtn").addEventListener("click", () => loadOwnedEvidence({ append: true }));
  el("ownedEvidenceRows").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-evidence-hash]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.evidenceHash);
      toast("Evidence hash copied");
      announce("Owned Evidence hash copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("auditorEvidenceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadAuditorEvidence();
  });
  el("loadMoreAuditorEvidenceBtn").addEventListener("click", () => loadAuditorEvidence({ append: true }));
  el("auditorEvidenceObligationId").addEventListener("input", () => {
    if (auditorEvidence.obligationId === tenantInputValue("auditorEvidenceObligationId")) return;
    auditorEvidence.queried = false;
    auditorEvidence.obligationId = null;
    auditorEvidence.items = [];
    auditorEvidence.nextCursor = null;
    auditorEvidence.hasMore = false;
    auditorEvidence.asOf = null;
    auditorEvidence.error = false;
    auditorEvidence.helper = "Enter an exact Obligation ID. Access is verified by the private Gateway.";
    renderAuditorEvidence();
  });
  el("auditorEvidenceRows").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-evidence-hash]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.evidenceHash);
      toast("Evidence hash copied");
      announce("Evidence hash copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("riskPortfolioForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadRiskPortfolio();
  });
  el("riskPortfolioId").addEventListener("input", () => {
    if (riskOperations.portfolio?.portfolioId === tenantInputValue("riskPortfolioId")) return;
    riskOperations.queried = false;
    riskOperations.portfolio = null;
    riskOperations.health = null;
    riskOperations.healthQueried = false;
    riskOperations.healthError = false;
    riskOperations.healthHelper = "Load the Tenant portfolio to verify the product funnel.";
    riskOperations.feedback = null;
    riskOperations.feedbackQueried = false;
    riskOperations.feedbackError = false;
    riskOperations.feedbackHelper = "Load the Tenant portfolio to aggregate feedback.";
    riskOperations.error = false;
    riskOperations.helper = "Enter one exact portfolio ID. Catalog presence does not grant access; the Gateway verifies every read.";
    renderRiskOperations();
  });
  el("servicingQueueForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadServicingQueue();
  });
  el("loadMoreServicingQueueBtn").addEventListener("click", () => {
    loadServicingQueue({ append: true });
  });
  for (const control of [el("servicingQueueId"), el("servicingQueueClassification")]) {
    control.addEventListener("input", () => {
      riskOperations.queueQueried = false;
      riskOperations.queueId = null;
      riskOperations.queueCases = [];
      riskOperations.queueNextCursor = null;
      riskOperations.queueHasMore = false;
      riskOperations.queueAsOf = null;
      riskOperations.queueError = false;
      riskOperations.queueHelper = "Risk or Operations access and recent phishing-resistant MFA are verified on every read.";
      renderRiskOperations();
    });
  }
  el("riskFreezeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    freezeRiskSubject();
  });
  for (const control of [el("riskFreezeSubjectId"), el("riskFreezeReason"), el("riskFreezeAcknowledge")]) {
    control.addEventListener("input", () => {
      riskOperations.freezeResult = null;
      riskOperations.freezeError = false;
      riskOperations.freezeHelper = "Risk or Operations authority is verified only when the command is submitted.";
      renderRiskOperations();
    });
  }
  for (const input of [el("humanSubjectId"), el("humanConsentId")]) {
    input.addEventListener("input", () => {
      tenantPilot.intent = null;
      tenantPilot.decision = null;
      tenantPilot.offer = null;
      tenantPilot.receipt = null;
      tenantPilot.offerReview = null;
      resetHumanObligationWorkflow();
      el("humanOfferAcknowledge").checked = false;
      renderTenantPilot();
    });
  }
  for (const control of [
    el("humanCreditAmount"),
    el("humanCreditTerm"),
    el("humanInstallments"),
    el("humanCreditPurpose"),
    el("humanRepaymentFrequency")
  ]) {
    control.addEventListener(
      control instanceof HTMLSelectElement ? "change" : "input",
      renderTenantPilot
    );
  }
  el("copyHumanReceiptBtn").addEventListener("click", async () => {
    if (!tenantPilot.receipt) return toast("Complete a verified Human credit workflow first.", "error");
    const receipt = tenantPilot.obligationReceipt ?? tenantPilot.receipt;
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      if (tenantPilot.obligationReceipt) {
        toast("Human lifecycle receipt copied");
        announce("Human sandbox Obligation lifecycle receipt copied without credentials or funds authority");
      } else {
        toast("Non-authorizing Human Workflow Receipt copied");
        announce("Human Workflow Receipt copied without credentials or funds authority");
      }
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("humanDecisionPassportProof").addEventListener("toggle", (event) => {
    announce(event.currentTarget.open ? "Decision proof expanded" : "Decision proof collapsed");
  });
  el("copyDecisionPassportBtn").addEventListener("click", async () => {
    const decision = tenantPilot.decision;
    if (!tenantPilot.receipt || !hasVerifiedHumanDecisionPassport(decision)) {
      return toast("Complete a verified Decision Passport first.", "error");
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(decision.decisionPassport, null, 2));
      toast("Decision Passport copied");
      announce("Non-authorizing Decision Passport copied without credentials or funds authority");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("agentAuthorityForm").addEventListener("submit", (event) => event.preventDefault());
  el("createPrivateAgentSubjectBtn").addEventListener("click", createPrivateAgentSubject);
  el("createAccountChallengeBtn").addEventListener("click", createAgentAccountChallenge);
  el("refreshAccountBindingBtn").addEventListener("click", refreshAgentAccountBinding);
  el("copyAccountChallengeBtn").addEventListener("click", async () => {
    if (!agentAuthorityPilot.accountChallenge) return toast("Create a signing request first.", "error");
    try {
      await navigator.clipboard.writeText(JSON.stringify(agentAuthorityPilot.accountChallenge, null, 2));
      toast("EIP-712 proof request copied for the registered Agent workload");
      announce("Account proof signing request copied without credentials");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("downloadAccountChallengeBtn").addEventListener("click", () => {
    if (!agentAuthorityPilot.accountChallenge) return toast("Create a signing request first.", "error");
    const body = JSON.stringify(agentAuthorityPilot.accountChallenge, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ipo-one-agent-account-challenge.json";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Agent proof request downloaded");
    announce("Submit the downloaded request with the registered local Agent Host");
  });
  el("createDraftMandateBtn").addEventListener("click", createDraftAgentMandate);
  el("loadMandateBtn").addEventListener("click", loadAgentMandate);
  el("activateMandateBtn").addEventListener("click", activateExactAgentMandate);
  el("principalMandateAcknowledge").addEventListener("change", renderTenantPilot);
  el("agentAuthoritySubjectId").addEventListener("input", () => {
    if (agentAuthorityPilot.subject?.subjectId !== tenantInputValue("agentAuthoritySubjectId")) {
      agentAuthorityPilot.subject = null;
      agentAuthorityPilot.accountChallenge = null;
      agentAuthorityPilot.accountBinding = null;
    }
    if (agentAuthorityPilot.mandate?.subjectId !== tenantInputValue("agentAuthoritySubjectId")) {
      agentAuthorityPilot.mandate = null;
      agentAuthorityPilot.activationEvidenceHash = null;
      el("principalMandateAcknowledge").checked = false;
    }
    renderTenantPilot();
  });
  for (const input of [el("agentAccountChain"), el("agentAccountAddress"), el("agentAccountPurpose")]) {
    input.addEventListener("input", () => {
      agentAuthorityPilot.accountChallenge = null;
      renderTenantPilot();
    });
  }
  el("agentAuthorityMandateId").addEventListener("input", () => {
    if (agentAuthorityPilot.mandate?.mandateId !== tenantInputValue("agentAuthorityMandateId")) {
      agentAuthorityPilot.mandate = null;
      agentAuthorityPilot.activationEvidenceHash = null;
      el("principalMandateAcknowledge").checked = false;
    }
    renderTenantPilot();
  });

  el("createAgentBtn").addEventListener("click", () => {
    tenantPilot.connected ? openPrincipalAgentAuthority() : openAccess();
  });
  el("copySdkBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el("sdkSnippet").textContent);
      toast("SDK example copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("copyMcpHandoffBtn").addEventListener("click", async () => {
    const handoff = currentAgentMcpHandoffPacket();
    if (!handoff) return toast("Load an eligible draft or active sandbox Mandate first.", "error");
    try {
      await navigator.clipboard.writeText(el("mcpHandoffPacket").textContent);
      const label = handoff.status === "application_ready" ? "Application" : "Runtime";
      toast(`${label} capability packet copied`);
      announce(`${label} capability packet copied without credentials or funds authority`);
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("downloadMcpHandoffBtn").addEventListener("click", () => {
    const handoff = currentAgentMcpHandoffPacket();
    if (!handoff) return toast("Load an eligible draft or active sandbox Mandate first.", "error");
    const body = JSON.stringify(handoff, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = handoff.status === "application_ready"
      ? "ipo-one-agent-application-handoff.json"
      : "ipo-one-agent-runtime-handoff.json";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`${handoff.status === "application_ready" ? "Application" : "Runtime"} handoff downloaded`);
    announce("Credential-free Agent handoff downloaded for the local no-funds runtime");
  });
  el("agentConsoleCopyManifestBtn").addEventListener("click", async () => {
    const presentation = currentAgentConsolePresentation();
    if (!presentation?.registry.catalogParity || presentation.status === "waiting") {
      return toast("Load an eligible exact handoff with 11/11 catalog parity first.", "error");
    }
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(currentAgentPilotCapabilityPacket(), null, 2)
      );
      toast("Agent capability manifest copied");
      announce("Non-authorizing Agent capability manifest copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("agentConsoleDownloadHandoffBtn").addEventListener("click", () => {
    const presentation = currentAgentConsolePresentation();
    const handoff = currentAgentMcpHandoffPacket();
    if (!handoff || !presentation?.registry.catalogParity) {
      return toast("Load an eligible exact handoff with 11/11 catalog parity first.", "error");
    }
    const body = JSON.stringify(handoff, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = handoff.status === "application_ready"
      ? "ipo-one-agent-application-handoff.json"
      : "ipo-one-agent-runtime-handoff.json";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Credential-free Agent handoff downloaded");
  });
  el("agentConsoleCopySdkBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el("agentConsoleSdkSnippet").textContent);
      toast("Local Agent SDK example copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("returnToAgentAuthorityBtn").addEventListener("click", openPrincipalAgentAuthority);
  window.addEventListener("hashchange", () => showView(location.hash.slice(1), { updateHash: false }));
  mobileNavigation.addEventListener("change", () => {
    document.body.classList.remove("nav-open");
    syncNavigationAccessibility();
  });
  document.addEventListener("keydown", handleNavigationKeys);
  syncNavigationAccessibility();
}

async function boot() {
  bindActions();
  renderAccess();
  el("runtimeBaseUrl").textContent = window.location.origin;
  showView(location.hash.slice(1) || "overview", { focus: false, updateHash: false });
  renderTenantPilot();
  renderAuditorEvidence();
  renderRiskOperations();
  await probeAccessOptions();
  await probeTenantPilot();
  setConnection(tenantPilot.connected);
  render();
  announce(tenantPilot.connected
    ? "Authenticated closed-pilot workspace ready"
    : "Sign in to access the closed-pilot workspace");
}

boot();
