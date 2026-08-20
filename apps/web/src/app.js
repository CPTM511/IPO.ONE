import {
  createApplicationReadyAgentHandoffManifest,
  createAwaitingAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "./agent-handoff-manifest.js";
import { createAgentPilotCapabilityManifest } from "./agent-pilot-capability-manifest.js";
import { createAgentConsolePresentation } from "./agent-console-presentation.js";
import {
  deriveAgentLifecycleNextAction,
  selectExactAgentContinuation
} from "./agent-lifecycle-next-action.js";
import {
  createAccessSupportDiagnostic,
  createAuthenticationAvailabilityPresentation
} from "./authentication-availability-presentation.js";
import { createCapitalNetworkPresentation } from "./capital-network-presentation.js";
import { createCapitalPartnerPresentation } from "./capital-partner-presentation.js";
import {
  capitalPartnerApplicationLabel,
  chooseCapitalPartnerApplication,
  createCapitalPartnerInboxSelection,
  createCapitalPartnerWorkspaceSelection,
  sameCapitalPartnerApplication
} from "./capital-partner-workspace-selection.js";
import {
  TRADING_CAPITAL_OPERATION_IDS,
  TRADING_CAPITAL_VIEW_DEFINITIONS,
  createTradingCapitalProductPresentation
} from "./trading-capital-product-presentation.js";
import {
  compactDecisionProofHash,
  compactEvmAddress,
  createHumanDecisionPassportPresentation,
  hasVerifiedHumanDecisionPassport
} from "./decision-passport-presentation.js";
import {
  createCreditPassportPresentation,
  selectedCreditPassportClaims
} from "./credit-passport-presentation.js";
import { createEvidenceReceiptPresentation } from "./evidence-receipt-presentation.js";
import {
  createBoundedOwnedEvidenceProjection,
  hasOwnedEvidenceMarker,
  newestOwnedEvidenceFirst,
  ownedEvidenceVerificationState,
  retainMatchingEvidenceAnchors
} from "./owned-evidence-presentation.js";
import { createHumanCreditOfferWorkflowReceipt } from "./human-credit-offer-workflow-receipt.js";
import { createHumanSandboxObligationWorkflowReceipt } from "./human-sandbox-obligation-workflow-receipt.js";
import {
  assertRequestCreditReviewCurrent,
  assertRecoveredHumanCreditReviewUnchanged,
  createRecoveredHumanCreditReviewBinding,
  createRequestCreditReviewBinding,
  evaluateRequestCreditReviewBinding
} from "./request-credit-review-binding.js";
import { createRiskOperationsPresentation } from "./risk-operations-presentation.js";
import { selectRiskWorkspaceReference } from "./risk-workspace-selection.js";
import { createServicingCasePresentation } from "./servicing-case-presentation.js";
import {
  SERVICING_POSITION_INDEX_LIMIT,
  acceptServicingPositionRefresh,
  createServicingPositionIndex
} from "./servicing-position-index.js";
import { createObligationPortfolioPresentation } from "./obligation-portfolio-presentation.js";
import {
  humanWorkspaceAccess,
  principalWorkspaceAccess,
  shouldRecoverAuthenticatedWorkspace
} from "./principal-workspace-access.js";
import { selectPrincipalAgentWorkspace } from "./principal-agent-workspace-selection.js";
import {
  canonicalWorkspaceView,
  workspaceSurfaceAccess,
  workspaceViewCatalog
} from "./workspace-surface-access.js";
import {
  createPostLoginViewIntent,
  readPostLoginViewIntent,
  resolveWorkspaceLocation
} from "./workspace-navigation.js";
import { createWalletAuthorityLifecycle } from "./wallet-authority-lifecycle.js";
import { createWalletProviderRegistry } from "./wallet-provider-registry.js";
import { releaseSelectedWallet } from "./wallet-sign-out.js";
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

const VIEW_DEFINITIONS = workspaceViewCatalog();
const VIEW_META = Object.fromEntries(
  Object.entries(VIEW_DEFINITIONS).map(([viewId, definition]) => [
    viewId,
    { eyebrow: definition.eyebrow, title: definition.pageTitle }
  ])
);

let currentView = "overview";
let interactionMode = "human";
let humanNewApplicationMode = false;
let authenticatedDataEpoch = 0;
let tenantPilotProbeOwner = null;
let tenantPilotProbePromise = null;
let tenantPilotProbeSerial = 0;
let riskRequestSerial = 0;
const riskRequestOwners = {
  catalog: null,
  recovery: null,
  portfolio: null,
  health: null,
  feedback: null,
  insights: null,
  queue: null
};
let requestLog = [];
let lastRequestId;
let serverCatalogOperations = new Set();
let serverCatalogSnapshot = null;
let explicitWalletReleaseInProgress = false;
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
    "Use the exact TransferIntent ID from your Provider assignment or invitation. This page cannot search for assignments; missing, expired, denied, and cross-Provider resources are not enumerated.",
  error: false
};
const capitalPartnerPilot = {
  selfAvailable: false,
  inboxAvailable: false,
  authorAvailable: false,
  transitionAvailable: false,
  portfolioAvailable: false,
  facilityAvailable: false,
  busy: false,
  refreshBusy: false,
  offer: null,
  profile: null,
  portfolio: null,
  presentation: null,
  recoveryEpoch: 0,
  recoveryState: "loading",
  applications: [],
  selectedApplication: null,
  helper:
    "Restoring your Partner Profile and borrower-authorized applications from server truth.",
  portfolioHelper:
    "Portfolio values come from canonical Offer, Obligation, servicing, repayment, and Evidence projections.",
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
    "Use the Facility ID returned by an authorized Trading Capital API/SDK workflow. This page does not create or discover Facilities; denied, missing, and cross-Tenant resources remain non-enumerating."
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
  workspaceSelection: null,
  subject: null,
  accountChallenge: null,
  accountBinding: null,
  mandate: null,
  activationEvidenceHash: null
};
const agentOnlinePilot = {
  busy: false,
  error: false,
  offerReceipt: null,
  applicationResult: null,
  acceptanceResult: null,
  executionResult: null,
  repaymentResult: null,
  evidenceResult: null,
  runtimeResult: null,
  helper:
    "Create a verified Agent Subject and Draft Mandate first. The external Agent uses its own credential; this Principal browser reads only durable server truth."
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
const OWNED_EVIDENCE_DISPLAY_LIMIT = 50;
const OWNED_EVIDENCE_DEFAULT_HELPER =
  "Load the redacted PostgreSQL Evidence for this exact Obligation. Evidence digests are integrity checks, not blockchain transactions.";
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
  expectedMarker: null,
  queryEpoch: 0,
  helper: OWNED_EVIDENCE_DEFAULT_HELPER,
  error: false
};
const CREDIT_STATE_DEFAULT_HELPER =
  "Load the durable, outcome-derived Credit State for this exact owned Subject. It is qualitative, non-authorizing, and cannot change a limit automatically.";
const creditStatePilot = {
  catalogAvailable: false,
  busy: false,
  queried: false,
  subjectId: null,
  projection: null,
  asOf: null,
  helper: CREDIT_STATE_DEFAULT_HELPER,
  error: false
};
const evidenceAnchorPilot = {
  available: false,
  busy: false,
  config: null,
  obligationId: null,
  items: [],
  helper:
    "Every durable Evidence hash requires a verified Base Sepolia transaction.",
  error: false
};
const creditRegistryEvidence = {
  catalogAvailable: false,
  busy: false,
  queried: false,
  authorizationHash: null,
  response: null,
  helper:
    "Enter one exact public authorization hash. The authenticated Gateway returns only the bounded synthetic Base Sepolia observation.",
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
    "Complete a current Decision first. IPO.ONE supplies the Subject and application; you supply only the exact verifier.",
  artifactHelper: "No artifact is trusted until an authenticated server read succeeds.",
  verificationHelper:
    "Verification requires the exact authenticated verifier, current same-Tenant Membership, purpose, hash, version, source, and trusted server time.",
  error: false
};
const riskOperations = {
  portfolioReferenceCatalogAvailable: false,
  queueReferenceCatalogAvailable: false,
  readCatalogAvailable: false,
  healthCatalogAvailable: false,
  feedbackCatalogAvailable: false,
  queueCatalogAvailable: false,
  freezeCatalogAvailable: false,
  catalogBusy: false,
  recoveryBusy: false,
  recoveryEpoch: 0,
  portfolioSelection: Object.freeze({ status: "loading", resourceId: null }),
  queueSelection: Object.freeze({ status: "loading", resourceId: null }),
  busy: false,
  healthBusy: false,
  feedbackBusy: false,
  queueBusy: false,
  freezeBusy: false,
  queried: false,
  portfolio: null,
  health: null,
  healthQueried: false,
  healthHelper: "Load supporting insights after the Tenant portfolio is restored.",
  healthError: false,
  feedback: null,
  feedbackQueried: false,
  feedbackHelper: "Load supporting insights after the Tenant portfolio is restored.",
  feedbackError: false,
  helper: "Restoring the authorized Tenant portfolio from authenticated server truth.",
  error: false,
  freezeResult: null,
  freezeSubjectSelection: null,
  freezeHelper: "Risk or Operations authority is verified only when the command is submitted.",
  freezeError: false,
  queueQueried: false,
  queueId: null,
  queueClassification: "all",
  queueCases: [],
  queueNextCursor: null,
  queueHasMore: false,
  queueAsOf: null,
  queueHelper: "Restoring the authorized servicing queue from authenticated server truth.",
  queueError: false
};
const executionWalletPilot = {
  catalogAvailable: false,
  busy: false,
  error: false,
  connectedAccountId: null,
  bindings: [],
  activeBinding: null,
  capabilities: null,
  grant: null,
  targetPolicies: [],
  execution: null,
  helper:
    "Sign in to IPO.ONE first. Wallet connection and AccountBinding never replace authentication.",
  executionHelper:
    "Connect and bind an execution account. Current local runtime can prepare Evidence but cannot submit a transaction or move funds."
};
const AUTHENTICATED_BROWSER_STATE_BASELINES = new Map([
  [tenantPilot, structuredClone(tenantPilot)],
  [capitalNetworkPilot, structuredClone(capitalNetworkPilot)],
  [capitalPartnerPilot, structuredClone(capitalPartnerPilot)],
  [tradingCapitalPilot, structuredClone(tradingCapitalPilot)],
  [pilotFeedback, structuredClone(pilotFeedback)],
  [agentAuthorityPilot, structuredClone(agentAuthorityPilot)],
  [agentOnlinePilot, structuredClone(agentOnlinePilot)],
  [auditorEvidence, structuredClone(auditorEvidence)],
  [ownedEvidence, structuredClone(ownedEvidence)],
  [creditStatePilot, structuredClone(creditStatePilot)],
  [creditRegistryEvidence, structuredClone(creditRegistryEvidence)],
  [officialReportPilot, structuredClone(officialReportPilot)],
  [creditPassportPilot, structuredClone(creditPassportPilot)],
  [riskOperations, structuredClone(riskOperations)],
  [executionWalletPilot, structuredClone(executionWalletPilot)]
]);
const PROTECTIVE_REASON_CODES = new Set([
  "credential_compromise",
  "operator_request",
  "provider_failure",
  "reconciliation_failure",
  "risk_limit_breach",
  "security_incident",
  "stop_loss_triggered"
]);

function clearRiskCatalogAvailability() {
  riskOperations.portfolioReferenceCatalogAvailable = false;
  riskOperations.queueReferenceCatalogAvailable = false;
  riskOperations.readCatalogAvailable = false;
  riskOperations.healthCatalogAvailable = false;
  riskOperations.feedbackCatalogAvailable = false;
  riskOperations.queueCatalogAvailable = false;
  riskOperations.freezeCatalogAvailable = false;
}

function invalidateRiskRequestOwners(lanes = Object.keys(riskRequestOwners)) {
  riskRequestSerial += 1;
  for (const lane of lanes) riskRequestOwners[lane] = null;
}

function beginRiskRequest(lane) {
  const owner = Object.freeze({
    lane,
    serial: ++riskRequestSerial,
    authenticatedDataEpoch
  });
  riskRequestOwners[lane] = owner;
  return owner;
}

function isCurrentRiskRequest(owner) {
  return Boolean(owner) &&
    riskRequestOwners[owner.lane] === owner &&
    owner.authenticatedDataEpoch === authenticatedDataEpoch;
}

function finishRiskRequest(owner) {
  if (!isCurrentRiskRequest(owner)) return false;
  riskRequestOwners[owner.lane] = null;
  return true;
}

function invalidateTenantPilotProbe() {
  tenantPilotProbeOwner = null;
  tenantPilotProbePromise = null;
}
const mobileNavigation = window.matchMedia("(max-width: 900px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const OWNED_OBLIGATION_SESSION_KEY = "ipo-one-owned-obligation-id.v1";
const AGENT_OFFER_RECEIPT_SESSION_KEY =
  "ipo-one-agent-offer-receipt.v1";
const HUMAN_SUBJECT_STORAGE_KEY = "ipo-one-human-subject-id.v1";
const HUMAN_CONSENT_STORAGE_KEY = "ipo-one-human-consent-id.v1";
const POST_LOGIN_VIEW_INTENT_SESSION_KEY = "ipo-one-post-login-view-intent.v1";
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
  optionsState: "checking",
  optionsBusy: false,
  optionsErrorCode: null,
  optionsRequestId: null,
  optionsObservedAt: null,
  authEnabled: false,
  authenticationProfile: null,
  providers: new Set(),
  walletAuthenticationEnabled: false,
  sessionActive: false,
  sessionAuthenticationMethod: null,
  localSessionSignedOut: false,
  selectedChainId: 84532,
  connectedChainId: null,
  walletAddress: null,
  walletProviderStatus: "discovering",
  walletProviders: [],
  selectedWalletProviderId: null,
  pendingWorkspaceBootstrap: false,
  busy: false,
  lastFocused: null,
  helper: "Checking available sign-in methods…"
};
const economicActionConfirmation = {
  pending: null,
  resolve: null,
  busy: false,
  lastFocused: null
};
let walletProviderEventCleanup = () => {};
let walletAuthoritySnapshot;
let walletAuthorityChannel;

