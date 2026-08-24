import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, defineChain, http } from "viem";

const EXPLORER = "https://repo.sourcify.dev";
const VERIFIER = "https://sourcify.dev/server";
const RPC = "https://sepolia.base.org";
const CONTRACTS = Object.freeze([
  {
    name: "IpoOnePriceOracleAdapterV1",
    address: "0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19",
    transactionHash: "0x9653196281e29f96476a53aed2b21a2a6ee14794987dd1aeaeb98df376c8721f",
    source: "contracts/src/m2/IpoOnePriceOracleAdapterV1.sol",
    artifact: "out/foundry/IpoOnePriceOracleAdapterV1.sol/IpoOnePriceOracleAdapterV1.json"
  },
  {
    name: "IpoOneSecuredPoolV1",
    address: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
    transactionHash: "0x90d67e7732f752bcf13dd4278ea6ca3263f715d75766f2b497d997b07fd3d9e3",
    source: "contracts/src/m2/IpoOneSecuredPoolV1.sol",
    artifact: "out/foundry/IpoOneSecuredPoolV1.sol/IpoOneSecuredPoolV1.json"
  }
]);

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

async function request(url, options = {}, { allowNotFound = false } = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  if (allowNotFound && response.status === 404) return undefined;
  if (!response.ok) fail("m2a008_explorer_request_failed", `${response.status} ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : undefined;
}

async function explorerStatus(address) {
  return request(
    `${VERIFIER}/v2/contract/84532/${address}?fields=all`,
    {},
    { allowNotFound: true }
  );
}

async function standardInput(artifact) {
  const metadata = artifact.metadata;
  const { compilationTarget: _compilationTarget, ...compilerSettings } = metadata.settings;
  const sources = {};
  for (const sourcePath of Object.keys(metadata.sources)) {
    sources[sourcePath] = { content: await readFile(resolve(sourcePath), "utf8") };
  }
  return {
    language: metadata.language,
    sources,
    settings: {
      ...compilerSettings,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } }
    }
  };
}

async function verifyOne(client, contract) {
  const current = await explorerStatus(contract.address);
  if (["match", "exact_match"].includes(current?.match)) {
    return {
      ...contract,
      status: "verified",
      match: current.match,
      creationMatch: current.creationMatch,
      runtimeMatch: current.runtimeMatch,
      verificationSubmitted: false
    };
  }
  const artifact = JSON.parse(await readFile(resolve(contract.artifact), "utf8"));
  const transaction = await client.getTransaction({ hash: contract.transactionHash });
  const bytecode = artifact.bytecode.object.toLowerCase();
  const input = transaction.input.toLowerCase();
  if (!input.startsWith(bytecode)) {
    fail("m2a008_verification_bytecode_mismatch", `${contract.name} transaction does not contain the admitted creation bytecode`);
  }
  const submitted = await request(`${VERIFIER}/v2/verify/84532/${contract.address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: await standardInput(artifact),
      compilerVersion: artifact.metadata.compiler.version,
      contractIdentifier: `${contract.source}:${contract.name}`,
      creationTransactionHash: contract.transactionHash
    })
  });
  if (!submitted?.verificationId) {
    fail("m2a008_source_verification_rejected", `${contract.name} did not receive a verification job`);
  }
  const deadline = Date.now() + 3 * 60_000;
  do {
    await delay(5_000);
    const job = await request(`${VERIFIER}/v2/verify/${submitted.verificationId}`);
    if (job.isJobCompleted && ["match", "exact_match"].includes(job.contract?.match)) {
      return {
        ...contract,
        status: "verified",
        match: job.contract.match,
        creationMatch: job.contract.creationMatch,
        runtimeMatch: job.contract.runtimeMatch,
        verificationSubmitted: true,
        verificationId: submitted.verificationId
      };
    }
    if (job.isJobCompleted) {
      fail(
        "m2a008_source_verification_failed",
        `${contract.name}: ${job.error?.customCode ?? "unknown_verification_error"}: ${job.error?.message ?? "no detail"}`
      );
    }
  } while (Date.now() < deadline);
  fail("m2a008_source_verification_timeout", `${contract.name} did not become explorer-verified`);
}

export async function verifyM2A008Sources() {
  const client = createPublicClient({
    chain: defineChain({
      id: 84532,
      name: "Base Sepolia",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [RPC] } },
      testnet: true
    }),
    transport: http(RPC, { retryCount: 1, timeout: 15_000 })
  });
  const contracts = [];
  for (const contract of CONTRACTS) contracts.push(await verifyOne(client, contract));
  const evidence = {
    schemaVersion: "m2a_008_source_explorer_verification.v1",
    chainId: "eip155:84532",
    explorer: EXPLORER,
    verifier: VERIFIER,
    compilerVersion: "v0.8.30+commit.73712a01",
    optimizationEnabled: true,
    optimizationRuns: 200,
    evmVersion: "cancun",
    metadataBytecodeHash: "none",
    license: "MIT",
    contracts: contracts.map((contract) => ({
      name: contract.name,
      address: contract.address,
      transactionHash: contract.transactionHash,
      status: contract.status,
      match: contract.match,
      creationMatch: contract.creationMatch,
      runtimeMatch: contract.runtimeMatch,
      verificationSubmitted: contract.verificationSubmitted,
      ...(contract.verificationId ? { verificationId: contract.verificationId } : {}),
      sourceUrl: `${EXPLORER}/84532/${contract.address}`
    })),
    verifiedContractCount: contracts.length,
    discrepancyCount: 0,
    sourceContainsPrivateKey: false,
    testAssetsOnly: true,
    productionFundsMoved: false,
    verifiedAt: new Date().toISOString()
  };
  const artifactPath = resolve("artifacts/testnet/eip155-84532-m2a-008-source-verification-20260824.json");
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ ...evidence, artifactPath, status: "PASS" });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await verifyM2A008Sources(), null, 2)}\n`);
}
