const actions = {
  pilotRestructureSandboxObligation: { name:"Restructuring", reason:"sandbox_hardship_restructure" },
  pilotRepurchaseSandboxObligation: { name:"Repurchase", reason:"sandbox_contractual_repurchase" },
  pilotWriteOffSandboxObligation: { name:"Write-off", reason:"sandbox_uncollectible_writeoff" }
};
const el = id => document.getElementById(id);
const money = value => `$${(Number(value ?? 0)/100).toFixed(2)}`;
const date = value => new Date(value).toLocaleString();

export function createLocalReviewWorkspace({ api, getState, selectAgent }) {
  let epoch = 0, busy = false, capabilities = new Set(), cases = [], agents = [], selected = null, draft = null;
  const panel = el("localReviewPanel"), directory = el("localAgentDirectory");
  const has = op => capabilities.has(op);
  function message(text) { el("localReviewMessage").textContent = text; if (getState().workspace === "risk") el("localAgentDirectoryStatus").textContent = text; }
  function clearSelection() { selected = null; el("localApprovalDetail").hidden = true; el("localApprovalAcknowledge").checked = false; }
  function render() {
    const state = getState();
    panel.hidden = !state.signedIn || !["operations","riskReviewer","auditor"].includes(state.workspace);
    directory.hidden = !state.signedIn || state.workspace !== "risk";
    el("loadLocalAgentsBtn").disabled = busy || !has("pilotReadRiskAgentDirectory");
    el("refreshLocalApprovalsBtn").disabled = busy || !has("pilotReadApprovalInbox");
    el("loadLocalServicingBtn").disabled = busy || !has("pilotReadServicingQueue");
    el("localServicingForm").hidden = !has("pilotProposeApproval");
    el("localServicingPosition").disabled = busy || !cases.length;
    const action = el("localServicingAction").value;
    el("localServicingTermField").hidden = action !== "pilotRestructureSandboxObligation";
    el("localServicingOwnerField").hidden = action !== "pilotRepurchaseSandboxObligation";
    el("proposeLocalServicingBtn").disabled = busy || !cases.length || !el("localServicingAcknowledge").checked;
    for (const id of ["localServicingAction","localServicingTerm","localServicingOwner","localServicingAcknowledge","localApprovalAcknowledge"]) el(id).disabled = busy;
    const proposal = selected?.proposal, expired = proposal && Date.parse(proposal.expiresAt) <= Date.now();
    const acknowledged = el("localApprovalAcknowledge").checked;
    el("approveLocalProposalBtn").disabled = busy || !acknowledged || !has("pilotDecideApproval") || proposal?.status !== "pending" || expired;
    el("rejectLocalProposalBtn").disabled = el("approveLocalProposalBtn").disabled;
    el("cancelLocalProposalBtn").disabled = busy || !acknowledged || !has("pilotCancelApproval") || !["pending","approved"].includes(proposal?.status);
    el("executeLocalProposalBtn").disabled = busy || !acknowledged || !has(proposal?.operationId) || proposal?.status !== "approved" || expired;
  }
  async function run(action) {
    if (busy) return;
    const owner = epoch; busy = true; render();
    try { await action(() => owner === epoch); }
    catch (error) { if (owner === epoch) message(error?.message ?? "This action was not confirmed. Refresh and review the current server state."); }
    finally { if (owner === epoch) { busy = false; render(); } }
  }
  function showReview(value) {
    selected = value; el("localApprovalAcknowledge").checked = false;
    const p = value.proposal, plan = value.planSnapshot;
    el("localApprovalDetail").hidden = false;
    el("localApprovalTitle").textContent = `${actions[p.operationId].name} · ${p.status}`;
    el("localApprovalTerms").textContent = `Principal ${money(plan.outstandingPrincipalMinor)} · Interest ${money(plan.outstandingInterestMinor)} · Fees ${money(plan.outstandingFeesMinor)} · Schedule ${plan.scheduleSequence} · Expires ${date(p.expiresAt)}`;
    el("localApprovalImpact").textContent = p.operationId === "pilotRestructureSandboxObligation"
      ? `Extend by ${value.command.payload.additionalTermDays} days. The original schedule remains in the record.`
      : p.operationId === "pilotRepurchaseSandboxObligation" ? `Transfer servicing to ${value.command.payload.servicingOwnerCode === "sandbox_originator" ? "the originator" : "the platform"}. This does not record a payment.`
        : "Write off the outstanding balance. This is not a repayment and remains visible in the credit history.";
    const approved = new Set(value.decisions.filter(d => d.decision === "approve").map(d => d.approverRoleBundle));
    el("localApprovalProgress").textContent = `Independent Risk: ${approved.has("risk_operator") ? "approved" : "required"} · Independent Operations: ${approved.has("operations_operator") ? "approved" : "required"}. Neither approver can be the proposer. Current local enrollment has no separate Operations approver.`;
    el("localApprovalTechnical").textContent = JSON.stringify({ proposalId:p.approvalProposalId,version:p.version,commandHash:p.commandHash,reason:p.reasonCode,planSnapshot:plan },null,2);
    render();
  }
  async function readProposal(id) { return (await api("pilotReadApproval", { resource:{resourceType:"approval_proposal",resourceId:id},payload:{},idempotent:false })).response; }
  async function inbox(current) {
    const result = (await api("pilotReadApprovalInbox",{payload:{},idempotent:false})).response;
    if (!current()) return;
    const list = el("localApprovalList"); list.replaceChildren();
    for (const item of result.proposals) {
      const button = document.createElement("button"); button.type="button"; button.className="secondary";
      button.textContent=`Review ${actions[item.operationId].name.toLowerCase()} · ${item.status} · ${date(item.createdAt)}`;
      button.addEventListener("click",()=>run(async valid=>{ const response=await readProposal(item.proposalId);if(valid()) showReview(response); }));
      list.append(button);
    }
    if (!result.proposals.length) list.textContent="No servicing proposals have been created in this local acceptance workspace.";
    message(`Approval inbox verified ${date(result.asOf)}${result.hasMore ? " · Showing the latest 25 proposals" : ""}. Reads do not approve or execute a command.`);
  }
  el("refreshLocalApprovalsBtn").addEventListener("click",()=>run(inbox));
  el("loadLocalServicingBtn").addEventListener("click",()=>run(async current=>{
    const reference=(await api("pilotReadServicingQueueReference",{payload:{},idempotent:false})).response.resource;
    if (!reference) throw new Error("No authorized servicing queue is configured.");
    const response=(await api("pilotReadServicingQueue",{resource:reference,payload:{},idempotent:false})).response;
    if (!current()) return;
    cases=response.cases.filter(item=>/^0x[0-9a-f]{64}$/.test(item.servicingStateHash ?? ""));draft=null;
    const select=el("localServicingPosition");select.replaceChildren();
    for (const [index,item] of cases.entries()) { const option=document.createElement("option");option.value=String(index);option.textContent=`Plan ${index+1} · ${money(item.outstandingTotalMinor)} outstanding · ${item.daysPastDue} days past due · Schedule ${item.scheduleSequence}`;select.append(option); }
    el("localServicingAcknowledge").checked=false;
    message(cases.length ? `${cases.length} eligible queue entries loaded. Review the exact action before proposing it.` : "No legitimately matured adverse plans are currently available. Proposals remain disabled until the normal servicing clock produces an eligible plan.");
  }));
  for (const id of ["localServicingPosition","localServicingAction","localServicingTerm","localServicingOwner"]) el(id).addEventListener("change",()=>{draft=null;el("localServicingAcknowledge").checked=false;render();});
  for (const id of ["localServicingAcknowledge","localApprovalAcknowledge"]) el(id).addEventListener("change",render);
  el("localServicingForm").addEventListener("submit",event=>{ event.preventDefault();run(async current=>{
    const item=cases[Number(el("localServicingPosition").value)], operationId=el("localServicingAction").value;
    if (!item || !el("localServicingAcknowledge").checked) return;
    draft ??= { command:{operationId,resource:{resourceType:"obligation",resourceId:item.obligationId},
      payload:{expectedServicingStateHash:item.servicingStateHash,
        ...(operationId==="pilotRestructureSandboxObligation" ? {additionalTermDays:Number(el("localServicingTerm").value)} : {}),
        ...(operationId==="pilotRepurchaseSandboxObligation" ? {servicingOwnerCode:el("localServicingOwner").value} : {})},
      reasonCode:actions[operationId].reason,idempotencyKey:`servicing_execute_${crypto.randomUUID()}`},
      expiresAt:new Date(Date.now()+10*60_000).toISOString(),idempotencyKey:`servicing_propose_${crypto.randomUUID()}` };
    const result=await api("pilotProposeApproval",{payload:{command:draft.command,expiresAt:draft.expiresAt},idempotencyKey:draft.idempotencyKey});
    if(current()){showReview(result.response);draft=null;message("Proposal recorded. The exact command still requires both independent approvals before execution.");}
  });});
  for (const [id,decision] of [["approveLocalProposalBtn","approve"],["rejectLocalProposalBtn","reject"],["cancelLocalProposalBtn","cancel"]]) el(id).addEventListener("click",()=>run(async current=>{
    if(!selected || !el("localApprovalAcknowledge").checked)return;
    const p=selected.proposal;
    const result=await api(decision==="cancel" ? "pilotCancelApproval" : "pilotDecideApproval",{
      resource:{resourceType:"approval_proposal",resourceId:p.approvalProposalId},payload:{expectedVersion:p.version,...(decision==="cancel" ? {} : {decision})},
      reasonCode:decision==="cancel" ? "proposal_canceled" : decision==="approve" ? "approval_confirmed" : "approval_rejected"});
    if(current()){showReview(result.response);message("Your explicit decision was recorded. No servicing command was executed.");}
  }));
  el("executeLocalProposalBtn").addEventListener("click",()=>run(async current=>{
    if(!selected || !el("localApprovalAcknowledge").checked)return;
    const reviewed=selected, latest=await readProposal(reviewed.proposal.approvalProposalId);
    if(!current())return;
    if(latest.proposal.version!==reviewed.proposal.version || latest.proposal.status!=="approved") {showReview(latest);throw new Error("Approval changed. Review and explicitly confirm the current proposal.");}
    const {operationId,...command}=latest.command;
    await api(operationId,{...command,approvalArtifact:{proposalId:latest.proposal.approvalProposalId,proposalVersion:latest.proposal.version}});
    if(current()){showReview(await readProposal(latest.proposal.approvalProposalId));message("The approved servicing command was recorded. The original plan and audit history remain available.");}
  }));
  el("loadLocalAgentsBtn").addEventListener("click",()=>run(async current=>{
    const resource=(await api("pilotReadTenantRiskPortfolioReference",{payload:{},idempotent:false})).response.resource;
    if(!resource)throw new Error("No authorized portfolio is configured.");
    const result=(await api("pilotReadRiskAgentDirectory",{resource,payload:{},idempotent:false})).response;
    if(!current())return;
    agents=result.agents;const list=el("localAgentList");list.replaceChildren();
    for(const agent of agents){const button=document.createElement("button");button.type="button";button.className="secondary";button.dataset.localRiskAgent=agent.subjectId;
      button.textContent=`Review Agent ${agent.reference} · ${agent.status} · ${date(agent.createdAt)}`;
      button.addEventListener("click",()=>{if(!busy && agents.includes(agent))selectAgent(agent);});list.append(button);}
    el("localAgentDirectoryStatus").textContent=agents.length ? `Verified ${date(result.asOf)} · ${result.hasMore ? "Latest 25 eligible Agents" : `${agents.length} eligible Agents`}. Selection does not freeze an Agent.` : "No active or pending Agents are available for protective review.";
  }));
  return Object.freeze({
    setCatalog(operations){capabilities=new Set(operations);render();},
    hasAgent(id){return agents.some(agent=>agent.subjectId===id);},
    clear(){epoch++;busy=false;cases=[];agents=[];draft=null;capabilities=new Set();clearSelection();el("localApprovalList").replaceChildren();el("localAgentList").replaceChildren();render();panel.hidden=true;directory.hidden=true;},
    render
  });
}
