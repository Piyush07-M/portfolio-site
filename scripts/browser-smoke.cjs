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
  ".webp": "image/webp",
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

    await desktop.keyboard.press("Tab");
    await desktop.waitForFunction(() => {
      const node = document.querySelector(".skip-link");
      const rect = node.getBoundingClientRect();
      return document.activeElement === node && rect.top >= 0 && rect.top < innerHeight;
    }, null, { timeout: 1800 }).catch(() => {}); // wait for the focus-only slide-in without making the test timing-dependent
    const skipLinkFocused = await desktop.evaluate(() => {
      const node = document.querySelector(".skip-link");
      const active = document.activeElement;
      const rect = node.getBoundingClientRect();
      return {
        focused: active === node,
        visible: rect.top >= 0 && rect.top < innerHeight,
        activeTag: active?.tagName,
        activeClass: active?.className || "",
        top: Math.round(rect.top),
        transform: getComputedStyle(node).transform,
      };
    });
    console.log("Skip-link keyboard state:", JSON.stringify(skipLinkFocused));
    expect(skipLinkFocused.focused && skipLinkFocused.visible, "Keyboard-first navigation exposes the visible skip link");
    await desktop.locator(".skip-link").evaluate((node) => node.blur()); // keep focus-only UI out of visual review captures

    expect((await desktop.title()).includes("Piyush Mandal"), "Desktop document title is correct");
    expect(await desktop.locator("h1").count() === 1 && await desktop.locator("h1").isVisible(), "One visible primary heading is rendered");
    expect(await desktop.locator("#pathvio-case-study").count() === 1 && await desktop.locator("#hush-case-study").count() === 1, "Both flagship case studies render");
    const portrait = await desktop.locator(".hero-portrait").evaluate((img) => ({
      loaded: img.complete && img.naturalWidth >= 300,
      alt: img.alt,
      aspect: img.naturalWidth / img.naturalHeight,
    }));
    expect(portrait.loaded && portrait.alt.includes("Piyush Mandal"),
      "Uploaded Piyush portrait loads with meaningful alternative text");
    expect(portrait.aspect > 0.65 && portrait.aspect < 0.85,
      "Portrait is cropped to a portrait-oriented hero ratio");
    expect(await desktop.locator(".case-flow").count() === 2, "Both product flow diagrams render");
    const stage = await desktop.locator("#visualStage").evaluate((node) => ({
      webglReady: node.dataset.webgl === "ready",
      fallbackOpacity: Number.parseFloat(getComputedStyle(document.querySelector("#stageFallback")).opacity),
    }));
    expect(stage.webglReady || stage.fallbackOpacity >= 0.5, "Hero shows either the WebGL scene or its CSS fallback");
    expect(stage.webglReady, "Three.js WebGL scene actually initializes in Chromium with SwiftShader");
    const canvasBounds = await desktop.locator("#visualStage canvas").boundingBox();
    expect(Boolean(canvasBounds && canvasBounds.width > 250 && canvasBounds.height > 250),
      "Live WebGL canvas has a real, non-zero rendered viewport");
    const motionInput = desktop.locator("#motionToggle");
    const motionLabel = desktop.locator('label[for="motionToggle"]');
    expect(await motionLabel.isVisible(), "User can see the pause-motion control when animation is enabled");
    await motionLabel.click();
    expect(await motionInput.isChecked(), "Pause-motion checkbox can be activated by pointer");
    const pausedMotion = await desktop.evaluate(() => ({
      marquee: getComputedStyle(document.querySelector(".marquee-track")).animationPlayState,
      webgl: document.querySelector("#visualStage").dataset.motionPaused,
    }));
    expect(pausedMotion.marquee === "paused" && pausedMotion.webgl === "true",
      "Pause-motion control stops both the marquee and WebGL animation");
    await motionLabel.click();
    const resumedMotion = await desktop.evaluate(() => ({
      marquee: getComputedStyle(document.querySelector(".marquee-track")).animationPlayState,
      webgl: document.querySelector("#visualStage").dataset.motionPaused,
    }));
    expect(!await motionInput.isChecked() && resumedMotion.marquee !== "paused" && resumedMotion.webgl === "false",
      "Resume-motion control restarts motion with an announced checkbox state");
    const desktopWidth = await desktop.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(desktopWidth.content <= desktopWidth.viewport + 1, "Desktop layout has no horizontal overflow");
    // The motion-toggle test scrolls down to the marquee; reset before capturing the hero viewport.
    await desktop.evaluate(() => window.scrollTo(0, 0));
    await desktop.waitForTimeout(180);
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
    const productImage = await desktop.locator(".pathvio-shot-frame img").evaluate((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      alt: img.alt,
    }));
    expect(productImage.complete && productImage.naturalWidth >= 300 && productImage.alt.length > 35,
      "Authentic Pathvio product screenshot loads with meaningful alternative text");
    await desktop.waitForTimeout(900);
    const hushImage = await desktop.locator(".catalog-product img").evaluate((img) => ({
      loaded: img.complete && img.naturalWidth > 0,
      fallback: img.closest(".catalog-product")?.classList.contains("image-unavailable") || false,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
    }));
    expect(hushImage.alt.length > 20 && (hushImage.loaded || hushImage.fallback),
      "Hush demo footwear image loads or displays its intentional fallback");

    const pathvioCard = desktop.locator(".project-card").first();
    await pathvioCard.scrollIntoViewIfNeeded();
    await desktop.waitForTimeout(180);
    const backgroundGrid = pathvioCard.locator(".visual-grid");
    const gridBefore = await backgroundGrid.evaluate((node) => getComputedStyle(node).transform);
    await desktop.evaluate(() => window.scrollBy(0, 120));
    await desktop.waitForTimeout(120);
    const gridAfter = await backgroundGrid.evaluate((node) => getComputedStyle(node).transform);
    expect(gridBefore !== gridAfter, "Project background grid responds to scroll-linked parallax");

    const mock = pathvioCard.locator(".pathvio-shot-frame");
    const mockBounds = await mock.boundingBox();
    await desktop.mouse.move(mockBounds.x + mockBounds.width * 0.2, mockBounds.y + mockBounds.height * 0.2);
    await desktop.waitForTimeout(100);
    const tiltBefore = await mock.evaluate((node) => getComputedStyle(node).transform);
    await desktop.mouse.move(mockBounds.x + mockBounds.width * 0.8, mockBounds.y + mockBounds.height * 0.8);
    await desktop.waitForTimeout(120);
    const tiltAfter = await mock.evaluate((node) => getComputedStyle(node).transform);
    expect(tiltBefore !== tiltAfter, "Pathvio product frame tilt responds to pointer position");

    await desktop.evaluate(() => window.scrollTo(0, 0));
    await desktop.mouse.move(1, 1);
    await desktop.waitForTimeout(220);
    await desktop.screenshot({ path: path.join(artifacts, "desktop-full-page.png"), fullPage: true });

    // Automated WCAG 2.2 A/AA scan after all scroll-reveal content is visible.
    await desktop.addScriptTag({ path: require.resolve("axe-core") });
    const accessibility = await desktop.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      });
      return {
        violations: result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        })),
        passes: result.passes.length,
        incomplete: result.incomplete.map((item) => ({
          id: item.id,
          impact: item.impact,
          help: item.help,
          description: item.description,
          helpUrl: item.helpUrl,
          tags: item.tags,
          nodes: item.nodes.map((node) => ({
            target: node.target,
            html: node.html,
            summary: node.failureSummary,
            any: node.any.map((check) => ({ id: check.id, message: check.message, data: check.data })),
            all: node.all.map((check) => ({ id: check.id, message: check.message, data: check.data })),
            none: node.none.map((check) => ({ id: check.id, message: check.message, data: check.data })),
          })),
        })),
      };
    });
    fs.writeFileSync(path.join(artifacts, "accessibility-report.json"), JSON.stringify(accessibility, null, 2));
    if (accessibility.violations.length) {
      console.error("AXE VIOLATIONS:", JSON.stringify(accessibility.violations, null, 2));
    }
    expect(accessibility.violations.length === 0,
      `Axe WCAG 2.2 A/AA scan passes with no violations (rules passed: ${accessibility.passes})`);

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
    await mobile.addScriptTag({ path: require.resolve("axe-core") });
    const mobileAccessibility = await mobile.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      });
      return {
        violations: result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          targets: violation.nodes.map((node) => node.target),
        })),
        passes: result.passes.length,
      };
    });
    if (mobileAccessibility.violations.length) console.error("MOBILE AXE VIOLATIONS:", JSON.stringify(mobileAccessibility.violations, null, 2));
    expect(mobileAccessibility.violations.length === 0,
      `Axe WCAG 2.2 A/AA scan passes with the mobile menu open (rules passed: ${mobileAccessibility.passes})`);
    await mobile.locator('#navLinks a[href="#work"]').click();
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

    // Progressive-enhancement check: essential content and mobile links must work without JavaScript.
    const noJs = await browser.newPage({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    await noJs.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 45000 });
    const noJsState = await noJs.evaluate(() => {
      const nav = document.querySelector("#navLinks");
      const navRect = nav.getBoundingClientRect();
      const revealItems = [...document.querySelectorAll(".reveal")];
      return {
        navVisible: getComputedStyle(nav).display !== "none" && navRect.width > 0 && navRect.height > 0 && navRect.bottom > 0,
        menuButtonHidden: getComputedStyle(document.querySelector("#menuToggle")).display === "none",
        revealsVisible: revealItems.length > 0 && revealItems.every((node) => Number.parseFloat(getComputedStyle(node).opacity) >= 0.95),
        fallbackVisible: Number.parseFloat(getComputedStyle(document.querySelector("#stageFallback")).opacity) >= 0.95,
      };
    });
    expect(noJsState.navVisible, "Mobile navigation links stay visible when JavaScript is disabled");
    expect(noJsState.menuButtonHidden, "Non-functional mobile menu button stays hidden without JavaScript");
    expect(noJsState.revealsVisible, "All content remains visible when JavaScript is disabled");
    expect(noJsState.fallbackVisible, "CSS hero artwork remains visible when JavaScript is disabled");
    await noJs.screenshot({ path: path.join(artifacts, "mobile-no-js.png") });
    await noJs.locator('#navLinks a[href="#work"]').click();
    expect(new URL(noJs.url()).hash === "#work", "Mobile navigation links remain usable without JavaScript");
    await noJs.close();

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

    // Best-effort visual reference capture for the real product; never make CI depend on the live site's uptime.
    const liveReference = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    try {
      await liveReference.goto("https://pathvio.in/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await liveReference.waitForTimeout(700);
      const rejectCookies = liveReference.getByRole("button", { name: /reject all/i });
      if (await rejectCookies.count()) {
        await rejectCookies.first().click({ timeout: 1800 }).catch(() => {});
        await liveReference.waitForTimeout(350);
      }
      await liveReference.screenshot({ path: path.join(artifacts, "pathvio-live-reference.png") });
      console.log("Captured authentic Pathvio homepage reference for visual review.");
    } catch (error) {
      console.warn("Pathvio reference capture skipped (live site unavailable):", error.message);
    } finally {
      await liveReference.close();
    }

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
