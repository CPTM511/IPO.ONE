import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { recoverTypedDataAddress } from "viem";
import { hashId } from "../../packages/domain/src/index.js";
import { parseStrictJson } from "../../modules/authentication/src/strict-json.js";
import {
  createHypercoreApproveAgentSigningRequest
} from "../../modules/hypercore-venue-adapter/src/index.js";
import {
  inspectHypercoreIsolatedTestnetSigner,
  withHypercoreIsolatedTestnetSigner
} from "./hypercore-isolated-signer.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4194;
const MAX_BODY_BYTES = 16 * 1_024;
const INFO_ENDPOINT = "https://api.hyperliquid-testnet.xyz/info";
const EXCHANGE_ENDPOINT = "https://api.hyperliquid-testnet.xyz/exchange";
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const APPROVAL_DIRECTORY = "/private/tmp/ipo-one-hypercore-002d/approvals";
const AGENT_CREDIT_APPROVAL_DIRECTORY =
  "/private/tmp/ipo-one-agent-credit-exec-001/approvals";
const COMMIT = /^[0-9a-f]{40}$/;
const RUN_ID = /^agent-credit-exec-001-l3-[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/;

export const HYPERCORE_002D_HANDOFF_PROFILE = Object.freeze({
  issueId: "HYPERLIQUID-002D",
  runId: null,
  candidateCommit: null,
  agentName: "ipo-one-002d",
  approvalDirectory: APPROVAL_DIRECTORY,
  approvalMarkerPrefix: "HYPERLIQUID-002D-AGENT",
  title: "HyperCore 执行闭环",
  schemaVersion: "hypercore_handoff_profile.v1"
});

export function createAgentCreditHyperliquidHandoffProfile({
  runId,
  candidateCommit
}) {
  if (!RUN_ID.test(runId ?? "") || !COMMIT.test(candidateCommit ?? "")) {
    fail(
      "invalid_agent_credit_handoff_profile",
      "An exact Agent Credit run and candidate commit are required."
    );
  }
  return Object.freeze({
    issueId: "AGENT-CREDIT-EXEC-001",
    runId,
    candidateCommit,
    agentName: "ipo-one-credit-001",
    approvalDirectory: AGENT_CREDIT_APPROVAL_DIRECTORY,
    approvalMarkerPrefix:
      `AGENT-CREDIT-EXEC-001:${runId}:${candidateCommit}:AGENT`,
    title: "Agent Credit L3 Testnet Handoff",
    schemaVersion: "hypercore_handoff_profile.v1"
  });
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function exactObject(value, keys, code = "invalid_hypercore_002d_handoff") {
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
    fail(code, "The handoff request is open or incomplete.");
  }
  return value;
}

function exactRegistrationResume(value) {
  if (value === null || value === undefined) return null;
  exactObject(
    value,
    ["nonce", "signingRequestHash"],
    "invalid_hypercore_002d_registration_resume"
  );
  if (
    !Number.isSafeInteger(value.nonce) ||
    value.nonce < 1 ||
    typeof value.signingRequestHash !== "string" ||
    !HASH.test(value.signingRequestHash)
  ) {
    fail(
      "invalid_hypercore_002d_registration_resume",
      "The resumed registration binding is invalid."
    );
  }
  return Object.freeze({
    nonce: value.nonce,
    signingRequestHash: value.signingRequestHash
  });
}

function address(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (!ADDRESS.test(normalized)) {
    fail("invalid_hypercore_002d_account", "The wallet did not provide a valid account.");
  }
  return normalized;
}

function finiteUsd(value, name) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    fail("invalid_hypercore_002d_info_response", `${name} is invalid.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    fail("invalid_hypercore_002d_info_response", `${name} is unavailable.`);
  }
  return number;
}

async function responseJson(response, code) {
  if (!response?.ok) fail(code, "Hyperliquid Testnet request failed.");
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(code, "Hyperliquid Testnet returned invalid JSON.");
  }
}

async function postJson(fetchImpl, endpoint, body, code) {
  return responseJson(await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  }), code);
}

function approvalPaths(requestHash, approvalDirectory = APPROVAL_DIRECTORY) {
  if (!HASH.test(requestHash)) {
    fail("invalid_hypercore_002d_registration_hash", "The registration hash is invalid.");
  }
  const stem = requestHash.slice(2);
  return {
    authorized: `${approvalDirectory}/${stem}.authorized`,
    consumed: `${approvalDirectory}/${stem}.consumed`,
    result: `${approvalDirectory}/${stem}.result.json`
  };
}

async function regularOwnerOnly(path) {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function approved(requestHash, profile = HYPERCORE_002D_HANDOFF_PROFILE) {
  const paths = approvalPaths(requestHash, profile.approvalDirectory);
  if (!(await regularOwnerOnly(paths.authorized))) return false;
  return (await readFile(paths.authorized, "utf8")).trim() === requestHash;
}

function signatureParts(signature) {
  if (!SIGNATURE.test(signature)) {
    fail("invalid_hypercore_002d_master_signature", "The wallet signature is invalid.");
  }
  const recovery = Number.parseInt(signature.slice(130, 132), 16);
  const v = recovery >= 27 ? recovery : recovery + 27;
  if (v !== 27 && v !== 28) {
    fail("invalid_hypercore_002d_master_signature", "The recovery bit is invalid.");
  }
  return {
    r: signature.slice(0, 66).toLowerCase(),
    s: `0x${signature.slice(66, 130)}`.toLowerCase(),
    v
  };
}

export async function authorizeHypercore002dAgentRegistration(requestHash) {
  return authorizeAgentRegistration({
    requestHash,
    profile: HYPERCORE_002D_HANDOFF_PROFILE,
    env: process.env,
    approvalVariable: "IPO_ONE_APPROVE_HYPERCORE_AGENT_REGISTRATION"
  });
}

async function authorizeAgentRegistration({
  requestHash,
  profile,
  env,
  approvalVariable
}) {
  const marker = `${profile.approvalMarkerPrefix}:${requestHash}`;
  if (env[approvalVariable] !== marker) {
    fail(
      "hypercore_002d_agent_approval_required",
      "The exact hash-bound agent registration approval is required."
    );
  }
  const paths = approvalPaths(requestHash, profile.approvalDirectory);
  await mkdir(dirname(paths.authorized), { recursive: true, mode: 0o700 });
  await chmod(dirname(paths.authorized), 0o700);
  const handle = await open(
    paths.authorized,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600
  );
  try {
    await handle.writeFile(`${requestHash}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return Object.freeze({
    requestHash,
    authorizationHash: hashId("hypercore_agent_registration_authorization", {
      requestHash,
      marker,
      issueId: profile.issueId,
      runId: profile.runId,
      candidateCommit: profile.candidateCommit
    }),
    oneUse: true,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "hypercore_agent_registration_authorization.v1"
  });
}

export async function authorizeAgentCreditHyperliquidRegistration({
  requestHash,
  runId,
  candidateCommit,
  env = process.env
}) {
  return authorizeAgentRegistration({
    requestHash,
    profile: createAgentCreditHyperliquidHandoffProfile({
      runId,
      candidateCommit
    }),
    env,
    approvalVariable: "IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_REGISTRATION"
  });
}

export function createHypercore002dHandoffSession({
  signerKeyPath,
  fetchImpl = fetch,
  clock = () => new Date(),
  registrationResume = null,
  profile = HYPERCORE_002D_HANDOFF_PROFILE
} = {}) {
  if (
    typeof signerKeyPath !== "string" ||
    typeof fetchImpl !== "function" ||
    typeof clock !== "function"
  ) {
    fail("invalid_hypercore_002d_handoff_configuration", "Closed handoff dependencies are required.");
  }

  let masterAddress = null;
  let accountSummary = null;
  let registrationRequest = null;
  let registrationResult = null;
  const exactResume = exactRegistrationResume(registrationResume);

  async function state() {
    return Object.freeze({
      workflowStatus: registrationResult?.status === "REGISTERED"
        ? "agent_registered"
        : registrationRequest
          ? "registration_prepared"
          : accountSummary
            ? "qualified_account_verified"
            : "awaiting_wallet",
      issueId: profile.issueId,
      runId: profile.runId,
      candidateCommit: profile.candidateCommit,
      venue: "hyperliquid",
      environment: "testnet",
      origin: "https://api.hyperliquid-testnet.xyz",
      accountAddressHash: accountSummary?.accountAddressHash ?? null,
      accountQualified: accountSummary?.qualified ?? false,
      accountBlockers: accountSummary?.blockers ?? [],
      accountValueUsd: accountSummary?.accountValueUsd ?? null,
      withdrawableUsd: accountSummary?.withdrawableUsd ?? null,
      openOrdersCount: accountSummary?.openOrdersCount ?? null,
      positionsCount: accountSummary?.positionsCount ?? null,
      signerReferenceHash: registrationRequest?.signerReferenceHash ?? null,
      apiWalletAddressHash: registrationRequest?.apiWalletAddressHash ?? null,
      registrationRequestHash: registrationRequest?.signingRequestHash ?? null,
      registrationAuthorized: registrationRequest
        ? await approved(registrationRequest.signingRequestHash, profile)
        : false,
      registrationResultHash: registrationResult?.registrationResultHash ?? null,
      safety: {
        host: HOST,
        environment: "hyperliquid_testnet",
        infoReadOnlyBeforeRegistration: true,
        agentRegistrationOnly: true,
        orderSubmissionAvailable: false,
        transfersAvailable: false,
        withdrawalsAvailable: false,
        leverageChangesAvailable: false,
        automaticRetry: false,
        walletSigningChain: "eip155:421614",
        hyperliquidSignatureChainId: "0x66eee",
        rawAddressPersisted: false,
        rawSignaturePersisted: false,
        rawResponsePersisted: false,
        mainnetAuthority: false,
        productionAuthority: false,
        realFundsAuthority: false
      },
      schemaVersion: "hypercore_002d_operational_handoff_state.v1"
    });
  }

  async function inspectMaster(input) {
    exactObject(input, ["masterAccountAddress"]);
    const candidate = address(input.masterAccountAddress);
    const [role, clearinghouse, orders] = await Promise.all([
      postJson(fetchImpl, INFO_ENDPOINT, { type: "userRole", user: candidate },
        "hypercore_002d_account_role_query_failed"),
      postJson(fetchImpl, INFO_ENDPOINT, { type: "clearinghouseState", user: candidate },
        "hypercore_002d_account_state_query_failed"),
      postJson(fetchImpl, INFO_ENDPOINT, { type: "openOrders", user: candidate },
        "hypercore_002d_open_orders_query_failed")
    ]);
    if (!role || role.role !== "user") {
      const observedRole = typeof role?.role === "string" ? role.role : "missing";
      fail(
        "hypercore_002d_master_account_required",
        `The connected address is not a Testnet master account (role: ${observedRole}).`
      );
    }
    if (
      !clearinghouse ||
      !clearinghouse.marginSummary ||
      !Array.isArray(clearinghouse.assetPositions) ||
      !Array.isArray(orders)
    ) {
      fail("invalid_hypercore_002d_info_response", "The account state is incomplete.");
    }
    const accountValue = finiteUsd(
      String(clearinghouse.marginSummary.accountValue),
      "accountValue"
    );
    const withdrawable = finiteUsd(String(clearinghouse.withdrawable), "withdrawable");
    const blockers = [];
    if (accountValue < 10) blockers.push("testnet_account_value_below_10_usdc");
    if (withdrawable < 10) blockers.push("testnet_withdrawable_below_10_usdc");
    if (clearinghouse.assetPositions.length !== 0) blockers.push("existing_positions_present");
    if (orders.length !== 0) blockers.push("existing_open_orders_present");
    masterAddress = candidate;
    accountSummary = Object.freeze({
      accountAddressHash: hashId("hypercore_account_address", candidate),
      bindingProofHash: hashId("hypercore_002d_master_account_info_proof", {
        accountAddressHash: hashId("hypercore_account_address", candidate),
        roleResponseHash: hashId("hypercore_info_response", role),
        stateResponseHash: hashId("hypercore_info_response", clearinghouse),
        ordersResponseHash: hashId("hypercore_info_response", orders),
        observedAt: clock().toISOString()
      }),
      qualified: blockers.length === 0,
      blockers,
      accountValueUsd: String(clearinghouse.marginSummary.accountValue),
      withdrawableUsd: String(clearinghouse.withdrawable),
      openOrdersCount: orders.length,
      positionsCount: clearinghouse.assetPositions.length,
      observedAt: clock().toISOString(),
      externalInfoReadPerformed: true,
      rawAddressPersisted: false,
      rawResponsePersisted: false,
      schemaVersion: "hypercore_002d_qualified_account_observation.v1"
    });
    return accountSummary;
  }

  async function prepareRegistration() {
    if (!masterAddress || !accountSummary?.qualified) {
      fail("hypercore_002d_qualified_account_required", "A qualified Testnet master account is required.");
    }
    const now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      fail("invalid_hypercore_002d_clock", "The trusted clock is invalid.");
    }
    const registrationNonce = exactResume?.nonce ?? now.getTime();
    registrationRequest = await withHypercoreIsolatedTestnetSigner(
      signerKeyPath,
      ({ descriptor, transientApiWalletAddress }) => {
        const request = createHypercoreApproveAgentSigningRequest({
          agentAddress: transientApiWalletAddress,
          agentName: profile.agentName,
          nonce: registrationNonce,
          signerReferenceHash: descriptor.signerReferenceHash,
          canonicalAccountAddressHash: accountSummary.accountAddressHash
        });
        return Object.freeze({
          ...request,
          apiWalletAddressHash: descriptor.apiWalletAddressHash,
          isolatedSignerReference: descriptor.isolatedSignerReference
        });
      }
    );
    if (
      exactResume &&
      registrationRequest.signingRequestHash !== exactResume.signingRequestHash
    ) {
      registrationRequest = null;
      fail(
        "hypercore_002d_registration_resume_mismatch",
        "The resumed registration request drifted from its exact approval."
      );
    }
    return registrationRequestView();
  }

  function registrationRequestView() {
    if (!registrationRequest) {
      fail(
        "hypercore_002d_registration_request_unavailable",
        "The registration request has not been prepared."
      );
    }
    return Object.freeze({
      signingRequestHash: registrationRequest.signingRequestHash,
      digestHash: registrationRequest.digestHash,
      actionHash: registrationRequest.actionHash,
      signerReferenceHash: registrationRequest.signerReferenceHash,
      apiWalletAddressHash: registrationRequest.apiWalletAddressHash,
      typedData: registrationRequest.typedData,
      exactApprovalMarker:
        `${profile.approvalMarkerPrefix}:${registrationRequest.signingRequestHash}`,
      issueId: profile.issueId,
      runId: profile.runId,
      candidateCommit: profile.candidateCommit,
      venue: "hyperliquid",
      environment: "testnet",
      origin: "https://api.hyperliquid-testnet.xyz",
      registrationWritePerformed: false,
      schemaVersion: "hypercore_002d_agent_registration_request_handoff.v1"
    });
  }

  async function registerAgent(input) {
    exactObject(input, ["signingRequestHash", "signature"]);
    if (
      !registrationRequest ||
      input.signingRequestHash !== registrationRequest.signingRequestHash ||
      !(await approved(registrationRequest.signingRequestHash, profile))
    ) {
      fail("hypercore_002d_agent_registration_not_authorized", "Exact registration approval is unavailable.");
    }
    const recovered = (await recoverTypedDataAddress({
      ...registrationRequest.typedData,
      signature: input.signature
    })).toLowerCase();
    if (recovered !== masterAddress) {
      fail("hypercore_002d_master_signature_mismatch", "The registration signer is not the reviewed master account.");
    }
    const paths = approvalPaths(
      registrationRequest.signingRequestHash,
      profile.approvalDirectory
    );
    await rename(paths.authorized, paths.consumed);
    await chmod(paths.consumed, 0o600);
    const requestBody = {
      action: registrationRequest.action,
      nonce: registrationRequest.nonce,
      signature: signatureParts(input.signature)
    };
    let response;
    let status = "UNKNOWN";
    try {
      response = await postJson(
        fetchImpl,
        EXCHANGE_ENDPOINT,
        requestBody,
        "hypercore_002d_agent_registration_transport_failed"
      );
      status = response?.status === "ok" ? "REGISTERED" : "REJECTED";
    } catch (error) {
      const result = {
        requestHash: registrationRequest.signingRequestHash,
        status,
        errorCode: error?.code ?? "hypercore_002d_agent_registration_unknown",
        observedAt: clock().toISOString(),
        automaticRetry: false,
        rawSignaturePersisted: false,
        rawResponsePersisted: false,
        schemaVersion: "hypercore_002d_agent_registration_result.v1"
      };
      await writeFile(paths.result, `${JSON.stringify(result)}\n`, {
        mode: 0o600,
        flag: "wx"
      });
      registrationResult = Object.freeze({
        ...result,
        registrationResultHash: hashId("hypercore_002d_agent_registration_result", result)
      });
      throw error;
    }
    const result = {
      requestHash: registrationRequest.signingRequestHash,
      status,
      responseHash: hashId("hypercore_002d_agent_registration_response", response),
      observedAt: clock().toISOString(),
      automaticRetry: false,
      rawSignaturePersisted: false,
      rawResponsePersisted: false,
      schemaVersion: "hypercore_002d_agent_registration_result.v1"
    };
    await writeFile(paths.result, `${JSON.stringify(result)}\n`, {
      mode: 0o600,
      flag: "wx"
    });
    registrationResult = Object.freeze({
      ...result,
      registrationResultHash: hashId("hypercore_002d_agent_registration_result", result)
    });
    return registrationResult;
  }

  return Object.freeze({
    state,
    inspectMaster,
    prepareRegistration,
    readRegistrationRequest: registrationRequestView,
    registerAgent
  });
}

