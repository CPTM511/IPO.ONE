import { DomainError } from "../../../packages/domain/src/index.js";

const METHODS = new Set([
  "eth_blockNumber",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getTransactionReceipt"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

async function boundedResponseText(response, maxResponseBytes) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > maxResponseBytes) {
    fail("rpc_response_too_large", "testnet RPC response exceeds the configured bound");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxResponseBytes) {
      fail("rpc_response_too_large", "testnet RPC response exceeds the configured bound");
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxResponseBytes) {
      await reader.cancel();
      fail("rpc_response_too_large", "testnet RPC response exceeds the configured bound");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export function createBoundedJsonRpcClient({
  rpcUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
  maxResponseBytes = 1_048_576
}) {
  if (
    typeof rpcUrl !== "string" ||
    typeof fetchImpl !== "function" ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 15_000 ||
    !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 2_097_152
  ) fail("invalid_live_rpc_client", "bounded testnet RPC client configuration is invalid");
  let requestSequence = 0;
  return Object.freeze({
    async call(method, params = []) {
      if (!METHODS.has(method) || !Array.isArray(params)) {
        fail("rpc_method_denied", "testnet RPC method is not in the closed read-only allowlist");
      }
      const id = ++requestSequence;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          redirect: "error",
          signal: controller.signal
        });
      } catch (error) {
        fail(error?.name === "AbortError" ? "rpc_timeout" : "rpc_unavailable", "testnet RPC request failed");
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        fail(response.status === 429 ? "rpc_rate_limited" : "rpc_unavailable", "testnet RPC request failed");
      }
      let document;
      try {
        document = JSON.parse(await boundedResponseText(response, maxResponseBytes));
      } catch (error) {
        if (error instanceof DomainError) throw error;
        fail("invalid_rpc_response", "testnet RPC returned invalid JSON");
      }
      if (
        !document || typeof document !== "object" || Array.isArray(document) ||
        document.jsonrpc !== "2.0" || document.id !== id ||
        Object.keys(document).some((key) => !new Set(["jsonrpc", "id", "result", "error"]).has(key)) ||
        (Object.hasOwn(document, "result") === Object.hasOwn(document, "error"))
      ) fail("invalid_rpc_response", "testnet RPC response envelope is invalid");
      if (document.error) fail("rpc_remote_error", "testnet RPC rejected the read-only request");
      return structuredClone(document.result);
    }
  });
}
