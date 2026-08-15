import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { getAddress } from "viem";
import { hashId } from "../../packages/domain/src/index.js";
import { parseStrictJson } from "../../modules/authentication/src/strict-json.js";
import {
  compileMinimalErc1271TestWallet,
  materializeMinimalErc1271TestWalletRuntime
} from "./compile-erc1271-test-wallet.mjs";

const DECISION_KEYS = new Set([
  "schemaVersion",
  "decisionId",
  "decision",
  "approverRole",
  "approvedAt",
  "approvalExpiresAt",
  "decisionPackSha256",
  "amendedAt",
  "decisionAmendmentSha256",
  "chainId",
  "ownerAddress",
  "deployerAddress",
  "contractExpiresAt",
  "caps",
  "e2e",
  "roles",
  "artifact",
  "deploymentAuthorized",
  "productionFundsMoved"
]);
const CAP_KEYS = new Set([
  "deploymentCount",
  "transactionValueWei",
  "gasLimit",
  "maxFeePerGasWei",
  "maximumFaucetBalanceWei"
]);
const E2E_KEYS = new Set(["humanEip191", "agentEip712"]);
const ROLE_KEYS = new Set([
  "humanWalletOperator",
  "deployerOperator",
  "evidenceCustodian",
  "credentialDestructionOwner"
]);
const ARTIFACT_KEYS = new Set([
  "sourceSha256",
  "creationBytecodeKeccak256",
  "deployedBytecodeKeccak256"
]);
const ROLE = /^[A-Za-z0-9][A-Za-z0-9 ._:/()-]{2,127}$/;
const MAXIMUM_DECISION_BYTES = 16 * 1_024;
const MAXIMUM_CONTRACT_LIFETIME_MS = 7 * 24 * 60 * 60_000;
const EXPECTED = Object.freeze({
  schemaVersion: "wallet_003_erc1271_deployment_decision.v1",
  decisionId: "WALLET-003-ERC1271-DEPLOY-001",
  approverRole: "IPO.ONE Founder",
  decisionPackSha256:
    "4d015b8f0d3a91ba1fc8397496449698d25fa80dbaba340cc9262c09c7d915ae",
  decisionAmendmentSha256:
    "179768eae10af3004b3c980677bc20554625226cd1c24800dc8274511edf7d9e",
  chainId: "eip155:84532",
  sourceSha256:
    "sha256:d622a3c841ec5d022ae3aa1dec312459da3492b5897e4bc05532a4e214190787",
  creationBytecodeKeccak256:
    "0xfc8b0043879c1f3868149fb616a1f11f939b4c96f423d18265f5be46a24217d2",
  deployedBytecodeKeccak256:
    "0x24fbe2a0332e8b875babde91f1995ceab8e0fb500b66de8047658adca0459de1"
});

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function exactObject(name, value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.values(Object.getOwnPropertyDescriptors(value))
      .some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(value).length !== keys.size ||
    Object.keys(value).some((key) => !keys.has(key))
  ) {
    fail("invalid_erc1271_deployment_decision", `${name} must use the exact closed contract`);
  }
  return value;
}

function timestamp(name, value) {
  const milliseconds = new Date(value).getTime();
  if (
    typeof value !== "string" ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    fail("invalid_erc1271_deployment_decision", `${name} must be an exact UTC timestamp`);
  }
  return milliseconds;
}

function integerString(name, value, { maximum }) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    BigInt(value) < 1n ||
    BigInt(value) > BigInt(maximum)
  ) {
    fail("invalid_erc1271_deployment_decision", `${name} exceeds the approved cap`);
  }
  return value;
}

function address(name, value) {
  try {
    return getAddress(value);
  } catch {
    fail("invalid_erc1271_deployment_decision", `${name} is not a valid EVM address`);
  }
}

function role(name, value) {
  if (typeof value !== "string" || !ROLE.test(value)) {
    fail("invalid_erc1271_deployment_decision", `${name} is invalid`);
  }
  return value;
}

function exactValue(name, actual, expected) {
  if (actual !== expected) {
    fail("erc1271_deployment_decision_drift", `${name} does not match the approved decision`);
  }
}

