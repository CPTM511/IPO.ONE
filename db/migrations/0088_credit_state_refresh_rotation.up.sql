-- Internal scheduling is independent of immutable outcomes and v1 projection JSON.
-- Keep attempts even when no projection can be published within the byte budget.
ALTER TABLE subjects
  ADD COLUMN credit_state_refreshed_at TIMESTAMPTZ,
  ADD COLUMN credit_state_refresh_error TEXT
    CHECK (credit_state_refresh_error IS NULL OR
           credit_state_refresh_error = 'credit_state_resource_limit');
CREATE INDEX subjects_tenant_credit_refresh_idx
  ON subjects(tenant_id, credit_state_refreshed_at, id);
