import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { verifyTypedData } from "viem";
import {
  ActorType,
  ClientAuthenticationMethod,
  HumanSessionBff,
  HumanWalletBff,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  InMemoryHumanSessionStore,
  InMemoryWalletLoginTransactionStore,
  SenderConstraintMethod,
  createReferenceHasher
} from "../../modules/authentication/src/index.js";
import {
  HUMAN_ACCESS_ROUTES,
  createHumanAccessRouteHandler,
  readHumanAccessCookie
} from "../../apps/tenant-api/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmAccountProofAdapter,
  EvmWalletSignatureVerifier,
  normalizeEvmCaip10
} from "../../modules/chain-adapter/src/index.js";
import { parseStrictJson } from "../../modules/authentication/src/strict-json.js";
import { hashId } from "../../packages/domain/src/index.js";
import {
  createMinimalErc1271DeploymentHandoff
} from "./erc1271-deployment-handoff.mjs";
import {
  readMinimalErc1271DeploymentDecision
} from "./prepare-erc1271-deployment.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4188;
const ISSUER = "https://ipo.one";
const TENANT_ID = "tenant_wallet_003_live_acceptance";
const CLIENT_ID = "ipo_one_wallet_003_live_acceptance";
const ACTOR_ID = "actor_wallet_003_live_acceptance";
const SYSTEM_ACTOR_ID = "actor_wallet_003_acceptance_admin";
const MAXIMUM_BODY_BYTES = 12 * 1_024;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ECDSA_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const EIP712_DOMAIN_TYPE = Object.freeze([
  Object.freeze({ name: "name", type: "string" }),
  Object.freeze({ name: "version", type: "string" }),
  Object.freeze({ name: "chainId", type: "uint256" })
]);

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IPO.ONE WALLET-003 Human Signer Handoff</title>
  <link rel="stylesheet" href="/handoff.css">
</head>
<body>
  <main>
    <p class="eyebrow">WALLET-003 · Base Sepolia · no production funds</p>
    <h1>Human wallet acceptance handoff</h1>
    <p>This page never receives a private key. Every signature and the one approved deployment require your wallet confirmation.</p>
    <section>
      <h2>1. Wallet</h2>
      <div id="providers"></div>
      <button id="connect" disabled>Connect selected wallet</button>
      <pre id="walletState">Choose the approved wallet provider. A successful EIP-191 verification reloads this page and requires an explicit provider selection again.</pre>
    </section>
    <section>
      <h2>2. Base Sepolia gas</h2>
      <button id="inspect">Refresh read-only inspection</button>
      <a href="https://thirdweb.com/base-sepolia-testnet" target="_blank" rel="noreferrer">Open approved Base Sepolia faucet</a>
      <pre id="inspection"></pre>
      <pre id="balanceGate">Checking the approved faucet-balance cap…</pre>
    </section>
    <section>
      <h2>3. Real EOA EIP-191 session</h2>
      <button id="eoaSign" disabled>Sign EOA challenge</button>
      <button id="protectedRead">Protected read</button>
      <button id="logout">Idempotent logout ×2</button>
    </section>
    <section>
      <h2>4. One approved ERC-1271 deployment</h2>
      <button id="deploy" disabled>Request wallet deployment confirmation</button>
      <label>Deployment transaction hash <input id="transactionHash" autocomplete="off"></label>
      <button id="observe">Verify transaction at safe block</button>
      <pre id="deployment"></pre>
    </section>
    <section>
      <h2>5. ERC-1271 proofs</h2>
      <button id="contractSign" disabled>Sign contract-wallet EIP-191 challenge</button>
      <button id="agentSign" disabled>Sign Agent EIP-712 challenge</button>
    </section>
    <section>
      <h2>Evidence</h2>
      <pre id="output"></pre>
    </section>
  </main>
  <script src="/handoff.js" type="module"></script>
