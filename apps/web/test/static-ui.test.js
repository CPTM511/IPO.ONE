import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("closed-pilot product includes authenticated Human and Agent workflows", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const handoff = await readFile(new URL("../src/agent-handoff-manifest.js", import.meta.url), "utf8");
  const capabilities = await readFile(
    new URL("../src/agent-pilot-capability-manifest.js", import.meta.url),
    "utf8"
  );
  const agentConsolePresentation = await readFile(
    new URL("../src/agent-console-presentation.js", import.meta.url),
    "utf8"
  );
  const capitalNetworkPresentation = await readFile(
    new URL("../src/capital-network-presentation.js", import.meta.url),
    "utf8"
  );
  const riskOperationsPresentation = await readFile(
    new URL("../src/risk-operations-presentation.js", import.meta.url),
    "utf8"
  );
  const walletRegistry = await readFile(
    new URL("../src/wallet-provider-registry.js", import.meta.url),
    "utf8"
  );
  const walletLifecycle = await readFile(
    new URL("../src/wallet-authority-lifecycle.js", import.meta.url),
    "utf8"
  );
  const reviewBinding = await readFile(
    new URL("../src/request-credit-review-binding.js", import.meta.url),
    "utf8"
  );
  const servicingPositionIndex = await readFile(
    new URL("../src/servicing-position-index.js", import.meta.url),
    "utf8"
  );
  const obligationPortfolio = await readFile(
    new URL("../src/obligation-portfolio-presentation.js", import.meta.url),
    "utf8"
  );
  const v9TrustSurfaces = await readFile(
    new URL("../src/v9-trust-surfaces.js", import.meta.url),
    "utf8"
  );
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const icons = await readFile(new URL("../src/icons.svg", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../src/manifest.webmanifest", import.meta.url), "utf8"));

  for (const label of [
    "Verifying secure session",
    "Application & Obligation",
    "Identity & bounded authority",
    "Every position, reconciled to server truth.",
    "Same economics. <em>Bounded machine authority.</em>",
    "One server receipt per completed step",
    "No lender or facility is live",
    "Repay with the schedule in view.",
    "Verify the lifecycle, not a screenshot.",
    "Portfolio risk, with <em>protective action.</em>",
    "Operational assurance, without invented runtime state",
    "Borrower, Risk, Operations, and Auditor remain separate"
  ]) {
    assert.ok(html.includes(label), `${label} screen missing`);
  }

  for (const route of [
    "/v1/agents",
    "/v1/spend-requests",
    "/v1/settlements",
    "/v1/revenue-capture",
    "/v1/repayments/auto",
    "/v1/credit-learning/evaluate",
    "/v1/demo/cycles/healthy",
    "/v1/demo/cycles/risky",
    "/v1/demo/cycles/recovery",
    "/v1/demo/state",
    "/v1/demo/reset"
  ]) {
    assert.equal(js.includes(route), false, `${route} must not ship in the closed-pilot browser`);
  }
  assert.equal(html.includes("data-legacy-demo-surface"), false);
  assert.equal(html.includes("Run Agent lifecycle"), false);
  assert.equal(html.includes("Reset Sandbox"), false);
  assert.ok(
    js.includes("private-agent-subject-") && js.includes("pilotReadAgentAccountBinding"),
    "Agent Subject creation must be replay-safe and reload its durable binding"
  );

  for (const label of [
    "No real lending",
    "No real funds",
    "Human Workspace",
    "Agent Workspace",
    "Your portfolio overview",
    "Choose what you want to do",
    "Recent credit activity",
    "Workspace details",
    "More tools",
    "Closed Pilot · Synthetic Capital",
    "Request Credit",
    "Repay &amp; Settle",
    "Credit Passport",
    "Obligations",
    "Agent Console",
    "Provider Network",
    "Wallet &amp; Permissions",
    "Activity &amp; Proofs",
    "Credit Track Record",
    "Reports &amp; Exports",
    "Risk &amp; Operations",
    "Architecture",
    "Agent API",
    "Your integration path",
    "The Principal approves. The Agent executes only that scope.",
    "View handoff packet, 12 Agent operations, OpenAPI, and request log",
    "Authorize once. <em>Keep every limit visible.</em>",
    "From approval to action. <em>No hidden authority.</em>",
    "Your guided path",
    "A safe way to learn the full credit lifecycle",
    "What happens in each step?",
    "View protocol controls and safety boundaries",
    "Need an Agent to act for you?",
    "Authenticated application",
    "Request and price no-funds credit",
    "Principal-controlled Agent setup",
    "Create, review, and activate Agent authority",
    "Agent API handoff",
    "Reference Agent runner",
    "Load an eligible draft Mandate to create the application packet",
    "Principal → Agent capability packet",
    "One manifest. Twelve local tools. No ambient authority.",
    "Approved local stdio MCP tools",
    "Three staged workflows",
    "Decision &amp; Offer",
    "Obligation &amp; repayment",
    "Servicing Case",
    "Refresh current positions",
    "pilotReadOwnObligation + repayment + Evidence",
    "Dual-chain conformance",
    "Checking manifest",
    "local stdio MCP · closed_non_funds_pilot",
    "Host context injected out of band",
    "Execution, repayment & servicing",
    "Signed sandbox rail + shared ledger",
    "Obligation created",
    "Checked-in catalog + runtime response",
    "Share the current Decision",
    "Verify a received proof online",
    "No bearer sharing",
    "Current Evidence summary",
    "My positions",
    "Authenticated server truth",
    "Start a new Human loan",
    "Portfolio risk, with <em>protective action.</em>",
    "Tenant portfolio posture",
    "Design-partner lifecycle health",
    "privacy-safe product truth",
    "no third-party analytics",
    "PILOT-006 · design-partner feedback",
    "Tell us where the product worked—or blocked you.",
    "Design-partner experience",
    "Aggregate only · identifiers and PII excluded",
    "Adverse Obligation review",
    "SERVICING-002B · private work queue",
    "Read-only · PII excluded · no disposition authority",
    "Freeze Agent Subject",
    "Protective-only command",
    "Closed permissions by design",
    "catalog presence does not grant access",
    "Access IPO.ONE",
    "Sign in. Connect.",
    "Stay in control.",
    "Authenticated session",
    "Continue to workspace",
    "Sign out",
    "Continue with Google",
    "Continue with email",
    "Connect &amp; sign in with wallet",
    "Available browser wallets",
    "Wallet names and icons are untrusted display metadata.",
    "Authentication is not credit authority.",
    "Connect an approved network",
    "Base Sepolia",
    "X Layer Testnet",
    "Obligation Evidence",
    "Your durable Obligation timeline",
    "EVIDENCE-001B · owner only",
    "Durable audit timeline",
    "Auditor access",
    "Authenticated request telemetry",
    "Provider workspace · no funds",
    "Load your assigned TransferIntent",
    "Assigned no-funds exposure",
    "Historical example only · unapproved",
    "Capital actions remain disabled",
    "No TVL, public LP, remote Provider, mainnet, real capital, custody, or withdrawable balance is enabled."
  ]) {
    assert.ok(html.includes(label), `${label} boundary or surface missing`);
  }

  for (const view of [
    "overview",
    "request-credit",
    "repay-settle",
    "credit-passport",
    "obligations",
    "agent-console",
    "capital-network",
    "wallet-permissions",
    "activity-proofs",
    "credit-track-record",
    "reports-exports",
    "risk-operations",
    "architecture"
  ]) {
    assert.ok(html.includes(`data-view-panel="${view}"`), `${view} view missing`);
    assert.ok(html.includes(`data-v9-maturity="${view}"`), `${view} maturity badge missing`);
  }

  for (const control of [
    "authenticatedRuntimeGate",
    "authenticatedRuntimeGateStatus",
    "authenticatedRuntimeGateCopy",
    "authenticatedRuntimeGateAction",
    "sidebarMoreBtn",
    "accessBtn",
    "walletPermissionsAccessBtn",
    "accessLayer",
    "accessCloseBtn",
    "googleSignInBtn",
    "emailSignInBtn",
    "walletSignInBtn",
    "walletProviderTitle",
    "walletProviderStatus",
    "walletProviderList",
    "networkChoiceList",
    "connectNetworkBtn",
    "humanGuide",
    "humanGuidePrimaryBtn",
    "humanGuideSecondaryBtn",
    "humanHeroPrimaryBtn",
    "humanJourney",
    "humanGuideDetails",
    "agentWorkspaceApiBtn",
    "agentRuntimePrimaryBtn",
    "agentRuntimeSecondaryBtn",
    "agentIntegrationGuide",
    "agentIntegrationGuideTitle",
    "agentIntegrationGuideStatus",
    "agentIntegrationPrimaryBtn",
    "agentIntegrationSecondaryBtn",
    "agentIntegrationJourney",
    "agentIntegrationDetails",
    "agentProtocolDetails",
    "agentProtocolDisclosureStatus",
    "mcpHandoffPanel",
    "createHumanSubjectBtn",
    "createHumanConsentBtn",
    "submitHumanCreditBtn",
    "humanOfferAcknowledge",
    "acceptHumanOfferBtn",
    "economicActionLayer",
    "economicActionTitle",
    "economicActionCopy",
    "economicActionType",
    "economicActionMethod",
    "economicActionResource",
    "economicActionEffect",
    "economicActionStatus",
    "economicActionCancelBtn",
    "economicActionConfirmBtn",
    "humanOfferFee",
    "humanOfferRepayment",
    "humanOfferValidUntil",
    "humanOfferDisclosure",
    "humanOfferAuthority",
    "humanOfferHash",
    "humanOfferTermsHash",
    "humanOfferReviewState",
    "humanReceiptPreflight",
    "humanReceiptIntent",
    "humanReceiptApplication",
    "humanReceiptDecision",
    "humanReceiptAcceptance",
    "humanReceiptExecution",
    "humanDecisionPassport",
    "humanDecisionPassportProof",
    "humanDecisionReasonList",
    "humanDecisionSourceRows",
    "copyDecisionPassportBtn",
    "creditPassportIssueForm",
    "creditPassportSubjectId",
    "creditPassportIntentId",
    "creditPassportVerifierActorId",
    "creditPassportLifetime",
    "issueCreditPassportBtn",
    "creditPassportReadForm",
    "creditPassportArtifactId",
    "readCreditPassportBtn",
    "creditPassportDisclosureRows",
    "revokeCreditPassportBtn",
    "creditPassportVerifyForm",
    "creditPassportVerifyArtifactId",
    "creditPassportVerifyHash",
    "creditPassportVerifyVersion",
    "verifyCreditPassportBtn",
    "creditTrackRecordFinality",
    "pilotFeedbackForm",
    "submitPilotFeedbackBtn",
    "pilotFeedbackSummaryTotal",
    "executeHumanObligationBtn",
    "humanRepaymentAmount",
    "humanRepaymentSource",
    "postHumanRepaymentBtn",
    "ownedEvidencePanel",
    "ownedEvidenceRows",
    "loadOwnedEvidenceBtn",
    "loadMoreOwnedEvidenceBtn",
    "auditorEvidenceObligationId",
    "auditorEvidencePageSize",
    "loadAuditorEvidenceBtn",
    "loadMoreAuditorEvidenceBtn",
    "humanObligationStatus",
    "humanObligationServicing",
    "humanObligationDpd",
    "humanObligationScheduleVersion",
    "copyHumanReceiptBtn",
    "createPrivateAgentSubjectBtn",
    "createAccountChallengeBtn",
    "downloadAccountChallengeBtn",
    "copyAccountChallengeBtn",
    "refreshAccountBindingBtn",
    "createDraftMandateBtn",
    "loadMandateBtn",
    "principalMandateAcknowledge",
    "activateMandateBtn",
    "openAgentApiBtn",
    "downloadMcpHandoffBtn",
    "copyMcpHandoffBtn",
    "returnToAgentAuthorityBtn",
    "createAgentBtn",
    "createAgentBtnLabel",
    "agentRequestCreditStatus",
    "agentRequestCreditAuthority",
    "agentRequestCreditIntent",
    "agentRequestCreditDecision",
    "agentRequestCreditAcceptance",
    "agentRequestCreditExecution",
    "agentRequestCreditOfferReceipt",
    "agentRequestCreditObligationReceipt",
    "agentRequestCreditCopy",
    "privatePortfolioSurface",
    "privatePortfolioPrimaryBtn",
    "privatePortfolioSecondaryBtn",
    "privatePortfolioAvailableCredit",
    "v9OverviewState",
    "v9OverviewStateTitle",
    "v9OverviewStateCopy",
    "creditPassportStateTitle",
    "creditPassportStateCopy",
    "walletPermissionsStateTitle",
    "walletPermissionsStateCopy",
    "creditTrackRecordStateTitle",
    "creditTrackRecordStateCopy",
    "privateCreditSurface",
    "privateCreditPrimaryBtn",
    "privatePaymentsSurface",
    "privatePaymentsPrimaryBtn",
    "servicingCasePanel",
    "servicingCaseStages",
    "servicingRepaymentAmount",
    "servicingRepaymentSource",
    "postServicingRepaymentBtn",
    "openServicingEvidenceBtn",
    "privateEvidenceSurface",
    "privateEvidencePrimaryBtn",
    "privateRiskSurface",
    "riskPortfolioForm",
    "riskPortfolioId",
    "loadRiskPortfolioBtn",
    "riskAssetRows",
    "pilotHealthStatus",
    "pilotHealthIntentCount",
    "pilotHealthDualNative",
    "pilotHealthPositions",
    "servicingQueueForm",
    "servicingQueueId",
    "servicingQueueClassification",
    "loadServicingQueueBtn",
    "servicingQueueRows",
    "loadMoreServicingQueueBtn",
    "riskFreezeForm",
    "riskFreezeSubjectId",
    "riskFreezeReason",
    "riskFreezeAcknowledge",
    "freezeRiskSubjectBtn",
    "riskFreezeStatus",
    "operationsAssuranceStatus",
    "operationsAlertEvidenceStatus",
    "operationsReconciliationEvidenceStatus",
    "operationsIncidentEvidenceStatus",
    "operationsApprovalEvidenceStatus",
    "operationsEvidenceBoundaryCopy",
    "riskAuthorityRows",
    "capitalNetworkQueryForm",
    "capitalNetworkTransferIntentId",
    "capitalNetworkLoadBtn",
    "capitalNetworkContractStatus",
    "capitalNetworkStateTitle",
    "capitalNetworkProviderId",
    "capitalNetworkExposure",
    "capitalNetworkAllocationReceipt",
    "capitalNetworkReconciliationReceipt",
    "capitalNetworkDeliveryReceipt",
    "capitalNetworkAcknowledgeBtn",
    "capitalNetworkEarnings"
  ]) {
    assert.ok(html.includes(`id="${control}"`), `${control} control missing`);
  }

  for (const operation of [
    "pilotCreateHumanSubject",
    "pilotCreateConsent",
    "pilotReadHumanSelf",
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication",
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment",
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence",
    "pilotReadEvidence",
    "pilotReadTenantRisk",
    "pilotReadPilotHealth",
    "pilotReadPilotFeedbackSummary",
    "pilotSubmitPilotFeedback",
    "pilotReadServicingQueue",
    "pilotFreezeSubject",
    "pilotCreateAgentSubject",
    "pilotCreateAgentAccountChallenge",
    "pilotReadAgentAccountBinding",
    "pilotCreateDraftMandate",
    "pilotReadMandate",
    "pilotActivateSandboxMandate",
    "pilotReadProviderIntent",
    "pilotAcknowledgeProviderIntent"
  ]) {
    assert.ok(js.includes(operation), `${operation} private Human operation missing`);
  }

  assert.match(
    js,
    /await loadPilotHealth\(\{ quiet: true \}\);\s*await loadPilotFeedbackSummary\(\{ quiet: true \}\);/,
    "same-portfolio authenticated aggregate reads must remain sequential"
  );

  assert.ok(html.includes("class=\"skip-link\""));
  assert.ok(html.includes("aria-controls=\"sidebar\""));
  assert.ok(html.includes("aria-expanded=\"false\""));
  assert.ok(html.includes("id=\"mainShell\""));
  assert.ok(html.includes("aria-live=\"polite\""));
  assert.ok(html.includes("rel=\"manifest\""));
  assert.ok(html.includes("rel=\"icon\""));
  assert.ok(html.includes("/icons.svg#"));
  assert.ok(icons.includes("id=\"layout-dashboard\""));
  assert.ok(icons.includes("id=\"shield-check\""));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(css.includes(":focus-visible"));
  assert.match(css, /\[hidden\]\s*\{[\s\S]*?display:\s*none !important;/);
  assert.match(css, /#mainContent:focus\s*\{[\s\S]*?outline:\s*none;/);
  assert.match(
    css,
    /\.credit-application-workbench,[\s\S]*?\.agent-authority-workbench\s*\{[\s\S]*?scroll-margin-top:\s*92px;/,
    "sticky navigation must not obscure Human or Agent workbench headings"
  );
  assert.match(
    css,
    /\.credit-application-workbench:focus,[\s\S]*?\.agent-authority-workbench:focus\s*\{[\s\S]*?outline:\s*3px solid/,
    "programmatic workbench focus must use an intentional visible indicator"
  );
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.ok(css.includes("@media (max-width: 640px)"));
  assert.match(
    css,
    /@media \(max-width: 640px\) \{[\s\S]*?\.mode-switch button \{[\s\S]*?min-height: 44px;/,
    "mobile mode controls must expose a touch-friendly target height"
  );
  assert.equal(/<script[^>]+https?:\/\//.test(html), false, "runtime scripts must remain same-origin");
  assert.ok(js.includes("toggleAttribute(\"inert\""));
  assert.ok(js.includes("openPrincipalAgentAuthority"));
  for (const method of [
    "eth_requestAccounts",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "personal_sign"
  ]) {
    assert.ok(js.includes(method), `${method} wallet integration missing`);
  }
  for (const value of [
    "eip155:84532",
    "eip155:1952",
    "/auth/v1/options",
    "/auth/v1/wallet/challenge",
    "/auth/v1/wallet/verify",
    "/auth/v1/wallet/invalidate",
    "/auth/v1/logout"
  ]) {
    assert.ok(js.includes(value), `${value} access boundary missing`);
  }
  assert.ok(js.includes("Principal setup required"));
  assert.ok(js.includes("continueAuthenticatedSession"));
  assert.ok(js.includes("signOutAuthenticatedSession"));
  assert.ok(js.includes('el("accessBtn").setAttribute("aria-label", accessButtonLabel)'));
  assert.ok(js.includes("ipo_one_logout_result.v1"));
  assert.ok(js.includes("!tenantCsrfToken()"));
  assert.ok(html.includes('id="accessSessionPanel"'));
  assert.ok(html.includes('id="continueAuthenticatedSessionBtn"'));
  assert.ok(html.includes('id="signOutBtn"'));
  assert.ok(css.includes(".access-session-panel"));
  assert.ok(html.includes("Configure Agent authority"));
  assert.ok(html.includes("Your portfolio overview"));
  assert.ok(html.includes("Recent credit activity"));
  assert.ok(html.includes("Signed Provider boundary verified"));
  assert.ok(html.includes("Provider sandbox capability status"));
  assert.ok(html.includes("Capability status only — this Obligation has no Provider execution"));
  assert.ok(html.includes("public or remote Provider access remains disabled"));
  assert.equal((html.match(/data-private-session-surface/g) ?? []).length, 6);
  assert.equal((html.match(/data-legacy-demo-surface/g) ?? []).length, 0);
  assert.ok(js.includes("renderPrivateProductSurfaces"));
  assert.ok(js.includes('setMode("human");\n    showView("overview");'));
  assert.ok(js.includes("renderHumanGuide"));
  assert.ok(js.includes("humanGuidePresentation"));
  assert.ok(js.includes("agentIntegrationPresentation"));
  assert.ok(js.includes("renderAgentIntegrationGuide"));
  assert.ok(js.includes("runAgentGuideAction"));
  assert.ok(js.includes("openAgentProtocolDetails"));
  assert.ok(js.includes('el("agentAuthorityDisclosure").open = true'));
  assert.ok(js.includes("humanNewApplicationMode"));
  assert.ok(js.includes('action === "activate-obligation"'));
  assert.ok(js.includes('action === "return-current"'));
  assert.ok(js.includes("privateHumanLifecycleStatus"));
  assert.ok(js.includes("privateAgentLifecycleStatus"));
  assert.ok(js.includes('if (["agent-console", "architecture"].includes(nextView)) setMode("agent")'));
  assert.equal(
    js.includes('if (nextView === "request-credit") setMode("human")'),
    false,
    "Request Credit must preserve the selected Human or Agent entry mode"
  );
  assert.ok(js.includes(
    'nextView === "request-credit"\n    ? `${interactionMode === "agent" ? "Agent" : "Human"} entry · shared kernel`'
  ));
  assert.equal(
    js.includes('["overview", "agent", "credit", "transfers", "developer"].includes(nextView)'),
    false,
    "shared navigation must not force the Agent mode"
  );
  assert.ok(js.includes('action === "human-evidence"'));
  assert.ok(js.includes('action === "human-obligation"'));
  assert.ok(js.includes('action === "agent-api"'));
  assert.ok(css.includes(".private-product-hero"));
  assert.ok(css.includes(".v9-runtime-state"));
  assert.ok(css.includes(".v9-maturity-grid"));
  assert.ok(css.includes(".v9-maturity-badge"));
  assert.ok(js.includes("v9DestinationMaturity"));
  assert.ok(js.includes("renderV9ShellStates"));
  assert.ok(js.includes("serverCatalogOperations"));
  assert.ok(css.includes(".human-guide"));
  assert.ok(css.includes(".human-journey"));
  assert.ok(css.includes(".agent-integration-guide"));
  assert.ok(css.includes(".agent-integration-journey"));
  assert.ok(css.includes(".agent-protocol-disclosure"));
  assert.ok(css.includes(".agent-authority-disclosure"));
  assert.ok(css.includes(".private-page-heading"));
  assert.ok(css.includes(".private-checkpoint"));
  assert.ok(css.includes(".risk-metric-grid"));
  assert.ok(css.includes(".risk-asset-table"));
  assert.ok(css.includes(".operations-assurance-grid"));
  assert.ok(css.includes(".risk-authority-table"));
  assert.ok(css.includes(".pilot-health-metrics"));
  assert.ok(css.includes(".servicing-queue-table"));
  assert.ok(css.includes(".servicing-queue-row"));
  assert.ok(css.includes(".danger-action"));
  assert.ok(js.includes("PROTECTIVE_REASON_CODES"));
  assert.ok(js.includes("protocolRequest.reasonCode"));
  assert.equal(html.includes("29 Tenant operations"), false);
  assert.match(
    css,
    /\.owned-evidence-panel \.auditor-evidence-cell small,[\s\S]*?color:\s*#bdb6c6;/,
    "owned Evidence secondary text must remain readable on the graphite surface"
  );
  assert.ok(js.includes("announce(`${VIEW_META[nextView].title} view selected`)"));
  assert.ok(js.includes('reducedMotion.matches ? "auto" : "smooth"'));
  assert.ok(js.includes("mainShell\").toggleAttribute(\"inert\""));
  assert.ok(js.includes("event.key === \"Escape\""));
  assert.equal(js.includes("x-ipo-one-sandbox-session"), false);
  assert.ok(js.includes("credentials: \"same-origin\""));
  assert.ok(html.includes('meta name="ipo-one-csrf-token" content=""'));
  assert.ok(js.includes('meta[name="ipo-one-csrf-token"]'));
  assert.ok(html.includes('meta name="ipo-one-local-agent-account" content=""'));
  assert.ok(js.includes('meta[name="ipo-one-local-agent-account"]'));
  assert.equal(
    html.includes('value="0x1111111111111111111111111111111111111111"'),
    false
  );
  assert.ok(js.includes("startAgentAccountBindingPolling()"));
  assert.ok(js.includes("AGENT_ACCOUNT_BINDING_POLL_MAX_MS"));
  assert.ok(js.includes("stopAgentAccountBindingPolling"));
  assert.ok(js.includes('if (action === "human-evidence") loadOwnedEvidence();'));
  assert.ok(js.includes('button.dataset.goView === "activity-proofs"'));
  assert.ok(js.includes("await loadOwnedEvidence();"));
  assert.ok(html.includes('id="creditRegistryEvidencePanel"'));
  assert.ok(html.includes('id="creditRegistryAuthorizationHash"'));
  assert.ok(html.includes("Public Registry Evidence"));
  assert.ok(html.includes("Read only · non-authorizing · no funds"));
  assert.ok(js.includes('tenantApi("pilotReadCreditRegistryEvidence"'));
  assert.ok(js.includes("[creditRegistryEvidence, structuredClone(creditRegistryEvidence)]"));
  assert.ok(js.includes("response?.syntheticOnly !== true"));
  assert.ok(js.includes("response?.fundsAuthority !== false"));
  assert.ok(js.includes('"Lifecycle complete"'));
  assert.ok(js.includes('"x-csrf-token": csrfToken'));
  assert.ok(js.includes("tenant_protocol_request.v1"));
  assert.ok(js.includes("/tenant/v1/operations"));
  assert.ok(js.includes("/tenant/v1/catalog"));
  assert.ok(js.includes("principal_authorizes_sandbox_credit_v1"));
  for (const capability of [
    "request_credit",
    "accept_credit_offer",
    "execute_sandbox_credit",
    "route_repayment"
  ]) {
    assert.ok(js.includes(`"${capability}"`), `${capability} Mandate capability missing`);
  }
  for (const tool of [
    "ipo_one_read_self",
    "ipo_one_request_credit",
    "ipo_one_read_credit_application",
    "ipo_one_evaluate_credit_application",
    "ipo_one_submit_account_proof",
    "ipo_one_read_account_binding",
    "ipo_one_read_obligation",
    "ipo_one_read_obligation_evidence",
    "ipo_one_accept_credit_offer",
    "ipo_one_execute_sandbox_obligation",
    "ipo_one_post_sandbox_repayment",
    "ipo_one_read_credit_registry_evidence"
  ]) {
    assert.ok(handoff.includes(tool), `${tool} Agent MCP handoff tool missing`);
  }
  assert.ok(js.includes('from "./agent-handoff-manifest.js"'));
  assert.ok(js.includes('from "./agent-pilot-capability-manifest.js"'));
  assert.ok(js.includes('from "./agent-console-presentation.js"'));
  assert.ok(js.includes('from "./capital-network-presentation.js"'));
  assert.ok(js.includes('from "./risk-operations-presentation.js"'));
  assert.ok(js.includes('from "./human-credit-offer-workflow-receipt.js"'));
  assert.ok(js.includes('from "./human-sandbox-obligation-workflow-receipt.js"'));
  assert.ok(js.includes('from "./request-credit-review-binding.js"'));
  assert.ok(js.includes('from "./decision-passport-presentation.js"'));
  assert.ok(js.includes('from "./servicing-case-presentation.js"'));
  assert.ok(js.includes('from "./wallet-authority-lifecycle.js"'));
  assert.ok(js.includes('from "./wallet-provider-registry.js"'));
  assert.equal(js.includes("function eip1193Provider"), false);
  assert.ok(walletRegistry.includes('WALLET_PROVIDER_REGISTRY_SCHEMA_VERSION = "wallet_provider_registry.v1"'));
  assert.ok(walletRegistry.includes('"eip6963:requestProvider"'));
  assert.ok(walletRegistry.includes('"eip6963:announceProvider"'));
  assert.ok(walletRegistry.includes('"legacy:globalThis.ethereum"'));
  assert.ok(walletRegistry.includes("MAXIMUM_PROVIDERS = 16"));
  assert.ok(walletRegistry.includes("recordsById.has(record.descriptor.providerId)"));
  assert.ok(walletRegistry.includes("providerIdsByReference.has(record.provider)"));
  assert.ok(walletRegistry.includes("eventTarget.removeEventListener"));
  assert.equal(walletRegistry.includes("localStorage"), false);
  assert.equal(walletRegistry.includes("sessionStorage"), false);
  assert.equal(walletRegistry.includes(".innerHTML"), false);
  assert.equal(walletRegistry.includes("wallet_requestPermissions"), false);
  assert.equal(walletRegistry.includes("eth_sendTransaction"), false);
  assert.equal(walletRegistry.includes("eth_signTransaction"), false);
  assert.ok(html.includes("Evidence digest (offchain)"));
  assert.ok(html.includes("no Base Sepolia transaction exists for this lifecycle"));
  assert.ok(html.includes("Server Evidence state"));
  assert.ok(html.includes("Server record"));
  assert.ok(html.includes("Evidence digest"));
  assert.ok(html.includes("Chain transaction"));
  assert.ok(html.includes("Chain finality"));
  assert.ok(html.includes("Indexer state"));
  assert.ok(html.includes("Reconciliation"));
  assert.ok(js.includes('from "./evidence-receipt-presentation.js"'));
  assert.ok(html.includes('id="creditPassportSubjectId" type="hidden"'));
  assert.ok(html.includes('id="creditPassportIntentId" type="hidden"'));
  assert.ok(html.includes("Authorized reviewer ID"));
  assert.ok(html.includes("One bound same-Tenant reviewer"));
  assert.ok(html.includes("Technical receipt and integrity digests"));
  assert.ok(html.includes("They are not blockchain transaction hashes"));
  assert.ok(css.includes('.credit-passport-claims input[type="checkbox"]'));
  assert.ok(css.includes("width: 18px"));
  assert.ok(css.includes("min-height: 18px"));
  assert.ok(html.includes("Explicit action confirmation"));
  assert.ok(html.includes("This confirmation does not create a blockchain transaction."));
  assert.ok(js.includes("requestEconomicActionConfirmation"));
  assert.ok(js.includes('"wallet_personal_sign"'));
  assert.ok(js.includes("rawSignaturePersisted: false"));
  assert.ok(js.includes("blockchainTransactionSubmitted: false"));
  assert.ok(walletLifecycle.includes('"wallet_authority_lifecycle.v1"'));
  assert.ok(walletLifecycle.includes('"wallet_session_invalidation_result.v1"'));
  assert.ok(walletLifecycle.includes("BroadcastChannel") === false);
  assert.ok(walletLifecycle.includes("retryInvalidation"));
  assert.ok(walletLifecycle.includes("assertProtectedAvailable"));
  assert.ok(js.includes('provider.on("disconnect", disconnected)'));
  assert.ok(js.includes("walletAuthorityLifecycle.assertContextEpoch"));
  assert.ok(js.includes("walletAuthorityLifecycle.assertProtectedAvailable"));
  assert.ok(js.includes('"wallet_session_invalidation_request.v1"'));
  assert.equal(walletLifecycle.includes("localStorage"), false);
  assert.equal(walletLifecycle.includes("sessionStorage"), false);
  assert.equal(walletLifecycle.includes("walletAddress"), false);
  assert.equal(walletLifecycle.includes("signature"), false);
  assert.ok(html.includes("Evidence-derived decision"));
  assert.ok(html.includes("Inspect machine-verifiable proof"));
  assert.ok(html.includes("Finalized synthetic Evidence · non-authorizing · no credentials · no production funds"));
  assert.ok(html.includes("risk_decision_passport.v1 · policy + finalized Evidence lineage"));
  assert.ok(js.includes("createHumanDecisionPassportPresentation"));
  assert.ok(js.includes("hasVerifiedHumanDecisionPassport"));
  assert.ok(js.includes("!passportVerified || !reviewState.current"));
  assert.ok(js.includes("!acknowledgement.checked"));
  assert.ok(js.includes("JSON.stringify(decision.decisionPassport, null, 2)"));
  assert.ok(css.includes(".decision-passport-card"));
  assert.ok(css.includes(".decision-source-table"));
  assert.ok(js.includes("createHumanSandboxObligationWorkflowReceipt"));
  assert.ok(js.includes("createServicingCasePresentation"));
  assert.ok(js.includes("createServicingPositionIndex"));
  assert.ok(js.includes("createObligationPortfolioPresentation"));
  assert.ok(js.includes("refreshOwnedPositionIndex"));
  assert.ok(js.includes("workspacePositionViews"));
  assert.ok(servicingPositionIndex.includes("servicing_position_index.v1"));
  assert.ok(servicingPositionIndex.includes("tenant_owned_obligation_view.v1"));
  assert.ok(servicingPositionIndex.includes("serverAuthoritative: true"));
  assert.equal(servicingPositionIndex.includes("settlementPredicted"), false);
  assert.ok(obligationPortfolio.includes("obligation_portfolio_presentation.v1"));
  assert.ok(obligationPortfolio.includes("reconciledFromCanonicalSchedule: true"));
  assert.ok(obligationPortfolio.includes("correctionsAreExplicit: true"));
  assert.ok(obligationPortfolio.includes('profile: executed ? "signed_local_sandbox"'));
  assert.equal(obligationPortfolio.includes("localStorage"), false);
  assert.equal(obligationPortfolio.includes("sessionStorage"), false);
  assert.ok(capitalNetworkPresentation.includes("capital_network_presentation.v1"));
  assert.ok(capitalNetworkPresentation.includes("signed_fixed_loopback_provider_sandbox"));
  assert.ok(capitalNetworkPresentation.includes("duplicateCanonicalStateAllowed: false"));
  assert.ok(capitalNetworkPresentation.includes('source: "historical_example_only"'));
  assert.ok(capitalNetworkPresentation.includes("pricingPolicy: false"));
  assert.ok(riskOperationsPresentation.includes("checkedInEvidenceIsLiveState: false"));
  assert.ok(riskOperationsPresentation.includes("automaticActionsEnabled: false"));
  assert.ok(riskOperationsPresentation.includes("breakGlassEnabled: false"));
  assert.ok(riskOperationsPresentation.includes("piiInAggregateViews: false"));
  assert.equal(riskOperationsPresentation.includes("liveStateLoaded: true"), false);
  assert.equal(capitalNetworkPresentation.includes("localStorage"), false);
  assert.equal(capitalNetworkPresentation.includes("sessionStorage"), false);
  assert.ok(js.includes('action === "servicing-cure"'));
  assert.ok(css.includes(".servicing-case-panel"));
  assert.ok(css.includes(".servicing-case-workspace"));
  assert.ok(html.includes('id="ownedPositionPicker"'));
  assert.ok(html.includes('id="ownedPositionList"'));
  assert.ok(html.includes('id="refreshOwnedPositionsBtn"'));
  assert.ok(html.includes('id="ownedPositionRefreshState"'));
  assert.ok(html.includes('id="obligationPortfolioList"'));
  assert.ok(html.includes('id="obligationPortfolioRefreshBtn"'));
  assert.ok(html.includes('id="obligationDetailHistory"'));
  assert.ok(html.includes('id="obligationDetailEvidenceBtn"'));
  assert.ok(js.includes("workspaceObligationResources"));
  assert.ok(js.includes("rememberWorkspaceObligation"));
  assert.ok(js.includes("startAnotherHumanApplication"));
  assert.ok(js.includes('button[data-obligation-id]'));
  assert.ok(css.includes(".owned-position-button"));
  assert.ok(css.includes(".obligation-portfolio-workspace"));
  assert.ok(css.includes(".obligation-detail-history-row"));
  assert.ok(js.includes('humanObligationWorkflowIdentifier(workflowId, "request", "01")'));
  assert.ok(js.includes('humanObligationWorkflowIdentifier(workflowId, "request", "02")'));
  assert.ok(js.includes('humanObligationWorkflowIdentifier(workflowId, "request", repaymentStepId)'));
  assert.ok(js.includes("payload: { actionConfirmation }"));
  assert.ok(js.includes("economic_action_confirmation_result.v1"));
  for (const purpose of [
    "credit_application",
    "credit_decision",
    "credit_offer_acceptance",
    "obligation_servicing",
    "identity_reference_use"
  ]) {
    assert.ok(js.includes(`"${purpose}"`), `${purpose} Human Consent purpose missing`);
  }
  assert.ok(js.includes("human_credit_offer_acknowledgement.v1"));
  assert.ok(js.includes("pilotAcceptCreditOffer"));
  assert.ok(html.includes('id="auditorEvidenceConsole"'));
  assert.ok(html.includes('id="auditorEvidenceConsole" class="auditor-evidence-console" aria-labelledby="auditorEvidenceTitle" hidden'));
  assert.ok(js.includes('resource: { resourceType: "evidence", resourceId: query.obligationId }'));
  assert.ok(js.includes('idempotent: false'));
  assert.ok(js.includes("Auditor access is required or the Obligation is unavailable."));
  assert.ok(js.includes("document.createElement"));
  assert.equal(js.includes("authorizationContext"), false);
  assert.ok(js.includes("createHumanCreditOfferWorkflowReceipt"));
  assert.ok(js.includes("createRequestCreditReviewBinding"));
  assert.ok(js.includes("assertRequestCreditReviewCurrent"));
  assert.ok(reviewBinding.includes(
    'REQUEST_CREDIT_REVIEW_BINDING_SCHEMA_VERSION =\n  "request_credit_review_binding.v1"'
  ));
  assert.ok(reviewBinding.includes('"request_economics_changed"'));
  assert.ok(reviewBinding.includes('"authority_changed"'));
  assert.ok(css.includes(".request-credit-agent"));
  assert.ok(css.includes(".agent-request-journey"));
  assert.ok(html.includes("Non-authorizing · no credentials · no funds"));
  assert.ok(js.includes("createApplicationReadyAgentHandoffManifest"));
  assert.ok(js.includes('handoff?.status === "application_ready"'));
  assert.ok(js.includes('status.dataset.mcpToolStatus === "application"'));
  assert.ok(handoff.includes('AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION = "agent_handoff_manifest.v1"'));
  assert.ok(capabilities.includes(
    'AGENT_PILOT_CAPABILITY_MANIFEST_SCHEMA_VERSION =\n  "agent_pilot_capability_manifest.v1"'
  ));
  assert.ok(capabilities.includes("economicMcpToolsEnabled: true"));
  assert.ok(capabilities.includes("liveChainExecution: false"));
  assert.ok(agentConsolePresentation.includes(
    'AGENT_CONSOLE_PRESENTATION_VERSION =\n  "agent_console_presentation.v1"'
  ));
  assert.ok(agentConsolePresentation.includes("catalogParity"));
  assert.ok(agentConsolePresentation.includes("productionFundsApproved: false"));
  assert.ok(agentConsolePresentation.includes("remoteMcpEnabled: false"));
  assert.ok(js.includes("createAgentPilotCapabilityManifest"));
  assert.ok(js.includes("createAgentConsolePresentation"));
  assert.ok(js.includes('workflowId === status.dataset.agentWorkflowStatus'));
  assert.ok(handoff.includes('credentialDelivery: "out_of_band"'));
  assert.ok(handoff.includes("credentialsIncluded: false"));
  assert.ok(handoff.includes("remoteMcpEnabled: false"));
  assert.ok(handoff.includes("fundsAuthority: false"));
  assert.ok(html.includes("New Subjects remain pending"));
  assert.ok(html.includes("no credential creation"));
  assert.ok(html.includes('class="mandate-capability-list"'));
  assert.ok(css.includes(".capability-list > div"));
  assert.ok(css.includes(".mandate-capability-list span"));
  assert.ok(html.includes('class="obligation-card-layout"'));
  assert.ok(html.includes('class="obligation-state-column"'));
  assert.ok(html.includes('class="obligation-action-column"'));
  assert.ok(css.includes("grid-column: 1 / -1"));
  assert.ok(css.includes(".obligation-card-layout"));
  assert.ok(js.includes("sessionStorage.getItem"));
  assert.equal(js.includes("getCertificateBoundJwt"), false);
  assert.equal(js.includes("maxTtlSeconds: 300"), false);
  assert.equal(js.includes("dispatcher: mtlsDispatcher"), false);
  assert.equal(js.includes("IPO_ONE_ORIGIN"), false);
  assert.ok(js.includes("pnpm run local:agent:application"));
  assert.ok(js.includes("pnpm run local:agent:runtime"));
  assert.ok(js.includes("pnpm run local:agent:acceptance"));
  assert.ok(js.includes('new URL("/openapi.json", globalThis.location.origin)'));
  assert.ok(v9TrustSurfaces.includes('"pilotReadAgentSelf"'));
  assert.ok(html.includes('href="/openapi.json"'));
  assert.equal(/\bDPoP\b/.test(`${html}\n${js}`), false, "DPoP is not a production capability");
  assert.equal(html.includes("baseUrl: \"http://127.0.0.1:3000\""), false);
  assert.equal(js.includes(".innerHTML"), false, "API-controlled values must use text-safe DOM rendering");
});

test("Provider Network preserves the exact no-funds Provider boundary", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const presentation = await readFile(
    new URL("../src/capital-network-presentation.js", import.meta.url),
    "utf8"
  );
  const start = html.indexOf('data-view-panel="capital-network"');
  const end = html.indexOf('data-view-panel="wallet-permissions"', start);
  const surface = html.slice(start, end);

  assert.ok(start >= 0 && end > start, "Provider Network surface missing");
  assert.equal(/total value locked/i.test(surface), false);
  assert.equal(/\bTVL\s*[:=]\s*[$0-9]/i.test(surface), false);
  assert.equal(/\bdeployed capital\b/i.test(
    surface.replace(/not deployed capital/gi, "")
  ), false);
  assert.ok(surface.includes("Simulation only"));
  assert.ok(surface.includes("Historical example only · unapproved"));
  assert.ok(surface.includes("Not pricing policy"));
  assert.ok(surface.includes("No Provider funding"));
  assert.match(
    surface,
    /<button type="button" disabled>Fund facility<\/button>/
  );
  assert.match(
    surface,
    /<button type="button" disabled>Withdraw<\/button>/
  );
  assert.ok(js.includes('purpose: "provider_intent_delivery"'));
  assert.ok(js.includes("capital_network_ack_"));
  assert.ok(presentation.includes("deployedCapital: false"));
  assert.ok(presentation.includes("productionFundsMoved: false"));
  assert.ok(presentation.includes("withdrawable: false"));
  assert.equal(presentation.includes("approved: true"), false);
});

test("WEB-014 separates product intent, access mode, and Provider operations", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  for (const label of [
    "Products",
    "Credit lifecycle",
    "Access &amp; integrations",
    "Evidence &amp; operations",
    "Choose what you want to do",
    "Human and Agent, one shared kernel",
    "Credit",
    "Trading Capital",
    "Capital Partners",
    "Developer / API",
    "Provider Network"
  ]) {
    assert.ok(html.includes(label), `${label} information-architecture label missing`);
  }

  assert.ok(html.includes('data-go-view="request-credit"'));
  assert.ok(html.includes('data-go-view="trading-capital"'));
  assert.ok(html.includes('data-go-view="capital-partners"'));
  assert.ok(html.includes('class="product-entry-card developer-product"'));
  assert.ok(html.includes('data-go-view="architecture"'));
  assert.ok(html.includes('data-view-panel="capital-partners"'));
  assert.ok(js.includes('"capital-partners": { eyebrow: "Synthetic bilateral marketplace", title: "Capital Partners" }'));
  assert.ok(js.includes('"capital-network": { eyebrow: "Provider sandbox boundary", title: "Provider Network" }'));
  assert.ok(css.includes(".product-entry-grid"));
  assert.ok(css.includes(".capital-partners-page"));

  const capitalStart = html.indexOf('data-view-panel="capital-partners"');
  const capitalEnd = html.indexOf('data-view-panel="capital-network"', capitalStart);
  const capitalSurface = html.slice(capitalStart, capitalEnd);
  assert.ok(capitalStart >= 0 && capitalEnd > capitalStart, "Capital Partners workspace missing");
  assert.ok(capitalSurface.includes("Author sandbox terms"));
  assert.ok(capitalSurface.includes("Portfolio and Facility truth"));
  assert.ok(capitalSurface.includes("No funds authority"));
  assert.match(capitalSurface, /<button type="button" disabled>Deposit<\/button>/);
  assert.match(capitalSurface, /<button type="button" disabled>Allocate funds<\/button>/);
  assert.match(capitalSurface, /<button type="button" disabled>Withdraw<\/button>/);
  assert.ok(capitalSurface.includes("Public pools, deposits, custody, allocation, withdrawals, and real capital remain disabled."));

  const tradingStart = html.indexOf('data-view-panel="trading-capital"');
  const tradingEnd = html.indexOf('data-view-panel="wallet-permissions"', tradingStart);
  const tradingSurface = html.slice(tradingStart, tradingEnd);
  assert.ok(tradingSurface.includes("Hyperliquid testnet is the only MVP venue"));
  assert.ok(tradingSurface.includes("Other venue adapters remain disabled"));
});

test("WEB-015 presents and synchronizes one authenticated session state", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  for (const id of [
    "accessSessionPanel",
    "accessSessionTitle",
    "accessSessionCopy",
    "continueAuthenticatedSessionBtn",
    "signOutBtn",
    "topbarSignOutBtn"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} authenticated-session control missing`);
  }
  assert.ok(js.includes('accessState.pendingWorkspaceBootstrap'));
  assert.ok(js.includes('accessState.sessionAuthenticationMethod === "siwe"'));
  assert.ok(js.includes('"Reconnect the session wallet"'));
  assert.match(
    js,
    /walletConfirmation = sessionConfirmationMethod === "siwe"/,
    "economic-action confirmation must follow the authenticated session method"
  );
  assert.ok(js.includes("The authenticated session confirmation method is unavailable"));
  assert.equal(
    js.includes("const walletConfirmation = Boolean(accessState.walletAddress && provider)"),
    false,
    "a SIWE session must never silently downgrade to authenticated account confirmation"
  );
  assert.ok(js.includes('accessButtonLabel = authenticated'));
  assert.equal(
    js.includes('? shortWalletAddress(accessState.walletAddress)\n      : "Sign in"'),
    false,
    "a connected wallet must not replace the signed-out label"
  );
  assert.ok(js.includes('"/auth/v1/logout"'));
  assert.ok(js.includes('el("topbarSignOutBtn").hidden = !authenticated'));
  assert.ok(js.includes(
    'el("topbarSignOutBtn").addEventListener("click", signOutAuthenticatedSession)'
  ));
  assert.equal(
    js.includes('el("signOutBtn").hidden = !accessState.authEnabled'),
    false,
    "authenticated local sessions must not hide explicit sign out"
  );
  assert.ok(js.includes('"x-csrf-token": csrfToken'));
  assert.ok(js.includes('"idempotency-key": tenantRequestToken("web_logout")'));
  assert.match(
    js,
    /!accessState\.walletAuthenticationEnabled\s*&&\s*!tenantCsrfToken\(\)/,
    "a CSRF-bootstrapped local private session must reach authenticated catalog verification"
  );
  assert.match(
    js,
    /\(accessState\.authEnabled \|\| accessState\.walletAuthenticationEnabled\)\s*&&\s*!accessState\.sessionActive\s*&&\s*!tenantCsrfToken\(\)/,
    "a signed-out closed-pilot browser must not probe the protected Tenant catalog"
  );
  assert.match(
    js,
    /if \(tenantPilot\.connected\) \{\s*accessState\.sessionActive = true;/,
    "successful Tenant catalog verification must synchronize the visible session state"
  );
  assert.match(
    js,
    /new Set\(\["borrower", "controller"\]\)\.has\(currentWorkspaceName\(\)\)/,
    "Capital Partner and Risk workspaces must not invoke borrower workspace recovery"
  );
  assert.ok(css.includes(".account-access-button.authenticated"));
  assert.ok(css.includes(".topbar-sign-out-button"));
  assert.ok(css.includes(".access-session-panel"));
  assert.ok(html.includes('class="private-session-closed"'));
  assert.ok(html.includes('id="signedOutPrivacyShield"'));
  assert.ok(html.includes("Choose how you want to use IPO.ONE"));
  assert.ok(html.includes("Developer / API"));
  assert.ok(html.includes('id="signedOutPrivacyAction" class="primary" type="button" hidden'));
  assert.ok(html.includes('id="authenticatedRuntimeGateAction" class="primary" type="button" hidden'));
  assert.ok(js.includes("account session, wallet connection, and private browser state"));
  assert.ok(js.includes('el("signedOutPrivacyAction").hidden = true'));
  assert.ok(js.includes(
    "gate.hidden = !workspaceRoleMismatch && (!authenticated || connected)"
  ));
  assert.ok(css.includes("body.private-session-closed [data-view-panel]"));
  assert.ok(css.includes(".signed-out-role-list"));
  assert.ok(css.includes(".signed-out-privacy-shield[hidden]"));
  assert.ok(js.includes('from "./wallet-sign-out.js"'));
  assert.ok(js.includes("releaseSelectedWallet"));
  assert.ok(js.includes("purgeAuthenticatedBrowserState"));
  assert.ok(js.includes("authenticatedDataEpoch"));
  assert.ok(js.includes('"ipo-one-csrf-token"'));
  assert.ok(js.includes('"ipo-one-local-agent-account"'));
  assert.ok(js.includes("AUTHENTICATED_BROWSER_STATE_BASELINES"));
  assert.ok(js.includes('forgetOpaqueId(HUMAN_CONSENT_STORAGE_KEY)'));
  assert.ok(js.includes(
    "This scoped Consent already created an equivalent Credit Intent."
  ));
});

test("WEB-020 routes Agent authority through the Principal workspace and explains proof handoff", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  for (const id of [
    "agentAuthorityAccessGate",
    "agentAuthorityAccessTitle",
    "agentAuthorityAccessCopy",
    "openPrincipalWorkspaceLink",
    "agentAuthorityWorkspaceContent",
    "agentAccountProofNextStep"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} Principal entry control missing`);
  }
  assert.match(
    html,
    /class="authority-workbench-layout" id="agentAuthorityWorkspaceContent" hidden/,
    "Agent authority controls must start fail-closed"
  );
  assert.match(
    js,
    /tenantPilot\.connected === true\s*&&\s*currentWorkspaceName\(\) === "controller"\s*&&\s*tenantPilot\.workspaceKind === "principal_controller"/,
    "both host and authenticated workspace identities must authorize the form"
  );
  assert.ok(js.includes('currentWorkspaceName() !== "borrower"'));
  assert.ok(js.includes('new Set(["127.0.0.1", "localhost"])'));
  assert.ok(js.includes("borrowerPort + 1"));
  assert.ok(js.includes("no Borrower permission will be widened"));
  assert.match(
    js,
    /async function runAgentAuthorityAction[\s\S]*?if \(!hasPrincipalAgentAuthorityWorkspace\(\)\)/,
    "Agent authority actions need a defensive Principal preflight"
  );
  assert.ok(js.includes(
    "Ask registered test Agent to prove"
  ));
  assert.ok(js.includes(
    "this browser never receives a private key or signature"
  ));
  assert.ok(js.includes('"Ready for online proof"'));
  assert.ok(js.includes('"Submit through Agent API"'));
  assert.ok(css.includes(".agent-authority-access-gate"));
  assert.ok(css.includes(".account-proof-next-step"));
});

test("WEB-021 recovers a cross-port workspace role mismatch without losing wallet discovery", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  assert.ok(html.includes('id="switchPrincipalSessionBtn"'));
  assert.ok(html.includes("Switch to Principal session"));
  assert.ok(js.includes('"workspace_session_role_mismatch"'));
  assert.ok(js.includes('tenantPilot.workspaceRecoveryState = "role_mismatch"'));
  assert.ok(js.includes("switchCurrentWorkspaceSession"));
  assert.ok(js.includes("continueToPrincipalWorkspace"));
  assert.ok(js.includes("explicitWalletReleaseInProgress"));
  assert.ok(
    js.indexOf('const subject = recoveredResource(resources, "subject")') >
      js.indexOf('"workspace_session_role_mismatch"'),
    "role mismatch must return before role-specific resources are hydrated"
  );
  assert.match(
    js,
    /if \(clearWalletUi\) \{[\s\S]*?accessState\.selectedWalletProviderId = null;[\s\S]*?\}/,
    "explicit sign-out must clear wallet selection"
  );
  assert.equal(
    /if \(clearWalletUi\) \{[\s\S]*?accessState\.walletProviders = \[\];[\s\S]*?\}/.test(js),
    false,
    "explicit sign-out must preserve discovered Providers for fresh role sign-in"
  );
  assert.ok(js.includes(
    "gate.hidden = !workspaceRoleMismatch && (!authenticated || connected)"
  ));
  assert.ok(css.includes(".agent-authority-access-actions"));
});

test("WEB-023 presents distinct Agent application and runtime handoff stages", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  for (const id of [
    "continueAgentCreditBtn",
    "agentApplicationStage",
    "agentApplicationStageStatus",
    "agentApplicationStageCopy",
    "openAgentApplicationHandoffBtn",
    "agentRequestCreditNext",
    "agentRequestPrimaryBtn",
    "agentRequestSecondaryBtn"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} Agent continuation control missing`);
  }
  assert.match(
    html,
    /id="openAgentApiBtn"[^>]+data-agent-guide-action="open-handoff"/,
    "post-activation handoff must not route to the Architecture page"
  );
  assert.equal(
    /id="openAgentApiBtn"[^>]+data-go-view="architecture"/.test(html),
    false
  );
  assert.match(
    html,
    /id="continueAgentCreditBtn"[^>]+data-agent-guide-action="open-agent-workspace"[^>]*>Open Agent workspace</,
    "post-activation navigation must open the browser-operable Agent workspace without a mutation"
  );
  assert.ok(html.includes("Run the Agent application"));
  assert.ok(html.includes("Return after the Agent application produced its Offer workflow receipt."));
  assert.ok(html.includes("activation unlocks runtime use of an existing Agent Offer"));
  assert.ok(js.includes("const applicationReady = applicationHandoff && applicationOperationsAvailable"));
  assert.ok(js.includes("const runtimeReady = runtimeHandoff && economicOperationsAvailable"));
  assert.ok(js.includes('"Runtime ready · existing Offer required"'));
  assert.ok(js.includes("this runtime cannot start a new Credit Intent"));
  assert.ok(js.includes("create a new Draft application Mandate"));
  assert.ok(js.includes("Required input · agent_credit_offer_workflow_receipt.v1"));
  assert.ok(js.includes("new application request and evaluation are Draft-only"));
  assert.ok(js.includes('primary.dataset.agentGuideAction = "view-obligations"'));
  assert.ok(js.includes('primary.dataset.agentGuideAction = runtimeReady'));
  assert.ok(js.includes('if (action === "run-online-agent")'));
  assert.equal(js.includes("Borrow, repay, and verify online"), false);
  const openAgentWorkspaceBranch = js.match(
    /if \(action === "open-agent-workspace"\) \{[\s\S]*?\n  \}/
  )?.[0] ?? "";
  assert.match(openAgentWorkspaceBranch, /showView\("agent-console"\)/);
  assert.doesNotMatch(openAgentWorkspaceBranch, /runOnlineReferenceAgent/);
  assert.ok(js.includes('if (action === "view-obligations")'));
  assert.match(
    js,
    /if \(action === "agent-api"\) \{\s*openAgentProtocolDetails\(\{ targetId: "agentConsoleContract" \}\);/,
    "Agent workspace action must open the runtime handoff contract"
  );
  assert.ok(js.includes("Read-only Principal view."));
  assert.ok(js.includes("Agent-authenticated repayment required"));
  assert.ok(js.includes('recovery.workspaceKind === "principal_controller"'));
  assert.match(
    js,
    /if \(mandate\) \{[\s\S]*?await loadExactMandate\(mandate\.resourceId\);[\s\S]*?const recoveredPrincipalSubjectId = exactResourceId\([\s\S]*?agentAuthorityPilot\.mandate\?\.subjectId[\s\S]*?resourceId: recoveredPrincipalSubjectId/,
    "Principal recovery must authorize the AccountBinding for the exact Subject linked by the recovered Mandate"
  );
  assert.ok(js.includes("selectedObligation && tenantPilot.obligationReadAvailable"));
  assert.ok(css.includes(".agent-credit-next"));
  assert.ok(css.includes(".authority-continue"));
  assert.ok(css.includes(".authority-application-card"));
});

test("TRUST-002 keeps latest Evidence visible through bounded read-only refreshes", async () => {
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const projection = await readFile(
    new URL("../src/owned-evidence-presentation.js", import.meta.url),
    "utf8"
  );
  const loadOwnedEvidence = js.match(
    /async function loadOwnedEvidence\([\s\S]*?(?=\nfunction renderAuditorEvidence)/
  )?.[0] ?? "";
  const committedRefresh = js.match(
    /async function refreshOwnedEvidenceAfterCommittedAction\([\s\S]*?\n\}/
  )?.[0] ?? "";
  const resetEvidence = js.match(
    /function resetOwnedEvidenceState\([\s\S]*?(?=\nfunction resetHumanObligationWorkflow)/
  )?.[0] ?? "";

  assert.match(loadOwnedEvidence, /limit: OWNED_EVIDENCE_DISPLAY_LIMIT/);
  assert.match(loadOwnedEvidence, /requestDataEpoch === authenticatedDataEpoch/);
  assert.match(loadOwnedEvidence, /requestEpoch === ownedEvidence\.queryEpoch/);
  assert.match(loadOwnedEvidence, /applyOwnedEvidencePage\(result\.response/);
  assert.match(loadOwnedEvidence, /await loadEvidenceAnchorStatus\(\)/);
  assert.doesNotMatch(loadOwnedEvidence, /loadEvidenceAnchorStatus\(\{ observe: true \}\)/);
  assert.match(committedRefresh, /economic command was not resubmitted/);
  assert.match(committedRefresh, /await loadOwnedEvidence\(\{ refreshAnchor: false \}\)/);
  assert.match(resetEvidence, /queryEpoch/);
  assert.match(resetEvidence, /expectedMarker/);
  assert.match(resetEvidence, /Object\.assign\(evidenceAnchorPilot/);
  assert.ok(js.includes("newestOwnedEvidenceFirst(items).map(auditorEvidenceRow)"));
  assert.ok(projection.includes("Bounded partial timeline:"));
  assert.ok(projection.includes('return "delayed"'));
  assert.ok(projection.includes("item.aggregateVersion > 0"));
  assert.ok(js.includes("retainMatchingEvidenceAnchors("));
  assert.ok(js.includes("currentOwnedEvidenceVerificationState"));
  assert.ok(projection.includes("response.items.some((item) => item?.obligationId !== obligationId)"));
  assert.ok(js.includes("hasOwnedEvidenceMarker(ownedEvidence.items"));
  assert.ok(js.includes('item?.eventType === "repayment_posted"'));
  assert.ok(js.includes('BigInt(obligation.totalRepaidMinor ?? "0") > 0n'));
  assert.ok(js.includes('totalRepaidMinor.toString())} repaid'));
  assert.ok(js.includes('more.hidden = !matchesCurrent || !ownedEvidence.hasMore'));
  assert.ok(js.includes('? "Retry Evidence read"'));
  assert.ok(js.includes("Sign in again and reconcile server truth before retrying any action"));
  assert.ok(js.includes("The Agent Evidence read failed. Any accepted lifecycle action remains unchanged"));
  assert.equal(
    js.match(/refreshOwnedEvidenceAfterCommittedAction\(/g)?.length,
    7,
    "Human and Agent acceptance, execution and repayment must each have one safe follow-up read"
  );
  for (const economicOperation of [
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment",
    "accept_offer",
    "execute_allowed_use",
    "post_repayment"
  ]) {
    assert.equal(
      `${loadOwnedEvidence}\n${committedRefresh}`.includes(economicOperation),
      false,
      `${economicOperation} must not be reachable from Evidence refresh`
    );
  }
});

test("UX-002 keeps Human and Agent credit actions browser-operable", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  for (const id of [
    "agentOnlineWorkflow",
    "agentOnlineRunBtn",
    "agentOnlineReviewBtn",
    "proveAccountOnlineBtn",
    "restoreCreditPassportBtn",
    "loadCreditTrackRecordBtn",
    "servicingClosedNextBtn"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} browser action missing`);
  }
  assert.ok(html.includes("Request, borrow, repay, and verify online"));
  assert.ok(html.includes("Request Agent credit and receive Offer"));
  assert.equal(html.includes("Run Agent application online"), false);
  assert.ok(html.includes("No handoff download or browser credential is required"));
  assert.ok(js.includes('"/local/v1/reference-agent/account-proof"'));
  assert.ok(js.includes('"/local/v1/reference-agent/application"'));
  assert.ok(js.includes('"/local/v1/reference-agent/runtime-step"'));
  assert.ok(js.includes("Early partial or full repayment is available now"));
  assert.ok(js.includes("document.activeElement !== amountInput"));
  assert.ok(js.includes('document.activeElement !== el("humanRepaymentAmount")'));
  assert.ok(js.includes("restoreLatestCreditPassport"));
  assert.ok(js.includes("loadCreditTrackRecord"));
  assert.ok(js.includes("quarantineRejectedAuthenticationSession"));
  assert.ok(css.includes(".agent-online-workflow"));
});

test("TC-104 exposes eight authenticated Trading Capital views without funds claims", async () => {
  const [html, js, presentation] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/trading-capital-product-presentation.js", import.meta.url),
      "utf8"
    )
  ]);
  assert.ok(html.includes('data-view-panel="trading-capital"'));
  for (const view of [
    "overview",
    "profile",
    "marketplace",
    "setup",
    "live",
    "risk",
    "settle",
    "proof"
  ]) {
    assert.ok(
      html.includes(`data-trading-capital-view="${view}"`),
      `${view} Trading Capital view missing`
    );
  }
  assert.ok(js.includes('from "./trading-capital-product-presentation.js"'));
  assert.ok(js.includes('"tradingReadFacilityEvidence"'));
  assert.ok(js.includes('"tradingRequestClose"'));
  assert.ok(js.includes('"tradingIssuePerformanceProof"'));
  assert.ok(presentation.includes("TRADING_CAPITAL_OPERATION_IDS"));
  assert.ok(html.includes("Run settlement · worker only"));
  assert.ok(html.includes("Withdraw · unavailable"));
  assert.equal(html.includes("official redeemable settlement"), false);
});

