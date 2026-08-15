import { randomUUID } from "node:crypto";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import {
  AgentTenantCommandClient,
  HumanTenantCommandClient
} from "../../../modules/tenant-command-gateway/src/index.js";
import { normalizeEvmCaip10 } from "../../../modules/chain-adapter/src/index.js";
import {
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  createApplicationReadyAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "../../web/src/agent-handoff-manifest.js";
import {
  persistLocalAgentContinuationReceipt,
  runLocalAgentApplicationWorkflow,
  runLocalAgentRuntimeWorkflow
} from "./agent-reference-workflows.js";
import {
  deriveReferenceAgentAcceptanceSecret,
  loadReferenceAgentAcceptanceScope,
  requireReferenceAgentAcceptanceAction
} from "./agent-reference-acceptance-scope.js";
import { createDurableLocalAgentSession } from "./local-agent-session.js";
import { loadLocalAgentKeyMaterial } from "./local-authentication-material.js";
import { createLocalAgentProof } from "./local-durable-agent-authentication.js";
import {
  derivePrivatePilotAgentAccount,
  preparePrivatePilotAgentProof
} from "./private-pilot-agent-account.js";
import { loadOrCreatePrivatePilotDatabaseSecret } from "./private-pilot-database.js";
import {
  createPrivatePilotDurableAgentGateway,
  createPrivatePilotGateway
} from "./private-pilot-runtime.js";

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

async function findCurrentReferenceSubject({
  humanRuntime,
  controller,
  agentActorId,
  scope,
  expectedAccountHash
}) {
  const client = await humanRuntime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await setTenantTransactionContext(client, createTenantSecurityContext({
      tenantId: humanRuntime.authentication.profile.tenantId,
      actorId: controller.actorId,
      policyVersion: controller.createContext().policyVersion,
      source: "local_test"
    }));
    const exactRelease = scope.mode === "exact_release";
    const result = await client.query(
      `SELECT s.id AS subject_id,
              s.status AS subject_status,
              s.display_name,
              s.created_at AS subject_created_at,
              account.id AS account_binding_id,
              account.account_hash,
              challenge.id AS pending_challenge_id,
              challenge.expires_at AS pending_challenge_expires_at,
              challenge.account_hash AS pending_challenge_account_hash,
              (SELECT count(*)::integer
                 FROM agent_account_challenges all_challenges
                WHERE all_challenges.tenant_id = s.tenant_id
                  AND all_challenges.subject_id = s.id) AS challenge_count,
              line.id AS credit_line_id,
              line.facility_id,
              line.mandate_id,
              line.credit_intent_id,
              line.credit_offer_id,
              line.obligation_id,
              pg_postmaster_start_time() AS database_started_at
         FROM subjects s
         JOIN authorization_resource_bindings controller
           ON controller.tenant_id = s.tenant_id
          AND controller.resource_type = 'subject'
          AND controller.resource_id = s.id
          AND controller.actor_id = $1
         AND controller.relationship = 'controller'
          AND controller.status = 'active'
         JOIN authorization_resource_bindings agent_subject
           ON agent_subject.tenant_id = s.tenant_id
          AND agent_subject.resource_type = 'subject'
          AND agent_subject.resource_id = s.id
          AND agent_subject.actor_id = $2
          AND agent_subject.relationship = 'subject'
          AND agent_subject.status = 'active'
         JOIN memberships agent_membership
           ON agent_membership.tenant_id = s.tenant_id
          AND agent_membership.actor_id = agent_subject.actor_id
          AND agent_membership.controller_actor_id = $1
    LEFT JOIN account_bindings account
           ON account.tenant_id = s.tenant_id
          AND account.subject_id = s.id
          AND account.status = 'active'
          AND account.chain_id = 'eip155:1952'
          AND account.purpose = 'primary'
    LEFT JOIN agent_account_challenges challenge
           ON challenge.tenant_id = s.tenant_id
          AND challenge.subject_id = s.id
          AND challenge.status = 'pending'
    LEFT JOIN credit_lines line
           ON line.tenant_id = s.tenant_id
          AND line.subject_id = s.id
          AND line.asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'
        WHERE s.subject_type = 'agent'
          AND ${exactRelease
            ? "s.display_name = $3 AND s.status IN ('pending', 'active')"
            : "s.status = 'active' AND account.id IS NOT NULL"}
          AND (line.id IS NULL OR line.schema_version = 'credit_line.v2')
        ORDER BY (line.id IS NOT NULL) DESC,
                 s.created_at DESC,
                 s.id
        LIMIT 2`,
      exactRelease
        ? [controller.actorId, agentActorId, scope.displayName]
        : [controller.actorId, agentActorId]
    );
    await client.query("ROLLBACK");
    if (exactRelease && result.rowCount > 1) {
      throw new DomainError(
        "reference_agent_candidate_ambiguous",
        "more than one Agent Subject is bound to the exact acceptance candidate"
      );
    }
    const row = result.rows[0];
    if (!row) return null;
    if (exactRelease) {
      const pendingShape = (
        row.subject_status === "pending" &&
        !row.account_binding_id &&
        (
          !row.pending_challenge_id ||
          row.pending_challenge_account_hash === expectedAccountHash
        )
      );
      const activeShape = (
        row.subject_status === "active" &&
        row.account_binding_id &&
        row.account_hash === expectedAccountHash &&
        !row.pending_challenge_id
      );
      if (!pendingShape && !activeShape) {
        throw new DomainError(
          "reference_agent_candidate_binding_mismatch",
          "the exact acceptance candidate has an inconsistent Subject, challenge, or X Layer binding"
        );
      }
    }
    return {
      subjectId: row.subject_id,
      subjectStatus: row.subject_status,
      subjectCreatedAt: new Date(row.subject_created_at).toISOString(),
      ...(row.account_hash ? { accountHash: row.account_hash } : {}),
      databaseStartedAt: new Date(row.database_started_at).toISOString(),
      challengeCount: Number(row.challenge_count),
      ...(row.pending_challenge_id
        ? {
            pendingChallengeId: row.pending_challenge_id,
            pendingChallengeExpiresAt:
              new Date(row.pending_challenge_expires_at).toISOString()
          }
        : {}),
      ...(row.credit_line_id
        ? {
          recovery: {
            creditLineId: row.credit_line_id,
            facilityId: row.facility_id,
            mandateId: row.mandate_id,
            creditIntentId: row.credit_intent_id,
            creditOfferId: row.credit_offer_id,
            obligationId: row.obligation_id
          }
        }
        : {})
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original read failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function findCandidateLifecycle({
  humanRuntime,
  controller,
  agentActorId,
  scope,
  subjectId,
  expectedAccountHash
}) {
  if (scope.mode !== "exact_release") return null;
  const client = await humanRuntime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await setTenantTransactionContext(client, createTenantSecurityContext({
      tenantId: humanRuntime.authentication.profile.tenantId,
      actorId: controller.actorId,
      policyVersion: controller.createContext().policyVersion,
      source: "local_test"
    }));
    const result = await client.query(
      `SELECT m.id AS mandate_id,
              m.status AS mandate_status,
              m.mandate_hash,
              m.terms_hash,
              m.schema_version AS mandate_schema_version,
              receipt.status AS continuation_status,
              receipt.receipt_payload,
              line.id AS credit_line_id,
              line.facility_id,
              line.credit_intent_id,
              line.credit_offer_id,
              line.obligation_id,
              pg_postmaster_start_time() AS database_started_at
         FROM subjects s
         JOIN account_bindings account
           ON account.tenant_id = s.tenant_id
          AND account.subject_id = s.id
          AND account.status = 'active'
          AND account.chain_id = 'eip155:1952'
          AND account.purpose = 'primary'
          AND account.account_hash = $4
         JOIN mandates m
           ON m.tenant_id = s.tenant_id
          AND m.subject_id = s.id
          AND m.nonce = $5
          AND m.schema_version = 'mandate.v3'
         JOIN authorization_resource_bindings mandate_controller
           ON mandate_controller.tenant_id = m.tenant_id
          AND mandate_controller.resource_type = 'mandate'
          AND mandate_controller.resource_id = m.id
          AND mandate_controller.actor_id = $1
          AND mandate_controller.relationship = 'controller'
          AND mandate_controller.status = 'active'
         JOIN authorization_resource_bindings mandate_agent
           ON mandate_agent.tenant_id = m.tenant_id
          AND mandate_agent.resource_type = 'mandate'
          AND mandate_agent.resource_id = m.id
          AND mandate_agent.actor_id = $2
          AND mandate_agent.relationship = 'subject'
          AND mandate_agent.status = 'active'
         JOIN memberships agent_membership
           ON agent_membership.tenant_id = m.tenant_id
          AND agent_membership.actor_id = mandate_agent.actor_id
          AND agent_membership.controller_actor_id = $1
    LEFT JOIN workspace_continuation_receipts receipt
           ON receipt.tenant_id = m.tenant_id
          AND receipt.mandate_id = m.id
          AND receipt.actor_id = $2
    LEFT JOIN credit_lines line
           ON line.tenant_id = m.tenant_id
          AND line.subject_id = s.id
          AND line.mandate_id = m.id
          AND line.asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'
          AND line.schema_version = 'credit_line.v2'
        WHERE s.id = $3
          AND s.status = 'active'
          AND s.display_name = $6
        ORDER BY m.id
        LIMIT 2`,
      [
        controller.actorId,
        agentActorId,
        subjectId,
        expectedAccountHash,
        scope.mandateNonce,
        scope.displayName
      ]
    );
    await client.query("ROLLBACK");
    if (result.rowCount > 1) {
      throw new DomainError(
        "reference_agent_candidate_lifecycle_ambiguous",
        "more than one lifecycle is bound to the exact acceptance candidate"
      );
    }
    const row = result.rows[0];
    if (!row) return null;
    return {
      mandateId: row.mandate_id,
      mandateStatus: row.mandate_status,
      mandateHash: row.mandate_hash,
      termsHash: row.terms_hash,
      mandateSchemaVersion: row.mandate_schema_version,
      databaseStartedAt: new Date(row.database_started_at).toISOString(),
      ...(row.receipt_payload
        ? {
            continuationStatus: row.continuation_status,
            offerReceipt: structuredClone(row.receipt_payload)
          }
        : {}),
      ...(row.credit_line_id
        ? {
            recovery: {
              creditLineId: row.credit_line_id,
              facilityId: row.facility_id,
              mandateId: row.mandate_id,
              creditIntentId: row.credit_intent_id,
              creditOfferId: row.credit_offer_id,
              obligationId: row.obligation_id
            }
          }
        : {})
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original read failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function ensureCurrentBoundAgentSubject({
  humanClient,
  humanRuntime,
  databaseUrl,
  scope
}) {
  const controller = humanRuntime.authentication.identities.controller;
  const agentIdentity = humanRuntime.authentication.identities.agent;
  const secret = await loadOrCreatePrivatePilotDatabaseSecret();
  const accountSecret = scope.mode === "exact_release"
    ? deriveReferenceAgentAcceptanceSecret(
        secret,
        humanRuntime.authentication.profile.tenantId,
        scope.candidateReleaseId
      )
    : secret;
  const account = derivePrivatePilotAgentAccount(accountSecret, {
    tenantId: humanRuntime.authentication.profile.tenantId
  });
  const expectedAccountHash = normalizeEvmCaip10(
    account.accountIds["eip155:1952"],
    "eip155:1952"
  ).accountHash;
  const currentSubject = await findCurrentReferenceSubject({
    humanRuntime,
    controller,
    agentActorId: agentIdentity.actorId,
    scope,
    expectedAccountHash
  });
  const currentLifecycle = currentSubject?.subjectStatus === "active"
    ? await findCandidateLifecycle({
        humanRuntime,
        controller,
        agentActorId: agentIdentity.actorId,
        scope,
        subjectId: currentSubject.subjectId,
        expectedAccountHash
      })
    : null;
  const action = requireReferenceAgentAcceptanceAction(scope, {
    ...currentSubject,
    recovery: scope.mode === "exact_release"
      ? currentLifecycle?.recovery
      : currentSubject?.recovery
  });
  if (action === "recover") {
    return {
      ...currentSubject,
      ...currentLifecycle,
      expectedAccountHash
    };
  }
  if (currentSubject?.subjectStatus === "active") {
    const { recovery: _currentRecovery, ...activeSubject } = currentSubject;
    return {
      ...activeSubject,
      candidateLifecycle: currentLifecycle,
      expectedAccountHash
    };
  }
  let subjectId = currentSubject?.subjectId;
  if (!subjectId) {
    const subject = await humanClient.createAgentSubject({
      payload: {
        subjectActorId: agentIdentity.actorId,
        displayName: scope.displayName ?? `IPO.ONE Reference Agent ${randomUUID()}`,
        jurisdiction: "US"
      },
      idempotencyKey: scope.mode === "exact_release"
        ? `m1b-agent-subject-${scope.candidateReleaseId}`
        : identifier("idempotency-agent-current-subject"),
      requestId: scope.mode === "exact_release"
        ? `request-m1b-agent-subject-${scope.candidateReleaseId.slice(0, 24)}`
        : identifier("request-agent-current-subject"),
      correlationId: scope.mode === "exact_release"
        ? `correlation-m1b-agent-${scope.candidateReleaseId.slice(0, 24)}`
        : identifier("correlation-agent-current-subject")
    });
    subjectId = subject.response.subjectId;
  }
  let databaseStartedAt = currentSubject?.databaseStartedAt;
  let subjectCreatedAt = currentSubject?.subjectCreatedAt;
  if (!databaseStartedAt || !subjectCreatedAt) {
    const databaseClock = await findCurrentReferenceSubject({
      humanRuntime,
      controller,
      agentActorId: agentIdentity.actorId,
      scope,
      expectedAccountHash
    });
    databaseStartedAt = databaseClock?.databaseStartedAt;
    subjectCreatedAt = databaseClock?.subjectCreatedAt;
  }
  const binding = await humanClient.getAgentAccountBinding({
    subjectId,
    requestId: identifier("request-agent-acceptance-binding"),
    correlationId: identifier("correlation-agent-acceptance")
  });
  if (
    binding.response.subjectStatus === "active" &&
    binding.response.accountBinding
  ) {
    const candidateLifecycle = await findCandidateLifecycle({
      humanRuntime,
      controller,
      agentActorId: agentIdentity.actorId,
      scope,
      subjectId,
      expectedAccountHash
    });
    return {
      subjectId,
      accountHash: expectedAccountHash,
      expectedAccountHash,
      databaseStartedAt,
      subjectCreatedAt,
      candidateLifecycle
    };
  }
  if (binding.response.subjectStatus !== "pending") {
    throw new DomainError(
      "reference_agent_subject_unavailable",
      "current reference Agent Subject is neither pending nor active"
    );
  }
  const onboardingCorrelationId =
    `correlation-agent-reference-onboarding-${subjectId}`;
  const pendingChallengeIsCurrent =
    currentSubject?.pendingChallengeId &&
    new Date(currentSubject.pendingChallengeExpiresAt).getTime() > Date.now();
  const challengeAttempt = Math.max(
    1,
    (currentSubject?.challengeCount ?? 0) + (pendingChallengeIsCurrent ? 0 : 1)
  );
  const challenge = await humanClient.createAgentAccountChallenge({
    subjectId,
    payload: {
      accountId: account.accountIds["eip155:1952"],
      purpose: "primary"
    },
    idempotencyKey: scope.mode === "exact_release"
      ? `m1b-agent-challenge-${scope.candidateReleaseId}-${challengeAttempt}`
      : identifier("local-agent-reference-challenge"),
    requestId: scope.mode === "exact_release"
      ? `request-m1b-agent-challenge-${scope.candidateReleaseId.slice(0, 16)}-${challengeAttempt}`
      : identifier("request-agent-reference-challenge"),
    correlationId: onboardingCorrelationId
  });
  const prepared = preparePrivatePilotAgentProof(
    challenge.response,
    account
  );
  const agentKey = await loadLocalAgentKeyMaterial(
    process.env.IPO_ONE_LOCAL_AGENT_KEY_FILE
  );
  const agentRuntime = await createPrivatePilotDurableAgentGateway(
    databaseUrl,
    { basePort: Number(process.env.IPO_ONE_PILOT_PORT ?? 8787) }
  );
  try {
    const client = new AgentTenantCommandClient({
      gateway: agentRuntime.gateway,
      authenticationContextProvider: async () =>
        agentRuntime.agentAuthenticator.authenticate({
          proof: await createLocalAgentProof({
            keyMaterial: agentKey,
            tenantId: agentRuntime.authentication.profile.tenantId,
            clientId: agentRuntime.authentication.identities.agent.clientId,
            policyVersion: agentRuntime.authentication.identities.agent
              .createContext().policyVersion,
            audience: agentRuntime.audience
          })
        }),
      networkContextProvider: async () => createTrustedNetworkContext({
        networkRefHash: hashId(
          "private_pilot_network",
          "local_agent_reference_account_proof"
        ),
        source: "local_test"
      })
    });
    const proof = await client.submitAccountProof({
      subjectId,
      payload: {
        challengeId: prepared.challengeId,
        accountId: prepared.accountId,
        signature: await account.signTypedData(prepared.typedData)
      },
      idempotencyKey: `local-agent-reference-proof-${prepared.challengeId}`,
      requestId: `request-agent-reference-proof-${prepared.challengeId}`,
      correlationId: onboardingCorrelationId
    });
    if (
      proof.response.status !== "active" ||
      proof.response.accountBinding?.status !== "active"
    ) {
      throw new DomainError(
        "reference_agent_account_proof_failed",
        "fresh Agent Subject did not activate after account proof"
      );
    }
    return {
      subjectId,
      accountHash: expectedAccountHash,
      expectedAccountHash,
      databaseStartedAt,
      subjectCreatedAt
    };
  } finally {
    await Promise.allSettled([
      agentRuntime.pool.end(),
      agentRuntime.authenticationPool.end()
    ]);
  }
}

function requireCanonicalRecoveryIds(recovery) {
  for (const [name, value] of Object.entries({
    creditLineId: recovery?.creditLineId,
    facilityId: recovery?.facilityId,
    mandateId: recovery?.mandateId,
    creditIntentId: recovery?.creditIntentId,
    creditOfferId: recovery?.creditOfferId,
    obligationId: recovery?.obligationId
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new DomainError(
        "reference_agent_recovery_projection_incomplete",
        `current credit_line.v2 is missing ${name}`
      );
    }
  }
}

function recoveryProof({
  subjectId,
  recovery,
  mandate,
  workspace,
  self,
  accountBinding,
  creditApplication,
  ownedObligation,
  evidence
}) {
  requireCanonicalRecoveryIds(recovery);
  const obligation = ownedObligation.obligation;
  const eventTypes = new Set(evidence.items.map((item) => item.eventType));
  const liveContinuation = workspace.continuationReceipts?.find(
    (receipt) => receipt.creditOfferId === recovery.creditOfferId
  );
  const valid = (
    mandate.subjectId === subjectId &&
    mandate.mandateId === recovery.mandateId &&
    mandate.schemaVersion === "mandate.v3" &&
    mandate.status === "active" &&
    mandate.sandboxOnly === true &&
    mandate.productionAuthority === false &&
    workspace.workspaceKind === "agent_runtime" &&
    workspace.schemaVersion === "tenant_workspace_resume_view.v2" &&
    workspace.serverTruth === true &&
    liveContinuation === undefined &&
    self.subject?.subjectId === subjectId &&
    self.subject?.status === "active" &&
    self.schemaVersion === "tenant_agent_subject_view.v2" &&
    accountBinding.subjectId === subjectId &&
    accountBinding.subjectStatus === "active" &&
    accountBinding.accountBinding?.status === "active" &&
    accountBinding.accountBinding?.chainId === "eip155:1952" &&
    accountBinding.schemaVersion === "tenant_agent_account_binding_view.v1" &&
    creditApplication.creditIntent?.creditIntentId === recovery.creditIntentId &&
    creditApplication.creditIntent?.subjectId === subjectId &&
    creditApplication.creditIntent?.authorityId === recovery.mandateId &&
    creditApplication.decision?.status === "approved" &&
    creditApplication.offer?.creditOfferId === recovery.creditOfferId &&
    creditApplication.offer?.status === "accepted" &&
    creditApplication.offer?.sandboxOnly === true &&
    creditApplication.offer?.productionFundsApproved === false &&
    creditApplication.schemaVersion === "tenant_credit_application_view.v2" &&
    obligation?.obligationId === recovery.obligationId &&
    obligation?.subjectId === subjectId &&
    obligation?.authorityId === recovery.mandateId &&
    obligation?.creditIntentId === recovery.creditIntentId &&
    obligation?.creditOfferId === recovery.creditOfferId &&
    obligation?.executionStatus === "executed" &&
    obligation?.status === "fully_repaid" &&
    obligation?.outstandingPrincipalMinor === "0" &&
    obligation?.outstandingInterestMinor === "0" &&
    obligation?.outstandingFeesMinor === "0" &&
    BigInt(obligation?.totalRepaidMinor ?? "0") > 0n &&
    ownedObligation.sandboxOnly === true &&
    ownedObligation.productionFundsMoved === false &&
    ownedObligation.schemaVersion === "tenant_owned_obligation_view.v1" &&
    evidence.obligationId === recovery.obligationId &&
    evidence.items.length > 0 &&
    evidence.items.every((item) => item.obligationId === recovery.obligationId) &&
    evidence.schemaVersion === "tenant_owned_obligation_evidence_view.v1" &&
    [
      "obligation_sandbox_executed",
      "ledger_transaction_posted",
      "repayment_posted"
    ].every((eventType) => eventTypes.has(eventType))
  );
  if (!valid) {
    throw new DomainError(
      "reference_agent_recovery_failed",
      "canonical Agent lifecycle reads did not prove the completed no-funds workflow"
    );
  }
  return {
    schemaVersion: "local_agent_reference_recovery_receipt.v1",
    status: "recovered",
    subjectId,
    mandateId: recovery.mandateId,
    creditIntentId: recovery.creditIntentId,
    creditOfferId: recovery.creditOfferId,
    obligationId: recovery.obligationId,
    facilityId: recovery.facilityId,
    creditLineId: recovery.creditLineId,
    continuationStatus: "not_actionable_after_acceptance",
    obligationStatus: obligation.status,
    executionStatus: obligation.executionStatus,
    repaymentStatus: "posted",
    evidenceEventCount: evidence.items.length,
    canonicalReadOperations: [
      "pilotReadMandate",
      "pilotReadWorkspaceResume",
      "pilotReadAgentSelf",
      "pilotReadAgentAccountBinding",
      "pilotReadCreditApplication",
      "pilotReadOwnObligation",
      "pilotReadOwnObligationEvidence"
    ],
    serverTruth: true,
    canonicalLifecycleReadOnly: true,
    lifecycleMutationPerformed: false,
    sandboxOnly: true,
    productionFundsMoved: false
  };
}

async function recoverCurrentReferenceAcceptance({
  humanClient,
  databaseUrl,
  subjectId,
  recovery,
  scope,
  accountHash,
  databaseStartedAt
}) {
  requireCanonicalRecoveryIds(recovery);
  const mandateRead = await humanClient.getMandate({
    mandateId: recovery.mandateId,
    requestId: identifier("request-agent-recovery-mandate"),
    correlationId: identifier("correlation-agent-recovery")
  });
  const runtimeHandoff = createReadyAgentHandoffManifest(
    mandateRead.response.mandate
  );
  if (!runtimeHandoff) {
    throw new DomainError(
      "reference_agent_recovery_mandate_unavailable",
      "current Agent Mandate cannot produce an active runtime handoff"
    );
  }
  const session = await createDurableLocalAgentSession({
    databaseUrl,
    manifest: runtimeHandoff,
    networkSource: "local_reference_agent_recovery"
  });
  try {
    const correlationId = identifier("correlation-agent-recovery");
    const workspace = await session.client.resumeWorkspace({
      requestId: identifier("request-agent-recovery-workspace"),
      correlationId
    });
    const self = await session.client.getSelf({
      subjectId,
      requestId: identifier("request-agent-recovery-self"),
      correlationId
    });
    const accountBinding = await session.client.getAccountBinding({
      subjectId,
      requestId: identifier("request-agent-recovery-binding"),
      correlationId
    });
    const application = await session.client.getCreditApplication({
      creditIntentId: recovery.creditIntentId,
      requestId: identifier("request-agent-recovery-application"),
      correlationId
    });
    const owned = await session.client.getOwnObligation({
      obligationId: recovery.obligationId,
      requestId: identifier("request-agent-recovery-obligation"),
      correlationId
    });
    const evidence = await session.client.getOwnObligationEvidence({
      obligationId: recovery.obligationId,
      limit: 50,
      requestId: identifier("request-agent-recovery-evidence"),
      correlationId
    });
    const recoveryReceipt = recoveryProof({
      subjectId,
      recovery,
      mandate: mandateRead.response.mandate,
      workspace: workspace.response,
      self: self.response,
      accountBinding: accountBinding.response,
      creditApplication: application.response,
      ownedObligation: owned.response,
      evidence: evidence.response
    });
    const candidateBinding = scope.mode === "exact_release"
      ? {
          candidateReleaseId: scope.candidateReleaseId,
          acceptancePhase: scope.acceptancePhase
        }
      : {};
    const applicationHandoff = {
      schemaVersion: "local_agent_reference_application_recovery.v1",
      status: "accepted_recovered",
      subjectId,
      mandateId: recovery.mandateId,
      creditIntentId: recovery.creditIntentId,
      serverTruth: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionAuthority: false
    };
    const offerReceipt = {
      schemaVersion: "local_agent_reference_offer_recovery.v1",
      status: "accepted_recovered",
      subjectId,
      mandateId: recovery.mandateId,
      creditIntent: application.response.creditIntent,
      decision: application.response.decision,
      offer: application.response.offer,
      continuationStatus: "not_actionable_after_acceptance",
      serverTruth: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsApproved: false
    };
    return {
      schemaVersion: "local_agent_reference_acceptance.v1",
      status: "passed",
      acceptanceMode: scope.mode === "exact_release"
        ? "after_restart_recovered"
        : "developer_recovered",
      ...candidateBinding,
      ...(scope.mode === "exact_release"
        ? { candidateMarker: scope.mandateNonce }
        : {}),
      accountHash,
      databaseStartedAt,
      subjectId,
      mandateId: recovery.mandateId,
      creditIntentId: recovery.creditIntentId,
      creditOfferId: recovery.creditOfferId,
      obligationId: recovery.obligationId,
      facilityId: recovery.facilityId,
      creditLineId: recovery.creditLineId,
      evidenceEventCount: evidence.response.items.length,
      applicationHandoff,
      offerReceipt,
      runtimeHandoff,
      recoveryReceipt,
      canonicalLifecycleReadOnly: true,
      lifecycleMutationPerformed: false,
      canonicalRecovery: {
        workspace: workspace.response,
        subject: self.response,
        accountBinding: accountBinding.response,
        creditApplication: application.response,
        obligation: owned.response,
        evidence: evidence.response
      },
      sandboxOnly: true,
      productionFundsMoved: false
    };
  } finally {
    await session.close();
  }
}

const humanRuntime = await createPrivatePilotGateway(
  process.env.DATABASE_URL
);
let agentSession;
try {
  const scope = loadReferenceAgentAcceptanceScope(process.env);
  const controller = humanRuntime.authentication.identities.controller;
  const humanClient = new HumanTenantCommandClient({
    gateway: humanRuntime.gateway,
    authenticationContextProvider: async () => controller.createContext(),
    networkContextProvider: async () => createTrustedNetworkContext({
      networkRefHash: hashId(
        "private_pilot_network",
        "local_agent_reference_acceptance"
      ),
      source: "local_test"
    })
  });
  const reference = await ensureCurrentBoundAgentSubject({
    humanClient,
    humanRuntime,
    databaseUrl: process.env.DATABASE_URL,
    scope
  });
  const subjectId = reference.subjectId;
  if (reference.recovery) {
    const acceptance = await recoverCurrentReferenceAcceptance({
      humanClient,
      databaseUrl: process.env.DATABASE_URL,
      subjectId,
      recovery: reference.recovery,
      scope,
      accountHash: reference.expectedAccountHash,
      databaseStartedAt: reference.databaseStartedAt ??
        reference.candidateLifecycle?.databaseStartedAt
    });
    process.stdout.write(`${JSON.stringify(acceptance, null, 2)}\n`);
  } else {
  const existingCandidate = reference.candidateLifecycle;
  let mandateId = existingCandidate?.mandateId;
  let mandate;
  if (mandateId) {
    const existingRead = await humanClient.getMandate({
      mandateId,
      requestId: identifier("request-agent-mandate-read"),
      correlationId: identifier("correlation-agent-acceptance")
    });
    mandate = existingRead.response.mandate;
  } else {
    const now = scope.mode === "exact_release"
      ? new Date(reference.subjectCreatedAt)
      : new Date();
    const mandateResult = await humanClient.createDraftMandate({
      subjectId,
      payload: {
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
        assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
        perActionLimitMinor: "10000",
        aggregateLimitMinor: "25000",
        validFrom: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + 30 * 86_400_000
        ).toISOString(),
        nonce: scope.mandateNonce ?? identifier("local-agent-reference"),
        termsRef: "urn:ipo.one:terms:agent-credit-sandbox:v1"
      },
      idempotencyKey: scope.mode === "exact_release"
        ? `m1b-agent-mandate-${scope.candidateReleaseId}`
        : identifier("idempotency-agent-mandate"),
      requestId: scope.mode === "exact_release"
        ? `request-m1b-agent-mandate-${scope.candidateReleaseId.slice(0, 24)}`
        : identifier("request-agent-mandate"),
      correlationId: identifier("correlation-agent-acceptance")
    });
    mandateId = mandateResult.response.mandateId;
    const createdRead = await humanClient.getMandate({
      mandateId,
      requestId: identifier("request-agent-mandate-read"),
      correlationId: identifier("correlation-agent-acceptance")
    });
    mandate = createdRead.response.mandate;
  }
  let offerReceipt = existingCandidate?.offerReceipt;
  const applicationHandoff = mandate.status === "draft"
    ? createApplicationReadyAgentHandoffManifest(mandate)
    : null;
  if (!offerReceipt) {
    if (!applicationHandoff) {
      throw new DomainError(
        "reference_agent_candidate_offer_unavailable",
        "active exact-candidate Mandate is missing its persisted Offer receipt"
      );
    }
    agentSession = await createDurableLocalAgentSession({
      databaseUrl: process.env.DATABASE_URL,
      manifest: applicationHandoff,
      networkSource: "local_reference_agent_application"
    });
    offerReceipt = await runLocalAgentApplicationWorkflow({
      manifest: applicationHandoff,
      session: agentSession
    });
    await persistLocalAgentContinuationReceipt({
      receipt: offerReceipt,
      session: agentSession
    });
    await agentSession.close();
    agentSession = undefined;
  }
  if (
    offerReceipt.status !== "offer_ready" ||
    offerReceipt.mandateId !== mandateId
  ) {
    throw new Error("Agent Offer receipt did not match the Draft Mandate");
  }
  const activation = mandate.status === "active"
    ? { response: { mandate } }
    : await humanClient.activateSandboxMandate({
        mandateId,
        payload: {
          expectedMandateHash: mandate.mandateHash,
          acknowledgedTermsHash: mandate.termsHash,
          acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
        },
        idempotencyKey: scope.mode === "exact_release"
          ? `m1b-agent-activate-${scope.candidateReleaseId}`
          : identifier("idempotency-agent-activate"),
        requestId: scope.mode === "exact_release"
          ? `request-m1b-agent-activate-${scope.candidateReleaseId.slice(0, 24)}`
          : identifier("request-agent-activate"),
        correlationId: identifier("correlation-agent-acceptance")
      });
  const runtimeHandoff = createReadyAgentHandoffManifest(
    activation.response.mandate
  );
  if (!runtimeHandoff) throw new Error("runtime handoff was not created");

  agentSession = await createDurableLocalAgentSession({
    databaseUrl: process.env.DATABASE_URL,
    manifest: runtimeHandoff,
    networkSource: "local_reference_agent_runtime"
  });
  const lifecycle = await runLocalAgentRuntimeWorkflow({
    manifest: runtimeHandoff,
    offerReceipt,
    session: agentSession
  });
  if (
    lifecycle.status !== "evidence_read" ||
    lifecycle.workflowReceipt.status !== "repayment_posted" ||
    lifecycle.workflowReceipt.mandateId !== mandateId ||
    lifecycle.evidence.obligationId !==
      lifecycle.workflowReceipt.obligation.obligationId ||
    lifecycle.evidence.items.length < 1 ||
    lifecycle.productionFundsMoved !== false
  ) {
    throw new Error(
      "Agent runtime result did not complete the no-funds Evidence loop"
    );
  }
  const completedCandidate = scope.mode === "exact_release"
    ? await findCandidateLifecycle({
        humanRuntime,
        controller,
        agentActorId: humanRuntime.authentication.identities.agent.actorId,
        scope,
        subjectId,
        expectedAccountHash: reference.expectedAccountHash
      })
    : null;
  if (scope.mode === "exact_release") {
    requireCanonicalRecoveryIds(completedCandidate?.recovery);
    if (
      completedCandidate.mandateId !== mandateId ||
      completedCandidate.offerReceipt?.offer?.creditOfferId !==
        completedCandidate.recovery.creditOfferId ||
      completedCandidate.recovery.obligationId !==
        lifecycle.workflowReceipt.obligation.obligationId ||
      completedCandidate.recovery.creditIntentId !==
        lifecycle.workflowReceipt.creditIntentId ||
      completedCandidate.recovery.creditOfferId !==
        lifecycle.workflowReceipt.creditOfferId ||
      lifecycle.mcpReceipt?.status !== "evidence_read"
    ) {
      throw new DomainError(
        "reference_agent_candidate_lifecycle_mismatch",
        "MCP result does not match the exact candidate's durable CreditLine lifecycle"
      );
    }
  }
  const completedRecovery = completedCandidate?.recovery;
  const recoveredApplicationHandoff = applicationHandoff ?? {
    schemaVersion: "local_agent_reference_application_recovery.v1",
    status: "offer_recovered",
    subjectId,
    mandateId,
    creditIntentId: offerReceipt.creditIntent.creditIntentId,
    serverTruth: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionAuthority: false
  };
    process.stdout.write(`${JSON.stringify({
    schemaVersion: "local_agent_reference_acceptance.v1",
    status: "passed",
    acceptanceMode: scope.mode === "exact_release"
      ? "before_restart_executed"
      : "developer_executed",
    ...(scope.mode === "exact_release"
      ? {
          candidateReleaseId: scope.candidateReleaseId,
          acceptancePhase: scope.acceptancePhase,
          candidateMarker: scope.mandateNonce,
          accountHash: reference.expectedAccountHash,
          databaseStartedAt: completedCandidate.databaseStartedAt
        }
      : {}),
    subjectId,
    mandateId,
    creditIntentId: completedRecovery?.creditIntentId ??
      lifecycle.workflowReceipt.creditIntentId,
    creditOfferId: completedRecovery?.creditOfferId ??
      lifecycle.workflowReceipt.creditOfferId,
    obligationId: completedRecovery?.obligationId ??
      lifecycle.workflowReceipt.obligation.obligationId,
    ...(completedRecovery
      ? {
          facilityId: completedRecovery.facilityId,
          creditLineId: completedRecovery.creditLineId
        }
      : {}),
    evidenceEventCount: lifecycle.evidence.items.length,
    applicationHandoff: recoveredApplicationHandoff,
    offerReceipt,
    runtimeHandoff,
    lifecycle,
    sandboxOnly: true,
    productionFundsMoved: false
  }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(
    `Local Agent acceptance failed: ${error?.code ?? error?.message ?? "unknown"}\n`
  );
  process.exitCode = 1;
} finally {
  await agentSession?.close();
  await humanRuntime.pool.end();
}
