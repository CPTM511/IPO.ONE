import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  M1_B_ACCEPTANCE_SECRET_MOUNT
} from "../src/m1-b-acceptance-postgres.js";
import {
  M1_B_OPERATIONAL_BROWSER_APP_ROLE_READ_SCHEMA_VERSION,
  M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION,
  parseM1BOperationalBrowserReadContext,
  parseM1BOperationalRuntimeReadArguments,
  readM1BOperationalRuntime,
  validateM1BOperationalBrowserAppRoleRead
} from "../src/m1-b-operational-runtime-read.js";

const RELEASE_SHA = "a".repeat(40);
const RUNTIME_IMAGE_ID = `sha256:${"b".repeat(64)}`;
const DATABASE_STARTED_AT = "2026-08-15T00:00:00.000Z";
const DATABASE_OBSERVED_AT = "2026-08-15T00:08:00.000Z";
const ENVIRONMENT = Object.freeze({
  DATABASE_URL: "postgresql://127.0.0.2:55432/ipo_one_private_pilot",
  IPO_ONE_M1_B_RELEASE_SHA: RELEASE_SHA,
  IPO_ONE_PILOT_DB_SECRET_FILE: M1_B_ACCEPTANCE_SECRET_MOUNT
});
const BROWSER_CONTEXT = Object.freeze({
  schemaVersion: M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION,
  candidateReleaseId: RELEASE_SHA,
  runtimeImageId: RUNTIME_IMAGE_ID,
  expectedDatabaseStartedAt: DATABASE_STARTED_AT,
  promptIssuedAt: "2026-08-15T00:05:30.000Z",
  role: "human",
  operationId: "pilotReadWorkspaceResume",
  requestId: "request_m1b_browser_read_0001",
  correlationId: "correlation_m1b_browser_read_0001"
});
const BROWSER_ENVIRONMENT = Object.freeze({
  ...ENVIRONMENT,
  NODE_ENV: "test",
  IPO_ONE_M1_B_RUNTIME_IMAGE_ID: RUNTIME_IMAGE_ID,
  IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT: DATABASE_STARTED_AT
});

function runtimePool({ role = "ipo_one_private_pilot_app", inRecovery = false } = {}) {
  const queries = [];
  let ended = false;
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (/pg_postmaster_start_time/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            database_started_at: "2026-08-15T00:00:00.000Z",
            database_role: role,
            database_name: "ipo_one_private_pilot",
            in_recovery: inRecovery
          }]
        };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {
      released = true;
    }
  };
  return {
    pool: {
      async connect() {
        return client;
      },
      async end() {
        ended = true;
      }
    },
    state: {
      queries,
      get ended() {
        return ended;
      },
      get released() {
        return released;
      }
    }
  };
}

