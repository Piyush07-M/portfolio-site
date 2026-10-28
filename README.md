# Piyush Mandal — AI Product Builder Portfolio

A responsive, editorial portfolio focused on AI product engineering, product strategy, and growth. The site is intentionally lightweight: the portfolio experience is served from a single HTML document, with a small set of static assets.

## Flagship work

- **Pathvio** — AI career-planning product, with an authentic screenshot of the live homepage and a product/engineering case study.
- **Hush AI Concierge / BrandKart** — AI-first footwear commerce demo, with a recommendation-flow case study. The portfolio describes the private source repo at a high level rather than linking visitors to an inaccessible repository.

Facts and test counts in the case studies are labelled as repository-reported; they should not be read as independently measured business outcomes.

## Preview locally

With Python 3 installed:

```bash
python3 -m http.server 4173
```

Then open http://127.0.0.1:4173.

The site uses external runtime resources for Google Fonts, Three.js (jsDelivr), and the Hush sample catalog image (Unsplash). A CSS hero fallback is kept available if WebGL fails to initialize.

## Quality checks

Static portfolio checks:

```bash
node --check scripts/validate-portfolio.mjs
node scripts/validate-portfolio.mjs
```

Browser tests require Node.js, Playwright, axe-core, and the Playwright Chromium build:

```bash
npm install --no-save playwright@1.64.1 axe-core@4.14.0
npx playwright install chromium
node scripts/browser-smoke.cjs
```

The browser suite runs a local HTTP server, captures desktop/mobile screenshots into `qa-artifacts/`, checks navigation and responsive widths, validates the WebGL scene and its fallback, tests reduced motion, and runs a WCAG 2.2 A/AA axe scan. It also attempts to capture the live Pathvio homepage as a visual reference; that capture is non-blocking if the live site is unavailable.

GitHub Actions runs the static and Chromium checks for pull requests. See the [Actions runs](https://github.com/Piyush07-M/portfolio-site/actions) for current results.

## Before release

- Confirm the contact email in the footer is correct.
- Review the screenshot and case-study content for accuracy.
- Check the latest CI run and screenshots before merging.
- Test at least one physical iOS/Android device and a non-Chromium browser before production deployment.
