import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const sourcePath = resolve(root, "docs/WHITEPAPER.md");
const htmlPath = resolve(root, "apps/web/src/whitepaper.html");
const outputDirectory = resolve(root, "apps/web/src/whitepaper");
const outputPath = resolve(outputDirectory, "IPO_ONE_Whitepaper_Founding_Edition_III.pdf");
const manifestPath = resolve(outputDirectory, "manifest.json");
const checkOnly = process.argv.includes("--check");
const fixedPdfDate = "D:20260903000000+00'00'";

const digest = (value) => createHash("sha256").update(value).digest("hex");

function normalizePdfMetadata(value) {
  let replacementCount = 0;
  const normalized = value.toString("latin1").replace(
    /\/(CreationDate|ModDate) \(D:\d{14}[+-]\d{2}'\d{2}'\)/g,
    (_, field) => {
      replacementCount += 1;
      return `/${field} (${fixedPdfDate})`;
    }
  );
  if (replacementCount !== 2) throw new Error("Edition III PDF date metadata could not be normalized");
  return Buffer.from(normalized, "latin1");
}

async function inputs() {
  const [source, html] = await Promise.all([readFile(sourcePath), readFile(htmlPath)]);
  return { sourceSha256: digest(source), htmlSha256: digest(html) };
}

async function check() {
  const [{ sourceSha256, htmlSha256 }, pdf, manifestBytes] = await Promise.all([
    inputs(),
    readFile(outputPath),
    readFile(manifestPath)
  ]);
  const manifest = JSON.parse(manifestBytes);
  const pdfSha256 = digest(pdf);
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Edition III export is not a PDF");
  if (manifest.edition !== "Founding Edition III") throw new Error("Edition III manifest label is stale");
  if (manifest.publicationDate !== "2026-09-03") throw new Error("Edition III publication date is stale");
  if (manifest.sourceSha256 !== sourceSha256) throw new Error("Edition III PDF source is stale");
  if (manifest.htmlSha256 !== htmlSha256) throw new Error("Edition III PDF HTML is stale");
  if (manifest.pdfSha256 !== pdfSha256) throw new Error("Edition III PDF digest is stale");
  if (!Number.isInteger(manifest.pageCount) || manifest.pageCount < 1) throw new Error("Edition III PDF page count is invalid");
  console.log(`Whitepaper PDF is current (${manifest.pageCount} pages, ${pdf.length} bytes)`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (process.platform !== "darwin") throw error;
    return chromium.launch({ executablePath: chrome, headless: true });
  }
}

async function build() {
  await mkdir(outputDirectory, { recursive: true });
  const assets = new Map([
    ["/whitepaper.html", resolve(root, "apps/web/src/whitepaper.html")],
    ["/whitepaper.css", resolve(root, "apps/web/src/whitepaper.css")],
    ["/whitepaper.js", resolve(root, "apps/web/src/whitepaper.js")],
    ["/favicon.svg", resolve(root, "apps/web/src/favicon.svg")]
  ]);
  const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".svg", "image/svg+xml"]
  ]);
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    const asset = assets.get(path);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    try {
      response.writeHead(200, { "content-type": contentTypes.get(extname(asset)) ?? "application/octet-stream" });
      response.end(await readFile(asset));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const browser = await launchBrowser();
  try {
    const address = server.address();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`http://127.0.0.1:${address.port}/whitepaper.html`, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print", colorScheme: "light", reducedMotion: "reduce" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font:8px system-ui;color:#7a8791;width:100%;padding:0 14mm">IPO.ONE · Founding Edition III</div>',
      footerTemplate: '<div style="font:8px system-ui;color:#7a8791;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>The Credit Layer for the Agentic Economy</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      margin: { top: "17mm", right: "15mm", bottom: "17mm", left: "15mm" }
    });
  } finally {
    await browser.close();
    await new Promise((accept) => server.close(accept));
  }
  const pdf = normalizePdfMetadata(await readFile(outputPath));
  await writeFile(outputPath, pdf);
  const { sourceSha256, htmlSha256 } = await inputs();
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  const manifest = {
    schemaVersion: "ipo_one_whitepaper_export.v1",
    edition: "Founding Edition III",
    publicationDate: "2026-09-03",
    source: "docs/WHITEPAPER.md",
    html: "apps/web/src/whitepaper.html",
    pdf: "apps/web/src/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_III.pdf",
    generator: "scripts/generate-whitepaper-pdf.mjs",
    sourceSha256,
    htmlSha256,
    pdfSha256: digest(pdf),
    pageCount
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated Founding Edition III PDF (${pageCount} pages, ${pdf.length} bytes)`);
}

if (checkOnly) await check();
else await build();
