import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  createHypercoreAccountBinding,
  createPostgresVenueExecutionApplication
} from "../src/index.js";

const NOW = new Date("2026-08-08T09:00:00.000Z");

function h(scope) {
  return hashId("hypercore_002b_application_test", { scope });
}

function binding() {
  return createHypercoreAccountBinding({
    facilityId: "trading_facility_hypercore_002b",
    facilityHash: h("facility"),
    accountRole: "subaccount",
    masterAccountAddress: "0x1111111111111111111111111111111111111111",
    subaccountAddress: "0x2222222222222222222222222222222222222222",
    bindingProofHash: h("binding_proof"),
    bindingVersion: 1
  });
}

function harness(value = binding()) {
  const queries = [];
  return {
    queries,
    client: {
      async query(statement) {
        queries.push(statement);
        return { rowCount: 0, rows: [] };
      }
    },
    coreRepository: {
      async commitCommandInTransaction() {
        throw new Error("Gateway owns command commit");
      },
      async getProjectionStateInTransaction(_client, type, id) {
        if (
          type === CoreProjectionType.HYPERCORE_ACCOUNT_BINDING &&
          id === value.accountBindingId
        ) {
          return { value, aggregateVersion: 1 };
        }
        return undefined;
      }
    },
    directory: {
      async listActiveResourceBindings() {
        return [{
          actorId: "actor_hypercore_002b_controller",
          actorType: "human",
          relationship: "controller",
          version: 1
        }];
      }
    }
  };
}

test("PostgreSQL Venue application exposes only local hash-only capabilities", async () => {
  const application = createPostgresVenueExecutionApplication();
  const result = await application.discoverCapabilities({ now: NOW });
  assert.equal(result.count, 1);
  assert.equal(result.items[0].externalCallsEnabled, false);
  assert.equal(result.items[0].approveAgentEnabled, false);
  assert.equal(result.items[0].officialSigningEnabled, false);
  assert.equal(result.items[0].exchangeSubmissionEnabled, false);
  assert.equal(result.transactionsAllowed, false);
  assert.equal(result.fundsAuthority, false);
});

test("binding read and delegate preparation share one durable Gateway plan", async () => {
  const application = createPostgresVenueExecutionApplication();
  const accountBinding = binding();
  const dependencies = harness(accountBinding);
  assert.deepEqual(
    await application.readBinding({
      ...dependencies,
      resourceId: accountBinding.accountBindingId
    }),
    {
      bindingId: accountBinding.accountBindingId,
      status: "verified",
      transactionsAllowed: false,
      sandboxOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "tenant_venue_binding_view.v1"
    }
  );
  const result = await application.prepareDelegate({
    ...dependencies,
    resourceId: accountBinding.accountBindingId,
    payload: {
      delegateAddressHash: h("delegate_address"),
      signerReferenceHash: h("signer_reference"),
      requestedExpiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    },
    now: NOW
  });
  assert.equal(result.aggregateType, "hypercore_delegate");
  assert.equal(result.events.length, 1);
  assert.equal(result.writes.length, 1);
  assert.equal(
    result.writes[0].type,
    CoreProjectionType.HYPERCORE_API_WALLET_DELEGATE
  );
  assert.equal(result.response.status, "prepared");
  assert.equal(result.response.activationAllowed, false);
  assert.equal(result.response.transactionsAllowed, false);
  assert.equal(result.response.fundsAuthority, false);
  assert.equal(result.authorizationResource.resourceType, "venue_delegate");
  assert.deepEqual(result.authorizationResource.actorBindings, [{
    actorId: "actor_hypercore_002b_controller",
    actorType: "human",
    relationship: "controller"
  }]);
  assert.equal(
    dependencies.queries.some((statement) =>
      statement.includes("hypercore_delegate_address")
    ),
    true
  );
});

test("unavailable binding and execution surfaces fail closed", async () => {
  const application = createPostgresVenueExecutionApplication();
  const dependencies = harness();
  await assert.rejects(
    application.readBinding({
      ...dependencies,
      resourceId: "hypercore_account_binding_unknown"
    }),
    { code: "venue_resource_unavailable" }
  );
  await assert.rejects(application.prepareExecution({}), {
    code: "venue_execution_preparation_not_composed_l0_local_no_funds"
  });
  await assert.rejects(application.readExecution({}), {
    code: "venue_execution_unavailable_l0_local_no_funds"
  });
});
