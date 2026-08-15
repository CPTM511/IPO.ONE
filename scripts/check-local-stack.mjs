import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  stackText,
  compose,
  worker,
  privatePilotDatabase,
  task,
  readme,
  packageText,
  gitignore,
  dockerignore,
  localStackScript,
  localAcceptance,
  localAgent,
  localProfile,
  evidenceAnchorCompose,
  localEvidenceAnchor,
  localReleaseIdentity,
  m1bAcceptanceVerifier,
  m1bAcceptanceFileVerifier,
  m1bOperationalEvidenceFileVerifier,
  m1bAcceptanceContract,
  m1bAcceptanceTask,
  m1bAcceptancePostgres,
  humanCapitalPartnerFoundation,
  humanCapitalPartnerProducer,
  humanCapitalPartnerCli,
  webApp,
  tenantWebAssets,
  normalResponseCapture,
  normalResponseCapturePanel,
  denialResponseCapture,
  denialResponseCapturePanel,
  webIndex,
  humanCapitalPartnerWrapper,
  expiredOfferSetupProducer,
  expiredOfferSetupCli,
  expiredOfferPreparation,
  operationalBrowserJpeg,
  operationalBrowserMeasurement,
  operationalBrowserMeasurementConsole,
  operationalRuntimeRead,
  operationalEvidenceBuilder,
  liveNegativeProducer,
  liveNegativeResponseCapture,
  liveNegativeResponseCapturePanel,
  operationalNegativeProducer,
  liveNegativeCli,
  riskBoundaryResponseCapture,
  riskBoundaryResponseCapturePanel,
  riskBoundaryProducer,
  riskBoundaryWrapper
] = await Promise.all([
  source("deploy/local/stack.v1.json"),
  source("deploy/local/compose.yaml"),
  source("apps/private-pilot/src/local-worker.js"),
  source("apps/private-pilot/src/private-pilot-database.js"),
  source("docs/codex/tasks/LOCAL_STACK_001_LOCAL_MULTI_CONTAINER_PILOT.md"),
  source("deploy/local/README.md"),
  source("package.json"),
  source(".gitignore"),
  source(".dockerignore"),
  source("scripts/local-stack.mjs"),
  source("scripts/local-stack-acceptance.mjs"),
  source("scripts/local-agent.mjs"),
  source("deploy/local/private-pilot-profile.v1.json"),
  source("deploy/local/evidence-anchor.compose.yaml"),
  source("scripts/local-evidence-anchor.mjs"),
  source("scripts/local-release-identity.mjs"),
  source("scripts/verify-m1-b-acceptance-evidence.mjs"),
  source("scripts/m1-b-acceptance-evidence-files.mjs"),
  source("scripts/m1-b-operational-evidence-files.mjs"),
  source("packages/release-governance/src/m1-b-acceptance-evidence.js"),
  source("docs/codex/tasks/M1_B_P0_5_EXACT_COMMIT_ACCEPTANCE.md"),
  source("apps/private-pilot/src/m1-b-acceptance-postgres.js"),
  source("apps/private-pilot/src/m1-b-human-capital-partner-acceptance.js"),
  source("apps/private-pilot/src/m1-b-human-capital-partner-producer.js"),
  source("apps/private-pilot/src/m1-b-human-capital-partner-acceptance-cli.js"),
  source("apps/web/src/app.js"),
  source("apps/tenant-api/src/tenant-web-assets.js"),
  source("apps/web/src/m1-b-acceptance-normal-response-capture.js"),
  source("apps/web/src/m1-b-acceptance-normal-response-capture-panel.js"),
  source("apps/web/src/m1-b-acceptance-denial-response-capture.js"),
  source("apps/web/src/m1-b-acceptance-denial-response-capture-panel.js"),
  source("apps/web/src/index.html"),
  source("scripts/local-human-capital-partner-acceptance.mjs"),
  source("apps/private-pilot/src/m1-b-expired-offer-setup.js"),
  source("apps/private-pilot/src/m1-b-expired-offer-setup-cli.js"),
  source("apps/web/src/m1-b-expired-offer-preparation.js"),
  source("apps/private-pilot/src/m1-b-operational-browser-jpeg.js"),
  source("apps/private-pilot/src/m1-b-operational-browser-measurement.js"),
  source("apps/web/src/m1-b-operational-browser-measurement-console.js"),
  source("apps/private-pilot/src/m1-b-operational-runtime-read.js"),
  source("scripts/m1-b-operational-evidence-builder.mjs"),
  source("apps/private-pilot/src/m1-b-operational-live-negative-acceptance.js"),
  source("apps/web/src/m1-b-operational-live-negative-response-capture.js"),
  source("apps/web/src/m1-b-operational-live-negative-response-capture-panel.js"),
  source("apps/private-pilot/src/m1-b-operational-negative-acceptance.js"),
  source("apps/private-pilot/src/m1-b-operational-live-negative-cli.js"),
  source("apps/web/src/m1-b-risk-boundary-response-capture.js"),
  source("apps/web/src/m1-b-risk-boundary-response-capture-panel.js"),
  source("apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js"),
  source("scripts/local-risk-mfa-boundary-acceptance.mjs")
]);