function browserAuditRow(sequence, overrides = {}) {
  const occurredAt = sequence === 1
    ? "2026-08-15T00:06:00.000Z"
    : "2026-08-15T00:06:00.001Z";
  return {
    audit_event_id: `authorization_event_browser_read_${sequence}`,
    occurred_at: occurredAt,
    request_id: BROWSER_CONTEXT.requestId,
    correlation_id: BROWSER_CONTEXT.correlationId,
    audit_actor_type: "human",
    audit_client_ref_hash: "c".repeat(43),
    audit_token_jti_hash: "j".repeat(43),
    operation_id: BROWSER_CONTEXT.operationId,
    action: "workspace.resume.self",
    resource_type: "workspace",
    resource_id: "workspace_actor_human_borrower_pilot",
    authorization_decision: "allow",
    authorization_decision_id: `authorization_decision_browser_read_${sequence}`,
    command_payload_hash: null,
    command_hash: null,
    audit_policy_version: "security_001.v1",
    reason_code: "authorization_allowed",
    audit_membership_id: "membership_actor_human_borrower_pilot",
    actor_type: "human",
    actor_status: "active",
    session_ref_hash: "s".repeat(43),
    session_actor_id: "actor_human_borrower_pilot",
    session_client_id: "client_human_borrower_pilot",
    session_credential_id: "credential_00000000-0000-4000-8000-000000000001",
    session_credential_version: 1,
    authentication_method: "siwe",
    session_sender_constraint_method: "host_session",
    session_policy_version: "security_001.v1",
    session_roles: ["human_borrower"],
    session_allowed_capabilities: ["workspace.resume.self"],
    auth_time: "2026-08-15T00:05:00.000Z",
    acr: "urn:ipo.one:acr:wallet",
    amr: ["wallet", "siwe", "eip191_eoa_v1"],
    session_created_at: "2026-08-15T00:05:00.000Z",
    session_last_seen_at: occurredAt,
    idle_expires_at: "2026-08-15T00:30:00.000Z",
    absolute_expires_at: "2026-08-15T01:00:00.000Z",
    session_status: "active",
    credential_actor_id: "actor_human_borrower_pilot",
    credential_actor_type: "human",
    credential_client_id: "client_human_borrower_pilot",
    client_authentication_method: "siwe",
    credential_sender_constraint_method: "host_session",
    credential_policy_version: "security_001.v1",
    credential_roles: ["human_borrower"],
    credential_allowed_capabilities: ["workspace.resume.self"],
    credential_status: "active",
    current_credential_version: 1,
    credential_created_at: "2026-08-14T23:59:00.000Z",
    credential_expires_at: null,
    membership_id: "membership_actor_human_borrower_pilot",
    membership_actor_id: "actor_human_borrower_pilot",
    role_bundle: "human_borrower",
    membership_capabilities: ["workspace.resume.self"],
    membership_client_ids: ["client_human_borrower_pilot"],
    membership_policy_version: "security_001.v1",
    membership_status: "active",
    membership_valid_from: "2026-08-14T23:58:00.000Z",
    membership_expires_at: null,
    session_match_count: 1,
    ...overrides
  };
}

function systemActorCredentialRegistration(row, overrides = {}) {
  return {
    tenant_id: "tenant_ipo_one_local_pilot",
    actor_id: "actor_local_authentication_system",
    credential_id: row.session_credential_id,
    event_type: "credential_registered",
    occurred_at: "2026-08-14T23:59:00.000Z",
    payload: {
      actorType: row.credential_actor_type,
      clientAuthenticationMethod: row.client_authentication_method,
      invitationRefHash: "i".repeat(43),
      senderConstraintMethod: row.credential_sender_constraint_method,
      version: row.current_credential_version
    },
    ...overrides
  };
}

function browserRuntimePool({
  auditRows = [browserAuditRow(1), browserAuditRow(2)],
  registrationEvents,
  initialIdentity = {},
  finalIdentity = {}
} = {}) {
  const seededRegistrationEvents = registrationEvents ?? (
    auditRows.length === 0 ? [] : [systemActorCredentialRegistration(auditRows[0])]
  );
  const queries = [];
  let identityRead = 0;
  let ended = false;
  let released = false;
  const identity = (overrides, observedAt) => ({
    database_started_at: DATABASE_STARTED_AT,
    database_observed_at: observedAt,
    database_role: "ipo_one_private_pilot_app",
    database_name: "ipo_one_private_pilot",
    in_recovery: false,
    ...overrides
  });
  const client = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (/pg_postmaster_start_time/.test(sql)) {
        const row = identityRead === 0
          ? identity(initialIdentity, "2026-08-15T00:07:00.000Z")
          : identity(finalIdentity, DATABASE_OBSERVED_AT);
        identityRead += 1;
        return { rowCount: 1, rows: [row] };
      }
      if (/FROM authorization_audit_events a/.test(sql)) {
        const rows = auditRows.map((row) => {
          const registrations = seededRegistrationEvents.filter((event) =>
            event.tenant_id === "tenant_ipo_one_local_pilot" &&
            event.credential_id === row.session_credential_id &&
            event.event_type === "credential_registered"
          );
          const invitedRegistrations = registrations.filter(
            ({ payload }) => Object.hasOwn(payload, "invitationRefHash")
          );
          const matchingRegistrations = invitedRegistrations.filter(
            ({ payload }) =>
              payload.actorType === row.credential_actor_type &&
              payload.clientAuthenticationMethod ===
                row.client_authentication_method &&
              payload.senderConstraintMethod ===
                row.credential_sender_constraint_method &&
              String(payload.version) === String(row.current_credential_version)
          );
          return {
            registration_count: registrations.length,
            invitation_registration_count: invitedRegistrations.length,
            matching_invitation_registration_count: matchingRegistrations.length,
            registration_occurred_at: registrations
              .map(({ occurred_at: occurredAt }) => occurredAt)
              .sort()[0],
            ...row
          };
        });
        return { rowCount: rows.length, rows };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {
      released = true;
    }
  };
  return {
    pool: {
      async connect() {
        return client;
      },
      async end() {
        ended = true;
      }
    },
    state: {
      queries,
      registrationEvents: seededRegistrationEvents,
      get ended() {
        return ended;
      },
      get released() {
        return released;
      }
    }
  };
}

