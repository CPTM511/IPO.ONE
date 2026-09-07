import {spawnSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import assert from "node:assert/strict";
const program=String.raw`
import {Pool} from "pg";import assert from "node:assert/strict";
import {LOCAL_SPECIAL_ROLE_SPECS} from "./apps/private-pilot/src/local-special-role-access.js";
const url=new URL(process.env.DATABASE_URL);assert.equal(url.pathname,"/ipo_one_web027_candidate");
const pool=new Pool({connectionString:url.href,max:1});const c=await pool.connect();
try{await c.query("BEGIN READ ONLY");const roles=[];
for(const [name,spec] of Object.entries(LOCAL_SPECIAL_ROLE_SPECS)){
 const memberships=(await c.query("SELECT actor_id,role_bundle,status,capabilities,client_ids FROM memberships WHERE actor_id=$1",[spec.actorId])).rows;
 assert.equal(memberships.length,1);const m=memberships[0];assert.equal(m.status,"active");assert.equal(m.role_bundle,spec.roleBundle);assert.deepEqual([...m.capabilities].sort(),[...spec.capabilities].sort());assert.deepEqual(m.client_ids,["client_web027m_"+spec.actorId]);
 const keys=(await c.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE revoked_at IS NULL)::int AS active FROM authentication_passkeys WHERE actor_id=$1 AND credential_id=$2",[spec.actorId,spec.durableCredentialId])).rows[0];assert.equal(keys.active,1);
 const enrollment=(await c.query("SELECT role_bundle,status FROM authentication_role_enrollments WHERE actor_id=$1",[spec.actorId])).rows;assert.equal(enrollment.length,1);assert.equal(enrollment[0].role_bundle,spec.roleBundle);assert.equal(enrollment[0].status,"active");
 roles.push({name,actorId:spec.actorId,credentialId:spec.durableCredentialId,role:m.role_bundle,status:m.status,capabilities:m.capabilities,nativePasskeys:keys.active});
}
const migrations=(await c.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count;assert.equal(migrations,82);
const proposals=(await c.query("SELECT count(*)::int AS count FROM approval_proposals WHERE command_actor_id='actor_web027m_operations'")).rows[0].count;
await c.query("ROLLBACK");console.log(JSON.stringify({database:url.pathname.slice(1),roles,migrations,localServicingProposals:proposals,readOnly:true}));
}finally{c.release();await pool.end();}`;
const result=spawnSync("limactl",["shell","--workdir","/Users/cptmao/Documents/IPO.ONE","ipo-one-local","docker","exec","-i","ipo-one-web027-candidate","/nodejs/bin/node","--input-type=module","-"],{input:program,encoding:"utf8",maxBuffer:2000000});
if(result.status!==0){console.error(result.stderr.replace(/postgres(?:ql)?:\/\/[^\s]+/g,"[redacted]"));process.exit(1);}
const evidence=JSON.parse(result.stdout);evidence.source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source;evidence.verifiedAt=new Date().toISOString();
await writeFile("output/playwright/web-027/m-acceptance/role-audit.json",JSON.stringify(evidence,null,2));console.log(JSON.stringify({source:evidence.source,roles:evidence.roles.map(x=>({name:x.name,exactGrants:true,nativePasskeys:x.nativePasskeys})),migrations:evidence.migrations,localServicingProposals:evidence.localServicingProposals}));
