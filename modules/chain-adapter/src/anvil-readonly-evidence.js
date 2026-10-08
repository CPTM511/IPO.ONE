import {
  decodeEventLog, decodeFunctionResult, encodeFunctionData, encodeFunctionResult,
  encodeAbiParameters, encodeEventTopics, getAbiItem, keccak256, toEventSelector
} from "viem";
import {
  DomainError, FinalityStatus, createEvidenceEnvelope, hashId
} from "../../../packages/domain/src/index.js";
import {
  ANVIL_ABI_VERSION, ANVIL_EVENT_ABI, ANVIL_IMPLEMENTATION_SLOT,
  ANVIL_READ_ABI, ANVIL_SOURCE_REVISION
} from "./anvil-readonly-abi.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const TOPICS = new Set(ANVIL_EVENT_ABI.map(toEventSelector));
const METHODS = new Set([
  "eth_chainId", "eth_getTransactionReceipt", "eth_getBlockByHash",
  "eth_getBlockByNumber", "eth_getStorageAt", "eth_getCode", "eth_call"
]);

function fail(code, message) {
  throw new DomainError(`anvil_${code}`, message);
}

function isHex(value, pattern) {
  return typeof value === "string" && pattern.test(value);
}

function hex(value, pattern, name) {
  if (!isHex(value, pattern)) {
    fail("invalid_input", `${name} has an invalid format`);
  }
  return value.toLowerCase();
}

function data(value, maxBytes = 16_384) {
  if (typeof value !== "string" || value.length > 2 + maxBytes * 2 ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    fail("invalid_data", "Contract data is malformed or exceeds its bound");
  }
  return value.toLowerCase();
}

function ref(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(value)) {
    fail("invalid_profile", "Source references must be opaque identifiers without URLs or credentials");
  }
  return value;
}

function uint96(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,28}$/.test(value) ||
      BigInt(value) >= 2n ** 96n) fail("invalid_loc_id", "LOC ID must be a positive uint96 decimal string");
  return value;
}

function profileFrom(input) {
  if (!input || typeof input.chainId !== "string" || !/^eip155:[1-9][0-9]{0,14}$/.test(input.chainId) ||
      input.contractVersion !== "3.0.0" ||
      input.sourceRevision !== ANVIL_SOURCE_REVISION ||
      !["synthetic", "public_readonly"].includes(input.dataMode)) {
    fail("invalid_profile", "An exact chain, data mode and pinned V3 source profile are required");
  }
  const result = {
    chainId: input.chainId,
    contractAddress: hex(input.contractAddress, ADDRESS, "contractAddress"),
    implementationAddress: hex(input.implementationAddress, ADDRESS, "implementationAddress"),
    implementationCodeHash: hex(input.implementationCodeHash, HASH, "implementationCodeHash"),
    contractVersion: input.contractVersion,
    sourceRevision: input.sourceRevision,
    dataMode: input.dataMode,
    sourceRef: ref(input.sourceRef),
    deploymentVerificationRef: ref(input.deploymentVerificationRef)
  };
  if (result.contractAddress === ZERO_ADDRESS || result.implementationAddress === ZERO_ADDRESS) {
    fail("invalid_profile", "Proxy and implementation addresses must be nonzero");
  }
  return Object.freeze(result);
}

function blockFrom(input) {
  if (!input || typeof input !== "object") fail("invalid_block", "A complete block is required");
  const timestamp = BigInt(hex(input.timestamp, QUANTITY, "block timestamp"));
  if (timestamp > 253402300799n) fail("invalid_block", "Block timestamp is outside the ISO range");
  return {
    hash: hex(input.hash, HASH, "block hash"),
    numberHex: hex(input.number, QUANTITY, "block number"),
    number: BigInt(input.number).toString(),
    occurredAt: new Date(Number(timestamp) * 1000).toISOString()
  };
}

function factsFrom(decoded) {
  const facts = {};
  for (const [key, value] of Object.entries(decoded)) {
    if (key === "tag") {
      data(value, 512);
      facts.tagHash = keccak256(value);
      facts.tagByteLength = String((value.length - 2) / 2);
    } else if (typeof value === "bigint" || typeof value === "number") {
      facts[key] = value.toString();
    } else if (typeof value === "string") {
      facts[key] = value.toLowerCase();
    } else fail("decode_failed", "Unsupported decoded contract field");
  }
  return facts;
}

