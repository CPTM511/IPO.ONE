import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  unlink
} from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../packages/domain/src/index.js";
import {
  HypercoreSigningScheme,
  IsolatedHypercoreTypedDataSigner
} from "../../modules/hypercore-venue-adapter/src/index.js";

const KEY_DIRECTORY = "/private/tmp/ipo-one-hypercore-002d";
const APPROVAL_MARKER = "HYPERLIQUID-002D:TESTNET_API_WALLET";
const PRIVATE_KEY = /^0x[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`hypercore_isolated_signer_error: ${message}`);
}

function requireProvisioningApproval() {
  if (
    process.env.IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER !== APPROVAL_MARKER
  ) {
    fail("exact Testnet signer provisioning approval is required");
  }
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    fail("HyperCore Testnet signer provisioning is disabled in CI");
  }
}

function safeKeyPath(value) {
  const absolute = resolve(value);
  if (
    !absolute.startsWith(`${KEY_DIRECTORY}/`) ||
    !absolute.endsWith(".key")
  ) {
    fail("signer keys must stay under the dedicated private temporary directory");
  }
  return absolute;
}

function descriptor(keyPath, address) {
  const apiWalletAddressHash = hashId(
    "hypercore_account_address",
    address.toLowerCase()
  );
  const signerId = `hypercore_002d_signer_${hashId(
    "hypercore_testnet_signer_identity",
    { apiWalletAddressHash, keyFile: basename(keyPath) }
  ).slice(2)}`;
  const isolatedSignerReference =
    `local-process://hypercore-testnet-signers/${signerId}`;
  return Object.freeze({
    signerId,
    isolatedSignerReference,
    signerReferenceHash: hashId(
      "hypercore_isolated_signer_reference",
      isolatedSignerReference
    ),
    apiWalletAddressHash,
    keyPath,
    keyPathHash: hashId("hypercore_isolated_signer_key_path", keyPath),
    environment: "hyperliquid_testnet",
    keyStoredInRepository: false,
    rawAddressLogged: false,
    rawKeyLogged: false,
    rawKeyExported: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "hypercore_isolated_testnet_signer_descriptor.v1"
  });
}

async function readOwnerOnlyKey(keyPath) {
  const selected = safeKeyPath(keyPath);
  const stat = await lstat(selected);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail("signer key must be a regular owner-only file");
  }
  const privateKey = (await readFile(selected, "utf8")).trim();
  if (!PRIVATE_KEY.test(privateKey)) fail("signer key content is invalid");
  return { selected, stat, privateKey };
}

export async function provisionHypercoreIsolatedTestnetSigner({ keyPath } = {}) {
  requireProvisioningApproval();
  const selected = safeKeyPath(
    keyPath ?? `${KEY_DIRECTORY}/api-wallet-${Date.now()}-${randomUUID()}.key`
  );
  await mkdir(dirname(selected), { recursive: true, mode: 0o700 });
  const privateKey = generatePrivateKey();
  const handle = await open(
    selected,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600
  );
  try {
    await handle.writeFile(privateKey, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  return descriptor(selected, privateKeyToAccount(privateKey).address);
}

export async function inspectHypercoreIsolatedTestnetSigner(keyPath) {
  const { selected, privateKey } = await readOwnerOnlyKey(keyPath);
  return descriptor(selected, privateKeyToAccount(privateKey).address);
}

export async function withHypercoreIsolatedTestnetSigner(keyPath, operation) {
  if (typeof operation !== "function") {
    fail("a closed signer operation is required");
  }
  const { selected, privateKey } = await readOwnerOnlyKey(keyPath);
  const account = privateKeyToAccount(privateKey);
  const safeDescriptor = descriptor(selected, account.address);
  const isolatedSigner = new IsolatedHypercoreTypedDataSigner({
    signerId: safeDescriptor.signerId,
    expectedSignerAddress: account.address.toLowerCase(),
    signTypedData: (typedData) => account.signTypedData(typedData)
  });
  const executionSigner = Object.freeze({
    profile: isolatedSigner.profile,
    async sign(request) {
      if (
        request?.scheme !== HypercoreSigningScheme.L1_ACTION ||
        request?.purpose !== "hypercore_testnet_execution"
      ) {
        fail("isolated API wallet may sign only the exact L1 execution request");
      }
      return isolatedSigner.sign(request);
    }
  });
  return operation(Object.freeze({
    descriptor: safeDescriptor,
    transientApiWalletAddress: account.address.toLowerCase(),
    signer: executionSigner
  }));
}

export async function destroyHypercoreIsolatedTestnetSigner(keyPath) {
  const { selected, stat } = await readOwnerOnlyKey(keyPath);
  const handle = await open(selected, constants.O_RDWR);
  try {
    let remaining = stat.size;
    let offset = 0;
    while (remaining > 0) {
      const chunk = randomBytes(Math.min(remaining, 4_096));
      await handle.write(chunk, 0, chunk.length, offset);
      offset += chunk.length;
      remaining -= chunk.length;
    }
    await handle.sync();
    await handle.truncate(0);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await unlink(selected);
  try {
    await access(selected);
    fail("signer key still exists after destruction");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return Object.freeze({
    keyPathHash: hashId("hypercore_isolated_signer_key_path", selected),
    logicallyDestroyed: true,
    storageMediumSecureEraseClaimed: false,
    destroyedAt: new Date().toISOString(),
    schemaVersion: "hypercore_isolated_testnet_signer_destruction.v1"
  });
}

export const HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL = APPROVAL_MARKER;