test("operational runtime reader supplies the exact credential-free app-role pool contract", async () => {
  const { pool, state } = runtimePool();
  let poolOptions;
  const receipt = await readM1BOperationalRuntime({
    environment: ENVIRONMENT,
    async createPool(options) {
      poolOptions = options;
      return pool;
    }
  });

  assert.deepEqual(poolOptions, {
    databaseUrl: ENVIRONMENT.DATABASE_URL,
    secretPath: M1_B_ACCEPTANCE_SECRET_MOUNT,
    applicationName: "ipo-one-m1-b-operational-read",
    max: 1
  });
  assert.equal(
    state.queries[0],
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
  );
  assert.match(state.queries[1], /pg_postmaster_start_time/);
  assert.equal(state.queries.at(-1), "COMMIT");
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
  assert.deepEqual(receipt, {
    schemaVersion: "m1_b_operational_runtime_read.v1",
    candidateReleaseId: RELEASE_SHA,
    databaseStartedAt: "2026-08-15T00:00:00.000Z",
    databaseRole: "ipo_one_private_pilot_app",
    databaseName: "ipo_one_private_pilot",
    readOnlyEvidenceRole: true,
    databaseInRecovery: false,
    credentialsIncluded: false,
    schemaVersionSource: "postgresql_server_truth"
  });
});

test("operational runtime reader rejects credential-bearing URLs before pool creation", async () => {
  let createPoolCalled = false;
  await assert.rejects(
    readM1BOperationalRuntime({
      environment: {
        ...ENVIRONMENT,
        DATABASE_URL: "postgresql://owner:owner-secret@127.0.0.2:55432/ipo_one_private_pilot"
      },
      async createPool() {
        createPoolCalled = true;
      }
    }),
    /operational_runtime_database_url_invalid/
  );
  assert.equal(createPoolCalled, false);
});

test("operational runtime reader rolls back and closes on an untrusted database", async () => {
  const { pool, state } = runtimePool({ role: "ipo_one_owner" });
  await assert.rejects(
    readM1BOperationalRuntime({
      environment: ENVIRONMENT,
      createPool: async () => pool
    }),
    /operational_runtime_database_untrusted/
  );
  assert.equal(state.queries.at(-1), "ROLLBACK");
  assert.equal(state.released, true);
  assert.equal(state.ended, true);
});

