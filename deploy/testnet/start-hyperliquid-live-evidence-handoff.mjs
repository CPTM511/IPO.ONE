import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  createOperationalId,
  createRealTradingAccountBindingChallenge,
  finalizeRealTradingEvidenceSnapshot,
  hashId,
  importRealTradingHistory,
  realTradingCreditProfileView
} from "../../packages/domain/src/index.js";
import { parseStrictJson } from "../../modules/authentication/src/strict-json.js";
import {
  HYPERLIQUID_TESTNET_ENVIRONMENT,
  HyperliquidBindingProofVerifier,
  HyperliquidTestnetInfoAdapter,
  normalizeHyperliquidAddress
} from "../../modules/hyperliquid-info/src/index.js";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4193;
const MAXIMUM_BODY_BYTES = 12 * 1_024;
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1_000;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const SNAPSHOT_FILL_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const EIP712_DOMAIN_TYPE = Object.freeze([
  Object.freeze({ name: "name", type: "string" }),
  Object.freeze({ name: "version", type: "string" }),
  Object.freeze({ name: "chainId", type: "uint256" })
]);

const SUBJECT = Object.freeze({
  subjectId: "subject_tc203_founder_live_e2e",
  subjectType: SubjectType.AGENT,
  primaryPrincipalId: "principal_tc203_founder_live_e2e",
  status: SubjectStatus.ACTIVE
});
const PRINCIPAL = Object.freeze({
  principalId: SUBJECT.primaryPrincipalId,
  status: PrincipalStatus.ACTIVE
});
const TENANT_ID = "tenant_tc203_founder_live_e2e";
const ACTOR_ID = "actor_tc203_founder_live_e2e";

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function exactPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    fail("invalid_tc203_handoff_port", "The handoff port is invalid.");
  }
  return port;
}

function argument(argv, name, fallback) {
  const matches = argv
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === name);
  if (matches.length === 0) return fallback;
  if (matches.length !== 1 || matches[0].index === argv.length - 1) {
    fail("invalid_tc203_handoff_arguments", `${name} is invalid.`);
  }
  return argv[matches[0].index + 1];
}

function wholeSecond(date) {
  return new Date(Math.floor(date.getTime() / 1_000) * 1_000);
}

function requireCurrentDate(value, name) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    fail("invalid_tc203_handoff_clock", `${name} is invalid.`);
  }
  return date;
}

function exactObject(value, keys, code = "invalid_tc203_handoff_request") {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code, "The handoff request has an invalid shape.");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code, "The handoff request has an open or incomplete shape.");
  }
  return value;
}

