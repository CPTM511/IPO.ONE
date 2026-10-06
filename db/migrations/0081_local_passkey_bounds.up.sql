-- PostgreSQL ARE repetition bounds stop at 255; byte-encoded WebAuthn keys can be longer.
ALTER TABLE authentication_passkeys DROP CONSTRAINT authentication_passkeys_credential_key_check;
ALTER TABLE authentication_passkeys ADD CONSTRAINT authentication_passkeys_credential_key_check
  CHECK (char_length(credential_key) BETWEEN 16 AND 1400 AND credential_key ~ '^[A-Za-z0-9_-]+$');
ALTER TABLE authentication_passkeys DROP CONSTRAINT authentication_passkeys_public_key_check;
ALTER TABLE authentication_passkeys ADD CONSTRAINT authentication_passkeys_public_key_check
  CHECK (char_length(public_key) BETWEEN 22 AND 5462 AND public_key ~ '^[A-Za-z0-9_-]+$');
