import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "docs/WHITEPAPER.md");
const outputPath = resolve(root, "apps/web/src/whitepaper.html");
const checkOnly = process.argv.includes("--check");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|#[^\s)]+)\)/g,
    (_match, label, href) => `<a href="${href}">${label}</a>`
  );
  return html;
}

function slugBase(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function headingId(value, seen) {
  const base = slugBase(value);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function isTableSeparator(line) {
  return /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function renderDiagram(source, index) {
  const direction = source.match(/flowchart\s+(LR|TB|TD)/)?.[1] ?? "LR";
  const title = source.match(/^%%\s*title:\s*(.+)$/m)?.[1]?.trim() ?? `Protocol diagram ${index}`;
  const caption = source.match(/^%%\s*caption:\s*(.+)$/m)?.[1]?.trim() ?? "Canonical protocol relationship.";
  const nodes = new Map();
  for (const match of source.matchAll(/([A-Za-z][A-Za-z0-9_]*)\["([^"]+)"\]/g)) {
    if (nodes.has(match[1])) continue;
    const [label, ...detail] = match[2].split("\\n");
    nodes.set(match[1], { id: match[1], label, detail: detail.join(" · ") });
  }
  const edges = [...source.matchAll(/([A-Za-z][A-Za-z0-9_]*)(?:\["[^"]+"\])?\s*-->\s*([A-Za-z][A-Za-z0-9_]*)/g)]
    .map((match) => [match[1], match[2]])
    .filter(([from, to]) => nodes.has(from) && nodes.has(to));
  const incoming = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const [, to] of edges) incoming.set(to, (incoming.get(to) ?? 0) + 1);
  const roots = [...nodes.keys()].filter((id) => incoming.get(id) === 0);
  if (roots.length === 0 && nodes.size > 0) roots.push(nodes.keys().next().value);
  const ranks = new Map(roots.map((id) => [id, 0]));
  const queue = [...roots];
  while (queue.length > 0) {
    const from = queue.shift();
    for (const [, to] of edges.filter(([candidate]) => candidate === from)) {
      if (ranks.has(to)) continue;
      ranks.set(to, (ranks.get(from) ?? 0) + 1);
      queue.push(to);
    }
  }
  for (const id of nodes.keys()) {
    if (!ranks.has(id)) ranks.set(id, 0);
  }
  const stages = new Map();
  for (const [id, node] of nodes) {
    const rank = ranks.get(id);
    const stage = stages.get(rank) ?? [];
    stage.push(node);
    stages.set(rank, stage);
  }
  const visual = [...stages.entries()].sort(([left], [right]) => left - right).map(([rank, stage], stageIndex, allStages) => {
    const stageNodes = stage.map((node) => `<button class="diagram-node" type="button" data-diagram-node="${escapeHtml(node.id)}" aria-pressed="false"><span>${escapeHtml(node.label)}</span>${node.detail ? `<small>${escapeHtml(node.detail)}</small>` : ""}</button>`).join("");
    const connector = stageIndex < allStages.length - 1 ? '<span class="diagram-arrow" aria-hidden="true">→</span>' : "";
    return `<div class="diagram-stage" data-rank="${rank}">${stageNodes}</div>${connector}`;
  }).join("");
  const relationships = edges.map(([from, to]) => `<li data-diagram-edge="${escapeHtml(from)} ${escapeHtml(to)}"><strong>${escapeHtml(nodes.get(from).label)}</strong><span aria-hidden="true">→</span>${escapeHtml(nodes.get(to).label)}</li>`).join("");
  return `<figure class="protocol-diagram" data-direction="${direction}" data-diagram="${index}" aria-labelledby="diagram-title-${index}">
    <div class="diagram-heading"><span>Diagram ${String(index).padStart(2, "0")}</span><h3 id="diagram-title-${index}">${escapeHtml(title)}</h3></div>
    <div class="diagram-visual">${visual}</div>
    <figcaption>${escapeHtml(caption)}</figcaption>
    <details class="diagram-relationships"><summary>Read every relationship</summary><ol>${relationships}</ol></details>
    <details class="diagram-source"><summary>View diagram source</summary><pre><code>${escapeHtml(source)}</code></pre></details>
  </figure>`;
}

function parseMarkdown(source) {
  const withoutFrontmatter = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  const start = withoutFrontmatter.indexOf("## Document Status");
  const lines = withoutFrontmatter.slice(start).split("\n");
  const seenHeadings = new Map();
  const toc = [];
  const html = [];
  let diagramIndex = 0;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      if (language === "mermaid") {
        diagramIndex += 1;
        html.push(renderDiagram(body.join("\n"), diagramIndex));
      } else {
        html.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      }
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const label = heading[2];
      const id = headingId(label, seenHeadings);
      const className = level === 1 ? ' class="part-heading"' : "";
      html.push(`<h${level} id="${id}"${className}>${inlineMarkdown(label)}<a class="heading-anchor" href="#${id}" aria-label="Link to ${escapeHtml(label)}">#</a></h${level}>`);
      if (level <= 2) toc.push({ level, label, id });
      index += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push("<hr />");
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${quote.map((entry) => `<p>${inlineMarkdown(entry)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = tableCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      html.push(`<div class="table-scroll"><table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    const unordered = line.match(/^\s*-\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const tag = unordered ? "ul" : "ol";
      const items = [];
      const pattern = unordered ? /^\s*-\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      html.push(`<${tag}>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${tag}>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !lines[index].startsWith("```") &&
      !lines[index].startsWith(">") &&
      !/^\s*(?:-|\d+\.)\s+/.test(lines[index]) &&
      !/^---+$/.test(lines[index].trim()) &&
      !(lines[index].includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return { body: html.join("\n"), toc, diagramCount: diagramIndex };
}

function tocMarkup(toc) {
  return toc.map(({ level, label, id }) => (
    `<a class="toc-level-${level}" href="#${id}">${inlineMarkdown(label)}</a>`
  )).join("\n");
}

function mobileOptions(toc) {
  return toc.map(({ label, id }) => `<option value="#${id}">${escapeHtml(label)}</option>`).join("\n");
}

const source = await readFile(sourcePath, "utf8");
const { body, toc, diagramCount } = parseMarkdown(source);
const sourceHash = createHash("sha256").update(source).digest("hex");
const generated = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0d1520" />
    <meta name="description" content="IPO.ONE turns verified Agent performance into credit and capital capacity through a shared obligation, Evidence and settlement protocol." />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="IPO.ONE" />
    <meta property="og:title" content="IPO.ONE Whitepaper — The Credit Layer for the Agentic Economy" />
    <meta property="og:description" content="Turn verified economic performance into portable credit and governed capital access." />
    <meta property="og:url" content="https://ipo.one/whitepaper" />
    <meta property="article:published_time" content="2026-09-03" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="IPO.ONE Whitepaper — The Credit Layer for the Agentic Economy" />
    <meta name="twitter:description" content="Turn verified Agent performance into credit and capital capacity." />
    <meta name="ipo-one:source-sha256" content="${sourceHash}" />
    <title>IPO.ONE Whitepaper — The Credit Layer for the Agentic Economy</title>
    <link rel="canonical" href="https://ipo.one/whitepaper" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/whitepaper.css?v=founding-edition-iii-v1" />
    <script src="/whitepaper.js?v=founding-edition-iii-v1" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#whitepaperContent">Skip to whitepaper</a>
    <div class="reading-progress" aria-hidden="true"><span id="readingProgress"></span></div>
    <header class="site-header">
      <a class="site-brand" href="/" aria-label="IPO.ONE product home"><span>ONE</span><strong>IPO.ONE</strong></a>
      <nav aria-label="Public site navigation">
        <a href="/">Product</a>
        <a href="/whitepaper" aria-current="page">Whitepaper</a>
        <a href="/agent-openapi.json">Developers</a>
        <a href="https://github.com/CPTM511/IPO.ONE/blob/main/SECURITY.md">Security</a>
      </nav>
    </header>
    <main>
      <section class="whitepaper-hero" id="whitepaperTop" aria-labelledby="whitepaperTitle">
        <div class="hero-grid" aria-hidden="true"></div>
        <div class="hero-copy">
          <p class="kicker"><span></span>Founding Edition III · September 2026</p>
          <h1 id="whitepaperTitle">The Credit Layer for the <em>Agentic Economy</em></h1>
          <p class="hero-lede">Turn verified Agent performance into capital.</p>
          <p class="hero-proposition">Economic performance → Evidence → Credit → Capital → Economic scale.</p>
          <p class="hero-motto"><strong>BORROW.</strong><strong>BUILD.</strong><strong>PROVE.</strong></p>
          <div class="hero-actions">
            <a class="primary-action" href="#document-status">Read the whitepaper</a>
            <a class="secondary-action" href="/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_III.pdf" download>Download PDF</a>
          </div>
          <nav class="reading-lanes" aria-label="Whitepaper reading shortcuts">
            <a href="#foundational-proposition">Thesis</a>
            <a href="#part-ii-the-ipo-one-credit-protocol">Protocol</a>
            <a href="#part-iii-performance-credit-and-capital">Capital</a>
            <a href="#part-iv-applications-of-the-credit-layer">Applications</a>
            <a href="#part-v-settlement-safety-and-governance">Governance</a>
          </nav>
        </div>
        <aside class="hero-status" aria-label="Document status">
          <p>Document lens</p>
          <dl>
            <div><dt>Current Foundation</dt><dd>Public authenticated no-funds product and bounded Testnet Evidence</dd></div>
            <div><dt>Product Evolution</dt><dd>Controlled Facility profiles behind explicit gates</dd></div>
            <div><dt>Protocol Horizon</dt><dd>One credit language for future economic activity</dd></div>
          </dl>
          <small>No offer of credit, securities, tokens, or investment products.</small>
        </aside>
      </section>
      <div class="mobile-section-picker">
        <label for="mobileToc">Jump to a section</label>
        <select id="mobileToc">
          ${mobileOptions(toc)}
        </select>
      </div>
      <div class="reading-shell">
        <aside class="table-of-contents" aria-label="Whitepaper table of contents">
          <div class="toc-heading"><span>Contents</span><small>Founding Edition III</small></div>
          <nav id="whitepaperToc">
            ${tocMarkup(toc)}
          </nav>
          <div class="toc-footer">
            <span>${diagramCount} protocol diagrams</span>
            <a href="/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_III.pdf" download>Download PDF</a>
          </div>
        </aside>
        <article class="whitepaper-content" id="whitepaperContent">
          ${body}
        </article>
      </div>
      <section class="whitepaper-cta" aria-labelledby="whitepaperCtaTitle">
        <p>BORROW. BUILD. PROVE.</p>
        <h2 id="whitepaperCtaTitle">Performance becomes financeable when proof, authority and obligation agree.</h2>
        <div>
          <a href="/">Explore the public no-funds product</a>
          <a href="/agent-openapi.json">Explore the Agent API</a>
          <a href="https://github.com/CPTM511/IPO.ONE">View the canonical repository</a>
        </div>
      </section>
    </main>
    <a class="back-to-top" href="#whitepaperTop" aria-label="Back to top">↑<span>Back to top</span></a>
    <footer>
      <strong>IPO.ONE</strong>
      <span>Identity · Payment · Obligation</span>
      <nav aria-label="Whitepaper footer links"><a href="/">Product</a><a href="/openapi.json">OpenAPI</a><a href="https://github.com/CPTM511/IPO.ONE/blob/main/SECURITY.md">Security</a></nav>
    </footer>
  </body>
</html>
`;

if (checkOnly) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== generated) {
    console.error("whitepaper.html is stale; run pnpm build:whitepaper");
    process.exitCode = 1;
  } else {
    console.log(`whitepaper.html is current (${toc.length} anchored sections, ${diagramCount} diagrams)`);
  }
} else {
  await writeFile(outputPath, generated);
  console.log(`Generated whitepaper.html (${toc.length} anchored sections, ${diagramCount} diagrams)`);
}
