const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const VIEW_META = {
  overview: { eyebrow: "Operator Console", title: "Control plane" },
  agent: { eyebrow: "Operator Console", title: "Agent Workspace" },
  credit: { eyebrow: "Operator Console", title: "Credit & Learning" },
  transfers: { eyebrow: "Operator Console", title: "Transfers" },
  evidence: { eyebrow: "Operator Console", title: "Evidence" },
  risk: { eyebrow: "Operator Console", title: "Risk Operations" },
  developer: { eyebrow: "Machine Interface", title: "Agent Runtime" }
};

let state = {};
let busy = false;
let currentView = "overview";
let requestLog = [];
let lastRequestId;
const mobileNavigation = window.matchMedia("(max-width: 900px)");
const sandboxSessionId = (() => {
  const created = `web_session_${globalThis.crypto.randomUUID()}`;
  try {
    const existing = sessionStorage.getItem("ipo-one-sandbox-session");
    if (existing && /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(existing)) return existing;
    sessionStorage.setItem("ipo-one-sandbox-session", created);
  } catch {
    // A per-load partition still fails safely when browser storage is unavailable.
  }
  return created;
})();

const el = (id) => document.getElementById(id);

function asBigInt(value) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function minorToMoney(value) {
  return money.format(Number(asBigInt(value)) / 10 ** (state.assetScale ?? 2));
}

function bpsToPercent(value) {
  if (value === null || value === undefined) return "No new credit";
  return `${percent.format(Number(value) / 100)}%`;
}

function bpsToWidth(value) {
  return `${Math.max(0, Math.min(100, Number(value ?? 0) / 100))}%`;
}

function titleize(value) {
  return String(value ?? "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function latest(values) {
  return (values ?? []).at(-1);
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
  el("connectionStatus").textContent = online ? "API online" : "API unavailable";
  el("sidebarApiStatus").textContent = online ? "Online" : "Unavailable";
}

function recordRequest({ method, path, status, requestId }) {
  requestLog.unshift({ method, path, status, requestId, occurredAt: new Date().toISOString() });
  requestLog = requestLog.slice(0, 30);
  lastRequestId = requestId ?? lastRequestId;
  renderRuntime();
}

async function api(path, options = {}) {
  const method = options.method ?? "GET";
  const requestId = `web_${globalThis.crypto.randomUUID()}`;
  const headers = {
    accept: "application/json, application/problem+json",
    "x-request-id": requestId,
    "x-ipo-one-sandbox-session": sandboxSessionId
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    setConnection(true);
  } catch (cause) {
    setConnection(false);
    const error = new Error("The IPO.ONE API is unavailable.", { cause });
    error.requestId = requestId;
    throw error;
  }

  const responseRequestId = response.headers.get("x-request-id") ?? requestId;
  const text = await response.text();
  let payload;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      const error = new Error("The API returned an invalid response.");
      error.requestId = responseRequestId;
      recordRequest({ method, path, status: response.status, requestId: responseRequestId });
      throw error;
    }
  }

  recordRequest({ method, path, status: response.status, requestId: responseRequestId });
  if (!response.ok) {
    const error = new Error(payload?.detail ?? "The request was rejected.");
    error.code = payload?.code ?? "unknown_api_error";
    error.status = response.status;
    error.requestId = payload?.requestId ?? responseRequestId;
    throw error;
  }
  return payload;
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

async function runOperation(button, operation, successMessage) {
  if (busy) return;
  busy = true;
  button?.setAttribute("aria-busy", "true");
  renderActionStates();
  announce("Operation in progress");
  try {
    await operation();
    render();
    toast(successMessage);
    announce(successMessage);
  } catch (error) {
    const requestSuffix = error.requestId ? ` Request ID: ${error.requestId}` : "";
    toast(`${error.message}${requestSuffix}`, "error");
    announce(`Operation failed. ${error.message}`);
  } finally {
    busy = false;
    button?.removeAttribute("aria-busy");
    renderActionStates();
  }
}

async function mutate(path, body, message, button) {
  await runOperation(
    button,
    async () => {
      state = await api(path, { method: "POST", body });
    },
    message
  );
}

