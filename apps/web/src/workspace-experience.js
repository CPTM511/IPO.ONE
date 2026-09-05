// Presentation over the existing access manifest. This module grants no role,
// holds no business state and never calls an economic or authentication API.
const labels = {
  borrower: {
    "request-credit": ["Next", "Your next step"],
    obligations: ["My credit", "Your credit plans"],
    "activity-proofs": ["Activity", "Activity & evidence"],
    "wallet-permissions": ["Settings", "Account & permissions"]
  },
  controller: {
    "agent-console": ["Tasks", "Agent tasks"],
    "request-credit": ["Agents", "Agent setup & authority"],
    "activity-proofs": ["Activity", "Activity & evidence"],
    "wallet-permissions": ["Settings", "Account & permissions"]
  },
  capitalPartner: { "capital-partners": ["Inbox & portfolio", "Capital workspace"] },
  risk: { "risk-operations": ["Queue & controls", "Risk workspace"] }
};

export function workspaceLabels(workspaceName, view) {
  return labels[workspaceName]?.[view] ?? null;
}

function initializeChrome() {
  if (document.body.classList.contains("product-experience")) return;
  document.body.classList.add("product-experience");
  arrangeSecondarySurfaces();
  const actions = document.querySelector(".topbar-actions");
  const modes = actions?.querySelector(".mode-switch");
  if (modes) {
    const details = document.createElement("details");
    details.className = "workspace-options";
    const summary = document.createElement("summary");
    summary.textContent = "Display";
    summary.setAttribute("aria-label", "Workspace display options");
    details.append(summary, modes);
    actions.prepend(details);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && details.open) {
        details.open = false;
        summary.focus();
      }
    });
    document.addEventListener("click", event => {
      if (!details.contains(event.target)) details.open = false;
    });
  }
}

function disclose(element, title, className = "") {
  if (!element) return;
  const details = document.createElement("details");
  details.className = `workspace-details ${className}`;
  const summary = document.createElement("summary");
  summary.textContent = title;
  element.before(details);
  details.append(summary, element);
  return details;
}

function arrangeSecondarySurfaces() {
  disclose(document.querySelector('[aria-labelledby="pilotFeedbackTitle"]'), "Share product feedback");
  disclose(document.querySelector('[aria-labelledby="pilotCaseTitle"]'), "Get help with a record · Cases & corrections");
  // Keep the operational queue and its primary refresh ahead of secondary
  // infrastructure monitoring. Moving existing nodes retains authorization.
  const riskQuery = document.querySelector(".risk-query-card");
  const pool = document.querySelector('[aria-labelledby="riskSecuredPoolTitle"]');
  if (riskQuery && pool) pool.before(riskQuery);
}

export function arrangeWorkspaceNavigation(workspaceName, access) {
  initializeChrome();
  document.body.dataset.workspace = workspaceName ?? "";
  const nav = document.querySelector(".nav-list");
  if (!nav) return;
  let primary = document.getElementById("workspacePrimaryNav");
  if (!primary) {
    primary = document.createElement("div");
    primary.id = "workspacePrimaryNav";
    primary.className = "nav-section workspace-primary-nav";
    primary.setAttribute("aria-label", "Your workspace");
    primary.dataset.workspacePlacement = "primary";
    nav.prepend(primary);
  }
  let more = document.getElementById("workspaceAdvancedNav");
  if (!more) {
    more = document.createElement("div");
    more.id = "workspaceAdvancedNav";
    more.className = "nav-section workspace-advanced-nav";
    more.setAttribute("aria-label", "More workspace tools");
    more.dataset.workspacePlacement = "advanced";
    nav.append(more);
    document.getElementById("sidebarMoreBtn").setAttribute("aria-controls", more.id);
  }
  for (const [view, entry] of access.entries) {
    const button = nav.querySelector(`[data-view="${view}"]`);
    if (!button || !entry.allowed) continue;
    const label = workspaceLabels(workspaceName, view)?.[0];
    if (label) button.querySelector("span strong").textContent = label;
    (entry.placement === "primary" ? primary : more).append(button);
  }
  for (const section of nav.querySelectorAll(".nav-section")) {
    section.hidden = !section.querySelector(".nav-item:not([hidden])");
  }
}

export function updateWorkspaceChrome(workspaceName, view) {
  const label = workspaceLabels(workspaceName, view);
  if (!label) return;
  document.getElementById("viewTitle").textContent = label[1];
  document.getElementById("viewEyebrow").textContent = {
    borrower: "Human workspace", controller: "Principal workspace",
    capitalPartner: "Capital Partner", risk: "Risk & operations"
  }[workspaceName];
}

