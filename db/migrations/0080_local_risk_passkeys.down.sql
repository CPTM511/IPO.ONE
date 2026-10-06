-- Preserve audit history: populated authentication state requires operator export/review.
ALTER TABLE authentication_passkeys NO FORCE ROW LEVEL SECURITY;
ALTER TABLE authentication_passkey_challenges NO FORCE ROW LEVEL SECURITY;
ALTER TABLE authentication_passkey_evidence NO FORCE ROW LEVEL SECURITY;
ALTER TABLE authentication_passkey_audit NO FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM authentication_passkeys) OR EXISTS (SELECT 1 FROM authentication_passkey_challenges)
     OR EXISTS (SELECT 1 FROM authentication_passkey_evidence) OR EXISTS (SELECT 1 FROM authentication_passkey_audit) THEN
    RAISE EXCEPTION 'Passkey rollback requires preserving populated authentication evidence';
  END IF;
END $$;
DROP TABLE IF EXISTS authentication_passkey_audit;
DROP TABLE IF EXISTS authentication_passkey_evidence;
DROP TABLE IF EXISTS authentication_passkey_challenges;
DROP TABLE IF EXISTS authentication_passkeys;
DROP FUNCTION IF EXISTS guard_authentication_passkey_projection();