const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IPO.ONE HYPERLIQUID-002D Handoff</title><link rel="stylesheet" href="/handoff.css"></head><body><main><p class="eyebrow">HYPERLIQUID-002D · TESTNET ONLY</p><h1>HyperCore 执行闭环</h1><p class="lead">本页只连接现有 Testnet master、读取余额/仓位，并为新 API wallet 生成精确注册请求。订单、转账、提款、杠杆、主网和真实资金全部关闭。</p><section><h2>1. 连接现有钱包</h2><div id="providers"></div><button id="connect" disabled>连接所选钱包并只读检查</button></section><section><h2>2. 准备 API wallet 注册</h2><button id="prepare" disabled>生成精确注册请求哈希</button><p class="warning">生成后会停在哈希绑定批准门，不会自动签名或调用 /exchange。</p></section><section><h2>3. 精确批准后注册</h2><button id="register" disabled>在钱包确认并注册一次</button><p class="warning">签名前会重新核验当前账户，并强制要求 Arbitrum Sepolia（chainId 421614 / 0x66eee）。</p></section><section><h2>脱敏状态</h2><pre id="output">正在初始化…</pre></section></main><script src="/handoff.js" type="module"></script></body></html>`;

function pageFor(profile) {
  return PAGE
    .replaceAll("HYPERLIQUID-002D", profile.issueId)
    .replace("HyperCore 执行闭环", profile.title);
}

const STYLE = `:root{color-scheme:dark;font:15px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;background:#060b12;color:#e5f1ff}*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:auto;padding:42px 20px 80px}h1{font:750 clamp(34px,6vw,64px)/1.02 system-ui;margin:.2em 0 .35em;letter-spacing:-.04em}h2{font:650 20px/1.2 system-ui}.eyebrow{color:#63e6be;text-transform:uppercase;letter-spacing:.13em}.lead{font:17px/1.55 system-ui;color:#cbd9ea}.warning{color:#ffd8a8}section{border:1px solid #243b55;background:#0a1421;padding:20px;margin:18px 0;border-radius:14px}button{margin:6px 9px 6px 0;padding:10px 14px;border-radius:9px;border:1px solid #3b6586;background:#102b40;color:#eff8ff;font:inherit;cursor:pointer}button:disabled{opacity:.42;cursor:not-allowed}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#040a11;padding:13px;border-radius:9px;border:1px solid #182a3b}.provider{display:block;width:100%;text-align:left}.provider.selected{outline:2px solid #63e6be}`;

const SCRIPT = `const $=id=>document.getElementById(id);const providers=new Map();const EXPECTED_SIGNING_CHAIN=421614n;let selected;let account;let request;let token;const show=(label,value)=>{$("output").textContent=label+"\\n"+JSON.stringify(value,null,2)};async function api(path,options={}){const response=await fetch(path,{credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json",...(token?{"x-handoff-token":token}:{}),...(options.headers||{})},...options});const text=await response.text();let body;try{body=text?JSON.parse(text):undefined}catch{}if(!response.ok)throw new Error(body?.message||body?.error||("HTTP "+response.status));return body}function render(){const root=$("providers");root.replaceChildren();for(const [id,item] of providers){const button=document.createElement("button");button.className="provider"+(selected===id?" selected":"");button.textContent=item.name;button.onclick=()=>{selected=id;render();$("connect").disabled=false};root.append(button)}if(!providers.size)root.textContent="未发现钱包 Provider。"}function add(id,name,provider){if(!providers.has(id)&&provider&&typeof provider.request==="function"){providers.set(id,{name,provider});render()}}window.addEventListener("eip6963:announceProvider",event=>{const info=event.detail?.info;add("eip6963:"+(info?.uuid||"unknown"),info?.name||"EIP-6963 wallet",event.detail?.provider)});window.dispatchEvent(new Event("eip6963:requestProvider"));setTimeout(()=>{if(!providers.size&&window.ethereum)add("legacy","Injected wallet",window.ethereum)},300);const provider=()=>providers.get(selected)?.provider;async function requireSigningContext(p){if(!p)throw new Error("钱包 Provider 不可用，请重新连接。");const chainId=await p.request({method:"eth_chainId"});let numericChainId;try{numericChainId=BigInt(chainId)}catch{throw new Error("钱包返回了无效的 chainId，签名已停止。")}if(numericChainId!==EXPECTED_SIGNING_CHAIN)throw new Error("签名已停止：请将钱包切换到 Arbitrum Sepolia（chainId 421614 / 0x66eee）。");const accounts=await p.request({method:"eth_accounts"});const current=accounts?.[0]?.toLowerCase();if(!current||current!==account?.toLowerCase())throw new Error("签名已停止：当前账户与已核验 Testnet master 不一致，请重新连接并检查。");return current}async function connect(){const p=provider();let accounts=await p.request({method:"eth_accounts"});if(!accounts?.length)accounts=await p.request({method:"eth_requestAccounts"});account=accounts?.[0];const summary=await api("/api/inspect-master",{method:"POST",body:JSON.stringify({masterAccountAddress:account})});$("prepare").disabled=!summary.qualified;show("Testnet master 只读检查",summary)}async function prepare(){request=await api("/api/prepare-registration",{method:"POST",body:"{}"});show("READY_FOR_EXACT_AGENT_REGISTRATION_APPROVAL",{signingRequestHash:request.signingRequestHash,digestHash:request.digestHash,actionHash:request.actionHash,signerReferenceHash:request.signerReferenceHash,apiWalletAddressHash:request.apiWalletAddressHash,exactApprovalMarker:request.exactApprovalMarker,registrationWritePerformed:false});poll()}async function poll(){if(!request)return;const state=await api("/api/state");$("register").disabled=!state.registrationAuthorized;if(!state.registrationAuthorized)setTimeout(poll,1000)}async function register(){const p=provider();await requireSigningContext(p);const signature=await p.request({method:"eth_signTypedData_v4",params:[account,JSON.stringify(request.typedData)]});$("register").disabled=true;const result=await api("/api/register-agent",{method:"POST",body:JSON.stringify({signingRequestHash:request.signingRequestHash,signature})});show("API wallet 注册结果",result)}for(const [id,fn] of Object.entries({connect,prepare,register}))$(id).onclick=()=>fn().catch(error=>show("ERROR",{message:error.message}));const initial=await api("/api/state",{headers:{}});token=initial.handoffToken;if(initial.state.workflowStatus==="registration_prepared"){request=await api("/api/registration-request");poll()}show("安全边界",initial.state.safety);`;

const SERVED_SCRIPT = SCRIPT.replace(
  'const state=await api("/api/state");$("register").disabled=!state.registrationAuthorized;if(!state.registrationAuthorized)',
  'const response=await api("/api/state");$("register").disabled=!response.state.registrationAuthorized;if(!response.state.registrationAuthorized)'
);
if (SERVED_SCRIPT === SCRIPT) {
  fail(
    "hypercore_002d_handoff_script_invariant_failed",
    "The handoff authorization polling binding is unavailable."
  );
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

function text(response, contentType, body) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "content-security-policy": "default-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; script-src 'self'; style-src 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) fail("hypercore_002d_body_too_large", "The request is too large.");
    chunks.push(chunk);
  }
  return parseStrictJson(Buffer.concat(chunks).toString("utf8") || "{}");
}

