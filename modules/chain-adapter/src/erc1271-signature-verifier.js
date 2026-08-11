import {
  decodeAbiParameters,
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  hashMessage,
  verifyMessage,
  verifyTypedData
} from "viem";
import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";

const APPROVED_CHAINS = Object.freeze({
  "eip155:84532": Object.freeze({
    numericChainId: 84532,
    blockTag: "safe",
    sourceFinality: "safe",
    authenticationEligible: true,
    rpcSlots: Object.freeze({
      primary: "https://sepolia.base.org/",
      secondary: "https://base-sepolia-rpc.publicnode.com/"
    })
  }),
  "eip155:1952": Object.freeze({
    numericChainId: 1952,
    blockTag: "latest",
    sourceFinality: "inclusion_only",
    authenticationEligible: false,
    rpcSlots: Object.freeze({
      primary: "https://testrpc.xlayer.tech/terigon",
      secondary: "https://xlayertestrpc.okx.com/terigon"
    })
  })
});
const RPC_METHODS = new Set([
  "eth_call",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode"
]);
const RPC_SLOTS = Object.freeze(["primary", "secondary"]);
const RETRYABLE_CODES = new Set([
  "invalid_erc1271_rpc_response",
  "erc1271_block_reorged",
  "erc1271_block_unavailable",
  "erc1271_rpc_chain_mismatch",
  "erc1271_rpc_rate_limited",
  "erc1271_rpc_timeout",
  "erc1271_rpc_unavailable"
]);
const ERC1271_ABI = Object.freeze([Object.freeze({
  type: "function",
  name: "isValidSignature",
  stateMutability: "view",
  inputs: Object.freeze([
    Object.freeze({ name: "hash", type: "bytes32" }),
    Object.freeze({ name: "signature", type: "bytes" })
  ]),
  outputs: Object.freeze([
    Object.freeze({ name: "magicValue", type: "bytes4" })
  ])
})]);
const ERC1271_MAGIC_RESULT = `0x1626ba7e${"0".repeat(56)}`;
export const ERC6492_MAGIC_SUFFIX =
  "0x6492649264926492649264926492649264926492649264926492649264926492";
const ERC6492_WRAPPER_PARAMETERS = Object.freeze([
  Object.freeze({ name: "factory", type: "address" }),
  Object.freeze({ name: "factoryCalldata", type: "bytes" }),
  Object.freeze({ name: "originalSignature", type: "bytes" })
]);
const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const DIGEST = /^0x[0-9a-fA-F]{64}$/;
const MAXIMUM_SIGNATURE_BYTES = 4_096;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
const DEFAULT_MAXIMUM_BLOCK_AGE_MS = 15 * 60_000;
const MAXIMUM_FUTURE_BLOCK_SKEW_MS = 2 * 60_000;

function fail(code, message) {
  throw new DomainError(code, message);
}

function approvedChain(chainId) {
  const profile = APPROVED_CHAINS[chainId];
  if (!profile) {
    fail(
      "erc1271_chain_not_approved",
      "ERC-1271 verification is limited to the two approved Testnet profiles"
    );
  }
  return profile;
}

function checkedAddress(address) {
  try {
    return getAddress(address);
  } catch {
    fail("invalid_wallet_signature_input", "wallet address is invalid");
  }
}

function checkedDigest(digest) {
  if (typeof digest !== "string" || !DIGEST.test(digest)) {
    fail("invalid_wallet_signature_input", "wallet signature digest must be bytes32");
  }
  return digest.toLowerCase();
}

function checkedSignature(signature) {
  if (
    typeof signature !== "string" ||
    !HEX_DATA.test(signature) ||
    signature.length <= 2 ||
    (signature.length - 2) / 2 > MAXIMUM_SIGNATURE_BYTES
  ) {
    fail(
      "invalid_wallet_signature_input",
      "wallet signature must be non-empty hex data no larger than 4 KiB"
    );
  }
  return signature;
}

export function isErc6492Signature(signature) {
  return typeof signature === "string" &&
    signature.length > ERC6492_MAGIC_SUFFIX.length &&
    signature.toLowerCase().endsWith(ERC6492_MAGIC_SUFFIX.slice(2));
}

