DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM authentication_passkey_challenges WHERE origin IN (
  'http://localhost:8967','http://localhost:8968','http://localhost:8969','http://localhost:8970',
  'http://localhost:8981','http://localhost:8982','http://localhost:8983','http://localhost:8984')) THEN
  RAISE EXCEPTION 'Retain B4 WebAuthn evidence; use compatible disabled runtime instead';
 END IF;
END $$;
ALTER TABLE authentication_passkey_challenges DROP CONSTRAINT authentication_passkey_challenges_origin_check;
ALTER TABLE authentication_passkey_challenges ADD CONSTRAINT authentication_passkey_challenges_origin_check CHECK (
 origin IN ('http://localhost:8937','http://localhost:8947','http://localhost:8939','http://localhost:8940','http://localhost:8941','http://localhost:8942','http://localhost:8957')
);
