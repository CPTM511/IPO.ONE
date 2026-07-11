import {
  CreditEventType,
  DomainError,
  MandateCapability,
  MandateStatus,
  MandateTransitions,
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  assertTransition,
  createAuditEvent,
  createCreditEvent,
  createMandate,
  enumValues,
  hashId
} from "../../../packages/domain/src/index.js";

function clone(value) {
  return structuredClone(value);
}

function parseTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_timestamp", `${name} must be an ISO timestamp`, { name, value });
  }
  return parsed;
}

function uniqueStrings(name, values, { allowEmpty = false } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new DomainError("invalid_string_list", `${name} must be ${allowEmpty ? "an" : "a non-empty"} array`, {
      name
    });
  }
  const normalized = values.map((value) => {
    assertNonEmptyString(name, value);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError("duplicate_scope_value", `${name} cannot contain duplicates`, { name });
  }
  return normalized;
}

export class MandateService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.mandates = new Map();
    this.mandateIdsByPrincipalNonce = new Map();
    this.reservations = new Map();
    this.releases = new Map();
  }

  createMandate(input) {
    assertNonEmptyString("principalId", input.principalId);
    assertNonEmptyString("subjectId", input.subjectId);
    assertNonEmptyString("nonce", input.nonce);
    assertNonEmptyString("termsRef", input.termsRef);
    assertNoRawPiiReference({ termsRef: input.termsRef });

    const now = input.now ?? new Date();
    const validFrom = input.validFrom ?? now.toISOString();
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + 365 * 86400_000).toISOString();
    const validFromDate = parseTimestamp("validFrom", validFrom);
    const expiresAtDate = parseTimestamp("expiresAt", expiresAt);
    if (expiresAtDate <= validFromDate) {
      throw new DomainError("invalid_mandate_window", "expiresAt must be after validFrom");
    }

    const capabilities = uniqueStrings("capabilities", input.capabilities);
    for (const capability of capabilities) {
      assertEnumValue("capability", capability, enumValues(MandateCapability));
    }
    const allowedProviderIds = uniqueStrings("allowedProviderIds", input.allowedProviderIds ?? [], { allowEmpty: true });
    const allowedCategories = uniqueStrings("allowedCategories", input.allowedCategories ?? [], { allowEmpty: true });
    const assetIds = uniqueStrings("assetIds", input.assetIds);
    const perActionLimit = assertPositiveMinorUnits(input.perActionLimitMinor, "perActionLimitMinor");
    const aggregateLimit = assertPositiveMinorUnits(input.aggregateLimitMinor, "aggregateLimitMinor");
    if (perActionLimit > aggregateLimit) {
      throw new DomainError("invalid_mandate_limits", "per-action limit cannot exceed aggregate limit");
    }

    const mandate = createMandate({
      ...input,
      capabilities,
      allowedProviderIds,
      allowedCategories,
      assetIds,
      perActionLimitMinor: perActionLimit.toString(),
      aggregateLimitMinor: aggregateLimit.toString(),
      validFrom: validFromDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      now
    });
    const nonceKey = `${mandate.principalId}\0${mandate.nonce}`;
    const existingId = this.mandateIdsByPrincipalNonce.get(nonceKey);
    if (existingId) {
      const existing = this.#requireMandate(existingId);
      if (existing.mandateHash !== mandate.mandateHash) {
        throw new DomainError("mandate_nonce_conflict", "principal mandate nonce was reused with different terms", {
          principalId: mandate.principalId,
          nonce: mandate.nonce
        });
      }
      return clone(existing);
    }

    this.mandates.set(mandate.mandateId, mandate);
    this.mandateIdsByPrincipalNonce.set(nonceKey, mandate.mandateId);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.MANDATE_CREATED,
        subjectId: mandate.subjectId,
        payload: {
          mandateId: mandate.mandateId,
          mandateHash: mandate.mandateHash,
          principalId: mandate.principalId,
          capabilities: mandate.capabilities,
          assetIds: mandate.assetIds,
          expiresAt: mandate.expiresAt
        },
        now
      })
    );
    return clone(mandate);
  }

  activateMandate(mandateId, { actorId = "system", now = new Date() } = {}) {
    const mandate = this.#requireMandate(mandateId);
    if (mandate.status === MandateStatus.ACTIVE) return clone(mandate);
    if (now < new Date(mandate.validFrom)) {
      throw new DomainError("mandate_not_yet_valid", "mandate cannot activate before validFrom", { mandateId });
    }
    if (now >= new Date(mandate.expiresAt)) {
      return this.#setStatus({ mandate, nextStatus: MandateStatus.EXPIRED, actorId, reason: "validity_window_elapsed", now });
    }
    return this.#setStatus({ mandate, nextStatus: MandateStatus.ACTIVE, actorId, reason: "mandate_activated", now });
  }

  suspendMandate({ mandateId, actorId, reason, now = new Date() }) {
    assertNonEmptyString("reason", reason);
    return this.#setStatus({
      mandate: this.#requireMandate(mandateId),
      nextStatus: MandateStatus.SUSPENDED,
      actorId,
      reason,
      now
    });
  }

  revokeMandate({ mandateId, actorId, reason, now = new Date() }) {
    assertNonEmptyString("reason", reason);
    return this.#setStatus({
      mandate: this.#requireMandate(mandateId),
      nextStatus: MandateStatus.REVOKED,
      actorId,
      reason,
      now
    });
  }

  assertAuthorized({
    mandateId,
    subjectId,
    capability,
    providerId,
    category,
    assetId,
    amountMinor,
    enforceAggregateLimit = true,
    now = new Date()
  }) {
    assertNonEmptyString("mandateId", mandateId);
    assertNonEmptyString("subjectId", subjectId);
    assertEnumValue("capability", capability, enumValues(MandateCapability));
    assertNonEmptyString("assetId", assetId);
    const mandate = this.#requireMandate(mandateId);

    if (now >= new Date(mandate.expiresAt) && ![MandateStatus.EXPIRED, MandateStatus.REVOKED].includes(mandate.status)) {
      this.#setStatus({
        mandate,
        nextStatus: MandateStatus.EXPIRED,
        actorId: "system",
        reason: "validity_window_elapsed",
        now
      });
    }
    if (mandate.status !== MandateStatus.ACTIVE) {
      throw new DomainError("mandate_not_active", "an active mandate is required", {
        mandateId,
        status: mandate.status
      });
    }
    if (now < new Date(mandate.validFrom)) {
      throw new DomainError("mandate_not_yet_valid", "mandate is not yet valid", { mandateId });
    }
    if (mandate.subjectId !== subjectId) {
      throw new DomainError("mandate_subject_mismatch", "mandate does not authorize this subject", { mandateId, subjectId });
    }
    if (!mandate.capabilities.includes(capability)) {
      throw new DomainError("mandate_capability_denied", "mandate does not include the requested capability", {
        mandateId,
        capability
      });
    }
    if (!mandate.assetIds.includes(assetId)) {
      throw new DomainError("mandate_asset_denied", "mandate does not include the requested asset", { mandateId, assetId });
    }

    if (capability === MandateCapability.PROVIDER_SPEND) {
      assertNonEmptyString("providerId", providerId);
      assertNonEmptyString("category", category);
      if (!mandate.allowedProviderIds.includes(providerId)) {
        throw new DomainError("mandate_provider_denied", "provider is outside the mandate scope", { mandateId, providerId });
      }
      if (!mandate.allowedCategories.includes(category)) {
        throw new DomainError("mandate_category_denied", "category is outside the mandate scope", { mandateId, category });
      }
    }

    if (amountMinor !== undefined) {
      const amount = assertPositiveMinorUnits(amountMinor);
      if (amount > BigInt(mandate.perActionLimitMinor)) {
        throw new DomainError("mandate_per_action_limit_exceeded", "action exceeds the mandate per-action limit", {
          mandateId,
          amountMinor: amount.toString()
        });
      }
      if (enforceAggregateLimit && amount + BigInt(mandate.utilizedMinor) > BigInt(mandate.aggregateLimitMinor)) {
        throw new DomainError("mandate_aggregate_limit_exceeded", "action exceeds the mandate aggregate limit", {
          mandateId,
          amountMinor: amount.toString(),
          utilizedMinor: mandate.utilizedMinor
        });
      }
    }

    return clone(mandate);
  }

  reserveUtilization({ mandateId, reservationId, subjectId, capability, providerId, category, assetId, amountMinor, now = new Date() }) {
    assertNonEmptyString("reservationId", reservationId);
    const reservationHash = hashId("mandate_reservation", {
      mandateId,
      reservationId,
      subjectId,
      capability,
      providerId: providerId ?? null,
      category: category ?? null,
      assetId,
      amountMinor
    });
    const existing = this.reservations.get(reservationId);
    if (existing) {
      if (existing.reservationHash !== reservationHash) {
        throw new DomainError("mandate_reservation_conflict", "reservation id was reused with a different authorization", {
          reservationId
        });
      }
      return { mandate: this.getMandate(existing.mandateId), reservation: clone(existing), replayed: true };
    }

    const mandate = this.assertAuthorized({
      mandateId,
      subjectId,
      capability,
      providerId,
      category,
      assetId,
      amountMinor,
      now
    });
    const amount = BigInt(amountMinor);
    const storedMandate = this.#requireMandate(mandate.mandateId);
    storedMandate.utilizedMinor = (BigInt(storedMandate.utilizedMinor) + amount).toString();
    storedMandate.updatedAt = now.toISOString();
    const reservation = {
      reservationId,
      reservationHash,
      mandateId,
      subjectId,
      capability,
      providerId,
      category,
      assetId,
      amountMinor: amount.toString(),
      releasedMinor: "0",
      createdAt: now.toISOString(),
      schemaVersion: "mandate_reservation.v1"
    };
    this.reservations.set(reservationId, reservation);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.MANDATE_UTILIZATION_RESERVED,
        subjectId,
        payload: {
          mandateId,
          reservationId,
          capability,
          amountMinor: amount.toString(),
          utilizedMinor: storedMandate.utilizedMinor
        },
        now
      })
    );
    return { mandate: clone(storedMandate), reservation: clone(reservation), replayed: false };
  }

  releaseUtilization({ mandateId, reservationId, releaseId, amountMinor, reason, now = new Date() }) {
    assertNonEmptyString("releaseId", releaseId);
    assertNonEmptyString("reason", reason);
    const amount = assertPositiveMinorUnits(amountMinor);
    const releaseHash = hashId("mandate_release", { mandateId, reservationId, releaseId, amountMinor, reason });
    const existingRelease = this.releases.get(releaseId);
    if (existingRelease) {
      if (existingRelease.releaseHash !== releaseHash) {
        throw new DomainError("mandate_release_conflict", "release id was reused with different terms", { releaseId });
      }
      return { mandate: this.getMandate(mandateId), release: clone(existingRelease), replayed: true };
    }

    const mandate = this.#requireMandate(mandateId);
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.mandateId !== mandateId) {
      throw new DomainError("mandate_reservation_not_found", "mandate reservation not found", { reservationId });
    }
    const reservationRemaining = BigInt(reservation.amountMinor) - BigInt(reservation.releasedMinor);
    if (amount > reservationRemaining || amount > BigInt(mandate.utilizedMinor)) {
      throw new DomainError("mandate_release_exceeds_reservation", "release exceeds reserved utilization", {
        reservationId,
        amountMinor: amount.toString()
      });
    }

    reservation.releasedMinor = (BigInt(reservation.releasedMinor) + amount).toString();
    mandate.utilizedMinor = (BigInt(mandate.utilizedMinor) - amount).toString();
    mandate.updatedAt = now.toISOString();
    const release = {
      releaseId,
      releaseHash,
      mandateId,
      reservationId,
      amountMinor: amount.toString(),
      reason,
      createdAt: now.toISOString(),
      schemaVersion: "mandate_release.v1"
    };
    this.releases.set(releaseId, release);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.MANDATE_UTILIZATION_RELEASED,
        subjectId: mandate.subjectId,
        payload: {
          mandateId,
          reservationId,
          releaseId,
          amountMinor: amount.toString(),
          utilizedMinor: mandate.utilizedMinor,
          reason
        },
        now
      })
    );
    return { mandate: clone(mandate), release: clone(release), replayed: false };
  }

  getMandate(mandateId) {
    return clone(this.#requireMandate(mandateId));
  }

  listMandates(filter = {}) {
    return [...this.mandates.values()]
      .filter((mandate) => Object.entries(filter).every(([key, value]) => value === undefined || mandate[key] === value))
      .map(clone);
  }

  getReservation(reservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new DomainError("mandate_reservation_not_found", "mandate reservation not found", { reservationId });
    return clone(reservation);
  }

  #setStatus({ mandate, nextStatus, actorId = "system", reason, now }) {
    if (mandate.status === nextStatus) return clone(mandate);
    assertNonEmptyString("actorId", actorId);
    assertNonEmptyString("reason", reason);
    assertTransition("mandate", MandateTransitions, mandate.status, nextStatus);
    const previousStatus = mandate.status;
    mandate.status = nextStatus;
    mandate.updatedAt = now.toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.MANDATE_STATUS_CHANGED,
        subjectId: mandate.subjectId,
        payload: { mandateId: mandate.mandateId, previousStatus, newStatus: nextStatus, reason },
        now
      })
    );
    this.eventStore.appendAuditEvent(
      createAuditEvent({
        actorId,
        actionType: `mandate_${nextStatus}`,
        targetType: "mandate",
        targetId: mandate.mandateId,
        reason,
        payload: { subjectId: mandate.subjectId, previousStatus, newStatus: nextStatus },
        now
      })
    );
    return clone(mandate);
  }

  #requireMandate(mandateId) {
    const mandate = this.mandates.get(mandateId);
    if (!mandate) throw new DomainError("mandate_not_found", "mandate not found", { mandateId });
    return mandate;
  }
}
