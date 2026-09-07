import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const build=JSON.parse(await readFile('output/playwright/web-027/candidate-build.json'));
const runtime=JSON.parse(await readFile('output/playwright/web-027/candidate-runtime.json'));
const worker=JSON.parse(await readFile('output/playwright/web-027/candidate-worker.json'));
const docker=(args,input)=>{const r=spawnSync('limactl',['shell','--workdir','/Users/cptmao/Documents/IPO.ONE','ipo-one-local','docker',...args],{input,encoding:'utf8',maxBuffer:2000000});assert.equal(r.status,0,r.stderr.slice(0,500));return r.stdout;};
assert.equal(build.source,runtime.source);assert.equal(worker.source,runtime.source);
const expected=await Promise.all(build.runtimeFiles.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')]));
const program='import {readFile} from "node:fs/promises";import {createHash} from "node:crypto";const rows='+JSON.stringify(expected)+';for(const [path,hash] of rows){const actual=createHash("sha256").update(await readFile("/app/"+path)).digest("hex");if(actual!==hash)throw Error("Image mismatch: "+path);}console.log(JSON.stringify({matched:rows.length}));';
const hashes=JSON.parse(docker(['exec','-i','ipo-one-web027-candidate','/nodejs/bin/node','--input-type=module','-'],program));
const health=[];for(const origin of ['http://127.0.0.1:8935','http://127.0.0.1:8936','http://localhost:8937','http://127.0.0.1:8938']){const response=await fetch(origin+'/tenant/v1/healthz');assert.equal(response.status,200);health.push({origin,status:response.status});}
const founder=['ipo-one-web026h-review','ipo-one-web026h-worker'].map(name=>{const c=JSON.parse(docker(['inspect',name]))[0];assert.ok(c.State.Running);assert.ok(c.Config.Image.includes('0211f75'));return{name,image:c.Config.Image,running:c.State.Running};});
const current=['ipo-one-web027-candidate','ipo-one-web027-candidate-worker'].map(name=>{const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Config.Labels['org.opencontainers.image.revision'],runtime.source);assert.equal(c.HostConfig.RestartPolicy.Name,'unless-stopped');assert.ok(c.State.Running);return{name,image:c.Config.Image,running:true,restart:'unless-stopped'};});
const result={source:runtime.source,verifiedAt:new Date().toISOString(),installedRuntimeFiles:hashes.matched,health,current,founder,dependency:build.dependencyChanges};
await writeFile('output/playwright/web-027/k2/runtime-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify({source:result.source,matched:hashes.matched,health,founder}));
