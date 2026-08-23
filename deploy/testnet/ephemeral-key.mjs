import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const KEY_SCOPES = Object.freeze({
  "CHAIN-001B": "/private/tmp/ipo-one-chain-001b",
  "CHAIN-001D": "/private/tmp/ipo-one-chain-001d",
  "CHAIN-001F": "/private/tmp/ipo-one-chain-001f",
  "M2A-008": "/private/tmp/ipo-one-m2a-008"
});
const PRIVATE_KEY = /^0x[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`ephemeral_testnet_key_error: ${message}`);
}

function approvedKeyScope() {
  const approvalScope = process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
  const keyDirectory = KEY_SCOPES[approvalScope];
  if (!keyDirectory) {
    fail("explicit approved runtime acknowledgement is required");
  }
  return { approvalScope, keyDirectory };
}

function safeKeyPath(path, { expectedDirectory } = {}) {
  const absolute = resolve(path);
  const keyDirectory = Object.values(KEY_SCOPES).find(
    (directory) => absolute.startsWith(`${directory}/`)
  );
  if (
    !keyDirectory ||
    (expectedDirectory && keyDirectory !== expectedDirectory) ||
    !absolute.endsWith(".key")
  ) {
    fail("key files must stay under the dedicated private temporary directory");
  }
  return absolute;
}

export async function provisionEphemeralTestnetKey({ keyPath } = {}) {
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    fail("ephemeral testnet key provisioning is disabled in CI");
  }
  const { approvalScope, keyDirectory } = approvedKeyScope();
  const selected = safeKeyPath(
    keyPath ?? `${keyDirectory}/deployer-${Date.now()}-${randomUUID()}.key`,
    { expectedDirectory: keyDirectory }
  );
  await mkdir(dirname(selected), { recursive: true, mode: 0o700 });
  const privateKey = generatePrivateKey();
  const handle = await open(selected, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(privateKey, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  return Object.freeze({
    address: privateKeyToAccount(privateKey).address,
    keyPath: selected,
    approvalScope,
    keyStoredInRepository: false,
    keyLogged: false,
    ciEnabled: false,
    schemaVersion: "ephemeral_testnet_key_provisioning.v1"
  });
}

export async function readEphemeralTestnetKey(keyPath) {
  const selected = safeKeyPath(keyPath);
  const stat = await lstat(selected);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail("key file must be a regular owner-only file");
  }
  const value = (await readFile(selected, "utf8")).trim();
  if (!PRIVATE_KEY.test(value)) fail("key file content is invalid");
  return value;
}

export async function destroyEphemeralTestnetKey(keyPath) {
  const selected = safeKeyPath(keyPath);
  const stat = await lstat(selected);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail("key file must be a regular owner-only file");
  }
  const handle = await open(selected, constants.O_RDWR);
  try {
    let remaining = stat.size;
    let offset = 0;
    while (remaining > 0) {
      const chunk = randomBytes(Math.min(remaining, 4096));
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
    fail("key file still exists after destruction");
  } catch (error) {
    if (!String(error?.message).includes("ENOENT") && error?.code !== "ENOENT") throw error;
  }
  return Object.freeze({
    keyPath: selected,
    logicallyDestroyed: true,
    storageMediumSecureEraseClaimed: false,
    destroyedAt: new Date().toISOString(),
    schemaVersion: "ephemeral_testnet_key_destruction.v1"
  });
}