export function decodeErc6492Signature(signature) {
  const checked = checkedSignature(signature);
  if (!isErc6492Signature(checked)) {
    fail("invalid_erc6492_signature", "signature does not contain the ERC-6492 suffix");
  }
  const encoded = `0x${checked.slice(2, -64)}`;
  let decoded;
  try {
    decoded = decodeAbiParameters(ERC6492_WRAPPER_PARAMETERS, encoded);
  } catch {
    fail("invalid_erc6492_signature", "ERC-6492 wrapper ABI is invalid");
  }
  const [factory, factoryCalldata, originalSignature] = decoded;
  if (
    typeof factoryCalldata !== "string" ||
    !HEX_DATA.test(factoryCalldata) ||
    factoryCalldata === "0x" ||
    typeof originalSignature !== "string" ||
    !HEX_DATA.test(originalSignature) ||
    originalSignature === "0x" ||
    isErc6492Signature(originalSignature)
  ) {
    fail("invalid_erc6492_signature", "ERC-6492 wrapper fields are invalid");
  }
  let normalizedFactory;
  try {
    normalizedFactory = getAddress(factory);
  } catch {
    fail("invalid_erc6492_signature", "ERC-6492 factory address is invalid");
  }
  if (
    encodeAbiParameters(
      ERC6492_WRAPPER_PARAMETERS,
      [normalizedFactory, factoryCalldata, originalSignature]
    ).toLowerCase() !== encoded.toLowerCase()
  ) {
    fail("invalid_erc6492_signature", "ERC-6492 wrapper is not canonical ABI");
  }
  return Object.freeze({
    schemaVersion: "erc6492_signature_wrapper.v1",
    factory: normalizedFactory,
    factoryCalldata,
    originalSignature,
    factoryCalldataReferenceHash: hashId("erc6492_factory_calldata", factoryCalldata),
    originalSignatureReferenceHash: hashId("erc6492_original_signature", originalSignature),
    rawSignaturePersisted: false
  });
}

export function createErc6492OffchainVerifier({ validate } = {}) {
  if (typeof validate !== "function") {
    fail(
      "invalid_erc6492_verifier",
      "ERC-6492 offchain verifier requires one read-only validator"
    );
  }
  return Object.freeze({
    descriptor() {
      return Object.freeze({
        schemaVersion: "erc6492_offchain_verifier.v1",
        mode: "read_only_eth_call",
        maximumCallsPerChallenge: 1,
        deploymentTransactionAllowed: false,
        transactionSubmissionAllowed: false,
        statePersisted: false,
        productionApproved: false,
        fundsAuthority: false
      });
    },
    async verify(input) {
      return (await validate(input)) === true;
    }
  });
}

function checkedProofType(proofType) {
  if (!new Set(["eip191", "eip712"]).has(proofType)) {
    fail("invalid_wallet_signature_input", "wallet proof type is not approved");
  }
  return proofType;
}

function checkedVerificationInput(input) {
  const required = [
    "address",
    "chainId",
    "digest",
    "signature",
    "proofType",
    "eoaVerify"
  ];
  const allowed = new Set([...required, "requireAuthenticationEligible"]);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    required.some((key) => !Object.hasOwn(input, key)) ||
    Object.keys(input).some((key) => !allowed.has(key))
  ) {
    fail("invalid_wallet_signature_input", "wallet signature input must be one closed contract");
  }
  return input;
}

function exactApprovedUrl(chainId, providerSlot, rpcUrl) {
  const expected = approvedChain(chainId).rpcSlots[providerSlot];
  if (!expected) {
    fail("invalid_erc1271_rpc_client", "ERC-1271 provider slot is not approved");
  }
  let actual;
  try {
    actual = new URL(rpcUrl ?? expected);
  } catch {
    fail("invalid_erc1271_rpc_client", "ERC-1271 RPC URL is invalid");
  }
  if (
    actual.protocol !== "https:" ||
    actual.username ||
    actual.password ||
    actual.search ||
    actual.hash ||
    actual.href !== expected
  ) {
    fail(
      "invalid_erc1271_rpc_client",
      "ERC-1271 RPC URL must exactly match an approved Testnet endpoint"
    );
  }
  return actual.href;
}

