import {
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseAbi
} from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  BaseSepoliaCreditAuthorizationAdapter
} from "../../chain-adapter/src/index.js";
import { createBoundedJsonRpcClient } from "./bounded-json-rpc.js";
import { resolveApprovedRpc } from "./live-testnet-config.js";

export const CREDIT_REGISTRY_LIVE_ABI = parseAbi([
  "event RegistryPauseChanged(bool paused)",
  "event AuthorizationPublished(bytes32 indexed authorizationHash,address indexed account,bytes32 indexed subjectAccountHash,bytes32 acceptedOfferHash,bytes32 policyHash,bytes32 providerScopeHash,bytes32 creditStateHash,bytes32 obligationProofHash,uint64 validUntil,uint64 version)",
  "event AuthorizationStatusChanged(bytes32 indexed authorizationHash,uint8 indexed status,uint64 version,bytes32 obligationProofHash)",
  "event AuthorizationProofUpdated(bytes32 indexed authorizationHash,bytes32 creditStateHash,bytes32 obligationProofHash,uint64 version)",
  "function publishAuthorization(bytes32 authorizationHash,address account,bytes32 subjectAccountHash,bytes32 acceptedOfferHash,bytes32 policyHash,bytes32 providerScopeHash,bytes32 creditStateHash,bytes32 obligationProofHash,uint64 validUntil)",
  "function updateProof(bytes32 authorizationHash,uint64 expectedVersion,bytes32 creditStateHash,bytes32 obligationProofHash)",
  "function closeAuthorization(bytes32 authorizationHash,uint64 expectedVersion,bytes32 settledObligationProofHash)",
  "function setPaused(bool paused)",
  "function getAuthorization(bytes32 authorizationHash) view returns ((address account,bytes32 subjectAccountHash,bytes32 acceptedOfferHash,bytes32 policyHash,bytes32 providerScopeHash,bytes32 creditStateHash,bytes32 obligationProofHash,uint64 validUntil,uint64 version,uint8 status))",
  "function paused() view returns (bool)",
  "function isActive(bytes32 authorizationHash) view returns (bool)"
]);

const CHAIN_ID = "eip155:84532";
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const CALL_DATA = /^0x(?:[0-9a-f]{2})+$/;
const QUERY_KEYS = new Set([
  "contractAddress",
  "authorizationHash",
  "publicationTransactionHash",
  "proofUpdateTransactionHash",
  "closeTransactionHash",
  "pauseTransactionHash"
]);
const OBSERVATION_KEYS = new Set([
  "chainId",
  "providerSlot",
  "contractAddress",
  "authorizationHash",
  "accountReferenceHash",
  "subjectAccountHash",
  "acceptedOfferHash",
  "policyHash",
  "providerScopeHash",
  "finalCreditStateHash",
  "finalObligationProofHash",
  "validUntil",
  "finalStatus",
  "finalVersion",
  "registryPaused",
  "authorizationActive",
  "transactions",
  "safeBlock",
  "finalizedBlock",
  "finalityProofHash",
  "observedAt",
  "readOnly",
  "liveTestnetObservation",
  "rawAccountPersisted",
  "rawProviderPayloadPersisted",
  "syntheticOnly",
  "productionFundsMoved",
  "schemaVersion",
  "observationHash"
]);
const OBSERVED_TRANSACTION_KEYS = new Set([
  "kind",
  "transactionHash",
  "blockNumber",
  "blockHash",
  "transactionIndex",
  "eventOrdinal",
  "observationStatus",
  "confirmations"
]);
const OBSERVED_BLOCK_KEYS = new Set(["number", "hash"]);
const TRANSACTION_KINDS = Object.freeze([
  "publication",
  "proof_update",
  "close",
  "pause"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function exactPlainObject(value, keys) {
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
    fail("invalid_credit_registry_rpc", `${name} is not a canonical quantity`);
  }
  return BigInt(value);
}

function hash(value, name) {
  if (typeof value !== "string" || !HASH.test(value.toLowerCase())) {
    fail("invalid_credit_registry_rpc", `${name} is not a transaction or bytes32 hash`);
  }
  return value.toLowerCase();
}

function block(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_credit_registry_rpc", `${name} block is unavailable`);
  }
  return Object.freeze({
    number: quantity(value.number, `${name}.number`),
    hash: hash(value.hash, `${name}.hash`),
    timestamp: quantity(value.timestamp, `${name}.timestamp`)
  });
}

