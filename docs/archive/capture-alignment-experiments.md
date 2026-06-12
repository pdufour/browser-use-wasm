# Capture alignment experiments

> **Status: NOT FIXED** — production baseline remains **medY≈2**, **fullPage≈92%** (`npm run visual-diff:bbox-visual` 2026-06-10: **1.8px** / **92.2%**). All failed attempts and root-cause analysis: [`capture-alignment-failures.md`](./capture-alignment-failures.md).

## The problem

When you toggle live vs snapshot (`v`), painted text can sit about **1px higher or lower** in the SnapDOM screenshot than on the live page. Layout boxes can look fine while the ink does not line up. VLA grounding reads click targets from screenshot pixels, not the live DOM.

## How to measure

With `npm run dev` running:

```bash
npm run visual-diff:bbox-visual
```

This captures `#capture-target` the same way the app does, then compares **live pixels** to **screenshot pixels** on labeled landmarks. Outputs under `assets/visual-diff/bbox-diff/`:

- `live-annotated.png`, `capture-annotated.png`, `side-by-side.png`
- `visual-report.json`

Primary metric: **`medianCorrelationShiftY_pixels`**. Lower is better; **0** is perfect alignment.

## Try capture variants (page-only)

Edit the `named` text-fix list in `scripts/snapdom-capture-experiments.mjs`, then:

```bash
npm run visual-diff:experiments
EXP_COUNT=250 POOL_SIZE=8 npm run visual-diff:experiments
EXP_ONLINE_COUNT=200 POOL_SIZE=8 npm run visual-diff:experiments:online
EXP_RESEARCH_COUNT=1000 POOL_SIZE=8 npm run visual-diff:experiments:research
npm run visual-diff:experiments:creative
EXP_CREATIVE_COUNT=1000 EXP_CREATIVE_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:creative
npm run visual-diff:experiments:varied
EXP_VARIED_COUNT=100 EXP_VARIED_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:varied
npm run visual-diff:experiments:radical
EXP_RADICAL_COUNT=48 EXP_LIMIT=5 POOL_SIZE=2 npm run visual-diff:experiments:radical
npm run visual-diff:experiments:cooked
EXP_COOKED_COUNT=150 EXP_COOKED_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:cooked
npm run visual-diff:experiments:unique
EXP_UNIQUE_COUNT=1000 EXP_UNIQUE_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:unique
EXP_OFFSET=50 EXP_LIMIT=50 POOL_SIZE=4 npm run visual-diff:experiments
EXP_RESET=1 npm run visual-diff:experiments
```

The catalog focuses on **text/typography/foreignObject ink** hypotheses only (fonts, line-height, vertical-align, anti-aliasing, FO reset) — not layout/transform/scroll grids.

**Varied batch** (`scripts/snapdom-varied-catalog.mjs`, ids `var-*`): 100 diverse methods per run — computed copy, CSS standards, Range/measureText offsets, SnapDOM opts, `drawElementImage`, dim lock, postCanvas floor/integer. No hardcoded px shift grids. Deduped against `txt-*`, `onl-*`, and `res-*` catalogs.

**Text creative batch** (`scripts/snapdom-text-creative-catalog.mjs`, ids `txc-*`): 60 text-ink hypotheses from online research — `text-box-trim`/`leading-trim`, `@font-face` descriptor copy, per-family `measureText` ascent/descent overrides, Range/getClientRects ink margin, SnapDOM `embedFonts`/`preCache`. Four new generic plugins: `copy-font-face-descriptors`, `font-metrics-override-measuretext`, `copy-leading-trim-edge`, `range-ink-margin-top`. Deduped against all prior catalogs.

```bash
npm run visual-diff:experiments:text-creative
EXP_TEXT_CREATIVE_COUNT=60 EXP_TEXT_CREATIVE_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:text-creative
EXP_LIMIT=10 POOL_SIZE=4 npm run visual-diff:experiments:text-creative
```

```bash
npm run visual-diff:experiments:varied
EXP_VARIED_COUNT=100 EXP_VARIED_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:varied
```

**Cooked batch** (`scripts/snapdom-cooked-catalog.mjs`, ids `cook-*`): 150 methods via `generateCookedCaptureMethods`. Same no-magic rules; deduped against `txt-*`, `onl-*`, `res-*`, `var-*`, `cre-*`, `think-*`, and `rad-*` via normalized JSON spec keys.

