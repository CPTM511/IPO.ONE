import { loadProductionClosedPilotEnvironment } from "./production-environment.js";
import { createProductionClosedPilotRuntime } from "./production-runtime.js";

let runtime;
try {
  const configuration = await loadProductionClosedPilotEnvironment();
  runtime = await createProductionClosedPilotRuntime(configuration);
  const address = await runtime.listen();
  process.stdout.write(JSON.stringify({
    event: "production_runtime_ready",
    profile: runtime.profile,
    realFundsEnabled: runtime.realFundsEnabled,
    host: address.host,
    port: address.port,
    releaseId: process.env.IPO_ONE_RELEASE_ID
  }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({
    event: "production_runtime_start_failed",
    code: error?.code ?? "startup_failed",
    message: error?.message ?? "Production runtime startup failed"
  }) + "\n");
  process.exitCode = 78;
}

if (runtime) {
  let closing = false;
  const close = async (signal) => {
    if (closing) return;
    closing = true;
    try {
      await runtime.close();
      process.stdout.write(JSON.stringify({ event: "production_runtime_stopped", signal }) + "\n");
      process.exit(0);
    } catch (error) {
      process.stderr.write(JSON.stringify({
        event: "production_runtime_stop_failed",
        code: error?.code ?? "shutdown_failed"
      }) + "\n");
      process.exit(1);
    }
  };
  process.once("SIGINT", () => close("SIGINT"));
  process.once("SIGTERM", () => close("SIGTERM"));
}
