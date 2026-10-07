// Local-only wallet repair delivery; protected values never enter evidence.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, chmod, copyFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const main='/Users/cptmao/Documents/IPO.ONE';
const state=main+'/.ipo-one/web026-runtime';
const out=main+'/output/playwright/web-026h-wallet';
const sha='0211f75120003a1000a81ea0e1e4f6c6230b446b';
function run(bin,args,options={}) { const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:128*1024*1024,...options});if(r.status!==0)throw Error('Local operation failed: '+bin+' '+args[0]+' (protected output withheld)');return r.stdout?.trim(); }
const docker=(args,opts)=>run('limactl',['shell','--workdir',main,'ipo-one-local','docker',...args],opts);
const inspect=n=>JSON.parse(docker(['inspect',n]))[0];
const envMap=d=>Object.fromEntries(d.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
async function secret(name,value){const p=state+'/'+name;await writeFile(p,value,{mode:0o600});await chmod(p,0o600);return p;}
async function report(name,value){await writeFile(out+'/'+name+'.json',JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify(value));}
const revision=run('git',['rev-parse',sha]);
const image='ipo-one-web026h:'+revision.slice(0,7);
const source=state+'/source-'+revision;
await mkdir(out,{recursive:true});
async function build(){
 await mkdir(source,{recursive:true,mode:0o700});
 const archive=state+'/source-'+revision+'.tar';
 run('git',['archive','--format=tar','-o',archive,revision]);run('tar',['-xf',archive,'-C',source]);
 const changed=run('git',['diff','--name-only','d00f1ce',revision,'--','apps','modules','packages','contracts','migrations']).split('\n').filter(p=>!p.includes('/test/'));
 const runtime=changed.filter(p=>!p.includes('/test-postgres/'));
 assert.deepEqual(runtime.sort(),['apps/private-pilot/src/private-pilot-database.js','apps/private-pilot/src/private-pilot-runtime.js','apps/tenant-api/src/postgres-human-access-composition.js','apps/web/src/app.js','modules/authentication/src/postgres-human-authentication.js','modules/authentication/src/runtime-config.js'].sort());
 const patch=state+'/patch-'+revision;await mkdir(patch,{recursive:true,mode:0o700});
 for(const p of runtime){await mkdir(patch+'/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});await copyFile(source+'/'+p,patch+'/'+p);}
 const lines=['FROM ipo-one-web026:d00f1ce-runtime',`LABEL org.opencontainers.image.revision="${revision}"`,...runtime.map(p=>`COPY --chown=65532:65532 ${p} /app/${p}`)];
 await writeFile(patch+'/Dockerfile',lines.join('\n')+'\n');
 docker(['build','--pull=false','-t',image,patch]);
 await report('build',{source:revision,image,imageId:inspect(image).Id,baseImage:'ipo-one-web026:d00f1ce-runtime',runtimeFiles:runtime,dependencyChanges:false});
}
async function configAndCreate(name,base,testCopy=false,worker=false){
 const definition=inspect(worker?'ipo-one-web026-worker':'ipo-one-web026-review');const env=envMap(definition);
 env.IPO_ONE_M1_B_RELEASE_SHA=revision;
 let mounts=definition.Mounts.filter(m=>m.Destination.startsWith('/run/secrets/')).map(m=>({source:m.Source,target:m.Destination}));
 if(!worker){
  const v2=state+'/local-wallet-reference-v2';try{await readFile(v2);}catch(e){if(e.code!=='ENOENT')throw e;await secret('local-wallet-reference-v2',randomBytes(32).toString('base64url')+'\n');}
  env.IPO_ONE_LOCAL_WALLET_SELF_SERVICE='ordinary_verified_wallets';env.IPO_ONE_LOCAL_AUTH_REFERENCE_V2_FILE='/run/secrets/local-wallet-reference-v2';
  env.IPO_ONE_PILOT_PORT=String(base);mounts.push({source:v2,target:env.IPO_ONE_LOCAL_AUTH_REFERENCE_V2_FILE});
 }
 if(testCopy){const u=new URL(env.DATABASE_URL);u.port='55435';env.DATABASE_URL=u.href;
  // Preserve the pre-existing isolated invitation to exercise v1 compatibility.
  const invitation=mounts.find(m=>m.target.endsWith('/authentication-invitation.v1.json'));if(invitation)invitation.source=state+'/isolated-qa-invitation.json';
 }
 const envFile=await secret(name+'.env',Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n');
 const args=['create','--name',name,'--network','host','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges:true','--restart','unless-stopped','--env-file',envFile];
 for(const m of mounts)args.push('--mount',`type=bind,source=${m.source},target=${m.target},readonly`);
 args.push(image,worker?'apps/private-pilot/src/local-worker.js':'apps/private-pilot/src/start.js');docker(args);
}
async function regression(){
 const d=JSON.parse(await readFile(state+'/preflight-runtime.json'));const url=new URL(envMap(d).DATABASE_URL);url.port='55435';url.pathname='/ipo_one_web026h_final_test';
 docker(['exec','ipo-one-web026-test-postgres-v2','createdb','-U','ipo_one_owner','ipo_one_web026h_final_test']);
 const file=await secret('web026h-regression.env','DATABASE_URL='+url.href+'\n');
 docker(['create','--name','ipo-one-web026h-final-regression','--network','host','--env-file',file,image,'scripts/run-postgres-tests.mjs']);
 docker(['cp',source+'/.','ipo-one-web026h-final-regression:/app']);
 run('limactl',['shell','--workdir',main,'ipo-one-local','docker','start','-a','ipo-one-web026h-final-regression'],{stdio:'inherit'});
}
async function cutover(){
 const definition=inspect('ipo-one-web026-review');
 await secret('web026h-pre-cutover-runtime.json',JSON.stringify(definition));
 const db=new URL(envMap(definition).DATABASE_URL).pathname.slice(1);assert.equal(db,'ipo_one_pilot008a_review_20260829a');
 const dump=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker','exec','ipo-one-local-postgres-1','pg_dump','-U','ipo_one_owner','-d',db,'-Fc'],{maxBuffer:128*1024*1024});assert.equal(dump.status,0);
 await secret('web026h-pre-cutover.dump',dump.stdout);
 await configAndCreate('ipo-one-web026h-review',8895);await configAndCreate('ipo-one-web026h-worker',8895,false,true);
 docker(['stop','ipo-one-web026-review','ipo-one-web026-worker']);
 try{docker(['start','ipo-one-web026h-review','ipo-one-web026h-worker']);}
 catch(e){docker(['stop','ipo-one-web026h-review','ipo-one-web026h-worker']);docker(['start','ipo-one-web026-review','ipo-one-web026-worker']);throw e;}
 await report('cutover',{source:revision,image,backupSha256:createHash('sha256').update(dump.stdout).digest('hex'),database:db,ports:[8895,8896,8897,8898],previousContainersPreserved:true,localOnly:true});
}
const command=process.argv[2];
if(command==='build')await build();
else if(command==='copy'){await configAndCreate('ipo-one-web026h-copy',8915,true);docker(['start','ipo-one-web026h-copy']);console.log('Isolated wallet-registration candidate started.');}
else if(command==='regression')await regression();
else if(command==='cutover')await cutover();
else throw Error('Expected build, copy, regression or cutover');
