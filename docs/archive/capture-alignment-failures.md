# Capture alignment — failed attempts

Companion to [`capture-alignment-experiments.md`](./capture-alignment-experiments.md) and [`capture-alignment-strategy.md`](./capture-alignment-strategy.md). This doc records **what we tried, what failed, and why** — so future agents do not re-grind the same hypotheses.

**Status:** NOT FIXED — production baseline remains **medY=2**, **fullPage=92.7%** (`txt-00000`).

---

## General why it didn't work

SnapDOM captures `#capture-target` by cloning the DOM into SVG **foreignObject** elements and rasterizing them to canvas. The live page paints text through the **browser compositor** (HTML layout + GPU text). Those two paths disagree on where **ink** lands by about **2 device pixels at DPR=2** (~1 CSS px), even when **layout boxes match** (DOM mirror rects show ΔY≈0 on text nodes).

Nothing in our clone CSS, typography copy, font-settle gates, or SnapDOM option permutations removes that gap **without a Pareto tradeoff**: methods that drive landmark `medianCorrelationShiftY_pixels` (medY) toward 0 collapse `fullPageCorrelationMatchPct` (fullPage) to ~0–15%. ~1,190 of 3,182 tested rows sit on that cliff (medY≤0.5, fullPage<5%). The ~260 methods that tie production at **medY=2 / fullPage=92.7%** form a flat plateau — combinatorial grids are not finding a hidden knob.

Measurement adds a secondary bias: Playwright live-clip screenshots are **634 device px** tall while SnapDOM canvas is **632** (316 CSS × DPR2). Live compositor footprint ≠ `lockedCaptureDimensions` from fractional `getBoundingClientRect().height`. Cropping 2px from the live side zeroes landmark medY in isolation but breaks full-page correlation — so bbox metrics alone can overstate fixability.

**Bottom line:** the ~2px shift is structural to SnapDOM's FO raster path vs live compositor paint, not a missing production plugin. Fixes require upstream SnapDOM changes, an alternate capture path (e.g. HTML-in-Canvas when available), or accepting the plateau for VLA grounding.

---

## Failed approach categories

