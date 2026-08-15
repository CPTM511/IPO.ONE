import { DomainError } from "../../../packages/domain/src/index.js";

const trustedSourceBoundaries = new WeakSet();

export function createPrivatePilotOperationalSourceBoundary() {
  const boundary = Object.freeze({
    environment: "closed-pilot",
    mode: "no-real-funds",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "operational_source_boundary.v1"
  });
  trustedSourceBoundaries.add(boundary);
  return boundary;
}

export function assertPrivatePilotOperationalSourceBoundary(value) {
  if (!value || typeof value !== "object" || !trustedSourceBoundaries.has(value)) {
    throw new DomainError(
      "invalid_operational_signal",
      "a server-created private-pilot no-funds source boundary is required"
    );
  }
  return value;
}
