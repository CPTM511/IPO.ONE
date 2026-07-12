import pg from "pg";
import { DomainError } from "../../../packages/domain/src/index.js";

const { Pool } = pg;

export function createPostgresPool({
  connectionString = process.env.DATABASE_URL,
  max = 10,
  idleTimeoutMillis = 30_000,
  connectionTimeoutMillis = 5_000,
  applicationName = "ipo-one"
} = {}) {
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    throw new DomainError("database_url_required", "DATABASE_URL is required for PostgreSQL mode");
  }
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new DomainError("invalid_pool_size", "PostgreSQL pool max must be a positive safe integer");
  }
  return new Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    application_name: applicationName
  });
}
