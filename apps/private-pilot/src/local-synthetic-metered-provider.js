import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreditEventType,
  DomainError,
  createCreditEvent,
  createMeteredUsageEvidence,
  createMeteredUsagePolicy,
  createProvider,
  createSpendPolicy,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";

export const LOCAL_METERED_PROVIDER_ID = "provider_gateway_compute";
export const LOCAL_METERED_PROVIDER_RESOURCE_CLASS = "inference_tokens";
export const LOCAL_METERED_PROVIDER_MEASUREMENT_UNIT = "token";
export const LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR = "2";
export const LOCAL_METERED_PROVIDER_MAX_QUANTITY = "1000";
export const LOCAL_METERED_PROVIDER_MAX_EVENT_CHARGE_MINOR = "2000";
export const LOCAL_METERED_PROVIDER_MAX_WINDOW_CHARGE_MINOR = "5000";
export const LOCAL_METERED_PROVIDER_SCHEMA_VERSION =
  "ipo_one_local_synthetic_metered_provider_key.v1";
export const HOSTED_METERED_PROVIDER_SCHEMA_VERSION =
  "ipo_one_hosted_synthetic_metered_provider_key.v1";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LOCAL_METERED_PROVIDER_KEY_FILE = resolve(
  MODULE_DIRECTORY,
  "../../../.ipo-one/local-stack/metered-provider-key.v1.json"
);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,17}$/;
const MAXIMUM_KEY_FILE_BYTES = 8 * 1024;
const POLICY_VALID_FROM = "2026-01-01T00:00:00.000Z";
const POLICY_EXPIRES_AT = "2100-01-01T00:00:00.000Z";

function invalid(message) {
  throw new DomainError("invalid_local_metered_provider", message);
}

function exactObject(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) invalid("local synthetic Metered Provider material is invalid");
  return value;
}

function keyBytes(name, value) {
  if (
    typeof value !== "string" ||
    value.length < 40 ||
    value.length > 256 ||
    !BASE64URL.test(value)
  ) invalid(`${name} is invalid`);
  return value;
}

function assertSyntheticMeteredProviderMaterial(value, profile) {
  exactObject(value, [
    "privateKeyDer",
    "providerKeyId",
    "publicKeyDer",
    "schemaVersion"
  ]);
  const schemaVersion = profile === "hosted"
    ? HOSTED_METERED_PROVIDER_SCHEMA_VERSION
    : LOCAL_METERED_PROVIDER_SCHEMA_VERSION;
  const keyPrefix = profile === "hosted" ? "hosted_metered" : "local_metered";
  const keyNamespace = profile === "hosted"
    ? "hosted_metered_provider_key"
    : "local_metered_provider_key";
  if (value.schemaVersion !== schemaVersion) {
    invalid(`${profile} synthetic Metered Provider schemaVersion is invalid`);
  }
  const privateKeyDer = keyBytes("privateKeyDer", value.privateKeyDer);
  const publicKeyDer = keyBytes("publicKeyDer", value.publicKeyDer);
  const providerKeyId = `${keyPrefix}_${hashId(
    keyNamespace,
    publicKeyDer
  ).slice(2, 34)}`;
  if (value.providerKeyId !== providerKeyId) {
    invalid("local synthetic Metered Provider key binding is invalid");
  }
  try {
    const privateKey = createPrivateKey({
      key: Buffer.from(privateKeyDer, "base64url"),
      format: "der",
      type: "pkcs8"
    });
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyDer, "base64url"),
      format: "der",
      type: "spki"
    });
    const proof = Buffer.from("ipo.one local synthetic Metered Provider");
    if (!verify(null, proof, publicKey, sign(null, proof, privateKey))) {
      invalid("local synthetic Metered Provider key pair is invalid");
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    invalid("local synthetic Metered Provider key pair is invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    providerKeyId,
    privateKeyDer,
    publicKeyDer
  });
}

export function assertLocalSyntheticMeteredProviderMaterial(value) {
  return assertSyntheticMeteredProviderMaterial(value, "local");
}

export function assertHostedSyntheticMeteredProviderMaterial(value) {
  return assertSyntheticMeteredProviderMaterial(value, "hosted");
}