async function boundedResponseText(response, maximumBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    fail("invalid_erc1271_rpc_response", "ERC-1271 RPC response exceeds 64 KiB");
  }
  if (!response.body?.getReader) {
    const body = await response.text();
    if (Buffer.byteLength(body) > maximumBytes) {
      fail("invalid_erc1271_rpc_response", "ERC-1271 RPC response exceeds 64 KiB");
    }
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      fail("invalid_erc1271_rpc_response", "ERC-1271 RPC response exceeds 64 KiB");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function combinedSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

export function createErc1271JsonRpcClient({
  chainId,
  providerSlot,
  rpcUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumResponseBytes = DEFAULT_MAXIMUM_RESPONSE_BYTES
}) {
  const endpoint = exactApprovedUrl(chainId, providerSlot, rpcUrl);
  if (
    typeof fetchImpl !== "function" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 250 ||
    timeoutMs > DEFAULT_TIMEOUT_MS ||
    !Number.isSafeInteger(maximumResponseBytes) ||
    maximumResponseBytes < 1_024 ||
    maximumResponseBytes > DEFAULT_MAXIMUM_RESPONSE_BYTES
  ) {
    fail("invalid_erc1271_rpc_client", "ERC-1271 RPC client bounds are invalid");
  }
  let sequence = 0;
  return Object.freeze({
    chainId,
    providerSlot,
    async call(method, params = [], { signal } = {}) {
      if (!RPC_METHODS.has(method) || !Array.isArray(params)) {
        fail(
          "erc1271_rpc_method_denied",
          "ERC-1271 RPC method is not in the closed read-only allowlist"
        );
      }
      const id = ++sequence;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          credentials: "omit",
          redirect: "error",
          signal: combinedSignal(signal, timeoutMs)
        });
      } catch (error) {
        fail(
          error?.name === "AbortError" ||
            error?.name === "TimeoutError" ||
            signal?.aborted
            ? "erc1271_rpc_timeout"
            : "erc1271_rpc_unavailable",
          "ERC-1271 RPC request failed"
        );
      }
      if (!response?.ok) {
        fail(
          response?.status === 429
            ? "erc1271_rpc_rate_limited"
            : "erc1271_rpc_unavailable",
          "ERC-1271 RPC request failed"
        );
      }
      let document;
      try {
        document = JSON.parse(
          await boundedResponseText(response, maximumResponseBytes)
        );
      } catch (error) {
        if (error instanceof DomainError) throw error;
        fail("invalid_erc1271_rpc_response", "ERC-1271 RPC returned invalid JSON");
      }
      const allowedKeys = new Set(["jsonrpc", "id", "result", "error"]);
      if (
        !document ||
        typeof document !== "object" ||
        Array.isArray(document) ||
        document.jsonrpc !== "2.0" ||
        document.id !== id ||
        Object.keys(document).some((key) => !allowedKeys.has(key)) ||
        (Object.hasOwn(document, "result") === Object.hasOwn(document, "error"))
      ) {
        fail(
          "invalid_erc1271_rpc_response",
          "ERC-1271 RPC response envelope is invalid"
        );
      }
      if (Object.hasOwn(document, "error")) {
        fail("erc1271_rpc_unavailable", "ERC-1271 RPC rejected the read-only call");
      }
      return structuredClone(document.result);
    }
  });
}

function normalizedBlock(result, {
  expectedNumber,
  now,
  maximumBlockAgeMs
}) {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    typeof result.number !== "string" ||
    !HEX_QUANTITY.test(result.number) ||
    typeof result.hash !== "string" ||
    !HASH.test(result.hash) ||
    typeof result.timestamp !== "string" ||
    !HEX_QUANTITY.test(result.timestamp)
  ) {
    fail("erc1271_block_unavailable", "ERC-1271 RPC returned an invalid block");
  }
  const number = result.number.toLowerCase();
  if (expectedNumber !== undefined && number !== expectedNumber) {
    fail("erc1271_block_reorged", "ERC-1271 verification block number changed");
  }
  const timestampMs = Number(BigInt(result.timestamp)) * 1_000;
  const nowMs = now.getTime();
  if (
    !Number.isSafeInteger(timestampMs) ||
    timestampMs < nowMs - maximumBlockAgeMs ||
    timestampMs > nowMs + MAXIMUM_FUTURE_BLOCK_SKEW_MS
  ) {
    fail("erc1271_block_unavailable", "ERC-1271 verification block is stale or future-dated");
  }
  return Object.freeze({
    number,
    numberDecimal: BigInt(number).toString(),
    hash: result.hash.toLowerCase(),
    timestamp: new Date(timestampMs).toISOString()
  });
}

function checkedCode(value) {
  if (typeof value !== "string" || !HEX_DATA.test(value)) {
    fail("invalid_erc1271_rpc_response", "ERC-1271 RPC returned malformed contract code");
  }
  return value.toLowerCase();
}

