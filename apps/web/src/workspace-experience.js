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
  operations: { "risk-operations": ["Servicing & approvals", "Operations workspace"] },
  auditor: { "risk-operations": ["Portfolio & audit", "Auditor workspace"] },
  riskReviewer: { "risk-operations": ["Independent review", "Risk reviewer workspace"] },
  operationsReviewer: { "risk-operations": ["Independent review", "Operations reviewer workspace"] },
  risk: { "risk-operations": ["Queue & controls", "Risk workspace"] }
};

export function workspaceLabels(workspaceName, view) {
  return labels[workspaceName]?.[view] ?? null;
}

function initializeChrome() {
  if (document.body.classList.contains("product-experience")) return;
  document.body.classList.add("product-experience");
  arrangeSecondarySurfaces();
  const environment = document.getElementById("sidebarEnvironment");
  if (environment) {
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && environment.open) {
        environment.open = false;
        environment.querySelector("summary").focus();
      }
    });
    document.addEventListener("click", event => {
      if (!environment.contains(event.target)) environment.open = false;
    });
  }
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
  disclose(document.querySelector(".agent-console-authority-grid"), "Authority, account proof & limits", "agent-authority-details");
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
  arrangePrincipalSurface(workspaceName);
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
  const apiReference = document.getElementById("sidebarApiReference");
  if (apiReference) more.append(apiReference);
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
  summary.querySelector("dl").hidden = !model.connected || !model.hasObligation;
  summary.querySelector(".workspace-summary-note").textContent = model.connected && model.hasObligation
    ? "No real funds · Selected credit plan"
    : "Your terms and repayment schedule will appear here after you accept an Offer. No real funds.";
}

// Move existing controls, not copies: their guards and server operations remain
// the only way to change authority. The role comes from the existing manifest.
function arrangePrincipalSurface(workspaceName) {
  const human = document.querySelector(".request-credit-human");
  const authority = document.getElementById("agentAuthorityDisclosure");
  if (!human || !authority) return;
  let home = document.getElementById("authorityHomePosition");
  if (!home) {
    home = document.createElement("span");
    home.id = "authorityHomePosition";
    home.hidden = true;
    authority.before(home);
  }
  let principal = document.getElementById("principalAuthoritySurface");
  if (!principal) {
    principal = document.createElement("section");
    principal.id = "principalAuthoritySurface";
    principal.className = "precision-principal";
    principal.setAttribute("aria-label", "Your Agents and authority");
    human.before(principal);
  }
  const selected = workspaceName === "controller";
  principal.hidden = !selected;
  human.hidden = selected;
  let applicationHome = document.getElementById("agentApplicationHomePosition");
  const application = document.querySelector(".request-credit-agent");
  let context = document.getElementById("principalApplicationDetails");
  if (application && !applicationHome) {
    applicationHome = document.createElement("span");
    applicationHome.id = "agentApplicationHomePosition";
    applicationHome.hidden = true;
    application.before(applicationHome);
    context = document.createElement("details");
    context.id = "principalApplicationDetails";
    context.className = "workspace-details precision-agent-context";
    const summary = document.createElement("summary");
    summary.textContent = "Application handoff & protocol details";
    context.append(summary);
    principal.append(context);
  }
  if (selected) {
    principal.prepend(authority);
    authority.open = true;
    if (application) context.append(application);
  } else {
    home.after(authority);
    if (application) applicationHome.after(application);
  }
}

function mountPrecisionAuthority() {
  if (document.getElementById("precisionAuthorityTerms")) return;
  const form = document.getElementById("agentAuthorityForm");
  const review = document.getElementById("agentAuthorityReviewPanel");
  if (!form || !review) return;
  const identity = document.createElement("div");
  identity.className = "precision-identity";
  identity.innerHTML = `<div><span>PRINCIPAL</span><strong>Your Principal account</strong></div><span class="precision-relationship" data-authority="relationship">Prepares authority for</span><div><span>AGENT</span><strong data-authority="name">Assigned Agent</strong></div>`;
  form.prepend(identity);
  const terms = document.createElement("section");
  terms.id = "precisionAuthorityTerms";
  terms.className = "precision-terms";
  terms.setAttribute("aria-labelledby", "precisionTermsTitle");
  terms.innerHTML = `<h3 id="precisionTermsTitle">Review authorization</h3>
    <div class="precision-amounts"><div><strong data-authority="aggregate"></strong><span>Aggregate spending ceiling</span></div><div><strong data-authority="perAction"></strong><span>Per action limit</span></div></div>
    <dl class="precision-term-rows"><div><dt>Purpose</dt><dd data-authority="purpose"></dd></div><div><dt>Provider</dt><dd data-authority="provider"></dd></div><div><dt>Valid until</dt><dd data-authority="expiry"></dd></div><div><dt>Wallet withdrawals</dt><dd>Not permitted</dd></div></dl>
    <p class="precision-footnote">This Mandate sets authority limits. It does not issue credit or move funds.</p>`;
  identity.after(terms);
  const history = document.createElement("section");
  history.className = "precision-preparation";
  history.innerHTML = `<h3>Preparation status</h3><dl><div><dt>Agent account</dt><dd data-authority="identity"></dd></div><div><dt>Mandate</dt><dd data-authority="draft"></dd></div><div><dt>Application & Offer</dt><dd data-authority="offer"></dd></div></dl>`;
  terms.after(history);
  const ticket = document.createElement("div");
  ticket.className = "precision-ticket-heading";
  ticket.innerHTML = `<p class="eyebrow">PRINCIPAL CONTROL</p><h3>Your authorization</h3><p data-authority="decision"></p>`;
  review.prepend(ticket);
  // The acknowledgement and exact activation button stay together and retain
  // their original IDs. The application render controls each stage's visibility.
  ticket.after(document.getElementById("agentActivationStage"), document.getElementById("agentRuntimeStage"));
}

export function renderPrecisionAuthority(model) {
  mountPrecisionAuthority();
  const values = {
    ...model,
    relationship: model.active ? "Authorizes" : "Prepares authority for",
    identity: model.accountBound ? "Account proof verified" : "Account proof required",
    draft: model.hasMandate ? model.status : "Not prepared",
    offer: model.continuationReady ? "Exact Offer available" : model.active ? "View current Agent progress" : "Awaiting Agent application",
    decision: model.active
      ? "This Mandate is active. Follow its approved use and inspect every result."
      : model.continuationReady
        ? "Review the limits and existing Offer, then activate this exact sandbox Mandate."
        : model.accountBound
          ? "Your Agent account is verified. Prepare its application and review the Offer before activation."
          : "Complete account proof and prepare the Agent application before activation."
  };
  for (const node of document.querySelectorAll("[data-authority]")) {
    node.textContent = values[node.dataset.authority] ?? "Not available";
  }
  document.getElementById("precisionAuthorityTerms").hidden = !model.hasMandate;
  document.getElementById("agentAuthorityTitle").textContent = model.name;
  document.getElementById("agentAuthority").dataset.authorityStage = model.active
    ? "active" : model.continuationReady ? "review" : model.hasMandate ? "application" : "preparation";
  const applicationAction = document.getElementById("openAgentApplicationHandoffBtn");
  applicationAction.classList.toggle("primary", !model.continuationReady && !model.active);
  applicationAction.classList.toggle("secondary", model.continuationReady || model.active);
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
