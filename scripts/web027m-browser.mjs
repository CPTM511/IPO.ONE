// Visible-control acceptance against the installed local services. No response routing or API mocks.
import { chromium } from "@playwright/test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const out="output/playwright/web-027/m-acceptance", state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime";
await mkdir(out,{recursive:true});
const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source;
const accounts={};
for(const [port,name] of [[8939,"operations"],[8940,"auditor"],[8941,"riskReviewer"]]) accounts[port]=privateKeyToAccount(JSON.parse(await readFile(`${state}/web027m-${name}-wallet.json`)).privateKey);
accounts[8937]=privateKeyToAccount(JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json")).privateKey);
const principalKeyPath=`${state}/web027m-freeze-principal.json`;
let principal;try{principal=JSON.parse(await readFile(principalKeyPath));}catch(e){if(e.code!=="ENOENT")throw e;principal={privateKey:generatePrivateKey()};await writeFile(principalKeyPath,JSON.stringify(principal),{mode:0o600});}
accounts[8936]=privateKeyToAccount(principal.privateKey);
const browser=await chromium.launch({headless:true}), context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:"reduce"});
const results=[],actions=[],operations=[],errors=[],signatures=[],templates=new Map();
await context.exposeFunction("__web027mSign",async(port,raw)=>{assert.ok(accounts[port]);signatures.push({port,at:new Date().toISOString()});return accounts[port].signMessage({message:{raw}});});
await context.addInitScript(({addresses})=>{
 const provider={async request({method,params}){const address=addresses[location.port];
  if(["eth_accounts","eth_requestAccounts"].includes(method))return[address];if(method==="eth_chainId")return"0x14a34";
  if(["wallet_switchEthereumChain","wallet_revokePermissions"].includes(method))return null;
  if(method==="personal_sign")return window.__web027mSign(location.port,params[0]);
  throw Object.assign(new Error("Acceptance wallet rejects unsupported operations"),{code:4200});},on(){},removeListener(){}};
 window.addEventListener("eip6963:requestProvider",()=>window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:{info:{uuid:"02702702-7000-4000-8000-000000000013",name:"WEB027 role acceptance wallet",rdns:"local.web027m.test",icon:"data:image/png;base64,iVBORw0KGgo="},provider}})));
},{addresses:Object.fromEntries(Object.entries(accounts).map(([p,a])=>[p,a.address]))});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on("pageerror",e=>errors.push(e.message));
page.on("response",async r=>{if(r.url().endsWith("/tenant/v1/operations")){try{const request=r.request().postDataJSON(),body=await r.json();templates.set(request.operationId,request);operations.push({port:new URL(r.url()).port,operationId:request.operationId,status:r.status(),code:body.code,schemaVersion:body.response?.schemaVersion});}catch{}}});
const cdp=await context.newCDPSession(page);await cdp.send("WebAuthn.enable");
const {authenticatorId}=await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
const oldKeyPath=`${state}/web027k2-risk-authenticator.json`,newKeyPath=`${state}/web027m-review-authenticator.json`,oldIds=new Set();
for(const file of [oldKeyPath,newKeyPath]){try{for(const credential of JSON.parse(await readFile(file)).credentials){await cdp.send("WebAuthn.addCredential",{authenticatorId,credential});if(file===oldKeyPath)oldIds.add(credential.credentialId);}}catch(e){if(e.code!=="ENOENT")throw e;}}
async function save(){const {credentials}=await cdp.send("WebAuthn.getCredentials",{authenticatorId});for(const [file,rows] of [[oldKeyPath,credentials.filter(c=>oldIds.has(c.credentialId))],[newKeyPath,credentials.filter(c=>!oldIds.has(c.credentialId))]]){await writeFile(file,JSON.stringify({credentials:rows}),{mode:0o600});await chmod(file,0o600);}}
async function until(check,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error(`Timed out: ${label}`);}
async function textIs(id,value){await until(async()=>await page.locator(id).textContent()===value,`${id} = ${value}`);}
async function click(selector){const loc=typeof selector==="string"?page.locator(selector):selector;await loc.waitFor({state:"visible"});await until(()=>loc.isEnabled(),"enabled control");const label=await loc.innerText();await loc.click();actions.push({port:new URL(page.url()).port,label,at:new Date().toISOString()});}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});await writeFile(`${out}/${name}.txt`,await page.locator("body").innerText());}
async function go(port){await page.goto(`http://${port===8936?"127.0.0.1":"localhost"}:${port}/#${port===8936?"agent-console":"risk-operations"}`);}
async function loggedIn(){await textIs("#sidebarApiStatus","Authenticated");await page.locator("#accessLayer").waitFor({state:"hidden"});}
async function login(){await click(page.getByRole("button",{name:"Log in",exact:true}));await click(page.getByRole("button",{name:/WEB027 role acceptance wallet/}));const r=page.waitForResponse(r=>r.url().endsWith("/auth/v1/wallet/verify"));await click("#walletSignInBtn");const response=await r;if(response.status()!==200)throw Error(JSON.stringify(await response.json()));await loggedIn();}
async function status(){return page.evaluate(async()=>await(await fetch("/auth/v1/passkey/status")).json());}
async function mfa(){const s=await status();if(!s.verified){const response=page.waitForResponse(r=>r.url().endsWith("/auth/v1/passkey/finish"));await click(s.keys.length?"#verifyRiskPasskeyBtn":"#registerRiskPasskeyBtn");const r=await response;assert.equal(r.status(),200,JSON.stringify(await r.json()));await save();}await textIs("#riskPasskeyBadge","Recently verified");}
async function opClick(selector,operationId){const pending=page.waitForResponse(r=>r.url().endsWith("/tenant/v1/operations")&&r.request().postDataJSON()?.operationId===operationId);await click(selector);const r=await pending;const body=await r.json();assert.equal(r.status(),200,JSON.stringify(body));return body.response;}
async function negative(operationId,extra={}){const result=await page.evaluate(async({operationId,extra})=>{const requestId=`web027m_negative_${crypto.randomUUID()}`;const r=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-ipo-one-authentication-mode":"human_session","x-csrf-token":document.querySelector('meta[name="ipo-one-csrf-token"]').content,"x-request-id":requestId},body:JSON.stringify({schemaVersion:"tenant_protocol_request.v1",operationId,payload:{},requestId,correlationId:requestId,...extra})});return{status:r.status,body:await r.json()};},{operationId,extra});assert.ok([403,404].includes(result.status),JSON.stringify(result.body));assert.equal(result.body.code,"authorization_denied");results.push({name:"server denial",port:new URL(page.url()).port,operationId,status:result.status,code:result.body.code});}
try{
 for(const [port,name] of [[8939,"operations"],[8940,"auditor"],[8941,"risk-reviewer"]]){
  await go(port);await login();assert.equal((await status()).verified,false);await negative("pilotReadApprovalInbox");await mfa();
  const inbox=await opClick("#refreshLocalApprovalsBtn","pilotReadApprovalInbox");assert.deepEqual(inbox.proposals,[]);
  if(port!==8940){const queue=await opClick("#loadLocalServicingBtn","pilotReadServicingQueue");assert.deepEqual(queue.cases,[]);await until(async()=>/No legitimately matured/.test(await page.locator("#localReviewMessage").innerText()),"truthful empty queue");assert.equal(await page.locator("#proposeLocalServicingBtn").isEnabled(),false);}
  else{assert.equal(await page.locator("#loadLocalServicingBtn").isEnabled(),false);assert.equal(await page.locator("#localServicingForm").isVisible(),false);await opClick("#loadPilotCaseQueueBtn","pilotReadCaseQueue");}
  await negative("pilotReadRiskAgentDirectory",{resource:{resourceType:"risk_portfolio",resourceId:"portfolio_unauthorized_acceptance"}});
  await shot(name);await page.reload();await loggedIn();await textIs("#riskPasskeyBadge","Recently verified");results.push({name:`${name} signed wallet, native Passkey, authorized reads and refresh`,pass:true});
 }
 for(const port of [8939,8940,8941]){await go(port);await loggedIn();await textIs("#riskPasskeyBadge","Recently verified");}results.push({name:"three localhost role cookies coexist in one browser",pass:true});
 await go(8940);await loggedIn();await click(page.getByRole("button",{name:"Sign out",exact:true}));
 for(const port of [8939,8941]){await go(port);await loggedIn();await textIs("#riskPasskeyBadge","Recently verified");}
 await go(8940);await login();assert.equal((await status()).verified,false);await mfa();results.push({name:"Auditor logout isolates other roles and requires a new MFA assertion",pass:true});
 const restart=spawnSync("limactl",["shell","--workdir","/Users/cptmao/Documents/IPO.ONE","ipo-one-local","docker","restart","ipo-one-web027-candidate"],{encoding:"utf8"});assert.equal(restart.status,0);
 await until(async()=>{try{return(await fetch("http://localhost:8939/tenant/v1/healthz")).status===200}catch{return false}},"candidate restart",30000);
 for(const port of [8939,8940,8941]){await go(port);await loggedIn();await textIs("#riskPasskeyBadge","Recently verified");await opClick("#refreshLocalApprovalsBtn","pilotReadApprovalInbox");}results.push({name:"all special-role sessions and MFA survive process restart",pass:true});
 for(const width of [1440,390])for(const theme of ["dark","light"]){await page.setViewportSize({width,height:1000});await page.getByRole("combobox",{name:"Appearance",exact:true}).selectOption(theme);await page.locator("#localReviewPanel").scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/review-${width}-${theme}.png`});}await page.setViewportSize({width:1440,height:1050});
 await go(8936);await login();await click(page.getByRole("button",{name:"Agents",exact:true}));
 if(await page.locator("#createPrivateAgentSubjectBtn").isVisible()){await page.locator("#agentAuthorityDisplayName").fill("WEB027M protective acceptance Agent");const created=await opClick("#createPrivateAgentSubjectBtn","pilotCreateAgentSubject");await writeFile(`${out}/freeze-target.json`,JSON.stringify({subjectId:created.subjectId}));}
 await page.locator("#createAccountChallengeBtn").waitFor({state:"visible"});await shot("disposable-agent-created");
 await go(8937);await login();await mfa();
 const directory=await opClick("#loadLocalAgentsBtn","pilotReadRiskAgentDirectory");assert.ok(directory.agents.length);const target=JSON.parse(await readFile(`${out}/freeze-target.json`));const agent=directory.agents.find(a=>a.subjectId===target.subjectId);assert.ok(agent,"Exact disposable Agent is available");
 await click(page.locator(`[data-local-risk-agent="${agent.subjectId}"]`));assert.equal(await page.locator("#freezeRiskSubjectBtn").isEnabled(),false);
 await page.locator("#riskFreezeReason").selectOption("operator_request");assert.equal(await page.locator("#freezeRiskSubjectBtn").isEnabled(),false);await page.locator("#riskFreezeAcknowledge").check();
 const freeze=await opClick("#freezeRiskSubjectBtn","pilotFreezeSubject");await until(async()=>/Protective suspension verified/.test(await page.locator("#riskFreezeHelper").innerText()),"freeze receipt");await shot("agent-protective-freeze");
 const after=await opClick("#loadLocalAgentsBtn","pilotReadRiskAgentDirectory");assert.equal(after.agents.some(a=>a.subjectId===agent.subjectId),false);await page.reload();await loggedIn();const restored=await opClick("#loadLocalAgentsBtn","pilotReadRiskAgentDirectory");assert.equal(restored.agents.some(a=>a.subjectId===agent.subjectId),false);results.push({name:"visible authorized Agent selection and explicit protective freeze persists",pass:true,subjectId:agent.subjectId,response:freeze});
 await go(8936);await loggedIn();await click(page.getByRole("button",{name:"Agents",exact:true}));await shot("principal-after-freeze");
 results.push({name:"special-role servicing execution",status:"BLOCKED",reason:"No legitimately matured adverse position and no separately authorized Operations approver"});
 assert.deepEqual(errors,[]);
}catch(e){results.push({error:e.message,stack:e.stack?.split("\n").slice(0,5)});await shot("failure");process.exitCode=1;}
finally{await save();await writeFile(`${out}/browser.json`,JSON.stringify({source,apiMocks:false,virtualAuthenticator:true,physicalWalletOrFounderDeviceVerified:false,results,actions,operations,errors,signatures},null,2));await browser.close();console.log(JSON.stringify({source,results,actions:actions.length,operations:operations.length,errors}));}