| Category | What we tried | Result | Why it failed |
|----------|---------------|--------|---------------|
| **Magic px FO shift grids** | Hardcoded `fo-shift-y@*`, `fo-inner-translate@*`, `fo-ascent-ratio@*`, `fo-linegap@*`, `translateHalf`, global `translateY(Npx)` sweeps | **Removed from catalogs**; ~1,189 legacy rows in `results.jsonl` show medY=0, fullPage=0% | False positives: shifting FO content breaks full-page pixel correlation while landmark centroids align. Not generic; fixture-specific px fudges. |
| **Computed FO shift plugins** | `fo-shift-y-up-fontsize`, `fo-shift-inner-measuretext-ascent` (measureText-derived, not grid) | medY→0, fullPage→0% (same cliff as magic grids) | Computed offset still applies a global/per-node translate inside FO; fixes landmark ink at cost of layout/background correlation. |
| **FO #327 reset variants alone** | `fo-327-reset` with/without other plugins; isolation runs (empty plugins vs 327-only) | **Tie** at medY=2, fullPage=92.7% — no improvement over baseline | #327 reset is already in production. Extra 327 combos (872 txt rows) either tie or hit Pareto cliff. The 2px gap is not introduced by production clone plugins. |
| **Range ink offset / getClientRects / measureText ascent plugins** | `range-ink-margin-top`, `fo-ink-offset-from-range`, `fo-y-from-range-top`, getClientRects union, measureText ascent/descent FO offsets | medY=0–1 on many rows; **fullPage=0%** (361 txt + 178 onl non-error rows; txc-00003/04/05/07/09 regressed to medY=4–8, fullPage=5–14%) | Per-node margin/translate from live Range rects over-corrects FO raster vs box top. Landmarks move; page background, borders, and non-text pixels misalign. Classic Pareto cliff. |
| **text-box-trim CSS live/clone** | `text-box-trim`, `text-box-edge`, `leading-trim`, `copy-text-box-trim`, `copy-leading-trim-edge` | **Tie** (medY=2, fullPage=92.7%) or slight fullPage regression (txc-00002/06/08: 80–86%) | Trim removes half-leading in live layout but SnapDOM FO path does not mirror trim semantics at raster time. No medY win. |
| **Typography computed copy (full stack)** | `copy-text-typography-full`, font-feature/variation/synthesis, line-height/vertical-align/alignment-baseline sweeps | **Tie** or **regression** (think-007: fullPage=22.5%; Checkout h2 landmarks worse in manual runs) | Layout CSS copies correctly; ink position is raster-path issue, not missing computed style. Full copy can desync clone from FO defaults. |
| **Font settle gates** | `fonts.ready`, double/triple layout, `requestIdleCallback`, `document.fonts.check()`, explicit `fonts.load()`, preCache, 7 warm passes (752 txt rows) | **Tie** at medY=2 (think-002/003/005; txt-00004/00005/00006) | Font loading race is not the bottleneck; FO raster floor differs from compositor even after settle. |
| **embedFonts false/true variants** | `embedFonts: false`, `embedFonts: true` + preCache/localFonts combos (748 txt rows) | **Tie** at medY=2, fullPage=92.7% (txt-00003) | Font embedding changes file resolution, not FO text paint origin. |
| **outerTransforms / SVG abs dims** | `outerTransforms: false`, `fo-svg-abs-dims`, preserveAspectRatio, SVG→raster export | **Tie** or cliff (var-00016 tie; var-00002 navigation errors) | Transform/dimension flags affect SVG box sizing, not FO text baseline vs compositor ink. |
| **dim lock / postCanvas floor/integer** | subpixel snap, floor/integer canvas, inflate/deflate, raw dim rounding (45 txt rows; onl-00009 medY=0, fp=0%) | **Tie** or cliff | Integer rounding changes canvas size vs live clip; floor/integer draw can fix one metric while white-band or correlation loss kills fullPage. |
| **drawElementImage (WICG HTML-in-Canvas)** | `drawElementImage`, `drawElementImage-onpaint`, `captureElementImage` in onl/var/rad/think catalogs | **Error:** `drawElementImage unavailable (enable chrome://flags/#canvas-draw-element)` — 6+ rows, no metrics | Chrome origin trial / flag not enabled in experiment runner. Cannot validate FO-bypass path in CI/dev without flag. |
| **Double-pass pixel calibrate** | `double-pass-diff-calibrate`: SnapDOM pass 1 → scan ink vs live Range → median ΔY → canvas shift | **Regressed:** rad-00002/03/04 medY=8, fullPage=74.8% | Calibrated shift overcorrects (sparse text, AA band noise, 634 vs 632px height mismatch). Worse than baseline. |
| **Viewport lock timing** | Pre-lock viewport before SnapDOM, re-measure rect after DPR snap (think-001, think-011) | think-001 **tie**; think-011 **error** (navigation destroyed context) | Order of measure→snap→lock is not the 2px ink source. Pre-lock + typography copy destabilized runner. |
| **Subpixel inflate/deflate** | subpixel dim lock, canvas inflate/deflate pre-draw (var-00011: medY=3, fp=38.7%) | Regression or cliff | Changes drawable area without matching live compositor footprint. |
| **Creative/res/uniq/cre grid combinatorics** | res-* (1000), cre-* (1000), uniq-* (1000), cook-* (150) — mixed-radix plugin/preCapture/CSS/postCanvas combos | **0 tested** in `results.jsonl` as of 2026-05-24; prior txt/onl/var coverage (~3,000+ rows) already shows **zero** strict winners (medY<2 AND fullPage≥90%) | Exhaustive combinatorics on same fixture unlikely to escape plateau; untested catalogs inherit same plugin vocabulary already swept in txt/onl. |
| **Evolve-100k genetic search** | 25k genomes × 3 runs; high-impact parent retention | Best survivors medY=0–0.1, **fullPage=0–0.1%** (see `tried-methods.txt`) | Evolution rediscovered Pareto cliff — medY wins that destroy fullPage. Not a production path. |
| **Playwright clip (SnapDOM bypass)** | `playwright-clip-screenshot` (rad-00000/00001) | medY=0, fullPage=100% | **Works as diagnostic ceiling only** — uses live compositor, not SnapDOM. Confirms measurement pipeline; not shippable per client-side-only rules (requires Playwright/Node, not in-browser product). |
| **Element Capture / View Transitions / getDisplayMedia** | rad catalog entries | Dead end — blocked without user gesture; not automatable in CI | Not a product capture path. |
| **Canvas +2 device px post-shift** | Manual sweep: shift 632px canvas down 2px | medY=0, **fullPage=0%** (white band) | Proves shift direction but breaks height parity with live page. |

---

## Catalog inventory — status per batch

Data source: `assets/visual-diff/experiments/results.jsonl` (3,182 rows, 2026-05-24). Baseline: `txt-00000` — **medY=2**, **fullPage=92.7%**. Ship bar for generic candidates: medY<2 **and** fullPage≥90% — **no non-rad method meets both**.

