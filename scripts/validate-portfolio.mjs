#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const htmlPath = resolve(root, "index.html");
assert.ok(existsSync(htmlPath), "index.html must exist");
const html = readFileSync(htmlPath, "utf8");
const passed = [];
const check = (condition, message) => {
  assert.ok(condition, message);
  passed.push(message);
};

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const idSet = new Set(ids);
check(ids.length === idSet.size, "HTML IDs are unique");

const anchors = [...html.matchAll(/<a\b([^>]*)>/gi)].map((match) => match[1]);
for (const [index, attrs] of anchors.entries()) {
  const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (href?.startsWith("#")) {
    check(idSet.has(href.slice(1)), `Internal anchor target exists: ${href}`);
  }
  if (/\btarget=["']_blank["']/i.test(attrs)) {
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase().split(/\s+/) ?? [];
    check(rel.includes("noopener") && rel.includes("noreferrer"), `External new-tab link ${index + 1} uses safe rel attributes`);
  }
}

for (const requiredId of ["top", "main-content", "work", "case-studies", "pathvio-case-study", "hush-case-study", "approach", "journey", "contact"]) {
  check(idSet.has(requiredId), `Required page target exists: #${requiredId}`);
}
check((html.match(/<h1\b/gi) ?? []).length === 1, "Page has exactly one primary heading");
check((html.match(/<main\b/gi) ?? []).length === 1, "Page has one main landmark");
check(/<nav\b[^>]*aria-label=/i.test(html), "Primary navigation has an accessible name");
check(/class=["']skip-link["'][^>]*href=["']#main-content["']/.test(html), "Keyboard skip link targets the main content");
check(/aria-expanded=["']false["']/.test(html), "Mobile navigation exposes expanded state");
check(html.includes(":focus-visible"), "Keyboard focus styles are defined");
check(html.includes("prefers-reduced-motion"), "Reduced-motion preferences are respected");
check(html.includes(".reveal{opacity:1") && html.includes(".reveal-ready .reveal{opacity:0"), "Content remains visible unless reveal enhancement initializes");
check(html.includes("keeping CSS fallback visible") && html.includes("fallback.style.opacity='1'"), "CSS visual fallback remains available when WebGL fails");
check(html.includes("stageObserver.observe(stage)") && html.includes("cancelAnimationFrame(raf)"), "3D animation pauses when the hero leaves the viewport");
check(html.includes("renderer.setSize(stage.clientWidth,stage.clientHeight,false)") && html.includes("if(reduceMotion||!running)draw(false)"), "3D renderer handles resize while preserving CSS sizing");
check(html.includes("aria-current") && html.includes("navObserver"), "Navigation indicates the current section");
check(html.includes("case-flow") && html.includes("Guided product loop") && html.includes("Recommendation pipeline"), "Both flagship case studies show product flow diagrams");
check(html.includes("application/ld+json"), "Structured Person metadata is included");
check(html.includes('property="og:title"') && html.includes('name="description"'), "Search/social metadata is present");
check(existsSync(resolve(root, "assets/portfolio-mark.svg")), "Favicon asset exists");
check(existsSync(resolve(root, "assets/pathvio-product-preview.webp")), "Authentic Pathvio product screenshot asset exists");
check(html.includes('src="./assets/pathvio-product-preview.webp"') && /<img[^>]+alt="Screenshot of the Pathvio homepage/.test(html), "Authentic product screenshot is embedded with useful alternative text");
check(!html.includes("github.com/Piyush07-M/Pathvio") && !html.includes("github.com/Piyush07-M/Ecommerce-AI-Assistant"), "Public case studies do not link to private source repositories");
check(html.includes("249 tests passing across 42 pytest suites") && html.includes("not independently rerun for this portfolio"), "Repository-reported evidence is qualified rather than presented as a new test run");

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
check(scripts.length >= 3, "Expected browser scripts and structured metadata are present");
for (const [index, match] of scripts.entries()) {
  const attrs = match[1];
  const source = match[2].trim();
  if (/application\/ld\+json/i.test(attrs)) {
    JSON.parse(source);
    passed.push(`Structured data script ${index + 1} is valid JSON`);
    continue;
  }
  if (/type=["']module["']/i.test(attrs)) {
    new Function(`return (async function(){\n${source}\n})`);
  } else {
    new Function(source);
  }
  passed.push(`JavaScript syntax block ${index + 1} compiles`);
}

const contrastRatio = (foreground, background) => {
  const luminance = (hex) => {
    const raw = hex.replace("#", "");
    const channels = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
for (const selector of [".scroll-cue", ".source-note"]) {
  const block = html.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]+)\\}"));
  assert.ok(block, `CSS rule exists for ${selector}`);
  const color = block[1].match(/color:(#[0-9a-f]{6})/i)?.[1];
  assert.ok(color, `Foreground colour exists for ${selector}`);
  const ratio = contrastRatio(color, "#0b0d0e");
  check(ratio >= 4.5, `${selector} contrast is at least WCAG AA for normal text (${ratio.toFixed(2)}:1)`);
}

console.log(`Portfolio static validation passed: ${passed.length} assertions.`);
for (const message of passed) console.log(`✓ ${message}`);
