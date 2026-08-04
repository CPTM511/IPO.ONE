ALTER TABLE lockboxes
  ADD COLUMN principal_id TEXT,
  ADD COLUMN mandate_id TEXT,
  ADD COLUMN credit_intent_id TEXT,
  ADD COLUMN credit_offer_id TEXT,
  ADD COLUMN obligation_id TEXT,
  ADD COLUMN credit_line_id TEXT,
  ADD COLUMN account_binding_id TEXT,
  ADD COLUMN purpose_code TEXT,
  ADD COLUMN allowed_provider_ids JSONB,
  ADD COLUMN sandbox_only BOOLEAN,
  ADD COLUMN production_funds_moved BOOLEAN,
  ADD COLUMN withdrawable BOOLEAN,
  ADD COLUMN custody_authority BOOLEAN,
  ADD COLUMN unrestricted_transfers_allowed BOOLEAN,
  ADD CONSTRAINT lockboxes_v2_shape_check CHECK (
    schema_version <> 'lockbox.v2'
    OR (
      principal_id IS NOT NULL
      AND mandate_id IS NOT NULL
      AND credit_intent_id IS NOT NULL
      AND credit_offer_id IS NOT NULL
      AND obligation_id IS NOT NULL
      AND credit_line_id IS NOT NULL
      AND account_binding_id IS NOT NULL
      AND purpose_code ~ '^[a-z][a-z0-9_.-]{1,95}$'
      AND jsonb_typeof(allowed_provider_ids) = 'array'
      AND jsonb_array_length(allowed_provider_ids) <= 32
      AND sandbox_only = TRUE
      AND production_funds_moved = FALSE
      AND withdrawable = FALSE
      AND custody_authority = FALSE
      AND unrestricted_transfers_allowed = FALSE
      AND status IN ('active', 'frozen', 'closed')
    )
  ),
  ADD CONSTRAINT lockboxes_v2_tenant_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_intent_fk
    FOREIGN KEY (tenant_id, credit_intent_id) REFERENCES credit_intents(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_offer_fk
    FOREIGN KEY (tenant_id, credit_offer_id) REFERENCES credit_offers(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_credit_line_fk
    FOREIGN KEY (tenant_id, credit_line_id) REFERENCES credit_lines(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_account_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id) REFERENCES account_bindings(tenant_id, id),
  ADD CONSTRAINT lockboxes_v2_tenant_obligation_key UNIQUE (tenant_id, obligation_id);

CREATE FUNCTION guard_agent_lockbox_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema_version <> 'lockbox.v2' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent Lockbox projections cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.lockbox_hash, NEW.subject_id, NEW.principal_id,
    NEW.mandate_id, NEW.credit_intent_id, NEW.credit_offer_id,
    NEW.obligation_id, NEW.credit_line_id, NEW.account_binding_id,
    NEW.chain_id, NEW.asset_id, NEW.account_ref, NEW.purpose_code,
    NEW.allowed_provider_ids, NEW.ledger_account_id,
    NEW.revenue_ledger_account_id, NEW.repayment_ledger_account_id,
    NEW.sandbox_only, NEW.production_funds_moved, NEW.withdrawable,
    NEW.custody_authority, NEW.unrestricted_transfers_allowed,
    NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.lockbox_hash, OLD.subject_id, OLD.principal_id,
    OLD.mandate_id, OLD.credit_intent_id, OLD.credit_offer_id,
    OLD.obligation_id, OLD.credit_line_id, OLD.account_binding_id,
    OLD.chain_id, OLD.asset_id, OLD.account_ref, OLD.purpose_code,
    OLD.allowed_provider_ids, OLD.ledger_account_id,
    OLD.revenue_ledger_account_id, OLD.repayment_ledger_account_id,
    OLD.sandbox_only, OLD.production_funds_moved, OLD.withdrawable,
    OLD.custody_authority, OLD.unrestricted_transfers_allowed,
    OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent Lockbox identity and restrictions are immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'active' AND NEW.status IN ('frozen', 'closed')
    OR OLD.status = 'frozen' AND NEW.status IN ('active', 'closed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid Agent Lockbox status transition';
  END IF;
  IF OLD.status = 'closed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'closed Agent Lockbox projections are immutable';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent Lockbox update time cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_agent_lockbox_projection
BEFORE UPDATE OR DELETE ON lockboxes
FOR EACH ROW EXECUTE FUNCTION guard_agent_lockbox_projection();

CREATE INDEX agent_lockboxes_tenant_subject_status_idx
  ON lockboxes(tenant_id, subject_id, status, obligation_id)
  WHERE schema_version = 'lockbox.v2';