export async function prepareMinimalErc1271DeploymentDecision(
  decision,
  { clock = () => new Date() } = {}
) {
  if (typeof clock !== "function") {
    fail("invalid_erc1271_deployment_preflight", "clock is invalid");
  }
  exactObject("decision", decision, DECISION_KEYS);
  exactValue("schemaVersion", decision.schemaVersion, EXPECTED.schemaVersion);
  exactValue("decisionId", decision.decisionId, EXPECTED.decisionId);
  exactValue("decision", decision.decision, "APPROVE");
  exactValue("approverRole", decision.approverRole, EXPECTED.approverRole);
  exactValue(
    "decisionPackSha256",
    decision.decisionPackSha256,
    EXPECTED.decisionPackSha256
  );
  exactValue(
    "decisionAmendmentSha256",
    decision.decisionAmendmentSha256,
    EXPECTED.decisionAmendmentSha256
  );
  exactValue("chainId", decision.chainId, EXPECTED.chainId);
  exactValue("deploymentAuthorized", decision.deploymentAuthorized, true);
  exactValue("productionFundsMoved", decision.productionFundsMoved, false);

  const nowMs = clock().getTime();
  if (!Number.isFinite(nowMs)) {
    fail("invalid_erc1271_deployment_preflight", "clock returned an invalid date");
  }
  const approvedAtMs = timestamp("approvedAt", decision.approvedAt);
  const amendedAtMs = timestamp("amendedAt", decision.amendedAt);
  const approvalExpiresAtMs = timestamp(
    "approvalExpiresAt",
    decision.approvalExpiresAt
  );
  const contractExpiresAtMs = timestamp(
    "contractExpiresAt",
    decision.contractExpiresAt
  );
  if (
    approvedAtMs > nowMs ||
    amendedAtMs < approvedAtMs ||
    amendedAtMs > nowMs ||
    approvalExpiresAtMs <= nowMs ||
    amendedAtMs >= approvalExpiresAtMs ||
    approvalExpiresAtMs > new Date("2026-09-22T23:59:59.999Z").getTime() ||
    contractExpiresAtMs <= nowMs ||
    contractExpiresAtMs > nowMs + MAXIMUM_CONTRACT_LIFETIME_MS ||
    contractExpiresAtMs > approvalExpiresAtMs
  ) {
    fail(
      "erc1271_deployment_decision_expired",
      "approval or contract lifetime is outside the approved window"
    );
  }

  const owner = address("ownerAddress", decision.ownerAddress);
  const deployer = address("deployerAddress", decision.deployerAddress);
  const caps = exactObject("caps", decision.caps, CAP_KEYS);
  exactValue("caps.deploymentCount", caps.deploymentCount, 1);
  exactValue("caps.transactionValueWei", caps.transactionValueWei, "0");
  if (
    !Number.isSafeInteger(caps.gasLimit) ||
    caps.gasLimit < 100_000 ||
    caps.gasLimit > 500_000
  ) {
    fail("invalid_erc1271_deployment_decision", "gasLimit exceeds the approved cap");
  }
  integerString("maxFeePerGasWei", caps.maxFeePerGasWei, {
    maximum: "5000000000"
  });
  integerString("maximumFaucetBalanceWei", caps.maximumFaucetBalanceWei, {
    maximum: "1000000000000000000"
  });
  if (BigInt(caps.gasLimit) * BigInt(caps.maxFeePerGasWei) > 2_500_000_000_000_000n) {
    fail(
      "invalid_erc1271_deployment_decision",
      "deployment gas budget exceeds the approved cap"
    );
  }

  const e2e = exactObject("e2e", decision.e2e, E2E_KEYS);
  if (
    typeof e2e.humanEip191 !== "boolean" ||
    typeof e2e.agentEip712 !== "boolean" ||
    (e2e.humanEip191 !== true && e2e.agentEip712 !== true)
  ) {
    fail(
      "invalid_erc1271_deployment_decision",
      "at least one exact E2E proof must be approved"
    );
  }
  const roles = exactObject("roles", decision.roles, ROLE_KEYS);
  for (const [name, value] of Object.entries(roles)) role(name, value);

  const artifactDecision = exactObject(
    "artifact",
    decision.artifact,
    ARTIFACT_KEYS
  );
  exactValue(
    "artifact.sourceSha256",
    artifactDecision.sourceSha256,
    EXPECTED.sourceSha256
  );
  exactValue(
    "artifact.creationBytecodeKeccak256",
    artifactDecision.creationBytecodeKeccak256,
    EXPECTED.creationBytecodeKeccak256
  );
  exactValue(
    "artifact.deployedBytecodeKeccak256",
    artifactDecision.deployedBytecodeKeccak256,
    EXPECTED.deployedBytecodeKeccak256
  );

  const compiled = await compileMinimalErc1271TestWallet();
  exactValue("compiled source", compiled.sourceSha256, EXPECTED.sourceSha256);
  exactValue(
    "compiled creation bytecode",
    compiled.creationBytecodeKeccak256,
    EXPECTED.creationBytecodeKeccak256
  );
  exactValue(
    "compiled deployed bytecode",
    compiled.deployedBytecodeKeccak256,
    EXPECTED.deployedBytecodeKeccak256
  );
  const instanceRuntime = materializeMinimalErc1271TestWalletRuntime({
    artifact: compiled,
    ownerAddress: owner,
    expiresAt: decision.contractExpiresAt
  });

  return Object.freeze({
    schemaVersion: "wallet_003_erc1271_deployment_preflight.v1",
    status: "ready_for_human_signer_handoff",
    decisionId: decision.decisionId,
    decisionRecordHash: hashId("wallet_003_erc1271_deployment_decision", decision),
    chainId: EXPECTED.chainId,
    ownerAddressHash: hashId("wallet_address", owner.toLowerCase()),
    deployerAddressHash: hashId("wallet_address", deployer.toLowerCase()),
    contractExpiresAt: decision.contractExpiresAt,
    gasLimit: caps.gasLimit,
    maxFeePerGasWei: caps.maxFeePerGasWei,
    maximumFaucetBalanceWei: caps.maximumFaucetBalanceWei,
    humanEip191Approved: e2e.humanEip191,
    agentEip712Approved: e2e.agentEip712,
    sourceSha256: compiled.sourceSha256,
    creationBytecodeKeccak256: compiled.creationBytecodeKeccak256,
    deployedBytecodeKeccak256: compiled.deployedBytecodeKeccak256,
    expectedInstanceDeployedBytecodeKeccak256:
      instanceRuntime.deployedBytecodeKeccak256,
    keyMaterialAccepted: false,
    transactionBuilt: false,
    transactionSigned: false,
    transactionBroadcast: false,
    productionFundsMoved: false
  });
}

