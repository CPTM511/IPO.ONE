-- B4-H: append exact hosted synthetic contracts; retain all accepted L0 facts.
ALTER TABLE credit_offers DROP CONSTRAINT credit_offers_terms_version_check;
ALTER TABLE credit_offers ADD CONSTRAINT credit_offers_terms_version_check CHECK
  (terms_version IN ('credit_terms.v1','credit_terms.v2','credit_terms.synthetic_secured.v1','credit_terms.synthetic_fee.v1','credit_terms.synthetic_fee_hosted.v1'));
-- Keep the previous shape exactly; admit only the new synthetic v1 family.
ALTER TABLE credit_offers DROP CONSTRAINT credit_offers_v2_shape_check;
ALTER TABLE credit_offers ADD CONSTRAINT credit_offers_v2_shape_check CHECK (
 (schema_version='credit_offer.v1' AND terms_version IN ('credit_terms.v1','credit_terms.synthetic_secured.v1','credit_terms.synthetic_fee.v1','credit_terms.synthetic_fee_hosted.v1')
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
ALTER TABLE credit_offers DROP CONSTRAINT credit_offers_local_fee_shape;
ALTER TABLE credit_offers ADD CONSTRAINT credit_offers_local_fee_shape CHECK ((
 (terms_version IN ('credit_terms.synthetic_fee.v1','credit_terms.synthetic_fee_hosted.v1') AND fee_terms IS NOT NULL
  AND schema_version='credit_offer.v1' AND sandbox_only AND NOT production_funds_approved
  AND ((terms_version='credit_terms.synthetic_fee.v1' AND fee_terms->>'profile'='synthetic_usd_platform_fee.v1' AND fee_terms->>'scope'='L0_LOCAL_NO_FUNDS')
    OR (terms_version='credit_terms.synthetic_fee_hosted.v1' AND fee_terms->>'profile'='synthetic_usd_platform_fee_hosted.v1'
      AND fee_terms->>'schemaVersion'='synthetic_fee_terms.hosted.v1' AND fee_terms->>'scope'='L2_PUBLIC_AUTHENTICATED_NO_FUNDS'
      AND fee_terms->>'policyHash'='0xd84dc6bbf05319c56bc75546b1f5bac2963e724932c1994f72605ce60de2b5b8'
      AND left(fee_terms->>'institutionId',char_length('urn:ipo-one:hosted:synthetic-capital-partner:'||tenant_id||':'))='urn:ipo-one:hosted:synthetic-capital-partner:'||tenant_id||':'
      AND substring(fee_terms->>'institutionId' FROM char_length('urn:ipo-one:hosted:synthetic-capital-partner:'||tenant_id||':')+1) ~ '^[A-Za-z0-9_.-]{1,80}$'))
  AND fee_terms->>'assetId'=asset_id AND asset_id='urn:ipo-one:sandbox-asset:usd-cent'
  AND fee_terms->>'economicLoanId'=credit_intent_id
  AND fee_terms->>'principalMinor'=approved_principal_minor::text
  AND fee_terms->>'borrowerRateBps'='10' AND fee_terms->>'institutionRateBps'='1000'
  AND fee_terms->>'borrowerCapMinor'='1000' AND origination_fee_minor=0
  AND fee_terms->>'productionFundsMoved'='false' AND fee_terms->>'productionPolicyAvailable'='false')
 OR (terms_version NOT IN ('credit_terms.synthetic_fee.v1','credit_terms.synthetic_fee_hosted.v1') AND fee_terms IS NULL AND fee_collateral_terms IS NULL)
) IS TRUE);
ALTER TABLE obligations DROP CONSTRAINT obligations_local_synthetic_fee_shape;
ALTER TABLE obligations ADD CONSTRAINT obligations_local_synthetic_fee_shape CHECK (
 synthetic_fees IS NULL OR ((schema_version='obligation.v2' AND sandbox_only AND NOT production_funds_moved
 AND asset_id='urn:ipo-one:sandbox-asset:usd-cent' AND pool_obligation_binding_id IS NULL
 AND ((synthetic_fees#>>'{terms,profile}'='synthetic_usd_platform_fee.v1' AND synthetic_fees#>>'{terms,scope}'='L0_LOCAL_NO_FUNDS')
 OR (synthetic_fees#>>'{terms,profile}'='synthetic_usd_platform_fee_hosted.v1'
 AND synthetic_fees#>>'{terms,schemaVersion}'='synthetic_fee_terms.hosted.v1'
 AND synthetic_fees#>>'{terms,scope}'='L2_PUBLIC_AUTHENTICATED_NO_FUNDS'
 AND synthetic_fees#>>'{terms,policyHash}'='0xd84dc6bbf05319c56bc75546b1f5bac2963e724932c1994f72605ce60de2b5b8'
 AND left(synthetic_fees#>>'{terms,institutionId}',char_length('urn:ipo-one:hosted:synthetic-capital-partner:'||tenant_id||':'))='urn:ipo-one:hosted:synthetic-capital-partner:'||tenant_id||':'
 AND substring(synthetic_fees#>>'{terms,institutionId}' FROM char_length('urn:ipo-one:hosted:synthetic-capital-partner:'||tenant_id||':')+1) ~ '^[A-Za-z0-9_.-]{1,80}$'
 AND synthetic_fees#>>'{terms,borrowerRateBps}'='10' AND synthetic_fees#>>'{terms,institutionRateBps}'='1000'
 AND synthetic_fees#>>'{terms,borrowerCapMinor}'='1000'))
 AND synthetic_fees#>>'{terms,economicLoanId}'=credit_intent_id
 AND synthetic_fees#>>'{terms,principalMinor}'=amount_minor::text
 AND synthetic_fees#>>'{terms,productionFundsMoved}'='false'
 AND (synthetic_fees->>'borrowerAssessedMinor')::NUMERIC BETWEEN 0 AND 1000
 AND (synthetic_fees->>'fundedBaseMinor')::NUMERIC>=0
 AND (synthetic_fees->>'normalInterestBaseMinor')::NUMERIC>=0
 AND (synthetic_fees->>'revision')::BIGINT>=0) IS TRUE)
);
ALTER TABLE synthetic_fee_source_corrections DROP CONSTRAINT synthetic_fee_source_corrections_check;
ALTER TABLE synthetic_fee_source_corrections ADD CONSTRAINT synthetic_fee_source_corrections_check CHECK ((document->>'receiptId'=id AND document->>'receiptHash'=id
  AND document->>'obligationId'=obligation_id AND document->>'sourceFeeEntryId'=original_fee_entry_id
  AND document->>'kind'=kind AND (document->>'amountMinor')::NUMERIC=amount_minor
  AND document->>'approvalExecutionId'=approval_execution_id
  AND ((document->>'scope'='L0_LOCAL_NO_FUNDS' AND document->>'profile'='synthetic_usd_platform_fee.v1'
    AND document->>'sourcePolicyHash'='0xc0d300f7395703cb64ba198d4d6d97d02e3aaaf33c4f10cd59559b8224b4939d')
   OR (document->>'scope'='L2_PUBLIC_AUTHENTICATED_NO_FUNDS' AND document->>'profile'='synthetic_usd_platform_fee_hosted.v1'
    AND document->>'sourcePolicyHash'='0x7f123be43dc8022cf91440dc22d558df3f161d583b3cc0ab48203dbc973a2eeb'))
  AND document->>'syntheticOnly'='true' AND document->>'productionFundsMoved'='false'
  AND document->>'refundStatus'='credit_due_only'
  AND document->'chainTransactionHash'='null'::jsonb) IS TRUE);
ALTER TABLE credit_outcomes DROP CONSTRAINT credit_outcomes_local_synthetic_fee_credit_context;
ALTER TABLE credit_outcomes ADD CONSTRAINT credit_outcomes_local_synthetic_fee_credit_context CHECK (
 synthetic_fee_credit_context IS NULL OR ((
  synthetic_fee_credit_context->>'schemaVersion'='synthetic_fee_credit_context.v1'
  AND synthetic_fee_credit_context->>'scope' IN ('L0_LOCAL_NO_FUNDS','L2_PUBLIC_AUTHENTICATED_NO_FUNDS')
  AND synthetic_fee_credit_context->>'syntheticOnly'='true'
  AND synthetic_fee_credit_context->>'productionFundsMoved'='false'
  AND synthetic_fee_credit_context->>'feeStateHash' ~ '^0x[0-9a-f]{64}$'
  AND (synthetic_fee_credit_context->>'effectivePrincipalMinor')::NUMERIC>=0
  AND (synthetic_fee_credit_context->>'netRepaidMinor')::NUMERIC>=0
  AND (synthetic_fee_credit_context->>'netLossMinor')::NUMERIC>=0
 ) IS TRUE)
);
-- Reuse only already-governed, non-inheriting Gateway DB roles. No new role.
DO $$ DECLARE runtime_role RECORD; BEGIN
 FOR runtime_role IN SELECT DISTINCT g.grantee FROM information_schema.role_table_grants g
 JOIN pg_roles r ON r.rolname=g.grantee
 WHERE g.table_schema='public' AND g.table_name='obligations' AND g.privilege_type='INSERT'
 AND g.grantee<>current_user AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
 LOOP
  EXECUTE format('GRANT SELECT, INSERT ON synthetic_fee_entries, synthetic_fee_statements, synthetic_fee_source_corrections TO %I',runtime_role.grantee);
 END LOOP;
END $$;