</body>
</html>`;

const STYLE = `:root{color-scheme:dark;font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#07100d;color:#dff7e9}body{margin:0}main{max-width:960px;margin:auto;padding:40px 20px 80px}h1{font:700 clamp(32px,6vw,64px)/1.05 system-ui;margin:.2em 0}.eyebrow{color:#66e0a3;text-transform:uppercase;letter-spacing:.12em}section{border:1px solid #244b3a;background:#0b1913;padding:18px;margin:16px 0;border-radius:12px}button,a{display:inline-block;margin:5px 8px 5px 0;padding:9px 12px;border-radius:8px;border:1px solid #3d7358;background:#123122;color:#dcfcec;text-decoration:none}button:disabled{opacity:.45}label{display:block;margin:10px 0}input{width:min(100%,680px);padding:8px;background:#06100c;color:#fff;border:1px solid #3d7358}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#06100c;padding:12px;border-radius:8px;min-height:24px}.provider{display:block;width:100%;text-align:left}.provider.selected{outline:2px solid #66e0a3}`;

const SCRIPT = `const $=id=>document.getElementById(id);
const providers=new Map();
let selected;
let account;
let connectedChain;
let serverState={};
const output=(label,value)=>{$("output").textContent=label+"\\n"+JSON.stringify(value,null,2)};
async function api(path,options={}){const response=await fetch(path,{credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json",...(options.headers||{})},...options});const text=await response.text();let body;try{body=text?JSON.parse(text):undefined}catch{}if(!response.ok)throw new Error(body?.detail||body?.error||("HTTP "+response.status));return body}
function renderDeploymentGate(){const inspection=serverState.inspection;const allowed=inspection?.balanceWithinCap===true;$("deploy").disabled=!(account&&allowed);$("balanceGate").textContent=!inspection?"Balance inspection unavailable. Deployment remains disabled.":allowed?"Balance gate passed: "+inspection.balanceWei+" wei <= "+inspection.maximumBalanceWei+" wei.":"BLOCKED: approved faucet-balance cap exceeded ("+inspection.balanceWei+" wei > "+inspection.maximumBalanceWei+" wei). Deployment remains disabled."}
function renderProviders(){const root=$("providers");root.replaceChildren();for(const [id,item] of providers){const button=document.createElement("button");button.className="provider"+(selected===id?" selected":"");button.textContent=item.name+" · "+id;button.addEventListener("click",()=>{selected=id;renderProviders();$("connect").disabled=false});root.append(button)}if(providers.size===0)root.textContent="No provider announced yet."}
function addProvider(id,name,provider){if(!providers.has(id)&&provider&&typeof provider.request==="function"){providers.set(id,{name,provider});renderProviders()}}
window.addEventListener("eip6963:announceProvider",event=>{const info=event.detail?.info;addProvider("eip6963:"+(info?.uuid||"unknown"),info?.name||"EIP-6963 wallet",event.detail?.provider)});
window.dispatchEvent(new Event("eip6963:requestProvider"));
setTimeout(()=>{if(providers.size===0&&window.ethereum)addProvider("legacy:ethereum","Legacy injected wallet",window.ethereum)},300);
async function provider(){if(!selected)throw new Error("Select one wallet provider.");return providers.get(selected).provider}
async function connect(){const p=await provider();let accounts=await p.request({method:"eth_accounts"});if(!Array.isArray(accounts)||accounts.length===0)accounts=await p.request({method:"eth_requestAccounts"});account=accounts?.[0];if(!/^0x[0-9a-fA-F]{40}$/.test(account||""))throw new Error("Wallet returned no valid account.");if(account.toLowerCase()!==serverState.deployerAddress.toLowerCase())throw new Error("Connected account is not the approved owner/deployer.");connectedChain=await p.request({method:"eth_chainId"});if(String(connectedChain).toLowerCase()!=="0x14a34"){try{await p.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x14a34"}]})}catch(error){if(Number(error?.code)!==4902)throw error;await p.request({method:"wallet_addEthereumChain",params:[{chainId:"0x14a34",chainName:"Base Sepolia",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:["https://sepolia.base.org/"],blockExplorerUrls:["https://sepolia.basescan.org"]}]})}connectedChain=await p.request({method:"eth_chainId"})}if(String(connectedChain).toLowerCase()!=="0x14a34")throw new Error("Wallet is not on Base Sepolia.");$("walletState").textContent=JSON.stringify({provider:selected,account,chainId:connectedChain},null,2);$("eoaSign").disabled=false;renderDeploymentGate();if(serverState.contractAddress){$("contractSign").disabled=false;$("agentSign").disabled=false}p.on?.("accountsChanged",()=>invalidate("wallet_account_changed"));p.on?.("chainChanged",()=>invalidate("wallet_chain_changed"));p.on?.("disconnect",()=>invalidate("wallet_provider_disconnected"))}
async function refresh(){serverState=await api("/api/state",{headers:{}});$("inspection").textContent=JSON.stringify(serverState.inspection,null,2);$("deployment").textContent=JSON.stringify(serverState.deployment||{},null,2);renderDeploymentGate();if(serverState.contractAddress&&account){$("contractSign").disabled=false;$("agentSign").disabled=false}return serverState}
async function challenge(address){return api("/auth/v1/wallet/challenge",{method:"POST",body:JSON.stringify({address,chainId:84532})})}
async function verify(challengeValue,signature){return api("/auth/v1/wallet/verify",{method:"POST",body:JSON.stringify({transactionHandle:challengeValue.handle,signature})})}
async function signEoa(){const p=await provider();const c=await challenge(account);const signature=await p.request({method:"personal_sign",params:[c.message,account]});const result=await verify(c,signature);output("EOA EIP-191 verified",result);location.reload()}
async function protectedRead(){output("Protected read",await api("/api/protected-read",{headers:{}}))}
async function logout(){await refresh();if(!serverState.csrfToken)throw new Error("No active CSRF-bound session.");const key="wallet003-logout-"+crypto.randomUUID();const call=()=>api("/auth/v1/logout",{method:"POST",headers:{"x-csrf-token":serverState.csrfToken,"idempotency-key":key},body:"{}"});const results=await Promise.all([call(),call()]);output("Idempotent logout",results)}
async function invalidate(reasonCode){try{await refresh();if(!serverState.csrfToken)return;await api("/auth/v1/wallet/invalidate",{method:"POST",headers:{"x-csrf-token":serverState.csrfToken,"idempotency-key":"wallet003-invalidate-"+crypto.randomUUID()},body:JSON.stringify({schemaVersion:"wallet_session_invalidation_request.v1",reasonCode})});output("Wallet context invalidated",{reasonCode})}catch{}}
async function deploy(){const p=await provider();const envelope=await api("/api/deployment-envelope",{headers:{}});const transactionHash=await p.request({method:"eth_sendTransaction",params:[envelope.transaction]});$("transactionHash").value=transactionHash;output("Deployment submitted by human wallet",{transactionHash,maximumCostWei:envelope.maximumCostWei});await observe()}
async function observe(){const transactionHash=$("transactionHash").value.trim();const result=await api("/api/deployment-observe",{method:"POST",body:JSON.stringify({transactionHash})});$("deployment").textContent=JSON.stringify(result,null,2);output("Deployment observation",result);await refresh()}
async function signContract(){const p=await provider();const c=await challenge(serverState.contractAddress);const signature=await p.request({method:"personal_sign",params:[c.message,account]});const result=await verify(c,signature);output("ERC-1271 EIP-191 verified",result);location.reload()}
async function signAgent(){const p=await provider();const c=await api("/api/agent-challenge",{method:"POST",body:"{}"});const signature=await p.request({method:"eth_signTypedData_v4",params:[account,JSON.stringify(c.typedData)]});const result=await api("/api/agent-verify",{method:"POST",body:JSON.stringify({handle:c.handle,signature})});output("ERC-1271 EIP-712 verified",result)}
for(const [id,fn] of Object.entries({connect,inspect:refresh,eoaSign:signEoa,protectedRead,logout,deploy,observe,contractSign:signContract,agentSign:signAgent}))$(id).addEventListener("click",()=>fn().catch(error=>output("ERROR",{message:error.message})));
await refresh();`;

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

export function normalizeWallet003OwnerEcdsaSignature(signature) {
  if (typeof signature !== "string" || !ECDSA_SIGNATURE.test(signature)) {
    fail(
      "invalid_wallet_003_owner_signature",
      "owner signature must be one canonical 65-byte ECDSA value"
    );
  }
  const recovery = Number.parseInt(signature.slice(-2), 16);
  if ([27, 28].includes(recovery)) return signature;
  if ([0, 1].includes(recovery)) {
    return `${signature.slice(0, -2)}${(recovery + 27).toString(16)}`;
  }
  fail(
    "invalid_wallet_003_owner_signature",
    "owner signature recovery byte is invalid"
  );
}

export function wallet003Eip712Transport(typedData) {
  if (
    !typedData ||
    typeof typedData !== "object" ||
    Array.isArray(typedData) ||
    !typedData.types ||
    typeof typedData.types !== "object" ||
    Array.isArray(typedData.types) ||
    Object.hasOwn(typedData.types, "EIP712Domain")
  ) {
    fail(
      "invalid_wallet_003_typed_data",
      "Agent EIP-712 typed data is outside the approved transport shape"
    );
  }
  const transport = {
    domain: typedData.domain,
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      ...typedData.types
    },
    primaryType: typedData.primaryType,
    message: typedData.message
  };
  JSON.stringify(transport);
  return Object.freeze(transport);
}

function exactPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    fail("invalid_wallet_003_handoff_port", "port is invalid");
  }
  return port;
}

function json(response, status, body, extra = {}) {
  const value = JSON.stringify(body);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(value),
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    ...extra
  });
  response.end(value);
}

function text(response, contentType, body) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "content-security-policy":
      "default-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  response.end(body);
}

async function body(request, requiredKeys) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAXIMUM_BODY_BYTES) {
      fail("wallet_003_handoff_payload_too_large", "request body is too large");
    }
    chunks.push(chunk);
  }
  const parsed = parseStrictJson(Buffer.concat(chunks).toString("utf8"), {
    maximumBytes: MAXIMUM_BODY_BYTES,
    maximumDepth: 8,
    maximumKeys: 32
  });
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype ||
    Object.keys(parsed).length !== requiredKeys.length ||
    requiredKeys.some((key) => !Object.hasOwn(parsed, key))
  ) {
    fail("invalid_wallet_003_handoff_request", "request body is invalid");
  }
  return parsed;
}

function cookies(header) {
  const result = new Map();
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) {
      result.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
    }
  }
  return result;
}

function argument(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  if (index === argv.length - 1 || argv.filter((value) => value === name).length !== 1) {
    fail("invalid_wallet_003_handoff_arguments", `${name} is invalid`);
  }
  return argv[index + 1];
}

