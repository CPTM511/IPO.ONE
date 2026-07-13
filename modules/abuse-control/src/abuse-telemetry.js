import { QuotaClass } from "./abuse-constants.js";
import { abuseError, deepFreezeAbuse } from "./abuse-utils.js";

const SURFACES = new Set(["tenant", "discovery", "credential"]);
const OUTCOMES = new Set(["admitted", "denied", "completed", "failed", "expired"]);
const REASONS = new Set([
  "none",
  "rate",
  "capacity",
  "size",
  "retry",
  "idempotency",
  "unavailable",
  "execution"
]);
const QUOTA_CLASSES = new Set(Object.values(QuotaClass));

export class AbuseControlTelemetry {
  #counters = new Map();

  record({ surface, quotaClass, outcome, reason = "none" }) {
    if (
      !SURFACES.has(surface) ||
      !QUOTA_CLASSES.has(quotaClass) ||
      !OUTCOMES.has(outcome) ||
      !REASONS.has(reason)
    ) {
      throw abuseError("invalid_abuse_telemetry", "telemetry dimensions are invalid");
    }
    const key = `${surface}\0${quotaClass}\0${outcome}\0${reason}`;
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + 1);
  }

  snapshot() {
    return deepFreezeAbuse([...this.#counters.entries()]
      .map(([key, count]) => {
        const [surface, quotaClass, outcome, reason] = key.split("\0");
        return { surface, quotaClass, outcome, reason, count };
      })
      .sort((left, right) =>
        `${left.surface}:${left.quotaClass}:${left.outcome}:${left.reason}`.localeCompare(
          `${right.surface}:${right.quotaClass}:${right.outcome}:${right.reason}`
        )
      ));
  }
}