function checkedMagicValue(value) {
  if (
    typeof value !== "string" ||
    value.toLowerCase() !== ERC1271_MAGIC_RESULT
  ) {
    fail(
      "wallet_signature_verification_failed",
      "ERC-1271 contract did not return the approved magic value"
    );
  }
}

function verificationResult({
  address,
  block,
  chainId,
  digest,
  profile,
  proofType,
  providerSlot,
  signature,
  walletType
}) {
  const accountId = `${chainId}:${address.toLowerCase()}`;
  return Object.freeze({
    schemaVersion: "wallet_signature_verification.v1",
    accountHash: hashId("wallet_account", { accountId }),
    blockNumber: block.numberDecimal,
    blockHash: block.hash,
    chainId,
    providerSlot,
    sourceFinality: profile.sourceFinality,
    walletType,
    signatureType: walletType === "contract"
      ? "erc1271"
      : walletType === "counterfactual"
        ? "erc6492"
        : "eoa",
    verificationMethod: walletType === "contract"
      ? `eip1271_${proofType}_v1`
      : walletType === "counterfactual"
        ? `eip6492_${proofType}_v1`
        : `${proofType}_eoa_v1`,
    challengeReferenceHash: hashId("wallet_signature_challenge", digest),
    signatureReferenceHash: hashId("wallet_signature", signature),
    authenticationEligible: profile.authenticationEligible,
    rawSignaturePersisted: false,
    credentialsIncluded: false,
    productionFundsMoved: false
  });
}

async function verifyErc6492AtProvider({
  address,
  chainId,
  client,
  counterfactualVerifier,
  digest,
  maximumBlockAgeMs,
  now,
  onCounterfactualCall,
  proofType,
  signature,
  signal,
  wrapper
}) {
  const profile = approvedChain(chainId);
  const reportedChainId = await client.call("eth_chainId", [], { signal });
  if (
    typeof reportedChainId !== "string" ||
    !HEX_QUANTITY.test(reportedChainId) ||
    BigInt(reportedChainId) !== BigInt(profile.numericChainId)
  ) {
    fail("erc1271_rpc_chain_mismatch", "ERC-6492 RPC returned the wrong chain");
  }
  const block = normalizedBlock(
    await client.call("eth_getBlockByNumber", [profile.blockTag, false], { signal }),
    { now, maximumBlockAgeMs }
  );
  onCounterfactualCall();
  let readOnlyCalls = 0;
  const valid = await counterfactualVerifier.verify(Object.freeze({
    schemaVersion: "erc6492_offchain_verification_input.v1",
    address,
    chainId,
    digest,
    factory: wrapper.factory,
    factoryCalldata: wrapper.factoryCalldata,
    originalSignature: wrapper.originalSignature,
    blockNumber: block.numberDecimal,
    async readOnlyCall(call) {
      if (
        readOnlyCalls !== 0 ||
        !call ||
        typeof call !== "object" ||
        Array.isArray(call) ||
        Object.keys(call).some((key) => !new Set(["data", "to"]).has(key)) ||
        typeof call.data !== "string" ||
        !HEX_DATA.test(call.data) ||
        call.data === "0x" ||
        (call.data.length - 2) / 2 > DEFAULT_MAXIMUM_RESPONSE_BYTES ||
        (call.to !== undefined && (() => {
          try { getAddress(call.to); return false; } catch { return true; }
        })())
      ) {
        fail("erc6492_call_denied", "ERC-6492 verifier call is outside the read-only bound");
      }
      readOnlyCalls += 1;
      return client.call(
        "eth_call",
        [{ ...(call.to === undefined ? {} : { to: getAddress(call.to) }), data: call.data }, block.number],
        { signal }
      );
    },
    rawSignaturePersisted: false,
    transactionSubmissionAllowed: false,
    deploymentTransactionAllowed: false
  }));
  if (valid !== true || readOnlyCalls !== 1) {
    fail(
      "wallet_signature_verification_failed",
      "ERC-6492 counterfactual signature verification failed"
    );
  }
  const revalidated = normalizedBlock(
    await client.call("eth_getBlockByNumber", [block.number, false], { signal }),
    { expectedNumber: block.number, now, maximumBlockAgeMs }
  );
  if (revalidated.hash !== block.hash) {
    fail("erc1271_block_reorged", "ERC-6492 verification block hash changed");
  }
  return verificationResult({
    address,
    block,
    chainId,
    digest,
    profile,
    proofType,
    providerSlot: client.providerSlot,
    signature,
    walletType: "counterfactual"
  });
}

