# Capture alignment — strategy memo (2026-05-24)

## Inventory: what 3k+ experiments taught us

**Problem:** SnapDOM paints text ~1–2px higher/lower than live DOM ink inside `#capture-target`. VLA grounding reads screenshot pixels.

**Baseline (production path, `txt-00000`):**

| Metric | Value |
|--------|-------|
| `medianCorrelationShiftY_pixels` (medY) | **2** |
| `fullPageCorrelationMatchPct` (fullPage) | **92.7%** |
| `maxAbsDeltaY_pixels` | 2 |

**Grid coverage:** ~3,135 results across `txt-` (500), `onl-` (200), `res-` (1000+) catalogs. Typography, FO #327, Range/measureText offsets, preCache, dim locks, canvas baselines, text-box-trim, drawElementImage.

**Critical finding — Pareto cliff:** No strict non-magic method beats baseline on **both** medY and fullPage. Methods that reach medY=0 (Range offset, lineheight-from-range, FO y adjust, subpixel inflate/deflate) collapse fullPage to ~0–1%. The sweet spot (fullPage≥90, medY≤2) is a **flat plateau**: ~260 variants all tie at medY=2 / fullPage=92.7% with production.

**Implication:** Further combinatorial grids on the built-in fixture are unlikely to discover a magic combo. The 1px ink gap may be structural (foreignObject raster path vs live HTML layout), not a missing CSS knob.

## What is already in production (`capture-snapdom.js`)

- Subpixel dimension snap (`captureSubpixelSnapDim` / `lockedCaptureDimensions`)
- `fonts.ready` + 3 rAF before SnapDOM
- FO #327 inner-div reset plugin
- Temporal freeze + computed `lineHeight` / `verticalAlign` copy
- 3 warm `toCanvas` passes, overflow clip during capture
- `main.js`: post-capture `syncViewportContentBox` + DPR grid snap on viewport transform

## Untried / underexplored angles

### 1. Upstream SnapDOM
- Bump `@zumer/snapdom` beyond 2.12.0; re-read #327 / changelog for FO text positioning fixes.
- **preCache** before first capture on cold load (production never calls it; experiments show tie with baseline).
- Report upstream if Range-offset plugins fix landmarks but break full-page correlation.

### 2. Capture timing (not yet production)
- `document.fonts.check()` poll until all faces used in `#capture-target` report loaded.
- Scroll/layout settle: stable `scrollTop` across frames, `requestIdleCallback`, longer post-font rAF.
- Order: viewport lock **before** vs **after** SnapDOM (today: measure rect → snap → then lock viewport from canvas).

### 3. Live vs snapshot viewport lock (`main.js`)
- v-toggle compares live iframe to snapshot; lock uses pre-capture `getBoundingClientRect` offsets.
- Hypothesis: re-measuring rect **after** viewport DPR snap transform may reduce 1px v-toggle drift.
- Hypothesis: `offsetWidth/offsetHeight` vs `getBoundingClientRect` for dim lock (integer box vs fractional ink).

### 4. Measurement — are we optimizing the wrong thing?
- **Landmarks** (header band text): medY=2px — what users notice on v-toggle.
- **fullPage** (92.7%): structural/layout correlation; drops to 0% when ink plugins “fix” landmarks.
- **E2E Find** uses full screenshot + ShowUI — unknown sensitivity to 1–2px text shift vs button fill color.
- Consider adding an E2E A/B: intentionally shift capture 1px before Find; measure green-circle hit rate.

### 5. Generic production candidates (validate, don’t ship from fixture alone)
- **`fo-ink-offset-from-range` / `fo-y-from-range-top`:** computed per-node from live Range — generic story, but fullPage=0 in grid → needs real-site validation before production.
- **`fo-text-top-adjust`:** marginTop from Range delta (no magic px) — same cliff.
- **drawElementImage** (WICG): bypasses FO entirely; Chrome flag — alternative product path if SnapDOM FO is the root cause.

### 6. Acceptance — is 2px / 92% good enough?
- For **ShowUI grounding on buttons**: 2px on 800px capture ≈ 0.25% norm error; Submit/Cancel are large targets — likely tolerable.
- v-toggle **visual polish** ≠ **Find accuracy** — prioritize E2E over medY→0 on fixture.
- Ship bar (`capture-no-overfit.mdc`): generic mechanism + bbox metrics + no fullPage collapse.

### 7. Alternative product path — browser-use / voice
- Voice **click** and browser-use act on **live DOM** after Find projects coords from screenshot to viewport.
- Misalignment hurts when: (a) user compares v-toggle ink, (b) small text targets, (c) coord projection uses stale rect.
- For large buttons, live click may absorb 1–2px; screenshot alignment matters less for voice than for visual trust.

## Top 3 recommendations (next experiments)

| # | Hypothesis | Rationale | Catalog |
|---|------------|-----------|---------|
| **1** | **Viewport lock timing** — sync viewport box + DPR snap *before* SnapDOM, re-measure rect | Tests whether production order (snap then lock) leaves 1px framing drift on v-toggle | `think-001`, `think-011` |
| **2** | **Font/layout settle** — `fonts.check()` + scroll-stable + idle before capture | Cheap timing change; no magic px; may shrink race between font raster and FO paint | `think-002`, `think-003` |
| **3** | **Computed ink offset without fullPage collapse** — Range→marginTop (`fo-text-top-adjust`) vs FO-y vs transform; plus drawElementImage baseline | Validates whether any generic offset path keeps fullPage≥90 while medY<2 | `think-007`–`think-010` |

**Deprioritize:** More `txt-`/`res-` combinatorial grids, magic px shifts, fixture-only CSS (vertical-align middle, global line-height).

**Parallel track (not visual-diff):** E2E Find with intentional 0/1/2px vertical capture offset — empirical grounding sensitivity.

## Commands

```bash
npm run dev   # required
npm run visual-diff:bbox-visual
npm run visual-diff:experiments:think
EXP_THINK_ONLY=1 EXP_THINK_COUNT=12 POOL_SIZE=4 npm run visual-diff:experiments:think
```

Results append to `assets/visual-diff/experiments/results.jsonl` with `think-` prefix.
