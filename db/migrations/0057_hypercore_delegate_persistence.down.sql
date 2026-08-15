DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hypercore_account_bindings)
     OR EXISTS (SELECT 1 FROM hypercore_api_wallet_delegates)
     OR EXISTS (SELECT 1 FROM hypercore_delegate_tombstones) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'preserve HyperCore delegate and tombstone Evidence before rollback';
  END IF;
END;
$$;

DROP TABLE IF EXISTS hypercore_delegate_tombstones;
DROP TABLE IF EXISTS hypercore_api_wallet_delegates;
DROP TABLE IF EXISTS hypercore_account_bindings;

DROP FUNCTION IF EXISTS assert_hypercore_tombstone_matches_delegate();
DROP FUNCTION IF EXISTS assert_hypercore_terminal_delegate_has_tombstone();
DROP FUNCTION IF EXISTS guard_immutable_hypercore_delegate_tombstone();
DROP FUNCTION IF EXISTS guard_hypercore_delegate_lifecycle();
DROP FUNCTION IF EXISTS guard_immutable_hypercore_account_binding();
