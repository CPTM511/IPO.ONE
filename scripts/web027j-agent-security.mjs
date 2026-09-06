import { chromium, expect } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const out="output/playwright/web-027/j4";
await mkdir(out,{recursive:true});
const state="/Users/cptmao/Documents/IPO.ONE/.ipo-one/web027-runtime";
const stage="security";
const keyPath=state+"/web027j-"+stage+"-principal.json";
let wallet;try {wallet=JSON.parse(await readFile(keyPath));} catch(e) {if(e.code!=="ENOENT")throw e;wallet={privateKey:generatePrivateKey()};await writeFile(keyPath,JSON.stringify(wallet),{mode:0o600});}
const account=privateKeyToAccount(wallet.privateKey);
const browser=await chromium.launch({headless:true});
const actionEvidence=[],results=[];
const source=JSON.parse(await readFile("output/playwright/web-027/candidate-runtime.json")).source;
async function click(page, selector) {
  const control = page.locator(selector);
  await expect(control).toBeEnabled();
  const label = await control.innerText();
  await control.click();
  actionEvidence.push({ selector, label, at: new Date().toISOString() });
}
async function walletContext(account) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, reducedMotion: "reduce" });
  await context.exposeFunction("__web027QaSign", message => account.signMessage({ message: { raw: message } }));
  await context.addInitScript(({ address }) => {
    const provider = { async request({ method, params }) {
      if (["eth_requestAccounts", "eth_accounts"].includes(method)) return [address];
      if (method === "eth_chainId") return "0x14a34";
      if (["wallet_switchEthereumChain", "wallet_revokePermissions"].includes(method)) return null;
      if (method === "personal_sign") return window.__web027QaSign(params[0]);
      throw Object.assign(new Error("Test wallet rejects unsupported operations"), { code: 4200 });
    }, on() {}, removeListener() {} };
    window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
      info: { uuid: "02702702-7000-4000-8000-000000000001", name: "WEB027 isolated test wallet", rdns: "local.web027.test", icon: "data:image/png;base64,iVBORw0KGgo=" }, provider
    } })));
  }, { address: account.address });
  return context;
}
async function login(page, port, role) {
  await page.goto(`http://127.0.0.1:${port}/#${({controller:"agent-console",borrower:"request-credit",risk:"risk-operations",capitalPartner:"capital-partners"})[role]}`);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated", { timeout: 20_000 });
  await expect(page.locator("#accessLayer")).toBeHidden();
}

