import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  AGENTIC_WALLET_PROVIDER_OPERATIONS,
  AgenticWalletProviderRegistry,
  assertAgenticWalletProvider,
  invokeAgenticWalletProvider,
  verifyAgenticWalletProviderCapabilities,
  verifyAgenticWalletProviderRequest
} from "./agentic-wallet-provider.js";

function invalid(code, message, details) {
  throw new DomainError(code, message, details);
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_agentic_wallet_provider_conformance", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

export function assertAgenticWalletProviderConformanceFixtures({
  provider,
  requests,
  capabilities,
  now = new Date()
}) {
  const current = trustedNow(now);
  assertAgenticWalletProvider(provider);
  if (!Array.isArray(requests) || requests.length !== AGENTIC_WALLET_PROVIDER_OPERATIONS.length) {
    invalid(
      "invalid_agentic_wallet_provider_conformance",
      "conformance requires exactly one request for every SPI operation"
    );
  }
  const operationIds = requests.map(({ operationId }) => operationId).sort();
  if (
    new Set(operationIds).size !== operationIds.length ||
    JSON.stringify(operationIds) !== JSON.stringify([...AGENTIC_WALLET_PROVIDER_OPERATIONS].sort())
  ) {
    invalid("invalid_agentic_wallet_provider_conformance", "conformance operation coverage drifted");
  }
  for (const request of requests) {
    verifyAgenticWalletProviderRequest(request, { now: current });
    if (
      request.adapterId !== provider.descriptor.adapterId ||
      request.descriptorHash !== provider.descriptor.descriptorHash
    ) {
      invalid("agentic_wallet_provider_descriptor_drift", "fixture descriptor binding drifted");
    }
  }
  verifyAgenticWalletProviderCapabilities(capabilities, {
    descriptor: provider.descriptor,
    now: current
  });
  const nonDiscovery = requests.filter(({ operationId }) => operationId !== "walletDiscoverCapabilities");
  if (nonDiscovery.some((request) =>
    request.capabilitiesHash !== capabilities.capabilitiesHash ||
    request.contextEpoch !== capabilities.contextEpoch
  )) {
    invalid("agentic_wallet_provider_capability_drift", "fixture capability binding drifted");
  }
  return true;
}

export async function runAgenticWalletProviderConformance({
  provider,
  requests,
  capabilities,
  now = new Date()
}) {
  const current = trustedNow(now);
  assertAgenticWalletProviderConformanceFixtures({ provider, requests, capabilities, now: current });
  const registry = new AgenticWalletProviderRegistry([provider]);
  const results = [];
  for (const request of [...requests].sort((left, right) => left.operationId.localeCompare(right.operationId))) {
    const before = JSON.stringify(request);
    const result = await invokeAgenticWalletProvider({
      registry,
      request,
      capabilities: request.operationId === "walletDiscoverCapabilities" ? null : capabilities,
      now: current
    });
    if (JSON.stringify(request) !== before) {
      invalid("agentic_wallet_provider_input_mutated", "provider mutated an immutable canonical request");
    }
    results.push(result);
  }
  const evidence = {
    adapterId: provider.descriptor.adapterId,
    descriptorHash: provider.descriptor.descriptorHash,
    capabilitiesHash: capabilities.capabilitiesHash,
    operationIds: results.map(({ operationId }) => operationId),
    requestHashes: results.map(({ requestHash }) => requestHash),
    resultHashes: results.map(({ resultHash }) => resultHash),
    externalCallCount: results.filter(({ externalCallPerformed }) => externalCallPerformed).length,
    rawProviderResponsesRetained: false,
    canonicalMutationAllowed: false,
    fundsAuthority: false,
    schemaVersion: "agentic_wallet_provider_conformance_evidence.v1"
  };
  return cloneFreeze({
    conformanceHash: hashId("agentic_wallet_provider_conformance", evidence),
    ...evidence
  });
}
