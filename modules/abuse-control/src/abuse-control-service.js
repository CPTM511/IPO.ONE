import { DomainError, createOperationalId } from "../../../packages/domain/src/index.js";
import { assertAuthenticationContext } from "../../authentication/src/index.js";
import {
  ABUSE_ADMISSION_SCHEMA_VERSION,
  ABUSE_POLICY_VERSION,
  AbuseProfileId,
  AdmissionDisposition,
  AdmissionOutcome,
  RequestMetric,
  ResourceKind,
  RetryAfterClass
} from "./abuse-constants.js";
import {
  assertTrustedAccountContext,
  assertTrustedNetworkContext
} from "./abuse-contexts.js";
import {
  getPublicAbuseProfile,
  getTenantAbusePolicy
} from "./abuse-policy.js";
import { AbuseControlTelemetry } from "./abuse-telemetry.js";
import {
  abuseError,
  abuseHash,
  admissionUnavailable,
  assertAbuseIdentifier,
  assertAbuseShape,
  assertNonNegativeInteger,
  budgetExceeded,
  deepFreezeAbuse
} from "./abuse-utils.js";

const METRIC_NAMES = Object.freeze(Object.values(RequestMetric));
const RESOURCE_NAMES = Object.freeze(Object.values(ResourceKind));
const ADMISSION_OUTCOMES = new Set(Object.values(AdmissionOutcome));
const trustedAdmissions = new WeakSet();
const admissionFacts = new WeakMap();
const admissionLifecycle = new WeakMap();
const admissionTransactionClaims = new WeakMap();

function normalizeBoundedCounters(name, value, allowedNames) {
  if (value === undefined) return Object.fromEntries(allowedNames.map((item) => [item, 0]));
  assertAbuseShape(name, value, { optional: allowedNames });
  return Object.fromEntries(allowedNames.map((item) => [
    item,
    assertNonNegativeInteger(`${name}.${item}`, value[item] ?? 0)
  ]));
}

function normalizeResourceBaselines(value) {
  assertAbuseShape("resourceBaselines", value, { optional: RESOURCE_NAMES });
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw abuseError("invalid_abuse_control_input", "at least one resource baseline is required");
  }
  return Object.fromEntries(entries.map(([kind, count]) => [
    kind,
    assertNonNegativeInteger(`resourceBaselines.${kind}`, count)
  ]));
}

function idempotencyHash({ tenantId, operationId, idempotencyKey, actorRefHash, clientRefHash }) {
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(idempotencyKey)
  ) {
    throw abuseError("invalid_idempotency_key", "A bounded idempotency key is required.");
  }
  return abuseHash("command_reference", {
    tenantId,
    operationId,
    actorRefHash: actorRefHash ?? null,
    clientRefHash: clientRefHash ?? null,
    idempotencyKey
  });
}

function rateReservation({ keyHash, dimension, windowMs, limit, units = 1, commandScoped = false }) {
  return {
    keyHash,
    dimension,
    windowMs,
    limit,
    units,
    commandScoped,
    partition: dimension === "service" ? "service" : "tenant"
  };
}

function capacityReservation({ keyHash, kind, limit, units, release, commandScoped = false, partition }) {
  return {
    keyHash,
    kind,
    limit,
    units,
    release,
    commandScoped,
    partition: partition ?? (kind === "concurrency_service" ? "service" : "tenant")
  };
}

export class AbuseControlService {
  constructor({ store, telemetry = new AbuseControlTelemetry(), clock = () => new Date() }) {
    if (
      !store ||
      typeof store.reserve !== "function" ||
      typeof store.finish !== "function" ||
      typeof store.release !== "function" ||
      typeof clock !== "function"
    ) {
      throw abuseError("invalid_abuse_control_config", "abuse-control dependencies are invalid");
    }
    this.store = store;
    this.telemetry = telemetry;
    this.clock = clock;
  }

