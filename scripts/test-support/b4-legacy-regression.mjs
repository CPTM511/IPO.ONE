import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readdir,writeFile,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {readMigrationSet} from '../migrate.mjs';
import {selectVercelMigrations,LEGACY_VERCEL_MIGRATION_PROFILE} from '../vercel-migration-profile.mjs';
import {dropB4DisposableDatabase} from './b4-hosted-database.mjs';

// Historical DOWN/upgrade coverage runs against its exact historical SQL set.
// New B4-H retention/atomicity is verified separately, never disabled for tests.
export async function createB4LegacyRegression({hosted79=false,gateway=false,changeCwd=true}={}) {
  const originalDirectory=process.cwd(),originalUrl=process.env.DATABASE_URL,url=new URL(originalUrl);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !/(^|[_-])test($|[_-])/.test(url.pathname.slice(1)))throw new Error('Legacy B4 regression requires a loopback test admin database');
  const name=gateway?'b4_fee_integration_test_20261109':`ipo_one_b4_legacy_${randomBytes(6).toString('hex')}_test`;
  const admin=new pg.Pool({connectionString:url.toString(),max:1});
  const all=await readMigrationSet();
  const migrations=hosted79?selectVercelMigrations(all,{profile:LEGACY_VERCEL_MIGRATION_PROFILE}):all.filter(item=>item.name<'0095_');
  if(!hosted79 && (migrations.length!==95 || createHash('sha256').update(JSON.stringify(migrations.map(({name,checksum})=>({name,checksum})))).digest('hex')!=='def7725c38c2bf21a7b7d34798b999c44dff5ab3a6444faefeedc5b2b6f4426a'))throw new Error('Historical B4 SQL set drifted');
  const directory=await mkdtemp(join(tmpdir(),'ipo-one-b4-legacy-'));
  await mkdir(join(directory,'db','migrations'),{recursive:true});
  for(const entry of await readdir(originalDirectory,{withFileTypes:true}))if(entry.name!=='db')await symlink(join(originalDirectory,entry.name),join(directory,entry.name));
  for(const entry of await readdir(join(originalDirectory,'db'),{withFileTypes:true}))if(entry.name!=='migrations')await symlink(join(originalDirectory,'db',entry.name),join(directory,'db',entry.name));
  for(const migration of migrations)for(const direction of ['up','down'])await writeFile(join(directory,'db','migrations',`${migration.name}.${direction}.sql`),migration[direction]);
  try {
    // Refuse existing names rather than reset anyone's retained test data.
    await admin.query(`CREATE DATABASE ${name}`);
  } catch(error){await admin.end();await rm(directory,{recursive:true,force:true});throw error;}
  const connection=new URL(url);connection.pathname=`/${name}`;
  process.env.DATABASE_URL=connection.toString();if(changeCwd)process.chdir(directory);
  return {directory,migrationDirectory:join(directory,'db','migrations'),connectionString:connection.toString(),
    async withSource(operation){const current=process.cwd();process.chdir(directory);try{return await operation();}finally{process.chdir(current);}},
    async close(){process.chdir(originalDirectory);process.env.DATABASE_URL=originalUrl;try{await dropB4DisposableDatabase(admin,name);}finally{await admin.end();await rm(directory,{recursive:true,force:true});}}
  };
}
