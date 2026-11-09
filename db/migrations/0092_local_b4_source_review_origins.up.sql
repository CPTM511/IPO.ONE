-- Only the already-approved L0 B4 review/test databases admit these exact origins.
-- Existing origins retain their existing rules; no production identity is created.
ALTER TABLE authentication_passkey_challenges DROP CONSTRAINT authentication_passkey_challenges_origin_check;
ALTER TABLE authentication_passkey_challenges ADD CONSTRAINT authentication_passkey_challenges_origin_check CHECK (
 origin IN ('http://localhost:8937','http://localhost:8947','http://localhost:8939','http://localhost:8940','http://localhost:8941','http://localhost:8942','http://localhost:8957')
 OR (current_database()='ipo_one_b4_fee_review' AND origin IN ('http://localhost:8967','http://localhost:8968','http://localhost:8969','http://localhost:8970'))
 OR (current_database()='b4_fee_browser_test_20261109' AND origin IN ('http://localhost:8981','http://localhost:8982','http://localhost:8983','http://localhost:8984'))
);
