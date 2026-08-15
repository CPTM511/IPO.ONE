import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HypercoreExecutionActionKind,
  IsolatedHypercoreTypedDataSigner,
  compileHypercoreExecutionAction,
  computeOfficialHyperliquidActionHash,
  createHypercoreApproveAgentExchangePayload,
  createHypercoreApproveAgentSigningRequest,
  createHypercoreL1SigningRequest,
  verifyHypercoreOfficialSigningRequest
} from "../src/index.js";

const OFFICIAL_VECTOR_PRIVATE_KEY =
  "0x0123456789012345678901234567890123456789012345678901234567890123";
const OFFICIAL_VECTOR_ACCOUNT = privateKeyToAccount(OFFICIAL_VECTOR_PRIVATE_KEY);

function h(scope) {
  return hashId("hypercore_002c_signing_test", { scope });
}

function preparedOrder() {
  return compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.ORDER,
    action: {
      assetIndex: 0,
      side: "buy",
      limitPx: "50000",
      size: "0.0001",
      reduceOnly: false,
      timeInForce: "Alo",
      cloid: "0x00000000000000000000000000000001"
    },
    sourceActionHash: h("source"),
    policyDecisionHash: h("policy"),
    riskSnapshotHash: h("risk"),
    accountBindingHash: h("binding"),
    delegateHash: h("delegate")
  });
}

test("official Python SDK MessagePack action hashes match published vectors", () => {
  assert.equal(
    computeOfficialHyperliquidActionHash({
      action: {
        type: "order",
        orders: [{
          a: 4,
          b: true,
          p: "1670.1",
          s: "0.0147",
          r: false,
          t: { limit: { tif: "Ioc" } }
        }],
        grouping: "na"
      },
      vaultAddress: null,
      nonce: 1677777606040,
      expiresAfter: null
    }),
    "0x0fcbeda5ae3c4950a548021552a4fea2226858c4453571bf3f24ba017eac2908"
  );
});

test("official Python SDK Testnet L1 signature vector matches exactly", async () => {
  const actionHash = computeOfficialHyperliquidActionHash({
    action: { type: "dummy", num: 100000000000 },
    vaultAddress: null,
    nonce: 0,
    expiresAfter: null
  });
  const signature = await OFFICIAL_VECTOR_ACCOUNT.signTypedData({
    domain: {
      name: "Exchange",
      version: "1",
      chainId: 1337,
      verifyingContract: "0x0000000000000000000000000000000000000000"
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" }
      ]
    },
    primaryType: "Agent",
    message: {
      source: "b",
      connectionId: actionHash
    }
  });
  assert.equal(
    signature,
    "0x542af61ef1f429707e3c76c5293c80d01f74ef853e34b76efffcb57e574f9510" +
      "17b8b32f086e8cdede991f1e2c529f5dd5297cbe8128500e00cbaf766204a613" +
      "1c"
  );
});

test("closed L1 request binds the prepared action, subaccount and expiry", () => {
  const request = createHypercoreL1SigningRequest({
    preparedAction: preparedOrder(),
    signerReferenceHash: h("signer"),
    canonicalAccountAddressHash: h("account"),
    vaultAddress: "0x1719884eb866cb12b2287399b15f7db5e7d775ea",
    nonce: 1786130409000,
    expiresAfter: 1786130439000
  });
  assert.equal(verifyHypercoreOfficialSigningRequest(request), true);
  assert.equal(request.scheme, "l1_action");
  assert.equal(request.typedData.message.source, "b");
  assert.equal(request.digestHash, hashTypedData(request.typedData));
  assert.equal(request.rawKeyAccepted, false);
  assert.equal(request.rawSignaturePersisted, false);
  assert.equal(request.fundsAuthority, false);
});

test("approveAgent typed data is Testnet-only and wallet-transport compatible", async () => {
  const request = createHypercoreApproveAgentSigningRequest({
    agentAddress: OFFICIAL_VECTOR_ACCOUNT.address.toLowerCase(),
    agentName: "ipo1-proof-002c",
    nonce: 1786130409000,
    signerReferenceHash: h("master_signer"),
    canonicalAccountAddressHash: h("master_account")
  });
  assert.equal(verifyHypercoreOfficialSigningRequest(request), true);
  assert.equal(request.scheme, "user_signed_action");
  assert.equal(request.action.type, "approveAgent");
  assert.equal(request.action.hyperliquidChain, "Testnet");
  assert.equal(request.action.signatureChainId, "0x66eee");
  assert.equal(request.typedData.domain.chainId, 421614);
  assert.equal(request.typedData.primaryType, "HyperliquidTransaction:ApproveAgent");
  assert.deepEqual(request.typedData.types.EIP712Domain, [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" }
  ]);
  const canonicalTypes = {
    "HyperliquidTransaction:ApproveAgent":
      request.typedData.types["HyperliquidTransaction:ApproveAgent"]
  };
  assert.equal(
    request.digestHash,
    hashTypedData({ ...request.typedData, types: canonicalTypes })
  );
  const signature = await OFFICIAL_VECTOR_ACCOUNT.signTypedData(request.typedData);
  assert.equal(
    (await recoverTypedDataAddress({ ...request.typedData, signature })).toLowerCase(),
    OFFICIAL_VECTOR_ACCOUNT.address.toLowerCase()
  );
  assert.equal(Object.hasOwn(request, "privateKey"), false);
});