function agentId() {
  return state.agent?.subjectId;
}

function selectedProviderId() {
  return el("providerSelect").value || state.providers?.[0]?.providerId;
}

function selectedProvider() {
  return state.providers?.find((provider) => provider.providerId === selectedProviderId()) ?? state.providers?.[0];
}

function amountToMinor(inputId) {
  return String(Math.round(Number(el(inputId).value || 0) * 10 ** (state.assetScale ?? 2)));
}

function outstandingMinor() {
  return (state.obligations ?? []).reduce(
    (sum, obligation) => sum + asBigInt(obligation.outstandingPrincipalMinor),
    0n
  );
}

function setMode(mode) {
  const agentMode = mode === "agent";
  el("operatorModeBtn").classList.toggle("active", !agentMode);
  el("operatorModeBtn").setAttribute("aria-pressed", String(!agentMode));
  el("agentModeBtn").classList.toggle("active", agentMode);
  el("agentModeBtn").setAttribute("aria-pressed", String(agentMode));
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
  el("viewEyebrow").textContent = VIEW_META[nextView].eyebrow;
  el("viewTitle").textContent = VIEW_META[nextView].title;
  setMode(nextView === "developer" ? "agent" : "operator");
  setNavigationOpen(false, { moveFocus: false });
  if (updateHash) history.replaceState(null, "", `#${nextView}`);
  if (focus) el("mainContent").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderPosition() {
  const available = state.creditLine
    ? asBigInt(state.creditLine.limitMinor) - asBigInt(state.creditLine.utilizedMinor)
    : 0n;
  const obligation = latest(state.obligations);
  const replayProof = latest(state.railReplayProofs);

  el("positionName").textContent = state.agent?.displayName ?? "No active Agent";
  el("positionState").textContent = obligation?.status === "fully_repaid"
    ? "Lifecycle verified"
    : state.creditLine
      ? "Credit active"
      : state.agent
        ? "Setup in progress"
        : "Setup required";
  el("overviewAvailable").textContent = minorToMoney(available.toString());
  el("outstandingStatus").textContent = minorToMoney(outstandingMinor().toString());
  el("overviewLockbox").textContent = minorToMoney(state.lockbox?.balanceMinor ?? "0");
  el("scoreStatus").textContent = state.creditProfile?.currentScore ?? 500;
  el("riskTierStatus").textContent = titleize(state.creditProfile?.riskTier ?? "watch");
  el("agentStatus").textContent = state.agent ? titleize(state.agent.status) : "Not created";
  el("lockboxStatus").textContent = state.lockbox ? titleize(state.lockbox.status) : "Not created";
  el("mandateStatus").textContent = state.mandate ? titleize(state.mandate.status) : "Not created";
  el("overviewLedger").textContent = state.ledger?.integrity?.balanced === false ? "Violation" : "Balanced";
  el("overviewReplay").textContent = replayProof?.replayable ? `Verified v${replayProof.latestVersion}` : "Waiting";
  el("overviewEvidence").textContent = state.evidence?.envelopeCount ?? 0;
  el("postureHealth").textContent = state.ledger?.integrity?.balanced === false ? "Review" : "Healthy";
  el("postureHealth").classList.toggle("health-label", state.ledger?.integrity?.balanced !== false);
}

function renderWorkflow() {
  const settlementComplete = (state.settlementReceipts ?? []).some((receipt) => receipt.finality === "finalized");
  const steps = {
    agent: Boolean(state.agent),
    lockbox: Boolean(state.lockbox),
    credit: Boolean(state.creditLine),
    spend: (state.spendRequests ?? []).some((request) => ["approved", "settled"].includes(request.status)),
    settlement: settlementComplete,
    repayment: (state.repayments ?? []).length > 0 && outstandingMinor() === 0n
  };
  const ordered = ["agent", "lockbox", "credit", "spend", "settlement", "repayment"];
  const completeCount = ordered.filter((key) => steps[key]).length;
  const nextKey = ordered.find((key) => !steps[key]);
  el("workflowProgress").textContent = `${completeCount} of ${ordered.length} complete`;
  for (const item of document.querySelectorAll("[data-workflow]")) {
    const complete = steps[item.dataset.workflow];
    const current = item.dataset.workflow === nextKey;
    item.classList.toggle("complete", complete);
    item.classList.toggle("current", current);
    item.querySelector(".step-state").textContent = complete ? "Complete" : current ? "Next" : "Waiting";
  }
}

function renderAgent() {
  el("agentId").textContent = state.agent?.subjectId ?? "-";
  el("principalId").textContent = state.principal?.principalId ?? "-";
  el("mandateId").textContent = state.mandate?.mandateId ?? "-";
  el("agentLifecycleStatus").textContent = state.agent ? titleize(state.agent.status) : "Not created";
  el("mandateScope").textContent = state.mandate
    ? state.mandate.capabilities.map(titleize).join(", ")
    : "-";
  el("mandateUtilization").textContent = state.mandate
    ? `${minorToMoney(state.mandate.utilizedMinor)} / ${minorToMoney(state.mandate.aggregateLimitMinor)}`
    : "-";
  el("principalBinding").textContent = state.agent
    ? `${state.agent.displayName} -> ${titleize(state.principal?.principalType)}`
    : "-";
  el("walletBindingText").textContent = state.walletBinding
    ? `${titleize(state.walletBinding.status)} on ${state.walletBinding.chainId}`
    : state.agent
      ? "Ready for a sandbox CAIP-10 binding."
      : "Awaiting Agent creation.";
}

function renderLockbox() {
  el("lockboxBalance").textContent = minorToMoney(state.lockbox?.balanceMinor ?? "0");
  el("revenueCaptured").textContent = minorToMoney(state.lockbox?.capturedRevenueMinor ?? "0");
  el("ledgerJournalCount").textContent = state.ledger?.entryCount ?? 0;
  el("ledgerIntegrity").textContent = state.ledger?.integrity?.balanced === false ? "Violation" : "Balanced";
}

function renderCreditLine() {
  const obligation = latest(state.obligations);
  const reasons = state.creditLineDecision?.reasons ?? [];
  el("creditLimit").textContent = minorToMoney(state.creditLine?.limitMinor ?? "0");
  el("creditUtilization").textContent = minorToMoney(state.creditLine?.utilizedMinor ?? "0");
  el("demoRate").textContent = bpsToPercent(state.creditProfile?.recommendedDemoInterestRateBps);
  el("obligationStatus").textContent = obligation ? titleize(obligation.status) : "None";
  el("repaymentOutstanding").textContent = minorToMoney(outstandingMinor().toString());
  el("creditDecisionReasons").textContent = reasons.length
    ? reasons.map((reason) => `${reason.code}: ${reason.message}`).join(" ")
    : "Risk decision reasons will appear after approval.";
}

function renderProviders() {
  const select = el("providerSelect");
  const previous = select.value;
  select.replaceChildren();
  for (const provider of state.providers ?? []) {
    const option = document.createElement("option");
    option.value = provider.providerId;
    option.textContent = `${provider.name} / ${titleize(provider.category)}`;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function renderSpend() {
  const request = latest(state.spendRequests);
  const intent = latest(state.transferIntents);
  const receipt = latest(state.settlementReceipts);
  const rail = state.rails?.find((candidate) => candidate.railId === intent?.railId) ?? state.rails?.[0];
  const replayProof = state.railReplayProofs?.find(
    (candidate) => candidate.transferIntentId === intent?.transferIntentId
  );
  el("spendResult").textContent = request ? titleize(request.status) : "No request";
  el("spendResult").classList.toggle("warning", request?.status === "rejected");
  el("spendReason").textContent = request?.rejectionReason
    ? `Rejected: ${request.rejectionReason}`
    : request
      ? "Provider, purpose, amount, Mandate, and credit capacity checked."
      : "No policy decision recorded.";
  el("railName").textContent = rail?.displayName ?? "Sandbox ready";
  el("transferStatus").textContent = intent ? titleize(intent.status) : "None";
  el("settlementFinality").textContent = receipt ? titleize(receipt.finality) : "None";
  el("railReplayStatus").textContent = replayProof?.replayable ? `Verified v${replayProof.latestVersion}` : "Waiting";
  const items = (state.spendRequests ?? [])
    .slice(-6)
    .reverse()
    .map((item) => compactItem(
      `${titleize(item.status)} ${minorToMoney(item.amountMinor)}`,
      `${item.purposeCode} / ${item.rejectionReason ?? "policy checked"}`
    ));
  el("spendList").replaceChildren(...(items.length ? items : [emptyRow("No provider spend requests.")]));
}

function renderRepayment() {
  const lastObligation = latest(state.obligations);
  el("repaymentCount").textContent = state.repayments?.length ?? 0;
  el("repaymentState").textContent = lastObligation ? titleize(lastObligation.status) : "Waiting";
}

function renderLearning() {
  const profile = state.creditProfile ?? {
    currentScore: 500,
    riskTier: "watch",
    currentCreditLimitMinor: "0",
    recommendedNextCreditLimitMinor: "0",
    recommendedDemoInterestRateBps: 2800,
    repaymentPerformanceBps: 0,
    utilizationBehaviorBps: 0,
    revenueConsistencyBps: 0,
    recentSignals: [],
    scoreHistory: [{ score: 500, riskTier: "watch", reasonCode: "initial_profile" }]
  };
  const angle = Math.max(0, Math.min(360, ((profile.currentScore - 300) / 550) * 360));
  el("scoreRing").style.background = `conic-gradient(var(--brand) 0deg, var(--brand) ${angle}deg, #dde5e3 ${angle}deg, #dde5e3 360deg)`;
  el("scoreValue").textContent = profile.currentScore;
  el("profileTier").textContent = titleize(profile.riskTier);
  el("learningSummary").textContent = `Last update: ${titleize(latest(profile.scoreHistory)?.reasonCode ?? "initial profile")}`;
  el("profileLimit").textContent = minorToMoney(profile.currentCreditLimitMinor);
  el("nextLimit").textContent = minorToMoney(profile.recommendedNextCreditLimitMinor);
  el("nextRate").textContent = bpsToPercent(profile.recommendedDemoInterestRateBps);
  el("repaymentMetric").textContent = bpsToPercent(profile.repaymentPerformanceBps);
  el("utilizationMetric").textContent = bpsToPercent(profile.utilizationBehaviorBps);
  el("revenueMetric").textContent = bpsToPercent(profile.revenueConsistencyBps);
  el("repaymentMeter").style.width = bpsToWidth(profile.repaymentPerformanceBps);
  el("utilizationMeter").style.width = bpsToWidth(profile.utilizationBehaviorBps);
  el("revenueMeter").style.width = bpsToWidth(profile.revenueConsistencyBps);

  const signals = (profile.recentSignals ?? []).slice(0, 8).map((signal) =>
    compactItem(
      `${titleize(signal.signalType)} (${signal.scoreDelta > 0 ? "+" : ""}${signal.scoreDelta})`,
      `${signal.previousScore} -> ${signal.newScore} / ${signal.reasonCode}`
    )
  );
  el("signalList").replaceChildren(...(signals.length ? signals : [emptyRow("No reputation signals yet.")]));
  el("scoreHistory").replaceChildren(
    ...(profile.scoreHistory ?? []).slice(-16).map((item) => {
      const bar = document.createElement("div");
      const label = document.createElement("span");
      bar.className = "history-bar";
      bar.style.height = `${Math.max(16, ((item.score - 300) / 550) * 108)}px`;
      label.textContent = item.score;
      bar.append(label);
      return bar;
    })
  );
}

function timelineItem(event) {
  const kind = event.kind === "audit" ? "audit" : "credit";
  const item = compactItem(
    titleize(event.eventType ?? event.actionType),
    `${new Date(event.occurredAt).toLocaleString()} / ${
      event.payload?.reasonCode ??
      event.reason ??
      event.payload?.rejectionReason ??
      event.payload?.newStatus ??
      event.eventId ??
      kind
    }`
  );
  item.className = `timeline-item ${kind}`;
  return item;
}

function renderOverviewTimeline() {
  const events = (state.auditTimeline ?? []).slice().reverse().slice(0, 6);
  if (events.length === 0) {
    el("overviewTimeline").replaceChildren(emptyRow("Protocol events will appear after the first Agent command."));
    return;
  }
  el("overviewTimeline").replaceChildren(
    ...events.map((event) => {
      const row = document.createElement("div");
      const dot = document.createElement("i");
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      const time = document.createElement("time");
      row.className = "activity-row";
      dot.className = `activity-dot ${event.kind === "audit" ? "audit" : "credit"}`;
      title.textContent = titleize(event.eventType ?? event.actionType);
      detail.textContent = event.payload?.reasonCode ?? event.reason ?? event.payload?.newStatus ?? event.kind;
      time.textContent = new Date(event.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      time.dateTime = event.occurredAt;
      row.append(dot, title, detail, time);
      return row;
    })
  );
}

function renderAdmin() {
  el("adminCreditLines").textContent = state.adminExposure?.creditLineCount ?? 0;
  el("adminObligations").textContent = state.adminExposure?.obligationCount ?? 0;
  el("adminOutstanding").textContent = minorToMoney(state.adminExposure?.outstandingMinor ?? "0");
  el("adminEvents").textContent = state.auditTimeline?.length ?? 0;
  el("adminEvidence").textContent = state.evidence?.envelopeCount ?? 0;
  el("adminPlugins").textContent = (state.pluginManifests ?? []).filter((plugin) => plugin.status === "active").length;

  const plugins = (state.pluginManifests ?? []).map((plugin) =>
    compactItem(
      plugin.displayName,
      `${titleize(plugin.pluginType)} / ${titleize(plugin.status)} / ${plugin.capabilities.length} capabilities`
    )
  );
  el("pluginList").replaceChildren(...(plugins.length ? plugins : [emptyRow("No plugin contracts registered.")]));

  const rails = (state.rails ?? []).map((rail) =>
    compactItem(
      rail.displayName,
      `${titleize(rail.railKind)} / ${titleize(rail.finalityModel)} / ${rail.conformance?.conformant ? "Conformant" : "Review"}`
    )
  );
  el("railList").replaceChildren(...(rails.length ? rails : [emptyRow("No Rail contracts registered.")]));

  const evidence = (state.evidence?.recentEnvelopes ?? [])
    .slice()
    .reverse()
    .map((envelope) =>
      compactItem(
        titleize(envelope.eventType),
        `${titleize(envelope.aggregateType)} v${envelope.aggregateVersion} / ${envelope.sourceFinality}`
      )
    );
  el("evidenceList").replaceChildren(...(evidence.length ? evidence : [emptyRow("No Evidence envelopes yet.")]));

  const timeline = (state.auditTimeline ?? []).slice().reverse().slice(0, 100).map(timelineItem);
  el("timeline").replaceChildren(...(timeline.length ? timeline : [emptyRow("No audit events yet.")]));

  el("objectInspector").textContent = JSON.stringify(
    {
      safety: state.safety,
      agent: state.agent,
      principal: state.principal,
      mandate: state.mandate,
      walletBinding: state.walletBinding,
      lockbox: state.lockbox,
      ledger: state.ledger,
      evidence: state.evidence,
      pluginManifests: state.pluginManifests,
      rails: state.rails,
      transferIntents: state.transferIntents,
      settlementReceipts: state.settlementReceipts,
      creditLine: state.creditLine,
      obligations: state.obligations,
      spendRequests: state.spendRequests,
      repayments: state.repayments,
      creditProfile: state.creditProfile
    },
    null,
    2
  );
}

function renderRuntime() {
  if (!el("requestLog")) return;
  el("runtimeBaseUrl").textContent = window.location.origin;
  el("sdkSnippet").textContent = `import { IpoOneClient } from "@ipo-one/sdk";

const ipo = new IpoOneClient({
  baseUrl: ${JSON.stringify(window.location.origin)}
});

const agent = await ipo.createAgent({
  displayName: "Revenue Agent"
});`;
  el("runtimeSessionId").textContent = sandboxSessionId;
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

function renderActionStates() {
  const hasAgent = Boolean(state.agent);
  const hasLockbox = Boolean(state.lockbox);
  const hasCredit = Boolean(state.creditLine);
  const approvedSpend = (state.spendRequests ?? []).some((request) => request.status === "approved");
  const hasOutstanding = outstandingMinor() > 0n;
  const hasLockboxBalance = asBigInt(state.lockbox?.balanceMinor) > 0n;
  const actionState = {
    createAgentBtn: hasAgent,
    bindWalletBtn: !hasAgent || Boolean(state.walletBinding),
    createLockboxBtn: !hasAgent || hasLockbox,
    requestCreditBtn: !hasAgent || !hasLockbox || hasCredit,
    submitSpendBtn: !hasCredit,
    rejectSpendBtn: !hasCredit,
    recordSettlementBtn: !approvedSpend,
    captureRevenueBtn: !hasLockbox,
    autoRepayBtn: !hasAgent || !hasOutstanding || !hasLockboxBalance,
    evaluateLearningBtn: !hasAgent,
    healthyCycleBtn: !hasAgent,
    riskyCycleBtn: !hasAgent,
    recoveryCycleBtn: !hasAgent,
    refreshBtn: false,
    resetBtn: false,
    runFullFlowBtn: false
  };
  for (const [id, prerequisiteDisabled] of Object.entries(actionState)) {
    const button = el(id);
    if (button) button.disabled = busy || prerequisiteDisabled;
  }
}

function render() {
  renderPosition();
  renderWorkflow();
  renderAgent();
  renderLockbox();
  renderCreditLine();
  renderProviders();
  renderSpend();
  renderRepayment();
  renderLearning();
  renderOverviewTimeline();
  renderAdmin();
  renderRuntime();
  renderActionStates();
}

async function runVerifiedFlow() {
  await runOperation(
    el("runFullFlowBtn"),
    async () => {
      state = await api("/v1/demo/reset", { method: "POST", body: {} });
      state = await api("/v1/agents", { method: "POST", body: { displayName: "IPO.ONE Launch Agent" } });
      const id = state.agent.subjectId;
      state = await api(`/v1/agents/${encodeURIComponent(id)}/wallet-bindings`, {
        method: "POST",
        body: { accountId: el("walletInput").value }
      });
      state = await api(`/v1/agents/${encodeURIComponent(id)}/lockbox`, { method: "POST", body: {} });
      state = await api(`/v1/agents/${encodeURIComponent(id)}/credit-line`, { method: "POST", body: {} });
      const provider = state.providers[0];
      state = await api("/v1/spend-requests", {
        method: "POST",
        body: {
          agentId: id,
          providerId: provider.providerId,
          amountMinor: "50000",
          purposeCode: provider.category
        }
      });
      state = await api("/v1/settlements", { method: "POST", body: {} });
      state = await api("/v1/revenue-capture", {
        method: "POST",
        body: { agentId: id, amountMinor: "65000" }
      });
      state = await api("/v1/repayments/auto", { method: "POST", body: { agentId: id } });
      state = await api("/v1/credit-learning/evaluate", { method: "POST", body: { agentId: id } });
    },
    "Verified sandbox lifecycle completed"
  );
}

function bindActions() {
  for (const button of document.querySelectorAll(".nav-item")) {
    button.addEventListener("click", () => showView(button.dataset.view));
  }
  for (const button of document.querySelectorAll("[data-go-view]")) {
    button.addEventListener("click", () => showView(button.dataset.goView));
  }
  el("mobileMenuBtn").addEventListener("click", () => setNavigationOpen(true));
  el("sidebarCloseBtn").addEventListener("click", () => setNavigationOpen(false));
  el("sidebarScrim").addEventListener("click", () => setNavigationOpen(false));
  el("operatorModeBtn").addEventListener("click", () => showView("overview"));
  el("agentModeBtn").addEventListener("click", () => showView("developer"));
  el("runFullFlowBtn").addEventListener("click", runVerifiedFlow);

  el("createAgentBtn").addEventListener("click", () =>
    mutate("/v1/agents", { displayName: "IPO.ONE Operator Agent" }, "Demo Agent created", el("createAgentBtn"))
  );
  el("walletBindingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!agentId()) return toast("Create the demo Agent first.", "error");
    mutate(
      `/v1/agents/${encodeURIComponent(agentId())}/wallet-bindings`,
      { accountId: el("walletInput").value },
      "Mock wallet bound",
      el("bindWalletBtn")
    );
  });
  el("createLockboxBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.", "error");
    mutate(`/v1/agents/${encodeURIComponent(agentId())}/lockbox`, {}, "Lockbox created", el("createLockboxBtn"));
  });
  el("requestCreditBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.", "error");
    mutate(
      `/v1/agents/${encodeURIComponent(agentId())}/credit-line`,
      {},
      "Credit line evaluated",
      el("requestCreditBtn")
    );
  });
  el("spendForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!agentId()) return toast("Create the demo Agent first.", "error");
    mutate(
      "/v1/spend-requests",
      {
        agentId: agentId(),
        providerId: selectedProviderId(),
        amountMinor: amountToMinor("spendAmount"),
        purposeCode: selectedProvider()?.category ?? "compute"
      },
      "Spend request submitted",
      el("submitSpendBtn")
    );
  });
  el("rejectSpendBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.", "error");
    mutate(
      "/v1/spend-requests",
      {
        agentId: agentId(),
        providerId: "provider_not_allowlisted",
        amountMinor: amountToMinor("spendAmount"),
        purposeCode: "unapproved_destination"
      },
      "Policy rejection recorded",
      el("rejectSpendBtn")
    );
  });
  el("recordSettlementBtn").addEventListener("click", () =>
    mutate("/v1/settlements", {}, "Settlement recorded", el("recordSettlementBtn"))
  );
  el("captureRevenueBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.", "error");
    mutate(
      "/v1/revenue-capture",
      { agentId: agentId(), amountMinor: amountToMinor("revenueAmount") },
      "Revenue captured",
      el("captureRevenueBtn")
    );
  });
  el("autoRepayBtn").addEventListener("click", () =>
    mutate("/v1/repayments/auto", { agentId: agentId() }, "Auto repayment routed", el("autoRepayBtn"))
  );
  el("evaluateLearningBtn").addEventListener("click", () =>
    mutate(
      "/v1/credit-learning/evaluate",
      { agentId: agentId() },
      "Credit profile evaluated",
      el("evaluateLearningBtn")
    )
  );
  el("healthyCycleBtn").addEventListener("click", () =>
    mutate("/v1/demo/cycles/healthy", { agentId: agentId() }, "Healthy cycle applied", el("healthyCycleBtn"))
  );
  el("riskyCycleBtn").addEventListener("click", () =>
    mutate("/v1/demo/cycles/risky", { agentId: agentId() }, "Risky cycle applied", el("riskyCycleBtn"))
  );
  el("recoveryCycleBtn").addEventListener("click", () =>
    mutate("/v1/demo/cycles/recovery", { agentId: agentId() }, "Recovery cycle applied", el("recoveryCycleBtn"))
  );
  el("refreshBtn").addEventListener("click", () =>
    runOperation(
      el("refreshBtn"),
      async () => {
        state = await api("/v1/demo/state");
      },
      "Protocol state refreshed"
    )
  );
  el("resetBtn").addEventListener("click", () =>
    mutate("/v1/demo/reset", {}, "Sandbox reset", el("resetBtn"))
  );
  el("copySdkBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el("sdkSnippet").textContent);
      toast("SDK example copied");
    } catch {
      toast("Clipboard access is unavailable in this browser.", "error");
    }
  });
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
  el("runtimeBaseUrl").textContent = window.location.origin;
  try {
    state = await api("/v1/demo/state");
    render();
    showView(location.hash.slice(1) || "overview", { focus: false, updateHash: false });
    announce("IPO.ONE control plane ready");
  } catch (error) {
    render();
    toast(`${error.message} Request ID: ${error.requestId ?? "unavailable"}`, "error");
  }
}

boot();
