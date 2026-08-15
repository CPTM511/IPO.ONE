DROP TRIGGER IF EXISTS sandbox_mandates_projection_guard ON mandates;
DROP FUNCTION IF EXISTS guard_sandbox_mandate_projection();

DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants ORDER BY id LOOP
    PERFORM set_config('app.tenant_id', tenant_record.id, true);
    IF EXISTS (
      SELECT 1 FROM mandates
       WHERE tenant_id = tenant_record.id
         AND schema_version = 'mandate.v3'
         AND activation_acknowledgement IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'cannot roll back sandbox Mandate activation while acknowledgements exist';
    END IF;
    UPDATE mandates
       SET schema_version = 'mandate.v2'
     WHERE tenant_id = tenant_record.id
       AND schema_version = 'mandate.v3';
  END LOOP;
END;
$$;

ALTER TABLE mandates
  DROP CONSTRAINT IF EXISTS mandates_v3_shape_check,
  DROP COLUMN activation_acknowledgement,
  DROP COLUMN production_authority,
  DROP COLUMN sandbox_only,
  DROP COLUMN terms_hash;
