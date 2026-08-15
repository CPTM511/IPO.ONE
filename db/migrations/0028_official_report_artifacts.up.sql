CREATE TABLE official_report_artifacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  report_kind TEXT NOT NULL CHECK (report_kind = 'obligation_activity'),
  format TEXT NOT NULL CHECK (format IN ('json', 'csv')),
  content_type TEXT NOT NULL CHECK (
    content_type IN ('application/json', 'text/csv; charset=utf-8')
  ),
  file_name TEXT NOT NULL CHECK (file_name !~ '[\r\n/\\]'),
  content_base64 TEXT NOT NULL CHECK (
    octet_length(content_base64) BETWEEN 4 AND 174764
    AND content_base64 ~ '^[A-Za-z0-9+/]+={0,2}$'
  ),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^0x[0-9a-f]{64}$'),
  source_obligation_id TEXT NOT NULL,
  source_evidence_count INTEGER NOT NULL CHECK (source_evidence_count BETWEEN 1 AND 50),
  source_evidence_head_hash TEXT NOT NULL CHECK (source_evidence_head_hash ~ '^0x[0-9a-f]{64}$'),
  source_evidence_tail_hash TEXT NOT NULL CHECK (source_evidence_tail_hash ~ '^0x[0-9a-f]{64}$'),
  controller_actor_ref_hash TEXT NOT NULL CHECK (controller_actor_ref_hash ~ '^0x[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  version BIGINT NOT NULL CHECK (version >= 1),
  revoked_at TIMESTAMPTZ,
  revocation_reason_code TEXT CHECK (
    revocation_reason_code IS NULL OR revocation_reason_code IN (
      'owner_withdrawal',
      'source_disclosure_error',
      'security_concern'
    )
  ),
  authorization_revalidation_required BOOLEAN NOT NULL
    CHECK (authorization_revalidation_required = TRUE),
  object_access_expires BOOLEAN NOT NULL CHECK (object_access_expires = TRUE),
  signed_url_issued BOOLEAN NOT NULL CHECK (signed_url_issued = FALSE),
  same_tenant_only BOOLEAN NOT NULL CHECK (same_tenant_only = TRUE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  pii_included BOOLEAN NOT NULL CHECK (pii_included = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  raw_transaction_data_included BOOLEAN NOT NULL CHECK (raw_transaction_data_included = FALSE),
  browser_authored BOOLEAN NOT NULL CHECK (browser_authored = FALSE),
  fee_audit_policy JSONB NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'official_report_artifact.v1'),
  CONSTRAINT official_report_artifacts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT official_report_artifacts_tenant_hash_key UNIQUE (tenant_id, artifact_hash),
  CONSTRAINT official_report_artifacts_source_obligation_fk
    FOREIGN KEY (tenant_id, source_obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT official_report_artifacts_lifetime_check CHECK (
    expires_at > generated_at AND expires_at <= generated_at + INTERVAL '1 hour'
  ),
  CONSTRAINT official_report_artifacts_revocation_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND revocation_reason_code IS NULL AND version = 1)
    OR
    (status = 'revoked' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL AND version = 2)
  ),
  CONSTRAINT official_report_artifacts_fee_policy_check CHECK (
    fee_audit_policy = jsonb_build_object(
      'availability', 'unavailable',
      'feeCalculationAuthorized', false,
      'principalAsFeeBaseAllowed', false,
      'productionPolicyAvailable', false,
      'reasonCode', 'production_fee_policy_not_approved',
      'schemaVersion', 'fee_audit_policy.v1',
      'unrealizedPnlAsFeeBaseAllowed', false
    )
  )
);

CREATE FUNCTION guard_official_report_artifact_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'official report artifacts cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.report_kind <> OLD.report_kind OR
    NEW.format <> OLD.format OR
    NEW.content_type <> OLD.content_type OR
    NEW.file_name <> OLD.file_name OR
    NEW.content_base64 <> OLD.content_base64 OR
    NEW.content_sha256 <> OLD.content_sha256 OR
    NEW.artifact_hash <> OLD.artifact_hash OR
    NEW.source_obligation_id <> OLD.source_obligation_id OR
    NEW.source_evidence_count <> OLD.source_evidence_count OR
    NEW.source_evidence_head_hash <> OLD.source_evidence_head_hash OR
    NEW.source_evidence_tail_hash <> OLD.source_evidence_tail_hash OR
    NEW.controller_actor_ref_hash <> OLD.controller_actor_ref_hash OR
    NEW.generated_at <> OLD.generated_at OR
    NEW.expires_at <> OLD.expires_at OR
    NEW.authorization_revalidation_required <> OLD.authorization_revalidation_required OR
    NEW.object_access_expires <> OLD.object_access_expires OR
    NEW.signed_url_issued <> OLD.signed_url_issued OR
    NEW.same_tenant_only <> OLD.same_tenant_only OR
    NEW.sandbox_only <> OLD.sandbox_only OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.pii_included <> OLD.pii_included OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.raw_transaction_data_included <> OLD.raw_transaction_data_included OR
    NEW.browser_authored <> OLD.browser_authored OR
    NEW.fee_audit_policy <> OLD.fee_audit_policy OR
    NEW.schema_version <> OLD.schema_version OR
    OLD.status <> 'active' OR
    NEW.status <> 'revoked' OR
    NEW.version <> OLD.version + 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'official report artifact transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER official_report_artifacts_projection_guard
BEFORE UPDATE OR DELETE ON official_report_artifacts
FOR EACH ROW EXECUTE FUNCTION guard_official_report_artifact_projection();

ALTER TABLE official_report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_report_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_official_report_artifacts ON official_report_artifacts
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_official_report_artifacts
BEFORE INSERT OR UPDATE OR DELETE ON official_report_artifacts
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX official_report_artifacts_tenant_obligation_idx
  ON official_report_artifacts(tenant_id, source_obligation_id, generated_at DESC, id);
CREATE INDEX official_report_artifacts_tenant_expiry_idx
  ON official_report_artifacts(tenant_id, status, expires_at, id);

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records', 'credit_passport_artifacts', 'official_report_artifacts'
  ));
