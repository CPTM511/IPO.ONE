import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashTypedData } from "viem";
import {
  compileMinimalErc1271TestWallet,
  materializeMinimalErc1271TestWalletRuntime
} from "../compile-erc1271-test-wallet.mjs";
import { createMinimalErc1271DeploymentHandoff } from "../erc1271-deployment-handoff.mjs";
import {
  normalizeWallet003OwnerEcdsaSignature,
  wallet003Eip712Transport
} from "../start-erc1271-human-handoff.mjs";

const NOW = new Date("2026-07-24T03:00:00.000Z");
const OWNER = "0x1111111111111111111111111111111111111111";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const TRANSACTION_HASH = `0x${"44".repeat(32)}`;
const BLOCK_HASH = `0x${"55".repeat(32)}`;

test("human handoff canonicalizes only approved ECDSA recovery-byte variants", () => {
  const body = "44".repeat(64);
  assert.equal(
    normalizeWallet003OwnerEcdsaSignature(`0x${body}00`),
    `0x${body}1b`
  );
  assert.equal(
    normalizeWallet003OwnerEcdsaSignature(`0x${body}01`),
    `0x${body}1c`
  );
  assert.equal(
    normalizeWallet003OwnerEcdsaSignature(`0x${body}1b`),
    `0x${body}1b`
  );
  assert.throws(
    () => normalizeWallet003OwnerEcdsaSignature(`0x${body}02`),
    /owner signature recovery byte is invalid/
  );
  assert.throws(
    () => normalizeWallet003OwnerEcdsaSignature("0x01"),
    /65-byte ECDSA/
  );
});

