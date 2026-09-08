// Visible-control acceptance against the installed local services. No response routing or API mocks.
import { chromium } from "@playwright/test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const out="output/playwright/web-027/n-acceptance", state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime";
await mkdir(out,{recursive:true});
const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source;
const accounts={};
for(const [port,name] of [[8939,"operations"],[8940,"auditor"],[8941,"riskReviewer"]]) accounts[port]=privateKeyToAccount(JSON.parse(await readFile(`${state}/web027m-${name}-wallet.json`)).privateKey);
accounts[8942]=privateKeyToAccount(JSON.parse(await readFile(`${state}/web027n-operationsReviewer-wallet.json`)).privateKey);
const browser=await chromium.launch({headless:true}), context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:"reduce"});
const results=[],actions=[],operations=[],errors=[],signatures=[],ceremonies=[],credentialErrors=[],templates=new Map();
await context.exposeFunction("__web027mCredentialError", e=>credentialErrors.push(e));
await context.exposeFunction("__web027mSign",async(port,raw)=>{assert.ok(accounts[port]);signatures.push({port,at:new Date().toISOString()});return accounts[port].signMessage({message:{raw}});});
await context.addInitScript(({addresses})=>{
 for(const method of ["create","get"]){const original=navigator.credentials[method].bind(navigator.credentials);navigator.credentials[method]=async options=>{try{return await original(options);}catch(e){await window.__web027mCredentialError({port:location.port,method,name:e.name,message:e.message});throw e;}};}
 const provider={async request({method,params}){const address=addresses[location.port];
  if(["eth_accounts","eth_requestAccounts"].includes(method))return[address];if(method==="eth_chainId")return"0x14a34";
  if(["wallet_switchEthereumChain","wallet_revokePermissions"].includes(method))return null;
  if(method==="personal_sign")return window.__web027mSign(location.port,params[0]);
  throw Object.assign(new Error("Acceptance wallet rejects unsupported operations"),{code:4200});},on(){},removeListener(){}};
 window.addEventListener("eip6963:requestProvider",()=>window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:{info:{uuid:"02702702-7000-4000-8000-000000000013",name:"WEB027 role acceptance wallet",rdns:"local.web027m.test",icon:"data:image/png;base64,iVBORw0KGgo="},provider}})));
},{addresses:Object.fromEntries(Object.entries(accounts).map(([p,a])=>[p,a.address]))});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on("pageerror",e=>errors.push(e.message));
page.on("response",async r=>{if(r.url().includes("/auth/v1/passkey/")){const record={port:new URL(r.url()).port,path:new URL(r.url()).pathname,status:r.status()};if(record.path.endsWith("/begin")){const body=await r.json();record.purpose=r.request().postDataJSON()?.purpose;record.rp=body.options?.rp;record.excludeCount=body.options?.excludeCredentials?.length;record.userId=body.options?.user?.id;}ceremonies.push(record);}});
page.on("response",async r=>{if(r.url().endsWith("/tenant/v1/operations")){try{const request=r.request().postDataJSON(),body=await r.json();templates.set(request.operationId,request);operations.push({port:new URL(r.url()).port,operationId:request.operationId,status:r.status(),code:body.code,schemaVersion:body.response?.schemaVersion});}catch{}}});
const cdp=await context.newCDPSession(page);await cdp.send("WebAuthn.enable");
let {authenticatorId}=await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
const oldKeyPath=`${state}/web027n-review-authenticator.json`,newKeyPath=`${state}/web027m-review-authenticator.json`;
let activeGroup="m";
for(const file of [newKeyPath]){try{for(const credential of JSON.parse(await readFile(file)).credentials){await cdp.send("WebAuthn.addCredential",{authenticatorId,credential});}}catch(e){if(e.code!=="ENOENT")throw e;}}
async function save(){const credentials=await cdp.send("WebAuthn.getCredentials",{authenticatorId});const file=activeGroup==="m"?newKeyPath:oldKeyPath;await writeFile(file,JSON.stringify(credentials),{mode:0o600});await chmod(file,0o600);}
async function useAuthenticator(port){
 const group=port===8942?"n":"m";if(group===activeGroup)return;
 await save();await cdp.send("WebAuthn.removeVirtualAuthenticator",{authenticatorId});
 ({authenticatorId}=await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
 activeGroup=group;
 try{for(const credential of JSON.parse(await readFile(group==="m"?newKeyPath:oldKeyPath)).credentials)await cdp.send("WebAuthn.addCredential",{authenticatorId,credential});}catch(e){if(e.code!=="ENOENT")throw e;}
}
async function until(check,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error(`Timed out: ${label}`);}
async function textIs(id,value){await until(async()=>await page.locator(id).textContent()===value,`${id} = ${value}`);}
async function click(selector){const loc=typeof selector==="string"?page.locator(selector):selector;await loc.waitFor({state:"visible"});await until(()=>loc.isEnabled(),"enabled control");const label=await loc.innerText();await loc.click();actions.push({port:new URL(page.url()).port,label,at:new Date().toISOString()});}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});await writeFile(`${out}/${name}.txt`,await page.locator("body").innerText());}
async function go(port){await useAuthenticator(port);await page.goto(`http://${port===8936?"127.0.0.1":"localhost"}:${port}/#${port===8936?"agent-console":"risk-operations"}`);}
async function loggedIn(){await textIs("#sidebarApiStatus","Authenticated");await page.locator("#accessLayer").waitFor({state:"hidden"});}
async function login(){await click(page.getByRole("button",{name:"Log in",exact:true}));await click(page.getByRole("button",{name:/WEB027 role acceptance wallet/}));const r=page.waitForResponse(r=>r.url().endsWith("/auth/v1/wallet/verify"));await click("#walletSignInBtn");const response=await r;if(response.status()!==200)throw Error(JSON.stringify(await response.json()));await loggedIn();}
async function status(){return page.evaluate(async()=>await(await fetch("/auth/v1/passkey/status")).json());}
async function mfa(){await page.bringToFront();const s=await status();if(!s.verified){const response=page.waitForResponse(r=>r.url().endsWith("/auth/v1/passkey/finish"));await click(s.keys.length?"#verifyRiskPasskeyBtn":"#registerRiskPasskeyBtn");const r=await response;assert.equal(r.status(),200,JSON.stringify(await r.json()));await save();}await textIs("#riskPasskeyBadge","Recently verified");}
async function opClick(selector,operationId){const pending=page.waitForResponse(r=>r.url().endsWith("/tenant/v1/operations")&&r.request().postDataJSON()?.operationId===operationId);await click(selector);const r=await pending;const body=await r.json();assert.equal(r.status(),200,JSON.stringify(body));return body.response;}
async function negative(operationId,extra={}){const result=await page.evaluate(async({operationId,extra})=>{const requestId=`web027m_negative_${crypto.randomUUID()}`;const r=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-ipo-one-authentication-mode":"human_session","x-csrf-token":document.querySelector('meta[name="ipo-one-csrf-token"]').content,"x-request-id":requestId},body:JSON.stringify({schemaVersion:"tenant_protocol_request.v1",operationId,payload:{},requestId,correlationId:requestId,...extra})});return{status:r.status,body:await r.json()};},{operationId,extra});assert.ok([403,404].includes(result.status),JSON.stringify(result.body));assert.equal(result.body.code,"authorization_denied");results.push({name:"server denial",port:new URL(page.url()).port,operationId,status:result.status,code:result.body.code});}

const plans={restructure:"obligation_ad6fb93d-d18a-479a-8e58-f56a328be9a9",repurchase:"obligation_355d2cf4-4c17-41e5-adc1-e0ae5236a33a",writeoff:"obligation_c3746224-101c-4de6-a512-54cba5c7fc51"};
const receipts=[];
async function workspace(port){await go(port);await loggedIn();await mfa();}
async function review(port,id){
 await workspace(port);const inbox=await opClick("#refreshLocalApprovalsBtn","pilotReadApprovalInbox");
 const i=inbox.proposals.findIndex(p=>p.proposalId===id);assert.ok(i>=0);
 return opClick(page.locator("#localApprovalList button").nth(i),"pilotReadApproval");
}
async function propose(kind,obligationId,prior){
 await workspace(8939);
 if(prior){await review(8939,prior);await opClick("#selectCurrentServicingPlanBtn","pilotReadApproval");}
 else {const queue=await opClick("#loadLocalServicingBtn","pilotReadServicingQueue");const i=queue.cases.findIndex(p=>p.obligationId===obligationId);assert.ok(i>=0,JSON.stringify(queue));await page.locator("#localServicingPosition").selectOption(String(i));}
 await page.locator("#localServicingAction").selectOption(kind);
 if(kind==="pilotRestructureSandboxObligation")await page.locator("#localServicingTerm").fill("7");
 await page.locator("#localServicingAcknowledge").check();
 const proposal=await opClick("#proposeLocalServicingBtn","pilotProposeApproval");
 assert.equal(proposal.command.resource.resourceId,obligationId);assert.equal(proposal.proposal.status,"pending");
 receipts.push({stage:"proposed",response:proposal});return proposal;
}
async function approveAndExecute(proposed,expected){
 const id=proposed.proposal.approvalProposalId;
 for(const port of [8941,8942]){
  const current=await review(port,id);assert.equal(current.proposal.status,"pending");
  await page.locator("#localApprovalAcknowledge").check();
  assert.equal(await page.locator("#executeLocalProposalBtn").isEnabled(),false);
  const decision=await opClick("#approveLocalProposalBtn","pilotDecideApproval");receipts.push({stage:"decided",port,response:decision});
 }
 await review(8940,id);assert.equal(await page.locator("#approveLocalProposalBtn").isEnabled(),false);assert.equal(await page.locator("#executeLocalProposalBtn").isEnabled(),false);
 const approved=await review(8939,id);assert.equal(approved.proposal.status,"approved");assert.equal(approved.decisions.length,2);
 await page.locator("#localApprovalAcknowledge").check();
 const executed=await opClick("#executeLocalProposalBtn",proposed.command.operationId);receipts.push({stage:"executed",response:executed});
 await until(async()=>/recorded/.test(await page.locator("#localReviewMessage").innerText()),"execution recorded");
 const result=await review(8939,id);assert.equal(result.proposal.status,"executed");assert.equal(result.currentPlan.obligation.status,expected);
 assert.equal(result.currentPlan.obligation.totalRepaidMinor,0);assert.equal(result.currentPlan.obligation.productionFundsMoved,false);
 receipts.push({stage:"current",response:result});await shot(expected+"-"+id.slice(-8));
 return result;
}
let failure;
try{
 for(const port of [8939,8940,8941,8942]){await go(port);await login();await negative("pilotReadApprovalInbox");await mfa();await opClick("#refreshLocalApprovalsBtn","pilotReadApprovalInbox");}
 const cancel=await propose("pilotRestructureSandboxObligation",plans.restructure);
 await negative("pilotDecideApproval",{resource:{resourceType:"approval_proposal",resourceId:cancel.proposal.approvalProposalId},payload:{expectedVersion:cancel.proposal.version,decision:"approve"},reasonCode:"approval_confirmed",idempotencyKey:"self_"+crypto.randomUUID()});
 await page.locator("#localApprovalAcknowledge").check();
 const canceled=await opClick("#cancelLocalProposalBtn","pilotCancelApproval");assert.equal(canceled.proposal.status,"canceled");receipts.push({stage:"canceled",response:canceled});
 const a=await propose("pilotRestructureSandboxObligation",plans.restructure);await approveAndExecute(a,"restructured");
 const b=await propose("pilotRepurchaseSandboxObligation",plans.repurchase);await approveAndExecute(b,"repurchased");
 const c=await propose("pilotRestructureSandboxObligation",plans.writeoff);await approveAndExecute(c,"restructured");
 const d=await propose("pilotWriteOffSandboxObligation",plans.writeoff,c.proposal.approvalProposalId);await approveAndExecute(d,"written_off");
 const restart=spawnSync("limactl",["shell","--workdir","/Users/cptmao/Documents/IPO.ONE","ipo-one-local","docker","restart","ipo-one-web027-candidate","ipo-one-web027-candidate-worker"],{encoding:"utf8"});assert.equal(restart.status,0);
 await until(async()=>{try{return(await fetch("http://localhost:8942/livez")).ok;}catch{return false;}},"restart ready",30000);
 for(const [p,status]of[[a,"restructured"],[b,"repurchased"],[d,"written_off"]]){const current=await review(8939,p.proposal.approvalProposalId);assert.equal(current.currentPlan.obligation.status,status);}
 await click(page.getByRole("button",{name:"Sign out",exact:true}));await login();await mfa();await review(8939,d.proposal.approvalProposalId);
 results.push({name:"four exact servicing executions and durable recovery",pass:true});
 for(const port of [8940,8941,8942]){await workspace(port);await opClick("#refreshLocalApprovalsBtn","pilotReadApprovalInbox");}results.push({name:"separate sessions survive Operations re-login and process restart",pass:true});
}catch(e){failure={message:e.message,stack:e.stack};await shot("failure");}
finally{await save();await writeFile(`${out}/browser.json`,JSON.stringify({source,at:new Date().toISOString(),results,actions,operations,receipts,errors,ceremonies,credentialErrors,failure},null,2));await browser.close();}
console.log(JSON.stringify({source,results,operations:operations.length,visibleClicks:actions.length,failure}));if(failure)process.exit(1);
