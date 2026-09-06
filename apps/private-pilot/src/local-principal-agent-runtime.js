import { randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createAuthenticationSecretBox } from "../../../modules/authentication/src/index.js";
import { createPostgresPool, createTenantSecurityContext, setTenantTransactionContext } from "../../../modules/persistence/src/index.js";
import { HumanTenantCommandClient } from "../../../modules/tenant-command-gateway/src/index.js";
import { createOperationalId, hashId, DomainError } from "../../../packages/domain/src/index.js";
import { createLocalAuthenticationMaterial, LOCAL_AGENT_ISSUER, LOCAL_AGENT_EXTERNAL_SUBJECT } from "./local-authentication-material.js";
import { assertLocalAccessDatabase } from "./local-access-repair.js";

const unavailable = () => new DomainError("local_agent_enrollment_unavailable", "This Principal's local sandbox Agent is unavailable");
function assertPrincipal(context) {
  if (context.actorType !== "human" || context.roles.length !== 1 || context.roles[0] !== "principal_controller" ||
      !context.capabilities.includes("agent.create") || !context.capabilities.includes("agent.manage.owned")) throw unavailable();
}
function publicStatus(row) {
  return { schemaVersion:"local_principal_agent_runtime_view.v1", available:true, serverTruth:true,
    status:row?.status ?? "not_created", actorId:row?.agent_actor_id ?? null,
    accountAddress:row?.account_address ?? null, sandboxOnly:true, productionFundsMoved:false,
    credentialEnteredBrowser:false };
}

