import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { privateKeyToAccount } from 'viem/accounts';
import { loadLocalAgentKeyMaterial } from '../apps/private-pilot/src/local-authentication-material.js';
import { createLocalAgentProof } from '../apps/private-pilot/src/local-durable-agent-authentication.js';
import { createLocalPilotIdentities } from '../apps/private-pilot/src/local-pilot-identities.js';
import { loadPrivatePilotProfile } from '../apps/private-pilot/src/private-pilot-profile.js';
const main='/Users/cptmao/Documents/IPO.ONE';const state=main+'/.ipo-one/web026-runtime';const out=main+'/output/playwright/web-026-runtime';
const mounts=JSON.parse(await readFile(state+'/mounts.json'));
const profile=await loadPrivatePilotProfile();const identities=createLocalPilotIdentities({profile});
const key=await loadLocalAgentKeyMaterial(mounts.find(x=>x.target.endsWith('/agent-key.v1.json')).source);
const proof=await createLocalAgentProof({keyMaterial:key,tenantId:profile.tenantId,clientId:identities.identities.agent.clientId,policyVersion:identities.identities.agent.createContext().policyVersion,audience:'urn:ipo.one:local:tenant-http:8916'});
const catalog=await fetch('http://127.0.0.1:8916/tenant/v1/catalog',{headers:{authorization:'Bearer '+proof}});assert.equal(catalog.status,200);
const unauth=await fetch('http://127.0.0.1:8916/tenant/v1/catalog');assert.ok([400,401,403].includes(unauth.status));
const replay=await fetch('http://127.0.0.1:8916/tenant/v1/catalog',{headers:{authorization:'Bearer '+proof}});assert.ok([400,401,403].includes(replay.status));
const sql=`SELECT json_build_object('migrationCount',(SELECT count(*) FROM schema_migrations),'forcedRlsTables',(SELECT count(*) FROM pg_class WHERE relname IN ('pilot_cases','metered_usage_evidence','metered_usage_admissions') AND relrowsecurity AND relforcerowsecurity),'appRoleSafe',(SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname='ipo_one_private_pilot_app'),'authenticationRoleSafe',(SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname='ipo_one_private_pilot_auth'),'appCasesSelect',has_table_privilege('ipo_one_private_pilot_app','pilot_cases','SELECT'),'authCasesSelect',has_table_privilege('ipo_one_private_pilot_auth','pilot_cases','SELECT'))`;
const r=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker','exec','ipo-one-web026-test-postgres-v2','psql','-U','ipo_one_owner','-d','ipo_one_pilot008a_review_20260829a','-At','-c',sql],{encoding:'utf8'});assert.equal(r.status,0);const database=JSON.parse(r.stdout);assert.equal(database.migrationCount,73);assert.equal(database.forcedRlsTables,3);assert.equal(database.appRoleSafe,true);assert.equal(database.authenticationRoleSafe,true);assert.equal(database.authCasesSelect,false);
const {privateKey}=JSON.parse(await readFile(state+'/isolated-qa-wallet.json'));const account=privateKeyToAccount(privateKey);const privileged=[];
for(const port of [8917,8918]){
 const origin=`http://127.0.0.1:${port}`;
 const challenge=await fetch(origin+'/auth/v1/wallet/challenge',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({address:account.address,chainId:84532,workspaceRole:'human_borrower'})});
 assert.equal(challenge.status,201);const c=await challenge.json();
 const response=await fetch(origin+'/auth/v1/wallet/verify',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({transactionHandle:c.handle,signature:await account.signMessage({message:c.message})})});const body=await response.json();
 privileged.push({port,status:response.status,error:body.error?.code??body.error??body.code??'unknown'});
}
const result={database,agentVersionedCatalog:catalog.status,unauthenticatedRejected:unauth.status,proofReplayRejected:replay.status,privilegedLocalWalletLogin:privileged};console.log(JSON.stringify(result));await writeFile(out+'/copy-runtime-audit.json',JSON.stringify(result,null,2)+'\n');
