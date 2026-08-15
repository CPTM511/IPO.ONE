import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress
} from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  BaseSepoliaEvidenceAnchorAdapter,
  EVIDENCE_ANCHOR_REGISTRY_ABI
} from "../../chain-adapter/src/index.js";
import { createBoundedJsonRpcClient } from "./bounded-json-rpc.js";
import { resolveApprovedRpc } from "./live-testnet-config.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const CHAIN_ID = "eip155:84532";
const INPUT_KEYS = new Set([
  "transactionHash",
  "contractAddress",
  "expectedAnchors"
]);
const EXPECTED_KEYS = new Set([
  "evidenceHash",
  "eventTypeHash",
  "aggregateRefHash",
  "actionDigest",
  "attestorAccountId",
  "nonce",
  "batchOrdinal",
  "batchSize"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function exactObject(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.size &&
    ownKeys.every((key) => typeof key === "string" && keys.has(key)) &&
    ownKeys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.get && !descriptor?.set;
    })
  );
}

function quantity(value, name) {
  if (typeof value !== "string" || !QUANTITY.test(value)) {
    fail("invalid_evidence_anchor_rpc", `${name} is not a canonical quantity`);
  }
  return BigInt(value);
}

function hash(value, name) {
  if (typeof value !== "string" || !HASH.test(value.toLowerCase())) {
    fail("invalid_evidence_anchor_rpc", `${name} is not a bytes32 hash`);
  }
  return value.toLowerCase();
}

function block(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_evidence_anchor_rpc", `${name} block is unavailable`);
  }
  return Object.freeze({
    number: quantity(value.number, `${name}.number`),
    hash: hash(value.hash, `${name}.hash`),
    timestamp: quantity(value.timestamp, `${name}.timestamp`)
  });
}

function normalizeExpected(input) {
  if (
    !exactObject(input, INPUT_KEYS) ||
    !HASH.test(input.transactionHash ?? "") ||
    !ADDRESS.test(input.contractAddress ?? "") ||
    !Array.isArray(input.expectedAnchors) ||
    input.expectedAnchors.length < 1 ||
    input.expectedAnchors.length > 16
  ) {
    fail("invalid_evidence_anchor_query", "Evidence anchor query is invalid");
  }
  const contractAddress = getAddress(input.contractAddress);
  const expectedAnchors = input.expectedAnchors.map((item, index) => {
    if (
      !exactObject(item, EXPECTED_KEYS) ||
      !HASH.test(item.evidenceHash ?? "") ||
      !HASH.test(item.eventTypeHash ?? "") ||
      !HASH.test(item.aggregateRefHash ?? "") ||
      !HASH.test(item.actionDigest ?? "") ||
      !/^eip155:84532:0x[0-9a-fA-F]{40}$/.test(item.attestorAccountId ?? "") ||
      !Number.isSafeInteger(item.nonce) ||
      item.nonce < 0 ||
      item.batchOrdinal !== index ||
      item.batchSize !== input.expectedAnchors.length
    ) {
      fail("invalid_evidence_anchor_query", "expected Evidence anchor is invalid");
    }
    return Object.freeze({
      ...item,
      evidenceHash: item.evidenceHash.toLowerCase(),
      eventTypeHash: item.eventTypeHash.toLowerCase(),
      aggregateRefHash: item.aggregateRefHash.toLowerCase(),
      actionDigest: item.actionDigest.toLowerCase(),
      attestorAddress: getAddress(item.attestorAccountId.split(":").at(-1))
    });
  });
  if (
    new Set(expectedAnchors.map(({ evidenceHash }) => evidenceHash)).size !==
      expectedAnchors.length ||
    new Set(expectedAnchors.map(({ actionDigest }) => actionDigest)).size !== 1 ||
    new Set(expectedAnchors.map(({ attestorAddress }) => attestorAddress)).size !== 1 ||
    new Set(expectedAnchors.map(({ nonce }) => nonce)).size !== 1
  ) {
    fail("invalid_evidence_anchor_query", "Evidence anchor batch binding is invalid");
  }
  return Object.freeze({
    transactionHash: input.transactionHash.toLowerCase(),
    contractAddress,
    expectedAnchors: Object.freeze(expectedAnchors)
  });
}

