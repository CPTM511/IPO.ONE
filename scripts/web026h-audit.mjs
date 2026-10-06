import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createReferenceHasher } from '../modules/authentication/src/security-utils.js';
import { loadLocalAgentKeyMaterial } from '../apps/private-pilot/src/local-authentication-material.js';
import { createLocalAgentProof } from '../apps/private-pilot/src/local-durable-agent-authentication.js';
import { createLocalPilotIdentities } from '../apps/private-pilot/src/local-pilot-identities.js';
import { loadPrivatePilotProfile } from '../apps/private-pilot/src/private-pilot-profile.js';
const main='/Users/cptmao/Documents/IPO.ONE',state=main+'/.ipo-one/web026-runtime',out=main+'/output/playwright/web-026h-wallet';
const base=Number(process.argv[2]??8915),stage=process.argv[3]??'copy3';
const copy=base===8915,container=copy?'ipo-one-web026h-copy':'ipo-one-web026h-review',pg=copy?'ipo-one-web026-test-postgres-v2':'ipo-one-local-postgres-1';
const sha='0211f75120003a1000a81ea0e1e4f6c6230b446b';
function docker(args){const r=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker',...args],{encoding:'utf8',maxBuffer:8_000_000});assert.equal(r.status,0,'Local audit operation failed');return r.stdout.trim();}
const d=JSON.parse(docker(['inspect',container]))[0];assert.equal(d.State.Health.Status,'healthy');assert.equal(d.Config.Labels['org.opencontainers.image.revision'],sha);assert.ok(d.HostConfig.ReadonlyRootfs);assert.ok(d.HostConfig.CapDrop.includes('ALL'));assert.ok(d.Mounts.every(m=>!m.RW));assert.ok(!d.Mounts.some(m=>m.Destination==='/app'));assert.equal(d.Config.Healthcheck.Test[0],'CMD');
const served=Buffer.from(await(await fetch(`http://127.0.0.1:${base}/app.js`)).arrayBuffer());assert.ok(served.equals(await readFile('apps/web/src/app.js')));
const endpoints=[];for(let n=base;n<base+4;n++){const url=`http://127.0.0.1:${n}`;assert.equal((await fetch(url+'/tenant/v1/healthz')).status,200);const o=await(await fetch(url+'/auth/v1/options')).json();assert.equal(o.profile,'local_no_funds');endpoints.push({port:n,healthy:true});}
const mounts=JSON.parse(await readFile(state+'/mounts.json'));const key=await loadLocalAgentKeyMaterial(mounts.find(x=>x.target.endsWith('/agent-key.v1.json')).source);
const profile=await loadPrivatePilotProfile(),identities=createLocalPilotIdentities({profile});
const proof=await createLocalAgentProof({keyMaterial:key,tenantId:profile.tenantId,clientId:identities.identities.agent.clientId,policyVersion:identities.identities.agent.createContext().policyVersion,audience:`urn:ipo.one:local:tenant-http:${base+1}`});
const catalog=await fetch(`http://127.0.0.1:${base+1}/tenant/v1/catalog`,{headers:{authorization:'Bearer '+proof}});assert.equal(catalog.status,200);
const replay=await fetch(`http://127.0.0.1:${base+1}/tenant/v1/catalog`,{headers:{authorization:'Bearer '+proof}});assert.ok([400,401,403].includes(replay.status));
const wallet=privateKeyToAccount(JSON.parse(await readFile(state+'/web026h-'+stage+'-qa-wallet.json')).privateKey);
const hasher=createReferenceHasher((await readFile(state+'/local-wallet-reference-v2','utf8')).trim());
const rows=[];
for(const port of [base,base+1]){
 const hash=hasher.hash('subject',`https://127.0.0.1:${port}\0eip155:84532:${wallet.address.toLowerCase()}`);assert.match(hash,/^[A-Za-z0-9_-]{43}$/);
 const sql=`SELECT json_build_object('credentials',count(*),'actors',count(DISTINCT actor_id),'newIdentity',bool_and(actor_id LIKE 'actor_public_beta_%'),'active',bool_and(status='active'),'version',min(reference_hash_key_version),'roles',(SELECT json_agg(DISTINCT role_bundle) FROM authentication_role_enrollments WHERE credential_id IN (SELECT id FROM authentication_credentials WHERE subject_ref_hash='${hash}'))) FROM authentication_credentials WHERE subject_ref_hash='${hash}'`;
 const row=JSON.parse(docker(['exec',pg,'psql','-U','ipo_one_owner','-d','ipo_one_pilot008a_review_20260829a','-At','-c',sql]));assert.equal(row.credentials,1);assert.equal(row.actors,1);assert.equal(row.newIdentity,true);assert.equal(row.active,true);assert.equal(row.version,'v2');assert.deepEqual(row.roles.sort(),['human_borrower','principal_controller']);rows.push({port,...row});
}
const invalid=[];const fresh=privateKeyToAccount(generatePrivateKey()),wrong=privateKeyToAccount(generatePrivateKey());
for(const [port,wrongSigner]of[[base+1,true],[base+2,false],[base+3,false]]){
 const origin=`http://127.0.0.1:${port}`,headers={origin,'content-type':'application/json'};
 const ch=await fetch(origin+'/auth/v1/wallet/challenge',{method:'POST',headers,body:JSON.stringify({address:fresh.address,chainId:84532,workspaceRole:'human_borrower'})});assert.equal(ch.status,201);const c=await ch.json();
 const v=await fetch(origin+'/auth/v1/wallet/verify',{method:'POST',headers,body:JSON.stringify({transactionHandle:c.handle,signature:await(wrongSigner?wrong:fresh).signMessage({message:c.message})})});assert.ok([400,401,403].includes(v.status));assert.equal(v.headers.get('set-cookie'),null);invalid.push({port,status:v.status,case:wrongSigner?'invalid_signature':'management_self_enrollment_denied'});
}
let worker;
if(!copy){const w=JSON.parse(docker(['inspect','ipo-one-web026h-worker']))[0];assert.equal(w.State.Health.Status,'healthy');assert.equal(w.Config.Labels['org.opencontainers.image.revision'],sha);assert.equal(w.Image,d.Image);const heartbeat=JSON.parse(docker(['exec','ipo-one-web026h-worker','/nodejs/bin/node','-e',"process.stdout.write(require('node:fs').readFileSync('/tmp/ipo-one-local-worker-heartbeat.json','utf8'))"]));assert.equal(heartbeat.healthy,true);assert.equal(heartbeat.syntheticOnly,true);assert.equal(heartbeat.realFundsEnabled,false);worker={healthy:true,syntheticOnly:true,source:sha};}
const result={passed:true,source:sha,stage,worker,image:d.Image,healthy:true,readOnlyRoot:true,mutableSourceMount:false,servedAppSha256:createHash('sha256').update(served).digest('hex'),endpoints,newWalletIdentity:rows,existingAgentProofAccepted:true,replayedProofRejected:true,invalid};
await writeFile(out+'/'+stage+'-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