export async function createHypercore002dHandoffHost({
  port = DEFAULT_PORT,
  signerKeyPath,
  registrationResume = null,
  profile = HYPERCORE_002D_HANDOFF_PROFILE,
  session = createHypercore002dHandoffSession({
    signerKeyPath,
    registrationResume,
    profile
  })
} = {}) {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    fail("invalid_hypercore_002d_port", "The handoff port is invalid.");
  }
  await inspectHypercoreIsolatedTestnetSigner(signerKeyPath);
  const origin = `http://${HOST}:${port}`;
  const handoffToken = hashId("hypercore_002d_handoff_token", {
    origin,
    entropy: crypto.randomUUID()
  });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (request.method === "GET" && url.pathname === "/") return text(response, "text/html; charset=utf-8", pageFor(profile));
      if (request.method === "GET" && url.pathname === "/handoff.css") return text(response, "text/css; charset=utf-8", STYLE);
      if (request.method === "GET" && url.pathname === "/handoff.js") return text(response, "text/javascript; charset=utf-8", SERVED_SCRIPT);
      if (request.method === "GET" && url.pathname === "/api/state") {
        return json(response, 200, { handoffToken, state: await session.state() });
      }
      if (request.headers["x-handoff-token"] !== handoffToken) {
        return json(response, 403, { error: "hypercore_002d_handoff_token_required" });
      }
      if (request.method === "POST" && url.pathname === "/api/inspect-master") {
        return json(response, 200, await session.inspectMaster(await body(request)));
      }
      if (request.method === "POST" && url.pathname === "/api/prepare-registration") {
        exactObject(await body(request), []);
        return json(response, 200, await session.prepareRegistration());
      }
      if (request.method === "GET" && url.pathname === "/api/registration-request") {
        return json(response, 200, session.readRegistrationRequest());
      }
      if (request.method === "POST" && url.pathname === "/api/register-agent") {
        return json(response, 200, await session.registerAgent(await body(request)));
      }
      json(response, 404, { error: "not_found" });
    } catch (error) {
      json(response, 400, {
        error: error?.code ?? "hypercore_002d_handoff_failed",
        message: error?.message ?? "The handoff failed."
      });
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolveListen);
  });
  return Object.freeze({
    url: origin,
    close: () => new Promise((resolveClose, reject) =>
      server.close((error) => error ? reject(error) : resolveClose()))
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keyIndex = process.argv.indexOf("--signer-key");
  const portIndex = process.argv.indexOf("--port");
  const resumeNonceIndex = process.argv.indexOf("--registration-nonce");
  const resumeHashIndex = process.argv.indexOf("--registration-request-hash");
  const signerKeyPath = keyIndex >= 0 ? resolve(process.argv[keyIndex + 1] ?? "") : "";
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : DEFAULT_PORT;
  const registrationResume = resumeNonceIndex >= 0 || resumeHashIndex >= 0
    ? {
        nonce: Number(process.argv[resumeNonceIndex + 1]),
        signingRequestHash: process.argv[resumeHashIndex + 1] ?? ""
      }
    : null;
  const host = await createHypercore002dHandoffHost({
    port,
    signerKeyPath,
    registrationResume
  });
  process.stdout.write(`HYPERLIQUID-002D handoff ready at ${host.url}\n`);
}