test("approveAgent exactly matches the offline Python SDK 0.24.0 oracle", async () => {
  const oracle = JSON.parse(await readFile(
    new URL("./fixtures/hyperliquid-python-sdk-0.24.0-approve-agent.json", import.meta.url),
    "utf8"
  ));
  const master = privateKeyToAccount(`0x${"01".repeat(32)}`);
  const request = createHypercoreApproveAgentSigningRequest({
    agentAddress: oracle.apiWalletAddress,
    agentName: oracle.agentName,
    nonce: oracle.nonce,
    signerReferenceHash: h("python_sdk_0_24_0_signer"),
    canonicalAccountAddressHash: h("python_sdk_0_24_0_master")
  });
  assert.deepEqual(request.action, oracle.action);
  assert.equal(request.action.nonce, request.nonce);
  assert.deepEqual(request.typedData.domain, {
    name: "HyperliquidSignTransaction",
    version: "1",
    chainId: 421614,
    verifyingContract: "0x0000000000000000000000000000000000000000"
  });
  assert.deepEqual(
    request.typedData.types["HyperliquidTransaction:ApproveAgent"],
    [
      { name: "hyperliquidChain", type: "string" },
      { name: "agentAddress", type: "address" },
      { name: "agentName", type: "string" },
      { name: "nonce", type: "uint64" }
    ]
  );
  assert.equal(request.digestHash, oracle.digestHash);
  const signature = await master.signTypedData(request.typedData);
  assert.equal(signature, oracle.signatureHex);
  assert.equal(
    (await recoverTypedDataAddress({ ...request.typedData, signature })).toLowerCase(),
    oracle.recoveredAddress
  );
  assert.deepEqual(
    createHypercoreApproveAgentExchangePayload({
      signingRequest: request,
      signature
    }),
    oracle.postBody
  );
});

test("approveAgent rejects names outside the official named-wallet boundary", () => {
  assert.throws(() => createHypercoreApproveAgentSigningRequest({
    agentAddress: OFFICIAL_VECTOR_ACCOUNT.address.toLowerCase(),
    agentName: "ipo-one-credit-001",
    nonce: 1786130409000,
    signerReferenceHash: h("too_long_signer"),
    canonicalAccountAddressHash: h("too_long_master")
  }), { code: "invalid_hypercore_official_signing_input" });
});

test("isolated signer recovers the exact approved identity and returns no raw key", async () => {
  const request = createHypercoreL1SigningRequest({
    preparedAction: preparedOrder(),
    signerReferenceHash: h("signer"),
    canonicalAccountAddressHash: h("account"),
    nonce: 1786130409000,
    expiresAfter: 1786130439000
  });
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "test_vector_isolated_signer",
    expectedSignerAddress: OFFICIAL_VECTOR_ACCOUNT.address.toLowerCase(),
    signTypedData: (typedData) => OFFICIAL_VECTOR_ACCOUNT.signTypedData(typedData)
  });
  const result = await signer.sign(request);
  assert.equal(result.signingRequestHash, request.signingRequestHash);
  assert.equal(result.signature.v === 27 || result.signature.v === 28, true);
  assert.equal(result.rawKeyAccepted, false);
  assert.equal(result.rawKeyPersisted, false);
  assert.equal(result.rawSignaturePersisted, false);
  assert.equal(Object.hasOwn(result, "privateKey"), false);
  assert.equal(signer.profile.keyExportable, false);
});

test("signer identity drift and attempted key injection fail closed", async () => {
  const request = createHypercoreL1SigningRequest({
    preparedAction: preparedOrder(),
    signerReferenceHash: h("signer"),
    canonicalAccountAddressHash: h("account"),
    nonce: 1786130409000,
    expiresAfter: 1786130439000
  });
  const wrong = privateKeyToAccount(
    "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  );
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "wrong_test_signer",
    expectedSignerAddress: OFFICIAL_VECTOR_ACCOUNT.address.toLowerCase(),
    signTypedData: (typedData) => wrong.signTypedData(typedData)
  });
  await assert.rejects(() => signer.sign(request), {
    code: "hypercore_signer_identity_mismatch"
  });
  assert.throws(
    () => new IsolatedHypercoreTypedDataSigner({
      signerId: "injected_key_signer",
      expectedSignerAddress: OFFICIAL_VECTOR_ACCOUNT.address.toLowerCase(),
      signTypedData: () => "0x",
      privateKey: OFFICIAL_VECTOR_PRIVATE_KEY
    }),
    { code: "invalid_hypercore_signer_configuration" }
  );
});
