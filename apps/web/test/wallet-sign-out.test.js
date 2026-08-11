import assert from "node:assert/strict";
import test from "node:test";
import { releaseSelectedWallet } from "../src/wallet-sign-out.js";

function assertClosed(result, status) {
  assert.deepEqual(result, {
    schemaVersion: "wallet_release_result.v1",
    status,
    accountDataRetained: false,
    credentialsIncluded: false,
    fundsAuthority: false
  });
  assert.equal(Object.isFrozen(result), true);
}

test("WalletConnect sign-out disconnects its memory-only Provider", async () => {
  let disconnected = 0;
  const result = await releaseSelectedWallet({
    connector: {
      async disconnect(input) {
        disconnected += 1;
        assert.deepEqual(input, { revokePermissions: false });
        return { status: "wallet_disconnected" };
      }
    },
    source: "mobile_walletconnect"
  });
  assert.equal(disconnected, 1);
  assertClosed(result, "wallet_disconnected");
});

test("injected wallet sign-out requests exact account permission revocation", async () => {
  const requests = [];
  const result = await releaseSelectedWallet({
    connector: {
      async disconnect(input) {
        requests.push(structuredClone(input));
        return { status: "account_permission_revoked" };
      }
    },
    source: "eip6963"
  });
  assert.deepEqual(requests, [{
    revokePermissions: true
  }]);
  assertClosed(result, "account_permission_revoked");
});

test("unsupported or absent wallet still clears IPO.ONE account state", async () => {
  assertClosed(
    await releaseSelectedWallet({
      connector: {
        async disconnect() {
          return { status: "app_state_cleared" };
        }
      },
      source: "legacy_eip1193"
    }),
    "app_state_cleared"
  );
  assertClosed(await releaseSelectedWallet(), "no_wallet_selected");
});