function sameAddress(left, right) {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

function transactionOrder(entry) {
  return [
    BigInt(entry.blockNumber),
    BigInt(entry.transactionIndex),
    BigInt(entry.eventOrdinal)
  ];
}

function orderIsBefore(left, right) {
  const a = transactionOrder(left);
  const b = transactionOrder(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return true;
    if (a[index] > b[index]) return false;
  }
  return false;
}

function observationHashMaterial(observation) {
  return {
    chainId: observation.chainId,
    contractAddress: observation.contractAddress,
    authorizationHash: observation.authorizationHash,
    accountReferenceHash: observation.accountReferenceHash,
    subjectAccountHash: observation.subjectAccountHash,
    acceptedOfferHash: observation.acceptedOfferHash,
    policyHash: observation.policyHash,
    providerScopeHash: observation.providerScopeHash,
    finalCreditStateHash: observation.finalCreditStateHash,
    finalObligationProofHash: observation.finalObligationProofHash,
    validUntil: observation.validUntil,
    finalStatus: observation.finalStatus,
    finalVersion: observation.finalVersion,
    registryPaused: observation.registryPaused,
    authorizationActive: observation.authorizationActive,
    transactions: observation.transactions.map((transaction) => ({
      kind: transaction.kind,
      transactionHash: transaction.transactionHash,
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
      transactionIndex: transaction.transactionIndex,
      eventOrdinal: transaction.eventOrdinal,
      observationStatus: transaction.observationStatus
    })),
    finalityProofHash: observation.finalityProofHash,
    readOnly: observation.readOnly,
    liveTestnetObservation: observation.liveTestnetObservation,
    rawAccountPersisted: observation.rawAccountPersisted,
    rawProviderPayloadPersisted: observation.rawProviderPayloadPersisted,
    syntheticOnly: observation.syntheticOnly,
    productionFundsMoved: observation.productionFundsMoved,
    schemaVersion: observation.schemaVersion
  };
}

export function calculateCreditRegistryObservationHash(observation) {
  return hashId(
    "credit_registry_live_observation",
    observationHashMaterial(observation)
  );
}

export function assertCreditRegistryLiveObservation(observation) {
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation) ||
    !exactPlainObject(observation, OBSERVATION_KEYS) ||
    observation.chainId !== CHAIN_ID ||
    !new Set(["primary", "secondary"]).has(observation.providerSlot) ||
    !ADDRESS.test(observation.contractAddress ?? "") ||
    !HASH.test(observation.authorizationHash ?? "") ||
    !HASH.test(observation.observationHash ?? "") ||
    !HASH.test(observation.finalityProofHash ?? "") ||
    !Array.isArray(observation.transactions) ||
    observation.transactions.length !== 4 ||
    observation.transactions.some(
      (entry, index) =>
        !exactPlainObject(entry, OBSERVED_TRANSACTION_KEYS) ||
        entry?.kind !== TRANSACTION_KINDS[index] ||
        !HASH.test(entry.transactionHash ?? "") ||
        !HASH.test(entry.blockHash ?? "") ||
        !/^[1-9][0-9]*$/.test(entry.blockNumber ?? "") ||
        !/^(?:0|[1-9][0-9]*)$/.test(entry.transactionIndex ?? "") ||
        !/^(?:0|[1-9][0-9]*)$/.test(entry.eventOrdinal ?? "") ||
        !new Set(["safe", "finalized"]).has(entry.observationStatus) ||
        !Number.isSafeInteger(entry.confirmations) ||
        entry.confirmations < 2
    ) ||
    observation.finalStatus !== "closed" ||
    observation.finalVersion !== 3 ||
    observation.registryPaused !== true ||
    observation.authorizationActive !== false ||
    observation.readOnly !== true ||
    observation.liveTestnetObservation !== true ||
    observation.rawAccountPersisted !== false ||
    observation.rawProviderPayloadPersisted !== false ||
    observation.syntheticOnly !== true ||
    observation.productionFundsMoved !== false ||
    observation.schemaVersion !== "credit_registry_live_observation.v1" ||
    !observation.safeBlock ||
    !exactPlainObject(observation.safeBlock, OBSERVED_BLOCK_KEYS) ||
    !/^[1-9][0-9]*$/.test(observation.safeBlock.number ?? "") ||
    !HASH.test(observation.safeBlock.hash ?? "") ||
    !observation.finalizedBlock ||
    !exactPlainObject(observation.finalizedBlock, OBSERVED_BLOCK_KEYS) ||
    !/^[1-9][0-9]*$/.test(observation.finalizedBlock.number ?? "") ||
    !HASH.test(observation.finalizedBlock.hash ?? "") ||
    BigInt(observation.finalizedBlock.number) >
      BigInt(observation.safeBlock.number) ||
    BigInt(observation.transactions.at(-1)?.blockNumber ?? "0") >
      BigInt(observation.safeBlock.number) ||
    Number.isNaN(new Date(observation.validUntil).getTime()) ||
    Number.isNaN(new Date(observation.observedAt).getTime())
  ) {
    fail(
      "invalid_credit_registry_observation",
      "credit Registry live observation is invalid or authority-expanding"
    );
  }
  for (const name of [
    "accountReferenceHash",
    "subjectAccountHash",
    "acceptedOfferHash",
    "policyHash",
    "providerScopeHash",
    "finalCreditStateHash",
    "finalObligationProofHash"
  ]) {
    if (!HASH.test(observation[name] ?? "")) {
      fail("invalid_credit_registry_observation", `${name} is invalid`);
    }
  }
  if (
    observation.observationHash !==
      calculateCreditRegistryObservationHash(observation)
  ) {
    fail(
      "credit_registry_observation_hash_mismatch",
      "credit Registry observation hash drifted"
    );
  }
  return observation;
}

