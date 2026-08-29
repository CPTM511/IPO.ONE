-- PILOT-008A / REQ-PILOT-001: privacy-safe, no-funds dispute and correction cases.
-- Original target truth is immutable. A correction is an additive Event link only.

CREATE TABLE pilot_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  case_identity_hash TEXT NOT NULL CHECK (case_identity_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  entry_mode subject_type NOT NULL CHECK (entry_mode IN ('human', 'agent')),
  filer_actor_ref_hash TEXT NOT NULL CHECK (filer_actor_ref_hash ~ '^0x[0-9a-f]{64}$'),
  target_type TEXT NOT NULL CHECK (target_type IN (
    'decision', 'offer_disclosure', 'payment', 'servicing_action', 'evidence_item', 'report'
  )),
  target_id TEXT NOT NULL,
  target_ref_hash TEXT NOT NULL CHECK (target_ref_hash ~ '^0x[0-9a-f]{64}$'),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'record_inaccurate', 'context_missing', 'payment_mismatch', 'servicing_error',
    'evidence_mismatch', 'report_mismatch'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'open', 'assigned', 'resolved_upheld', 'resolved_corrected'
  )),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  filed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  projection JSONB NOT NULL CHECK (
    jsonb_typeof(projection) = 'object'
    AND projection->>'schemaVersion' = 'pilot_case.v1'
    AND projection->>'pilotCaseId' = id
    AND projection->>'caseIdentityHash' = case_identity_hash
    AND projection->>'subjectId' = subject_id
    AND projection->>'entryMode' = entry_mode::text
    AND projection->>'filerActorRefHash' = filer_actor_ref_hash
    AND projection->>'targetType' = target_type
    AND projection->>'targetId' = target_id
    AND projection->>'targetRefHash' = target_ref_hash
    AND projection->>'reasonCode' = reason_code
    AND projection->>'status' = status
    AND (projection->>'sequence')::integer = sequence
    AND projection->>'filedAt' = to_char(filed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND projection->>'updatedAt' = to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND projection->'sandboxOnly' = 'true'::jsonb
    AND projection->'productionAuthority' = 'false'::jsonb
    AND projection->'economicMutationAuthorized' = 'false'::jsonb
    AND jsonb_typeof(projection->'history') = 'array'
    AND jsonb_array_length(projection->'history') = sequence
  ),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  economic_mutation_authorized BOOLEAN NOT NULL CHECK (economic_mutation_authorized = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pilot_case.v1'),
  CONSTRAINT pilot_cases_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT pilot_cases_tenant_hash_key UNIQUE (tenant_id, case_identity_hash),
  CONSTRAINT pilot_cases_subject_mode_fk
    FOREIGN KEY (tenant_id, subject_id, entry_mode)
    REFERENCES subjects(tenant_id, id, subject_type)
);

CREATE FUNCTION guard_pilot_case_projection()
RETURNS TRIGGER AS $$
DECLARE
  history_index INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pilot cases cannot be deleted';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.case_identity_hash IS DISTINCT FROM OLD.case_identity_hash
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.entry_mode IS DISTINCT FROM OLD.entry_mode
     OR NEW.filer_actor_ref_hash IS DISTINCT FROM OLD.filer_actor_ref_hash
     OR NEW.target_type IS DISTINCT FROM OLD.target_type
     OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.target_ref_hash IS DISTINCT FROM OLD.target_ref_hash
     OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
     OR NEW.filed_at IS DISTINCT FROM OLD.filed_at
     OR NEW.sandbox_only IS DISTINCT FROM OLD.sandbox_only
     OR NEW.production_authority IS DISTINCT FROM OLD.production_authority
     OR NEW.economic_mutation_authorized IS DISTINCT FROM OLD.economic_mutation_authorized
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
     OR (NEW.projection - ARRAY[
          'status', 'assignedOwnerRefHash', 'resolution', 'correction',
          'sequence', 'updatedAt', 'history'
        ]) IS DISTINCT FROM (OLD.projection - ARRAY[
          'status', 'assignedOwnerRefHash', 'resolution', 'correction',
          'sequence', 'updatedAt', 'history'
        ]) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pilot case original truth is immutable';
  END IF;
  IF NEW.sequence <> OLD.sequence + 1
     OR NEW.updated_at <= OLD.updated_at
     OR NOT (
       (OLD.status = 'open' AND NEW.status = 'assigned' AND NEW.sequence = 2)
       OR
       (OLD.status = 'assigned' AND NEW.status IN ('resolved_upheld', 'resolved_corrected')
         AND NEW.sequence = 3)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pilot case transition is invalid';
  END IF;
  FOR history_index IN 0..OLD.sequence - 1 LOOP
    IF (NEW.projection->'history'->history_index)
       IS DISTINCT FROM (OLD.projection->'history'->history_index) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pilot case history is append-only';
    END IF;
  END LOOP;
  IF NEW.status = 'resolved_corrected' AND NOT (
    NEW.projection->>'resolution' = 'correct'
    AND NEW.projection->'correction'->>'originalTargetRefHash' = OLD.target_ref_hash
    AND NEW.projection->'correction'->'additiveOnly' = 'true'::jsonb
    AND NEW.projection->'correction'->'originalRecordImmutable' = 'true'::jsonb
    AND NEW.projection->'correction'->'economicMutationAuthorized' = 'false'::jsonb
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pilot case correction must be additive';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pilot_cases_projection_guard
BEFORE UPDATE OR DELETE ON pilot_cases
FOR EACH ROW EXECUTE FUNCTION guard_pilot_case_projection();

ALTER TABLE pilot_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pilot_cases ON pilot_cases
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_pilot_cases
BEFORE INSERT OR UPDATE OR DELETE ON pilot_cases
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX pilot_cases_tenant_subject_updated_idx
  ON pilot_cases(tenant_id, subject_id, updated_at DESC, id);
CREATE INDEX pilot_cases_tenant_queue_idx
  ON pilot_cases(tenant_id, status, updated_at DESC, id);

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records', 'credit_passport_artifacts', 'official_report_artifacts',
    'pilot_cases'
  ));
