import { DomainError, assertHostedSyntheticFeeGovernance, HOSTED_SYNTHETIC_FEE_PROFILE } from "../../../packages/domain/src/index.js";

export const HOSTED_SYNTHETIC_SOURCE_PROFILE = "synthetic_fee_source_hosted.v1";

// Deployment-owned configuration only. Absence never activates a feature or
// creates an actor, enrollment, Passkey, or capability.
export function checkedHostedSyntheticFeeConfiguration({ governance, feeProfile, sourceProfile,
  tenantId, browserOrigin, deploymentRole, noRealFunds }) {
  const invalid=()=>{throw new DomainError("invalid_production_environment","Exact hosted no-funds fee configuration is required");};
  if(feeProfile!==undefined && feeProfile!==HOSTED_SYNTHETIC_FEE_PROFILE)invalid();
  if(sourceProfile!==undefined && sourceProfile!==HOSTED_SYNTHETIC_SOURCE_PROFILE)invalid();
  if(governance===undefined) {
    if(feeProfile!==undefined || sourceProfile!==undefined)invalid();
    return Object.freeze({syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:false});
  }
  if(deploymentRole!=="primary" || noRealFunds!==true)invalid();
  const checked=assertHostedSyntheticFeeGovernance(governance,{tenantId,browserOrigin});
  return Object.freeze({hostedSyntheticFeeGovernance:checked,
    syntheticFeesEnabled:feeProfile!==undefined,syntheticFeeCorrectionsEnabled:sourceProfile!==undefined});
}

export function hostedManagementAccessForFees(governance) {
  if(governance===undefined)return undefined;
  return Object.freeze({schemaVersion:"hosted_governed_human_access.v1",tenantId:governance.tenantId,
    origin:governance.browserOrigin,rpId:governance.rpId,approvalReference:governance.approvalReference,
    bindings:Object.freeze([
      {actorId:governance.institutionOperatorActorId,role:"capital_partner_operator",workspace:"capitalPartner"},
      {actorId:governance.operationsActorId,role:"operations_operator",workspace:"operations"},
      {actorId:governance.riskReviewerActorId,role:"risk_operator",workspace:"riskReviewer"},
      {actorId:governance.operationsReviewerActorId,role:"operations_operator",workspace:"operationsReviewer"},
      ...(governance.auditorActorId===null?[]:[{actorId:governance.auditorActorId,role:"auditor",workspace:"auditor"}])
    ].map(Object.freeze))});
}

export async function assertHostedFeeEnrollments({pool,governance,syntheticFeesEnabled,syntheticFeeCorrectionsEnabled,
  systemActorId,policyVersion,clientId,now=new Date()}) {
  if(!governance || (!syntheticFeesEnabled && !syntheticFeeCorrectionsEnabled))return;
  const {createTenantSecurityContext,setTenantTransactionContext}=await import('../../../modules/persistence/src/index.js');
  const {PilotCapability:C}=await import('../../../modules/authorization/src/index.js');
  const required=[];
  if(syntheticFeesEnabled)required.push({actorId:governance.institutionOperatorActorId,type:'human',role:'capital_partner_operator',capabilities:[C.CAPITAL_PARTNER_PORTFOLIO_READ_OWN,C.CAPITAL_PARTNER_OFFER_CREATE_OWN]});
  if(syntheticFeeCorrectionsEnabled)required.push(
    {actorId:governance.operationsActorId,type:'operations_operator',role:'operations_operator',capabilities:[C.APPROVAL_PROPOSE,C.APPROVAL_READ,C.APPROVAL_CANCEL,C.SERVICING_WRITEOFF_SANDBOX]},
    {actorId:governance.riskReviewerActorId,type:'risk_operator',role:'risk_operator',capabilities:[C.APPROVAL_READ,C.APPROVAL_DECIDE]},
    {actorId:governance.operationsReviewerActorId,type:'operations_operator',role:'operations_operator',capabilities:[C.APPROVAL_READ,C.APPROVAL_DECIDE]}
  );
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantTransactionContext(client,createTenantSecurityContext({tenantId:governance.tenantId,actorId:systemActorId,policyVersion,source:'system_worker'}));
    for(const binding of required) {
      const result=await client.query(`SELECT e.id FROM authentication_role_enrollments e
        JOIN authentication_credentials c ON c.tenant_id=e.tenant_id AND c.id=e.credential_id AND c.actor_id=e.actor_id
        JOIN actors a ON a.id=e.actor_id
        JOIN memberships m ON m.tenant_id=e.tenant_id AND m.actor_id=e.actor_id AND m.role_bundle=e.role_bundle
        WHERE e.tenant_id=$1 AND e.actor_id=$2 AND e.role_bundle=$3 AND a.actor_type::text=$4
          AND c.client_id=$5 AND e.client_ids ? $5 AND m.client_ids ? $5
          AND e.policy_version=$6 AND c.policy_version=$6 AND m.policy_version=$6
          AND e.status='active' AND c.status='active' AND m.status='active' AND a.status='active'
          AND e.valid_from <= $7 AND (e.expires_at IS NULL OR e.expires_at > $7)
          AND m.valid_from <= $7 AND (m.expires_at IS NULL OR m.expires_at > $7)
          AND (c.expires_at IS NULL OR c.expires_at > $7)
          AND e.capabilities @> $8::jsonb AND c.allowed_capabilities @> $8::jsonb AND m.capabilities @> $8::jsonb
        FOR SHARE OF e,c,a,m`,[governance.tenantId,binding.actorId,binding.role,binding.type,clientId,policyVersion,now,JSON.stringify(binding.capabilities)]);
      if(result.rowCount<1)throw new DomainError('hosted_synthetic_fee_enrollment_unavailable','Enabled hosted synthetic operations require their exact existing active role enrollments and capabilities');
    }
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
