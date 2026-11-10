import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,chmod,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';

async function databaseSnapshot(pool) {
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
 const result={};
 for(const table of tables) {
  assert.match(table,/^[a-z][a-z0-9_]+$/);
  const rows=(await pool.query(`SELECT to_jsonb(t)::text AS document FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
  result[table]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }
 return result;
}
function postgresEnvironment(connectionString) {
 const url=new URL(connectionString);
 return {...process.env,PGHOST:url.hostname,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)};
}

// The existing CI service is pinned PostgreSQL 17, whereas the Ubuntu runner
// ships a PostgreSQL 16 client. Reuse that same service's exact dump/restore
// binaries instead of installing another database/toolchain dependency.
function postgresTool(tool,args,{connectionString,input}={}) {
 const env=postgresEnvironment(connectionString),container=process.env.IPO_ONE_B4H_TEST_POSTGRES_CONTAINER;
 if(!container)return execFileSync(tool,args,{env,input,stdio:['pipe','pipe','pipe'],maxBuffer:64*1024*1024});
 assert.equal(process.env.CI,'true');assert.match(container,/^[a-f0-9]{12,64}$/);
 assert.equal(env.PGHOST,'127.0.0.1');assert.equal(env.PGPORT,'5432');
 return execFileSync('docker',['exec',...(input?['-i']:[]),...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'].flatMap(name=>['--env',name]),container,tool,...args],
  {env,input,stdio:['pipe','pipe','pipe'],maxBuffer:64*1024*1024});
}

export async function verifyB4HostedRestore(fixture,verifyRecovered) {
 await fixture.stop();
 const before=await databaseSnapshot(fixture.db.pool);
 const directory=await mkdtemp(join(tmpdir(),'ipo-one-b4h-private-restore-'));await chmod(directory,0o700);
 const archive=join(directory,'test-database.dump'),cloneName=`ipo_one_b4h_restore_${randomBytes(6).toString('hex')}_test`;
 const cloneUrl=new URL(fixture.db.connectionString);cloneUrl.pathname=`/${cloneName}`;
 let clonePool,created=false;
 try {
  await writeFile(archive,postgresTool('pg_dump',['--format=custom'],{connectionString:fixture.db.connectionString}),{mode:0o600});
  const archiveSha256=createHash('sha256').update(await readFile(archive)).digest('hex');
  await fixture.db.pool.query(`CREATE DATABASE ${cloneName}`);created=true;
  postgresTool('pg_restore',['--exit-on-error','--no-owner','--dbname',cloneName],{connectionString:cloneUrl.toString(),input:await readFile(archive)});
  clonePool=new pg.Pool({connectionString:cloneUrl.toString(),max:2});
  const restored=await databaseSnapshot(clonePool);
  assert.deepEqual(restored,before,'Every public table must preserve its exact rows across actual pg_dump/pg_restore');
  const gatewayUrl=new URL(fixture.input.gatewayPool.options.connectionString);gatewayUrl.pathname=`/${cloneName}`;
  const authenticationUrl=new URL(fixture.input.authenticationPool.options.connectionString);authenticationUrl.pathname=`/${cloneName}`;
  await fixture.start({gatewayPool:new pg.Pool({connectionString:gatewayUrl.toString(),max:4}),authenticationPool:new pg.Pool({connectionString:authenticationUrl.toString(),max:4}),syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:false});
  await verifyRecovered();
  const revoked=(await clonePool.query('SELECT count(*)::int AS count FROM authentication_passkeys WHERE revoked_at IS NOT NULL')).rows[0].count;
  assert.ok(revoked>0,'Restored security history includes actual native Passkey revocation');
  await mkdir('output',{recursive:true});
  await writeFile(`output/b4h-recovery-node${process.versions.node.split('.')[0]}.json`,JSON.stringify({schemaVersion:'b4_hosted_local_restore_evidence.v1',node:process.version,syntheticOnly:true,production:false,archiveSha256,archiveRetained:false,allTablesMatched:true,revokedPasskeys:revoked,tables:before},null,2)+'\n');
  console.log(`B4-H actual private pg_dump/pg_restore: ${Object.keys(before).length} tables match; restored OFF runtime, Agent authentication, financial receipts and revoked native proof history verified`);
 } finally {
  await fixture.stop();await clonePool?.end();
  if(created)await fixture.db.pool.query(`DROP DATABASE ${cloneName} WITH (FORCE)`);
  await rm(directory,{recursive:true,force:true});
 }
}