export function createLocalPrincipalAgentRuntime({ ownerConnectionString, basePort, tenantId,
  encryptionKey, referenceHasher, agentCapabilities, gateway, networkContext, expiresAt }) {
  assertLocalAccessDatabase(ownerConnectionString,basePort);
  const pool=createPostgresPool({connectionString:ownerConnectionString,max:3,applicationName:"ipo-one-local-agent-enrollment"});
  const box=createAuthenticationSecretBox(encryptionKey);
  async function transaction(context,operation) {
    assertPrincipal(context);
    if(context.tenantId!==tenantId) throw unavailable();
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client,createTenantSecurityContext({tenantId,actorId:context.actorId,
        policyVersion:context.policyVersion,source:"local_test"}));
      // Lock the exact live credential and its membership for every read/write.
      const allowed=await client.query(`SELECT c.id FROM authentication_credentials c
        JOIN memberships m ON m.tenant_id=c.tenant_id AND m.actor_id=c.actor_id
        JOIN actors a ON a.id=c.actor_id JOIN tenants t ON t.id=c.tenant_id
        JOIN authentication_role_enrollments e ON e.tenant_id=c.tenant_id AND e.credential_id=c.id AND e.actor_id=c.actor_id
        WHERE c.tenant_id=$1 AND c.id=$2 AND c.actor_id=$3 AND c.client_id=$4 AND c.version=$5
        AND c.status='active' AND (c.expires_at IS NULL OR c.expires_at>clock_timestamp())
        AND m.status='active' AND m.valid_from<=clock_timestamp() AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
        AND m.client_ids ? $4 AND a.status='active' AND t.status='active'
        AND e.role_bundle='principal_controller' AND e.status='active' AND e.client_ids ? $4
        AND e.policy_version=$6 AND e.capabilities ?& ARRAY['agent.create','agent.manage.owned']
        AND e.valid_from<=clock_timestamp() AND (e.expires_at IS NULL OR e.expires_at>clock_timestamp())
        FOR SHARE OF c,m,a,e,t`,[tenantId,context.credentialId,context.actorId,context.clientId,context.credentialVersion,context.policyVersion]);
      if(allowed.rowCount!==1) throw unavailable();
      await client.query("SELECT pg_advisory_xact_lock(hashtext('local_principal_agent_enrollment'),hashtext($1 || ':' || $2))",[tenantId,context.actorId]);
      const result=await operation(client);
      await client.query("COMMIT");return result;
    } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
  }
  const rowFor = async (client,context) => (await client.query(
    "SELECT * FROM local_principal_agent_runtimes WHERE tenant_id=$1 AND controller_actor_id=$2 FOR UPDATE",[tenantId,context.actorId])).rows[0];
  async function status(context) {return transaction(context,async client=>publicStatus(await rowFor(client,context)));}
  async function create(context) {
    const row=await transaction(context,async client=>{
      const existing=await rowFor(client,context);
      if(existing) {if(existing.status!=="active") throw unavailable();return existing;}
      // One dedicated runtime per fresh Principal. Never adopt another assignment.
      const controlled=await client.query("SELECT 1 FROM memberships WHERE tenant_id=$1 AND controller_actor_id=$2 LIMIT 1",[tenantId,context.actorId]);
      if(controlled.rowCount) throw unavailable();
      const now=new Date();
      if(new Date(expiresAt)<=now) throw unavailable();
      const actorId=`actor_local_agent_${randomUUID().replaceAll("-","")}`;
      const clientId=`client_${actorId}`;
      const credentialId=createOperationalId("credential");
      const privateKey=generatePrivateKey();
      const account=privateKeyToAccount(privateKey);
      const {agent:keyMaterial}=await createLocalAuthenticationMaterial({invitedWalletAddress:account.address});
      await client.query(`INSERT INTO actors(id,actor_hash,actor_type,status,created_at,updated_at,schema_version)
        VALUES($1,$2,'agent','active',$3,$3,'actor.v1')`,[actorId,hashId("local_principal_agent_actor",actorId),now]);
      const membershipId=`membership_${actorId}`;
      await client.query(`INSERT INTO memberships(id,membership_hash,tenant_id,actor_id,role_bundle,capabilities,client_ids,
        policy_version,controller_actor_id,status,valid_from,expires_at,created_at,updated_at,version,schema_version)
        VALUES($1,$2,$3,$4,'agent_runtime',$5::jsonb,$6::jsonb,$7,$8,'active',$9,$10,$9,$9,1,'membership.v1')`,
        [membershipId,hashId("local_principal_agent_membership",membershipId),tenantId,actorId,JSON.stringify(agentCapabilities),
         JSON.stringify([clientId]),context.policyVersion,context.actorId,now,expiresAt]);
      await client.query(`INSERT INTO authentication_credentials(id,tenant_id,actor_id,actor_type,issuer,subject_ref_hash,client_id,
        client_authentication_method,sender_constraint_method,sender_constraint_ref_hash,roles,allowed_capabilities,
        policy_version,status,version,expires_at,created_at,updated_at,schema_version,reference_hash_key_version)
        VALUES($1,$2,$3,'agent',$4,$5,$6,'private_key_jwt','dpop',$7,'["agent_runtime"]'::jsonb,$8::jsonb,
          $9,'active',1,$10,$11,$11,'authentication_credential.v1','v1')`,
        [credentialId,tenantId,actorId,LOCAL_AGENT_ISSUER,referenceHasher.hash("subject",`${LOCAL_AGENT_ISSUER}\0${LOCAL_AGENT_EXTERNAL_SUBJECT}`),
         clientId,referenceHasher.hash("sender.constraint",keyMaterial.agentThumbprint),JSON.stringify(agentCapabilities),context.policyVersion,expiresAt,now]);
      await client.query(`INSERT INTO authentication_events(id,tenant_id,event_type,actor_id,credential_id,reason_code,occurred_at,payload,schema_version)
        VALUES($1,$2,'credential_registered',$3,$4,'explicit_local_principal_agent_setup',$5,$6::jsonb,'authentication_event.v1')`,
        [createOperationalId("auth_event"),tenantId,context.actorId,credentialId,now,JSON.stringify({actorType:"agent",clientAuthenticationMethod:"private_key_jwt",senderConstraintMethod:"dpop",version:1,referenceHashKeyVersion:"v1"})]);
      const encrypted=box.seal("local.principal.agent",JSON.stringify({tenantId,controllerActorId:context.actorId,actorId,clientId,keyMaterial,privateKey}));
      const result=await client.query(`INSERT INTO local_principal_agent_runtimes(tenant_id,controller_actor_id,agent_actor_id,credential_id,client_id,
        account_address,encrypted_material,status,created_at,updated_at,schema_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$8,'local_principal_agent_runtime.v1') RETURNING *`,
        [tenantId,context.actorId,actorId,credentialId,clientId,account.address,encrypted,now]);
      return result.rows[0];
    });
    // The shared, authorized gateway owns Subject/Principal creation and its
    // idempotent receipt. A retry after process failure resumes the same actor.
    const client=new HumanTenantCommandClient({gateway,authenticationContextProvider:async()=>context,networkContextProvider:async()=>networkContext});
    const result=await client.createAgentSubject({payload:{subjectActorId:row.agent_actor_id,displayName:"My sandbox Agent",jurisdiction:"US"},
      idempotencyKey:`local-agent-subject-${row.agent_actor_id}`,requestId:`request-${randomUUID()}`,correlationId:`correlation-${randomUUID()}`});
    return {...publicStatus(row),subjectId:result.response.subjectId,subjectStatus:result.response.status};
  }
  async function revoke(context,input) {
    return transaction(context,async client=>{
      const row=await rowFor(client,context);
      if(!row || row.agent_actor_id!==input.actorId) throw unavailable();
      if(row.status==="revoked") return publicStatus(row);
      const now=new Date();
      const changed=await client.query("UPDATE authentication_credentials SET status='revoked',updated_at=$3 WHERE tenant_id=$1 AND id=$2 AND status='active' RETURNING id",[tenantId,row.credential_id,now]);
      if(changed.rowCount) await client.query(`INSERT INTO authentication_events(id,tenant_id,event_type,actor_id,credential_id,reason_code,occurred_at,payload,schema_version)
        VALUES($1,$2,'credential_revoked',$3,$4,'principal_revoked_local_agent_runtime',$5,'{"status":"revoked"}'::jsonb,'authentication_event.v1')`,
        [createOperationalId("auth_event"),tenantId,context.actorId,row.credential_id,now]);
      await client.query("UPDATE local_principal_agent_runtimes SET status='revoked',updated_at=$3 WHERE tenant_id=$1 AND controller_actor_id=$2",[tenantId,context.actorId,now]);
      return publicStatus({...row,status:"revoked"});
    });
  }
  async function materialFor(context,subjectId) {
    return transaction(context,async client=>{
      const row=await rowFor(client,context);
      if(!row) return null;
      if(row.status!=="active") throw unavailable();
      const binding=await client.query(`SELECT 1 FROM authorization_resource_bindings
        WHERE tenant_id=$1 AND resource_type='subject' AND resource_id=$2 AND actor_id=$3 AND relationship='subject' AND status='active'`,[tenantId,subjectId,row.agent_actor_id]);
      if(binding.rowCount!==1) throw unavailable();
      const decoded=JSON.parse(box.open("local.principal.agent",row.encrypted_material));
      if(decoded.tenantId!==tenantId || decoded.controllerActorId!==context.actorId || decoded.actorId!==row.agent_actor_id || decoded.clientId!==row.client_id) throw unavailable();
      const account=privateKeyToAccount(decoded.privateKey);
      if(account.address!==row.account_address) throw unavailable();
      return {clientId:row.client_id,keyMaterial:decoded.keyMaterial,account:{address:account.address,signTypedData:account.signTypedData,
        accountIds:Object.fromEntries(["eip155:84532","eip155:1952"].map(chain=>[chain,`${chain}:${account.address.toLowerCase()}`]))}};
    });
  }
  return Object.freeze({status,create,revoke,materialFor,close:()=>pool.end()});
}
