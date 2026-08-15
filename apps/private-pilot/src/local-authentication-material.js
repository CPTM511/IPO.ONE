import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair
} from "jose";
import { getAddress } from "viem";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export const LOCAL_AUTHENTICATION_SERVER_SCHEMA_VERSION =
  "ipo_one_local_authentication_server.v1";
export const LOCAL_AUTHENTICATION_INVITATION_SCHEMA_VERSION =
  "ipo_one_local_authentication_invitation.v1";
export const LOCAL_AGENT_KEY_SCHEMA_VERSION =
  "ipo_one_local_agent_key.v1";
export const LOCAL_AGENT_ISSUER = "https://workload.local.ipo.one";
export const LOCAL_AGENT_EXTERNAL_SUBJECT =
  "urn:ipo.one:local-agent:pilot-alpha";

const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;
const THUMBPRINT = /^[A-Za-z0-9_-]{43}$/;
const MAXIMUM_BYTES = 16 * 1024;

function invalidMaterial(message) {
  return new DomainError(
    "invalid_local_authentication_material",
    message
  );
}

function exactObject(name, value, required) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    throw invalidMaterial(`${name} is invalid`);
  }
  return value;
}

function base64Key(name, value) {
  if (typeof value !== "string" || !BASE64URL_32.test(value)) {
    throw invalidMaterial(`${name} is invalid`);
  }
  return value;
}

function publicP256Jwk(value) {
  exactObject("Agent public JWK", value, [
    "alg",
    "crv",
    "key_ops",
    "kty",
    "use",
    "x",
    "y"
  ]);
  if (
    value.alg !== "ES256" ||
    value.crv !== "P-256" ||
    value.kty !== "EC" ||
    value.use !== "sig" ||
    !Array.isArray(value.key_ops) ||
    value.key_ops.length !== 1 ||
    value.key_ops[0] !== "verify" ||
    !BASE64URL_32.test(value.x) ||
    !BASE64URL_32.test(value.y)
  ) {
    throw invalidMaterial("Agent public JWK is invalid");
  }
  return Object.freeze(structuredClone(value));
}

function privateP256Jwk(value) {
  exactObject("Agent private JWK", value, [
    "alg",
    "crv",
    "d",
    "key_ops",
    "kty",
    "use",
    "x",
    "y"
  ]);
  if (
    value.alg !== "ES256" ||
    value.crv !== "P-256" ||
    value.kty !== "EC" ||
    value.use !== "sig" ||
    !Array.isArray(value.key_ops) ||
    value.key_ops.length !== 1 ||
    value.key_ops[0] !== "sign" ||
    !BASE64URL_32.test(value.d) ||
    !BASE64URL_32.test(value.x) ||
    !BASE64URL_32.test(value.y)
  ) {
    throw invalidMaterial("Agent private JWK is invalid");
  }
  return Object.freeze(structuredClone(value));
}

function expiration(value, now = new Date()) {
  const parsed = new Date(value);
  if (
    typeof value !== "string" ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    parsed <= now ||
    parsed.getTime() - now.getTime() > 90 * 24 * 60 * 60 * 1_000
  ) {
    throw invalidMaterial("local Credential expiration is invalid");
  }
  return value;
}

function walletAddress(value) {
  try {
    return getAddress(value);
  } catch {
    throw invalidMaterial("invited wallet address is invalid");
  }
}

async function readMaterial(path, label) {
  if (typeof path !== "string" || path.length < 1 || path.length > 2_048) {
    throw invalidMaterial(`${label} path is invalid`);
  }
  const bytes = await readFile(path);
  if (bytes.length < 2 || bytes.length > MAXIMUM_BYTES || bytes.includes(0)) {
    throw invalidMaterial(`${label} file is invalid`);
  }
  return parseStrictJson(bytes.toString("utf8"), {
    maximumBytes: MAXIMUM_BYTES,
    maximumDepth: 6,
    maximumKeys: 64
  });
}

export function assertLocalAuthenticationServerMaterial(value) {
  exactObject("local authentication server material", value, [
    "authenticationRolePassword",
    "encryptionKey",
    "referenceHashKey",
    "schemaVersion"
  ]);
  if (value.schemaVersion !== LOCAL_AUTHENTICATION_SERVER_SCHEMA_VERSION) {
    throw invalidMaterial("local authentication server schemaVersion is invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    authenticationRolePassword: base64Key(
      "authenticationRolePassword",
      value.authenticationRolePassword
    ),
    encryptionKey: base64Key("encryptionKey", value.encryptionKey),
    referenceHashKey: base64Key("referenceHashKey", value.referenceHashKey)
  });
}