export function hyperliquidBindingTypedDataTransport(typedData) {
  exactObject(typedData, ["domain", "message", "primaryType", "types"]);
  if (
    !typedData.types ||
    typeof typedData.types !== "object" ||
    Array.isArray(typedData.types) ||
    Object.hasOwn(typedData.types, "EIP712Domain")
  ) {
    fail(
      "invalid_tc203_typed_data",
      "The binding typed data is outside the approved transport shape."
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

function evidenceSummary(finalized, completedAt) {
  const view = realTradingCreditProfileView(finalized);
  const shadow = view.factorScorecard.shadowRisk;
  return Object.freeze({
    status: "PASS",
    taskId: "TC-203",
    gate: "founder_live_account_read_only_e2e",
    completedAt: completedAt.toISOString(),
    environment: "hyperliquid_testnet",
    chainId: "eip155:998",
    infoProfileId: "hyperliquid_testnet_info.v1",
    stage: view.stage,
    profileVersion: view.version,
    bindingEpoch: view.bindingEpoch,
    masterAddressHash: view.accountBinding.masterAddressHash,
    subaccountAddressHash: view.accountBinding.subaccountAddressHash,
    proofHash: view.accountBinding.proofHash,
    relationshipHash: view.accountBinding.relationshipHash,
    accountBindingHash: view.accountBinding.accountBindingHash,
    historyHash: view.historyImport.historyHash,
    historyManifestHash: view.historyImport.historyManifestHash,
    uniqueFillCount: view.historyImport.counts.uniqueEventCount,
    observationWindow: view.historyImport.observationWindow,
    metrics: view.historyImport.metrics,
    dataQuality: view.historyImport.dataQuality,
    evidenceSnapshotHash: view.evidenceSnapshot.snapshotHash,
    scorecardHash: view.factorScorecard.scorecardHash,
    scorecardSchemaVersion: view.factorScorecard.schemaVersion,
    shadowRiskProfileHash: shadow.shadowRiskProfileHash,
    shadowRiskFeatures: shadow.features,
    imported: true,
    finalized: true,
    readBack: true,
    nonEmptyHistory: view.historyImport.counts.uniqueEventCount > 0,
    pointInTime: view.evidenceSnapshot.pointInTime,
    authorizing: view.evidenceSnapshot.authorizing,
    economicStateMutation: shadow.economicStateMutation,
    newRiskAuthority: shadow.newRiskAuthority,
    fundsAuthority: shadow.fundsAuthority,
    rawAddressesPersisted: view.accountBinding.rawAddressesPersisted,
    rawSignaturePersisted: view.historyImport.rawSignaturePersisted,
    rawEventsPersisted: view.historyImport.rawEventsPersisted,
    externalOrderSubmitted: false,
    exchangeEndpointAvailable: false,
    apiWalletUsed: false,
    mainnetUsed: false,
    realFunds: false,
    schemaVersion: "tc203_founder_live_account_e2e_evidence.v1"
  });
}

export function createTc203LiveEvidenceSession({
  infoAdapter = new HyperliquidTestnetInfoAdapter(),
  proofVerifier = new HyperliquidBindingProofVerifier(),
  clock = () => new Date()
} = {}) {
  if (
    typeof infoAdapter.verifyMasterSubaccountBinding !== "function" ||
    typeof infoAdapter.readFillHistory !== "function" ||
    typeof infoAdapter.readAccountSnapshot !== "function" ||
    typeof proofVerifier.createTypedData !== "function" ||
    typeof proofVerifier.verify !== "function" ||
    typeof clock !== "function"
  ) {
    fail(
      "invalid_tc203_handoff_dependency",
      "The handoff requires the approved binding and Testnet Info adapters."
    );
  }

  let active;
  let lastEvidence;
  let workflowStatus = "idle";
  let failureCode = null;

  function state() {
    const now = requireCurrentDate(clock(), "clock");
    if (
      active?.status === "pending" &&
      new Date(active.profile.bindingChallenge.expiresAt) <= now
    ) {
      active.status = "expired";
      workflowStatus = "expired";
    }
    return Object.freeze({
      workflowStatus,
      challengeExpiresAt:
        active?.status === "pending"
          ? active.profile.bindingChallenge.expiresAt
          : null,
      lastFailureCode: failureCode,
      evidence: lastEvidence ?? null,
      safety: Object.freeze({
        host: HOST,
        testnetOnly: true,
        infoEndpointOnly: true,
        allowedInfoQueries: Object.freeze([
          "userRole",
          "subAccounts",
          "userFillsByTime",
          "clearinghouseState",
          "frontendOpenOrders"
        ]),
        eip712OneUse: true,
        challengeLifetimeMs: CHALLENGE_LIFETIME_MS,
        exchangeEndpointAvailable: false,
        signerStored: false,
        apiWalletUsed: false,
        externalOrderSubmitted: false,
        transfersAvailable: false,
        withdrawalsAvailable: false,
        mainnetAvailable: false,
        realFunds: false
      }),
      schemaVersion: "tc203_live_evidence_handoff_state.v1"
    });
  }

  function invalidate(reasonCode = "wallet_context_changed") {
    if (active) active.status = "invalidated";
    active = undefined;
    workflowStatus = "invalidated";
    failureCode = reasonCode;
    return state();
  }

  function createChallenge({
    masterAccountAddress,
    subaccountAddress
  }) {
    const master = normalizeHyperliquidAddress(masterAccountAddress);
    const subaccount = normalizeHyperliquidAddress(subaccountAddress);
    if (master.addressHash === subaccount.addressHash) {
      fail(
        "invalid_tc203_account_pair",
        "The master and subaccount must be different accounts."
      );
    }
    if (active?.status === "pending") active.status = "superseded";

    const issuedAtDate = wholeSecond(
      requireCurrentDate(clock(), "challenge issuance time")
    );
    const expiresAtDate = new Date(
      issuedAtDate.getTime() + CHALLENGE_LIFETIME_MS
    );
    const issuedAt = issuedAtDate.toISOString();
    const expiresAt = expiresAtDate.toISOString();
    const challengeId = createOperationalId("trading_binding_challenge");
    const nonceHash = hashId(
      "trading_binding_challenge_nonce",
      `0x${randomBytes(32).toString("hex")}`
    );
    const typedDataInput = {
      tenantHash: hashId("tenant", TENANT_ID),
      subjectHash: hashId("subject", SUBJECT.subjectId),
      principalHash: hashId("principal", PRINCIPAL.principalId),
      masterAddressHash: master.addressHash,
      subaccountAddressHash: subaccount.addressHash,
      nonceHash,
      challengeId,
      environment: HYPERLIQUID_TESTNET_ENVIRONMENT,
      infoProfileId: "hyperliquid_testnet_info.v1",
      bindingEpoch: 1,
      issuedAt,
      expiresAt
    };
    const prepared = proofVerifier.createTypedData(typedDataInput);
    const bindingDescriptor = {
      challengeId,
      challengeHash: hashId("trading_binding_challenge", {
        ...typedDataInput,
        typedDataHash: prepared.typedDataHash
      }),
      nonceHash,
      typedDataHash: prepared.typedDataHash,
      masterAddressHash: master.addressHash,
      subaccountAddressHash: subaccount.addressHash,
      chainId: prepared.chainId,
      environment: prepared.environment,
      infoProfileId: typedDataInput.infoProfileId,
      issuedAt,
      expiresAt
    };
    const profile = createRealTradingAccountBindingChallenge({
      tenantId: TENANT_ID,
      subject: SUBJECT,
      principal: PRINCIPAL,
      requestedByActorId: ACTOR_ID,
      bindingDescriptor,
      now: issuedAtDate
    });
    active = {
      challengeId,
      master,
      subaccount,
      profile,
      status: "pending"
    };
    workflowStatus = "challenge_pending";
    failureCode = null;
    lastEvidence = undefined;
    return Object.freeze({
      challengeId,
      expiresAt,
      chainId: prepared.chainId,
      environment: prepared.environment,
      typedDataHash: prepared.typedDataHash,
      typedData: hyperliquidBindingTypedDataTransport(prepared.typedData),
      reusableSignature: false,
      externalQueryPerformed: false,
      schemaVersion: "tc203_live_binding_request.v1"
    });
  }

  async function complete({
    challengeId,
    masterAccountAddress,
    signature,
    subaccountAddress
  }) {
    if (typeof signature !== "string" || !SIGNATURE.test(signature)) {
      fail(
        "invalid_tc203_signature",
        "The wallet signature must be one canonical 65-byte EVM signature."
      );
    }
    const now = requireCurrentDate(clock(), "completion time");
    const master = normalizeHyperliquidAddress(masterAccountAddress);
    const subaccount = normalizeHyperliquidAddress(subaccountAddress);
    if (
      !active ||
      active.status !== "pending" ||
      active.challengeId !== challengeId ||
      active.master.addressHash !== master.addressHash ||
      active.subaccount.addressHash !== subaccount.addressHash ||
      new Date(active.profile.bindingChallenge.expiresAt) <= now
    ) {
      fail(
        "tc203_binding_challenge_not_current",
        "The one-use binding challenge is not current for this account pair."
      );
    }

    workflowStatus = "verifying_ownership";
    failureCode = null;
    let bindingProof;
    try {
      bindingProof = await proofVerifier.verify({
        masterAccountAddress: master.address,
        signature,
        challenge: active.profile.bindingChallenge,
        now
      });
    } catch (error) {
      failureCode = error?.code ?? "tc203_ownership_proof_failed";
      workflowStatus = "failed";
      throw error;
    }

    // A successfully verified signature is consumed before any external read.
    // Later network or relationship failures require a fresh wallet challenge.
    active.status = "consumed";
    workflowStatus = "reading_testnet_info";

    try {
      const relationship =
        await infoAdapter.verifyMasterSubaccountBinding({
          masterAccountAddress: master.address,
          subaccountAddress: subaccount.address
        });
      const historyWindowEndMs = now.getTime();
      const history = await infoAdapter.readFillHistory({
        accountAddress: subaccount.address,
        fillWindowStartMs: Math.max(
          0,
          historyWindowEndMs - HISTORY_WINDOW_MS
        ),
        fillWindowEndMs: historyWindowEndMs
      });
      if (history.counts?.uniqueEventCount < 1) {
        fail(
          "tc203_non_empty_history_required",
          "The verified subaccount has no fills in the approved 30-day Testnet window."
        );
      }
      const currentSnapshot = await infoAdapter.readAccountSnapshot({
        accountAddress: subaccount.address,
        accountRole: "subaccount",
        fillWindowStartMs: Math.max(
          0,
          historyWindowEndMs - SNAPSHOT_FILL_WINDOW_MS
        ),
        fillWindowEndMs: historyWindowEndMs
      });
      workflowStatus = "importing_and_finalizing";
      const imported = importRealTradingHistory({
        profile: active.profile,
        requestedByActorId: ACTOR_ID,
        bindingProof,
        relationship,
        history,
        currentSnapshot: currentSnapshot.snapshot,
        challengeEventId: "event_tc203_live_binding_challenge",
        challengeEvidenceHash: hashId(
          "evidence",
          active.profile.bindingChallenge.challengeHash
        ),
        now
      });
      const completedAt = requireCurrentDate(clock(), "finalization time");
      const finalized = finalizeRealTradingEvidenceSnapshot({
        profile: imported,
        sourceProjectionHash: hashId(
          "trading_credit_profile_projection",
          imported
        ),
        historyImportEventId: "event_tc203_live_history_import",
        historyImportEvidenceHash: hashId(
          "evidence",
          imported.historyImport.historyHash
        ),
        sourceFinality: "finalized",
        now: completedAt
      });
      lastEvidence = evidenceSummary(finalized, completedAt);
      if (
        lastEvidence.nonEmptyHistory !== true ||
        lastEvidence.authorizing !== false ||
        lastEvidence.economicStateMutation !== false ||
        lastEvidence.fundsAuthority !== false ||
        lastEvidence.rawAddressesPersisted !== false ||
        lastEvidence.rawSignaturePersisted !== false ||
        lastEvidence.rawEventsPersisted !== false
      ) {
        fail(
          "tc203_live_evidence_safety_check_failed",
          "The live Evidence output failed its non-authorizing safety checks."
        );
      }
      active = undefined;
      workflowStatus = "complete";
      return lastEvidence;
    } catch (error) {
      active = undefined;
      failureCode = error?.code ?? "tc203_live_evidence_failed";
      workflowStatus = "failed";
      throw error;
    }
  }

  return Object.freeze({
    complete,
    createChallenge,
    invalidate,
    state
  });
}

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IPO.ONE TC-203 Hyperliquid Testnet E2E</title>
  <link rel="stylesheet" href="/handoff.css">
</head>
<body>
  <main>
    <p class="eyebrow">TC-203 · HYPERLIQUID TESTNET · READ ONLY</p>
    <h1>Founder 真实账户证据交接</h1>
    <p class="lead">此页面只创建五分钟一次性 EIP-712 所有权证明，并读取已批准的 <code>/info</code> 数据。没有 <code>/exchange</code>、API Wallet、订单、转账、提款、主网或真实资金权限。</p>
    <section>
      <h2>1. 选择并连接 Founder 的 master EOA</h2>
      <div id="providers"></div>
      <button id="connect" disabled>连接所选钱包</button>
      <pre id="walletState">请选择已批准的钱包 Provider。</pre>
    </section>
    <section>
      <h2>2. 输入真实 Testnet subaccount 地址</h2>
      <label>Subaccount address
        <input id="subaccount" autocomplete="off" spellcheck="false" placeholder="0x…">
      </label>
      <p>必须是上方 master 在 Hyperliquid Testnet 中实际控制的 subaccount，且最近 30 天至少有一条 fill。</p>
      <button id="prepare" disabled>准备一次性只读绑定</button>
      <pre id="challengeState"></pre>
    </section>
    <section>
      <h2>3. Founder 人工确认签名</h2>
      <button id="sign" disabled>在钱包中确认一次性 EIP-712 签名</button>
      <p class="warning">签名成功后，本机会查询关系、30 天 fills 与当前快照，并执行 import → finalize → read-back。任何失败都需要重新生成签名。</p>
    </section>
    <section>
      <h2>脱敏 Evidence</h2>
      <pre id="output">尚未执行。</pre>
    </section>
  </main>
  <script src="/handoff.js" type="module"></script>
</body>
</html>`;

const STYLE = `:root{color-scheme:dark;font:15px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;background:#060b12;color:#e5f1ff}*{box-sizing:border-box}body{margin:0}main{max-width:980px;margin:auto;padding:42px 20px 80px}h1{font:750 clamp(34px,6vw,66px)/1.02 system-ui;margin:.2em 0 .35em;letter-spacing:-.04em}h2{font:650 20px/1.2 system-ui}.eyebrow{color:#63e6be;text-transform:uppercase;letter-spacing:.13em}.lead{font:17px/1.55 system-ui;color:#cbd9ea}.warning{color:#ffd8a8}section{border:1px solid #243b55;background:#0a1421;padding:20px;margin:18px 0;border-radius:14px;box-shadow:0 14px 35px #0005}button{margin:6px 9px 6px 0;padding:10px 14px;border-radius:9px;border:1px solid #3b6586;background:#102b40;color:#eff8ff;font:inherit;cursor:pointer}button:hover{background:#153b57}button:disabled{opacity:.42;cursor:not-allowed}label{display:block;margin:10px 0}input{display:block;width:min(100%,720px);padding:11px;margin-top:7px;background:#050b12;color:#fff;border:1px solid #3b6586;border-radius:8px;font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#040a11;padding:13px;border-radius:9px;min-height:28px;border:1px solid #182a3b}.provider{display:block;width:100%;text-align:left}.provider.selected{outline:2px solid #63e6be}code{color:#8ce6ff}`;

const SCRIPT = `const $=id=>document.getElementById(id);
const providers=new Map();
let selected;
let account;
let challenge;
let handoffToken;
const show=(label,value)=>{$("output").textContent=label+"\\n"+JSON.stringify(value,null,2)};
async function api(path,options={}){const response=await fetch(path,{credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json",...(handoffToken?{"x-handoff-token":handoffToken}:{}),...(options.headers||{})},...options});const text=await response.text();let body;try{body=text?JSON.parse(text):undefined}catch{}if(!response.ok)throw new Error(body?.message||body?.error||("HTTP "+response.status));return body}
function renderProviders(){const root=$("providers");root.replaceChildren();for(const [id,item] of providers){const button=document.createElement("button");button.className="provider"+(selected===id?" selected":"");button.textContent=item.name+" · "+id;button.addEventListener("click",()=>{selected=id;renderProviders();$("connect").disabled=false});root.append(button)}if(providers.size===0)root.textContent="尚未发现钱包 Provider。请确认钱包扩展已启用。"}
function addProvider(id,name,provider){if(!providers.has(id)&&provider&&typeof provider.request==="function"){providers.set(id,{name,provider});renderProviders()}}
window.addEventListener("eip6963:announceProvider",event=>{const info=event.detail?.info;addProvider("eip6963:"+(info?.uuid||"unknown"),info?.name||"EIP-6963 wallet",event.detail?.provider)});
window.dispatchEvent(new Event("eip6963:requestProvider"));
setTimeout(()=>{if(providers.size===0&&window.ethereum)addProvider("legacy:ethereum","Legacy injected wallet",window.ethereum)},300);
async function provider(){if(!selected)throw new Error("请先选择钱包 Provider。");return providers.get(selected).provider}
async function invalidate(reasonCode){challenge=undefined;$("sign").disabled=true;$("prepare").disabled=!account;try{await api("/api/invalidate",{method:"POST",body:JSON.stringify({reasonCode})})}catch{}}
async function connect(){const p=await provider();let accounts=await p.request({method:"eth_accounts"});if(!Array.isArray(accounts)||accounts.length===0)accounts=await p.request({method:"eth_requestAccounts"});account=accounts?.[0];if(!/^0x[0-9a-fA-F]{40}$/.test(account||""))throw new Error("钱包没有返回有效 EOA。");$("walletState").textContent=JSON.stringify({provider:selected,masterAccount:account},null,2);$("prepare").disabled=false;p.on?.("accountsChanged",()=>invalidate("wallet_account_changed"));p.on?.("chainChanged",()=>invalidate("wallet_chain_changed"));p.on?.("disconnect",()=>invalidate("wallet_provider_disconnected"))}
async function prepare(){const subaccountAddress=$("subaccount").value.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(subaccountAddress))throw new Error("请输入有效的 Testnet subaccount 地址。");challenge=await api("/api/challenge",{method:"POST",body:JSON.stringify({masterAccountAddress:account,subaccountAddress})});$("challengeState").textContent=JSON.stringify({challengeId:challenge.challengeId,expiresAt:challenge.expiresAt,chainId:challenge.chainId,typedDataHash:challenge.typedDataHash,reusableSignature:challenge.reusableSignature,externalQueryPerformed:challenge.externalQueryPerformed},null,2);$("sign").disabled=false}
async function ensureHyperEvmTestnet(p){const chainId=String(await p.request({method:"eth_chainId"})).toLowerCase();if(chainId==="0x3e6")return;try{await p.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x3e6"}]})}catch(error){if(Number(error?.code)!==4902)throw error;await p.request({method:"wallet_addEthereumChain",params:[{chainId:"0x3e6",chainName:"Hyperliquid EVM Testnet",nativeCurrency:{name:"HYPE",symbol:"HYPE",decimals:18},rpcUrls:["https://rpc.hyperliquid-testnet.xyz/evm"]}]})}if(String(await p.request({method:"eth_chainId"})).toLowerCase()!=="0x3e6")throw new Error("钱包未切换到 Hyperliquid EVM Testnet (998)。")}
async function sign(){const p=await provider();await ensureHyperEvmTestnet(p);const signature=await p.request({method:"eth_signTypedData_v4",params:[account,JSON.stringify(challenge.typedData)]});$("sign").disabled=true;show("正在验证并读取 Testnet Evidence…",{challengeId:challenge.challengeId});const evidence=await api("/api/complete",{method:"POST",body:JSON.stringify({challengeId:challenge.challengeId,masterAccountAddress:account,signature,subaccountAddress:$("subaccount").value.trim()})});challenge=undefined;show("TC-203 Founder 真实账户只读 E2E 完成",evidence)}
for(const [id,fn] of Object.entries({connect,prepare,sign}))$(id).addEventListener("click",()=>fn().catch(error=>show("ERROR",{message:error.message})));
const initial=await api("/api/state",{headers:{}});handoffToken=initial.handoffToken;show("安全边界",initial.state.safety);`;

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
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

async function requestBody(request, keys) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAXIMUM_BODY_BYTES) {
      fail(
        "tc203_handoff_payload_too_large",
        "The handoff request is too large."
      );
    }
    chunks.push(chunk);
  }
  const parsed = parseStrictJson(Buffer.concat(chunks).toString("utf8"), {
    maximumBytes: MAXIMUM_BODY_BYTES,
    maximumDepth: 8,
    maximumKeys: 24
  });
  return exactObject(parsed, keys);
}

export async function createTc203LiveEvidenceHandoffHost({
  port = DEFAULT_PORT,
  session = createTc203LiveEvidenceSession()
} = {}) {
  const checkedPort = exactPort(port);
  const origin = `http://${HOST}:${checkedPort}`;
  const handoffToken = `0x${randomBytes(32).toString("hex")}`;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (
        request.headers.host !== `${HOST}:${checkedPort}` ||
        url.origin !== origin
      ) {
        json(response, 421, {
          error: "tc203_handoff_origin_denied",
          message: "The handoff origin is not approved."
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        text(response, "text/html; charset=utf-8", PAGE);
        return;
      }
      if (request.method === "GET" && url.pathname === "/handoff.css") {
        text(response, "text/css; charset=utf-8", STYLE);
        return;
      }
      if (request.method === "GET" && url.pathname === "/handoff.js") {
        text(response, "text/javascript; charset=utf-8", SCRIPT);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        json(response, 200, { handoffToken, state: session.state() });
        return;
      }
      if (request.method === "POST") {
        if (
          request.headers.origin !== origin ||
          request.headers["x-handoff-token"] !== handoffToken
        ) {
          json(response, 403, {
            error: "tc203_handoff_request_denied",
            message: "The handoff request token or origin is invalid."
          });
          return;
        }
        if (url.pathname === "/api/challenge") {
          const body = await requestBody(request, [
            "masterAccountAddress",
            "subaccountAddress"
          ]);
          json(response, 200, session.createChallenge(body));
          return;
        }
        if (url.pathname === "/api/complete") {
          const body = await requestBody(request, [
            "challengeId",
            "masterAccountAddress",
            "signature",
            "subaccountAddress"
          ]);
          json(response, 200, await session.complete(body));
          return;
        }
        if (url.pathname === "/api/invalidate") {
          const body = await requestBody(request, ["reasonCode"]);
          if (
            typeof body.reasonCode !== "string" ||
            !/^[a-z][a-z0-9_]{0,63}$/.test(body.reasonCode)
          ) {
            fail(
              "invalid_tc203_invalidation_reason",
              "The invalidation reason is invalid."
            );
          }
          json(response, 200, session.invalidate(body.reasonCode));
          return;
        }
      }
      json(response, 404, {
        error: "tc203_handoff_route_not_found",
        message: "The requested handoff route does not exist."
      });
    } catch (error) {
      json(response, 400, {
        error: error?.code ?? "tc203_handoff_failed",
        message: error?.message ?? "The TC-203 handoff failed."
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(checkedPort, HOST, resolve);
  });

  return Object.freeze({
    url: origin,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = exactPort(argument(process.argv.slice(2), "--port", DEFAULT_PORT));
  const host = await createTc203LiveEvidenceHandoffHost({ port });
  process.stdout.write(
    `TC-203 Hyperliquid Testnet handoff ready at ${host.url}\n`
  );
}
