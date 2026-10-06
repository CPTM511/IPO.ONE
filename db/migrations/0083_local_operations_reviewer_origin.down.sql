-- Existing review Evidence must be retained; a populated rollback is intentionally blocked.
ALTER TABLE authentication_passkey_challenges DROP CONSTRAINT authentication_passkey_challenges_origin_check;
ALTER TABLE authentication_passkey_challenges ADD CONSTRAINT authentication_passkey_challenges_origin_check
  CHECK (origin IN ('http://localhost:8937','http://localhost:8947','http://localhost:8939','http://localhost:8940','http://localhost:8941'));