export async function readMinimalErc1271DeploymentDecision(path) {
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    !resolve(path).startsWith("/private/tmp/")
  ) {
    fail(
      "invalid_erc1271_deployment_decision_file",
      "decision file must be an absolute path below /private/tmp"
    );
  }
  const stats = await lstat(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600 ||
    stats.size < 2 ||
    stats.size > MAXIMUM_DECISION_BYTES
  ) {
    fail(
      "invalid_erc1271_deployment_decision_file",
      "decision file must be one bounded mode-0600 regular file"
    );
  }
  try {
    return parseStrictJson(await readFile(path, "utf8"), {
      maximumBytes: MAXIMUM_DECISION_BYTES,
      maximumDepth: 6,
      maximumKeys: 64
    });
  } catch {
    fail(
      "invalid_erc1271_deployment_decision_file",
      "decision file must contain one bounded strict JSON object"
    );
  }
}

function decisionPath(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== "--decision-file" ||
    typeof argv[1] !== "string"
  ) {
    fail(
      "invalid_erc1271_deployment_preflight_arguments",
      "use --decision-file with one absolute /private/tmp JSON path"
    );
  }
  return argv[1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const decision = await readMinimalErc1271DeploymentDecision(
    decisionPath(process.argv.slice(2))
  );
  const result = await prepareMinimalErc1271DeploymentDecision(decision);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
