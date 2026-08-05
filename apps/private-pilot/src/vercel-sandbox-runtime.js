import { loadProductionClosedPilotEnvironment } from "./production-environment.js";
import { createProductionClosedPilotRuntime } from "./production-runtime.js";

let runtimePromise;

async function composeRuntime(environment) {
  const configuration = await loadProductionClosedPilotEnvironment(environment);
  return createProductionClosedPilotRuntime(configuration);
}

export function getVercelSandboxRuntime(environment = process.env) {
  if (!runtimePromise) {
    runtimePromise = composeRuntime(environment).catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

export async function handleVercelSandboxRequest(
  request,
  response,
  environment = process.env
) {
  const runtime = await getVercelSandboxRuntime(environment);
  return runtime.handleRequest(request, response);
}

export async function closeVercelSandboxRuntimeForTest() {
  const pending = runtimePromise;
  runtimePromise = undefined;
  if (!pending) return;
  const runtime = await pending;
  await runtime.close();
}