test("browser private-read context is exact, role-closed, and available through argv JSON", () => {
  const parsed = parseM1BOperationalBrowserReadContext(
    JSON.stringify(BROWSER_CONTEXT)
  );
  assert.deepEqual(parsed, BROWSER_CONTEXT);
  assert.deepEqual(
    parseM1BOperationalRuntimeReadArguments([
      "--browser-read-context-json",
      JSON.stringify(BROWSER_CONTEXT)
    ]),
    BROWSER_CONTEXT
  );
  assert.equal(parseM1BOperationalRuntimeReadArguments([]), null);

  for (const context of [
    { ...BROWSER_CONTEXT, operationId: "pilotReadCapitalPartnerSelf" },
    { ...BROWSER_CONTEXT, role: "controller" },
    { ...BROWSER_CONTEXT, actorId: "actor_human_borrower_pilot" },
    { ...BROWSER_CONTEXT, promptIssuedAt: "not-a-time" }
  ]) {
    assert.throws(
      () => parseM1BOperationalBrowserReadContext(context),
      /operational_browser_read_context_invalid/
    );
  }
  assert.throws(
    () => parseM1BOperationalBrowserReadContext(
      `{"schemaVersion":"${M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION}",` +
      `"schemaVersion":"${M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION}"}`
    ),
    /operational_browser_read_context_invalid/
  );
  assert.throws(
    () => parseM1BOperationalRuntimeReadArguments(["--unknown", "value"]),
    /operational_browser_read_arguments_invalid/
  );

  assert.doesNotThrow(() => parseM1BOperationalBrowserReadContext({
    ...BROWSER_CONTEXT,
    role: "principal_agent"
  }));
  assert.doesNotThrow(() => parseM1BOperationalBrowserReadContext({
    ...BROWSER_CONTEXT,
    role: "capital_partner",
    operationId: "pilotReadCapitalPartnerSelf"
  }));
});