function finalityStatus({ eventBlock, latest, safe, finalized }) {
  const confirmations = latest >= eventBlock
    ? Number(latest - eventBlock + 1n)
    : 0;
  if (!Number.isSafeInteger(confirmations) || confirmations < 1) {
    fail("evidence_anchor_chain_head_inconsistent", "chain head precedes the Evidence anchor");
  }
  if (finalized !== undefined && eventBlock <= finalized && confirmations >= 4) {
    return Object.freeze({ status: "finalized", confirmations });
  }
  if (safe !== undefined && eventBlock <= safe && confirmations >= 2) {
    return Object.freeze({ status: "safe", confirmations });
  }
  return Object.freeze({ status: "included", confirmations });
}

function observation({
  expected,
  transactionHash,
  contractAddress,
  providerSlot,
  status,
  confirmations,
  observedAt,
  blockNumber,
  blockHash,
  logIndex,
  anchoredAt
}) {
  const core = {
    chainId: CHAIN_ID,
    transactionHash,
    contractAddress,
    evidenceHash: expected.evidenceHash,
    status,
    confirmations,
    ...(blockNumber === undefined ? {} : { blockNumber }),
    ...(blockHash === undefined ? {} : { blockHash }),
    ...(logIndex === undefined ? {} : { logIndex }),
    ...(anchoredAt === undefined ? {} : { anchoredAt }),
    observedAt,
    providerSlot,
    rawProviderPayloadPersisted: false,
    sandboxOnly: true,
    productionFundsMoved: false
  };
  return Object.freeze({
    ...core,
    finalityProofHash: hashId("evidence_anchor_finality_proof", core),
    schemaVersion: "evidence_anchor_live_observation.v1"
  });
}

function unknownObservations({
  checked,
  contractAddress,
  providerSlot,
  observedAt
}) {
  return Object.freeze(checked.expectedAnchors.map((expected) =>
    observation({
      expected,
      transactionHash: checked.transactionHash,
      contractAddress,
      providerSlot,
      status: "unknown",
      confirmations: 0,
      observedAt
    })
  ));
}