test("human handoff sends injected OKX a string with an explicit EIP712Domain", async () => {
  const source = await readFile(
    new URL("../start-erc1271-human-handoff.mjs", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /eth_signTypedData_v4",params:\[account,JSON\.stringify\(c\.typedData\)\]/
  );
  const typedData = {
    domain: {
      name: "IPO.ONE Agent Account Binding",
      version: "1.1",
      chainId: 84532
    },
    types: {
      AgentAccountBindingProof: [
        { name: "tenantHash", type: "bytes32" },
        { name: "subjectHash", type: "bytes32" },
        { name: "accountHash", type: "bytes32" },
        { name: "purpose", type: "string" },
        { name: "nonce", type: "bytes32" },
        { name: "issuedAt", type: "uint256" },
        { name: "expiresAt", type: "uint256" },
        { name: "protocolVersion", type: "string" }
      ]
    },
    primaryType: "AgentAccountBindingProof",
    message: {
      tenantHash: `0x${"11".repeat(32)}`,
      subjectHash: `0x${"22".repeat(32)}`,
      accountHash: `0x${"33".repeat(32)}`,
      purpose: "primary",
      nonce: `0x${"44".repeat(32)}`,
      issuedAt: "1784862000",
      expiresAt: "1784862300",
      protocolVersion: "1.1"
    }
  };
  const transport = wallet003Eip712Transport(typedData);
  assert.deepEqual(transport.types.EIP712Domain, [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" }
  ]);
  assert.doesNotThrow(() => JSON.stringify(transport));
  assert.equal(hashTypedData(transport), hashTypedData(typedData));
});

function decision() {
  return {
    schemaVersion: "wallet_003_erc1271_deployment_decision.v1",
    decisionId: "WALLET-003-ERC1271-DEPLOY-001",
    decision: "APPROVE",
    approverRole: "IPO.ONE Founder",
    approvedAt: "2026-07-23T11:00:00.000Z",
    approvalExpiresAt: "2026-09-22T23:59:59.999Z",
    decisionPackSha256:
      "4d015b8f0d3a91ba1fc8397496449698d25fa80dbaba340cc9262c09c7d915ae",
    amendedAt: "2026-07-24T02:32:21.327Z",
    decisionAmendmentSha256:
      "179768eae10af3004b3c980677bc20554625226cd1c24800dc8274511edf7d9e",
    chainId: "eip155:84532",
    ownerAddress: OWNER,
    deployerAddress: OWNER,
    contractExpiresAt: "2026-07-30T11:59:59.000Z",
    caps: {
      deploymentCount: 1,
      transactionValueWei: "0",
      gasLimit: 500000,
      maxFeePerGasWei: "5000000000",
      maximumFaucetBalanceWei: "1000000000000000000"
    },
    e2e: { humanEip191: true, agentEip712: true },
    roles: {
      humanWalletOperator: "IPO.ONE Founder",
      deployerOperator: "IPO.ONE Founder",
      evidenceCustodian: "IPO.ONE Founder",
      credentialDestructionOwner: "IPO.ONE Founder"
    },
    artifact: {
      sourceSha256:
        "sha256:d622a3c841ec5d022ae3aa1dec312459da3492b5897e4bc05532a4e214190787",
      creationBytecodeKeccak256:
        "0xfc8b0043879c1f3868149fb616a1f11f939b4c96f423d18265f5be46a24217d2",
      deployedBytecodeKeccak256:
        "0x24fbe2a0332e8b875babde91f1995ceab8e0fb500b66de8047658adca0459de1"
    },
    deploymentAuthorized: true,
    productionFundsMoved: false
  };
}

async function fixture({ transactionOverrides = {} } = {}) {
  const artifact = await compileMinimalErc1271TestWallet();
  const instance = materializeMinimalErc1271TestWalletRuntime({
    artifact,
    ownerAddress: OWNER,
    expiresAt: decision().contractExpiresAt
  });
  let deploymentInput;
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    const result = (() => {
      switch (request.method) {
        case "eth_chainId":
          return "0x14a34";
        case "eth_getBlockByNumber":
          return {
            number: "0x64",
            hash: BLOCK_HASH,
            timestamp: "0x6979ca80"
          };
        case "eth_getBalance":
          return "0x2386f26fc10000";
        case "eth_getCode":
          return request.params[0] === OWNER
            ? "0x"
            : instance.deployedBytecode;
        case "eth_gasPrice":
          return "0x5b8d80";
        case "eth_call":
          deploymentInput = request.params[0].data;
          return instance.deployedBytecode;
        case "eth_estimateGas":
          deploymentInput = request.params[0].data;
          return "0x30d40";
        case "eth_getTransactionByHash":
          return {
            from: OWNER,
            to: null,
            input: deploymentInput,
            value: "0x0",
            gas: "0x3a980",
            maxFeePerGas: "0xb71b00",
            ...transactionOverrides
          };
        case "eth_getTransactionReceipt":
          return {
            status: "0x1",
            contractAddress: CONTRACT,
            blockNumber: "0x60",
            blockHash: BLOCK_HASH
          };
        default:
          throw new Error(`Unexpected RPC method: ${request.method}`);
      }
    })();
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const handoff = await createMinimalErc1271DeploymentHandoff({
    decision: decision(),
    fetchImpl,
    clock: () => NOW
  });
  return { handoff, instance };
}

test("human handoff builds one bounded unsigned deployment and keeps calldata out of inspection", async () => {
  const { handoff, instance } = await fixture();
  const inspection = await handoff.inspect();

  assert.equal(inspection.constructorSimulationMatched, true);
  assert.equal(inspection.deployerClassifiedAsEoa, true);
  assert.equal(inspection.balanceWithinCap, true);
  assert.equal(JSON.stringify(inspection).includes(artifactPrefix()), false);

  const unsigned = await handoff.buildUnsignedTransaction();
  assert.equal(unsigned.transaction.from, OWNER);
  assert.equal(unsigned.transaction.value, "0x0");
  assert.equal(unsigned.transaction.to, undefined);
  assert.equal(BigInt(unsigned.transaction.gas) <= 500000n, true);
  assert.equal(BigInt(unsigned.transaction.maxFeePerGas) <= 5000000000n, true);
  assert.equal(
    unsigned.expectedInstanceDeployedBytecodeKeccak256,
    instance.deployedBytecodeKeccak256
  );
  assert.equal(unsigned.transactionSigned, false);
  assert.equal(unsigned.transactionBroadcast, false);
});

test("safe observation verifies exact deployment transaction and instance code", async () => {
  const { handoff, instance } = await fixture();
  await handoff.buildUnsignedTransaction();
  const observed = await handoff.observe(TRANSACTION_HASH);

  assert.equal(observed.status, "verified_safe");
  assert.equal(observed.contractAddress, CONTRACT);
  assert.equal(observed.transactionValueWei, "0");
  assert.equal(
    observed.deployedBytecodeKeccak256,
    instance.deployedBytecodeKeccak256
  );
  assert.equal(observed.productionFundsMoved, false);
});

test("observation rejects a mined transaction whose value drifted", async () => {
  const { handoff } = await fixture({
    transactionOverrides: { value: "0x1" }
  });
  await handoff.buildUnsignedTransaction();
  await assert.rejects(
    handoff.observe(TRANSACTION_HASH),
    (error) => error.code === "erc1271_deployment_transaction_drift"
  );
});

function artifactPrefix() {
  return "6080604052";
}
