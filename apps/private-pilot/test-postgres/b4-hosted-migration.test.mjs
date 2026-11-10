import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createB4HostedTestDatabase} from '../../../scripts/test-support/b4-hosted-database.mjs';
import {rehearseB4HostedAtomicMigration} from '../../../scripts/b4-hosted-local-migration.mjs';
import {assertProductionMigrationSet} from '../src/production-runtime.js';
import {B4_LOCAL_ONLY_MIGRATIONS,VERCEL_MIGRATION_PROFILE} from '../../../scripts/vercel-migration-profile.mjs';

test('B4-H exact hosted schema: one locked atomic batch, failure rollback, frozen history and fail-closed admission',async()=>{
  const db=await createB4HostedTestDatabase();
  const role=`b4h_gateway_${db.name.slice(13,25)}`,auth=`b4h_auth_${db.name.slice(13,25)}`;
  try {
    assert.equal(await assertProductionMigrationSet(db.pool),'current');
    await assert.rejects(assertProductionMigrationSet(db.pool,{hostedFeesEnabled:true}),{code:'production_database_migration_mismatch'});
    await db.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; CREATE ROLE ${auth} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`);
    await db.pool.query(`GRANT INSERT ON obligations TO ${role}; GRANT INSERT ON authentication_sessions TO ${auth}`);
    await assert.rejects(rehearseB4HostedAtomicMigration({pool:db.pool,faultAfter:3}),/injected/);
    assert.equal((await db.pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,79);
    assert.equal((await db.pool.query("SELECT to_regclass('synthetic_fee_entries') AS table_name")).rows[0].table_name,null);
    assert.equal(await assertProductionMigrationSet(db.pool),'current');
    assert.equal((await rehearseB4HostedAtomicMigration({pool:db.pool})).length,7);
    assert.deepEqual(await rehearseB4HostedAtomicMigration({pool:db.pool}),[]);
    assert.equal(await assertProductionMigrationSet(db.pool,{hostedFeesEnabled:true}),'hosted_synthetic_schema');
    assert.equal(await assertProductionMigrationSet(db.pool),'hosted_synthetic_schema');
    const rows=(await db.pool.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(rows.length,86);
    assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),VERCEL_MIGRATION_PROFILE.setSha256);
    assert.equal(rows.some(r=>r.name==='0092_local_b4_source_review_origins'),false);
    for(const table of ['synthetic_fee_entries','synthetic_fee_statements','synthetic_fee_source_corrections']) {
      const p=(await db.pool.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT') AS allowed,has_table_privilege($1,$2,'UPDATE,DELETE') AS mutate",[role,table])).rows[0];
      assert.equal(p.allowed,true);assert.equal(p.mutate,false);
    }
    for(const table of ['authentication_passkey_evidence','authentication_passkey_audit']) {
      const p=(await db.pool.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT') AS allowed,has_table_privilege($1,$2,'UPDATE,DELETE') AS mutate",[auth,table])).rows[0];
      assert.equal(p.allowed,true);assert.equal(p.mutate,false);
    }
    for(const table of ['approval_proposals','approval_decisions','approval_executions']) {
      const p=(await db.pool.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT') AS allowed,has_table_privilege($1,$2,'UPDATE,DELETE') AS mutate",[role,table])).rows[0];
      assert.equal(p.allowed,true);assert.equal(p.mutate,false);
    }
    for(const column of ['status','version','executed_at','updated_at'])
      assert.equal((await db.pool.query("SELECT has_column_privilege($1,'approval_proposals',$2,'UPDATE') AS allowed",[role,column])).rows[0].allowed,true);
    for(const column of ['proposer_actor_id','command_hash','tenant_id'])
      assert.equal((await db.pool.query("SELECT has_column_privilege($1,'approval_proposals',$2,'UPDATE') AS allowed",[role,column])).rows[0].allowed,false);
    for(const name of B4_LOCAL_ONLY_MIGRATIONS)for(const direction of ['up','down']) {
      const file=`db/migrations/${name}.${direction}.sql`;
      assert.deepEqual(await readFile(file),execFileSync('git',['show',`03de04251f2ceae090bdf98c0b59bce503de6fa5:${file}`]));
    }
    await db.pool.query("UPDATE schema_migrations SET checksum='changed' WHERE name='0095_hosted_synthetic_fee_contracts'");
    await assert.rejects(assertProductionMigrationSet(db.pool),{code:'production_database_migration_mismatch'});
    await db.pool.query('UPDATE schema_migrations SET checksum=$1 WHERE name=$2',[rows.find(r=>r.name==='0095_hosted_synthetic_fee_contracts').checksum,'0095_hosted_synthetic_fee_contracts']);
    await db.pool.query("INSERT INTO schema_migrations(name,checksum) VALUES('unreviewed','bad')");
    await assert.rejects(assertProductionMigrationSet(db.pool),{code:'production_database_migration_mismatch'});
  } finally {
    await db.close();
    const pg=await import('pg');const cleanup=new pg.default.Pool({connectionString:process.env.DATABASE_URL,max:1});
    try {await cleanup.query(`DROP ROLE IF EXISTS ${role}; DROP ROLE IF EXISTS ${auth}`);}finally{await cleanup.end();}
  }
});
