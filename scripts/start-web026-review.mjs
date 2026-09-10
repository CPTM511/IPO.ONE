import { spawn } from "node:child_process";

// Isolated visual/interaction QA. These hosts do not authenticate a real user.
const profiles = [
  { port: 4195, role: "borrower", signedOut: true, label: "Public design candidate" },
  { port: 4191, role: "borrower", label: "Human fixture" },
  { port: 4192, agent: true, label: "Principal / Agent fixture" },
  { port: 4193, role: "capitalPartner", label: "Capital Partner fixture" },
  { port: 4194, role: "risk", label: "Risk fixture" }
];
const children = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
for (const profile of profiles) {
  const child = spawn(process.execPath, [
    `apps/web/test/support/${profile.agent ? "agent-console" : "human-lifecycle"}-browser-host.mjs`
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env, IPO_ONE_BROWSER_QA_PORT: String(profile.port),
      IPO_ONE_BROWSER_QA_ROLE: profile.role ?? "controller",
      IPO_ONE_BROWSER_QA_START_SIGNED_OUT: profile.signedOut ? "1" : "0"
    },
    stdio: ["ignore", "inherit", "inherit"]
  });
  child.once("exit", code => {
    if (!stopping) { console.error(`Review ${profile.port} exited (${code}).`); process.exitCode = 1; stop(); }
  });
  children.push(child);
}
for (const profile of profiles) {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try { ready = (await fetch(`http://127.0.0.1:${profile.port}/tenant/v1/healthz`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Wait for loopback. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { process.exitCode = 1; stop(); break; }
  console.log(`${profile.label}: http://127.0.0.1:${profile.port}/?preview_data=fixture`);
}
