import {
  abuseError,
  assertAbuseHash,
  assertAbuseIdentifier,
  assertAbuseShape,
  assertPositiveInteger
} from "./abuse-utils.js";

const PARTITIONS = new Set(["tenant", "service"]);
const RELEASE_MODES = new Set(["always", "on_failure"]);

export function assertQuotaStoreRequest(request, { tenantId, requireActorClient = false } = {}) {
  assertAbuseShape("quota store request", request, {
    required: [
      "admissionId",
      "tenantId",
      "operationId",
      "quotaClass",
      "policyVersion",
      "rateReservations",
      "capacityReservations",
      "leaseMs"
    ],
    optional: ["commandRefHash", "actorRefHash", "clientRefHash"]
  });
  assertAbuseIdentifier("admissionId", request.admissionId);
  assertAbuseIdentifier("tenantId", request.tenantId);
  assertAbuseIdentifier("operationId", request.operationId);
  assertAbuseIdentifier("quotaClass", request.quotaClass);
  assertAbuseIdentifier("policyVersion", request.policyVersion);
  if (tenantId !== undefined && request.tenantId !== tenantId) {
    throw abuseError("tenant_quota_context_mismatch", "quota store tenant context does not match");
  }
  if (request.commandRefHash !== undefined) assertAbuseHash("commandRefHash", request.commandRefHash);
  if (request.actorRefHash !== undefined) assertAbuseHash("actorRefHash", request.actorRefHash);
  if (request.clientRefHash !== undefined) assertAbuseHash("clientRefHash", request.clientRefHash);
  if (requireActorClient && (!request.actorRefHash || !request.clientRefHash)) {
    throw abuseError("invalid_abuse_control_input", "tenant admission references are required");
  }
  assertPositiveInteger("leaseMs", request.leaseMs, { maximum: 60_000 });

  if (
    !Array.isArray(request.rateReservations) ||
    request.rateReservations.length < 1 ||
    request.rateReservations.length > 16 ||
    !Array.isArray(request.capacityReservations) ||
    request.capacityReservations.length < 1 ||
    request.capacityReservations.length > 16
  ) {
    throw abuseError("invalid_abuse_control_input", "quota reservations are invalid");
  }
  const rateKeys = new Set();
  for (const reservation of request.rateReservations) {
    assertAbuseShape("rate reservation", reservation, {
      required: [
        "keyHash",
        "dimension",
        "windowMs",
        "limit",
        "units",
        "commandScoped",
        "partition"
      ]
    });
    assertAbuseHash("rate keyHash", reservation.keyHash);
    assertAbuseIdentifier("rate dimension", reservation.dimension);
    assertPositiveInteger("rate windowMs", reservation.windowMs, { maximum: 600_000 });
    assertPositiveInteger("rate limit", reservation.limit, { maximum: 25_000 });
    assertPositiveInteger("rate units", reservation.units, { maximum: reservation.limit });
    if (typeof reservation.commandScoped !== "boolean" || !PARTITIONS.has(reservation.partition)) {
      throw abuseError("invalid_abuse_control_input", "rate reservation flags are invalid");
    }
    if (rateKeys.has(reservation.keyHash)) {
      throw abuseError("invalid_abuse_control_input", "rate reservation is duplicated");
    }
    rateKeys.add(reservation.keyHash);
  }

  const capacityKeys = new Set();
  for (const reservation of request.capacityReservations) {
    assertCapacityReservation(reservation);
    if (capacityKeys.has(reservation.keyHash)) {
      throw abuseError("invalid_abuse_control_input", "capacity reservation is duplicated");
    }
    capacityKeys.add(reservation.keyHash);
  }
  return request;
}

export function assertCapacityReservation(reservation, { release = false } = {}) {
  assertAbuseShape("capacity reservation", reservation, release
    ? { required: ["keyHash", "kind", "units"] }
    : {
        required: [
          "keyHash",
          "kind",
          "limit",
          "units",
          "release",
          "commandScoped",
          "partition"
        ]
      });
  assertAbuseHash("capacity keyHash", reservation.keyHash);
  assertAbuseIdentifier("capacity kind", reservation.kind);
  assertPositiveInteger("capacity units", reservation.units, { maximum: 10_000 });
  if (!release) {
    assertPositiveInteger("capacity limit", reservation.limit, { maximum: 10_000 });
    if (
      reservation.units > reservation.limit ||
      !RELEASE_MODES.has(reservation.release) ||
      typeof reservation.commandScoped !== "boolean" ||
      !PARTITIONS.has(reservation.partition)
    ) {
      throw abuseError("invalid_abuse_control_input", "capacity reservation is invalid");
    }
  }
  return reservation;
}

export function assertQuotaStoreRelease(input, { tenantId } = {}) {
  assertAbuseShape("quota store release", input, {
    required: ["tenantId", "reservations"]
  });
  assertAbuseIdentifier("tenantId", input.tenantId);
  if (tenantId !== undefined && input.tenantId !== tenantId) {
    throw abuseError("tenant_quota_context_mismatch", "quota store tenant context does not match");
  }
  if (!Array.isArray(input.reservations) || input.reservations.length < 1 || input.reservations.length > 4) {
    throw abuseError("invalid_abuse_control_input", "resource release is invalid");
  }
  const keys = new Set();
  for (const reservation of input.reservations) {
    assertCapacityReservation(reservation, { release: true });
    if (keys.has(reservation.keyHash)) {
      throw abuseError("invalid_abuse_control_input", "resource release is duplicated");
    }
    keys.add(reservation.keyHash);
  }
  return input;
}
