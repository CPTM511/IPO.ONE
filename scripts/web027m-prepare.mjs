// Prepare only the three reviewed local identities; this script does not activate a grant.
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LOCAL_SPECIAL_ROLE_SPECS } from "../apps/private-pilot/src/local-special-role-access.js";
import { ROLE_BUNDLE_CAPABILITIES } from "../modules/authorization/src/index.js";
import assert from "node:assert/strict";
const state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime";
await mkdir(state,{recursive:true,mode:0o700});
const bindings={}, entries=[];
for(const [name,spec] of Object.entries(LOCAL_SPECIAL_ROLE_SPECS)) {
  const path=`${state}/web027m-${name}-wallet.json`;
  let material;
  try { material=JSON.parse(await readFile(path,"utf8")); }
  catch(error){if(error.code!=="ENOENT")throw error;material={privateKey:generatePrivateKey()};await writeFile(path,JSON.stringify(material),{mode:0o600});}
  await chmod(path,0o600);
  const account=privateKeyToAccount(material.privateKey);
  for(const cap of spec.capabilities)assert.ok(ROLE_BUNDLE_CAPABILITIES[spec.roleBundle].includes(cap));
  bindings[name]=account.address.toLowerCase();
  entries.push({name,origin:`http://localhost:${spec.port}`,actorId:spec.actorId,actorType:spec.actorType,
    role:spec.roleBundle,credentialId:spec.durableCredentialId,clientId:`client_web027m_${spec.actorId}`,
    invitedSyntheticWallet:bindings[name],capabilities:spec.capabilities});
}
assert.equal(new Set(Object.values(bindings)).size,3);
// Public synthetic wallet bindings only. No signing key is mounted in the API.
await writeFile(state+"/web027m-invitation-bindings.json",JSON.stringify(bindings,null,2)+"\n",{mode:0o644});
await mkdir("docs/design/web-027",{recursive:true});
await writeFile("docs/design/web-027/m-activation-manifest.json",JSON.stringify({
  schemaVersion:"web027m_local_activation_manifest.v1",status:"prepared_not_activated",preparedAt:new Date().toISOString(),
  database:"ipo_one_web027_candidate",gate:"IPO_ONE_LOCAL_SPECIAL_ROLES=web027m_v1",entries,
  originalActorsChanged:false,realFunds:false,publicEnrollment:false,
  rollback:"Disable the three hosts and the local special-role gate; revoke these exact credentials, enrollments and sessions. Preserve all events, approvals and schedules. A restart must not reactivate revoked identities.",
  independentOperationsApprover:"not enrolled; approval.decide is not granted to the proposer"
},null,2)+"\n");
console.log(JSON.stringify({prepared:true,identities:entries.map(({name,origin,actorId,credentialId})=>({name,origin,actorId,credentialId})),activated:false}));
