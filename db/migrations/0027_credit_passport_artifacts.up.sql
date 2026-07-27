ALTER TABLE authorization_resource_bindings
  DROP CONSTRAINT authorization_resource_bindings_relationship_check,
  ADD CONSTRAINT authorization_resource_bindings_relationship_check
    CHECK (relationship IN ('owner', 'controller', 'subject', 'verifier'));

CREATE OR REPLACE FUNCTION protect_authorization_resource_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('authorization_resource:' || OLD.resource_type),
    hashtext(OLD.resource_id)
  );
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'authorization resource deletion is prohibited; close it instead';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
     OR OLD.resource_id IS DISTINCT FROM NEW.resource_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'authorization resource immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'authorization resource version must increment exactly once';
  END IF;
  IF OLD.status = 'closed' OR
     (OLD.status = 'frozen' AND NEW.status NOT IN ('active', 'closed')) OR
     (
       OLD.status = 'active'
       AND NEW.status NOT IN ('frozen', 'closed')
       AND NOT (
         OLD.resource_type = 'credit_passport_artifact'
         AND NEW.status = 'active'
       )
     ) THEN
    RAISE EXCEPTION 'authorization resource transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE risk_decisions
  ADD CONSTRAINT risk_decisions_tenant_id_id_decision_hash_key
    UNIQUE (tenant_id, id, decision_hash);

CREATE TABLE credit_passport_artifacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^0x[0-9a-f]{64}$'),
  source_risk_decision_id TEXT NOT NULL,
  source_decision_hash TEXT NOT NULL CHECK (source_decision_hash ~ '^0x[0-9a-f]{64}$'),
  source_risk_decision_passport_id TEXT NOT NULL,
  source_decision_passport_hash TEXT NOT NULL CHECK (source_decision_passport_hash ~ '^0x[0-9a-f]{64}$'),
  source_feature_snapshot_hash TEXT NOT NULL CHECK (source_feature_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  authority_type TEXT NOT NULL CHECK (authority_type IN ('consent', 'mandate')),
  controller_actor_ref_hash TEXT NOT NULL CHECK (controller_actor_ref_hash ~ '^0x[0-9a-f]{64}$'),
  verifier_actor_ref_hash TEXT NOT NULL CHECK (verifier_actor_ref_hash ~ '^0x[0-9a-f]{64}$'),
  purpose TEXT NOT NULL CHECK (purpose = 'private_credit_review'),
  selected_claims JSONB NOT NULL,
  disclosures JSONB NOT NULL,
  claim_manifest_hash TEXT NOT NULL CHECK (claim_manifest_hash ~ '^0x[0-9a-f]{64}$'),
  issuer JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  version BIGINT NOT NULL CHECK (version >= 1),
  supersedes_artifact_hash TEXT CHECK (supersedes_artifact_hash IS NULL OR supersedes_artifact_hash ~ '^0x[0-9a-f]{64}$'),
  supersedes_version BIGINT CHECK (supersedes_version IS NULL OR supersedes_version >= 1),
  revoked_at TIMESTAMPTZ,
  revocation_reason_code TEXT CHECK (
    revocation_reason_code IS NULL OR revocation_reason_code IN (
      'owner_withdrawal',
      'verifier_access_no_longer_required',
      'source_disclosure_error',
      'security_concern'
    )
  ),
  online_verification_required BOOLEAN NOT NULL CHECK (online_verification_required = TRUE),
  same_tenant_only BOOLEAN NOT NULL CHECK (same_tenant_only = TRUE),
  point_in_time BOOLEAN NOT NULL CHECK (point_in_time = TRUE),
  non_authorizing BOOLEAN NOT NULL CHECK (non_authorizing = TRUE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  pii_included BOOLEAN NOT NULL CHECK (pii_included = FALSE),
  raw_transaction_data_included BOOLEAN NOT NULL CHECK (raw_transaction_data_included = FALSE),
  score_authoritative BOOLEAN NOT NULL CHECK (score_authoritative = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'credit_passport_artifact.v1'),
  CONSTRAINT credit_passport_artifacts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT credit_passport_artifacts_tenant_hash_key UNIQUE (tenant_id, artifact_hash),
  CONSTRAINT credit_passport_artifacts_source_verifier_purpose_key
    UNIQUE (tenant_id, source_decision_passport_hash, verifier_actor_ref_hash, purpose),
  CONSTRAINT credit_passport_artifacts_source_decision_fk
    FOREIGN KEY (tenant_id, source_risk_decision_id, source_decision_hash)
    REFERENCES risk_decisions(tenant_id, id, decision_hash),
  CONSTRAINT credit_passport_artifacts_subject_fk
    FOREIGN KEY (tenant_id, subject_id)
    REFERENCES subjects(tenant_id, id),
  CONSTRAINT credit_passport_artifacts_lifetime_check CHECK (
    expires_at > issued_at AND expires_at <= issued_at + INTERVAL '24 hours'
  ),
  CONSTRAINT credit_passport_artifacts_supersession_check CHECK (
    (supersedes_artifact_hash IS NULL AND supersedes_version IS NULL)
    OR
    (
      supersedes_artifact_hash IS NOT NULL AND
      supersedes_version IS NOT NULL AND
      supersedes_version < version
    )
  ),
  CONSTRAINT credit_passport_artifacts_revocation_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND revocation_reason_code IS NULL)
    OR
    (status = 'revoked' AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL)
  )
);