export async function createWallet003HumanHandoffHost({
  decision,
  port = DEFAULT_PORT,
  fetchImpl = globalThis.fetch,
  clock = () => new Date()
}) {
  const checkedPort = exactPort(port);
  const browserOrigin = `http://${HOST}:${checkedPort}`;
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  actorDirectory.register({ actorId: ACTOR_ID, actorType: ActorType.HUMAN });
  actorDirectory.register({
    actorId: SYSTEM_ACTOR_ID,
    actorType: ActorType.OPERATIONS_OPERATOR
  });
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore,
    actorDirectory
  });
  const sessionStoreBacking = new InMemoryHumanSessionStore({
    referenceHasher,
    credentialRegistry,
    eventStore,
    origin: ISSUER
  });
  const sessionStore = Object.freeze({
    create: (input) => sessionStoreBacking.create(input),
    authenticate: (input) => sessionStoreBacking.authenticate(input),
    rotate: (input) => sessionStoreBacking.rotate(input),
    revoke: (input) => sessionStoreBacking.revoke(input),
    invalidate: (input) => sessionStoreBacking.invalidate({
      ...input,
      requestOrigin: ISSUER
    }),
    revokeByCredential: (input) => sessionStoreBacking.revokeByCredential(input)
  });
  const humanSessionBff = new HumanSessionBff({
    sessionStore,
    credentialRegistry
  });
  const signatureVerifier = new EvmWalletSignatureVerifier({ fetchImpl, clock });
  const transactionStore = new InMemoryWalletLoginTransactionStore({
    referenceHasher,
    domain: "ipo.one",
    uri: "https://ipo.one/auth/wallet"
  });
  const walletBff = new HumanWalletBff({
    issuer: ISSUER,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    transactionStore,
    sessionStore,
    credentialRegistry,
    referenceHasher,
    signatureVerifier: Object.freeze({
      verify: (input) => signatureVerifier.verifyMessage(input)
    })
  });
  const registerCredential = (address, reasonCode) =>
    credentialRegistry.register({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      actorType: ActorType.HUMAN,
      issuer: ISSUER,
      externalSubject: `eip155:84532:${address.toLowerCase()}`,
      clientId: CLIENT_ID,
      clientAuthenticationMethod: ClientAuthenticationMethod.SIWE,
      senderConstraint: {
        method: SenderConstraintMethod.HOST_SESSION,
        thumbprint: "w".repeat(43)
      },
      roles: ["tenant_owner"],
      allowedCapabilities: ["subject.read"],
      policyVersion: "wallet_003_live_acceptance.v1",
      performedByActorId: SYSTEM_ACTOR_ID,
      reasonCode,
      now: clock()
    });
  registerCredential(decision.ownerAddress, "wallet_003_eoa_credential");
  const serveAuthentication = createHumanAccessRouteHandler({
    browserOrigin,
    humanSessionBff,
    walletBff,
    clock
  });
  const deploymentHandoff = await createMinimalErc1271DeploymentHandoff({
    decision,
    fetchImpl,
    clock
  });
  const accountProof = new EvmAccountProofAdapter({
    profile: BASE_SEPOLIA_PROFILE,
    signatureVerifier
  });
  const agentChallenges = new Map();
  let deployment;
  let contractCredentialRegistered = false;

  async function activeSession(request) {
    const sessionHandle = readHumanAccessCookie(
      request.headers.cookie,
      "__Host-ipo_one_session"
    );
    if (!sessionHandle) return undefined;
    return humanSessionBff.authenticateSession({
      sessionHandle,
      requestMethod: "GET",
      now: clock()
    });
  }

  const server = createServer(async (request, response) => {
    try {
      if (
        request.headers.host !== `${HOST}:${checkedPort}` ||
        typeof request.url !== "string"
      ) {
        fail("wallet_003_handoff_misdirected", "request target is invalid");
      }
      const url = new URL(`${browserOrigin}${request.url}`);
      if (
        await serveAuthentication({
          request,
          response,
          url,
          requestId: randomBytes(16).toString("hex")
        })
      ) {
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        return text(response, "text/html; charset=utf-8", PAGE);
      }
      if (request.method === "GET" && url.pathname === "/handoff.css") {
        return text(response, "text/css; charset=utf-8", STYLE);
      }
      if (request.method === "GET" && url.pathname === "/handoff.js") {
        return text(response, "text/javascript; charset=utf-8", SCRIPT);
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        let session;
        try {
          session = await activeSession(request);
        } catch {
          session = undefined;
        }
        const cookieValues = cookies(request.headers.cookie);
        return json(response, 200, {
          schemaVersion: "wallet_003_human_handoff_state.v1",
          ownerAddress: decision.ownerAddress,
          deployerAddress: decision.deployerAddress,
          contractExpiresAt: decision.contractExpiresAt,
          contractAddress: deployment?.contractAddress,
          deployment,
          inspection: await deploymentHandoff.inspect(),
          sessionActive: session !== undefined,
          csrfToken: session === undefined
            ? undefined
            : cookieValues.get("__Host-ipo_one_csrf_bootstrap"),
          authenticationEventCount: eventStore.list().length,
          productionFundsMoved: false
        });
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/deployment-envelope"
      ) {
        return json(
          response,
          200,
          await deploymentHandoff.buildUnsignedTransaction()
        );
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/deployment-observe"
      ) {
        const input = await body(request, ["transactionHash"]);
        const observed = await deploymentHandoff.observe(input.transactionHash);
        if (observed.status === "verified_safe") {
          if (
            deployment &&
            (
              deployment.transactionHash !== observed.transactionHash ||
              deployment.contractAddress !== observed.contractAddress
            )
          ) {
            fail("wallet_003_deployment_conflict", "another deployment was already accepted");
          }
          deployment = observed;
          if (!contractCredentialRegistered) {
            registerCredential(
              observed.contractAddress,
              "wallet_003_erc1271_credential"
            );
            contractCredentialRegistered = true;
          }
        }
        return json(response, 200, observed);
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/protected-read"
      ) {
        const context = await activeSession(request);
        if (!context) fail("authentication_required", "active session is required");
        return json(response, 200, {
          schemaVersion: "wallet_003_protected_read.v1",
          actorId: context.actorId,
          actorType: context.actorType,
          authenticationMethod: context.authenticationMethod,
          amr: context.amr,
          authority: "read_only_no_funds",
          productionFundsMoved: false
        });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/agent-challenge"
      ) {
        await body(request, []);
        if (!deployment?.contractAddress) {
          fail("erc1271_deployment_required", "verified deployment is required");
        }
        const now = clock();
        const accountId = `eip155:84532:${deployment.contractAddress}`;
        const normalized = normalizeEvmCaip10(
          accountId,
          BASE_SEPOLIA_PROFILE.chainId
        );
        const challenge = {
          chainId: BASE_SEPOLIA_PROFILE.chainId,
          tenantHash: hashId("tenant", TENANT_ID),
          subjectHash: hashId("subject", ACTOR_ID),
          accountHash: normalized.accountHash,
          purpose: "primary",
          nonce: `0x${randomBytes(32).toString("hex")}`,
          issuedAt: new Date(Math.floor(now.getTime() / 1_000) * 1_000).toISOString(),
          expiresAt: new Date(
            Math.floor(now.getTime() / 1_000) * 1_000 + 5 * 60_000
          ).toISOString(),
          protocolVersion: "1.1"
        };
        const prepared = accountProof.createTypedData(challenge);
        const durable = Object.freeze({
          ...challenge,
          typedDataHash: prepared.typedDataHash
        });
        const handle = randomBytes(32).toString("base64url");
        agentChallenges.set(referenceHasher.hash("agent.challenge", handle), durable);
        return json(response, 201, {
          schemaVersion: "wallet_003_agent_challenge.v1",
          handle,
          typedData: wallet003Eip712Transport(prepared.typedData),
          expiresAt: durable.expiresAt
        });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/agent-verify"
      ) {
        const input = await body(request, ["handle", "signature"]);
        const reference = referenceHasher.hash("agent.challenge", input.handle);
        const challenge = agentChallenges.get(reference);
        agentChallenges.delete(reference);
        if (!challenge || !deployment?.contractAddress) {
          fail("agent_challenge_rejected", "Agent challenge is not active");
        }
        const signature = normalizeWallet003OwnerEcdsaSignature(input.signature);
        const prepared = accountProof.createTypedData(challenge);
        const ownerSignatureValid = await verifyTypedData({
          address: decision.ownerAddress,
          ...prepared.typedData,
          signature
        }).catch(() => false);
        if (ownerSignatureValid !== true) {
          fail(
            "agent_owner_signature_invalid",
            "Agent EIP-712 signature does not recover the approved contract owner"
          );
        }
        const result = await accountProof.verify({
          accountId: `eip155:84532:${deployment.contractAddress}`,
          signature,
          challenge,
          now: clock()
        });
        return json(response, 200, {
          ...result,
          rawSignaturePersisted: false,
          credentialsIncluded: false,
          productionFundsMoved: false
        });
      }
      fail("not_found", "route is not available");
    } catch (error) {
      return json(response, error?.code === "authentication_required" ? 401 : 400, {
        type: "about:blank",
        title: "WALLET-003 handoff request rejected",
        status: error?.code === "authentication_required" ? 401 : 400,
        code: error?.code ?? "wallet_003_handoff_rejected",
        detail: error?.message ?? "request rejected"
      });
    }
  });

  return Object.freeze({
    url: `${browserOrigin}/`,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(checkedPort, HOST, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return Object.freeze({ host: HOST, port: checkedPort, url: `${browserOrigin}/` });
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const decisionPath = argument(
    process.argv.slice(2),
    "--decision-file",
    undefined
  );
  if (!decisionPath) {
    fail(
      "invalid_wallet_003_handoff_arguments",
      "--decision-file is required"
    );
  }
  const port = exactPort(
    argument(process.argv.slice(2), "--port", DEFAULT_PORT)
  );
  const decision = await readMinimalErc1271DeploymentDecision(decisionPath);
  const host = await createWallet003HumanHandoffHost({ decision, port });
  const listening = await host.listen();
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: "wallet_003_human_handoff_listener.v1",
      ...listening,
      keyMaterialAccepted: false,
      productionFundsMoved: false
    })}\n`
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      await host.close();
      process.exit(0);
    });
  }
}
