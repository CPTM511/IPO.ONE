import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createLiveCreditRegistryObserver
} from "../../modules/event-indexer/src/index.js";

const CHAIN_ID = "eip155:84532";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;

function fail(code, message) {
  throw new Error(`${code}: ${message}`);
}

export function readCreditRegistryObservationInput(env = process.env) {
  const input = {
    chainId: env.IPO_ONE_TESTNET_CHAIN_ID,
    runId: env.IPO_ONE_TESTNET_OBSERVATION_RUN_ID,
    query: {
      contractAddress: env.IPO_ONE_TESTNET_REGISTRY_CONTRACT_ADDRESS,
      authorizationHash: env.IPO_ONE_TESTNET_AUTHORIZATION_HASH,
      publicationTransactionHash:
        env.IPO_ONE_TESTNET_PUBLICATION_TRANSACTION_HASH,
      proofUpdateTransactionHash:
        env.IPO_ONE_TESTNET_PROOF_UPDATE_TRANSACTION_HASH,
      closeTransactionHash: env.IPO_ONE_TESTNET_CLOSE_TRANSACTION_HASH,
      pauseTransactionHash: env.IPO_ONE_TESTNET_PAUSE_TRANSACTION_HASH
    }
  };
  if (
    env.CI === "true" ||
    env.GITHUB_ACTIONS === "true" ||
    env.IPO_ONE_TESTNET_SIGNER_KEY ||
    env.PRIVATE_KEY ||
    env.MNEMONIC ||
    input.chainId !== CHAIN_ID ||
    !RUN_ID.test(input.runId ?? "") ||
    !ADDRESS.test(input.query.contractAddress ?? "") ||
    !HASH.test(input.query.authorizationHash ?? "") ||
    Object.entries(input.query)
      .filter(([key]) => key.endsWith("TransactionHash"))
      .some(([, value]) => !HASH.test(value ?? ""))
  ) {
    fail(
      "invalid_credit_registry_observation_config",
      "closed CHAIN-001E Base Sepolia observation configuration is required"
    );
  }
  return Object.freeze({
    ...input,
    query: Object.freeze(input.query)
  });
}

function comparable(observation) {
  return {
    observationHash: observation.observationHash,
    authorizationHash: observation.authorizationHash,
    finalCreditStateHash: observation.finalCreditStateHash,
    finalObligationProofHash: observation.finalObligationProofHash,
    finalStatus: observation.finalStatus,
    finalVersion: observation.finalVersion,
    registryPaused: observation.registryPaused,
    authorizationActive: observation.authorizationActive,
    rawAccountPersisted: observation.rawAccountPersisted,
    productionFundsMoved: observation.productionFundsMoved
  };
}

export async function observeCreditRegistryOnce({
  env = process.env,
  fetchImpl,
  clock = () => new Date()
} = {}) {
  const input = readCreditRegistryObservationInput(env);
  const observations = [];
  for (const providerSlot of ["primary", "secondary"]) {
    const observer = createLiveCreditRegistryObserver({
      chainId: input.chainId,
      providerSlot,
      fetchImpl,
      clock
    });
    observations.push(await observer.readLifecycle(input.query));
  }
  const [primary, secondary] = observations;
  if (
    primary.observationHash !== secondary.observationHash ||
    JSON.stringify(comparable(primary)) !==
      JSON.stringify(comparable(secondary))
  ) {
    fail(
      "credit_registry_provider_disagreement",
      "approved Base Sepolia providers disagree on Registry lifecycle facts"
    );
  }
  const receipt = Object.freeze({
    observation: primary,
    providerAgreement: Object.freeze({
      providers: Object.freeze(["primary", "secondary"]),
      observationHash: primary.observationHash,
      agreed: true,
      rawProviderPayloadPersisted: false,
      schemaVersion: "credit_registry_provider_agreement.v1"
    }),
    runId: input.runId,
    readOnly: true,
    liveTestnetObservation: true,
    syntheticOnly: true,
    productionFundsMoved: false,
    signerUsed: false,
    transactionBroadcast: false,
    schemaVersion: "credit_registry_cross_provider_observation_receipt.v1"
  });
  const artifactPath =
    `${process.cwd()}/artifacts/testnet/` +
    `${input.chainId.replace(":", "-")}-${input.runId}-` +
    "credit-registry-observation.json";
  await mkdir(`${process.cwd()}/artifacts/testnet`, {
    recursive: true,
    mode: 0o700
  });
  await writeFile(artifactPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
  return Object.freeze({ ...receipt, artifactPath });
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
  observeCreditRegistryOnce()
    .then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