function mountHumanTask() {
  if (document.getElementById("workspaceCreditSummary")) return;
  const entry = document.querySelector(".request-credit-human > .human-entry");
  const guide = document.getElementById("humanGuide");
  if (!entry || !guide) return;
  const layout = document.createElement("div");
  layout.className = "workspace-task-layout";
  guide.before(layout);
  layout.append(guide);
  const summary = document.createElement("section");
  summary.id = "workspaceCreditSummary";
  summary.className = "workspace-credit-summary";
  summary.setAttribute("aria-labelledby", "workspaceCreditSummaryTitle");
  summary.innerHTML = `<div class="workspace-summary-heading"><p class="eyebrow">YOUR CREDIT</p><h3 id="workspaceCreditSummaryTitle">Current plan</h3><p data-summary="status"></p></div>
    <dl><div><dt>Outstanding principal</dt><dd data-summary="outstanding">—</dd></div><div><dt>Next payment</dt><dd data-summary="payment">—</dd><span data-summary="due"></span></div><div><dt>Total repaid</dt><dd data-summary="repaid">—</dd></div></dl>
    <p class="workspace-summary-note">No real funds · Selected credit plan</p>`;
  layout.append(summary);
  // The earlier Hero duplicated the exact guide action. Keep its DOM bindings
  // for compatibility, while the real, visible action remains in the guide.
  entry.hidden = true;
  guide.querySelector(".eyebrow").textContent = "YOUR NEXT STEP";
  const assurance = guide.querySelector(".human-guide-assurance");
  const details = document.createElement("details");
  details.className = "workspace-details workspace-assurance";
  const heading = document.createElement("summary");
  heading.textContent = "How this sandbox works";
  details.append(heading, assurance);
  const application = document.getElementById("humanApplication");
  application.after(details);
  const identityNotes = document.querySelector(".request-credit-human .human-detail-grid");
  if (identityNotes) details.append(identityNotes);
  const setup = entry.querySelector('[data-scroll-target="agentAuthority"]');
  if (setup) {
    setup.classList.remove("primary");
    setup.classList.add("secondary");
    assurance.append(setup);
  }
}

export function renderHumanTaskSummary(model) {
  mountHumanTask();
  const summary = document.getElementById("workspaceCreditSummary");
  if (!summary) return;
  for (const key of ["outstanding", "payment", "repaid", "due", "status"]) {
    summary.querySelector(`[data-summary="${key}"]`).textContent = model.connected
      ? key === "status" && !model.hasObligation ? "No active credit plan" : model[key]
      : key === "status" ? "Waiting for your workspace" : "—";
  }
  summary.dataset.hasPlan = String(model.connected && model.hasObligation);
}

export function renderAgentTaskHeading(title) {
  const heading = document.getElementById("agentViewTitle");
  if (!heading) return;
  const stage = document.querySelector(".agent-workspace-entry")?.dataset.taskStage;
  heading.textContent = {
    principal_activation: "Review the Offer. Approve its authority.",
    runtime_execute: "Follow the approved use of credit",
    runtime_repay: "Track revenue and repayment",
    runtime_evidence: "Verify the repayment record",
    runtime_complete: "Your Agent's credit cycle is verified",
    active_recovery: "Recover your Agent's latest progress"
  }[stage] ?? title;
}

export function renderAgentTaskControls(stage) {
  const entry = document.querySelector(".agent-workspace-entry");
  if (!entry) return;
  entry.dataset.taskStage = stage;
  const copy = entry.querySelector(".human-entry-copy");
  const actions = document.querySelector(".agent-online-stage-actions");
  if (!copy.contains(actions)) {
    copy.querySelector(".heading-actions").before(actions);
    const workflow = document.getElementById("agentOnlineWorkflow");
    const developer = document.querySelector(".agent-console-developer-details");
    workflow.after(developer);
  }
  const setup = document.getElementById("createAgentBtn");
  const needsSetup = stage === "authority" || stage === "identity";
  setup.classList.toggle("primary", needsSetup);
  setup.classList.toggle("secondary", !needsSetup);
  document.getElementById("createAgentBtnLabel").textContent = needsSetup
    ? stage === "identity" ? "Complete account proof" : "Authorize Agent"
    : "Manage Agent authority";
  const primaryId = {
    runtime_execute: "agentOnlineExecuteBtn", runtime_repay: "agentOnlineRepayBtn",
    runtime_evidence: "agentOnlineEvidenceBtn", runtime_complete: "agentOnlineReviewBtn"
  }[stage] ?? "agentOnlineRunBtn";
  for (const button of actions.querySelectorAll("button")) {
    const primary = !needsSetup && button.id === primaryId;
    button.classList.toggle("primary", primary);
    button.classList.toggle("secondary", !primary);
  }
}
