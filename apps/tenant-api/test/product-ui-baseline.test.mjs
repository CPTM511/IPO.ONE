import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, cp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { assertProductUiBaseline } from "../src/product-ui-baseline.js";
const source = fileURLToPath(new URL("../../web/src/", import.meta.url));

test("legacy or incomplete product assets cannot start a review runtime", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ipo-ui-baseline-"));
  try {
    await cp(source, temp, { recursive: true });
    assert.equal(assertProductUiBaseline(temp), "precision-terminal-v1");
    const index = await readFile(join(temp,"index.html"),"utf8");
    await writeFile(join(temp,"index.html"),index.replace('href="/workspace-experience.css"','href="/styles.css"'));
    assert.throws(() => assertProductUiBaseline(temp), error => error.code === "product_ui_baseline_mismatch");
    await writeFile(join(temp,"index.html"),index);
    await rm(join(temp,"workspace-experience.css"));
    assert.throws(() => assertProductUiBaseline(temp), error => error.code === "product_ui_baseline_mismatch");
    await writeFile(join(temp,"workspace-experience.css"),"body { --brand: purple; }");
    assert.throws(() => assertProductUiBaseline(temp), error => error.code === "product_ui_baseline_mismatch");
    const moduleUrl = new URL("../src/tenant-web-assets.js", import.meta.url).href;
    const result = execFileSync(process.execPath,["--input-type=module","-e",`const {createTenantWebAssetHandler}=await import(${JSON.stringify(moduleUrl)});createTenantWebAssetHandler();console.log('source-bound');`],{cwd:temp,encoding:"utf8"});
    assert.match(result,/source-bound/,"wrong shell cwd must never select its stale UI assets");
  } finally { await rm(temp, {recursive:true,force:true}); }
});

test("compiled Vercel UI starts from its artifact directory and rejects stale or corrupt assets", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ipo-compiled-ui-"));
  const releaseId = "c".repeat(40);
  const assets = join(temp, "apps/web/src");
  const artifactManifestPath = join(temp, "deployment-artifact-manifest.json");
  try {
    assertProductUiBaseline(source);
    await cp(source, assets, { recursive: true });
    await mkdir(join(temp, "api"), { recursive: true });
    await build({
      entryPoints: [fileURLToPath(new URL("../src/tenant-web-assets.js", import.meta.url))],
      outfile: join(temp, "api/assets.mjs"), bundle: true, platform: "node", format: "esm",
      define: { "process.env.IPO_ONE_BUNDLED_RELEASE_ID": JSON.stringify(releaseId) },
      logLevel: "silent"
    });
    await build({
      entryPoints: [join(source, "app.js")], outfile: join(assets, "app.js"),
      bundle: true, minify: true, platform: "browser", format: "esm", logLevel: "silent"
    });
    assert.throws(() => assertProductUiBaseline(assets), error => error.code === "product_ui_baseline_mismatch",
      "compiled app.js no longer has its source imports");
    const files = ["index.html", "app.js", "workspace-experience.js", "workspace-experience.css", "web-theme.js"];
    const manifest = { sourceCommit: releaseId, productUiBaseline: "precision-terminal-v1", artifacts: [] };
    for (const file of files) manifest.artifacts.push({
      path: `apps/web/src/${file}`,
      sha256: createHash("sha256").update(await readFile(join(assets, file))).digest("hex")
    });
    await writeFile(artifactManifestPath, JSON.stringify(manifest));
    const entry = new URL(`file://${join(temp, "api/assets.mjs")}`).href;
    const result = execFileSync(process.execPath, ["--input-type=module", "-e", `
      const {createTenantWebAssetHandler}=await import(${JSON.stringify(entry)});
      const handler=createTenantWebAssetHandler();
      const response={writeHead(status){if(status!==200)throw Error('asset status');},end(body){if(!body.includes('--b-accent: #7bd9c8'))throw Error('wrong assets');}};
      const served=await handler({request:{method:'GET',headers:{}},response,pathname:'/workspace-experience.css',requestId:'compiled-ui-check'});
      if(!served)throw Error('asset unreachable');console.log('compiled-current-ui-served');
    `], { cwd: tmpdir(), encoding: "utf8" });
    assert.match(result, /compiled-current-ui-served/);
    assert.throws(() => assertProductUiBaseline(assets, { releaseId: "d".repeat(40), artifactManifestPath }),
      error => error.code === "product_ui_baseline_mismatch");
    await writeFile(join(assets, "workspace-experience.css"), "body { --brand: purple; }");
    assert.throws(() => assertProductUiBaseline(assets, { releaseId, artifactManifestPath }),
      error => error.code === "product_ui_baseline_mismatch");
    await rm(artifactManifestPath);
    assert.throws(() => assertProductUiBaseline(assets, { releaseId, artifactManifestPath }),
      error => error.code === "product_ui_baseline_mismatch");
  } finally { await rm(temp, { recursive: true, force: true }); }
});