export function createEvidenceAnchorObserver({
  contractAddress,
  providerSlot = "primary",
  rpcUrl,
  fetchImpl,
  clock = () => new Date()
} = {}) {
  if (!ADDRESS.test(contractAddress ?? "") || typeof clock !== "function") {
    fail("invalid_evidence_anchor_observer", "Evidence anchor observer configuration is invalid");
  }
  const checkedContract = getAddress(contractAddress);
  const resolved = resolveApprovedRpc({
    chainId: CHAIN_ID,
    providerSlot,
    rpcUrl
  });
  const rpc = createBoundedJsonRpcClient({
    rpcUrl: resolved.rpcUrl,
    fetchImpl,
    timeoutMs: resolved.config.profile.requestPolicy.timeoutMs
  });
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({
    contractAddress: checkedContract
  });

  async function assertChain() {
    const remote = quantity(await rpc.call("eth_chainId"), "chainId");
    if (remote !== 84532n) {
      fail("rpc_chain_id_mismatch", "Evidence anchor RPC is not Base Sepolia");
    }
  }

  return Object.freeze({
    async observe(input) {
      const checked = normalizeExpected(input);
      if (checked.contractAddress !== checkedContract) {
        fail("evidence_anchor_contract_mismatch", "Evidence anchor contract changed");
      }
      await assertChain();
      const observedAt = clock().toISOString();
      const [transaction, receipt] = await Promise.all([
        rpc.call("eth_getTransactionByHash", [checked.transactionHash]),
        rpc.call("eth_getTransactionReceipt", [checked.transactionHash])
      ]);
      if (!transaction && !receipt) {
        return unknownObservations({
          checked,
          contractAddress: checkedContract,
          providerSlot,
          observedAt
        });
      }
      if (!transaction) {
        return unknownObservations({
          checked,
          contractAddress: checkedContract,
          providerSlot,
          observedAt
        });
      }
      if (
        transaction.hash?.toLowerCase() !== checked.transactionHash ||
        transaction.to?.toLowerCase() !== checkedContract.toLowerCase() ||
        transaction.from?.toLowerCase() !==
          checked.expectedAnchors[0].attestorAddress.toLowerCase() ||
        quantity(transaction.value, "transaction.value") !== 0n
      ) {
        fail("evidence_anchor_transaction_mismatch", "Evidence anchor transaction is invalid");
      }
      let decoded;
      try {
        decoded = decodeFunctionData({
          abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
          data: transaction.input
        });
      } catch {
        fail("evidence_anchor_transaction_mismatch", "Evidence anchor calldata is invalid");
      }
      const [items, actionDigest, nonce] = decoded.args;
      if (
        decoded.functionName !== "anchorEvidence" ||
        actionDigest.toLowerCase() !== checked.expectedAnchors[0].actionDigest ||
        Number(nonce) !== checked.expectedAnchors[0].nonce ||
        items.length !== checked.expectedAnchors.length ||
        items.some((item, index) =>
          item.evidenceHash.toLowerCase() !==
            checked.expectedAnchors[index].evidenceHash ||
          item.eventTypeHash.toLowerCase() !==
            checked.expectedAnchors[index].eventTypeHash ||
          item.aggregateHash.toLowerCase() !==
            checked.expectedAnchors[index].aggregateRefHash
        )
      ) {
        fail("evidence_anchor_transaction_mismatch", "Evidence anchor calldata binding is invalid");
      }
      if (
        !receipt ||
        receipt.transactionHash?.toLowerCase() !== checked.transactionHash ||
        receipt.to?.toLowerCase() !== checkedContract.toLowerCase()
      ) {
        return unknownObservations({
          checked,
          contractAddress: checkedContract,
          providerSlot,
          observedAt
        });
      }
      if (receipt.status !== "0x1") {
        return Object.freeze(checked.expectedAnchors.map((expected) =>
          observation({
            expected,
            transactionHash: checked.transactionHash,
            contractAddress: checkedContract,
            providerSlot,
            status: "failed",
            confirmations: 0,
            observedAt
          })
        ));
      }
      if (!Array.isArray(receipt.logs) || receipt.logs.length > 64) {
        fail("invalid_evidence_anchor_receipt", "Evidence anchor receipt logs are invalid");
      }
      const logs = receipt.logs
        .filter(({ address }) =>
          address?.toLowerCase() === checkedContract.toLowerCase()
        )
        .map((log) => {
          try {
            return {
              log,
              event: adapter.decodeReceiptLog({
                data: log.data,
                topics: log.topics
              })
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((left, right) =>
          left.event.batchOrdinal - right.event.batchOrdinal
        );
      if (
        logs.length !== checked.expectedAnchors.length ||
        logs.some(({ event }, index) => {
          const expected = checked.expectedAnchors[index];
          return (
            event.evidenceHash !== expected.evidenceHash ||
            event.attestorAddress !== expected.attestorAddress ||
            event.actionDigest !== expected.actionDigest ||
            event.eventTypeHash !== expected.eventTypeHash ||
            event.aggregateHash !== expected.aggregateRefHash ||
            event.nonce !== expected.nonce ||
            event.batchOrdinal !== expected.batchOrdinal ||
            event.batchSize !== expected.batchSize
          );
        })
      ) {
        fail("evidence_anchor_event_mismatch", "Evidence anchor receipt events do not match");
      }
      const eventBlock = quantity(receipt.blockNumber, "receipt.blockNumber");
      const receiptBlockHash = hash(receipt.blockHash, "receipt.blockHash");
      const [latestValue, safeValue, finalizedValue, eventBlockValue] =
        await Promise.all([
          rpc.call("eth_getBlockByNumber", ["latest", false]),
          rpc.call("eth_getBlockByNumber", ["safe", false]),
          rpc.call("eth_getBlockByNumber", ["finalized", false]),
          rpc.call("eth_getBlockByNumber", [receipt.blockNumber, false])
        ]);
      if (
        !latestValue ||
        !safeValue ||
        !finalizedValue ||
        !eventBlockValue
      ) {
        return unknownObservations({
          checked,
          contractAddress: checkedContract,
          providerSlot,
          observedAt
        });
      }
      const latest = block(latestValue, "latest");
      const safe = block(safeValue, "safe");
      const finalized = block(finalizedValue, "finalized");
      const canonicalBlock = block(eventBlockValue, "event");
      if (canonicalBlock.hash !== receiptBlockHash) {
        const orphanedValue = await rpc.call(
          "eth_getBlockByHash",
          [receiptBlockHash, false]
        );
        if (!orphanedValue) {
          return Object.freeze(checked.expectedAnchors.map((expected) =>
            observation({
              expected,
              transactionHash: checked.transactionHash,
              contractAddress: checkedContract,
              providerSlot,
              status: "unknown",
              confirmations: 0,
              observedAt
            })
          ));
        }
        const orphanedBlock = block(orphanedValue, "orphaned");
        if (
          orphanedBlock.hash !== receiptBlockHash ||
          orphanedBlock.number !== eventBlock
        ) {
          fail(
            "evidence_anchor_block_reorged",
            "Evidence anchor orphaned block proof is inconsistent"
          );
        }
        return Object.freeze(logs.map(({ log }, index) =>
          observation({
            expected: checked.expectedAnchors[index],
            transactionHash: checked.transactionHash,
            contractAddress: checkedContract,
            providerSlot,
            status: "reorged",
            confirmations: 0,
            blockNumber: eventBlock.toString(),
            blockHash: receiptBlockHash,
            logIndex: Number(quantity(log.logIndex, "log.logIndex")),
            anchoredAt: new Date(Number(orphanedBlock.timestamp) * 1_000).toISOString(),
            observedAt
          })
        ));
      }
      if (latest.number < eventBlock) {
        return unknownObservations({
          checked,
          contractAddress: checkedContract,
          providerSlot,
          observedAt
        });
      }
      const finality = finalityStatus({
        eventBlock,
        latest: latest.number,
        safe: safe.number,
        finalized: finalized.number
      });
      return Object.freeze(logs.map(({ log, event }, index) =>
        observation({
          expected: checked.expectedAnchors[index],
          transactionHash: checked.transactionHash,
          contractAddress: checkedContract,
          providerSlot,
          status: finality.status,
          confirmations: finality.confirmations,
          blockNumber: eventBlock.toString(),
          blockHash: receiptBlockHash,
          logIndex: Number(quantity(log.logIndex, "log.logIndex")),
          anchoredAt: new Date(Number(canonicalBlock.timestamp) * 1_000).toISOString(),
          observedAt
        })
      ));
    },
    descriptor() {
      return Object.freeze({
        chainId: CHAIN_ID,
        providerSlot,
        contractAddress: checkedContract,
        readOnly: true,
        rawProviderPayloadPersisted: false,
        sandboxOnly: true,
        productionFundsMoved: false,
        schemaVersion: "evidence_anchor_observer.v1"
      });
    }
  });
}

export function createEvidenceAnchorNonceReader({
  contractAddress,
  providerSlot = "primary",
  rpcUrl,
  fetchImpl
} = {}) {
  if (!ADDRESS.test(contractAddress ?? "")) {
    fail("invalid_evidence_anchor_observer", "Evidence anchor nonce reader is invalid");
  }
  const checkedContract = getAddress(contractAddress);
  const resolved = resolveApprovedRpc({
    chainId: CHAIN_ID,
    providerSlot,
    rpcUrl
  });
  const rpc = createBoundedJsonRpcClient({
    rpcUrl: resolved.rpcUrl,
    fetchImpl,
    timeoutMs: resolved.config.profile.requestPolicy.timeoutMs
  });
  return Object.freeze({
    async read(accountAddress) {
      const checkedAccount = getAddress(accountAddress);
      const remote = quantity(await rpc.call("eth_chainId"), "chainId");
      if (remote !== 84532n) {
        fail("rpc_chain_id_mismatch", "Evidence anchor RPC is not Base Sepolia");
      }
      const data = encodeFunctionData({
        abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
        functionName: "nextNonce",
        args: [checkedAccount]
      });
      const result = await rpc.call("eth_call", [{
        to: checkedContract,
        data
      }, "latest"]);
      const nonce = decodeFunctionResult({
        abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
        functionName: "nextNonce",
        data: result
      });
      if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail("invalid_evidence_anchor_rpc", "Evidence anchor nonce is too large");
      }
      return Number(nonce);
    },
    descriptor() {
      return Object.freeze({
        chainId: CHAIN_ID,
        contractAddress: checkedContract,
        providerSlot,
        readOnly: true,
        schemaVersion: "evidence_anchor_nonce_reader.v1"
      });
    }
  });
}
