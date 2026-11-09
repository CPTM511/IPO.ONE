-- B4 L0 synthetic-only. Existing accepted rows and report fee-policy v1 stay intact.
ALTER TABLE credit_offers ADD COLUMN fee_terms JSONB, ADD COLUMN fee_collateral_terms JSONB;
ALTER TABLE credit_offers DROP CONSTRAINT credit_offers_terms_version_check;
ALTER TABLE credit_offers ADD CONSTRAINT credit_offers_terms_version_check CHECK
  (terms_version IN ('credit_terms.v1','credit_terms.v2','credit_terms.synthetic_secured.v1','credit_terms.synthetic_fee.v1'));
-- Keep the previous shape exactly; admit only the new synthetic v1 family.
ALTER TABLE credit_offers DROP CONSTRAINT credit_offers_v2_shape_check;
ALTER TABLE credit_offers ADD CONSTRAINT credit_offers_v2_shape_check CHECK (
 (schema_version='credit_offer.v1' AND terms_version IN ('credit_terms.v1','credit_terms.synthetic_secured.v1','credit_terms.synthetic_fee.v1')
  AND num_nonnulls(capital_partner_id,capital_partner_operator_id,credit_passport_artifact_id,credit_passport_artifact_hash,
    credit_passport_artifact_version,passport_verification_hash,underwriting_snapshot_hash,facility_limit_minor,
    per_draw_cap_minor,permitted_purpose_code,conditions,undrawn_revocation_rule)=0)
 OR (schema_version='credit_offer.v2' AND terms_version='credit_terms.v2'
  AND capital_partner_id IS NOT NULL AND capital_partner_operator_id IS NOT NULL
  AND credit_passport_artifact_id IS NOT NULL AND credit_passport_artifact_hash ~ '^0x[0-9a-f]{64}$'
  AND credit_passport_artifact_version>=1 AND passport_verification_hash ~ '^0x[0-9a-f]{64}$'
  AND underwriting_snapshot_hash ~ '^0x[0-9a-f]{64}$' AND facility_limit_minor>0
  AND approved_principal_minor<=facility_limit_minor AND per_draw_cap_minor>0
  AND per_draw_cap_minor<=facility_limit_minor AND approved_principal_minor<=per_draw_cap_minor
  AND permitted_purpose_code ~ '^[a-z][a-z0-9_.-]{1,95}$' AND jsonb_typeof(conditions)='array'
  AND jsonb_array_length(conditions) BETWEEN 1 AND 12
  AND undrawn_revocation_rule IN ('capital_partner_before_acceptance','irrevocable_until_expiry'))
);
ALTER TABLE credit_offers ADD CONSTRAINT credit_offers_local_fee_shape CHECK ((
 (terms_version='credit_terms.synthetic_fee.v1' AND fee_terms IS NOT NULL
  AND schema_version='credit_offer.v1' AND sandbox_only AND NOT production_funds_approved
  AND fee_terms->>'profile'='synthetic_usd_platform_fee.v1'
  AND fee_terms->>'scope'='L0_LOCAL_NO_FUNDS'
  AND fee_terms->>'assetId'=asset_id AND asset_id='urn:ipo-one:sandbox-asset:usd-cent'
  AND fee_terms->>'economicLoanId'=credit_intent_id
  AND fee_terms->>'principalMinor'=approved_principal_minor::text
  AND fee_terms->>'borrowerRateBps'='10' AND fee_terms->>'institutionRateBps'='1000'
  AND fee_terms->>'borrowerCapMinor'='1000' AND origination_fee_minor=0
  AND fee_terms->>'productionFundsMoved'='false' AND fee_terms->>'productionPolicyAvailable'='false')
 OR (terms_version<>'credit_terms.synthetic_fee.v1' AND fee_terms IS NULL AND fee_collateral_terms IS NULL)
) IS TRUE);
CREATE FUNCTION guard_local_synthetic_offer_fee_terms() RETURNS TRIGGER AS $$
BEGIN
 IF NEW.fee_terms IS DISTINCT FROM OLD.fee_terms OR NEW.fee_collateral_terms IS DISTINCT FROM OLD.fee_collateral_terms THEN
  RAISE EXCEPTION 'Accepted fee terms are immutable';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER local_synthetic_offer_fee_terms_guard BEFORE UPDATE ON credit_offers
 FOR EACH ROW EXECUTE FUNCTION guard_local_synthetic_offer_fee_terms();

