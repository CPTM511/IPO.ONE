import assert from "node:assert/strict";
import test from "node:test";
import {
  PluginAuthMethod,
  PluginFailurePolicy,
  PluginType
} from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { PluginRegistryService } from "../src/index.js";

function validManifest(overrides = {}) {
  return {
    pluginKey: "demo-kyp",
    displayName: "Demo KYP Attester",
    publisherId: "publisher_demo",
    pluginType: PluginType.COMPLIANCE,
    capabilities: ["kyp.attestation.issue"],
    supportedSchemaVersions: ["kyp_provider_attestation.v1", "evidence_event.v2"],
    jurisdictions: ["global"],
    dataClasses: ["identity.reference"],
    requiredInputs: ["subject.reference"],
    producedAttestationTypes: ["kyp_provider_attestation.v1"],
    endpoint: "https://sandbox.example.test/kyp",
    authMethod: PluginAuthMethod.OAUTH2,
    failurePolicy: PluginFailurePolicy.FAIL_CLOSED,
    sandboxOnly: true,
    serviceVersion: "1.0.0",
    termsRef: "urn:ipo.one:demo:plugin-terms:v1",
    ...overrides
  };
}

test("plugin registry separates registration, activation, and scoped capability checks", () => {
  const service = new PluginRegistryService({ eventStore: new EventStore() });
  const pending = service.registerPlugin(validManifest());
  assert.throws(
    () => service.assertCapability({ pluginId: pending.pluginId, capability: "kyp.attestation.issue" }),
    /plugin_not_active/
  );
  const active = service.activatePlugin({
    pluginId: pending.pluginId,
    reviewerId: "security_reviewer",
    reason: "demo contract review passed"
  });
  const authorized = service.assertCapability({
    pluginId: active.pluginId,
    pluginType: PluginType.COMPLIANCE,
    capability: "kyp.attestation.issue",
    schemaVersion: "evidence_event.v2",
    jurisdiction: "US"
  });

  assert.equal(authorized.status, "active");
  assert.equal(service.getManifestConformance(active.pluginId).remoteConformanceTested, false);
  assert.throws(
    () => service.assertCapability({ pluginId: active.pluginId, capability: "kyc.raw_pii.read" }),
    /plugin_capability_denied/
  );
});

test("plugin manifest rejects secrets, executable fields, insecure endpoints, and fail-open policy", () => {
  const service = new PluginRegistryService({ eventStore: new EventStore() });

  assert.throws(() => service.registerPlugin(validManifest({ apiKey: "plaintext" })), /raw_pii_prohibited/);
  assert.throws(() => service.registerPlugin(validManifest({ entrypoint: "./plugin.js" })), /executable_plugin_field_prohibited/);
  assert.throws(
    () => service.registerPlugin(validManifest({ endpoint: "http://vendor.example/kyp", sandboxOnly: false })),
    /insecure_plugin_endpoint/
  );
  assert.throws(() => service.registerPlugin(validManifest({ failurePolicy: "fail_open" })), /invalid_enum_value/);
  assert.equal(service.listPlugins().length, 0);
});

test("plugin version registration is idempotent and conflicting reuse fails", () => {
  const service = new PluginRegistryService({ eventStore: new EventStore() });
  const first = service.registerPlugin(validManifest());
  const replay = service.registerPlugin(validManifest());

  assert.equal(replay.pluginId, first.pluginId);
  assert.throws(
    () => service.registerPlugin(validManifest({ endpoint: "https://other.example.test/kyp" })),
    /plugin_version_conflict/
  );
});
