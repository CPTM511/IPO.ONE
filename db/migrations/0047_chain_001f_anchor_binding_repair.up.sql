-- CHAIN-001F bounded repair: the first live Evidence anchor transaction used
-- the runtime SHA3 binding dialect while its historical 0045 backfill row
-- still held the legacy SHA-256 binding dialect. Repair only that exact local
-- pilot row and preserve a durable, append-only audit record.

CREATE TABLE evidence_chain_anchor_binding_repairs (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_hash TEXT NOT NULL CHECK (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  previous_event_type_hash TEXT NOT NULL CHECK (
    previous_event_type_hash ~ '^0x[0-9a-f]{64}$'
  ),
  repaired_event_type_hash TEXT NOT NULL CHECK (
    repaired_event_type_hash ~ '^0x[0-9a-f]{64}$'
  ),
  previous_aggregate_ref_hash TEXT NOT NULL CHECK (
    previous_aggregate_ref_hash ~ '^0x[0-9a-f]{64}$'
  ),
  repaired_aggregate_ref_hash TEXT NOT NULL CHECK (
    repaired_aggregate_ref_hash ~ '^0x[0-9a-f]{64}$'
  ),
  reason_code TEXT NOT NULL CHECK (
    reason_code = 'chain_001f_historical_binding_dialect_mismatch'
  ),
  repaired_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (
    production_funds_moved = FALSE
  ),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'evidence_chain_anchor_binding_repair.v1'
  ),
  CONSTRAINT evidence_chain_anchor_binding_repairs_pkey PRIMARY KEY (
    tenant_id, id
  ),
  CONSTRAINT evidence_chain_anchor_binding_repairs_evidence_key UNIQUE (
    tenant_id, evidence_hash
  ),
  CONSTRAINT evidence_chain_anchor_binding_repairs_transaction_key UNIQUE (
    tenant_id, transaction_hash
  ),
  CONSTRAINT evidence_chain_anchor_binding_repairs_anchor_fk
    FOREIGN KEY (tenant_id, evidence_hash)
    REFERENCES evidence_chain_anchors(tenant_id, evidence_hash)
);

DO $$
DECLARE
  candidate_count INTEGER;
  repaired_count INTEGER;
