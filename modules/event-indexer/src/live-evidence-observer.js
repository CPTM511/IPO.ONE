import { decodeEventLog, getAddress, parseAbi } from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  ChainObservationStatus,
  SandboxChainAdapter
} from "../../chain-adapter/src/index.js";
import { createBoundedJsonRpcClient } from "./bounded-json-rpc.js";
import { resolveApprovedRpc } from "./live-testnet-config.js";

export const SANDBOX_EVIDENCE_EMITTER_ABI = parseAbi([
  "event SandboxEvidenceEmitted(bytes32 indexed evidenceHash, bytes32 indexed obligationHash, bytes32 indexed paymentHash, bytes32 runIdHash, uint32 sequence)",
  "event SandboxEmitterPaused(uint32 emissionCount)",
  "event SandboxEmitterRetired(uint32 emissionCount)",
  "function retired() view returns (bool)",
  "function emissionCount() view returns (uint32)"
]);

const HEX_32 = /^0x[0-9a-f]{64}$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const INPUT_KEYS = new Set([
  "transactionHash", "contractAddress", "obligationId", "paymentId",
  "assetId", "amountMinor", "evidenceHash", "runId"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function exactInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) return false;
  const keys = Object.keys(descriptors);
  return keys.length === INPUT_KEYS.size && keys.every((key) => INPUT_KEYS.has(key));
}

function quantity(value, name) {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value)) {
    fail("invalid_rpc_response", `${name} is not a canonical RPC quantity`);
  }
  return BigInt(value);
}

function hex32(value, name) {
  if (typeof value !== "string" || !HEX_32.test(value)) {
    fail("invalid_rpc_response", `${name} is not a 32-byte hash`);
  }
  return value.toLowerCase();
}

function blockFromRpc(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_rpc_response", `${name} block is unavailable`);
  }
  return {
    number: quantity(value.number, `${name}.number`),
    hash: hex32(value.hash, `${name}.hash`),
    timestamp: quantity(value.timestamp, `${name}.timestamp`)
  };
}

function statusFor({ config, eventBlock, latestBlock, safeBlock, finalizedBlock }) {
  const confirmations = latestBlock >= eventBlock
    ? Number(latestBlock - eventBlock + 1n)
    : 0;
  if (!Number.isSafeInteger(confirmations) || confirmations < 1) {
    fail("rpc_chain_head_inconsistent", "testnet chain head precedes the observed event");
  }
  if (config.finalityMode === "rpc_safe_finalized_tags") {
    if (finalizedBlock !== undefined && eventBlock <= finalizedBlock && confirmations >= 4) {
      return { observationStatus: ChainObservationStatus.FINALIZED, confirmations };
    }
    if (safeBlock !== undefined && eventBlock <= safeBlock && confirmations >= 2) {
      return { observationStatus: ChainObservationStatus.SAFE, confirmations };
    }
  }
  return { observationStatus: ChainObservationStatus.INCLUDED, confirmations };
}

