-- Native evidence, challenges and revocations are durable security history.
DO $$ BEGIN RAISE EXCEPTION 'B4-H rollback retains MFA schema and evidence; use the verified compatible OFF artifact'; END $$;
