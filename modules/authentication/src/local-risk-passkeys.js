import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  generateRegistrationOptions, generateAuthenticationOptions,
  verifyRegistrationResponse, verifyAuthenticationResponse
} from "@simplewebauthn/server";
import { authenticationError } from "./security-utils.js";
import { parseStrictJson } from "./strict-json.js";

export const LOCAL_PASSKEY_BINDINGS = Object.freeze({
  "http://localhost:8937": Object.freeze({ role: "risk_operator" }),
  "http://localhost:8947": Object.freeze({ role: "risk_operator" }),
  "http://localhost:8939": Object.freeze({ role: "operations_operator", actorId: "actor_web027m_operations" }),
  "http://localhost:8940": Object.freeze({ role: "auditor", actorId: "actor_web027m_auditor" }),
  "http://localhost:8941": Object.freeze({ role: "risk_operator", actorId: "actor_web027m_risk_reviewer" })
});
const ORIGINS = new Set(Object.keys(LOCAL_PASSKEY_BINDINGS));
const TRANSPORTS = new Set(["usb", "nfc", "ble", "internal", "hybrid"]);
const rejected = () => authenticationError("passkey_verification_rejected", "Passkey verification was not accepted. Start a new verification.");
export function closedPasskeyObject(value, keys, required = keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).some(k => !keys.includes(k)) || required.some(k => !(k in value))) throw rejected();
  return value;
}
function binary(value, maximum = 16384) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !/^[A-Za-z0-9_-]+$/.test(value) ||
      Buffer.from(value, "base64url").toString("base64url") !== value) throw rejected();
  return Buffer.from(value, "base64url");
}
function userHandle(session) {
  return createHash("sha256").update(JSON.stringify(["ipo.one.local-risk-passkey.v1", session.tenantId, session.actorId])).digest("base64url");
}
function checkResponse(response, purpose, challenge) {
  closedPasskeyObject(response, ["id", "rawId", "type", "response", "clientExtensionResults", "authenticatorAttachment"],
    ["id", "rawId", "type", "response", "clientExtensionResults"]);
  binary(response.id, 1400);
  if (response.id !== response.rawId || response.type !== "public-key" ||
      ![undefined, null, "platform", "cross-platform"].includes(response.authenticatorAttachment)) throw rejected();
  closedPasskeyObject(response.clientExtensionResults, ["credProps"], []);
  if (response.clientExtensionResults.credProps !== undefined) {
    closedPasskeyObject(response.clientExtensionResults.credProps, ["rk"]);
    if (typeof response.clientExtensionResults.credProps.rk !== "boolean") throw rejected();
  }
  const keys = purpose === "register"
    ? ["clientDataJSON", "attestationObject", "transports", "publicKeyAlgorithm", "publicKey", "authenticatorData"]
    : ["clientDataJSON", "authenticatorData", "signature", "userHandle"];
  closedPasskeyObject(response.response, keys, purpose === "register"
    ? ["clientDataJSON", "attestationObject"] : ["clientDataJSON", "authenticatorData", "signature"]);
  const data = parseStrictJson(binary(response.response.clientDataJSON, 8192).toString("utf8"));
  // WebAuthn CollectedClientData explicitly permits future keys. Parse without duplicate
  // keys, verify every security field and the original signed bytes; never grant authority from extensions.
  // https://www.w3.org/TR/webauthn-3/#dictdef-collectedclientdata
  if (data.type !== (purpose === "register" ? "webauthn.create" : "webauthn.get") ||
      data.challenge !== challenge.challenge || data.origin !== challenge.origin ||
      (data.crossOrigin !== undefined && data.crossOrigin !== false) || data.topOrigin !== undefined) throw rejected();
  if (purpose === "register") {
    binary(response.response.attestationObject);
    if (response.response.transports !== undefined && (!Array.isArray(response.response.transports) ||
        response.response.transports.length > 8 || response.response.transports.some(v => !TRANSPORTS.has(v)))) throw rejected();
  } else {
    binary(response.response.authenticatorData, 4096); binary(response.response.signature, 2048);
  }
}