test("browser private read binds one request to the exact two allow audits and safe SIWE truth", async () => {
  const { pool, state } = browserRuntimePool();
  const receipt = await readM1BOperationalRuntime({
    environment: BROWSER_ENVIRONMENT,
    browserReadContext: BROWSER_CONTEXT,
    createPool: async () => pool
  });

  assert.equal(
    receipt.schemaVersion,
    M1_B_OPERATIONAL_BROWSER_APP_ROLE_READ_SCHEMA_VERSION
  );
  assert.equal(receipt.authorizationAttemptCount, 1);
  assert.equal(receipt.authorizationEvidenceSource, "postgresql_server_truth");
  assert.equal(receipt.schemaVersionSource, "reviewed_protocol_registry");
  assert.deepEqual(receipt.authorizationBinding, {
    exactRequestAttempt: true,
    tenantBound: true,
    reviewedActorBound: true,
    operationBound: true,
    exactTwoAllowAuditSetBound: true
  });
  assert.equal(receipt.responseSchemaVersion, "tenant_workspace_resume_view.v2");
  assert.equal(receipt.authorizationAuditEventCount, 2);
  assert.deepEqual(receipt.authorizationAuditEvents, [
    {
      sequence: 1,
      eventId: "authorization_event_browser_read_1",
      decisionId: "authorization_decision_browser_read_1",
      occurredAt: "2026-08-15T00:06:00.000Z"
    },
    {
      sequence: 2,
      eventId: "authorization_event_browser_read_2",
      decisionId: "authorization_decision_browser_read_2",
      occurredAt: "2026-08-15T00:06:00.001Z"
    }
  ]);
  const canonicalJson = (value) => {
    if (value === null) return "null";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map(canonicalJson).join(",")}]`;
    }
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  };
  const manifest = {
    requestId: BROWSER_CONTEXT.requestId,
    correlationId: BROWSER_CONTEXT.correlationId,
    operationId: BROWSER_CONTEXT.operationId,
    events: receipt.authorizationAuditEvents
  };
  assert.equal(
    receipt.authorizationAuditManifestSha256,
    createHash("sha256").update(canonicalJson(manifest)).digest("hex")
  );
  assert.deepEqual(receipt.authenticationAssurance, {
    authTime: "2026-08-15T00:05:00.000Z",
    activeReviewedActorCount: 1,
    activeSiweSessionCount: 1,
    activeInvitedWalletCredentialCount: 1,
    activeMembershipCount: 1,
    boundClientCount: 1,
    requiredCapabilityCount: 1,
    invitedCredentialRegistrationCount: 1,
    auditSessionBindingVerified: true,
    clientBindingVerified: true,
    capabilityBindingVerified: true
  });
  assert.deepEqual(receipt.runtimeBinding, {
    candidateReleaseUnchanged: true,
    runtimeImageUnchanged: true,
    databaseStartUnchanged: true
  });
  assert.equal(receipt.promptIssuedAt, BROWSER_CONTEXT.promptIssuedAt);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.sessionMaterialIncluded, false);
  assert.equal(receipt.actorIdentifiersIncluded, false);
  assert.equal(receipt.rawPiiIncluded, false);

  const tenantContext = state.queries.find(({ sql }) =>
    /set_config\('app\.tenant_id'/.test(sql)
  );
  assert.deepEqual(tenantContext.parameters, [
    "tenant_ipo_one_local_pilot",
    "actor_human_borrower_pilot",
    "security_001.v1"
  ]);
  const auditQuery = state.queries.find(({ sql }) =>
    /FROM authorization_audit_events a/.test(sql)
  );
  assert.deepEqual(auditQuery.parameters, [
    "tenant_ipo_one_local_pilot",
    "actor_human_borrower_pilot",
    "pilotReadWorkspaceResume",
    BROWSER_CONTEXT.requestId,
    BROWSER_CONTEXT.correlationId
  ]);
  assert.match(auditQuery.sql, /e\.credential_id = c\.id/);
  assert.doesNotMatch(auditQuery.sql, /e\.actor_id = c\.actor_id/);
  assert.match(auditQuery.sql, /e\.payload ->> 'actorType' = c\.actor_type::text/);
  assert.match(auditQuery.sql, /e\.payload \? 'invitationRefHash'/);
  assert.equal(
    state.registrationEvents[0].actor_id,
    "actor_local_authentication_system"
  );
  assert.notEqual(
    state.registrationEvents[0].actor_id,
    browserAuditRow(1).credential_actor_id
  );
  assert.equal(state.queries.at(-1).sql, "COMMIT");
  assert.equal(state.released, true);
  assert.equal(state.ended, true);

  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /actor_human_borrower_pilot/);
  assert.doesNotMatch(serialized, /credential_00000000/);
  assert.doesNotMatch(serialized, /client_human_borrower_pilot/);
  assert.doesNotMatch(serialized, /s{20}/);
  assert.doesNotMatch(serialized, /token_jti|session_ref|invitationRefHash/i);
});

test("browser app-role read validator rejects direct receipt and context tampering", async (t) => {
  const { pool } = browserRuntimePool();
  const receipt = await readM1BOperationalRuntime({
    environment: BROWSER_ENVIRONMENT,
    browserReadContext: BROWSER_CONTEXT,
    createPool: async () => pool
  });
  assert.equal(
    validateM1BOperationalBrowserAppRoleRead(receipt, BROWSER_CONTEXT),
    receipt
  );

  const clone = () => structuredClone(receipt);
  const cases = [
    {
      name: "top-level extra key",
      mutate(value) {
        value.unreviewed = true;
      }
    },
    {
      name: "candidate mismatch",
      mutate(value) {
        value.candidateReleaseId = "f".repeat(40);
      }
    },
    {
      name: "request mismatch",
      mutate(value) {
        value.requestId = "request_m1b_browser_read_tampered";
      }
    },
    {
      name: "role mismatch",
      mutate(value) {
        value.role = "principal_agent";
      }
    },
    {
      name: "audit event extra key",
      mutate(value) {
        value.authorizationAuditEvents[0].stage = "authorize";
      }
    },
    {
      name: "duplicate audit event",
      mutate(value) {
        value.authorizationAuditEvents[1].eventId =
          value.authorizationAuditEvents[0].eventId;
      }
    },
    {
      name: "audit before prompt",
      mutate(value) {
        value.authorizationAuditEvents[0].occurredAt =
          "2026-08-15T00:05:00.000Z";
      }
    },
    {
      name: "manifest hash mismatch",
      mutate(value) {
        value.authorizationAuditManifestSha256 = "0".repeat(64);
      }
    },
    {
      name: "source-derived allow set binding false",
      mutate(value) {
        value.authorizationBinding.exactTwoAllowAuditSetBound = false;
      }
    },
    {
      name: "authentication count mismatch",
      mutate(value) {
        value.authenticationAssurance.activeReviewedActorCount = 0;
      }
    },
    {
      name: "authentication after audit",
      mutate(value) {
        value.authenticationAssurance.authTime =
          "2026-08-15T00:07:00.000Z";
      }
    },
    {
      name: "runtime binding false",
      mutate(value) {
        value.runtimeBinding.databaseStartUnchanged = false;
      }
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, () => {
      const tampered = clone();
      candidate.mutate(tampered);
      assert.throws(
        () => validateM1BOperationalBrowserAppRoleRead(
          tampered,
          BROWSER_CONTEXT
        ),
        /operational_browser_app_role_read_invalid/
      );
    });
  }

  assert.throws(
    () => validateM1BOperationalBrowserAppRoleRead(receipt, {
      ...BROWSER_CONTEXT,
      requestId: "request_m1b_browser_read_other"
    }),
    /operational_browser_app_role_read_invalid/
  );
});

test("browser private read accepts the same exact context from the safe environment channel", async () => {
  const { pool } = browserRuntimePool();
  const receipt = await readM1BOperationalRuntime({
    environment: {
      ...BROWSER_ENVIRONMENT,
      IPO_ONE_M1_B_BROWSER_READ_CONTEXT_JSON: JSON.stringify(BROWSER_CONTEXT)
    },
    createPool: async () => pool
  });
  assert.equal(
    receipt.schemaVersion,
    M1_B_OPERATIONAL_BROWSER_APP_ROLE_READ_SCHEMA_VERSION
  );
});

test("browser private read maps Principal and Capital Partner roles only to reviewed actors and workspace policies", async (t) => {
  const cases = [
    {
      role: "principal_agent",
      operationId: "pilotReadWorkspaceResume",
      actorId: "actor_principal_controller_pilot",
      roleBundle: "principal_controller",
      capability: "workspace.resume.self",
      action: "workspace.resume.self",
      suffix: "controller"
    },
    {
      role: "capital_partner",
      operationId: "pilotReadCapitalPartnerSelf",
      actorId: "actor_capital_partner_pilot",
      roleBundle: "capital_partner_operator",
      capability: "capital_partner.portfolio.read.own",
      action: "capital_partner.portfolio.read.own",
      suffix: "capital_partner"
    }
  ];
  for (const roleCase of cases) {
    await t.test(roleCase.role, async () => {
      const context = {
        ...BROWSER_CONTEXT,
        role: roleCase.role,
        operationId: roleCase.operationId,
        requestId: `request_m1b_browser_${roleCase.suffix}_0001`,
        correlationId: `correlation_m1b_browser_${roleCase.suffix}_0001`
      };
      const rows = [1, 2].map((sequence) => browserAuditRow(sequence, {
        request_id: context.requestId,
        correlation_id: context.correlationId,
        operation_id: roleCase.operationId,
        action: roleCase.action,
        resource_type: "workspace",
        resource_id: `workspace_${roleCase.suffix}_pilot`,
        audit_membership_id: `membership_${roleCase.actorId}`,
        session_actor_id: roleCase.actorId,
        session_client_id: `client_${roleCase.suffix}_pilot`,
        session_credential_id:
          `credential_00000000-0000-4000-8000-00000000000${sequence + 1}`,
        session_roles: [roleCase.roleBundle],
        session_allowed_capabilities: [roleCase.capability],
        credential_actor_id: roleCase.actorId,
        credential_client_id: `client_${roleCase.suffix}_pilot`,
        credential_roles: [roleCase.roleBundle],
        credential_allowed_capabilities: [roleCase.capability],
        membership_id: `membership_${roleCase.actorId}`,
        membership_actor_id: roleCase.actorId,
        role_bundle: roleCase.roleBundle,
        membership_capabilities: [roleCase.capability],
        membership_client_ids: [`client_${roleCase.suffix}_pilot`]
      }));
      // Both database-observed allow events must bind the same exact credential.
      rows[1].session_credential_id = rows[0].session_credential_id;
      const { pool, state } = browserRuntimePool({ auditRows: rows });
      const receipt = await readM1BOperationalRuntime({
        environment: BROWSER_ENVIRONMENT,
        browserReadContext: context,
        createPool: async () => pool
      });
      assert.equal(receipt.role, roleCase.role);
      assert.equal(receipt.operationId, roleCase.operationId);
      assert.equal(
        receipt.responseSchemaVersion,
        roleCase.role === "capital_partner"
          ? "tenant_capital_partner_self_view.v1"
          : "tenant_workspace_resume_view.v2"
      );
      const query = state.queries.find(({ sql }) =>
        /FROM authorization_audit_events a/.test(sql)
      );
      assert.equal(query.parameters[1], roleCase.actorId);
      assert.equal(query.parameters[2], roleCase.operationId);
      assert.match(query.sql, /a\.resource_type/);
      assert.equal(receipt.authenticationAssurance.capabilityBindingVerified, true);
    });
  }
});

test("browser private read rejects missing, duplicate, stale, and unbound audit/authentication truth", async (t) => {
  const cases = [
    {
      name: "missing allow audit",
      rows: [browserAuditRow(1)],
      code: /operational_browser_read_audit_set_invalid/
    },
    {
      name: "extra allow audit",
      rows: [browserAuditRow(1), browserAuditRow(2), browserAuditRow(2, {
        audit_event_id: "authorization_event_browser_read_3",
        authorization_decision_id: "authorization_decision_browser_read_3"
      })],
      code: /operational_browser_read_audit_set_invalid/
    },
    {
      name: "duplicate audit event",
      rows: [
        browserAuditRow(1),
        browserAuditRow(2, {
          audit_event_id: "authorization_event_browser_read_1"
        })
      ],
      code: /operational_browser_read_audit_set_invalid/
    },
    {
      name: "shared audit token binding changed",
      rows: [
        browserAuditRow(1),
        browserAuditRow(2, { audit_token_jti_hash: "k".repeat(43) })
      ],
      code: /operational_browser_read_audit_set_invalid/
    },
    {
      name: "shared audit client binding changed",
      rows: [
        browserAuditRow(1),
        browserAuditRow(2, { audit_client_ref_hash: "d".repeat(43) })
      ],
      code: /operational_browser_read_audit_set_invalid/
    },
    {
      name: "duplicate decision",
      rows: [
        browserAuditRow(1),
        browserAuditRow(2, {
          authorization_decision_id:
            "authorization_decision_browser_read_1"
        })
      ],
      code: /operational_browser_read_audit_set_invalid/
    },
    {
      name: "audit before producer prompt",
      rows: [
        browserAuditRow(1, { occurred_at: "2026-08-15T00:05:00.000Z" }),
        browserAuditRow(2)
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "reviewed actor is inactive",
      rows: [
        browserAuditRow(1, { actor_status: "suspended" }),
        browserAuditRow(2, { actor_status: "suspended" })
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "query audit carries a command hash",
      rows: [
        browserAuditRow(1, { command_hash: `0x${"1".repeat(64)}` }),
        browserAuditRow(2, { command_hash: `0x${"1".repeat(64)}` })
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "authentication before current database start",
      rows: [
        browserAuditRow(1, { auth_time: "2026-08-14T23:59:59.999Z" }),
        browserAuditRow(2, { auth_time: "2026-08-14T23:59:59.999Z" })
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "wrong operation audit",
      rows: [
        browserAuditRow(1, { operation_id: "pilotReadCapitalPartnerSelf" }),
        browserAuditRow(2)
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "missing reviewed capability",
      rows: [
        browserAuditRow(1, {
          session_allowed_capabilities: [],
          credential_allowed_capabilities: [],
          membership_capabilities: []
        }),
        browserAuditRow(2, {
          session_allowed_capabilities: [],
          credential_allowed_capabilities: [],
          membership_capabilities: []
        })
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "registration is not the exact invited credential event",
      rows: [
        browserAuditRow(1, { matching_invitation_registration_count: 0 }),
        browserAuditRow(2, { matching_invitation_registration_count: 0 })
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "duplicate invited registration event",
      rows: [
        browserAuditRow(1, {
          registration_count: 2,
          invitation_registration_count: 2,
          matching_invitation_registration_count: 2
        }),
        browserAuditRow(2, {
          registration_count: 2,
          invitation_registration_count: 2,
          matching_invitation_registration_count: 2
        })
      ],
      code: /operational_browser_read_authentication_invalid/
    },
    {
      name: "audit maps to more than one active session",
      rows: [
        browserAuditRow(1, { session_match_count: 2 }),
        browserAuditRow(2)
      ],
      code: /operational_browser_read_authentication_invalid/
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const { pool, state } = browserRuntimePool({
        auditRows: candidate.rows
      });
      await assert.rejects(
        readM1BOperationalRuntime({
          environment: BROWSER_ENVIRONMENT,
          browserReadContext: BROWSER_CONTEXT,
          createPool: async () => pool
        }),
        candidate.code
      );
      assert.equal(state.queries.at(-1).sql, "ROLLBACK");
      assert.equal(state.released, true);
      assert.equal(state.ended, true);
    });
  }
});

test("browser private read rejects runtime binding drift and production dependency overrides before evidence", async () => {
  let createPoolCalled = false;
  await assert.rejects(
    readM1BOperationalRuntime({
      environment: {
        ...BROWSER_ENVIRONMENT,
        IPO_ONE_M1_B_RUNTIME_IMAGE_ID: `sha256:${"d".repeat(64)}`
      },
      browserReadContext: BROWSER_CONTEXT,
      async createPool() {
        createPoolCalled = true;
      }
    }),
    /operational_browser_read_runtime_binding_invalid/
  );
  assert.equal(createPoolCalled, false);

  await assert.rejects(
    readM1BOperationalRuntime({
      environment: { ...BROWSER_ENVIRONMENT, NODE_ENV: "production" },
      browserReadContext: BROWSER_CONTEXT,
      async createPool() {
        createPoolCalled = true;
      }
    }),
    /operational_browser_read_dependency_override_forbidden/
  );
  assert.equal(createPoolCalled, false);

  const drift = browserRuntimePool({
    finalIdentity: {
      database_started_at: "2026-08-15T00:00:01.000Z"
    }
  });
  await assert.rejects(
    readM1BOperationalRuntime({
      environment: BROWSER_ENVIRONMENT,
      browserReadContext: BROWSER_CONTEXT,
      createPool: async () => drift.pool
    }),
    /operational_browser_read_database_drift/
  );
  assert.equal(drift.state.queries.at(-1).sql, "ROLLBACK");

  await assert.rejects(
    readM1BOperationalRuntime({
      environment: {
        ...BROWSER_ENVIRONMENT,
        IPO_ONE_M1_B_BROWSER_READ_CONTEXT_JSON: JSON.stringify(BROWSER_CONTEXT)
      },
      browserReadContext: BROWSER_CONTEXT,
      createPool: async () => browserRuntimePool().pool
    }),
    /operational_browser_read_context_ambiguous/
  );
});
