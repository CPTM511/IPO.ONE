import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAgentPilotCapabilityManifest
} from "../src/agent-pilot-capability-manifest.js";
import {
  AGENT_CONSOLE_PRESENTATION_VERSION,
  createAgentConsolePresentation
} from "../src/agent-console-presentation.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-pilot-capability-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

const manifests = Object.fromEntries(fixtures.valid.map((fixture) => [
  fixture.status,
  createAgentPilotCapabilityManifest(fixture.handoff)
]));

function stateFor(manifest, overrides = {}) {
  if (manifest.status === "waiting") {
    return {
      manifest,
      catalogOperationIds: manifest.mcp.tools.map(({ operationId }) => operationId),
      subject: null,
      accountBinding: null,
      mandate: null,
      ...overrides
    };
  }
  const handoff = manifest.handoff;
  return {
    manifest,
    catalogOperationIds: manifest.mcp.tools.map(({ operationId }) => operationId),
    subject: {
      subjectId: handoff.subjectId,
      principalId: "principal_agent_console_fixture",
      status: "active",
      schemaVersion: "agent_console_subject_snapshot.v1"
    },
    accountBinding: {
      subjectId: handoff.subjectId,
      status: "active",
      chainId: "eip155:84532",
      purpose: "primary",
      accountHash: `0x${"1".repeat(64)}`,
      proofHash: `0x${"2".repeat(64)}`,
      verificationMethod: "eip712_eoa_v1",
      boundAt: "2026-07-16T00:01:00.000Z",
      schemaVersion: "agent_console_account_binding_snapshot.v1"
    },
    mandate: {
      mandateId: handoff.mandateId,
      subjectId: handoff.subjectId,
      principalId: "principal_agent_console_fixture",
      status: handoff.authority.status,
      capabilities: [...handoff.authority.capabilities],
      assetIds: [...handoff.authority.assetIds],
      perActionLimitMinor: handoff.authority.perActionLimitMinor,
      aggregateLimitMinor: handoff.authority.aggregateLimitMinor,
      utilizedMinor: "0",
      expiresAt: handoff.authority.expiresAt,
      mandateHash: handoff.mandateHash,
      termsHash: handoff.termsHash,
      sandboxOnly: true,
      productionAuthority: false,
      schemaVersion: "agent_console_mandate_snapshot.v1"
    },
    ...overrides
  };
}

test("waiting Agent Console is closed, non-authorizing and catalog-derived", () => {
  const presentation = createAgentConsolePresentation(stateFor(manifests.waiting));
  assert.equal(presentation.schemaVersion, AGENT_CONSOLE_PRESENTATION_VERSION);
  assert.equal(presentation.status, "waiting");
  assert.equal(presentation.registry.toolCount, 15);
  assert.equal(presentation.registry.catalogBoundCount, 15);
  assert.equal(presentation.registry.catalogParity, true);
  assert.equal(
    presentation.registry.tools.every(({ availability }) =>
      availability === "handoff_required"
    ),
    true
  );
  assert.equal(presentation.nonAuthorizing, true);
  assert.equal(presentation.credentialsIncluded, false);
  assert.equal(presentation.fundsAuthority, false);
  assert.equal(presentation.reliability.browserExecutesAgentWorkflow, false);
  assert.equal(Object.isFrozen(presentation.registry.tools), true);
});

test("application handoff enables only the approved application phase", () => {
  const presentation = createAgentConsolePresentation(
    stateFor(manifests.application_ready)
  );
  const byOperation = new Map(
    presentation.registry.tools.map((tool) => [tool.operationId, tool])
  );
  assert.equal(
    byOperation.get("pilotRequestCredit").availability,
    "eligible_for_gateway_check"
  );
  assert.equal(
    byOperation.get("pilotReadOwnObligation").availability,
    "active_mandate_required"
  );
  assert.equal(
    byOperation.get("pilotAcceptCreditOffer").availability,
    "active_mandate_required"
  );
  assert.equal(presentation.principal.bound, true);
  assert.equal(presentation.identity.accountBinding.chainId, "eip155:84532");
  assert.equal(presentation.identity.applicationEligible, true);
  assert.equal(presentation.mandate.status, "draft");
});

test("pending or unbound Agent identity fails closed before application", () => {
  const active = stateFor(manifests.application_ready);
  const pending = createAgentConsolePresentation({
    ...active,
    subject: { ...active.subject, status: "pending" },
    accountBinding: null
  });
  assert.equal(pending.identity.subjectStatus, "pending");
  assert.equal(pending.identity.accountBinding, null);
  assert.equal(pending.identity.applicationEligible, false);

  const inactiveBinding = createAgentConsolePresentation({
    ...active,
    accountBinding: { ...active.accountBinding, status: "revoked" }
  });
  assert.equal(inactiveBinding, null);
});

test("runtime handoff exposes runtime tools but keeps new applications phase-bound", () => {
  const presentation = createAgentConsolePresentation(stateFor(manifests.runtime_ready));
  const byOperation = new Map(
    presentation.registry.tools.map((tool) => [tool.operationId, tool])
  );
  assert.equal(
    byOperation.get("pilotRequestCredit").availability,
    "application_handoff_required"
  );
  for (const operationId of [
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence",
    "pilotReadCreditRegistryEvidence",
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment"
  ]) {
    assert.equal(
      byOperation.get(operationId).availability,
      "eligible_for_gateway_check"
    );
  }
  assert.deepEqual(presentation.unavailableCapabilities, [
    "remote_mcp",
    "a2a",
    "production_workload_credentials",
    "public_agent_endpoint",
    "real_provider_execution",
    "real_funds",
    "active_mandate_edit"
  ]);
});

test("catalog absence remains visible and never becomes implied authority", () => {
  const state = stateFor(manifests.runtime_ready);
  state.catalogOperationIds = state.catalogOperationIds.filter(
    (operationId) => operationId !== "pilotPostSandboxRepayment"
  );
  const presentation = createAgentConsolePresentation(state);
  assert.equal(presentation.registry.catalogParity, false);
  assert.equal(presentation.registry.catalogBoundCount, 14);
  assert.equal(
    presentation.registry.tools.find(
      ({ operationId }) => operationId === "pilotPostSandboxRepayment"
    ).availability,
    "catalog_unavailable"
  );
});

test("Agent Console fails closed on manifest, binding, Mandate or shape drift", () => {
  const valid = stateFor(manifests.runtime_ready);
  const tamperedManifest = structuredClone(valid);
  tamperedManifest.manifest.remoteMcpEnabled = true;
  assert.equal(createAgentConsolePresentation(tamperedManifest), null);

  const wrongBinding = structuredClone(valid);
  wrongBinding.accountBinding.subjectId = "subject_other";
  assert.equal(createAgentConsolePresentation(wrongBinding), null);

  const unsafeMandate = structuredClone(valid);
  unsafeMandate.mandate.productionAuthority = true;
  assert.equal(createAgentConsolePresentation(unsafeMandate), null);

  const openInput = { ...structuredClone(valid), tenantId: "tenant_forbidden" };
  assert.equal(createAgentConsolePresentation(openInput), null);
});
