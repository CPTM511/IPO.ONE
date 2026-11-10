import { authenticationError } from "./security-utils.js";
import { closedPasskeyObject } from "./local-risk-passkeys.js";
const denied=()=>{throw authenticationError("authentication_deployment_gate_closed","Exact governed HTTPS management access is required");};

// Server-owned role bindings describe which existing enrollments may sign in.
// They are not enrollment instructions and contain no public self-service grant.
export function checkedHostedManagementAccess(value,{tenantId,origin}={}) {
  if(value===undefined)return undefined;
  closedPasskeyObject(value,["schemaVersion","tenantId","origin","rpId","approvalReference","bindings"]);
  if(value.schemaVersion!=="hosted_governed_human_access.v1" || value.tenantId!==tenantId ||
      value.origin!==origin || origin!=="https://ipo.one" || value.rpId!=="ipo.one" ||
      typeof value.approvalReference!=="string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(value.approvalReference) ||
      !Array.isArray(value.bindings) || value.bindings.length<4 || value.bindings.length>5)denied();
  const bindings=value.bindings.map(binding=>{
    closedPasskeyObject(binding,["actorId","role","workspace"]);
    if(typeof binding.actorId!=="string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(binding.actorId) ||
        !({capital_partner_operator:["capitalPartner"],operations_operator:["operations","operationsReviewer"],risk_operator:["riskReviewer"],auditor:["auditor"]}[binding.role]??[]).includes(binding.workspace))denied();
    return Object.freeze({...binding});
  });
  if(new Set(bindings.map(b=>b.actorId)).size!==bindings.length || new Set(bindings.map(b=>b.workspace)).size!==bindings.length ||
      bindings.filter(b=>b.role==="capital_partner_operator").length!==1 ||
      bindings.filter(b=>b.role==="operations_operator").length!==2 ||
      bindings.filter(b=>b.role==="risk_operator").length!==1 ||
      bindings.filter(b=>b.role==="auditor").length>1)denied();
  return Object.freeze({...value,bindings:Object.freeze(bindings)});
}
