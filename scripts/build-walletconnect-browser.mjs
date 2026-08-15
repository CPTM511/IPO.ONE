import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const ENTRY = new URL(
  "../apps/web/src/walletconnect-browser-entry.js",
  import.meta.url
);
const OUTPUT_DIRECTORY = new URL("../apps/web/src/vendor/", import.meta.url);
const OUTPUT = new URL(
  "walletconnect-ethereum-provider-2.23.10.iife.js",
  OUTPUT_DIRECTORY
);
const LICENSE_OUTPUT = new URL(
  "walletconnect-community-license.txt",
  OUTPUT_DIRECTORY
);
const PACKAGE = new URL(
  "../node_modules/@walletconnect/ethereum-provider/package.json",
  import.meta.url
);
const LICENSE = new URL(
  "../node_modules/@walletconnect/ethereum-provider/LICENSE.md",
  import.meta.url
);

const packageDocument = JSON.parse(await readFile(PACKAGE, "utf8"));
const license = await readFile(LICENSE);
if (
  packageDocument.name !== "@walletconnect/ethereum-provider" ||
  packageDocument.version !== "2.23.10" ||
  packageDocument.license !== "SEE LICENSE IN LICENSE.md"
) {
  throw new Error(
    "walletconnect_browser_build_rejected: package identity or license marker drifted"
  );
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(LICENSE_OUTPUT, license);
const result = await build({
  entryPoints: [ENTRY.pathname],
  outfile: OUTPUT.pathname,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "IpoOneWalletConnectBundle",
  target: ["chrome120", "firefox121", "safari17"],
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  treeShaking: true,
  metafile: true,
  logLevel: "silent"
});
const output = await readFile(OUTPUT);
const inputs = Object.keys(result.metafile.inputs);
if (
  output.length < 100_000 ||
  inputs.length < 10 ||
  !inputs.some((value) =>
    value.includes("@walletconnect/ethereum-provider/dist/index.js")
  )
) {
  throw new Error(
    "walletconnect_browser_build_rejected: bundle did not include the exact provider"
  );
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "walletconnect_browser_bundle.v1",
  packageName: packageDocument.name,
  packageVersion: packageDocument.version,
  output: OUTPUT.pathname,
  bytes: output.length,
  sha256: createHash("sha256").update(output).digest("hex"),
  licenseSha256: createHash("sha256").update(license).digest("hex"),
  inputCount: inputs.length,
  projectIdIncluded: false,
  sourceMapIncluded: false
})}\n`);
