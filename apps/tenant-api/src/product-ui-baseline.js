import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { DomainError } from "../../../packages/domain/src/index.js";

export const PRODUCT_UI_BASELINE = "precision-terminal-v1";

// A legacy checkout or incomplete asset bundle must fail before serving UI.
export function assertProductUiBaseline(assetRoot, { releaseId, artifactManifestPath } = {}) {
  const required = {
    "index.html": ['data-product-ui="precision-terminal-v1"', 'id="ipoWorkspaceStyles"', 'href="/workspace-experience.css"'],
    "app.js": ['from "./workspace-experience.js"'],
    "workspace-experience.js": ['arrangeWorkspaceNavigation', 'renderPrecisionAuthority'],
    "workspace-experience.css": ['--b-accent: #7bd9c8', '--b-accent: #166a58', '--brand: var(--b-accent)'],
    "web-theme.js": ['ipoWorkspaceStyles', 'stylesheetFailed', 'applyStartupFailure']
  };
  if (releaseId !== undefined || artifactManifestPath !== undefined) {
    let manifest;
    try { manifest = JSON.parse(readFileSync(artifactManifestPath, "utf8")); } catch { manifest = null; }
    if (
      !/^[0-9a-f]{40}$/.test(releaseId ?? "") ||
      manifest?.sourceCommit !== releaseId ||
      manifest?.productUiBaseline !== PRODUCT_UI_BASELINE ||
      !Array.isArray(manifest?.artifacts)
    ) {
      throw new DomainError("product_ui_baseline_mismatch", "The compiled product UI requires its exact release artifact manifest.");
    }
    // The build validates source markers before compiling app.js. Runtime checks
    // the resulting bytes, since bundling removes source import declarations.
    for (const file of Object.keys(required)) {
      const entries = manifest.artifacts.filter(entry => entry.path === `apps/web/src/${file}`);
      let digest;
      try { digest = createHash("sha256").update(readFileSync(join(assetRoot, file))).digest("hex"); } catch { digest = null; }
      if (entries.length !== 1 || !/^[0-9a-f]{64}$/.test(entries[0]?.sha256 ?? "") || entries[0].sha256 !== digest) {
        throw new DomainError("product_ui_baseline_mismatch", `Compiled product UI does not match its reviewed release: ${file}.`);
      }
    }
    return PRODUCT_UI_BASELINE;
  }
  for (const [file, markers] of Object.entries(required)) {
    let source;
    try { source = readFileSync(join(assetRoot, file), "utf8"); } catch { source = ""; }
    if (markers.some(marker => !source.includes(marker))) {
      throw new DomainError("product_ui_baseline_mismatch", `Current Precision Terminal UI is missing or incomplete: ${file}. Use the current product baseline; do not serve a legacy UI.`);
    }
  }
  return PRODUCT_UI_BASELINE;
}