```bash
npm run visual-diff:experiments:cooked
EXP_COOKED_COUNT=150 EXP_COOKED_ONLY=1 POOL_SIZE=8 npm run visual-diff:experiments:cooked
```

**Research batch** (`scripts/snapdom-research-catalog.mjs`) — 1000 `res-*` methods via `generateResearchCaptureMethods`. Combinatorial computed-copy, CSS keywords (`text-box-trim`, `alignment-baseline`), Range/getClientRects/measureText offsets, SnapDOM opts, `drawElementImage`, dim lock, and postCanvas floor/integer steps. No hardcoded px shift grids.

**Unique batch** (`scripts/snapdom-unique-catalog.mjs`) — 1000 `uniq-*` methods via `generateUniqueCaptureMethods`. Each spec is unique vs all prior catalogs (`txt-`, `onl-`, `res-`, `var-`, `cre-`, `cook-`, `think-`, `rad-`) using mixed-radix combinatorics over plugins, preCapture, liveCss, cloneCss, snapdomOpts, postCanvas, dimLock, raw builder, bufferPasses, and export paths. No magic px shifts.

```bash
npm run visual-diff:experiments:research
EXP_RESEARCH_COUNT=500 EXP_OFFSET=200 EXP_LIMIT=100 POOL_SIZE=8 npm run visual-diff:experiments:research
npm run visual-diff:experiments:unique
EXP_UNIQUE_COUNT=1000 EXP_OFFSET=200 EXP_LIMIT=100 POOL_SIZE=8 npm run visual-diff:experiments:unique
```

**Creative batch** (`scripts/snapdom-creative-catalog.mjs`, ids `cre-*`): **1000** diverse generic hypotheses — unusual SnapDOM combos, text-box-trim/writing-mode/font-variant CSS, pre-capture stacks (fonts-ready-double, iframe-fonts-ready, triple-layout, rAF chains), `drawElementImage`, dimLock × postCanvas × raw builder, and novel plugins (copy text-box-trim, font-variant-settings, transform-origin, freeze clone animations, SVG preserveAspectRatio, replace video/canvas with live snapshot). Deduped against `txt-*`, `onl-*`, and `res-*`.

```bash
npm run visual-diff:experiments:creative
EXP_CREATIVE_COUNT=1000 EXP_CREATIVE_ONLY=1 EXP_OFFSET=100 EXP_LIMIT=50 POOL_SIZE=4 npm run visual-diff:experiments:creative
```

Results append to `assets/visual-diff/experiments/results.jsonl`. This never edits `src/capture-snapdom.js`.

Catalogs (all **no hardcoded px shifts**):

| Script | Prefix | Default count | Env |
|--------|--------|---------------|-----|
| `snapdom-experiment-catalog.mjs` | `txt-` | 500 | `EXP_COUNT` |
| `snapdom-online-catalog.mjs` | `onl-` | 200 | `EXP_ONLINE_COUNT`, `EXP_ONLINE_ONLY=1` |
| `snapdom-research-catalog.mjs` | `res-` | 1000 | `EXP_RESEARCH_COUNT`, `EXP_RESEARCH_ONLY=1` |
| `snapdom-unique-catalog.mjs` | `uniq-` | 1000 | `EXP_UNIQUE_COUNT`, `EXP_UNIQUE_ONLY=1` |
| `snapdom-think-catalog.mjs` | `think-` | 12 | `EXP_THINK_COUNT`, `EXP_THINK_ONLY=1` |
| `snapdom-creative-catalog.mjs` | `cre-` | 1000 | `EXP_CREATIVE_COUNT`, `EXP_CREATIVE_ONLY=1` |
| `snapdom-cooked-catalog.mjs` | `cook-` | 150 | `EXP_COOKED_COUNT`, `EXP_COOKED_ONLY=1` |
| `snapdom-radical-catalog.mjs` | `rad-` | 48 | `EXP_RADICAL_COUNT`, `EXP_RADICAL_ONLY=1` |
| `snapdom-text-creative-catalog.mjs` | `txc-` | 60 | `EXP_TEXT_CREATIVE_COUNT`, `EXP_TEXT_CREATIVE_ONLY=1` |

Strategy memo (when to stop gridding): [`capture-alignment-strategy.md`](./capture-alignment-strategy.md).

