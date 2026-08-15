DROP INDEX IF EXISTS agent_lockboxes_tenant_subject_status_idx;
DROP TRIGGER IF EXISTS guard_agent_lockbox_projection ON lockboxes;
DROP FUNCTION IF EXISTS guard_agent_lockbox_projection();

ALTER TABLE lockboxes
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_obligation_key,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_account_binding_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_credit_line_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_obligation_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_offer_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_intent_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_mandate_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_tenant_principal_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_v2_shape_check,
  DROP COLUMN IF EXISTS unrestricted_transfers_allowed,
  DROP COLUMN IF EXISTS custody_authority,
  DROP COLUMN IF EXISTS withdrawable,
  DROP COLUMN IF EXISTS production_funds_moved,
  DROP COLUMN IF EXISTS sandbox_only,
  DROP COLUMN IF EXISTS allowed_provider_ids,
  DROP COLUMN IF EXISTS purpose_code,
  DROP COLUMN IF EXISTS account_binding_id,
  DROP COLUMN IF EXISTS credit_line_id,
  DROP COLUMN IF EXISTS obligation_id,
  DROP COLUMN IF EXISTS credit_offer_id,
  DROP COLUMN IF EXISTS credit_intent_id,
  DROP COLUMN IF EXISTS mandate_id,
  DROP COLUMN IF EXISTS principal_id;
