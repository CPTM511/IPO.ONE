-- Approval facts and active governed recovery must survive a feature rollback.
DO $$ BEGIN RAISE EXCEPTION 'B4-H rollback retains approval privileges and facts; freeze the affected profile in the compatible OFF artifact'; END $$;
