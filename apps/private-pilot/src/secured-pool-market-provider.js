import {
  createTenantSecurityContextFromAuthentication,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import {
  readSecuredPoolMarketSnapshot
} from "../../../modules/tenant-command-gateway/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export function createPostgresSecuredPoolMarketProvider({
  pool,
  deploymentProfile,
  readAdapter,
  clock = () => new Date()
}) {
  if (!pool?.connect || typeof clock !== "function") {
    throw new DomainError(
      "invalid_secured_pool_market_provider",
      "Secured Pool market provider configuration is invalid"
    );
  }
  return async function securedPoolMarketProvider({ authenticationContext }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(
        client,
        createTenantSecurityContextFromAuthentication(authenticationContext)
      );
      const snapshot = await readSecuredPoolMarketSnapshot({
        client,
        deploymentProfile,
        readAdapter,
        now: clock()
      });
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
