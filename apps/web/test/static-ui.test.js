import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public beta control plane includes required workflows and launch safeguards", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const handoff = await readFile(new URL("../src/agent-handoff-manifest.js", import.meta.url), "utf8");
  const capabilities = await readFile(
    new URL("../src/agent-pilot-capability-manifest.js", import.meta.url),
    "utf8"
  );
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const icons = await readFile(new URL("../src/icons.svg", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../src/manifest.webmanifest", import.meta.url), "utf8"));

  for (const label of [
    "Agent Setup",
    "Lockbox",
    "Credit Line",
    "Provider Spend",
    "Settlement finality",
    "Revenue Capture & Repayment",
    "Credit Learning Dashboard",
    "Admin Dashboard"
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
    assert.ok(js.includes(route), `${route} call missing`);
  }
  assert.ok(
    js.includes("private-agent-subject-") && js.includes("pilotReadAgentAccountBinding"),
    "Agent Subject creation must be replay-safe and reload its durable binding"
  );

  for (const label of [
    "No real lending",
    "No real funds",
    "My Credit",
    "Agent API",
    "Your integration path",
    "The Principal approves. The Agent executes only that scope.",
    "View handoff packet, 11 MCP tools, SDK, and request log",
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
    "Agent MCP handoff",
    "Agent SDK quick start",
    "Load an eligible draft Mandate to create the application packet",
    "Principal → Agent capability packet",
    "Approved local MCP tools",
    "Approved local workflows",
    "Decision &amp; Offer",
    "Obligation &amp; repayment",
    "Servicing Case",
    "pilotReadOwnObligation + repayment + Evidence",
    "Dual-chain conformance",
    "3 local workflows",
    "Local stdio only",
    "Out of band",
    "Execution, repayment & servicing",
    "Signed sandbox rail + shared ledger",
    "Sandbox servicing policy v1",
    "3 complete UTC days",
    "Operations + Risk approval",
    "Obligation created",
    "21 operations",
    "38 Tenant operations",
    "My positions",
    "Authenticated server truth",
    "Start another application",
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
    "Catalog presence does not grant access",
    "Run Agent lifecycle",
    "Access IPO.ONE",
    "Sign in. Connect. <em>Stay in control.</em>",
    "Continue with Google",
    "Continue with email",
    "Connect &amp; sign in with wallet",
    "Authentication is not credit authority.",
    "Connect an approved network",
    "Base Sepolia",
    "X Layer Testnet",
    "Mandate scope",
    "Ledger integrity",
    "Plugin Contracts",
    "Evidence Stream",
    "Obligation Evidence",
    "Your immutable Obligation timeline",
    "EVIDENCE-001B · owner only",
    "Durable audit timeline",
    "Auditor access",
    "Rail Contracts",
    "Event replay"
  ]) {
    assert.ok(html.includes(label), `${label} boundary or surface missing`);
  }

  for (const view of ["overview", "human", "agent", "credit", "transfers", "evidence", "risk", "developer"]) {
    assert.ok(html.includes(`data-view-panel="${view}"`), `${view} view missing`);
  }

  for (const control of [
    "runFullFlowBtn",
    "accessBtn",
    "accessLayer",
    "accessCloseBtn",
    "googleSignInBtn",
    "emailSignInBtn",
    "walletSignInBtn",
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
    "humanDecisionPassport",
    "humanDecisionPassportProof",
    "humanDecisionReasonList",
    "humanDecisionSourceRows",
    "copyDecisionPassportBtn",
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
    "walletInputLabel",
    "bindWalletBtn",
    "createLockboxBtn",
    "requestCreditBtn",
    "submitSpendBtn",
    "recordSettlementBtn",
    "captureRevenueBtn",
    "autoRepayBtn",
    "resetBtn",
    "privatePortfolioSurface",
    "privatePortfolioPrimaryBtn",
    "privatePortfolioSecondaryBtn",
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
    "riskFreezeStatus"
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
    "pilotActivateSandboxMandate"
  ]) {
    assert.ok(js.includes(operation), `${operation} private Human operation missing`);
  }

  assert.match(
    js,
    /await loadPilotHealth\(\{ quiet: true \}\);\s*await loadPilotFeedbackSummary\(\{ quiet: true \}\);/,
    "same-portfolio authenticated aggregate reads must remain sequential"
  );

  for (const id of ["railName", "transferStatus", "settlementFinality", "railReplayStatus", "railList"]) {
    assert.ok(js.includes(`el("${id}")`), `${id} renderer missing`);
  }

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
    "/auth/v1/wallet/verify"
  ]) {
    assert.ok(js.includes(value), `${value} access boundary missing`);
  }
  assert.ok(js.includes("Human Principal -> Agent Subject"));
  assert.ok(js.includes("legacyWalletControls"));
  assert.ok(js.includes("Principal setup required"));
  assert.ok(html.includes("Configure Agent authority"));
  assert.ok(html.includes("One Obligation. <em>Two first-class entry modes.</em>"));
  assert.ok(html.includes("Live projection · core resources recover from server truth"));
  assert.ok(html.includes("Signed Provider boundary verified"));
  assert.ok(html.includes("Provider sandbox capability status"));
  assert.ok(html.includes("Capability status only — this Obligation has no Provider execution"));
  assert.ok(html.includes("public or remote Provider access remains disabled"));
  assert.equal((html.match(/data-private-session-surface/g) ?? []).length, 5);
  assert.equal((html.match(/data-legacy-demo-surface/g) ?? []).length, 13);
  assert.ok(js.includes("renderPrivateProductSurfaces"));
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
  assert.ok(js.includes('else if (["agent", "developer"].includes(nextView)) setMode("agent")'));
  assert.equal(
    js.includes('["overview", "agent", "credit", "transfers", "developer"].includes(nextView)'),
    false,
    "shared navigation must not force the Agent mode"
  );
  assert.ok(js.includes('action === "human-evidence"'));
  assert.ok(js.includes('action === "human-obligation"'));
  assert.ok(js.includes('action === "agent-api"'));
  assert.ok(css.includes(".private-product-hero"));
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
  assert.ok(js.includes("x-ipo-one-sandbox-session"));
  assert.ok(js.includes("credentials: \"same-origin\""));
  assert.ok(html.includes('meta name="ipo-one-csrf-token" content=""'));
  assert.ok(js.includes('meta[name="ipo-one-csrf-token"]'));
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
    "ipo_one_post_sandbox_repayment"
  ]) {
    assert.ok(handoff.includes(tool), `${tool} Agent MCP handoff tool missing`);
  }
  assert.ok(js.includes('from "./agent-handoff-manifest.js"'));
  assert.ok(js.includes('from "./agent-pilot-capability-manifest.js"'));
  assert.ok(js.includes('from "./human-credit-offer-workflow-receipt.js"'));
  assert.ok(js.includes('from "./human-sandbox-obligation-workflow-receipt.js"'));
  assert.ok(js.includes('from "./decision-passport-presentation.js"'));
  assert.ok(js.includes('from "./servicing-case-presentation.js"'));
  assert.ok(html.includes("Evidence-derived decision"));
  assert.ok(html.includes("Inspect machine-verifiable proof"));
  assert.ok(html.includes("Finalized synthetic Evidence · non-authorizing · no credentials · no production funds"));
  assert.ok(html.includes("risk_decision_passport.v1 · policy + finalized Evidence lineage"));
  assert.ok(js.includes("createHumanDecisionPassportPresentation"));
  assert.ok(js.includes("hasVerifiedHumanDecisionPassport"));
  assert.ok(js.includes("!passportVerified || !acknowledgement.checked"));
  assert.ok(js.includes("JSON.stringify(decision.decisionPassport, null, 2)"));
  assert.ok(css.includes(".decision-passport-card"));
  assert.ok(css.includes(".decision-source-table"));
  assert.ok(js.includes("createHumanSandboxObligationWorkflowReceipt"));
  assert.ok(js.includes("createServicingCasePresentation"));
  assert.ok(js.includes('action === "servicing-cure"'));
  assert.ok(css.includes(".servicing-case-panel"));
  assert.ok(css.includes(".servicing-case-workspace"));
  assert.ok(html.includes('id="ownedPositionPicker"'));
  assert.ok(html.includes('id="ownedPositionList"'));
  assert.ok(js.includes("workspaceObligationResources"));
  assert.ok(js.includes("rememberWorkspaceObligation"));
  assert.ok(js.includes("startAnotherHumanApplication"));
  assert.ok(js.includes('button[data-obligation-id]'));
  assert.ok(css.includes(".owned-position-button"));
  assert.ok(js.includes('requestId: humanObligationWorkflowIdentifier(workflowId, "request", "01")'));
  assert.ok(js.includes('requestId: humanObligationWorkflowIdentifier(workflowId, "request", "02")'));
  assert.ok(js.includes('requestId: humanObligationWorkflowIdentifier(workflowId, "request", repaymentStepId)'));
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
  assert.ok(js.includes("createAgentPilotCapabilityManifest"));
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
  assert.ok(js.includes('IpoOneAgentMcpClient,\n  IpoOneAgentSandboxObligationClient,'));
  assert.ok(js.includes("IpoOneAgentSandboxObligationClient"));
  assert.ok(js.includes("runSandboxObligationPortabilityConformance"));
  assert.ok(js.includes("handle: localMcpHost.handle"));
  assert.ok(js.includes('transportProfile: "mcp_stdio_local"'));
  assert.ok(js.includes("runCreditOfferWorkflow"));
  assert.equal(html.includes("baseUrl: \"http://127.0.0.1:3000\""), false);
  assert.equal(js.includes(".innerHTML"), false, "API-controlled values must use text-safe DOM rendering");
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
