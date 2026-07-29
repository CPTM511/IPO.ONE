DROP TRIGGER IF EXISTS credit_registry_evidence_resource_registration
  ON credit_registry_chain_observations;
DROP FUNCTION IF EXISTS register_credit_registry_evidence_resource();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM authorization_audit_events
     WHERE resource_type = 'credit_registry_evidence'
  ) THEN
    RAISE EXCEPTION
      'cannot roll back credit Registry Evidence resources after access audit exists';
  END IF;
END;
$$;

ALTER TABLE authorization_resources
  DISABLE TRIGGER authorization_resources_transition_guard;

DELETE FROM authorization_resources
 WHERE resource_type = 'credit_registry_evidence';

ALTER TABLE authorization_resources
  ENABLE TRIGGER authorization_resources_transition_guard;
