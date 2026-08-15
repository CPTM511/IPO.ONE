import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

const PACKAGE_ROOTS = ["packages/api-contract", "packages/sdk"];

function declaredRuntimeExports(declarationSource) {
  return new Set(
    [...declarationSource.matchAll(
      /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:const|function|class|let|var|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
    )].map((match) => match[1])
  );
}

async function assertDeclarationSyntax(declarationPath) {
  const source = await readFile(declarationPath, "utf8");
  const ambientSource = source
    .replace(/\bexport\s+abstract\s+class\s+/g, "export declare abstract class ")
    .replace(
      /\bexport\s+(?!(?:declare|type|interface|namespace)\b)(const|function|class|let|var|enum)\s+/g,
      "export declare $1 "
    );
  await transform(ambientSource, {
    loader: "ts",
    format: "esm",
    sourcefile: declarationPath,
    treeShaking: false
  });
  return source;
}

async function assertPackageExport(packageRoot, exportName, descriptor) {
  assert.equal(typeof descriptor, "object", `${packageRoot} ${exportName} must be conditional`);
  assert.equal(typeof descriptor.types, "string", `${packageRoot} ${exportName} types path missing`);
  assert.equal(typeof descriptor.import, "string", `${packageRoot} ${exportName} import path missing`);

  const declarationPath = path.join(packageRoot, descriptor.types);
  const runtimePath = path.join(packageRoot, descriptor.import);
  await Promise.all([access(declarationPath), access(runtimePath)]);

  const declarationSource = await assertDeclarationSyntax(declarationPath);
  const declaredValues = declaredRuntimeExports(declarationSource);
  const runtimeModule = await import(pathToFileURL(path.resolve(runtimePath)));
  const runtimeExports = Object.keys(runtimeModule).sort();

  assert.ok(runtimeExports.length > 0, `${packageRoot} ${exportName} has no runtime exports`);
  for (const runtimeExport of runtimeExports) {
    assert.equal(
      declaredValues.has(runtimeExport),
      true,
      `${packageRoot} ${exportName} runtime export ${runtimeExport} lacks a value declaration`
    );
  }
  for (const declaredValue of [...declaredValues].sort()) {
    assert.equal(
      Object.hasOwn(runtimeModule, declaredValue),
      true,
      `${packageRoot} ${exportName} declares runtime value ${declaredValue} but does not export it`
    );
  }

  return { declarationPath, runtimePath, exportCount: runtimeExports.length };
}

const checkedExports = [];
for (const packageRoot of PACKAGE_ROOTS) {
  const packageManifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  );
  assert.equal(packageManifest.type, "module", `${packageRoot} must remain ESM`);
  assert.equal(typeof packageManifest.exports, "object", `${packageRoot} exports missing`);
  for (const [exportName, descriptor] of Object.entries(packageManifest.exports)) {
    checkedExports.push(
      await assertPackageExport(packageRoot, exportName, descriptor)
    );
  }
}

console.log(
  `Contract typecheck passed: ${checkedExports.length} package export surfaces ` +
    `and ${checkedExports.reduce((sum, item) => sum + item.exportCount, 0)} ` +
    "runtime value exports match parseable TypeScript declaration surfaces."
);
