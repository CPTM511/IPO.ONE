// WEB-027J: a named, exact local credential generation. No production profile.
import { createOperationalId } from "../../../packages/domain/src/index.js";
import { PilotCapability } from "../../../modules/authorization/src/index.js";
import { createTenantSecurityContext, setTenantTransactionContext } from "../../../modules/persistence/src/index.js";

export const LOCAL_ACCESS_GENERATION = "web027k";
export const LOCAL_ACCESS_ADDITIONS = Object.freeze([
  PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
  PilotCapability.OFFICIAL_REPORT_READ_OWNED,
  PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
  PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED,
  PilotCapability.WALLET_ACCOUNT_BINDING_PREPARE_OWNED,
  PilotCapability.WALLET_ACCOUNT_BINDING_SUBMIT_OWNED,
  PilotCapability.WALLET_ACCOUNT_BINDING_READ_OWNED,
  PilotCapability.WALLET_ACCOUNT_BINDING_REVOKE_OWNED,
  PilotCapability.WALLET_CAPABILITIES_DISCOVER
]);
export const localAccessCapabilities = capabilities => [...new Set([...capabilities, ...LOCAL_ACCESS_ADDITIONS,
  ...(capabilities.includes(PilotCapability.HUMAN_SUBJECT_CREATE_SELF) ? [PilotCapability.SUBJECT_ACTIVATE_SANDBOX_SELF] : [])])];
export const localAccessEnabled = () => process.env.IPO_ONE_LOCAL_ACCESS_REPAIR === "web027j_v1";

export function assertLocalAccessDatabase(connectionString, basePort) {
  const url = new URL(connectionString);
  const exact = { "/ipo_one_web027_candidate": 8935, "/ipo_one_web027_proof": 8945 };
  if (url.hostname !== "127.0.0.2" || url.port !== "55435" || exact[url.pathname] !== basePort) {
    throw new Error("WEB-027J activation requires the exact isolated local database and ports");
  }
}

