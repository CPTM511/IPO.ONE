import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalSpecialRoleDatabase, LOCAL_SPECIAL_ROLE_SPECS } from "../src/local-special-role-access.js";
import { createLocalPilotIdentities } from "../src/local-pilot-identities.js";
import { ROLE_BUNDLE_CAPABILITIES } from "../../../modules/authorization/src/index.js";
import { LocalRiskPasskeys } from "../../../modules/authentication/src/local-risk-passkeys.js";

test("special identities preserve every existing credential ceiling and require an explicit local gate", () => {
  const original=createLocalPilotIdentities({localAccessRepair:true});
  const candidate=createLocalPilotIdentities({localAccessRepair:true,localSpecialRoles:true});
  for(const [name,identity] of Object.entries(original.identities)) {
    assert.deepEqual(candidate.identities[name].capabilities,identity.capabilities);
    assert.equal(candidate.identities[name].clientId,identity.clientId);
  }
  assert.equal(original.identities.operations,undefined);
  assert.equal(new Set(Object.values(LOCAL_SPECIAL_ROLE_SPECS).map(s=>s.durableCredentialId)).size,3);
  for(const [name,spec] of Object.entries(LOCAL_SPECIAL_ROLE_SPECS)) {
    assert.deepEqual(candidate.identities[name].capabilities,spec.capabilities);
    for(const cap of spec.capabilities) assert.ok(ROLE_BUNDLE_CAPABILITIES[spec.roleBundle].includes(cap));
  }
  assert.ok(!candidate.identities.operations.capabilities.includes("approval.decide"));
  assert.deepEqual(candidate.identities.auditor.capabilities,["risk.read.tenant","pilot.case.read.tenant","approval.read"]);
});

test("special activation rejects every unrelated database, host and port", () => {
  const exact="postgresql://local@127.0.0.2:55435/ipo_one_web027_candidate";
  assert.doesNotThrow(()=>assertLocalSpecialRoleDatabase(exact,8935));
  for(const url of [exact.replace("candidate","proof"),exact.replace("127.0.0.2","127.0.0.1"),exact.replace("55435","5432"),exact.replace("candidate","production")]) {
    assert.throws(()=>assertLocalSpecialRoleDatabase(url,8935));
  }
  assert.throws(()=>assertLocalSpecialRoleDatabase(exact,8945));
});

test("native Passkeys bind the exact invited actor and role at each special origin", async () => {
  for(const spec of Object.values(LOCAL_SPECIAL_ROLE_SPECS)) {
    const origin=`http://localhost:${spec.port}`;
    assert.throws(()=>new LocalRiskPasskeys({origin,role:spec.roleBundle}));
    assert.throws(()=>new LocalRiskPasskeys({origin,role:"human_borrower",specialRoles:true}));
    const passkeys=new LocalRiskPasskeys({origin,role:spec.roleBundle,specialRoles:true});
    let calls=0;
    const client={async query(sql,values){calls++;if(sql.includes("authentication_role_enrollments"))assert.equal(values[7],spec.roleBundle);return {rowCount:1};}};
    const session={tenantId:"tenant_fixture",actorId:spec.actorId,actorType:spec.actorType,roles:[spec.roleBundle],credentialId:spec.durableCredentialId,
      clientId:`client_web027m_${spec.actorId}`,policyVersion:"security_001.v1",capabilities:spec.capabilities};
    for(const wrong of [{...session,actorId:"actor_other"},{...session,roles:["human_borrower"]},{...session,roles:[spec.roleBundle,"auditor"]}]) {
      await assert.rejects(passkeys.eligible(client,wrong,new Date()));assert.equal(calls,0);
      assert.equal(await passkeys.resolveStepUp(client,wrong,new Date()),undefined);
    }
    await passkeys.eligible(client,session,new Date());assert.equal(calls,2);
  }
});
