import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  CreditEventType,
  createCapitalPartnerProfile,
  createCreditEvent,
  createHumanIdentityReference,
  createProviderIntentDelivery,
  createSignedProviderSandboxCallback,
  hashId,
  replayAgentCreditLineProjection,
  verifyCreditLineProjection
} from "../../../packages/domain/src/index.js";
import {
  TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
  assertDualNativeCreditOfferParity,
  isHumanCreditOfferWorkflowReceipt
} from "../../../packages/api-contract/src/index.js";
import {
  createAgentHandoffCallPlan,
  createAgentMcpHost,
  runAgentCreditOfferWorkflow
} from "../../../apps/agent-mcp/src/index.js";
import {
  createApplicationReadyAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "../../../apps/web/src/agent-handoff-manifest.js";
import { createHumanCreditOfferWorkflowReceipt } from "../../../apps/web/src/human-credit-offer-workflow-receipt.js";
import { ActorType } from "../../authentication/src/index.js";
import {
  PilotCapability,
  PostgresAuthorizationDirectory,
  RoleBundle
} from "../../authorization/src/index.js";
import {
  PostgresCreditOutcomeMaterializer
} from "../../credit-learning/src/index.js";
import {
  PostgresTenantCommandPauseStore
} from "../../operations-control/src/index.js";
import { createAuthorizationHarness } from "../../authorization/test/support/authorization-fixture.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  PostgresReconciliationService,
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import {
  AgentTenantCommandClient,
  AuditorTenantQueryClient,
  HumanTenantCommandClient,
  OperatorTenantCommandClient,
  ProviderTenantCommandClient,
  RiskTenantQueryClient,
  SystemWorkerTenantCommandClient,
  TenantCommandGateway,
  TenantCommandHandlerRegistry,
  createPostgresTenantLivePolicyAdapter,
  createTenantFoundationHandlers
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const RUN_ID = randomBytes(5).toString("hex");
const IDENTITY_NOW = new Date(Date.now() - 60_000);
const TENANT_ONE = `tenant_gateway_one_${RUN_ID}`;
const TENANT_TWO = `tenant_gateway_two_${RUN_ID}`;
const APP_ROLE = `ipo_gateway_${RUN_ID}`;
const TENANT_ONE_RISK_PORTFOLIO = `risk_portfolio_gateway_one_${RUN_ID}`;
const TENANT_TWO_RISK_PORTFOLIO = `risk_portfolio_gateway_two_${RUN_ID}`;
const TENANT_ONE_SERVICING_QUEUE = `servicing_queue_gateway_one_${RUN_ID}`;
const TENANT_TWO_SERVICING_QUEUE = `servicing_queue_gateway_two_${RUN_ID}`;
const PROVIDER_CALLBACK_KEYS = generateKeyPairSync("ed25519");

async function withTenantTransaction(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function seedTenant(pool, tenantId) {
  await pool.query(
    `INSERT INTO tenants(
       id, tenant_hash, organization_ref, display_name, status,
       pilot_jurisdiction, legal_retention_owner_ref, created_at,
       updated_at, schema_version
     ) VALUES ($1, $2, $3, $4, 'active', 'US', $5, $6, $6, 'tenant.v1')`,
    [
      tenantId,
      hashId("gateway_test_tenant", tenantId),
      `org:${tenantId}`,
      `Gateway Test ${tenantId}`,
      `org:${tenantId}:retention`,
      IDENTITY_NOW
    ]
  );
}

async function seedIdentity(pool, tenantId, identity, { controllerActorId } = {}) {
  const { authenticationContext: context, membership } = identity;
  await pool.query(
    `INSERT INTO actors(
       id, actor_hash, actor_type, status, created_at, updated_at, schema_version
     ) VALUES ($1, $2, $3, 'active', $4, $4, 'actor.v1')`,
    [context.actorId, hashId("gateway_test_actor", context.actorId), context.actorType, IDENTITY_NOW]
  );
  const seedContext = createTenantSecurityContext({
    tenantId,
    actorId: context.actorId,
    policyVersion: context.policyVersion,
    source: "local_test"
  });
  await withTenantTransaction(pool, seedContext, (client) => client.query(
    `INSERT INTO memberships(
       id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
       client_ids, policy_version, controller_actor_id, status, valid_from, expires_at,
       created_at, updated_at, version, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb,
       $7::jsonb, $8, $9, 'active', $10, NULL,
       $10, $10, 1, 'membership.v1'
     )`,
    [
      membership.membershipId,
      hashId("gateway_test_membership", membership.membershipId),
      tenantId,
      context.actorId,
      membership.roleBundle,
      JSON.stringify(membership.capabilities),
      JSON.stringify(membership.clientIds),
      membership.policyVersion,
      controllerActorId ?? null,
      IDENTITY_NOW
    ]
  ));
}

async function seedRiskPortfolioResource(pool, tenantId, actorId, portfolioId) {
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  await withTenantTransaction(pool, context, (client) => client.query(
    `INSERT INTO authorization_resources(
       tenant_id, resource_type, resource_id, status, version,
       created_at, updated_at, schema_version
     ) VALUES ($1, 'risk_portfolio', $2, 'active', 1, $3, $3, 'authorization_resource.v1')`,
    [tenantId, portfolioId, IDENTITY_NOW]
  ));
}

async function seedServicingQueueResource(pool, tenantId, actorId, queueId) {
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  await withTenantTransaction(pool, context, (client) => client.query(
    `INSERT INTO authorization_resources(
       tenant_id, resource_type, resource_id, status, version,
       created_at, updated_at, schema_version
     ) VALUES ($1, 'servicing_queue', $2, 'active', 1, $3, $3, 'authorization_resource.v1')`,
    [tenantId, queueId, IDENTITY_NOW]
  ));
}

async function seedCapitalPartnerProfile(pool, tenantId, identity) {
  const actorId = identity.authenticationContext.actorId;
  const profile = createCapitalPartnerProfile({
    capitalPartnerId: `capital_partner_gateway_${RUN_ID}`,
    organizationRef: `org:capital-partner-gateway:${RUN_ID}`,
    displayName: "Gateway Synthetic Capital Partner",
    operatorActorId: actorId,
    tenantId,
    now: IDENTITY_NOW
  });
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: identity.authenticationContext.policyVersion,
    source: "local_test"
  });
  await withTenantTransaction(pool, context, async (client) => {
    await client.query(
      `INSERT INTO capital_partner_profiles(
         id, tenant_id, profile_hash, organization_ref, display_name,
         operator_actor_id, status, invitation_only, same_tenant_only,
         sandbox_only, production_funds_authority, created_at, updated_at,
         schema_version
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, 'active', TRUE, TRUE,
         TRUE, FALSE, $7, $7,
         'capital_partner_profile.v1'
       )`,
      [
        profile.capitalPartnerId,
        tenantId,
        profile.profileHash,
        profile.organizationRef,
        profile.displayName,
        actorId,
        IDENTITY_NOW
      ]
    );
    await client.query(
      `INSERT INTO authorization_resources(
         tenant_id, resource_type, resource_id, status, version,
         created_at, updated_at, schema_version
       ) VALUES (
         $1, 'capital_partner_profile', $2, 'active', 1,
         $3, $3, 'authorization_resource.v1'
       )`,
      [tenantId, profile.capitalPartnerId, IDENTITY_NOW]
    );
    await client.query(
      `INSERT INTO authorization_resource_bindings(
         tenant_id, resource_type, resource_id, actor_id, relationship,
         status, version, created_at, updated_at, schema_version
       ) VALUES (
         $1, 'capital_partner_profile', $2, $3, 'owner',
         'active', 1, $4, $4, 'authorization_resource_binding.v1'
       )`,
      [tenantId, profile.capitalPartnerId, actorId, IDENTITY_NOW]
    );
  });
  return profile;
}

async function seedRiskPortfolioExposure(pool, {
  tenantId,
  actorId,
  subjectId,
  principalId
}) {
  const ids = {
    mandateId: `mandate_risk_portfolio_${RUN_ID}`,
    providerId: `provider_risk_portfolio_${RUN_ID}`,
    spendPolicyId: `spend_policy_risk_portfolio_${RUN_ID}`,
    creditLineId: `credit_line_risk_portfolio_${RUN_ID}`,
    obligationId: `obligation_risk_portfolio_${RUN_ID}`,
    assetId: "urn:ipo-one:sandbox-asset:risk-usd-cent"
  };
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  await withTenantTransaction(pool, context, async (client) => {
    await client.query(
      `INSERT INTO mandates(
         tenant_id, id, mandate_hash, principal_id, subject_id, capabilities,
         allowed_provider_ids, allowed_categories, asset_ids,
         per_action_limit_minor, aggregate_limit_minor, utilized_minor,
         valid_from, expires_at, nonce, terms_ref, status,
         created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, '["request_credit"]'::jsonb,
         '[]'::jsonb, '[]'::jsonb, $6::jsonb,
         1000, 1000, 250, $7, $8, $9, $10, 'active', $7, $7, 'mandate.v2'
       )`,
      [
        tenantId,
        ids.mandateId,
        `mandate_risk_portfolio_hash_${RUN_ID}`,
        principalId,
        subjectId,
        JSON.stringify([ids.assetId]),
        IDENTITY_NOW,
        new Date(IDENTITY_NOW.getTime() + 86_400_000),
        `risk-portfolio-nonce-${RUN_ID}`,
        `urn:ipo.one:test:risk-portfolio:${RUN_ID}`
      ]
    );
    await client.query(
      `INSERT INTO providers(
         tenant_id, id, provider_hash, name, settlement_account_ref,
         status, risk_tier, created_at, schema_version
       ) VALUES ($1, $2, $3, 'Risk Portfolio Fixture', $4, 'active', 'tier_1', $5, 'provider.v1')`,
      [
        tenantId,
        ids.providerId,
        `provider_risk_portfolio_hash_${RUN_ID}`,
        `account:fixture:${RUN_ID}`,
        IDENTITY_NOW
      ]
    );
    await client.query(
      `INSERT INTO spend_policies(
         tenant_id, id, policy_hash, subject_id, provider_id, asset_id,
         per_tx_limit_minor, daily_limit_minor, obligation_cap_minor,
         status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 1000, 1000, 1000, 'active', $7)`,
      [
        tenantId,
        ids.spendPolicyId,
        `spend_policy_risk_portfolio_hash_${RUN_ID}`,
        subjectId,
        ids.providerId,
        ids.assetId,
        IDENTITY_NOW
      ]
    );
    await client.query(
      `INSERT INTO credit_lines(
         tenant_id, id, subject_id, mandate_id, asset_id, limit_minor,
         utilized_minor, status, risk_snapshot_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, 1000, 250, 'approved', NULL, $6)`,
      [tenantId, ids.creditLineId, subjectId, ids.mandateId, ids.assetId, IDENTITY_NOW]
    );
    await client.query(
      `INSERT INTO obligations(
         tenant_id, id, obligation_hash, subject_id, principal_id, mandate_id,
         asset_id, amount_minor, outstanding_minor, spend_policy_id,
         cashflow_route_id, status, due_at, created_at,
         accrued_fees_minor, repaid_amount_minor
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, 800, 300, $8,
         $9, 'overdue', $10, $11, 10, 500
       )`,
      [
        tenantId,
        ids.obligationId,
        `obligation_risk_portfolio_hash_${RUN_ID}`,
        subjectId,
        principalId,
        ids.mandateId,
        ids.assetId,
        ids.spendPolicyId,
        `cashflow:fixture:${RUN_ID}`,
        new Date(IDENTITY_NOW.getTime() - 86_400_000),
        IDENTITY_NOW
      ]
    );
  });
  return { context, ids };
}

async function cleanupRiskPortfolioExposure(pool, { context, ids }) {
  await withTenantTransaction(pool, context, async (client) => {
    await client.query("DELETE FROM obligations WHERE id = $1", [ids.obligationId]);
    await client.query("DELETE FROM credit_lines WHERE id = $1", [ids.creditLineId]);
    await client.query("DELETE FROM spend_policies WHERE id = $1", [ids.spendPolicyId]);
    await client.query("DELETE FROM providers WHERE id = $1", [ids.providerId]);
    await client.query("DELETE FROM mandates WHERE id = $1", [ids.mandateId]);
  });
}

function gateway(pool, harness, handlers = createTenantFoundationHandlers()) {
  return new TenantCommandGateway({
    pool,
    handlers: new TenantCommandHandlerRegistry(handlers),
    policyRegistry: harness.policyRegistry,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher,
    livePolicyAdapterFactory: createPostgresTenantLivePolicyAdapter
  });
}

function humanClient(runtime, authenticationContext) {
  return new HumanTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function agentClient(runtime, authenticationContext) {
  return new AgentTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function providerClient(runtime, authenticationContext) {
  return new ProviderTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function workerClient(runtime, authenticationContext) {
  return new SystemWorkerTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

async function proveAndActivateAgentAccount({ controller, agent, subjectId, privateKey, label }) {
  const account = privateKeyToAccount(privateKey);
  const accountId = `eip155:84532:${account.address}`;
  const challenge = await controller.createAgentAccountChallenge({
    subjectId,
    payload: { accountId, purpose: "primary" },
    idempotencyKey: `identity-challenge-${label}-${RUN_ID}-0001`,
    requestId: `request-identity-challenge-${label}-${RUN_ID}`,
    correlationId: `correlation-identity-${label}-${RUN_ID}`
  });
  const signature = await account.signTypedData(challenge.response.typedData);
  const verified = await agent.submitAccountProof({
    subjectId,
    payload: {
      challengeId: challenge.response.challengeId,
      accountId,
      signature
    },
    idempotencyKey: `identity-proof-${label}-${RUN_ID}-0001`,
    requestId: `request-identity-proof-${label}-${RUN_ID}`,
    correlationId: `correlation-identity-${label}-${RUN_ID}`
  });
  return { account, accountId, challenge, verified };
}

function operatorClient(runtime, authenticationContext) {
  return new OperatorTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function riskQueryClient(runtime, authenticationContext) {
  return new RiskTenantQueryClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function auditorQueryClient(runtime, authenticationContext) {
  return new AuditorTenantQueryClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function createCommand({ subjectActorId, displayName, idempotencyKey }) {
  return {
    payload: { subjectActorId, displayName, jurisdiction: "US" },
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

function createMandateCommand({ subjectId, idempotencyKey, nonce = `${idempotencyKey}-nonce`, overrides = {} }) {
  const validFrom = new Date(Date.now() - 30_000);
  const expiresAt = new Date(validFrom.getTime() + 180 * 86_400_000);
  return {
    subjectId,
    payload: {
      capabilities: ["request_credit", "provider_spend", "capture_revenue", "route_repayment"],
      allowedProviderIds: ["provider_gateway_compute"],
      allowedCategories: ["compute"],
      assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      perActionLimitMinor: "100000",
      aggregateLimitMinor: "500000",
      validFrom: validFrom.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce,
      termsRef: "urn:ipo.one:test:gateway-mandate:v1",
      ...overrides
    },
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

function revokeMandateCommand({ mandateId, idempotencyKey, reasonCode = "operator_request" }) {
  return {
    mandateId,
    reasonCode,
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

function createConsentCommand({ subjectId, idempotencyKey, overrides = {} }) {
  return {
    subjectId,
    payload: {
      purposes: ["credit_application", "credit_decision", "identity_reference_use"],
      allowedAssetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      allowedCreditPurposeCodes: ["working_capital"],
      allowedRepaymentFrequencies: ["monthly"],
      maxRequestedPrincipalMinor: "25000",
      maxRequestedTermDays: 90,
      maxInstallmentCount: 3,
      termsRef: "urn:ipo.one:test:human-credit-terms:v1",
      termsVersion: "human_credit_terms.v1",
      dataUsageRef: "urn:ipo.one:test:human-credit-data-usage:v1",
      dataUsageVersion: "human_credit_data_usage.v1",
      disclosureRef: "urn:ipo.one:test:no-real-funds-disclosure:v1",
      expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      ...overrides
    },
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

function revokeConsentCommand({ consentId, idempotencyKey }) {
  return {
    consentId,
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

function requestCreditCommand({ subjectId, authorityId, idempotencyKey, overrides = {} }) {
  return {
    subjectId,
    payload: {
      authorityId,
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedPrincipalMinor: "12000",
      purposeCode: "working_capital",
      requestedTermDays: 60,
      repaymentFrequency: "monthly",
      installmentCount: 2,
      ...overrides
    },
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

async function seedSyntheticIdentityReference({
  pool,
  tenantId,
  identity,
  subjectId,
  principalId,
  consentId,
  purposeCodes = ["identity_reference_use"]
}) {
  const context = createTenantSecurityContext({
    tenantId,
    actorId: identity.authenticationContext.actorId,
    policyVersion: identity.authenticationContext.policyVersion,
    source: "local_test"
  });
  const eventRepository = new PostgresEventRepository({ pool, tenantContext: context });
  const coreRepository = new PostgresCoreRepository({ pool, eventRepository });
  const consent = await coreRepository.getConsentRecord(consentId);
  // The PostgreSQL test runtime may execute inside a VM whose clock is a few
  // milliseconds ahead of the host test process. Keep the fixture strictly
  // inside the server-issued Consent window without weakening the domain check.
  const now = new Date(Math.max(
    Date.now(),
    new Date(consent.validFrom).getTime() + 1
  ));
  const expiresAt = new Date(Math.min(
    new Date(consent.expiresAt).getTime(),
    now.getTime() + 30 * 86_400_000
  ));
  const reference = createHumanIdentityReference({
    subjectId,
    principalId,
    consent,
    referenceType: "kyc_reference",
    providerRef: "urn:ipo.one:test:synthetic-identity-provider:v1",
    providerVersion: "synthetic_provider.v1",
    referenceRef: `urn:ipo.one:test:synthetic-identity-evidence:${RUN_ID}:${consentId}`,
    assuranceLevel: "synthetic_provider_asserted",
    purposeCodes,
    validFrom: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    now
  });
  const event = createCreditEvent({
    eventType: CreditEventType.IDENTITY_REFERENCE_RECORDED,
    subjectId,
    payload: {
      identityReferenceId: reference.identityReferenceId,
      identityReferenceHash: reference.identityReferenceHash,
      referenceEvidenceHash: reference.referenceEvidenceHash,
      consentId,
      syntheticOnly: true,
      productionVerified: false,
      actorId: identity.authenticationContext.actorId
    },
    now
  });
  await coreRepository.commitCommand({
    aggregateType: "human_identity_reference",
    aggregateId: reference.identityReferenceId,
    idempotencyKey: `seed-human-identity-reference-${RUN_ID}-${consentId}`,
    commandHash: hashId("gateway_test_identity_reference_seed", {
      tenantId,
      identityReferenceId: reference.identityReferenceId
    }),
    events: [{
      aggregateType: "human_identity_reference",
      aggregateId: reference.identityReferenceId,
      expectedVersion: 0,
      event
    }],
    writes: [{
      type: "human_identity_reference",
      value: reference,
      eventId: event.eventId
    }],
    response: { identityReferenceId: reference.identityReferenceId }
  });
  await withTenantTransaction(pool, context, async (client) => {
    const directory = new PostgresAuthorizationDirectory({
      client,
      authenticationContext: identity.authenticationContext
    });
    await directory.registerResource({
      resourceType: "human_identity_reference",
      resourceId: reference.identityReferenceId,
      actorBindings: [{
        actorId: identity.authenticationContext.actorId,
        actorType: identity.authenticationContext.actorType,
        relationship: "owner"
      }],
      now
    });
  });
  return reference;
}

async function postRepaymentWithBoundedClockRecovery({
  client,
  command,
  pool,
  obligationId
}) {
  try {
    return await client.postSandboxRepayment(command);
  } catch (error) {
    if (error?.code !== "invalid_accrual_time") throw error;
    const clock = await pool.query(
      `SELECT clock_timestamp() AS database_now, last_accrued_at
         FROM obligations
        WHERE id = $1`,
      [obligationId]
    );
    assert.equal(clock.rowCount, 1);
    const databaseNow = new Date(clock.rows[0].database_now).getTime();
    const lastAccruedAt = new Date(clock.rows[0].last_accrued_at).getTime();
    const recoveryDelayMs = Math.max(0, lastAccruedAt - databaseNow + 2);
    assert.ok(
      recoveryDelayMs <= 2_000,
      "PostgreSQL clock recovery exceeded the bounded integration-test allowance"
    );
    if (recoveryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, recoveryDelayMs));
    }
    return client.postSandboxRepayment(command);
  }
}

async function waitForDatabaseClockAfter(pool, timestampValue, label) {
  const target = new Date(timestampValue).getTime();
  const startedAt = process.hrtime.bigint();
  while (Number(process.hrtime.bigint() - startedAt) / 1_000_000 <= 3_000) {
    const clock = await pool.query("SELECT clock_timestamp() AS database_now");
    const databaseNow = new Date(clock.rows[0].database_now).getTime();
    if (databaseNow >= target) return;
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(100, Math.max(2, target - databaseNow + 2))
    ));
  }
  assert.fail(
    `${label} PostgreSQL clock recovery exceeded the bounded integration-test allowance`
  );
}

function freezeSubjectCommand({ subjectId, idempotencyKey, reasonCode = "risk_limit_breach" }) {
  return {
    subjectId,
    reasonCode,
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

async function executeConcurrentDuplicate(operation) {
  const attempts = await Promise.allSettled([operation(), operation()]);
  const results = attempts
    .filter((attempt) => attempt.status === "fulfilled")
    .map((attempt) => attempt.value);
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(
    results.length >= 1,
    true,
    rejected.map((attempt) => `${attempt.reason?.code ?? "unknown"}:${attempt.reason?.message ?? ""}`).join(" | ")
  );
  assert.equal(
    rejected.every((attempt) => attempt.reason?.code === "idempotency_in_progress"),
    true
  );
  if (results.length === 1) results.push(await operation());
  return results;
}

async function transitionProjection({
  pool,
  tenantId,
  actorId,
  entityType,
  entityId,
  nextStatus,
  idempotencyKey
}) {
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  const eventRepository = new PostgresEventRepository({ pool, tenantContext: context });
  const coreRepository = new PostgresCoreRepository({ pool, eventRepository });
  const projection = entityType === "subject"
    ? await coreRepository.getSubject(entityId)
    : await coreRepository.getPrincipal(entityId);
  const registration = await coreRepository.getProjectionRegistration(entityType, entityId);
  const now = new Date();
  const event = createCreditEvent({
    eventType: entityType === "subject"
      ? CreditEventType.SUBJECT_STATUS_CHANGED
      : "principal_status_changed",
    ...(entityType === "subject" ? { subjectId: entityId } : {}),
    payload: { entityType, entityId, previousStatus: projection.status, nextStatus },
    now
  });
  return coreRepository.commitCommand({
    aggregateType: entityType,
    aggregateId: entityId,
    idempotencyKey,
    commandHash: hashId("gateway_test_status_transition", {
      tenantId,
      entityType,
      entityId,
      nextStatus,
      idempotencyKey
    }),
    events: [{
      aggregateType: entityType,
      aggregateId: entityId,
      expectedVersion: registration.aggregateVersion,
      event
    }],
    writes: [{
      type: entityType,
      value: {
        ...projection,
        status: nextStatus,
        ...(entityType === "subject" ? { updatedAt: now.toISOString() } : {})
      },
      eventId: event.eventId
    }],
    response: { entityType, entityId, status: nextStatus }
  });
}

test("durable Tenant Command Gateway is isolated, atomic, and restart-safe", { timeout: 90_000 }, async (t) => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL is required");
  const ownerPool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 8,
    applicationName: "ipo-one-gateway-owner-test"
  });
  let appPool;
  const dropRole = async () => {
    const exists = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (exists.rowCount === 0) return;
    await ownerPool.query(`DROP OWNED BY ${APP_ROLE}`);
    await ownerPool.query(`DROP ROLE ${APP_ROLE}`);
  };

  try {
    await migrateUp({ pool: ownerPool });
    const harness = createAuthorizationHarness();
    const identities = {
      tenantOneHuman: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND
        ],
        now: IDENTITY_NOW
      }),
      tenantOneController: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_controller_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.PRINCIPAL_CONTROLLER,
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.AGENT_MANAGE_OWNED,
          PilotCapability.WORKSPACE_RESUME_SELF,
          PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
          PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE,
          PilotCapability.MANDATE_ACTIVATE_OWNED,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
          PilotCapability.OFFICIAL_REPORT_READ_OWNED,
          PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
          PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED
        ],
        now: IDENTITY_NOW
      }),
      tenantOneBorrower: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_borrower_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.HUMAN_BORROWER,
        capabilities: [
          PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.CONSENT_CREATE_SELF,
          PilotCapability.CONSENT_READ_SELF,
          PilotCapability.CONSENT_REVOKE_SELF,
          PilotCapability.IDENTITY_REFERENCE_READ_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
          PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
          PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
          PilotCapability.OFFICIAL_REPORT_READ_OWNED,
          PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
          PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED,
          PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantOneCapitalPartner: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_capital_partner_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.CAPITAL_PARTNER_OPERATOR,
        capabilities: [
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CAPITAL_PARTNER_OFFER_CREATE_OWN,
          PilotCapability.CAPITAL_PARTNER_OFFER_MANAGE_OWN,
          PilotCapability.CAPITAL_PARTNER_PORTFOLIO_READ_OWN,
          PilotCapability.CAPITAL_PARTNER_FACILITY_READ_OWN
        ],
        now: IDENTITY_NOW
      }),
      tenantOnePhase2BorrowerA: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_phase2_borrower_a_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.HUMAN_BORROWER,
        capabilities: [
          PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.CONSENT_CREATE_SELF,
          PilotCapability.CONSENT_READ_SELF,
          PilotCapability.CONSENT_REVOKE_SELF,
          PilotCapability.IDENTITY_REFERENCE_READ_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
          PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
          PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CREDIT_PASSPORT_REVOKE_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantOnePhase2BorrowerB: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_phase2_borrower_b_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.HUMAN_BORROWER,
        capabilities: [
          PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.CONSENT_CREATE_SELF,
          PilotCapability.CONSENT_READ_SELF,
          PilotCapability.CONSENT_REVOKE_SELF,
          PilotCapability.IDENTITY_REFERENCE_READ_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
          PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
          PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CREDIT_PASSPORT_REVOKE_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantOneOtherBorrower: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_other_borrower_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.HUMAN_BORROWER,
        capabilities: [
          PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.CONSENT_CREATE_SELF,
          PilotCapability.CONSENT_READ_SELF,
          PilotCapability.CONSENT_REVOKE_SELF,
          PilotCapability.IDENTITY_REFERENCE_READ_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
          PilotCapability.OFFICIAL_REPORT_READ_OWNED,
          PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
          PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED
        ],
        now: IDENTITY_NOW
      }),
      tenantOneAgent: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.WORKSPACE_RESUME_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantOneCreditAgent: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_credit_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.WORKSPACE_RESUME_SELF,
          PilotCapability.AGENT_ACCOUNT_PROOF_SUBMIT_SELF,
          PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
          PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
          PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
          PilotCapability.OFFICIAL_REPORT_READ_OWNED,
          PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
          PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED
        ],
        now: IDENTITY_NOW
      }),
      tenantOneControllerAgent: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_controller_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.AGENT_ACCOUNT_PROOF_SUBMIT_SELF,
          PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantOneOtherHuman: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_other_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND
        ],
        now: IDENTITY_NOW
      }),
      tenantOneRisk: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_risk_${RUN_ID}`,
        actorType: ActorType.RISK_OPERATOR,
        roleBundle: RoleBundle.RISK_OPERATOR,
        capabilities: [
          PilotCapability.RISK_FREEZE,
          PilotCapability.RISK_READ_TENANT,
          PilotCapability.SERVICING_QUEUE_READ,
          PilotCapability.PILOT_FEEDBACK_READ_TENANT
        ],
        now: IDENTITY_NOW
      }),
      tenantOneAuditor: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_auditor_${RUN_ID}`,
        actorType: ActorType.AUDITOR,
        roleBundle: RoleBundle.AUDITOR,
        capabilities: [
          PilotCapability.RISK_READ_TENANT,
          PilotCapability.EVIDENCE_READ,
          PilotCapability.PILOT_FEEDBACK_READ_TENANT
        ],
        now: IDENTITY_NOW
      }),
      tenantOneStaleRisk: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_stale_risk_${RUN_ID}`,
        actorType: ActorType.RISK_OPERATOR,
        roleBundle: RoleBundle.RISK_OPERATOR,
        capabilities: [PilotCapability.RISK_READ_TENANT, PilotCapability.SERVICING_QUEUE_READ],
        now: new Date(Date.now() - 20 * 60_000)
      }),
      tenantOneOperations: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_operations_${RUN_ID}`,
        actorType: ActorType.OPERATIONS_OPERATOR,
        roleBundle: RoleBundle.OPERATIONS_OPERATOR,
        capabilities: [PilotCapability.RISK_FREEZE, PilotCapability.SERVICING_QUEUE_READ],
        now: IDENTITY_NOW
      }),
      tenantOneWorker: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_servicing_worker_${RUN_ID}`,
        actorType: ActorType.SYSTEM_WORKER,
        roleBundle: RoleBundle.SYSTEM_WORKER,
        capabilities: [PilotCapability.SERVICING_ADVANCE_SANDBOX],
        now: IDENTITY_NOW
      }),
      tenantTwoHuman: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoBorrower: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_borrower_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.HUMAN_BORROWER,
        capabilities: [
          PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.CONSENT_CREATE_SELF,
          PilotCapability.CONSENT_READ_SELF,
          PilotCapability.CONSENT_REVOKE_SELF,
          PilotCapability.IDENTITY_REFERENCE_READ_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF,
          PilotCapability.OBLIGATION_READ_OWNED,
          PilotCapability.EVIDENCE_READ_OWNED,
          PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
          PilotCapability.CREDIT_PASSPORT_READ_SELF,
          PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
          PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
          PilotCapability.OFFICIAL_REPORT_READ_OWNED,
          PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
          PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoAgent: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.WORKSPACE_RESUME_SELF,
          PilotCapability.CREDIT_REQUEST,
          PilotCapability.CREDIT_READ_SELF,
          PilotCapability.CREDIT_EVALUATE_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoContinuationAgent: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_continuation_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [
          PilotCapability.SUBJECT_READ_SELF,
          PilotCapability.WORKSPACE_RESUME_SELF
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoRisk: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_risk_${RUN_ID}`,
        actorType: ActorType.RISK_OPERATOR,
        roleBundle: RoleBundle.RISK_OPERATOR,
        capabilities: [
          PilotCapability.RISK_FREEZE,
          PilotCapability.RISK_READ_TENANT,
          PilotCapability.SERVICING_QUEUE_READ,
          PilotCapability.PILOT_FEEDBACK_READ_TENANT
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoProvider: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_provider_${RUN_ID}`,
        actorType: ActorType.PROVIDER,
        roleBundle: RoleBundle.PROVIDER_SERVICE,
        capabilities: [
          PilotCapability.PROVIDER_INTENT_READ,
          PilotCapability.PROVIDER_INTENT_ACKNOWLEDGE
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoWorker: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_worker_${RUN_ID}`,
        actorType: ActorType.SYSTEM_WORKER,
        roleBundle: RoleBundle.SYSTEM_WORKER,
        capabilities: [PilotCapability.WORKER_INBOX_PROCESS],
        now: IDENTITY_NOW
      })
    };
    await seedTenant(ownerPool, TENANT_ONE);
    await seedTenant(ownerPool, TENANT_TWO);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneHuman);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneController);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneBorrower);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneCapitalPartner);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOnePhase2BorrowerA);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOnePhase2BorrowerB);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneOtherBorrower);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneOtherHuman);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneRisk);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneAuditor);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneStaleRisk);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneOperations);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneWorker);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneAgent, {
      controllerActorId: identities.tenantOneHuman.authenticationContext.actorId
    });
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneCreditAgent, {
      controllerActorId: identities.tenantOneController.authenticationContext.actorId
    });
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneControllerAgent, {
      controllerActorId: identities.tenantOneController.authenticationContext.actorId
    });
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoHuman);
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoBorrower);
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoRisk);
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoProvider);
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoWorker);
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoAgent, {
      controllerActorId: identities.tenantTwoHuman.authenticationContext.actorId
    });
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoContinuationAgent, {
      controllerActorId: identities.tenantTwoHuman.authenticationContext.actorId
    });
    const capitalPartnerProfile = await seedCapitalPartnerProfile(
      ownerPool,
      TENANT_ONE,
      identities.tenantOneCapitalPartner
    );
    await seedRiskPortfolioResource(
      ownerPool,
      TENANT_ONE,
      identities.tenantOneRisk.authenticationContext.actorId,
      TENANT_ONE_RISK_PORTFOLIO
    );
    await seedRiskPortfolioResource(
      ownerPool,
      TENANT_TWO,
      identities.tenantTwoRisk.authenticationContext.actorId,
      TENANT_TWO_RISK_PORTFOLIO
    );
    await seedServicingQueueResource(
      ownerPool,
      TENANT_ONE,
      identities.tenantOneRisk.authenticationContext.actorId,
      TENANT_ONE_SERVICING_QUEUE
    );
    await seedServicingQueueResource(
      ownerPool,
      TENANT_TWO,
      identities.tenantTwoRisk.authenticationContext.actorId,
      TENANT_TWO_SERVICING_QUEUE
    );

    await dropRole();
    const password = randomBytes(24).toString("base64url");
    const quotedPassword = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
    await ownerPool.query(
      `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT UPDATE (id) ON actors, memberships, access_grants TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT UPDATE (status) ON obligations, credit_lines TO ${APP_ROLE}`);
    await ownerPool.query(
      `GRANT INSERT ON
         authorization_resources, authorization_resource_bindings,
         authorization_audit_events, tenant_command_executions
       TO ${APP_ROLE}`
    );
    await ownerPool.query(
      `GRANT UPDATE (resource_id) ON
         authorization_resources, authorization_resource_bindings
       TO ${APP_ROLE}`
    );
    await ownerPool.query(
      `GRANT UPDATE (status, version, updated_at) ON authorization_resources TO ${APP_ROLE}`
    );
    await ownerPool.query(
      `GRANT INSERT, UPDATE, DELETE ON
         abuse_rate_buckets, abuse_capacity_buckets, abuse_admissions,
         abuse_command_charges, principals, subjects, mandates,
         agent_account_challenges, agent_account_proof_attempts,
         execution_account_binding_challenges, execution_account_binding_proof_attempts,
         account_bindings,
         consent_records, human_identity_references, credit_intents,
         risk_decisions, credit_offers, credit_offer_acceptances,
         workspace_continuation_receipts,
         obligations, obligation_installments, sandbox_execution_receipts,
         sandbox_servicing_actions,
         provider_intent_deliveries, provider_intent_acknowledgements,
         provider_callback_inbox,
         credit_lines, lockboxes, ledger_accounts, ledger_transactions, ledger_entries, repayment_events,
         execution_target_policies, delegated_wallet_grants,
         delegated_wallet_grant_target_policies, delegated_wallet_grant_transitions,
         delegated_wallet_pending_exposures, wallet_prepared_executions,
         wallet_simulation_reports, wallet_transaction_preflight_receipts,
         aggregate_stream_heads, domain_events, credit_events,
         pilot_feedback_records, credit_passport_artifacts, credit_outcomes,
         tenant_command_pauses,
         official_report_artifacts, trading_credit_profiles,
         evidence_envelopes, evidence_chain_anchors,
         evidence_chain_anchor_observations, outbox_messages, command_idempotency,
         command_events, projection_registry, projection_snapshots,
         reconciliation_runs, reconciliation_discrepancies
       TO ${APP_ROLE}`
    );
    const appConnection = new URL(CONNECTION_STRING);
    appConnection.username = APP_ROLE;
    appConnection.password = password;
    appPool = createPostgresPool({
      connectionString: appConnection.toString(),
      max: 12,
      applicationName: "ipo-one-gateway-runtime-test"
    });
    await assertTenantDatabaseRole(appPool);

    const runtime = gateway(appPool, harness);
    const tenantOneHuman = humanClient(runtime, identities.tenantOneHuman.authenticationContext);
    const tenantOneController = humanClient(
      runtime,
      identities.tenantOneController.authenticationContext
    );
    const tenantOneBorrower = humanClient(runtime, identities.tenantOneBorrower.authenticationContext);
    const tenantOneCapitalPartner = humanClient(
      runtime,
      identities.tenantOneCapitalPartner.authenticationContext
    );
    const tenantOnePhase2BorrowerA = humanClient(
      runtime,
      identities.tenantOnePhase2BorrowerA.authenticationContext
    );
    const tenantOnePhase2BorrowerB = humanClient(
      runtime,
      identities.tenantOnePhase2BorrowerB.authenticationContext
    );
    const tenantOneOtherBorrower = humanClient(
      runtime,
      identities.tenantOneOtherBorrower.authenticationContext
    );
    const tenantOneOtherHuman = humanClient(runtime, identities.tenantOneOtherHuman.authenticationContext);
    const tenantOneAgent = agentClient(runtime, identities.tenantOneAgent.authenticationContext);
    const tenantOneCreditAgent = agentClient(
      runtime,
      identities.tenantOneCreditAgent.authenticationContext
    );
    const tenantOneControllerAgent = agentClient(
      runtime,
      identities.tenantOneControllerAgent.authenticationContext
    );
    const tenantOneRisk = operatorClient(runtime, identities.tenantOneRisk.authenticationContext);
    const tenantOneRiskQuery = riskQueryClient(
      runtime,
      identities.tenantOneRisk.authenticationContext
    );
    const tenantOneAuditorQuery = riskQueryClient(
      runtime,
      identities.tenantOneAuditor.authenticationContext
    );
    const tenantOneEvidenceQuery = auditorQueryClient(
      runtime,
      identities.tenantOneAuditor.authenticationContext
    );
    const tenantOneStaleRiskQuery = riskQueryClient(
      runtime,
      identities.tenantOneStaleRisk.authenticationContext
    );
    const tenantOneOperations = operatorClient(
      runtime,
      identities.tenantOneOperations.authenticationContext
    );
    const tenantOneWorker = workerClient(
      runtime,
      identities.tenantOneWorker.authenticationContext
    );
    const tenantTwoHuman = humanClient(runtime, identities.tenantTwoHuman.authenticationContext);
    const tenantTwoBorrower = humanClient(runtime, identities.tenantTwoBorrower.authenticationContext);
    const tenantTwoAgent = agentClient(runtime, identities.tenantTwoAgent.authenticationContext);
    const tenantTwoContinuationAgent = agentClient(
      runtime,
      identities.tenantTwoContinuationAgent.authenticationContext
    );
    const tenantTwoRisk = operatorClient(runtime, identities.tenantTwoRisk.authenticationContext);
    const tenantTwoRiskQuery = riskQueryClient(
      runtime,
      identities.tenantTwoRisk.authenticationContext
    );
    const firstCommand = createCommand({
      subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
      displayName: "Tenant One Treasury Agent",
      idempotencyKey: `create-agent-one-${RUN_ID}-0001`
    });
    let tenantOneSubjectId;
    let tenantOnePrincipalId;
    let tenantOneMandateId;
    let tenantOneHumanSubjectId;
    let tenantOneHumanPrincipalId;
    let tenantTwoHumanSubjectId;
    let tenantTwoHumanPrincipalId;
    let firstMandateCommand;

    await t.test("invalid protocol request fails before admission and authorization", async () => {
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM abuse_admissions WHERE tenant_id = $1) AS admissions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits`,
        [TENANT_TWO]
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantTwoHuman.authenticationContext,
          operationId: "pilotReadMandate",
          resource: { resourceType: "mandate", resourceId: `mandate_missing_${RUN_ID}` },
          payload: {},
          requestId: `request-invalid-contract-${RUN_ID}`,
          correlationId: `correlation-invalid-contract-${RUN_ID}`,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          tenantId: TENANT_ONE
        }),
        (error) => error.code === "invalid_tenant_protocol_request"
      );
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM abuse_admissions WHERE tenant_id = $1) AS admissions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits`,
        [TENANT_TWO]
      );
      assert.deepEqual(after.rows, before.rows);
    });

    await t.test("Human command and Agent query share one durable protocol", async () => {
      const created = await tenantOneHuman.createAgentSubject(firstCommand);
      tenantOneSubjectId = created.response.subjectId;
      tenantOnePrincipalId = created.response.principalId;
      assert.equal(created.replayed, false);
      assert.equal(created.response.subjectType, "agent");

      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-${RUN_ID}`,
        correlationId: `correlation-agent-self-${RUN_ID}`
      });
      assert.equal(self.response.subject.subjectId, tenantOneSubjectId);
      assert.equal(self.response.subject.displayName, "Tenant One Treasury Agent");

      const counts = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM projection_snapshots WHERE tenant_id = $1) AS snapshots,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits`,
        [TENANT_ONE]
      );
      assert.deepEqual(counts.rows[0], { events: 2, snapshots: 2, executions: 1, audits: 4 });
    });

    await t.test("Risk and Auditor read an RLS-isolated aggregate portfolio with recent MFA", async () => {
      const exposureFixture = await seedRiskPortfolioExposure(ownerPool, {
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        subjectId: tenantOneSubjectId,
        principalId: tenantOnePrincipalId
      });
      try {
      const businessState = () => ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id IN ($1, $2)) AS events,
           (SELECT count(*)::int FROM credit_events WHERE tenant_id IN ($1, $2)) AS credit_events,
           (SELECT count(*)::int FROM evidence_envelopes WHERE tenant_id IN ($1, $2)) AS evidence,
           (SELECT count(*)::int FROM projection_snapshots WHERE tenant_id IN ($1, $2)) AS projections,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id IN ($1, $2)) AS executions,
           (SELECT count(*)::int FROM command_idempotency WHERE tenant_id IN ($1, $2)) AS commands`,
        [TENANT_ONE, TENANT_TWO]
      );
      const admissionCounts = () => ownerPool.query(
        `SELECT tenant_id, count(*)::int AS count
           FROM abuse_admissions
          WHERE tenant_id IN ($1, $2) AND operation_id = 'pilotReadTenantRisk'
          GROUP BY tenant_id
          ORDER BY tenant_id`,
        [TENANT_ONE, TENANT_TWO]
      );
      const beforeBusiness = await businessState();
      const beforeAdmissions = new Map(
        (await admissionCounts()).rows.map((row) => [row.tenant_id, row.count])
      );
      const successfulRequestIds = [
        `request-risk-portfolio-one-${RUN_ID}`,
        `request-risk-portfolio-auditor-${RUN_ID}`,
        `request-risk-portfolio-two-${RUN_ID}`
      ];

      const riskView = await tenantOneRiskQuery.getPortfolio({
        portfolioId: TENANT_ONE_RISK_PORTFOLIO,
        requestId: successfulRequestIds[0],
        correlationId: `correlation-risk-portfolio-one-${RUN_ID}`
      });
      assert.equal(riskView.replayed, false);
      assert.equal(riskView.response.portfolioId, TENANT_ONE_RISK_PORTFOLIO);
      assert.equal(riskView.response.subjects.totalCount, 1);
      assert.deepEqual(riskView.response.creditLines, {
        totalCount: 1,
        requestedCount: 0,
        approvedCount: 1,
        rejectedCount: 0,
        frozenCount: 0,
        closedCount: 0,
        limitMinor: "1000",
        utilizedMinor: "250"
      });
      assert.deepEqual(riskView.response.obligations, {
        totalCount: 1,
        openCount: 1,
        createdCount: 0,
        activeCount: 0,
        partiallyRepaidCount: 0,
        fullyRepaidCount: 0,
        overdueCount: 1,
        defaultedCount: 0,
        delinquentCount: 0,
        restructuredCount: 0,
        repurchasedCount: 0,
        writtenOffCount: 0,
        closedCount: 0,
        principalMinor: "800",
        outstandingPrincipalMinor: "300",
        accruedFeesMinor: "10",
        repaidAmountMinor: "500",
        writtenOffPrincipalMinor: "0",
        writtenOffInterestMinor: "0",
        writtenOffFeesMinor: "0"
      });
      assert.deepEqual(riskView.response.assetExposures, [{
        assetId: exposureFixture.ids.assetId,
        creditLineCount: 1,
        approvedCreditLineCount: 1,
        frozenCreditLineCount: 0,
        limitMinor: "1000",
        utilizedMinor: "250",
        obligationCount: 1,
        openObligationCount: 1,
        overdueObligationCount: 1,
        defaultedObligationCount: 0,
        delinquentObligationCount: 0,
        restructuredObligationCount: 0,
        repurchasedObligationCount: 0,
        writtenOffObligationCount: 0,
        outstandingPrincipalMinor: "300",
        writtenOffPrincipalMinor: "0"
      }]);
      assert.equal(riskView.response.hasMoreAssetExposures, false);
      assert.equal(riskView.response.schemaVersion, "tenant_risk_portfolio_view.v1");
      assert.equal(
        /tenantId|subjectId|displayName|principalId|accountId|providerId|evidence/i.test(
          JSON.stringify(riskView.response)
        ),
        false
      );

      const auditorView = await tenantOneAuditorQuery.getPortfolio({
        portfolioId: TENANT_ONE_RISK_PORTFOLIO,
        requestId: successfulRequestIds[1],
        correlationId: `correlation-risk-portfolio-auditor-${RUN_ID}`
      });
      assert.deepEqual(auditorView.response.subjects, riskView.response.subjects);
      const tenantTwoView = await tenantTwoRiskQuery.getPortfolio({
        portfolioId: TENANT_TWO_RISK_PORTFOLIO,
        requestId: successfulRequestIds[2],
        correlationId: `correlation-risk-portfolio-two-${RUN_ID}`
      });
      assert.equal(tenantTwoView.response.subjects.totalCount, 0);

      await assert.rejects(
        () => tenantTwoRiskQuery.getPortfolio({
          portfolioId: TENANT_ONE_RISK_PORTFOLIO,
          requestId: `request-risk-portfolio-cross-tenant-${RUN_ID}`,
          correlationId: `correlation-risk-portfolio-cross-tenant-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneStaleRiskQuery.getPortfolio({
          portfolioId: TENANT_ONE_RISK_PORTFOLIO,
          requestId: `request-risk-portfolio-stale-mfa-${RUN_ID}`,
          correlationId: `correlation-risk-portfolio-stale-mfa-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      for (const [identity, label] of [
        [identities.tenantOneHuman, "developer"],
        [identities.tenantOneAgent, "agent"],
        [identities.tenantOneOperations, "operations"]
      ]) {
        await assert.rejects(
          () => runtime.execute({
            authenticationContext: identity.authenticationContext,
            operationId: "pilotReadTenantRisk",
            payload: {},
            resource: {
              resourceType: "risk_portfolio",
              resourceId: TENANT_ONE_RISK_PORTFOLIO
            },
            requestId: `request-risk-portfolio-${label}-${RUN_ID}`,
            correlationId: `correlation-risk-portfolio-${label}-${RUN_ID}`,
            schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION
          }),
          (error) => error.code === "authorization_denied"
        );
      }

      const afterBusiness = await businessState();
      assert.deepEqual(afterBusiness.rows, beforeBusiness.rows);
      const afterAdmissions = new Map(
        (await admissionCounts()).rows.map((row) => [row.tenant_id, row.count])
      );
      assert.equal(
        afterAdmissions.get(TENANT_ONE) - (beforeAdmissions.get(TENANT_ONE) ?? 0),
        6
      );
      assert.equal(
        afterAdmissions.get(TENANT_TWO) - (beforeAdmissions.get(TENANT_TWO) ?? 0),
        2
      );
      const successfulAudits = await ownerPool.query(
        `SELECT request_id,
                count(*)::int AS count,
                bool_and(authorization_decision = 'allow') AS all_allowed
           FROM authorization_audit_events
          WHERE request_id = ANY($1::text[])
          GROUP BY request_id
          ORDER BY request_id`,
        [successfulRequestIds]
      );
      assert.equal(successfulAudits.rowCount, 3);
      assert.equal(successfulAudits.rows.every((row) => row.count >= 1 && row.all_allowed), true);
      const admissionOutcomes = await ownerPool.query(
        `SELECT tenant_id, outcome, count(*)::int AS count
           FROM abuse_admissions
          WHERE tenant_id IN ($1, $2) AND operation_id = 'pilotReadTenantRisk'
          GROUP BY tenant_id, outcome
          ORDER BY tenant_id, outcome`,
        [TENANT_ONE, TENANT_TWO]
      );
      assert.equal(
        admissionOutcomes.rows.some((row) => row.tenant_id === TENANT_ONE && row.outcome === "succeeded"),
        true
      );
      assert.equal(
        admissionOutcomes.rows.some((row) => row.tenant_id === TENANT_TWO && row.outcome === "succeeded"),
        true
      );
      } finally {
        await cleanupRiskPortfolioExposure(ownerPool, exposureFixture);
      }
    });

    await t.test("Risk and Operations read an MFA-bound RLS-isolated Servicing queue", async () => {
      const riskView = await tenantOneRiskQuery.getServicingQueue({
        queueId: TENANT_ONE_SERVICING_QUEUE,
        limit: 10,
        requestId: `request-servicing-queue-risk-${RUN_ID}`,
        correlationId: `correlation-servicing-queue-risk-${RUN_ID}`
      });
      assert.equal(riskView.response.queueId, TENANT_ONE_SERVICING_QUEUE);
      assert.deepEqual(riskView.response.filters.classifications, [
        "defaulted",
        "dpd_61_89",
        "dpd_31_60",
        "dpd_1_30",
        "grace_period"
      ]);
      assert.deepEqual(riskView.response.cases, []);
      assert.deepEqual(riskView.response.page, { limit: 10, hasMore: false });
      assert.deepEqual(riskView.response.safety, {
        readOnly: true,
        piiIncluded: false,
        dispositionAuthority: false,
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false
      });
      assert.equal(riskView.response.schemaVersion, "tenant_servicing_queue_view.v1");

      const operationsView = await tenantOneOperations.getServicingQueue({
        queueId: TENANT_ONE_SERVICING_QUEUE,
        classifications: ["defaulted"],
        requestId: `request-servicing-queue-operations-${RUN_ID}`,
        correlationId: `correlation-servicing-queue-operations-${RUN_ID}`
      });
      assert.deepEqual(operationsView.response.filters.classifications, ["defaulted"]);

      const tenantTwoView = await tenantTwoRiskQuery.getServicingQueue({
        queueId: TENANT_TWO_SERVICING_QUEUE,
        requestId: `request-servicing-queue-two-${RUN_ID}`,
        correlationId: `correlation-servicing-queue-two-${RUN_ID}`
      });
      assert.equal(tenantTwoView.response.queueId, TENANT_TWO_SERVICING_QUEUE);
      assert.deepEqual(tenantTwoView.response.cases, []);

      await assert.rejects(
        () => tenantTwoRiskQuery.getServicingQueue({
          queueId: TENANT_ONE_SERVICING_QUEUE,
          requestId: `request-servicing-queue-cross-tenant-${RUN_ID}`,
          correlationId: `correlation-servicing-queue-cross-tenant-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneStaleRiskQuery.getServicingQueue({
          queueId: TENANT_ONE_SERVICING_QUEUE,
          requestId: `request-servicing-queue-stale-mfa-${RUN_ID}`,
          correlationId: `correlation-servicing-queue-stale-mfa-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneAuditorQuery.getServicingQueue({
          queueId: TENANT_ONE_SERVICING_QUEUE,
          requestId: `request-servicing-queue-auditor-${RUN_ID}`,
          correlationId: `correlation-servicing-queue-auditor-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneBorrower.execute({
          operationId: "pilotReadServicingQueue",
          payload: {},
          resource: {
            resourceType: "servicing_queue",
            resourceId: TENANT_ONE_SERVICING_QUEUE
          },
          requestId: `request-servicing-queue-borrower-${RUN_ID}`,
          correlationId: `correlation-servicing-queue-borrower-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );

      const audit = await ownerPool.query(
        `SELECT actor_type, authorization_decision
           FROM authorization_audit_events
          WHERE operation_id = 'pilotReadServicingQueue'
            AND request_id = ANY($1::text[])
          ORDER BY request_id`,
        [[
          `request-servicing-queue-operations-${RUN_ID}`,
          `request-servicing-queue-risk-${RUN_ID}`,
          `request-servicing-queue-two-${RUN_ID}`
        ]]
      );
      assert.equal(audit.rowCount, 6);
      assert.equal(audit.rows.every((row) => row.authorization_decision === "allow"), true);
      assert.deepEqual(new Set(audit.rows.map((row) => row.actor_type)), new Set([
        "risk_operator",
        "operations_operator"
      ]));
    });

    await t.test("invalid handler result rolls back the complete command transaction", async () => {
      const handlers = createTenantFoundationHandlers().map((handler) => {
        if (handler.operationId !== "pilotCreateAgentSubject") return handler;
        return {
          ...handler,
          async plan(input) {
            const plan = await handler.plan(input);
            return {
              ...plan,
              response: { ...plan.response, uncontractedAuthority: true }
            };
          }
        };
      });
      const hostileRuntime = gateway(appPool, harness, handlers);
      const hostileClient = humanClient(
        hostileRuntime,
        identities.tenantTwoHuman.authenticationContext
      );
      const stableState = async () => ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM principals WHERE tenant_id = $1) AS principals,
           (SELECT count(*)::int FROM subjects WHERE tenant_id = $1) AS subjects,
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM evidence_envelopes WHERE tenant_id = $1) AS evidence,
           (SELECT count(*)::int FROM projection_snapshots WHERE tenant_id = $1) AS projections,
           (SELECT count(*)::int FROM authorization_resources WHERE tenant_id = $1) AS resources,
           (SELECT count(*)::int FROM authorization_resource_bindings WHERE tenant_id = $1) AS bindings,
           (SELECT count(*)::int FROM command_idempotency WHERE tenant_id = $1) AS commands,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits,
           (SELECT COALESCE(sum(used_count), 0)::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'agent_subjects') AS agent_capacity`,
        [TENANT_TWO]
      );
      const before = await stableState();
      const command = createCommand({
        subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
        displayName: "Invalid Result Must Roll Back",
        idempotencyKey: `invalid-result-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => hostileClient.createAgentSubject(command),
        (error) => error.code === "invalid_tenant_protocol_result"
      );
      const after = await stableState();
      assert.deepEqual(after.rows, before.rows);
      const failedAdmission = await ownerPool.query(
        `SELECT state, outcome
           FROM abuse_admissions
          WHERE tenant_id = $1 AND operation_id = 'pilotCreateAgentSubject'
          ORDER BY issued_at DESC
          LIMIT 1`,
        [TENANT_TWO]
      );
      assert.deepEqual(failedAdmission.rows, [{ state: "completed", outcome: "failed" }]);
    });

    await t.test("Human controller creates one durable draft Mandate and Agent reads a bounded summary", async () => {
      firstMandateCommand = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `create-mandate-one-${RUN_ID}-0001`
      });
      const created = await tenantOneHuman.createDraftMandate(firstMandateCommand);
      tenantOneMandateId = created.response.mandateId;
      assert.equal(created.replayed, false);
      assert.equal(created.response.status, "draft");
      assert.equal(created.response.subjectId, tenantOneSubjectId);

      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-mandate-${RUN_ID}`,
        correlationId: `correlation-agent-self-mandate-${RUN_ID}`
      });
      assert.equal(self.response.schemaVersion, "tenant_agent_subject_view.v2");
      assert.equal(self.response.hasMoreMandates, false);
      assert.equal(self.response.mandates.length, 1);
      assert.equal(self.response.mandates[0].mandateId, tenantOneMandateId);
      assert.equal(self.response.mandates[0].status, "draft");

      const humanView = await tenantOneHuman.getMandate({
        mandateId: tenantOneMandateId,
        requestId: `request-human-mandate-${RUN_ID}`,
        correlationId: `correlation-human-mandate-${RUN_ID}`
      });
      assert.equal(humanView.response.schemaVersion, "tenant_mandate_view.v1");
      assert.equal(humanView.response.mandate.mandateId, tenantOneMandateId);
      assert.equal(humanView.response.mandate.nonce, firstMandateCommand.payload.nonce);

      const durable = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id = $1 AND id = $2) AS mandates,
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1 AND aggregate_type = 'mandate') AS events,
           (SELECT count(*)::int FROM authorization_resources
             WHERE tenant_id = $1 AND resource_type = 'mandate' AND resource_id = $2) AS resources,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'agent_subjects') AS agent_subjects,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'mandates') AS mandate_capacity`,
        [TENANT_ONE, tenantOneMandateId]
      );
      assert.deepEqual(durable.rows[0], {
        mandates: 1,
        events: 1,
        resources: 1,
        agent_subjects: 1,
        mandate_capacity: 1
      });
    });

    await t.test("bound Principal Controller acknowledges and activates the exact sandbox Mandate", async () => {
      const controlledSubject = await tenantOneController.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneControllerAgent.authenticationContext.actorId,
        displayName: "Tenant One Controlled Sandbox Agent",
        idempotencyKey: `create-controller-agent-${RUN_ID}-0001`
      }));
      const identityActivation = await proveAndActivateAgentAccount({
        controller: tenantOneController,
        agent: tenantOneControllerAgent,
        subjectId: controlledSubject.response.subjectId,
        privateKey: `0x${"44".repeat(32)}`,
        label: "controller-agent"
      });
      assert.equal(identityActivation.verified.response.status, "active");
      assert.equal(identityActivation.verified.response.challengeConsumed, true);
      const created = await tenantOneController.createDraftMandate(createMandateCommand({
        subjectId: controlledSubject.response.subjectId,
        idempotencyKey: `create-activatable-mandate-${RUN_ID}-0001`,
        overrides: {
          capabilities: [
            "request_credit",
            "accept_credit_offer",
            "execute_sandbox_credit",
            "route_repayment"
          ],
          allowedProviderIds: [],
          allowedCategories: []
        }
      }));
      const view = await tenantOneController.getMandate({
        mandateId: created.response.mandateId,
        requestId: `request-read-activatable-mandate-${RUN_ID}`,
        correlationId: `correlation-read-activatable-mandate-${RUN_ID}`
      });
      const command = {
        mandateId: created.response.mandateId,
        payload: {
          expectedMandateHash: view.response.mandate.mandateHash,
          acknowledgedTermsHash: view.response.mandate.termsHash,
          acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
        },
        idempotencyKey: `activate-sandbox-mandate-${RUN_ID}-0001`,
        requestId: `request-activate-sandbox-mandate-${RUN_ID}`,
        correlationId: `correlation-activate-sandbox-mandate-${RUN_ID}`
      };

      await assert.rejects(
        () => tenantOneHuman.activateSandboxMandate(command),
        (error) => error.code === "authorization_denied"
      );
      const activated = await tenantOneController.activateSandboxMandate(command);
      const replay = await tenantOneController.activateSandboxMandate(command);
      assert.equal(activated.replayed, false);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, activated.response);
      assert.equal(activated.response.mandate.status, "active");
      assert.equal(activated.response.mandate.sandboxOnly, true);
      assert.equal(activated.response.mandate.productionAuthority, false);
      assert.equal(
        activated.response.mandate.activationAcknowledgement.activatedByActorId,
        identities.tenantOneController.authenticationContext.actorId
      );

      const durable = await ownerPool.query(
        `SELECT status, schema_version, sandbox_only, production_authority,
                activation_acknowledgement->>'acknowledgementCode' AS acknowledgement_code,
                activation_acknowledgement->>'evidenceHash' AS evidence_hash,
                (SELECT count(*)::int FROM domain_events
                  WHERE tenant_id = $1 AND aggregate_type = 'mandate' AND aggregate_id = $2) AS events
           FROM mandates
          WHERE tenant_id = $1 AND id = $2`,
        [TENANT_ONE, created.response.mandateId]
      );
      assert.deepEqual(durable.rows[0], {
        status: "active",
        schema_version: "mandate.v3",
        sandbox_only: true,
        production_authority: false,
        acknowledgement_code: "principal_authorizes_sandbox_credit_v1",
        evidence_hash: activated.response.activationEvidenceHash,
        events: 2
      });

      const handoff = createReadyAgentHandoffManifest(activated.response.mandate);
      assert.ok(handoff);
      const mcpHost = createAgentMcpHost({
        client: tenantOneControllerAgent,
        manifest: handoff
      });
      const callPlan = createAgentHandoffCallPlan(handoff, {
        requestId: `request-mcp-durable-self-${RUN_ID}`,
        correlationId: `correlation-mcp-durable-self-${RUN_ID}`,
        jsonRpcId: `rpc-mcp-durable-self-${RUN_ID}`
      });
      const mcpResponse = await mcpHost.handle(callPlan.firstCall);
      assert.equal(mcpResponse.result.isError, false);
      assert.equal(
        mcpResponse.result.structuredContent.response.subject.subjectId,
        controlledSubject.response.subjectId
      );
      assert.equal(
        mcpResponse.result.structuredContent.response.mandates
          .find((mandate) => mandate.mandateId === created.response.mandateId)?.status,
        "active"
      );
      const mcpAudit = await ownerPool.query(
        `SELECT actor_id, authorization_decision
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND operation_id = 'pilotReadAgentSelf' AND request_id = $2`,
        [TENANT_ONE, callPlan.firstCall.params.arguments.requestId]
      );
      assert.equal(mcpAudit.rowCount >= 1, true);
      assert.equal(
        mcpAudit.rows.every((row) =>
          row.actor_id === identities.tenantOneControllerAgent.authenticationContext.actorId &&
          row.authorization_decision === "allow"
        ),
        true
      );
    });

    await t.test("Gateway rejects a handler plan that targets a different authorization resource", async () => {
      const handlers = createTenantFoundationHandlers().map((handler) => {
        if (handler.operationId !== "pilotRevokeDraftMandate") return handler;
        return {
          ...handler,
          async plan(input) {
            const plan = await handler.plan(input);
            return {
              ...plan,
              authorizationResourceTransition: {
                ...plan.authorizationResourceTransition,
                resourceId: `${plan.authorizationResourceTransition.resourceId}_attacker`
              }
            };
          }
        };
      });
      const hostileRuntime = gateway(appPool, harness, handlers);
      const hostileClient = humanClient(
        hostileRuntime,
        identities.tenantOneHuman.authenticationContext
      );
      const before = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                r.version::int AS resource_version,
                (SELECT count(*)::int
                   FROM domain_events e
                  WHERE e.tenant_id = m.tenant_id
                    AND e.aggregate_type = 'mandate'
                    AND e.aggregate_id = m.id) AS event_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2`,
        [TENANT_ONE, tenantOneMandateId]
      );
      await assert.rejects(
        () => hostileClient.revokeDraftMandate(revokeMandateCommand({
          mandateId: tenantOneMandateId,
          idempotencyKey: `revoke-mandate-plan-target-${RUN_ID}-0001`
        })),
        (error) => error.code === "invalid_tenant_command_plan"
      );
      const after = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                r.version::int AS resource_version,
                (SELECT count(*)::int
                   FROM domain_events e
                  WHERE e.tenant_id = m.tenant_id
                    AND e.aggregate_type = 'mandate'
                    AND e.aggregate_id = m.id) AS event_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2`,
        [TENANT_ONE, tenantOneMandateId]
      );
      assert.deepEqual(after.rows, before.rows);
      assert.deepEqual(after.rows, [{
        mandate_status: "draft",
        resource_status: "active",
        resource_version: 1,
        event_count: 1
      }]);
    });

    await t.test("Human revokes one durable draft and Agent observes the terminal state", async () => {
      const created = await tenantOneHuman.createDraftMandate(createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `create-mandate-revocable-${RUN_ID}-0001`
      }));
      const mandateId = created.response.mandateId;
      const command = revokeMandateCommand({
        mandateId,
        idempotencyKey: `revoke-mandate-${RUN_ID}-0001`
      });
      const revoked = await tenantOneHuman.revokeDraftMandate(command);
      assert.equal(revoked.replayed, false);
      assert.equal(revoked.response.mandateId, mandateId);
      assert.equal(revoked.response.status, "revoked");
      assert.equal(revoked.response.reasonCode, "operator_request");

      const replay = await tenantOneHuman.revokeDraftMandate(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, revoked.response);

      const humanView = await tenantOneHuman.getMandate({
        mandateId,
        requestId: `request-human-revoked-mandate-${RUN_ID}`,
        correlationId: `correlation-human-revoked-mandate-${RUN_ID}`
      });
      assert.equal(humanView.response.mandate.status, "revoked");
      const agentView = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-revoked-mandate-${RUN_ID}`,
        correlationId: `correlation-agent-revoked-mandate-${RUN_ID}`
      });
      assert.equal(
        agentView.response.mandates.find((mandate) => mandate.mandateId === mandateId)?.status,
        "revoked"
      );

      const durable = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                r.version::int AS resource_version,
                p.aggregate_version::int AS projection_version,
                (SELECT count(*)::int
                   FROM domain_events e
                  WHERE e.tenant_id = m.tenant_id
                    AND e.aggregate_type = 'mandate'
                    AND e.aggregate_id = m.id) AS event_count,
                (SELECT count(*)::int
                   FROM projection_snapshots s
                  WHERE s.tenant_id = m.tenant_id
                    AND s.entity_type = 'mandate'
                    AND s.entity_id = m.id) AS snapshot_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
           JOIN projection_registry p
             ON p.tenant_id = m.tenant_id
            AND p.entity_type = 'mandate'
            AND p.entity_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2`,
        [TENANT_ONE, mandateId]
      );
      assert.deepEqual(durable.rows, [{
        mandate_status: "revoked",
        resource_status: "closed",
        resource_version: 2,
        projection_version: 2,
        event_count: 2,
        snapshot_count: 2
      }]);

      await assert.rejects(
        () => tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-fresh-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      const afterDenied = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM domain_events
          WHERE tenant_id = $1 AND aggregate_type = 'mandate' AND aggregate_id = $2`,
        [TENANT_ONE, mandateId]
      );
      assert.equal(afterDenied.rows[0].count, 2);
    });

    await t.test("cross-Tenant object reads fail closed and commit only bounded denial audit", async () => {
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      await assert.rejects(
        () => tenantTwoAgent.getSelf({
          subjectId: tenantOneSubjectId,
          requestId: `request-cross-tenant-${RUN_ID}`,
          correlationId: `correlation-cross-tenant-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      assert.equal(after.rows[0].count, before.rows[0].count);
      const denial = await ownerPool.query(
        `SELECT authorization_decision, reason_code, client_ref_hash
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = $2`,
        [TENANT_TWO, `request-cross-tenant-${RUN_ID}`]
      );
      assert.equal(denial.rowCount, 1);
      assert.equal(denial.rows[0].authorization_decision, "deny");
      assert.equal(denial.rows[0].reason_code, "resource_access_denied");
      assert.match(denial.rows[0].client_ref_hash, /^[A-Za-z0-9_-]{43}$/);
      assert.notEqual(denial.rows[0].client_ref_hash, identities.tenantTwoAgent.authenticationContext.clientId);
    });

    await t.test("cross-Tenant, same-Tenant controller, and Agent Mandate management fail closed", async () => {
      const state = () => ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id IN ($1, $2)) AS count,
           (SELECT status FROM mandates WHERE tenant_id = $1 AND id = $3) AS first_status`,
        [TENANT_ONE, TENANT_TWO, tenantOneMandateId]
      );
      const before = await state();
      await assert.rejects(
        () => tenantTwoHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `cross-tenant-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOtherHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `other-controller-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantTwoHuman.getMandate({
          mandateId: tenantOneMandateId,
          requestId: `request-cross-tenant-read-mandate-${RUN_ID}`,
          correlationId: `correlation-cross-tenant-read-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOtherHuman.getMandate({
          mandateId: tenantOneMandateId,
          requestId: `request-other-controller-read-mandate-${RUN_ID}`,
          correlationId: `correlation-other-controller-read-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantTwoHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId: tenantOneMandateId,
          idempotencyKey: `cross-tenant-revoke-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOtherHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId: tenantOneMandateId,
          idempotencyKey: `other-controller-revoke-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantOneAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotCreateDraftMandate",
          resource: { resourceType: "subject", resourceId: tenantOneSubjectId },
          payload: firstMandateCommand.payload,
          idempotencyKey: `agent-created-mandate-${RUN_ID}-0001`,
          requestId: `request-agent-created-mandate-${RUN_ID}`,
          correlationId: `correlation-agent-created-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantOneAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotReadMandate",
          resource: { resourceType: "mandate", resourceId: tenantOneMandateId },
          payload: {},
          requestId: `request-agent-read-mandate-${RUN_ID}`,
          correlationId: `correlation-agent-read-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantOneAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotRevokeDraftMandate",
          resource: { resourceType: "mandate", resourceId: tenantOneMandateId },
          payload: {},
          reasonCode: "operator_request",
          idempotencyKey: `agent-revoke-mandate-${RUN_ID}-0001`,
          requestId: `request-agent-revoke-mandate-${RUN_ID}`,
          correlationId: `correlation-agent-revoke-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const after = await state();
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("Mandate replay is exact, nonce reuse conflicts, and failure releases capacity", async () => {
      const beforeCapacity = await ownerPool.query(
        `SELECT used_count::int AS count
           FROM abuse_capacity_buckets
          WHERE tenant_id = $1 AND kind = 'mandates'`,
        [TENANT_ONE]
      );
      const replay = await tenantOneHuman.createDraftMandate(firstMandateCommand);
      assert.equal(replay.replayed, true);
      assert.equal(replay.response.mandateId, tenantOneMandateId);

      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `mandate-reused-nonce-${RUN_ID}-0001`,
          nonce: firstMandateCommand.payload.nonce
        })),
        (error) => error.code === "mandate_nonce_conflict"
      );
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate({
          ...createMandateCommand({
            subjectId: tenantOneSubjectId,
            idempotencyKey: `mandate-invalid-payload-${RUN_ID}-0001`
          }),
          payload: { ...firstMandateCommand.payload, subjectId: "subject_attacker" }
        }),
        (error) => error.code === "invalid_tenant_protocol_request"
      );
      const capacity = await ownerPool.query(
        `SELECT used_count::int AS count
           FROM abuse_capacity_buckets
          WHERE tenant_id = $1 AND kind = 'mandates'`,
        [TENANT_ONE]
      );
      assert.deepEqual(capacity.rows[0], beforeCapacity.rows[0]);
    });

    await t.test("draft creation rejects suspended or closed Subjects and an inactive Principal", async () => {
      const stateSubject = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "State Guard Treasury Agent",
        idempotencyKey: `create-agent-state-guard-${RUN_ID}-0001`
      }));
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "subject",
        entityId: stateSubject.response.subjectId,
        nextStatus: "suspended",
        idempotencyKey: `suspend-state-subject-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: stateSubject.response.subjectId,
          idempotencyKey: `mandate-suspended-subject-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "subject",
        entityId: stateSubject.response.subjectId,
        nextStatus: "closed",
        idempotencyKey: `close-state-subject-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: stateSubject.response.subjectId,
          idempotencyKey: `mandate-closed-subject-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );

      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "principal",
        entityId: tenantOnePrincipalId,
        nextStatus: "restricted",
        idempotencyKey: `restrict-principal-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `mandate-restricted-principal-${RUN_ID}-0001`
        })),
        (error) => error.code === "principal_not_active"
      );
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "principal",
        entityId: tenantOnePrincipalId,
        nextStatus: "active",
        idempotencyKey: `restore-principal-${RUN_ID}-0001`
      });
    });

    await t.test("cross-Tenant, Developer, and Agent Subject freeze attempts fail closed", async () => {
      const state = () => ownerPool.query(
        "SELECT status FROM subjects WHERE tenant_id = $1 AND id = $2",
        [TENANT_ONE, tenantOneSubjectId]
      );
      const before = await state();
      await assert.rejects(
        () => tenantTwoRisk.freezeSubject(freezeSubjectCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `cross-tenant-freeze-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      for (const [identity, label] of [
        [identities.tenantOneHuman, "developer"],
        [identities.tenantOneAgent, "agent"]
      ]) {
        await assert.rejects(
          () => runtime.execute({
            authenticationContext: identity.authenticationContext,
            operationId: "pilotFreezeSubject",
            payload: {},
            resource: { resourceType: "subject", resourceId: tenantOneSubjectId },
            reasonCode: "risk_limit_breach",
            idempotencyKey: `${label}-freeze-${RUN_ID}-0001`,
            requestId: `request-${label}-freeze-${RUN_ID}`,
            correlationId: `correlation-${label}-freeze-${RUN_ID}`,
            schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION
          }),
          (error) => error.code === "authorization_denied"
        );
      }
      const after = await state();
      assert.deepEqual(after.rows, before.rows);
    });

    await t.test("protective Subject freeze is durable, exactly replayable, and visible to the Agent", async () => {
      const created = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Protective Freeze Agent",
        idempotencyKey: `create-agent-protective-freeze-${RUN_ID}-0001`
      }));
      const command = freezeSubjectCommand({
        subjectId: created.response.subjectId,
        idempotencyKey: `freeze-subject-${RUN_ID}-0001`,
        reasonCode: "security_incident"
      });
      const frozen = await tenantOneRisk.freezeSubject(command);
      assert.equal(frozen.replayed, false);
      assert.equal(frozen.response.previousStatus, "pending");
      assert.equal(frozen.response.status, "suspended");
      assert.equal(frozen.response.reasonCode, "security_incident");

      const replay = await tenantOneRisk.freezeSubject(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, frozen.response);

      const self = await tenantOneAgent.getSelf({
        subjectId: created.response.subjectId,
        requestId: `request-agent-read-frozen-${RUN_ID}`,
        correlationId: `correlation-agent-read-frozen-${RUN_ID}`
      });
      assert.equal(self.response.subject.status, "suspended");
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: created.response.subjectId,
          idempotencyKey: `mandate-frozen-subject-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOperations.freezeSubject(freezeSubjectCommand({
          subjectId: created.response.subjectId,
          idempotencyKey: `fresh-freeze-subject-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );

      const durable = await ownerPool.query(
        `SELECT
           (SELECT status FROM subjects WHERE tenant_id = $1 AND id = $2) AS status,
           (SELECT count(*)::int FROM domain_events
             WHERE tenant_id = $1 AND aggregate_type = 'subject' AND aggregate_id = $2
               AND event_type = 'subject_status_changed') AS freeze_events,
           (SELECT count(*)::int
              FROM tenant_command_executions t
              JOIN domain_events e
                ON e.tenant_id = t.tenant_id
               AND e.id = t.business_event_id
             WHERE t.tenant_id = $1 AND t.operation_id = 'pilotFreezeSubject'
               AND e.aggregate_id = $2) AS executions`,
        [TENANT_ONE, created.response.subjectId]
      );
      assert.deepEqual(durable.rows, [{ status: "suspended", freeze_events: 1, executions: 1 }]);
      const audits = await ownerPool.query(
        `SELECT authorization_decision, reason_code
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = $2
          ORDER BY occurred_at, id`,
        [TENANT_ONE, command.requestId]
      );
      assert.equal(audits.rowCount, 2);
      assert.equal(audits.rows.every((row) => (
        row.authorization_decision === "allow" && row.reason_code === "security_incident"
      )), true);
    });

    await t.test("concurrent protective freezes commit exactly one Subject transition", async () => {
      const created = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Concurrent Freeze Agent",
        idempotencyKey: `create-agent-concurrent-freeze-${RUN_ID}-0001`
      }));
      const settled = await Promise.allSettled([
        tenantOneRisk.freezeSubject(freezeSubjectCommand({
          subjectId: created.response.subjectId,
          idempotencyKey: `concurrent-freeze-risk-${RUN_ID}-0001`,
          reasonCode: "risk_limit_breach"
        })),
        tenantOneOperations.freezeSubject(freezeSubjectCommand({
          subjectId: created.response.subjectId,
          idempotencyKey: `concurrent-freeze-operations-${RUN_ID}-0001`,
          reasonCode: "provider_failure"
        }))
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      const rejected = settled.filter(({ status }) => status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(fulfilled[0].value.response.status, "suspended");
      assert.equal(rejected.length, 1);
      assert.equal([
        "authorization_denied",
        "request_admission_unavailable",
        "stale_aggregate_version"
      ].includes(rejected[0].reason?.code), true);
      const state = await ownerPool.query(
        `SELECT s.status,
                count(e.id)::int AS freeze_events
           FROM subjects s
           JOIN domain_events e
             ON e.tenant_id = s.tenant_id
            AND e.aggregate_type = 'subject'
            AND e.aggregate_id = s.id
            AND e.event_type = 'subject_status_changed'
          WHERE s.tenant_id = $1 AND s.id = $2
          GROUP BY s.status`,
        [TENANT_ONE, created.response.subjectId]
      );
      assert.deepEqual(state.rows, [{ status: "suspended", freeze_events: 1 }]);
    });

    await t.test("protective draft revocation survives suspended Subject and inactive Principal state", async () => {
      const stateSubject = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Revocation Independence Agent",
        idempotencyKey: `create-agent-revoke-independent-${RUN_ID}-0001`
      }));
      assert.equal(stateSubject.response.principalId, tenantOnePrincipalId);
      const draft = await tenantOneHuman.createDraftMandate(createMandateCommand({
        subjectId: stateSubject.response.subjectId,
        idempotencyKey: `create-mandate-revoke-independent-${RUN_ID}-0001`
      }));
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "subject",
        entityId: stateSubject.response.subjectId,
        nextStatus: "suspended",
        idempotencyKey: `suspend-revoke-independent-subject-${RUN_ID}-0001`
      });
      let principalRestricted = false;
      try {
        await transitionProjection({
          pool: appPool,
          tenantId: TENANT_ONE,
          actorId: identities.tenantOneHuman.authenticationContext.actorId,
          entityType: "principal",
          entityId: tenantOnePrincipalId,
          nextStatus: "restricted",
          idempotencyKey: `restrict-revoke-independent-principal-${RUN_ID}-0001`
        });
        principalRestricted = true;
        const revoked = await tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId: draft.response.mandateId,
          reasonCode: "security_incident",
          idempotencyKey: `revoke-independent-mandate-${RUN_ID}-0001`
        }));
        assert.equal(revoked.response.status, "revoked");
        assert.equal(revoked.response.reasonCode, "security_incident");
      } finally {
        if (principalRestricted) {
          await transitionProjection({
            pool: appPool,
            tenantId: TENANT_ONE,
            actorId: identities.tenantOneHuman.authenticationContext.actorId,
            entityType: "principal",
            entityId: tenantOnePrincipalId,
            nextStatus: "active",
            idempotencyKey: `restore-revoke-independent-principal-${RUN_ID}-0001`
          });
        }
      }
      const view = await tenantOneHuman.getMandate({
        mandateId: draft.response.mandateId,
        requestId: `request-read-revoke-independent-${RUN_ID}`,
        correlationId: `correlation-read-revoke-independent-${RUN_ID}`
      });
      assert.equal(view.response.mandate.status, "revoked");
    });

    await t.test("concurrent Subject suspension cannot race a draft Mandate into existence", async () => {
      const raceSubject = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Concurrent State Guard Agent",
        idempotencyKey: `create-agent-state-race-${RUN_ID}-0001`
      }));
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const eventRepository = new PostgresEventRepository({ pool: appPool, tenantContext: context });
      const coreRepository = new PostgresCoreRepository({ pool: appPool, eventRepository });
      const subject = await coreRepository.getSubject(raceSubject.response.subjectId);
      const registration = await coreRepository.getProjectionRegistration(
        "subject",
        raceSubject.response.subjectId
      );
      const transitionAt = new Date();
      const event = createCreditEvent({
        eventType: CreditEventType.SUBJECT_STATUS_CHANGED,
        subjectId: subject.subjectId,
        payload: { previousStatus: subject.status, nextStatus: "suspended" },
        now: transitionAt
      });
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      const client = await appPool.connect();
      let committed = false;
      try {
        await client.query("BEGIN");
        await setTenantTransactionContext(client, context);
        await coreRepository.commitCommandInTransaction(client, {
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          idempotencyKey: `suspend-race-subject-${RUN_ID}-0001`,
          commandHash: hashId("gateway_test_subject_race", subject.subjectId),
          events: [{
            aggregateType: "subject",
            aggregateId: subject.subjectId,
            expectedVersion: registration.aggregateVersion,
            event
          }],
          writes: [{
            type: "subject",
            value: { ...subject, status: "suspended", updatedAt: transitionAt.toISOString() },
            eventId: event.eventId
          }],
          response: { subjectId: subject.subjectId, status: "suspended" }
        });
        const command = tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: subject.subjectId,
          idempotencyKey: `mandate-state-race-${RUN_ID}-0001`
        }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await client.query("COMMIT");
        committed = true;
        await assert.rejects(
          command,
          (error) => ["authorization_denied", "stale_aggregate_version"].includes(error.code)
        );
      } finally {
        if (!committed) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original failure.
          }
        }
        client.release();
      }
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("same-Tenant Human cannot claim an Agent assigned to another controller", async () => {
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      await assert.rejects(
        () => tenantOneOtherHuman.createAgentSubject(createCommand({
          subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
          displayName: "Controller Claim Must Fail",
          idempotencyKey: `create-agent-controller-denied-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_resource_rejected"
      );
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("process restart recovers exact response before mutable object revalidation", async () => {
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      const restarted = gateway(appPool, harness);
      const replay = await humanClient(
        restarted,
        identities.tenantOneHuman.authenticationContext
      ).createAgentSubject(firstCommand);
      assert.equal(replay.replayed, true);
      assert.equal(replay.response.subjectId, tenantOneSubjectId);

      await assert.rejects(
        () => humanClient(restarted, identities.tenantOneHuman.authenticationContext).createAgentSubject({
          ...firstCommand,
          payload: { ...firstCommand.payload, displayName: "Tampered Retry" }
        }),
        (error) => error.code === "event_idempotency_conflict"
      );
      const counts = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      assert.deepEqual(counts.rows[0], before.rows[0]);
    });

    await t.test("Tenant authority derives from context for every implemented object operation", async () => {
      const secondCommand = createCommand({
        subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
        displayName: "Tenant Two Treasury Agent",
        idempotencyKey: `create-agent-two-${RUN_ID}-0001`
      });
      const created = await tenantTwoHuman.createAgentSubject(secondCommand);
      const subjectId = created.response.subjectId;
      const own = await tenantTwoAgent.getSelf({
        subjectId,
        requestId: `request-agent-two-self-${RUN_ID}`,
        correlationId: `correlation-agent-two-self-${RUN_ID}`
      });
      assert.equal(own.response.subject.subjectId, subjectId);
      await assert.rejects(
        () => tenantOneAgent.getSelf({
          subjectId,
          requestId: `request-agent-one-cross-${RUN_ID}`,
          correlationId: `correlation-agent-one-cross-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
    });

    await t.test("authorization denial creates no business projection", async () => {
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantTwoAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotCreateAgentSubject",
          payload: {
            subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
            displayName: "Unauthorized Agent Creation"
          },
          idempotencyKey: `unauthorized-create-${RUN_ID}-0001`,
          requestId: `request-unauthorized-create-${RUN_ID}`,
          correlationId: `correlation-unauthorized-create-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      assert.equal(after.rows[0].count, before.rows[0].count);
      const audit = await ownerPool.query(
        `SELECT authorization_decision, reason_code
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = $2`,
        [TENANT_TWO, `request-unauthorized-create-${RUN_ID}`]
      );
      assert.deepEqual(audit.rows, [{ authorization_decision: "deny", reason_code: "actor_capability_rejected" }]);
    });

    await t.test("concurrent duplicate mutation executes once and then replays", async () => {
      const concurrentCommand = createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Concurrent Treasury Agent",
        idempotencyKey: `create-agent-concurrent-${RUN_ID}-0001`
      });
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      const settled = await Promise.allSettled([
        tenantOneHuman.createAgentSubject(concurrentCommand),
        tenantOneHuman.createAgentSubject(concurrentCommand)
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      assert.equal(fulfilled.length >= 1, true);
      assert.equal(fulfilled.filter(({ value }) => value.replayed === false).length, 1);
      if (fulfilled.length === 2) {
        assert.equal(fulfilled.filter(({ value }) => value.replayed === true).length, 1);
        assert.equal(fulfilled[0].value.response.subjectId, fulfilled[1].value.response.subjectId);
      }
      const rejected = settled.find(({ status }) => status === "rejected");
      if (rejected) {
        assert.equal(
          ["idempotency_in_progress", "request_admission_consumed"].includes(rejected.reason.code),
          true
        );
      }
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      assert.equal(after.rows[0].events, before.rows[0].events + 1);
      assert.equal(after.rows[0].executions, before.rows[0].executions + 1);
      const replay = await tenantOneHuman.createAgentSubject(concurrentCommand);
      assert.equal(replay.replayed, true);
    });

    await t.test("concurrent Principal nonce reuse creates at most one draft Mandate", async () => {
      const nonce = `concurrent-mandate-nonce-${RUN_ID}`;
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      const settled = await Promise.allSettled([
        tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `concurrent-mandate-a-${RUN_ID}-0001`,
          nonce
        })),
        tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `concurrent-mandate-b-${RUN_ID}-0001`,
          nonce
        }))
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      const rejected = settled.filter(({ status }) => status === "rejected");
      assert.equal(fulfilled.length <= 1, true);
      assert.equal(rejected.length >= 1, true);
      for (const rejection of rejected) {
        assert.equal(
          [
            "mandate_nonce_conflict",
            "request_admission_unavailable",
            "stale_aggregate_version"
          ].includes(rejection.reason?.code),
          true
        );
      }

      const recoveryCommand = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `concurrent-mandate-recovery-${RUN_ID}-0001`,
        nonce
      });
      if (fulfilled.length === 0) {
        const recovery = await tenantOneHuman.createDraftMandate(recoveryCommand);
        assert.equal(recovery.replayed, false);
      } else {
        assert.equal(fulfilled[0].value.replayed, false);
        await assert.rejects(
          tenantOneHuman.createDraftMandate(recoveryCommand),
          (error) => error.code === "mandate_nonce_conflict"
        );
      }
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      assert.equal(after.rows[0].count, before.rows[0].count + 1);
    });

    await t.test("concurrent draft revocation commits at most one terminal transition", async () => {
      const draft = await tenantOneHuman.createDraftMandate(createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `create-mandate-revoke-race-${RUN_ID}-0001`
      }));
      const mandateId = draft.response.mandateId;
      const before = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM domain_events
          WHERE tenant_id = $1 AND aggregate_type = 'mandate' AND aggregate_id = $2`,
        [TENANT_ONE, mandateId]
      );
      const settled = await Promise.allSettled([
        tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-race-a-${RUN_ID}-0001`
        })),
        tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-race-b-${RUN_ID}-0001`
        }))
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      const rejected = settled.filter(({ status }) => status === "rejected");
      assert.equal(fulfilled.length <= 1, true);
      assert.equal(rejected.length >= 1, true);
      for (const rejection of rejected) {
        assert.equal(
          [
            "authorization_denied",
            "request_admission_unavailable",
            "stale_aggregate_version"
          ].includes(rejection.reason?.code),
          true
        );
      }
      if (fulfilled.length === 0) {
        const recovery = await tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-race-recovery-${RUN_ID}-0001`
        }));
        assert.equal(recovery.response.status, "revoked");
      } else {
        assert.equal(fulfilled[0].value.response.status, "revoked");
      }
      const after = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                count(e.id)::int AS event_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
           JOIN domain_events e
             ON e.tenant_id = m.tenant_id
            AND e.aggregate_type = 'mandate'
            AND e.aggregate_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2
          GROUP BY m.status, r.status`,
        [TENANT_ONE, mandateId]
      );
      assert.deepEqual(after.rows, [{
        mandate_status: "revoked",
        resource_status: "closed",
        event_count: before.rows[0].count + 1
      }]);
    });

    await t.test("concurrent Agent membership revocation invalidates resource binding atomically", async () => {
      const context = createTenantSecurityContext({
        tenantId: TENANT_TWO,
        actorId: identities.tenantTwoHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const client = await ownerPool.connect();
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_TWO]
      );
      try {
        await client.query("BEGIN");
        await setTenantTransactionContext(client, context);
        await client.query(
          `UPDATE memberships
              SET status = 'revoked', updated_at = clock_timestamp(), version = version + 1
            WHERE tenant_id = $1 AND actor_id = $2`,
          [TENANT_TWO, identities.tenantTwoAgent.authenticationContext.actorId]
        );
        const command = tenantTwoHuman.createAgentSubject(createCommand({
          subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
          displayName: "Revoked Binding Must Roll Back",
          idempotencyKey: `create-agent-revoked-race-${RUN_ID}-0001`
        }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await client.query("COMMIT");
        await assert.rejects(
          command,
          (error) => ["authorization_resource_rejected", "stale_aggregate_version"].includes(error.code)
        );
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original failure.
        }
        throw error;
      } finally {
        client.release();
      }
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_TWO]
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("Agent self-read caps Mandate summaries and signals continuation", async () => {
      const existing = Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1 AND subject_id = $2",
        [TENANT_ONE, tenantOneSubjectId]
      )).rows[0].count);
      for (let index = existing; index < 51; index += 1) {
        await tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `mandate-page-${RUN_ID}-${String(index).padStart(4, "0")}`
        }));
      }
      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-page-${RUN_ID}`,
        correlationId: `correlation-agent-self-page-${RUN_ID}`
      });
      assert.equal(self.response.mandates.length, 50);
      assert.equal(self.response.hasMoreMandates, true);
      assert.equal(Buffer.byteLength(JSON.stringify(self.response)) < 256 * 1024, true);
    });

    await t.test("Agent self-read fails closed when normalized Mandate projection evidence is missing", async () => {
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const mandateId = `mandate_missing_projection_${RUN_ID}`;
      const createdAt = new Date(Date.now() + 60_000);
      await withTenantTransaction(ownerPool, context, (client) => client.query(
        `INSERT INTO mandates(
           tenant_id, id, mandate_hash, principal_id, subject_id, capabilities,
           allowed_provider_ids, allowed_categories, asset_ids,
           per_action_limit_minor, aggregate_limit_minor, utilized_minor,
           valid_from, expires_at, nonce, terms_ref, status,
           created_at, updated_at, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, '["request_credit"]'::jsonb,
           '[]'::jsonb, '[]'::jsonb,
           '["urn:ipo-one:sandbox-asset:usd-cent"]'::jsonb,
           1, 1, 0, $6, $7, $8, $9, 'draft', $6, $6, 'mandate.v2'
         )`,
        [
          TENANT_ONE,
          mandateId,
          `mandate_missing_projection_hash_${RUN_ID}`,
          tenantOnePrincipalId,
          tenantOneSubjectId,
          createdAt,
          new Date(createdAt.getTime() + 86_400_000),
          `missing-projection-nonce-${RUN_ID}`,
          `urn:ipo.one:test:missing-projection:${RUN_ID}`
        ]
      ));
      try {
        await assert.rejects(
          () => tenantOneAgent.getSelf({
            subjectId: tenantOneSubjectId,
            requestId: `request-agent-self-corrupt-${RUN_ID}`,
            correlationId: `correlation-agent-self-corrupt-${RUN_ID}`
          }),
          (error) => error.code === "projection_integrity_mismatch"
        );
      } finally {
        await withTenantTransaction(ownerPool, context, (client) => client.query(
          "DELETE FROM mandates WHERE tenant_id = $1 AND id = $2",
          [TENANT_ONE, mandateId]
        ));
      }
    });

    await t.test("append-only command authority and audit rows reject tampering", async () => {
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          "UPDATE tenant_command_executions SET operation_id = 'tampered' WHERE tenant_id = $1",
          [TENANT_ONE]
        )),
        /append-only rows cannot be updated or deleted/
      );
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          "DELETE FROM authorization_audit_events WHERE tenant_id = $1",
          [TENANT_ONE]
        )),
        /append-only rows cannot be updated or deleted/
      );
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          "DELETE FROM memberships WHERE tenant_id = $1 AND actor_id = $2",
          [TENANT_ONE, identities.tenantOneAgent.authenticationContext.actorId]
        )),
        /membership deletion is prohibited/
      );
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          `DELETE FROM authorization_resource_bindings
            WHERE tenant_id = $1 AND resource_type = 'subject' AND resource_id = $2`,
          [TENANT_ONE, tenantOneSubjectId]
        )),
        /authorization resource binding deletion is prohibited/
      );
    });

    await t.test("Human Borrower creates and reads one restart-safe pseudonymous self Subject", async () => {
      const command = {
        idempotencyKey: `create-human-self-one-${RUN_ID}-0001`,
        requestId: `request-create-human-self-one-${RUN_ID}`,
        correlationId: `correlation-create-human-self-one-${RUN_ID}`
      };
      const created = await tenantOneBorrower.createHumanSubject(command);
      assert.equal(created.replayed, false);
      assert.equal(created.response.subjectType, "human");
      assert.equal(created.response.prototypeOnly, true);
      tenantOneHumanSubjectId = created.response.subjectId;
      tenantOneHumanPrincipalId = created.response.principalId;
      const replay = await tenantOneBorrower.createHumanSubject(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, created.response);

      const view = await tenantOneBorrower.getHumanSelf({
        subjectId: created.response.subjectId,
        requestId: `request-read-human-self-one-${RUN_ID}`,
        correlationId: `correlation-read-human-self-one-${RUN_ID}`
      });
      assert.equal(view.response.subject.displayName, "Human Credit Profile");
      assert.equal(view.response.subject.prototypeOnly, true);
      assert.deepEqual(view.response.consents, []);
      assert.deepEqual(view.response.identityReferences, []);
      assert.equal(JSON.stringify(view).includes(identities.tenantOneBorrower.authenticationContext.actorId), false);

      for (const denied of [
        () => tenantOneOtherBorrower.getHumanSelf({
          subjectId: created.response.subjectId,
          requestId: `request-other-read-human-self-${RUN_ID}`,
          correlationId: `correlation-other-read-human-self-${RUN_ID}`
        }),
        () => tenantTwoBorrower.getHumanSelf({
          subjectId: created.response.subjectId,
          requestId: `request-cross-read-human-self-${RUN_ID}`,
          correlationId: `correlation-cross-read-human-self-${RUN_ID}`
        }),
        () => tenantOneHuman.createHumanSubject({
          idempotencyKey: `developer-create-human-self-${RUN_ID}-0001`,
          requestId: `request-developer-create-human-self-${RUN_ID}`,
          correlationId: `correlation-developer-create-human-self-${RUN_ID}`
        })
      ]) {
        await assert.rejects(
          denied,
          (error) => error.code === "authorization_denied"
        );
      }
      await assert.rejects(
        () => tenantOneBorrower.createHumanSubject({
          idempotencyKey: `create-human-self-one-${RUN_ID}-0002`,
          requestId: `request-create-human-self-one-fresh-${RUN_ID}`,
          correlationId: `correlation-create-human-self-one-fresh-${RUN_ID}`
        }),
        (error) => error.code === "human_subject_already_exists"
      );

      const tenantTwoCommand = {
        idempotencyKey: `create-human-self-two-${RUN_ID}-0001`,
        requestId: `request-create-human-self-two-${RUN_ID}`,
        correlationId: `correlation-create-human-self-two-${RUN_ID}`
      };
      const concurrent = await executeConcurrentDuplicate(
        () => tenantTwoBorrower.createHumanSubject(tenantTwoCommand)
      );
      assert.deepEqual(concurrent.map((result) => result.replayed).sort(), [false, true]);
      assert.equal(concurrent[0].response.subjectId, concurrent[1].response.subjectId);
      tenantTwoHumanSubjectId = concurrent[0].response.subjectId;
      tenantTwoHumanPrincipalId = concurrent[0].response.principalId;

      const durable = await ownerPool.query(
        `SELECT t.id AS tenant_id,
                count(DISTINCT s.id)::int AS human_subjects,
                count(DISTINCT p.id)::int AS human_principals,
                count(DISTINCT ar.resource_id)::int AS resources,
                count(DISTINCT arb.actor_id)::int AS owner_bindings
           FROM tenants t
           LEFT JOIN subjects s
             ON s.tenant_id = t.id AND s.subject_type = 'human'
           LEFT JOIN principals p
             ON p.tenant_id = t.id AND p.principal_type = 'human_self'
           LEFT JOIN authorization_resources ar
             ON ar.tenant_id = t.id AND ar.resource_type = 'subject'
            AND ar.resource_id = s.id
           LEFT JOIN authorization_resource_bindings arb
             ON arb.tenant_id = t.id AND arb.resource_type = 'subject'
            AND arb.resource_id = s.id AND arb.relationship = 'owner'
          WHERE t.id IN ($1, $2)
          GROUP BY t.id
          ORDER BY t.id`,
        [TENANT_ONE, TENANT_TWO]
      );
      assert.deepEqual(durable.rows, [
        { tenant_id: TENANT_ONE, human_subjects: 1, human_principals: 1, resources: 1, owner_bindings: 1 },
        { tenant_id: TENANT_TWO, human_subjects: 1, human_principals: 1, resources: 1, owner_bindings: 1 }
      ].sort((left, right) => left.tenant_id.localeCompare(right.tenant_id)));
    });

    await t.test("Human and Agent feedback persists as immutable Evidence and reads as Tenant aggregates", async () => {
      assert.ok(tenantOneHumanSubjectId);
      assert.ok(tenantOneSubjectId);
      const humanCommand = {
        subjectId: tenantOneHumanSubjectId,
        payload: {
          surface: "human_application",
          lifecycleStage: "application",
          sentiment: "easy",
          outcome: "completed",
          blockerCode: "none",
          schemaVersion: "pilot_feedback_record.v1"
        },
        idempotencyKey: `pilot-feedback-human-${RUN_ID}-0001`,
        requestId: `request-pilot-feedback-human-${RUN_ID}`,
        correlationId: `correlation-pilot-feedback-human-${RUN_ID}`
      };
      const human = await tenantOneBorrower.submitPilotFeedback(humanCommand);
      assert.equal(human.replayed, false);
      assert.equal(human.response.entryMode, "human");
      assert.equal(JSON.stringify(human.response).includes(tenantOneHumanSubjectId), false);
      assert.deepEqual(
        (await tenantOneBorrower.submitPilotFeedback(humanCommand)).response,
        human.response
      );

      const agent = await tenantOneAgent.submitPilotFeedback({
        subjectId: tenantOneSubjectId,
        payload: {
          surface: "agent_sdk",
          lifecycleStage: "execution",
          sentiment: "blocked",
          outcome: "needs_support",
          blockerCode: "integration",
          schemaVersion: "pilot_feedback_record.v1"
        },
        idempotencyKey: `pilot-feedback-agent-${RUN_ID}-0001`,
        requestId: `request-pilot-feedback-agent-${RUN_ID}`,
        correlationId: `correlation-pilot-feedback-agent-${RUN_ID}`
      });
      assert.equal(agent.response.entryMode, "agent");
      assert.equal(JSON.stringify(agent.response).includes(tenantOneSubjectId), false);

      await assert.rejects(
        () => tenantOneBorrower.submitPilotFeedback({
          ...humanCommand,
          subjectId: tenantOneSubjectId,
          idempotencyKey: `pilot-feedback-cross-owner-${RUN_ID}-0001`,
          requestId: `request-pilot-feedback-cross-owner-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );

      const summary = await tenantOneRiskQuery.getPilotFeedbackSummary({
        portfolioId: TENANT_ONE_RISK_PORTFOLIO,
        requestId: `request-pilot-feedback-summary-one-${RUN_ID}`,
        correlationId: `correlation-pilot-feedback-summary-one-${RUN_ID}`
      });
      assert.equal(summary.response.totalCount, 2);
      assert.deepEqual(summary.response.entryModes, { humanCount: 1, agentCount: 1 });
      assert.equal(summary.response.outcomes.completedCount, 1);
      assert.equal(summary.response.outcomes.needsSupportCount, 1);
      assert.equal(summary.response.sentiments.blockedCount, 1);
      assert.equal(summary.response.blockerCodes.integrationCount, 1);
      assert.equal(JSON.stringify(summary.response).includes("pilotFeedbackId"), false);

      const isolated = await tenantTwoRiskQuery.getPilotFeedbackSummary({
        portfolioId: TENANT_TWO_RISK_PORTFOLIO,
        requestId: `request-pilot-feedback-summary-two-${RUN_ID}`,
        correlationId: `correlation-pilot-feedback-summary-two-${RUN_ID}`
      });
      assert.equal(isolated.response.totalCount, 0);

      const durable = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM pilot_feedback_records
             WHERE tenant_id = $1) AS records,
           (SELECT count(*)::int FROM domain_events
             WHERE tenant_id = $1 AND aggregate_type = 'pilot_feedback') AS events,
           (SELECT count(*)::int FROM evidence_envelopes
             WHERE tenant_id = $1 AND aggregate_type = 'pilot_feedback') AS evidence`,
        [TENANT_ONE]
      );
      assert.deepEqual(durable.rows[0], { records: 2, events: 2, evidence: 2 });
      await assert.rejects(
        () => withTenantTransaction(ownerPool, createTenantSecurityContext({
          tenantId: TENANT_ONE,
          actorId: "actor_feedback_immutability_test",
          policyVersion: "security_001.v1",
          source: "local_test"
        }), (client) => client.query(
          "UPDATE pilot_feedback_records SET sentiment = 'neutral' WHERE tenant_id = $1",
          [TENANT_ONE]
        )),
        /Pilot feedback records are immutable/
      );
    });

    await t.test("Human Borrower owns a durable Consent lifecycle and bounded synthetic Identity view", async () => {
      assert.ok(tenantOneHumanSubjectId);
      assert.ok(tenantOneHumanPrincipalId);
      assert.ok(tenantTwoHumanSubjectId);
      assert.ok(tenantTwoHumanPrincipalId);

      const command = createConsentCommand({
        subjectId: tenantOneHumanSubjectId,
        idempotencyKey: `create-human-consent-one-${RUN_ID}-0001`
      });
      const created = await tenantOneBorrower.createConsent(command);
      assert.equal(created.replayed, false);
      assert.equal(created.response.subjectId, tenantOneHumanSubjectId);
      assert.equal(created.response.consent.status, "active");
      assert.equal(JSON.stringify(created).includes("termsRef"), false);
      assert.equal(JSON.stringify(created).includes("dataUsageRef"), false);

      const replay = await tenantOneBorrower.createConsent(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, created.response);
      const consentId = created.response.consent.consentId;

      const view = await tenantOneBorrower.getConsent({
        consentId,
        requestId: `request-read-human-consent-one-${RUN_ID}`,
        correlationId: `correlation-read-human-consent-one-${RUN_ID}`
      });
      assert.equal(view.response.consent.consentId, consentId);
      assert.equal(view.response.consent.status, "active");

      for (const denied of [
        () => tenantOneOtherBorrower.getConsent({
          consentId,
          requestId: `request-other-read-human-consent-${RUN_ID}`,
          correlationId: `correlation-other-read-human-consent-${RUN_ID}`
        }),
        () => tenantTwoBorrower.getConsent({
          consentId,
          requestId: `request-cross-read-human-consent-${RUN_ID}`,
          correlationId: `correlation-cross-read-human-consent-${RUN_ID}`
        }),
        () => tenantOneHuman.getConsent({
          consentId,
          requestId: `request-developer-read-human-consent-${RUN_ID}`,
          correlationId: `correlation-developer-read-human-consent-${RUN_ID}`
        })
      ]) {
        await assert.rejects(denied, (error) => error.code === "authorization_denied");
      }

      const reference = await seedSyntheticIdentityReference({
        pool: appPool,
        tenantId: TENANT_ONE,
        identity: identities.tenantOneBorrower,
        subjectId: tenantOneHumanSubjectId,
        principalId: tenantOneHumanPrincipalId,
        consentId
      });
      const identityView = await tenantOneBorrower.getIdentityReference({
        identityReferenceId: reference.identityReferenceId,
        requestId: `request-read-human-identity-reference-${RUN_ID}`,
        correlationId: `correlation-read-human-identity-reference-${RUN_ID}`
      });
      assert.equal(
        identityView.response.identityReference.identityReferenceId,
        reference.identityReferenceId
      );
      assert.equal(identityView.response.identityReference.syntheticOnly, true);
      assert.equal(identityView.response.identityReference.productionVerified, false);
      for (const prohibited of ["providerRef", "referenceRef", reference.providerRef, reference.referenceRef]) {
        assert.equal(JSON.stringify(identityView).includes(prohibited), false);
      }
      for (const denied of [
        () => tenantOneOtherBorrower.getIdentityReference({
          identityReferenceId: reference.identityReferenceId,
          requestId: `request-other-read-human-identity-${RUN_ID}`,
          correlationId: `correlation-other-read-human-identity-${RUN_ID}`
        }),
        () => tenantTwoBorrower.getIdentityReference({
          identityReferenceId: reference.identityReferenceId,
          requestId: `request-cross-read-human-identity-${RUN_ID}`,
          correlationId: `correlation-cross-read-human-identity-${RUN_ID}`
        })
      ]) {
        await assert.rejects(denied, (error) => error.code === "authorization_denied");
      }

      const beforeRevocation = await tenantOneBorrower.getHumanSelf({
        subjectId: tenantOneHumanSubjectId,
        requestId: `request-read-human-self-with-consent-${RUN_ID}`,
        correlationId: `correlation-read-human-self-with-consent-${RUN_ID}`
      });
      assert.deepEqual(beforeRevocation.response.consents.map((item) => item.consentId), [consentId]);
      assert.deepEqual(
        beforeRevocation.response.identityReferences.map((item) => item.identityReferenceId),
        [reference.identityReferenceId]
      );

      const revokeCommand = revokeConsentCommand({
        consentId,
        idempotencyKey: `revoke-human-consent-one-${RUN_ID}-0001`
      });
      const revoked = await tenantOneBorrower.revokeConsent(revokeCommand);
      assert.equal(revoked.replayed, false);
      assert.equal(revoked.response.consent.status, "revoked");
      assert.equal(revoked.response.reasonCode, "human_withdrawal");
      assert.equal(JSON.stringify(revoked).includes("revocationEvidenceRef"), false);

      const revokeReplay = await tenantOneBorrower.revokeConsent(revokeCommand);
      assert.equal(revokeReplay.replayed, true);
      assert.deepEqual(revokeReplay.response, revoked.response);
      await assert.rejects(
        () => tenantOneBorrower.revokeConsent(revokeConsentCommand({
          consentId,
          idempotencyKey: `revoke-human-consent-one-${RUN_ID}-0002`
        })),
        (error) => error.code === "authorization_denied"
      );
      const revokedView = await tenantOneBorrower.getConsent({
        consentId,
        requestId: `request-read-revoked-human-consent-${RUN_ID}`,
        correlationId: `correlation-read-revoked-human-consent-${RUN_ID}`
      });
      assert.equal(revokedView.response.consent.status, "revoked");

      const tenantTwoCommand = createConsentCommand({
        subjectId: tenantTwoHumanSubjectId,
        idempotencyKey: `create-human-consent-two-${RUN_ID}-0001`
      });
      const concurrent = await executeConcurrentDuplicate(
        () => tenantTwoBorrower.createConsent(tenantTwoCommand)
      );
      assert.deepEqual(concurrent.map((result) => result.replayed).sort(), [false, true]);
      assert.equal(
        concurrent[0].response.consent.consentId,
        concurrent[1].response.consent.consentId
      );

      const durable = await ownerPool.query(
        `SELECT c.status,
                ar.status AS authorization_status,
                count(DISTINCT arb.actor_id)::int AS owner_bindings,
                count(DISTINCT h.id)::int AS identity_references
           FROM consent_records c
           JOIN authorization_resources ar
             ON ar.tenant_id = c.tenant_id
            AND ar.resource_type = 'consent'
            AND ar.resource_id = c.id
           JOIN authorization_resource_bindings arb
             ON arb.tenant_id = c.tenant_id
            AND arb.resource_type = 'consent'
            AND arb.resource_id = c.id
            AND arb.relationship = 'owner'
           LEFT JOIN human_identity_references h
             ON h.tenant_id = c.tenant_id AND h.consent_id = c.id
          WHERE c.tenant_id = $1 AND c.id = $2
          GROUP BY c.status, ar.status`,
        [TENANT_ONE, consentId]
      );
      assert.deepEqual(durable.rows, [{
        status: "revoked",
        authorization_status: "active",
        owner_bindings: 1,
        identity_references: 1
      }]);
    });

    await t.test("Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes", async () => {
      const humanWorkflowId = `human-credit-offer-postgres-${RUN_ID}`;
      const humanWorkflowCorrelationId = `correlation_human_credit_offer_${RUN_ID}`;
      const consentCreated = await tenantOneBorrower.createConsent(createConsentCommand({
        subjectId: tenantOneHumanSubjectId,
        idempotencyKey: `create-credit-consent-one-${RUN_ID}-0001`,
        overrides: {
          purposes: [
            "credit_application",
            "credit_decision",
            "credit_offer_acceptance",
            "obligation_servicing",
            "identity_reference_use"
          ]
        }
      }));
      const consentId = consentCreated.response.consent.consentId;
      await seedSyntheticIdentityReference({
        pool: appPool,
        tenantId: TENANT_ONE,
        identity: identities.tenantOneBorrower,
        subjectId: tenantOneHumanSubjectId,
        principalId: tenantOneHumanPrincipalId,
        consentId,
        purposeCodes: [
          "identity_reference_use",
          "credit_decision",
          "credit_offer_acceptance"
        ]
      });
      const humanSelf = await tenantOneBorrower.getHumanSelf({
        subjectId: tenantOneHumanSubjectId,
        requestId: `request_human_credit_offer_self_${RUN_ID}`,
        correlationId: humanWorkflowCorrelationId
      });
      const humanCommand = {
        ...requestCreditCommand({
        subjectId: tenantOneHumanSubjectId,
        authorityId: consentId,
        idempotencyKey: `request-human-credit-one-${RUN_ID}-0001`
        }),
        correlationId: humanWorkflowCorrelationId
      };
      const humanConcurrent = await executeConcurrentDuplicate(
        () => tenantOneBorrower.requestCredit(humanCommand)
      );
      assert.deepEqual(humanConcurrent.map((result) => result.replayed).sort(), [false, true]);
      assert.equal(
        humanConcurrent[0].response.creditIntent.creditIntentId,
        humanConcurrent[1].response.creditIntent.creditIntentId
      );
      const humanIntent = humanConcurrent[0].response.creditIntent;
      assert.equal(humanIntent.authorityType, "consent");
      assert.equal(humanIntent.authorityId, consentId);
      assert.equal(humanIntent.sandboxOnly, true);
      assert.equal(humanIntent.productionFundsRequested, false);

      await assert.rejects(
        () => tenantOneBorrower.requestCredit(requestCreditCommand({
          subjectId: tenantOneHumanSubjectId,
          authorityId: consentId,
          idempotencyKey: `request-human-credit-one-${RUN_ID}-0002`
        })),
        (error) => error.code === "credit_intent_already_exists"
      );

      const creditAgentSubject = await tenantOneController.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneCreditAgent.authenticationContext.actorId,
        displayName: "Tenant One Credit Agent",
        idempotencyKey: `create-credit-agent-one-${RUN_ID}-0001`
      }));
      const creditAgentMandate = await tenantOneController.createDraftMandate(createMandateCommand({
        subjectId: creditAgentSubject.response.subjectId,
        idempotencyKey: `create-credit-agent-mandate-${RUN_ID}-0001`,
        overrides: {
          capabilities: [
            "request_credit",
            "accept_credit_offer",
            "execute_sandbox_credit",
            "provider_spend",
            "capture_revenue",
            "route_repayment"
          ],
          allowedProviderIds: ["provider_gateway_compute"],
          allowedCategories: ["compute"],
          perActionLimitMinor: "20000",
          aggregateLimitMinor: "50000"
        }
      }));
      const creditAgentMandateView = await tenantOneController.getMandate({
        mandateId: creditAgentMandate.response.mandateId,
        requestId: `request-read-credit-agent-mandate-${RUN_ID}`,
        correlationId: `correlation-read-credit-agent-mandate-${RUN_ID}`
      });
      const creditAgentApplicationHandoff = createApplicationReadyAgentHandoffManifest(
        creditAgentMandateView.response.mandate
      );
      assert.equal(creditAgentApplicationHandoff.status, "application_ready");
      assert.equal(creditAgentApplicationHandoff.authority.status, "draft");
      const creditAgentMcpHost = createAgentMcpHost({
        client: tenantOneCreditAgent,
        manifest: creditAgentApplicationHandoff
      });
      const agentWorkflowInput = {
        host: creditAgentMcpHost,
        manifest: creditAgentApplicationHandoff,
        creditRequest: {
          assetId: "urn:ipo-one:sandbox-asset:usd-cent",
          requestedPrincipalMinor: "12000",
          purposeCode: "working_capital",
          requestedTermDays: 60,
          repaymentFrequency: "monthly",
          installmentCount: 2
        },
        workflowId: `agent-credit-offer-postgres-${RUN_ID}`
      };
      const agentWorkflow = await runAgentCreditOfferWorkflow(agentWorkflowInput);
      const agentWorkflowReplay = await runAgentCreditOfferWorkflow(agentWorkflowInput);
      assert.equal(agentWorkflow.status, "offer_ready");
      assert.equal(agentWorkflow.steps[1].replayed, false);
      assert.equal(agentWorkflow.steps[3].replayed, false);
      assert.equal(agentWorkflowReplay.steps[1].replayed, true);
      assert.equal(agentWorkflowReplay.steps[3].replayed, true);
      assert.equal(
        agentWorkflowReplay.creditIntent.creditIntentId,
        agentWorkflow.creditIntent.creditIntentId
      );
      const agentIntent = agentWorkflow.creditIntent;
      assert.equal(agentIntent.authorityType, "mandate");
      assert.equal(agentIntent.authorityId, creditAgentMandate.response.mandateId);
      assert.deepEqual(Object.keys(agentIntent), Object.keys(humanIntent));
      const workflowAudit = await ownerPool.query(
        `SELECT operation_id, authorization_decision
           FROM authorization_audit_events
          WHERE tenant_id = $1
            AND actor_id = $2
            AND correlation_id = $3
          ORDER BY id`,
        [
          TENANT_ONE,
          identities.tenantOneCreditAgent.authenticationContext.actorId,
          agentWorkflow.correlationId
        ]
      );
      assert.deepEqual(
        [...new Set(workflowAudit.rows.map((row) => row.operation_id))].sort(),
        [
          "pilotEvaluateCreditApplication",
          "pilotReadAgentSelf",
          "pilotReadCreditApplication",
          "pilotRequestCredit"
        ]
      );
      assert.equal(
        workflowAudit.rows.every((row) => row.authorization_decision === "allow"),
        true
      );

      const persistContinuationCommand = {
        creditOfferId: agentWorkflow.offer.creditOfferId,
        receipt: agentWorkflow,
        idempotencyKey: `persist-agent-continuation-${RUN_ID}-0001`,
        requestId: `request-persist-agent-continuation-${RUN_ID}`,
        correlationId: agentWorkflow.correlationId
      };
      const persistedContinuation = await tenantOneCreditAgent.persistContinuationReceipt(
        persistContinuationCommand
      );
      assert.equal(persistedContinuation.replayed, false);
      assert.equal(persistedContinuation.response.persisted, true);
      assert.equal(persistedContinuation.response.nonAuthorizing, true);
      assert.equal(persistedContinuation.response.productionAuthority, false);
      const persistedContinuationReplay = await tenantOneCreditAgent.persistContinuationReceipt(
        persistContinuationCommand
      );
      assert.equal(persistedContinuationReplay.replayed, true);
      assert.deepEqual(persistedContinuationReplay.response, persistedContinuation.response);
      await assert.rejects(
        () => tenantOneCreditAgent.persistContinuationReceipt({
          ...persistContinuationCommand,
          receipt: {
            ...agentWorkflow,
            offer: {
              ...agentWorkflow.offer,
              creditOfferHash: `0x${"00".repeat(32)}`
            }
          },
          idempotencyKey: `persist-agent-continuation-mismatch-${RUN_ID}-0001`,
          requestId: `request-persist-agent-continuation-mismatch-${RUN_ID}`
        }),
        (error) => error.code === "continuation_receipt_projection_mismatch"
      );
      await assert.rejects(
        () => tenantOneAgent.persistContinuationReceipt({
          ...persistContinuationCommand,
          idempotencyKey: `persist-agent-continuation-cross-actor-${RUN_ID}-0001`,
          requestId: `request-persist-agent-continuation-cross-actor-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );

      const resumedAgentWorkspace = await agentClient(
        gateway(appPool, harness),
        identities.tenantOneCreditAgent.authenticationContext
      ).resumeWorkspace({
        requestId: `request-restart-resume-agent-continuation-${RUN_ID}`,
        correlationId: `correlation-restart-resume-agent-continuation-${RUN_ID}`
      });
      assert.equal(resumedAgentWorkspace.response.workspaceKind, "agent_runtime");
      assert.equal(resumedAgentWorkspace.response.serverTruth, true);
      assert.equal(resumedAgentWorkspace.response.continuationReceipts.length, 1);
      assert.equal(
        resumedAgentWorkspace.response.continuationReceipts[0].continuationReceiptId,
        persistedContinuation.response.continuationReceiptId
      );
      assert.deepEqual(
        resumedAgentWorkspace.response.continuationReceipts[0].receipt,
        agentWorkflow
      );
      const resumedControllerWorkspace = await tenantOneController.resumeWorkspace({
        requestId: `request-controller-resume-agent-continuation-${RUN_ID}`,
        correlationId: `correlation-controller-resume-agent-continuation-${RUN_ID}`
      });
      assert.equal(resumedControllerWorkspace.response.workspaceKind, "principal_controller");
      assert.equal(resumedControllerWorkspace.response.continuationReceipts.length, 1);
      assert.equal(
        resumedControllerWorkspace.response.continuationReceipts[0].continuationReceiptId,
        persistedContinuation.response.continuationReceiptId
      );
      assert.deepEqual(
        resumedControllerWorkspace.response.continuationReceipts[0].receipt,
        agentWorkflow
      );
      const otherAgentWorkspace = await tenantOneAgent.resumeWorkspace({
        requestId: `request-other-agent-resume-continuation-${RUN_ID}`,
        correlationId: `correlation-other-agent-resume-continuation-${RUN_ID}`
      });
      assert.deepEqual(otherAgentWorkspace.response.continuationReceipts, []);
      const otherTenantAgentWorkspace = await tenantTwoContinuationAgent.resumeWorkspace({
        requestId: `request-other-tenant-agent-resume-continuation-${RUN_ID}`,
        correlationId: `correlation-other-tenant-agent-resume-continuation-${RUN_ID}`
      });
      assert.deepEqual(otherTenantAgentWorkspace.response.continuationReceipts, []);

      const continuationContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneCreditAgent.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const continuationRepository = new PostgresCoreRepository({
        pool: appPool,
        eventRepository: new PostgresEventRepository({
          pool: appPool,
          tenantContext: continuationContext
        })
      });
      const expiredContinuation = await continuationRepository.withTenantTransaction(
        (client) => continuationRepository.listActiveWorkspaceContinuationReceiptsInTransaction(
          client,
          {
            actorId: identities.tenantOneCreditAgent.authenticationContext.actorId,
            now: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            limit: 16
          }
        )
      );
      assert.deepEqual(expiredContinuation, []);

      const durableContinuation = await ownerPool.query(
        `SELECT actor_id, subject_id, mandate_id, credit_intent_id,
                risk_decision_id, credit_offer_id, credit_offer_hash,
                offer_aggregate_version::int, status, receipt_payload,
                expires_at > issued_at AS expiry_valid
           FROM workspace_continuation_receipts
          WHERE tenant_id = $1 AND id = $2`,
        [TENANT_ONE, persistedContinuation.response.continuationReceiptId]
      );
      assert.deepEqual(durableContinuation.rows, [{
        actor_id: identities.tenantOneCreditAgent.authenticationContext.actorId,
        subject_id: creditAgentSubject.response.subjectId,
        mandate_id: creditAgentMandate.response.mandateId,
        credit_intent_id: agentWorkflow.creditIntent.creditIntentId,
        risk_decision_id: agentWorkflow.decision.riskDecisionId,
        credit_offer_id: agentWorkflow.offer.creditOfferId,
        credit_offer_hash: agentWorkflow.offer.creditOfferHash,
        offer_aggregate_version: 1,
        status: "active",
        receipt_payload: agentWorkflow,
        expiry_valid: true
      }]);

      await proveAndActivateAgentAccount({
        controller: tenantOneController,
        agent: tenantOneCreditAgent,
        subjectId: creditAgentSubject.response.subjectId,
        privateKey: `0x${"55".repeat(32)}`,
        label: "credit-agent"
      });
      const activatedCreditAgentMandate = await tenantOneController.activateSandboxMandate({
        mandateId: creditAgentMandate.response.mandateId,
        payload: {
          expectedMandateHash: creditAgentMandateView.response.mandate.mandateHash,
          acknowledgedTermsHash: creditAgentMandateView.response.mandate.termsHash,
          acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
        },
        idempotencyKey: `activate-credit-agent-mandate-${RUN_ID}-0001`,
        requestId: `request-activate-credit-agent-mandate-${RUN_ID}`,
        correlationId: `correlation-activate-credit-agent-mandate-${RUN_ID}`
      });
      const creditAgentRuntimeHandoff = createReadyAgentHandoffManifest(
        activatedCreditAgentMandate.response.mandate
      );
      assert.equal(creditAgentRuntimeHandoff.status, "ready");
      assert.equal(creditAgentRuntimeHandoff.authority.status, "active");

      const humanView = await tenantOneBorrower.getCreditApplication({
        creditIntentId: humanIntent.creditIntentId,
        requestId: `request_human_credit_offer_read_${RUN_ID}`,
        correlationId: humanWorkflowCorrelationId
      });
      const agentView = await tenantOneCreditAgent.getCreditApplication({
        creditIntentId: agentIntent.creditIntentId,
        requestId: `request-read-agent-credit-${RUN_ID}`,
        correlationId: `correlation-read-agent-credit-${RUN_ID}`
      });
      assert.equal(humanView.response.decision, null);
      assert.equal(humanView.response.offer, null);
      assert.equal(humanView.response.schemaVersion, "tenant_credit_application_view.v1");
      assert.equal(agentView.response.decision.riskDecisionId, agentWorkflow.decision.riskDecisionId);
      assert.equal(agentView.response.offer.creditOfferId, agentWorkflow.offer.creditOfferId);
      assert.equal(agentView.response.schemaVersion, "tenant_credit_application_view.v1");

      for (const denied of [
        () => tenantOneOtherBorrower.getCreditApplication({
          creditIntentId: humanIntent.creditIntentId,
          requestId: `request-other-read-human-credit-${RUN_ID}`,
          correlationId: `correlation-other-read-human-credit-${RUN_ID}`
        }),
        () => tenantTwoBorrower.getCreditApplication({
          creditIntentId: humanIntent.creditIntentId,
          requestId: `request-cross-read-human-credit-${RUN_ID}`,
          correlationId: `correlation-cross-read-human-credit-${RUN_ID}`
        }),
        () => tenantOneHuman.getCreditApplication({
          creditIntentId: humanIntent.creditIntentId,
          requestId: `request-developer-read-human-credit-${RUN_ID}`,
          correlationId: `correlation-developer-read-human-credit-${RUN_ID}`
        }),
        () => tenantOneAgent.getCreditApplication({
          creditIntentId: agentIntent.creditIntentId,
          requestId: `request-other-agent-read-credit-${RUN_ID}`,
          correlationId: `correlation-other-agent-read-credit-${RUN_ID}`
        }),
        () => tenantTwoAgent.getCreditApplication({
          creditIntentId: agentIntent.creditIntentId,
          requestId: `request-cross-agent-read-credit-${RUN_ID}`,
          correlationId: `correlation-cross-agent-read-credit-${RUN_ID}`
        })
      ]) {
        await assert.rejects(denied, (error) => error.code === "authorization_denied");
      }

      const humanEvaluationCommand = {
        creditIntentId: humanIntent.creditIntentId,
        idempotencyKey: `evaluate-human-credit-${RUN_ID}-0001`,
        requestId: `request-evaluate-human-credit-${RUN_ID}`,
        correlationId: humanWorkflowCorrelationId
      };
      const humanEvaluations = await executeConcurrentDuplicate(
        () => tenantOneBorrower.evaluateCreditApplication(humanEvaluationCommand)
      );
      assert.deepEqual(humanEvaluations.map((result) => result.replayed).sort(), [false, true]);
      assert.deepEqual(humanEvaluations[0].response, humanEvaluations[1].response);
      assert.equal(humanEvaluations[0].response.creditIntent.status, "decided");
      assert.equal(humanEvaluations[0].response.decision.status, "approved");
      assert.equal(
        humanEvaluations[0].response.schemaVersion,
        "tenant_credit_application_evaluated.v2"
      );
      assert.equal(
        humanEvaluations[0].response.decision.decisionPassport.featureSetVersion,
        "credit-application-evidence-features.v1"
      );
      assert.equal(
        humanEvaluations[0].response.decision.decisionPassport.policyHash,
        agentWorkflow.decision.decisionPassport.policyHash
      );
      assert.deepEqual(
        humanEvaluations[0].response.decision.decisionPassport.sourceEvidence.map(({ role }) => role),
        ["credit_intent", "subject", "principal", "authority", "human_identity_reference"]
      );
      assert.deepEqual(
        agentWorkflow.decision.decisionPassport.sourceEvidence.map(({ role }) => role),
        ["credit_intent", "subject", "principal", "authority"]
      );
      assert.equal(
        humanEvaluations[0].response.decision.decisionPassport.sourceEvidence.every(
          ({ sourceFinality }) => sourceFinality === "finalized"
        ),
        true
      );
      assert.equal(humanEvaluations[0].response.decision.sandboxOnly, true);
      assert.equal(humanEvaluations[0].response.decision.productionAuthority, false);
      assert.equal(humanEvaluations[0].response.offer.status, "offered");
      assert.equal(humanEvaluations[0].response.offer.originationFeeMinor, "0");
      assert.equal(humanEvaluations[0].response.offer.productionFundsApproved, false);
      assert.equal(humanEvaluations[0].response.offer.approvedPrincipalMinor, "12000");
      assert.equal(humanEvaluations[0].response.offer.annualRateBps, 900);
      assert.equal(agentWorkflow.offer.approvedPrincipalMinor, "12000");
      assert.equal(agentWorkflow.offer.annualRateBps, 900);

      const passportCreateCommand = {
        subjectId: tenantOneHumanSubjectId,
        payload: {
          creditIntentId: humanIntent.creditIntentId,
          verifierActorId:
            identities.tenantOneOtherBorrower.authenticationContext.actorId,
          claimSelectors: [
            "decision_outcome",
            "factor_authority",
            "canonical_reason_codes"
          ],
          lifetimeSeconds: 900,
          schemaVersion: "credit_passport_artifact_create.v1"
        },
        idempotencyKey: `create-credit-passport-${RUN_ID}-0001`,
        requestId: `request-create-credit-passport-${RUN_ID}`,
        correlationId: `correlation-credit-passport-${RUN_ID}`
      };
      const passportCreates = await executeConcurrentDuplicate(
        () => tenantOneBorrower.createCreditPassportArtifact(passportCreateCommand)
      );
      assert.deepEqual(
        passportCreates.map(({ replayed }) => replayed).sort(),
        [false, true]
      );
      assert.deepEqual(passportCreates[0].response, passportCreates[1].response);
      const firstPassport = passportCreates[0].response.artifact;
      assert.equal(passportCreates[0].response.replaced, false);
      assert.equal(firstPassport.effectiveStatus, "active");
      assert.equal(firstPassport.version, 1);
      assert.equal(firstPassport.purpose, "private_credit_review");
      assert.equal(firstPassport.pointInTime, true);
      assert.equal(firstPassport.nonAuthorizing, true);
      assert.equal(firstPassport.productionAuthority, false);
      assert.equal(firstPassport.piiIncluded, false);
      assert.equal(firstPassport.rawTransactionDataIncluded, false);
      assert.equal(firstPassport.scoreAuthoritative, false);
      assert.deepEqual(
        firstPassport.disclosures.map(({ claim }) => claim),
        firstPassport.selectedClaims
      );
      assert.equal(
        firstPassport.disclosures.every(
          ({ evidenceLineage }) => evidenceLineage.length > 0
        ),
        true
      );
      assert.equal(
        JSON.stringify(passportCreates[0].response).includes(
          identities.tenantOneOtherBorrower.authenticationContext.actorId
        ),
        false
      );

      const passportOwned = await tenantOneBorrower.getOwnCreditPassportArtifact({
        artifactId: firstPassport.creditPassportArtifactId,
        requestId: `request-read-credit-passport-${RUN_ID}`,
        correlationId: `correlation-read-credit-passport-${RUN_ID}`
      });
      assert.equal(
        passportOwned.response.artifact.artifactHash,
        firstPassport.artifactHash
      );
      const verificationPayload = {
        artifactHash: firstPassport.artifactHash,
        artifactVersion: firstPassport.version,
        purpose: "private_credit_review",
        schemaVersion: "credit_passport_verification_request.v1"
      };
      const passportVerified =
        await tenantOneOtherBorrower.verifyCreditPassportArtifact({
          artifactId: firstPassport.creditPassportArtifactId,
          payload: verificationPayload,
          requestId: `request-verify-credit-passport-${RUN_ID}`,
          correlationId: `correlation-verify-credit-passport-${RUN_ID}`
        });
      assert.equal(passportVerified.response.verification.verified, true);
      assert.equal(passportVerified.response.verification.status, "active");
      assert.equal(
        passportVerified.response.artifact.artifactHash,
        firstPassport.artifactHash
      );

      for (const [index, denied] of [
        () => tenantOneOtherHuman.verifyCreditPassportArtifact({
          artifactId: firstPassport.creditPassportArtifactId,
          payload: verificationPayload,
          requestId: `request-wrong-verifier-credit-passport-${RUN_ID}`,
          correlationId: `correlation-wrong-verifier-credit-passport-${RUN_ID}`
        }),
        () => tenantTwoBorrower.verifyCreditPassportArtifact({
          artifactId: firstPassport.creditPassportArtifactId,
          payload: verificationPayload,
          requestId: `request-cross-tenant-credit-passport-${RUN_ID}`,
          correlationId: `correlation-cross-tenant-credit-passport-${RUN_ID}`
        }),
        () => tenantOneOtherBorrower.verifyCreditPassportArtifact({
          artifactId: firstPassport.creditPassportArtifactId,
          payload: {
            ...verificationPayload,
            artifactVersion: firstPassport.version + 1
          },
          requestId: `request-wrong-version-credit-passport-${RUN_ID}`,
          correlationId: `correlation-wrong-version-credit-passport-${RUN_ID}`
        })
      ].entries()) {
        await assert.rejects(
          denied,
          (error) =>
            ["authorization_denied", "tenant_resource_unavailable"].includes(
              error.code
            ),
          `Credit Passport denial ${index} must remain non-enumerating`
        );
      }

      const replacement = await tenantOneBorrower.createCreditPassportArtifact({
        ...passportCreateCommand,
        payload: {
          ...passportCreateCommand.payload,
          claimSelectors: ["source_evidence_lineage"]
        },
        idempotencyKey: `create-credit-passport-${RUN_ID}-0002`,
        requestId: `request-replace-credit-passport-${RUN_ID}`
      });
      const replacementPassport = replacement.response.artifact;
      assert.equal(replacement.response.replaced, true);
      assert.equal(replacementPassport.version, 2);
      assert.equal(
        replacementPassport.supersedesArtifactHash,
        firstPassport.artifactHash
      );
      assert.equal(replacementPassport.supersedesVersion, 1);
      assert.deepEqual(replacementPassport.selectedClaims, [
        "source_evidence_lineage"
      ]);
      await assert.rejects(
        () => tenantOneOtherBorrower.verifyCreditPassportArtifact({
          artifactId: firstPassport.creditPassportArtifactId,
          payload: verificationPayload,
          requestId: `request-superseded-credit-passport-${RUN_ID}`,
          correlationId: `correlation-superseded-credit-passport-${RUN_ID}`
        }),
        (error) => error.code === "tenant_resource_unavailable"
      );
      const replacementResource = await ownerPool.query(
        `SELECT version, status
           FROM authorization_resources
          WHERE tenant_id = $1
            AND resource_type = 'credit_passport_artifact'
            AND resource_id = $2`,
        [TENANT_ONE, replacementPassport.creditPassportArtifactId]
      );
      assert.deepEqual(replacementResource.rows, [{ version: "2", status: "active" }]);

      const revokeCommand = {
        artifactId: replacementPassport.creditPassportArtifactId,
        reasonCode: "owner_withdrawal",
        idempotencyKey: `revoke-credit-passport-${RUN_ID}-0001`,
        requestId: `request-revoke-credit-passport-${RUN_ID}`,
        correlationId: `correlation-revoke-credit-passport-${RUN_ID}`
      };
      const revoked = await tenantOneBorrower.revokeCreditPassportArtifact(
        revokeCommand
      );
      const revokeReplay = await tenantOneBorrower.revokeCreditPassportArtifact(
        revokeCommand
      );
      assert.equal(revoked.replayed, false);
      assert.equal(revokeReplay.replayed, true);
      assert.deepEqual(revokeReplay.response, revoked.response);
      assert.equal(revoked.response.artifact.effectiveStatus, "revoked");
      assert.equal(revoked.response.artifact.version, 3);
      await assert.rejects(
        () => tenantOneOtherBorrower.verifyCreditPassportArtifact({
          artifactId: replacementPassport.creditPassportArtifactId,
          payload: {
            ...verificationPayload,
            artifactHash: revoked.response.artifact.artifactHash,
            artifactVersion: revoked.response.artifact.version
          },
          requestId: `request-revoked-credit-passport-${RUN_ID}`,
          correlationId: `correlation-revoked-credit-passport-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const passportAudit = await ownerPool.query(
        `SELECT c.event_type, c.payload_hash, c.payload_ref
           FROM credit_events c
           JOIN domain_events d
             ON d.tenant_id = c.tenant_id
            AND d.id = c.id
          WHERE c.tenant_id = $1
            AND c.subject_id = $2
            AND c.event_type LIKE 'credit_passport_artifact_%'
          ORDER BY d.aggregate_version, c.id`,
        [TENANT_ONE, tenantOneHumanSubjectId]
      );
      assert.deepEqual(
        passportAudit.rows.map(({ event_type: eventType }) => eventType),
        [
          "credit_passport_artifact_issued",
          "credit_passport_artifact_superseded",
          "credit_passport_artifact_revoked"
        ]
      );
      assert.equal(
        JSON.stringify(passportAudit.rows).includes(
          identities.tenantOneOtherBorrower.authenticationContext.actorId
        ),
        false
      );

      assert.deepEqual(
        Object.keys(agentWorkflow.decision),
        Object.keys(humanEvaluations[0].response.decision)
      );
      assert.deepEqual(
        Object.keys(agentWorkflow.offer),
        Object.keys(humanEvaluations[0].response.offer)
      );
      const humanRequestResult = humanConcurrent.find((result) => result.replayed === false) ?? humanConcurrent[0];
      const humanEvaluationResult = humanEvaluations.find((result) => result.replayed === false) ?? humanEvaluations[0];
      const { authorityId: ignoredAuthorityId, ...humanCreditRequest } = humanCommand.payload;
      assert.equal(ignoredAuthorityId, consentId);
      const humanWorkflow = createHumanCreditOfferWorkflowReceipt({
        consentId,
        creditRequest: humanCreditRequest,
        evaluationStep: {
          correlationId: humanWorkflowCorrelationId,
          requestId: humanEvaluationCommand.requestId,
          result: humanEvaluationResult
        },
        readStep: {
          correlationId: humanWorkflowCorrelationId,
          requestId: `request_human_credit_offer_read_${RUN_ID}`,
          result: humanView
        },
        requestStep: {
          correlationId: humanWorkflowCorrelationId,
          requestId: humanCommand.requestId,
          result: humanRequestResult
        },
        selfStep: {
          correlationId: humanWorkflowCorrelationId,
          requestId: `request_human_credit_offer_self_${RUN_ID}`,
          result: humanSelf
        },
        subjectId: tenantOneHumanSubjectId,
        workflowId: humanWorkflowId
      });
      assert.equal(isHumanCreditOfferWorkflowReceipt(humanWorkflow), true);
      assert.equal(humanWorkflow.status, "offer_ready");
      assert.equal(humanWorkflow.consentId, consentId);
      assert.equal(humanWorkflow.fundsAuthority, false);
      assert.equal(humanWorkflow.credentialsIncluded, false);
      assert.deepEqual(
        humanWorkflow.steps.map((step) => step.operationId),
        [
          "pilotReadHumanSelf",
          "pilotRequestCredit",
          "pilotReadCreditApplication",
          "pilotEvaluateCreditApplication"
        ]
      );
      assert.deepEqual(Object.keys(humanWorkflow.creditIntent), Object.keys(agentWorkflow.creditIntent));
      assert.deepEqual(Object.keys(humanWorkflow.decision), Object.keys(agentWorkflow.decision));
      assert.deepEqual(Object.keys(humanWorkflow.offer), Object.keys(agentWorkflow.offer));
      const dualNativeParity = assertDualNativeCreditOfferParity({
        humanReceipt: humanWorkflow,
        agentReceipt: agentWorkflow
      });
      assert.equal(dualNativeParity.schemaVersion, "dual_native_offer_economics.v1");
      assert.equal(dualNativeParity.matched, true);
      assert.equal(dualNativeParity.economics.creditIntent.requestedPrincipalMinor, "12000");
      assert.equal(dualNativeParity.economics.offer.annualRateBps, 900);
      assert.equal(dualNativeParity.economics.offer.maturityOffsetMs, 60 * 86_400_000);

      const humanOffer = humanEvaluations[0].response.offer;
      const humanAcceptanceCommand = {
        creditOfferId: humanOffer.creditOfferId,
        payload: {
          expectedOfferHash: humanOffer.creditOfferHash,
          expectedTermsHash: humanOffer.termsHash,
          acknowledgementHash: hashId("gateway_human_offer_acknowledgement", {
            offerHash: humanOffer.creditOfferHash,
            termsHash: humanOffer.termsHash
          })
        },
        idempotencyKey: `accept-human-credit-${RUN_ID}-0001`,
        requestId: `request-accept-human-credit-${RUN_ID}`,
        correlationId: `correlation-accept-human-credit-${RUN_ID}`
      };
      const humanAcceptances = await executeConcurrentDuplicate(
        () => tenantOneBorrower.acceptCreditOffer(humanAcceptanceCommand)
      );
      assert.deepEqual(humanAcceptances.map((result) => result.replayed).sort(), [false, true]);
      assert.deepEqual(humanAcceptances[0].response, humanAcceptances[1].response);

      const agentAcceptanceCommand = {
        creditOfferId: agentWorkflow.offer.creditOfferId,
        payload: {
          expectedOfferHash: agentWorkflow.offer.creditOfferHash,
          expectedTermsHash: agentWorkflow.offer.termsHash,
          acknowledgementHash: hashId("gateway_agent_offer_acknowledgement", {
            offerHash: agentWorkflow.offer.creditOfferHash,
            termsHash: agentWorkflow.offer.termsHash
          })
        },
        idempotencyKey: `accept-agent-credit-${RUN_ID}-0001`,
        requestId: `request-accept-agent-credit-${RUN_ID}`,
        correlationId: `correlation-accept-agent-credit-${RUN_ID}`
      };
      const agentAcceptances = await executeConcurrentDuplicate(
        () => tenantOneCreditAgent.acceptCreditOffer(agentAcceptanceCommand)
      );
      assert.deepEqual(agentAcceptances.map((result) => result.replayed).sort(), [false, true]);
      assert.deepEqual(agentAcceptances[0].response, agentAcceptances[1].response);
      const replayInvalidWorkspace = await tenantOneCreditAgent.resumeWorkspace({
        requestId: `request-resume-accepted-offer-continuation-${RUN_ID}`,
        correlationId: `correlation-resume-accepted-offer-continuation-${RUN_ID}`
      });
      assert.deepEqual(replayInvalidWorkspace.response.continuationReceipts, []);

      await continuationRepository.withTenantTransaction(async (client) => {
        const state = await continuationRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.WORKSPACE_CONTINUATION_RECEIPT,
          persistedContinuation.response.continuationReceiptId,
          { lock: true }
        );
        const revokedAt = new Date();
        const event = createCreditEvent({
          eventType: "workspace_continuation_receipt_revoked",
          subjectId: state.value.subjectId,
          payload: {
            continuationReceiptId: state.value.continuationReceiptId,
            receiptHash: state.value.receiptHash,
            reasonCode: "offer_no_longer_current",
            sandboxOnly: true,
            productionAuthority: false
          },
          now: revokedAt
        });
        await continuationRepository.commitCommandInTransaction(client, {
          aggregateType: "workspace_continuation_receipt",
          aggregateId: state.value.continuationReceiptId,
          idempotencyKey: `revoke-agent-continuation-${RUN_ID}-0001`,
          commandHash: hashId("gateway_test_revoke_continuation", state.value.receiptHash),
          events: [{
            aggregateType: "workspace_continuation_receipt",
            aggregateId: state.value.continuationReceiptId,
            expectedVersion: state.aggregateVersion,
            event
          }],
          writes: [{
            type: CoreProjectionType.WORKSPACE_CONTINUATION_RECEIPT,
            value: {
              ...state.value,
              status: "revoked",
              version: state.value.version + 1,
              revokedAt: revokedAt.toISOString(),
              updatedAt: revokedAt.toISOString()
            },
            eventId: event.eventId
          }],
          response: {
            continuationReceiptId: state.value.continuationReceiptId,
            status: "revoked",
            schemaVersion: "workspace_continuation_receipt_revoked.v1"
          }
        });
      });
      const revokedWorkspace = await tenantOneCreditAgent.resumeWorkspace({
        requestId: `request-resume-revoked-continuation-${RUN_ID}`,
        correlationId: `correlation-resume-revoked-continuation-${RUN_ID}`
      });
      assert.deepEqual(revokedWorkspace.response.continuationReceipts, []);

      const humanAcceptance = humanAcceptances[0].response;
      const agentAcceptance = agentAcceptances[0].response;
      for (const accepted of [humanAcceptance, agentAcceptance]) {
        assert.equal(accepted.offerStatus, "accepted");
        assert.equal(accepted.executionCreated, false);
        assert.equal(accepted.fundsAuthority, false);
        assert.equal(accepted.obligation.executionStatus, "pending");
        assert.equal(accepted.obligation.status, "created");
        assert.equal(accepted.obligation.productionFundsMoved, false);
        assert.deepEqual(
          accepted.obligation.installments.map((row) => row.scheduledPrincipalMinor),
          ["6000", "6000"]
        );
      }
      const acceptanceEconomics = (accepted) => ({
        assetId: accepted.obligation.assetId,
        originalPrincipalMinor: accepted.obligation.originalPrincipalMinor,
        annualRateBps: accepted.obligation.annualRateBps,
        repaymentFrequency: accepted.obligation.repaymentFrequency,
        installmentCount: accepted.obligation.installmentCount,
        scheduleSpanMs:
          new Date(accepted.obligation.maturityAt).getTime() -
          new Date(accepted.obligation.firstPaymentAt).getTime(),
        installmentAmounts: accepted.obligation.installments.map(
          (row) => row.scheduledPrincipalMinor
        ),
        executionStatus: accepted.obligation.executionStatus,
        sandboxOnly: accepted.obligation.sandboxOnly
      });
      assert.deepEqual(
        acceptanceEconomics(humanAcceptance),
        acceptanceEconomics(agentAcceptance)
      );

      const humanOwnedObligation = await tenantOneBorrower.getOwnObligation({
        obligationId: humanAcceptance.obligation.obligationId,
        requestId: `request-read-owned-human-obligation-${RUN_ID}`,
        correlationId: `correlation-read-owned-human-obligation-${RUN_ID}`
      });
      const agentOwnedObligation = await tenantOneCreditAgent.getOwnObligation({
        obligationId: agentAcceptance.obligation.obligationId,
        requestId: `request-read-owned-agent-obligation-${RUN_ID}`,
        correlationId: `correlation-read-owned-agent-obligation-${RUN_ID}`
      });
      const controllerOwnedObligation = await tenantOneController.getOwnObligation({
        obligationId: agentAcceptance.obligation.obligationId,
        requestId: `request-read-controlled-agent-obligation-${RUN_ID}`,
        correlationId: `correlation-read-controlled-agent-obligation-${RUN_ID}`
      });
      for (const [view, accepted] of [
        [humanOwnedObligation, humanAcceptance],
        [agentOwnedObligation, agentAcceptance],
        [controllerOwnedObligation, agentAcceptance]
      ]) {
        assert.equal(view.response.schemaVersion, "tenant_owned_obligation_view.v1");
        assert.equal(view.response.obligation.obligationId, accepted.obligation.obligationId);
        assert.equal(view.response.obligation.obligationHash, accepted.obligation.obligationHash);
        assert.equal(view.response.obligation.status, "created");
        assert.equal(view.response.obligation.executionStatus, "pending");
        assert.equal(view.response.latestServicingAction, undefined);
        assert.equal(view.response.sandboxOnly, true);
        assert.equal(view.response.productionFundsMoved, false);
        assert.equal(view.response.withdrawable, false);
      }
      const {
        asOf: controllerObligationAsOf,
        ...controllerObligationState
      } = controllerOwnedObligation.response;
      const {
        asOf: agentObligationAsOf,
        ...agentObligationState
      } = agentOwnedObligation.response;
      assert.deepEqual(controllerObligationState, agentObligationState);
      assert.equal(
        new Date(controllerObligationAsOf).getTime() >=
          new Date(agentObligationAsOf).getTime(),
        true
      );
      const controllerWorkspace = await tenantOneController.resumeWorkspace({
        requestId: `request-resume-controller-agent-obligation-${RUN_ID}`,
        correlationId: `correlation-resume-controller-agent-obligation-${RUN_ID}`
      });
      assert.equal(controllerWorkspace.response.workspaceKind, "principal_controller");
      assert.deepEqual(
        controllerWorkspace.response.controlledAgentActorIds,
        [
          identities.tenantOneControllerAgent.authenticationContext.actorId,
          identities.tenantOneCreditAgent.authenticationContext.actorId
        ].sort()
      );
      assert.deepEqual(
        controllerWorkspace.response.resources.find((resource) =>
          resource.resourceType === "obligation" &&
          resource.resourceId === agentAcceptance.obligation.obligationId
        ),
        {
          resourceType: "obligation",
          resourceId: agentAcceptance.obligation.obligationId,
          relationship: "controller"
        }
      );
      for (const [index, nonOwner] of [
        tenantOneOtherBorrower,
        tenantOneOtherHuman,
        tenantTwoBorrower
      ].entries()) {
        await assert.rejects(
          () => nonOwner.getOwnObligation({
            obligationId: agentAcceptance.obligation.obligationId,
            requestId: `request-denied-owned-obligation-${RUN_ID}-${index}`,
            correlationId: `correlation-denied-owned-obligation-${RUN_ID}`
          }),
          (error) => error.code === "authorization_denied"
        );
      }

      const humanEvidencePageOne = await tenantOneEvidenceQuery.getObligationEvidence({
        obligationId: humanAcceptance.obligation.obligationId,
        limit: 2,
        requestId: `request-read-human-evidence-page-one-${RUN_ID}`,
        correlationId: `correlation-read-human-evidence-${RUN_ID}`
      });
      assert.equal(humanEvidencePageOne.response.items.length, 2);
      assert.equal(humanEvidencePageOne.response.hasMore, true);
      assert.match(humanEvidencePageOne.response.nextCursor, /^[A-Za-z0-9_-]+$/);
      const humanEvidencePageTwo = await tenantOneEvidenceQuery.getObligationEvidence({
        obligationId: humanAcceptance.obligation.obligationId,
        limit: 2,
        cursor: humanEvidencePageOne.response.nextCursor,
        requestId: `request-read-human-evidence-page-two-${RUN_ID}`,
        correlationId: `correlation-read-human-evidence-${RUN_ID}`
      });
      assert.equal(humanEvidencePageTwo.response.items.length, 1);
      assert.equal(humanEvidencePageTwo.response.hasMore, false);
      const humanEvidence = [
        ...humanEvidencePageOne.response.items,
        ...humanEvidencePageTwo.response.items
      ];
      assert.deepEqual(humanEvidence.map((item) => item.eventType).sort(), [
        "credit_offer_acceptance_recorded",
        "credit_offer_accepted",
        "obligation_created"
      ].sort());
      assert.equal(humanEvidence.every(
        (item) => item.obligationId === humanAcceptance.obligation.obligationId
      ), true);
      for (const forbiddenField of [
        "payload",
        "payloadRef",
        "actorRef",
        "idempotencyKey",
        "correlationId",
        "causationId"
      ]) {
        assert.equal(JSON.stringify(humanEvidencePageOne.response).includes(`\"${forbiddenField}\"`), false);
      }
      const humanOwnedEvidence = await tenantOneBorrower.getOwnObligationEvidence({
        obligationId: humanAcceptance.obligation.obligationId,
        limit: 50,
        requestId: `request-read-owned-human-evidence-${RUN_ID}`,
        correlationId: `correlation-read-owned-human-evidence-${RUN_ID}`
      });
      const agentOwnedEvidence = await tenantOneCreditAgent.getOwnObligationEvidence({
        obligationId: agentAcceptance.obligation.obligationId,
        limit: 50,
        requestId: `request-read-owned-agent-evidence-${RUN_ID}`,
        correlationId: `correlation-read-owned-agent-evidence-${RUN_ID}`
      });
      const controllerOwnedEvidence = await tenantOneController.getOwnObligationEvidence({
        obligationId: agentAcceptance.obligation.obligationId,
        limit: 50,
        requestId: `request-read-controller-agent-evidence-${RUN_ID}`,
        correlationId: `correlation-read-controller-agent-evidence-${RUN_ID}`
      });
      assert.equal(humanOwnedEvidence.response.schemaVersion, "tenant_owned_obligation_evidence_view.v1");
      assert.equal(agentOwnedEvidence.response.schemaVersion, "tenant_owned_obligation_evidence_view.v1");
      assert.deepEqual(
        controllerOwnedEvidence.response.items,
        agentOwnedEvidence.response.items
      );
      assert.deepEqual(
        humanOwnedEvidence.response.items,
        humanEvidence
      );
      for (const [index, nonOwner] of [
        tenantOneOtherBorrower,
        tenantOneOtherHuman,
        tenantTwoBorrower
      ].entries()) {
        await assert.rejects(
          () => nonOwner.getOwnObligationEvidence({
            obligationId: agentAcceptance.obligation.obligationId,
            limit: 25,
            requestId: `request-denied-owned-evidence-${RUN_ID}-${index}`,
            correlationId: `correlation-denied-owned-evidence-${RUN_ID}`
          }),
          (error) => error.code === "authorization_denied"
        );
      }
      for (const [index, borrower] of [tenantOneBorrower, tenantOneCreditAgent].entries()) {
        await assert.rejects(
          () => borrower.execute({
            operationId: "pilotReadEvidence",
            payload: {},
            resource: {
              resourceType: "evidence",
              resourceId: humanAcceptance.obligation.obligationId
            },
            requestId: `request-denied-evidence-${RUN_ID}-${index}`,
            correlationId: `correlation-denied-evidence-${RUN_ID}`
          }),
          (error) => error.code === "authorization_denied"
        );
      }

      const officialReportCreate = {
        obligationId: humanAcceptance.obligation.obligationId,
        payload: {
          format: "json",
          lifetimeSeconds: 3600,
          schemaVersion: "official_report_create.v1"
        },
        idempotencyKey: `create-official-report-${RUN_ID}-0001`,
        requestId: `request-create-official-report-${RUN_ID}-0001`,
        correlationId: `correlation-official-report-${RUN_ID}`
      };
      const reportActorContext =
        identities.tenantOneBorrower.authenticationContext;
      assert.equal(
        reportActorContext.capabilities.includes(
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED
        ),
        true
      );
      const reportCredential = await harness.credentialRegistry.assertActive(
        reportActorContext.credentialId,
        new Date()
      );
      assert.equal(
        reportCredential.allowedCapabilities.includes(
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED
        ),
        true
      );
      const reportAuthorityRows = await ownerPool.query(
        `SELECT m.capabilities, b.actor_id, b.relationship
           FROM memberships m
           JOIN authorization_resource_bindings b
             ON b.tenant_id = m.tenant_id
            AND b.actor_id = m.actor_id
          WHERE m.tenant_id = $1
            AND m.actor_id = $2
            AND b.resource_type = 'obligation'
            AND b.resource_id = $3
            AND m.status = 'active'
            AND b.status = 'active'`,
        [
          TENANT_ONE,
          reportActorContext.actorId,
          humanAcceptance.obligation.obligationId
        ]
      );
      assert.equal(reportAuthorityRows.rowCount, 1);
      assert.equal(reportAuthorityRows.rows[0].relationship, "owner");
      assert.equal(
        reportAuthorityRows.rows[0].capabilities.includes(
          PilotCapability.OFFICIAL_REPORT_CREATE_OWNED
        ),
        true
      );
      const officialReportCreates = await executeConcurrentDuplicate(
        () => tenantOneBorrower.createOfficialReport(officialReportCreate)
      );
      assert.deepEqual(
        officialReportCreates.map(({ replayed }) => replayed).sort(),
        [false, true]
      );
      assert.deepEqual(
        officialReportCreates[0].response,
        officialReportCreates[1].response
      );
      const officialReport = officialReportCreates[0].response.report;
      assert.equal(officialReport.effectiveStatus, "active");
      assert.equal(officialReport.browserAuthored, false);
      assert.equal(officialReport.piiIncluded, false);
      assert.equal(officialReport.signedUrlIssued, false);
      assert.equal(officialReport.feeAuditPolicy.productionPolicyAvailable, false);
      assert.equal(officialReport.feeAuditPolicy.principalAsFeeBaseAllowed, false);
      assert.equal(
        officialReport.feeAuditPolicy.unrealizedPnlAsFeeBaseAllowed,
        false
      );
      assert.equal(
        Object.hasOwn(officialReportCreates[0].response, "contentBase64"),
        false
      );

      const officialReportMetadata = await tenantOneBorrower.getOfficialReport({
        officialReportId: officialReport.officialReportId,
        requestId: `request-read-official-report-${RUN_ID}`,
        correlationId: `correlation-read-official-report-${RUN_ID}`
      });
      assert.equal(
        officialReportMetadata.response.report.contentSha256,
        officialReport.contentSha256
      );
      const officialReportRetrieval =
        await tenantOneBorrower.retrieveOfficialReport({
          officialReportId: officialReport.officialReportId,
          requestId: `request-retrieve-official-report-${RUN_ID}`,
          correlationId: `correlation-retrieve-official-report-${RUN_ID}`
        });
      assert.equal(officialReportRetrieval.response.integrityVerified, true);
      const officialReportContent = Buffer.from(
        officialReportRetrieval.response.contentBase64,
        "base64"
      );
      assert.equal(
        `sha256:${createHash("sha256").update(officialReportContent).digest("hex")}`,
        officialReport.contentSha256
      );
      assert.equal(officialReportContent.includes(Buffer.from("<script")), false);
      assert.equal(officialReportContent.includes(Buffer.from("raw_kyc")), true);
      const officialReportDocument = JSON.parse(officialReportContent.toString("utf8"));
      assert.equal(
        officialReportDocument.source.originalPrincipalMinor,
        humanAcceptance.obligation.originalPrincipalMinor
      );
      assert.equal(
        officialReportDocument.source.outstandingPrincipalMinor,
        humanAcceptance.obligation.outstandingPrincipalMinor
      );
      assert.equal(
        officialReportDocument.source.totalRepaidMinor,
        humanAcceptance.obligation.totalRepaidMinor
      );
      assert.equal(officialReportContent.includes(Buffer.from("undefined")), false);
      assert.equal(
        officialReportContent.includes(
          Buffer.from(identities.tenantOneBorrower.authenticationContext.actorId)
        ),
        false
      );

      for (const [index, denied] of [
        () => tenantOneOtherBorrower.retrieveOfficialReport({
          officialReportId: officialReport.officialReportId,
          requestId: `request-denied-official-report-${RUN_ID}-0`,
          correlationId: `correlation-denied-official-report-${RUN_ID}`
        }),
        () => tenantTwoBorrower.retrieveOfficialReport({
          officialReportId: officialReport.officialReportId,
          requestId: `request-cross-tenant-official-report-${RUN_ID}-1`,
          correlationId: `correlation-cross-tenant-official-report-${RUN_ID}`
        })
      ].entries()) {
        await assert.rejects(
          denied,
          (error) =>
            ["authorization_denied", "tenant_resource_unavailable"].includes(
              error.code
            ),
          `Official report denial ${index} must remain non-enumerating`
        );
      }

      const officialReportRevokeCommand = {
        officialReportId: officialReport.officialReportId,
        reasonCode: "owner_withdrawal",
        idempotencyKey: `revoke-official-report-${RUN_ID}-0001`,
        requestId: `request-revoke-official-report-${RUN_ID}`,
        correlationId: `correlation-revoke-official-report-${RUN_ID}`
      };
      const officialReportRevoked =
        await tenantOneBorrower.revokeOfficialReport(
          officialReportRevokeCommand
        );
      const officialReportRevokeReplay =
        await tenantOneBorrower.revokeOfficialReport(
          officialReportRevokeCommand
        );
      assert.equal(officialReportRevoked.replayed, false);
      assert.equal(officialReportRevokeReplay.replayed, true);
      assert.deepEqual(
        officialReportRevokeReplay.response,
        officialReportRevoked.response
      );
      assert.equal(
        officialReportRevoked.response.report.effectiveStatus,
        "revoked"
      );
      await assert.rejects(
        () => tenantOneBorrower.retrieveOfficialReport({
          officialReportId: officialReport.officialReportId,
          requestId: `request-retrieve-revoked-report-${RUN_ID}`,
          correlationId: `correlation-retrieve-revoked-report-${RUN_ID}`
        }),
        (error) =>
          ["authorization_denied", "tenant_resource_unavailable"].includes(
            error.code
          )
      );

      const restartOfficialReport = (
        await tenantOneBorrower.createOfficialReport({
          ...officialReportCreate,
          payload: {
            ...officialReportCreate.payload,
            format: "csv"
          },
          idempotencyKey: `create-official-report-${RUN_ID}-0002`,
          requestId: `request-create-official-report-${RUN_ID}-0002`
        })
      ).response.report;
      assert.equal(restartOfficialReport.effectiveStatus, "active");
      assert.equal(restartOfficialReport.format, "csv");
      const officialReportRows = await ownerPool.query(
        `SELECT status, content_base64, content_sha256, browser_authored,
                pii_included, production_authority
           FROM official_report_artifacts
          WHERE tenant_id = $1
          ORDER BY generated_at, id`,
        [TENANT_ONE]
      );
      assert.equal(officialReportRows.rows.length, 2);
      assert.equal(
        officialReportRows.rows.every(
          (row) =>
            row.content_base64.length > 0 &&
            /^sha256:[0-9a-f]{64}$/.test(row.content_sha256) &&
            row.browser_authored === false &&
            row.pii_included === false &&
            row.production_authority === false
        ),
        true
      );

      const humanWorkflowAudit = await ownerPool.query(
        `SELECT operation_id, authorization_decision
           FROM authorization_audit_events
          WHERE tenant_id = $1
            AND actor_id = $2
            AND correlation_id = $3
          ORDER BY id`,
        [
          TENANT_ONE,
          identities.tenantOneBorrower.authenticationContext.actorId,
          humanWorkflow.correlationId
        ]
      );
      assert.deepEqual(
        [...new Set(humanWorkflowAudit.rows.map((row) => row.operation_id))].sort(),
        [
          "pilotEvaluateCreditApplication",
          "pilotReadCreditApplication",
          "pilotReadHumanSelf",
          "pilotRequestCredit"
        ]
      );
      assert.equal(
        humanWorkflowAudit.rows.every((row) => row.authorization_decision === "allow"),
        true
      );

      const decisionDurability = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM risk_decisions
             WHERE tenant_id = $1 AND schema_version = 'risk_decision.v3' AND status = 'approved') AS decisions,
           (SELECT count(*)::int FROM credit_offers
             WHERE tenant_id = $1 AND sandbox_only AND NOT production_funds_approved) AS offers,
           (SELECT count(*)::int FROM credit_intents
             WHERE tenant_id = $1 AND status = 'decided') AS decided_intents,
           (SELECT count(*)::int FROM credit_events
             WHERE tenant_id = $1 AND event_type = 'risk_decision_created') AS decision_events,
           (SELECT count(*)::int FROM evidence_envelopes
             WHERE tenant_id = $1 AND event_type = 'risk_decision_created') AS decision_evidence,
           (SELECT count(*)::int FROM risk_decisions
             WHERE tenant_id = $1
               AND policy_hash ~ '^0x[0-9a-f]{64}$'
               AND feature_snapshot_hash ~ '^0x[0-9a-f]{64}$'
               AND decision_passport_hash ~ '^0x[0-9a-f]{64}$'
               AND risk_feature_snapshot->>'schemaVersion' = 'risk_feature_snapshot.v1'
               AND decision_passport->>'schemaVersion' = 'risk_decision_passport.v1')
             AS evidence_derived_decisions,
           (SELECT count(*)::int FROM credit_events
             WHERE tenant_id = $1 AND event_type = 'credit_offer_created') AS offer_events,
           (SELECT count(*)::int FROM authorization_resources
             WHERE tenant_id = $1 AND resource_type = 'credit_offer') AS decision_resources,
           (SELECT count(*)::int FROM authorization_resource_bindings
             WHERE tenant_id = $1 AND resource_type = 'credit_offer' AND relationship = 'owner') AS decision_owners,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'credit_decisions') AS capacity`,
        [TENANT_ONE]
      );
      assert.deepEqual(decisionDurability.rows[0], {
        decisions: 2,
        offers: 2,
        decided_intents: 2,
        decision_events: 2,
        decision_evidence: 2,
        evidence_derived_decisions: 2,
        offer_events: 2,
        decision_resources: 2,
        decision_owners: 2,
        capacity: 2
      });
      const borrowerTenantContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneBorrower.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await assert.rejects(
        () => withTenantTransaction(appPool, borrowerTenantContext, (client) => client.query(
          `UPDATE risk_decisions
              SET policy_hash = $2
            WHERE tenant_id = $1 AND id = $3`,
          [
            TENANT_ONE,
            `0x${"0".repeat(64)}`,
            humanEvaluations[0].response.decision.riskDecisionId
          ]
        )),
        (error) => error.code === "23514"
      );

      const acceptanceDurability = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM credit_offer_acceptances
             WHERE tenant_id = $1 AND sandbox_only AND NOT production_authority) AS acceptances,
           (SELECT count(*)::int FROM credit_offers
             WHERE tenant_id = $1 AND status = 'accepted' AND acceptance_id IS NOT NULL) AS accepted_offers,
           (SELECT count(*)::int FROM obligations
             WHERE tenant_id = $1 AND schema_version = 'obligation.v2'
               AND execution_status = 'pending' AND sandbox_only AND NOT production_funds_moved) AS obligations,
           (SELECT count(*)::int FROM obligation_installments
             WHERE tenant_id = $1 AND status = 'scheduled') AS installments,
           (SELECT count(*)::int FROM authorization_resources
             WHERE tenant_id = $1 AND resource_type = 'obligation') AS obligation_resources,
           (SELECT count(*)::int FROM authorization_resource_bindings
             WHERE tenant_id = $1 AND resource_type = 'obligation' AND relationship = 'owner') AS obligation_owners,
           (SELECT count(*)::int FROM authorization_resources
             WHERE tenant_id = $1 AND resource_type = 'evidence') AS evidence_resources,
           (SELECT count(*)::int FROM authorization_resource_bindings
             WHERE tenant_id = $1 AND resource_type = 'evidence' AND relationship = 'owner') AS evidence_owners,
           (SELECT count(*)::int FROM authorization_resource_bindings
             WHERE tenant_id = $1 AND resource_type = 'evidence' AND relationship = 'controller') AS evidence_controllers,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'open_obligations') AS capacity`,
        [TENANT_ONE]
      );
      assert.deepEqual(acceptanceDurability.rows[0], {
        acceptances: 2,
        accepted_offers: 2,
        obligations: 2,
        installments: 4,
        obligation_resources: 2,
        obligation_owners: 2,
        evidence_resources: 2,
        evidence_owners: 2,
        evidence_controllers: 1,
        capacity: 2
      });

      const humanExecutionCommand = {
        obligationId: humanAcceptance.obligation.obligationId,
        idempotencyKey: `execute-human-sandbox-credit-${RUN_ID}-0001`,
        requestId: `request-execute-human-sandbox-credit-${RUN_ID}`,
        correlationId: `correlation-execute-human-sandbox-credit-${RUN_ID}`
      };
      const humanExecutions = await executeConcurrentDuplicate(
        () => tenantOneBorrower.executeSandboxObligation(humanExecutionCommand)
      );
      const agentExecutionCommand = {
        obligationId: agentAcceptance.obligation.obligationId,
        payload: {
          providerId: "provider_gateway_compute",
          providerCategory: "compute"
        },
        idempotencyKey: `execute-agent-sandbox-credit-${RUN_ID}-0001`,
        requestId: `request-execute-agent-sandbox-credit-${RUN_ID}`,
        correlationId: `correlation-execute-agent-sandbox-credit-${RUN_ID}`
      };
      for (const [label, payload] of [
        ["missing", {}],
        ["provider", {
          providerId: "provider_not_allowlisted",
          providerCategory: "compute"
        }],
        ["category", {
          providerId: "provider_gateway_compute",
          providerCategory: "unrestricted"
        }]
      ]) {
        await assert.rejects(
          () => tenantOneCreditAgent.executeSandboxObligation({
            obligationId: agentAcceptance.obligation.obligationId,
            payload,
            idempotencyKey: `execute-agent-sandbox-credit-${label}-${RUN_ID}`,
            requestId: `request-execute-agent-sandbox-credit-${label}-${RUN_ID}`,
            correlationId: `correlation-execute-agent-sandbox-credit-${RUN_ID}`
          }),
          (error) => error.code === "credit_facility_scope_mismatch"
        );
      }
      const agentExecutions = await executeConcurrentDuplicate(
        () => tenantOneCreditAgent.executeSandboxObligation(agentExecutionCommand)
      );
      for (const executions of [humanExecutions, agentExecutions]) {
        assert.deepEqual(executions.map((result) => result.replayed).sort(), [false, true]);
        assert.deepEqual(executions[0].response, executions[1].response);
        assert.equal(executions[0].response.obligation.executionStatus, "executed");
        assert.equal(executions[0].response.obligation.status, "active");
        assert.equal(executions[0].response.executionReceipt.withdrawable, false);
        assert.equal(executions[0].response.productionFundsMoved, false);
      }
      assert.equal(
        agentExecutions[0].response.executionReceipt.providerId,
        "provider_gateway_compute"
      );
      assert.equal(agentExecutions[0].response.executionReceipt.providerCategory, "compute");
      assert.equal(agentExecutions[0].response.executionReceipt.purposeCode, "working_capital");

      const humanRepaymentCommand = {
        obligationId: humanAcceptance.obligation.obligationId,
        payload: { amountMinor: "3000", sourceCode: "synthetic_bank" },
        idempotencyKey: `repay-human-sandbox-credit-${RUN_ID}-0001`,
        requestId: `request-repay-human-sandbox-credit-${RUN_ID}`,
        correlationId: `correlation-repay-human-sandbox-credit-${RUN_ID}`
      };
      const humanRepayments = await executeConcurrentDuplicate(
        () => tenantOneBorrower.postSandboxRepayment(humanRepaymentCommand)
      );
      const agentRepaymentCommand = {
        obligationId: agentAcceptance.obligation.obligationId,
        payload: { amountMinor: "3000", sourceCode: "synthetic_revenue" },
        idempotencyKey: `repay-agent-sandbox-credit-${RUN_ID}-0001`,
        requestId: `request-repay-agent-sandbox-credit-${RUN_ID}`,
        correlationId: `correlation-repay-agent-sandbox-credit-${RUN_ID}`
      };
      const agentRepayments = await executeConcurrentDuplicate(
        () => tenantOneCreditAgent.postSandboxRepayment(agentRepaymentCommand)
      );
      for (const result of agentRepayments) {
        assert.equal(result.response.revenueCapture.capturedMinor, "3000");
        assert.equal(
          result.response.revenueCapture.automaticRepaymentId,
          result.response.repayment.repaymentId
        );
        assert.equal(result.response.revenueCapture.cashflowRoute, "automatic_repayment_only");
        assert.equal(result.response.revenueCapture.withdrawable, false);
      }
      for (const repayments of [humanRepayments, agentRepayments]) {
        assert.deepEqual(repayments.map((result) => result.replayed).sort(), [false, true]);
        assert.deepEqual(repayments[0].response, repayments[1].response);
        assert.equal(repayments[0].response.repayment.requestedMinor, "3000");
        assert.equal(repayments[0].response.repayment.appliedFeeMinor, "0");
        assert.equal(repayments[0].response.repayment.appliedInterestMinor, "0");
        assert.equal(repayments[0].response.repayment.appliedPrincipalMinor, "3000");
        assert.equal(repayments[0].response.obligation.outstandingPrincipalMinor, "9000");
        assert.equal(repayments[0].response.obligation.status, "partially_repaid");
        assert.equal(repayments[0].response.withdrawable, false);
      }

      const agentLockboxDurability = await ownerPool.query(
        `SELECT l.id, l.lockbox_hash, l.subject_id, l.principal_id,
                l.mandate_id, l.credit_intent_id, l.credit_offer_id,
                l.obligation_id, l.credit_line_id, l.account_binding_id,
                l.chain_id, l.asset_id, l.account_ref, l.purpose_code,
                l.allowed_provider_ids, l.status, l.sandbox_only,
                l.production_funds_moved, l.withdrawable,
                l.custody_authority, l.unrestricted_transfers_allowed,
                balance.account_type AS balance_account_type,
                repayment.account_type AS repayment_account_type
           FROM lockboxes l
           JOIN ledger_accounts balance
             ON balance.tenant_id = l.tenant_id
            AND balance.id = l.ledger_account_id
           JOIN ledger_accounts repayment
             ON repayment.tenant_id = l.tenant_id
            AND repayment.id = l.repayment_ledger_account_id
          WHERE l.tenant_id = $1 AND l.obligation_id = $2`,
        [TENANT_ONE, agentAcceptance.obligation.obligationId]
      );
      assert.equal(agentLockboxDurability.rowCount, 1);
      const agentLockboxRow = agentLockboxDurability.rows[0];
      const agentLockboxId = agentLockboxRow.id;
      const agentCreditLineId = agentLockboxRow.credit_line_id;
      assert.match(agentLockboxRow.lockbox_hash, /^0x[0-9a-f]{64}$/);
      assert.equal(agentLockboxRow.subject_id, creditAgentSubject.response.subjectId);
      assert.equal(agentLockboxRow.mandate_id, creditAgentMandate.response.mandateId);
      assert.equal(agentLockboxRow.credit_intent_id, agentIntent.creditIntentId);
      assert.equal(agentLockboxRow.credit_offer_id, agentWorkflow.offer.creditOfferId);
      assert.equal(agentLockboxRow.obligation_id, agentAcceptance.obligation.obligationId);
      assert.equal(agentLockboxRow.chain_id, "eip155:84532");
      assert.equal(agentLockboxRow.purpose_code, "working_capital");
      assert.deepEqual(agentLockboxRow.allowed_provider_ids, ["provider_gateway_compute"]);
      assert.equal(agentLockboxRow.status, "active");
      assert.equal(agentLockboxRow.sandbox_only, true);
      assert.equal(agentLockboxRow.production_funds_moved, false);
      assert.equal(agentLockboxRow.withdrawable, false);
      assert.equal(agentLockboxRow.custody_authority, false);
      assert.equal(agentLockboxRow.unrestricted_transfers_allowed, false);
      assert.equal(agentLockboxRow.balance_account_type, "principal_receivable");
      assert.equal(agentLockboxRow.repayment_account_type, "repayment_clearing");

      const [creditLineEventRows, creditLineSnapshotRows] = await Promise.all([
        ownerPool.query(
          `SELECT event_type, payload
             FROM domain_events
            WHERE tenant_id = $1
              AND obligation_id = $2
              AND event_type IN ('credit_line_utilized', 'credit_line_released')
            ORDER BY recorded_at, aggregate_version`,
          [TENANT_ONE, agentAcceptance.obligation.obligationId]
        ),
        ownerPool.query(
          `SELECT payload
             FROM projection_snapshots
            WHERE tenant_id = $1
              AND entity_type = 'credit_line'
              AND entity_id = $2
            ORDER BY recorded_at DESC, write_sequence DESC
            LIMIT 1`,
          [TENANT_ONE, agentCreditLineId]
        )
      ]);
      const replayedCreditLine = replayAgentCreditLineProjection(
        creditLineEventRows.rows.map((row) => ({
          eventType: row.event_type,
          payload: row.payload
        }))
      );
      assert.equal(creditLineSnapshotRows.rowCount, 1);
      assert.deepEqual(replayedCreditLine, creditLineSnapshotRows.rows[0].payload);
      assert.equal(verifyCreditLineProjection(replayedCreditLine), true);
      assert.equal(replayedCreditLine.utilizedMinor, "9000");
      assert.equal(replayedCreditLine.limitMinor, "12000");
      assert.equal(replayedCreditLine.schemaVersion, "credit_line.v2");

      const agentTenantContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneCreditAgent.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await assert.rejects(
        () => withTenantTransaction(appPool, agentTenantContext, (client) => client.query(
          "UPDATE lockboxes SET withdrawable = TRUE WHERE id = $1",
          [agentLockboxId]
        )),
        (error) => error.code === "23514"
      );

      const humanServicingView = await tenantOneBorrower.getOwnObligation({
        obligationId: humanAcceptance.obligation.obligationId,
        requestId: `request-read-serviced-human-obligation-${RUN_ID}`,
        correlationId: `correlation-read-serviced-human-obligation-${RUN_ID}`
      });
      const agentServicingView = await tenantOneCreditAgent.getOwnObligation({
        obligationId: agentAcceptance.obligation.obligationId,
        requestId: `request-read-serviced-agent-obligation-${RUN_ID}`,
        correlationId: `correlation-read-serviced-agent-obligation-${RUN_ID}`
      });
      for (const view of [humanServicingView, agentServicingView]) {
        assert.equal(view.response.obligation.status, "partially_repaid");
        assert.equal(view.response.obligation.executionStatus, "executed");
        assert.equal(view.response.obligation.outstandingPrincipalMinor, "9000");
        assert.equal(view.response.latestServicingAction.actionType, "advance");
        assert.equal(view.response.latestServicingAction.source, "repayment");
        assert.equal(
          view.response.latestServicingAction.balancesAfter.outstandingPrincipalMinor,
          "9000"
        );
        assert.equal(view.response.latestServicingAction.sandboxOnly, true);
        assert.equal(view.response.latestServicingAction.productionFundsMoved, false);
        assert.match(view.response.asOf, /^\d{4}-\d{2}-\d{2}T/);
      }

      const executionDurability = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM sandbox_execution_receipts
             WHERE tenant_id = $1 AND sandbox_only AND NOT production_funds_moved
               AND NOT withdrawable) AS receipts,
           (SELECT count(*)::int FROM sandbox_execution_receipts
             WHERE tenant_id = $1
               AND provider_id = 'provider_gateway_compute'
               AND provider_category = 'compute'
               AND purpose_code = 'working_capital') AS provider_bound_receipts,
           (SELECT count(*)::int FROM ledger_accounts
             WHERE tenant_id = $1 AND owner_type = 'obligation') AS accounts,
           (SELECT count(*)::int FROM ledger_transactions
             WHERE tenant_id = $1 AND transaction_type = 'sandbox_credit_execution') AS executions,
           (SELECT count(*)::int FROM ledger_transactions
             WHERE tenant_id = $1 AND transaction_type = 'sandbox_repayment') AS repayments,
           (SELECT count(*)::int FROM repayment_events
             WHERE tenant_id = $1 AND schema_version = 'repayment.v2') AS repayment_events,
           (SELECT count(*)::int FROM credit_events
             WHERE tenant_id = $1 AND event_type = 'revenue_captured') AS revenue_captures,
           (SELECT count(*)::int FROM obligations
             WHERE tenant_id = $1 AND execution_status = 'executed'
               AND status = 'partially_repaid' AND outstanding_minor = 9000) AS partial_obligations,
           (SELECT count(*)::int FROM obligation_installments
             WHERE tenant_id = $1 AND status = 'partial') AS partial_installments,
           (SELECT bool_and(debit_total_minor = credit_total_minor)
              FROM ledger_transactions
             WHERE tenant_id = $1
               AND transaction_type IN ('sandbox_credit_execution', 'sandbox_repayment')) AS balanced`,
        [TENANT_ONE]
      );
      assert.deepEqual(executionDurability.rows[0], {
        receipts: 2,
        provider_bound_receipts: 1,
        accounts: 16,
        executions: 2,
        repayments: 2,
        repayment_events: 2,
        revenue_captures: 1,
        partial_obligations: 2,
        partial_installments: 2,
        balanced: true
      });

      const durable = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM credit_intents WHERE tenant_id = $1) AS intents,
           (SELECT count(*)::int FROM credit_intents
             WHERE tenant_id = $1 AND sandbox_only AND NOT production_funds_requested) AS sandbox_intents,
           (SELECT count(*)::int FROM authorization_resources
             WHERE tenant_id = $1 AND resource_type = 'credit_intent') AS resources,
           (SELECT count(*)::int FROM authorization_resource_bindings
             WHERE tenant_id = $1 AND resource_type = 'credit_intent' AND relationship = 'owner') AS owners,
           (SELECT count(*)::int FROM credit_events
             WHERE tenant_id = $1 AND event_type = 'credit_intent_created') AS credit_events,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'credit_intents') AS capacity`,
        [TENANT_ONE]
      );
      assert.deepEqual(durable.rows[0], {
        intents: 2,
        sandbox_intents: 2,
        resources: 2,
        owners: 2,
        credit_events: 2,
        capacity: 2
      });

      const restartedRuntime = gateway(appPool, harness);
      const restartedHuman = humanClient(
        restartedRuntime,
        identities.tenantOneBorrower.authenticationContext
      );
      const restartedAgent = agentClient(
        restartedRuntime,
        identities.tenantOneCreditAgent.authenticationContext
      );
      const restartedOfficialReport =
        await restartedHuman.retrieveOfficialReport({
          officialReportId: restartOfficialReport.officialReportId,
          requestId: `request-restart-retrieve-official-report-${RUN_ID}`,
          correlationId: `correlation-restart-official-report-${RUN_ID}`
        });
      assert.equal(restartedOfficialReport.response.integrityVerified, true);
      assert.equal(restartedOfficialReport.response.report.format, "csv");
      assert.equal(
        restartedOfficialReport.response.report.contentSha256,
        restartOfficialReport.contentSha256
      );
      const restartedHumanView = await restartedHuman.getCreditApplication({
        creditIntentId: humanIntent.creditIntentId,
        requestId: `request-restart-human-credit-${RUN_ID}`,
        correlationId: `correlation-restart-human-credit-${RUN_ID}`
      });
      const restartedAgentView = await restartedAgent.getCreditApplication({
        creditIntentId: agentIntent.creditIntentId,
        requestId: `request-restart-agent-credit-${RUN_ID}`,
        correlationId: `correlation-restart-agent-credit-${RUN_ID}`
      });
      assert.equal(restartedHumanView.response.creditIntent.creditIntentHash, humanIntent.creditIntentHash);
      assert.equal(restartedAgentView.response.creditIntent.creditIntentHash, agentIntent.creditIntentHash);
      assert.equal(restartedHumanView.response.decision.status, "approved");
      assert.equal(restartedHumanView.response.offer.status, "accepted");
      assert.equal(restartedAgentView.response.offer.status, "accepted");
      const restartedHumanOwnedObligation = await restartedHuman.getOwnObligation({
        obligationId: humanAcceptance.obligation.obligationId,
        requestId: `request-restart-read-human-obligation-${RUN_ID}`,
        correlationId: `correlation-restart-read-human-obligation-${RUN_ID}`
      });
      const restartedAgentOwnedObligation = await restartedAgent.getOwnObligation({
        obligationId: agentAcceptance.obligation.obligationId,
        requestId: `request-restart-read-agent-obligation-${RUN_ID}`,
        correlationId: `correlation-restart-read-agent-obligation-${RUN_ID}`
      });
      for (const view of [restartedHumanOwnedObligation, restartedAgentOwnedObligation]) {
        assert.equal(view.response.schemaVersion, "tenant_owned_obligation_view.v1");
        assert.equal(view.response.obligation.status, "partially_repaid");
        assert.equal(view.response.obligation.outstandingPrincipalMinor, "9000");
        assert.equal(view.response.latestServicingAction.actionType, "advance");
        assert.equal(view.response.latestServicingAction.source, "repayment");
        assert.equal(
          view.response.latestServicingAction.balancesAfter.outstandingPrincipalMinor,
          "9000"
        );
      }
      const restartedHumanRepository = new PostgresCoreRepository({
        pool: appPool,
        eventRepository: new PostgresEventRepository({
          pool: appPool,
          tenantContext: createTenantSecurityContext({
            tenantId: TENANT_ONE,
            actorId: identities.tenantOneBorrower.authenticationContext.actorId,
            policyVersion: "security_001.v1",
            source: "local_test"
          })
        })
      });
      const restartedHumanObligation = await restartedHumanRepository.getObligation(
        humanAcceptance.obligation.obligationId
      );
      assert.equal(restartedHumanObligation.obligationHash, humanAcceptance.obligation.obligationHash);
      assert.equal(restartedHumanObligation.executionStatus, "executed");
      assert.equal(restartedHumanObligation.status, "partially_repaid");
      assert.equal(restartedHumanObligation.outstandingPrincipalMinor, "9000");
      assert.deepEqual(
        restartedHumanObligation.installments.map((row) => row.scheduledPrincipalMinor),
        ["6000", "6000"]
      );
      assert.deepEqual(
        restartedHumanObligation.installments.map((row) => row.paidPrincipalMinor),
        ["3000", "0"]
      );

      const restartedAgentRepository = new PostgresCoreRepository({
        pool: appPool,
        eventRepository: new PostgresEventRepository({
          pool: appPool,
          tenantContext: createTenantSecurityContext({
            tenantId: TENANT_ONE,
            actorId: identities.tenantOneCreditAgent.authenticationContext.actorId,
            policyVersion: "security_001.v1",
            source: "local_test"
          })
        })
      });
      const restartedAgentLockbox = await restartedAgentRepository.getLockbox(
        agentLockboxId
      );
      assert.equal(restartedAgentLockbox.schemaVersion, "lockbox.v2");
      assert.equal(restartedAgentLockbox.status, "active");
      assert.equal(restartedAgentLockbox.obligationId, agentAcceptance.obligation.obligationId);
      assert.equal(restartedAgentLockbox.mandateId, creditAgentMandate.response.mandateId);
      assert.equal(restartedAgentLockbox.balanceMinor, "9000");
      assert.equal(restartedAgentLockbox.capturedRevenueMinor, "3000");
      assert.equal(restartedAgentLockbox.withdrawable, false);

      const crossTenantLockboxRepository = new PostgresCoreRepository({
        pool: appPool,
        eventRepository: new PostgresEventRepository({
          pool: appPool,
          tenantContext: createTenantSecurityContext({
            tenantId: TENANT_TWO,
            actorId: identities.tenantTwoAgent.authenticationContext.actorId,
            policyVersion: "security_001.v1",
            source: "local_test"
          })
        })
      });
      assert.equal(
        await crossTenantLockboxRepository.getLockbox(agentLockboxId),
        undefined
      );

      const frozenCreditLineId = `credit_line_human_credit_frozen_${RUN_ID}`;
      const riskContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneBorrower.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await withTenantTransaction(ownerPool, riskContext, (client) => client.query(
        `INSERT INTO credit_lines(
           tenant_id, id, subject_id, mandate_id, asset_id, limit_minor,
           utilized_minor, status, risk_snapshot_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, 25000, 0, 'frozen', NULL, $6)`,
        [
          TENANT_ONE,
          frozenCreditLineId,
          tenantOneHumanSubjectId,
          creditAgentMandate.response.mandateId,
          "urn:ipo-one:sandbox-asset:usd-cent",
          IDENTITY_NOW
        ]
      ));
      try {
        await assert.rejects(
          () => tenantOneBorrower.requestCredit(requestCreditCommand({
            subjectId: tenantOneHumanSubjectId,
            authorityId: consentId,
            idempotencyKey: `request-human-credit-risk-rejected-${RUN_ID}-0001`,
            overrides: { requestedPrincipalMinor: "11000" }
          })),
          (error) => error.code === "authorization_denied"
        );
      } finally {
        await withTenantTransaction(ownerPool, riskContext, (client) => client.query(
          "DELETE FROM credit_lines WHERE id = $1",
          [frozenCreditLineId]
        ));
      }
      assert.equal(Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM credit_intents WHERE tenant_id = $1",
        [TENANT_ONE]
      )).rows[0].count), 2);

      const finalHumanRepayment = await postRepaymentWithBoundedClockRecovery({
        client: restartedHuman,
        pool: ownerPool,
        obligationId: humanAcceptance.obligation.obligationId,
        command: {
          obligationId: humanAcceptance.obligation.obligationId,
          payload: { amountMinor: "9000", sourceCode: "synthetic_bank" },
          idempotencyKey: `repay-human-sandbox-credit-${RUN_ID}-0002`,
          requestId: `request-repay-human-sandbox-credit-final-${RUN_ID}`,
          correlationId: `correlation-repay-human-sandbox-credit-final-${RUN_ID}`
        }
      });
      const finalAgentRepayment = await postRepaymentWithBoundedClockRecovery({
        client: restartedAgent,
        pool: ownerPool,
        obligationId: agentAcceptance.obligation.obligationId,
        command: {
          obligationId: agentAcceptance.obligation.obligationId,
          payload: { amountMinor: "9000", sourceCode: "synthetic_revenue" },
          idempotencyKey: `repay-agent-sandbox-credit-${RUN_ID}-0002`,
          requestId: `request-repay-agent-sandbox-credit-final-${RUN_ID}`,
          correlationId: `correlation-repay-agent-sandbox-credit-final-${RUN_ID}`
        }
      });
      for (const result of [finalHumanRepayment, finalAgentRepayment]) {
        assert.equal(result.response.obligation.status, "fully_repaid");
        assert.equal(result.response.obligation.outstandingPrincipalMinor, "0");
        assert.equal(result.response.productionFundsMoved, false);
      }
      const closedAgentLockbox = await restartedAgentRepository.getLockbox(
        agentLockboxId
      );
      assert.equal(closedAgentLockbox.status, "closed");
      assert.equal(closedAgentLockbox.balanceMinor, "0");
      assert.equal(closedAgentLockbox.capturedRevenueMinor, "12000");
      assert.equal(closedAgentLockbox.withdrawable, false);
      const outcomeClockResult = await ownerPool.query(
        `SELECT GREATEST(
           clock_timestamp(),
           MAX(updated_at) + interval '1 millisecond'
         ) AS recorded_at
           FROM obligations
          WHERE id = ANY($1::text[])`,
        [[
          humanAcceptance.obligation.obligationId,
          agentAcceptance.obligation.obligationId
        ]]
      );
      const outcomeRecordedAt = new Date(outcomeClockResult.rows[0].recorded_at);
      const outcomeClock = () => new Date(outcomeRecordedAt);

      const creditOutcomeTenantContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneRisk.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      let injectedOutcomeFault = false;
      const faultingOutcomeRepository = new PostgresEventRepository({
        pool: appPool,
        tenantContext: creditOutcomeTenantContext,
        faultInjector: ({ stage }) => {
          if (!injectedOutcomeFault && stage === "after_event_inserted") {
            injectedOutcomeFault = true;
            throw new Error("injected credit outcome process failure");
          }
        }
      });
      await assert.rejects(
        () => new PostgresCreditOutcomeMaterializer({
          eventRepository: faultingOutcomeRepository,
          clock: outcomeClock
        }).run(),
        /injected credit outcome process failure/
      );
      const afterOutcomeFailure = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM credit_outcomes
             WHERE tenant_id = $1) AS outcomes,
           (SELECT count(*)::int FROM domain_events
             WHERE tenant_id = $1 AND event_type = 'credit_outcome_finalized') AS events`,
        [TENANT_ONE]
      );
      assert.deepEqual(afterOutcomeFailure.rows[0], {
        outcomes: 0,
        events: 0
      });

      const outcomeMaterializer = new PostgresCreditOutcomeMaterializer({
        eventRepository: new PostgresEventRepository({
          pool: appPool,
          tenantContext: creditOutcomeTenantContext
        }),
        clock: outcomeClock
      });
      const materialized = await outcomeMaterializer.run();
      assert.equal(materialized.candidateCount, 2);
      assert.equal(materialized.materializedCount, 2);
      assert.deepEqual(
        materialized.outcomes.map((outcome) => outcome.outcomeLabel),
        ["on_time_repaid", "on_time_repaid"]
      );
      const materializedReplay = await outcomeMaterializer.run();
      assert.equal(materializedReplay.candidateCount, 0);
      assert.equal(materializedReplay.materializedCount, 0);

      const outcomeDurability = await ownerPool.query(
        `SELECT
           count(*)::int AS outcomes,
           count(DISTINCT subject_id)::int AS subjects,
           bool_and(outcome_label = 'on_time_repaid') AS on_time,
           bool_and(repayment_ratio_bps = 10000) AS repaid,
           bool_and(
             outcome_finalized
             AND NOT future_feature_substitution_allowed
             AND NOT authorizing
             AND NOT funds_authority
             AND NOT economic_state_mutation
             AND NOT production_authority
             AND NOT pii_included
             AND NOT raw_transaction_data_included
             AND NOT score_authoritative
             AND sandbox_only
             AND NOT production_funds_moved
           ) AS safety,
           bool_and(
             decision_feature_snapshot->>'featureSnapshotHash' = feature_snapshot_hash
             AND jsonb_array_length(source_evidence_hashes) >= 2
           ) AS evidence_bound,
           (SELECT count(*)::int FROM domain_events
             WHERE tenant_id = $1 AND event_type = 'credit_outcome_finalized') AS events,
           (SELECT count(*)::int FROM evidence_envelopes
             WHERE tenant_id = $1 AND event_type = 'credit_outcome_finalized') AS evidence,
           (SELECT count(*)::int FROM outbox_messages m
             JOIN domain_events e
               ON e.tenant_id = m.tenant_id AND e.id = m.event_id
            WHERE m.tenant_id = $1
              AND e.event_type = 'credit_outcome_finalized') AS outbox
         FROM credit_outcomes
        WHERE tenant_id = $1`,
        [TENANT_ONE]
      );
      assert.deepEqual(outcomeDurability.rows[0], {
        outcomes: 2,
        subjects: 2,
        on_time: true,
        repaid: true,
        safety: true,
        evidence_bound: true,
        events: 2,
        evidence: 2,
        outbox: 2
      });
      await assert.rejects(
        () => withTenantTransaction(appPool, creditOutcomeTenantContext, (client) =>
          client.query(
            `UPDATE credit_outcomes
                SET outcome_label = 'late_or_modified_repaid'
              WHERE tenant_id = $1`,
            [TENANT_ONE]
          )
        ),
        (error) =>
          error.code === "P0001" &&
          error.message === "append-only rows cannot be updated or deleted"
      );
    });

    await t.test("Phase 2 Capital Partner marketplace closes Human, Agent, stale, and adverse no-funds paths", async () => {
      const capitalPartnerActorId =
        identities.tenantOneCapitalPartner.authenticationContext.actorId;
      const setupHumanBorrower = async ({ client, identity, label }) => {
        const created = await client.createHumanSubject({
          idempotencyKey: `phase2-create-human-${label}-${RUN_ID}`,
          requestId: `request-phase2-create-human-${label}-${RUN_ID}`,
          correlationId: `correlation-phase2-${label}-${RUN_ID}`
        });
        const consent = await client.createConsent(createConsentCommand({
          subjectId: created.response.subjectId,
          idempotencyKey: `phase2-consent-${label}-${RUN_ID}`,
          overrides: {
            purposes: [
              "credit_application",
              "credit_decision",
              "credit_offer_acceptance",
              "obligation_servicing",
              "identity_reference_use"
            ]
          }
        }));
        await seedSyntheticIdentityReference({
          pool: appPool,
          tenantId: TENANT_ONE,
          identity,
          subjectId: created.response.subjectId,
          principalId: created.response.principalId,
          consentId: consent.response.consent.consentId,
          purposeCodes: [
            "identity_reference_use",
            "credit_decision",
            "credit_offer_acceptance"
          ]
        });
        await waitForDatabaseClockAfter(
          ownerPool,
          consent.response.consent.validFrom,
          `Phase 2 ${label} Consent`
        );
        return {
          subjectId: created.response.subjectId,
          consentId: consent.response.consent.consentId
        };
      };
      const humanA = await setupHumanBorrower({
        client: tenantOnePhase2BorrowerA,
        identity: identities.tenantOnePhase2BorrowerA,
        label: "human-a"
      });
      const humanB = await setupHumanBorrower({
        client: tenantOnePhase2BorrowerB,
        identity: identities.tenantOnePhase2BorrowerB,
        label: "human-b"
      });

      const agentAuthority = await ownerPool.query(
        `SELECT b.resource_id AS subject_id
           FROM authorization_resource_bindings b
          WHERE b.tenant_id = $1
            AND b.resource_type = 'subject'
            AND b.actor_id = $2
            AND b.relationship = 'subject'
            AND b.status = 'active'
          LIMIT 1`,
        [
          TENANT_ONE,
          identities.tenantOneCreditAgent.authenticationContext.actorId
        ]
      );
      assert.equal(agentAuthority.rowCount, 1);
      const agentSubjectId = agentAuthority.rows[0].subject_id;
      const phase2AgentMandate = await tenantOneController.createDraftMandate(
        createMandateCommand({
          subjectId: agentSubjectId,
          idempotencyKey: `phase2-agent-mandate-${RUN_ID}`,
          overrides: {
            capabilities: [
              "request_credit",
              "accept_credit_offer",
              "execute_sandbox_credit",
              "provider_spend",
              "capture_revenue",
              "route_repayment"
            ],
            allowedProviderIds: ["provider_gateway_compute"],
            allowedCategories: ["compute"],
            perActionLimitMinor: "10000",
            aggregateLimitMinor: "20000"
          }
        })
      );
      const agentMandateId = phase2AgentMandate.response.mandateId;

      const requestAndEvaluate = async ({
        client,
        subjectId,
        authorityId,
        amountMinor,
        label
      }) => {
        const requested = await client.requestCredit(requestCreditCommand({
          subjectId,
          authorityId,
          idempotencyKey: `phase2-request-${label}-${RUN_ID}`,
          overrides: { requestedPrincipalMinor: amountMinor }
        }));
        const creditIntent = requested.response.creditIntent;
        const evaluated = await client.evaluateCreditApplication({
          creditIntentId: creditIntent.creditIntentId,
          idempotencyKey: `phase2-evaluate-${label}-${RUN_ID}`,
          requestId: `request-phase2-evaluate-${label}-${RUN_ID}`,
          correlationId: `correlation-phase2-${label}-${RUN_ID}`
        });
        assert.equal(evaluated.response.decision.status, "approved");
        assert.equal(evaluated.response.offer.status, "offered");
        return {
          creditIntent,
          decision: evaluated.response.decision,
          preliminaryOffer: evaluated.response.offer
        };
      };

      const issueAndAuthor = async ({
        issuer,
        subjectId,
        application,
        amountMinor,
        label,
        firstPaymentDelayMs = 30 * 86_400_000,
        offerLifetimeMs = 10 * 60_000
      }) => {
        const passportResult = await issuer.createCreditPassportArtifact({
          subjectId,
          payload: {
            creditIntentId: application.creditIntent.creditIntentId,
            verifierActorId: capitalPartnerActorId,
            claimSelectors: [
              "decision_outcome",
              "factor_authority",
              "canonical_reason_codes",
              "source_evidence_lineage"
            ],
            lifetimeSeconds: 900,
            schemaVersion: "credit_passport_artifact_create.v1"
          },
          idempotencyKey: `phase2-passport-${label}-${RUN_ID}`,
          requestId: `request-phase2-passport-${label}-${RUN_ID}`,
          correlationId: `correlation-phase2-${label}-${RUN_ID}`
        });
        const passport = passportResult.response.artifact;
        const authoredAt = Date.now();
        const firstPaymentAt = new Date(
          authoredAt + firstPaymentDelayMs
        ).toISOString();
        const maturityAt = new Date(
          authoredAt + firstPaymentDelayMs + 30 * 86_400_000
        ).toISOString();
        const validUntil = new Date(authoredAt + offerLifetimeMs).toISOString();
        const authorCommand = {
          creditPassportArtifactId: passport.creditPassportArtifactId,
          payload: {
            creditIntentId: application.creditIntent.creditIntentId,
            artifactHash: passport.artifactHash,
            artifactVersion: passport.version,
            underwritingSnapshotHash: hashId(
              "gateway_phase2_underwriting_snapshot",
              {
                decisionHash: application.decision.decisionHash,
                passportHash: passport.artifactHash,
                amountMinor,
                label
              }
            ),
            assetId: application.creditIntent.assetId,
            facilityLimitMinor: amountMinor,
            approvedPrincipalMinor: amountMinor,
            perDrawCapMinor: amountMinor,
            annualRateBps: 825,
            originationFeeMinor: "0",
            repaymentFrequency: application.creditIntent.repaymentFrequency,
            installmentCount: application.creditIntent.installmentCount,
            firstPaymentAt,
            maturityAt,
            permittedPurposeCode: application.creditIntent.purposeCode,
            conditions: [
              "passport_current_at_acceptance",
              "authority_current_at_acceptance",
              "no_adverse_obligation_at_acceptance"
            ],
            undrawnRevocationRule: "capital_partner_before_acceptance",
            validUntil,
            reasonCodes: ["capital_partner_underwritten"],
            disclosureRef: "urn:ipo.one:test:phase2-capital-partner:v1",
            schemaVersion: "capital_partner_offer_authoring.v1"
          },
          idempotencyKey: `phase2-author-${label}-${RUN_ID}`,
          requestId: `request-phase2-author-${label}-${RUN_ID}`,
          correlationId: `correlation-phase2-${label}-${RUN_ID}`
        };
        const authored = await tenantOneCapitalPartner.authorCapitalPartnerOffer(
          authorCommand
        );
        const replay = await tenantOneCapitalPartner.authorCapitalPartnerOffer(
          authorCommand
        );
        assert.equal(authored.replayed, false);
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.response, authored.response);
        assert.equal(authored.response.offer.schemaVersion, "credit_offer.v2");
        assert.equal(authored.response.offer.productionFundsApproved, false);
        assert.equal(authored.response.fundsAuthority, false);
        const offerRows = await ownerPool.query(
          `SELECT schema_version, status
             FROM credit_offers
            WHERE tenant_id = $1
              AND credit_intent_id = $2
            ORDER BY schema_version`,
          [TENANT_ONE, application.creditIntent.creditIntentId]
        );
        assert.deepEqual(offerRows.rows, [
          { schema_version: "credit_offer.v1", status: "declined" },
          { schema_version: "credit_offer.v2", status: "offered" }
        ]);
        return {
          passport,
          offer: authored.response.offer,
          firstPaymentAt,
          validUntil
        };
      };

      const acceptExecute = async ({ client, offer, label, providerTarget }) => {
        const command = {
          creditOfferId: offer.creditOfferId,
          payload: {
            expectedOfferHash: offer.creditOfferHash,
            expectedTermsHash: offer.termsHash,
            acknowledgementHash: hashId("gateway_phase2_offer_acknowledgement", {
              offerHash: offer.creditOfferHash,
              termsHash: offer.termsHash,
              label
            })
          },
          idempotencyKey: `phase2-accept-${label}-${RUN_ID}`,
          requestId: `request-phase2-accept-${label}-${RUN_ID}`,
          correlationId: `correlation-phase2-${label}-${RUN_ID}`
        };
        const acceptances = await executeConcurrentDuplicate(
          () => client.acceptCreditOffer(command)
        );
        assert.deepEqual(
          acceptances.map(({ replayed }) => replayed).sort(),
          [false, true]
        );
        assert.deepEqual(acceptances[0].response, acceptances[1].response);
        const obligation = acceptances[0].response.obligation;
        const executions = await executeConcurrentDuplicate(
          () => client.executeSandboxObligation({
            obligationId: obligation.obligationId,
            payload: providerTarget ?? {},
            idempotencyKey: `phase2-execute-${label}-${RUN_ID}`,
            requestId: `request-phase2-execute-${label}-${RUN_ID}`,
            correlationId: `correlation-phase2-${label}-${RUN_ID}`
          })
        );
        assert.deepEqual(
          executions.map(({ replayed }) => replayed).sort(),
          [false, true]
        );
        assert.equal(executions[0].response.obligation.status, "active");
        assert.equal(executions[0].response.productionFundsMoved, false);
        return executions[0].response.obligation;
      };

      const repayFully = async ({ client, obligation, amountMinor, label }) => {
        const repaid = await postRepaymentWithBoundedClockRecovery({
          client,
          pool: ownerPool,
          obligationId: obligation.obligationId,
          command: {
            obligationId: obligation.obligationId,
            payload: { amountMinor, sourceCode: "synthetic_bank" },
            idempotencyKey: `phase2-repay-${label}-${RUN_ID}`,
            requestId: `request-phase2-repay-${label}-${RUN_ID}`,
            correlationId: `correlation-phase2-${label}-${RUN_ID}`
          }
        });
        assert.equal(repaid.response.obligation.status, "fully_repaid");
        assert.equal(repaid.response.obligation.outstandingPrincipalMinor, "0");
        assert.equal(repaid.response.productionFundsMoved, false);
        return repaid.response.obligation;
      };

      const humanApplication = await requestAndEvaluate({
        client: tenantOnePhase2BorrowerA,
        subjectId: humanA.subjectId,
        authorityId: humanA.consentId,
        amountMinor: "8000",
        label: "human-repaid"
      });
      const humanUnderwriting = await issueAndAuthor({
        issuer: tenantOnePhase2BorrowerA,
        subjectId: humanA.subjectId,
        application: humanApplication,
        amountMinor: "8000",
        label: "human-repaid"
      });
      const humanObligation = await acceptExecute({
        client: tenantOnePhase2BorrowerA,
        offer: humanUnderwriting.offer,
        label: "human-repaid"
      });
      await repayFully({
        client: tenantOnePhase2BorrowerA,
        obligation: humanObligation,
        amountMinor: "8000",
        label: "human-repaid"
      });
      const humanFacility = await tenantOneCapitalPartner.getCapitalPartnerFacility({
        obligationId: humanObligation.obligationId,
        requestId: `request-phase2-facility-human-${RUN_ID}`,
        correlationId: `correlation-phase2-human-repaid-${RUN_ID}`
      });
      assert.equal(humanFacility.response.facility.status, "fully_repaid");
      assert.equal(humanFacility.response.facility.outstandingMinor, "0");

      const agentApplication = await requestAndEvaluate({
        client: tenantOneCreditAgent,
        subjectId: agentSubjectId,
        authorityId: agentMandateId,
        amountMinor: "7000",
        label: "agent-repaid"
      });
      const agentUnderwriting = await issueAndAuthor({
        issuer: tenantOneController,
        subjectId: agentSubjectId,
        application: agentApplication,
        amountMinor: "7000",
        label: "agent-repaid"
      });
      const phase2AgentMandateView = await tenantOneController.getMandate({
        mandateId: agentMandateId,
        requestId: `request-phase2-agent-mandate-${RUN_ID}`,
        correlationId: `correlation-phase2-agent-repaid-${RUN_ID}`
      });
      await tenantOneController.activateSandboxMandate({
        mandateId: agentMandateId,
        payload: {
          expectedMandateHash:
            phase2AgentMandateView.response.mandate.mandateHash,
          acknowledgedTermsHash:
            phase2AgentMandateView.response.mandate.termsHash,
          acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
        },
        idempotencyKey: `phase2-activate-agent-mandate-${RUN_ID}`,
        requestId: `request-phase2-activate-agent-mandate-${RUN_ID}`,
        correlationId: `correlation-phase2-agent-repaid-${RUN_ID}`
      });
      const agentObligation = await acceptExecute({
        client: tenantOneCreditAgent,
        offer: agentUnderwriting.offer,
        label: "agent-repaid",
        providerTarget: {
          providerId: "provider_gateway_compute",
          providerCategory: "compute"
        }
      });
      await repayFully({
        client: tenantOneCreditAgent,
        obligation: agentObligation,
        amountMinor: "7000",
        label: "agent-repaid"
      });

      const staleApplication = await requestAndEvaluate({
        client: tenantOnePhase2BorrowerA,
        subjectId: humanA.subjectId,
        authorityId: humanA.consentId,
        amountMinor: "6000",
        label: "stale"
      });
      const staleUnderwriting = await issueAndAuthor({
        issuer: tenantOnePhase2BorrowerA,
        subjectId: humanA.subjectId,
        application: staleApplication,
        amountMinor: "6000",
        label: "stale"
      });
      await assert.rejects(
        () => tenantOnePhase2BorrowerA.acceptCreditOffer({
          creditOfferId: staleUnderwriting.offer.creditOfferId,
          payload: {
            expectedOfferHash: hashId("gateway_phase2_stale_offer", {
              offerId: staleUnderwriting.offer.creditOfferId
            }),
            expectedTermsHash: staleUnderwriting.offer.termsHash,
            acknowledgementHash: hashId("gateway_phase2_stale_ack", {
              offerId: staleUnderwriting.offer.creditOfferId
            })
          },
          idempotencyKey: `phase2-stale-hash-${RUN_ID}`,
          requestId: `request-phase2-stale-hash-${RUN_ID}`,
          correlationId: `correlation-phase2-stale-${RUN_ID}`
        }),
        (error) => error.code === "offer_terms_mismatch"
      );
      await tenantOnePhase2BorrowerA.revokeCreditPassportArtifact({
        artifactId: staleUnderwriting.passport.creditPassportArtifactId,
        reasonCode: "owner_withdrawal",
        idempotencyKey: `phase2-revoke-passport-${RUN_ID}`,
        requestId: `request-phase2-revoke-passport-${RUN_ID}`,
        correlationId: `correlation-phase2-stale-${RUN_ID}`
      });
      await assert.rejects(
        () => tenantOnePhase2BorrowerA.acceptCreditOffer({
          creditOfferId: staleUnderwriting.offer.creditOfferId,
          payload: {
            expectedOfferHash: staleUnderwriting.offer.creditOfferHash,
            expectedTermsHash: staleUnderwriting.offer.termsHash,
            acknowledgementHash: hashId("gateway_phase2_revoked_ack", {
              offerId: staleUnderwriting.offer.creditOfferId
            })
          },
          idempotencyKey: `phase2-revoked-passport-accept-${RUN_ID}`,
          requestId: `request-phase2-revoked-passport-accept-${RUN_ID}`,
          correlationId: `correlation-phase2-stale-${RUN_ID}`
        }),
        (error) => [
          "authorization_denied",
          "capital_partner_passport_not_current"
        ].includes(error.code)
      );
      const withdrawn = await tenantOneCapitalPartner.transitionCapitalPartnerOffer({
        creditOfferId: staleUnderwriting.offer.creditOfferId,
        payload: {
          nextStatus: "withdrawn",
          supersedingOfferId: null,
          schemaVersion: "capital_partner_offer_transition.v1"
        },
        idempotencyKey: `phase2-withdraw-stale-${RUN_ID}`,
        requestId: `request-phase2-withdraw-stale-${RUN_ID}`,
        correlationId: `correlation-phase2-stale-${RUN_ID}`
      });
      assert.equal(withdrawn.response.offer.status, "withdrawn");

      const expiredApplication = await requestAndEvaluate({
        client: tenantOnePhase2BorrowerB,
        subjectId: humanB.subjectId,
        authorityId: humanB.consentId,
        amountMinor: "5000",
        label: "expired"
      });
      const expiredUnderwriting = await issueAndAuthor({
        issuer: tenantOnePhase2BorrowerB,
        subjectId: humanB.subjectId,
        application: expiredApplication,
        amountMinor: "5000",
        label: "expired",
        offerLifetimeMs: 1_500
      });
      await waitForDatabaseClockAfter(
        ownerPool,
        new Date(new Date(expiredUnderwriting.validUntil).getTime() + 100),
        "Phase 2 expired Offer"
      );
      await assert.rejects(
        () => tenantOnePhase2BorrowerB.acceptCreditOffer({
          creditOfferId: expiredUnderwriting.offer.creditOfferId,
          payload: {
            expectedOfferHash: expiredUnderwriting.offer.creditOfferHash,
            expectedTermsHash: expiredUnderwriting.offer.termsHash,
            acknowledgementHash: hashId("gateway_phase2_expired_ack", {
              offerId: expiredUnderwriting.offer.creditOfferId
            })
          },
          idempotencyKey: `phase2-expired-accept-${RUN_ID}`,
          requestId: `request-phase2-expired-accept-${RUN_ID}`,
          correlationId: `correlation-phase2-expired-${RUN_ID}`
        }),
        (error) => ["authorization_denied", "offer_expired"].includes(error.code)
      );

      const adverseApplication = await requestAndEvaluate({
        client: tenantOnePhase2BorrowerB,
        subjectId: humanB.subjectId,
        authorityId: humanB.consentId,
        amountMinor: "4000",
        label: "adverse"
      });
      const adverseUnderwriting = await issueAndAuthor({
        issuer: tenantOnePhase2BorrowerB,
        subjectId: humanB.subjectId,
        application: adverseApplication,
        amountMinor: "4000",
        label: "adverse",
        firstPaymentDelayMs: 1_500
      });
      const adverseObligation = await acceptExecute({
        client: tenantOnePhase2BorrowerB,
        offer: adverseUnderwriting.offer,
        label: "adverse"
      });
      await waitForDatabaseClockAfter(
        ownerPool,
        new Date(new Date(adverseUnderwriting.firstPaymentAt).getTime() + 100),
        "Phase 2 adverse servicing"
      );
      let servicing = await tenantOneWorker.advanceSandboxServicing({
        obligationId: adverseObligation.obligationId,
        idempotencyKey: `phase2-advance-servicing-${RUN_ID}`,
        requestId: `request-phase2-advance-servicing-${RUN_ID}`,
        correlationId: `correlation-phase2-adverse-${RUN_ID}`
      });
      if (!servicing.response.changed) {
        await waitForDatabaseClockAfter(
          ownerPool,
          new Date(new Date(adverseUnderwriting.firstPaymentAt).getTime() + 100),
          "Phase 2 adverse servicing retry"
        );
        servicing = await tenantOneWorker.advanceSandboxServicing({
          obligationId: adverseObligation.obligationId,
          idempotencyKey: `phase2-advance-servicing-retry-${RUN_ID}`,
          requestId: `request-phase2-advance-servicing-retry-${RUN_ID}`,
          correlationId: `correlation-phase2-adverse-${RUN_ID}`
        });
      }
      assert.equal(servicing.response.changed, true);
      assert.equal(servicing.response.obligation.status, "delinquent");
      assert.equal(
        servicing.response.obligation.servicingClassification,
        "grace_period"
      );

      const portfolio = await tenantOneCapitalPartner.getCapitalPartnerPortfolio({
        capitalPartnerId: capitalPartnerProfile.capitalPartnerId,
        requestId: `request-phase2-portfolio-${RUN_ID}`,
        correlationId: `correlation-phase2-portfolio-${RUN_ID}`
      });
      assert.equal(portfolio.response.profile.productionFundsAuthority, false);
      assert.equal(portfolio.response.portfolio.productionFundsMoved, false);
      assert.equal(portfolio.response.portfolio.completedFacilityCount, 2);
      assert.equal(portfolio.response.portfolio.activeFacilityCount, 1);
      assert.equal(portfolio.response.portfolio.utilizedMinor, "19000");
      assert.equal(portfolio.response.portfolio.repaidMinor, "15000");
      assert.equal(portfolio.response.portfolio.outstandingMinor, "4000");
      const adverseFacility = portfolio.response.portfolio.facilities.find(
        ({ obligationId }) => obligationId === adverseObligation.obligationId
      );
      assert.equal(adverseFacility.status, "delinquent");
      assert.equal(adverseFacility.servicingClassification, "grace_period");
      const evidenceRows = await ownerPool.query(
        `SELECT count(*)::int AS evidence
           FROM evidence_envelopes
          WHERE tenant_id = $1
            AND obligation_id = ANY($2::text[])`,
        [
          TENANT_ONE,
          [
            humanObligation.obligationId,
            agentObligation.obligationId,
            adverseObligation.obligationId
          ]
        ]
      );
      assert.equal(evidenceRows.rows[0].evidence >= 18, true);
    });

    await t.test("signed Provider sandbox is AccessGrant-bound, replay-safe, and atomically durable", async () => {
      const providerContext = identities.tenantTwoProvider.authenticationContext;
      const workerContext = identities.tenantTwoWorker.authenticationContext;
      const providerRuntime = gateway(
        appPool,
        harness,
        createTenantFoundationHandlers({
          providerCallbackKeyResolver: async (keyId) =>
            keyId === `provider_callback_key_${RUN_ID}`
              ? PROVIDER_CALLBACK_KEYS.publicKey
              : undefined
        })
      );
      const provider = providerClient(providerRuntime, providerContext);
      const worker = workerClient(providerRuntime, workerContext);
      const now = new Date();
      const transferIntentId = `transfer_intent_provider_${RUN_ID}`;
      const inboxResourceId = `provider_callback_${RUN_ID}`;
      const delivery = createProviderIntentDelivery({
        deliveryId: `provider_delivery_${RUN_ID}`,
        transferIntent: {
          transferIntentId,
          transferIntentHash: hashId("gateway_provider_transfer_intent", { transferIntentId }),
          providerId: `provider_gateway_${RUN_ID}`,
          purposeCode: "compute_services",
          sourceAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
          sourceAmountMinor: "12000",
          destinationAssetId: "urn:ipo-one:sandbox-asset:usd-cent"
        },
        providerActorId: providerContext.actorId,
        issuedAt: new Date(now.getTime() - 1_000),
        expiresAt: new Date(now.getTime() + 300_000)
      });

      const ownerContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await withTenantTransaction(ownerPool, ownerContext, async (client) => {
        await client.query(
          `INSERT INTO authorization_resources(
             tenant_id, resource_type, resource_id, status, version,
             created_at, updated_at, schema_version
           ) VALUES ($1, 'transfer_intent', $2, 'active', 1, $3, $3, 'authorization_resource.v1')`,
          [TENANT_ONE, transferIntentId, now]
        );
        await client.query(
          `INSERT INTO access_grants(
             id, access_grant_hash, tenant_id, grantee_tenant_id, grantee_actor_id,
             capability, resource_type, resource_id, purpose, status,
             valid_from, expires_at, revoked_at, created_by_actor_id,
             created_at, updated_at, schema_version, policy_version, version
           ) VALUES (
             $1, $2, $3, $4, $5,
             'provider_intent_delivery', 'transfer_intent', $6,
             'provider_intent_delivery', 'active',
             $7, $8, NULL, $9, $7, $7, 'access_grant.v1', 'security_001.v1', 1
           )`,
          [
            `access_grant_provider_${RUN_ID}`,
            hashId("gateway_provider_access_grant", { transferIntentId, provider: providerContext.actorId }),
            TENANT_ONE,
            TENANT_TWO,
            providerContext.actorId,
            transferIntentId,
            new Date(now.getTime() - 1_000),
            new Date(now.getTime() + 300_000),
            identities.tenantOneHuman.authenticationContext.actorId
          ]
        );
      });

      const providerTenantContext = createTenantSecurityContext({
        tenantId: TENANT_TWO,
        actorId: providerContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const providerEvents = new PostgresEventRepository({
        pool: appPool,
        tenantContext: providerTenantContext
      });
      const providerRepository = new PostgresCoreRepository({
        pool: appPool,
        eventRepository: providerEvents
      });
      const deliveryEvent = createCreditEvent({
        eventType: "provider_intent_delivery_created",
        payload: {
          deliveryId: delivery.deliveryId,
          deliveryHash: delivery.deliveryHash,
          transferIntentId,
          providerId: delivery.providerId,
          actorId: providerContext.actorId,
          causationId: `provider-delivery-seed-${RUN_ID}`,
          correlationId: `provider-delivery-correlation-${RUN_ID}`,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        now
      });
      await providerRepository.commitCommand({
        aggregateType: "provider_delivery",
        aggregateId: delivery.deliveryId,
        idempotencyKey: `provider-delivery-seed-${RUN_ID}`,
        commandHash: hashId("gateway_provider_delivery_seed", delivery.deliveryHash),
        events: [{
          aggregateType: "provider_delivery",
          aggregateId: delivery.deliveryId,
          expectedVersion: 0,
          event: deliveryEvent
        }],
        writes: [{
          type: CoreProjectionType.PROVIDER_INTENT_DELIVERY,
          value: delivery,
          eventId: deliveryEvent.eventId
        }],
        response: { deliveryId: delivery.deliveryId }
      });

      const providerView = await provider.getAssignedIntent({
        transferIntentId,
        requestId: `request-provider-read-${RUN_ID}`,
        correlationId: `correlation-provider-${RUN_ID}`
      });
      assert.equal(providerView.response.deliveryHash, delivery.deliveryHash);
      assert.equal(Object.hasOwn(providerView.response, "providerActorId"), false);
      const acknowledgementCommand = {
        transferIntentId,
        deliveryHash: delivery.deliveryHash,
        idempotencyKey: `provider-ack-${RUN_ID}-0001`,
        requestId: `request-provider-ack-${RUN_ID}`,
        correlationId: `correlation-provider-${RUN_ID}`
      };
      const acknowledgement = await provider.acknowledgeAssignedIntent(acknowledgementCommand);
      const acknowledgementReplay = await provider.acknowledgeAssignedIntent(acknowledgementCommand);
      assert.equal(acknowledgement.replayed, false);
      assert.equal(acknowledgementReplay.replayed, true);
      assert.equal(acknowledgementReplay.response.acknowledgementId, acknowledgement.response.acknowledgementId);

      const workerTenantContext = createTenantSecurityContext({
        tenantId: TENANT_TWO,
        actorId: workerContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await withTenantTransaction(ownerPool, workerTenantContext, (client) => client.query(
        `INSERT INTO authorization_resources(
           tenant_id, resource_type, resource_id, status, version,
           created_at, updated_at, schema_version
         ) VALUES ($1, 'inbox_message', $2, 'active', 1, $3, $3, 'authorization_resource.v1')`,
        [TENANT_TWO, inboxResourceId, now]
      ));
      const callback = createSignedProviderSandboxCallback({
        callbackId: inboxResourceId,
        transferIntentId,
        providerId: delivery.providerId,
        deliveryHash: delivery.deliveryHash,
        outcome: "accepted",
        reasonCode: "provider_accepted",
        providerEventRefHash: hashId("gateway_provider_event_ref", delivery.deliveryHash),
        nonce: `provider_callback_nonce_${RUN_ID}`,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 240_000).toISOString(),
        keyId: `provider_callback_key_${RUN_ID}`
      }, { privateKey: PROVIDER_CALLBACK_KEYS.privateKey });
      const callbackCommand = {
        callback,
        idempotencyKey: `provider-callback-${RUN_ID}-0001`,
        requestId: `request-provider-callback-${RUN_ID}`,
        correlationId: `correlation-provider-${RUN_ID}`
      };
      const callbackResult = await worker.processProviderCallback(callbackCommand);
      const callbackReplay = await worker.processProviderCallback(callbackCommand);
      assert.equal(callbackResult.replayed, false);
      assert.equal(callbackReplay.replayed, true);
      assert.equal(callbackReplay.response.payloadHash, callbackResult.response.payloadHash);

      const beforeRejectedPreflight = Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM abuse_admissions WHERE tenant_id = $1",
        [TENANT_TWO]
      )).rows[0].count);
      await assert.rejects(
        () => worker.processProviderCallback({
          callback: { ...callback, providerEventRefHash: hashId("gateway_provider_mutation", RUN_ID) },
          idempotencyKey: `provider-callback-invalid-${RUN_ID}-0001`,
          requestId: `request-provider-callback-invalid-${RUN_ID}`,
          correlationId: `correlation-provider-${RUN_ID}`
        }),
        (error) => error.code === "provider_callback_integrity_rejected"
      );
      const afterRejectedPreflight = Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM abuse_admissions WHERE tenant_id = $1",
        [TENANT_TWO]
      )).rows[0].count);
      assert.equal(afterRejectedPreflight, beforeRejectedPreflight);

      const durable = await ownerPool.query(
        `SELECT d.status, d.aggregate_version,
                (SELECT count(*)::int FROM provider_intent_acknowledgements
                  WHERE tenant_id = $1 AND delivery_id = d.id) AS acknowledgements,
                (SELECT count(*)::int FROM provider_callback_inbox
                  WHERE tenant_id = $1 AND delivery_hash = d.delivery_hash) AS callbacks,
                (SELECT result_json ? 'signature' FROM provider_callback_inbox
                  WHERE tenant_id = $1 AND delivery_hash = d.delivery_hash) AS leaked_signature,
                (SELECT result_json ? 'nonce' FROM provider_callback_inbox
                  WHERE tenant_id = $1 AND delivery_hash = d.delivery_hash) AS leaked_nonce
           FROM provider_intent_deliveries d
          WHERE d.tenant_id = $1 AND d.id = $2`,
        [TENANT_TWO, delivery.deliveryId]
      );
      assert.deepEqual(durable.rows, [{
        status: "callback_completed",
        aggregate_version: "3",
        acknowledgements: 1,
        callbacks: 1,
        leaked_signature: false,
        leaked_nonce: false
      }]);
    });

    await t.test("full reconciliation remains clean after complete Gateway flows", async () => {
      for (const [tenantId, identity] of [
        [TENANT_ONE, identities.tenantOneHuman],
        [TENANT_TWO, identities.tenantTwoHuman]
      ]) {
        const context = createTenantSecurityContext({
          tenantId,
          actorId: identity.authenticationContext.actorId,
          policyVersion: "security_001.v1",
          source: "local_test"
        });
        const eventRepository = new PostgresEventRepository({ pool: appPool, tenantContext: context });
        const coreRepository = new PostgresCoreRepository({ pool: appPool, eventRepository });
        const reconciliation = new PostgresReconciliationService({
          pool: appPool,
          eventRepository,
          coreRepository,
          release: "data-003-local-test"
        });
        const result = await reconciliation.run({
          initiatedBy: `system:data-003:${tenantId}`,
          idempotencyKey: `reconcile-${tenantId}-${RUN_ID}`
        });
        assert.equal(result.status, "passed", JSON.stringify(await reconciliation.getRun(result.runId)));
        assert.equal(result.discrepancyCount, 0);
      }
    });

    await t.test("durable Mandate baseline reaches the hard cap and blocks before object lookup", async () => {
      const existing = Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      )).rows[0].count);
      const seedCount = 999 - existing;
      assert.equal(seedCount >= 0, true);
      if (seedCount > 0) {
        const context = createTenantSecurityContext({
          tenantId: TENANT_ONE,
          actorId: identities.tenantOneHuman.authenticationContext.actorId,
          policyVersion: "security_001.v1",
          source: "local_test"
        });
        await withTenantTransaction(ownerPool, context, (client) => client.query(
          `INSERT INTO mandates(
             tenant_id, id, mandate_hash, principal_id, subject_id, capabilities,
             allowed_provider_ids, allowed_categories, asset_ids,
             per_action_limit_minor, aggregate_limit_minor, utilized_minor,
             valid_from, expires_at, nonce, terms_ref, status,
             created_at, updated_at, schema_version
           )
           SELECT $1,
                  'mandate_capacity_' || $6 || '_' || sequence,
                  'mandate_capacity_hash_' || $6 || '_' || sequence,
                  $2, $3, '["request_credit"]'::jsonb,
                  '[]'::jsonb, '[]'::jsonb,
                  '["urn:ipo-one:sandbox-asset:usd-cent"]'::jsonb,
                  1, 1, 0, $4, $5,
                  'capacity-nonce-' || $6 || '-' || sequence,
                  'urn:ipo.one:test:capacity:' || $6 || ':' || sequence,
                  'draft', $4, $4, 'mandate.v2'
             FROM generate_series(1, $7::int) AS sequence`,
          [
            TENANT_ONE,
            tenantOnePrincipalId,
            tenantOneSubjectId,
            IDENTITY_NOW,
            new Date(IDENTITY_NOW.getTime() + 365 * 86_400_000),
            RUN_ID,
            seedCount
          ]
        ));
      }

      const boundaryCommand = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `mandate-cap-boundary-${RUN_ID}-0001`
      });
      const boundary = await tenantOneHuman.createDraftMandate(boundaryCommand);
      assert.equal(boundary.response.status, "draft");
      const counts = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id = $1) AS mandates,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'mandates') AS capacity`,
        [TENANT_ONE]
      );
      assert.deepEqual(counts.rows[0], { mandates: 1_000, capacity: 1_000 });

      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await withTenantTransaction(ownerPool, context, (client) => client.query(
        "DELETE FROM abuse_capacity_buckets WHERE tenant_id = $1 AND kind = 'mandates'",
        [TENANT_ONE]
      ));
      const replayAtCap = await tenantOneHuman.createDraftMandate(boundaryCommand);
      assert.equal(replayAtCap.replayed, true);
      assert.equal(replayAtCap.response.mandateId, boundary.response.mandateId);
      const replayState = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id = $1) AS mandates,
           (SELECT count(*)::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'mandates') AS capacity_rows`,
        [TENANT_ONE]
      );
      assert.deepEqual(replayState.rows[0], { mandates: 1_000, capacity_rows: 0 });
      const deniedValid = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `mandate-cap-valid-overflow-${RUN_ID}-0001`
      });
      const deniedMissing = createMandateCommand({
        subjectId: `subject_missing_capacity_${RUN_ID}`,
        idempotencyKey: `mandate-cap-missing-overflow-${RUN_ID}-0001`
      });
      for (const denied of [deniedValid, deniedMissing]) {
        await assert.rejects(
          () => tenantOneHuman.createDraftMandate(denied),
          (error) => error.code === "request_budget_exceeded" && error.details.retryAfterClass === "short"
        );
      }
      const audit = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = ANY($2::text[])`,
        [TENANT_ONE, [deniedValid.requestId, deniedMissing.requestId]]
      );
      assert.equal(audit.rows[0].count, 0);
    });

    await t.test("admission cleanup retains records referenced by durable command executions", async () => {
      const referenced = await ownerPool.query(
        `SELECT execution.idempotency_key
           FROM tenant_command_executions execution
          WHERE execution.tenant_id = $1
          ORDER BY execution.completed_at
          LIMIT 1`,
        [TENANT_ONE]
      );
      assert.equal(referenced.rowCount, 1);
      const sourceIdempotencyKey = referenced.rows[0].idempotency_key;
      const idempotencyKey = `admission-retention-${RUN_ID}`;
      const admissionId = `admission_retention_${RUN_ID}`;
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await withTenantTransaction(ownerPool, context, async (client) => {
        await client.query(
        `INSERT INTO command_idempotency(
           tenant_id, idempotency_key, command_hash, aggregate_type,
           aggregate_id, status, event_id, response_json, created_at,
           updated_at, response_hash
         )
         SELECT tenant_id, $2, command_hash, aggregate_type,
                aggregate_id, status, event_id, response_json,
                transaction_timestamp() - INTERVAL '25 hours',
                transaction_timestamp() - INTERVAL '25 hours',
                response_hash
           FROM command_idempotency
          WHERE tenant_id = $1 AND idempotency_key = $3`,
          [TENANT_ONE, idempotencyKey, sourceIdempotencyKey]
        );
        await client.query(
        `INSERT INTO abuse_admissions(
           id, tenant_id, actor_ref_hash, client_ref_hash, operation_id,
           quota_class, command_ref_hash, state, outcome, replayed,
           rate_reservations, capacity_reservations, policy_version,
           issued_at, expires_at, completed_at, version, schema_version
         )
         SELECT $2, tenant_id, actor_ref_hash, client_ref_hash, operation_id,
                quota_class, NULL, 'completed', 'succeeded', false,
                rate_reservations, capacity_reservations, policy_version,
                transaction_timestamp() - INTERVAL '25 hours',
                transaction_timestamp() - INTERVAL '24 hours 59 minutes',
                transaction_timestamp() - INTERVAL '24 hours 59 minutes',
                2, schema_version
           FROM abuse_admissions
          WHERE tenant_id = $1
          ORDER BY issued_at
          LIMIT 1`,
          [TENANT_ONE, admissionId]
        );
        await client.query(
        `INSERT INTO tenant_command_executions(
           tenant_id, idempotency_key, operation_id, actor_id, actor_type,
           client_ref_hash, command_payload_hash, command_hash,
           authorization_decision_id, admission_id, business_event_id,
           response_hash, completed_at, version, schema_version
         )
         SELECT tenant_id, $2, operation_id, actor_id, actor_type,
                client_ref_hash, command_payload_hash, command_hash,
                authorization_decision_id, $3, business_event_id,
                response_hash,
                transaction_timestamp() - INTERVAL '24 hours 59 minutes',
                version, schema_version
           FROM tenant_command_executions
          WHERE tenant_id = $1 AND idempotency_key = $4`,
          [
            TENANT_ONE,
            idempotencyKey,
            admissionId,
            sourceIdempotencyKey
          ]
        );
      });

      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-after-admission-retention-${RUN_ID}`,
        correlationId: `correlation-agent-self-after-admission-retention-${RUN_ID}`
      });
      assert.equal(self.response.subject.subjectId, tenantOneSubjectId);
      const retained = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM abuse_admissions
          WHERE tenant_id = $1 AND id = $2`,
        [TENANT_ONE, admissionId]
      );
      assert.equal(retained.rows[0].count, 1);
    });

    await t.test("durable Tenant command pause blocks new commands but preserves queries and exact replay", async () => {
      const tenantContext = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneRisk.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const pauseStore = new PostgresTenantCommandPauseStore({
        eventRepository: new PostgresEventRepository({
          pool: appPool,
          tenantContext
        })
      });
      const command = {
        reasonCode: "manual_local_safety_pause",
        idempotencyKey: `tenant-command-pause-${RUN_ID}-0001`
      };
      const paused = await pauseStore.pause(command);
      const replayed = await pauseStore.pause(command);
      assert.equal(paused.replayed, false);
      assert.equal(replayed.replayed, true);
      assert.deepEqual(replayed.tenantCommandPause, paused.tenantCommandPause);
      assert.equal(paused.tenantCommandPause.commandExecutionAllowed, false);
      assert.equal(paused.tenantCommandPause.queriesAllowed, true);
      assert.equal(paused.tenantCommandPause.unpauseAvailable, false);

      const query = await tenantOneBorrower.getHumanSelf({
        subjectId: tenantOneHumanSubjectId,
        requestId: `request-read-human-after-pause-${RUN_ID}`,
        correlationId: `correlation-read-human-after-pause-${RUN_ID}`
      });
      assert.equal(query.response.subject.subjectId, tenantOneHumanSubjectId);

      await assert.rejects(
        () => tenantOneBorrower.createConsent(createConsentCommand({
          subjectId: tenantOneHumanSubjectId,
          idempotencyKey: `create-consent-after-pause-${RUN_ID}-0001`
        })),
        (error) =>
          error.code === "tenant_commands_paused" &&
          error.details.reasonCode === "manual_local_safety_pause"
      );

      const durable = await ownerPool.query(
        `SELECT
           count(*)::int AS pauses,
           bool_and(
             queries_allowed
             AND background_evidence_allowed
             AND NOT command_execution_allowed
             AND NOT unpause_available
             AND NOT authorizing
             AND NOT funds_authority
             AND NOT economic_state_mutation
             AND NOT production_authority
             AND sandbox_only
           ) AS safety,
           (SELECT count(*)::int FROM domain_events
             WHERE tenant_id = $1 AND event_type = 'tenant_commands_paused') AS events,
           (SELECT count(*)::int FROM evidence_envelopes
             WHERE tenant_id = $1 AND event_type = 'tenant_commands_paused') AS evidence
         FROM tenant_command_pauses
        WHERE tenant_id = $1`,
        [TENANT_ONE]
      );
      assert.deepEqual(durable.rows[0], {
        pauses: 1,
        safety: true,
        events: 1,
        evidence: 1
      });
      await assert.rejects(
        () => withTenantTransaction(appPool, tenantContext, (client) =>
          client.query(
            "DELETE FROM tenant_command_pauses WHERE tenant_id = $1",
            [TENANT_ONE]
          )
        ),
        (error) =>
          error.code === "P0001" &&
          error.message === "append-only rows cannot be updated or deleted"
      );
    });
  } finally {
    if (appPool) await appPool.end();
    try {
      await dropRole();
    } finally {
      await ownerPool.end();
    }
  }
});