CREATE FUNCTION guard_credit_passport_artifact_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Credit Passport artifacts cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.source_risk_decision_id <> OLD.source_risk_decision_id OR
    NEW.source_decision_hash <> OLD.source_decision_hash OR
    NEW.source_risk_decision_passport_id <> OLD.source_risk_decision_passport_id OR
    NEW.source_decision_passport_hash <> OLD.source_decision_passport_hash OR
    NEW.source_feature_snapshot_hash <> OLD.source_feature_snapshot_hash OR
    NEW.subject_id <> OLD.subject_id OR
    NEW.authority_type <> OLD.authority_type OR
    NEW.controller_actor_ref_hash <> OLD.controller_actor_ref_hash OR
    NEW.verifier_actor_ref_hash <> OLD.verifier_actor_ref_hash OR
    NEW.purpose <> OLD.purpose OR
    NEW.issuer <> OLD.issuer OR
    NEW.online_verification_required <> OLD.online_verification_required OR
    NEW.same_tenant_only <> OLD.same_tenant_only OR
    NEW.point_in_time <> OLD.point_in_time OR
    NEW.non_authorizing <> OLD.non_authorizing OR
    NEW.sandbox_only <> OLD.sandbox_only OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.pii_included <> OLD.pii_included OR
    NEW.raw_transaction_data_included <> OLD.raw_transaction_data_included OR
    NEW.score_authoritative <> OLD.score_authoritative OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    OLD.status <> 'active' OR
    (
      NEW.status = 'active' AND (
        NEW.supersedes_artifact_hash <> OLD.artifact_hash OR
        NEW.supersedes_version <> OLD.version OR
        NEW.revoked_at IS NOT NULL OR
        NEW.revocation_reason_code IS NOT NULL
      )
    ) OR
    (
      NEW.status = 'revoked' AND (
        NEW.selected_claims <> OLD.selected_claims OR
        NEW.disclosures <> OLD.disclosures OR
        NEW.claim_manifest_hash <> OLD.claim_manifest_hash OR
        NEW.issued_at <> OLD.issued_at OR
        NEW.expires_at <> OLD.expires_at OR
        NEW.supersedes_artifact_hash IS DISTINCT FROM OLD.supersedes_artifact_hash OR
        NEW.supersedes_version IS DISTINCT FROM OLD.supersedes_version
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Credit Passport artifact transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_passport_artifacts_projection_guard
BEFORE UPDATE OR DELETE ON credit_passport_artifacts
FOR EACH ROW EXECUTE FUNCTION guard_credit_passport_artifact_projection();

ALTER TABLE credit_passport_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_passport_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_credit_passport_artifacts ON credit_passport_artifacts
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_credit_passport_artifacts
BEFORE INSERT OR UPDATE OR DELETE ON credit_passport_artifacts
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX credit_passport_artifacts_tenant_subject_idx
  ON credit_passport_artifacts(tenant_id, subject_id, issued_at DESC, id);
CREATE INDEX credit_passport_artifacts_tenant_verifier_idx
  ON credit_passport_artifacts(tenant_id, verifier_actor_ref_hash, expires_at DESC, id);

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records', 'credit_passport_artifacts'
  ));
