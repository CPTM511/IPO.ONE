import { abuseError, assertAbuseHash, assertAbuseIdentifier, cloneAbuse } from "./abuse-utils.js";
import { assertQuotaStoreRelease, assertQuotaStoreRequest } from "./quota-store-contract.js";

const COMMAND_RETENTION_MS = 24 * 60 * 60_000;

function iso(value) {
  return value.toISOString();
}

export class InMemoryAtomicQuotaStore {
  #rates = new Map();
  #capacities = new Map();
  #admissions = new Map();
  #charges = new Map();
  #lastNow = 0;

  constructor({ clock = () => new Date(), maxEntries = 20_000, faultInjector } = {}) {
    if (typeof clock !== "function" || !Number.isSafeInteger(maxEntries) || maxEntries < 100) {
      throw abuseError("invalid_abuse_store_config", "in-memory quota store configuration is invalid");
    }
    this.clock = clock;
    this.maxEntries = maxEntries;
    this.faultInjector = faultInjector;
  }

  async reserve(request) {
    this.#fault("reserve");
    const now = this.#now();
    this.#cleanup(now);
    assertQuotaStoreRequest(request);

    const commandCharge = request.commandRefHash
      ? this.#charges.get(this.#chargeKey(request.tenantId, request.commandRefHash))
      : undefined;
    if (commandCharge?.status === "pending" && commandCharge.expiresAt > now) {
      return { admitted: false, reason: "idempotency" };
    }
    const replayed = commandCharge?.status === "succeeded" && commandCharge.expiresAt > now;
    const rates = request.rateReservations.filter((item) => !item.commandScoped || !replayed);
    const capacities = request.capacityReservations.filter((item) => !item.commandScoped || !replayed);

    const nextRates = [];
    for (const reservation of rates) {
      const key = this.#rateKey(request.tenantId, reservation.keyHash, reservation.partition);
      const current = this.#rates.get(key);
      const windowStartedAt = Math.floor(now / reservation.windowMs) * reservation.windowMs;
      const used = current?.windowStartedAt === windowStartedAt ? current.used : 0;
      if (used + reservation.units > reservation.limit) {
        return { admitted: false, reason: "rate" };
      }
      nextRates.push({
        key,
        value: {
          windowStartedAt,
          expiresAt: windowStartedAt + reservation.windowMs,
          used: used + reservation.units,
          limit: current?.windowStartedAt === windowStartedAt
            ? Math.min(current.limit, reservation.limit)
            : reservation.limit,
          dimension: reservation.dimension
        }
      });
    }

    const nextCapacities = [];
    for (const reservation of capacities) {
      const key = this.#capacityKey(request.tenantId, reservation.keyHash, reservation.partition);
      const current = this.#capacities.get(key);
      const used = current?.used ?? 0;
      const limit = current ? Math.min(current.limit, reservation.limit) : reservation.limit;
      if (used + reservation.units > limit) {
        return { admitted: false, reason: "capacity" };
      }
      nextCapacities.push({
        key,
        value: { used: used + reservation.units, limit, kind: reservation.kind }
      });
    }

    const commandChargeKey = request.commandRefHash
      ? this.#chargeKey(request.tenantId, request.commandRefHash)
      : undefined;
    this.#ensureCapacity(
      nextRates.filter((item) => !this.#rates.has(item.key)).length +
      nextCapacities.filter((item) => !this.#capacities.has(item.key)).length +
      1 +
      (commandChargeKey && !this.#charges.has(commandChargeKey) ? 1 : 0)
    );
    for (const item of nextRates) this.#rates.set(item.key, item.value);
    for (const item of nextCapacities) this.#capacities.set(item.key, item.value);

    const issuedAt = now;
    const expiresAt = now + request.leaseMs;
    this.#admissions.set(request.admissionId, {
      ...cloneAbuse(request),
      state: "pending",
      issuedAt,
      expiresAt,
      replayed,
      appliedCapacities: cloneAbuse(capacities)
    });
    if (request.commandRefHash && !replayed) {
      this.#charges.set(commandChargeKey, {
        status: "pending",
        admissionId: request.admissionId,
        expiresAt: now + COMMAND_RETENTION_MS
      });
    }
    return {
      admitted: true,
      replayed,
      issuedAt: iso(new Date(issuedAt)),
      expiresAt: iso(new Date(expiresAt))
    };
  }

  async finish({ admissionId, tenantId, outcome }) {
    this.#fault("finish");
    const now = this.#now();
    this.#cleanup(now, admissionId);
    const admission = this.#admissions.get(assertAbuseIdentifier("admissionId", admissionId));
    if (!admission || admission.tenantId !== tenantId) {
      throw abuseError("admission_not_found", "request admission is not available");
    }
    if (admission.state !== "pending") return { state: admission.state };
    this.#finishAdmission(admission, outcome, now);
    return { state: admission.state };
  }

  async release({ tenantId, reservations }) {
    this.#fault("release");
    this.#now();
    assertQuotaStoreRelease({ tenantId, reservations });
    for (const reservation of reservations) {
      const key = this.#capacityKey(tenantId, assertAbuseHash("keyHash", reservation.keyHash));
      const current = this.#capacities.get(key);
      if (!current || current.kind !== reservation.kind || current.used < reservation.units) {
        throw abuseError("resource_counter_underflow", "resource counter release is invalid");
      }
    }
    for (const reservation of reservations) this.#decrementCapacity(tenantId, reservation);
  }

  snapshot() {
    const rates = {};
    const capacities = {};
    const admissions = {};
    const charges = {};
    for (const value of this.#rates.values()) rates[value.dimension] = (rates[value.dimension] ?? 0) + 1;
    for (const value of this.#capacities.values()) capacities[value.kind] = (capacities[value.kind] ?? 0) + value.used;
    for (const value of this.#admissions.values()) admissions[value.state] = (admissions[value.state] ?? 0) + 1;
    for (const value of this.#charges.values()) charges[value.status] = (charges[value.status] ?? 0) + 1;
    return cloneAbuse({ rates, capacities, admissions, charges });
  }

  #finishAdmission(admission, outcome, now) {
    const failed = outcome !== "succeeded";
    for (const reservation of admission.appliedCapacities) {
      if (reservation.release === "always" || (failed && reservation.release === "on_failure")) {
        this.#decrementCapacity(admission.tenantId, reservation);
      }
    }
    admission.state = outcome === "expired" ? "expired" : "completed";
    admission.outcome = outcome;
    admission.completedAt = now;
    if (admission.commandRefHash && !admission.replayed) {
      const key = this.#chargeKey(admission.tenantId, admission.commandRefHash);
      const charge = this.#charges.get(key);
      if (charge?.admissionId === admission.admissionId) {
        charge.status = failed ? "failed" : "succeeded";
        charge.expiresAt = now + COMMAND_RETENTION_MS;
      }
    }
  }

  #cleanup(now, excludedAdmissionId) {
    for (const admission of this.#admissions.values()) {
      if (
        admission.admissionId !== excludedAdmissionId &&
        admission.state === "pending" &&
        admission.expiresAt <= now
      ) {
        this.#finishAdmission(admission, "expired", now);
      }
    }
    for (const [key, value] of this.#rates) if (value.expiresAt <= now) this.#rates.delete(key);
    for (const [key, value] of this.#charges) {
      if (value.expiresAt <= now && value.status !== "pending") this.#charges.delete(key);
    }
  }

  #ensureCapacity(additionalEntries) {
    const size = () => this.#rates.size + this.#capacities.size + this.#admissions.size + this.#charges.size;
    if (size() + additionalEntries <= this.maxEntries) return;
    const evictable = [...this.#admissions.entries()]
      .filter(([, admission]) => admission.state !== "pending")
      .sort((left, right) =>
        (left[1].completedAt ?? left[1].expiresAt) - (right[1].completedAt ?? right[1].expiresAt)
      );
    for (const [admissionId] of evictable) {
      this.#admissions.delete(admissionId);
      if (size() + additionalEntries <= this.maxEntries) return;
    }
    throw abuseError("quota_store_capacity_exceeded", "quota store capacity is unavailable");
  }

  #decrementCapacity(tenantId, reservation) {
    const key = this.#capacityKey(tenantId, reservation.keyHash, reservation.partition);
    const current = this.#capacities.get(key);
    current.used -= reservation.units;
    if (current.used === 0) this.#capacities.delete(key);
  }

  #rateKey(tenantId, keyHash, partition = "tenant") {
    return `${partition === "service" ? "__service__" : tenantId}\0${assertAbuseHash("rate keyHash", keyHash)}`;
  }

  #capacityKey(tenantId, keyHash, partition = "tenant") {
    return `${partition === "service" ? "__service__" : tenantId}\0${assertAbuseHash("capacity keyHash", keyHash)}`;
  }

  #chargeKey(tenantId, commandRefHash) {
    return `${tenantId}\0${commandRefHash}`;
  }

  #now() {
    const value = this.clock();
    const timestamp = value instanceof Date ? value.getTime() : Number.NaN;
    if (!Number.isFinite(timestamp)) {
      throw abuseError("quota_store_clock_invalid", "quota store clock is invalid");
    }
    this.#lastNow = Math.max(this.#lastNow, timestamp);
    return this.#lastNow;
  }

  #fault(stage) {
    if (this.faultInjector) this.faultInjector(stage);
  }
}