export function assertLocalAuthenticationInvitation(value, { now } = {}) {
  exactObject("local authentication invitation", value, [
    "agentPublicJwk",
    "agentThumbprint",
    "credentialExpiresAt",
    "schemaVersion",
    "walletAddress"
  ]);
  if (value.schemaVersion !== LOCAL_AUTHENTICATION_INVITATION_SCHEMA_VERSION) {
    throw invalidMaterial("local authentication invitation schemaVersion is invalid");
  }
  const agentPublicJwk = publicP256Jwk(value.agentPublicJwk);
  if (
    typeof value.agentThumbprint !== "string" ||
    !THUMBPRINT.test(value.agentThumbprint)
  ) {
    throw invalidMaterial("Agent thumbprint is invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    walletAddress: walletAddress(value.walletAddress),
    credentialExpiresAt: expiration(value.credentialExpiresAt, now),
    agentPublicJwk,
    agentThumbprint: value.agentThumbprint
  });
}

export function assertLocalAgentKeyMaterial(value) {
  exactObject("local Agent key material", value, [
    "agentPrivateJwk",
    "agentPublicJwk",
    "agentThumbprint",
    "schemaVersion"
  ]);
  if (value.schemaVersion !== LOCAL_AGENT_KEY_SCHEMA_VERSION) {
    throw invalidMaterial("local Agent key schemaVersion is invalid");
  }
  const agentPublicJwk = publicP256Jwk(value.agentPublicJwk);
  const agentPrivateJwk = privateP256Jwk(value.agentPrivateJwk);
  if (
    agentPrivateJwk.x !== agentPublicJwk.x ||
    agentPrivateJwk.y !== agentPublicJwk.y ||
    typeof value.agentThumbprint !== "string" ||
    !THUMBPRINT.test(value.agentThumbprint)
  ) {
    throw invalidMaterial("local Agent key binding is invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    agentPrivateJwk,
    agentPublicJwk,
    agentThumbprint: value.agentThumbprint
  });
}

export async function createLocalAuthenticationMaterial({
  invitedWalletAddress,
  now = new Date()
}) {
  const pair = await generateKeyPair("ES256", { extractable: true });
  const [privateJwk, publicJwk] = await Promise.all([
    exportJWK(pair.privateKey),
    exportJWK(pair.publicKey)
  ]);
  const agentPublicJwk = {
    ...publicJwk,
    alg: "ES256",
    key_ops: ["verify"],
    use: "sig"
  };
  const agentPrivateJwk = {
    ...privateJwk,
    alg: "ES256",
    key_ops: ["sign"],
    use: "sig"
  };
  const agentThumbprint = await calculateJwkThumbprint(
    agentPublicJwk,
    "sha256"
  );
  const credentialExpiresAt = new Date(
    now.getTime() + 89 * 24 * 60 * 60 * 1_000
  ).toISOString();
  return Object.freeze({
    server: assertLocalAuthenticationServerMaterial({
      schemaVersion: LOCAL_AUTHENTICATION_SERVER_SCHEMA_VERSION,
      authenticationRolePassword: randomBytes(32).toString("base64url"),
      encryptionKey: randomBytes(32).toString("base64url"),
      referenceHashKey: randomBytes(32).toString("base64url")
    }),
    invitation: assertLocalAuthenticationInvitation({
      schemaVersion: LOCAL_AUTHENTICATION_INVITATION_SCHEMA_VERSION,
      walletAddress: walletAddress(invitedWalletAddress),
      credentialExpiresAt,
      agentPublicJwk,
      agentThumbprint
    }, { now }),
    agent: assertLocalAgentKeyMaterial({
      schemaVersion: LOCAL_AGENT_KEY_SCHEMA_VERSION,
      agentPrivateJwk,
      agentPublicJwk,
      agentThumbprint
    })
  });
}

export async function loadLocalAuthenticationServerMaterial(path) {
  return assertLocalAuthenticationServerMaterial(
    await readMaterial(path, "local authentication server material")
  );
}

export async function loadLocalAuthenticationInvitation(path, options) {
  return assertLocalAuthenticationInvitation(
    await readMaterial(path, "local authentication invitation"),
    options
  );
}

export async function loadLocalAgentKeyMaterial(path) {
  return assertLocalAgentKeyMaterial(
    await readMaterial(path, "local Agent key material")
  );
}