| Batch | Prefix | Catalog size | Tested | Best result | Verdict |
|-------|--------|-------------:|-------:|-------------|---------|
| Text / typography | `txt-` | 500 | 2,946* | medY=0, fp=0.6% (`txt-01132` — cliff) | **Failed** — 242 ties at baseline; 0 strict winners; 1,183 cliff rows |
| Online research | `onl-` | 200 | 189 | medY=0, fp=0% (`onl-00007` — cliff) | **Failed** — 1 tie; 11 drawElementImage errors |
| Research combinatorial | `res-` | 1,000 | 0 | — | **Untested dead-end** — same plugin vocabulary as txt/onl |
| Varied diverse | `var-` | 100 | 20 | medY=2, fp=92.7% (9 ties) | **Failed / tie** — no beat; 11 runner errors |
| Creative | `cre-` | 1,000 | 0 | — | **Untested dead-end** |
| Unique combinatorial | `uniq-` | 1,000 | 0 | — | **Untested dead-end** |
| Cooked | `cook-` | 150 | 0 | — | **Untested dead-end** |
| Radical paths | `rad-` | 40 | 5 | medY=0, fp=100% (`rad-00000` Playwright clip) | **Diagnostic-only** for clip; double-pass **failed** |
| Strategic think | `think-` | 12 | 12 | medY=2, fp=92.7% (9 ties) | **Failed / tie** — think-007 regressed fp; think-010/011 errors |
| Text creative | `txc-` | 60 | 10 | medY=2, fp=92.7% (2 ties) | **Failed** — Range/FO combos regressed badly |

\*txt count >500 includes reruns, legacy rows, and expanded historical ids in `results.jsonl`.

**Plateau ties:** ~263 rows exactly match baseline medY=2 / fullPage=92.7%.

**Strict winners (medY<2 AND fullPage≥90%):** 2 rows — both `rad-00000` and `rad-00001` (Playwright clip only).

---

## What actually works

| Approach | medY | fullPage | Notes |
|----------|-----:|---------:|-------|
| **Production baseline** (`src/capture-snapdom.js`, `txt-00000`) | 2 | 92.7% | Subpixel dim snap, fonts.ready + 3 rAF, FO #327 reset, temporal freeze, 3 warm passes, overflow clip. Best **shippable** SnapDOM path. |
| **Playwright clip** (`rad-00000`) | 0 | 100% | Live compositor screenshot — validates bbox pipeline and proves SnapDOM FO is the drift source. **Experiment/diagnostic only**; not product capture (Node/Playwright, violates in-browser-only product path). |

For **VLA grounding** (ShowUI on large buttons): 2px on ~800px capture ≈ 0.25% normalized error — likely tolerable. v-toggle visual polish ≠ Find accuracy.

---

## Do not retry

Explicit list — these categories are exhausted or structurally blocked:

1. **Hardcoded px shift grids** — `fo-shift-y@*`, `fo-inner-translate@*`, `fo-ascent-ratio@*`, `fo-linegap@*`, `translateHalf`, global canvas `translateY(Npx)` sweeps.
2. **More txt/onl/res/cre/uniq combinatorial grids** on the built-in fixture without a new capture *path* or upstream SnapDOM fix.
3. **Range/getClientRects/measureText ink offset plugins** as production candidates — Pareto cliff (landmarks vs fullPage).
4. **Full typography computed copy** into clone — tie or regression; does not fix FO raster ink.
5. **text-box-trim / leading-trim copy alone** — no medY improvement on SnapDOM FO path.
6. **Font settle permutations** (preCache, fonts.check, idle, 7 warm passes) — all tie baseline.
7. **embedFonts true/false grids** — tie baseline.
8. **outerTransforms / SVG abs dims / subpixel inflate-deflate** — tie or cliff.
9. **Double-pass diff-calibrate** — regressed to medY=8.
10. **Canvas post-shift by fixed device px** — medY=0 but fullPage=0%.
11. **Evolve-100k / genetic search** on same metric space — rediscovers cliff winners with fullPage≈0%.
12. **drawElementImage** until Chrome flag `#canvas-draw-element` is enabled in the experiment runner (then retest once, not grid).
13. **Playwright clip as product capture** — diagnostic ceiling only.
14. **Fixture-only CSS tuning** (vertical-align middle, global line-height hacks) — see `capture-no-overfit.mdc`.
15. **DOM-derived coord fixes** — forbidden for grounding; does not fix capture anyway.

### Worth one retest when unblocked (not a grid)

- **drawElementImage / HTML-in-Canvas** — single baseline vs production when Chrome flag available; bypasses FO entirely.
- **SnapDOM upstream bump** — changelog for FO text positioning (#327 follow-ups).
- **E2E A/B** — intentional 0/1/2px capture offset vs green-circle Find (empirical grounding sensitivity, not visual-diff).

---

## Related files

| File | Role |
|------|------|
| `assets/visual-diff/experiments/results.jsonl` | All experiment metrics |
| `scripts/snapdom-capture-experiments.mjs` | Runner + plugins |
| `scripts/snapdom-*-catalog.mjs` | Method catalogs (see header `Verdict:` comments) |
| `tried-methods.txt` | Evolve-100k run summaries |
| `docs/capture-alignment-strategy.md` | When to stop gridding; recommendations |
