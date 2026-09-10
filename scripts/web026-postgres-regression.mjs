import { spawnSync } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
const main='/Users/cptmao/Documents/IPO.ONE';
const state=main+'/.ipo-one/web026-runtime';
function docker(args){const r=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker',...args],{encoding:'utf8',maxBuffer:20_000_000});if(r.status!==0)throw Error('Isolated regression Docker operation failed');return r.stdout.trim();}
const saved=JSON.parse(await readFile(state+'/preflight-runtime.json','utf8'));
const value=saved.Config.Env.filter(x=>x.startsWith('DATABASE_URL=')).at(-1).slice(13);
const url=new URL(value); url.port='55435';url.pathname='/ipo_one_web026_test';
docker(['exec','ipo-one-web026-test-postgres-v2','createdb','-U','ipo_one_owner','ipo_one_web026_test']);
await writeFile(state+'/regression.env','DATABASE_URL='+url.href+'\n',{mode:0o600});
docker(['create','--name','ipo-one-web026-regression','--network','host','--env-file',state+'/regression.env','ipo-one-web026:9d2caac','scripts/run-postgres-tests.mjs']);
const source=JSON.parse(await readFile(main+'/output/playwright/web-026-runtime/source.json')).source;
docker(['cp',source+'/.','ipo-one-web026-regression:/app']);
const test=spawnSync('limactl',['shell','--workdir',main,'ipo-one-local','docker','start','-a','ipo-one-web026-regression'],{stdio:'inherit'});
process.exit(test.status??1);
