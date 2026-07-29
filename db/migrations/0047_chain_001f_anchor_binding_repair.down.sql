DO $$
BEGIN
  PERFORM set_config(
    'app.tenant_id',
    'tenant_ipo_one_local_pilot',
    TRUE
  );
  IF EXISTS (
    SELECT 1
      FROM evidence_chain_anchor_binding_repairs
     WHERE tenant_id = 'tenant_ipo_one_local_pilot'
       AND evidence_hash =
         '0x9c5af42ce7347e092eeb71530e0bc01e7c8a16fed4f99c86c882397e36bb6d70'
  ) THEN
    RAISE EXCEPTION
      'cannot reverse the accepted CHAIN-001F live onchain binding repair';
  END IF;
END;
$$;

DROP POLICY IF EXISTS
  tenant_isolation_evidence_chain_anchor_binding_repairs
  ON evidence_chain_anchor_binding_repairs;
DROP TRIGGER IF EXISTS
  tenant_context_guard_evidence_chain_anchor_binding_repairs
  ON evidence_chain_anchor_binding_repairs;
DROP TRIGGER IF EXISTS
  evidence_chain_anchor_binding_repairs_immutable
  ON evidence_chain_anchor_binding_repairs;
DROP TABLE IF EXISTS evidence_chain_anchor_binding_repairs;