ALTER TABLE obligations ADD COLUMN synthetic_fees JSONB;
ALTER TABLE obligations ADD CONSTRAINT obligations_local_synthetic_fee_shape CHECK (
 synthetic_fees IS NULL OR ((schema_version='obligation.v2' AND sandbox_only AND NOT production_funds_moved
 AND asset_id='urn:ipo-one:sandbox-asset:usd-cent' AND pool_obligation_binding_id IS NULL
 AND synthetic_fees#>>'{terms,profile}'='synthetic_usd_platform_fee.v1'
 AND synthetic_fees#>>'{terms,scope}'='L0_LOCAL_NO_FUNDS'
 AND synthetic_fees#>>'{terms,economicLoanId}'=credit_intent_id
 AND synthetic_fees#>>'{terms,principalMinor}'=amount_minor::text
 AND synthetic_fees#>>'{terms,productionFundsMoved}'='false'
 AND (synthetic_fees->>'borrowerAssessedMinor')::NUMERIC BETWEEN 0 AND 1000
 AND (synthetic_fees->>'fundedBaseMinor')::NUMERIC>=0
 AND (synthetic_fees->>'normalInterestBaseMinor')::NUMERIC>=0
 AND (synthetic_fees->>'revision')::BIGINT>=0) IS TRUE)
);
CREATE FUNCTION guard_local_synthetic_obligation_fee_terms() RETURNS TRIGGER AS $$
BEGIN
 IF NEW.synthetic_fees->'terms' IS DISTINCT FROM OLD.synthetic_fees->'terms' THEN RAISE EXCEPTION 'Accepted fee terms cannot be removed or replaced'; END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER local_synthetic_obligation_fee_terms_guard BEFORE UPDATE ON obligations
 FOR EACH ROW EXECUTE FUNCTION guard_local_synthetic_obligation_fee_terms();

CREATE TABLE synthetic_fee_entries (
 tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id(), id TEXT NOT NULL,
 obligation_id TEXT NOT NULL, institution_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('borrower','institution')),
 source_id TEXT NOT NULL, source_hash TEXT NOT NULL CHECK(source_hash ~ '^0x[0-9a-f]{64}$'),
 base_delta_minor NUMERIC(78,0) NOT NULL, fee_delta_minor NUMERIC(78,0) NOT NULL,
 reverses_entry_id TEXT, ledger_transaction_id TEXT, occurred_at TIMESTAMPTZ NOT NULL,
 document JSONB NOT NULL, PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,obligation_id,kind,source_id),
 FOREIGN KEY(tenant_id,obligation_id) REFERENCES obligations(tenant_id,id),
 FOREIGN KEY(tenant_id,reverses_entry_id) REFERENCES synthetic_fee_entries(tenant_id,id),
 FOREIGN KEY(tenant_id,ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id),
 CHECK ((fee_delta_minor=0 AND ledger_transaction_id IS NULL) OR (fee_delta_minor<>0 AND ledger_transaction_id IS NOT NULL)),
 CHECK ((base_delta_minor>=0 AND reverses_entry_id IS NULL) OR (base_delta_minor<0 AND reverses_entry_id IS NOT NULL)),
 CHECK ((document->>'feeEntryId'=id AND document->>'obligationId'=obligation_id
  AND document->>'kind'=kind AND document->>'sourceId'=source_id
  AND document->>'sourceHash'=source_hash
  AND (document->>'baseDeltaMinor')::NUMERIC=base_delta_minor
  AND (document->>'feeDeltaMinor')::NUMERIC=fee_delta_minor
  AND document->>'syntheticOnly'='true' AND document->>'productionFundsMoved'='false') IS TRUE)
);
CREATE INDEX synthetic_fee_entries_institution_month ON synthetic_fee_entries(tenant_id,institution_id,occurred_at,id);
CREATE TABLE synthetic_fee_statements (
 tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id(), id TEXT NOT NULL,
 institution_id TEXT NOT NULL, month TEXT NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 document JSONB NOT NULL, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,institution_id,month),
 CHECK ((document->>'statementId'=id AND document->>'institutionId'=institution_id
  AND document->>'month'=month AND document->>'closed'='true'
  AND document->>'syntheticOnly'='true' AND document->>'productionFundsMoved'='false') IS TRUE)
);
CREATE FUNCTION guard_local_synthetic_fee_fact() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'Synthetic fee facts are append-only; use linked compensating entries'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER synthetic_fee_entries_immutable BEFORE UPDATE OR DELETE ON synthetic_fee_entries
 FOR EACH ROW EXECUTE FUNCTION guard_local_synthetic_fee_fact();
CREATE TRIGGER synthetic_fee_statements_immutable BEFORE UPDATE OR DELETE ON synthetic_fee_statements
 FOR EACH ROW EXECUTE FUNCTION guard_local_synthetic_fee_fact();
ALTER TABLE synthetic_fee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_fee_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE synthetic_fee_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_fee_statements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_synthetic_fee_entries ON synthetic_fee_entries
 USING(tenant_id=current_app_tenant_id()) WITH CHECK(tenant_id=current_app_tenant_id());
CREATE POLICY tenant_isolation_synthetic_fee_statements ON synthetic_fee_statements
 USING(tenant_id=current_app_tenant_id()) WITH CHECK(tenant_id=current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_synthetic_fee_entries BEFORE INSERT OR UPDATE OR DELETE ON synthetic_fee_entries
 FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
CREATE TRIGGER tenant_context_guard_synthetic_fee_statements BEFORE INSERT OR UPDATE OR DELETE ON synthetic_fee_statements
 FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
