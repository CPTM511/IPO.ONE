// Read-only audit of the installed WEB-026 runtime. No mutation is available.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const main='/Users/cptmao/Documents/IPO.ONE';
function docker(args){const result=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker',...args],{encoding:'utf8',maxBuffer:4_000_000});if(result.status!==0)throw Error('Read-only Docker audit failed.');return result.stdout.trim();}
try {
 if((process.argv[2]??'audit')!=='audit')throw Error('Only read-only audit is supported. Use the separately reviewed WEB-026F runbook for changes.');
 const runtime=JSON.parse(docker(['inspect','ipo-one-web026-review']))[0];
 const effective=runtime.Config.Env.filter(x=>x.startsWith('DATABASE_URL=')).at(-1);
 const database=new URL(effective.slice('DATABASE_URL='.length)).pathname.slice(1);
 if(!/^[a-z0-9_]+$/.test(database))throw Error('Unexpected database name.');
 const applied=docker(['exec','ipo-one-local-postgres-1','psql','-U','ipo_one_owner','-d',database,'-At','-c','SELECT name FROM schema_migrations ORDER BY name']).split('\n');
 const report={schemaVersion:'web026_local_runtime_audit.v2',observedAt:new Date().toISOString(),runtime:{name:runtime.Name,startedAt:runtime.State.StartedAt,running:runtime.State.Running,health:runtime.State.Health?.Status,image:runtime.Image,source:runtime.Config.Labels['org.opencontainers.image.revision'],readOnlyRoot:runtime.HostConfig.ReadonlyRootfs,mutableSourceMount:runtime.Mounts.some(m=>m.Destination==='/app')},database,lastAppliedMigration:applied.at(-1),migrationCount:applied.length,serviceChanged:false,databaseChanged:false,verdict:'BLOCKED — NOT COMPLETE',remaining:['Founder actual-wallet acceptance','Capital Partner and Risk selected-role authentication; see WEB-026G']};
 const directory=main+'/output/playwright/web-026-runtime';await mkdir(directory,{recursive:true});await writeFile(directory+'/audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
