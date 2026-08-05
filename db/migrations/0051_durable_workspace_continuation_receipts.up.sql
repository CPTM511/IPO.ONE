CREATE TABLE workspace_continuation_receipts (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  id TEXT NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (receipt_hash ~ '^0x[0-9a-f]{64}$'),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type = 'agent'),
  subject_id TEXT NOT NULL,
  mandate_id TEXT NOT NULL,
  credit_intent_id TEXT NOT NULL,
  risk_decision_id TEXT NOT NULL,
  credit_offer_id TEXT NOT NULL,
  credit_offer_hash TEXT NOT NULL CHECK (credit_offer_hash ~ '^0x[0-9a-f]{64}$'),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^0x[0-9a-f]{64}$'),
  offer_schema_version TEXT NOT NULL,
  offer_aggregate_version BIGINT NOT NULL CHECK (offer_aggregate_version > 0),
  receipt_payload JSONB NOT NULL CHECK (jsonb_typeof(receipt_payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  version BIGINT NOT NULL CHECK (version > 0),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > issued_at),
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'workspace_continuation_receipt.v1'),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, receipt_hash),
  UNIQUE (tenant_id, actor_id, credit_offer_id),
  FOREIGN KEY (actor_id) REFERENCES actors(id),
  FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  FOREIGN KEY (tenant_id, credit_intent_id) REFERENCES credit_intents(tenant_id, id),
  FOREIGN KEY (tenant_id, risk_decision_id) REFERENCES risk_decisions(tenant_id, id),
  FOREIGN KEY (tenant_id, credit_offer_id) REFERENCES credit_offers(tenant_id, id),
  CHECK (
    (status = 'active' AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND consumed_at IS NULL AND revoked_at IS NOT NULL)
    OR (status = 'expired' AND consumed_at IS NULL AND revoked_at IS NULL)
  )
);

CREATE INDEX workspace_continuation_receipts_actor_resume_idx
  ON workspace_continuation_receipts(tenant_id, actor_id, status, expires_at, issued_at DESC);

CREATE FUNCTION guard_workspace_continuation_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace continuation receipts cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.receipt_hash, NEW.actor_id, NEW.actor_type,
    NEW.subject_id, NEW.mandate_id, NEW.credit_intent_id, NEW.risk_decision_id,
    NEW.credit_offer_id, NEW.credit_offer_hash, NEW.terms_hash,
    NEW.offer_schema_version, NEW.offer_aggregate_version, NEW.receipt_payload,
    NEW.issued_at, NEW.expires_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.receipt_hash, OLD.actor_id, OLD.actor_type,
    OLD.subject_id, OLD.mandate_id, OLD.credit_intent_id, OLD.risk_decision_id,
    OLD.credit_offer_id, OLD.credit_offer_hash, OLD.terms_hash,
    OLD.offer_schema_version, OLD.offer_aggregate_version, OLD.receipt_payload,
    OLD.issued_at, OLD.expires_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace continuation receipt binding is immutable';
  END IF;
  IF OLD.status <> 'active' OR NEW.status NOT IN ('active', 'consumed', 'revoked', 'expired') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid workspace continuation receipt transition';
  END IF;
  IF NEW.version < OLD.version OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'workspace continuation receipt version cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_workspace_continuation_receipt
BEFORE UPDATE OR DELETE ON workspace_continuation_receipts
FOR EACH ROW EXECUTE FUNCTION guard_workspace_continuation_receipt();

ALTER TABLE workspace_continuation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_continuation_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_continuation_receipts_tenant_isolation
  ON workspace_continuation_receipts
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