export async function rotateLocalAccessCredentials({ pool, tenantId, identities, basePort, now = new Date() }) {
  const client = await pool.connect();
  const manifest = [];
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, createTenantSecurityContext({ tenantId,
      actorId: "actor_local_authentication_system", policyVersion: "security_001.v1", source: "local_test" }));
    await client.query("SELECT pg_advisory_xact_lock(hashtext('web027k_local_credential_generation'), hashtext($1))", [tenantId]);
    for (const [index, name] of ["borrower", "controller"].entries()) {
      const oldClientId = `client_phase7_${identities[name].actorId}`;
      const newClientId = `client_${LOCAL_ACCESS_GENERATION}_${identities[name].actorId}`;
      const issuer = `https://127.0.0.1:${basePort + index}`;
      const rows = await client.query(`SELECT c.*, m.capabilities AS membership_capabilities, m.client_ids AS membership_client_ids FROM authentication_credentials c
        JOIN actors a ON a.id=c.actor_id JOIN memberships m ON m.tenant_id=c.tenant_id AND m.actor_id=c.actor_id
        JOIN tenants t ON t.id=c.tenant_id
        WHERE c.tenant_id=$1 AND c.issuer=$2 AND c.client_id=ANY($3::text[])
        AND c.actor_type='human' AND c.client_authentication_method='siwe'
        AND c.sender_constraint_method='host_session' AND c.status='active'
        AND (c.expires_at IS NULL OR c.expires_at>$4) AND a.status='active' AND t.status='active'
        AND m.status='active' AND m.valid_from<=$4 AND (m.expires_at IS NULL OR m.expires_at>$4)
        AND m.role_bundle IN ('human_borrower','principal_controller')
        AND c.roles=jsonb_build_array(m.role_bundle)
        ORDER BY c.id FOR UPDATE OF c,m`, [tenantId,issuer,[oldClientId, `client_web027j_${identities[name].actorId}`],now]);
      for (const c of rows.rows) {
        const enrollments = await client.query(`SELECT * FROM authentication_role_enrollments
          WHERE tenant_id=$1 AND credential_id=$2 ORDER BY id FOR UPDATE`, [tenantId,c.id]);
        // A missing, expired or revoked enrollment is never recreated by rotation.
        if (!enrollments.rowCount || enrollments.rows.some(e => e.status !== "active" ||
            new Date(e.valid_from)>now || (e.expires_at && new Date(e.expires_at)<=now) ||
            !["human_borrower","principal_controller"].includes(e.role_bundle) ||
            !e.client_ids.includes(c.client_id))) continue;
        const id = createOperationalId("credential");
        const capabilities = localAccessCapabilities(c.allowed_capabilities);
        await client.query(`UPDATE memberships SET capabilities=$3::jsonb, client_ids=$4::jsonb,
          version=version+1, updated_at=$5 WHERE tenant_id=$1 AND actor_id=$2`,
          [tenantId,c.actor_id,JSON.stringify(localAccessCapabilities(c.membership_capabilities)),JSON.stringify([...new Set(c.membership_client_ids.map(value => value === c.client_id ? newClientId : value))]),now]);
        await client.query(`INSERT INTO authentication_credentials(id,tenant_id,actor_id,actor_type,issuer,
          subject_ref_hash,client_id,client_authentication_method,sender_constraint_method,sender_constraint_ref_hash,
          roles,allowed_capabilities,policy_version,status,version,expires_at,created_at,updated_at,schema_version,reference_hash_key_version)
          SELECT $2,tenant_id,actor_id,actor_type,issuer,subject_ref_hash,$3,client_authentication_method,
          sender_constraint_method,sender_constraint_ref_hash,roles,$4::jsonb,policy_version,'active',1,expires_at,$5,$5,schema_version,reference_hash_key_version
          FROM authentication_credentials WHERE tenant_id=$1 AND id=$6`, [tenantId,id,newClientId,JSON.stringify(capabilities),now,c.id]);
        for (const e of enrollments.rows) {
          await client.query(`INSERT INTO authentication_role_enrollments(id,tenant_id,actor_id,credential_id,
            role_bundle,capabilities,client_ids,policy_version,status,valid_from,expires_at,version,created_at,updated_at,schema_version)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'active',$9,$10,1,$9,$9,'authentication_role_enrollment.v1')`,
            [createOperationalId("role_enrollment"),tenantId,c.actor_id,id,e.role_bundle,
             JSON.stringify(localAccessCapabilities(e.capabilities)),JSON.stringify([newClientId]),e.policy_version,now,e.expires_at]);
        }
        await client.query(`UPDATE authentication_sessions SET status='revoked',revoked_at=$3,end_reason_code='local_access_generation_rotated'
          WHERE tenant_id=$1 AND credential_id=$2 AND status='active'`, [tenantId,c.id,now]);
        await client.query(`UPDATE authentication_role_enrollments SET status='revoked',version=version+1,updated_at=$3
          WHERE tenant_id=$1 AND credential_id=$2 AND status='active'`, [tenantId,c.id,now]);
        await client.query("UPDATE authentication_credentials SET status='revoked',updated_at=$3 WHERE tenant_id=$1 AND id=$2", [tenantId,c.id,now]);
        for (const [eventType, credentialId, payload] of [
          ["credential_revoked",c.id,{status:"revoked"}],
          ["credential_registered",id,{actorType:c.actor_type,clientAuthenticationMethod:c.client_authentication_method,
            senderConstraintMethod:c.sender_constraint_method,version:1,referenceHashKeyVersion:c.reference_hash_key_version}]
        ]) await client.query(`INSERT INTO authentication_events(id,tenant_id,event_type,actor_id,credential_id,reason_code,occurred_at,payload,schema_version)
          VALUES($1,$2,$3,'actor_local_authentication_system',$4,'web027k_local_access_rotation',$5,$6::jsonb,'authentication_event.v1')`,
          [createOperationalId("auth_event"),tenantId,eventType,credentialId,now,JSON.stringify(payload)]);
        manifest.push({ generation:LOCAL_ACCESS_GENERATION,actorId:c.actor_id,oldCredentialId:c.id,newCredentialId:id,
          oldClientId:c.client_id,newClientId,before:c.allowed_capabilities,after:capabilities,previousSessionsRevoked:true });
      }
    }
    await client.query("COMMIT");
    return manifest;
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
