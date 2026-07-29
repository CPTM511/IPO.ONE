import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult
} from "viem";
import {
  CREDIT_REGISTRY_LIVE_ABI,
  InMemoryCreditRegistryObservationStore,
  calculateCreditRegistryObservationHash,
  createLiveCreditRegistryObserver
} from "../src/index.js";
import {
  readCreditRegistryObservationInput
} from "../../../deploy/testnet/observe-credit-registry-once.mjs";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const ACCOUNT = "0x1234567890123456789012345678901234567890";
const AUTHORIZATION_HASH = `0x${"1".repeat(64)}`;
const SUBJECT_HASH = `0x${"2".repeat(64)}`;
const OFFER_HASH = `0x${"3".repeat(64)}`;
const POLICY_HASH = `0x${"4".repeat(64)}`;
const PROVIDER_HASH = `0x${"5".repeat(64)}`;
const INITIAL_CREDIT_HASH = `0x${"6".repeat(64)}`;
const INITIAL_PROOF_HASH = `0x${"7".repeat(64)}`;
const REPAID_CREDIT_HASH = `0x${"8".repeat(64)}`;
const REPAYMENT_PROOF_HASH = `0x${"9".repeat(64)}`;
const SETTLED_PROOF_HASH = `0x${"a".repeat(64)}`;
const VALID_UNTIL = 1_785_300_000n;
const TX = Object.freeze({
  publication: `0x${"b".repeat(64)}`,
  proof_update: `0x${"c".repeat(64)}`,
  close: `0x${"d".repeat(64)}`,
  pause: `0x${"e".repeat(64)}`
});
const BLOCK = Object.freeze({
  publication: { number: 100n, hash: `0x${"1".repeat(64)}` },
  proof_update: { number: 101n, hash: `0x${"2".repeat(64)}` },
  close: { number: 102n, hash: `0x${"3".repeat(64)}` },
  pause: { number: 103n, hash: `0x${"4".repeat(64)}` },
  finalized: { number: 104n, hash: `0x${"5".repeat(64)}` },
  safe: { number: 105n, hash: `0x${"6".repeat(64)}` },
  latest: { number: 110n, hash: `0x${"7".repeat(64)}` }
});

function hex(value) {
  return `0x${value.toString(16)}`;
}

function rpc(result, id) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function eventLog(kind) {
  if (kind === "publication") {
    return {
      topics: encodeEventTopics({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        eventName: "AuthorizationPublished",
        args: {
          authorizationHash: AUTHORIZATION_HASH,
          account: ACCOUNT,
          subjectAccountHash: SUBJECT_HASH
        }
      }),
      data: encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint64" },
          { type: "uint64" }
        ],
        [
          OFFER_HASH,
          POLICY_HASH,
          PROVIDER_HASH,
          INITIAL_CREDIT_HASH,
          INITIAL_PROOF_HASH,
          VALID_UNTIL,
          1n
        ]
      )
    };
  }
  if (kind === "proof_update") {
    return {
      topics: encodeEventTopics({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        eventName: "AuthorizationProofUpdated",
        args: { authorizationHash: AUTHORIZATION_HASH }
      }),
      data: encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint64" }
        ],
        [REPAID_CREDIT_HASH, REPAYMENT_PROOF_HASH, 2n]
      )
    };
  }
  if (kind === "close") {
    return {
      topics: encodeEventTopics({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        eventName: "AuthorizationStatusChanged",
        args: { authorizationHash: AUTHORIZATION_HASH, status: 4 }
      }),
      data: encodeAbiParameters(
        [{ type: "uint64" }, { type: "bytes32" }],
        [3n, SETTLED_PROOF_HASH]
      )
    };
  }
  return {
    topics: encodeEventTopics({
      abi: CREDIT_REGISTRY_LIVE_ABI,
      eventName: "RegistryPauseChanged"
    }),
    data: encodeAbiParameters([{ type: "bool" }], [true])
  };
}

function inputFor(kind) {
  if (kind === "publication") {
    return encodeFunctionData({
      abi: CREDIT_REGISTRY_LIVE_ABI,
      functionName: "publishAuthorization",
      args: [
        AUTHORIZATION_HASH,
        ACCOUNT,
        SUBJECT_HASH,
        OFFER_HASH,
        POLICY_HASH,
        PROVIDER_HASH,
        INITIAL_CREDIT_HASH,
        INITIAL_PROOF_HASH,
        VALID_UNTIL
      ]
    });
  }
  if (kind === "proof_update") {
    return encodeFunctionData({
      abi: CREDIT_REGISTRY_LIVE_ABI,
      functionName: "updateProof",
      args: [
        AUTHORIZATION_HASH,
        1n,
        REPAID_CREDIT_HASH,
        REPAYMENT_PROOF_HASH
      ]
    });
  }
  if (kind === "close") {
    return encodeFunctionData({
      abi: CREDIT_REGISTRY_LIVE_ABI,
      functionName: "closeAuthorization",
      args: [AUTHORIZATION_HASH, 2n, SETTLED_PROOF_HASH]
    });
  }
  return encodeFunctionData({
    abi: CREDIT_REGISTRY_LIVE_ABI,
    functionName: "setPaused",
    args: [true]
  });
}