export async function verifyLocalRiskCeremony({ response, challenge, key }) {
  if (!ORIGINS.has(challenge.origin) || challenge.rp_id !== "localhost") throw rejected();
  checkResponse(response, challenge.purpose, challenge);
  if (challenge.purpose === "register") {
    const check = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin, expectedRPID: challenge.rp_id, expectedType: "webauthn.create",
      requireUserPresence: true, requireUserVerification: true, supportedAlgorithmIDs: [-7] });
    if (!check.verified || !check.registrationInfo.userVerified || check.registrationInfo.fmt !== "none") throw rejected();
    return check.registrationInfo.credential;
  }
  if (challenge.purpose !== "verify" || !key || key.credential_key !== response.id ||
      (response.response.userHandle != null && response.response.userHandle !== key.user_handle)) throw rejected();
  const check = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.origin, expectedRPID: challenge.rp_id, expectedType: "webauthn.get", requireUserVerification: true,
    credential: { id: key.credential_key, publicKey: new Uint8Array(Buffer.from(key.public_key, "base64url")), counter: Number(key.counter), transports: key.transports } });
  if (!check.verified || !check.authenticationInfo.userVerified) throw rejected();
  return { counter: check.authenticationInfo.newCounter };
}

// Instantiated only by the exact reviewed loopback composition; no public enrollment.
export class LocalRiskPasskeys {
  constructor({ origin, role = "risk_operator", specialRoles = false }) {
    if (!ORIGINS.has(origin) || LOCAL_PASSKEY_BINDINGS[origin].role !== role || (LOCAL_PASSKEY_BINDINGS[origin].actorId && !specialRoles)) throw authenticationError("authentication_deployment_gate_closed", "Risk Passkey origin is not approved");
    this.binding = LOCAL_PASSKEY_BINDINGS[origin];
    this.origin = origin;
    this.rpID = "localhost";
  }
  async eligible(client, s, now) {
    if (s.actorType !== this.binding.role || s.roles.length !== 1 || s.roles[0] !== this.binding.role ||
        (this.binding.actorId && s.actorId !== this.binding.actorId)) throw rejected();
    const enrollment = await client.query(`SELECT e.id FROM authentication_role_enrollments e
      WHERE e.tenant_id=$1 AND e.actor_id=$2 AND e.credential_id=$3 AND e.role_bundle=$8
        AND e.status='active' AND e.valid_from <= $4 AND (e.expires_at IS NULL OR e.expires_at > $4)
        AND e.client_ids ? $5 AND e.policy_version=$6 AND e.capabilities=$7::jsonb FOR SHARE`,
    [s.tenantId, s.actorId, s.credentialId, now, s.clientId, s.policyVersion, JSON.stringify(s.capabilities), this.binding.role]);
    if (enrollment.rowCount !== 1) throw rejected();
    // Serialize all sessions for this actor, including concurrent first-key enrollment/revocation.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('local_risk_passkey'),hashtext($1))", [s.tenantId + ":" + s.actorId]);
  }
  async resolveStepUp(client, s, now) {
    if (s.actorType !== this.binding.role || s.roles.length !== 1 || s.roles[0] !== this.binding.role ||
        (this.binding.actorId && s.actorId !== this.binding.actorId)) return undefined;
    const result = await client.query(`SELECT e.verified_at, e.expires_at, e.passkey_id
      FROM authentication_passkey_evidence e JOIN authentication_passkeys p ON p.tenant_id=e.tenant_id AND p.id=e.passkey_id
      JOIN authentication_passkey_challenges c ON c.tenant_id=e.tenant_id AND c.id=e.challenge_id
      WHERE e.tenant_id=$1 AND e.session_ref_hash=$2 AND e.credential_version=$3
        AND p.credential_id=$4 AND p.credential_version=$3 AND p.actor_id=$5 AND p.revoked_at IS NULL
        AND p.rp_id=$6 AND c.origin=$7 AND c.rp_id=$6 AND c.session_ref_hash=$2 AND c.used_at IS NOT NULL
        AND e.verified_at <= $8 AND e.expires_at > $8
        -- A revoked proof must never revive an older proof in the same session.
        AND NOT EXISTS (
          SELECT 1 FROM authentication_passkey_evidence previous
          JOIN authentication_passkeys revoked ON revoked.tenant_id=previous.tenant_id AND revoked.id=previous.passkey_id
          WHERE previous.tenant_id=e.tenant_id AND previous.session_ref_hash=e.session_ref_hash
            AND revoked.revoked_at IS NOT NULL AND revoked.revoked_at >= e.verified_at
        )
      ORDER BY e.verified_at DESC LIMIT 1`,
    [s.tenantId, s.sessionRefHash, s.credentialVersion, s.credentialId, s.actorId, this.rpID, this.origin, now]);
    const row = result.rows[0];
    return row ? { verifiedAt: new Date(row.verified_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), passkeyId: row.passkey_id } : undefined;
  }
  async keys(client, s) {
    return (await client.query("SELECT * FROM authentication_passkeys WHERE tenant_id=$1 AND actor_id=$2 ORDER BY created_at,id FOR UPDATE", [s.tenantId, s.actorId])).rows;
  }
  activeKeys(keys, s) {
    return keys.filter(k => !k.revoked_at && k.credential_id === s.credentialId && Number(k.credential_version) === s.credentialVersion && k.rp_id === this.rpID);
  }
  async audit(client, s, event, reference, now) {
    await client.query(`INSERT INTO authentication_passkey_audit(tenant_id,id,session_ref_hash,event,reference_id,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6)`, [s.tenantId, "passkey_audit_" + randomUUID(), s.sessionRefHash, event, reference, now]);
  }
  async status(client, s, now) {
    await this.eligible(client, s, now);
    const keys = await this.keys(client, s), active = this.activeKeys(keys, s);
    const evidence = await this.resolveStepUp(client, s, now);
    return { schemaVersion: "local_risk_passkey_status.v1", verified: !!evidence,
      verifiedAt: evidence?.verifiedAt ?? null, expiresAt: evidence?.expiresAt ?? null,
      canRegister: keys.length === 0 || (!!evidence && active.length < 5),
      recoveryRequired: keys.length > 0 && active.length === 0,
      keys: active.map(k => ({ id: k.id, createdAt: new Date(k.created_at).toISOString() })) };
  }
  async begin(client, s, now, body) {
    closedPasskeyObject(body, ["purpose"]);
    if (!["register", "verify"].includes(body.purpose)) throw rejected();
    await this.eligible(client, s, now);
    const keys = await this.keys(client, s), active = this.activeKeys(keys, s);
    if (body.purpose === "register" && (active.length >= 5 || (keys.length && !(await this.resolveStepUp(client, s, now))))) throw rejected();
    if (body.purpose === "verify" && active.length === 0) throw rejected();
    const recent = await client.query(`SELECT count(*)::int AS count FROM authentication_passkey_challenges
      WHERE tenant_id=$1 AND session_ref_hash=$2 AND created_at > $3::timestamptz - interval '5 minutes'`, [s.tenantId, s.sessionRefHash, now]);
    if (recent.rows[0].count >= 20) throw authenticationError("passkey_rate_limited", "Wait five minutes before starting another verification.");
    await client.query(`UPDATE authentication_passkey_challenges SET used_at=GREATEST(created_at,$3)
      WHERE tenant_id=$1 AND session_ref_hash=$2 AND used_at IS NULL`, [s.tenantId, s.sessionRefHash, now]);
    const id = "passkey_challenge_" + randomUUID(), challenge = randomBytes(32).toString("base64url");
    const options = body.purpose === "register"
      ? await generateRegistrationOptions({ rpName: "IPO.ONE Local Verification", rpID: this.rpID,
        userName: `Invited local ${this.binding.role}`, userDisplayName: "IPO.ONE verification", userID: binary(userHandle(s)),
        challenge: binary(challenge), timeout: 120000, attestationType: "none", supportedAlgorithmIDs: [-7],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        excludeCredentials: keys.map(k => ({ id: k.credential_key })) })
      : await generateAuthenticationOptions({ rpID: this.rpID, challenge: binary(challenge), timeout: 120000, userVerification: "required",
        allowCredentials: active.map(k => ({ id: k.credential_key, transports: k.transports })) });
    await client.query(`INSERT INTO authentication_passkey_challenges(tenant_id,id,session_ref_hash,purpose,challenge,origin,rp_id,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [s.tenantId,id,s.sessionRefHash,body.purpose,challenge,this.origin,this.rpID,now,new Date(now.getTime()+120000)]);
    await this.audit(client,s,"challenge_created",id,now);
    return { schemaVersion: "local_risk_passkey_options.v1", challengeId: id, options };
  }
  async finish(client, s, now, body) {
    // Consume before parsing untrusted authenticator data, and commit rejection, too.
    closedPasskeyObject(body,["challengeId","response"],["challengeId"]);
    if (typeof body.challengeId !== "string" || !/^passkey_challenge_[0-9a-f-]{36}$/.test(body.challengeId)) throw rejected();
    await this.eligible(client,s,now);
    const result = await client.query(`UPDATE authentication_passkey_challenges SET used_at=GREATEST(created_at,$4)
      WHERE tenant_id=$1 AND id=$2 AND session_ref_hash=$3 AND used_at IS NULL RETURNING *`, [s.tenantId,body.challengeId,s.sessionRefHash,now]);
    const c = result.rows[0];
    if (!c) return { rejected: true };
    const fail = async event => { await this.audit(client,s,event,c.id,now); return { rejected: true }; };
    if (body.response === undefined) { await this.audit(client,s,"cancelled",c.id,now); return { cancelled: true }; }
    let verified, key;
    const keys = await this.keys(client,s), active = this.activeKeys(keys,s);
    try {
      if (c.origin !== this.origin || c.rp_id !== this.rpID || new Date(c.created_at) > now || new Date(c.expires_at) <= now) throw rejected();
      if (c.purpose === "register") {
        if (active.length >= 5 || (keys.length && !(await this.resolveStepUp(client,s,now)))) throw rejected();
        verified = await verifyLocalRiskCeremony({ response: body.response, challenge: c });
        if (keys.some(k => k.credential_key === verified.id)) throw rejected();
      } else {
        key = active.find(k => k.credential_key === body.response.id);
        verified = await verifyLocalRiskCeremony({ response: body.response, challenge: c, key });
      }
    } catch { return fail("ceremony_rejected"); }
    // SQL failures roll back rather than reporting a successful cryptographic ceremony.
    if (c.purpose === "register") {
      const id = "passkey_" + randomUUID();
      const inserted = await client.query(`INSERT INTO authentication_passkeys
        (tenant_id,id,actor_id,credential_id,credential_version,rp_id,credential_key,public_key,user_handle,counter,transports,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT (tenant_id,credential_key) DO NOTHING RETURNING id`,
      [s.tenantId,id,s.actorId,s.credentialId,s.credentialVersion,this.rpID,verified.id,Buffer.from(verified.publicKey).toString("base64url"),userHandle(s),verified.counter,
        JSON.stringify(body.response.response.transports ?? []),now]);
      if (!inserted.rowCount) return fail("ceremony_rejected");
      key = { id };
    } else {
      await client.query("UPDATE authentication_passkeys SET counter=$3 WHERE tenant_id=$1 AND id=$2",[s.tenantId,key.id,verified.counter]);
    }
    await client.query(`INSERT INTO authentication_passkey_evidence(tenant_id,challenge_id,session_ref_hash,passkey_id,credential_version,verified_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[s.tenantId,c.id,s.sessionRefHash,key.id,s.credentialVersion,now,new Date(now.getTime()+900000)]);
    await this.audit(client,s,c.purpose === "register" ? "registered" : "verified",key.id,now);
    return this.status(client,s,now);
  }
  async revoke(client,s,now,body) {
    closedPasskeyObject(body,["passkeyId","acknowledgement"]);
    if (body.acknowledgement !== "revoke_this_passkey" || typeof body.passkeyId !== "string") throw rejected();
    await this.eligible(client,s,now);
    if (!(await this.resolveStepUp(client,s,now))) throw rejected();
    const key = this.activeKeys(await this.keys(client,s),s).find(k => k.id === body.passkeyId);
    if (!key) throw rejected();
    await client.query("UPDATE authentication_passkeys SET revoked_at=GREATEST(created_at,$3) WHERE tenant_id=$1 AND id=$2",[s.tenantId,key.id,now]);
    await this.audit(client,s,"revoked",key.id,now);
    return this.status(client,s,now);
  }
}
