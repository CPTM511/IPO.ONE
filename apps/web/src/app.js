const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

let state = {};

const el = (id) => document.getElementById(id);

function minorToMoney(value) {
  return money.format(Number(BigInt(value ?? "0")) / 100);
}

function bpsToPercent(value) {
  if (value === null || value === undefined) return "No new credit";
  return `${percent.format(Number(value) / 100)}%`;
}

function titleize(value) {
  return String(value ?? "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function latest(list) {
  return (list ?? []).at(-1);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? "Request failed");
  }
  return payload;
}

function toast(message) {
  const node = el("toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 2200);
}

async function mutate(path, body, message) {
  try {
    state = await api(path, { method: "POST", body });
    render();
    toast(message);
  } catch (error) {
    toast(error.message);
  }
}

function agentId() {
  return state.agent?.subjectId;
}

function selectedProviderId() {
  return el("providerSelect").value || state.providers?.[0]?.providerId;
}

function renderStatusBand() {
  el("agentStatus").textContent = state.agent ? titleize(state.agent.status) : "Not created";
  el("lockboxStatus").textContent = state.lockbox ? titleize(state.lockbox.status) : "Not created";
  el("scoreStatus").textContent = state.creditProfile?.currentScore ?? 500;
  el("riskTierStatus").textContent = titleize(state.creditProfile?.riskTier ?? "watch");
  el("outstandingStatus").textContent = minorToMoney(state.adminExposure?.outstandingMinor ?? "0");
}

function renderAgent() {
  el("agentId").textContent = state.agent?.subjectId ?? "-";
  el("principalId").textContent = state.principal?.principalId ?? "-";
  el("agentLifecycleStatus").textContent = state.agent ? titleize(state.agent.status) : "-";
  el("principalBinding").textContent = state.agent ? `${state.agent.displayName} -> ${state.principal?.principalType}` : "-";
  el("walletBindingText").textContent = state.walletBinding
    ? `${titleize(state.walletBinding.status)} on ${state.walletBinding.chainId}`
    : "Wallet binding will be hash-backed in the event log.";
}

function renderLockbox() {
  el("lockboxBalance").textContent = minorToMoney(state.lockbox?.balanceMinor ?? "0");
  el("revenueCaptured").textContent = minorToMoney(state.lockbox?.capturedRevenueMinor ?? "0");
}

function renderCreditLine() {
  const obligation = latest(state.obligations);
  const reasons = state.creditLineDecision?.reasons ?? [];
  el("creditLimit").textContent = minorToMoney(state.creditLine?.limitMinor ?? "0");
  el("creditUtilization").textContent = minorToMoney(state.creditLine?.utilizedMinor ?? "0");
  el("demoRate").textContent = bpsToPercent(state.creditProfile?.recommendedDemoInterestRateBps);
  el("obligationStatus").textContent = obligation ? titleize(obligation.status) : "None";
  el("creditDecisionReasons").textContent = reasons.length
    ? reasons.map((reason) => `${reason.code}: ${reason.message}`).join(" ")
    : "Risk decision reasons will appear after approval.";
}

function renderProviders() {
  const select = el("providerSelect");
  const previous = select.value;
  select.innerHTML = "";
  for (const provider of state.providers ?? []) {
    const option = document.createElement("option");
    option.value = provider.providerId;
    option.textContent = provider.name;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function renderSpend() {
  const request = latest(state.spendRequests);
  el("spendResult").textContent = request ? titleize(request.status) : "No request yet";
  el("spendReason").textContent = request?.rejectionReason
    ? `Rejected: ${request.rejectionReason}`
    : "Rejected spend reason will appear here.";
  el("spendList").innerHTML = (state.spendRequests ?? [])
    .slice(-5)
    .reverse()
    .map(
      (item) => `<div class="compact-item"><strong>${titleize(item.status)} ${minorToMoney(item.amountMinor)}</strong><span>${item.purposeCode} / ${item.rejectionReason ?? "policy checked"}</span></div>`
    )
    .join("");
}

function renderRepayment() {
  const outstanding = (state.obligations ?? []).reduce((sum, obligation) => sum + BigInt(obligation.outstandingPrincipalMinor), 0n);
  const lastObligation = latest(state.obligations);
  el("repaymentOutstanding").textContent = minorToMoney(outstanding.toString());
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
  el("scoreRing").style.background = `conic-gradient(var(--brand) 0deg, var(--brand) ${angle}deg, #e3e7e1 ${angle}deg, #e3e7e1 360deg)`;
  el("scoreValue").textContent = profile.currentScore;
  el("profileTier").textContent = titleize(profile.riskTier);
  el("learningSummary").textContent = `Last update: ${titleize(latest(profile.scoreHistory)?.reasonCode ?? "initial profile")}`;
  el("profileLimit").textContent = minorToMoney(profile.currentCreditLimitMinor);
  el("nextLimit").textContent = minorToMoney(profile.recommendedNextCreditLimitMinor);
  el("nextRate").textContent = bpsToPercent(profile.recommendedDemoInterestRateBps);
  el("repaymentMetric").textContent = bpsToPercent(profile.repaymentPerformanceBps);
  el("utilizationMetric").textContent = bpsToPercent(profile.utilizationBehaviorBps);
  el("revenueMetric").textContent = bpsToPercent(profile.revenueConsistencyBps);
  el("signalList").innerHTML = (profile.recentSignals ?? [])
    .slice(0, 8)
    .map(
      (signal) => `<div class="compact-item"><strong>${titleize(signal.signalType)} (${signal.scoreDelta > 0 ? "+" : ""}${signal.scoreDelta})</strong><span>${signal.previousScore} -> ${signal.newScore} / ${signal.reasonCode}</span></div>`
    )
    .join("");
  el("scoreHistory").innerHTML = (profile.scoreHistory ?? [])
    .slice(-16)
    .map((item) => {
      const height = Math.max(16, ((item.score - 300) / 550) * 108);
      return `<div class="history-bar" style="height:${height}px"><span>${item.score}</span></div>`;
    })
    .join("");
}

function renderAdmin() {
  el("adminCreditLines").textContent = state.adminExposure?.creditLineCount ?? 0;
  el("adminObligations").textContent = state.adminExposure?.obligationCount ?? 0;
  el("adminOutstanding").textContent = minorToMoney(state.adminExposure?.outstandingMinor ?? "0");
  el("adminEvents").textContent = state.auditTimeline?.length ?? 0;
  el("objectInspector").textContent = JSON.stringify(
    {
      agent: state.agent,
      walletBinding: state.walletBinding,
      lockbox: state.lockbox,
      creditLine: state.creditLine,
      obligations: state.obligations,
      spendRequests: state.spendRequests,
      settlements: state.settlements,
      repayments: state.repayments,
      creditProfile: state.creditProfile
    },
    null,
    2
  );
  el("timeline").innerHTML = (state.auditTimeline ?? [])
    .slice()
    .reverse()
    .slice(0, 80)
    .map((event) => {
      const kind = event.kind === "audit" ? "audit" : "credit";
      const title = titleize(event.eventType ?? event.actionType);
      const detail = event.payload?.reasonCode ?? event.reason ?? event.payload?.rejectionReason ?? event.payload?.newStatus ?? event.eventId;
      return `<div class="timeline-item ${kind}"><strong>${title}</strong><span>${new Date(event.occurredAt).toLocaleString()} / ${detail ?? kind}</span></div>`;
    })
    .join("");
}

function render() {
  renderStatusBand();
  renderAgent();
  renderLockbox();
  renderCreditLine();
  renderProviders();
  renderSpend();
  renderRepayment();
  renderLearning();
  renderAdmin();
}

function amountToMinor(inputId) {
  return String(Math.round(Number(el(inputId).value || 0) * 100));
}

function bindActions() {
  el("createAgentBtn").addEventListener("click", () =>
    mutate("/v1/agents", { displayName: "Public Demo Agent" }, "Demo Agent created")
  );
  el("bindWalletBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.");
    mutate(`/v1/agents/${agentId()}/wallet-bindings`, { accountId: el("walletInput").value }, "Mock wallet bound");
  });
  el("createLockboxBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.");
    mutate(`/v1/agents/${agentId()}/lockbox`, {}, "Lockbox created");
  });
  el("requestCreditBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.");
    mutate(`/v1/agents/${agentId()}/credit-line`, {}, "Credit line evaluated");
  });
  el("submitSpendBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.");
    mutate(
      "/v1/spend-requests",
      { agentId: agentId(), providerId: selectedProviderId(), amountMinor: amountToMinor("spendAmount"), purposeCode: "compute" },
      "Spend request submitted"
    );
  });
  el("rejectSpendBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.");
    mutate(
      "/v1/spend-requests",
      { agentId: agentId(), providerId: "provider_not_allowlisted", amountMinor: amountToMinor("spendAmount"), purposeCode: "unapproved_destination" },
      "Rejected spend recorded"
    );
  });
  el("recordSettlementBtn").addEventListener("click", () => mutate("/v1/settlements", {}, "Settlement recorded"));
  el("captureRevenueBtn").addEventListener("click", () => {
    if (!agentId()) return toast("Create the demo Agent first.");
    mutate("/v1/revenue-capture", { agentId: agentId(), amountMinor: amountToMinor("revenueAmount") }, "Revenue captured");
  });
  el("autoRepayBtn").addEventListener("click", () => mutate("/v1/repayments/auto", { agentId: agentId() }, "Auto repayment routed"));
  el("evaluateLearningBtn").addEventListener("click", () => mutate("/v1/credit-learning/evaluate", { agentId: agentId() }, "Credit learning evaluated"));
  el("healthyCycleBtn").addEventListener("click", () => mutate("/v1/demo/cycles/healthy", { agentId: agentId() }, "Healthy cycle applied"));
  el("riskyCycleBtn").addEventListener("click", () => mutate("/v1/demo/cycles/risky", { agentId: agentId() }, "Risky cycle applied"));
  el("recoveryCycleBtn").addEventListener("click", () => mutate("/v1/demo/cycles/recovery", { agentId: agentId() }, "Recovery cycle applied"));
  el("refreshBtn").addEventListener("click", async () => {
    if (agentId()) state = await api(`/v1/agents/${agentId()}/status`);
    render();
    toast("Dashboard refreshed");
  });
  el("resetBtn").addEventListener("click", () => mutate("/v1/demo/reset", {}, "Demo reset"));
}

async function boot() {
  bindActions();
  state = await api("/v1/demo/reset", { method: "POST" });
  render();
}

boot().catch((error) => toast(error.message));
