-- Financial facts and accepted terms must survive feature rollback.
DO $$ BEGIN RAISE EXCEPTION 'B4-H rollback retains schema and data; use the verified compatible OFF artifact'; END $$;
