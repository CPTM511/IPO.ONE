-- Restore 0080 only when empty, as its historic regex is unsuitable for persisted keys.
ALTER TABLE authentication_passkeys NO FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM authentication_passkeys) THEN
    RAISE EXCEPTION 'Passkey bounds rollback is unsafe with registered keys';
  END IF;
END $$;
ALTER TABLE authentication_passkeys FORCE ROW LEVEL SECURITY;
ALTER TABLE authentication_passkeys DROP CONSTRAINT authentication_passkeys_credential_key_check;
ALTER TABLE authentication_passkeys ADD CONSTRAINT authentication_passkeys_credential_key_check
  CHECK (credential_key ~ '^[A-Za-z0-9_-]{16,1400}$');
ALTER TABLE authentication_passkeys DROP CONSTRAINT authentication_passkeys_public_key_check;
ALTER TABLE authentication_passkeys ADD CONSTRAINT authentication_passkeys_public_key_check
  CHECK (public_key ~ '^[A-Za-z0-9_-]{22,5462}$');
