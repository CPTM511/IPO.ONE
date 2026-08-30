import { ApiBoundaryError } from "../../../packages/api-contract/src/index.js";
import {
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import { abuseHash } from "../../../modules/abuse-control/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const WINDOW_MS = 10 * 60_000;
const AUTHENTICATION_LIMITS = Object.freeze({
  "GET /auth/v1/options": 120,
  "HEAD /auth/v1/options": 120,
  "GET /auth/v1/login": 10,
  "GET /auth/v1/callback": 10,
  "POST /auth/v1/wallet/challenge": 10,
  "POST /auth/v1/wallet/verify": 10,
  "POST /auth/v1/wallet/invalidate": 30,
  "POST /auth/v1/logout": 30
});

function invalidConfiguration() {
  return new DomainError(
    "invalid_public_beta_authentication_limiter",
    "Public Beta authentication limiter configuration is invalid"
  );
}

export function createPublicBetaAuthenticationLimiter({
  pool,
  tenantId,
  systemActorId,
  policyVersion,
  createNetworkContext
}) {
  if (
    !pool?.connect ||
    typeof tenantId !== "string" ||
    typeof systemActorId !== "string" ||
    typeof policyVersion !== "string" ||
    typeof createNetworkContext !== "function"
  ) throw invalidConfiguration();

  const repository = new PostgresEventRepository({
    pool,
    tenantContext: createTenantSecurityContext({
      tenantId,
      actorId: systemActorId,
      policyVersion,
      source: "system_worker"
    }),
    sourceSystem: "ipo.one.public-beta-authentication"
  });

  return Object.freeze({
    async admit({ request, url }) {
      const key = `${request?.method ?? ""} ${url?.pathname ?? ""}`;
      const limit = AUTHENTICATION_LIMITS[key];
      if (limit === undefined) return;
      let network;
      try {
        network = await createNetworkContext({ request });
      } catch {
        throw new ApiBoundaryError(
          "request_admission_unavailable",
          "Authentication request admission is temporarily unavailable",
          { status: 503, headers: { "retry-after": "5" } }
        );
      }
      const bucketKey = abuseHash("public_beta_authentication_rate", {
        route: key,
        networkRefHash: network.referenceHash
      });
      let admitted = false;
      try {
        admitted = await repository.withTenantWrite(async (client) => {
          await client.query(
            "SELECT set_config('statement_timeout', '2000ms', true)"
          );
          const current = await client.query("SELECT clock_timestamp() AS now");
          const now = new Date(current.rows[0]?.now);
          if (!Number.isFinite(now.getTime())) throw invalidConfiguration();
          const windowStartedAt = new Date(
            Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS
          );
          const expiresAt = new Date(windowStartedAt.getTime() + WINDOW_MS);
          const result = await client.query(
            `INSERT INTO abuse_rate_buckets(
               tenant_id, key_hash, dimension, quota_class, window_started_at,
               window_ms, used_count, limit_count, expires_at, updated_at,
               version, schema_version
             ) VALUES (
               $1, $2, 'network', 'credential', $3, $4, 1, $5, $6, $7,
               1, 'abuse_rate_bucket.v1'
             )
             ON CONFLICT (tenant_id, key_hash) DO UPDATE SET
               window_started_at = EXCLUDED.window_started_at,
               window_ms = EXCLUDED.window_ms,
               used_count = CASE
                 WHEN abuse_rate_buckets.window_started_at = EXCLUDED.window_started_at
                   THEN abuse_rate_buckets.used_count + 1
                 ELSE 1
               END,
               limit_count = EXCLUDED.limit_count,
               expires_at = EXCLUDED.expires_at,
               updated_at = EXCLUDED.updated_at,
               version = abuse_rate_buckets.version + 1
             WHERE abuse_rate_buckets.dimension = 'network'
               AND abuse_rate_buckets.quota_class = 'credential'
               AND (
                 CASE
                   WHEN abuse_rate_buckets.window_started_at = EXCLUDED.window_started_at
                     THEN abuse_rate_buckets.used_count + 1
                   ELSE 1
                 END
               ) <= EXCLUDED.limit_count
             RETURNING used_count`,
            [tenantId, bucketKey, windowStartedAt, WINDOW_MS, limit, expiresAt, now]
          );
          return result.rowCount === 1;
        });
      } catch (error) {
        if (error instanceof ApiBoundaryError) throw error;
        throw new ApiBoundaryError(
          "request_admission_unavailable",
          "Authentication request admission is temporarily unavailable",
          { status: 503, headers: { "retry-after": "5" } }
        );
      }
      if (!admitted) {
        throw new ApiBoundaryError(
          "request_budget_exceeded",
          "Authentication request budget is exhausted",
          { status: 429, headers: { "retry-after": "600" } }
        );
      }
    }
  });
}

export const PUBLIC_BETA_AUTHENTICATION_LIMITS = AUTHENTICATION_LIMITS;