export async function loadOrCreateLocalSyntheticMeteredProviderMaterial(
  path = process.env.IPO_ONE_LOCAL_METERED_PROVIDER_KEY_FILE ||
    DEFAULT_LOCAL_METERED_PROVIDER_KEY_FILE
) {
  if (typeof path !== "string" || path.length < 1 || path.length > 2_048) {
    invalid("local synthetic Metered Provider key path is invalid");
  }
  try {
    const bytes = await readFile(path);
    if (bytes.length < 2 || bytes.length > MAXIMUM_KEY_FILE_BYTES || bytes.includes(0)) {
      invalid("local synthetic Metered Provider key file is invalid");
    }
    return assertLocalSyntheticMeteredProviderMaterial(parseStrictJson(
      bytes.toString("utf8"),
      { maximumBytes: MAXIMUM_KEY_FILE_BYTES, maximumDepth: 4, maximumKeys: 8 }
    ));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const pair = generateKeyPairSync("ed25519");
  const publicKeyDer = pair.publicKey.export({ format: "der", type: "spki" })
    .toString("base64url");
  const material = assertLocalSyntheticMeteredProviderMaterial({
    schemaVersion: LOCAL_METERED_PROVIDER_SCHEMA_VERSION,
    providerKeyId: `local_metered_${hashId(
      "local_metered_provider_key",
      publicKeyDer
    ).slice(2, 34)}`,
    privateKeyDer: pair.privateKey.export({ format: "der", type: "pkcs8" })
      .toString("base64url"),
    publicKeyDer
  });
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, `${JSON.stringify(material, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx"
  });
  return material;
}

function spendPolicyId({ tenantId, subjectId, obligationId, assetId }) {
  return `spend_policy_metered_${hashId("local_metered_spend_policy", {
    tenantId,
    subjectId,
    obligationId,
    providerId: LOCAL_METERED_PROVIDER_ID,
    assetId
  }).slice(2)}`;
}

function priceScheduleHash() {
  return hashId("local_metered_price_schedule", {
    providerId: LOCAL_METERED_PROVIDER_ID,
    resourceClass: LOCAL_METERED_PROVIDER_RESOURCE_CLASS,
    measurementUnit: LOCAL_METERED_PROVIDER_MEASUREMENT_UNIT,
    unitPriceMinor: LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR
  });
}

function createSyntheticMeteredProvider({ keyMaterial, profile }) {
  const material = assertSyntheticMeteredProviderMaterial(keyMaterial, profile);
  const privateKey = createPrivateKey({
    key: Buffer.from(material.privateKeyDer, "base64url"),
    format: "der",
    type: "pkcs8"
  });
  const publicKey = createPublicKey({
    key: Buffer.from(material.publicKeyDer, "base64url"),
    format: "der",
    type: "spki"
  });
  const exactPriceScheduleHash = priceScheduleHash();

  function createPolicy(binding) {
    return createMeteredUsagePolicy({
      policyId: spendPolicyId(binding),
      tenantId: binding.tenantId,
      subjectId: binding.subjectId,
      principalId: binding.principalId,
      mandateId: binding.mandateId,
      facilityId: binding.facilityId,
      authorizationId: binding.authorizationId,
      obligationId: binding.obligationId,
      providerId: LOCAL_METERED_PROVIDER_ID,
      resourceClass: LOCAL_METERED_PROVIDER_RESOURCE_CLASS,
      measurementUnit: LOCAL_METERED_PROVIDER_MEASUREMENT_UNIT,
      priceScheduleHash: exactPriceScheduleHash,
      unitPriceMinor: LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR,
      assetId: binding.assetId,
      maxQuantityPerEvent: LOCAL_METERED_PROVIDER_MAX_QUANTITY,
      maxChargePerEventMinor: LOCAL_METERED_PROVIDER_MAX_EVENT_CHARGE_MINOR,
      maxChargePerWindowMinor: LOCAL_METERED_PROVIDER_MAX_WINDOW_CHARGE_MINOR,
      validFrom: POLICY_VALID_FROM,
      expiresAt: POLICY_EXPIRES_AT
    });
  }

  return Object.freeze({
    providerId: LOCAL_METERED_PROVIDER_ID,
    providerKeyId: material.providerKeyId,
    priceScheduleHash: exactPriceScheduleHash,
    createPolicy,
    resolvePolicy({ tenantId, providerId, evidence }) {
      if (
        tenantId !== evidence?.tenantId ||
        providerId !== LOCAL_METERED_PROVIDER_ID ||
        evidence.providerId !== LOCAL_METERED_PROVIDER_ID
      ) return undefined;
      return createPolicy(evidence);
    },
    signEvidence(evidence) {
      if (
        evidence?.providerId !== LOCAL_METERED_PROVIDER_ID ||
        evidence.providerKeyId !== material.providerKeyId ||
        evidence.priceScheduleHash !== exactPriceScheduleHash
      ) invalid("Metered Usage Evidence is outside the local Provider profile");
      return sign(
        null,
        Buffer.from(evidence.usageEvidenceHash, "utf8"),
        privateKey
      ).toString("base64url");
    },
    verifySignature({ evidence, providerSignature }) {
      if (
        evidence?.providerId !== LOCAL_METERED_PROVIDER_ID ||
        evidence.providerKeyId !== material.providerKeyId ||
        evidence.priceScheduleHash !== exactPriceScheduleHash ||
        typeof providerSignature !== "string" ||
        !BASE64URL.test(providerSignature)
      ) return false;
      try {
        return verify(
          null,
          Buffer.from(evidence.usageEvidenceHash, "utf8"),
          publicKey,
          Buffer.from(providerSignature, "base64url")
        );
      } catch {
        return false;
      }
    }
  });
}

export function createLocalSyntheticMeteredProvider({ keyMaterial }) {
  return createSyntheticMeteredProvider({ keyMaterial, profile: "local" });
}

export function createHostedSyntheticMeteredProvider({ keyMaterial }) {
  return createSyntheticMeteredProvider({ keyMaterial, profile: "hosted" });
}

function repositoryFor(pool, authenticationContext, source = "local_test") {
  const tenantContext = createTenantSecurityContext({
    tenantId: authenticationContext.tenantId,
    actorId: authenticationContext.actorId,
    policyVersion: authenticationContext.policyVersion,
    source
  });
  const eventRepository = new PostgresEventRepository({ pool, tenantContext });
  return new PostgresCoreRepository({ pool, eventRepository });
}

async function provisionProvider(repository, { subjectId, obligationId, now, profile }) {
  const hosted = profile === "hosted";
  const provider = {
    ...createProvider({
      name: hosted
        ? "IPO.ONE Hosted Synthetic Inference Provider"
        : "IPO.ONE Local Synthetic Inference Provider",
      settlementAccountId: hosted
        ? "urn:ipo.one:sandbox:settlement:hosted-metered-provider"
        : "urn:ipo.one:sandbox:settlement:local-metered-provider",
      now: new Date(POLICY_VALID_FROM)
    }),
    providerId: LOCAL_METERED_PROVIDER_ID
  };
  const event = createCreditEvent({
    eventType: CreditEventType.PROVIDER_ALLOWLISTED,
    subjectId,
    obligationId,
    payload: {
      providerId: provider.providerId,
      providerHash: provider.providerHash,
      syntheticOnly: true,
      productionFundsMoved: false
    },
    now
  });
  await repository.commitCommand({
    aggregateType: "provider",
    aggregateId: provider.providerId,
    idempotencyKey: "provision-local-metered-provider-v1",
    commandHash: hashId("local_metered_provider_provision", provider.providerHash),
    events: [{
      aggregateType: "provider",
      aggregateId: provider.providerId,
      expectedVersion: 0,
      event
    }],
    writes: [{ type: CoreProjectionType.PROVIDER, value: provider, eventId: event.eventId }],
    response: {
      providerId: provider.providerId,
      providerHash: provider.providerHash,
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "local_metered_provider_provisioned.v1"
    }
  });
  return provider;
}

async function provisionSpendPolicy(repository, { obligation, policy, now }) {
  const spendPolicy = {
    ...createSpendPolicy({
      subjectId: obligation.subjectId,
      providerId: LOCAL_METERED_PROVIDER_ID,
      assetId: obligation.assetId,
      perTxLimitMinor: LOCAL_METERED_PROVIDER_MAX_EVENT_CHARGE_MINOR,
      dailyLimitMinor: LOCAL_METERED_PROVIDER_MAX_WINDOW_CHARGE_MINOR,
      obligationCapMinor: LOCAL_METERED_PROVIDER_MAX_WINDOW_CHARGE_MINOR,
      category: "compute",
      now: new Date(POLICY_VALID_FROM)
    }),
    spendPolicyId: policy.policyId
  };
  const event = createCreditEvent({
    eventType: CreditEventType.SPEND_POLICY_CREATED,
    subjectId: obligation.subjectId,
    obligationId: obligation.obligationId,
    payload: {
      spendPolicyId: spendPolicy.spendPolicyId,
      spendPolicyHash: spendPolicy.spendPolicyHash,
      providerId: spendPolicy.providerId,
      syntheticOnly: true,
      productionFundsMoved: false
    },
    now
  });
  await repository.commitCommand({
    aggregateType: "spend_policy",
    aggregateId: spendPolicy.spendPolicyId,
    idempotencyKey: `provision-${spendPolicy.spendPolicyId}`,
    commandHash: hashId("local_metered_spend_policy_provision", {
      spendPolicyHash: spendPolicy.spendPolicyHash,
      obligationId: obligation.obligationId
    }),
    events: [{
      aggregateType: "spend_policy",
      aggregateId: spendPolicy.spendPolicyId,
      expectedVersion: 0,
      event
    }],
    writes: [{
      type: CoreProjectionType.SPEND_POLICY,
      value: spendPolicy,
      eventId: event.eventId
    }],
    response: {
      providerId: spendPolicy.providerId,
      spendPolicyId: spendPolicy.spendPolicyId,
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "local_metered_spend_policy_provisioned.v1"
    }
  });
  return spendPolicy;
}

async function provisionSyntheticMeteredPolicy({
  pool,
  authenticationContext,
  obligationId,
  provider,
  now = new Date(),
  profile
}) {
  if (authenticationContext?.actorType !== "system_worker") {
    invalid("System Worker authentication is required");
  }
  const repository = repositoryFor(
    pool,
    authenticationContext,
    profile === "hosted"
      ? "system_worker"
      : "local_test"
  );
  const [obligation, mandate, lockbox] = await repository.withTenantTransaction(async (client) => {
    const obligationState = await repository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.OBLIGATION,
      obligationId,
      { lock: false }
    );
    const value = obligationState?.value;
    if (!value) invalid("active Agent Obligation is unavailable");
    const mandateState = await repository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.MANDATE,
      value.mandateId,
      { lock: false }
    );
    const currentLockbox = await repository.findAgentLockboxByObligationInTransaction(
      client,
      obligationId,
      { lock: false }
    );
    return [value, mandateState?.value, currentLockbox];
  });
  if (
    obligation.schemaVersion !== "obligation.v2" ||
    obligation.status !== "active" ||
    obligation.executionStatus !== "executed" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false ||
    !mandate ||
    mandate.status !== "active" ||
    !mandate.allowedProviderIds.includes(LOCAL_METERED_PROVIDER_ID) ||
    !lockbox ||
    !lockbox.allowedProviderIds.includes(LOCAL_METERED_PROVIDER_ID)
  ) invalid("active bounded Agent Obligation is unavailable");
  const policy = provider.createPolicy({
    tenantId: authenticationContext.tenantId,
    subjectId: obligation.subjectId,
    principalId: obligation.principalId,
    mandateId: mandate.mandateId,
    facilityId: lockbox.creditLineId,
    authorizationId: obligation.creditOfferAcceptanceId,
    obligationId: obligation.obligationId,
    assetId: obligation.assetId
  });
  await provisionProvider(repository, {
    subjectId: obligation.subjectId,
    obligationId: obligation.obligationId,
    now,
    profile
  });
  await provisionSpendPolicy(repository, { obligation, policy, now });
  return Object.freeze({ obligation, mandate, lockbox, policy });
}

export function provisionLocalSyntheticMeteredPolicy(input) {
  return provisionSyntheticMeteredPolicy({ ...input, profile: "local" });
}

export function provisionHostedSyntheticMeteredPolicy(input) {
  return provisionSyntheticMeteredPolicy({ ...input, profile: "hosted" });
}

async function prepareSyntheticMeteredUsage({
  pool,
  authenticationContext,
  obligationId,
  provider,
  runId,
  quantity = "250",
  now = new Date(),
  profile
}) {
  if (!RUN_ID.test(runId ?? "") || !POSITIVE_INTEGER.test(quantity ?? "")) {
    invalid("runId or quantity is invalid");
  }
  const runPrefix = profile === "hosted" ? "hosted_metered" : "local_metered";
  const runNamespace = profile === "hosted"
    ? "hosted_metered_provider_run"
    : "local_metered_provider_run";
  const providerEventId = `provider_event_${runPrefix}_${hashId(
    runNamespace,
    { tenantId: authenticationContext.tenantId, runId }
  ).slice(2)}`;
  const repository = repositoryFor(pool, authenticationContext);
  const existing = await repository.eventRepository.withTenantRead(async (client) => {
    const result = await client.query(
      `SELECT record FROM metered_usage_evidence
        WHERE provider_id = $1 AND provider_event_id = $2`,
      [LOCAL_METERED_PROVIDER_ID, providerEventId]
    );
    if (result.rowCount > 1) invalid("Metered Usage run identity is ambiguous");
    return result.rows[0]?.record;
  });
  if (existing) {
    if (obligationId !== existing.obligationId) {
      invalid("Metered Usage run is bound to a different Obligation");
    }
    if (quantity !== existing.quantity) {
      invalid("Metered Usage run quantity conflicts with the finalized Evidence");
    }
    const policy = provider.createPolicy(existing);
    return Object.freeze({
      evidence: existing,
      expectedPolicyHash: policy.policyHash,
      providerSignature: provider.signEvidence(existing),
      policy
    });
  }
  const provisioned = await provisionSyntheticMeteredPolicy({
    pool,
    authenticationContext,
    obligationId,
    provider,
    now,
    profile
  });
  const identityHash = hashId(`${profile}_metered_usage_run`, {
    tenantId: authenticationContext.tenantId,
    obligationId,
    runId
  });
  const usageEvidenceId = `usage_${runPrefix}_${identityHash.slice(2)}`;
  const evidence = createMeteredUsageEvidence({
    usageEvidenceId,
    providerEventId,
    nonce: `nonce_${runPrefix}_${identityHash.slice(2)}`,
    tenantId: authenticationContext.tenantId,
    subjectId: provisioned.policy.subjectId,
    principalId: provisioned.policy.principalId,
    mandateId: provisioned.policy.mandateId,
    facilityId: provisioned.policy.facilityId,
    authorizationId: provisioned.policy.authorizationId,
    obligationId: provisioned.policy.obligationId,
    providerId: provider.providerId,
    resourceClass: LOCAL_METERED_PROVIDER_RESOURCE_CLASS,
    measurementUnit: LOCAL_METERED_PROVIDER_MEASUREMENT_UNIT,
    quantity,
    priceScheduleHash: provider.priceScheduleHash,
    unitPriceMinor: LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR,
    chargeMinor: (BigInt(quantity) * BigInt(LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR)).toString(),
    assetId: provisioned.policy.assetId,
    windowStartedAt: new Date(now.getTime() - 60_000).toISOString(),
    windowEndedAt: new Date(now.getTime() - 1_000).toISOString(),
    observedAt: now.toISOString(),
    finality: "finalized",
    reconciliation: "reconciled",
    providerKeyId: provider.providerKeyId,
    providerPayloadHash: hashId(`${profile}_metered_provider_payload`, {
      obligationId,
      runId,
      quantity
    })
  });
  return Object.freeze({
    evidence,
    expectedPolicyHash: provisioned.policy.policyHash,
    providerSignature: provider.signEvidence(evidence),
    policy: provisioned.policy
  });
}

export function prepareLocalSyntheticMeteredUsage(input) {
  return prepareSyntheticMeteredUsage({ ...input, profile: "local" });
}

export function prepareHostedSyntheticMeteredUsage(input) {
  return prepareSyntheticMeteredUsage({ ...input, profile: "hosted" });
}

async function findSyntheticMeteredUsageRun({
  pool,
  authenticationContext,
  runId,
  profile
}) {
  if (!RUN_ID.test(runId ?? "")) invalid("runId is invalid");
  const runPrefix = profile === "hosted" ? "hosted_metered" : "local_metered";
  const runNamespace = profile === "hosted"
    ? "hosted_metered_provider_run"
    : "local_metered_provider_run";
  const providerEventId = `provider_event_${runPrefix}_${hashId(
    runNamespace,
    { tenantId: authenticationContext.tenantId, runId }
  ).slice(2)}`;
  const repository = repositoryFor(pool, authenticationContext);
  return repository.eventRepository.withTenantRead(async (client) => {
    const result = await client.query(
      `SELECT record FROM metered_usage_evidence
        WHERE provider_id = $1 AND provider_event_id = $2`,
      [LOCAL_METERED_PROVIDER_ID, providerEventId]
    );
    if (result.rowCount > 1) invalid("Metered Usage run identity is ambiguous");
    return result.rows[0]?.record;
  });
}


export function findLocalSyntheticMeteredUsageRun(input) {
  return findSyntheticMeteredUsageRun({ ...input, profile: "local" });
}

export function findHostedSyntheticMeteredUsageRun(input) {
  return findSyntheticMeteredUsageRun({ ...input, profile: "hosted" });
}
