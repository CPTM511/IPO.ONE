import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {readMigrationSet,migrateUp} from '../migrate.mjs';
import {selectVercelMigrations,LEGACY_VERCEL_MIGRATION_PROFILE} from '../vercel-migration-profile.mjs';

export async function dropB4DisposableDatabase(admin,name) {
  if(!/^ipo_one_b4h_[a-z0-9_]+_test$/.test(name) && !/^ipo_one_b4_legacy_[a-f0-9]{12}_test$/.test(name) && name!=='b4_fee_integration_test_20261109')throw new Error('Unsupported disposable B4 test database');
  // pg.Pool.end() can resolve before the server observes each TCP close.
  // FORCE can kill a closing client and emit errors after assertions finish.
  const deadline=Date.now()+5000;
  while((await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].count>0) {
    if(Date.now()>deadline)throw new Error('B4-H test database still has unclosed connections');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  await admin.query(`DROP DATABASE ${name}`);
}

export async function createB4HostedTestDatabase({baseline=true}={}) {
  const url=new URL(process.env.DATABASE_URL??'');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !/(^|[_-])test($|[_-])/.test(url.pathname.slice(1)))throw new Error('B4-H requires a loopback test database admin connection');
  const name=`ipo_one_b4h_${randomBytes(6).toString('hex')}_test`;
  const admin=new pg.Pool({connectionString:url.toString(),max:1});
  const directory=await mkdtemp(join(tmpdir(),'ipo-one-b4h-migrations-'));
  const targetDirectory=join(directory,'hosted'),baselineDirectory=join(directory,'baseline');
  const {mkdir}=await import('node:fs/promises');
  await mkdir(targetDirectory);await mkdir(baselineDirectory);
  const all=await readMigrationSet();
  for(const [destination,migrations] of [[targetDirectory,selectVercelMigrations(all)],[baselineDirectory,selectVercelMigrations(all,{profile:LEGACY_VERCEL_MIGRATION_PROFILE})]])
    for(const migration of migrations)for(const direction of ['up','down'])await writeFile(join(destination,`${migration.name}.${direction}.sql`),migration[direction]);
  await admin.query(`CREATE DATABASE ${name}`);
  const connection=new URL(url);connection.pathname=`/${name}`;
  const pool=new pg.Pool({connectionString:connection.toString(),max:4});
  const close=async()=>{
    await pool.end();
    try {await dropB4DisposableDatabase(admin,name);}
    finally{await admin.end();await rm(directory,{recursive:true,force:true});}
  };
  try { if(baseline)await migrateUp({pool,directory:baselineDirectory}); }
  catch(error) { await close();throw error; }
  return {name,pool,connectionString:connection.toString(),targetDirectory,baselineDirectory,close};
}