function stateResult() {
  return encodeFunctionResult({
    abi: CREDIT_REGISTRY_LIVE_ABI,
    functionName: "getAuthorization",
    result: {
      account: ACCOUNT,
      subjectAccountHash: SUBJECT_HASH,
      acceptedOfferHash: OFFER_HASH,
      policyHash: POLICY_HASH,
      providerScopeHash: PROVIDER_HASH,
      creditStateHash: REPAID_CREDIT_HASH,
      obligationProofHash: SETTLED_PROOF_HASH,
      validUntil: VALID_UNTIL,
      version: 3n,
      status: 4
    }
  });
}

function createFetch({
  wrongChain = false,
  nonZeroKind,
  stateStatus = 4,
  headOffset = 0n
} = {}) {
  const kindByHash = new Map(Object.entries(TX).map(([kind, value]) => [
    value,
    kind
  ]));
  return async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.method === "eth_chainId") {
      return rpc(wrongChain ? "0x2105" : "0x14a34", request.id);
    }
    if (
      request.method === "eth_getTransactionReceipt" ||
      request.method === "eth_getTransactionByHash"
    ) {
      const transactionHash = request.params[0];
      const kind = kindByHash.get(transactionHash);
      if (!kind) throw new Error("unknown transaction");
      if (request.method === "eth_getTransactionByHash") {
        return rpc({
          hash: transactionHash,
          to: CONTRACT,
          value: nonZeroKind === kind ? "0x1" : "0x0",
          input: inputFor(kind)
        }, request.id);
      }
      const source = BLOCK[kind];
      const log = eventLog(kind);
      return rpc({
        transactionHash,
        blockHash: source.hash,
        blockNumber: hex(source.number),
        transactionIndex: "0x0",
        to: CONTRACT,
        status: "0x1",
        logs: [{
          address: CONTRACT,
          topics: log.topics,
          data: log.data,
          logIndex: "0x0"
        }]
      }, request.id);
    }
    if (request.method === "eth_getBlockByNumber") {
      const tag = request.params[0];
      const named = BLOCK[tag];
      const byNumber = Object.values(BLOCK).find(
        (entry) => hex(entry.number) === tag
      );
      const source = named && new Set(["latest", "safe", "finalized"]).has(tag)
        ? { ...named, number: named.number + headOffset }
        : named ?? byNumber;
      if (!source) throw new Error(`unknown block ${tag}`);
      return rpc({
        number: hex(source.number),
        hash: source.hash,
        timestamp: "0x6a77f100"
      }, request.id);
    }
    if (request.method === "eth_call") {
      const decoded = decodeFunctionData({
        abi: CREDIT_REGISTRY_LIVE_ABI,
        data: request.params[0].data
      });
      if (decoded.functionName === "getAuthorization") {
        if (stateStatus === 4) return rpc(stateResult(), request.id);
        return rpc(encodeFunctionResult({
          abi: CREDIT_REGISTRY_LIVE_ABI,
          functionName: "getAuthorization",
          result: {
            account: ACCOUNT,
            subjectAccountHash: SUBJECT_HASH,
            acceptedOfferHash: OFFER_HASH,
            policyHash: POLICY_HASH,
            providerScopeHash: PROVIDER_HASH,
            creditStateHash: REPAID_CREDIT_HASH,
            obligationProofHash: SETTLED_PROOF_HASH,
            validUntil: VALID_UNTIL,
            version: 3n,
            status: stateStatus
          }
        }), request.id);
      }
      if (decoded.functionName === "paused") {
        return rpc(encodeFunctionResult({
          abi: CREDIT_REGISTRY_LIVE_ABI,
          functionName: "paused",
          result: true
        }), request.id);
      }
      if (decoded.functionName === "isActive") {
        return rpc(encodeFunctionResult({
          abi: CREDIT_REGISTRY_LIVE_ABI,
          functionName: "isActive",
          result: false
        }), request.id);
      }
    }
    throw new Error(`unexpected RPC method ${request.method}`);
  };
}

function query() {
  return {
    contractAddress: CONTRACT,
    authorizationHash: AUTHORIZATION_HASH,
    publicationTransactionHash: TX.publication,
    proofUpdateTransactionHash: TX.proof_update,
    closeTransactionHash: TX.close,
    pauseTransactionHash: TX.pause
  };
}

function observer(fetchImpl = createFetch()) {
  return createLiveCreditRegistryObserver({
    chainId: "eip155:84532",
    providerSlot: "primary",
    fetchImpl,
    clock: () => new Date("2026-07-28T12:00:00.000Z")
  });
}