test("closed-pilot browser has no demo route, reset control, or hidden fallback", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  for (const retiredRoute of [
    "/v1/demo/",
    "/v1/agents",
    "/v1/spend-requests",
    "/v1/settlements",
    "/v1/revenue-capture",
    "/v1/repayments/auto",
    "/v1/credit-learning/evaluate"
  ]) {
    assert.equal(js.includes(retiredRoute), false, `${retiredRoute} must not be callable by the product browser`);
  }
  for (const retiredControl of [
    "runFullFlowBtn",
    "healthyCycleBtn",
    "riskyCycleBtn",
    "recoveryCycleBtn",
    "resetBtn",
    "data-legacy-demo-surface"
  ]) {
    assert.equal(html.includes(retiredControl), false, `${retiredControl} must not remain in shipped markup`);
  }
  for (const surfaceId of [
    "privatePortfolioSurface",
    "privateCreditSurface",
    "privatePaymentsSurface",
    "privateEvidenceSurface",
    "privateRiskSurface"
  ]) {
    const openingTag = html.match(new RegExp(`<[^>]+id="${surfaceId}"[^>]*>`))?.[0];
    assert.ok(openingTag, `${surfaceId} missing`);
    assert.equal(/\shidden(?:\s|>)/.test(openingTag), false, `${surfaceId} must render a truthful locked state before sign-in`);
  }
  assert.ok(js.includes('fetch("/tenant/v1/catalog"'));
  assert.ok(js.includes('fetch("/tenant/v1/operations"'));
  assert.ok(js.includes("setConnection(tenantPilot.connected)"));
  assert.ok(js.includes("No product data is available without an authenticated session."));
  assert.ok(html.includes("Protocol fees disabled · Fee Policy deferred"));
});

