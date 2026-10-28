# Piyush Mandal — AI Product Builder Portfolio

A responsive, editorial portfolio focused on AI product engineering, product strategy, and growth. The site is intentionally lightweight: the portfolio experience is served from a single HTML document, with a small set of static assets.

## Flagship work

- **Pathvio** — AI career-planning product, with an authentic screenshot of the live homepage and a product/engineering case study.
- **E-Commerce AI Concierge (Hush AI / BrandKart)** — AI-first footwear commerce demo, with a recommendation pipeline and explicit evaluation plan. The portfolio describes the private source repo at a high level rather than linking visitors to an inaccessible repository.

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
npx playwright install chromium firefox webkit
node scripts/browser-smoke.cjs
```

The Chromium suite runs a local HTTP server, captures screenshots and an `accessibility-report.json` into `qa-artifacts/`, checks navigation and responsive widths, validates the WebGL scene and its fallback, tests reduced motion and JavaScript-disabled progressive enhancement, verifies the user-controlled pause/resume motion toggle, checks project images, and runs WCAG 2.2 A/AA axe scans on desktop and with the mobile menu open. It also attempts to capture the live Pathvio homepage as a visual reference; that capture is non-blocking if the live site is unavailable.

The cross-browser suite runs layout, case-study, navigation, mobile menu, reduced-motion, and JavaScript-error checks in Chromium, Firefox, and WebKit. The primary smoke suite also checks that the navigation and content remain usable without JavaScript.

GitHub Actions runs static checks, Chromium accessibility scans, and cross-browser smoke tests for pull requests. Workflow actions are pinned to full commit SHAs; screenshots and the axe report are uploaded as artifacts. See the [Actions runs](https://github.com/Piyush07-M/portfolio-site/actions) for current results.

## Before release

- Confirm the contact email in the footer is correct.
- Review the screenshot and case-study content for accuracy.
- Check the latest CI run and screenshots before merging.
- Test at least one physical iOS/Android device and a non-Chromium browser before production deployment.
