/* Browser smoke tests for the static portfolio. Run with Playwright installed. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = process.cwd();
const artifacts = path.join(root, "qa-artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const checks = [];
const passed = (label) => { checks.push(label); console.log("PASS " + label); };
const expect = (condition, label) => {
  assert.ok(condition, "FAIL " + label);
  passed(label);
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(data);
  });
});

(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(4173, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
    });

    const desktopErrors = [];
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    desktop.on("pageerror", (error) => desktopErrors.push(error.message));
    await desktop.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await desktop.waitForTimeout(1800);

    expect((await desktop.title()).includes("Piyush Mandal"), "Desktop document title is correct");
    expect(await desktop.locator("h1").count() === 1 && await desktop.locator("h1").isVisible(), "One visible primary heading is rendered");
    expect(await desktop.locator("#pathvio-case-study").count() === 1 && await desktop.locator("#hush-case-study").count() === 1, "Both flagship case studies render");
    expect(await desktop.locator(".case-flow").count() === 2, "Both product flow diagrams render");
    const stage = await desktop.locator("#visualStage").evaluate((node) => ({
      webglReady: node.dataset.webgl === "ready",
      fallbackOpacity: Number.parseFloat(getComputedStyle(document.querySelector("#stageFallback")).opacity),
    }));
    expect(stage.webglReady || stage.fallbackOpacity >= 0.5, "Hero shows either the WebGL scene or its CSS fallback");
    const desktopWidth = await desktop.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(desktopWidth.content <= desktopWidth.viewport + 1, "Desktop layout has no horizontal overflow");
    await desktop.screenshot({ path: path.join(artifacts, "desktop-hero.png") });

    const documentHeight = await desktop.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < documentHeight; y += 650) {
      await desktop.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await desktop.waitForTimeout(65);
    }
    await desktop.evaluate(() => window.scrollTo(0, 0));
    await desktop.waitForTimeout(250);
    const invisibleReveals = await desktop.locator(".reveal").evaluateAll((nodes) =>
      nodes.filter((node) => Number.parseFloat(getComputedStyle(node).opacity) < 0.95).length
    );
    expect(invisibleReveals === 0, "All scroll-reveal content appears after visiting each section");
    await desktop.screenshot({ path: path.join(artifacts, "desktop-full-page.png"), fullPage: true });

    const mobileErrors = [];
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    mobile.on("pageerror", (error) => mobileErrors.push(error.message));
    await mobile.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await mobile.waitForTimeout(1200);
    const mobileWidth = await mobile.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(mobileWidth.content <= mobileWidth.viewport + 1, "390px mobile layout has no horizontal overflow");
    expect(await mobile.locator("#main-content").count() === 1, "Main content landmark exists on mobile");
    await mobile.screenshot({ path: path.join(artifacts, "mobile-hero.png") });

    await mobile.getByRole("button", { name: "Open navigation menu" }).click();
    expect(await mobile.locator("#menuToggle").getAttribute("aria-expanded") === "true", "Mobile menu opens and announces expanded state");
    await mobile.getByRole("link", { name: "Selected work" }).click();
    await mobile.waitForTimeout(150);
    expect(new URL(mobile.url()).hash === "#work", "Mobile navigation preserves native URL fragment");
    expect(await mobile.locator("#menuToggle").getAttribute("aria-expanded") === "false", "Mobile menu closes after navigation");

    await mobile.locator('a[href="#hush-case-study"]').click();
    await mobile.waitForTimeout(200);
    expect(new URL(mobile.url()).hash === "#hush-case-study", "Case-study navigation works on mobile");
    await mobile.setViewportSize({ width: 320, height: 740 });
    await mobile.waitForTimeout(150);
    const narrowWidth = await mobile.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(narrowWidth.content <= narrowWidth.viewport + 1, "320px narrow-screen layout has no horizontal overflow");

    const fallbackPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const fallbackErrors = [];
    fallbackPage.on("pageerror", (error) => fallbackErrors.push(error.message));
    await fallbackPage.route("**/three.module.js", (route) => route.abort());
    await fallbackPage.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await fallbackPage.waitForTimeout(900);
    const reducedState = await fallbackPage.evaluate(() => ({
      fallbackOpacity: Number.parseFloat(getComputedStyle(document.querySelector("#stageFallback")).opacity),
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      revealOpacity: Number.parseFloat(getComputedStyle(document.querySelector(".reveal")).opacity),
    }));
    expect(reducedState.fallbackOpacity >= 0.5, "CSS hero fallback remains visible when the Three.js CDN is blocked");
    expect(reducedState.scrollBehavior === "auto", "Reduced-motion mode disables smooth scrolling");
    expect(reducedState.revealOpacity >= 0.95, "Reduced-motion mode leaves content visible without reveal animation");
    expect(desktopErrors.length === 0 && mobileErrors.length === 0 && fallbackErrors.length === 0,
      "No uncaught JavaScript errors in desktop, mobile, or CDN-fallback runs");

    await fallbackPage.close();
    await mobile.close();
    await desktop.close();
    await browser.close();
    browser = null;
    console.log(`\nBrowser smoke tests passed: ${checks.length} assertions.`);
    console.log("Screenshots saved to qa-artifacts/.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
})();
