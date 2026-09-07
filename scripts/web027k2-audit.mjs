import { spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const program=String.raw`
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {LocalRiskPasskeys} from './modules/authentication/src/local-risk-passkeys.js';
const url=new URL(process.env.DATABASE_URL);assert.equal(url.pathname,'/ipo_one_web027_candidate');
const pool=new Pool({connectionString:url.href,max:1});const client=await pool.connect();const evidence={};
try{
 const selected=await client.query("SELECT s.* FROM authentication_sessions s JOIN authentication_passkey_evidence e ON e.tenant_id=s.tenant_id AND e.session_ref_hash=s.session_ref_hash WHERE s.status='active' AND s.roles='[\"risk_operator\"]'::jsonb ORDER BY e.verified_at DESC LIMIT 1");
 assert.equal(selected.rowCount,1);const row=selected.rows[0];
 const s={tenantId:row.tenant_id,actorId:row.actor_id,credentialId:row.credential_id,credentialVersion:Number(row.credential_version),sessionRefHash:row.session_ref_hash,roles:row.roles};
 const service=new LocalRiskPasskeys({origin:'http://localhost:8937'});
 await client.query('BEGIN READ ONLY');await client.query("SELECT set_config('app.tenant_id',$1,true)",[s.tenantId]);
 const now=new Date();const current=await service.resolveStepUp(client,s,now);assert.ok(current,'Latest active tested session must have current verified evidence');
 assert.equal(await service.resolveStepUp(client,s,new Date(new Date(current.expiresAt).getTime()+1)),undefined);
 for(const change of [{tenantId:'tenant_other'},{actorId:'actor_other'},{credentialId:'credential_other'},{credentialVersion:s.credentialVersion+1},{sessionRefHash:'unrelated_session'}])assert.equal(await service.resolveStepUp(client,{...s,...change},now),undefined);
 await client.query('ROLLBACK');evidence.durableResolver={current:true,expiredDenied:true,wrongTenantActorCredentialVersionSessionDenied:true,expiryMinutes:15};
 const keys=await client.query('SELECT * FROM authentication_passkeys ORDER BY created_at DESC');assert.ok(keys.rowCount>=2);const key=keys.rows.find(k=>!k.revoked_at);assert.ok(key);
 const before=keys.rowCount;const attempts=[];
 async function rollbackCheck(name,sql,values,expectedCode){
  await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true)",[key.tenant_id]);
  try{await client.query(sql,values);assert.equal(expectedCode,null,name);attempts.push({name,accepted:true,rolledBack:true});}
  catch(error){assert.equal(error.code,expectedCode,name+': '+error.message);attempts.push({name,rejected:true,code:error.code,rolledBack:true});}
  finally{await client.query('ROLLBACK');}
 }
 const insert='INSERT INTO authentication_passkeys(tenant_id,id,actor_id,credential_id,credential_version,rp_id,credential_key,public_key,user_handle,counter,transports,created_at) SELECT tenant_id,$2,actor_id,credential_id,credential_version,rp_id,$3,$4,user_handle,counter,transports,created_at FROM authentication_passkeys WHERE id=$1';
 for(const [name,length,pub,code] of [['valid 500-character credential',500,key.public_key,null],['oversized credential',1401,key.public_key,'23514'],['oversized public key',64,'A'.repeat(5463),'23514'],['invalid public key encoding',64,'!'.repeat(30),'23514']])await rollbackCheck(name,insert,[key.id,'passkey_'+randomUUID(),'A'.repeat(length),pub],code);
 await rollbackCheck('immutable public key','UPDATE authentication_passkeys SET public_key=public_key || $2 WHERE id=$1',[key.id,'A'],'23514');
 await rollbackCheck('immutable step-up evidence','UPDATE authentication_passkey_evidence SET expires_at=expires_at',[],'23514');
 await rollbackCheck('terminal challenge consumption','UPDATE authentication_passkey_challenges SET used_at=used_at WHERE used_at IS NOT NULL',[],'23514');
 await rollbackCheck('populated bounds rollback prohibited',await readFile('db/migrations/0081_local_passkey_bounds.down.sql','utf8'),[],'P0001');
 assert.equal((await client.query('SELECT count(*)::int AS n FROM authentication_passkeys')).rows[0].n,before);evidence.databaseGuards=attempts;
 const sessions=await client.query("SELECT count(*) FILTER (WHERE amr ? 'webauthn')::int AS rewritten_webauthn_sessions FROM authentication_sessions");assert.equal(sessions.rows[0].rewritten_webauthn_sessions,0);evidence.originalSiweSessionAmrUnchanged=true;
 const boundaries=await client.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('authentication_passkeys','authentication_passkey_evidence','authentication_passkey_challenges','authentication_passkey_audit') ORDER BY relname");assert.ok(boundaries.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));evidence.tenantRls=boundaries.rows;
 evidence.records={keys:before,activeKeys:keys.rows.filter(k=>!k.revoked_at).length,revokedKeys:keys.rows.filter(k=>k.revoked_at).length};
 evidence.migrations=(await client.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n;
 console.log(JSON.stringify(evidence));
}finally{client.release();await pool.end();}
`;
const result=spawnSync('limactl',['shell','--workdir','/Users/cptmao/Documents/IPO.ONE','ipo-one-local','docker','exec','-i','ipo-one-web027-candidate','/nodejs/bin/node','--input-type=module','-'],{input:program,encoding:'utf8',maxBuffer:2000000});
if(result.status!==0){console.error(result.stderr.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'));process.exit(1);}
const evidence=JSON.parse(result.stdout);evidence.source=JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json')).source;
await writeFile('output/playwright/web-027/k2/audit.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