test("UX-003 exposes Human evaluation and staged Agent credit use as browser actions", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);
  for (const id of [
    "homeHumanBorrowBtn",
    "homeAgentBorrowBtn",
    "submitHumanCreditBtn",
    "agentOnlineRunBtn",
    "agentOnlineExecuteBtn",
    "agentOnlineRepayBtn",
    "agentOnlineEvidenceBtn",
    "agentOnlineReviewBtn"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} browser action missing`);
  }
  assert.ok(html.includes("Start Human application"));
  assert.ok(html.includes("Request & evaluate credit"));
  assert.ok(js.includes('"Create Agent Obligation"'));
  assert.ok(html.includes("Execute allowlisted Provider spend"));
  assert.ok(html.includes("Capture revenue and auto-repay"));
  assert.ok(html.includes("Verify Agent Evidence"));
  assert.ok(html.includes("non-withdrawable sandbox rail"));
  assert.ok(js.includes('"/local/v1/reference-agent/runtime-step"'));
  for (const action of [
    "accept_offer",
    "execute_allowed_use",
    "post_repayment",
    "read_evidence"
  ]) {
    assert.ok(js.includes(`action: "${action}"`), `${action} Agent stage missing`);
  }
  assert.ok(js.includes("function openBorrowingEntry"));
  assert.ok(js.includes("executeOnlineAgentApprovedUse"));
  assert.ok(js.includes("repayOnlineAgentObligation"));
  assert.ok(js.includes("verifyOnlineAgentEvidence"));
  assert.ok(css.includes(".borrowing-entry-strip"));
  assert.ok(css.includes(".agent-online-stage-actions"));
});

test("UX-005 opens a fresh Human application when a recovered Obligation exists", async () => {
  const [html, js, manual] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../../../docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md", import.meta.url),
      "utf8"
    )
  ]);
  assert.ok(html.includes('id="newHumanApplicationBtn"'));
  assert.ok(html.includes("Start a new Human loan"));
  assert.match(
    js,
    /function openBorrowingEntry\(entryMode\)[\s\S]*?if \(tenantPilot\.obligation\) \{[\s\S]*?startAnotherHumanApplication\(\)/
  );
  assert.match(
    js,
    /function startAnotherHumanApplication\(\)[\s\S]*?el\("humanConsentId"\)\.value = "";[\s\S]*?tenantPilot\.intent = null;/
  );
  assert.doesNotMatch(
    js.match(/function startAnotherHumanApplication\(\)[\s\S]*?\n\}/)?.[0] ?? "",
    /humanSubjectId/
  );
  assert.ok(manual.includes("Start a new Human loan"));
  assert.ok(manual.includes("必须创建"));
});

test("UX-004 keeps the user manual and primary browser actions in one operability contract", async () => {
  const [html, js, css, manual, contract, inventorySource] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(
      new URL("../../../docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../../../docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md", import.meta.url),
      "utf8"
    ),
    readFile(new URL("./manual-primary-actions.v1.json", import.meta.url), "utf8")
  ]);
  const inventory = JSON.parse(inventorySource);
  assert.equal(inventory.schemaVersion, "manual_primary_actions.v1");
  const productSource = `${html}\n${js}`;
  const documentedSource = `${manual}\n${contract}`;
  const ids = new Set();

  for (const action of inventory.actions) {
    assert.equal(ids.has(action.id), false, `${action.id} is duplicated in the action inventory`);
    ids.add(action.id);
    const idMatches = html.match(new RegExp(`\\bid="${action.id}"`, "g")) ?? [];
    assert.equal(idMatches.length, 1, `${action.id} must exist exactly once in the browser`);
    if (action.view !== "global") {
      assert.ok(
        html.includes(`data-view-panel="${action.view}"`),
        `${action.id} references missing ${action.view} view`
      );
    }
    for (const label of action.labels) {
      const escapedHtmlLabel = label.replaceAll("&", "&amp;");
      assert.ok(
        productSource.includes(label) || html.includes(escapedHtmlLabel),
        `${action.id} product label "${label}" missing`
      );
      assert.ok(
        documentedSource.includes(`\`${label}\``),
        `${action.id} label "${label}" missing from the user contract`
      );
    }
  }

  const hiddenPrimarySelector = css.match(
    /\.nav-item\[data-view="agent-console"\],[\s\S]*?\{\s*display:\s*none;\s*\}/
  )?.[0] ?? "";
  for (const view of [
    "obligations",
    "repay-settle",
    "credit-passport",
    "credit-track-record"
  ]) {
    assert.equal(
      hiddenPrimarySelector.includes(`data-view="${view}"`),
      false,
      `${view} must remain visible in primary navigation`
    );
  }

  for (const statement of [
    "non-withdrawable sandbox rail",
    "Object hashes and server Evidence digests are not blockchain transactions.",
    "Raw KYC/PII"
  ]) {
    assert.ok(documentedSource.includes(statement), `${statement} safety statement missing`);
  }
  assert.ok(html.includes("non-withdrawable sandbox rail"));
  assert.ok(html.includes("A BaseScan link appears only after"));
});

