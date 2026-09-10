import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/playwright/web-027';
function docker(args){const r=spawnSync('limactl',['shell','--workdir','/Users/cptmao/Documents/IPO.ONE','ipo-one-local','docker',...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,'Local audit command failed; protected output withheld');return r.stdout;}
const queries={
 subjectStates:"SELECT subject_type, status, count(*)::int AS count FROM subjects GROUP BY subject_type,status",
 roleDenials:"SELECT operation_id, reason_code, count(*)::int AS count FROM authorization_audit_events WHERE actor_type='risk_operator' AND authorization_decision='deny' GROUP BY operation_id,reason_code",
 agentRuntimes:"SELECT r.status, c.status AS credential_status, count(*)::int AS count FROM local_principal_agent_runtimes r JOIN authentication_credentials c ON c.id=r.credential_id AND c.tenant_id=r.tenant_id GROUP BY r.status,c.status",
 legacyRotation:"SELECT status, count(*)::int AS count FROM authentication_credentials WHERE issuer IN ('https://127.0.0.1:8935','https://127.0.0.1:8936') AND client_id IN ('client_phase7_actor_human_borrower_pilot','client_phase7_actor_principal_controller_pilot') GROUP BY status",
 newRotation:"SELECT status, count(*)::int AS count FROM authentication_credentials WHERE client_id IN ('client_web027j_actor_human_borrower_pilot','client_web027j_actor_principal_controller_pilot') GROUP BY status"
};
const results={};
for(const [name,query] of Object.entries(queries)){
 const raw=docker(['exec','ipo-one-web026-test-postgres-v2','psql','-U','ipo_one_owner','-d','ipo_one_web027_candidate','-At','-v','ON_ERROR_STOP=1','-c',`BEGIN; SET LOCAL app.tenant_id='tenant_ipo_one_local_pilot'; SELECT coalesce(jsonb_agg(r),'[]'::jsonb) FROM (${query}) r; ROLLBACK;`]);
 results[name]=JSON.parse(raw.split('\n').find(s=>s.startsWith('[')));
}
const previous=docker(['logs','ipo-one-web027-candidate-5bc2185a05ed']);
const manifest=previous.split('\n').flatMap(line=>{try{const data=JSON.parse(line);return data.schemaVersion==='local_access_rotation_manifest.v1'?data.entries:[]}catch{return[]}});
assert.ok(manifest.length>0);
const added=new Set();for(const row of manifest){const delta=row.after.filter(cap=>!row.before.includes(cap));for(const cap of delta)added.add(cap);assert.equal(row.before.every(cap=>row.after.includes(cap)),true);}
await writeFile(out+'/credential-rotation-manifest.json',JSON.stringify({entries:manifest},null,2));
const build=JSON.parse(await readFile(out+'/candidate-build.json'));
const hashProgram="const fs=require('node:fs'),c=require('node:crypto');const paths=JSON.parse(process.argv[1]);console.log(JSON.stringify(Object.fromEntries(paths.map(p=>[p,c.createHash('sha256').update(fs.readFileSync('/app/'+p)).digest('hex')]))));";
const installedHashes=JSON.parse(docker(['exec','ipo-one-web027-candidate','/nodejs/bin/node','-e',hashProgram,JSON.stringify(build.runtimeFiles)]));
const {createHash}=await import('node:crypto');
for(const p of build.runtimeFiles)assert.equal(installedHashes[p],createHash('sha256').update(await readFile(p)).digest('hex'),p);
const health=[];for(const port of [8935,8936,8937,8938]){const r=await fetch('http://127.0.0.1:'+port+'/tenant/v1/healthz');assert.equal(r.status,200);health.push({port,status:r.status});}
const audit={installedSourceFilesMatch:true,installedRuntimeFileCount:build.runtimeFiles.length,health,source:JSON.parse(await readFile(out+'/candidate-runtime.json')).source,readOnly:true,results,rotation:{count:manifest.length,onlyAdded:[...added].sort(),existingCapabilitiesPreserved:true}};
await writeFile(out+'/local-access-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