async function snapshot(page,name) {await page.screenshot({path:out+"/"+name+".png"});await writeFile(out+"/"+name+".txt",await page.locator("body").innerText());}
const enrollmentPath="/local/v1/reference-agent/enrollment/";
const enrollmentBody={schemaVersion:"local_principal_agent_runtime_request.v1"};
async function request(page,path,body) {
 return page.evaluate(async({path,body})=>{
  const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":document.querySelector('meta[name="ipo-one-csrf-token"]').content},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 },{path,body});
}
const contexts=[];
try {
 const owner=await walletContext(account);contexts.push(owner);const a=await owner.newPage();await login(a,8936,"controller");
 await a.getByRole("button",{name:"Agents",exact:true}).click();
 const createResponse=a.waitForResponse(r=>r.url().endsWith(enrollmentPath+"create"));await click(a,"#createLocalSandboxAgentBtn");
 const created=await (await createResponse).json();assert.equal(created.status,"active");
 const duplicated=await Promise.all([request(a,enrollmentPath+"create",enrollmentBody),request(a,enrollmentPath+"create",enrollmentBody)]);
 for(const r of duplicated){assert.equal(r.status,200);assert.equal(r.body.actorId,created.actorId);assert.equal(r.body.subjectId,created.subjectId);}
 await expect(a.locator("#createAccountChallengeBtn")).toBeVisible();
 const challengeResponse=a.waitForResponse(r=>r.request().postDataJSON()?.operationId==="pilotCreateAgentAccountChallenge");
 await click(a,"#createAccountChallengeBtn");const challenge=(await(await challengeResponse).json()).response;
 const stranger=await walletContext(privateKeyToAccount(generatePrivateKey()));contexts.push(stranger);const b=await stranger.newPage();await login(b,8936,"controller");
 await b.getByRole("button",{name:"Agents",exact:true}).click();await expect(b.locator("#createLocalSandboxAgentBtn")).toBeVisible();
 const ownStatus=await request(b,enrollmentPath+"status",enrollmentBody);assert.equal(ownStatus.body.status,"not_created");assert.equal(ownStatus.body.actorId,null);
 const crossRevoke=await request(b,enrollmentPath+"revoke",{...enrollmentBody,actorId:created.actorId});assert.ok(crossRevoke.status>=400);
 const crossProof=await request(b,"/local/v1/reference-agent/account-proof",{subjectId:created.subjectId,challenge});assert.ok(crossProof.status>=400);
 const readRequest={schemaVersion:"tenant_protocol_request.v1",operationId:"pilotReadAgentAccountBinding",resource:{resourceType:"subject",resourceId:created.subjectId},payload:{},requestId:"request-"+crypto.randomUUID(),correlationId:"correlation-"+crypto.randomUUID()};
 const crossRead=await request(b,"/tenant/v1/operations",readRequest);assert.ok(crossRead.status>=400);
 const current=await request(a,enrollmentPath+"status",enrollmentBody);assert.equal(current.body.status,"active");
 await click(a,"#proveAccountOnlineBtn");await expect(a.locator("#agentAccountActivationStatus")).toContainText("active",{ignoreCase:true});
 results.push({duplicateCreationSameActor:true,crossPrincipalStatusPrivate:true,crossPrincipalRevokeDenied:crossRevoke.body.code,crossPrincipalProofDenied:crossProof.body.code,crossPrincipalReadDenied:crossRead.body.code,ownerProofStillWorks:true});
 await click(a,"#revokeLocalSandboxAgentBtn");await expect(a.locator("#localSandboxAgentStatus")).toContainText("revoked");
 const restart=spawnSync("limactl",["shell","--workdir","/Users/cptmao/Documents/IPO.ONE","ipo-one-local","docker","restart","ipo-one-web027-candidate"],{encoding:"utf8"});assert.equal(restart.status,0);
 await expect.poll(async()=>{try{return(await fetch("http://127.0.0.1:8936/tenant/v1/healthz")).status}catch{return 0}},{timeout:30000}).toBe(200);
 await a.reload();await expect(a.locator("#sidebarApiStatus")).toHaveText("Authenticated");await expect(a.locator("#localSandboxAgentStatus")).toContainText("revoked");
 const recreate=await request(a,enrollmentPath+"create",enrollmentBody);assert.ok(recreate.status>=400);
 const revokedProof=await request(a,"/local/v1/reference-agent/account-proof",{subjectId:created.subjectId,challenge});assert.ok(revokedProof.status>=400);
 const after=await request(a,enrollmentPath+"status",enrollmentBody);assert.equal(after.body.status,"revoked");
 await a.getByRole("button",{name:"Sign out",exact:true}).click();await expect(a.getByRole("button",{name:"Log in",exact:true})).toBeVisible();await login(a,8936,"controller");
 await a.getByRole("button",{name:"Agents",exact:true}).click();await expect(a.locator("#localSandboxAgentStatus")).toContainText("revoked");
 results.push({revocationAfterProcessRestart:true,recreationDenied:recreate.body.code,revokedSigningDenied:revokedProof.body.code,logoutLoginRevocationRecovery:true});
 await snapshot(a,"security-revoked");
} finally {for(const context of contexts)await context.close();await writeFile(out+"/security.json",JSON.stringify({source,apiMocks:false,results,actionEvidence},null,2));await browser.close();}