export function createLiveCreditRegistryObserver({
  chainId,
  providerSlot = "primary",
  rpcUrl,
  fetchImpl,
  clock = () => new Date()
}) {
  if (chainId !== CHAIN_ID) {
    fail(
      "invalid_credit_registry_chain",
      "credit Registry observer is restricted to Base Sepolia"
    );
  }
  const resolved = resolveApprovedRpc({ chainId, providerSlot, rpcUrl });
  const rpc = createBoundedJsonRpcClient({
    rpcUrl: resolved.rpcUrl,
    fetchImpl,
    timeoutMs: resolved.config.profile.requestPolicy.timeoutMs
  });

  async function call(functionName, args, contractAddress) {
    const data = encodeFunctionData({
      abi: CREDIT_REGISTRY_LIVE_ABI,
      functionName,
      args
    });
    const result = await rpc.call("eth_call", [
      { to: contractAddress, data },
      "latest"
    ]);
    if (typeof result !== "string" || !CALL_DATA.test(result)) {
      fail("invalid_credit_registry_rpc", "Registry state call returned invalid data");
    }
    return result;
  }

  return Object.freeze({
    async readLifecycle(input) {
      if (!exactPlainObject(input, QUERY_KEYS)) {
        fail(
          "invalid_credit_registry_query",
          "credit Registry observation query must use the closed contract"
        );
      }
      if (
        !ADDRESS.test(input.contractAddress ?? "") ||
        !HASH.test(input.authorizationHash ?? "") ||
        [...QUERY_KEYS]
          .filter((key) => key.endsWith("TransactionHash"))
          .some((key) => !HASH.test(input[key] ?? ""))
      ) {
        fail(
          "invalid_credit_registry_query",
          "credit Registry observation identifiers are invalid"
        );
      }
      const currentContractAddress = getAddress(input.contractAddress);
      const authorizationHash = input.authorizationHash.toLowerCase();
      const remoteChain = quantity(
        await rpc.call("eth_chainId"),
        "chainId"
      );
      if (remoteChain !== BigInt(resolved.config.numericChainId)) {
        fail(
          "credit_registry_chain_id_mismatch",
          "Registry RPC does not match Base Sepolia"
        );
      }

      const specifications = [
        {
          kind: "publication",
          transactionHash: input.publicationTransactionHash,
          eventName: "AuthorizationPublished",
          functionName: "publishAuthorization"
        },
        {
          kind: "proof_update",
          transactionHash: input.proofUpdateTransactionHash,
          eventName: "AuthorizationProofUpdated",
          functionName: "updateProof"
        },
        {
          kind: "close",
          transactionHash: input.closeTransactionHash,
          eventName: "AuthorizationStatusChanged",
          functionName: "closeAuthorization"
        },
        {
          kind: "pause",
          transactionHash: input.pauseTransactionHash,
          eventName: "RegistryPauseChanged",
          functionName: "setPaused"
        }
      ];
      const decoded = [];
      for (const specification of specifications) {
        const expectedTransactionHash =
          specification.transactionHash.toLowerCase();
        const [receipt, transaction] = await Promise.all([
          rpc.call("eth_getTransactionReceipt", [expectedTransactionHash]),
          rpc.call("eth_getTransactionByHash", [expectedTransactionHash])
        ]);
        if (
          !receipt ||
          !transaction ||
          receipt.status !== "0x1" ||
          hash(receipt.transactionHash, "receipt.transactionHash") !==
            expectedTransactionHash ||
          hash(transaction.hash, "transaction.hash") !== expectedTransactionHash ||
          !sameAddress(receipt.to, currentContractAddress) ||
          !sameAddress(transaction.to, currentContractAddress) ||
          quantity(transaction.value, "transaction.value") !== 0n ||
          !Array.isArray(receipt.logs) ||
          receipt.logs.length > 64
        ) {
          fail(
            "invalid_credit_registry_transaction",
            `${specification.kind} transaction is invalid`
          );
        }
        let calldata;
        try {
          calldata = decodeFunctionData({
            abi: CREDIT_REGISTRY_LIVE_ABI,
            data: transaction.input
          });
        } catch {
          fail(
            "invalid_credit_registry_calldata",
            `${specification.kind} calldata is invalid`
          );
        }
        if (calldata.functionName !== specification.functionName) {
          fail(
            "invalid_credit_registry_calldata",
            `${specification.kind} function is invalid`
          );
        }
        const matches = [];
        for (const log of receipt.logs) {
          if (!sameAddress(log?.address, currentContractAddress)) continue;
          try {
            const event = decodeEventLog({
              abi: CREDIT_REGISTRY_LIVE_ABI,
              data: log.data,
              topics: log.topics,
              strict: true
            });
            if (event.eventName === specification.eventName) {
              matches.push({ log, args: event.args });
            }
          } catch {
            // Ignore other bounded logs from the exact Registry address.
          }
        }
        if (matches.length !== 1) {
          fail(
            "invalid_credit_registry_event",
            `${specification.kind} requires exactly one expected event`
          );
        }
        const [{ log, args }] = matches;
        decoded.push({
          ...specification,
          transactionHash: expectedTransactionHash,
          blockNumber: quantity(
            receipt.blockNumber,
            "receipt.blockNumber"
          ),
          blockHash: hash(receipt.blockHash, "receipt.blockHash"),
          transactionIndex: quantity(
            receipt.transactionIndex,
            "receipt.transactionIndex"
          ),
          eventOrdinal: quantity(log.logIndex, "log.logIndex"),
          calldata,
          args
        });
      }

      const [publication, update, close, pause] = decoded;
      const publishedArgs = publication.args;
      const updateArgs = update.args;
      const closeArgs = close.args;
      if (
        publishedArgs.authorizationHash.toLowerCase() !== authorizationHash ||
        updateArgs.authorizationHash.toLowerCase() !== authorizationHash ||
        closeArgs.authorizationHash.toLowerCase() !== authorizationHash ||
        Number(publishedArgs.version) !== 1 ||
        Number(updateArgs.version) !== 2 ||
        Number(closeArgs.version) !== 3 ||
        Number(closeArgs.status) !== 4 ||
        pause.args.paused !== true
      ) {
        fail(
          "credit_registry_event_sequence_mismatch",
          "Registry events do not describe the expected closed lifecycle"
        );
      }
      const [publishAuthorizationHash, publishAccount, publishSubjectHash,
        publishOfferHash, publishPolicyHash, publishProviderHash,
        publishCreditHash, publishProofHash, publishValidUntil] =
        publication.calldata.args;
      const [updateAuthorizationHash, updateExpectedVersion,
        updateCreditHash, updateProofHash] = update.calldata.args;
      const [closeAuthorizationHash, closeExpectedVersion, closeProofHash] =
        close.calldata.args;
      if (
        publishAuthorizationHash.toLowerCase() !== authorizationHash ||
        !sameAddress(publishAccount, publishedArgs.account) ||
        publishSubjectHash !== publishedArgs.subjectAccountHash ||
        publishOfferHash !== publishedArgs.acceptedOfferHash ||
        publishPolicyHash !== publishedArgs.policyHash ||
        publishProviderHash !== publishedArgs.providerScopeHash ||
        publishCreditHash !== publishedArgs.creditStateHash ||
        publishProofHash !== publishedArgs.obligationProofHash ||
        publishValidUntil !== publishedArgs.validUntil ||
        updateAuthorizationHash.toLowerCase() !== authorizationHash ||
        Number(updateExpectedVersion) !== 1 ||
        updateCreditHash !== updateArgs.creditStateHash ||
        updateProofHash !== updateArgs.obligationProofHash ||
        closeAuthorizationHash.toLowerCase() !== authorizationHash ||
        Number(closeExpectedVersion) !== 2 ||
        closeProofHash !== closeArgs.obligationProofHash ||
        pause.calldata.args[0] !== true ||
        !orderIsBefore(publication, update) ||
        !orderIsBefore(update, close) ||
        !orderIsBefore(close, pause)
      ) {
        fail(
          "credit_registry_calldata_event_mismatch",
          "Registry calldata, events, or order drifted"
        );
      }

      const [latest, safe, finalized] = await Promise.all([
        rpc.call("eth_getBlockByNumber", ["latest", false]),
        rpc.call("eth_getBlockByNumber", ["safe", false]),
        rpc.call("eth_getBlockByNumber", ["finalized", false])
      ]).then((values) => [
        block(values[0], "latest"),
        block(values[1], "safe"),
        block(values[2], "finalized")
      ]);
      if (pause.blockNumber > safe.number || safe.number > latest.number) {
        fail(
          "credit_registry_not_safe",
          "Registry lifecycle has not reached the Base Sepolia safe block"
        );
      }
      const transactions = [];
      for (const entry of decoded) {
        const observedBlock = block(
          await rpc.call("eth_getBlockByNumber", [
            `0x${entry.blockNumber.toString(16)}`,
            false
          ]),
          `${entry.kind}.block`
        );
        if (
          observedBlock.number !== entry.blockNumber ||
          observedBlock.hash !== entry.blockHash
        ) {
          fail(
            "credit_registry_block_reorged",
            `${entry.kind} block hash changed during observation`
          );
        }
        const confirmations = Number(latest.number - entry.blockNumber + 1n);
        if (!Number.isSafeInteger(confirmations) || confirmations < 2) {
          fail(
            "credit_registry_finality_mismatch",
            "Registry confirmation count is invalid"
          );
        }
        transactions.push(Object.freeze({
          kind: entry.kind,
          transactionHash: entry.transactionHash,
          blockNumber: entry.blockNumber.toString(),
          blockHash: entry.blockHash,
          transactionIndex: entry.transactionIndex.toString(),
          eventOrdinal: entry.eventOrdinal.toString(),
          observationStatus:
            entry.blockNumber <= finalized.number ? "finalized" : "safe",
          confirmations
        }));
      }

      const adapter = new BaseSepoliaCreditAuthorizationAdapter({
        contractAddress: currentContractAddress
      });
      const [stateResult, pausedResult, activeResult] = await Promise.all([
        call(
          "getAuthorization",
          [authorizationHash],
          currentContractAddress
        ),
        call("paused", [], currentContractAddress),
        call("isActive", [authorizationHash], currentContractAddress)
      ]);
      const rawState = decodeFunctionResult({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        functionName: "getAuthorization",
        data: stateResult
      });
      const state = adapter.decodeAuthorization(stateResult);
      const paused = decodeFunctionResult({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        functionName: "paused",
        data: pausedResult
      });
      const active = decodeFunctionResult({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        functionName: "isActive",
        data: activeResult
      });
      if (
        !sameAddress(rawState.account, publishedArgs.account) ||
        state.subjectAccountHash !== publishedArgs.subjectAccountHash ||
        state.acceptedOfferHash !== publishedArgs.acceptedOfferHash ||
        state.policyHash !== publishedArgs.policyHash ||
        state.providerScopeHash !== publishedArgs.providerScopeHash ||
        state.creditStateHash !== updateArgs.creditStateHash ||
        state.obligationProofHash !== closeArgs.obligationProofHash ||
        state.validUntil !==
          new Date(Number(publishedArgs.validUntil) * 1_000).toISOString() ||
        state.status !== "closed" ||
        state.version !== 3 ||
        paused !== true ||
        active !== false
      ) {
        fail(
          "credit_registry_final_state_mismatch",
          "Registry final state does not reconcile with its events"
        );
      }

      const finalityProofHash = hashId("credit_registry_live_finality", {
        chainId,
        contractAddress: currentContractAddress,
        authorizationHash,
        transactions: transactions.map((transaction) => ({
          kind: transaction.kind,
          transactionHash: transaction.transactionHash,
          blockNumber: transaction.blockNumber,
          blockHash: transaction.blockHash,
          transactionIndex: transaction.transactionIndex,
          eventOrdinal: transaction.eventOrdinal
        })),
        minimumAcceptedFinality: "safe"
      });
      const observation = {
        chainId,
        providerSlot,
        contractAddress: currentContractAddress,
        authorizationHash,
        accountReferenceHash: hashId(
          "credit_registry_test_account_reference",
          { chainId, account: getAddress(publishedArgs.account) }
        ),
        subjectAccountHash: publishedArgs.subjectAccountHash.toLowerCase(),
        acceptedOfferHash: publishedArgs.acceptedOfferHash.toLowerCase(),
        policyHash: publishedArgs.policyHash.toLowerCase(),
        providerScopeHash: publishedArgs.providerScopeHash.toLowerCase(),
        finalCreditStateHash: state.creditStateHash,
        finalObligationProofHash: state.obligationProofHash,
        validUntil: state.validUntil,
        finalStatus: state.status,
        finalVersion: state.version,
        registryPaused: paused,
        authorizationActive: active,
        transactions,
        safeBlock: Object.freeze({
          number: safe.number.toString(),
          hash: safe.hash
        }),
        finalizedBlock: Object.freeze({
          number: finalized.number.toString(),
          hash: finalized.hash
        }),
        finalityProofHash,
        observedAt: clock().toISOString(),
        readOnly: true,
        liveTestnetObservation: true,
        rawAccountPersisted: false,
        rawProviderPayloadPersisted: false,
        syntheticOnly: true,
        productionFundsMoved: false,
        schemaVersion: "credit_registry_live_observation.v1"
      };
      observation.observationHash =
        calculateCreditRegistryObservationHash(observation);
      return Object.freeze(assertCreditRegistryLiveObservation(observation));
    }
  });
}
