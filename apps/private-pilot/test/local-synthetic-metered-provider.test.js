import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createMeteredUsageEvidence, hashId } from "../../../packages/domain/src/index.js";
import {
  LOCAL_METERED_PROVIDER_ID,
  assertHostedSyntheticMeteredProviderMaterial,
  createHostedSyntheticMeteredProvider,
  createLocalSyntheticMeteredProvider,
  loadOrCreateLocalSyntheticMeteredProviderMaterial
} from "../src/local-synthetic-metered-provider.js";

function binding() {
  return {
    tenantId: "tenant_local_metered_test",
    subjectId: "subject_local_metered_test",
    principalId: "principal_local_metered_test",
    mandateId: "mandate_local_metered_test",
    facilityId: "facility_local_metered_test",
    authorizationId: "authorization_local_metered_test",
    obligationId: "obligation_local_metered_test",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent"
  };
}

function evidence(provider, policy) {
  return createMeteredUsageEvidence({
    usageEvidenceId: "usage_local_metered_test",
    providerEventId: "provider_event_local_metered_test",
    nonce: "nonce_local_metered_test",
    ...binding(),
    providerId: LOCAL_METERED_PROVIDER_ID,
    resourceClass: "inference_tokens",
    measurementUnit: "token",
    quantity: "250",
    priceScheduleHash: policy.priceScheduleHash,
    unitPriceMinor: "2",
    chargeMinor: "500",
    windowStartedAt: "2026-09-03T00:00:00.000Z",
    windowEndedAt: "2026-09-03T00:01:00.000Z",
    observedAt: "2026-09-03T00:01:01.000Z",
    finality: "finalized",
    reconciliation: "reconciled",
    providerKeyId: provider.providerKeyId,
    providerPayloadHash: hashId("local_metered_test_payload", "one")
  });
}

test("local synthetic Metered Provider persists a private key with restrictive permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-metered-provider-"));
  const path = join(directory, "nested", "provider.json");
  const created = await loadOrCreateLocalSyntheticMeteredProviderMaterial(path);
  const recovered = await loadOrCreateLocalSyntheticMeteredProviderMaterial(path);
  assert.deepEqual(recovered, created);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, "nested"))).mode & 0o777, 0o700);
  const serialized = JSON.parse(await readFile(path, "utf8"));
  assert.equal(serialized.providerKeyId, created.providerKeyId);
});

test("hosted synthetic Metered Provider requires a fresh hosted key identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-metered-provider-"));
  const localMaterial = await loadOrCreateLocalSyntheticMeteredProviderMaterial(
    join(directory, "provider.json")
  );
  assert.throws(
    () => assertHostedSyntheticMeteredProviderMaterial(localMaterial),
    (error) => error?.code === "invalid_local_metered_provider"
  );
  const hostedMaterial = assertHostedSyntheticMeteredProviderMaterial({
    ...localMaterial,
    schemaVersion: "ipo_one_hosted_synthetic_metered_provider_key.v1",
    providerKeyId: `hosted_metered_${hashId(
      "hosted_metered_provider_key",
      localMaterial.publicKeyDer
    ).slice(2, 34)}`
  });
  const hosted = createHostedSyntheticMeteredProvider({ keyMaterial: hostedMaterial });
  const policy = hosted.createPolicy(binding());
  const signedEvidence = evidence(hosted, policy);
  const signature = hosted.signEvidence(signedEvidence);
  assert.match(hosted.providerKeyId, /^hosted_metered_/);
  assert.equal(hosted.verifySignature({ evidence: signedEvidence, providerSignature: signature }), true);
  assert.notEqual(hosted.providerKeyId, localMaterial.providerKeyId);
});

test("local synthetic Metered Provider binds policy, key and signature exactly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-metered-provider-"));
  const material = await loadOrCreateLocalSyntheticMeteredProviderMaterial(
    join(directory, "provider.json")
  );
  const provider = createLocalSyntheticMeteredProvider({ keyMaterial: material });
  const policy = provider.createPolicy(binding());
  const signedEvidence = evidence(provider, policy);
  const providerSignature = provider.signEvidence(signedEvidence);

  assert.equal(provider.resolvePolicy({
    tenantId: signedEvidence.tenantId,
    providerId: signedEvidence.providerId,
    evidence: signedEvidence
  }).policyHash, policy.policyHash);
  assert.equal(provider.verifySignature({ signedEvidence, providerSignature }), false);
  assert.equal(provider.verifySignature({
    evidence: signedEvidence,
    providerSignature
  }), true);
  assert.equal(provider.verifySignature({
    evidence: signedEvidence,
    providerSignature: `${providerSignature[0] === "A" ? "B" : "A"}${providerSignature.slice(1)}`
  }), false);
  assert.equal(provider.resolvePolicy({
    tenantId: signedEvidence.tenantId,
    providerId: "provider_other",
    evidence: signedEvidence
  }), undefined);

  assert.notEqual(
    provider.createPolicy(binding()).policyId,
    provider.createPolicy({
      ...binding(),
      obligationId: "obligation_local_metered_test_second"
    }).policyId
  );
});