BEGIN
  PERFORM set_config(
    'app.tenant_id',
    'tenant_ipo_one_local_pilot',
    TRUE
  );

  SELECT count(*)
    INTO candidate_count
    FROM evidence_chain_anchors
   WHERE tenant_id = 'tenant_ipo_one_local_pilot'
     AND evidence_hash =
       '0x9c5af42ce7347e092eeb71530e0bc01e7c8a16fed4f99c86c882397e36bb6d70';

  IF candidate_count = 1 THEN
    IF NOT EXISTS (
      SELECT 1
        FROM evidence_chain_anchors
       WHERE tenant_id = 'tenant_ipo_one_local_pilot'
         AND evidence_hash =
           '0x9c5af42ce7347e092eeb71530e0bc01e7c8a16fed4f99c86c882397e36bb6d70'
         AND event_type = 'reconciliation_completed'
         AND event_type_hash =
           '0xaebf1bda531ec0bb7159cced7e4c0cac784eb1bf5c8b2d92dcc35c4dcff4e9aa'
         AND aggregate_ref_hash =
           '0x1f4ac3381367d59767c129371eb871dc571e7dfb6315078b2d8764dea75be290'
         AND action_digest =
           '0x4484455d2e0b9bc81e89692e76a5fe6ff75600289610a935438b7dedf9c9f981'
         AND status = 'broadcast'
         AND transaction_hash =
           '0x8d68c224199f1144f4be9d31b27af86850ba40c4006fc6864daaa568dae4195e'
         AND attestor_account_id =
           'eip155:84532:0x66f0acF3457e7B73845FD33c764947fC5A220f2a'
         AND attestor_nonce = 0
         AND batch_ordinal = 0
         AND batch_size = 1
         AND batch_id =
           '0xde3d2079ca746d185c6ab3f613bef54196a55997b7032d262c34430431a5640b'
         AND batch_digest =
           '0x51194c3b6281843f458a18da44d1f6421aafed1ce96fab873640bc77d115f4ff'
    ) THEN
      RAISE EXCEPTION
        'CHAIN-001F binding repair candidate does not match the accepted live transaction';
    END IF;

    INSERT INTO evidence_chain_anchor_binding_repairs(
      id, tenant_id, evidence_hash, transaction_hash,
      previous_event_type_hash, repaired_event_type_hash,
      previous_aggregate_ref_hash, repaired_aggregate_ref_hash,
      reason_code, repaired_at, sandbox_only, production_funds_moved,
      schema_version
    ) VALUES (
      'binding_repair_chain_001f_20260729_001',
      'tenant_ipo_one_local_pilot',
      '0x9c5af42ce7347e092eeb71530e0bc01e7c8a16fed4f99c86c882397e36bb6d70',
      '0x8d68c224199f1144f4be9d31b27af86850ba40c4006fc6864daaa568dae4195e',
      '0xaebf1bda531ec0bb7159cced7e4c0cac784eb1bf5c8b2d92dcc35c4dcff4e9aa',
      '0x6a7a28bcd43cd03697877234e1ed5fe9ee02a5e0f4e1ff4c4cff528b0565af59',
      '0x1f4ac3381367d59767c129371eb871dc571e7dfb6315078b2d8764dea75be290',
      '0xa93b7c7abe3c80611c344da6ee6af059b64a94b88971930de5b19542a4d78664',
      'chain_001f_historical_binding_dialect_mismatch',
      clock_timestamp(),
      TRUE,
      FALSE,
      'evidence_chain_anchor_binding_repair.v1'
    );

    EXECUTE
      'DROP TRIGGER evidence_chain_anchor_transition_guard ' ||
      'ON evidence_chain_anchors';

    UPDATE evidence_chain_anchors
       SET event_type_hash =
             '0x6a7a28bcd43cd03697877234e1ed5fe9ee02a5e0f4e1ff4c4cff528b0565af59',
           aggregate_ref_hash =
             '0xa93b7c7abe3c80611c344da6ee6af059b64a94b88971930de5b19542a4d78664'
     WHERE tenant_id = 'tenant_ipo_one_local_pilot'
       AND evidence_hash =
         '0x9c5af42ce7347e092eeb71530e0bc01e7c8a16fed4f99c86c882397e36bb6d70'
       AND transaction_hash =
         '0x8d68c224199f1144f4be9d31b27af86850ba40c4006fc6864daaa568dae4195e'
       AND event_type_hash =
         '0xaebf1bda531ec0bb7159cced7e4c0cac784eb1bf5c8b2d92dcc35c4dcff4e9aa'
       AND aggregate_ref_hash =
         '0x1f4ac3381367d59767c129371eb871dc571e7dfb6315078b2d8764dea75be290';

    GET DIAGNOSTICS repaired_count = ROW_COUNT;
    IF repaired_count <> 1 THEN
      RAISE EXCEPTION 'CHAIN-001F binding repair did not update exactly one row';
    END IF;

    EXECUTE
      'CREATE TRIGGER evidence_chain_anchor_transition_guard ' ||
      'BEFORE UPDATE ON evidence_chain_anchors ' ||
      'FOR EACH ROW EXECUTE FUNCTION protect_evidence_chain_anchor_transition()';
  ELSIF candidate_count <> 0 THEN
    RAISE EXCEPTION 'CHAIN-001F binding repair candidate is not unique';
  END IF;
END;
$$;

CREATE TRIGGER evidence_chain_anchor_binding_repairs_immutable
BEFORE UPDATE OR DELETE ON evidence_chain_anchor_binding_repairs
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

ALTER TABLE evidence_chain_anchor_binding_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_chain_anchor_binding_repairs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_evidence_chain_anchor_binding_repairs
ON evidence_chain_anchor_binding_repairs
USING (tenant_id = current_app_tenant_id())
WITH CHECK (tenant_id = current_app_tenant_id());

CREATE TRIGGER tenant_context_guard_evidence_chain_anchor_binding_repairs
BEFORE INSERT OR UPDATE OR DELETE ON evidence_chain_anchor_binding_repairs
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
