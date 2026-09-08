import { createTenantSecurityContext, setTenantTransactionContext } from "../../../modules/persistence/src/index.js";
import { localSpecialRoleSpecs } from "./local-special-role-access.js";

// Verify an immutable recorded decision against the exact currently active
// invited session and native proof, using the existing authentication DB role.
export function createLocalApprovalProofVerifier({ pool, tenantId, systemActorId }) {
  return async (decision, now) => {
    const spec = Object.values(localSpecialRoleSpecs()).find(s => s.actorId === decision.approverActorId);
    if (!spec || decision.tenantId !== tenantId || spec.roleBundle !== decision.approverRoleBundle) return false;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client, createTenantSecurityContext({ tenantId, actorId:systemActorId,
        policyVersion:decision.policyVersion, source:"system_worker" }));
      const result = await client.query(`SELECT e.challenge_id FROM authentication_passkey_evidence e
        JOIN authentication_sessions s ON s.tenant_id=e.tenant_id AND s.session_ref_hash=e.session_ref_hash
        JOIN authentication_passkeys p ON p.tenant_id=e.tenant_id AND p.id=e.passkey_id
        JOIN authentication_passkey_challenges c ON c.tenant_id=e.tenant_id AND c.id=e.challenge_id
        WHERE e.tenant_id=$1 AND s.actor_id=$2 AND s.credential_id=$3 AND s.credential_version=$4
          AND s.client_id=$5 AND s.token_jti_ref_hash=$6 AND e.verified_at=$7 AND e.verified_at <= $8 AND e.expires_at > $8
          AND s.status='active' AND s.idle_expires_at > $8 AND s.absolute_expires_at > $8
          AND p.actor_id=$2 AND p.credential_id=$3 AND p.credential_version=$4 AND p.revoked_at IS NULL
          AND p.rp_id='localhost' AND c.rp_id='localhost' AND c.origin=$9
          AND c.used_at IS NOT NULL AND c.session_ref_hash=e.session_ref_hash
          AND NOT EXISTS (SELECT 1 FROM authentication_passkey_evidence old
            JOIN authentication_passkeys revoked ON revoked.tenant_id=old.tenant_id AND revoked.id=old.passkey_id
            WHERE old.tenant_id=e.tenant_id AND old.session_ref_hash=e.session_ref_hash
              AND revoked.revoked_at IS NOT NULL AND revoked.revoked_at >= e.verified_at)`,
      [tenantId,decision.approverActorId,decision.approverCredentialId,decision.approverCredentialVersion,
        decision.approverClientId,decision.tokenJtiHash,decision.authTime,now,`http://localhost:${spec.port}`]);
      await client.query("COMMIT");
      return result.rowCount === 1;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
}
