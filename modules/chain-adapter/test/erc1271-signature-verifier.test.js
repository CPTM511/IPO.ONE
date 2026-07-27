import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { hashMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  EvmWalletSignatureVerifier,
  createErc1271JsonRpcClient,
  describeErc1271VerificationBoundary
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const verificationSchema = JSON.parse(await readFile(
  new URL(
    "../../../schemas/v2/wallet-signature-verification.schema.json",
    import.meta.url
  ),
  "utf8"
));
const validateVerification = new Ajv2020({
  allErrors: true,
  strict: true
}).compile(verificationSchema);

const NOW = new Date("2026-07-23T08:00:00.000Z");
const BLOCK_HASH = `0x${"22".repeat(32)}`;
const REORG_HASH = `0x${"33".repeat(32)}`;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const MAGIC_RESULT = `0x1626ba7e${"0".repeat(56)}`;
const CONTRACT_SIGNATURE = `0x${"44".repeat(65)}`;
const PRIVATE_KEY = `0x${"11".repeat(32)}`;

function jsonRpc(result, id, { status = 200 } = {}) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    {
      status,
      headers: { "content-type": "application/json" }
    }
  );
}

function rpcFixture({
  chainId = 84532,
  code = "0x",
  magic = MAGIC_RESULT,
  failPrimaryBeforeCall = false,
  failContractCall = false,
  malformedCode = false,
  reorg = false
} = {}) {
  const requests = [];
  const blockReads = new Map();
  const fetchImpl = async (url, options) => {
    const request = JSON.parse(options.body);
    const provider = url.includes("publicnode") ||
      url.includes("xlayertestrpc.okx.com")
      ? "secondary"
      : "primary";
    requests.push({
      provider,
      method: request.method,
      params: structuredClone(request.params)
    });
    if (failPrimaryBeforeCall && provider === "primary") {
      return new Response("unavailable", { status: 503 });
    }
    if (request.method === "eth_chainId") {
      return jsonRpc(`0x${chainId.toString(16)}`, request.id);
    }
    if (request.method === "eth_getBlockByNumber") {
      const key = `${provider}:${request.params[0]}`;
      const count = (blockReads.get(key) ?? 0) + 1;
      blockReads.set(key, count);
      return jsonRpc({
        number: "0x123",
        hash: reorg && request.params[0] === "0x123"
          ? REORG_HASH
          : BLOCK_HASH,
        timestamp: `0x${Math.floor(NOW.getTime() / 1_000).toString(16)}`
      }, request.id);
    }
    if (request.method === "eth_getCode") {
      return jsonRpc(malformedCode ? "not-hex" : code, request.id);
    }
    if (request.method === "eth_call") {
      if (failContractCall) {
        return new Response("unavailable", { status: 503 });
      }
      assert.equal(request.params[0].to.toLowerCase(), CONTRACT.toLowerCase());
      assert.match(request.params[0].data, /^0x1626ba7e[0-9a-f]+$/);
      assert.equal(request.params[1], "0x123");
      return jsonRpc(magic, request.id);
    }
    throw new Error(`unexpected method ${request.method}`);
  };
  return { fetchImpl, requests };
}

function verifier(fixture) {
  return new EvmWalletSignatureVerifier({
    fetchImpl: fixture.fetchImpl,
    clock: () => NOW
  });
}

function assertValid(result) {
  assert.equal(
    validateVerification(result),
    true,
    JSON.stringify(validateVerification.errors)
  );
  assert.equal(result.rawSignaturePersisted, false);
  assert.equal(result.credentialsIncluded, false);
  assert.equal(result.productionFundsMoved, false);
  assert.equal(JSON.stringify(result).includes(CONTRACT_SIGNATURE), false);
}

test("approved boundary is read-only, Testnet-only, bounded, and non-authorizing", () => {
  const boundary = describeErc1271VerificationBoundary();
  assert.deepEqual(boundary.chains, ["eip155:84532", "eip155:1952"]);
  assert.deepEqual(boundary.rpcMethods, [
    "eth_call",
    "eth_chainId",
    "eth_getBlockByNumber",
    "eth_getCode"
  ]);
  assert.equal(boundary.maximumProviderAttempts, 2);
  assert.equal(boundary.maximumAttemptMs, 5_000);
  assert.equal(boundary.maximumResponseBytes, 65_536);
  assert.equal(boundary.maximumSignatureBytes, 4_096);
  assert.equal(boundary.maximumContractCallsPerChallenge, 1);
  assert.equal(boundary.transactionsAllowed, false);
  assert.equal(boundary.productionApproved, false);
  assert.equal(boundary.fundsAuthority, false);
});

test("RPC client rejects unapproved endpoints, mainnet, write methods, and oversized responses", async () => {
  assert.throws(
    () => createErc1271JsonRpcClient({
      chainId: "eip155:1",
      providerSlot: "primary"
    }),
    /erc1271_chain_not_approved/
  );
  assert.throws(
    () => createErc1271JsonRpcClient({
      chainId: "eip155:84532",
      providerSlot: "primary",
      rpcUrl: "https://example.com/"
    }),
    /must exactly match/
  );
  const client = createErc1271JsonRpcClient({
    chainId: "eip155:84532",
    providerSlot: "primary",
    maximumResponseBytes: 1_024,
    fetchImpl: async (_url, options) => {
      const { id } = JSON.parse(options.body);
      return jsonRpc("x".repeat(2_048), id);
    }
  });
  await assert.rejects(
    client.call("eth_sendRawTransaction", []),
    /erc1271_rpc_method_denied/
  );
  await assert.rejects(
    client.call("eth_chainId", []),
    /invalid_erc1271_rpc_response/
  );
  const timeoutClient = createErc1271JsonRpcClient({
    chainId: "eip155:84532",
    providerSlot: "primary",
    fetchImpl: async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    }
  });
  await assert.rejects(
    timeoutClient.call("eth_chainId", []),
    (error) => error.code === "erc1271_rpc_timeout"
  );
});

