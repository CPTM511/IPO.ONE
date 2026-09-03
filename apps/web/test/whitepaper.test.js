import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const digest = (value) => createHash("sha256").update(value).digest("hex");

test("Founding Edition III is source-bound, interactive and status-disciplined", async () => {
  const [source, html, css, javascript, pdf, manifestBytes] = await Promise.all([
    readFile(new URL("../../../docs/WHITEPAPER.md", import.meta.url)),
    readFile(new URL("../src/whitepaper.html", import.meta.url)),
    readFile(new URL("../src/whitepaper.css", import.meta.url), "utf8"),
    readFile(new URL("../src/whitepaper.js", import.meta.url), "utf8"),
    readFile(new URL("../src/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_III.pdf", import.meta.url)),
    readFile(new URL("../src/whitepaper/manifest.json", import.meta.url), "utf8")
  ]);
  const page = html.toString();
  const text = source.toString();
  const manifest = JSON.parse(manifestBytes);

  assert.equal(manifest.sourceSha256, digest(source));
  assert.equal(manifest.htmlSha256, digest(html));
  assert.equal(manifest.pdfSha256, digest(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/D:20260903000000\+00'00'/g) ?? []).length, 2);
  assert.ok(manifest.pageCount > 0);

  assert.equal((page.match(/class="protocol-diagram"/g) ?? []).length, 7);
  assert.equal((page.match(/data-diagram-node=/g) ?? []).length > 35, true);
  assert.equal((page.match(/class="diagram-relationships"/g) ?? []).length, 7);
  assert.equal((page.match(/class="reading-lanes"/g) ?? []).length, 1);
  assert.equal((page.match(/class="back-to-top"/g) ?? []).length, 1);
  assert.match(page, /<meta name="description" content="IPO\.ONE turns verified Agent performance/);
  assert.match(page, /<meta name="ipo-one:source-sha256" content="[a-f0-9]{64}"/);
  assert.equal(/Founding Edition II(?!I)/.test(`${text}\n${page}`), false);
  assert.equal(/August 2026/.test(`${text}\n${page}`), false);

  for (const claim of [
    "Turn verified Agent performance into capital.",
    "Credit can be portable. Underwriting remains contextual.",
    "Broad protocol ceiling. Narrow commercial execution.",
    "one kernel, many Facility profiles, one evolving Credit State",
    "Domain Performance Evidence",
    "they are not production real-value finance"
  ]) assert.ok(text.includes(claim), `${claim} canonical thesis missing`);

  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes(".diagram-node.is-related"));
  assert.ok(javascript.includes("activateDiagramNode"));
  assert.ok(javascript.includes("aria-pressed"));
  assert.ok(javascript.includes("updateBackToTop"));
});
