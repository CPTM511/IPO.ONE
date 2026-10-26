import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import test from "node:test";
import { startAgentMcpStdio } from "../src/stdio-server.js";

// Admission contract inherited from main, declared before testing SDK adoption:
// 65,536 bytes per completed line, excluding newline; malformed and oversized
// lines produce errors and do not close the connection. Chunking is irrelevant.
function wire(t) {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  const waiters = new Map();
  const lines = createInterface({ input: output });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    messages.push(message);
    waiters.get(message.id)?.(message);
    waiters.delete(message.id);
  });
  const runtime = startAgentMcpStdio({
    adapter: { listTools: () => [], callTool: async () => { throw new Error("no tools"); } },
    input, output
  });
  t.after(async () => { await runtime.close(); lines.close(); input.destroy(); output.destroy(); });
  return {
    input, messages,
    response(id) {
      const known = messages.find((message) => message.id === id);
      if (known) return Promise.resolve(known);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`Missing response ${id}`)); }, 1500);
        waiters.set(id, (message) => { clearTimeout(timer); resolve(message); });
      });
    }
  };
}
const ping = (id) => JSON.stringify({ jsonrpc: "2.0", id, method: "ping" });
const padded = (id, bytes) => {
  const message = ping(id);
  return message + " ".repeat(bytes - Buffer.byteLength(message));
};

test("stdio accepts a 65,536-byte line plus newline", async (t) => {
  const io = wire(t);
  io.input.write(`${padded(1, 65536)}\n`);
  assert.deepEqual((await io.response(1)).result, {});
});

test("stdio accepts coalesced individually-small messages above the buffer-size total", async (t) => {
  const io = wire(t);
  io.input.write([1, 2, 3].map((id) => `${padded(id, 30000)}\n`).join(""));
  for (const id of [1, 2, 3]) assert.deepEqual((await io.response(id)).result, {});
});

test("stdio returns parse error then serves valid input", async (t) => {
  const io = wire(t);
  io.input.write(`{broken\n${ping(1)}\n`);
  assert.deepEqual((await io.response(null)).error, { code: -32700, message: "Parse error" });
  assert.deepEqual((await io.response(1)).result, {});
  assert.deepEqual(io.messages.map(({ id }) => id), [null, 1]);
});

test("stdio rejects a completed oversized line then serves valid input", async (t) => {
  const io = wire(t);
  io.input.write(`${padded(1, 65537)}\n`);
  assert.deepEqual((await io.response(null)).error, { code: -32600, message: "Invalid Request" });
  io.input.write(`${ping(2)}\n`);
  assert.deepEqual((await io.response(2)).result, {});
});

test("stdio preserves fragmented JSON and UTF-8 until the complete line", async (t) => {
  const io = wire(t);
  const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { text: "信用" } }) + "\n");
  const split = bytes.indexOf(Buffer.from("信")) + 1;
  io.input.write(bytes.subarray(0, split));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(io.messages, []);
  io.input.write(bytes.subarray(split, bytes.length - 1));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(io.messages, []);
  io.input.write(bytes.subarray(-1));
  assert.deepEqual((await io.response(1)).result, {});
});
