export const ABUSE_POLICY_VERSION = "abuse_001.v1";
export const ABUSE_ADMISSION_SCHEMA_VERSION = "abuse_admission.v1";

export const QuotaClass = Object.freeze({
  DISCOVERY: "discovery",
  READ: "read",
  MUTATION: "mutation",
  ECONOMIC: "economic",
  CREDENTIAL: "credential",
  PRIVILEGED: "privileged",
  BATCH: "batch",
  WORKER: "worker"
});

export const AdmissionDisposition = Object.freeze({
  EXECUTE: "execute",
  REPLAY: "replay"
});

export const AdmissionOutcome = Object.freeze({
  SUCCEEDED: "succeeded",
  FAILED: "failed"
});

export const RetryAfterClass = Object.freeze({
  MANUAL: "manual",
  SHORT: "short",
  LONG: "long"
});

export const ResourceKind = Object.freeze({
  AGENT_SUBJECTS: "agent_subjects",
  MANDATES: "mandates",
  OPEN_OBLIGATIONS: "open_obligations",
  PROVIDERS: "providers",
  CREDENTIALS: "credentials",
  ACCESS_GRANTS: "access_grants"
});

export const RequestMetric = Object.freeze({
  BODY_BYTES: "bodyBytes",
  COMMAND_BYTES: "commandBytes",
  EVENT_BYTES: "eventBytes",
  PROJECTION_BYTES: "projectionBytes",
  PROJECTION_WRITE_SET_BYTES: "projectionWriteSetBytes",
  RESPONSE_BYTES: "responseBytes",
  EXPORT_ROWS: "exportRows",
  QUEUE_UNITS: "queueUnits",
  EXECUTION_MS: "executionMs",
  UPSTREAM_COST_UNITS: "upstreamCostUnits"
});

export const AbuseProfileId = Object.freeze({
  DISCOVERY: "public.discovery",
  CREDENTIAL: "authentication.credential"
});
