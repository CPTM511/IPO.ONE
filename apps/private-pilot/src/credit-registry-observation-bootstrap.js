import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import {
  PostgresCreditRegistryObservationStore,
  assertCreditRegistryLiveObservation
} from "../../../modules/event-indexer/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIRECTORY = resolve(
  MODULE_DIRECTORY,
  "../../../artifacts/testnet"
);
const ARTIFACT_FILENAME =
  /^eip155-84532-chain-001e-read-[A-Za-z0-9._-]{3,48}-credit-registry-observation\.json$/;
const RECEIPT_KEYS = Object.freeze([
  "observation",
  "providerAgreement",
  "runId",
  "readOnly",
  "liveTestnetObservation",
  "syntheticOnly",
  "productionFundsMoved",
  "signerUsed",
  "transactionBroadcast",
  "schemaVersion"
]);
const PROVIDER_AGREEMENT_KEYS = Object.freeze([
  "providers",
  "observationHash",
  "agreed",
  "rawProviderPayloadPersisted",
  "schemaVersion"
]);

function fail() {
  throw new DomainError(
    "invalid_local_credit_registry_observation_artifact",
    "Local Registry Evidence requires one reviewed synthetic CHAIN-001E artifact"
  );
}

function exactObject(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function checkedArtifactPath(artifactPath) {
  if (
    typeof artifactPath !== "string" ||
    artifactPath.length < 1 ||
    artifactPath.length > 4_096 ||
    /[\0\r\n]/.test(artifactPath)
  ) fail();
  const absolute = resolve(artifactPath);
  const withinArtifactDirectory = relative(ARTIFACT_DIRECTORY, absolute);
  if (
    withinArtifactDirectory.startsWith(`..${sep}`) ||
    withinArtifactDirectory === ".." ||
    !ARTIFACT_FILENAME.test(withinArtifactDirectory) ||
    withinArtifactDirectory.includes(sep)
  ) fail();
  return absolute;
}

function checkedReceipt(source) {
  let receipt;
  try {
    receipt = parseStrictJson(source, {
      maximumBytes: 128 * 1024,
      maximumDepth: 12,
      maximumKeys: 512
    });
  } catch {
    fail();
  }
  const agreement = receipt?.providerAgreement;
  if (
    !exactObject(receipt, RECEIPT_KEYS) ||
    !exactObject(agreement, PROVIDER_AGREEMENT_KEYS) ||
    receipt.schemaVersion !==
      "credit_registry_cross_provider_observation_receipt.v1" ||
    receipt.readOnly !== true ||
    receipt.liveTestnetObservation !== true ||
    receipt.syntheticOnly !== true ||
    receipt.productionFundsMoved !== false ||
    receipt.signerUsed !== false ||
    receipt.transactionBroadcast !== false ||
    agreement.schemaVersion !==
      "credit_registry_provider_agreement.v1" ||
    agreement.agreed !== true ||
    agreement.rawProviderPayloadPersisted !== false ||
    JSON.stringify(agreement.providers) !==
      JSON.stringify(["primary", "secondary"]) ||
    agreement.observationHash !== receipt.observation?.observationHash ||
    receipt.observation?.providerSlot !== "primary"
  ) fail();
  try {
    assertCreditRegistryLiveObservation(receipt.observation);
  } catch {
    fail();
  }
  return receipt;
}

export async function bootstrapLocalCreditRegistryObservation({
  artifactPath,
  pool,
  tenantContext,
  clock = () => new Date(),
  readFileImpl = readFile
} = {}) {
  const absolutePath = checkedArtifactPath(artifactPath);
  let source;
  try {
    source = await readFileImpl(absolutePath, "utf8");
  } catch {
    fail();
  }
  const receipt = checkedReceipt(source);
  const store = new PostgresCreditRegistryObservationStore({
    pool,
    tenantContext,
    clock
  });
  const stored = await store.append(receipt.observation);
  return Object.freeze({
    configured: true,
    replayed: stored.replayed,
    chainId: receipt.observation.chainId,
    contractAddress: receipt.observation.contractAddress,
    authorizationHash: receipt.observation.authorizationHash,
    observationHash: receipt.observation.observationHash,
    finalityProofHash: receipt.observation.finalityProofHash,
    finalStatus: receipt.observation.finalStatus,
    finalVersion: receipt.observation.finalVersion,
    registryPaused: receipt.observation.registryPaused,
    authorizationActive: receipt.observation.authorizationActive,
    readOnly: true,
    syntheticOnly: true,
    authorizing: false,
    productionFundsMoved: false,
    signerUsed: false,
    transactionBroadcast: false,
    rawAccountIncluded: false,
    rawProviderPayloadIncluded: false,
    schemaVersion: "local_credit_registry_observation_bootstrap.v1"
  });
}
