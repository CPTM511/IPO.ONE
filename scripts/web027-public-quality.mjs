import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "output/playwright/web-027";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (let run = 0; run < 3; run++) for (const [version, port] of [["WEB026H",8895],["WEB027",8935]]) {
    const context = await browser.newContext({ viewport: { width:1440,height:1024 }, reducedMotion:"reduce" });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__web027Cls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__web027Cls += entry.value;
      }).observe({type:"layout-shift", buffered:true});
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByRole("button",{name:"Log in",exact:true})).toBeVisible();
    const start = performance.now();
    await page.getByRole("button",{name:"Log in",exact:true}).click();
    await expect(page.locator("#accessLayer")).toBeVisible();
    const clickToVisibleMs = performance.now() - start;
    await page.locator("#accessCloseBtn").click();
    await expect(page.locator("#accessLayer")).toBeHidden();
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      return {domContentLoadedMs:nav.domContentLoadedEventEnd,loadMs:nav.loadEventEnd,
        firstContentfulPaintMs:performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
        resourceCount:resources.length,transferBytes:resources.reduce((sum,r)=>sum+r.transferSize,0),
        cumulativeLayoutShift:window.__web027Cls};
    });
    if (version === "WEB027" && run === 0) await page.screenshot({path:out+"/public-1440.png",animations:"disabled"});
    expect(errors).toEqual([]);
    results.push({version,port,run,clickToVisibleMs,...metrics,pageErrors:errors});
    await context.close();
  }
  await writeFile(out+"/public-quality.json",JSON.stringify({method:"Three interleaved fresh Chromium contexts on the same Mac; no throttling; public login open/close only. Click timing includes automation overhead; not INP or a Lighthouse score.",results},null,2));
} finally { await browser.close(); }