async function verifyAtProvider({
  address,
  chainId,
  client,
  digest,
  eoaVerify,
  maximumBlockAgeMs,
  now,
  onContractCall,
  proofType,
  signature,
  signal
}) {
  const profile = approvedChain(chainId);
  const reportedChainId = await client.call("eth_chainId", [], { signal });
  if (
    typeof reportedChainId !== "string" ||
    !HEX_QUANTITY.test(reportedChainId) ||
    BigInt(reportedChainId) !== BigInt(profile.numericChainId)
  ) {
    fail("erc1271_rpc_chain_mismatch", "ERC-1271 RPC returned the wrong chain");
  }
  const block = normalizedBlock(
    await client.call(
      "eth_getBlockByNumber",
      [profile.blockTag, false],
      { signal }
    ),
    { now, maximumBlockAgeMs }
  );
  const code = checkedCode(
    await client.call("eth_getCode", [address, block.number], { signal })
  );
  let walletType;
  if (code === "0x") {
    walletType = "eoa";
    let valid = false;
    try {
      valid = await eoaVerify();
    } catch {
      valid = false;
    }
    if (valid !== true) {
      fail("wallet_signature_verification_failed", "EOA wallet signature is invalid");
    }
  } else {
    walletType = "contract";
    onContractCall();
    const data = encodeFunctionData({
      abi: ERC1271_ABI,
      functionName: "isValidSignature",
      args: [digest, signature]
    });
    checkedMagicValue(
      await client.call("eth_call", [{ to: address, data }, block.number], {
        signal
      })
    );
  }
  const revalidated = normalizedBlock(
    await client.call(
      "eth_getBlockByNumber",
      [block.number, false],
      { signal }
    ),
    { expectedNumber: block.number, now, maximumBlockAgeMs }
  );
  if (revalidated.hash !== block.hash) {
    fail("erc1271_block_reorged", "ERC-1271 verification block hash changed");
  }
  return verificationResult({
    address,
    block,
    chainId,
    digest,
    profile,
    proofType,
    providerSlot: client.providerSlot,
    signature,
    walletType
  });
}

export class EvmWalletSignatureVerifier {
  constructor({
    fetchImpl = globalThis.fetch,
    clock = () => new Date(),
    maximumBlockAgeMs = DEFAULT_MAXIMUM_BLOCK_AGE_MS,
    counterfactualVerifier
  } = {}) {
    if (
      typeof fetchImpl !== "function" ||
      typeof clock !== "function" ||
      !Number.isSafeInteger(maximumBlockAgeMs) ||
      maximumBlockAgeMs < 60_000 ||
      maximumBlockAgeMs > 60 * 60_000
    ) {
      fail(
        "invalid_erc1271_verifier",
        "ERC-1271 wallet signature verifier configuration is invalid"
      );
    }
    if (counterfactualVerifier !== undefined) {
      const boundary = counterfactualVerifier?.descriptor?.();
      if (
        typeof counterfactualVerifier?.verify !== "function" ||
        boundary?.schemaVersion !== "erc6492_offchain_verifier.v1" ||
        boundary.mode !== "read_only_eth_call" ||
        boundary.maximumCallsPerChallenge !== 1 ||
        boundary.deploymentTransactionAllowed !== false ||
        boundary.transactionSubmissionAllowed !== false ||
        boundary.statePersisted !== false ||
        boundary.fundsAuthority !== false
      ) {
        fail("invalid_erc6492_verifier", "ERC-6492 verifier boundary is invalid");
      }
    }
    this.clock = clock;
    this.maximumBlockAgeMs = maximumBlockAgeMs;
    this.counterfactualVerifier = counterfactualVerifier;
    this.clients = Object.fromEntries(
      Object.keys(APPROVED_CHAINS).map((chainId) => [
        chainId,
        RPC_SLOTS.map((providerSlot) =>
          createErc1271JsonRpcClient({ chainId, providerSlot, fetchImpl })
        )
      ])
    );
    Object.freeze(this.clients);
    Object.freeze(this);
  }

