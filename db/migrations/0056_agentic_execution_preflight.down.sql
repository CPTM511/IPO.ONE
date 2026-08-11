DO $$
BEGIN
  IF to_regclass('wallet_execution_receipts') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'cannot remove wallet preflight truth while execution receipts exist';
  END IF;
END;
$$;

DROP TABLE IF EXISTS wallet_transaction_preflight_receipts;
DROP TABLE IF EXISTS wallet_simulation_reports;
DROP TABLE IF EXISTS wallet_prepared_executions;
DROP FUNCTION IF EXISTS guard_immutable_wallet_preflight_record();
