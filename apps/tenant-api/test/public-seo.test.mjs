import assert from "node:assert/strict";
import test from "node:test";
import { createTenantHttpServer, createTenantWebAssetHandler } from "../src/index.js";

const canonicalUrls = ["https://ipo.one/", "https://ipo.one/whitepaper"];
const availability = "Current availability: Public sandbox with synthetic capital. Real funds, external provider execution, and production transaction submission are disabled.";

async function publicFixture(t) {
  let bootstrapCalls = 0;
  const listener = createTenantHttpServer({
    gateway: { execute: async () => assert.fail("public crawl request reached Gateway") },
    resolveAuthenticationContext: async () => assert.fail("public crawl request requested authentication"),
    createNetworkContext: async () => assert.fail("public crawl request requested a command context"),
    serveWebAsset: createTenantWebAssetHandler({
      csrfTokenProvider: async () => { bootstrapCalls += 1; },
      sessionHandleProvider: async () => { bootstrapCalls += 1; }
    })
  });
  const address = await listener.listen();
  t.after(() => listener.close());
  return {
    baseUrl: `http://${address.host}:${address.port}`,
    get bootstrapCalls() { return bootstrapCalls; }
  };
}

test("public sitemap and robots support GET/HEAD without authentication or session bootstrap", async (t) => {
  const fixture = await publicFixture(t);
  for (const [path, contentType] of [
    ["/sitemap.xml", "application/xml; charset=utf-8"],
    ["/robots.txt", "text/plain; charset=utf-8"]
  ]) {
    const response = await fetch(fixture.baseUrl + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), contentType);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("vary"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const body = await response.text();
    assert.equal(Number(response.headers.get("content-length")), Buffer.byteLength(body));
    const head = await fetch(fixture.baseUrl + path, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), contentType);
    assert.equal(Number(head.headers.get("content-length")), Buffer.byteLength(body));
    assert.equal(await head.text(), "");
    const scoped = await fetch(fixture.baseUrl + path + "?tenant=synthetic-private&founder_review=example", {
      headers: { cookie: "ipo-one-session=synthetic-test-session" }
    });
    assert.equal(scoped.status, 200);
    assert.equal(await scoped.text(), body);
    assert.equal(scoped.headers.get("set-cookie"), null);
  }
  assert.equal(fixture.bootstrapCalls, 0);
});

test("sitemap exposes only the canonical homepage and whitepaper with no private or alternate URLs", async (t) => {
  const fixture = await publicFixture(t);
  const response = await fetch(fixture.baseUrl + "/sitemap.xml");
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => value);
  assert.deepEqual(urls, canonicalUrls);
  assert.equal((xml.match(/<url>/g) ?? []).length, canonicalUrls.length);
  assert.doesNotMatch(xml, /lastmod|changefreq|priority/);
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, "https://ipo.one");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.doesNotMatch(url.pathname, /^\/(?:api|auth|tenant|v1|private|workspace)(?:\/|$)/);
    assert.doesNotMatch(value, /www\.ipo\.one|vercel\.app|localhost|founder_review|\.html|\.json/);
    const page = await fetch(fixture.baseUrl + url.pathname);
    assert.equal(page.status, 200);
    assert.match(await page.text(), new RegExp(`<link rel="canonical" href="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  const robots = await (await fetch(fixture.baseUrl + "/robots.txt")).text();
  assert.deepEqual([...robots.matchAll(/^Sitemap: (.+)$/gm)].map(([, value]) => value), ["https://ipo.one/sitemap.xml"]);
  for (const prefix of ["/api/", "/auth/", "/tenant/", "/v1/"]) {
    assert.ok(robots.split("\n").includes(`Disallow: ${prefix}`));
  }
});

test("server-readable public heroes disclose current synthetic availability beside the proposition", async (t) => {
  const fixture = await publicFixture(t);
  const page = await fetch(fixture.baseUrl + "/");
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const [copyClass, ledeClass, actionsClass] of [
    ["web009-hero-copy", "web009-lede", "web009-actions"],
    ["public-product-hero-copy", "public-product-lede", "public-hero-actions"]
  ]) {
    const hero = html.slice(html.indexOf(`class="${copyClass}"`));
    const notice = hero.match(/<p class="public-current-availability" data-public-availability>(.*?)<\/p>/)?.[1];
    assert.equal(notice?.replace(/<[^>]+>/g, ""), availability);
    assert.ok(hero.indexOf(ledeClass) < hero.indexOf("data-public-availability"));
    assert.ok(hero.indexOf("data-public-availability") < hero.indexOf(actionsClass));
    assert.doesNotMatch(hero.match(/<p class="public-current-availability"[^>]*>/)[0], /hidden|aria-hidden/);
  }
});
