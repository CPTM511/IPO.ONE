import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  defineChain,
  http
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount
} from "viem/accounts";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../modules/event-indexer/src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const PROJECT = "ipo-one-local";
const BASE_COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const ANCHOR_COMPOSE_FILE = resolve(
  ROOT,
  "deploy/local/evidence-anchor.compose.yaml"
);
const SECRET_DIRECTORY = resolve(ROOT, ".ipo-one/local-stack");
const ENV_FILE = resolve(SECRET_DIRECTORY, "stack.env");
const KEY_FILE = resolve(SECRET_DIRECTORY, "evidence-attestor.key");
const APPROVAL = "CHAIN-001F";
const CHAIN_ID = "eip155:84532";
const CONTRACT_ADDRESS = "0x78ba26d4a9211e8d4b0158c9e5443305278c1df0";
const MAX_BALANCE_WEI = 10_000_000_000_000_000n;
const PRIVATE_KEY = /^0x[0-9a-f]{64}$/;

function fail(message) {
  process.stderr.write(`CHAIN-001F local attestor: ${message}\n`);
  process.exit(1);
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.error) fail(`${command} is unavailable`);
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(`${command} exited with status ${result.status}`);
  }
  return capture ? result.stdout.trim() : "";
}

async function readKey() {
  const stat = await lstat(KEY_FILE);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail("attestor key must be a regular owner-only file");
  }
  const privateKey = (await readFile(KEY_FILE, "utf8")).trim();
  if (!PRIVATE_KEY.test(privateKey)) fail("attestor key content is invalid");
  return privateKey;
}

function compose(args, { evidenceAnchor = false, capture = false } = {}) {
  const files = [
    "--file",
    BASE_COMPOSE_FILE,
    ...(evidenceAnchor
      ? ["--file", ANCHOR_COMPOSE_FILE]
      : [])
  ];
  return run(
    "limactl",
    [
      "shell",
      "--workdir",
      ROOT,
      INSTANCE,
      "docker",
      "compose",
      "--project-name",
      PROJECT,
      "--env-file",
      ENV_FILE,
      ...files,
      ...args
    ],
    { capture }
  );
}

async function descriptor() {
  const account = privateKeyToAccount(await readKey());
  const config = getLiveTestnetConfig(CHAIN_ID);
  const provider = resolveApprovedRpc({
    chainId: CHAIN_ID,
    providerSlot: "primary"
  });
  const chain = defineChain({
    id: config.numericChainId,
    name: "Base Sepolia",
    nativeCurrency: {
      name: "Base Sepolia ETH",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: { default: { http: [provider.rpcUrl] } },
    testnet: true
  });
  const client = createPublicClient({
    chain,
    transport: http(provider.rpcUrl, { retryCount: 0, timeout: 10_000 })
  });
  const [remoteChainId, balance] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: account.address })
  ]);
  if (remoteChainId !== config.numericChainId) {
    fail("approved RPC is not Base Sepolia");
  }
  return Object.freeze({
    checkpoint: APPROVAL,
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_ADDRESS,
    attestorAddress: account.address,
    balanceWei: balance.toString(),
    maximumBalanceWei: MAX_BALANCE_WEI.toString(),
    funded: balance > 0n,
    withinBalanceCap: balance <= MAX_BALANCE_WEI,
    keyTrackedByGit: false,
    keyExcludedFromDockerBuildContext: true,
    keyIncludedInOutput: false,
    nativeValuePerAnchor: "0",
    productionFundsMoved: false,
    schemaVersion: "local_evidence_attestor_status.v1"
  });
}

const command = process.argv[2];

switch (command) {
  case "init": {
    if (
      process.env.IPO_ONE_APPROVE_LOCAL_EVIDENCE_ATTESTOR !== APPROVAL
    ) {
      fail("explicit CHAIN-001F attestor provisioning acknowledgement is required");
    }
    await mkdir(SECRET_DIRECTORY, { recursive: true, mode: 0o700 });
    await chmod(SECRET_DIRECTORY, 0o700);
    const privateKey = generatePrivateKey();
    const handle = await open(
      KEY_FILE,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600
    );
    try {
      await handle.writeFile(privateKey, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    process.stdout.write(`${JSON.stringify({
      checkpoint: APPROVAL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT_ADDRESS,
      attestorAddress: privateKeyToAccount(privateKey).address,
      maximumBalanceWei: MAX_BALANCE_WEI.toString(),
      keyStoredUnderIgnoredLocalSecretBoundary: true,
      keyIncludedInOutput: false,
      chainWritesEnabled: false,
      schemaVersion: "local_evidence_attestor_provisioning.v1"
    }, null, 2)}\n`);
    break;
  }
  case "status": {
    const status = await descriptor();
    const coverage = compose([
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-A",
      "-t",
      "-U",
      "ipo_one_owner",
      "-d",
      "ipo_one_private_pilot",
      "-c",
      "SELECT count(*) || '/' || count(*) FILTER (WHERE status = 'finalized') FROM evidence_chain_anchors;"
    ], { capture: true });
    process.stdout.write(`${JSON.stringify({
      ...status,
      anchorRequirementsAndFinalized: coverage
    }, null, 2)}\n`);
    break;
  }
  case "enable": {
    if (
      process.env.IPO_ONE_APPROVE_LOCAL_EVIDENCE_ANCHOR_WRITES !== APPROVAL
    ) {
      fail("explicit CHAIN-001F Base Sepolia write acknowledgement is required");
    }
    const status = await descriptor();
    if (!status.funded || !status.withinBalanceCap) {
      fail("attestor must be funded above zero and within the 0.01 ETH cap");
    }
    compose([
      "up",
      "--detach",
      "--build",
      "--wait",
      "worker"
    ], { evidenceAnchor: true });
    process.stdout.write(
      "CHAIN-001F local Evidence attestor worker enabled for zero-value Base Sepolia hash anchors.\n"
    );
    break;
  }
  case "disable":
    compose(["up", "--detach", "--wait", "worker"]);
    process.stdout.write(
      "CHAIN-001F Evidence attestor configuration removed from the local worker; key retained.\n"
    );
    break;
  default:
    fail("usage: node scripts/local-evidence-anchor.mjs init|status|enable|disable");
}
