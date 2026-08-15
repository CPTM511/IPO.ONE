import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  V9_DESTINATION_OPERATION_MAP,
  createArchitectureCapabilityPresentation,
  createV9DestinationCapabilityMatrix,
  createWalletPermissionPresentation
} from "../src/v9-trust-surfaces.js";

const catalog = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/ipo-one.tenant-protocol.v1.json", import.meta.url),
  "utf8"
));

test("all thirteen V9 destinations map to checked-in runtime truth", () => {
  assert.equal(Object.keys(V9_DESTINATION_OPERATION_MAP).length, 13);
  const matrix = createV9DestinationCapabilityMatrix(catalog);
  assert.equal(matrix.length, 13);
  assert.equal(matrix.every(({ catalogBacked }) => catalogBacked), true);
  const architecture = createArchitectureCapabilityPresentation(catalog);
  assert.equal(architecture.operationCount, catalog.operations.length);
  assert.equal(architecture.protocolVersion, catalog.protocolVersion);
  assert.deepEqual(architecture.transports, catalog.availability.enabledTransports);
  assert.deepEqual(architecture.safety, {
    realFundsEnabled: false,
    productionCreditEnabled: false,
    rawPiiAllowed: false
  });
});

test("wallet permission matrix exposes session truth and keeps funds powers closed", () => {
  const presentation = createWalletPermissionPresentation({
    accessChecked: true,
    sessionActive: true,
    tenantConnected: true,
    walletAddress: "0x8c2cbe747578c03c385dfd4d2e45774e5541217e",
    connectedChainId: 84532,
    selectedProviderName: "Founder wallet",
    authorityState: "available",
    catalog
  });
  assert.equal(presentation.walletAuthenticationActive, true);
  assert.equal(presentation.consentOperationsAvailable, true);
  assert.equal(presentation.mandateOperationsAvailable, true);
  assert.equal(
    presentation.powers
      .filter(([name]) => !["Authentication session", "Wallet account proof"].includes(name))
      .every(([, , enabled]) => enabled === false),
    true
  );
  const quarantined = createWalletPermissionPresentation({
    accessChecked: true,
    sessionActive: true,
    tenantConnected: true,
    walletAddress: "0x8c2cbe747578c03c385dfd4d2e45774e5541217e",
    connectedChainId: 84532,
    selectedProviderName: "Founder wallet",
    authorityState: "quarantined",
    catalog
  });
  assert.equal(quarantined.walletAuthenticationActive, false);
  assert.equal(quarantined.walletAddress, null);
});