test("Base Sepolia explicitly classifies and verifies an EOA at one revalidated safe block", async () => {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const message = "IPO.ONE WALLET-003 EOA proof";
  const signature = await account.signMessage({ message });
  const fixture = rpcFixture();
  const result = await verifier(fixture).verifyMessage({
    address: account.address,
    chainId: 84532,
    message,
    signature
  });

  assertValid(result);
  assert.equal(result.walletType, "eoa");
  assert.equal(result.verificationMethod, "eip191_eoa_v1");
  assert.equal(result.chainId, "eip155:84532");
  assert.equal(result.sourceFinality, "safe");
  assert.equal(result.authenticationEligible, true);
  assert.deepEqual(
    fixture.requests.map(({ method }) => method),
    [
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_getBlockByNumber"
    ]
  );
  assert.equal(fixture.requests[1].params[0], "safe");
  assert.equal(fixture.requests[2].params[1], "0x123");
  assert.equal(fixture.requests[3].params[0], "0x123");
});

test("Base Sepolia contract wallet uses ERC-1271 once and never invokes EOA fallback", async () => {
  const fixture = rpcFixture({ code: "0x6001600055" });
  let eoaCalls = 0;
  const result = await verifier(fixture).verifyDigest({
    address: CONTRACT,
    chainId: "eip155:84532",
    digest: hashMessage("IPO.ONE WALLET-003 contract proof"),
    signature: CONTRACT_SIGNATURE,
    proofType: "eip191",
    eoaVerify: async () => {
      eoaCalls += 1;
      return true;
    }
  });

  assertValid(result);
  assert.equal(result.walletType, "contract");
  assert.equal(result.verificationMethod, "eip1271_eip191_v1");
  assert.equal(eoaCalls, 0);
  assert.equal(
    fixture.requests.filter(({ method }) => method === "eth_call").length,
    1
  );
});

test("provider failover is bounded to two slots before an ERC-1271 call", async () => {
  const fixture = rpcFixture({
    code: "0x6001600055",
    failPrimaryBeforeCall: true
  });
  const result = await verifier(fixture).verifyDigest({
    address: CONTRACT,
    chainId: "eip155:84532",
    digest: hashMessage("failover"),
    signature: CONTRACT_SIGNATURE,
    proofType: "eip191",
    eoaVerify: async () => false
  });

  assert.equal(result.providerSlot, "secondary");
  assert.equal(fixture.requests[0].provider, "primary");
  assert.equal(fixture.requests.at(-1).provider, "secondary");
  assert.equal(
    fixture.requests.filter(({ method }) => method === "eth_call").length,
    1
  );
});

test("contract call failure is not replayed against a second provider", async () => {
  const fixture = rpcFixture({
    code: "0x6001600055",
    failContractCall: true
  });
  await assert.rejects(
    verifier(fixture).verifyDigest({
      address: CONTRACT,
      chainId: "eip155:84532",
      digest: hashMessage("single-call"),
      signature: CONTRACT_SIGNATURE,
      proofType: "eip191",
      eoaVerify: async () => false
    }),
    /erc1271_rpc_unavailable/
  );
  assert.equal(
    fixture.requests.filter(({ method }) => method === "eth_call").length,
    1
  );
  assert.equal(
    fixture.requests.some(({ provider }) => provider === "secondary"),
    false
  );
});

test("wrong magic, malformed code, block reorg, and wrong chain fail closed", async () => {
  for (const [options, pattern] of [
    [{ code: "0x6001", magic: `0xffffffff${"0".repeat(56)}` }, /approved magic value/],
    [{ malformedCode: true }, /malformed contract code/],
    [{ code: "0x6001", reorg: true }, /block hash changed/],
    [{ chainId: 1 }, /wrong chain/]
  ]) {
    const fixture = rpcFixture(options);
    await assert.rejects(
      verifier(fixture).verifyDigest({
        address: CONTRACT,
        chainId: "eip155:84532",
        digest: hashMessage("fail-closed"),
        signature: CONTRACT_SIGNATURE,
        proofType: "eip191",
        eoaVerify: async () => false
      }),
      pattern
    );
  }
});

test("X Layer result is inclusion-only and cannot authorize live authentication", async () => {
  const fixture = rpcFixture({ chainId: 1952, code: "0x6001" });
  const input = {
    address: CONTRACT,
    chainId: "eip155:1952",
    digest: hashMessage("x-layer-conformance"),
    signature: CONTRACT_SIGNATURE,
    proofType: "eip191",
    eoaVerify: async () => false
  };
  await assert.rejects(
    verifier(fixture).verifyDigest(input),
    /wallet_signature_finality_ineligible/
  );

  const conformanceFixture = rpcFixture({ chainId: 1952, code: "0x6001" });
  const result = await verifier(conformanceFixture).verifyDigest({
    ...input,
    requireAuthenticationEligible: false
  });
  assertValid(result);
  assert.equal(result.sourceFinality, "inclusion_only");
  assert.equal(result.authenticationEligible, false);
  assert.equal(conformanceFixture.requests[1].params[0], "latest");
});
