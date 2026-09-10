import { DomainError, advanceSandboxServicing, hashId } from "../../../packages/domain/src/index.js";
import { CoreProjectionType, PostgresCoreRepository, createTenantSecurityContext } from "../../../modules/persistence/src/index.js";
import { TENANT_OPERATION_POLICIES } from "../../../modules/authorization/src/index.js";
import { advanceSandboxServicingCommandHandler } from "../../../modules/tenant-command-gateway/src/servicing-handlers.js";
import { createPostgresTenantLivePolicyAdapter } from "../../../modules/tenant-command-gateway/src/postgres-live-policy-adapter.js";
import { localIndependentOperationsEnabled } from "./local-special-role-access.js";

// Bounded background servicing for the already-created acceptance positions.
// Uses the existing system membership, shared handler and event transaction;
// it does not enroll an actor, issue a credential or accept a supplied clock.
const PLANS = [
  "obligation_ad6fb93d-d18a-479a-8e58-f56a328be9a9",
  "obligation_355d2cf4-4c17-41e5-adc1-e0ae5236a33a",
  "obligation_c3746224-101c-4de6-a512-54cba5c7fc51"
];
const ACTOR = "actor_local_authentication_system";
const CLIENT = "client_local_authentication_system";
const policy = TENANT_OPERATION_POLICIES.find(p => p.operationId === "workerAdvanceSandboxServicing");
const denied = () => { throw new DomainError("local_servicing_clock_unavailable", "The authorized local servicing clock is unavailable."); };

export async function runLocalServicingClock({ pool, tenantId, policyVersion }) {
  if (!localIndependentOperationsEnabled()) return { advanced:0, enabled:false };
  const tenantContext = createTenantSecurityContext({ tenantId, actorId:ACTOR, policyVersion, source:"system_worker" });
  const coreRepository = new PostgresCoreRepository({ pool, tenantContext });
  return coreRepository.withTenantTransaction(async client => {
    const clock = (await client.query("SELECT current_database() AS database, clock_timestamp() AS now")).rows[0];
    if (clock.database !== "ipo_one_web027_candidate") denied();
    const now = new Date(clock.now);
    const membership = await client.query(`SELECT m.id FROM memberships m JOIN actors a ON a.id=m.actor_id
      WHERE m.tenant_id=$1 AND m.actor_id=$2 AND m.role_bundle='system_worker' AND m.policy_version=$3
        AND m.client_ids ? $4 AND m.capabilities ? $5 AND m.status='active' AND a.status='active'
        AND a.actor_type='system_worker' AND m.valid_from <= $6 AND (m.expires_at IS NULL OR m.expires_at > $6)
      FOR SHARE OF m,a`, [tenantId,ACTOR,policyVersion,CLIENT,policy.requiredCapability,now]);
    if (membership.rowCount !== 1) denied();
    const rows = await client.query(`SELECT id FROM obligations WHERE tenant_id=$1 AND id=ANY($2::text[])
      AND execution_status='executed' AND status IN ('active','partially_repaid','delinquent','defaulted','restructured','repurchased')
      ORDER BY id FOR UPDATE SKIP LOCKED`, [tenantId,PLANS]);
    let advanced=0;
    for (const {id} of rows.rows) {
      const handler=advanceSandboxServicingCommandHandler();
      const resource={resourceType:"obligation",resourceId:id};
      const authenticationContext={tenantId,actorId:ACTOR,actorType:"system_worker",clientId:CLIENT,policyVersion};
      await createPostgresTenantLivePolicyAdapter({client,coreRepository,handler,payload:{}})
        .evaluate({policy,resource,authenticationContext,now});
      const state=await coreRepository.getProjectionStateInTransaction(client,CoreProjectionType.OBLIGATION,id,{lock:true});
      if (!advanceSandboxServicing(state.value,{actorId:ACTOR,now}).changed) continue;
      const idempotencyKey=`web027_servicing_clock_${id}_${state.aggregateVersion}_${now.toISOString().slice(0,10)}`;
      const plan=await handler.plan({client,coreRepository,payload:{},authenticationContext,
        authorizationDecision:resource,now,requestId:idempotencyKey,correlationId:idempotencyKey});
      await coreRepository.commitCommandInTransaction(client,{...plan,idempotencyKey,
        commandHash:hashId("local_servicing_clock",{operationId:handler.operationId,resource,version:state.aggregateVersion,day:now.toISOString().slice(0,10)})});
      advanced++;
    }
    return {advanced,enabled:true,asOf:now.toISOString()};
  });
}
