DROP INDEX IF EXISTS credit_offers_tenant_subject_status_idx;
DROP INDEX IF EXISTS credit_offers_tenant_intent_created_idx;
DROP INDEX IF EXISTS credit_intents_tenant_status_created_idx;
DROP INDEX IF EXISTS credit_intents_tenant_subject_created_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_credit_offers ON credit_offers;
DROP POLICY IF EXISTS tenant_isolation_credit_offers ON credit_offers;
ALTER TABLE credit_offers DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS credit_offers_projection_guard ON credit_offers;

DROP TRIGGER IF EXISTS tenant_context_guard_credit_intents ON credit_intents;
DROP POLICY IF EXISTS tenant_isolation_credit_intents ON credit_intents;
ALTER TABLE credit_intents DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS credit_intents_projection_guard ON credit_intents;

DROP TABLE IF EXISTS credit_offers;
DROP TABLE IF EXISTS credit_intents;

DROP FUNCTION IF EXISTS guard_credit_offer_projection();
DROP FUNCTION IF EXISTS guard_credit_intent_projection();

ALTER TABLE risk_decisions
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_id_subject_asset_key;
ALTER TABLE subjects
  DROP CONSTRAINT IF EXISTS subjects_tenant_id_primary_principal_key;