  async verifyDigest(input) {
    const {
      address,
      chainId,
      digest,
      signature,
      proofType,
      eoaVerify,
      requireAuthenticationEligible = true
    } = checkedVerificationInput(input);
    const normalizedAddress = checkedAddress(address);
    const normalizedDigest = checkedDigest(digest);
    const normalizedSignature = checkedSignature(signature);
    const normalizedProofType = checkedProofType(proofType);
    approvedChain(chainId);
    if (
      typeof eoaVerify !== "function" ||
      typeof requireAuthenticationEligible !== "boolean"
    ) {
      fail("invalid_wallet_signature_input", "EOA verification callback is required");
    }
    const wrapper = isErc6492Signature(normalizedSignature)
      ? decodeErc6492Signature(normalizedSignature)
      : undefined;
    if (wrapper && this.counterfactualVerifier === undefined) {
      fail(
        "erc6492_verifier_unavailable",
        "ERC-6492 verification requires a reviewed read-only offchain verifier"
      );
    }
    let contractCallAttempted = false;
    let counterfactualCallAttempted = false;
    let lastError;
    for (const client of this.clients[chainId]) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      try {
        const result = wrapper
          ? await verifyErc6492AtProvider({
              address: normalizedAddress,
              chainId,
              client,
              counterfactualVerifier: this.counterfactualVerifier,
              digest: normalizedDigest,
              maximumBlockAgeMs: this.maximumBlockAgeMs,
              now: this.clock(),
              onCounterfactualCall() {
                if (counterfactualCallAttempted) {
                  fail(
                    "erc6492_call_limit_exceeded",
                    "only one ERC-6492 verification call is allowed per challenge"
                  );
                }
                counterfactualCallAttempted = true;
              },
              proofType: normalizedProofType,
              signal: controller.signal,
              signature: normalizedSignature,
              wrapper
            })
          : await verifyAtProvider({
              address: normalizedAddress,
              chainId,
              client,
              digest: normalizedDigest,
              eoaVerify,
              maximumBlockAgeMs: this.maximumBlockAgeMs,
              now: this.clock(),
              onContractCall() {
                if (contractCallAttempted) {
                  fail(
                    "erc1271_call_limit_exceeded",
                    "only one ERC-1271 verification call is allowed per challenge"
                  );
                }
                contractCallAttempted = true;
              },
              proofType: normalizedProofType,
              signal: controller.signal,
              signature: normalizedSignature
            });
        if (
          requireAuthenticationEligible &&
          result.authenticationEligible !== true
        ) {
          fail(
            "wallet_signature_finality_ineligible",
            "inclusion-only contract verification cannot authorize authentication"
          );
        }
        return result;
      } catch (error) {
        lastError = error;
        if (
          contractCallAttempted ||
          counterfactualCallAttempted ||
          !RETRYABLE_CODES.has(error?.code) ||
          client === this.clients[chainId].at(-1)
        ) {
          throw error;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  verifyMessage({ address, chainId, message, signature }) {
    const caip2 = `eip155:${chainId}`;
    return this.verifyDigest({
      address,
      chainId: caip2,
      digest: hashMessage(message),
      signature,
      proofType: "eip191",
      eoaVerify: () => verifyMessage({ address, message, signature })
    });
  }

  verifyTypedData({
    address,
    chainId,
    digest,
    signature,
    typedData
  }) {
    return this.verifyDigest({
      address,
      chainId,
      digest,
      signature,
      proofType: "eip712",
      eoaVerify: () => verifyTypedData({
        address,
        ...typedData,
        signature
      })
    });
  }
}

export function describeErc1271VerificationBoundary() {
  return Object.freeze({
    schemaVersion: "erc1271_verification_boundary.v1",
    chains: Object.freeze(Object.keys(APPROVED_CHAINS)),
    rpcMethods: Object.freeze([...RPC_METHODS].sort()),
    maximumProviderAttempts: 2,
    maximumAttemptMs: DEFAULT_TIMEOUT_MS,
    maximumResponseBytes: DEFAULT_MAXIMUM_RESPONSE_BYTES,
    maximumSignatureBytes: MAXIMUM_SIGNATURE_BYTES,
    maximumContractCallsPerChallenge: 1,
    maximumCounterfactualCallsPerChallenge: 1,
    acceptedMagicValue: "0x1626ba7e",
    erc6492MagicSuffix: ERC6492_MAGIC_SUFFIX,
    erc6492RequiresConfiguredOffchainVerifier: true,
    erc6492DeploymentTransactionAllowed: false,
    xLayerAuthenticationEligible: false,
    arbitraryRpc: false,
    transactionsAllowed: false,
    productionApproved: false,
    fundsAuthority: false
  });
}