// Explicit import only: no runtime registration, endpoint, persistence or signer.
export function createAnvilReadonlyEvidenceAdapter({ enabled = false, profile, rpc, timeoutMs = 5_000, clock = () => new Date().toISOString() } = {}) {
  if (enabled !== true && enabled !== false) fail("invalid_config", "enabled must be a boolean");
  if (!enabled) return Object.freeze({
    getDescriptor: () => ({ adapterId: "anvil_readonly", enabled: false, reason: "anvil_disabled" }),
    async observeTransaction() { fail("disabled", "Anvil evidence is disabled"); },
    async readLOC() { fail("disabled", "Anvil evidence is disabled"); }
  });
  const config = profileFrom(profile);
  if (typeof rpc?.call !== "function" || typeof clock !== "function" || !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 10 || timeoutMs > 15_000) fail("invalid_config", "A bounded read-only RPC port is required");

  async function call(method, params = []) {
    if (!METHODS.has(method)) fail("method_denied", "RPC method is outside the read-only allowlist");
    const timeoutError = new DomainError("anvil_rpc_timeout", "Read-only RPC timed out");
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => rpc.call(method, params)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(timeoutError), timeoutMs);
        })
      ]);
    } catch (error) {
      if (error === timeoutError) throw timeoutError;
      fail("rpc_unavailable", "Read-only RPC failed");
    } finally { clearTimeout(timer); }
  }

  async function checkBlock(block) {
    const canonical = blockFrom(await call("eth_getBlockByNumber", [block.numberHex, false]));
    if (canonical.hash !== block.hash || canonical.number !== block.number || canonical.occurredAt !== block.occurredAt) {
      fail("reorg", "The observed block is no longer canonical");
    }
  }

  async function verify(block) {
    const chainId = hex(await call("eth_chainId"), QUANTITY, "RPC chain ID");
    if (`eip155:${BigInt(chainId)}` !== config.chainId) fail("chain_mismatch", "RPC chain differs from the configured chain");
    await checkBlock(block);
    const at = { blockHash: block.hash, requireCanonical: true };
    const slot = hex(await call("eth_getStorageAt", [config.contractAddress, ANVIL_IMPLEMENTATION_SLOT, at]), HASH, "implementation slot");
    if (slot.slice(2, 26) !== "0".repeat(24) || `0x${slot.slice(-40)}` !== config.implementationAddress) {
      fail("version_mismatch", "Proxy implementation differs from the reviewed profile");
    }
    const code = data(await call("eth_getCode", [config.implementationAddress, at]), 49_152);
    if (code === "0x" || keccak256(code) !== config.implementationCodeHash) {
      fail("version_mismatch", "Implementation bytecode differs from the reviewed profile");
    }
    return at;
  }

  function observation({ kind, locId, transactionHash = null, logIndex = null, block, facts }) {
    const core = {
      schemaVersion: "anvil_readonly_observation.v1",
      adapterId: "anvil_readonly", abiVersion: ANVIL_ABI_VERSION,
      chainId: config.chainId, contractAddress: config.contractAddress,
      locId, transactionHash, logIndex,
      blockNumber: block.number, blockHash: block.hash, occurredAt: block.occurredAt,
      contractVersion: config.contractVersion, sourceRevision: config.sourceRevision,
      sourceRef: config.sourceRef, deploymentVerificationRef: config.deploymentVerificationRef,
      implementationAddress: config.implementationAddress,
      implementationCodeHash: config.implementationCodeHash,
      versionVerification: "block_end_bytecode_match",
      dataMode: config.dataMode, observationStatus: "included",
      finality: "unverified", reconciliation: "unreconciled",
      businessSemantics: "unknown", creditDecisionEligible: false,
      mappingStatus: "unmapped", kind, facts
    };
    if (kind === "getLOC") core.stateInterpretation = {
      tag: "event_only_not_stored",
      perLocFactors: "deprecated_not_current_global_configuration",
      creationHistory: "not_established_by_snapshot",
      zeroTuple: "absent_or_deleted"
    };
    const observationId = hashId("anvil_observation", core);
    const observedAt = clock();
    if (typeof observedAt !== "string" || !ISO_TIMESTAMP.test(observedAt) ||
        !Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt ||
        Date.parse(observedAt) < Date.parse(block.occurredAt)) {
      fail("invalid_clock", "Observation clock must return a canonical UTC ISO timestamp at or after block time");
    }
    const tupleId = hashId("anvil_external_tuple", {
      chainId: config.chainId, contractAddress: config.contractAddress,
      transactionHash, logIndex, ...(kind === "getLOC" ? { locId, blockHash: block.hash } : {})
    });
    return {
      ...core, observationId, tupleId, observedAt: new Date(observedAt).toISOString(),
      evidence: createEvidenceEnvelope({
        eventId: observationId, eventType: "external.anvil.fact_observed",
        aggregateType: "ExternalLOCObservation", aggregateId: tupleId, aggregateVersion: 1,
        actorRef: "adapter:anvil_readonly",
        sourceSystem: config.dataMode === "synthetic" ? "anvil_synthetic_fixture" : "anvil_public_contract",
        sourceFinality: FinalityStatus.PENDING,
        payload: core, occurredAt: block.occurredAt, recordedAt: observedAt
      })
    };
  }

  return Object.freeze({
    getDescriptor: () => ({ adapterId: "anvil_readonly", enabled: true, ...config, abiVersion: ANVIL_ABI_VERSION }),
    async observeTransaction(transactionHash) {
      const tx = hex(transactionHash, HASH, "transaction hash");
      const receipt = await call("eth_getTransactionReceipt", [tx]);
      if (!receipt || receipt.status !== "0x1" || !isHex(receipt.transactionHash, HASH) || receipt.transactionHash.toLowerCase() !== tx ||
          !Array.isArray(receipt.logs) || receipt.logs.length > 512) {
        fail("invalid_receipt", "A successful bounded receipt for the exact transaction is required");
      }
      const block = blockFrom(await call("eth_getBlockByHash", [hex(receipt.blockHash, HASH, "receipt block hash"), false]));
      if (block.hash !== receipt.blockHash.toLowerCase() || block.numberHex !== hex(receipt.blockNumber, QUANTITY, "receipt block number")) {
        fail("invalid_receipt", "Receipt and block disagree");
      }
      await verify(block);
      const results = [];
      const seen = new Set();
      for (const log of receipt.logs) {
        if (!isHex(log?.address, ADDRESS)) fail("invalid_log", "Receipt log must identify its emitting contract");
        if (log.address.toLowerCase() !== config.contractAddress) continue;
        if (log.removed !== false || !isHex(log.blockHash, HASH) || log.blockHash.toLowerCase() !== block.hash ||
            !isHex(log.transactionHash, HASH) || log.transactionHash.toLowerCase() !== tx ||
            hex(log.blockNumber, QUANTITY, "log block number") !== block.numberHex ||
            !Array.isArray(log.topics) || log.topics.length > 4) {
          fail("invalid_log", "Contract log provenance is inconsistent or removed");
        }
        const topics = log.topics.map((value) => hex(value, HASH, "event topic"));
        if (!TOPICS.has(topics[0])) fail("unsupported_event", "Contract event is outside the pinned V3 LOC allowlist");
        const logIndex = BigInt(hex(log.logIndex, QUANTITY, "log index")).toString();
        if (seen.has(logIndex)) fail("duplicate_log", "Receipt has a duplicate contract log index");
        seen.add(logIndex);
        let decoded;
        try {
          const eventData = data(log.data);
          decoded = decodeEventLog({ abi: ANVIL_EVENT_ABI, topics, data: eventData, strict: true });
          const expectedTopics = encodeEventTopics({ abi: ANVIL_EVENT_ABI, eventName: decoded.eventName, args: decoded.args });
          const parameters = getAbiItem({ abi: ANVIL_EVENT_ABI, name: decoded.eventName }).inputs.filter((item) => !item.indexed);
          const expectedData = encodeAbiParameters(parameters, parameters.map(({ name }) => decoded.args[name]));
          if (JSON.stringify(topics) !== JSON.stringify(expectedTopics) || eventData !== expectedData) {
            fail("decode_failed", "Event encoding is not canonical");
          }
        }
        catch { fail("decode_failed", "Event does not match the pinned ABI"); }
        results.push(observation({
          kind: decoded.eventName, locId: uint96(decoded.args.id.toString()),
          transactionHash: tx, logIndex, block, facts: factsFrom(decoded.args)
        }));
      }
      await checkBlock(block);
      return results.sort((a, b) => BigInt(a.logIndex) < BigInt(b.logIndex) ? -1 : 1);
    },
    async readLOC({ locId, blockHash } = {}) {
      const id = uint96(locId);
      const requestedHash = hex(blockHash, HASH, "requested block hash");
      const block = blockFrom(await call("eth_getBlockByHash", [requestedHash, false]));
      if (block.hash !== requestedHash) fail("invalid_block", "RPC returned a different block");
      const at = await verify(block);
      const result = data(await call("eth_call", [{
        to: config.contractAddress,
        data: encodeFunctionData({ abi: ANVIL_READ_ABI, functionName: "getLOC", args: [BigInt(id)] })
      }, at]), 384);
      if (result.length !== 2 + 384 * 2) fail("decode_failed", "getLOC must return exactly twelve ABI words");
      let decoded;
      try {
        decoded = decodeFunctionResult({ abi: ANVIL_READ_ABI, functionName: "getLOC", data: result });
        if (encodeFunctionResult({ abi: ANVIL_READ_ABI, functionName: "getLOC", result: decoded }) !== result) {
          fail("decode_failed", "getLOC encoding is not canonical");
        }
      }
      catch { fail("decode_failed", "getLOC result does not match the pinned ABI"); }
      await checkBlock(block);
      const facts = factsFrom(decoded);
      facts.recordPresence = Object.values(facts).every((value) => value === "0" || value === ZERO_ADDRESS)
        ? "absent_or_deleted" : "present";
      return observation({ kind: "getLOC", locId: id, block, facts });
    }
  });
}
