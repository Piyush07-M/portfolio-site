/* Cross-engine smoke tests: Chromium, Firefox and WebKit. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const root = process.cwd();
const artifacts = path.join(root, "qa-artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const checks = [];
const pass = (label) => { checks.push(label); console.log("PASS " + label); };
const expect = (value, label) => { assert.ok(value, "FAIL " + label); pass(label); };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname); }
  catch { res.writeHead(400).end("Bad request"); return; }
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end("Not found"); return; }
    const ext = path.extname(file);
    const types = { ".html":"text/html; charset=utf-8", ".svg":"image/svg+xml", ".webp":"image/webp", ".js":"text/javascript" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", "cache-control":"no-store", "x-content-type-options":"nosniff" });
    res.end(data);
  });
});

(async () => {
  const browsers = [
    { name: "Chromium", engine: chromium },
    { name: "Firefox", engine: firefox },
    { name: "WebKit", engine: webkit },
  ];
  const launched = [];
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(4174, "127.0.0.1", resolve); });
    for (const entry of browsers) {
      const browser = await entry.engine.launch({ headless: true });
      launched.push(browser);
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(500);
      expect((await page.title()).includes("Piyush Mandal"), entry.name + ": title");
      expect(await page.locator("h1").count() === 1 && await page.locator("h1").isVisible(), entry.name + ": one visible h1");
      expect(await page.locator("#pathvio-case-study").isVisible() && await page.locator("#hush-case-study").isVisible(), entry.name + ": both flagship case studies");
      expect(await page.locator(".case-flow").count() === 2, entry.name + ": both product flow diagrams");
      const stage = await page.locator("#visualStage").evaluate((node) => ({
        initialized: node.dataset.webgl === "ready",
        fallback: Number.parseFloat(getComputedStyle(document.querySelector("#stageFallback")).opacity),
      }));
      expect(stage.initialized || stage.fallback >= .5, entry.name + ": hero WebGL or CSS fallback");
      const wide = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      expect(wide.content <= wide.viewport + 1, entry.name + ": no desktop horizontal overflow");
      await page.locator('#navLinks a[href="#work"]').click();
      expect(new URL(page.url()).hash === "#work", entry.name + ": native anchor navigation");
      await page.screenshot({ path: path.join(artifacts, `cross-${entry.name.toLowerCase()}-desktop.png`) });

      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      mobile.on("pageerror", (error) => errors.push(error.message));
      await mobile.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await mobile.waitForTimeout(300);
      const narrow = await mobile.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      expect(narrow.content <= narrow.viewport + 1, entry.name + ": 390px mobile no horizontal overflow");
      expect(await mobile.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior) === "auto", entry.name + ": reduced motion respected");
      await mobile.locator("#menuToggle").click();
      expect(await mobile.locator("#menuToggle").getAttribute("aria-expanded") === "true", entry.name + ": accessible mobile menu opens");
      await mobile.locator('#navLinks a[href="#work"]').click();
      expect(new URL(mobile.url()).hash === "#work", entry.name + ": mobile navigation preserves the URL hash");
      expect(await mobile.locator("#menuToggle").getAttribute("aria-expanded") === "false", entry.name + ": menu closes after selecting a section");
      await mobile.setViewportSize({ width: 320, height: 740 });
      const smallest = await mobile.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      expect(smallest.content <= smallest.viewport + 1, entry.name + ": 320px narrow screen no horizontal overflow");
      await mobile.screenshot({ path: path.join(artifacts, `cross-${entry.name.toLowerCase()}-mobile.png`) });
      expect(errors.length === 0, entry.name + ": no uncaught JavaScript errors");
      await mobile.close();
      await page.close();
    }
    console.log(`\nCross-browser smoke tests passed: ${checks.length} assertions across Chromium, Firefox and WebKit.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await Promise.all(launched.map((browser) => browser.close().catch(() => {})));
    await new Promise((resolve) => server.close(resolve));
  }
})();
