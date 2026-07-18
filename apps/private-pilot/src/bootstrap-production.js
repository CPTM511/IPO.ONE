import { readFile } from "node:fs/promises";
import {
  bootstrapProductionDatabase,
  loadProductionBootstrapConfig
} from "./production-bootstrap.js";

async function secret(path, name, { base64 = false } = {}) {
  if (typeof path !== "string" || !path.startsWith("/")) throw new Error(`${name} file is required`);
  const value = (await readFile(path, "utf8")).trim();
  if (value.length < 32 || value.length > 128 || /[\0\r\n]/.test(value)) throw new Error(`${name} is invalid`);
  if (!base64) return value;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 32 || bytes.length > 64 || bytes.toString("base64url") !== value) throw new Error(`${name} is invalid`);
  return bytes;
}

try {
  if (process.env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production");
  const [config, gatewayPassword, authenticationPassword, referenceHashKey] = await Promise.all([
    loadProductionBootstrapConfig(process.env.IPO_ONE_BOOTSTRAP_CONFIG_FILE),
    secret(process.env.IPO_ONE_GATEWAY_DATABASE_PASSWORD_FILE, "gateway database password"),
    secret(process.env.IPO_ONE_AUTH_DATABASE_PASSWORD_FILE, "authentication database password"),
    secret(process.env.IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE, "authentication reference key", { base64: true })
  ]);
  const result = await bootstrapProductionDatabase({
    adminConnectionString: process.env.IPO_ONE_ADMIN_DATABASE_URL,
    config,
    gatewayPassword,
    authenticationPassword,
    referenceHashKey
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "production_bootstrap_failed",
    code: error?.code ?? "bootstrap_failed",
    message: error?.message ?? "Production bootstrap failed"
  })}\n`);
  process.exitCode = 78;
}
