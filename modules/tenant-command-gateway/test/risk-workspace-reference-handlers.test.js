import assert from "node:assert/strict";
import test from "node:test";
import {
  readServicingQueueReferenceQueryHandler,
  readTenantRiskPortfolioReferenceQueryHandler
} from "../src/index.js";

function clientWith(rows, calls = [], rowCount) {
  const resolvedRowCount = arguments.length >= 3
    ? rowCount
    : (Array.isArray(rows) ? rows.length : 0);
  return {
    async query(text, values) {
      calls.push({ text, values });
      return { rows, rowCount: resolvedRowCount };
    }
  };
}

for (const scenario of [
  {
    label: "Tenant risk portfolio",
    handler: readTenantRiskPortfolioReferenceQueryHandler,
    resourceType: "risk_portfolio",
    resourceId: "risk_portfolio_test",
    schemaVersion: "tenant_risk_portfolio_reference_view.v1"
  },
  {
    label: "Servicing queue",
    handler: readServicingQueueReferenceQueryHandler,
    resourceType: "servicing_queue",
    resourceId: "servicing_queue_test",
    schemaVersion: "tenant_servicing_queue_reference_view.v1"
  }
]) {
  test(`${scenario.label} reference returns one exact active Tenant locator`, async () => {
    const calls = [];
    const response = await scenario.handler().execute({
      client: clientWith([{
        resource_type: scenario.resourceType,
        resource_id: scenario.resourceId
      }], calls),
      payload: {}
    });
    assert.deepEqual(response, {
      resource: {
        resourceType: scenario.resourceType,
        resourceId: scenario.resourceId
      },
      serverTruth: true,
      readOnly: true,
      schemaVersion: scenario.schemaVersion
    });
    assert.deepEqual(calls[0].values, [scenario.resourceType]);
    assert.match(calls[0].text, /FROM authorization_resources/);
    assert.match(calls[0].text, /tenant_id = current_app_tenant_id\(\)/);
    assert.match(calls[0].text, /resource_type = \$1/);
    assert.match(calls[0].text, /status = 'active'/);
    assert.match(calls[0].text, /ORDER BY resource_id ASC/);
    assert.match(calls[0].text, /LIMIT 2/);
    assert.doesNotMatch(calls[0].text, /authorization_resource_bindings/);
  });

  test(`${scenario.label} reference returns a closed empty state`, async () => {
    assert.deepEqual(await scenario.handler().execute({
      client: clientWith([]),
      payload: {}
    }), {
      resource: null,
      serverTruth: true,
      readOnly: true,
      schemaVersion: scenario.schemaVersion
    });
  });

  test(`${scenario.label} reference fails closed on ambiguous or malformed durable truth`, async () => {
    for (const rows of [
      [
        { resource_type: scenario.resourceType, resource_id: `${scenario.resourceId}_1` },
        { resource_type: scenario.resourceType, resource_id: `${scenario.resourceId}_2` }
      ],
      [{ resource_type: "subject", resource_id: scenario.resourceId }],
      [{ resource_type: scenario.resourceType, resource_id: "invalid id" }],
      [{
        resource_type: scenario.resourceType,
        resource_id: scenario.resourceId,
        tenant_id: "must_not_cross_boundary"
      }],
      null
    ]) {
      await assert.rejects(
        scenario.handler().execute({ client: clientWith(rows), payload: {} }),
        (error) => error.code === "workspace_recovery_unavailable" &&
          !error.message.includes(scenario.resourceId)
      );
    }
  });

  test(`${scenario.label} reference fails closed when database rowCount is inconsistent`, async () => {
    const validRow = [{
      resource_type: scenario.resourceType,
      resource_id: scenario.resourceId
    }];
    for (const rowCount of [0, 2, -1, 1.5, "1", undefined]) {
      await assert.rejects(
        scenario.handler().execute({
          client: clientWith(validRow, [], rowCount),
          payload: {}
        }),
        (error) => error.code === "workspace_recovery_unavailable"
      );
    }
  });

  test(`${scenario.label} reference accepts only exact plain database row keys`, async () => {
    const accessorRow = {
      resource_type: scenario.resourceType,
      get resource_id() {
        throw new Error("accessor must not execute");
      }
    };
    const inheritedRow = Object.create({ tenant_id: "must_not_cross_boundary" });
    inheritedRow.resource_type = scenario.resourceType;
    inheritedRow.resource_id = scenario.resourceId;
    for (const row of [accessorRow, inheritedRow]) {
      await assert.rejects(
        scenario.handler().execute({ client: clientWith([row]), payload: {} }),
        (error) => error.code === "workspace_recovery_unavailable"
      );
    }
  });

  test(`${scenario.label} reference rejects caller-supplied scope`, async () => {
    for (const payload of [
      { tenantId: "tenant_other" },
      { resourceId: scenario.resourceId },
      [],
      Object.create(null)
    ]) {
      await assert.rejects(
        scenario.handler().execute({ client: clientWith([]), payload }),
        (error) => error.code === "invalid_tenant_command_payload"
      );
    }
  });
}