Forbidden in all catalogs: `fo-shift-y@*`, `fo-inner-translate@*`, `fo-ascent-ratio@*`, `fo-linegap@*`, `translateHalf`, global `translateY(px)` fudges.

## Text creative hypotheses

Online research themes for the `txc-*` batch (no magic px):

- **CSS text-box-trim / text-box-edge** (Chrome 133+, Safari 18.2) — `trim-both cap alphabetic` removes half-leading using font cap height and alphabetic baseline ([Chrome blog](https://developer.chrome.com/blog/css-text-box-trim), [MDN text-box-edge](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-box-edge)).
- **Legacy leading-trim / text-edge** — copy computed trim values onto clone for FO/XHTML context.
- **@font-face metrics override** — `ascent-override`, `descent-override`, `line-gap-override`, `size-adjust` from stylesheets or per-family from `measureText` `fontBoundingBoxAscent`/`Descent` ([web.dev size-adjust](https://web.dev/articles/css-size-adjust)).
- **SVG foreignObject baseline mismatch** — FO `y` is box top; text `y` is baseline; `alignment-baseline:before-edge` + `body{all:unset;display:block}` ([Stack Overflow](https://stackoverflow.com/questions/48469586/how-do-i-align-svg-foreignobject-with-a-text-element)).
- **Range/getClientRects ink box** — union of client rects vs element box for per-node margin/translate correction (html2canvas #2107; computed offset only).
- **SnapDOM font embedding** — `embedFonts: true`, `preCache`, `localFonts` on initial `snapdom()` call ([SnapDOM README](https://github.com/zumerlab/snapdom)).
- **Subpixel AA / text-rendering** — `-webkit-font-smoothing`, `text-rendering: geometricPrecision`, `font-optical-sizing` live+clone parity.

New generic plugins in `snapdom-capture-experiments.mjs`:

| Plugin | Mechanism |
|--------|-----------|
| `copy-font-face-descriptors` | Copy `@font-face` metric descriptors from live stylesheets into clone |
| `font-metrics-override-measuretext` | Inject per-family `@font-face` with ascent/descent `%` from canvas `measureText` |
| `copy-leading-trim-edge` | Copy computed `leading-trim`, `text-edge`, `baseline-source` live → clone |
| `range-ink-margin-top` | Per text node: `marginTop` from Range/getClientRects ink top minus box top |

Ship bar for `genericCandidate`: `medianCorrelationShiftY_pixels < 2` **and** `fullPageCorrelationMatchPct >= 90%` vs bbox baseline — note only; do not auto-ship to `capture-snapdom.js`.

## Grail re-check (2026-06-10)

| id | medY | fullPage | Verdict |
|----|-----:|---------:|---------|
| `grail-00000` contain:strict + fo-svg-abs-dims | **0** | **50%** | Pareto cliff — do not ship |
| `grail-00001` contain:strict + raw offset ceil | **0** | **50%** | same |
| `grail-00002` fo-svg-abs-dims + fo-before-edge | 2 | 92.7% | tie baseline |
| `grail-00006` contain:content + fo-svg-abs-dims | 2 | 92.7% | tie baseline |

`npm run visual-diff:experiments:grail` — runner fixed (`snapdom-optional-catalogs.mjs`); `observer-settle` capped at 800ms.

**drawElementImage** (`npm run visual-diff:experiments:draw-element`): Chrome flag works (`--enable-features=CanvasDrawElement`) but capture errors with *No cached paint record for element* — needs HTML-in-Canvas `layoutsubtree` + `onpaint` wiring, not a drop-in SnapDOM replacement yet.

## Current inventory (2026-05-24)

| Catalog | Prefix | Count | npm script | Env knobs |
|---------|--------|------:|------------|-----------|
| `snapdom-experiment-catalog.mjs` | `txt-` | 500 | `npm run visual-diff:experiments` | `EXP_COUNT`, `EXP_OFFSET`, `EXP_LIMIT`, `POOL_SIZE` |
| `snapdom-online-catalog.mjs` | `onl-` | 200 | `npm run visual-diff:experiments:online` | `EXP_ONLINE_ONLY=1`, `EXP_ONLINE_COUNT`, `EXP_OFFSET`, `EXP_LIMIT` |
| `snapdom-varied-catalog.mjs` | `var-` | 100 | `npm run visual-diff:experiments:varied` | `EXP_VARIED_ONLY=1`, `EXP_VARIED_COUNT`, `EXP_OFFSET`, `EXP_LIMIT` |
| `snapdom-research-catalog.mjs` | `res-` | 1000 | `npm run visual-diff:experiments:research` | `EXP_RESEARCH_ONLY=1`, `EXP_RESEARCH_COUNT`, `EXP_OFFSET`, `EXP_LIMIT` |
| `snapdom-unique-catalog.mjs` | `uniq-` | 1000 | `npm run visual-diff:experiments:unique` | `EXP_UNIQUE_ONLY=1`, `EXP_UNIQUE_COUNT`, `EXP_OFFSET`, `EXP_LIMIT` |
| `snapdom-text-creative-catalog.mjs` | `txc-` | 60 | `npm run visual-diff:experiments:text-creative` | `EXP_TEXT_CREATIVE_ONLY=1`, `EXP_TEXT_CREATIVE_COUNT`, `EXP_OFFSET`, `EXP_LIMIT` |

**Total:** 1800 methods across 4 catalogs. **Magic audit:** PASS — no forbidden shift grids in catalog source (1688 legacy magic rows remain in `results.jsonl` from pre-purge runs).

**Results:** `assets/visual-diff/experiments/results.jsonl` — 3135 rows tested. Baseline `txt-00000`: medY=2, fullPage=92.7%. Untested: 1111 (`var-*` 100, `res-*` 1000, `onl-*` 11).

**Strict non-magic winners (fp≥80%):** none beat baseline medY; ties at medY=2 / fp=92.7% include `txt-00003` embedFonts false, `txt-00004` preCache+fonts.ready, `txt-00005` fonts.ready+double-layout, `txt-00006` fonts.ready+idle, plus font-feature/variation/synthesis live-CSS variants.

**Next batch:** run `var-*` (0 tested) then `res-*` slices — e.g. `EXP_VARIED_ONLY=1 EXP_LIMIT=20 POOL_SIZE=4 npm run visual-diff:experiments:varied`.

## Loop iteration: bbox 2px text (2026-05-24)

**Goal:** fix ~2px snap-high text via generic mechanisms only; validate with `npm run visual-diff:bbox-visual`.

| Metric | Before | After |
|--------|-------:|------:|
| `medianCorrelationShiftY_pixels` | **2** | **2** |
| `fullPageCorrelationMatchPct` | **92.7%** | **92.7%** |

**Production code:** no net change to `src/capture-snapdom.js` (reverted after testing).

### What we tried

1. **`fo-ink-offset-from-range`** — Range ink top minus box top → `translateY` on FO inner div. Plugin loaded correctly but **no bbox change** (header text like ShopDemo has offsetPx=0; medY stays 2).
2. **Full typography computed copy** (`copy-text-typography-full` props) — **regressed** some landmarks (Checkout h2); reverted.
3. **Plugin isolation** — empty plugins, fo-327-only, temporal-only: **all medY=2, fp=92.7%**. The 2px shift is **not introduced by production clone plugins**; it is SnapDOM FO raster vs live compositor floor at DPR=2.
4. **Canvas shift sweep** — `+2 device px` on 632px canvas → medY=0 but fullPage=0 (white band); confirms shift direction but not shippable without height parity.
5. **3000+ prior experiments** — **zero** methods with `medY ≤ 0.5` and `fullPage ≥ 90%`. Only `rad-00000` Playwright clip reaches medY=0 / fp=100% (different capture path).

### Diagnosis

- DOM mirror rects: **ΔY≈0** on text nodes; pixel centroids diverge from **FO rasterization**, not layout boxes.
- Playwright live clip (`scale:device`): **634** device px tall; SnapDOM canvas: **632** (316 CSS × DPR2). Playwright `scale:css` reports **317** CSS px height — compositor screenshot footprint ≠ `lockedCaptureDimensions` (315.78125 rect → 316 CSS). This contributes to bbox comparison bias; cropping top 2px of live clip zeroes landmark medY in isolation but breaks fullPage.
- Production `fo-327-reset` has **no** `translateY(1px)` magic (confirmed in source + experiments mirror).

### E2E

Not run — no shippable capture-path change.

### Next iteration

1. **`drawElementImage` / HTML-in-Canvas** when flag available (bypass FO path) — experiment-only today.
2. **Bbox methodology:** normalize live Playwright clip device height to SnapDOM canvas before pixel compare (diagnostic, not production).
3. **`txc-*` / font metrics override** batch — `@font-face` ascent/descent from `measureText`, `copy-leading-trim-edge`, `range-ink-margin-top` (computed margin, not global translateY).
4. SnapDOM upstream — FO text baseline / device-pixel paint origin issue at fractional `getBoundingClientRect().height`.

## Production capture today (`src/capture-snapdom.js`)

Factual baseline only — not experiment conclusions:

- **Dimensions** — measure `#capture-target`, snap width/height to the device-pixel grid.
- **Fonts** — `document.fonts.ready` plus animation frames before SnapDOM.
- **SnapDOM options** — `scale: 1`, `embedFonts: true`, DPR capped via `vl-config`.
- **Clone plugins** — temporal freeze; foreignObject inner-div reset for SnapDOM #327.
- **Overflow** — clip scrollbars during capture only.
- **Warm passes** — three SnapDOM `toCanvas` passes before keeping the final canvas.

## For agents

Read [`.cursor/rules/capture-no-overfit.mdc`](../.cursor/rules/capture-no-overfit.mdc). Do not copy fixture-only experiment winners into `capture-snapdom.js`. Ship only mechanisms that make sense for any site in `#capture-target`.

## Radical hypotheses

**Not more FO/grid permutations** — alternate capture *paths* and generic settle/calibrate gates. Catalog: `scripts/snapdom-radical-catalog.mjs` (prefix `rad-`). Runner hooks in `scripts/snapdom-capture-experiments.mjs`.

```bash
npm run visual-diff:experiments:radical
EXP_RADICAL_COUNT=48 EXP_LIMIT=5 POOL_SIZE=2 npm run visual-diff:experiments:radical
EXP_RESET=1 npm run visual-diff:experiments:radical
```

### New export paths (experiment-only)

| Export | Hypothesis |
|--------|------------|
| `playwright-clip-screenshot` | Live compositor clip via Playwright — **diagnostic ceiling** (~0px shift if measurement is sound) |
| `double-pass-diff-calibrate` | SnapDOM pass 1 → scan ink vs live Range rects → median ΔY → canvas shift (computed, no magic px) |
| `live-bitmap-overlay-diff` | Same calibrator as double-pass (landmark ink correlation) |
| `snapdom-to-svg-raster` | `snapdom().toSvg()` → rasterize (bypass direct `toCanvas` text pipeline) |
| `drawElementImage-onpaint` | WICG HTML-in-Canvas via `onpaint` + `layoutsubtree` |
| `captureElementImage-offscreen` | `captureElementImage` → OffscreenCanvas worker transfer |
| `element-capture-api` | RestrictionTarget + getDisplayMedia (Chrome 132+; blocked without user gesture in CI) |
| `view-transition-snapshot` | View Transitions API — **dead end** until per-element bitmap is exposed |

### New preCapture hooks

- `explicit-font-load` — `document.fonts.load()` for every computed face in `#capture-target`
- `observer-settle` — ResizeObserver + IntersectionObserver stable before capture
- `paint-holding` — fonts.ready + triple layout signature + idle
- `stacking-context-eligible` — force stacking context on `#capture-target` (Element Capture eligibility)

### New clone plugins

- `exclude-decorative-nodes` — strip `aria-hidden` / presentation nodes before clone
- `strip-motion-elements` — remove SnapDOM `motion`/`motiondiv` wrappers
- `content-visibility-auto-clone`, `contain-strict-clone`, `contain-layout-clone`, `isolation-isolate-clone`

### Research notes (2026-05-24)

- **Playwright clip** validates the bbox pipeline; any SnapDOM method worse than ~0px vs clip confirms clone/SVG/FO drift, not measurement noise.
- **Double-pass diff-calibrate** is generic (median ink shift from live Range vs snap canvas scan) — worth comparing to production baseline even if shift is small; failure modes include sparse text and anti-aliasing band noise.
- **Element Capture / getDisplayMedia** and **View Transition snapshot** are not automatable headless today — documented as dead ends for CI, not production paths.
- **HTML-in-Canvas** (`drawElementImage`, `captureElementImage`) needs Chrome origin trial / flag — when available, uses native layout engine instead of foreignObject.
- **Skia/WASM raster** — no browser-native path without reimplementing layout; not pursued.
- Prior FO shift grids, typography copy, text-box-trim, Range offsets, outerTransforms — exhausted in txt-/research catalogs; radical wave intentionally avoids those combos.
