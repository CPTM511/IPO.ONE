DROP INDEX IF EXISTS consent_records_tenant_subject_status_expiry_idx;
DROP INDEX IF EXISTS consent_records_tenant_subject_created_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_consent_records ON consent_records;
DROP POLICY IF EXISTS tenant_isolation_consent_records ON consent_records;
ALTER TABLE consent_records DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS consent_records_projection_guard ON consent_records;

DROP TABLE IF EXISTS consent_records;
DROP FUNCTION IF EXISTS guard_consent_record_projection();

ALTER TABLE subjects
  DROP CONSTRAINT IF EXISTS subjects_tenant_id_primary_principal_type_key;