function walletAuthorityBroadcastChannel() {
  if (typeof globalThis.BroadcastChannel !== "function") return undefined;
  try {
    walletAuthorityChannel = new globalThis.BroadcastChannel(
      "ipo-one-wallet-authority-v1"
    );
    return walletAuthorityChannel;
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
  accessState.sessionAuthenticationMethod = null;
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
    purgeAuthenticatedBrowserState({
      reason: "Wallet context changed. Private browser state was cleared."
    });
    setConnection(false);
    renderAccess();
    render();
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
  executionWalletPilot.connectedAccountId = null;
  executionWalletPilot.helper =
    "Execution wallet context changed. The IPO.ONE login session and durable AccountBinding were not changed.";
  if (
    accessState.sessionActive !== true ||
    accessState.sessionAuthenticationMethod !== "siwe"
  ) {
    renderAccess();
    return Promise.resolve(Object.freeze({
      authenticationSessionChanged: false,
      executionAccountDisconnected: true,
      reasonCode
    }));
  }
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

function forgetOpaqueId(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Manual exact-ID entry remains available when browser storage is disabled.
  }
}

function rememberPostLoginViewIntent() {
  try {
    const intent = createPostLoginViewIntent(
      currentWorkspaceName(),
      currentView,
      Date.now()
    );
    sessionStorage.setItem(
      POST_LOGIN_VIEW_INTENT_SESSION_KEY,
      JSON.stringify(intent)
    );
  } catch {
    forgetPostLoginViewIntent();
  }
}

function forgetPostLoginViewIntent() {
  try {
    sessionStorage.removeItem(POST_LOGIN_VIEW_INTENT_SESSION_KEY);
  } catch {
    // This short-lived presentation locator never participates in authority.
  }
}

function consumePostLoginViewIntent() {
  let encoded;
  try {
    encoded = sessionStorage.getItem(POST_LOGIN_VIEW_INTENT_SESSION_KEY);
  } catch {
    return null;
  }
  forgetPostLoginViewIntent();
  if (!encoded || encoded.length > 512) return null;
  try {
    return readPostLoginViewIntent(
      currentWorkspaceName(),
      JSON.parse(encoded),
      { now: Date.now() }
    );
  } catch {
    return null;
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

function renderOidcProviders(providers) {
  const list = el("oidcMethodList");
  list.replaceChildren(
    ...providers.map((provider) => {
      const button = document.createElement("button");
      const identity = document.createElement("span");
      const label = document.createElement("strong");
      const detail = document.createElement("small");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      button.type = "button";
      button.className = "access-method-button";
      button.dataset.authProvider = provider.providerId;
      button.disabled = accessState.busy || accessState.optionsBusy;
      label.textContent = provider.label;
      detail.textContent = provider.detail;
      identity.append(label, detail);
      icon.setAttribute("aria-hidden", "true");
      use.setAttribute("href", "/icons.svg#chevron-right");
      icon.append(use);
      button.append(identity, icon);
      return button;
    })
  );
}

function renderAccess() {
  const selected = SUPPORTED_WALLET_CHAINS[accessState.selectedChainId];
  const connected = SUPPORTED_WALLET_CHAINS[accessState.connectedChainId];
  const walletAuthority = walletAuthoritySnapshot ?? walletAuthorityLifecycle.getSnapshot();
  const authenticated = accessState.sessionActive === true;
  const walletSession =
    authenticated && accessState.sessionAuthenticationMethod === "siwe";
  const workspaceVerified = tenantPilot.connected === true;
  const workspaceRoleMismatch = hasWorkspaceSessionRoleMismatch();
  const privateWorkspaceVisible = authenticated && workspaceVerified;
  const localSessionEnded =
    accessState.authenticationProfile === "local_no_funds" &&
    accessState.localSessionSignedOut;
  const availability = createAuthenticationAvailabilityPresentation({
    optionsState: accessState.optionsState,
    optionsBusy: accessState.optionsBusy,
    oidcAuthenticationEnabled: accessState.authEnabled,
    oidcProviderIds: [...accessState.providers],
    walletAuthenticationEnabled: accessState.walletAuthenticationEnabled,
    walletProviderState: accessState.walletProviderStatus,
    walletProviderCount: accessState.walletProviders.length,
    selectedWalletProvider: accessState.selectedWalletProviderId !== null,
    walletAuthorityState: walletAuthority.status,
    walletAuthorityCanRetry: walletAuthority.canRetryInvalidation,
    authenticated,
    walletSession,
    localSessionEnded
  });
  const waiting = accessState.busy || accessState.optionsBusy;
  renderOidcProviders(availability.oidcProviders);
  el("walletSignInBtn").hidden = !availability.showWalletSignIn;
  el("walletSignInBtn").disabled = waiting;
  el("walletSignInBtn").querySelector("strong").textContent = walletSession
    ? "Reconnect session wallet"
    : "Connect & sign in with wallet";
  el("walletSignInBtn").querySelector("small").textContent = walletSession
    ? "Connect the selected wallet for an exact sandbox confirmation"
    : "One-use SIWE signature · no transaction or fee";
  el("accessNetworkPanel").hidden = !availability.showNetworks;
  el("accessDialogGrid").classList.toggle("methods-only", !availability.showNetworks);
  el("walletProviderPicker").hidden = !availability.showWalletPicker;
  el("walletUnavailablePanel").hidden = !availability.showWalletRediscovery;
  el("rediscoverWalletsBtn").disabled = waiting;
  el("walletAuthorityRecoveryPanel").hidden = !availability.showWalletAuthorityRetry;
  el("retryWalletAuthorityBtn").disabled = waiting;
  el("accessRecoveryPanel").hidden = !availability.showOptionsRetry;
  const optionsFailed = availability.recoveryKind === "options_failed";
  el("accessRecoveryTitle").textContent = optionsFailed
    ? "Sign-in check needs attention"
    : "No sign-in method is enabled";
  el("accessRecoveryCopy").textContent = optionsFailed
    ? "Check the server again or share a privacy-safe diagnostic through your original invitation channel."
    : "Check again after your invitation administrator updates access for this workspace.";
  el("retryAccessOptionsBtn").disabled = accessState.optionsBusy;
  el("retryAccessOptionsBtn").setAttribute("aria-busy", String(accessState.optionsBusy));
  el("accessSupportPanel").hidden = !availability.showAccessDiagnostics;
  el("copyAccessDiagnosticBtn").disabled = accessState.optionsBusy;
  const diagnostic = currentAccessDiagnostic();
  el("accessDiagnosticError").textContent = diagnostic.errorCode;
  el("accessDiagnosticRequest").textContent = diagnostic.requestId;
  el("accessDiagnosticObserved").textContent = diagnostic.observedAt;
  el("accessAuthStatus").textContent = availability.recoveryKind === "none"
    ? accessState.helper || availability.status
    : availability.status;
  el("walletAddressStatus").textContent = shortWalletAddress(accessState.walletAddress);
  el("walletNetworkStatus").textContent = connected
    ? `${connected.name} connected`
    : `${selected.name} selected`;
  const accessButtonLabel = authenticated
    ? workspaceRoleMismatch
      ? "Switch role"
      : accessState.pendingWorkspaceBootstrap
      ? "Finish sign-in"
      : "Signed in"
    : "Sign in";
  el("accessButtonLabel").textContent = accessButtonLabel;
  el("accessBtn").setAttribute("aria-label", accessButtonLabel);
  el("accessBtn").title = accessButtonLabel;
  el("accessBtn").classList.toggle("authenticated", authenticated);
  document.body.classList.toggle(
    "private-session-closed",
    !privateWorkspaceVisible
  );
  document.body.classList.toggle("authenticated-session-present", authenticated);
  document.body.classList.toggle("workspace-session-active", privateWorkspaceVisible);
  const privacyShield = el("signedOutPrivacyShield");
  privacyShield.hidden = authenticated;
  el("signedOutPrivacyTitle").textContent = "Choose how you want to use IPO.ONE";
  el("signedOutPrivacyCopy").textContent = localSessionEnded
    ? "The previous account session, wallet connection, and private browser state were cleared. Sign in once to open a verified workspace."
    : "Sign in once, then continue in the exact workspace available on this host or use the versioned API.";
  el("signedOutPrivacyAction").hidden = !availability.showSignedOutPrimaryAction;
  el("signedOutPrivacyAction").disabled = accessState.optionsBusy;
  el("topbarSignOutBtn").hidden = !authenticated;
  el("topbarSignOutBtn").disabled =
    accessState.busy ||
    accessState.pendingWorkspaceBootstrap ||
    !tenantCsrfToken();
  el("accessSessionPanel").hidden = !authenticated && !localSessionEnded;
  el("accessMethodPanel").hidden =
    localSessionEnded || (authenticated && !walletSession);
  el("accessMethodStep").textContent = walletSession ? "Session" : "Step 1";
  el("signInMethodTitle").textContent = walletSession
    ? "Reconnect the session wallet"
    : "Choose how to sign in";
  el("signInMethodCopy").textContent = walletSession
    ? "Select and connect the wallet again before an exact sandbox confirmation. The server session remains authoritative."
    : "One secure session across the Human and Agent workspaces.";
  el("accessDialogGrid").classList.toggle(
    "session-active",
    authenticated || localSessionEnded
  );
  el("accessTitleLead").textContent = authenticated
    ? workspaceRoleMismatch
      ? "Role switch required."
      : "Signed in."
    : localSessionEnded
      ? "Signed out."
      : "Sign in. Connect.";
  el("accessTitleEmphasis").textContent = "Stay in control.";
  el("accessCopy").textContent = localSessionEnded
    ? "The local host session ended and authenticated product operations are blocked. Start a fresh local no-funds session only when you are ready to continue."
    : workspaceRoleMismatch
      ? `This page requires the ${expectedWorkspaceLabel()} role. End the current ${workspaceKindLabel(tenantPilot.workspaceKind)} session, then sign in again on this workspace.`
    : authenticated
      ? "Your server session is separate from wallet connection, credit authority, and funds authority. Continue to the workspace or sign out explicitly."
      : "IPO.ONE shows only sign-in methods verified for this host and this browser. Authentication proves identity; Principal and Mandate rules still decide what you can do.";
  el("accessSessionTitle").textContent = localSessionEnded
    ? "Local session ended"
    : workspaceRoleMismatch
      ? "Workspace role does not match"
    : accessState.pendingWorkspaceBootstrap
      ? "Authentication verified"
      : workspaceVerified
        ? "Workspace session verified"
        : "You are signed in";
  el("accessSessionCopy").textContent = localSessionEnded
    ? "No authenticated operation is available in this page. Reloading explicitly provisions a fresh synthetic local session; it does not restore funds or credit authority."
    : workspaceRoleMismatch
      ? `The browser is signed in as ${workspaceKindLabel(tenantPilot.workspaceKind)}, while this page requires ${expectedWorkspaceLabel()}. Switching signs out the current role and requires a fresh wallet signature.`
    : accessState.pendingWorkspaceBootstrap
      ? "Wallet authentication succeeded. Continue once to reload the protected shell and bind its CSRF-protected workspace session."
      : workspaceVerified
        ? "Tenant identity, role, policy, and CSRF bindings are verified. Product state comes from the authenticated protocol."
        : "Your host-only authentication session is active. Workspace availability still depends on your server-side role and approved operations.";
  el("continueAuthenticatedSessionBtn").textContent = localSessionEnded
    ? "Start fresh local session"
    : workspaceRoleMismatch
      ? `Switch to ${expectedWorkspaceLabel()} session`
    : accessState.pendingWorkspaceBootstrap
      ? "Finish sign-in"
      : "Continue to workspace";
  el("signOutBtn").hidden = !authenticated;
  el("signOutBtn").disabled =
    accessState.busy ||
    accessState.pendingWorkspaceBootstrap ||
    !tenantCsrfToken();
  renderWalletProviders();
  for (const button of document.querySelectorAll("[data-wallet-chain]")) {
    const chainId = Number(button.dataset.walletChain);
    button.disabled = waiting;
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
  const connector = walletProviderRegistry.getSelectedConnector();
  if (!connector) return;
  const accountsChanged = () => {
    handleMaterialWalletContextChange("wallet_account_changed");
  };
  const chainChanged = () => {
    handleMaterialWalletContextChange("wallet_chain_changed");
  };
  const disconnected = () => {
    handleMaterialWalletContextChange("wallet_provider_disconnected");
  };
  const removers = [
    connector.subscribeAccountChanges(accountsChanged),
    connector.subscribeChainChanges(chainChanged),
    connector.subscribeDisconnect(disconnected)
  ];
  walletProviderEventCleanup = () => removers.forEach((remove) => remove());
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
      if (previousProviderId !== null && !explicitWalletReleaseInProgress) {
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
  walletAuthorityChannel?.close();
  walletAuthorityChannel = undefined;
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

function closeAccess({ restoreFocus = true } = {}) {
  el("accessLayer").hidden = true;
  document.body.classList.remove("access-open");
  syncNavigationAccessibility();
  if (restoreFocus) accessState.lastFocused?.focus?.();
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
  const dialog = el("accessLayer").querySelector(".access-dialog");
  const focusable = [
    ...dialog.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled)")
  ].filter((control) =>
    !control.hidden &&
    control.getAttribute("aria-hidden") !== "true" &&
    control.getClientRects().length > 0
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (event.shiftKey && document.activeElement === first) {
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
    error.requestId = response.headers.get("x-request-id") ?? undefined;
    throw error;
  }
  return payload;
}

async function probeAccessOptions() {
  if (accessState.optionsBusy) return false;
  accessState.optionsBusy = true;
  accessState.optionsState = "checking";
  accessState.optionsErrorCode = null;
  accessState.optionsRequestId = null;
  accessState.optionsObservedAt = new Date().toISOString();
  accessState.authEnabled = false;
  accessState.providers = new Set();
  accessState.walletAuthenticationEnabled = false;
  renderAccess();
  try {
    const options = await authJson("/auth/v1/options");
    const authorityAvailable = walletAuthorityLifecycle.getSnapshot().status === "available";
    accessState.authenticationProfile =
      typeof options?.profile === "string" ? options.profile : null;
    accessState.localSessionSignedOut = false;
    accessState.authEnabled = options?.enabled === true;
    accessState.providers = new Set(Array.isArray(options?.oidcProviders) ? options.oidcProviders : []);
    accessState.walletAuthenticationEnabled = options?.walletAuthentication === true;
    accessState.optionsState = "ready";
    accessState.optionsObservedAt = new Date().toISOString();
    accessState.sessionAuthenticationMethod =
      options?.sessionActive === true &&
      new Set(["oidc_pkce_bff", "siwe"]).has(options?.sessionAuthenticationMethod)
        ? options.sessionAuthenticationMethod
        : null;
    accessState.sessionActive =
      authorityAvailable &&
      (options?.sessionActive === true || tenantPilot.connected);
    accessState.pendingWorkspaceBootstrap = false;
    if (authorityAvailable) {
      accessState.helper = accessState.sessionActive
        ? "Secure session active. You can connect either approved test network."
        : accessState.providers.size > 0 || accessState.walletAuthenticationEnabled
          ? "Choose one sign-in method verified for this host and browser."
          : "Closed-pilot access is not enabled on this deployment. No product data is available without an authenticated session.";
    }
    return true;
  } catch (error) {
    accessState.authEnabled = false;
    accessState.providers = new Set();
    accessState.walletAuthenticationEnabled = false;
    accessState.authenticationProfile = null;
    accessState.sessionAuthenticationMethod = null;
    accessState.optionsState = "failed";
    accessState.optionsErrorCode = error?.code ?? "authentication_unavailable";
    accessState.optionsRequestId = error?.requestId ?? null;
    accessState.optionsObservedAt = new Date().toISOString();
    const authorityAvailable = walletAuthorityLifecycle.getSnapshot().status === "available";
    accessState.sessionActive = authorityAvailable && tenantPilot.connected;
    if (authorityAvailable) {
      accessState.helper = tenantPilot.connected
        ? "Private pilot session active. Connect an approved test network when needed."
        : "IPO.ONE could not verify sign-in availability. Check again or copy the access details for your invitation administrator.";
    }
    return false;
  } finally {
    accessState.checked = true;
    accessState.optionsBusy = false;
    renderAccess();
  }
}

async function retryAccessOptions() {
  if (accessState.optionsBusy) return;
  const recovered = await probeAccessOptions();
  if (recovered) {
    await probeTenantPilot();
    const firstAvailable = el("oidcMethodList").querySelector("button") ??
      el("walletProviderList").querySelector("button") ??
      (!el("rediscoverWalletsBtn").hidden ? el("rediscoverWalletsBtn") : null);
    firstAvailable?.focus();
    announce("Sign-in availability refreshed from the server");
  } else {
    el("retryAccessOptionsBtn").focus();
    announce("Sign-in availability is still unavailable; retry remains available");
  }
}

async function retryWalletAuthorityInvalidation() {
  if (
    accessState.busy ||
    walletAuthorityLifecycle.getSnapshot().status !== "unavailable"
  ) {
    return;
  }
  accessState.busy = true;
  renderAccess();
  try {
    const result = await walletAuthorityLifecycle.retryInvalidation();
    if (result.status !== "invalidated") {
      throw new Error("The secure session reset did not reach its confirmed state.");
    }
    announce("Secure session reset confirmed; fresh wallet sign-in is available");
    toast("Secure session reset confirmed");
  } catch {
    announce("Secure session reset is still unavailable; retry remains available");
    toast("Secure session reset is still unavailable", "error");
  } finally {
    accessState.busy = false;
    renderAccess();
  }
}

function rediscoverWalletProviders() {
  if (accessState.busy || accessState.optionsBusy) return;
  accessState.helper = "Checking this page again for compatible wallets…";
  walletProviderRegistry.rediscover();
  renderAccess();
}

function currentAccessDiagnostic() {
  return createAccessSupportDiagnostic({
    origin: window.location.origin,
    workspace: currentWorkspaceName(),
    optionsState: accessState.optionsState,
    errorCode: accessState.optionsErrorCode ?? (
      accessState.walletAuthenticationEnabled
        ? "wallet_provider_unavailable"
        : "sign_in_method_unavailable"
    ),
    requestId: accessState.optionsRequestId,
    walletProviderState: accessState.walletProviderStatus,
    walletProviderCount: accessState.walletProviders.length,
    observedAt: accessState.optionsObservedAt
  });
}

async function copyAccessDiagnostic() {
  const diagnostic = currentAccessDiagnostic();
  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
    accessState.helper = "Privacy-safe access details copied. Send them through your original IPO.ONE invitation channel.";
    announce("Privacy-safe access details copied");
    toast("Privacy-safe access details copied");
  } catch {
    accessState.helper = "Clipboard access is unavailable. Select the visible error and Request ID, then share them through your invitation channel.";
    announce("Access details could not be copied");
    toast("Access details could not be copied", "error");
  }
  renderAccess();
}

async function switchWalletChain(connector, chain) {
  return connector.switchChain(`eip155:${chain.chainId}`);
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
  const connector = walletProviderRegistry.getSelectedConnector();
  if (!connector) {
    accessState.helper = accessState.walletProviders.length > 0
      ? "Select one discovered wallet before requesting an account or network."
      : "No compatible EVM wallet was found. Install or open a browser wallet, then try again.";
    renderAccess();
    return;
  }
  if (authenticate) rememberPostLoginViewIntent();
  accessState.busy = true;
  accessState.helper = "Waiting for wallet approval…";
  renderAccess();
  try {
    const chain = SUPPORTED_WALLET_CHAINS[accessState.selectedChainId];
    const connection = await connector.connect({
      chainId: `eip155:${chain.chainId}`
    });
    const account = connection.accounts[0];
    const address = account?.address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
      throw new Error("The wallet did not return one valid EVM account.");
    }
    const connectedChainId = Number(connection.chainId.split(":")[1]);
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
      const signature = await connector.signMessage({
        accountId: account.accountId,
        message: challenge.message
      });
      walletAuthorityLifecycle.assertContextEpoch(walletChallengeEpoch);
      const authentication = await authJson("/auth/v1/wallet/verify", {
        method: "POST",
        body: { transactionHandle: challenge.handle, signature }
      });
      walletAuthorityLifecycle.assertContextEpoch(walletChallengeEpoch);
      accessState.sessionActive = true;
      accessState.sessionAuthenticationMethod =
        authentication?.authenticationMethod === "siwe" ? "siwe" : null;
      accessState.pendingWorkspaceBootstrap = true;
      accessState.helper = "Wallet sign-in complete. Your internal roles and Mandates remain server-controlled.";
      renderAccess();
      el("continueAuthenticatedSessionBtn").focus();
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
    accessState.helper = "That sign-in method is not enabled for this closed-pilot deployment.";
    renderAccess();
    return;
  }
  rememberPostLoginViewIntent();
  window.location.assign(`/auth/v1/login?provider=${encodeURIComponent(provider)}`);
}

function continueAuthenticatedSession() {
  if (hasWorkspaceSessionRoleMismatch()) {
    switchCurrentWorkspaceSession();
    return;
  }
  if (accessState.localSessionSignedOut) {
    window.location.reload();
    return;
  }
  if (!accessState.sessionActive) {
    openAccess();
    return;
  }
  if (accessState.pendingWorkspaceBootstrap) {
    window.location.reload();
    return;
  }
  closeAccess();
  el("mainContent").focus({ preventScroll: true });
  announce(tenantPilot.connected
    ? "Authenticated workspace ready"
    : "Signed-in session confirmed; workspace access remains server-controlled");
}

async function signOutAuthenticatedSession() {
  if (accessState.busy || !accessState.sessionActive) return;
  const csrfToken = tenantCsrfToken();
  if (!csrfToken) {
    accessState.helper = "Reload the protected workspace before signing out.";
    renderAccess();
    return;
  }
  accessState.busy = true;
  accessState.helper = "Signing out of the secure host session…";
  renderAccess();
  try {
    const result = await authJson("/auth/v1/logout", {
      method: "POST",
      headers: {
        "idempotency-key": tenantRequestToken("web_logout"),
        "x-csrf-token": csrfToken
      }
    });
    if (
      result?.schemaVersion !== "ipo_one_logout_result.v1" ||
      result?.status !== "logged_out"
    ) {
      throw new Error("The sign-out service returned an invalid result.");
    }
    const selectedWalletConnector = walletProviderRegistry.getSelectedConnector();
    const selectedWalletDescriptor = accessState.walletProviders.find(
      (item) => item.providerId === accessState.selectedWalletProviderId
    );
    accessState.sessionActive = false;
    accessState.sessionAuthenticationMethod = null;
    accessState.pendingWorkspaceBootstrap = false;
    accessState.localSessionSignedOut = false;
    tenantPilot.connected = false;
    renderAccess();
    clearWalletProviderEvents();
    explicitWalletReleaseInProgress = true;
    let walletRelease;
    try {
      walletRelease = await releaseSelectedWallet({
        connector: selectedWalletConnector,
        source: selectedWalletDescriptor?.source
      });
      walletProviderRegistry.clearSelection();
    } finally {
      explicitWalletReleaseInProgress = false;
    }
    purgeAuthenticatedBrowserState({
      clearAuthenticationBootstrap: true,
      clearWalletUi: true,
      reason: "Signed out. Account, wallet, and private browser state were cleared."
    });
    accessState.helper = walletRelease.status === "account_permission_revoked" ||
      walletRelease.status === "wallet_disconnected"
      ? "Signed out. The account session and wallet connection were released."
      : "Signed out. IPO.ONE cleared the account, wallet selection, and every private browser value.";
    setConnection(false);
    render();
    renderAccess();
    closeAccess({ restoreFocus: false });
    showView(workspaceSurfaceAccess(currentWorkspaceName()).defaultView, {
      focus: false,
      historyMode: "replace"
    });
    const signedOutAction = el("signedOutPrivacyAction").hidden
      ? el("accessBtn")
      : el("signedOutPrivacyAction");
    signedOutAction.focus({ preventScroll: true });
    announce("Signed out. Sign in again only when you are ready.");
  } catch (error) {
    accessState.helper = error?.message ?? "Sign out failed. The current session remains protected.";
  } finally {
    accessState.busy = false;
    renderAccess();
  }
}

async function continueToPrincipalWorkspace(event) {
  event?.preventDefault();
  const destination = localPrincipalWorkspaceUrl();
  if (!destination || accessState.busy) return;
  if (accessState.sessionActive) {
    await signOutAuthenticatedSession();
    if (accessState.sessionActive) return;
  }
  window.location.assign(destination);
}

async function switchCurrentWorkspaceSession() {
  if (accessState.busy) return;
  if (accessState.sessionActive) {
    await signOutAuthenticatedSession();
    if (accessState.sessionActive) return;
  }
  openAccess();
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
  finalityCell.dataset.label = "Evidence state";
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
  const authenticated = accessState.sessionActive === true;
  el("connectionChip").classList.toggle("offline", !online);
  el("connectionStatus").textContent = online
    ? "Secure session active"
    : authenticated
      ? "Signed in · workspace unavailable"
      : "Sign-in required";
  el("sidebarApiStatus").textContent = online ? "Authenticated" : "Locked";
}

function renderRuntimeGate() {
  const gate = el("authenticatedRuntimeGate");
  if (!gate) return;
  const connected = tenantPilot.connected;
  const authenticated = accessState.sessionActive === true;
  const workspaceRoleMismatch = hasWorkspaceSessionRoleMismatch();
  gate.hidden = !workspaceRoleMismatch && (!authenticated || connected);
  el("authenticatedRuntimeGateStatus").textContent = workspaceRoleMismatch
    ? `${expectedWorkspaceLabel()} session required`
    : connected
    ? "Authenticated workspace"
    : authenticated
      ? tenantPilot.connectionLabel
    : tenantPilot.checked
      ? tenantPilot.connectionLabel
      : "Verifying secure session";
  el("authenticatedRuntimeGateCopy").textContent = workspaceRoleMismatch
    ? `This ${currentWorkspaceName() === "controller" ? "Principal" : "Borrower"} workspace received a ${workspaceKindLabel(tenantPilot.workspaceKind)} session from another local port. Switch roles and sign in again; permissions will not be widened automatically.`
    : connected
    ? "Tenant identity, role, policy, and CSRF bindings were verified. All product state below comes from the authenticated protocol."
    : authenticated
      ? "Your authentication session is active, but this workspace still requires an eligible role, CSRF binding, and the approved Tenant operation catalog."
    : tenantPilot.checked
      ? "Sign in with an approved pilot account. IPO.ONE will not substitute public fixtures or browser state when the secure gateway is unavailable."
      : "Checking the authenticated Tenant catalog and browser session. No product operation is available until verification completes.";
  el("authenticatedRuntimeGateAction").hidden = !workspaceRoleMismatch;
  el("authenticatedRuntimeGateAction").textContent =
    `Switch to ${expectedWorkspaceLabel()} session`;
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

function closeEconomicActionConfirmation(result = null) {
  const resolve = economicActionConfirmation.resolve;
  const lastFocused = economicActionConfirmation.lastFocused;
  economicActionConfirmation.pending = null;
  economicActionConfirmation.resolve = null;
  economicActionConfirmation.busy = false;
  economicActionConfirmation.lastFocused = null;
  el("economicActionLayer").hidden = true;
  el("economicActionConfirmBtn").disabled = false;
  el("economicActionConfirmBtn").removeAttribute("aria-busy");
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
  if (resolve) resolve(result);
}

function cancelPendingEconomicAction() {
  if (!economicActionConfirmation.pending || economicActionConfirmation.busy) return;
  closeEconomicActionConfirmation(null);
}

function handleEconomicActionKeys(event) {
  if (el("economicActionLayer").hidden || event.key !== "Escape") return;
  event.preventDefault();
  cancelPendingEconomicAction();
}

function requestEconomicActionConfirmation({
  actionType,
  title,
  resourceId,
  resourceHash,
  payloadHash,
  requestId,
  effect
}) {
  if (economicActionConfirmation.resolve) {
    return Promise.reject(new Error("Another action confirmation is already open."));
  }
  if (
    !tenantPilot.connected ||
    !["accept_offer", "execute_obligation", "post_repayment"].includes(actionType) ||
    typeof title !== "string" ||
    !exactResourceId(resourceId) ||
    !/^0x[0-9a-f]{64}$/.test(resourceHash ?? "") ||
    !/^0x[0-9a-f]{64}$/.test(payloadHash ?? "") ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(requestId ?? "") ||
    typeof effect !== "string"
  ) {
    return Promise.reject(new Error("The exact sandbox action could not be prepared."));
  }
  const connector = walletProviderRegistry.getSelectedConnector();
  const sessionConfirmationMethod = accessState.sessionAuthenticationMethod;
  if (!new Set(["oidc_pkce_bff", "siwe"]).has(sessionConfirmationMethod)) {
    return Promise.reject(new Error(
      "The authenticated session confirmation method is unavailable. Reload server truth before retrying."
    ));
  }
  const walletConfirmation = sessionConfirmationMethod === "siwe";
  if (walletConfirmation && (!accessState.walletAddress || !connector)) {
    return Promise.reject(new Error(
      "Reconnect the wallet used for this SIWE session before confirming the exact sandbox action."
    ));
  }
  const requestedAt = new Date();
  const expiresAt = new Date(requestedAt.getTime() + 5 * 60_000);
  const requestNonce = tenantRequestToken("human_action_confirmation");
  const message = JSON.stringify({
    schemaVersion: "human_economic_action_confirmation.v1",
    actionType,
    resourceId,
    resourceHash,
    payloadHash,
    requestId,
    requestNonce,
    requestedAt: requestedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    origin: window.location.origin,
    chainId: "eip155:84532",
    sandboxOnly: true,
    realFunds: false,
    blockchainTransactionSubmitted: false
  });
  economicActionConfirmation.pending = {
    actionType,
    resourceId,
    resourceHash,
    payloadHash,
    requestId,
    requestNonce,
    requestedAt,
    expiresAt,
    message,
    walletConfirmation
  };
  economicActionConfirmation.lastFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el("economicActionTitle").textContent = title;
  el("economicActionCopy").textContent = walletConfirmation
    ? "Your connected wallet will sign the exact five-minute sandbox instruction. Rejecting the wallet request submits nothing."
    : "Your authenticated account requires an explicit second click for this exact five-minute sandbox instruction.";
  el("economicActionType").textContent = titleize(actionType);
  el("economicActionMethod").textContent = walletConfirmation
    ? `Wallet signature · ${shortWalletAddress(accessState.walletAddress)}`
    : "Authenticated account confirmation";
  el("economicActionResource").textContent = resourceId;
  el("economicActionResource").title = resourceId;
  el("economicActionEffect").textContent = effect;
  el("economicActionStatus").textContent = "Nothing has been submitted.";
  el("economicActionStatus").classList.remove("error");
  el("economicActionConfirmBtn").textContent = walletConfirmation
    ? "Confirm in wallet"
    : "Confirm with account";
  el("economicActionLayer").hidden = false;
  requestAnimationFrame(() => el("economicActionConfirmBtn").focus());
  return new Promise((resolve) => {
    economicActionConfirmation.resolve = resolve;
  });
}

async function confirmPendingEconomicAction() {
  const pending = economicActionConfirmation.pending;
  if (!pending || economicActionConfirmation.busy) return;
  if (new Date() >= pending.expiresAt) {
    el("economicActionStatus").textContent =
      "This confirmation expired. Close it and prepare the action again.";
    el("economicActionStatus").classList.add("error");
    return;
  }
  economicActionConfirmation.busy = true;
  el("economicActionConfirmBtn").disabled = true;
  el("economicActionConfirmBtn").setAttribute("aria-busy", "true");
  el("economicActionStatus").classList.remove("error");
  try {
    const messageHash = await sha256Hex(pending.message);
    let confirmationMethod = "authenticated_account_click";
    let proofHash = await sha256Hex(JSON.stringify({
      method: confirmationMethod,
      messageHash,
      requestNonce: pending.requestNonce
    }));
    if (pending.walletConfirmation) {
      const connector = walletProviderRegistry.getSelectedConnector();
      if (!connector || !accessState.walletAddress) {
        throw new Error("The selected wallet is no longer available.");
      }
      walletAuthorityLifecycle.assertProtectedAvailable();
      const baseSepolia = SUPPORTED_WALLET_CHAINS[84532];
      await switchWalletChain(connector, baseSepolia);
      const chain = await connector.getChain();
      const accounts = await connector.getAccounts();
      const chainId = Number(chain.chainId.split(":")[1]);
      const currentAccount = accounts.accounts[0];
      const currentAddress = currentAccount?.address;
      if (
        chainId !== 84532 ||
        currentAddress?.toLowerCase() !== accessState.walletAddress.toLowerCase()
      ) {
        throw new Error("The connected Base Sepolia wallet no longer matches this session.");
      }
      el("economicActionStatus").textContent =
        "Waiting for the exact wallet signature. No transaction or gas fee is requested.";
      const signature = await connector.signMessage({
        accountId: currentAccount.accountId,
        message: pending.message
      });
      if (!/^0x[0-9a-fA-F]+$/.test(signature ?? "")) {
        throw new Error("The wallet returned an invalid signature.");
      }
      confirmationMethod = "wallet_personal_sign";
      proofHash = await sha256Hex(JSON.stringify({
        method: confirmationMethod,
        messageHash,
        signatureHash: await sha256Hex(signature),
        requestNonce: pending.requestNonce
      }));
    }
    const result = Object.freeze({
      actionType: pending.actionType,
      resourceId: pending.resourceId,
      resourceHash: pending.resourceHash,
      payloadHash: pending.payloadHash,
      requestId: pending.requestId,
      requestNonce: pending.requestNonce,
      requestedAt: pending.requestedAt.toISOString(),
      confirmedAt: new Date().toISOString(),
      expiresAt: pending.expiresAt.toISOString(),
      confirmationMethod,
      confirmationHash: proofHash,
      messageHash,
      rawSignaturePersisted: false,
      blockchainTransactionSubmitted: false,
      schemaVersion: "economic_action_confirmation_result.v1"
    });
    closeEconomicActionConfirmation(result);
  } catch (error) {
    economicActionConfirmation.busy = false;
    el("economicActionConfirmBtn").disabled = false;
    el("economicActionConfirmBtn").removeAttribute("aria-busy");
    el("economicActionStatus").textContent = Number(error?.code) === 4001
      ? "Wallet confirmation was rejected. Nothing was submitted."
      : error?.message ?? "Action confirmation failed. Nothing was submitted.";
    el("economicActionStatus").classList.add("error");
  }
}

function tenantCsrfToken() {
  const token = document.querySelector('meta[name="ipo-one-csrf-token"]')?.content ?? "";
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : undefined;
}

function isRejectedAuthenticationSession(error) {
  return (
    error?.code === "authentication_session_rejected" ||
    error?.code === "authenticated_session_ended" ||
    error?.status === 401
  );
}

function quarantineRejectedAuthenticationSession(error) {
  if (!isRejectedAuthenticationSession(error)) return false;
  const requestSuffix = error?.requestId ? ` Request ID: ${error.requestId}` : "";
  accessState.sessionActive = false;
  accessState.sessionAuthenticationMethod = null;
  accessState.pendingWorkspaceBootstrap = false;
  accessState.helper =
    `Your secure session ended. Sign in again and reconcile server truth before retrying any action.${requestSuffix}`;
  tenantPilot.connected = false;
  tenantPilot.connectionLabel = "Secure session ended";
  tenantPilot.workspaceRecoveryState = "locked";
  tenantPilot.workspaceRecoveryErrorCode =
    error?.code ?? "authentication_session_rejected";
  purgeAuthenticatedBrowserState({
    clearAuthenticationBootstrap: true,
    clearWalletUi: false,
    reason: "Secure session ended. Private browser state was cleared."
  });
  setConnection(false);
  renderAccess();
  return true;
}

function localPilotAgentAccount() {
  const account =
    document.querySelector('meta[name="ipo-one-local-agent-account"]')?.content ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(account) ? account : undefined;
}

function currentWorkspaceName() {
  return document.querySelector(
    'meta[name="ipo-one-workspace-name"]'
  )?.content ?? "";
}

function applyWorkspaceSurfaceAccess() {
  const workspaceName = currentWorkspaceName();
  const access = workspaceSurfaceAccess(workspaceName);
  for (const control of document.querySelectorAll("[data-view]")) {
    const entry = access.entries.get(control.dataset.view);
    control.hidden = !entry?.allowed;
    if (!entry?.allowed) {
      delete control.dataset.workspacePlacement;
      delete control.dataset.capabilityState;
      continue;
    }
    const definition = VIEW_DEFINITIONS[entry.viewId];
    control.dataset.workspacePlacement = entry.placement;
    control.dataset.capabilityState = definition.capability.state;
    const label = control.querySelector("span strong");
    if (label) label.textContent = definition.label;
  }
  for (const control of document.querySelectorAll("[data-go-view]")) {
    control.hidden = !access.allowedViews.has(control.dataset.goView);
  }
  for (const section of document.querySelectorAll(".nav-section")) {
    const allowedItems = [...section.querySelectorAll(".nav-item:not([hidden])")];
    section.hidden = allowedItems.length === 0;
    if (allowedItems.length > 0) {
      section.dataset.workspacePlacement = allowedItems.some(
        (item) => item.dataset.workspacePlacement === "primary"
      ) ? "primary" : "advanced";
    } else {
      delete section.dataset.workspacePlacement;
    }
  }
  el("sidebarMoreBtn").hidden = access.advancedViews.size === 0;
  for (const item of document.querySelectorAll("[data-role-entry]")) {
    item.hidden = item.dataset.roleEntry !== workspaceName;
  }
  return access;
}

function expectedWorkspaceKind() {
  return {
    borrower: "human_borrower",
    controller: "principal_controller"
  }[currentWorkspaceName()] ?? null;
}

function workspaceKindLabel(kind) {
  return {
    human_borrower: "Borrower",
    principal_controller: "Principal"
  }[kind] ?? "another role";
}

function expectedWorkspaceLabel() {
  return workspaceKindLabel(expectedWorkspaceKind());
}

function hasWorkspaceSessionRoleMismatch() {
  const expected = expectedWorkspaceKind();
  return (
    tenantPilot.workspaceRecoveryState === "role_mismatch" &&
    expected !== null &&
    tenantPilot.workspaceKind !== null &&
    tenantPilot.workspaceKind !== expected
  );
}

function hasPrincipalAgentAuthorityWorkspace() {
  return principalWorkspaceAccess({
    connected: tenantPilot.connected,
    hostWorkspaceName: currentWorkspaceName(),
    serverWorkspaceKind: tenantPilot.workspaceKind
  });
}

function hasHumanBorrowerWorkspace() {
  return humanWorkspaceAccess({
    connected: tenantPilot.connected,
    hostWorkspaceName: currentWorkspaceName(),
    serverWorkspaceKind: tenantPilot.workspaceKind
  });
}

function humanWorkspaceUnavailableMessage() {
  if (tenantPilot.workspaceKind === "principal_controller") {
    return "This secure session is a Principal Controller. Sign out and use an invited Human Borrower wallet to create a Human Subject.";
  }
  return "Human Borrower workspace authority has not been recovered. Wait for verification or sign in with an invited Human Borrower wallet.";
}

function localPrincipalWorkspaceUrl() {
  if (
    accessState.authenticationProfile !== "local_no_funds" ||
    currentWorkspaceName() !== "borrower" ||
    window.location.protocol !== "http:" ||
    !new Set(["127.0.0.1", "localhost"]).has(window.location.hostname)
  ) return null;
  const borrowerPort = Number(window.location.port);
  if (!Number.isSafeInteger(borrowerPort) || borrowerPort < 1_024 || borrowerPort >= 65_533) {
    return null;
  }
  return `http://${window.location.hostname}:${borrowerPort + 1}/#request-credit`;
}

function agentAccountProofInstruction() {
  return accessState.authenticationProfile === "local_no_funds"
    ? "Click “Ask registered test Agent to prove” for the normal browser path. Developer exports remain optional."
    : "The registered Agent submits this one-use request through the protected Agent API; this browser never receives a private key or signature. Use Refresh binding after the Agent finishes.";
}

function localReferenceAgentBrowserAvailable() {
  return (
    accessState.authenticationProfile === "local_no_funds" &&
    currentWorkspaceName() === "controller" &&
    window.location.protocol === "http:" &&
    new Set(["127.0.0.1", "localhost"]).has(window.location.hostname)
  );
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
  const requestDataEpoch = authenticatedDataEpoch;
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
  if (requestDataEpoch !== authenticatedDataEpoch) {
    throw Object.assign(
      new Error("The authenticated session ended before this response completed."),
      { code: "authenticated_session_ended", requestId: responseRequestId }
    );
  }
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
    quarantineRejectedAuthenticationSession(error);
    throw error;
  }
  walletAuthorityLifecycle.assertProtectedAvailable();
  return includeTransportMeta
    ? Object.freeze({ correlationId, requestId: responseRequestId, result })
    : result;
}

async function evidenceAnchorApi(path, { body, method = "POST" } = {}) {
  const requestDataEpoch = authenticatedDataEpoch;
  walletAuthorityLifecycle.assertProtectedAvailable();
  const requestId = tenantRequestToken("web_chain_request");
  const headers = {
    accept: "application/json, application/problem+json",
    "x-request-id": requestId
  };
  if (method === "POST") {
    const csrfToken = tenantCsrfToken();
    if (!csrfToken) {
      throw new Error(
        "The authenticated session is missing its CSRF bootstrap token."
      );
    }
    headers["content-type"] = "application/json";
    headers["x-csrf-token"] = csrfToken;
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const responseRequestId = response.headers.get("x-request-id") ?? requestId;
  const text = await response.text();
  if (requestDataEpoch !== authenticatedDataEpoch) {
    throw Object.assign(
      new Error("The authenticated session ended before this response completed."),
      { code: "authenticated_session_ended", requestId: responseRequestId }
    );
  }
  let result;
  try {
    result = text ? JSON.parse(text) : undefined;
  } catch {
    throw Object.assign(
      new Error("The Evidence anchor service returned an invalid response."),
      { requestId: responseRequestId }
    );
  }
  recordRequest({
    method,
    path,
    status: response.status,
    requestId: responseRequestId
  });
  if (!response.ok) {
    throw Object.assign(
      new Error(result?.detail ?? "The Evidence anchor request was rejected."),
      {
        code: result?.code ?? "evidence_anchor_unavailable",
        status: response.status,
        requestId: result?.requestId ?? responseRequestId
      }
    );
  }
  walletAuthorityLifecycle.assertProtectedAvailable();
  return result;
}

async function referenceAgentApi(path, body) {
  const requestDataEpoch = authenticatedDataEpoch;
  walletAuthorityLifecycle.assertProtectedAvailable();
  const csrfToken = tenantCsrfToken();
  if (!csrfToken) {
    throw new Error(
      "The authenticated Principal session is missing its CSRF bootstrap token."
    );
  }
  const requestId = tenantRequestToken("web_reference_agent_request");
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json, application/problem+json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
      "x-request-id": requestId
    },
    body: JSON.stringify(body)
  });
  const responseRequestId = response.headers.get("x-request-id") ?? requestId;
  const text = await response.text();
  if (requestDataEpoch !== authenticatedDataEpoch) {
    throw Object.assign(
      new Error("The authenticated session ended before the Agent response completed."),
      { code: "authenticated_session_ended", requestId: responseRequestId }
    );
  }
  let result;
  try {
    result = text ? JSON.parse(text) : undefined;
  } catch {
    throw Object.assign(
      new Error("The online reference Agent returned an invalid response."),
      { requestId: responseRequestId }
    );
  }
  recordRequest({
    method: "POST",
    path,
    status: response.status,
    requestId: responseRequestId
  });
  if (!response.ok) {
    const error = Object.assign(
      new Error(result?.detail ?? "The online Agent operation was rejected."),
      {
        code: result?.code ?? "local_reference_agent_unavailable",
        status: response.status,
        requestId: result?.requestId ?? responseRequestId
      }
    );
    quarantineRejectedAuthenticationSession(error);
    throw error;
  }
  walletAuthorityLifecycle.assertProtectedAvailable();
  return result;
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

function rememberAgentOfferReceipt(receipt) {
  if (
    receipt?.schemaVersion !== "agent_credit_offer_workflow_receipt.v1" ||
    receipt.status !== "offer_ready" ||
    !exactResourceId(receipt.mandateId)
  ) return;
  try {
    sessionStorage.setItem(
      AGENT_OFFER_RECEIPT_SESSION_KEY,
      JSON.stringify(receipt)
    );
  } catch {
    // The receipt is non-authorizing; in-memory use remains available.
  }
}

function forgetAgentOfferReceipt() {
  try {
    sessionStorage.removeItem(AGENT_OFFER_RECEIPT_SESSION_KEY);
  } catch {
    // Browser storage is never the authorization source.
  }
}

function clearPrincipalAgentObligationState() {
  if (tenantPilot.obligation?.authorityType === "mandate") {
    const previousObligationId = tenantPilot.obligation.obligationId;
    tenantPilot.obligation = null;
    tenantPilot.servicingAction = null;
    tenantPilot.obligationHydrationAsOf = null;
    tenantPilot.obligationHydrationError = false;
    tenantPilot.obligationHydrationHelper =
      "Agent Obligation selection cleared until the authenticated authority is restored.";
    if (exactResourceId(previousObligationId)) {
      tenantPilot.workspacePositionViews.delete(previousObligationId);
    }
    el("ownedObligationId").value = "";
    forgetOwnedObligationId();
    resetOwnedEvidenceState({
      helper: "Evidence cleared while the assigned Agent authority is revalidated."
    });
  }
}

function clearPrincipalAgentSelectionState() {
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
  tenantPilot.repaymentSequence = 0;
  tenantPilot.acceptance = null;
  tenantPilot.executionReceipt = null;
  tenantPilot.repayment = null;
  tenantPilot.servicingAction = null;
  agentAuthorityPilot.subject = null;
  agentAuthorityPilot.accountChallenge = null;
  agentAuthorityPilot.accountBinding = null;
  agentAuthorityPilot.mandate = null;
  agentAuthorityPilot.activationEvidenceHash = null;
  agentOnlinePilot.offerReceipt = null;
  agentOnlinePilot.applicationResult = null;
  agentOnlinePilot.acceptanceResult = null;
  agentOnlinePilot.executionResult = null;
  agentOnlinePilot.repaymentResult = null;
  agentOnlinePilot.evidenceResult = null;
  agentOnlinePilot.runtimeResult = null;
  clearPrincipalAgentObligationState();
  el("principalMandateAcknowledge").checked = false;
  forgetAgentOfferReceipt();
}

function principalAgentSelectionChanged(previous, next) {
  if (next?.status !== "selected") return previous?.status === "selected";
  if (previous?.status !== "selected") {
    return Boolean(
      agentAuthorityPilot.subject ||
      agentAuthorityPilot.mandate ||
      agentAuthorityPilot.accountChallenge ||
      agentAuthorityPilot.accountBinding ||
      agentOnlinePilot.offerReceipt ||
      agentOnlinePilot.runtimeResult ||
      (tenantPilot.obligation?.authorityType === "mandate")
    );
  }
  return ["actorId", "subjectId", "mandateId"].some(
    (key) => previous[key] !== next[key]
  );
}

function requireSelectedPrincipalAgent({ subjectId, mandateId } = {}) {
  const selection = agentAuthorityPilot.workspaceSelection;
  if (selection?.status !== "selected") {
    throw new Error("A single server-authorized Agent assignment is required.");
  }
  if (subjectId !== undefined && selection.subjectId !== subjectId) {
    throw new Error("The Agent Subject changed. Refresh the authenticated workspace before continuing.");
  }
  if (mandateId !== undefined && selection.mandateId !== mandateId) {
    throw new Error("The Agent Mandate changed. Refresh the authenticated workspace before continuing.");
  }
  return selection;
}

function samePrincipalAgentSelection(left, right) {
  return left?.status === "selected" && right?.status === "selected" &&
    ["actorId", "subjectId", "mandateId"].every(
      (key) => left[key] === right[key]
    );
}

async function revalidatePrincipalAgentSelection() {
  const previousSelection = requireSelectedPrincipalAgent();
  const result = await tenantApi("pilotReadWorkspaceResume", {
    payload: {},
    idempotent: false
  });
  const currentSelection = selectPrincipalAgentWorkspace(result.response);
  if (!samePrincipalAgentSelection(previousSelection, currentSelection)) {
    clearPrincipalAgentSelectionState();
    agentAuthorityPilot.workspaceSelection = currentSelection;
    tenantPilot.workspaceResume = result.response;
    throw new Error(
      currentSelection.status === "empty"
        ? "The assigned Agent is no longer available. Refresh the authenticated workspace before continuing."
        : "The assigned Agent authority changed. Refresh the authenticated workspace before continuing."
    );
  }
  agentAuthorityPilot.workspaceSelection = currentSelection;
  tenantPilot.workspaceResume = result.response;
  return currentSelection;
}

function restoreAuthenticatedStateObject(target, baseline) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(baseline, key)) delete target[key];
  }
  Object.assign(target, structuredClone(baseline));
}

function purgeAuthenticatedBrowserState({
  clearAuthenticationBootstrap = false,
  clearWalletUi = false,
  reason = "Private browser state was cleared."
} = {}) {
  authenticatedDataEpoch += 1;
  invalidateTenantPilotProbe();
  invalidateRiskRequestOwners();
  humanNewApplicationMode = false;
  requestLog = [];
  lastRequestId = undefined;
  serverCatalogOperations = new Set();
  serverCatalogSnapshot = null;
  for (const [target, baseline] of AUTHENTICATED_BROWSER_STATE_BASELINES) {
    restoreAuthenticatedStateObject(target, baseline);
  }
  tenantPilot.checked = true;
  tenantPilot.connected = false;
  tenantPilot.connectionLabel = "Signed out";
  tenantPilot.helper = reason;
  tenantPilot.workspaceRecoveryState = "denied";
  forgetOwnedObligationId();
  forgetAgentOfferReceipt();
  forgetPostLoginViewIntent();
  for (const key of [HUMAN_SUBJECT_STORAGE_KEY, HUMAN_CONSENT_STORAGE_KEY]) {
    forgetOpaqueId(key);
  }
  const localAgentAccount = document.querySelector(
    'meta[name="ipo-one-local-agent-account"]'
  );
  if (localAgentAccount) localAgentAccount.content = "";
  if (clearAuthenticationBootstrap) {
    const csrf = document.querySelector('meta[name="ipo-one-csrf-token"]');
    if (csrf) csrf.content = "";
  }
  for (const form of document.querySelectorAll("#mainContent form")) {
    form.reset();
  }
  for (const input of document.querySelectorAll("#mainContent input")) {
    if (new Set(["button", "reset", "submit"]).has(input.type)) continue;
    if (new Set(["checkbox", "radio"]).has(input.type)) {
      input.checked = false;
    } else {
      input.value = "";
    }
  }
  for (const textarea of document.querySelectorAll("#mainContent textarea")) {
    textarea.value = "";
  }
  for (const detail of document.querySelectorAll("#mainContent details[open]")) {
    detail.open = false;
  }
  window.clearTimeout(toast.timer);
  el("toast").textContent = "";
  el("toast").classList.remove("show", "error");
  announce(reason);
  if (clearWalletUi) {
    accessState.walletAddress = null;
    accessState.connectedChainId = null;
    accessState.selectedWalletProviderId = null;
  }
}

