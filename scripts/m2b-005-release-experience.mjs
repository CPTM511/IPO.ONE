import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  M2B005_CANDIDATE_FILE,
  checkM2B005Candidate,
  readM2B005Candidate,
  runM2B005RecoveryDrill
} from "./m2b-005-release-candidate.mjs";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.IPO_ONE_M2B005_PORT ?? "4178", 10);

function json(response, status, value) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
  });
  response.end(body);
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IPO.ONE v0.2.1 Candidate Review</title>
  <style>
    :root { color-scheme: dark; --bg:#07110f; --panel:#0d1c18; --line:#26453b; --text:#ecf8f3; --muted:#9db9ae; --lime:#b9f65a; --amber:#ffca62; --red:#ff857d; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter,ui-sans-serif,system-ui,sans-serif; background:radial-gradient(circle at top right,#18382e 0,transparent 32rem),var(--bg); color:var(--text); }
    main { width:min(1120px,calc(100% - 32px)); margin:0 auto; padding:42px 0 72px; }
    header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin-bottom:28px; }
    .eyebrow { color:var(--lime); text-transform:uppercase; letter-spacing:.14em; font-size:12px; font-weight:800; }
    h1 { margin:8px 0; font-size:clamp(32px,5vw,60px); line-height:1; max-width:760px; }
    p { color:var(--muted); line-height:1.6; }
    .badge { border:1px solid #6d5623; color:var(--amber); background:#211c0e; border-radius:999px; padding:9px 13px; white-space:nowrap; font-weight:750; }
    .grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin:24px 0; }
    .card { border:1px solid var(--line); background:rgba(13,28,24,.92); border-radius:16px; padding:18px; min-height:124px; }
    .card small { color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
    .card strong { display:block; margin-top:14px; font-size:16px; line-height:1.35; }
    .ok { color:var(--lime); } .warn { color:var(--amber); } .stop { color:var(--red); }
    section { border:1px solid var(--line); background:rgba(13,28,24,.86); border-radius:20px; padding:24px; margin-top:16px; }
    h2 { margin:0 0 8px; font-size:21px; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    ul { padding-left:20px; color:var(--muted); line-height:1.7; }
    button { appearance:none; border:0; border-radius:12px; background:var(--lime); color:#0b160e; font-weight:850; padding:13px 17px; cursor:pointer; }
    button.secondary { background:#1d332b; color:var(--text); border:1px solid var(--line); }
    button:disabled { opacity:.55; cursor:wait; }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
    pre { margin:16px 0 0; background:#050b09; border:1px solid #1f362f; border-radius:12px; padding:16px; overflow:auto; max-height:360px; color:#cae7db; font-size:12px; }
    code { color:#d9f5e9; }
    footer { margin-top:22px; color:var(--muted); font-size:13px; }
    @media(max-width:820px){ .grid{grid-template-columns:1fr 1fr}.row{grid-template-columns:1fr} header{display:block}.badge{display:inline-block;margin-top:12px} }
    @media(max-width:480px){ .grid{grid-template-columns:1fr} }
  </style>
</head>
<body>
<main>
  <header>
    <div><div class="eyebrow">IPO.ONE · M2B-005</div><h1>v0.2.1 local release candidate</h1><p>Exact shared-kernel release truth. Local no-funds verification is separated from historical Testnet contracts and any future public deployment.</p></div>
    <div class="badge">BLOCKED — NOT COMPLETE</div>
  </header>
  <div class="grid" aria-label="Product truth states">
    <div class="card"><small>Code</small><strong class="ok">Exact SHA implemented</strong></div>
    <div class="card"><small>Runtime</small><strong class="ok">Local exact SHA</strong></div>
    <div class="card"><small>Deployed</small><strong class="stop">M2B not remotely deployed</strong></div>
    <div class="card"><small>Reachable</small><strong class="warn">Loopback only</strong></div>
    <div class="card"><small>Verified</small><strong class="ok">Local browser + Agent + recovery</strong></div>
  </div>
  <section>
    <h2>What this candidate proves</h2>
    <div class="row">
      <ul>
        <li>M2B-001 → 004 exact stacked commits and 68 migrations</li>
        <li>One shared Obligation, repayment, Outcome and Credit State kernel</li>
        <li>Terminal repayment survives restart/replay without duplication</li>
        <li>Partial loss remains outstanding and holds new capacity</li>
      </ul>
      <ul>
        <li>Base Sepolia addresses are historical M2A evidence only</li>
        <li>Existing Base and Venue signers remain retired and non-reusable</li>
        <li>No external Agent credential, signer, nonce or network write</li>
        <li>No mainnet, real funds, custody, transfer or withdrawal authority</li>
      </ul>
    </div>
    <div class="actions">
      <button id="verify">Verify exact candidate</button>
      <button class="secondary" id="recover">Run read-only recovery drill</button>
      <button class="secondary" id="agent">Read Agent release receipt</button>
    </div>
    <pre id="output" aria-live="polite">Select a visible verification action.</pre>
  </section>
  <section>
    <h2>Remaining named gates</h2>
    <p><strong class="warn">Independent security review: PENDING</strong><br><strong class="warn">Founder candidate decision: PENDING</strong></p>
    <p>Neither gate is self-attested. A later public or production deployment, external venue execution or real-value activation requires separate exact authorization.</p>
  </section>
  <footer>Loopback review runtime · no external deployment · no network transaction primitive</footer>
</main>
<script>
  const output = document.querySelector('#output');
  const buttons = [...document.querySelectorAll('button')];
  async function run(path, method='GET') {
    buttons.forEach(button => button.disabled = true);
    output.textContent = 'Running exact local checks…';
    try {
      const response = await fetch(path, { method, headers: { 'accept':'application/json' } });
      const value = await response.json();
      output.textContent = JSON.stringify(value, null, 2);
    } catch (error) { output.textContent = JSON.stringify({ status:'ERROR', message:error.message }, null, 2); }
    finally { buttons.forEach(button => button.disabled = false); }
  }
  document.querySelector('#verify').addEventListener('click', () => run('/api/verify', 'POST'));
  document.querySelector('#recover').addEventListener('click', () => run('/api/recovery', 'POST'));
  document.querySelector('#agent').addEventListener('click', () => run('/api/agent/release-candidate'));
</script>
</body>
</html>`;

function page(response) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  });
  response.end(html);
}

export function createM2B005ExperienceServer({ root = process.cwd() } = {}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
      if (request.method === "GET" && url.pathname === "/") return page(response);
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json(response, 200, { status: "ok", issueId: "M2B-005", networkWritesEnabled: false });
      }
      if (request.method === "POST" && url.pathname === "/api/verify") {
        return json(response, 200, await checkM2B005Candidate({ root }));
      }
      if (request.method === "POST" && url.pathname === "/api/recovery") {
        const candidate = await readM2B005Candidate(resolve(root, M2B005_CANDIDATE_FILE));
        return json(response, 200, await runM2B005RecoveryDrill(candidate, { root }));
      }
      if (request.method === "GET" && url.pathname === "/api/agent/release-candidate") {
        const candidate = await readM2B005Candidate(resolve(root, M2B005_CANDIDATE_FILE));
        return json(response, 200, {
          schemaVersion: "agent_release_candidate_read.v1",
          issueId: "M2B-005",
          candidateId: candidate.candidateId,
          releaseCommitSha: candidate.releaseCommitSha,
          sharedKernel: true,
          creditStateAuthorizing: false,
          externalWriteAuthorized: false,
          signerReuseAuthorized: false,
          productTruth: candidate.productTruth,
          excludedAuthority: candidate.excludedAuthority
        });
      }
      return json(response, 404, { status: "not_found" });
    } catch (error) {
      return json(response, 500, { status: "check_failed", code: error.code ?? "internal_error", message: error.message });
    }
  });
}

async function main() {
  const server = createM2B005ExperienceServer();
  server.listen(PORT, HOST, () => process.stdout.write(`M2B-005 release review: http://${HOST}:${PORT}/\n`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