test("every enabled browser button has a discoverable action contract", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const genericAction = /\bdata-(?:view|go-view|agent-guide-action|borrow-entry|human-guide-action|private-action|wallet-chain|auth-provider|trading-capital-view|scroll-target)=/;
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(
    (match) => match[0]
  );
  const missing = [];
  for (const button of buttons) {
    if (genericAction.test(button) || /\bdisabled\b/.test(button)) continue;
    const id = button.match(/\bid="([^"]+)"/)?.[1];
    if (
      !id ||
      (
        !js.includes(`el("${id}")`) &&
        !js.includes(`#${id}`) &&
        !js.includes(`getElementById("${id}")`)
      )
    ) {
      missing.push(id ?? button);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "enabled controls must not exist without a named or delegated action"
  );
});

test("public beta launch configuration is bounded and supply-chain pinned", async () => {
  const server = await readFile(new URL("../../api/src/server.js", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../../.github/workflows/quality.yml", import.meta.url), "utf8");

  for (const header of [
    "content-security-policy",
    "cross-origin-opener-policy",
    "permissions-policy",
    "x-content-type-options",
    "x-frame-options"
  ]) {
    assert.ok(server.includes(`\"${header}\"`), `${header} is missing from the live server`);
  }
  assert.ok(server.includes("SANDBOX_SESSION_TTL_MS = 30 * 60 * 1000"));
  assert.ok(server.includes("SANDBOX_SESSION_LIMIT = 128"));
  assert.ok(server.includes("MAX_SANDBOX_MUTATIONS = 32"));
  assert.ok(server.includes("MAX_JSON_BODY_BYTES = 64 * 1024"));
  assert.ok(server.includes("GLOBAL_REQUESTS_PER_MINUTE = 600"));
  assert.ok(server.includes("MAX_CONCURRENT_REQUESTS = 64"));
  assert.ok(server.includes("server.requestTimeout = 15_000"));
  assert.ok(server.includes("server.maxHeadersCount = 100"));
  assert.ok(server.includes("server.maxConnections = 256"));
  assert.ok(server.includes("x-ipo-one-sandbox-session"));
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(workflow, /pnpm\/action-setup@[a-f0-9]{40}/);
  assert.equal(/uses:\s+[^\s]+@v\d/.test(workflow), false, "CI actions must be pinned to immutable SHAs");
  assert.ok(workflow.includes("pnpm run test:postgres"));
  assert.ok(workflow.includes("pnpm run test:security"));
  assert.ok(workflow.includes("pnpm run test:transport"));
  assert.ok(workflow.includes("pnpm run smoke:api"));
  assert.ok(workflow.includes("pnpm audit --prod"));
});