  async admitTenant(input, { resourceBaselineLoader } = {}) {
    assertAbuseShape("tenant admission request", input, {
      required: ["authenticationContext", "operationId"],
      optional: [
        "networkContext",
        "idempotencyKey",
        "requestMetrics",
        "resourceDeltas",
        "retryAttempt"
      ]
    });
    const authentication = assertAuthenticationContext(input.authenticationContext);
    if (resourceBaselineLoader !== undefined && typeof resourceBaselineLoader !== "function") {
      throw abuseError("invalid_abuse_control_input", "resource baseline loader is invalid");
    }
    const network = input.networkContext === undefined
      ? undefined
      : assertTrustedNetworkContext(input.networkContext);
    const operation = getTenantAbusePolicy(input.operationId);
    const actorRefHash = abuseHash("actor_reference", {
      tenantId: authentication.tenantId,
      actorId: authentication.actorId
    });
    const clientRefHash = abuseHash("client_reference", {
      tenantId: authentication.tenantId,
      clientId: authentication.clientId
    });
    return this.#admit({
      surface: "tenant",
      tenantId: authentication.tenantId,
      actorRefHash,
      clientRefHash,
      networkRefHash: network?.referenceHash,
      operationId: operation.operationId,
      profile: operation.profile,
      idempotencyKey: input.idempotencyKey,
      requestMetrics: input.requestMetrics,
      resourceDeltas: input.resourceDeltas,
      resourceBaselineLoader,
      retryAttempt: input.retryAttempt,
      facts: {
        kind: "tenant",
        authenticationContext: authentication,
        operationId: operation.operationId,
        ...(network === undefined ? {} : { networkContext: network })
      }
    });
  }

  async admitDiscovery(input) {
    assertAbuseShape("discovery admission request", input, {
      required: ["networkContext"],
      optional: ["requestMetrics", "retryAttempt"]
    });
    const network = assertTrustedNetworkContext(input.networkContext);
    return this.#admit({
      surface: "discovery",
      tenantId: "public_boundary",
      networkRefHash: network.referenceHash,
      operationId: AbuseProfileId.DISCOVERY,
      profile: getPublicAbuseProfile(AbuseProfileId.DISCOVERY),
      requestMetrics: input.requestMetrics,
      retryAttempt: input.retryAttempt,
      facts: { kind: "discovery", networkContext: network }
    });
  }

  async admitCredentialAttempt(input) {
    assertAbuseShape("credential admission request", input, {
      required: ["networkContext", "accountContext"],
      optional: ["requestMetrics"]
    });
    const network = assertTrustedNetworkContext(input.networkContext);
    const account = assertTrustedAccountContext(input.accountContext);
    return this.#admit({
      surface: "credential",
      tenantId: "authentication_boundary",
      networkRefHash: network.referenceHash,
      accountRefHash: account.referenceHash,
      operationId: AbuseProfileId.CREDENTIAL,
      profile: getPublicAbuseProfile(AbuseProfileId.CREDENTIAL),
      requestMetrics: input.requestMetrics,
      facts: { kind: "credential", networkContext: network, accountContext: account }
    });
  }

  assertAdmission(admission, expected = {}) {
    if (!admission || typeof admission !== "object" || !trustedAdmissions.has(admission)) {
      throw abuseError("request_admission_required", "a server-created request admission is required");
    }
    if (admissionLifecycle.get(admission) !== "active") {
      throw abuseError("request_admission_consumed", "request admission has already been consumed");
    }
    const now = this.#now();
    if (new Date(admission.expiresAt).getTime() <= now.getTime()) {
      throw abuseError("request_admission_expired", "request admission has expired");
    }
    const facts = admissionFacts.get(admission);
    if (expected.authenticationContext !== undefined) {
      const authentication = assertAuthenticationContext(expected.authenticationContext);
      if (facts.kind !== "tenant" || facts.authenticationContext !== authentication) {
        throw abuseError("request_admission_mismatch", "request admission does not match the command context");
      }
    }
    if (expected.operationId !== undefined && admission.operationId !== expected.operationId) {
      throw abuseError("request_admission_mismatch", "request admission does not match the command operation");
    }
    if (expected.disposition !== undefined && admission.disposition !== expected.disposition) {
      throw abuseError("request_admission_mismatch", "request admission disposition is invalid");
    }
    return admission;
  }

  async complete({ admission, outcome }) {
    if (!ADMISSION_OUTCOMES.has(outcome)) {
      throw abuseError("invalid_abuse_control_input", "admission outcome is invalid");
    }
    this.#claimAdmission(admission);
    return this.#finishClaimedAdmission(admission, outcome);
  }

  async lockAdmissionForTransaction({ admission, client, authenticationContext, operationId }) {
    this.assertAdmission(admission, { authenticationContext, operationId });
    if (typeof this.store.lockAdmissionInTransaction !== "function") {
      throw abuseError(
        "transactional_admission_unavailable",
        "the quota store does not support transactional admissions"
      );
    }
    this.#claimAdmission(admission);
    try {
      const lock = await this.store.lockAdmissionInTransaction({
        client,
        admissionId: admission.admissionId,
        tenantId: admission.tenantId,
        operationId: admission.operationId,
        replayed: admission.disposition === AdmissionDisposition.REPLAY
      });
      admissionTransactionClaims.set(admission, {
        client,
        lock,
        state: "locked",
        outcome: undefined
      });
      return lock;
    } catch (error) {
      admissionLifecycle.set(
        admission,
        error instanceof DomainError && ["request_admission_expired", "request_admission_consumed"].includes(error.code)
          ? "consumed"
          : "indeterminate"
      );
      if (error instanceof DomainError) throw error;
      throw admissionUnavailable();
    }
  }

  async completeAdmissionInTransaction({
    admission,
    client,
    outcome,
    retainPersistentResources = outcome === AdmissionOutcome.SUCCEEDED
  }) {
    if (!ADMISSION_OUTCOMES.has(outcome)) {
      throw abuseError("invalid_abuse_control_input", "admission outcome is invalid");
    }
    const claim = admissionTransactionClaims.get(admission);
    if (
      admissionLifecycle.get(admission) !== "claimed" ||
      !claim ||
      claim.client !== client ||
      claim.state !== "locked" ||
      typeof this.store.finishAdmissionInTransaction !== "function"
    ) {
      throw abuseError("request_admission_mismatch", "transactional admission claim is invalid");
    }
    const result = await this.store.finishAdmissionInTransaction({
      client,
      lock: claim.lock,
      outcome,
      retainPersistentResources
    });
    claim.state = "finished";
    claim.outcome = outcome;
    return result;
  }

  async synchronizePersistentResourcesInTransaction({ admission, client, resourceBaselines }) {
    const claim = admissionTransactionClaims.get(admission);
    if (
      admissionLifecycle.get(admission) !== "claimed" ||
      !claim ||
      claim.client !== client ||
      claim.state !== "locked" ||
      typeof this.store.synchronizePersistentResourcesInTransaction !== "function"
    ) {
      throw abuseError("request_admission_mismatch", "transactional admission claim is invalid");
    }
    return this.store.synchronizePersistentResourcesInTransaction({
      client,
      lock: claim.lock,
      resourceBaselines: normalizeResourceBaselines(resourceBaselines)
    });
  }

  confirmAdmissionTransactionCommit({ admission }) {
    const claim = admissionTransactionClaims.get(admission);
    if (
      admissionLifecycle.get(admission) !== "claimed" ||
      !claim ||
      claim.state !== "finished" ||
      !ADMISSION_OUTCOMES.has(claim.outcome)
    ) {
      throw abuseError("request_admission_mismatch", "transactional admission completion is invalid");
    }
    admissionLifecycle.set(admission, "consumed");
    admissionTransactionClaims.delete(admission);
    this.telemetry.record({
      surface: admission.surface,
      quotaClass: admission.quotaClass,
      outcome: claim.outcome === AdmissionOutcome.SUCCEEDED ? "completed" : "failed",
      reason: claim.outcome === AdmissionOutcome.SUCCEEDED ? "none" : "execution"
    });
  }

  async failAdmissionAfterTransactionRollback({ admission }) {
    const claim = admissionTransactionClaims.get(admission);
    if (admissionLifecycle.get(admission) !== "claimed" || !claim) {
      throw abuseError("request_admission_mismatch", "transactional admission rollback is invalid");
    }
    admissionTransactionClaims.delete(admission);
    admissionLifecycle.set(admission, "active");
    return this.complete({ admission, outcome: AdmissionOutcome.FAILED });
  }

  async #finishClaimedAdmission(admission, outcome) {
    try {
      const result = await this.store.finish({
        admissionId: admission.admissionId,
        tenantId: admission.tenantId,
        outcome
      });
      this.telemetry.record({
        surface: admission.surface,
        quotaClass: admission.quotaClass,
        outcome: outcome === AdmissionOutcome.SUCCEEDED ? "completed" : "failed",
        reason: outcome === AdmissionOutcome.SUCCEEDED ? "none" : "execution"
      });
      admissionLifecycle.set(admission, "consumed");
      return result;
    } catch {
      admissionLifecycle.set(admission, "indeterminate");
      this.telemetry.record({
        surface: admission.surface,
        quotaClass: admission.quotaClass,
        outcome: "failed",
        reason: "unavailable"
      });
      throw admissionUnavailable();
    }
  }

  async executeAdmitted({ admission, execute, loadReplay }) {
    this.#claimAdmission(admission);
    const callback = admission.disposition === AdmissionDisposition.REPLAY ? loadReplay : execute;
    if (typeof callback !== "function") {
      admissionLifecycle.set(admission, "active");
      throw abuseError(
        admission.disposition === AdmissionDisposition.REPLAY
          ? "idempotency_replay_handler_required"
          : "admitted_command_handler_required",
        "the admitted command handler is unavailable"
      );
    }
    try {
      const value = await callback(admission);
      await this.#finishClaimedAdmission(admission, AdmissionOutcome.SUCCEEDED);
      return { value, replayed: admission.disposition === AdmissionDisposition.REPLAY };
    } catch (error) {
      try {
        if (admissionLifecycle.get(admission) === "claimed") {
          await this.#finishClaimedAdmission(admission, AdmissionOutcome.FAILED);
        }
      } catch {
        if (error instanceof DomainError) throw error;
        throw admissionUnavailable();
      }
      throw error;
    }
  }

  async releaseTenantResources({ authenticationContext, resourceCounts }) {
    const authentication = assertAuthenticationContext(authenticationContext);
    const resources = normalizeBoundedCounters("resourceCounts", resourceCounts, RESOURCE_NAMES);
    const reservations = Object.entries(resources)
      .filter(([, units]) => units > 0)
      .map(([kind, units]) => ({
        keyHash: abuseHash("resource_capacity", { tenantId: authentication.tenantId, kind }),
        kind,
        units
      }));
    if (reservations.length === 0) {
      throw abuseError("invalid_abuse_control_input", "at least one resource count is required");
    }
    try {
      await this.store.release({ tenantId: authentication.tenantId, reservations });
    } catch (error) {
      if (error instanceof DomainError && error.code === "resource_counter_underflow") throw error;
      throw admissionUnavailable();
    }
  }

  async #admit({
    surface,
    tenantId,
    actorRefHash,
    clientRefHash,
    networkRefHash,
    accountRefHash,
    operationId,
    profile,
    idempotencyKey,
    requestMetrics,
    resourceDeltas,
    resourceBaselineLoader,
    retryAttempt = 0,
    facts
  }) {
    const metrics = normalizeBoundedCounters("requestMetrics", requestMetrics, METRIC_NAMES);
    const resources = normalizeBoundedCounters("resourceDeltas", resourceDeltas, RESOURCE_NAMES);
    assertNonNegativeInteger("retryAttempt", retryAttempt);
    for (const [name, value] of Object.entries(metrics)) {
      if (value > profile.metrics[name]) {
        this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "denied", reason: "size" });
        throw budgetExceeded(RetryAfterClass.MANUAL);
      }
    }
    for (const [name, value] of Object.entries(resources)) {
      if (value > profile.resources[name]) {
        this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "denied", reason: "capacity" });
        throw budgetExceeded(RetryAfterClass.MANUAL);
      }
    }
    if (retryAttempt > profile.maxAutomaticRetries) {
      this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "denied", reason: "retry" });
      throw abuseError(
        "automatic_retry_prohibited",
        "Automatic retry is not permitted for this operation.",
        { retryAfterClass: RetryAfterClass.MANUAL }
      );
    }
    if (profile.idempotencyRequired && idempotencyKey === undefined) {
      this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "denied", reason: "idempotency" });
      throw abuseError("idempotency_key_required", "An idempotency key is required for this operation.");
    }

    const commandRefHash = idempotencyKey === undefined
      ? undefined
      : idempotencyHash({
          tenantId,
          operationId,
          idempotencyKey,
          actorRefHash,
          clientRefHash
        });
    const rateReservations = [];
    const rateDimensions = {
      actor: actorRefHash,
      client: clientRefHash,
      tenant: abuseHash("tenant_reference", { tenantId }),
      operation: abuseHash("operation_reference", { tenantId, operationId }),
      service: abuseHash("service_reference", { policyVersion: ABUSE_POLICY_VERSION, quotaClass: profile.quotaClass }),
      network: networkRefHash,
      account: accountRefHash
    };
    for (const [dimension, referenceHash] of Object.entries(rateDimensions)) {
      const limit = profile.rate[dimension];
      if (limit > 0 && referenceHash) {
        rateReservations.push(rateReservation({
          keyHash: abuseHash("rate_bucket", {
            policyVersion: ABUSE_POLICY_VERSION,
            quotaClass: profile.quotaClass,
            dimension,
            referenceHash
          }),
          dimension,
          windowMs: profile.windowMs,
          limit
        }));
      }
    }
    if (metrics[RequestMetric.UPSTREAM_COST_UNITS] > 0) {
      rateReservations.push(rateReservation({
        keyHash: abuseHash("upstream_cost_bucket", { tenantId, quotaClass: profile.quotaClass }),
        dimension: "upstream_cost",
        windowMs: 60_000,
        limit: profile.upstreamCostUnitsPerMinute,
        units: metrics[RequestMetric.UPSTREAM_COST_UNITS],
        commandScoped: true
      }));
    }

    const capacityReservations = [];
    const concurrency = {
      actor: actorRefHash,
      tenant: abuseHash("tenant_reference", { tenantId }),
      service: abuseHash("service_reference", { policyVersion: ABUSE_POLICY_VERSION, quotaClass: profile.quotaClass })
    };
    for (const [dimension, referenceHash] of Object.entries(concurrency)) {
      const limit = profile.concurrency[dimension];
      if (limit > 0 && referenceHash) {
        capacityReservations.push(capacityReservation({
          keyHash: abuseHash("concurrency_bucket", {
            policyVersion: ABUSE_POLICY_VERSION,
            quotaClass: profile.quotaClass,
            dimension,
            referenceHash
          }),
          kind: `concurrency_${dimension}`,
          limit,
          units: 1,
          release: "always"
        }));
      }
    }
    if (metrics[RequestMetric.QUEUE_UNITS] > 0) {
      capacityReservations.push(capacityReservation({
        keyHash: abuseHash("queue_capacity", { tenantId, quotaClass: profile.quotaClass }),
        kind: "queue",
        limit: profile.metrics[RequestMetric.QUEUE_UNITS],
        units: metrics[RequestMetric.QUEUE_UNITS],
        release: "always"
      }));
    }
    for (const [kind, units] of Object.entries(resources)) {
      if (units > 0) {
        capacityReservations.push(capacityReservation({
          keyHash: abuseHash("resource_capacity", { tenantId, kind }),
          kind,
          limit: profile.resources[kind],
          units,
          release: "on_failure",
          commandScoped: true
        }));
      }
    }

    const request = {
      admissionId: createOperationalId("abuse_admission"),
      tenantId: assertAbuseIdentifier("tenantId", tenantId),
      operationId: assertAbuseIdentifier("operationId", operationId),
      quotaClass: profile.quotaClass,
      policyVersion: ABUSE_POLICY_VERSION,
      commandRefHash,
      actorRefHash,
      clientRefHash,
      rateReservations,
      capacityReservations,
      leaseMs: profile.admissionLeaseMs
    };
    if (
      resourceBaselineLoader !== undefined &&
      typeof this.store.reserveWithResourceBaselines !== "function"
    ) {
      throw abuseError(
        "invalid_abuse_control_config",
        "quota store does not support resource baseline loading"
      );
    }
    let result;
    try {
      result = resourceBaselineLoader === undefined
        ? await this.store.reserve(request)
        : await this.store.reserveWithResourceBaselines(request, resourceBaselineLoader);
    } catch {
      this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "denied", reason: "unavailable" });
      throw admissionUnavailable();
    }
    if (!result?.admitted) {
      const reason = result?.reason === "idempotency" ? "idempotency" :
        result?.reason === "capacity" ? "capacity" : "rate";
      this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "denied", reason });
      if (reason === "idempotency") {
        throw abuseError(
          "idempotency_in_progress",
          "The idempotent request is already in progress.",
          { retryAfterClass: RetryAfterClass.SHORT }
        );
      }
      throw budgetExceeded();
    }

    const admission = deepFreezeAbuse({
      admissionId: request.admissionId,
      tenantId,
      operationId,
      quotaClass: profile.quotaClass,
      surface,
      disposition: result.replayed ? AdmissionDisposition.REPLAY : AdmissionDisposition.EXECUTE,
      policyVersion: ABUSE_POLICY_VERSION,
      issuedAt: result.issuedAt,
      expiresAt: result.expiresAt,
      schemaVersion: ABUSE_ADMISSION_SCHEMA_VERSION
    });
    trustedAdmissions.add(admission);
    admissionFacts.set(admission, facts);
    admissionLifecycle.set(admission, "active");
    this.telemetry.record({ surface, quotaClass: profile.quotaClass, outcome: "admitted" });
    return admission;
  }

  #now() {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw abuseError("invalid_abuse_control_clock", "abuse-control clock is invalid");
    }
    return value;
  }

  #claimAdmission(admission) {
    this.assertAdmission(admission);
    admissionLifecycle.set(admission, "claimed");
  }
}
