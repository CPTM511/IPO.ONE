import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stderr.write(
    "tenant_api_composition_required: inject the approved Gateway, OIDC BFF, workload verifier, and trusted network-context factory\n"
  );
  process.exitCode = 78;
}
