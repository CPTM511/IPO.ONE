CREATE FUNCTION register_credit_registry_evidence_resource()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO authorization_resources (
    tenant_id,
    resource_type,
    resource_id,
    status,
    version,
    created_at,
    updated_at,
    schema_version
  ) VALUES (
    NEW.tenant_id,
    'credit_registry_evidence',
    NEW.authorization_hash,
    'active',
    1,
    NEW.recorded_at,
    NEW.recorded_at,
    'authorization_resource.v1'
  )
  ON CONFLICT (tenant_id, resource_type, resource_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1
      FROM authorization_resources
     WHERE tenant_id = NEW.tenant_id
       AND resource_type = 'credit_registry_evidence'
       AND resource_id = NEW.authorization_hash
       AND status = 'active'
       AND version = 1
       AND schema_version = 'authorization_resource.v1'
  ) THEN
    RAISE EXCEPTION
      'credit Registry Evidence authorization resource is inconsistent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_registry_evidence_resource_registration
AFTER INSERT ON credit_registry_chain_observations
FOR EACH ROW EXECUTE FUNCTION register_credit_registry_evidence_resource();

INSERT INTO authorization_resources (
  tenant_id,
  resource_type,
  resource_id,
  status,
  version,
  created_at,
  updated_at,
  schema_version
)
SELECT
  tenant_id,
  'credit_registry_evidence',
  authorization_hash,
  'active',
  1,
  min(recorded_at),
  min(recorded_at),
  'authorization_resource.v1'
FROM credit_registry_chain_observations
GROUP BY tenant_id, authorization_hash
ON CONFLICT (tenant_id, resource_type, resource_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM credit_registry_chain_observations AS observation
      LEFT JOIN authorization_resources AS resource
        ON resource.tenant_id = observation.tenant_id
       AND resource.resource_type = 'credit_registry_evidence'
       AND resource.resource_id = observation.authorization_hash
       AND resource.status = 'active'
       AND resource.version = 1
       AND resource.schema_version = 'authorization_resource.v1'
     WHERE resource.resource_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'credit Registry Evidence backfill produced an inconsistent resource';
  END IF;
END;
$$;
