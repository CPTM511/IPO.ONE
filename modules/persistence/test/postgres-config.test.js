import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresPool } from "../src/index.js";

test("PostgreSQL mode requires explicit credentials and bounded pool size", async () => {
  assert.throws(() => createPostgresPool({ connectionString: "" }), /database_url_required/);
  assert.throws(
    () => createPostgresPool({ connectionString: "postgresql://localhost/ipo_one_test", max: 0 }),
    /invalid_pool_size/
  );

  const pool = createPostgresPool({
    connectionString: "postgresql://localhost/ipo_one_test",
    max: 2,
    applicationName: "ipo-one-unit-test"
  });
  assert.equal(pool.options.max, 2);
  assert.equal(pool.options.application_name, "ipo-one-unit-test");
  await pool.end();
});
