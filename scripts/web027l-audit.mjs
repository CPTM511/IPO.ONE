import { spawnSync } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const program=String.raw`
import {Pool} from 'pg';import assert from 'node:assert/strict';
const url=new URL(process.env.DATABASE_URL);assert.equal(url.pathname,'/ipo_one_web027_candidate');
const pool=new Pool({connectionString:url.href,max:1});const c=await pool.connect();
try{await c.query('BEGIN READ ONLY');const result={
 memberships:(await c.query("SELECT role_bundle,status,count(*)::int AS count FROM memberships GROUP BY role_bundle,status ORDER BY role_bundle,status")).rows,
 privilegedCapabilities:(await c.query("SELECT DISTINCT role_bundle,cap FROM memberships CROSS JOIN LATERAL jsonb_array_elements_text(capabilities) AS cap WHERE role_bundle NOT IN ('human_borrower','principal_controller','agent_runtime') AND status='active' ORDER BY role_bundle,cap")).rows,
 cases:(await c.query("SELECT status,count(*)::int AS count,bool_and(economic_mutation_authorized=false) AS no_economic_authority FROM pilot_cases GROUP BY status ORDER BY status")).rows,
 migrations:(await c.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,
};await c.query('ROLLBACK');console.log(JSON.stringify(result));}finally{c.release();await pool.end();}
`;
const result=spawnSync('limactl',['shell','--workdir','/Users/cptmao/Documents/IPO.ONE','ipo-one-local','docker','exec','-i','ipo-one-web027-candidate','/nodejs/bin/node','--input-type=module','-'],{input:program,encoding:'utf8',maxBuffer:2000000});
if(result.status!==0){console.error(result.stderr.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'));process.exit(1);}
const evidence=JSON.parse(result.stdout);evidence.source=JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json')).source;await writeFile('output/playwright/web-027/l-acceptance/role-audit.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