function resetOwnedEvidenceState({
  busy = false,
  expectedMarker = null,
  helper = OWNED_EVIDENCE_DEFAULT_HELPER,
  obligationId = null
} = {}) {
  const queryEpoch = ownedEvidence.queryEpoch + 1;
  const anchorConfig = evidenceAnchorPilot.config;
  Object.assign(ownedEvidence, {
    busy,
    queried: false,
    obligationId,
    items: [],
    nextCursor: null,
    hasMore: false,
    capped: false,
    asOf: null,
    expectedMarker,
    queryEpoch,
    helper,
    error: false
  });
  Object.assign(evidenceAnchorPilot, {
    available: Boolean(anchorConfig),
    busy: false,
    config: anchorConfig,
    obligationId: null,
    items: [],
    helper: "Every durable Evidence hash requires a verified Base Sepolia transaction.",
    error: false
  });
  return queryEpoch;
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
  resetOwnedEvidenceState();
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

function restoreHumanCreditRequest(creditRequest) {
  const principalMinor = /^[1-9][0-9]*$/.test(
    creditRequest?.requestedPrincipalMinor ?? ""
  )
    ? BigInt(creditRequest.requestedPrincipalMinor)
    : 0n;
  if (
    creditRequest?.assetId !== "urn:ipo-one:sandbox-asset:usd-cent" ||
    principalMinor < 100n ||
    principalMinor > 25000n ||
    creditRequest.requestedTermDays < 1 ||
    creditRequest.requestedTermDays > 90 ||
    creditRequest.installmentCount < 1 ||
    creditRequest.installmentCount > 3 ||
    ![...el("humanCreditPurpose").options]
      .some(({ value }) => value === creditRequest.purposeCode) ||
    ![...el("humanRepaymentFrequency").options]
      .some(({ value }) => value === creditRequest.repaymentFrequency)
  ) {
    throw new Error("invalid_request_credit_review_binding");
  }
  const wholeUnits = principalMinor / 100n;
  const fractionalUnits = principalMinor % 100n;
  el("humanCreditAmount").value = fractionalUnits === 0n
    ? String(wholeUnits)
    : `${wholeUnits}.${String(fractionalUnits).padStart(2, "0")}`;
  el("humanCreditTerm").value = String(creditRequest.requestedTermDays);
  el("humanInstallments").value = String(creditRequest.installmentCount);
  el("humanCreditPurpose").value = creditRequest.purposeCode;
  el("humanRepaymentFrequency").value = creditRequest.repaymentFrequency;
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
      "provider_spend",
      "capture_revenue",
      "route_repayment"
    ],
    allowedProviderIds: ["provider_gateway_compute"],
    allowedCategories: ["compute"],
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

function applyAgentOfferReceipt(receipt) {
  if (
    receipt?.schemaVersion !== "agent_credit_offer_workflow_receipt.v1" ||
    receipt.status !== "offer_ready" ||
    !exactResourceId(receipt.subjectId) ||
    !exactResourceId(receipt.mandateId)
  ) return false;
  agentOnlinePilot.offerReceipt = receipt;
  tenantPilot.intent = receipt.creditIntent ?? null;
  tenantPilot.decision = receipt.decision ?? null;
  tenantPilot.offer = receipt.offer ?? null;
  rememberAgentOfferReceipt(receipt);
  return true;
}

function controlledAgentContinuationForMandate(recovery, mandate) {
  if (
    !exactResourceId(mandate?.mandateId) ||
    !exactResourceId(mandate?.subjectId)
  ) return null;
  return selectExactAgentContinuation({ mandate, recovery });
}

function renderAgentOnlineWorkflow(presentation) {
  const button = el("agentOnlineRunBtn");
  const executeButton = el("agentOnlineExecuteBtn");
  const repayButton = el("agentOnlineRepayBtn");
  const evidenceButton = el("agentOnlineEvidenceBtn");
  const reviewButton = el("agentOnlineReviewBtn");
  const status = el("agentOnlineStatus");
  const mandate = presentation?.mandate ?? null;
  const controllerReady =
    hasPrincipalAgentAuthorityWorkspace() &&
    presentation?.registry?.catalogParity === true;
  const localBrowserRun = localReferenceAgentBrowserAvailable();
  if (
    agentOnlinePilot.offerReceipt &&
    agentOnlinePilot.offerReceipt.mandateId !== mandate?.mandateId
  ) {
    agentOnlinePilot.offerReceipt = null;
    agentOnlinePilot.applicationResult = null;
    agentOnlinePilot.acceptanceResult = null;
    agentOnlinePilot.executionResult = null;
    agentOnlinePilot.repaymentResult = null;
    agentOnlinePilot.evidenceResult = null;
    agentOnlinePilot.runtimeResult = null;
  }
  const offerReceipt = agentOnlinePilot.offerReceipt;
  const runtimeResult = agentOnlinePilot.runtimeResult;
  const runtimeObligation = [
    agentOnlinePilot.repaymentResult?.obligation,
    agentOnlinePilot.executionResult?.obligation,
    agentOnlinePilot.acceptanceResult?.obligation,
    runtimeResult?.lifecycle?.workflowReceipt?.obligation,
    tenantPilot.obligation
  ].find((obligation) => (
    exactResourceId(obligation?.obligationId) &&
    obligation.authorityType === "mandate" &&
    obligation.authorityId === mandate?.mandateId
  )) ?? null;
  const executionReceipt =
    agentOnlinePilot.executionResult?.executionReceipt ??
    runtimeResult?.lifecycle?.workflowReceipt?.executionReceipt ??
    null;
  const repayment =
    agentOnlinePilot.repaymentResult?.repayment ??
    runtimeResult?.lifecycle?.workflowReceipt?.repayment ??
    null;
  const revenueCapture = agentOnlinePilot.repaymentResult?.revenueCapture ?? null;
  const evidence =
    agentOnlinePilot.evidenceResult?.evidence ??
    runtimeResult?.lifecycle?.evidence ??
    null;
  const totalRepaidMinor = BigInt(runtimeObligation?.totalRepaidMinor ?? "0");
  const recoveredRepaymentEvidence = evidence?.items?.find((item) => (
    item?.eventType === "repayment_posted" &&
    item.obligationId === runtimeObligation?.obligationId &&
    typeof item.occurredAt === "string"
  )) ?? null;
  const repaymentMarker = repayment
    ? {
        eventType: "repayment_posted",
        obligationId: runtimeObligation?.obligationId,
        occurredAt: repayment.occurredAt
      }
    : totalRepaidMinor > 0n && recoveredRepaymentEvidence
      ? {
          eventType: recoveredRepaymentEvidence.eventType,
          obligationId: recoveredRepaymentEvidence.obligationId,
          occurredAt: recoveredRepaymentEvidence.occurredAt
        }
      : null;
  const ownerEvidenceLatestProven = Boolean(
    evidence &&
    repaymentMarker &&
    ownedEvidence.obligationId === runtimeObligation?.obligationId &&
    currentOwnedEvidenceLatestProven() &&
    hasOwnedEvidenceMarker(ownedEvidence.items, repaymentMarker)
  );
  const agentEvidenceLatestProven = Boolean(
    evidence && repaymentMarker && (
      evidence.hasMore !== true &&
      hasOwnedEvidenceMarker(evidence.items, repaymentMarker) ||
      ownerEvidenceLatestProven
    )
  );
  const visibleEvidenceItems = ownerEvidenceLatestProven
    ? ownedEvidence.items
    : evidence?.items ?? (
        ownedEvidence.queried &&
        ownedEvidence.obligationId === runtimeObligation?.obligationId
          ? ownedEvidence.items
          : []
      );
  const latestEvidence = visibleEvidenceItems.at(-1);
  const executionCompleted =
    runtimeObligation?.executionStatus === "executed" ||
    Boolean(executionReceipt);
  const outstandingMinor = BigInt(
    runtimeObligation?.outstandingPrincipalMinor ?? "0"
  ) + BigInt(
    runtimeObligation?.outstandingInterestMinor ?? "0"
  ) + BigInt(
    runtimeObligation?.outstandingFeesMinor ?? "0"
  );
  const applicationEligible = presentation?.identity?.applicationEligible === true;
  const stage = deriveAgentLifecycleNextAction({
    applicationEligible,
    evidenceLatestProven: agentEvidenceLatestProven,
    executionCompleted,
    mandateStatus: mandate?.status,
    obligationPresent: Boolean(runtimeObligation),
    offerPresent: Boolean(offerReceipt),
    outstandingMinor
  });

  status.className = `state-pill ${
    agentOnlinePilot.error
      ? "warning"
      : stage === "runtime_complete"
        ? ""
        : "neutral"
  }`;
  status.textContent = agentOnlinePilot.busy
    ? "Agent working"
    : agentOnlinePilot.error
      ? "Action required"
      : {
          authority: "Waiting for Mandate",
          identity: "Account proof required",
          application: "Waiting for Agent Offer",
          principal_activation: "Offer ready · activate",
          runtime_accept: "Ready to create Obligation",
          runtime_execute: "Ready for approved use",
          runtime_repay: "Approved use executed",
          runtime_evidence: "Repayment complete",
          runtime_complete: "Lifecycle verified",
          active_recovery: "Checking durable Agent progress"
        }[stage];

  el("agentOnlineApplicationState").textContent = offerReceipt
    ? "Decision completed"
    : stage === "identity"
      ? "Blocked by identity proof"
    : stage === "application"
      ? "Waiting for external Agent"
      : "Not started";
  el("agentOnlineOfferState").textContent = offerReceipt?.offer
    ? `${titleize(offerReceipt.offer.status)} · ${usdMinorToMoney(
        offerReceipt.offer.approvedPrincipalMinor
      )}`
    : "Not loaded";
  el("agentOnlineObligationState").textContent = runtimeObligation
    ? `${titleize(runtimeObligation.status)} · ${compactOpaqueId(
        runtimeObligation.obligationId
      )}`
    : "Not created";
  el("agentOnlineExecutionState").textContent = executionCompleted
    ? `Allowlisted · ${usdMinorToMoney(
        executionReceipt?.amountMinor ??
          runtimeObligation?.originalPrincipalMinor ??
          "0"
      )}`
    : runtimeObligation
      ? "Ready for approved use"
      : "Not executed";
  el("agentOnlineRepaymentState").textContent = repayment
    ? `${revenueCapture ? "Revenue captured" : "Repayment posted"} · ${usdMinorToMoney(
        repayment.appliedMinor
      )} auto-routed · ${usdMinorToMoney(
        repayment.remainingPrincipalMinor
      )} principal remaining`
    : totalRepaidMinor > 0n
      ? `${usdMinorToMoney(totalRepaidMinor.toString())} repaid · ${usdMinorToMoney(
          runtimeObligation?.outstandingPrincipalMinor ?? "0"
        )} principal remaining`
    : executionCompleted
      ? "Ready for early repayment"
      : "Not posted";
  el("agentOnlineEvidenceState").textContent = latestEvidence
    ? `${titleize(latestEvidence.eventType)} · v${latestEvidence.aggregateVersion} · ${visibleEvidenceItems.length} ${
        agentEvidenceLatestProven ? "latest verified" : evidence?.hasMore ? "partial" : "loaded"
      }`
    : "Not loaded";

  button.disabled =
    agentOnlinePilot.busy ||
    !controllerReady ||
    ![
      "authority",
      "application",
      "principal_activation",
      "runtime_accept",
      "active_recovery"
    ].includes(stage);
  button.toggleAttribute("aria-busy", agentOnlinePilot.busy);
  button.textContent = agentOnlinePilot.busy
      ? "Running authenticated Agent…"
    : {
        authority: "Set up Agent authority",
        identity: "Agent account proof required",
        application: localBrowserRun
          ? "Run local Agent application"
          : "Check for Agent Offer",
        principal_activation: "Review and activate this Mandate",
        runtime_accept: localBrowserRun
          ? "Complete sandbox Agent lifecycle"
          : "Check for Agent Obligation",
        runtime_execute: "Agent Obligation created",
        runtime_repay: "Approved use executed",
        runtime_evidence: "Repayment posted",
        runtime_complete: "Agent lifecycle complete",
        active_recovery: "Check Agent progress"
      }[stage];
  const localLifecycleComplete = localBrowserRun && Boolean(runtimeResult);
  button.hidden = localLifecycleComplete;
  executeButton.hidden = localBrowserRun;
  repayButton.hidden = localBrowserRun;
  evidenceButton.hidden = localBrowserRun;
  executeButton.disabled =
    localBrowserRun || agentOnlinePilot.busy || !controllerReady || stage !== "runtime_execute";
  executeButton.textContent = "Check Provider spend";
  repayButton.disabled =
    localBrowserRun || agentOnlinePilot.busy || !controllerReady || stage !== "runtime_repay";
  repayButton.textContent = "Check automatic repayment";
  evidenceButton.disabled =
    localBrowserRun || agentOnlinePilot.busy ||
    !controllerReady ||
    !["runtime_evidence", "runtime_complete"].includes(stage);
  reviewButton.hidden = !localLifecycleComplete;
  reviewButton.disabled =
    agentOnlinePilot.busy || !exactResourceId(runtimeObligation?.obligationId);

  const defaultHelper = {
    authority:
      "Create a verified Agent Subject and Draft Mandate first. The external Agent uses its own credential; this Principal browser reads only durable server truth.",
    identity:
      "The Agent Subject is pending or its CAIP-10 AccountBinding is not active. Create the one-use signing request and let the registered external Agent submit its own proof before requesting credit.",
    application:
      localBrowserRun
        ? "Run the registered local Agent here. It keeps its credential server-side and returns only the persisted Decision and Offer receipt."
        : "Run the application handoff with the registered external Agent, then use this check to restore its persisted Decision and Offer receipt.",
    principal_activation:
      "The Agent returned a Decision and Offer. Review the exact Mandate in the Principal workspace, then activate it.",
    runtime_accept:
      localBrowserRun
        ? "The active Mandate and exact Offer are ready. One local Agent goal run creates the no-funds Obligation, executes one allowlisted use, posts synthetic repayment, and reads Evidence."
        : "The active Mandate and exact Offer are ready. The external Agent must accept the Offer; this Principal action only checks durable progress.",
    runtime_execute:
      "The Obligation exists. The external Agent may execute one allowlisted Provider spend; this Principal action only checks current server truth.",
    runtime_repay:
      "Provider spend is recorded. The external Agent may capture synthetic revenue and route repayment through the deterministic waterfall; this Principal action only checks current server truth.",
    runtime_evidence:
      "Repayment is complete. Load the immutable Evidence timeline and chain-anchor status.",
    runtime_complete:
      "Agent borrowing, approved use, repayment, and Evidence are verified. Review the shared Obligation whenever needed.",
    active_recovery:
      "No current Offer or exact Obligation is recoverable for this active Mandate. This Principal browser cannot start an Agent application or change active authority. Let the registered Agent finish any in-flight Offer or runtime step, then check again."
  }[stage];
  el("agentOnlineHelper").textContent =
    agentOnlinePilot.error ||
    agentOnlinePilot.busy ||
    agentOnlinePilot.applicationResult ||
    agentOnlinePilot.acceptanceResult ||
    agentOnlinePilot.executionResult ||
    agentOnlinePilot.repaymentResult ||
    agentOnlinePilot.evidenceResult ||
    agentOnlinePilot.runtimeResult
      ? agentOnlinePilot.helper
      : defaultHelper;
  el("agentOnlineHelper").classList.toggle("error", agentOnlinePilot.error);
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
    renderAgentOnlineWorkflow(null);
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
  el("agentConsoleTransport").textContent = "Protected HTTPS + Agent credential";
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

  el("agentConsoleRegistryStatus").textContent = presentation.registry.catalogParity
    ? `${presentation.registry.catalogBoundCount}/${presentation.registry.toolCount} parity`
    : "Drift blocked";
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

  el("agentConsoleSdkTitle").textContent =
    presentation.status === "application_ready"
      ? "Run Request → Decision → Offer"
      : presentation.status === "runtime_ready"
        ? "Run Obligation → repayment → Evidence"
        : "Reference Agent runner";
  el("agentConsoleSdkSnippet").textContent =
    presentation.status === "application_ready"
      ? `# 1. Download the application handoff above.
# 2. From the IPO.ONE repository root, run:
pnpm run local:agent:application -- <downloaded-application-handoff.json>

# The exact Offer receipt is saved locally and persisted to server truth for this Mandate.`
      : presentation.status === "runtime_ready"
        ? `# 1. Download the runtime handoff above.
# 2. Use the same Mandate that produced the saved Offer receipt:
pnpm run local:agent:runtime -- <downloaded-runtime-handoff.json>

# The runner creates, executes, repays, and reads Evidence.`
        : `# Verify the complete isolated Agent path:
pnpm run local:agent:acceptance

# For an interactive journey, first create or load a Draft Mandate.`;
  el("agentConsoleOpenApiSnippet").textContent =
`const response = await fetch(
  new URL("/openapi.json", globalThis.location.origin),
  { headers: { accept: "application/json" } }
);

if (!response.ok) throw new Error("local_openapi_unavailable");
const contract = await response.json();
console.log(contract.info.title, contract.info.version);`;
  renderAgentOnlineWorkflow(presentation);
}

async function checkAgentContinuation(mandate) {
  const result = await tenantApi("pilotReadWorkspaceResume", {
    payload: {},
    idempotent: false
  });
  tenantPilot.workspaceResume = result.response;
  const continuation = controlledAgentContinuationForMandate(
    result.response,
    mandate
  );
  if (!continuation) {
    agentOnlinePilot.offerReceipt = null;
    agentOnlinePilot.applicationResult = null;
    forgetAgentOfferReceipt();
    agentOnlinePilot.helper =
      "No current Agent Offer receipt is persisted yet. Run the downloaded application handoff with the registered external Agent, then check again.";
    toast("Agent Offer is not ready yet");
    announce("No current Agent Offer receipt is available");
    return false;
  }
  if (!applyAgentOfferReceipt(continuation.receipt)) {
    throw new Error("The persisted Agent Offer receipt is invalid.");
  }
  agentOnlinePilot.applicationResult = continuation;
  agentOnlinePilot.acceptanceResult = null;
  agentOnlinePilot.executionResult = null;
  agentOnlinePilot.repaymentResult = null;
  agentOnlinePilot.evidenceResult = null;
  agentOnlinePilot.runtimeResult = null;
  agentOnlinePilot.helper =
    "Decision and Offer restored from durable server truth. Review and activate this exact Mandate; activation does not create a new application.";
  toast("Agent Decision and Offer restored");
  announce("Agent Offer restored; Principal activation required");
  return true;
}

async function checkAgentRuntimeProgress(mandate) {
  await recoverAuthenticatedWorkspace();
  const activeMandate = currentAgentConsolePresentation()?.mandate;
  if (activeMandate?.mandateId !== mandate.mandateId) {
    throw new Error("The authenticated Mandate changed during progress recovery.");
  }
  const obligation = currentAgentOnlineObligation(mandate.mandateId);
  if (!obligation) {
    agentOnlinePilot.helper =
      "No Agent Obligation is persisted yet. Run the active-Mandate runtime handoff with the registered external Agent, then check again.";
    toast("Agent Obligation is not ready yet");
    announce("No current Agent Obligation is available");
    return false;
  }
  rememberAgentOnlineObligation(obligation);
  if (BigInt(obligation.totalRepaidMinor ?? "0") > 0n) {
    await loadOwnedEvidence();
    if (currentOwnedEvidenceLoaded()) {
      agentOnlinePilot.evidenceResult = {
        evidence: {
          items: [...ownedEvidence.items],
          hasMore: ownedEvidence.hasMore,
          schemaVersion: "principal_observed_agent_evidence.v1"
        }
      };
    }
  }
  agentOnlinePilot.helper = obligation.status === "fully_repaid"
    ? "The Agent Obligation, automatic repayment, and current owner-authorized Evidence were restored from durable server truth."
    : obligation.executionStatus === "executed"
      ? "The allowlisted sandbox spend is persisted. The external Agent must post the next automatic repayment step; check again afterward."
      : "The Agent Obligation is persisted. The external Agent must execute the allowlisted sandbox use; check again afterward.";
  toast("Agent lifecycle progress refreshed");
  announce("Agent lifecycle progress restored from the server");
  return true;
}

function assertLocalReferenceAgentResult(result, {
  mandateId,
  schemaVersion
}) {
  if (
    result?.schemaVersion !== schemaVersion ||
    result.mandateId !== mandateId ||
    result.sandboxOnly !== true ||
    result.productionFundsMoved !== false ||
    result.credentialEnteredBrowser !== false
  ) {
    throw new Error(
      "The local reference Agent response did not preserve the reviewed no-funds boundary."
    );
  }
  return result;
}

async function runLocalAgentApplication(mandate) {
  const result = assertLocalReferenceAgentResult(
    await referenceAgentApi(
      "/local/v1/reference-agent/application",
      { mandateId: mandate.mandateId }
    ),
    {
      mandateId: mandate.mandateId,
      schemaVersion: "local_reference_agent_application_result.v1"
    }
  );
  if (!applyAgentOfferReceipt(result.offerReceipt)) {
    throw new Error("The local reference Agent returned an invalid Offer receipt.");
  }
  agentOnlinePilot.applicationResult = result;
  agentOnlinePilot.acceptanceResult = null;
  agentOnlinePilot.executionResult = null;
  agentOnlinePilot.repaymentResult = null;
  agentOnlinePilot.evidenceResult = null;
  agentOnlinePilot.runtimeResult = null;
  await recoverAuthenticatedWorkspace();
  agentOnlinePilot.helper =
    "The registered local Agent completed Request → Decision → Offer and persisted the exact continuation receipt. Review and activate this Mandate next.";
  toast("Local Agent Offer is ready");
  announce("Registered local Agent application completed; Principal activation required");
}

async function runLocalAgentLifecycle(mandate) {
  const offerReceipt = agentOnlinePilot.offerReceipt;
  if (
    offerReceipt?.mandateId !== mandate.mandateId ||
    offerReceipt?.schemaVersion !== "agent_credit_offer_workflow_receipt.v1"
  ) {
    await checkAgentContinuation(mandate);
  }
  if (agentOnlinePilot.offerReceipt?.mandateId !== mandate.mandateId) {
    throw new Error(
      "The active Mandate needs its exact persisted Agent Offer before the sandbox lifecycle can run."
    );
  }
  const result = assertLocalReferenceAgentResult(
    await referenceAgentApi(
      "/local/v1/reference-agent/runtime",
      {
        mandateId: mandate.mandateId,
        offerReceipt: agentOnlinePilot.offerReceipt
      }
    ),
    {
      mandateId: mandate.mandateId,
      schemaVersion: "local_reference_agent_runtime_result.v1"
    }
  );
  const lifecycle = result.lifecycle;
  if (
    result.status !== "evidence_read" ||
    lifecycle?.schemaVersion !== "local_agent_reference_workflow_result.v1" ||
    lifecycle.sandboxOnly !== true ||
    lifecycle.productionFundsMoved !== false ||
    lifecycle.workflowReceipt?.obligation?.authorityId !== mandate.mandateId ||
    lifecycle.evidence?.hasMore === true
  ) {
    throw new Error(
      "The local Agent lifecycle result is incomplete or does not match the active Mandate."
    );
  }
  agentOnlinePilot.runtimeResult = result;
  agentOnlinePilot.acceptanceResult = {
    obligation: lifecycle.workflowReceipt.obligation,
    acceptance: lifecycle.workflowReceipt.acceptance
  };
  agentOnlinePilot.executionResult = {
    obligation: lifecycle.workflowReceipt.obligation,
    executionReceipt: lifecycle.workflowReceipt.executionReceipt
  };
  agentOnlinePilot.repaymentResult = {
    obligation: lifecycle.workflowReceipt.obligation,
    repayment: lifecycle.workflowReceipt.repayment
  };
  agentOnlinePilot.evidenceResult = { evidence: lifecycle.evidence };
  rememberAgentOnlineObligation(lifecycle.workflowReceipt.obligation);
  agentOnlinePilot.helper =
    "The registered local Agent completed the Mandate-bound sandbox lifecycle in one goal run: Obligation, allowlisted use, synthetic repayment, and current Evidence. No real funds moved.";
  toast("Local Agent lifecycle complete");
  announce("Registered local Agent completed the no-funds lifecycle and Evidence read");
}

async function runOnlineReferenceAgent() {
  if (agentOnlinePilot.busy) return;
  const presentation = currentAgentConsolePresentation();
  const mandate = presentation?.mandate;
  if (!hasPrincipalAgentAuthorityWorkspace() || !exactResourceId(mandate?.mandateId)) {
    openPrincipalAgentAuthority();
    return;
  }
  if (mandate.status === "draft" && presentation.identity.applicationEligible !== true) {
    openPrincipalAgentAuthority();
    requestAnimationFrame(() => focusJumpTarget(el("agentAuthority")));
    announce("Agent account proof is required before application");
    return;
  }
  if (mandate.status === "draft" && agentOnlinePilot.offerReceipt) {
    openPrincipalAgentAuthority();
    requestAnimationFrame(() => focusJumpTarget(el("agentAuthority")));
    announce("Review and activate the exact Mandate to continue");
    return;
  }

  agentOnlinePilot.busy = true;
  agentOnlinePilot.error = false;
  const localBrowserRun = localReferenceAgentBrowserAvailable();
  agentOnlinePilot.helper = localBrowserRun
    ? mandate.status === "draft"
      ? "The registered local Agent is creating the bounded request, deterministic Decision, and Offer for this Draft Mandate…"
      : "The registered local Agent is completing the exact no-funds lifecycle: Obligation, allowlisted use, synthetic repayment, and Evidence…"
    : mandate.status === "draft"
      ? "Checking PostgreSQL-backed continuation receipts for this exact controlled Agent and Draft Mandate…"
      : "Checking current Agent Obligation, execution, repayment, and Evidence state from the authenticated server…";
  renderAgentConsole();
  try {
    if (localBrowserRun && mandate.status === "draft") {
      await runLocalAgentApplication(mandate);
    } else if (localBrowserRun) {
      await runLocalAgentLifecycle(mandate);
    } else if (mandate.status === "draft") {
      await checkAgentContinuation(mandate);
    } else {
      await checkAgentRuntimeProgress(mandate);
      if (!currentAgentOnlineObligation(mandate.mandateId)) {
        await checkAgentContinuation(mandate);
        if (!agentOnlinePilot.offerReceipt) {
          agentOnlinePilot.helper = tenantPilot.workspaceRecoveryHasMore
            ? "Bounded recovery did not locate an exact Offer or Obligation for this active Mandate. No absence is inferred from the partial workspace result; check again after the registered Agent finishes its in-flight step."
            : "No current Offer or exact Obligation is recoverable for this active Mandate. This Principal browser performed only server-truth reads and cannot start a new application or change active authority. Let the registered Agent finish any in-flight step, then check again.";
        }
      }
    }
  } catch (error) {
    failAgentOnlineStep(error);
  } finally {
    agentOnlinePilot.busy = false;
    renderTenantPilot();
  }
}

function currentAgentOnlineObligation(mandateId) {
  return [
    agentOnlinePilot.repaymentResult?.obligation,
    agentOnlinePilot.executionResult?.obligation,
    agentOnlinePilot.acceptanceResult?.obligation,
    agentOnlinePilot.runtimeResult?.lifecycle?.workflowReceipt?.obligation,
    tenantPilot.obligation
  ].find((obligation) => (
    exactResourceId(obligation?.obligationId) &&
    obligation.authorityType === "mandate" &&
    obligation.authorityId === mandateId
  )) ?? null;
}

function rememberAgentOnlineObligation(obligation) {
  if (tenantPilot.obligation?.obligationId !== obligation.obligationId) {
    resetOwnedEvidenceState({
      obligationId: obligation.obligationId,
      helper: "Loading controller-authorized Evidence for the Agent Obligation…"
    });
  }
  tenantPilot.obligation = obligation;
  rememberOwnedObligationId(obligation.obligationId);
  rememberWorkspaceObligation(obligation.obligationId);
  el("ownedObligationId").value = obligation.obligationId;
}

function failAgentOnlineStep(error) {
  agentOnlinePilot.error = true;
  const requestSuffix = error?.requestId ? ` Request ID: ${error.requestId}` : "";
  agentOnlinePilot.helper =
    `${error?.message ?? "The online Agent operation failed."}${requestSuffix}`;
  toast(agentOnlinePilot.helper, "error");
  announce("Online Agent operation failed");
  if (isRejectedAuthenticationSession(error)) openAccess();
}

async function executeOnlineAgentApprovedUse() {
  if (agentOnlinePilot.busy) return;
  const mandate = currentAgentConsolePresentation()?.mandate;
  if (mandate?.status !== "active") {
    agentOnlinePilot.error = true;
    agentOnlinePilot.helper =
      "Activate the exact Mandate before checking runtime progress.";
    renderAgentConsole();
    return;
  }
  agentOnlinePilot.busy = true;
  agentOnlinePilot.error = false;
  agentOnlinePilot.helper =
    "Checking the Agent Obligation and allowlisted sandbox-spend projection from authenticated server truth…";
  renderAgentConsole();
  try {
    await checkAgentRuntimeProgress(mandate);
  } catch (error) {
    failAgentOnlineStep(error);
  } finally {
    agentOnlinePilot.busy = false;
    renderTenantPilot();
  }
}

async function repayOnlineAgentObligation() {
  if (agentOnlinePilot.busy) return;
  const mandate = currentAgentConsolePresentation()?.mandate;
  if (mandate?.status !== "active") {
    agentOnlinePilot.error = true;
    agentOnlinePilot.helper =
      "Activate the exact Mandate before checking repayment progress.";
    renderAgentConsole();
    return;
  }
  agentOnlinePilot.busy = true;
  agentOnlinePilot.error = false;
  agentOnlinePilot.helper =
    "Checking the current repayment projection and owner-authorized Evidence from authenticated server truth…";
  renderAgentConsole();
  try {
    await checkAgentRuntimeProgress(mandate);
  } catch (error) {
    failAgentOnlineStep(error);
  } finally {
    agentOnlinePilot.busy = false;
    renderTenantPilot();
  }
}

async function verifyOnlineAgentEvidence() {
  if (agentOnlinePilot.busy) return;
  const mandate = currentAgentConsolePresentation()?.mandate;
  if (mandate?.status !== "active") {
    agentOnlinePilot.error = true;
    agentOnlinePilot.helper =
      "Activate the exact Mandate before checking Agent Evidence.";
    renderAgentConsole();
    return;
  }
  agentOnlinePilot.busy = true;
  agentOnlinePilot.error = false;
  agentOnlinePilot.helper =
    "Checking the owner-authorized Agent Evidence timeline from authenticated server truth…";
  renderAgentConsole();
  try {
    await checkAgentRuntimeProgress(mandate);
  } catch (error) {
    failAgentOnlineStep(error);
  } finally {
    agentOnlinePilot.busy = false;
    renderTenantPilot();
  }
}

async function reviewOnlineAgentObligation() {
  const obligationId =
    agentOnlinePilot.runtimeResult?.obligationId ??
    tenantPilot.obligation?.obligationId;
  if (!exactResourceId(obligationId)) {
    toast("Run the Agent lifecycle before reviewing an Obligation.", "error");
    return;
  }
  setMode("agent");
  showView("obligations");
  el("ownedObligationId").value = obligationId;
  await loadOwnedObligation({ obligationId });
  if (
    tenantPilot.obligationHydrationError ||
    tenantPilot.obligation?.obligationId !== obligationId
  ) {
    announce("Agent Obligation could not be reauthorized; Evidence was not read");
    return;
  }
  await loadOwnedEvidence();
  announce(currentOwnedEvidenceLatestProven()
    ? "Agent Obligation loaded and latest Evidence verified"
    : currentOwnedEvidenceLoaded()
      ? "Agent Obligation loaded with partial Evidence"
      : "Agent Obligation loaded; Evidence is not yet available");
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
    const localBrowserRun = localReferenceAgentBrowserAvailable();
    return {
      currentIndex: 2,
      title: localBrowserRun
        ? "Run the first Agent credit request"
        : "Hand off the first credit request",
      copy: localBrowserRun
        ? "The registered local Agent can now create the bounded request and return its deterministic Decision and Offer without exposing a credential to this browser."
        : "The credential-free application packet can now run read self, request credit, read application, and deterministic evaluation through the authenticated Agent API.",
      primaryLabel: localBrowserRun
        ? "Run local Agent application"
        : "Open application handoff",
      primaryAction: localBrowserRun ? "run-online-agent" : "open-handoff",
      identity: "CAIP-10 proof verified",
      authority: "Application handoff ready",
      protocol: "Application tools ready"
    };
  }
  if (packet.status === "runtime_ready") {
    const localBrowserRun = localReferenceAgentBrowserAvailable();
    return {
      currentIndex: 3,
      title: "Run and verify sandbox credit",
      copy: localBrowserRun
        ? "Run the registered local Agent once to accept the exact Offer, execute the no-funds Obligation, post synthetic repayment, and read Evidence."
        : "Use the active runtime handoff to accept the exact Offer, execute the no-funds Obligation, post repayment, and retain every receipt as Evidence.",
      primaryLabel: localBrowserRun
        ? "Complete sandbox Agent lifecycle"
        : "Open runtime handoff",
      primaryAction: localBrowserRun ? "run-online-agent" : "open-handoff",
      identity: "CAIP-10 proof verified",
      authority: "Runtime handoff ready",
      protocol: "Runtime-stage operations ready"
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
  const presentation = currentAgentConsolePresentation();
  const applicationHandoff = handoff?.status === "application_ready";
  const runtimeHandoff = handoff?.status === "ready";
  const controlledObligationCount = tenantPilot.workspaceObligations.length;
  const applicationOperationsAvailable = [
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication"
  ].every((operationId) => serverCatalogOperations.has(operationId));
  const economicOperationsAvailable = [
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment",
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence"
  ].every((operationId) => serverCatalogOperations.has(operationId));
  const applicationReady =
    applicationHandoff &&
    applicationOperationsAvailable &&
    presentation?.identity?.applicationEligible === true;
  const runtimeReady = runtimeHandoff && economicOperationsAvailable;

  el("agentRequestCreditStatus").textContent = controlledObligationCount > 0
    ? `${controlledObligationCount} controlled Obligation${controlledObligationCount === 1 ? "" : "s"}`
    : runtimeReady
    ? "Runtime ready · existing Offer required"
    : applicationReady
      ? "Application journey ready"
      : tenantPilot.connected
        ? "Principal setup required"
        : "Authenticated session required";
  el("agentRequestCreditStatus").classList.toggle(
    "neutral",
    controlledObligationCount === 0 && !applicationReady && !runtimeReady
  );
  el("agentRequestCreditAuthority").textContent = runtimeHandoff
    ? "Active Principal-approved Mandate"
    : applicationHandoff
      ? "Draft application Mandate"
      : "No eligible handoff";
  el("agentRequestCreditIntent").textContent = applicationReady
    ? "Ready · pilotRequestCredit"
    : runtimeReady
      ? "Closed · active Mandate cannot create a new Intent"
      : "Locked pending Draft handoff";
  el("agentRequestCreditDecision").textContent = applicationReady
    ? "Ready · deterministic policy + Passport"
    : runtimeReady
      ? "Draft only · new applications are closed"
      : "Locked pending Draft handoff";
  el("agentRequestCreditAcceptance").textContent = runtimeReady
    ? "Ready · exact Offer and terms hashes"
    : "Locked pending active Mandate";
  el("agentRequestCreditExecution").textContent = runtimeReady
    ? "Ready · signed non-withdrawable receipt"
    : "Locked pending active Mandate";
  el("agentRequestCreditOfferReceipt").textContent = agentOnlinePilot.offerReceipt
    ? `Verified · ${compactOpaqueId(agentOnlinePilot.offerReceipt.offer.creditOfferId)}`
    : applicationReady
      ? "Returns agent_credit_offer_workflow_receipt.v1"
    : runtimeReady
      ? "Required input · agent_credit_offer_workflow_receipt.v1"
      : "Returned only after Draft Agent workflow";
  el("agentRequestCreditObligationReceipt").textContent = agentOnlinePilot.runtimeResult
    ? `Verified · ${compactOpaqueId(agentOnlinePilot.runtimeResult.obligationId)}`
    : runtimeReady
      ? "agent_sandbox_obligation_workflow_receipt.v1"
    : "Returned only after active runtime workflow";
  el("agentRequestCreditCopy").textContent = applicationReady
    ? "The Draft Mandate lets the authenticated external Agent submit bounded request economics and persist a deterministic Decision, Offer, and versioned workflow receipt. This Principal browser only checks that server truth."
    : runtimeReady
      ? "The active Agent runtime exposes each economic step separately: create the shared Obligation, execute one approved non-withdrawable use, post repayment, then read Evidence. External Agents use the same protected API contract."
      : "A Human Principal must bind the Agent Subject and create an exact Draft Mandate before the Agent application tools become available.";
  el("agentRequestCreditNext").textContent = controlledObligationCount > 0
    ? "The Agent has created at least one controlled Obligation. Review its current schedule and repayment state through the shared Obligation workspace."
    : runtimeReady
      ? agentOnlinePilot.offerReceipt
        ? "Activation is complete and the matching Offer receipt is ready. Run the external Agent runtime handoff, then use the visible checks to recover Obligation, allowlisted spend, automatic repayment, and Evidence."
        : "Activation is complete, but no matching Offer or exact Obligation is currently recoverable. Use Check Agent progress for a read-only server refresh; this browser cannot start a new application or change active authority."
      : applicationReady
        ? "Run the external Agent application handoff now. Its persisted Offer receipt remains bound to this Mandate; then check progress and return to Principal setup to activate it."
        : "Activating a Mandate creates bounded authority; it does not create a Credit Intent, Offer, Obligation, execution, or repayment.";

  const primary = el("agentRequestPrimaryBtn");
  const secondary = el("agentRequestSecondaryBtn");
  if (controlledObligationCount > 0) {
    primary.textContent = "Review Agent obligations";
    primary.dataset.agentGuideAction = "view-obligations";
    secondary.textContent = "Open Agent workspace";
    secondary.dataset.agentGuideAction = "open-agent-workspace";
  } else if (runtimeReady || applicationReady) {
    primary.textContent = runtimeReady
      ? localReferenceAgentBrowserAvailable()
        ? "Complete sandbox Agent lifecycle"
        : "Check Agent progress"
      : agentOnlinePilot.offerReceipt
        ? "Review and activate Mandate"
        : localReferenceAgentBrowserAvailable()
          ? "Run local Agent application"
          : "Check for Agent Offer";
    primary.dataset.agentGuideAction = runtimeReady
      ? "run-online-agent"
      : applicationReady && !agentOnlinePilot.offerReceipt
        ? "run-online-agent"
        : "principal-setup";
    secondary.textContent = runtimeReady
      ? "Review Agent API contract"
      : "Optional developer handoff";
    secondary.dataset.agentGuideAction = runtimeReady
      ? "open-agent-api"
      : "open-handoff";
  } else {
    primary.textContent = "Open Principal setup";
    primary.dataset.agentGuideAction = "principal-setup";
    secondary.textContent = "Inspect Agent API";
    secondary.dataset.agentGuideAction = "view-protocol";
  }
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
      ? "Runtime-stage tools are Ready for an existing Offer receipt, including exact owned Obligation state, Credit State, Registry Evidence, and three no-funds economic commands. The thirteen-tool registry remains visible, but new application request and evaluation are Draft-only."
      : "This non-authorizing packet advertises thirteen local Agent operations and three staged workflows. The loopback OpenAPI describes the server boundary; credentials and funds authority remain outside the packet.";
  el("agentHandoffPhase").textContent = applicationReady
    ? "Application handoff"
    : runtimeReady
      ? "Runtime handoff"
      : "Agent API handoff";
  el("agentHandoffScope").textContent = applicationReady
    ? "Draft Mandate · Decision & Offer"
    : runtimeReady
      ? "Active Mandate · Post-application"
      : "Awaiting server authority";
  el("agentHandoffDescription").textContent = applicationReady
      ? "Copy the bounded draft packet for read self, request credit, read application, and deterministic evaluation."
    : runtimeReady
      ? "Continue with the Principal-activated runtime packet. New applications remain draft-only."
      : "A server-restored eligible Draft Mandate creates the application packet. Runtime Evidence and sandbox economic tools require an active Principal-approved Mandate.";
  const toolList = document.querySelector(".mcp-tool-list");
  toolList.classList.toggle("ready", ready);
  for (const status of document.querySelectorAll("[data-mcp-tool-status]")) {
    status.textContent = !ready
      ? "Waiting"
      : status.dataset.mcpToolStatus === "identity"
        ? agentAuthorityPilot.accountBinding?.accountBinding
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
  const subjectId = agentAuthorityPilot.subject?.subjectId ??
    agentAuthorityPilot.workspaceSelection?.subjectId ?? null;
  const mandateId = agentAuthorityPilot.mandate?.mandateId ??
    agentAuthorityPilot.workspaceSelection?.mandateId ?? null;
  const accountChain = tenantInputValue("agentAccountChain");
  const accountAddress = tenantInputValue("agentAccountAddress").toLowerCase();
  const accountPurpose = tenantInputValue("agentAccountPurpose");
  const accountProofInputReady =
    new Set(["eip155:84532", "eip155:1952"]).has(accountChain) &&
    /^0x[0-9a-f]{40}$/.test(accountAddress) &&
    new Set(["primary", "revenue", "repayment", "execution"]).has(accountPurpose);
  const mandate = agentAuthorityPilot.mandate;
  const subjectLoaded = Boolean(
    exactResourceId(subjectId) && agentAuthorityPilot.subject?.subjectId === subjectId
  );
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
  const exactContinuation = controlledAgentContinuationForMandate(
    tenantPilot.workspaceResume,
    mandate
  );
  const continuationReady = Boolean(
    exactContinuation &&
    agentOnlinePilot.offerReceipt?.mandateId === mandate?.mandateId &&
    agentOnlinePilot.offerReceipt?.offer?.creditOfferId ===
      exactContinuation.creditOfferId &&
    agentOnlinePilot.offerReceipt?.offer?.creditOfferHash ===
      exactContinuation.creditOfferHash
  );
  if (!continuationReady) {
    el("principalMandateAcknowledge").checked = false;
  }
  const acknowledged = el("principalMandateAcknowledge").checked;
  const principalWorkspace = hasPrincipalAgentAuthorityWorkspace();
  const workspaceRoleMismatch = hasWorkspaceSessionRoleMismatch();
  const privateBusy = tenantPilot.busy || agentAuthorityPilot.busy || !principalWorkspace;
  const principalWorkspaceUrl = localPrincipalWorkspaceUrl();

  el("agentAuthorityAccessGate").hidden = principalWorkspace;
  el("agentAuthorityWorkspaceContent").hidden = !principalWorkspace;
  el("openPrincipalWorkspaceLink").hidden = !principalWorkspaceUrl || principalWorkspace;
  el("switchPrincipalSessionBtn").hidden = !workspaceRoleMismatch;
  if (principalWorkspaceUrl) el("openPrincipalWorkspaceLink").href = principalWorkspaceUrl;
  if (!principalWorkspace) {
    const borrowerWorkspace = currentWorkspaceName() === "borrower";
    el("agentAuthorityAccessTitle").textContent = workspaceRoleMismatch
      ? `${workspaceKindLabel(tenantPilot.workspaceKind)} session detected`
      : borrowerWorkspace
      ? "Continue in the Principal workspace"
      : "Principal workspace required";
    el("agentAuthorityAccessCopy").textContent = workspaceRoleMismatch
      ? `This page requires the ${expectedWorkspaceLabel()} role, but the shared local host cookie currently identifies a ${workspaceKindLabel(tenantPilot.workspaceKind)} session. Switch sessions, then sign in again with the invited wallet.`
      : borrowerWorkspace
      ? "This Borrower workspace can request and repay credit, but it cannot create authority for an Agent. Open the separate Principal workspace and sign in with the invited wallet; no Borrower permission will be widened."
      : "Only an authenticated Principal Controller can create an Agent Subject, issue an account-proof request, or activate a Mandate.";
  }

  const exactAgentSelected = agentAuthorityPilot.workspaceSelection?.status === "selected";
  el("agentAuthoritySelectedWorkflow").hidden = !exactAgentSelected;
  el("agentAuthorityReviewPanel").hidden = !exactAgentSelected || !mandate;
  el("agentSubjectCreationControls").hidden = Boolean(subjectId);
  el("agentAccountProofStage").hidden = !subjectLoaded || accountBound;
  el("agentMandateStage").hidden = !subjectLoaded || !accountBound || Boolean(mandateId);
  el("agentApplicationStageSection").hidden = !exactDraftLoaded || !accountBound;
  el("agentActivationStage").hidden = !continuationReady || mandate?.status === "active";
  el("agentRuntimeStage").hidden = mandate?.status !== "active";
  el("createPrivateAgentSubjectBtn").hidden = !exactAgentSelected || Boolean(subjectId);
  el("createPrivateAgentSubjectBtn").disabled = privateBusy;
  el("createAccountChallengeBtn").disabled = privateBusy || !subjectLoaded || !accountProofInputReady || subjectKnownActive || accountBound || challengeOpen;
  el("agentAccountAddress").setAttribute(
    "aria-invalid",
    subjectId && !accountProofInputReady ? "true" : "false"
  );
  el("agentAccountAddressHelper").textContent = !accountAddress
    ? "Enter the reviewed public sandbox Agent EVM address. No private key or signer belongs in this field."
    : !/^0x[0-9a-f]{40}$/.test(accountAddress)
      ? "The sandbox Agent address must be one exact 20-byte EVM address beginning with 0x."
      : "Public test-chain account ready. The external Agent runner remains the only proof signer.";
  el("proveAccountOnlineBtn").hidden =
    accessState.authenticationProfile !== "local_no_funds";
  el("proveAccountOnlineBtn").disabled = privateBusy || !challengeOpen;
  el("copyAccountChallengeBtn").disabled = privateBusy || !challengeOpen;
  el("downloadAccountChallengeBtn").disabled = privateBusy || !challengeOpen;
  el("refreshAccountBindingBtn").disabled = privateBusy || !subjectId;
  el("createDraftMandateBtn").hidden = !subjectLoaded || Boolean(mandateId);
  el("createDraftMandateBtn").disabled = privateBusy;
  const applicationReady = exactDraftLoaded && accountBound;
  el("openAgentApplicationHandoffBtn").disabled = privateBusy || !applicationReady;
  el("openAgentApplicationHandoffBtn").textContent =
    localReferenceAgentBrowserAvailable()
      ? "Run local Agent application"
      : "Open application handoff";
  el("openAgentApplicationHandoffBtn").dataset.agentGuideAction =
    localReferenceAgentBrowserAvailable() ? "run-online-agent" : "open-handoff";
  el("principalMandateAcknowledge").disabled =
    privateBusy || !exactDraftLoaded || !accountBound || !continuationReady;
  el("activateMandateBtn").disabled =
    privateBusy || !exactDraftLoaded || !acknowledged || !accountBound ||
    !continuationReady;
  el("continueAgentCreditBtn").disabled = privateBusy || mandate?.status !== "active";
  el("agentAuthorityHelper").textContent = agentAuthorityPilot.helper;
  el("agentWorkspaceSelectionStatus").textContent = {
    selected: subjectId ? "Assigned Agent restored" : "Assigned Agent ready",
    empty: "No Agent assigned",
    ambiguous: "Agent selection required",
    unavailable: "Agent workspace unavailable"
  }[agentAuthorityPilot.workspaceSelection?.status] ?? "Checking Agent assignment";
  el("agentWorkspaceSelectionHelper").textContent =
    agentAuthorityPilot.workspaceSelection?.status === "selected"
      ? "The assignment was restored from authenticated server truth. Internal locators stay in technical details."
      : agentAuthorityPilot.helper;
  el("agentApplicationStageStatus").textContent = mandate?.status === "active"
    ? "Application stage closed"
    : continuationReady
      ? "Offer ready for review"
      : applicationReady
        ? localReferenceAgentBrowserAvailable()
          ? "Local Agent application ready"
          : "Application handoff ready"
      : exactDraftLoaded
        ? "Account proof required"
        : "Restore or create a Draft Mandate";
  el("agentApplicationStageCopy").textContent = mandate?.status === "active"
    ? "This Mandate is already active and cannot start a new Credit Intent. Use Check Agent progress to restore its exact Offer or durable Obligation without changing authority."
    : continuationReady
      ? "The exact Agent Offer was restored from durable server truth. Review the immutable Mandate and terms before activation."
      : applicationReady
        ? localReferenceAgentBrowserAvailable()
          ? "Run the registered local Agent here. It keeps its credential server-side and persists the exact Request → Decision → Offer receipt before Principal activation."
          : "Open the application handoff and let the registered Agent Host run Request → Decision → Offer. Return here and check for its persisted workflow receipt before activating this exact Mandate."
      : exactDraftLoaded
        ? "Complete the Agent account proof first. Application calls require an active Agent Subject even while the Mandate remains Draft."
        : "Activation does not run the application. Restore or create a Draft Mandate to expose the credential-free application handoff.";

  const statusLabel = !principalWorkspace
    ? "Principal access required"
    : mandate?.status === "active"
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
  el("agentAccountChallengeStatus").textContent = accountBound
    ? "Consumed"
    : challengeExpired
      ? "Expired · create a new request"
      : challenge
        ? `Open · ${new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date(challenge.expiresAt))}`
      : "Not created";
  el("agentAccountAgentAction").textContent = accountBound
    ? "Proof verified"
    : challengeExpired
      ? "New request required"
    : challenge
      ? accessState.authenticationProfile === "local_no_funds"
        ? "Ready for online proof"
        : "Submit through Agent API"
      : "Waiting for signing request";
  el("agentAccountActivationStatus").textContent = accountBound
    ? "Subject active"
    : subjectPending
      ? "Subject pending"
      : "Assigned Subject unavailable";
  el("agentAccountChallengePreview").textContent = challenge
    ? `${challengeExpired ? "EXPIRED — do not sign or submit this request.\n\n" : ""}${JSON.stringify(challenge, null, 2)}`
    : "Create a signing request to view the closed EIP-712 payload.";
  el("agentAccountProofNextStep").textContent = accountBound
    ? "Account proof verified. Continue to Draft bounded sandbox authority."
    : challengeExpired
      ? "This one-use request expired. Create and download a new signing request."
      : challenge
        ? agentAccountProofInstruction()
        : subjectId && !accountProofInputReady
          ? "Enter the reviewed public sandbox Agent EVM address before creating the signing request."
        : subjectId
          ? "Create a signing request, then let the registered Agent Host submit the one-use proof."
          : "Restore or create the assigned Agent Subject before requesting account proof.";
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
  const evidenceState = currentOwnedEvidenceVerificationState();
  const evidenceLatestProven = evidenceState === "latest_proven";
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
    title: evidenceLatestProven
      ? "Your sandbox lifecycle is complete"
      : evidenceState === "partial"
        ? "Repayment complete; Evidence is partial"
        : evidenceState === "delayed"
          ? "Repayment complete; Evidence is delayed"
          : "Verify your completed lifecycle",
    copy: evidenceLatestProven
      ? "Your Obligation is fully repaid and its latest redacted immutable Evidence is proven. Earlier records may remain outside the browser cap."
      : evidenceState === "partial"
        ? "The bounded timeline is loaded, but the latest event is not yet proven. Continue the read-only cursor from Activity & Proofs."
        : evidenceState === "delayed"
          ? "The repayment remains successful, but its latest Evidence is not visible yet. Retry only the Evidence read; repayment will not be resubmitted."
          : evidenceState === "loading"
            ? "The repayment remains successful while its owner-authorized Evidence is being read."
            : "Your Obligation is fully repaid. Load its redacted immutable timeline to verify the lifecycle from acceptance through repayment.",
    status: evidenceLatestProven ? "Complete" : "Evidence check required",
    action: "verify-evidence",
    actionLabel: evidenceLatestProven
      ? "Review Evidence"
      : evidenceState === "partial"
        ? "Continue Evidence"
        : evidenceState === "delayed"
          ? "Retry Evidence read"
          : "Verify Evidence",
    secondaryAction: "start-new",
    secondaryLabel: "Start another request",
    checkpoints,
    currentIndex: -1,
    journey: evidenceLatestProven ? "Lifecycle complete" : "Repayment complete"
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
    button.disabled = guide.action === "none" || (
      tenantPilot.connected && !hasHumanBorrowerWorkspace()
    );
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
  el("humanIdentitySummaryText").textContent = subjectReadyLabel();
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
  const workspaceMatchesMode =
    (humanMode && tenantPilot.workspaceKind === "human_borrower") ||
    (!humanMode && tenantPilot.workspaceKind === "principal_controller");
  const visible = tenantPilot.connected &&
    workspaceMatchesMode &&
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
      ? "Every visible value was refreshed through an exact Actor-authorized server read. Browser state is not financial truth."
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

function currentOwnedEvidenceLoaded() {
  const obligationId = tenantPilot.obligation?.obligationId;
  return Boolean(
    obligationId &&
    ownedEvidence.queried &&
    ownedEvidence.obligationId === obligationId
  );
}

function currentOwnedEvidenceVerificationState() {
  const obligationId = tenantPilot.obligation?.obligationId;
  return ownedEvidenceVerificationState({
    busy: ownedEvidence.busy,
    error: ownedEvidence.error,
    expectedMarker: Boolean(ownedEvidence.expectedMarker),
    hasMore: ownedEvidence.hasMore,
    itemCount: ownedEvidence.items.length,
    queried: ownedEvidence.queried,
    resourceMatches: Boolean(
      obligationId && ownedEvidence.obligationId === obligationId
    )
  });
}

function currentOwnedEvidenceLatestProven() {
  return currentOwnedEvidenceVerificationState() === "latest_proven";
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
  identifier.textContent = `Position ${String(index + 1).padStart(2, "0")}`;
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
  refresh.hidden = !connected || positions.length === 0;
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
  el("obligationDetailIdentifier").textContent = "Current position";
  el("obligationDetailIdentifier").title = "";
  el("obligationDetailStatus").textContent =
    `${titleize(presentation.lifecycle.status)} · ${servicingClassificationLabel(presentation.lifecycle.servicingClassification)}`;
  el("obligationDetailStatus").className =
    `state-pill ${presentation.lifecycle.daysPastDue > 0 ? "warning" : "neutral"}`;
  el("obligationDetailAuthority").textContent =
    `${presentation.authority.label} · ${titleize(presentation.relationship)}`;
  el("obligationDetailAuthorityId").textContent = compactOpaqueId(presentation.obligationId);
  el("obligationDetailAuthorityId").title = presentation.obligationId;
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
  const caseObligation = obligation;
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
  const closedNextButton = el("servicingClosedNextBtn");
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

  if (!presentation) {
    empty.hidden = false;
    content.hidden = true;
    el("servicingCaseEmptyTitle").textContent = caseObligation
      ? "Case verification unavailable"
      : humanMode
        ? "No active case"
        : "No Agent Obligation yet";
    el("servicingCaseEmptyCopy").textContent = caseObligation
      ? "This Obligation did not pass the closed lifecycle, schedule, trusted-time, and sandbox safety checks. Refresh it through an authenticated workflow before servicing."
      : humanMode
        ? "Accept and execute one exact sandbox Obligation to open its servicing view."
        : agentAuthorityPilot.mandate?.status === "active"
          ? "Activation created bounded authority, not a loan. Let the authenticated Agent complete its credit workflow, then return here to review the exact schedule and repayment state."
          : "The Human Principal must activate a scoped Mandate before the Agent can request credit.";
    status.textContent = caseObligation
      ? "Verification failed"
      : agentAuthorityPilot.mandate?.status === "active" && !humanMode
        ? "Awaiting Agent credit"
        : "No Obligation";
    status.className = caseObligation ? "state-pill warning" : "state-pill neutral";
    actionButton.disabled = true;
    closedNextButton.hidden = true;
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
        ? "Early partial or full repayment is available now; no due-date wait or prepayment penalty applies. Allocation follows fee, interest, then principal."
        : "This Obligation is fully repaid. No balance remains to repay.";
  if (!humanMode) {
    el("servicingCureSummary").textContent =
      "Read-only Principal view. The authenticated Agent must post any repayment through its active Mandate; this screen cannot impersonate the Agent.";
  }

  const amountInput = el("servicingRepaymentAmount");
  const sourceInput = el("servicingRepaymentSource");
  const suggestionKey = `${presentation.obligationId}:${presentation.totalRepaidMinor}:${presentation.suggestedPaymentMinor}`;
  if (amountInput.dataset.suggestionKey !== suggestionKey && document.activeElement !== amountInput) {
    amountInput.value = (Number(asBigInt(presentation.suggestedPaymentMinor)) / 100).toFixed(2);
    amountInput.dataset.suggestionKey = suggestionKey;
    if (document.activeElement !== el("humanRepaymentAmount")) {
      el("humanRepaymentAmount").value = amountInput.value;
    }
  }
  const repayment = tenantPilot.repayment;
  const fullyRepaid = asBigInt(presentation.outstandingMinor) === 0n;
  el("servicingCaseActionResult").textContent = presentation.latestAction
    ? `${titleize(presentation.latestAction.actionType)} confirmed · ${presentation.latestAction.reasonCode} · no production funds moved.`
    : repayment
      ? `Applied ${usdMinorToMoney(repayment.appliedMinor)} through the deterministic waterfall.`
      : "Fee → interest → principal. Cure is confirmed only by the returned Obligation.";
  amountInput.disabled = !humanMode || fullyRepaid;
  sourceInput.disabled = !humanMode || fullyRepaid;
  actionButton.disabled = !humanMode || tenantPilot.busy || !tenantPilot.connected ||
    !presentation.repaymentAvailable || !validServicingRepaymentInput();
  actionButton.lastChild.textContent = !humanMode
    ? "Agent-authenticated repayment required"
    : presentation.cureAvailable
      ? "Confirm past due cure"
      : "Confirm early or scheduled repayment";
  closedNextButton.hidden = !humanMode || !fullyRepaid;
  closedNextButton.textContent = tenantPilot.workspaceObligations.some(
    ({ resourceId }) => resourceId !== presentation.obligationId
  )
    ? "Choose another position"
    : "Start a new credit request";

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
  if (currentView === "overview") {
    el("viewEyebrow").textContent = VIEW_META.overview.eyebrow;
    return;
  }
  if (![
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
  renderExecutionWallet();
}

const EXECUTION_WALLET_OPERATION_IDS = Object.freeze([
  "walletPrepareAccountBinding",
  "walletSubmitAccountBinding",
  "walletReadAccountBindings",
  "walletRevokeAccountBinding",
  "walletDiscoverCapabilities",
  "walletPrepareGrant",
  "walletActivateGrant",
  "walletReadGrant",
  "walletRevokeGrant",
  "walletPrepareExecution",
  "walletApproveExecution",
  "walletSubmitExecution",
  "walletReadExecution"
]);

function executionWalletSubjectId() {
  if (currentWorkspaceName() === "borrower") {
    const value = tenantInputValue("humanSubjectId");
    return exactResourceId(value) ? value : null;
  }
  const value = agentAuthorityPilot.subject?.subjectId ??
    agentAuthorityPilot.workspaceSelection?.subjectId;
  return exactResourceId(value) ? value : null;
}

function executionWalletChain() {
  return SUPPORTED_WALLET_CHAINS[accessState.selectedChainId] ?? null;
}

function executionWalletAddress() {
  const accountId = executionWalletPilot.connectedAccountId;
  const address = typeof accountId === "string" ? accountId.split(":").at(-1) : null;
  return /^0x[0-9a-f]{40}$/.test(address ?? "") ? address : null;
}

function renderExecutionWallet() {
  const subjectId = executionWalletSubjectId();
  const chain = executionWalletChain();
  const address = executionWalletAddress();
  const binding = executionWalletPilot.activeBinding;
  const grant = executionWalletPilot.grant;
  const execution = executionWalletPilot.execution;
  const preflight = execution?.preflightReceipt ??
    execution?.preflights?.at(-1)?.preflightReceipt ?? null;
  const allOperationsAvailable = EXECUTION_WALLET_OPERATION_IDS.every(
    (operationId) => serverCatalogOperations.has(operationId)
  );
  executionWalletPilot.catalogAvailable = allOperationsAvailable;
  const available = tenantPilot.connected && allOperationsAvailable;
  const bindingCurrent = Boolean(
    binding && binding.status === "active" && binding.subjectId === subjectId &&
    binding.chainId === chain?.caip2
  );
  const grantPrepared = grant?.status === "prepared";
  const grantActive = grant?.status === "active";
  const busy = executionWalletPilot.busy;

  el("executionAccountStatus").textContent = bindingCurrent
    ? "Verified · zero authority"
    : address
      ? "Connected · proof required"
      : "Not connected";
  el("executionAccountStatus").className =
    `state-pill ${bindingCurrent ? "" : "neutral"}`.trim();
  el("executionAccountSubject").textContent = subjectId
    ? compactOpaqueId(subjectId)
    : "Create or recover a Subject";
  el("executionAccountSubject").title = subjectId ?? "";
  el("executionAccountAddress").textContent = address
    ? shortWalletAddress(address)
    : "Not connected";
  el("executionAccountAddress").title = address ?? "";
  el("executionAccountNetwork").textContent = chain?.name ?? "Not selected";
  el("executionAccountBinding").textContent = bindingCurrent
    ? `${titleize(binding.status)} · ${binding.verificationMethod}`
    : "Not verified";
  el("executionAccountBinding").title = binding?.accountBindingId ?? "";
  el("executionAccountHelper").textContent = executionWalletPilot.helper;

  el("executionConnectBtn").disabled =
    busy || !available || !subjectId || !accessState.selectedWalletProviderId;
  el("executionBindBtn").disabled = busy || !available || !subjectId || !address || bindingCurrent;
  el("executionRefreshBindingsBtn").disabled = busy || !available || !subjectId;
  el("executionDisconnectBtn").disabled = busy || !address;
  el("executionRevokeBindingBtn").disabled = busy || !available || !bindingCurrent;
  el("executionDiscoverBtn").disabled = busy || !available;
  el("executionPrepareGrantBtn").disabled = busy || !available || !bindingCurrent || Boolean(grant);
  el("executionActivateGrantBtn").disabled = busy || !available || !grantPrepared;
  el("executionPrepareBtn").disabled = busy || !available || !grantActive ||
    !exactResourceId(el("executionTransferIntentId").value.trim());
  el("executionReadBtn").disabled = busy || !available || !execution?.preparedExecution?.executionId;
  el("executionRevokeGrantBtn").disabled = busy || !available || !new Set(["prepared", "active"]).has(grant?.status);

  el("boundedExecutionStatus").textContent = preflight
    ? preflight.decision
    : grantActive
      ? "Bounded grant active"
      : "No authority derived";
  el("boundedExecutionStatus").className =
    `state-pill ${preflight?.decision === "DENY" ? "warning" : grantActive || preflight ? "" : "warning"}`.trim();
  el("boundedExecutionGrant").textContent = grant
    ? `${titleize(grant.status)} · ${compactOpaqueId(grant.grantId)}`
    : "Not prepared";
  el("boundedExecutionGrant").title = grant?.grantId ?? "";
  el("boundedExecutionCapacity").textContent = grant
    ? `${usdMinorToMoney(grant.perTxLimitMinor)} per action · ${usdMinorToMoney(grant.aggregateLimitMinor)} aggregate`
    : "Zero until derived";
  el("boundedExecutionPreflight").textContent = preflight
    ? `${preflight.decision} · ${preflight.reasonCodes.join(", ")}`
    : "Not run";
  el("boundedExecutionPreflight").title = preflight?.preflightHash ?? "";
  el("boundedExecutionSubmission").textContent =
    "Disabled · local no-funds · no transaction broadcast";
  el("boundedExecutionHelper").textContent = executionWalletPilot.executionHelper;
}

async function runExecutionWalletAction(buttonId, busyMessage, operation, successMessage) {
  if (executionWalletPilot.busy) return;
  executionWalletPilot.busy = true;
  executionWalletPilot.error = false;
  executionWalletPilot.helper = busyMessage;
  executionWalletPilot.executionHelper = busyMessage;
  const button = el(buttonId);
  button?.setAttribute("aria-busy", "true");
  renderWalletPermissionMatrix();
  try {
    await operation();
    executionWalletPilot.helper = successMessage;
    executionWalletPilot.executionHelper = successMessage;
    toast(successMessage);
    announce(successMessage);
  } catch (error) {
    const requestSuffix = error.requestId ? ` Request ID: ${error.requestId}` : "";
    const message = `${error.message}${requestSuffix}`;
    executionWalletPilot.error = true;
    executionWalletPilot.helper = message;
    executionWalletPilot.executionHelper = message;
    toast(message, "error");
    announce(`Execution account operation failed. ${error.message}`);
  } finally {
    executionWalletPilot.busy = false;
    button?.removeAttribute("aria-busy");
    renderAccess();
    renderWalletPermissionMatrix();
  }
}

async function connectExecutionAccount() {
  return runExecutionWalletAction(
    "executionConnectBtn",
    "Waiting for the selected wallet to connect one approved execution account…",
    async () => {
      const connector = walletProviderRegistry.getSelectedConnector();
      const chain = executionWalletChain();
      if (!connector || !chain) throw new Error("Select one discovered wallet and approved network first.");
      const connection = await connector.connect({ chainId: chain.caip2 });
      const account = connection.accounts[0];
      if (!account || connection.chainId !== chain.caip2) {
        throw new Error("The wallet did not return one account on the selected approved network.");
      }
      executionWalletPilot.connectedAccountId = account.accountId;
      accessState.walletAddress = account.address;
      accessState.connectedChainId = chain.chainId;
    },
    "Execution account connected. IPO.ONE authentication, Tenant, Actor, Role, and authority are unchanged."
  );
}

async function refreshExecutionAccountBindings({ quiet = false } = {}) {
  const subjectId = executionWalletSubjectId();
  if (!subjectId) throw new Error("Create or recover the current workspace Subject first.");
  const result = await tenantApi("walletReadAccountBindings", {
    resource: { resourceType: "subject", resourceId: subjectId },
    payload: {},
    idempotent: false
  });
  executionWalletPilot.bindings = result.response.accounts;
  const chainId = executionWalletChain()?.caip2;
  executionWalletPilot.activeBinding = result.response.accounts.find(
    (binding) => binding.status === "active" && binding.chainId === chainId
  ) ?? null;
  if (!quiet) {
    executionWalletPilot.helper = executionWalletPilot.activeBinding
      ? "Current server AccountBinding loaded. It grants zero execution authority by itself."
      : "No active execution AccountBinding exists for the selected approved network.";
  }
  return result;
}

async function bindExecutionAccount() {
  return runExecutionWalletAction(
    "executionBindBtn",
    "Preparing a one-use EIP-712 execution AccountBinding proof…",
    async () => {
      const connector = walletProviderRegistry.getSelectedConnector();
      const subjectId = executionWalletSubjectId();
      const accountId = executionWalletPilot.connectedAccountId;
      if (!connector || !subjectId || !accountId) {
        throw new Error("Connect one execution account to the current Subject first.");
      }
      const challenge = await tenantApi("walletPrepareAccountBinding", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: { accountId }
      });
      const signature = await connector.signTypedData({
        accountId,
        typedData: challenge.response.typedData
      });
      const verified = await tenantApi("walletSubmitAccountBinding", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: {
          challengeId: challenge.response.challengeId,
          accountId,
          signature
        }
      });
      executionWalletPilot.activeBinding = verified.response.accountBinding;
      await refreshExecutionAccountBindings({ quiet: true });
    },
    "AccountBinding verified. It created no login session, Role, credit authority, or funds authority."
  );
}

async function revokeExecutionAccountBindingAction() {
  return runExecutionWalletAction(
    "executionRevokeBindingBtn",
    "Revoking the exact execution AccountBinding…",
    async () => {
      const subjectId = executionWalletSubjectId();
      const binding = executionWalletPilot.activeBinding;
      if (!subjectId || !binding) throw new Error("No active AccountBinding is selected.");
      const result = await tenantApi("walletRevokeAccountBinding", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: { accountBindingId: binding.accountBindingId }
      });
      executionWalletPilot.activeBinding = result.response.accountBinding;
      executionWalletPilot.grant = null;
      executionWalletPilot.execution = null;
      await refreshExecutionAccountBindings({ quiet: true });
    },
    "Execution AccountBinding revoked. The IPO.ONE login session remains active."
  );
}

function disconnectExecutionAccount() {
  executionWalletPilot.connectedAccountId = null;
  accessState.walletAddress = null;
  accessState.connectedChainId = null;
  executionWalletPilot.helper =
    "Execution account disconnected from this product context. The IPO.ONE login session and durable AccountBinding remain unchanged.";
  renderAccess();
  renderWalletPermissionMatrix();
}

async function discoverExecutionCapabilities() {
  return runExecutionWalletAction(
    "executionDiscoverBtn",
    "Reading the server execution capability descriptor…",
    async () => {
      const result = await tenantApi("walletDiscoverCapabilities", {
        resource: { resourceType: "wallet_adapter", resourceId: "adapter_local_sandbox" },
        payload: {},
        idempotent: false
      });
      executionWalletPilot.capabilities = result.response;
    },
    "Local exact resolver available. External calls and transaction submission remain disabled."
  );
}

async function prepareExecutionGrant() {
  return runExecutionWalletAction(
    "executionPrepareGrantBtn",
    "Deriving bounded capacity from current Mandate, SpendPolicy, CreditLine, Obligation, and AccountBinding…",
    async () => {
      const subjectId = executionWalletSubjectId();
      const binding = executionWalletPilot.activeBinding;
      const providerId = el("executionProviderId").value.trim();
      const chainId = executionWalletChain()?.caip2;
      if (!subjectId || !binding || !exactResourceId(providerId) || !chainId) {
        throw new Error("A current Subject, active AccountBinding, and exact approved Provider are required.");
      }
      const result = await tenantApi("walletPrepareGrant", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: {
          providerId,
          accountBindingId: binding.accountBindingId,
          chainId,
          requestedExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          sessionEpoch: 0,
          nonce: tenantRequestToken("execution_grant_nonce")
        }
      });
      executionWalletPilot.grant = result.response.grant;
      executionWalletPilot.targetPolicies = result.response.targetPolicies;
      executionWalletPilot.execution = null;
    },
    "Bounded grant prepared from canonical server authority. Wallet connection added no capacity."
  );
}

async function activateExecutionGrant() {
  return runExecutionWalletAction(
    "executionActivateGrantBtn",
    "Activating the exact local no-funds grant projection…",
    async () => {
      const grant = executionWalletPilot.grant;
      if (!grant) throw new Error("Prepare one bounded grant first.");
      const result = await tenantApi("walletActivateGrant", {
        resource: { resourceType: "delegated_wallet_grant", resourceId: grant.grantId },
        payload: { expectedGrantHash: grant.grantHash }
      });
      executionWalletPilot.grant = result.response.grant;
    },
    "Local grant active. Transactions remain disabled until a separately approved release profile exists."
  );
}

async function prepareExactExecution() {
  return runExecutionWalletAction(
    "executionPrepareBtn",
    "Resolving the authorized TransferIntent and atomically recording simulation and preflight Evidence…",
    async () => {
      const grant = executionWalletPilot.grant;
      const transferIntentId = el("executionTransferIntentId").value.trim();
      if (!grant || grant.status !== "active" || !exactResourceId(transferIntentId)) {
        throw new Error("An active grant and exact authorized TransferIntent are required.");
      }
      const result = await tenantApi("walletPrepareExecution", {
        resource: { resourceType: "delegated_wallet_grant", resourceId: grant.grantId },
        payload: { transferIntentId }
      });
      executionWalletPilot.execution = result.response;
      const refreshedGrant = await tenantApi("walletReadGrant", {
        resource: { resourceType: "delegated_wallet_grant", resourceId: grant.grantId },
        payload: {},
        idempotent: false
      });
      executionWalletPilot.grant = refreshedGrant.response.grant;
    },
    "Exact execution prepared, simulated, and preflighted in one Gateway-owned atomic commit. No transaction was submitted."
  );
}

async function readExactExecution() {
  return runExecutionWalletAction(
    "executionReadBtn",
    "Reloading the exact durable execution receipt…",
    async () => {
      const executionId = executionWalletPilot.execution?.preparedExecution?.executionId;
      if (!executionId) throw new Error("No prepared execution is selected.");
      const result = await tenantApi("walletReadExecution", {
        resource: { resourceType: "wallet_execution", resourceId: executionId },
        payload: {},
        idempotent: false
      });
      executionWalletPilot.execution = result.response;
    },
    "Durable prepared execution, simulation, and preflight receipt reloaded from server truth."
  );
}

async function revokeExecutionGrantAction() {
  return runExecutionWalletAction(
    "executionRevokeGrantBtn",
    "Revoking the exact bounded grant and releasing pending exposure…",
    async () => {
      const grant = executionWalletPilot.grant;
      if (!grant) throw new Error("No current grant is selected.");
      const result = await tenantApi("walletRevokeGrant", {
        resource: { resourceType: "delegated_wallet_grant", resourceId: grant.grantId },
        payload: {},
        reasonCode: "operator_request"
      });
      executionWalletPilot.grant = result.response.grant;
    },
    "Bounded grant revoked. The login session and AccountBinding remain separate and unchanged."
  );
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

  const trackRecordState = currentOwnedEvidenceVerificationState();
  if (creditStatePilot.projection) {
    const { projection } = creditStatePilot;
    el("creditTrackRecordStateTitle").textContent =
      `${projection.metrics.completedCycleCount} completed credit cycle${projection.metrics.completedCycleCount === 1 ? "" : "s"}`;
    el("creditTrackRecordStateCopy").textContent =
      `${titleize(projection.latestOutcome.outcomeLabel)} is the latest terminal Credit Outcome. ` +
      `State ${compactDecisionProofHash(projection.creditStateHash)} was rebuilt from finalized outcomes only; it does not authorize funds or an automatic limit change.`;
  } else if (creditStatePilot.error) {
    el("creditTrackRecordStateTitle").textContent = "Credit State not available yet";
    el("creditTrackRecordStateCopy").textContent = creditStatePilot.helper;
  } else if (tenantPilot.obligation && trackRecordState === "latest_proven") {
    el("creditTrackRecordStateTitle").textContent = "Latest lifecycle Evidence verified";
    el("creditTrackRecordStateCopy").textContent =
      `${ownedEvidence.items.length} latest bounded Evidence event${ownedEvidence.items.length === 1 ? "" : "s"} loaded for the selected owned Obligation. Earlier events may remain outside the browser cap.`;
  } else if (tenantPilot.obligation && trackRecordState === "partial") {
    el("creditTrackRecordStateTitle").textContent = "Partial lifecycle Evidence";
    el("creditTrackRecordStateCopy").textContent =
      `${ownedEvidence.items.length} bounded event${ownedEvidence.items.length === 1 ? " is" : "s are"} visible, but the latest lifecycle event is not yet proven. Continue the read-only cursor.`;
  } else if (tenantPilot.obligation && trackRecordState === "delayed") {
    el("creditTrackRecordStateTitle").textContent = "Latest Evidence delayed";
    el("creditTrackRecordStateCopy").textContent =
      "The lifecycle action remains accepted, but its expected Evidence is not visible yet. Retry only the Evidence read; no economic command will be resubmitted.";
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
  const evidenceState = currentOwnedEvidenceVerificationState();
  const evidenceLoaded = currentOwnedEvidenceLoaded();
  const evidenceLatestProven = evidenceState === "latest_proven";
  const visibleEvidenceItems = evidenceLoaded ? ownedEvidence.items : [];
  const finalities = new Set(visibleEvidenceItems.map((item) => item.sourceFinality));
  const evidenceFinality = finalities.size === 0
    ? "Waiting"
    : finalities.size === 1
      ? titleize([...finalities][0])
      : `${finalities.size} states`;

  el("privatePortfolioMode").textContent = humanMode ? "Human Workspace" : "Agent Workspace";
  el("privatePortfolioCopy").textContent = humanMode
    ? "Review your current credit position, next payment, and verified activity from one Human workspace."
    : "Review Principal-approved Agent authority, active obligations, and verified activity from one Agent workspace.";
  el("privatePortfolioLifecycle").textContent = humanMode ? humanStatus : agentStatus;
  el("privatePortfolioOutstanding").textContent = obligation
    ? usdMinorToMoney(obligation.outstandingPrincipalMinor)
    : tenantPilot.connected
      ? "No selected Obligation"
      : "Unavailable";
  el("privatePortfolioNextPayment").textContent = nextInstallment
    ? `${usdMinorToMoney(privateInstallmentAmount(nextInstallment))}\nDue ${privateDate(nextInstallment.dueAt, { month: "short", day: "numeric" })}`
    : "—";
  el("privatePortfolioAvailableCredit").textContent = "Unavailable";
  el("privatePortfolioAvailableCredit").title =
    "No authenticated server operation currently returns available credit.";
  el("privatePortfolioEvidence").textContent = evidenceLatestProven
    ? `${visibleEvidenceItems.length} latest verified`
    : evidenceState === "partial"
      ? `${visibleEvidenceItems.length} partial`
      : evidenceState === "delayed"
        ? "Verification delayed"
        : evidenceState === "loading"
          ? "Loading"
    : obligation
      ? "Available"
      : "Not loaded";
  setPrivateAction(
    el("privatePortfolioPrimaryBtn"),
    humanMode ? "human-credit" : mandate?.status === "active" ? "agent-api" : "principal-authority",
    humanMode ? obligation ? "Review current credit" : "Start a credit request" : mandate?.status === "active" ? "Open Agent workspace" : "Set up Agent authority"
  );
  setPrivateAction(
    el("privatePortfolioSecondaryBtn"),
    humanMode ? "principal-authority" : "human-credit",
    humanMode ? "Set up Agent authority" : "Switch to Human credit"
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

  const repaymentEvidenceComplete =
    obligation?.status === "fully_repaid" && evidenceLatestProven;
  const repaymentEvidenceStatus = repaymentEvidenceComplete
    ? "Lifecycle repaid · latest Evidence proven"
    : obligation?.status === "fully_repaid" && evidenceState === "partial"
      ? `Repayment complete · ${visibleEvidenceItems.length} partial Evidence events`
      : obligation?.status === "fully_repaid" && evidenceState === "delayed"
        ? "Repayment complete · latest Evidence delayed"
      : obligation?.status === "fully_repaid"
        ? "Repayment complete · Evidence not loaded"
        : evidenceState === "partial"
          ? `${visibleEvidenceItems.length} partial Evidence events loaded`
          : evidenceState === "delayed"
            ? "Latest Evidence verification delayed"
          : "Owner and Agent reads remain permission-bound";
  const checkpoints = [
    ["Identity & authority", tenantPilot.intent || offer || obligation ? "Human Consent verified" : agentAuthorityPilot.subject ? agentStatus : "Create Human Subject or Agent authority", Boolean(tenantPilot.intent || offer || obligation || agentAuthorityPilot.subject)],
    ["Decision & Offer", offer ? `${titleize(decision?.status)} · ${usdMinorToMoney(offer.approvedPrincipalMinor)}` : "Awaiting deterministic evaluation", Boolean(offer)],
    ["Shared Obligation", obligation ? `${titleize(obligation.status)} · schedule v${obligation.scheduleSequence ?? 1}` : "Awaiting exact Offer acceptance", Boolean(obligation)],
    ["Sandbox execution", obligation?.executionStatus === "executed" ? "Signed non-withdrawable receipt verified" : "No production funds can move", obligation?.executionStatus === "executed"],
    ["Repayment & Evidence", repaymentEvidenceStatus, repaymentEvidenceComplete]
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
  const fullyRepaidServicingCase = Boolean(
    servicingCase && asBigInt(servicingCase.outstandingMinor) === 0n
  );
  setPrivateAction(
    el("privatePaymentsPrimaryBtn"),
    humanMode
      ? fullyRepaidServicingCase
        ? "new-human-credit"
        : servicingCase
          ? "servicing-cure"
          : obligation
            ? "human-obligation"
            : "human-credit"
      : mandate?.status === "active"
        ? "agent-api"
        : "principal-authority",
    humanMode
      ? fullyRepaidServicingCase
        ? "Start new credit"
        : servicingCase
          ? "Open early repayment"
          : obligation
            ? "Open Obligation"
            : "Open Human credit"
      : mandate?.status === "active"
        ? "Open Agent API"
        : "Configure Agent authority"
  );

  el("privateEvidenceEyebrow").textContent = humanMode ? "Owner Evidence" : "Agent Evidence";
  el("privateEvidenceTitle").textContent = humanMode
    ? "Verify the lifecycle, not a screenshot."
    : "Read the same immutable Evidence through the authenticated Agent API.";
  el("privateEvidenceCopy").textContent = humanMode
    ? "Load redacted immutable events for the exact Obligation owned by this authenticated Human session."
    : "The approved Agent Evidence tool returns the same obligation-bound timeline without expanding authority.";
  el("privateEvidenceStatus").textContent = evidenceLatestProven
    ? `${visibleEvidenceItems.length} latest verified`
    : evidenceState === "partial"
      ? `${visibleEvidenceItems.length} partial`
      : evidenceState === "delayed"
        ? "Verification delayed"
        : evidenceState === "loading"
          ? "Loading"
    : obligation
      ? "Available"
      : "Not loaded";
  el("privateEvidenceObligation").textContent = obligation
    ? "Current owner-authorized position"
    : "Not created";
  el("privateEvidenceObligation").title = "";
  el("privateEvidenceCount").textContent = String(visibleEvidenceItems.length);
  el("privateEvidenceFinality").textContent = evidenceFinality;
  el("privateEvidenceAsOf").textContent = evidenceLoaded && ownedEvidence.asOf
    ? formatEvidenceTime(ownedEvidence.asOf, { short: true })
    : "Not queried";
  el("privateEvidenceList").replaceChildren(...(visibleEvidenceItems.length
    ? visibleEvidenceItems.slice(-5).reverse().map((item) => privateCheckpoint(
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
      "Sign in to load your private Human or Agent workspace. Missing server data is never replaced with a browser estimate.";
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
  const blocker = el("pilotFeedbackBlocker");
  blocker.closest("label").hidden = el("pilotFeedbackOutcome").value === "completed";
  blocker.disabled = pilotFeedback.busy;
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

function creditTrackRecordRow(entry) {
  const row = document.createElement("div");
  const label = document.createElement("strong");
  const impact = document.createElement("span");
  const lineage = document.createElement("small");
  row.className = "credit-passport-disclosure";
  label.textContent = `${titleize(entry.outcomeLabel)} · ${formatEvidenceTime(
    entry.outcomeFinalizedAt,
    { short: true }
  )}`;
  impact.className = `state-pill ${entry.outcomeLabel === "on_time_repaid" ? "" : "warning"}`;
  impact.textContent = titleize(entry.creditImpact);
  lineage.textContent =
    `${entry.sourceEvidenceHashes.length} finalized Evidence reference${entry.sourceEvidenceHashes.length === 1 ? "" : "s"} · ` +
    `DPD ${entry.maxDaysPastDue} · repaid ${entry.repaymentRatioBps / 100}% · ` +
    `outcome ${compactDecisionProofHash(entry.outcomeHash)}`;
  row.append(label, impact, lineage);
  return row;
}

function renderCreditPassportPilot() {
  const presentation = creditPassportPilot.presentation;
  const artifact = creditPassportPilot.artifact;
  const busy = creditPassportPilot.busy;
  const connected = tenantPilot.connected;
  const creditState = creditStatePilot.projection;
  el("restoreCreditPassportBtn").disabled = busy || !connected;
  const subjectInput = el("creditPassportSubjectId");
  const intentInput = el("creditPassportIntentId");
  subjectInput.value = tenantPilot.decision?.subjectId ?? "";
  intentInput.value = tenantPilot.intent?.creditIntentId ?? "";
  el("creditPassportSubjectSource").textContent =
    tenantPilot.decision?.subjectId ?? "Not loaded";
  el("creditPassportSubjectSource").title =
    tenantPilot.decision?.subjectId ?? "";
  el("creditPassportIntentSource").textContent =
    tenantPilot.intent?.creditIntentId ?? "Not loaded";
  el("creditPassportIntentSource").title =
    tenantPilot.intent?.creditIntentId ?? "";
  const currentDecisionSource =
    exactResourceId(subjectInput.value) &&
    exactResourceId(intentInput.value) &&
    hasVerifiedHumanDecisionPassport(tenantPilot.decision);
  el("creditPassportIssueForm").closest(".credit-passport-issue-card")
    ?.classList.toggle("unavailable", !currentDecisionSource);
  for (const control of el("creditPassportIssueForm").querySelectorAll(
    'input:not([type="hidden"]), select'
  )) {
    control.disabled = busy || !connected || !currentDecisionSource;
  }

  el("creditPassportIssueHelper").textContent = currentDecisionSource
    ? creditPassportPilot.issueHelper
    : tenantPilot.connected
      ? "Open Decision Passport and complete one current evaluation before sharing any facts."
      : "Sign in and complete one current evaluation before sharing any facts.";
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
  el("creditPassportArtifactIdentity").textContent = artifact
    ? `Version ${artifact.version} · point-in-time`
    : "—";
  el("creditPassportArtifactIssuer").textContent = presentation
    ? "IPO.ONE private gateway"
    : "—";
  el("creditPassportArtifactLifetime").textContent = presentation?.lifetimeLabel ?? "—";
  el("creditPassportDisclosureCount").textContent = presentation
    ? `${presentation.disclosures.length} selected fact${presentation.disclosures.length === 1 ? "" : "s"}`
    : "—";
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

  el("creditTrackRecordDecision").textContent = tenantPilot.decision?.decisionPassport
    ? `${titleize(tenantPilot.decision.status)} · ${compactDecisionProofHash(
        tenantPilot.decision.decisionPassport.decisionPassportHash
      )}`
    : "Not loaded";
  el("creditTrackRecordCycleCount").textContent = String(
    creditState?.metrics.completedCycleCount ?? 0
  );
  el("creditTrackRecordLatestOutcome").textContent = creditState
    ? titleize(creditState.latestOutcome.outcomeLabel)
    : "Not loaded";
  el("creditTrackRecordReliability").textContent = creditState
    ? titleize(creditState.factors.repaymentReliability)
    : "Not loaded";
  el("creditTrackRecordLoss").textContent = creditState
    ? usdMinorToMoney(creditState.metrics.totalLossMinor)
    : "$0.00";
  el("creditTrackRecordRows").replaceChildren(
    ...(creditState
      ? creditState.trackRecord.map(creditTrackRecordRow)
      : [emptyRow("No finalized Credit Outcome is loaded for this Subject.")])
  );
  el("loadCreditTrackRecordBtn").disabled =
    creditStatePilot.busy || !connected || !creditStatePilot.catalogAvailable;
  const finality = el("creditTrackRecordFinality");
  finality.classList.toggle("neutral", !creditState && !creditStatePilot.error);
  finality.classList.toggle("warning", creditStatePilot.error);
  finality.textContent = creditStatePilot.busy
    ? "Loading"
    : creditState
      ? `Outcome-derived · v${creditState.projectionVersion}`
      : creditStatePilot.error
        ? "Not available yet"
        : "Not loaded";
  if (creditState) {
    el("creditTrackRecordStateTitle").textContent =
      `${creditState.metrics.completedCycleCount} completed credit cycle${creditState.metrics.completedCycleCount === 1 ? "" : "s"}`;
    el("creditTrackRecordStateCopy").textContent =
      `${titleize(creditState.latestOutcome.outcomeLabel)} is the latest terminal Credit Outcome. ` +
      `State ${compactDecisionProofHash(creditState.creditStateHash)} was rebuilt from finalized outcomes only; it does not authorize funds or an automatic limit change.`;
  } else if (creditStatePilot.error) {
    el("creditTrackRecordStateTitle").textContent = "Credit State not available yet";
    el("creditTrackRecordStateCopy").textContent = creditStatePilot.helper;
  }
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

function localDateTimeValue(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function ensureCapitalPartnerDateDefaults() {
  const defaults = [
    ["capitalPartnerValidUntil", 1],
    ["capitalPartnerFirstPaymentAt", 30],
    ["capitalPartnerMaturityAt", 60]
  ];
  for (const [id, days] of defaults) {
    const input = el(id);
    if (!input.value) {
      input.value = localDateTimeValue(
        new Date(Date.now() + days * 24 * 60 * 60 * 1_000)
      );
    }
  }
}

function capitalPartnerFacilityRow(facility) {
  const row = document.createElement("article");
  row.className = "capital-partner-facility-row";
  if (facility.adverse) row.classList.add("warning");
  const identity = document.createElement("div");
  const identityLabel = document.createElement("span");
  const identityValue = document.createElement("strong");
  const identityDetail = document.createElement("small");
  identityLabel.textContent = "Facility / Obligation";
  identityValue.textContent = facility.facilityId;
  identityDetail.textContent = facility.obligationId;
  identity.append(identityLabel, identityValue, identityDetail);
  const fields = [
    ["Status", `${titleize(facility.status)} · ${titleize(facility.servicingClassification)}`],
    ["Outstanding", facility.outstandingLabel],
    ["Evidence", facility.evidenceLabel]
  ].map(([labelText, valueText]) => {
    const cell = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    label.textContent = labelText;
    value.textContent = valueText;
    cell.append(label, value);
    return cell;
  });
  row.append(identity, ...fields);
  return row;
}

function selectCapitalPartnerApplicationAt(index, { focus = true } = {}) {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= capitalPartnerPilot.applications.length
  ) return;
  const application = capitalPartnerPilot.applications[index];
  capitalPartnerPilot.selectedApplication = chooseCapitalPartnerApplication(
    capitalPartnerPilot.applications,
    application.resource.resourceId
  );
  capitalPartnerPilot.offer = recoverCapitalPartnerOfferFromPortfolio();
  capitalPartnerPilot.helper =
    "Application selected from your borrower-authorized Inbox. Review the economic terms before issuing an Offer.";
  capitalPartnerPilot.error = false;
  renderCapitalPartner();
  if (focus) {
    el("capitalPartnerApplicationPicker")
      .querySelectorAll(".capital-partner-application-choice[role='radio']")[index]
      ?.focus();
  }
}

function capitalPartnerApplicationChoice(application, index, selected, rovingTabStop) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "capital-partner-application-choice";
  button.setAttribute("role", "radio");
  button.setAttribute("aria-checked", String(selected));
  button.tabIndex = rovingTabStop ? 0 : -1;
  const title = document.createElement("strong");
  const detail = document.createElement("small");
  title.textContent = `Authorized application ${index + 1}`;
  detail.textContent = capitalPartnerApplicationLabel(application, index + 1);
  button.append(title, detail);
  button.addEventListener("click", () => selectCapitalPartnerApplicationAt(index));
  button.addEventListener("keydown", (event) => {
    const last = capitalPartnerPilot.applications.length - 1;
    const target = new Map([
      ["ArrowRight", (index + 1) % capitalPartnerPilot.applications.length],
      ["ArrowDown", (index + 1) % capitalPartnerPilot.applications.length],
      ["ArrowLeft", (index - 1 + capitalPartnerPilot.applications.length) % capitalPartnerPilot.applications.length],
      ["ArrowUp", (index - 1 + capitalPartnerPilot.applications.length) % capitalPartnerPilot.applications.length],
      ["Home", 0],
      ["End", last]
    ]).get(event.key);
    if (target === undefined) return;
    event.preventDefault();
    selectCapitalPartnerApplicationAt(target);
  });
  return button;
}

function recoverCapitalPartnerOfferFromPortfolio() {
  if (
    !capitalPartnerPilot.selectedApplication ||
    !Array.isArray(capitalPartnerPilot.portfolio?.offers)
  ) return null;
  const matches = capitalPartnerPilot.portfolio.offers.filter(
    (offer) => offer.creditPassportArtifactId ===
        capitalPartnerPilot.selectedApplication.resource.resourceId &&
      new Set(["offered", "accepted"]).has(offer.status)
  );
  if (matches.length > 1) {
    throw new TypeError(
      "Capital Partner Portfolio contains ambiguous active Offers for one authorized application."
    );
  }
  if (matches.length !== 1) return null;
  const offer = matches[0];
  return {
    ...offer,
    creditOfferHash: offer.creditOfferHash ?? "—",
    termsHash: offer.termsHash ?? "—"
  };
}

function clearCapitalPartnerCatalogAvailability() {
  capitalPartnerPilot.authorAvailable = false;
  capitalPartnerPilot.selfAvailable = false;
  capitalPartnerPilot.inboxAvailable = false;
  capitalPartnerPilot.transitionAvailable = false;
  capitalPartnerPilot.portfolioAvailable = false;
  capitalPartnerPilot.facilityAvailable = false;
}

function clearCapitalPartnerWorkspaceState({
  recoveryState = "unavailable",
  helper = "This Capital Partner workspace is unavailable or not authorized. No application details were disclosed.",
  error = true
} = {}) {
  capitalPartnerPilot.profile = null;
  capitalPartnerPilot.applications = [];
  capitalPartnerPilot.selectedApplication = null;
  capitalPartnerPilot.portfolio = null;
  capitalPartnerPilot.presentation = null;
  capitalPartnerPilot.offer = null;
  capitalPartnerPilot.recoveryState = recoveryState;
  capitalPartnerPilot.error = error;
  capitalPartnerPilot.helper = helper;
  capitalPartnerPilot.portfolioHelper = helper;
}

function renderCapitalPartner() {
  if (!el("capitalPartnerOfferForm")) return;
  ensureCapitalPartnerDateDefaults();
  const connected =
    tenantPilot.connected &&
    Boolean(tenantCsrfToken()) &&
    currentWorkspaceName() === "capitalPartner";
  const discoveryAvailable =
    capitalPartnerPilot.selfAvailable &&
    capitalPartnerPilot.inboxAvailable &&
    capitalPartnerPilot.portfolioAvailable &&
    capitalPartnerPilot.facilityAvailable;
  const waiting = capitalPartnerPilot.busy || capitalPartnerPilot.refreshBusy;
  const authorOperational = discoveryAvailable && capitalPartnerPilot.authorAvailable;
  const transitionOperational = discoveryAvailable && capitalPartnerPilot.transitionAvailable;
  const workspaceReady = connected && discoveryAvailable && Boolean(capitalPartnerPilot.profile);
  const maturity = el("capitalPartnerMaturity");
  maturity.classList.remove("checking", "unavailable");
  maturity.textContent = capitalPartnerPilot.recoveryState === "loading"
    ? "Restoring workspace"
    : workspaceReady
    ? "Synthetic marketplace ready"
    : tenantPilot.checked
      ? "Role unavailable"
      : "Checking private gateway";
  if (capitalPartnerPilot.recoveryState === "loading" || !tenantPilot.checked) {
    maturity.classList.add("checking");
  } else if (!workspaceReady) {
    maturity.classList.add("unavailable");
  }
  el("capitalPartnerAccessState").textContent =
    workspaceReady
      ? `${capitalPartnerPilot.profile.displayName} · invited operator active`
      : connected && discoveryAvailable
        ? "Partner workspace recovery unavailable"
      : currentWorkspaceName() === "capitalPartner"
        ? tenantCsrfToken()
          ? "Partner workspace recovery unavailable"
          : "Capital Partner sign-in required"
        : "Open the invited Partner workspace";

  const offer = capitalPartnerPilot.offer;
  const offerStatus = el("capitalPartnerOfferStatus");
  offerStatus.classList.toggle("neutral", !offer);
  offerStatus.classList.toggle(
    "warning",
    Boolean(offer && !new Set(["offered", "accepted"]).has(offer.status))
  );
  offerStatus.textContent = offer ? titleize(offer.status) : "No Offer";
  el("capitalPartnerProfileName").textContent =
    capitalPartnerPilot.profile?.displayName ?? "—";
  el("capitalPartnerProfileId").textContent =
    capitalPartnerPilot.profile?.capitalPartnerId ?? "—";
  el("capitalPartnerOfferId").textContent = offer?.creditOfferId ?? "—";
  el("capitalPartnerOfferHash").textContent = offer?.creditOfferHash ?? "—";
  el("capitalPartnerTermsHash").textContent = offer?.termsHash ?? "—";
  el("capitalPartnerBorrowerRef").textContent = offer?.subjectId ?? "—";
  el("capitalPartnerOfferValidity").textContent = offer?.validUntil
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(offer.validUntil))
    : "—";

  const selectedApplication = capitalPartnerPilot.selectedApplication;
  const offerForm = el("capitalPartnerOfferForm");
  offerForm.hidden =
    !selectedApplication ||
    !connected ||
    !authorOperational ||
    Boolean(offer && new Set(["offered", "accepted"]).has(offer.status));
  const authorButton = el("capitalPartnerAuthorOfferBtn");
  authorButton.disabled =
    waiting ||
    !connected ||
    !capitalPartnerPilot.authorAvailable ||
    !selectedApplication;
  authorButton.toggleAttribute("aria-busy", waiting);
  authorButton.textContent = waiting
    ? "Submitting exact terms…"
    : "Issue exact sandbox Offer";
  const withdrawButton = el("capitalPartnerWithdrawOfferBtn");
  withdrawButton.hidden = offer?.status !== "offered" || !transitionOperational;
  withdrawButton.disabled = waiting;
  el("capitalPartnerReportingPanel").hidden = !offer;

  const picker = el("capitalPartnerApplicationPicker");
  if (
    capitalPartnerPilot.applications.length > 1 ||
    (capitalPartnerPilot.applications.length === 1 && !selectedApplication)
  ) {
    picker.replaceChildren(...capitalPartnerPilot.applications.map((application, index) =>
      capitalPartnerApplicationChoice(
        application,
        index,
        sameCapitalPartnerApplication(application, selectedApplication),
        selectedApplication
          ? sameCapitalPartnerApplication(application, selectedApplication)
          : index === 0
      )
    ));
  } else if (selectedApplication) {
    const exact = document.createElement("div");
    exact.className = "capital-partner-application-choice selected";
    const title = document.createElement("strong");
    const detail = document.createElement("small");
    title.textContent = "Authorized application ready";
    detail.textContent = capitalPartnerApplicationLabel(selectedApplication, 1);
    exact.append(title, detail);
    picker.replaceChildren(exact);
  } else {
    picker.replaceChildren(emptyRow(
      capitalPartnerPilot.recoveryState === "loading"
        ? "Restoring borrower-authorized applications from server truth."
        : capitalPartnerPilot.recoveryState === "empty"
          ? "No borrower has shared a current Passport with this Partner."
          : "Authorized applications are unavailable. Refresh to retry safely."
    ));
  }
  el("capitalPartnerInboxState").textContent = capitalPartnerPilot.recoveryState === "loading"
    ? "Restoring authorized applications…"
    : capitalPartnerPilot.applications.length === 0
      ? "No current authorized applications"
      : `${capitalPartnerPilot.applications.length} current authorized application${capitalPartnerPilot.applications.length === 1 ? "" : "s"}`;
  const refreshButton = el("capitalPartnerRefreshWorkspaceBtn");
  refreshButton.disabled = waiting;
  refreshButton.toggleAttribute("aria-busy", waiting);
  refreshButton.textContent = waiting
    ? "Refreshing workspace…"
    : "Refresh workspace";
  const applicationDetails = el("capitalPartnerApplicationDetails");
  applicationDetails.hidden = !selectedApplication;
  el("capitalPartnerPassportTechnical").textContent =
    selectedApplication?.resource.resourceId ?? "—";
  el("capitalPartnerIntentTechnical").textContent =
    selectedApplication?.reviewContext.creditIntentId ?? "—";
  el("capitalPartnerProofTechnical").textContent = selectedApplication
    ? `${selectedApplication.reviewContext.artifactHash} · version ${selectedApplication.reviewContext.artifactVersion}`
    : "—";
  el("capitalPartnerOfferHelper").textContent = capitalPartnerPilot.helper;
  el("capitalPartnerOfferHelper").classList.toggle("error", capitalPartnerPilot.error);

  const presentation = capitalPartnerPilot.presentation;
  el("capitalPartnerPortfolioStatus").textContent = presentation
    ? `As of ${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(presentation.asOf))}`
    : "Not loaded";
  el("capitalPartnerOfferCount").textContent =
    presentation?.offerCountLabel ?? "0";
  el("capitalPartnerCommittedAmount").textContent =
    presentation?.committedLabel ?? "$0.00";
  el("capitalPartnerOutstandingAmount").textContent =
    presentation?.outstandingLabel ?? "$0.00";
  el("capitalPartnerRepaidAmount").textContent =
    presentation?.repaidLabel ?? "$0.00";
  el("capitalPartnerEvidenceState").textContent =
    presentation?.evidenceStateLabel ?? "Server-derived";
  el("capitalPartnerFacilityRows").replaceChildren(
    ...(presentation?.facilities.length
      ? presentation.facilities.map(capitalPartnerFacilityRow)
      : [emptyRow("Accepted and executed Facilities will appear here after an authorized refresh.")])
  );
  el("capitalPartnerPortfolioHelper").textContent =
    capitalPartnerPilot.portfolioHelper;
  el("capitalPartnerPortfolioHelper").classList.toggle(
    "error",
    capitalPartnerPilot.error
  );
}

async function runCapitalPartnerAction(operation, successMessage) {
  if (capitalPartnerPilot.busy || capitalPartnerPilot.refreshBusy) return;
  const dataEpoch = authenticatedDataEpoch;
  capitalPartnerPilot.busy = true;
  capitalPartnerPilot.error = false;
  renderCapitalPartner();
  try {
    await operation();
    if (dataEpoch !== authenticatedDataEpoch) return;
    capitalPartnerPilot.helper = successMessage;
    toast(successMessage);
    announce(successMessage);
  } catch (error) {
    if (dataEpoch !== authenticatedDataEpoch) return;
    const requestSuffix = error.requestId ? ` Request ID: ${error.requestId}` : "";
    capitalPartnerPilot.error = true;
    capitalPartnerPilot.helper = `${error.message}${requestSuffix}`;
    capitalPartnerPilot.portfolioHelper = capitalPartnerPilot.helper;
    toast(capitalPartnerPilot.helper, "error");
    announce(capitalPartnerPilot.helper);
  } finally {
    if (dataEpoch !== authenticatedDataEpoch) return;
    capitalPartnerPilot.busy = false;
    renderCapitalPartner();
  }
}

function capitalPartnerUsdMinor(inputId) {
  const amount = Number(el(inputId).value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Capital Partner amounts must be valid non-negative USD values.");
  }
  return String(Math.round(amount * 100));
}

async function authorCapitalPartnerOffer() {
  await runCapitalPartnerAction(async () => {
    const selectedApplication = capitalPartnerPilot.selectedApplication;
    if (!selectedApplication) {
      throw new Error("Choose one borrower-authorized application first.");
    }
    let preflightSelection;
    try {
      const preflight = await tenantApi("pilotReadCapitalPartnerPassportInbox", {
        payload: {},
        idempotent: false
      });
      preflightSelection = createCapitalPartnerInboxSelection(preflight.response);
    } catch {
      capitalPartnerPilot.applications = [];
      capitalPartnerPilot.selectedApplication = null;
      capitalPartnerPilot.offer = null;
      capitalPartnerPilot.recoveryState = "unavailable";
      throw new Error(
        "The authorized application could not be revalidated. Nothing was submitted; refresh the workspace before continuing."
      );
    }
    const currentMatches = preflightSelection.applications.filter(
      (item) => item.resource.resourceId === selectedApplication.resource.resourceId
    );
    if (
      currentMatches.length !== 1 ||
      !sameCapitalPartnerApplication(selectedApplication, currentMatches[0])
    ) {
      capitalPartnerPilot.applications = preflightSelection.applications;
      capitalPartnerPilot.selectedApplication = null;
      capitalPartnerPilot.offer = null;
      capitalPartnerPilot.recoveryState = preflightSelection.applications.length
        ? "choice_required"
        : "empty";
      throw new Error(
        "The authorized application changed. Nothing was submitted; choose the current application and review the terms again."
      );
    }
    const passportId = selectedApplication.resource.resourceId;
    const {
      creditIntentId,
      artifactHash,
      artifactVersion
    } = selectedApplication.reviewContext;
    const terms = {
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      facilityLimitMinor: capitalPartnerUsdMinor("capitalPartnerFacilityLimit"),
      approvedPrincipalMinor: capitalPartnerUsdMinor("capitalPartnerPrincipal"),
      perDrawCapMinor: capitalPartnerUsdMinor("capitalPartnerPerDrawCap"),
      annualRateBps: Math.round(Number(el("capitalPartnerAnnualRate").value) * 100),
      originationFeeMinor: capitalPartnerUsdMinor("capitalPartnerOriginationFee"),
      repaymentFrequency: "monthly",
      installmentCount: Number(el("capitalPartnerInstallments").value),
      firstPaymentAt: new Date(el("capitalPartnerFirstPaymentAt").value).toISOString(),
      maturityAt: new Date(el("capitalPartnerMaturityAt").value).toISOString(),
      permittedPurposeCode: "working_capital",
      conditions: [
        "passport_current_at_acceptance",
        "authority_current_at_acceptance",
        "no_adverse_obligation_at_acceptance"
      ],
      undrawnRevocationRule: "capital_partner_before_acceptance",
      validUntil: new Date(el("capitalPartnerValidUntil").value).toISOString(),
      reasonCodes: ["capital_partner_underwritten"],
      disclosureRef: "disclosure_capital_partner_standard_v1"
    };
    const underwritingSnapshotHash = await sha256Hex(JSON.stringify({
      creditIntentId,
      passportId,
      artifactHash,
      artifactVersion,
      terms
    }));
    const result = await tenantApi("pilotAuthorCapitalPartnerOffer", {
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: passportId
      },
      payload: {
        creditIntentId,
        artifactHash,
        artifactVersion,
        underwritingSnapshotHash,
        ...terms,
        schemaVersion: "capital_partner_offer_authoring.v1"
      }
    });
    capitalPartnerPilot.offer = result.response.offer;
    capitalPartnerPilot.portfolioHelper =
      "Offer issued. Refresh the server-composed portfolio after borrower acceptance or servicing changes.";
  }, "Exact synthetic credit_offer.v2 issued. No production funds moved.");
}

async function withdrawCapitalPartnerOffer() {
  await runCapitalPartnerAction(async () => {
    const offer = capitalPartnerPilot.offer;
    if (!offer || offer.status !== "offered") {
      throw new Error("Load or issue one unaccepted Offer first.");
    }
    const result = await tenantApi("pilotTransitionCapitalPartnerOffer", {
      resource: {
        resourceType: "credit_offer",
        resourceId: offer.creditOfferId
      },
      payload: {
        nextStatus: "withdrawn",
        supersedingOfferId: null,
        schemaVersion: "capital_partner_offer_transition.v1"
      }
    });
    capitalPartnerPilot.offer = result.response.offer;
  }, "Unaccepted sandbox Offer withdrawn. Borrower acceptance is now blocked.");
}

async function readCapitalPartnerWorkspace() {
  const selfResult = await tenantApi("pilotReadCapitalPartnerSelf", {
    payload: {},
    idempotent: false
  });
  const inboxResult = await tenantApi("pilotReadCapitalPartnerPassportInbox", {
    payload: {},
    idempotent: false
  });
  const selection = createCapitalPartnerWorkspaceSelection(
    selfResult.response,
    inboxResult.response
  );
  const portfolioResult = await tenantApi("pilotReadCapitalPartnerPortfolio", {
      resource: {
        resourceType: "capital_partner_profile",
        resourceId: selection.resource.resourceId
      },
      idempotent: false
  });
  return { selection, portfolioResponse: portfolioResult.response };
}

function applyCapitalPartnerWorkspace({ selection, portfolioResponse }) {
  if (
    portfolioResponse?.schemaVersion !== "tenant_capital_partner_portfolio_view.v1" ||
    portfolioResponse.profile?.capitalPartnerId !== selection.resource.resourceId ||
    portfolioResponse.portfolio?.capitalPartnerId !== selection.resource.resourceId ||
    portfolioResponse.portfolio?.sandboxOnly !== true ||
    portfolioResponse.portfolio?.productionFundsMoved !== false
  ) {
    throw new TypeError("Capital Partner Portfolio did not match the recovered own Profile.");
  }
  capitalPartnerPilot.profile = selection.profile;
  capitalPartnerPilot.applications = selection.applications;
  capitalPartnerPilot.selectedApplication = selection.selected;
  capitalPartnerPilot.recoveryState = selection.status;
  capitalPartnerPilot.portfolio = portfolioResponse.portfolio;
  capitalPartnerPilot.presentation = createCapitalPartnerPresentation(
    portfolioResponse.portfolio
  );
  capitalPartnerPilot.offer = recoverCapitalPartnerOfferFromPortfolio();
  capitalPartnerPilot.error = false;
  capitalPartnerPilot.helper = selection.status === "empty"
    ? "No current borrower-authorized Passport is available. Refresh after the borrower shares one."
    : selection.status === "choice_required"
      ? "Choose one labeled borrower-authorized application to review terms."
      : "One current borrower-authorized application was restored from server truth.";
  capitalPartnerPilot.portfolioHelper =
    "Canonical portfolio refreshed from Offer, Obligation, servicing, repayment, and Evidence truth.";
}

async function recoverCapitalPartnerWorkspace({ quiet = false } = {}) {
  if (capitalPartnerPilot.busy) return;
  const epoch = ++capitalPartnerPilot.recoveryEpoch;
  const dataEpoch = authenticatedDataEpoch;
  capitalPartnerPilot.busy = true;
  clearCapitalPartnerWorkspaceState({
    recoveryState: "loading",
    helper: "Restoring your Partner Profile, authorized Passport Inbox, and Portfolio from server truth.",
    error: false
  });
  renderCapitalPartner();
  try {
    const workspace = await readCapitalPartnerWorkspace();
    if (
      epoch !== capitalPartnerPilot.recoveryEpoch ||
      dataEpoch !== authenticatedDataEpoch
    ) return;
    applyCapitalPartnerWorkspace(workspace);
    if (!quiet) {
      toast("Capital Partner workspace refreshed from server truth.");
      announce(capitalPartnerPilot.helper);
    }
  } catch (error) {
    if (
      epoch !== capitalPartnerPilot.recoveryEpoch ||
      dataEpoch !== authenticatedDataEpoch
    ) return;
    clearCapitalPartnerWorkspaceState();
    if (!quiet) {
      toast(capitalPartnerPilot.helper, "error");
      announce(capitalPartnerPilot.helper);
    }
  } finally {
    if (
      epoch === capitalPartnerPilot.recoveryEpoch &&
      dataEpoch === authenticatedDataEpoch
    ) {
      capitalPartnerPilot.busy = false;
      renderCapitalPartner();
    }
  }
}

async function refreshCapitalPartnerWorkspace() {
  if (
    capitalPartnerPilot.busy ||
    capitalPartnerPilot.refreshBusy ||
    tenantPilotProbePromise
  ) return;
  const dataEpoch = authenticatedDataEpoch;
  capitalPartnerPilot.refreshBusy = true;
  renderCapitalPartner();
  try {
    await probeTenantPilot();
  } finally {
    if (dataEpoch === authenticatedDataEpoch) {
      capitalPartnerPilot.refreshBusy = false;
      renderCapitalPartner();
    }
  }
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
  const humanWorkspace = hasHumanBorrowerWorkspace();
  const reviewState = humanCreditReviewState();
  el("createHumanSubjectBtn").disabled =
    privateBusy || !tenantPilot.connected || !humanWorkspace;
  el("createHumanConsentBtn").disabled =
    privateBusy || !tenantPilot.connected || !humanWorkspace || !subjectId;
  el("submitHumanCreditBtn").disabled = privateBusy || !tenantPilot.connected ||
    !humanWorkspace || !subjectId || !consentId || Boolean(tenantPilot.offer && reviewState.current);
  el("submitHumanCreditBtn").textContent = tenantPilot.offer && !reviewState.current
    ? "Request fresh Offer"
    : "Request & evaluate credit";
  el("newHumanApplicationBtn").hidden = !tenantPilot.obligation || humanNewApplicationMode;
  el("newHumanApplicationBtn").disabled = privateBusy;
  el("humanApplicationHelper").textContent =
    tenantPilot.connected && !humanWorkspace
      ? humanWorkspaceUnavailableMessage()
      : tenantPilot.helper;

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
  el("humanApplicationStatus").textContent = obligationRepaid
    ? "Lifecycle complete"
    : obligationExecuted
      ? "Sandbox active"
      : offerAccepted
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
  const humanOfferReviewStateNode = el("humanOfferReviewState");
  const humanOfferContextVisible = interactionMode === "human";
  humanOfferReviewStateNode.hidden = !humanOfferContextVisible;
  humanOfferReviewStateNode.textContent = humanOfferContextVisible
    ? humanCreditReviewMessage(reviewState)
    : "";
  humanOfferReviewStateNode.classList.toggle(
    "ready",
    humanOfferContextVisible && reviewState.current
  );
  humanOfferReviewStateNode.classList.toggle(
    "warning",
    humanOfferContextVisible && Boolean(offer) && !reviewState.current
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
  el("humanOfferAcceptance").hidden = offerAccepted;
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
      : "Confirm & create sandbox Obligation";

  const obligationCard = el("humanObligationCard");
  obligationCard.hidden = !obligation;
  el("humanObligationExecution").textContent = obligation
    ? titleize(obligation.executionStatus)
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
  el("executeHumanObligationBtn").hidden = !obligation || obligationExecuted;
  el("executeHumanObligationBtn").disabled =
    privateBusy || !tenantPilot.connected || !obligation || obligationExecuted;
  el("executeHumanObligationBtn").textContent = obligationExecuted
    ? obligationRepaid
      ? "Lifecycle complete"
      : "Sandbox credit active"
    : tenantPilot.busy
      ? "Executing signed sandbox credit…"
      : "Confirm sandbox execution";
  el("humanRepaymentFields").hidden = !obligationExecuted || obligationRepaid;
  el("postHumanRepaymentBtn").hidden = !obligationExecuted || obligationRepaid;
  el("postHumanRepaymentBtn").disabled =
    privateBusy || !tenantPilot.connected || !obligationExecuted || obligationRepaid;
  el("postHumanRepaymentBtn").textContent = tenantPilot.busy
    ? "Confirming sandbox repayment…"
    : "Confirm early or scheduled repayment";
  const repayment = tenantPilot.repayment;
  el("humanRepaymentAllocation").textContent = repayment
    ? `Applied ${usdMinorToMoney(repayment.appliedMinor)} · interest ${usdMinorToMoney(repayment.appliedInterestMinor)} · principal ${usdMinorToMoney(repayment.appliedPrincipalMinor)}${BigInt(repayment.surplusMinor) > 0n ? ` · surplus ${usdMinorToMoney(repayment.surplusMinor)} not posted` : ""}`
    : "Early partial or full repayment is available now with no sandbox prepayment penalty. Fee → interest → principal; surplus is not posted.";
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
    if (error?.code === "user_action_cancelled") {
      tenantPilot.helper = "Action cancelled. Nothing was submitted.";
      toast(tenantPilot.helper);
      announce(tenantPilot.helper);
      return;
    }
    const requestSuffix = error.requestId ? ` Request ID: ${error.requestId}` : "";
    tenantPilot.helper = isRejectedAuthenticationSession(error)
      ? `Your secure session ended before the action completed. Sign in again; the server did not accept this request.${requestSuffix}`
      : `${error.message}${requestSuffix}`;
    toast(tenantPilot.helper, "error");
    announce(`Operation failed. ${error.message}`);
    if (isRejectedAuthenticationSession(error)) openAccess();
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

async function runAgentAuthorityAction(
  button,
  operation,
  successMessage,
  { requireSelection = true } = {}
) {
  if (!hasPrincipalAgentAuthorityWorkspace()) {
    const message =
      "Agent authority operations require the authenticated Principal workspace. Open the Principal workspace and sign in with the invited wallet.";
    agentAuthorityPilot.helper = message;
    renderTenantPilot();
    toast(message, "error");
    announce(message);
    return;
  }
  if (tenantPilot.busy || agentAuthorityPilot.busy) return;
  agentAuthorityPilot.busy = true;
  button?.setAttribute("aria-busy", "true");
  agentAuthorityPilot.helper = "Private Principal operation in progress…";
  renderTenantPilot();
  announce("Authenticated Principal operation in progress");
  try {
    if (requireSelection) await revalidatePrincipalAgentSelection();
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
  if (tenantPilot.obligationHydrationBusy) return false;
  const exactObligationId = (obligationId ?? tenantInputValue("ownedObligationId")).trim();
  if (!exactResourceId(exactObligationId)) {
    tenantPilot.obligationHydrationError = true;
    tenantPilot.obligationHydrationHelper = "Enter one exact Obligation ID with no spaces.";
    renderTenantPilot();
    return false;
  }
  const switchingObligation =
    tenantPilot.obligation?.obligationId !== exactObligationId;
  if (switchingObligation) {
    resetOwnedEvidenceState({
      obligationId: exactObligationId,
      helper: "Evidence cleared while the selected Obligation is reauthorized."
    });
  }
  tenantPilot.obligationHydrationBusy = true;
  tenantPilot.obligationHydrationError = false;
  tenantPilot.obligationHydrationHelper = "Verifying ownership and loading current server state…";
  renderTenantPilot();
  try {
    const response = await readOwnedObligationView(exactObligationId);
    if (switchingObligation) {
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
    return true;
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
    return false;
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
  tenantPilot.workspaceKind = recovery.workspaceKind;
  tenantPilot.workspaceResume = recovery;
  const expectedKind = expectedWorkspaceKind();
  if (expectedKind !== null && recovery.workspaceKind !== expectedKind) {
    tenantPilot.connected = false;
    tenantPilot.connectionLabel = `${expectedWorkspaceLabel()} session required`;
    tenantPilot.helper =
      `This page received a ${workspaceKindLabel(recovery.workspaceKind)} session from another local workspace. Switch roles and sign in again.`;
    agentAuthorityPilot.helper = tenantPilot.helper;
    tenantPilot.workspaceObligations = [];
    tenantPilot.workspacePositionViews.clear();
    tenantPilot.workspaceRecoveryHasMore = false;
    tenantPilot.workspaceRecoveryResourceCount = 0;
    tenantPilot.workspaceRecoveryState = "role_mismatch";
    tenantPilot.workspaceRecoveryErrorCode = "workspace_session_role_mismatch";
    return;
  }
  const subject = recoveredResource(resources, "subject");
  const obligation = recoveredResource(resources, "obligation");
  const consent = recoveredResource(resources, "consent");
  const creditIntent = recoveredResource(resources, "credit_intent");
  const mandate = recoveredResource(resources, "mandate");
  const workspaceObligations = workspaceObligationResources(resources);
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
    const recoveredOfferReview = recovery.humanOfferReview;
    let actionableHumanOfferRecovered = false;
    if (recoveredOfferReview) {
      try {
        const binding = createRecoveredHumanCreditReviewBinding(recoveredOfferReview);
        const recoveredCreditIntent = resources.find((item) =>
          item?.resourceType === "credit_intent" &&
          item.resourceId === recoveredOfferReview.creditIntent.creditIntentId
        );
        if (!recoveredCreditIntent) {
          throw new Error("invalid_request_credit_review_binding");
        }
        el("humanSubjectId").value = recoveredOfferReview.subjectId;
        rememberOpaqueId(HUMAN_SUBJECT_STORAGE_KEY, recoveredOfferReview.subjectId);
        el("humanConsentId").value = recoveredOfferReview.consentId;
        rememberOpaqueId(HUMAN_CONSENT_STORAGE_KEY, recoveredOfferReview.consentId);
        restoreHumanCreditRequest(binding.creditRequest);
        tenantPilot.intent = recoveredOfferReview.creditIntent;
        tenantPilot.decision = recoveredOfferReview.decision;
        tenantPilot.offer = recoveredOfferReview.offer;
        tenantPilot.receipt = null;
        tenantPilot.offerReview = binding;
        actionableHumanOfferRecovered = true;
      } catch {
        tenantPilot.intent = null;
        tenantPilot.decision = null;
        tenantPilot.offer = null;
        tenantPilot.receipt = null;
        tenantPilot.offerReview = null;
      }
    } else if (creditIntent) {
      try {
        const application = await tenantApi("pilotReadCreditApplication", {
          resource: {
            resourceType: "credit_intent",
            resourceId: creditIntent.resourceId
          },
          idempotent: false
        });
        tenantPilot.intent = application.response.creditIntent;
        tenantPilot.decision = application.response.decision;
        tenantPilot.offer = application.response.offer;
        if (
          tenantPilot.receipt?.creditIntent?.creditIntentId !==
            tenantPilot.intent?.creditIntentId
        ) {
          tenantPilot.receipt = null;
          tenantPilot.offerReview = null;
        }
      } catch {
        tenantPilot.intent = null;
        tenantPilot.decision = null;
        tenantPilot.offer = null;
        tenantPilot.offerReview = null;
      }
    }
    const rememberedObligationId = rememberedOwnedObligationId();
    const selectedObligation = workspaceObligations.find(
      (item) => item.resourceId === rememberedObligationId
    ) ?? obligation;
    if (actionableHumanOfferRecovered) {
      humanNewApplicationMode = true;
      resetHumanObligationWorkflow();
      el("ownedObligationId").value = "";
      tenantPilot.obligationHydrationHelper =
        "Actionable Offer recovered from server truth. Existing positions remain available from the authenticated workspace index.";
    } else if (selectedObligation && tenantPilot.obligationReadAvailable) {
      humanNewApplicationMode = false;
      el("ownedObligationId").value = selectedObligation.resourceId;
      await loadOwnedObligation({ obligationId: selectedObligation.resourceId, quiet: true });
    }
    tenantPilot.helper = resources.length > 0
      ? "Borrower workspace restored from authenticated PostgreSQL server truth."
      : "Authenticated Borrower workspace ready. Create a Human Subject to begin.";
    setMode("human");
    return;
  }

  if (recovery.workspaceKind === "principal_controller") {
    setMode("agent");
    const workspaceSelection = selectPrincipalAgentWorkspace(recovery);
    const previousWorkspaceSelection = agentAuthorityPilot.workspaceSelection;
    const selectionStateCleared = principalAgentSelectionChanged(
      previousWorkspaceSelection,
      workspaceSelection
    );
    if (selectionStateCleared) {
      clearPrincipalAgentSelectionState();
    }
    agentAuthorityPilot.workspaceSelection = workspaceSelection;
    if (workspaceSelection.status !== "selected") {
      if (!selectionStateCleared) clearPrincipalAgentSelectionState();
      agentAuthorityPilot.helper = workspaceSelection.status === "empty"
        ? "No Agent is assigned to this Principal workspace. Ask the pilot administrator to provision one; this browser cannot create an Actor."
        : "This Principal workspace has multiple or incomplete Agent references. An authorized Agent picker is required before authority can be changed.";
      return;
    }
    if (workspaceSelection.mandateId) {
      await loadExactMandate(workspaceSelection.mandateId);
      const continuation = controlledAgentContinuationForMandate(
        recovery,
        agentAuthorityPilot.mandate
      );
      if (continuation && applyAgentOfferReceipt(continuation.receipt)) {
        agentOnlinePilot.applicationResult = continuation;
      } else {
        agentOnlinePilot.offerReceipt = null;
        agentOnlinePilot.applicationResult = null;
        forgetAgentOfferReceipt();
      }
    }
    const recoveredPrincipalSubjectId = exactResourceId(agentAuthorityPilot.mandate?.subjectId)
      ? agentAuthorityPilot.mandate.subjectId
      : workspaceSelection.subjectId;
    if (exactResourceId(recoveredPrincipalSubjectId)) {
      const binding = await tenantApi("pilotReadAgentAccountBinding", {
        resource: {
          resourceType: "subject",
          resourceId: recoveredPrincipalSubjectId
        },
        payload: {},
        idempotent: false
      });
      if (binding.response.subjectId !== recoveredPrincipalSubjectId) {
        throw new Error("The recovered account binding does not match the server-selected Agent Subject.");
      }
      agentAuthorityPilot.accountBinding = binding.response;
      agentAuthorityPilot.subject = {
        subjectId: binding.response.subjectId,
        status: binding.response.subjectStatus
      };
    }
    const currentMandateId = agentAuthorityPilot.mandate?.mandateId;
    if (exactResourceId(currentMandateId) && tenantPilot.obligationReadAvailable) {
      let exactMandateObligation = null;
      for (const candidate of workspaceObligations.slice(
        0,
        SERVICING_POSITION_INDEX_LIMIT
      )) {
        try {
          const view = await readOwnedObligationView(candidate.resourceId);
          cacheOwnedObligationView(candidate.resourceId, view);
          if (
            view.obligation?.authorityType === "mandate" &&
            view.obligation.authorityId === currentMandateId
          ) {
            exactMandateObligation = candidate;
            break;
          }
        } catch {
          tenantPilot.workspacePositionViews.delete(candidate.resourceId);
        }
      }
      if (exactMandateObligation) {
        el("ownedObligationId").value = exactMandateObligation.resourceId;
        await loadOwnedObligation({
          obligationId: exactMandateObligation.resourceId,
          quiet: true
        });
      } else {
        clearPrincipalAgentObligationState();
      }
    }
    agentAuthorityPilot.helper = workspaceSelection.subjectId
      ? "Principal workspace and its assigned Agent authority were restored from authenticated PostgreSQL server truth."
      : "Authenticated Principal workspace ready with one server-assigned Agent. Create its Agent Subject to begin.";
  }
}

async function restoreLatestCreditPassport() {
  const button = el("restoreCreditPassportBtn");
  if (!tenantPilot.connected) {
    openAccess();
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Loading latest Decision…";
  try {
    const mandateId = agentAuthorityPilot.mandate?.mandateId;
    if (
      interactionMode === "agent" &&
      exactResourceId(mandateId)
    ) {
      applyAgentOfferReceipt(agentOnlinePilot.offerReceipt);
    }
    if (!hasVerifiedHumanDecisionPassport(tenantPilot.decision)) {
      await recoverAuthenticatedWorkspace();
    }
    if (!hasVerifiedHumanDecisionPassport(tenantPilot.decision)) {
      throw new Error(
        interactionMode === "agent"
          ? "Run the Agent application online to create a current Decision before opening its Passport."
          : "Complete one current Human credit evaluation before opening its Passport."
      );
    }
    creditPassportPilot.error = false;
    creditPassportPilot.issueHelper =
      "Latest authenticated Decision loaded. Enter one authorized reviewer and choose the exact facts to share.";
    toast("Latest Decision Passport loaded");
    announce("Latest authenticated Decision Passport loaded");
  } catch (error) {
    creditPassportPilot.error = true;
    creditPassportPilot.issueHelper =
      error?.message ?? "The latest authenticated Decision could not be loaded.";
    toast(creditPassportPilot.issueHelper, "error");
    announce("Decision Passport load failed");
    if (isRejectedAuthenticationSession(error)) openAccess();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Load my latest Decision";
    renderTenantPilot();
  }
}

async function loadCreditTrackRecord() {
  const button = el("loadCreditTrackRecordBtn");
  if (!tenantPilot.connected) {
    openAccess();
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  creditStatePilot.busy = true;
  creditStatePilot.error = false;
  button.textContent = "Loading Credit State…";
  try {
    if (!tenantPilot.obligation) await recoverAuthenticatedWorkspace();
    const subjectId = tenantPilot.obligation?.subjectId ??
      tenantPilot.decision?.subjectId ?? tenantInputValue("humanSubjectId");
    if (!exactResourceId(subjectId)) {
      throw new Error(
        interactionMode === "agent"
          ? "Run the Agent lifecycle online before loading its Credit Track Record."
          : "Create or restore one Human Subject before loading its Credit Track Record."
      );
    }
    const result = await tenantApi("pilotReadOwnCreditState", {
      resource: { resourceType: "subject", resourceId: subjectId },
      payload: {},
      idempotent: false
    });
    creditStatePilot.queried = true;
    creditStatePilot.subjectId = subjectId;
    creditStatePilot.projection = result.response.creditState;
    creditStatePilot.asOf = result.response.asOf;
    creditStatePilot.helper =
      "Durable Credit State loaded from finalized terminal outcomes and Evidence lineage.";
    toast("Verified Credit Track Record loaded");
    announce("Verified Credit Track Record loaded from durable Credit State");
  } catch (error) {
    const message =
      error?.message ?? "The verified Credit Track Record could not be loaded.";
    creditStatePilot.error = true;
    creditStatePilot.helper = message;
    toast(message, "error");
    announce("Credit Track Record load failed");
    if (isRejectedAuthenticationSession(error)) openAccess();
  } finally {
    creditStatePilot.busy = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Load verified record";
    renderTenantPilot();
  }
}

function isCurrentTenantPilotProbe(owner) {
  return Boolean(owner) &&
    tenantPilotProbeOwner === owner &&
    owner.authenticatedDataEpoch === authenticatedDataEpoch;
}

async function probeTenantPilot() {
  if (tenantPilotProbePromise) return tenantPilotProbePromise;
  const probeOwner = Object.freeze({
    serial: ++tenantPilotProbeSerial,
    authenticatedDataEpoch
  });
  tenantPilotProbeOwner = probeOwner;
  let riskCatalogOwner = null;
  const capitalPartnerRefreshOwner =
    currentWorkspaceName() === "capitalPartner" &&
    capitalPartnerPilot.refreshBusy === false;
  if (capitalPartnerRefreshOwner) {
    capitalPartnerPilot.refreshBusy = true;
    renderCapitalPartner();
  }
  if (currentWorkspaceName() === "risk") {
    invalidateRiskRequestOwners([
      "recovery", "portfolio", "health", "feedback", "insights", "queue"
    ]);
    ++riskOperations.recoveryEpoch;
    riskOperations.recoveryBusy = false;
    riskOperations.busy = false;
    riskOperations.healthBusy = false;
    riskOperations.feedbackBusy = false;
    riskOperations.queueBusy = false;
    riskCatalogOwner = beginRiskRequest("catalog");
    riskOperations.catalogBusy = true;
    renderRiskOperations();
  }
  const promise = runTenantPilotProbe(probeOwner);
  tenantPilotProbePromise = promise;
  try {
    return await promise;
  } finally {
    if (tenantPilotProbeOwner === probeOwner) {
      tenantPilotProbeOwner = null;
      if (tenantPilotProbePromise === promise) tenantPilotProbePromise = null;
    }
    if (finishRiskRequest(riskCatalogOwner)) {
      riskOperations.catalogBusy = false;
      renderRiskOperations();
    }
    if (
      capitalPartnerRefreshOwner &&
      probeOwner.authenticatedDataEpoch === authenticatedDataEpoch
    ) {
      capitalPartnerPilot.refreshBusy = false;
      renderCapitalPartner();
    }
  }
}

async function runTenantPilotProbe(probeOwner) {
  if (!isCurrentTenantPilotProbe(probeOwner)) return;
  if (
    accessState.checked &&
    (accessState.authEnabled || accessState.walletAuthenticationEnabled) &&
    !accessState.sessionActive &&
    !tenantCsrfToken()
  ) {
    tenantPilot.connectionLabel = "Authenticated session required";
    tenantPilot.workspaceRecoveryState = "locked";
    tenantPilot.workspaceRecoveryErrorCode = "authentication_required";
    tenantPilot.checked = true;
    tenantPilot.connected = false;
    serverCatalogOperations = new Set();
    serverCatalogSnapshot = null;
    if (currentWorkspaceName() === "risk") {
      ++riskOperations.recoveryEpoch;
      clearRiskCatalogAvailability();
      clearRiskPortfolioRecoveryState({ status: "denied" });
      clearServicingQueueRecoveryState({ status: "denied" });
      riskOperations.error = true;
      riskOperations.queueError = true;
      riskOperations.helper = riskReferenceHelper("portfolio", "denied");
      riskOperations.queueHelper = riskReferenceHelper("queue", "denied");
    }
    if (currentWorkspaceName() === "capitalPartner") {
      ++capitalPartnerPilot.recoveryEpoch;
      clearCapitalPartnerCatalogAvailability();
      clearCapitalPartnerWorkspaceState({
        recoveryState: "denied",
        helper: "Sign in through the invited Capital Partner workspace to restore authorized applications."
      });
    }
    renderTenantPilot();
    renderAuditorEvidence();
    renderRiskOperations();
    renderCapitalPartner();
    return;
  }
  if (
    accessState.checked &&
    !accessState.authEnabled &&
    !accessState.walletAuthenticationEnabled &&
    !tenantCsrfToken()
  ) {
    tenantPilot.connectionLabel = "Private access not enabled";
    tenantPilot.workspaceRecoveryState = "unavailable";
    tenantPilot.workspaceRecoveryErrorCode = "authentication_unavailable";
    tenantPilot.checked = true;
    tenantPilot.connected = false;
    serverCatalogOperations = new Set();
    serverCatalogSnapshot = null;
    if (currentWorkspaceName() === "risk") {
      ++riskOperations.recoveryEpoch;
      clearRiskCatalogAvailability();
      clearRiskPortfolioRecoveryState({ status: "unavailable" });
      clearServicingQueueRecoveryState({ status: "unavailable" });
      riskOperations.error = true;
      riskOperations.queueError = true;
      riskOperations.helper = riskReferenceHelper("portfolio", "unavailable");
      riskOperations.queueHelper = riskReferenceHelper("queue", "unavailable");
    }
    if (currentWorkspaceName() === "capitalPartner") {
      ++capitalPartnerPilot.recoveryEpoch;
      clearCapitalPartnerCatalogAvailability();
      clearCapitalPartnerWorkspaceState({
        helper: "Private Capital Partner access is unavailable. No application details were disclosed."
      });
    }
    renderTenantPilot();
    renderAuditorEvidence();
    renderRiskOperations();
    renderCapitalPartner();
    return;
  }
  try {
    walletAuthorityLifecycle.assertProtectedAvailable();
    const response = await fetch("/tenant/v1/catalog", {
      credentials: "same-origin",
      headers: { accept: "application/json, application/problem+json" }
    });
    if (!isCurrentTenantPilotProbe(probeOwner)) return;
    if (!response.ok) {
      serverCatalogSnapshot = null;
      serverCatalogOperations = new Set();
      tenantPilot.connected = false;
      tenantPilot.connectionLabel = response.status === 401 || response.status === 403
        ? "Authenticated session required"
        : "Private gateway unavailable";
      if (currentWorkspaceName() === "risk") {
        ++riskOperations.recoveryEpoch;
        clearRiskCatalogAvailability();
        const status = response.status === 401 || response.status === 403
          ? "denied"
          : "unavailable";
        clearRiskPortfolioRecoveryState({ status });
        clearServicingQueueRecoveryState({ status });
        riskOperations.error = true;
        riskOperations.queueError = true;
        riskOperations.helper = riskReferenceHelper("portfolio", status);
        riskOperations.queueHelper = riskReferenceHelper("queue", status);
      }
      if (currentWorkspaceName() === "capitalPartner") {
        ++capitalPartnerPilot.recoveryEpoch;
        clearCapitalPartnerCatalogAvailability();
        clearCapitalPartnerWorkspaceState({
          recoveryState: response.status === 401 || response.status === 403
            ? "denied"
            : "unavailable"
        });
      }
      return;
    }
    const catalog = await response.json();
    if (!isCurrentTenantPilotProbe(probeOwner)) return;
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
    creditStatePilot.catalogAvailable = available.has("pilotReadOwnCreditState");
    creditRegistryEvidence.catalogAvailable =
      available.has("pilotReadCreditRegistryEvidence");
    creditPassportPilot.createAvailable =
      available.has("pilotCreateCreditPassportArtifact");
    creditPassportPilot.readAvailable =
      available.has("pilotReadOwnCreditPassportArtifact");
    creditPassportPilot.verifyAvailable =
      available.has("pilotVerifyCreditPassportArtifact");
    creditPassportPilot.revokeAvailable =
      available.has("pilotRevokeCreditPassportArtifact");
    capitalPartnerPilot.authorAvailable =
      available.has("pilotAuthorCapitalPartnerOffer");
    capitalPartnerPilot.selfAvailable =
      available.has("pilotReadCapitalPartnerSelf");
    capitalPartnerPilot.inboxAvailable =
      available.has("pilotReadCapitalPartnerPassportInbox");
    capitalPartnerPilot.transitionAvailable =
      available.has("pilotTransitionCapitalPartnerOffer");
    capitalPartnerPilot.portfolioAvailable =
      available.has("pilotReadCapitalPartnerPortfolio");
    capitalPartnerPilot.facilityAvailable =
      available.has("pilotReadCapitalPartnerFacility");
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
    riskOperations.portfolioReferenceCatalogAvailable =
      available.has("pilotReadTenantRiskPortfolioReference");
    riskOperations.healthCatalogAvailable = available.has("pilotReadPilotHealth");
    riskOperations.feedbackCatalogAvailable = available.has("pilotReadPilotFeedbackSummary");
    riskOperations.queueCatalogAvailable = available.has("pilotReadServicingQueue");
    riskOperations.queueReferenceCatalogAvailable =
      available.has("pilotReadServicingQueueReference");
    riskOperations.freezeCatalogAvailable = available.has("pilotFreezeSubject");
    const operationsAvailable = [...requiredOperations].every((operationId) => available.has(operationId));
    const csrfReady = Boolean(tenantCsrfToken());
    tenantPilot.connected = operationsAvailable && csrfReady;
    if (tenantPilot.connected) {
      accessState.sessionActive = true;
      accessState.pendingWorkspaceBootstrap = false;
      accessState.helper =
        "Secure session active. Product access remains bound to the authenticated Tenant role and catalog.";
    }
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
      ? "Authenticated Principal session verified. Restoring its assigned Agent authority from server truth."
      : operationsAvailable
        ? "Complete the local Human BFF session bootstrap before submitting a private mutation."
        : "The private catalog does not expose the approved Agent Subject and Mandate operations.";
    if (shouldRecoverAuthenticatedWorkspace({
      connected: tenantPilot.connected,
      currentView,
      hostWorkspaceName: currentWorkspaceName()
    })) {
      try {
        await recoverAuthenticatedWorkspace();
        if (!isCurrentTenantPilotProbe(probeOwner)) return;
      } catch (error) {
        if (!isCurrentTenantPilotProbe(probeOwner)) return;
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
    const riskBootstrapReady = currentWorkspaceName() === "risk" &&
      csrfReady &&
      riskOperations.portfolioReferenceCatalogAvailable &&
      riskOperations.readCatalogAvailable &&
      riskOperations.queueReferenceCatalogAvailable &&
      riskOperations.queueCatalogAvailable;
    if (riskBootstrapReady) {
      await recoverRiskWorkspace();
      if (!isCurrentTenantPilotProbe(probeOwner)) return;
    } else if (currentWorkspaceName() === "risk") {
      ++riskOperations.recoveryEpoch;
      clearRiskPortfolioRecoveryState({ status: "unavailable" });
      clearServicingQueueRecoveryState({ status: "unavailable" });
      riskOperations.error = true;
      riskOperations.queueError = true;
      riskOperations.helper = "The Risk catalog is incomplete. No portfolio read was attempted.";
      riskOperations.queueHelper = "The Risk catalog is incomplete. No queue read was attempted.";
    }
    const capitalPartnerBootstrapReady =
      currentWorkspaceName() === "capitalPartner" &&
      csrfReady &&
      capitalPartnerPilot.selfAvailable &&
      capitalPartnerPilot.inboxAvailable &&
      capitalPartnerPilot.portfolioAvailable &&
      capitalPartnerPilot.facilityAvailable;
    if (capitalPartnerBootstrapReady) {
      await recoverCapitalPartnerWorkspace({ quiet: true });
      if (!isCurrentTenantPilotProbe(probeOwner)) return;
    } else if (currentWorkspaceName() === "capitalPartner") {
      ++capitalPartnerPilot.recoveryEpoch;
      clearCapitalPartnerWorkspaceState({
        helper: "The Capital Partner catalog is incomplete. No Profile, Portfolio, or application read was attempted."
      });
    }
    const browserLocatorRecoveryAllowed = new Set(["borrower", "controller"])
      .has(currentWorkspaceName());
    if (browserLocatorRecoveryAllowed) {
      const rememberedHumanSubjectId = rememberedOpaqueId(HUMAN_SUBJECT_STORAGE_KEY);
      const rememberedHumanConsentId = rememberedOpaqueId(HUMAN_CONSENT_STORAGE_KEY);
      if (rememberedHumanSubjectId && !tenantInputValue("humanSubjectId")) {
        el("humanSubjectId").value = rememberedHumanSubjectId;
      }
      if (rememberedHumanConsentId && !tenantInputValue("humanConsentId")) {
        el("humanConsentId").value = rememberedHumanConsentId;
      }
      const rememberedObligationId = rememberedOwnedObligationId();
      if (
        tenantPilot.connected &&
        !tenantPilot.obligation &&
        !tenantPilot.offerReview &&
        rememberedObligationId
      ) {
        el("ownedObligationId").value = rememberedObligationId;
        await loadOwnedObligation({ obligationId: rememberedObligationId, quiet: true });
        if (!isCurrentTenantPilotProbe(probeOwner)) return;
      }
    }
  } catch {
    if (!isCurrentTenantPilotProbe(probeOwner)) return;
    tenantPilot.connected = false;
    tenantPilot.connectionLabel = "Private gateway unavailable";
    tenantPilot.workspaceRecoveryState = "error";
    tenantPilot.workspaceRecoveryErrorCode = "gateway_unavailable";
    serverCatalogOperations = new Set();
    serverCatalogSnapshot = null;
    auditorEvidence.catalogAvailable = false;
    ownedEvidence.catalogAvailable = false;
    creditStatePilot.catalogAvailable = false;
    creditRegistryEvidence.catalogAvailable = false;
    tenantPilot.obligationReadAvailable = false;
    pilotFeedback.catalogAvailable = false;
    clearRiskCatalogAvailability();
    officialReportPilot.createAvailable = false;
    officialReportPilot.readAvailable = false;
    officialReportPilot.retrieveAvailable = false;
    officialReportPilot.revokeAvailable = false;
    clearCapitalPartnerCatalogAvailability();
    if (currentWorkspaceName() === "risk") {
      ++riskOperations.recoveryEpoch;
      clearRiskPortfolioRecoveryState({ status: "unavailable" });
      clearServicingQueueRecoveryState({ status: "unavailable" });
      riskOperations.error = true;
      riskOperations.queueError = true;
      riskOperations.helper = riskReferenceHelper("portfolio", "unavailable");
      riskOperations.queueHelper = riskReferenceHelper("queue", "unavailable");
    }
    if (currentWorkspaceName() === "capitalPartner") {
      ++capitalPartnerPilot.recoveryEpoch;
      clearCapitalPartnerWorkspaceState();
    }
  } finally {
    if (!isCurrentTenantPilotProbe(probeOwner)) return;
    tenantPilot.checked = true;
    renderAccess();
    renderTenantPilot();
    renderAuditorEvidence();
    renderRiskOperations();
    renderCapitalPartner();
  }
}

async function createHumanSubject() {
  if (!hasHumanBorrowerWorkspace()) {
    const message = humanWorkspaceUnavailableMessage();
    tenantPilot.helper = message;
    renderTenantPilot();
    toast(message, "error");
    announce(message);
    return;
  }
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
  el("humanConsentId").value = "";
  forgetOpaqueId(HUMAN_CONSENT_STORAGE_KEY);
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
  tenantPilot.helper =
    "Current position preserved. Create a fresh scoped Consent for this new request.";
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
      let requestResult;
      try {
        requestResult = await tenantApi("pilotRequestCredit", {
          resource: { resourceType: "subject", resourceId: subjectId },
          payload: { authorityId, ...creditRequest },
          correlationId,
          includeTransportMeta: true
        });
      } catch (error) {
        if (error.code !== "credit_intent_already_exists") throw error;
        const duplicate = new Error(
          "This scoped Consent already created an equivalent Credit Intent. Create a fresh scoped Consent for the new request."
        );
        duplicate.code = error.code;
        duplicate.status = error.status;
        duplicate.requestId = error.requestId;
        throw duplicate;
      }
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
      let offer = tenantPilot.offer;
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
      if (tenantPilot.offerReview.schemaVersion === "request_credit_review_binding.v2") {
        const currentWorkspace = await tenantApi("pilotReadWorkspaceResume", {
          payload: {},
          idempotent: false
        });
        const currentBinding = assertRecoveredHumanCreditReviewUnchanged(
          tenantPilot.offerReview,
          currentWorkspace.response.humanOfferReview
        );
        restoreHumanCreditRequest(currentBinding.creditRequest);
        tenantPilot.workspaceResume = currentWorkspace.response;
        tenantPilot.offerReview = currentBinding;
        tenantPilot.intent = currentWorkspace.response.humanOfferReview.creditIntent;
        tenantPilot.decision = currentWorkspace.response.humanOfferReview.decision;
        tenantPilot.offer = currentWorkspace.response.humanOfferReview.offer;
        offer = tenantPilot.offer;
      }
      if (!el("humanOfferAcknowledge").checked) {
        throw new Error("Review and acknowledge the exact sandbox Offer terms first.");
      }
      const workflowId = tenantPilot.obligationWorkflowId ??
        tenantRequestToken("human_obligation_workflow");
      const correlationId = tenantPilot.obligationCorrelationId ??
        humanObligationWorkflowIdentifier(workflowId, "correlation", "credit");
      const requestId =
        humanObligationWorkflowIdentifier(workflowId, "request", "01");
      tenantPilot.obligationWorkflowId = workflowId;
      tenantPilot.obligationCorrelationId = correlationId;
      const actionPayloadHash = await sha256Hex(JSON.stringify({
        expectedOfferHash: offer.creditOfferHash,
        expectedTermsHash: offer.termsHash,
        disclosureRef: offer.disclosureRef,
        sandboxOnly: true,
        productionFundsAuthority: false
      }));
      const actionConfirmation = await requestEconomicActionConfirmation({
        actionType: "accept_offer",
        title: "Create sandbox Obligation",
        resourceId: offer.creditOfferId,
        resourceHash: offer.creditOfferHash,
        payloadHash: actionPayloadHash,
        requestId,
        effect: `${usdMinorToMoney(offer.approvedPrincipalMinor)} synthetic principal · no real funds`
      });
      if (!actionConfirmation) {
        throw Object.assign(
          new Error("Action cancelled. Nothing was submitted."),
          { code: "user_action_cancelled" }
        );
      }
      const acknowledgementHash = await sha256Hex(JSON.stringify({
        acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
        creditOfferHash: offer.creditOfferHash,
        termsHash: offer.termsHash,
        disclosureRef: offer.disclosureRef,
        actionConfirmationMethod: actionConfirmation.confirmationMethod,
        actionConfirmationHash: actionConfirmation.confirmationHash,
        actionConfirmationMessageHash: actionConfirmation.messageHash,
        sandboxOnly: true,
        productionFundsAuthority: false
      }));
      const step = await tenantApi("pilotAcceptCreditOffer", {
        resource: { resourceType: "credit_offer", resourceId: offer.creditOfferId },
        payload: {
          expectedOfferHash: offer.creditOfferHash,
          expectedTermsHash: offer.termsHash,
          acknowledgementHash,
          actionConfirmation
        },
        correlationId,
        requestId,
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
      resetOwnedEvidenceState({
        obligationId: result.response.obligation.obligationId,
        helper: "Obligation created; loading its owner-authorized Evidence…"
      });
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
      try {
        await recoverAuthenticatedWorkspace();
      } catch (error) {
        tenantPilot.workspaceRecoveryState = "refresh_failed";
        tenantPilot.workspaceRecoveryErrorCode =
          error?.code ?? "post_acceptance_refresh_failed";
        tenantPilot.obligationHydrationHelper =
          "Obligation creation succeeded. The follow-up workspace refresh failed; use Refresh case to reconcile the committed server state.";
      }
      await refreshOwnedEvidenceAfterCommittedAction(
        result.response.obligation.obligationId,
        {
          eventType: "credit_offer_accepted",
          occurredAt: result.response.acceptance.acceptedAt
        }
      );
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
      const requestId =
        humanObligationWorkflowIdentifier(workflowId, "request", "02");
      const actionPayloadHash = await sha256Hex(JSON.stringify({
        obligationHash: obligation.obligationHash,
        amountMinor: obligation.originalPrincipalMinor,
        sandboxRail: "signed_non_redeemable",
        withdrawable: false,
        productionFundsMoved: false
      }));
      const actionConfirmation = await requestEconomicActionConfirmation({
        actionType: "execute_obligation",
        title: "Execute sandbox Obligation",
        resourceId: obligation.obligationId,
        resourceHash: obligation.obligationHash,
        payloadHash: actionPayloadHash,
        requestId,
        effect: `${usdMinorToMoney(obligation.originalPrincipalMinor)} synthetic ledger execution`
      });
      if (!actionConfirmation) {
        throw Object.assign(
          new Error("Action cancelled. Nothing was submitted."),
          { code: "user_action_cancelled" }
        );
      }
      const step = await tenantApi("pilotExecuteSandboxObligation", {
        resource: { resourceType: "obligation", resourceId: obligation.obligationId },
        payload: { actionConfirmation },
        correlationId: tenantPilot.obligationCorrelationId,
        requestId,
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
      await refreshOwnedEvidenceAfterCommittedAction(
        result.response.obligation.obligationId,
        {
          eventType: "obligation_sandbox_executed",
          occurredAt: result.response.executionReceipt.executedAt
        }
      );
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
      const amountMinor = String(Math.round(amount * 100));
      const sourceCode = el(sourceInputId).value;
      const workflowId = tenantPilot.obligationWorkflowId ??
        tenantRequestToken("human_obligation_servicing_workflow");
      tenantPilot.obligationWorkflowId = workflowId;
      tenantPilot.obligationCorrelationId ??=
        humanObligationWorkflowIdentifier(workflowId, "correlation", "servicing");
      const nextRepaymentSequence = tenantPilot.repaymentSequence + 1;
      const repaymentStepId = `03-${String(nextRepaymentSequence).padStart(2, "0")}`;
      const requestId =
        humanObligationWorkflowIdentifier(workflowId, "request", repaymentStepId);
      const actionPayloadHash = await sha256Hex(JSON.stringify({
        obligationHash: obligation.obligationHash,
        amountMinor,
        sourceCode,
        waterfall: "fee_interest_principal",
        productionFundsMoved: false
      }));
      const actionConfirmation = await requestEconomicActionConfirmation({
        actionType: "post_repayment",
        title: "Post sandbox repayment",
        resourceId: obligation.obligationId,
        resourceHash: obligation.obligationHash,
        payloadHash: actionPayloadHash,
        requestId,
        effect: `${usdMinorToMoney(amountMinor)} synthetic repayment · ${titleize(sourceCode)}`
      });
      if (!actionConfirmation) {
        throw Object.assign(
          new Error("Action cancelled. Nothing was submitted."),
          { code: "user_action_cancelled" }
        );
      }
      const step = await tenantApi("pilotPostSandboxRepayment", {
        resource: { resourceType: "obligation", resourceId: obligation.obligationId },
        payload: {
          amountMinor,
          sourceCode,
          actionConfirmation
        },
        correlationId: tenantPilot.obligationCorrelationId,
        requestId,
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
      await refreshOwnedEvidenceAfterCommittedAction(
        result.response.obligation.obligationId,
        {
          eventType: "repayment_posted",
          occurredAt: result.response.repayment.occurredAt
        }
      );
    },
    "Sandbox repayment posted through the deterministic fee, interest, and principal waterfall."
  );
}

async function createPrivateAgentSubject() {
  await runAgentAuthorityAction(
    el("createPrivateAgentSubjectBtn"),
    async () => {
      const subjectActorId = agentAuthorityPilot.workspaceSelection?.status === "selected"
        ? agentAuthorityPilot.workspaceSelection.actorId
        : null;
      requireSelectedPrincipalAgent({ subjectId: null, mandateId: null });
      const displayName = tenantInputValue("agentAuthorityDisplayName");
      const jurisdiction = tenantInputValue("agentAuthorityJurisdiction");
      if (!subjectActorId || !displayName || !jurisdiction) {
        throw new Error("A single server-assigned Agent, display name, and jurisdiction are required.");
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
      agentAuthorityPilot.workspaceSelection = Object.freeze({
        ...agentAuthorityPilot.workspaceSelection,
        subjectId: result.response.subjectId
      });
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
      const subjectId = agentAuthorityPilot.subject?.subjectId;
      if (!subjectId) {
        throw new Error("Restore or create the assigned Agent Subject first.");
      }
      requireSelectedPrincipalAgent({ subjectId });
      const result = await tenantApi("pilotCreateAgentAccountChallenge", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: requestedAgentAccountProof()
      });
      agentAuthorityPilot.accountChallenge = result.response;
      agentAuthorityPilot.accountBinding = null;
    },
    () => `One-use EIP-712 request created. ${agentAccountProofInstruction()} No background polling is running.`
  );
}

async function proveAgentAccountOnline() {
  await runAgentAuthorityAction(
    el("proveAccountOnlineBtn"),
    async () => {
      const subjectId = agentAuthorityPilot.subject?.subjectId;
      const challenge = agentAuthorityPilot.accountChallenge;
      if (!subjectId || challenge?.subjectId !== subjectId) {
        throw new Error("Create a current signing request for this Agent Subject first.");
      }
      requireSelectedPrincipalAgent({ subjectId });
      const proof = await referenceAgentApi(
        "/local/v1/reference-agent/account-proof",
        { subjectId, challenge }
      );
      agentAuthorityPilot.accountBinding = {
        subjectId: proof.subjectId,
        subjectStatus: proof.subjectStatus,
        accountBinding: proof.accountBinding
      };
      if (agentAuthorityPilot.subject?.subjectId === subjectId) {
        agentAuthorityPilot.subject = {
          ...agentAuthorityPilot.subject,
          status: proof.subjectStatus
        };
      }
    },
    () =>
      "The registered test Agent proved its own account online. Only the verified AccountBinding returned to this browser."
  );
}

async function refreshAgentAccountBinding() {
  await runAgentAuthorityAction(
    el("refreshAccountBindingBtn"),
    async () => {
      const subjectId = agentAuthorityPilot.subject?.subjectId;
      if (!subjectId) throw new Error("Restore or create the assigned Agent Subject first.");
      requireSelectedPrincipalAgent({ subjectId });
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
      : "No verified AccountBinding yet. The registered Agent must submit the one-use proof; use Refresh binding when it finishes."
  );
}

async function loadExactMandate(mandateId) {
  const selection = requireSelectedPrincipalAgent({ mandateId });
  if (
    selection?.status !== "selected" ||
    selection.mandateId !== mandateId ||
    !exactResourceId(selection.subjectId)
  ) {
    throw new Error("The exact server-selected Agent Mandate is unavailable.");
  }
  const previousMandateId = agentAuthorityPilot.mandate?.mandateId ?? null;
  const result = await tenantApi("pilotReadMandate", {
    resource: { resourceType: "mandate", resourceId: mandateId },
    idempotent: false
  });
  agentAuthorityPilot.mandate = result.response.mandate;
  if (result.response.mandate.subjectId !== selection.subjectId) {
    agentAuthorityPilot.mandate = null;
    throw new Error("The recovered Mandate does not match the server-selected Agent Subject.");
  }
  if (
    previousMandateId !== result.response.mandate.mandateId ||
    agentOnlinePilot.offerReceipt?.mandateId !== result.response.mandate.mandateId
  ) {
    agentOnlinePilot.offerReceipt = null;
    agentOnlinePilot.applicationResult = null;
    agentOnlinePilot.acceptanceResult = null;
    agentOnlinePilot.executionResult = null;
    agentOnlinePilot.repaymentResult = null;
    agentOnlinePilot.evidenceResult = null;
    agentOnlinePilot.runtimeResult = null;
    forgetAgentOfferReceipt();
  }
  agentAuthorityPilot.activationEvidenceHash = result.response.mandate.activationAcknowledgement?.evidenceHash ?? null;
  agentAuthorityPilot.workspaceSelection = Object.freeze({
    ...agentAuthorityPilot.workspaceSelection,
    subjectId: result.response.mandate.subjectId,
    mandateId: result.response.mandate.mandateId
  });
  el("principalMandateAcknowledge").checked = false;
}

async function createDraftAgentMandate() {
  await runAgentAuthorityAction(
    el("createDraftMandateBtn"),
    async () => {
      const subjectId = agentAuthorityPilot.subject?.subjectId;
      if (!subjectId) throw new Error("Restore or create the assigned Agent Subject first.");
      requireSelectedPrincipalAgent({ subjectId, mandateId: null });
      const result = await tenantApi("pilotCreateDraftMandate", {
        resource: { resourceType: "subject", resourceId: subjectId },
        payload: requestedAgentMandateTerms()
      });
      agentAuthorityPilot.workspaceSelection = Object.freeze({
        ...agentAuthorityPilot.workspaceSelection,
        mandateId: result.response.mandateId
      });
      await loadExactMandate(result.response.mandateId);
    },
    () => agentAuthorityPilot.subject?.status === "pending"
      ? "Draft Mandate created and verified. The new Subject is pending, so exact activation remains blocked."
      : "Draft Mandate created. Open the application handoff and let the Agent obtain its Offer workflow receipt before activation."
  );
}

async function activateExactAgentMandate() {
  await runAgentAuthorityAction(
    el("activateMandateBtn"),
    async () => {
      const mandate = agentAuthorityPilot.mandate;
      if (!mandate || mandate.status !== "draft") throw new Error("Load an exact draft Mandate first.");
      requireSelectedPrincipalAgent({
        subjectId: mandate.subjectId,
        mandateId: mandate.mandateId
      });
      if (!el("principalMandateAcknowledge").checked) throw new Error("Confirm the exact Mandate and terms first.");
      const continuation = controlledAgentContinuationForMandate(
        tenantPilot.workspaceResume,
        mandate
      );
      if (
        !continuation ||
        agentOnlinePilot.offerReceipt?.offer?.creditOfferId !==
          continuation.creditOfferId ||
        agentOnlinePilot.offerReceipt?.offer?.creditOfferHash !==
          continuation.creditOfferHash
      ) {
        throw new Error(
          "Check for the exact persisted Agent Offer before activating this Mandate."
        );
      }
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
    "Sandbox Mandate activated by the authenticated Human Principal. The runtime handoff is ready for the existing Agent Offer receipt."
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

function showView(viewName, { focus = true, historyMode = "push" } = {}) {
  const requestedView = VIEW_META[viewName] ? viewName : "overview";
  const nextView = canonicalWorkspaceView(currentWorkspaceName(), requestedView);
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
  const activeNavigationItem = document.querySelector(`.nav-item[data-view="${nextView}"]`);
  if (
    activeNavigationItem &&
    workspaceSurfaceAccess(currentWorkspaceName()).advancedViews.has(nextView)
  ) {
    document.body.classList.add("sidebar-tools-open");
    el("sidebarMoreBtn").setAttribute("aria-expanded", "true");
  }
  el("viewEyebrow").textContent = nextView === "request-credit"
    ? `${interactionMode === "agent" ? "Agent" : "Human"} entry · shared kernel`
    : VIEW_META[nextView].eyebrow;
  el("viewTitle").textContent = VIEW_META[nextView].title;
  if (["agent-console", "architecture"].includes(nextView)) setMode("agent");
  else renderPrivateProductSurfaces();
  setNavigationOpen(false, { moveFocus: false });
  const canonicalHash = `#${nextView}`;
  if (historyMode === "replace") {
    history.replaceState(null, "", canonicalHash);
  } else if (historyMode === "push" && location.hash !== canonicalHash) {
    history.pushState(null, "", canonicalHash);
  }
  if (focus) {
    el("mainContent").focus({ preventScroll: true });
    announce(`${VIEW_META[nextView].title} view selected`);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function restoreLocation({ focus = false } = {}) {
  const locationState = resolveWorkspaceLocation(
    currentWorkspaceName(),
    location.hash
  );
  if (locationState.kind === "document_anchor") return;
  showView(locationState.view, {
    focus,
    historyMode: locationState.requiresReplace ? "replace" : "none"
  });
}

function handleWorkspaceLocationChange() {
  const locationState = resolveWorkspaceLocation(
    currentWorkspaceName(),
    location.hash
  );
  if (locationState.kind === "document_anchor") return;
  if (
    locationState.view === currentView &&
    locationState.requiresReplace === false
  ) return;
  restoreLocation({ focus: true });
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
  const target = el(targetId);
  target?.closest("details")?.setAttribute("open", "");
  requestAnimationFrame(() => focusJumpTarget(target));
  announce("Local Agent integration contract opened");
}

function runAgentGuideAction(action) {
  if (action === "principal-setup") {
    openPrincipalAgentAuthority();
    return;
  }
  if (action === "agent-credit") {
    setMode("agent");
    showView("request-credit");
    requestAnimationFrame(() => focusJumpTarget(el("agentRequestCreditTitle")));
    announce("Agent credit continuation opened");
    return;
  }
  if (action === "view-obligations") {
    setMode("agent");
    showView("obligations");
    if (tenantPilot.workspaceObligations.length > 0) {
      refreshOwnedPositionIndex();
    }
    announce("Principal-controlled Agent obligations opened");
    return;
  }
  if (action === "open-agent-workspace") {
    setMode("agent");
    showView("agent-console");
    requestAnimationFrame(() => focusJumpTarget(el("agentOnlineWorkflow")));
    announce("Agent workspace opened");
    return;
  }
  if (action === "run-online-agent") {
    setMode("agent");
    showView("agent-console");
    requestAnimationFrame(() => focusJumpTarget(el("agentOnlineWorkflow")));
    runOnlineReferenceAgent();
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

function continueAfterClosedServicingCase() {
  const currentObligationId = tenantPilot.obligation?.obligationId;
  const anotherPosition = tenantPilot.workspaceObligations.find(
    ({ resourceId }) => resourceId !== currentObligationId
  );
  if (anotherPosition) {
    el("ownedObligationId").value = anotherPosition.resourceId;
    loadOwnedObligation({ obligationId: anotherPosition.resourceId });
    requestAnimationFrame(() => focusJumpTarget(el("ownedPositionPicker")));
    announce("Another owned position selected");
    return;
  }
  setMode("human");
  showView("request-credit");
  startAnotherHumanApplication();
  announce("New Human credit request opened");
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
    openAgentProtocolDetails({ targetId: "agentConsoleContract" });
    return;
  }
  if (action === "servicing-cure") {
    showView("repay-settle");
    requestAnimationFrame(() => focusJumpTarget(el("servicingCureCard")));
    announce("Human Servicing Case repayment controls opened");
    return;
  }
  if (action === "new-human-credit") {
    setMode("human");
    showView("request-credit");
    startAnotherHumanApplication();
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
  if (action === "human-evidence") loadOwnedEvidence();
  announce(action === "human-evidence"
    ? "Owner Obligation Evidence opened"
    : action === "human-obligation"
      ? "Human Obligation repayment controls opened"
      : "Human credit workbench opened");
}

function openBorrowingEntry(entryMode) {
  if (entryMode === "human") {
    setMode("human");
    showView("request-credit");
    if (tenantPilot.obligation) {
      startAnotherHumanApplication();
      announce("New Human credit application opened; current position preserved");
      return;
    }
    requestAnimationFrame(() => focusJumpTarget(el("humanApplication")));
    announce("Human application and credit evaluation opened");
    return;
  }
  setMode("agent");
  showView("agent-console");
  requestAnimationFrame(() => focusJumpTarget(el("agentOnlineWorkflow")));
  announce("Agent borrowing and approved-use actions opened");
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
  cell.dataset.label = "Evidence digest (offchain)";
  content.className = "auditor-evidence-hash";
  code.textContent = item.evidenceHash;
  code.title = item.evidenceHash;
  button.className = "icon-button";
  button.type = "button";
  button.title = "Copy offchain Evidence digest";
  button.setAttribute("aria-label", `Copy offchain Evidence digest for ${item.evidenceId}`);
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
    evidenceTextCell("Server state", titleize(item.sourceFinality), item.schemaVersion),
    evidenceTimeCell(item),
    evidenceHashCell(item)
  );
  return row;
}

function pendingEvidenceAnchorGroup(items = evidenceAnchorPilot.items) {
  const eligible = items.filter(({ status }) =>
    new Set(["pending", "failed", "prepared", "reorged"]).has(status)
  );
  if (eligible.length === 0) return [];
  const groupHash = eligible[0].anchorGroupHash;
  return eligible
    .filter(({ anchorGroupHash }) => anchorGroupHash === groupHash)
    .slice(0, 16);
}

function renderEvidenceAnchor() {
  const status = el("humanObligationChainAnchorStatus");
  const copy = el("humanObligationChainAnchorCopy");
  const button = el("anchorPendingEvidenceBtn");
  const link = el("humanObligationChainAnchorLink");
  if (!status || !copy || !button || !link) return;
  const evidenceLoaded = currentOwnedEvidenceLoaded();
  const evidenceLatestProven = currentOwnedEvidenceLatestProven();
  const evidenceItems = evidenceLoaded ? ownedEvidence.items : [];
  const items = evidenceAnchorPilot.obligationId === ownedEvidence.obligationId &&
    evidenceLoaded
    ? evidenceAnchorPilot.items
    : [];
  const pending = pendingEvidenceAnchorGroup(items);
  const open = items.filter(({ status: itemStatus }) =>
    new Set(["broadcast", "unknown", "included", "safe"]).has(itemStatus)
  );
  const finalized = items.filter(({ status: itemStatus }) =>
    itemStatus === "finalized"
  );
  const receipt = createEvidenceReceiptPresentation({
    evidenceItems,
    anchorItems: items,
    evidenceQueried: evidenceLoaded,
    anchorAvailable: evidenceAnchorPilot.available
  });
  el("humanObligationReceiptServerState").textContent = receipt.serverRecordLabel;
  el("humanObligationReceiptDigestState").textContent = receipt.evidenceDigestLabel;
  el("humanObligationReceiptTransactionState").textContent = receipt.transactionLabel;
  el("humanObligationReceiptFinalityState").textContent = receipt.finalityLabel;
  el("humanObligationReceiptIndexerState").textContent = receipt.indexerLabel;
  el("humanObligationReceiptReconciliationState").textContent =
    evidenceLoaded && !evidenceLatestProven
      ? "Latest timeline not proven · coverage pending"
      : receipt.reconciliationLabel;
  link.hidden = !receipt.transactionUrl;
  if (receipt.transactionUrl) {
    link.href = receipt.transactionUrl;
    link.textContent = finalized.length === items.length
      ? "View verified transaction"
      : "View submitted transaction";
  } else {
    link.removeAttribute("href");
  }
  button.hidden = !evidenceAnchorPilot.available ||
    items.length === 0 ||
    (pending.length === 0 && open.length === 0);
  button.disabled = evidenceAnchorPilot.busy;
  button.toggleAttribute("aria-busy", evidenceAnchorPilot.busy);
  button.textContent = evidenceAnchorPilot.busy
    ? "Checking Base Sepolia…"
    : pending.length > 0
      ? `Confirm & anchor ${pending.length} Evidence hash${pending.length === 1 ? "" : "es"}`
      : "Refresh chain finality";

  status.classList.toggle(
    "warning",
    !evidenceLatestProven || finalized.length !== items.length
  );
  status.classList.toggle(
    "neutral",
    evidenceAnchorPilot.available && items.length === 0
  );
  if (!evidenceAnchorPilot.available) {
    status.textContent = "Anchor service unavailable";
    copy.textContent =
      "No chain contract is configured for this local runtime. Server Evidence hashes must not be presented as blockchain transactions.";
  } else if (items.length === 0) {
    status.textContent = "Waiting for Evidence";
    copy.textContent =
      "Load the durable timeline to resolve the chain status of every Evidence hash.";
  } else if (finalized.length === items.length) {
    status.textContent = evidenceLatestProven
      ? `${finalized.length}/${items.length} finalized`
      : `${finalized.length}/${items.length} loaded hashes finalized · timeline partial`;
    copy.textContent = evidenceLatestProven
      ? "Every loaded Evidence hash has a verified, finalized Base Sepolia registry event. Only hashes and protocol references are public; payload and KYC/PII remain offchain."
      : "Every currently loaded Evidence hash is finalized, but the latest bounded timeline is not yet proven. Continue or retry only the owner-authorized Evidence read.";
  } else if (open.length > 0) {
    status.textContent = `${finalized.length}/${items.length} finalized`;
    copy.textContent =
      `${open.length} Evidence anchor${open.length === 1 ? " is" : "s are"} submitted and awaiting verified finality. A transaction link is not proof of finalization until the observer confirms it.`;
  } else if (items.some(({ status: itemStatus }) => itemStatus === "reorged")) {
    status.textContent = "Chain reorganization detected";
    copy.textContent =
      "At least one prior Evidence transaction is no longer canonical. Its orphaned-block observation is preserved; confirm a new zero-value anchor transaction to restore chain closure.";
  } else {
    status.textContent = `${items.length - finalized.length} pending`;
    copy.textContent =
      `${items.length - finalized.length} loaded Evidence hash${items.length - finalized.length === 1 ? "" : "es"} still require a zero-value wallet transaction on Base Sepolia. No loan principal or repayment value is transferred by this anchor.`;
  }
}

async function loadEvidenceAnchorStatus({ observe = false } = {}) {
  const obligationId = tenantPilot.obligation?.obligationId;
  const hashes = currentOwnedEvidenceLoaded()
    ? ownedEvidence.items.map(({ evidenceHash }) => evidenceHash)
    : [];
  if (!obligationId || hashes.length === 0 || evidenceAnchorPilot.busy) {
    renderEvidenceAnchor();
    return;
  }
  const evidenceDataEpoch = authenticatedDataEpoch;
  const evidenceQueryEpoch = ownedEvidence.queryEpoch;
  const stillCurrent = () => (
    evidenceDataEpoch === authenticatedDataEpoch &&
    evidenceQueryEpoch === ownedEvidence.queryEpoch &&
    ownedEvidence.obligationId === obligationId &&
    tenantPilot.obligation?.obligationId === obligationId
  );
  evidenceAnchorPilot.busy = true;
  evidenceAnchorPilot.error = false;
  renderEvidenceAnchor();
  try {
    if (!evidenceAnchorPilot.config) {
      const config = await evidenceAnchorApi(
        "/chain/v1/evidence-anchors/config",
        { method: "GET" }
      );
      if (!stillCurrent()) return;
      evidenceAnchorPilot.config = config;
    }
    evidenceAnchorPilot.available = true;
    let result = await evidenceAnchorApi(
      "/chain/v1/evidence-anchors/status",
      { body: { obligationId, evidenceHashes: hashes } }
    );
    if (!stillCurrent()) return;
    if (
      observe &&
      result.items.some(({ status }) =>
        new Set(["broadcast", "unknown", "included", "safe"]).has(status)
      )
    ) {
      const transactionGroups = new Map();
      for (const item of result.items) {
        if (
          !item.transactionHash ||
          !new Set(["broadcast", "unknown", "included", "safe"]).has(item.status)
        ) continue;
        const current = transactionGroups.get(item.transactionHash) ?? [];
        current.push(item.evidenceHash);
        transactionGroups.set(item.transactionHash, current);
      }
      for (const transactionHashes of transactionGroups.values()) {
        await evidenceAnchorApi(
          "/chain/v1/evidence-anchors/observe",
          {
            body: {
              obligationId,
              evidenceHashes: transactionHashes
            }
          }
        );
        if (!stillCurrent()) return;
      }
      result = await evidenceAnchorApi(
        "/chain/v1/evidence-anchors/status",
        { body: { obligationId, evidenceHashes: hashes } }
      );
      if (!stillCurrent()) return;
    }
    evidenceAnchorPilot.obligationId = obligationId;
    evidenceAnchorPilot.items = result.items;
    evidenceAnchorPilot.helper = result.complete
      ? "All loaded Evidence anchors are finalized."
      : "Chain coverage is incomplete until every loaded Evidence hash is finalized.";
  } catch (error) {
    if (!stillCurrent()) return;
    evidenceAnchorPilot.available = error.status !== 404;
    evidenceAnchorPilot.error = true;
    evidenceAnchorPilot.helper =
      error.status === 404
        ? "The Evidence anchor service is not configured on this runtime."
        : `Evidence anchor status failed. Request ID: ${error.requestId ?? "unavailable"}`;
  } finally {
    if (stillCurrent()) {
      evidenceAnchorPilot.busy = false;
      renderEvidenceAnchor();
    }
  }
}

async function anchorOrRefreshOwnedEvidence() {
  if (evidenceAnchorPilot.busy) return;
  const obligationId = tenantPilot.obligation?.obligationId;
  const group = pendingEvidenceAnchorGroup();
  if (!obligationId) return;
  if (group.length === 0) {
    await loadEvidenceAnchorStatus({ observe: true });
    return;
  }
  const connector = walletProviderRegistry.getSelectedConnector();
  if (!connector) {
    toast("Select and connect one wallet before anchoring Evidence.", "error");
    return;
  }
  evidenceAnchorPilot.busy = true;
  evidenceAnchorPilot.error = false;
  renderEvidenceAnchor();
  const hashes = group.map(({ evidenceHash }) => evidenceHash);
  try {
    const accounts = await connector.getAccounts();
    const account = accounts.accounts[0];
    const accountAddress = account?.address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(accountAddress ?? "")) {
      throw new Error("The selected wallet has no connected EVM account.");
    }
    const baseSepolia = SUPPORTED_WALLET_CHAINS[84532];
    await switchWalletChain(connector, baseSepolia);
    const chain = await connector.getChain();
    if (chain.chainId !== "eip155:84532") {
      throw new Error("The wallet did not switch to Base Sepolia.");
    }
    await connector.submitPreparedExecution({
      accountId: account.accountId,
      contextEpoch: connector.captureContext().contextEpoch,
      purpose: "evidence_anchor",
      evidenceHashes: hashes
    });
  } catch (error) {
    evidenceAnchorPilot.error = true;
    evidenceAnchorPilot.helper = Number(error?.code) === 4001
      ? "Wallet transaction rejected. No Evidence anchor was submitted."
      : error?.message ?? "Evidence anchor failed.";
    toast(evidenceAnchorPilot.helper, "error");
  } finally {
    evidenceAnchorPilot.busy = false;
    renderEvidenceAnchor();
  }
}

function applyOwnedEvidencePage(response, {
  append = false,
  obligationId,
  sourceLabel = "Owner/controller-authorized"
} = {}) {
  Object.assign(ownedEvidence, createBoundedOwnedEvidenceProjection({
    append,
    currentItems: ownedEvidence.items,
    limit: OWNED_EVIDENCE_DISPLAY_LIMIT,
    obligationId,
    response,
    sourceLabel,
    wasCapped: ownedEvidence.capped
  }), { queried: true, error: false });
  evidenceAnchorPilot.items = evidenceAnchorPilot.obligationId === obligationId
    ? retainMatchingEvidenceAnchors(evidenceAnchorPilot.items, ownedEvidence.items)
    : [];
  if (evidenceAnchorPilot.obligationId !== obligationId) {
    evidenceAnchorPilot.obligationId = null;
  }
  return reconcileExpectedOwnedEvidenceMarker();
}

function reconcileExpectedOwnedEvidenceMarker() {
  const marker = ownedEvidence.expectedMarker;
  if (!marker) return true;
  if (marker.obligationId !== ownedEvidence.obligationId) {
    ownedEvidence.error = true;
    ownedEvidence.helper =
      "Evidence verification was quarantined because its expected event belongs to another Obligation.";
    return false;
  }
  if (hasOwnedEvidenceMarker(ownedEvidence.items, marker)) {
    ownedEvidence.expectedMarker = null;
    return true;
  }
  if (ownedEvidence.hasMore) {
    ownedEvidence.helper +=
      ` Expected ${marker.eventType} Evidence may be on the next bounded page; Load more continues the read-only cursor.`;
    return false;
  }
  ownedEvidence.error = true;
  ownedEvidence.helper =
    `The lifecycle action completed, but latest ${marker.eventType} Evidence is delayed. Retry Evidence read; the economic command was not resubmitted.`;
  return false;
}

function renderOwnedEvidence() {
  const panel = el("ownedEvidencePanel");
  if (!panel) return;
  const obligationId = tenantPilot.obligation?.obligationId ?? null;
  const matchesCurrent = Boolean(
    obligationId && ownedEvidence.obligationId === obligationId
  );
  const items = matchesCurrent ? ownedEvidence.items : [];
  const queried = matchesCurrent && ownedEvidence.queried;
  const rows = newestOwnedEvidenceFirst(items).map(auditorEvidenceRow);
  if (rows.length === 0) {
    const empty = emptyRow(queried
      ? "No durable server Evidence events were returned for this Obligation."
      : "Load the owner-authorized timeline after accepting the Offer.");
    empty.setAttribute("role", "row");
    rows.push(empty);
  }
  el("ownedEvidenceRows").replaceChildren(...rows);
  el("ownedEvidenceCount").textContent = String(items.length);
  const finalities = new Set(items.map((item) => item.sourceFinality));
  el("ownedEvidenceFinality").textContent = finalities.size === 0
    ? "Waiting"
    : finalities.size === 1
      ? titleize([...finalities][0])
      : `${finalities.size} states`;
  el("ownedEvidenceAsOf").textContent = matchesCurrent && ownedEvidence.asOf
    ? formatEvidenceTime(ownedEvidence.asOf, { short: true })
    : "Not queried";
  el("ownedEvidenceAccess").textContent = ownedEvidence.catalogAvailable
    ? "Owner / controller read"
    : "Operation unavailable";
  el("ownedEvidenceAccess").classList.toggle("warning", !ownedEvidence.catalogAvailable);
  el("ownedEvidenceHelper").textContent = matchesCurrent
    ? ownedEvidence.helper
    : OWNED_EVIDENCE_DEFAULT_HELPER;
  el("ownedEvidenceHelper").classList.toggle(
    "error",
    matchesCurrent && ownedEvidence.error
  );
  const load = el("loadOwnedEvidenceBtn");
  load.disabled = ownedEvidence.busy || !ownedEvidence.catalogAvailable || !obligationId;
  load.toggleAttribute("aria-busy", ownedEvidence.busy);
  load.textContent = ownedEvidence.busy && matchesCurrent
    ? "Loading Evidence…"
    : matchesCurrent && ownedEvidence.error
      ? "Retry Evidence read"
      : queried
        ? "Refresh Evidence"
        : "Load timeline";
  const more = el("loadMoreOwnedEvidenceBtn");
  more.hidden = !matchesCurrent || !ownedEvidence.hasMore;
  more.disabled = ownedEvidence.busy || !ownedEvidence.nextCursor || !obligationId;
  more.toggleAttribute("aria-busy", ownedEvidence.busy);
  renderEvidenceAnchor();
}

async function loadOwnedEvidence({ append = false, refreshAnchor = true } = {}) {
  if (ownedEvidence.busy) return;
  const obligationId = tenantPilot.obligation?.obligationId;
  if (!obligationId) return;
  if (append && (!ownedEvidence.nextCursor || ownedEvidence.obligationId !== obligationId)) return;
  const expectedMarker = ownedEvidence.obligationId === obligationId
    ? ownedEvidence.expectedMarker
    : null;
  const requestDataEpoch = authenticatedDataEpoch;
  const requestEpoch = append
    ? ownedEvidence.queryEpoch + 1
    : resetOwnedEvidenceState({
        busy: true,
        expectedMarker,
        obligationId,
        helper: "Verifying exact owner/controller access and loading redacted Evidence…"
      });
  if (append) {
    Object.assign(ownedEvidence, {
      busy: true,
      error: false,
      queryEpoch: requestEpoch,
      helper: "Loading the next durable Evidence page through the read-only cursor…"
    });
  }
  renderOwnedEvidence();
  const stillCurrent = () => (
    requestDataEpoch === authenticatedDataEpoch &&
    requestEpoch === ownedEvidence.queryEpoch &&
    tenantPilot.obligation?.obligationId === obligationId
  );
  try {
    const result = await tenantApi("pilotReadOwnObligationEvidence", {
      resource: { resourceType: "evidence", resourceId: obligationId },
      payload: {
        limit: OWNED_EVIDENCE_DISPLAY_LIMIT,
        ...(append ? { cursor: ownedEvidence.nextCursor } : {})
      },
      idempotent: false
    });
    if (!stillCurrent()) return;
    applyOwnedEvidencePage(result.response, { append, obligationId });
    toast(
      ownedEvidence.error
        ? ownedEvidence.helper
        : append
          ? "Next owner Evidence page loaded"
          : "Your Obligation Evidence loaded",
      ownedEvidence.error ? "error" : undefined
    );
    announce(ownedEvidence.helper);
    if (refreshAnchor) await loadEvidenceAnchorStatus();
  } catch (error) {
    if (!stillCurrent()) return;
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    ownedEvidence.error = true;
    ownedEvidence.helper = nonEnumerating
      ? "This Obligation is unavailable or is not bound to your active identity."
      : `Evidence query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(ownedEvidence.helper, "error");
    announce(ownedEvidence.helper);
  } finally {
    if (stillCurrent()) {
      ownedEvidence.busy = false;
      renderTenantPilot();
    }
  }
}

async function refreshOwnedEvidenceAfterCommittedAction(obligationId, expectedEvidence) {
  const markDelayed = (detail) => {
    if (
      tenantPilot.obligation?.obligationId !== obligationId ||
      ownedEvidence.obligationId !== obligationId
    ) return false;
    ownedEvidence.error = true;
    ownedEvidence.helper =
      `The lifecycle action completed, but latest Evidence verification is delayed. Retry Evidence read; the economic command was not resubmitted. ${detail}`;
    renderTenantPilot();
    return false;
  };
  try {
    resetOwnedEvidenceState({
      expectedMarker: { ...expectedEvidence, obligationId },
      obligationId,
      helper: "Lifecycle action completed; verifying its latest Evidence…"
    });
    await loadOwnedObligation({ obligationId, quiet: true });
    await loadOwnedEvidence({ refreshAnchor: false });
    if (
      ownedEvidence.error ||
      !ownedEvidence.queried ||
      ownedEvidence.obligationId !== obligationId
    ) {
      return markDelayed(ownedEvidence.helper);
    }
    if (ownedEvidence.expectedMarker) {
      if (ownedEvidence.hasMore) return false;
      return markDelayed(
        `Expected ${expectedEvidence?.eventType ?? "lifecycle"} Evidence is not visible yet.`
      );
    }
    return true;
  } catch (error) {
    return markDelayed(`Request ID: ${error?.requestId ?? "unavailable"}`);
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

function creditRegistryTransactionRow(transaction) {
  const row = document.createElement("div");
  const kind = document.createElement("span");
  const transactionCell = document.createElement("span");
  const transactionLink = document.createElement("a");
  const block = document.createElement("span");
  const finality = document.createElement("span");
  row.className = "registry-evidence-row";
  row.setAttribute("role", "row");

  kind.dataset.label = "Lifecycle event";
  kind.textContent = titleize(transaction.kind);

  transactionCell.dataset.label = "Transaction";
  transactionLink.href =
    `https://sepolia.basescan.org/tx/${transaction.transactionHash}`;
  transactionLink.target = "_blank";
  transactionLink.rel = "noreferrer noopener";
  transactionLink.textContent = compactDecisionProofHash(
    transaction.transactionHash
  );
  transactionLink.title = transaction.transactionHash;
  transactionCell.append(transactionLink);

  block.dataset.label = "Block";
  block.textContent = `#${transaction.blockNumber}`;
  block.title = transaction.blockHash;

  finality.dataset.label = "Finality";
  finality.textContent =
    `${titleize(transaction.observationStatus)} · ${transaction.confirmations} confirmations`;

  row.append(kind, transactionCell, block, finality);
  return row;
}

function renderCreditRegistryEvidence() {
  const panel = el("creditRegistryEvidencePanel");
  if (!panel) return;
  const response = creditRegistryEvidence.response;
  const rows = response?.transactions?.map(creditRegistryTransactionRow) ?? [];
  if (rows.length === 0) {
    const empty = emptyRow(creditRegistryEvidence.queried
      ? "No eligible Registry observation was returned."
      : "Query one exact authorization hash to verify its public testnet lifecycle.");
    empty.setAttribute("role", "row");
    rows.push(empty);
  }

  el("creditRegistryEvidenceRows").replaceChildren(...rows);
  el("creditRegistryEvidenceAccess").textContent =
    creditRegistryEvidence.catalogAvailable
      ? "Authenticated read only"
      : "Operation unavailable";
  el("creditRegistryEvidenceAccess").classList.toggle(
    "warning",
    !creditRegistryEvidence.catalogAvailable
  );
  el("creditRegistryEvidenceState").textContent = response
    ? `Closed v${response.finalVersion} · Registry paused`
    : "Not queried";
  el("creditRegistryEvidenceContract").textContent = response
    ? compactEvmAddress(response.contractAddress)
    : "—";
  el("creditRegistryEvidenceContract").title = response?.contractAddress ?? "";
  el("creditRegistryEvidenceFinality").textContent = response
    ? `${titleize(response.transactions.at(-1).observationStatus)} · ${response.transactions.length} transactions`
    : "Waiting";
  el("creditRegistryEvidenceObservedAt").textContent = response
    ? formatEvidenceTime(response.observedAt, { short: true })
    : "Not queried";
  el("creditRegistryObservationHash").textContent = response
    ? compactDecisionProofHash(response.observationHash)
    : "—";
  el("creditRegistryObservationHash").title = response?.observationHash ?? "";
  el("creditRegistryFinalityProofHash").textContent = response
    ? compactDecisionProofHash(response.finalityProofHash)
    : "—";
  el("creditRegistryFinalityProofHash").title =
    response?.finalityProofHash ?? "";
  el("creditRegistryEvidenceAsOf").textContent = response
    ? `Observed ${formatEvidenceTime(response.observedAt)} · persisted ${formatEvidenceTime(response.recordedAt)} · read ${formatEvidenceTime(response.asOf)}`
    : "No authenticated Registry query yet.";
  el("creditRegistryEvidenceHelper").textContent =
    creditRegistryEvidence.helper;
  el("creditRegistryEvidenceHelper").classList.toggle(
    "error",
    creditRegistryEvidence.error
  );
  el("creditRegistryAuthorizationHash").disabled =
    creditRegistryEvidence.busy;
  el("loadCreditRegistryEvidenceBtn").disabled =
    creditRegistryEvidence.busy ||
    !creditRegistryEvidence.catalogAvailable;
  el("loadCreditRegistryEvidenceBtn").toggleAttribute(
    "aria-busy",
    creditRegistryEvidence.busy
  );
}

function requestedCreditRegistryEvidenceHash() {
  const authorizationHash = tenantInputValue(
    "creditRegistryAuthorizationHash"
  );
  if (!/^0x[0-9a-f]{64}$/.test(authorizationHash)) {
    throw new Error(
      "Enter one lowercase 32-byte authorization hash beginning with 0x."
    );
  }
  return authorizationHash;
}

async function loadCreditRegistryEvidence() {
  if (creditRegistryEvidence.busy) return;
  let authorizationHash;
  try {
    authorizationHash = requestedCreditRegistryEvidenceHash();
  } catch (error) {
    creditRegistryEvidence.error = true;
    creditRegistryEvidence.helper = error.message;
    renderCreditRegistryEvidence();
    announce(error.message);
    return;
  }

  creditRegistryEvidence.busy = true;
  creditRegistryEvidence.error = false;
  creditRegistryEvidence.queried = false;
  creditRegistryEvidence.response = null;
  creditRegistryEvidence.helper =
    "Verifying Tenant access and loading the finalized synthetic Base Sepolia observation…";
  renderCreditRegistryEvidence();
  try {
    const result = await tenantApi("pilotReadCreditRegistryEvidence", {
      resource: {
        resourceType: "credit_registry_evidence",
        resourceId: authorizationHash
      },
      payload: {},
      idempotent: false
    });
    const response = result.response;
    if (
      response?.authorizationHash !== authorizationHash ||
      response?.schemaVersion !==
        "tenant_credit_registry_evidence_view.v1" ||
      compactEvmAddress(response?.contractAddress) === "Unavailable" ||
      response?.readOnly !== true ||
      response?.syntheticOnly !== true ||
      response?.authorizing !== false ||
      response?.fundsAuthority !== false ||
      response?.productionFundsMoved !== false
    ) {
      throw new Error("Registry Evidence response failed the browser safety contract.");
    }
    creditRegistryEvidence.authorizationHash = authorizationHash;
    creditRegistryEvidence.response = response;
    creditRegistryEvidence.queried = true;
    creditRegistryEvidence.helper =
      "Four finalized Registry lifecycle transactions verified. This public synthetic proof grants no credit, account authority, or funds authority.";
    toast("Base Sepolia Registry Evidence loaded");
    announce(creditRegistryEvidence.helper);
  } catch (error) {
    const nonEnumerating =
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      new Set([
        "authorization_denied",
        "tenant_resource_unavailable",
        "resource_not_found"
      ]).has(error.code);
    creditRegistryEvidence.error = true;
    creditRegistryEvidence.helper = nonEnumerating
      ? "Registry Evidence is unavailable or is not authorized for this Tenant."
      : `Registry Evidence query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(creditRegistryEvidence.helper, "error");
    announce(creditRegistryEvidence.helper);
  } finally {
    creditRegistryEvidence.busy = false;
    renderCreditRegistryEvidence();
  }
}

function exactResourceId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(value)
  );
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

function servicingQueueRow(item, index) {
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
  const review = document.createElement("span");
  const reviewLabel = document.createElement("strong");
  const reviewButton = document.createElement("button");
  review.setAttribute("role", "cell");
  review.dataset.label = "Review";
  review.className = "servicing-review-cell";
  reviewLabel.textContent = titleize(item.reviewCode);
  reviewButton.type = "button";
  reviewButton.className = "text-action servicing-case-select";
  reviewButton.dataset.riskSelectSubject = item.subjectId;
  reviewButton.dataset.riskSelectObligation = item.obligationId;
  reviewButton.textContent = "Select for protective review";
  reviewButton.setAttribute(
    "aria-label",
    `Select ${titleize(item.servicingClassification)} case for protective review`
  );
  review.append(reviewLabel, reviewButton);
  row.append(
    cell(
      "Case",
      `Case ${index + 1}`,
      `${titleize(item.reviewCode)} · Authorized server result`,
      "servicing-case-id"
    ),
    cell("Stage", stage, `${item.daysPastDue} days past due · oldest ${privateDate(item.oldestDueAt, { month: "short", day: "numeric", year: "numeric" })}`, "servicing-stage-cell"),
    cell("Past due", usdMinorToMoney(item.pastDueTotalMinor), `Principal ${usdMinorToMoney(item.pastDuePrincipalMinor)}`),
    cell("Outstanding", usdMinorToMoney(item.outstandingTotalMinor), `${item.assetId}`),
    review
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
    ? `Verified ${privateDate(portfolio.asOf, { dateStyle: "medium", timeStyle: "short" })}`
    : "No verified query yet.";
  el("riskPortfolioReference").textContent =
    riskOperations.portfolioSelection.status === "selected"
      ? riskOperations.portfolioSelection.resourceId
      : titleize(riskOperations.portfolioSelection.status);
  el("servicingQueueReference").textContent =
    riskOperations.queueSelection.status === "selected"
      ? riskOperations.queueSelection.resourceId
      : titleize(riskOperations.queueSelection.status);
  const refreshButton = el("refreshRiskWorkspaceBtn");
  const riskReadBusy = riskOperations.catalogBusy ||
    riskOperations.recoveryBusy ||
    riskOperations.busy ||
    riskOperations.healthBusy ||
    riskOperations.feedbackBusy ||
    riskOperations.queueBusy;
  refreshButton.disabled = riskReadBusy;
  refreshButton.toggleAttribute("aria-busy", riskReadBusy);
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
    : [emptyRow(portfolio ? "No asset exposure was returned for this portfolio." : "Awaiting an authorized server-derived portfolio.")]));
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
  const insightButton = el("loadRiskInsightsBtn");
  insightButton.hidden = !portfolio || !(
    riskOperations.healthCatalogAvailable || riskOperations.feedbackCatalogAvailable
  );
  insightButton.disabled = riskOperations.healthBusy || riskOperations.feedbackBusy;
  insightButton.toggleAttribute(
    "aria-busy",
    riskOperations.healthBusy || riskOperations.feedbackBusy
  );

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
        : "Awaiting an authorized server-derived servicing queue.")]));
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

  const freezeSelection = riskOperations.freezeSubjectSelection;
  const selectedCaseStillVisible = freezeSelection && riskOperations.queueCases.some(
    (item) => item.subjectId === freezeSelection.subjectId &&
      item.obligationId === freezeSelection.obligationId
  );
  if (freezeSelection && !selectedCaseStillVisible) {
    riskOperations.freezeSubjectSelection = null;
    el("riskFreezeSubjectId").value = "";
  }

  el("servicingQueueFilterForm").hidden =
    riskOperations.queueSelection.status !== "selected";
  el("servicingQueueClassification").disabled = riskOperations.queueBusy;
  const queueLoadButton = el("applyServicingQueueFilterBtn");
  queueLoadButton.disabled = riskOperations.queueBusy;
  queueLoadButton.toggleAttribute("aria-busy", riskOperations.queueBusy);
  const queueMoreButton = el("loadMoreServicingQueueBtn");
  queueMoreButton.hidden = !riskOperations.queueHasMore;
  queueMoreButton.disabled = riskOperations.queueBusy || !riskOperations.queueNextCursor;
  queueMoreButton.toggleAttribute("aria-busy", riskOperations.queueBusy);

  const subjectId = tenantInputValue("riskFreezeSubjectId");
  const reasonCode = el("riskFreezeReason").value;
  const acknowledged = el("riskFreezeAcknowledge").checked;
  const freezeButton = el("freezeRiskSubjectBtn");
  const selectedFreezeCase = riskOperations.freezeSubjectSelection;
  el("riskFreezeForm").hidden = !selectedFreezeCase;
  el("riskFreezeSubjectLabel").textContent = selectedFreezeCase
    ? `${titleize(selectedFreezeCase.classification)} · ${selectedFreezeCase.daysPastDue} days past due`
    : "No case selected";
  el("riskFreezeSelectionState").textContent = selectedFreezeCase
    ? "Case selected for review. Choose a reason and confirm before the protective command is sent."
    : "Select an authorized queue case for protective review. Selecting a case does not freeze it.";
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
    ? `Protective suspension · ${titleize(riskOperations.freezeResult.previousStatus)} → Suspended · ${titleize(riskOperations.freezeResult.reasonCode)}`
    : "";
}

async function loadPilotHealth({ quiet = false } = {}) {
  if (riskOperations.healthBusy || !riskOperations.healthCatalogAvailable) return;
  const portfolioId = riskOperations.portfolioSelection.resourceId;
  if (!exactResourceId(portfolioId)) return;
  const requestOwner = beginRiskRequest("health");
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
    if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
    riskOperations.health = result.response;
    riskOperations.healthQueried = true;
    riskOperations.healthHelper = "Verified from Tenant-scoped PostgreSQL facts. No identifiers, PII, or third-party analytics were returned.";
    if (!quiet) {
      toast("Pilot lifecycle health loaded");
      announce(riskOperations.healthHelper);
    }
  } catch (error) {
    if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
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
    if (finishRiskRequest(requestOwner)) {
      riskOperations.healthBusy = false;
      renderRiskOperations();
    }
  }
}

async function loadPilotFeedbackSummary({ quiet = false } = {}) {
  if (riskOperations.feedbackBusy || !riskOperations.feedbackCatalogAvailable) return;
  const portfolioId = riskOperations.portfolioSelection.resourceId;
  if (!exactResourceId(portfolioId)) return;
  const requestOwner = beginRiskRequest("feedback");
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
    if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
    riskOperations.feedback = result.response;
    riskOperations.feedbackQueried = true;
    riskOperations.feedbackHelper = "Verified aggregate only. Identifiers, free text, PII, and third-party analytics are excluded.";
    if (!quiet) {
      toast("Design-partner feedback loaded");
      announce(riskOperations.feedbackHelper);
    }
  } catch (error) {
    if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
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
    if (finishRiskRequest(requestOwner)) {
      riskOperations.feedbackBusy = false;
      renderRiskOperations();
    }
  }
}

async function loadRiskPortfolio({
  quiet = false,
  includeSupportingReads = true
} = {}) {
  if (riskOperations.busy) return;
  const portfolioId = riskOperations.portfolioSelection.resourceId;
  if (!exactResourceId(portfolioId)) {
    riskOperations.error = true;
    riskOperations.helper = "No unique authorized Tenant portfolio is recoverable.";
    renderRiskOperations();
    announce(riskOperations.helper);
    return;
  }
  const requestOwner = beginRiskRequest("portfolio");
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
    if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
    riskOperations.portfolio = result.response;
    riskOperations.queried = true;
    riskOperations.helper = "Authorized point-in-time exposure loaded. No raw KYC or PII was returned.";
    // Keep authenticated Tenant reads sequential. The Gateway records and
    // revalidates each authorization decision transactionally; parallel reads
    // for the same exact portfolio can correctly conflict on that live audit
    // state even though every individual query is read-only.
    if (includeSupportingReads) {
      await loadPilotHealth({ quiet: true });
      if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
      await loadPilotFeedbackSummary({ quiet: true });
      if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
    }
    if (!quiet) {
      toast("Tenant risk posture loaded");
      announce(riskOperations.helper);
    }
  } catch (error) {
    if (!riskRequestIsCurrent(requestOwner, "risk_portfolio", portfolioId)) return;
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    if (nonEnumerating) {
      riskOperations.portfolioSelection = Object.freeze({
        status: "denied",
        resourceId: null
      });
    }
    riskOperations.portfolio = null;
    riskOperations.queried = false;
    riskOperations.health = null;
    riskOperations.healthQueried = false;
    riskOperations.healthError = false;
    riskOperations.healthHelper = "Load supporting insights after the Tenant portfolio is restored.";
    riskOperations.feedback = null;
    riskOperations.feedbackQueried = false;
    riskOperations.feedbackError = false;
    riskOperations.feedbackHelper = "Load supporting insights after the Tenant portfolio is restored.";
    riskOperations.error = true;
    riskOperations.helper = nonEnumerating
      ? "Risk or Auditor access is required, or the portfolio is unavailable."
      : `Risk posture query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    toast(riskOperations.helper, "error");
    announce(riskOperations.helper);
  } finally {
    if (finishRiskRequest(requestOwner)) {
      riskOperations.busy = false;
      renderRiskOperations();
    }
  }
}

async function loadServicingQueue({
  append = false,
  quiet = false
} = {}) {
  if (riskOperations.queueBusy) return;
  const queueId = riskOperations.queueSelection.resourceId;
  const classification = el("servicingQueueClassification").value;
  if (!exactResourceId(queueId)) {
    riskOperations.queueError = true;
    riskOperations.queueHelper = "No unique authorized servicing queue is recoverable.";
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

  const requestOwner = beginRiskRequest("queue");
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
    if (!riskRequestIsCurrent(requestOwner, "servicing_queue", queueId)) return;
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
    if (!quiet) {
      toast(append ? "Next servicing page loaded" : "Servicing queue loaded");
      announce(riskOperations.queueHelper);
    }
  } catch (error) {
    if (!riskRequestIsCurrent(requestOwner, "servicing_queue", queueId)) return;
    const nonEnumerating = error.status === 401 || error.status === 403 || error.status === 404 ||
      new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error.code);
    if (nonEnumerating) {
      riskOperations.queueSelection = Object.freeze({
        status: "denied",
        resourceId: null
      });
    }
    if (!append || nonEnumerating) {
      riskOperations.queueQueried = false;
      riskOperations.queueId = null;
      riskOperations.queueCases = [];
      riskOperations.queueNextCursor = null;
      riskOperations.queueHasMore = false;
      riskOperations.queueAsOf = null;
    }
    riskOperations.queueError = true;
    riskOperations.queueHelper = nonEnumerating
      ? "Risk or Operations access is required, or the queue is unavailable."
      : `Servicing queue query failed. Request ID: ${error.requestId ?? "unavailable"}`;
    if (!quiet) {
      toast(riskOperations.queueHelper, "error");
      announce(riskOperations.queueHelper);
    }
  } finally {
    if (finishRiskRequest(requestOwner)) {
      riskOperations.queueBusy = false;
      renderRiskOperations();
    }
  }
}

function clearRiskPortfolioRecoveryState({ status = "loading" } = {}) {
  riskOperations.portfolioSelection = Object.freeze({ status, resourceId: null });
  riskOperations.queried = false;
  riskOperations.portfolio = null;
  riskOperations.error = false;
  riskOperations.health = null;
  riskOperations.healthQueried = false;
  riskOperations.healthError = false;
  riskOperations.healthHelper = "Load supporting insights after the Tenant portfolio is restored.";
  riskOperations.feedback = null;
  riskOperations.feedbackQueried = false;
  riskOperations.feedbackError = false;
  riskOperations.feedbackHelper = "Load supporting insights after the Tenant portfolio is restored.";
}

function clearServicingQueueRecoveryState({ status = "loading" } = {}) {
  riskOperations.queueSelection = Object.freeze({ status, resourceId: null });
  riskOperations.queueQueried = false;
  riskOperations.queueId = null;
  riskOperations.queueClassification = "all";
  riskOperations.queueCases = [];
  riskOperations.queueNextCursor = null;
  riskOperations.queueHasMore = false;
  riskOperations.queueAsOf = null;
  riskOperations.queueError = false;
  riskOperations.freezeSubjectSelection = null;
  el("riskFreezeSubjectId").value = "";
  el("servicingQueueClassification").value = "all";
}

function riskReferenceFailureStatus(error) {
  if (error?.code === "workspace_recovery_unavailable") return "ambiguous";
  if (
    error?.status === 401 ||
    error?.status === 403 ||
    error?.status === 404 ||
    new Set(["authorization_denied", "tenant_resource_unavailable", "resource_not_found"]).has(error?.code)
  ) return "denied";
  return "unavailable";
}

function riskReferenceHelper(kind, status) {
  const label = kind === "portfolio" ? "Tenant portfolio" : "servicing queue";
  if (status === "empty") return `No active ${label} is assigned to this Tenant.`;
  if (status === "ambiguous") return `The ${label} assignment is incomplete or ambiguous. No resource was selected.`;
  if (status === "denied") return `The ${label} is unavailable or this session is not authorized.`;
  return `The ${label} could not be recovered. Check the private gateway and try again.`;
}

function riskRequestIsCurrent(owner, resourceType, resourceId) {
  const selection = resourceType === "risk_portfolio"
    ? riskOperations.portfolioSelection
    : riskOperations.queueSelection;
  return (
    isCurrentRiskRequest(owner) &&
    selection.status === "selected" &&
    selection.resourceId === resourceId
  );
}

async function recoverRiskWorkspace() {
  if (riskOperations.recoveryBusy || currentWorkspaceName() !== "risk") return;
  const requestOwner = beginRiskRequest("recovery");
  riskOperations.recoveryBusy = true;
  ++riskOperations.recoveryEpoch;
  clearRiskPortfolioRecoveryState();
  clearServicingQueueRecoveryState();
  riskOperations.helper = "Restoring the authorized Tenant portfolio from authenticated server truth…";
  riskOperations.queueHelper = "Restoring the authorized servicing queue from authenticated server truth…";
  renderRiskOperations();

  try {
    if (
      riskOperations.portfolioReferenceCatalogAvailable &&
      riskOperations.readCatalogAvailable
    ) {
      try {
        const result = await tenantApi("pilotReadTenantRiskPortfolioReference", {
          payload: {},
          idempotent: false
        });
        if (!isCurrentRiskRequest(requestOwner)) return;
        const selection = selectRiskWorkspaceReference(
          result.response,
          "risk_portfolio"
        );
        riskOperations.portfolioSelection = selection;
        if (selection.status === "selected") {
          riskOperations.helper = "Authorized portfolio reference restored. Reauthorizing the exact portfolio read…";
          await loadRiskPortfolio({
            quiet: true,
            includeSupportingReads: false
          });
          if (!isCurrentRiskRequest(requestOwner)) return;
        } else {
          riskOperations.error = selection.status !== "empty";
          riskOperations.helper = riskReferenceHelper("portfolio", selection.status);
        }
      } catch (error) {
        if (!isCurrentRiskRequest(requestOwner)) return;
        const status = riskReferenceFailureStatus(error);
        clearRiskPortfolioRecoveryState({ status });
        riskOperations.error = true;
        riskOperations.helper = riskReferenceHelper("portfolio", status);
      }
    } else {
      clearRiskPortfolioRecoveryState({ status: "unavailable" });
      riskOperations.error = true;
      riskOperations.helper = "The private catalog does not expose authorized portfolio recovery.";
    }

    if (
      riskOperations.queueReferenceCatalogAvailable &&
      riskOperations.queueCatalogAvailable
    ) {
      try {
        const result = await tenantApi("pilotReadServicingQueueReference", {
          payload: {},
          idempotent: false
        });
        if (!isCurrentRiskRequest(requestOwner)) return;
        const selection = selectRiskWorkspaceReference(
          result.response,
          "servicing_queue"
        );
        riskOperations.queueSelection = selection;
        if (selection.status === "selected") {
          riskOperations.queueHelper = "Authorized queue reference restored. Reauthorizing the exact first page…";
          await loadServicingQueue({ quiet: true });
          if (!isCurrentRiskRequest(requestOwner)) return;
        } else {
          riskOperations.queueError = selection.status !== "empty";
          riskOperations.queueHelper = riskReferenceHelper("queue", selection.status);
        }
      } catch (error) {
        if (!isCurrentRiskRequest(requestOwner)) return;
        const status = riskReferenceFailureStatus(error);
        clearServicingQueueRecoveryState({ status });
        riskOperations.queueError = true;
        riskOperations.queueHelper = riskReferenceHelper("queue", status);
      }
    } else {
      clearServicingQueueRecoveryState({ status: "unavailable" });
      riskOperations.queueError = true;
      riskOperations.queueHelper = "The private catalog does not expose authorized queue recovery.";
    }
  } finally {
    if (finishRiskRequest(requestOwner)) {
      riskOperations.recoveryBusy = false;
      renderRiskOperations();
    }
  }
}

async function refreshRiskWorkspace() {
  if (
    riskOperations.catalogBusy ||
    riskOperations.recoveryBusy ||
    riskOperations.busy ||
    riskOperations.healthBusy ||
    riskOperations.feedbackBusy ||
    riskOperations.queueBusy
  ) return;
  await probeTenantPilot();
}

async function loadRiskSupportingInsights() {
  if (!riskOperations.portfolio) return;
  const requestOwner = beginRiskRequest("insights");
  await loadPilotHealth();
  if (!isCurrentRiskRequest(requestOwner)) return;
  await loadPilotFeedbackSummary();
  finishRiskRequest(requestOwner);
}

async function freezeRiskSubject() {
  if (riskOperations.freezeBusy) return;
  const subjectId = tenantInputValue("riskFreezeSubjectId");
  const reasonCode = el("riskFreezeReason").value;
  const selectedCase = riskOperations.freezeSubjectSelection;
  if (
    !selectedCase || selectedCase.subjectId !== subjectId ||
    !exactResourceId(subjectId) || !PROTECTIVE_REASON_CODES.has(reasonCode) ||
    !el("riskFreezeAcknowledge").checked
  ) {
    riskOperations.freezeError = true;
    riskOperations.freezeHelper = "Select one current authorized queue case, choose an approved protective reason, and confirm the suspension.";
    renderRiskOperations();
    announce(riskOperations.freezeHelper);
    return;
  }
  const stillCurrent = riskOperations.queueCases.some(
    (item) => item.subjectId === selectedCase.subjectId &&
      item.obligationId === selectedCase.obligationId
  );
  if (!stillCurrent) {
    riskOperations.freezeSubjectSelection = null;
    el("riskFreezeSubjectId").value = "";
    riskOperations.freezeError = true;
    riskOperations.freezeHelper = "The selected case is no longer in the current authorized queue. Refresh and select it again.";
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
    riskOperations.freezeSubjectSelection = null;
    el("riskFreezeSubjectId").value = "";
    el("riskFreezeReason").value = "";
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
  const handoff = currentAgentMcpHandoffPacket();
  el("sdkTitle").textContent = handoff?.status === "application_ready"
    ? "Run the Agent application"
    : handoff?.status === "ready"
      ? "Run the Agent lifecycle"
      : "Reference Agent runner";
  el("sdkSnippet").textContent = handoff?.status === "application_ready"
    ? `# From the IPO.ONE repository root
pnpm run local:agent:application -- <downloaded-application-handoff.json>

# Result: agent_credit_offer_workflow_receipt.v1
# Saved locally and persisted as exact server continuation truth.`
    : handoff?.status === "ready"
      ? `# Use the runtime handoff for the same Mandate
pnpm run local:agent:runtime -- <downloaded-runtime-handoff.json>

# The matching Offer receipt is loaded automatically.
# Result: Obligation → execution → repayment → Evidence`
      : `# Automated isolated acceptance for the complete Agent path
pnpm run local:agent:acceptance

# Or create/load a Draft Mandate to expose an application handoff.`;
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
  renderCreditRegistryEvidence();
  renderRiskOperations();
  renderTradingCapital();
  renderCapitalPartner();
  renderRuntime();
  renderTenantPilot();
}

function bindActions() {
  el("accessBtn").addEventListener("click", openAccess);
  el("topbarSignOutBtn").addEventListener("click", signOutAuthenticatedSession);
  el("signedOutPrivacyAction").addEventListener("click", openAccess);
  el("walletPermissionsAccessBtn").addEventListener("click", openAccess);
  el("accessCloseBtn").addEventListener("click", closeAccess);
  el("accessScrim").addEventListener("click", closeAccess);
  el("oidcMethodList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-auth-provider]");
    if (button) beginOidcSignIn(button.dataset.authProvider);
  });
  el("walletSignInBtn").addEventListener("click", () => connectApprovedNetwork({
    authenticate: !accessState.sessionActive
  }));
  el("retryAccessOptionsBtn").addEventListener("click", retryAccessOptions);
  el("copyAccessDiagnosticBtn").addEventListener("click", copyAccessDiagnostic);
  el("rediscoverWalletsBtn").addEventListener("click", rediscoverWalletProviders);
  el("retryWalletAuthorityBtn").addEventListener("click", retryWalletAuthorityInvalidation);
  el("executionConnectBtn").addEventListener("click", connectExecutionAccount);
  el("executionBindBtn").addEventListener("click", bindExecutionAccount);
  el("executionRefreshBindingsBtn").addEventListener("click", () =>
    runExecutionWalletAction(
      "executionRefreshBindingsBtn",
      "Reading current execution AccountBindings from server truth…",
      () => refreshExecutionAccountBindings({ quiet: true }),
      "Current execution AccountBindings refreshed. No authority was inferred from a binding."
    )
  );
  el("executionDisconnectBtn").addEventListener("click", disconnectExecutionAccount);
  el("executionRevokeBindingBtn").addEventListener("click", revokeExecutionAccountBindingAction);
  el("executionDiscoverBtn").addEventListener("click", discoverExecutionCapabilities);
  el("executionPrepareGrantBtn").addEventListener("click", prepareExecutionGrant);
  el("executionActivateGrantBtn").addEventListener("click", activateExecutionGrant);
  el("executionPrepareBtn").addEventListener("click", prepareExactExecution);
  el("executionReadBtn").addEventListener("click", readExactExecution);
  el("executionRevokeGrantBtn").addEventListener("click", revokeExecutionGrantAction);
  for (const input of [
    el("executionProviderId"),
    el("executionTransferIntentId"),
    el("humanSubjectId")
  ]) {
    input.addEventListener("input", renderExecutionWallet);
  }
  el("continueAuthenticatedSessionBtn").addEventListener("click", continueAuthenticatedSession);
  el("signOutBtn").addEventListener("click", signOutAuthenticatedSession);
  el("openPrincipalWorkspaceLink").addEventListener("click", continueToPrincipalWorkspace);
  el("switchPrincipalSessionBtn").addEventListener("click", switchCurrentWorkspaceSession);
  el("economicActionScrim").addEventListener("click", cancelPendingEconomicAction);
  el("economicActionCloseBtn").addEventListener("click", cancelPendingEconomicAction);
  el("economicActionCancelBtn").addEventListener("click", cancelPendingEconomicAction);
  el("economicActionConfirmBtn").addEventListener("click", confirmPendingEconomicAction);
  el("walletProviderList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-wallet-provider-id]");
    if (button) selectWalletProvider(button.dataset.walletProviderId);
  });
  for (const button of document.querySelectorAll("[data-wallet-chain]")) {
    button.addEventListener("click", () => {
      if (accessState.busy || accessState.optionsBusy) return;
      accessState.selectedChainId = Number(button.dataset.walletChain);
      renderAccess();
    });
  }
  document.addEventListener("keydown", handleAccessKeys);
  document.addEventListener("keydown", handleEconomicActionKeys);
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
    button.addEventListener("click", () => {
      showView(button.dataset.goView);
      if (
        button.dataset.goView === "activity-proofs" &&
        tenantPilot.obligation
      ) loadOwnedEvidence();
    });
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
  for (const button of document.querySelectorAll("[data-borrow-entry]")) {
    button.addEventListener("click", () => openBorrowingEntry(button.dataset.borrowEntry));
  }
  el("agentOnlineRunBtn").addEventListener("click", runOnlineReferenceAgent);
  el("agentOnlineExecuteBtn").addEventListener(
    "click",
    executeOnlineAgentApprovedUse
  );
  el("agentOnlineRepayBtn").addEventListener(
    "click",
    repayOnlineAgentObligation
  );
  el("agentOnlineEvidenceBtn").addEventListener(
    "click",
    verifyOnlineAgentEvidence
  );
  el("agentOnlineReviewBtn").addEventListener(
    "click",
    reviewOnlineAgentObligation
  );
  el("mobileMenuBtn").addEventListener("click", () => setNavigationOpen(true));
  el("sidebarCloseBtn").addEventListener("click", () => setNavigationOpen(false));
  el("sidebarScrim").addEventListener("click", () => setNavigationOpen(false));
  el("sidebarMoreBtn").addEventListener("click", () => {
    const expanded = !document.body.classList.contains("sidebar-tools-open");
    document.body.classList.toggle("sidebar-tools-open", expanded);
    el("sidebarMoreBtn").setAttribute("aria-expanded", String(expanded));
  });
  el("operatorModeBtn").addEventListener("click", () => {
    setMode("human");
    showView("overview");
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
  el("authenticatedRuntimeGateAction").addEventListener("click", () => {
    if (hasWorkspaceSessionRoleMismatch()) {
      switchCurrentWorkspaceSession();
    } else {
      openAccess();
    }
  });
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
  el("capitalPartnerOfferForm").addEventListener("submit", (event) => {
    event.preventDefault();
    authorCapitalPartnerOffer();
  });
  el("capitalPartnerWithdrawOfferBtn").addEventListener(
    "click",
    withdrawCapitalPartnerOffer
  );
  el("capitalPartnerRefreshWorkspaceBtn").addEventListener(
    "click",
    refreshCapitalPartnerWorkspace
  );
  for (const control of el("capitalPartnerOfferForm").querySelectorAll(
    "input, select"
  )) {
    control.addEventListener("input", renderCapitalPartner);
    control.addEventListener("change", renderCapitalPartner);
  }
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
  el("restoreCreditPassportBtn").addEventListener(
    "click",
    restoreLatestCreditPassport
  );
  el("loadCreditTrackRecordBtn").addEventListener(
    "click",
    loadCreditTrackRecord
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
  el("servicingClosedNextBtn").addEventListener(
    "click",
    continueAfterClosedServicingCase
  );
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
  el("anchorPendingEvidenceBtn").addEventListener(
    "click",
    anchorOrRefreshOwnedEvidence
  );
  el("ownedEvidenceRows").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-evidence-hash]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.evidenceHash);
      toast("Offchain Evidence digest copied");
      announce("Owned offchain Evidence digest copied");
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
      toast("Offchain Evidence digest copied");
      announce("Offchain Evidence digest copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("creditRegistryEvidenceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadCreditRegistryEvidence();
  });
  el("creditRegistryAuthorizationHash").addEventListener("input", () => {
    const nextHash = tenantInputValue("creditRegistryAuthorizationHash");
    if (creditRegistryEvidence.authorizationHash === nextHash) return;
    creditRegistryEvidence.queried = false;
    creditRegistryEvidence.authorizationHash = null;
    creditRegistryEvidence.response = null;
    creditRegistryEvidence.error = false;
    creditRegistryEvidence.helper =
      "Enter one exact public authorization hash. The authenticated Gateway returns only the bounded synthetic Base Sepolia observation.";
    renderCreditRegistryEvidence();
  });
  el("refreshRiskWorkspaceBtn").addEventListener("click", refreshRiskWorkspace);
  el("loadRiskInsightsBtn").addEventListener("click", loadRiskSupportingInsights);
  el("servicingQueueFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadServicingQueue();
  });
  el("servicingQueueRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-risk-select-subject]");
    if (!button || riskOperations.freezeBusy) return;
    const selectedCase = riskOperations.queueCases.find(
      (item) => item.subjectId === button.dataset.riskSelectSubject &&
        item.obligationId === button.dataset.riskSelectObligation
    );
    if (!selectedCase) return;
    riskOperations.freezeSubjectSelection = Object.freeze({
      subjectId: selectedCase.subjectId,
      obligationId: selectedCase.obligationId,
      classification: selectedCase.servicingClassification,
      daysPastDue: selectedCase.daysPastDue
    });
    el("riskFreezeSubjectId").value = selectedCase.subjectId;
    el("riskFreezeReason").value = "";
    el("riskFreezeAcknowledge").checked = false;
    riskOperations.freezeResult = null;
    riskOperations.freezeError = false;
    riskOperations.freezeHelper = "Select an approved protective reason and confirm the suspension.";
    renderRiskOperations();
    el("riskFreezeReason").focus({ preventScroll: true });
    announce("Queue case selected for protective review; no mutation was sent");
  });
  el("loadMoreServicingQueueBtn").addEventListener("click", () => {
    loadServicingQueue({ append: true });
  });
  el("servicingQueueClassification").addEventListener("change", () => {
    riskOperations.queueQueried = false;
    riskOperations.queueCases = [];
    riskOperations.queueNextCursor = null;
    riskOperations.queueHasMore = false;
    riskOperations.queueAsOf = null;
    riskOperations.queueError = false;
    riskOperations.queueHelper = "Apply the selected stage to run a fresh authorized queue read.";
    renderRiskOperations();
  });
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
  el("proveAccountOnlineBtn").addEventListener("click", proveAgentAccountOnline);
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
  el("activateMandateBtn").addEventListener("click", activateExactAgentMandate);
  el("principalMandateAcknowledge").addEventListener("change", renderTenantPilot);
  for (const input of [el("agentAccountChain"), el("agentAccountAddress"), el("agentAccountPurpose")]) {
    input.addEventListener("input", () => {
      agentAuthorityPilot.accountChallenge = null;
      renderTenantPilot();
    });
  }

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
    announce(
      handoff.status === "application_ready"
        ? "Handoff downloaded. From the repository root, run pnpm run local:agent:application -- <downloaded file>."
        : "Handoff downloaded. From the repository root, run pnpm run local:agent:runtime -- <downloaded file>."
    );
  });
  el("agentConsoleCopyManifestBtn").addEventListener("click", async () => {
    const presentation = currentAgentConsolePresentation();
    if (!presentation?.registry.catalogParity || presentation.status === "waiting") {
      return toast("Load an eligible exact handoff with 12/12 catalog parity first.", "error");
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
      return toast("Load an eligible exact handoff with 12/12 catalog parity first.", "error");
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
      toast("Local Agent runner command copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
  el("returnToAgentAuthorityBtn").addEventListener("click", openPrincipalAgentAuthority);
  window.addEventListener("popstate", handleWorkspaceLocationChange);
  window.addEventListener("hashchange", handleWorkspaceLocationChange);
  mobileNavigation.addEventListener("change", () => {
    document.body.classList.remove("nav-open");
    syncNavigationAccessibility();
  });
  document.addEventListener("keydown", handleNavigationKeys);
  syncNavigationAccessibility();
}

async function boot() {
  applyWorkspaceSurfaceAccess();
  bindActions();
  const localAgentAccount = localPilotAgentAccount();
  if (localAgentAccount && !tenantInputValue("agentAccountAddress")) {
    el("agentAccountAddress").value = localAgentAccount;
  }
  renderAccess();
  el("runtimeBaseUrl").textContent = window.location.origin;
  restoreLocation({ focus: false });
  renderTenantPilot();
  renderAuditorEvidence();
  renderCreditRegistryEvidence();
  renderRiskOperations();
  await probeAccessOptions();
  await probeTenantPilot();
  setConnection(tenantPilot.connected);
  const postLoginView = tenantPilot.connected && !hasWorkspaceSessionRoleMismatch()
    ? consumePostLoginViewIntent()
    : null;
  if (accessState.sessionActive && !tenantPilot.connected) {
    forgetPostLoginViewIntent();
  }
  if (postLoginView) {
    showView(postLoginView, { focus: false, historyMode: "replace" });
  }
  render();
  announce(tenantPilot.connected
    ? "Authenticated closed-pilot workspace ready"
    : "Sign in to access the closed-pilot workspace");
}

boot().catch((error) => {
  const requestSuffix = error?.requestId ? ` Request ID: ${error.requestId}` : "";
  el("connectionStatus").textContent = "Workspace startup blocked";
  el("sidebarApiStatus").textContent = "Startup blocked";
  tenantPilot.connectionLabel = "Workspace startup blocked";
  tenantPilot.helper =
    `${error?.message ?? "The authenticated workspace could not start."}${requestSuffix}`;
  el("operationStatus").textContent = tenantPilot.helper;
  toast(tenantPilot.helper, "error");
});