const stack = parseLocalStack(stackText);
const manifest = JSON.parse(packageText);

assert.equal(stack.launchBlocked, true);
assert.equal(
  stack.virtualization.portForwarding,
  "lima_hostagent_loopback_only"
);
assert.equal(stack.database.macHostPublished, false);
assert.equal(stack.pilot.hostBinding, "127.0.0.1");
assert.equal(stack.pilot.processLocalCanonicalStateAllowed, false);
assert.equal(Object.values(stack.authority).every((value) => value === false), true);
assert.match(compose, new RegExp(stack.database.image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(compose, /127\.0\.0\.2:55432:5432/);
assert.doesNotMatch(compose, /0\.0\.0\.0:/);
assert.match(compose, /network_mode: host/);
assert.match(compose, /read_only: true/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /cap_drop:\n\s+- ALL/);
assert.match(compose, /ipo-one-local-postgres-data/);
assert.match(worker, /I_UNDERSTAND_SYNTHETIC_OUTBOX_ONLY/);
assert.match(worker, /claimOutboxBatch/);
assert.match(worker, /PostgresReconciliationService/);
assert.match(worker, /PostgresCreditOutcomeMaterializer/);
assert.match(
  privatePilotDatabase,
  /credit_passport_artifacts,\s+credit_outcomes,\s+tenant_command_pauses/
);
assert.match(privatePilotDatabase, /seedCapitalPartnerProfile/);
assert.match(compose, /IPO_ONE_PILOT_PROFILE_FILE: \/app\/deploy\/local\/private-pilot-profile\.v1\.json/g);
assert.match(
  compose,
  /BUILD_REVISION: \$\{IPO_ONE_M1_B_RELEASE_SHA:-local-stack\}/
);
const profile = JSON.parse(localProfile);
assert.equal(profile.mode, "local_no_funds");
assert.equal(profile.syntheticDataOnly, true);
assert.equal(profile.realFundsEnabled, false);
assert.equal(profile.remoteAccessEnabled, false);
assert.deepEqual(Object.keys(profile.identities).sort(), [
  "agent",
  "borrower",
  "capitalPartner",
  "controller",
  "risk"
]);
assert.match(task, /Status: Implemented locally/);
assert.match(readme, /pnpm run local:up/);
assert.match(gitignore, /^\.ipo-one\/$/m);
assert.match(
  dockerignore,
  /^!deploy\/local\/private-pilot-profile\.v1\.json$/m
);
assert.match(dockerignore, /^\.ipo-one$/m);
assert.match(localStackScript, /hostAgentPID/);
assert.match(localStackScript, /limaHostAgentOwnsProductPorts/);
assert.match(localStackScript, /lsof/);
assert.match(localStackScript, /ipo_one_authentication_options\.v1/);
assert.match(localStackScript, /authentication-server\.v1\.json/);
assert.match(localStackScript, /agent-key\.v1\.json/);
assert.match(localStackScript, /assertExactLocalReleaseSource/);
assert.match(localStackScript, /IPO_ONE_M1_B_RELEASE_SHA=/);
assert.match(localStackScript, /IPO_ONE_M1_B_PORT_BASE=/);
assert.match(localStackScript, /IPO_ONE_M1_B_BUILD_CONTEXT=/);
assert.match(localStackScript, /prepareLocalReleaseBuildContext/);
assert.match(localReleaseIdentity, /requested SHA/);
assert.match(localReleaseIdentity, /requires a clean source worktree/);
assert.match(localAcceptance, /authenticationOptions\.profile,\s*"local_no_funds"/);
assert.match(localAcceptance, /authenticationOptions\.sessionActive,\s*false/);
assert.match(localAcceptance, /authenticationOptions\.walletAuthentication,\s*true/);
assert.match(localAcceptance, /createLocalAgentProof/);
assert.match(localAcceptance, /org\.opencontainers\.image\.revision/);
assert.match(localAcceptance, /releaseIdentity\.exactCandidate/);
assert.match(localAcceptance, /m1_b_local_release_identity\.v1/);
assert.match(localAcceptance, /local-release-identity\.json/);
assert.match(localAcceptance, /P0-5 Evidence output must be one real directory/);
assert.ok(
  localAcceptance.indexOf("assert.equal(pendingOutbox, 0)") <
    localAcceptance.indexOf("schemaVersion: \"m1_b_local_release_identity.v1\""),
  "exact release identity must be published only after all live acceptance assertions pass"
);
assert.match(m1bAcceptanceVerifier, /verifyM1BAcceptanceEvidence/);
assert.match(m1bAcceptanceVerifier, /--evidence-root/);
assert.match(m1bAcceptanceVerifier, /verifyM1BArtifactFiles/);
assert.match(m1bAcceptanceVerifier, /verifyM1BCriticalArtifactContents/);
assert.match(m1bAcceptanceVerifier, /verifyM1BOperationalArtifactContents/);
assert.match(m1bAcceptanceFileVerifier, /createReadStream/);
assert.match(m1bAcceptanceFileVerifier, /local_agent_mcp_transport_receipt\.v1/);
assert.match(m1bAcceptanceFileVerifier, /local_agent_reference_recovery_receipt\.v1/);
assert.match(m1bAcceptanceFileVerifier, /m1_b_risk_mfa_boundary_receipt\.v2/);
assert.match(m1bAcceptanceFileVerifier, /--untracked-files=no/);
assert.match(
  m1bOperationalEvidenceFileVerifier,
  /createM1BOperationalExactSourceRunFromTap/
);
assert.match(
  m1bOperationalEvidenceFileVerifier,
  /m1_b_operational_exact_source_negative_run_receipt\.v2/
);
assert.match(
  m1bOperationalEvidenceFileVerifier,
  /validateM1BExpiredOfferSetupReceipt/
);
assert.match(expiredOfferSetupProducer, /createM1BExpiredOfferCriticalBinding/);
assert.match(expiredOfferSetupProducer, /validateM1BExpiredOfferSetupReceipt/);
assert.match(expiredOfferSetupCli, /produceM1BExpiredOfferSetupReceipt/);
assert.match(expiredOfferSetupCli, /m1_b_acceptance_normal_response_arm\.v1/);
assert.doesNotMatch(expiredOfferSetupCli, /browserExpression|new Function|\beval\s*\(/);
assert.match(expiredOfferPreparation, /const VALIDITY_MS = 105_000/);
assert.match(expiredOfferPreparation, /credentials: "omit"/);
assert.match(expiredOfferPreparation, /cache: "no-store"/);
assert.match(expiredOfferPreparation, /consumeForSubmission/);
assert.doesNotMatch(
  expiredOfferPreparation,
  /browserExpression|new Function|\beval\s*\(/
);
assert.match(
  operationalBrowserMeasurement,
  /m1_b_operational_browser_measurement_prompt\.v1/
);
assert.match(
  operationalBrowserMeasurement,
  /M1_B_OPERATIONAL_BROWSER_CONTROL_BASE/
);
assert.match(operationalBrowserMeasurementConsole, /driver: "chrome_control"/);
assert.doesNotMatch(
  operationalBrowserMeasurement,
  /browserExpression|new Function|\beval\s*\(/
);
assert.match(
  operationalBrowserMeasurementConsole,
  /visible_loopback_measurement_console/
);
assert.match(
  operationalBrowserMeasurementConsole,
  /m1_b_operational_browser_context_claim\.v1/
);
assert.match(
  operationalBrowserMeasurementConsole,
  /createdVia !== "chrome_control_tabs_new"/
);
assert.match(
  operationalBrowserMeasurementConsole,
  /isolatedStorageClaimed !== false/
);
assert.match(operationalBrowserMeasurementConsole, /state = "capture_required"/);
assert.doesNotMatch(
  operationalBrowserMeasurementConsole,
  /browserExpression|new Function|\beval\s*\(/
);
assert.match(
  operationalBrowserMeasurement,
  /validateM1BOperationalBrowserJpeg/
);
assert.match(operationalBrowserJpeg, /JPEG_QUALITY_80_QUANTIZATION_TABLES/);
assert.match(operationalBrowserJpeg, /decodedChallengeHash/);
assert.match(
  operationalBrowserMeasurementConsole,
  /M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS/
);
assert.match(operationalBrowserMeasurement, /chrome_jpeg_quality_80_baseline_420/);
assert.match(operationalBrowserMeasurement, /image\/jpeg/);
assert.match(
  operationalBrowserMeasurementConsole,
  /external_chrome_control_jpeg_quality_80/
);
assert.match(m1bAcceptanceTask, /m1-b-jpeg-canary-<exact-clean-head>/);
assert.doesNotMatch(m1bAcceptanceTask, /\bPNG\b|image\/png|\.png\b/);
assert.match(
  operationalRuntimeRead,
  /m1_b_operational_browser_app_role_read\.v1/
);
assert.match(operationalRuntimeRead, /result\.rowCount !== 2/);
assert.match(
  operationalRuntimeRead,
  /matching_invitation_registration_count/
);
assert.match(
  operationalRuntimeRead,
  /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/
);
assert.match(operationalEvidenceBuilder, /runM1BOperationalEvidenceBuilder/);
assert.match(
  operationalEvidenceBuilder,
  /collectM1BOperationalBrowserMeasurements/
);
assert.match(operationalEvidenceBuilder, /runtimeBrowserAppRoleRead/);
for (const mode of [
  "restart-begin",
  "restart-complete",
  "restart-complete-only",
  "expired-offer-setup",
  "negative-run",
  "live-negative",
  "collect-pre-risk",
  "finalize"
]) assert.match(operationalEvidenceBuilder, new RegExp(`"${mode}"`));
assert.match(liveNegativeProducer, /captureM1BOperationalLiveDenialBoundary/);
assert.match(liveNegativeProducer, /m1_b_operational_live_negative_arm\.v1/);
assert.match(liveNegativeProducer, /armToken: JSON\.stringify\(armToken\)/);
assert.doesNotMatch(
  liveNegativeProducer,
  /browserExpression|new Function|\beval\s*\(/
);
assert.match(liveNegativeResponseCapture, /deriveM1BOperationalLiveNegativeIdempotencyKey/);
assert.match(liveNegativeResponseCapture, /pilotReadOwnObligation/);
assert.match(liveNegativeResponseCapture, /responseRequestIdHeader === requestId/);
assert.match(liveNegativeResponseCapture, /rawSignaturePersisted/);
assert.doesNotMatch(liveNegativeResponseCapture, /\bfetch\s*\(/);
assert.match(liveNegativeResponseCapturePanel, /performDenial\(attempt\)/);
assert.match(liveNegativeResponseCapturePanel, /typeof clipboard\?\.writeText/);
assert.doesNotMatch(liveNegativeResponseCapturePanel, /\bfetch\s*\(/);
assert.match(
  riskBoundaryResponseCapture,
  /m1_b_risk_boundary_response_arm\.v1/
);
assert.match(
  riskBoundaryResponseCapture,
  /deriveM1BRiskBoundaryFreezeIdempotencyKey/
);
assert.match(
  riskBoundaryResponseCapture,
  /responseRequestIdHeader === requestId/
);
assert.doesNotMatch(
  riskBoundaryResponseCapture,
  /\bfetch\s*\(|navigator\.clipboard|localStorage|sessionStorage/
);
assert.match(riskBoundaryResponseCapturePanel, /performBoundary\(attempt\)/);
assert.doesNotMatch(
  riskBoundaryResponseCapturePanel,
  /\bfetch\s*\(|navigator\.clipboard|localStorage|sessionStorage/
);
assert.match(
  operationalNegativeProducer,
  /export async function captureM1BOperationalLiveNegativeProof/
);
assert.match(liveNegativeCli, /captureM1BOperationalLiveNegativeProof/);
assert.match(m1bAcceptanceVerifier, /verifyM1BHostedCapabilityDocument/);
assert.match(m1bAcceptanceVerifier, /verifyM1BHostedReadinessDocument/);
assert.match(m1bAcceptanceContract, /fixtureHost/);
assert.match(m1bAcceptanceContract, /browserStorageAuthority/);
assert.match(m1bAcceptanceContract, /operator_confirmed_invited_wallet_siwe/);
assert.match(m1bAcceptanceContract, /ipo\.one\.m1-b-p0-5-acceptance-evidence\/v2/);
assert.match(m1bAcceptanceContract, /m1_b_risk_boundary_linkage\.v1/);
assert.match(m1bAcceptanceContract, /M1_C_L2_CLOSED_NO_FUNDS/);
assert.match(m1bAcceptanceContract, /verifyM1BAcceptanceEvidenceV1Historical/);
assert.match(m1bAcceptanceTask, /No automated wallet signing/);
assert.match(riskBoundaryProducer, /exact_source_authorization_service/);
assert.match(riskBoundaryProducer, /local_exact_commit_post_restart/);
assert.match(m1bAcceptancePostgres, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
assert.match(m1bAcceptancePostgres, /setTenantTransactionContext/);
assert.match(m1bAcceptancePostgres, /assertTenantDatabaseRole/);
assert.match(m1bAcceptancePostgres, /ipo_one_private_pilot_app/);
assert.match(riskBoundaryProducer, /withM1BAcceptanceTenantRead as withTenantRead/);
assert.match(riskBoundaryProducer, /createM1BAcceptanceAppPool/);
assert.match(riskBoundaryProducer, /M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS/);
assert.doesNotMatch(riskBoundaryProducer, /\bpool\.query\s*\(/);
assert.doesNotMatch(riskBoundaryProducer, /SELECT\s+\*/i);
assert.doesNotMatch(
  riskBoundaryProducer,
  /\b(session_ref_hash|csrf_ref_hash|address_ciphertext|message_ciphertext|signature_hash)\b/i
);
assert.match(
  riskBoundaryProducer,
  /audit\.token_jti_hash === session\.token_jti_ref_hash/
);
assert.match(
  riskBoundaryProducer,
  /audit\.correlation_id === request\.correlationId/
);
assert.match(m1bAcceptancePostgres, /exactReadOnlyMount/);
assert.match(humanCapitalPartnerFoundation, /captureM1BCapitalPartnerDenialBoundary/);
assert.match(humanCapitalPartnerFoundation, /readM1BHumanEconomicReadBack/);
assert.match(humanCapitalPartnerProducer, /produceM1BHumanCriticalReceipt/);
assert.match(humanCapitalPartnerProducer, /produceM1BCapitalPartnerCriticalReceipt/);
assert.match(humanCapitalPartnerCli, /m1_b_acceptance_operator_response\.v1/);
assert.match(humanCapitalPartnerCli, /m1_b_acceptance_normal_response_arm\.v1/);
assert.match(humanCapitalPartnerCli, /m1_b_acceptance_denial_response_arm\.v1/);
assert.match(humanCapitalPartnerCli, /armChallenge: armToken\.challenge/);
assert.match(humanCapitalPartnerCli, /denial_response_ready/);
assert.match(humanCapitalPartnerCli, /pg_postmaster_start_time/);
assert.doesNotMatch(humanCapitalPartnerCli, /browserExpression|new Function|\beval\s*\(/);
assert.doesNotMatch(humanCapitalPartnerCli, /document\.cookie|localStorage|sessionStorage/);
assert.match(normalResponseCapture, /tenant_protocol_result\.v1/);
assert.match(normalResponseCapture, /result\.response/);
assert.match(normalResponseCapture, /armChallenge: active\.token\.challenge/);
assert.match(normalResponseCapture, /activeExpired/);
assert.match(normalResponseCapture, /readyExpired/);
assert.match(normalResponseCapture, /responseRequestIdHeader !== requestId/);
assert.match(normalResponseCapture, /acquireRequestPermit\(operationId\)/);
assert.match(normalResponseCapture, /armIssuedAt: active\.token\.issuedAt/);
assert.match(
  normalResponseCapture,
  /lima_exact_pilot_vm_system_clock/
);
assert.match(humanCapitalPartnerProducer, /normalResponseChronology/);
assert.doesNotMatch(normalResponseCapture, /\bfetch\s*\(/);
assert.match(normalResponseCapturePanel, /performRead\(operationId\)/);
assert.match(normalResponseCapturePanel, /clipboard\.writeText/);
assert.match(normalResponseCapturePanel, /typeof clipboard\?\.writeText/);
assert.doesNotMatch(normalResponseCapturePanel, /\bfetch\s*\(/);
assert.match(denialResponseCapture, /authorization_denied/);
assert.match(denialResponseCapture, /deriveM1BAcceptanceDenialIdempotencyKey/);
assert.match(denialResponseCapture, /responseRequestIdHeader === requestId/);
assert.match(denialResponseCapture, /rawSignaturePersisted/);
assert.doesNotMatch(denialResponseCapture, /\bfetch\s*\(/);
assert.match(denialResponseCapturePanel, /performDenial\(attempt\)/);
assert.match(denialResponseCapturePanel, /typeof clipboard\?\.writeText/);
assert.doesNotMatch(denialResponseCapturePanel, /\bfetch\s*\(/);
assert.match(webApp, /observeTenantApiResult/);
assert.match(webApp, /performM1BAcceptanceNormalResponseRead/);
assert.match(webApp, /performM1BAcceptanceDenialResponse/);
assert.match(webApp, /m1bExpectedDenial/);
assert.match(webApp, /m1bExpectedProblem/);
assert.match(webApp, /cross_role_private_read/);
assert.match(webApp, /performM1BOperationalLiveNegativeResponse/);
assert.match(webApp, /performM1BRiskBoundary/);
assert.match(webApp, /m1bRiskBoundaryExpectedDenial/);
assert.match(webApp, /isExactM1BRiskBoundaryDeniedTransport/);
assert.match(webApp, /createM1BExpiredOfferPreparation/);
assert.match(webApp, /consumeForSubmission/);
assert.match(webApp, /normalCaptureResponseIdRejected/);
assert.match(webApp, /m1bExactResponseRequestId/);
assert.match(webApp, /validateM1BOperationalBrowserResponseRequestId/);
assert.match(webApp, /const responseRequestIdHeader = response\.headers\.get/);
assert.match(webApp, /typeof navigator\.clipboard\?\.writeText/);
assert.match(webApp, /installM1BOperationalBrowserMeasurementConsole/);
assert.match(webApp, /canonicalM1BOperationalBrowserJson/);
assert.match(webApp, /idempotent: false/);
assert.match(webApp, /includeTransportMeta: true/);
assert.match(
  tenantWebAssets,
  /"\/m1-b-operational-browser-measurement-console\.js"/
);
for (const assetPath of [
  "/m1-b-acceptance-normal-response-capture.js",
  "/m1-b-expired-offer-preparation.js",
  "/m1-b-operational-live-negative-response-capture.js",
  "/m1-b-operational-live-negative-response-capture-panel.js",
  "/m1-b-risk-boundary-response-capture.js",
  "/m1-b-risk-boundary-response-capture-panel.js"
]) {
  assert.match(
    tenantWebAssets,
    new RegExp(`"${assetPath.replaceAll("/", "\\/").replaceAll(".", "\\.")}"`)
  );
}
assert.match(webIndex, /id="m1BAcceptanceCapturePanel"/);
assert.match(webIndex, /id="m1BAcceptanceArmToken"/);
assert.match(webIndex, /id="m1BAcceptanceCopyResponseBtn"/);
assert.match(webIndex, /id="m1BAcceptanceDenialArmToken"/);
assert.match(webIndex, /id="m1BAcceptanceRunDenialBtn"/);
assert.match(webIndex, /id="m1BAcceptanceCopyDenialBtn"/);
for (const controlId of [
  "m1BExpiredOfferPreparationControls",
  "m1BExpiredOfferPrepareBtn",
  "m1BExpiredOfferPrepareStatus",
  "m1BOperationalLiveNegativeControls",
  "m1BOperationalLiveNegativeArmToken",
  "m1BOperationalLiveNegativeArmBtn",
  "m1BOperationalLiveNegativeRunBtn",
  "m1BOperationalLiveNegativeCopyBtn",
  "m1BOperationalLiveNegativeStatus",
  "m1BRiskBoundaryControls",
  "m1BRiskBoundaryArmToken",
  "m1BRiskBoundaryArmBtn",
  "m1BRiskBoundaryRunBtn",
  "m1BRiskBoundaryStatus"
]) {
  assert.match(webIndex, new RegExp(`id="${controlId}"`));
}
for (const controlId of [
  "m1bOperationalMeasurementConsole",
  "m1bOperationalMeasurementPromptInput",
  "m1bOperationalMeasurementLoadBtn",
  "m1bOperationalMeasurementContextClaimInput",
  "m1bOperationalMeasurementLoadContextClaimBtn",
  "m1bOperationalMeasurementPreflightBtn",
  "m1bOperationalMeasurementRunBtn",
  "m1bOperationalMeasurementCaptureAcknowledgementBtn",
  "m1bOperationalMeasurementCopyBtn",
  "m1bOperationalMeasurementResetBtn",
  "m1bOperationalMeasurementDesktopWindowBtn",
  "m1bOperationalMeasurementMobileWindowBtn",
  "m1bOperationalMeasurementResponseOutput",
  "m1bOperationalMeasurementStatus",
  "m1bOperationalMeasurementSummary"
]) {
  assert.match(webIndex, new RegExp(`id="${controlId}"`));
}
assert.doesNotMatch(
  operationalEvidenceBuilder,
  /browserExpression|new Function|\beval\s*\(/
);
assert.match(riskBoundaryProducer, /m1_b_risk_boundary_response_arm\.v1/);
assert.match(riskBoundaryProducer, /JSON\.stringify\(armToken\)/);
assert.doesNotMatch(
  riskBoundaryProducer,
  /createM1BRiskBrowserCeremonyScript|browserExpression|\bfetch\s*\(/
);
assert.match(humanCapitalPartnerWrapper, /assertExactLocalReleaseSource/);
assert.match(humanCapitalPartnerWrapper, /after-restart\.acceptance\.json/);
assert.match(humanCapitalPartnerWrapper, /after-restart\.phase-receipt\.v2\.json/);
assert.match(humanCapitalPartnerWrapper, /resolveHumanCapitalPartnerRuntimeImageIdentity/);
assert.match(humanCapitalPartnerWrapper, /taggedImageId/);
assert.doesNotMatch(humanCapitalPartnerWrapper, /compose\(baseArgs, \["build", "pilot"\]/);
assert.match(humanCapitalPartnerWrapper, /serviceIdentities/);
assert.match(humanCapitalPartnerWrapper, /stdio: \[\"inherit\", \"pipe\", \"inherit\"\]/);
assert.match(humanCapitalPartnerWrapper, /flag: \"wx\", mode: 0o600/);
assert.doesNotMatch(humanCapitalPartnerWrapper, /raw-response|response-capture\.json/);
assert.doesNotMatch(
  riskBoundaryProducer,
  /loadOrCreatePrivatePilotDatabaseSecret/
);
assert.match(riskBoundaryWrapper, /assertExactLocalReleaseSource/);
assert.match(riskBoundaryWrapper, /after-restart\.acceptance\.json/);
assert.match(riskBoundaryWrapper, /--test-name-pattern/);
assert.match(riskBoundaryWrapper, /spawnSync\(\s*process\.execPath/);
assert.match(riskBoundaryWrapper, /IPO_ONE_M1_B_AUTH_SOURCE_DIGESTS_JSON/);
assert.match(riskBoundaryWrapper, /org\.opencontainers\.image\.revision/);
assert.doesNotMatch(riskBoundaryWrapper, /compose\(baseArgs, \["build", "pilot"\]/);
assert.match(riskBoundaryWrapper, /resolveRiskRuntimeImageIdentity/);
assert.match(riskBoundaryWrapper, /after-restart\.phase-receipt\.v2\.json/);
assert.match(riskBoundaryWrapper, /taggedImageId/);
assert.match(riskBoundaryWrapper, /assertReviewedDatabaseSecretMountSource/);
assert.match(riskBoundaryWrapper, /flag: "wx", mode: 0o600/);
assert.match(riskBoundaryWrapper, /await link\(temporaryPath, path\)/);
assert.match(riskBoundaryWrapper, /will not be overwritten/);
assert.match(localAgent, /docker",\s*"compose"/);
assert.match(localAgent, /--no-deps/);
assert.match(localAgent, /CONTAINER_INPUT/);
assert.doesNotMatch(localAgent, /IPO_ONE_LOCAL_POSTGRES_PASSWORD/);
assert.equal(manifest.scripts["local:up"], "node scripts/local-stack.mjs up");
assert.equal(
  manifest.scripts["local:auth:init"],
  "node scripts/local-stack.mjs auth-init"
);
assert.equal(
  manifest.scripts["local:acceptance"],
  "node scripts/local-stack-acceptance.mjs"
);
assert.equal(
  manifest.scripts["local:agent:prove"],
  "node scripts/local-agent.mjs prove"
);
assert.equal(manifest.scripts["local:agent"], "node scripts/local-agent.mjs run");
assert.equal(
  manifest.scripts["local:risk:mfa-boundary"],
  "node scripts/local-risk-mfa-boundary-acceptance.mjs"
);
assert.equal(
  manifest.scripts["acceptance:m1-b:human-capital-partner"],
  "node scripts/local-human-capital-partner-acceptance.mjs"
);
assert.equal(
  manifest.scripts["acceptance:m1-b:operational"],
  "node scripts/m1-b-operational-evidence-builder.mjs"
);
assert.equal(
  manifest.scripts["local:evidence-attestor:init"],
  "node scripts/local-evidence-anchor.mjs init"
);
assert.equal(
  manifest.scripts["local:evidence-anchor:enable"],
  "node scripts/local-evidence-anchor.mjs enable"
);
assert.match(
  evidenceAnchorCompose,
  /0x78ba26d4a9211e8d4b0158c9e5443305278c1df0/
);
assert.match(
  evidenceAnchorCompose,
  /I_UNDERSTAND_BASE_SEPOLIA_ZERO_VALUE_HASH_ANCHORS/
);
assert.match(
  evidenceAnchorCompose,
  /evidence-attestor\.key:\/private\/tmp\/ipo-one-chain-001f\/evidence-attestor\.key:ro/
);
assert.match(
  evidenceAnchorCompose,
  /IPO_ONE_LOCAL_WORKER_INTERVAL_MS: "1000"/
);
assert.match(
  evidenceAnchorCompose,
  /IPO_ONE_EVIDENCE_ANCHOR_PROVIDER_SLOT: secondary/
);
assert.match(
  worker,
  /createEvidenceAnchorNonceReader\(\{\s+contractAddress: evidenceAnchorContractAddress,\s+providerSlot: evidenceAnchorProviderSlot/
);
assert.match(
  worker,
  /createEvidenceAnchorObserver\(\{\s+contractAddress: evidenceAnchorContractAddress,\s+providerSlot: evidenceAnchorProviderSlot/
);
assert.match(localEvidenceAnchor, /IPO_ONE_APPROVE_LOCAL_EVIDENCE_ATTESTOR/);
assert.match(localEvidenceAnchor, /IPO_ONE_APPROVE_LOCAL_EVIDENCE_ANCHOR_WRITES/);
assert.match(localEvidenceAnchor, /MAX_BALANCE_WEI = 10_000_000_000_000_000n/);
assert.doesNotMatch(localEvidenceAnchor, /privateKey.*process\.stdout/);
assert.doesNotMatch(evidenceAnchorCompose, /mainnet|PRIVATE_KEY|MNEMONIC/i);

console.log(
  "LOCAL-STACK-001 static contract passed: rootless Lima, pinned PostgreSQL 17, " +
    "verified Lima host-agent loopback forwarding, four workspaces, separate default-unsigned worker, " +
    "opt-in capped CHAIN-001F attestor boundary, persistent state, and no cloud/real-funds authority."
);