test("credit Registry observer verifies the closed lifecycle and redacts raw state", async () => {
  const observed = await observer().readLifecycle(query());
  const laterObservation = await observer(
    createFetch({ headOffset: 20n })
  ).readLifecycle(query());
  assert.equal(observed.finalStatus, "closed");
  assert.equal(observed.finalVersion, 3);
  assert.equal(observed.registryPaused, true);
  assert.equal(observed.authorizationActive, false);
  assert.equal(observed.transactions.length, 4);
  assert.equal(observed.transactions.at(-1).observationStatus, "finalized");
  assert.equal(
    observed.observationHash,
    calculateCreditRegistryObservationHash(observed)
  );
  assert.equal(
    laterObservation.observationHash,
    observed.observationHash
  );
  assert.notEqual(
    laterObservation.safeBlock.number,
    observed.safeBlock.number
  );
  const serialized = JSON.stringify(observed);
  assert.equal(serialized.includes(ACCOUNT), false);
  assert.equal(serialized.includes(inputFor("publication")), false);
  assert.equal(serialized.includes("sepolia.base.org"), false);
  assert.equal(observed.rawAccountPersisted, false);
  assert.equal(observed.rawProviderPayloadPersisted, false);
  assert.equal(observed.productionFundsMoved, false);
});

test("credit Registry observer rejects wrong chain, open query, value, and state drift", async () => {
  await assert.rejects(
    observer(createFetch({ wrongChain: true })).readLifecycle(query()),
    /credit_registry_chain_id_mismatch/
  );
  await assert.rejects(
    observer().readLifecycle({ ...query(), privateKey: "forbidden" }),
    /closed contract/
  );
  await assert.rejects(
    observer(createFetch({ nonZeroKind: "proof_update" }))
      .readLifecycle(query()),
    /invalid_credit_registry_transaction/
  );
  await assert.rejects(
    observer(createFetch({ stateStatus: 1 })).readLifecycle(query()),
    /credit_registry_final_state_mismatch/
  );
  assert.throws(
    () => createLiveCreditRegistryObserver({
      chainId: "eip155:1",
      providerSlot: "primary",
      fetchImpl: createFetch()
    }),
    /restricted to Base Sepolia/
  );
});

test("credit Registry observation store deduplicates, emits one hash-only outbox, and reconciles", async () => {
  const observed = await observer().readLifecycle(query());
  const laterObservation = await observer(
    createFetch({ headOffset: 20n })
  ).readLifecycle(query());
  const store = new InMemoryCreditRegistryObservationStore({
    clock: () => new Date("2026-07-28T12:01:00.000Z")
  });
  const first = await store.append(observed);
  const replay = await store.append(laterObservation);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  const restored = await store.readLatest(AUTHORIZATION_HASH);
  assert.deepEqual(restored, observed);
  const outbox = await store.listPendingOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].payload.authorizing, false);
  assert.equal(outbox[0].payload.productionFundsMoved, false);
  assert.equal(JSON.stringify(outbox).includes(ACCOUNT), false);
  const result = await store.reconcile(AUTHORIZATION_HASH);
  assert.equal(result.consistent, true);
  assert.deepEqual(result.differences, []);
  await assert.rejects(
    store.append({ ...observed, observationHash: `0x${"f".repeat(64)}` }),
    /observation hash drifted/
  );
  await assert.rejects(
    store.append({ ...observed, privateKey: "forbidden" }),
    /invalid or authority-expanding/
  );
});

test("CHAIN-001E observation runtime input is closed and requires no signer", () => {
  const environment = {
    IPO_ONE_TESTNET_CHAIN_ID: "eip155:84532",
    IPO_ONE_TESTNET_OBSERVATION_RUN_ID:
      "chain-001e-read-20260728-001",
    IPO_ONE_TESTNET_REGISTRY_CONTRACT_ADDRESS: CONTRACT,
    IPO_ONE_TESTNET_AUTHORIZATION_HASH: AUTHORIZATION_HASH,
    IPO_ONE_TESTNET_PUBLICATION_TRANSACTION_HASH: TX.publication,
    IPO_ONE_TESTNET_PROOF_UPDATE_TRANSACTION_HASH: TX.proof_update,
    IPO_ONE_TESTNET_CLOSE_TRANSACTION_HASH: TX.close,
    IPO_ONE_TESTNET_PAUSE_TRANSACTION_HASH: TX.pause
  };
  const input = readCreditRegistryObservationInput(environment);
  assert.equal(input.chainId, "eip155:84532");
  assert.deepEqual(input.query, query());
  assert.equal(JSON.stringify(input).includes("key"), false);
  assert.throws(
    () => readCreditRegistryObservationInput({
      ...environment,
      IPO_ONE_TESTNET_CHAIN_ID: "eip155:1"
    }),
    /invalid_credit_registry_observation_config/
  );
  assert.throws(
    () => readCreditRegistryObservationInput({
      ...environment,
      IPO_ONE_TESTNET_SIGNER_KEY: "forbidden"
    }),
    /invalid_credit_registry_observation_config/
  );
});