export function createLiveTestnetObserver({
  chainId,
  providerSlot = "primary",
  rpcUrl,
  fetchImpl,
  clock = () => new Date()
}) {
  const resolved = resolveApprovedRpc({ chainId, providerSlot, rpcUrl });
  const rpc = createBoundedJsonRpcClient({
    rpcUrl: resolved.rpcUrl,
    fetchImpl,
    timeoutMs: resolved.config.profile.requestPolicy.timeoutMs
  });
  const adapter = new SandboxChainAdapter({ profile: resolved.config.profile });

  async function assertRemoteChain() {
    const remote = quantity(await rpc.call("eth_chainId"), "chainId");
    if (remote !== BigInt(resolved.config.numericChainId)) {
      fail("rpc_chain_id_mismatch", "testnet RPC does not match the approved CAIP-2 profile");
    }
  }

  return Object.freeze({
    async readHead() {
      await assertRemoteChain();
      const latest = blockFromRpc(await rpc.call("eth_getBlockByNumber", ["latest", false]), "latest");
      return Object.freeze({
        chainId,
        providerSlot,
        blockNumber: latest.number.toString(),
        blockHash: latest.hash,
        blockTimestamp: new Date(Number(latest.timestamp) * 1_000).toISOString(),
        observedAt: clock().toISOString(),
        networkCallsMade: 2,
        readOnly: true,
        liveTestnetObservation: true,
        productionFundsMoved: false,
        schemaVersion: "live_testnet_head_observation.v1"
      });
    },

    async readEvidence(input) {
      if (!exactInput(input)) fail("invalid_live_evidence_query", "live Evidence query must use the closed contract");
      if (!HEX_32.test(input.transactionHash) || !HEX_32.test(input.evidenceHash) || !ADDRESS.test(input.contractAddress)) {
        fail("invalid_live_evidence_query", "live Evidence identifiers are invalid");
      }
      for (const name of ["obligationId", "paymentId", "assetId", "amountMinor", "runId"]) {
        if (typeof input[name] !== "string" || input[name].length < 1 || input[name].length > 256) {
          fail("invalid_live_evidence_query", "live Evidence identifiers are invalid");
        }
      }
      await assertRemoteChain();
      const receipt = await rpc.call("eth_getTransactionReceipt", [input.transactionHash.toLowerCase()]);
      if (
        !receipt || receipt.status !== "0x1" ||
        receipt.transactionHash?.toLowerCase() !== input.transactionHash.toLowerCase() ||
        receipt.to?.toLowerCase() !== input.contractAddress.toLowerCase() ||
        !Array.isArray(receipt.logs) || receipt.logs.length > 64
      ) fail("invalid_emitter_receipt", "testnet emitter transaction receipt is invalid");
      const expectedAddress = getAddress(input.contractAddress);
      const matching = [];
      for (const log of receipt.logs) {
        if (typeof log?.address !== "string" || log.address.toLowerCase() !== expectedAddress.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: SANDBOX_EVIDENCE_EMITTER_ABI,
            data: log.data,
            topics: log.topics,
            strict: true
          });
          if (decoded.eventName === "SandboxEvidenceEmitted") matching.push({ log, args: decoded.args });
        } catch {
          // Ignore other bounded logs from the exact emitter address.
        }
      }
      if (matching.length !== 1) fail("invalid_emitter_receipt", "exactly one sandbox Evidence event is required");
      const [{ log, args }] = matching;
      const expected = {
        evidenceHash: input.evidenceHash.toLowerCase(),
        obligationHash: hashId("testnet_obligation_reference", { obligationId: input.obligationId }),
        paymentHash: hashId("testnet_payment_reference", { paymentId: input.paymentId }),
        runIdHash: hashId("testnet_run_id", { runId: input.runId })
      };
      if (
        args.evidenceHash.toLowerCase() !== expected.evidenceHash ||
        args.obligationHash.toLowerCase() !== expected.obligationHash ||
        args.paymentHash.toLowerCase() !== expected.paymentHash ||
        args.runIdHash.toLowerCase() !== expected.runIdHash ||
        Number(args.sequence) < 1 || Number(args.sequence) > 4
      ) fail("emitter_evidence_mismatch", "testnet event does not match the expected offchain Evidence binding");

      const eventBlock = quantity(receipt.blockNumber, "receipt.blockNumber");
      const blockHash = hex32(receipt.blockHash, "receipt.blockHash");
      const latest = blockFromRpc(await rpc.call("eth_getBlockByNumber", ["latest", false]), "latest");
      let safe;
      let finalized;
      let networkCallsMade = 3;
      if (resolved.config.finalityMode === "rpc_safe_finalized_tags") {
        safe = blockFromRpc(await rpc.call("eth_getBlockByNumber", ["safe", false]), "safe");
        finalized = blockFromRpc(await rpc.call("eth_getBlockByNumber", ["finalized", false]), "finalized");
        networkCallsMade += 2;
      }
      const finality = statusFor({
        config: resolved.config,
        eventBlock,
        latestBlock: latest.number,
        safeBlock: safe?.number,
        finalizedBlock: finalized?.number
      });
      const block = blockFromRpc(await rpc.call("eth_getBlockByNumber", [receipt.blockNumber, false]), "event");
      networkCallsMade += 1;
      if (block.hash !== blockHash) fail("emitter_block_reorged", "testnet event block hash changed during observation");
      const observation = {
        chainId,
        transactionHash: input.transactionHash.toLowerCase(),
        eventOrdinal: Number(quantity(log.logIndex, "log.logIndex")),
        blockNumber: eventBlock.toString(),
        blockHash,
        obligationId: input.obligationId,
        paymentId: input.paymentId,
        assetId: input.assetId,
        amountMinor: input.amountMinor,
        ...finality,
        observedAt: new Date(Number(block.timestamp) * 1_000).toISOString()
      };
      const proof = adapter.normalizeObservation(observation);
      const evidence = adapter.createPaymentEvidence(proof);
      return Object.freeze({
        observation: Object.freeze(structuredClone(observation)),
        proof: Object.freeze(structuredClone(proof)),
        evidence: Object.freeze(structuredClone(evidence)),
        eventBinding: Object.freeze({ ...expected, sequence: Number(args.sequence) }),
        providerSlot,
        networkCallsMade,
        readOnly: true,
        liveTestnetObservation: true,
        productionFundsMoved: false,
        rawProviderPayloadPersisted: false,
        schemaVersion: "live_testnet_evidence_observation.v1"
      });
    }
  });
}
