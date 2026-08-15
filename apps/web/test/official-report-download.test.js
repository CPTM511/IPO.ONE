import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  decodeOfficialReportBase64,
  verifyOfficialReportRetrieval
} from "../src/official-report-download.js";

function retrieval(content = "{\"safe\":true}\n") {
  const contentBase64 = Buffer.from(content, "utf8").toString("base64");
  return {
    report: {
      officialReportId: "official_report_test",
      schemaVersion: "official_report_artifact.v1",
      effectiveStatus: "active",
      browserAuthored: false,
      authorizationRevalidationRequired: true,
      objectAccessExpires: true,
      signedUrlIssued: false,
      piiIncluded: false,
      secretsIncluded: false,
      rawTransactionDataIncluded: false,
      productionAuthority: false,
      sandboxOnly: true,
      contentType: "application/json",
      fileName: "ipo-one-obligation-activity-official_report_test.json",
      contentSha256: `sha256:${createHash("sha256").update(content).digest("hex")}`
    },
    contentBase64,
    integrityVerified: true
  };
}

test("retrieval verifies exact server bytes before browser transport", async () => {
  const verified = await verifyOfficialReportRetrieval(retrieval());
  assert.equal(new TextDecoder().decode(verified.bytes), "{\"safe\":true}\n");
  assert.equal(verified.fileName.endsWith(".json"), true);
});

test("retrieval rejects malformed base64, HTML and SHA drift", async () => {
  assert.throws(() => decodeOfficialReportBase64("not base64"));
  const html = retrieval("<script>alert(1)</script>");
  html.report.contentType = "text/html";
  html.report.fileName = "report.html";
  await assert.rejects(() => verifyOfficialReportRetrieval(html), /metadata/);
  const drifted = retrieval();
  drifted.contentBase64 = Buffer.from("drifted", "utf8").toString("base64");
  await assert.rejects(() => verifyOfficialReportRetrieval(drifted), /sha256/);
});
