export const V9_DESTINATION_OPERATION_MAP = Object.freeze({
  overview: Object.freeze(["pilotReadWorkspaceResume"]),
  "request-credit": Object.freeze([
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication"
  ]),
  "repay-settle": Object.freeze([
    "pilotReadOwnObligation",
    "pilotPostSandboxRepayment"
  ]),
  "credit-passport": Object.freeze([
    "pilotCreateCreditPassportArtifact",
    "pilotReadOwnCreditPassportArtifact",
    "pilotVerifyCreditPassportArtifact",
    "pilotRevokeCreditPassportArtifact"
  ]),
  obligations: Object.freeze([
    "pilotReadWorkspaceResume",
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence"
  ]),
  "agent-console": Object.freeze([
    "pilotCreateAgentSubject",
    "pilotCreateAgentAccountChallenge",
    "pilotSubmitAgentAccountProof",
    "pilotReadAgentAccountBinding",
    "pilotCreateDraftMandate",
    "pilotReadMandate",
    "pilotActivateSandboxMandate",
    "pilotReadAgentSelf",
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication",
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence",
    "pilotReadCreditRegistryEvidence",
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment"
  ]),
  "capital-network": Object.freeze([
    "pilotReadProviderIntent",
    "pilotAcknowledgeProviderIntent"
  ]),
  "wallet-permissions": Object.freeze([
    "pilotReadConsent",
    "pilotRevokeConsent",
    "pilotReadAgentAccountBinding",
    "pilotReadMandate",
    "pilotRevokeDraftMandate"
  ]),
  "activity-proofs": Object.freeze([
    "pilotReadOwnObligationEvidence",
    "pilotReadEvidence",
    "pilotReadCreditRegistryEvidence"
  ]),
  "credit-track-record": Object.freeze([
    "pilotReadCreditApplication",
    "pilotReadOwnObligationEvidence",
    "pilotCreateOfficialReport",
    "pilotRetrieveOfficialReport"
  ]),
  "reports-exports": Object.freeze([
    "pilotCreateOfficialReport",
    "pilotReadOfficialReport",
    "pilotRetrieveOfficialReport",
    "pilotRevokeOfficialReport"
  ]),
  "risk-operations": Object.freeze([
    "pilotReadCreditRegistryEvidence",
    "pilotReadTenantRisk",
    "pilotReadPilotHealth",
    "pilotReadPilotFeedbackSummary",
    "pilotReadServicingQueue",
    "pilotFreezeSubject",
    "pilotRestructureSandboxObligation",
    "pilotRepurchaseSandboxObligation",
    "pilotWriteOffSandboxObligation"
  ]),
  architecture: Object.freeze([])
});

const DESTINATION_IDS = Object.freeze(Object.keys(V9_DESTINATION_OPERATION_MAP));
const CLOSED_WALLET_POWERS = Object.freeze([
  ["Token allowance", "No approval operation", false],
  ["Unlimited approval", "Prohibited", false],
  ["Arbitrary transaction", "Prohibited", false],
  ["Withdrawal / transfer", "Prohibited", false],
  ["Browser session key", "Unavailable", false],
  ["Mobile / QR", "Specified disabled", false]
]);

function validCatalog(catalog) {
  return Boolean(
    catalog &&
    catalog.schemaVersion === "tenant_protocol_catalog.v1" &&
    catalog.protocol === "IPO.ONE" &&
    catalog.protocolVersion === "tenant_protocol.v1" &&
    Array.isArray(catalog.operations) &&
    catalog.operations.every(({ operationId }) => typeof operationId === "string") &&
    catalog.safety?.realFundsEnabled === false &&
    catalog.safety?.productionCreditEnabled === false
  );
}

export function createV9DestinationCapabilityMatrix(catalog) {
  const operationIds = validCatalog(catalog)
    ? new Set(catalog.operations.map(({ operationId }) => operationId))
    : new Set();
  return Object.freeze(DESTINATION_IDS.map((destinationId) => {
    const requiredOperationIds = V9_DESTINATION_OPERATION_MAP[destinationId];
    const catalogBacked = destinationId === "architecture"
      ? validCatalog(catalog)
      : requiredOperationIds.length > 0 &&
        requiredOperationIds.every((operationId) => operationIds.has(operationId));
    return Object.freeze({
      destinationId,
      requiredOperationIds,
      catalogBacked
    });
  }));
}

export function createArchitectureCapabilityPresentation(catalog) {
  if (!validCatalog(catalog)) {
    return Object.freeze({
      available: false,
      operationCount: 0,
      protocolVersion: "Unavailable",
      maturity: "Unavailable",
      transports: Object.freeze([]),
      destinationCount: DESTINATION_IDS.length,
      safety: Object.freeze({
        realFundsEnabled: false,
        productionCreditEnabled: false,
        rawPiiAllowed: false
      }),
      destinations: createV9DestinationCapabilityMatrix(null)
    });
  }
  return Object.freeze({
    available: true,
    operationCount: catalog.operations.length,
    protocolVersion: catalog.protocolVersion,
    maturity: catalog.maturity,
    transports: Object.freeze([...(catalog.availability?.enabledTransports ?? [])]),
    destinationCount: DESTINATION_IDS.length,
    safety: Object.freeze({
      realFundsEnabled: catalog.safety.realFundsEnabled,
      productionCreditEnabled: catalog.safety.productionCreditEnabled,
      rawPiiAllowed: catalog.safety.rawPiiAllowed
    }),
    destinations: createV9DestinationCapabilityMatrix(catalog)
  });
}

export function createWalletPermissionPresentation({
  accessChecked,
  sessionActive,
  tenantConnected,
  walletAddress,
  connectedChainId,
  selectedProviderName,
  authorityState,
  catalog
}) {
  const catalogOperations = validCatalog(catalog)
    ? new Set(catalog.operations.map(({ operationId }) => operationId))
    : new Set();
  const serverSessionActive = sessionActive === true || tenantConnected === true;
  const authorityQuarantined = authorityState !== "available";
  const walletAuthenticationActive = serverSessionActive &&
    typeof walletAddress === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(walletAddress) &&
    !authorityQuarantined;
  return Object.freeze({
    checked: accessChecked === true,
    serverSessionActive,
    walletAuthenticationActive,
    walletAddress: walletAuthenticationActive ? walletAddress : null,
    connectedChainId: walletAuthenticationActive && Number.isSafeInteger(connectedChainId)
      ? connectedChainId
      : null,
    selectedProviderName: selectedProviderName || "None selected",
    authorityState: authorityState || "unknown",
    consentOperationsAvailable:
      catalogOperations.has("pilotReadConsent") &&
      catalogOperations.has("pilotRevokeConsent"),
    mandateOperationsAvailable:
      catalogOperations.has("pilotReadMandate") &&
      catalogOperations.has("pilotRevokeDraftMandate"),
    powers: Object.freeze([
      Object.freeze([
        "Authentication session",
        serverSessionActive ? "Server active" : "Not active",
        serverSessionActive
      ]),
      Object.freeze([
        "Wallet account proof",
        walletAuthenticationActive ? "Session-bound" : "Not bound",
        walletAuthenticationActive
      ]),
      ...CLOSED_WALLET_POWERS.map((row) => Object.freeze(row))
    ])
  });
}
