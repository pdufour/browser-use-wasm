import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { E2E_BROWSER_LOADABLE_MODEL_IDS as PICKER_LOADABLE_MODEL_IDS } from '../../scripts/e2e-model-ids.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Opt-in multi-model benchmark (`npm run test:benchmark`).
 * `E2E_EXPENSIVE=1` is a deprecated alias.
 */
export const E2E_BENCHMARK =
  process.env.E2E_BENCHMARK === '1' ||
  process.env.E2E_BENCHMARK === 'true' ||
  process.env.E2E_EXPENSIVE === '1' ||
  process.env.E2E_EXPENSIVE === 'true';

/** @deprecated Use `E2E_BENCHMARK`. */
export const E2E_EXPENSIVE = E2E_BENCHMARK;

/** Gate results (`npm run test`); benchmark uses `e2e-benchmark-results.txt` unless overridden. */
export const E2E_RESULTS_FILE =
  process.env.E2E_RESULTS_FILE ??
  path.join(
    __dirname,
    E2E_BENCHMARK ? '../../e2e-benchmark-results.txt' : '../../e2e-results.txt'
  );

/**
 * Production E2E gate model — must match `BROWSER_VALIDATED_MODEL_IDS` in `src/config/models/registry.js`.
 * Pick after `npm run test:benchmark`; do not compare all models in default CI.
 */
export const E2E_MODEL_ID = process.env.E2E_MODEL ?? 'ShowUI-2B';

/** Second model for benchmark switch round-trip when cached. */
export const E2E_SWITCH_MODEL_ID = process.env.E2E_SWITCH_MODEL ?? 'MAI-UI-2B';

export { PICKER_LOADABLE_MODEL_IDS };
export { PICKER_LOADABLE_MODEL_IDS as E2E_BROWSER_LOADABLE_MODEL_IDS };

/**
 * First loadable picker id not in manifest (for uncached-revert test).
 * @param {Set<string>} cached
 * @returns {string | null}
 */
export function resolveUncachedPickerTarget(cached) {
  const forced = process.env.E2E_UNCACHED_MODEL?.trim();
  if (forced && !cached.has(forced)) return forced;
  return (
    PICKER_LOADABLE_MODEL_IDS.find((id) => id !== E2E_MODEL_ID && !cached.has(id)) ?? null
  );
}

/** Playwright expect() messages include ANSI when FORCE_COLOR is set — strip before writing files. */
function stripAnsi(text) {
  return String(text ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\[[0-9;]*m/g, '');
}

/**
 * Plain-text failure for e2e-results.txt (no ANSI, no duplicate "Error:" prefixes).
 * @param {string} raw
 */
function formatE2eError(raw) {
  let s = stripAnsi(raw).trim();
  while (/^Error:\s*/i.test(s)) s = s.replace(/^Error:\s*/i, '').trim();
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines[0] ?? s;
  return lines.join('\n  ');
}

/**
 * Objective E2E timeouts — keep low; fix perf instead of raising these.
 * @see `.cursor/rules/blackbox-e2e.mdc`
 */
/** Must match `INFERENCE_TIMEOUT_MS` in `src/config/vl.ts`. */
export const INFERENCE_TIMEOUT_MS = 12_000;
/** Playwright per-test ceiling — autoload envelope only; polls stay at INFERENCE_TIMEOUT_MS. */
export const E2E_TEST_TIMEOUT_MS = 120_000;
/** Playwright whole-suite cap (gate cases on one model). */
export const E2E_GLOBAL_TIMEOUT_MS = 8 * 60_000;
/** Model autoload — ShowUI-2B ~4s; larger VL GGUFs only when `E2E_MODEL` ≠ ShowUI-2B. */
const LOAD_TIMEOUT_MS = 60_000;
const LOAD_TIMEOUT_MS_LARGE = 180_000;
/** SnapDOM + JPEG encode on capture (not task inference). */
const CAPTURE_READY_TIMEOUT_MS = 20_000;
/** Voice tools that run ShowUI (pointer tools `click`/`hover`/…, `input`, `select`, `toggle_checkbox`, `clear_field`, `focus_field`, `blur_field`). */
export const VOICE_GROUNDING_WAIT_MS = (INFERENCE_TIMEOUT_MS * 3) + 5000;
/** Voice tools that only touch live DOM (modal, keys, focus, blur, scroll_to_top). */
export const VOICE_DOM_WAIT_MS = (INFERENCE_TIMEOUT_MS * 2) + 5000;
/** Screenshot panel must show canvas/img after SnapDOM (never wait forever). */
const SCREENSHOT_READY_TIMEOUT_MS = 10_000;

/**
 * Optional comma list to narrow benchmark runs, e.g. `E2E_BENCHMARK_MODELS=GUI-G2-3B,MAI-UI-2B`.
 * `E2E_EXPENSIVE_MODELS` is a deprecated alias.
 * @returns {string[]}
 */
export function resolveBenchmarkModelIds() {
  const list =
    process.env.E2E_BENCHMARK_MODELS ?? process.env.E2E_EXPENSIVE_MODELS ?? '';
  const forced = list.split(/[\s,]+/).filter(Boolean);
  const base = forced.length ? forced : PICKER_LOADABLE_MODEL_IDS;
  return base.filter((id) => PICKER_LOADABLE_MODEL_IDS.includes(id));
}

/** @deprecated Use `resolveBenchmarkModelIds`. */
export const resolveExpensiveModelIds = resolveBenchmarkModelIds;

/** Per-model ceiling: large GGUF load + capture + task inference. */
export const E2E_BENCHMARK_TEST_TIMEOUT_MS =
  LOAD_TIMEOUT_MS_LARGE + CAPTURE_READY_TIMEOUT_MS + INFERENCE_TIMEOUT_MS * 2 + 60_000;

/** @deprecated Use `E2E_BENCHMARK_TEST_TIMEOUT_MS`. */
export const E2E_EXPENSIVE_TEST_TIMEOUT_MS = E2E_BENCHMARK_TEST_TIMEOUT_MS;

/** Whole benchmark suite (~10 models × per-test budget). */
export const E2E_BENCHMARK_GLOBAL_TIMEOUT_MS =
  resolveBenchmarkModelIds().length * E2E_BENCHMARK_TEST_TIMEOUT_MS + 3 * 60_000;

/** @deprecated Use `E2E_BENCHMARK_GLOBAL_TIMEOUT_MS`. */
export const E2E_EXPENSIVE_GLOBAL_TIMEOUT_MS = E2E_BENCHMARK_GLOBAL_TIMEOUT_MS;

const DONE_RE =
  /Parsed actions|Error:|timed out|no parsable action|Capture changed during inference/i;

/** @returns {string} */
function e2eTs() {
  return new Date().toISOString();
}

/** @type {string} */
let lastE2ePhase = 'init';

/** @type {import('@playwright/test').Page | null} */
let e2eConsolePage = null;
/** @type {number[]} */
let workerInferenceMs = [];
/** @type {Record<string, unknown>[]} */
let perfEvents = [];

/**
 * One console hook per Playwright page (serial E2E reuses the same page).
 * @param {import('@playwright/test').Page} page
 */
export function installE2eConsole(page) {
  if (e2eConsolePage === page) return;
  e2eConsolePage = page;
  resetE2ePerfRound();
  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[(perf|worker|main|e2e|e2e:phase|voice-nav):/i.test(text)) {
      console.log(text);
    }
    const perfJson = parsePerfJsonLine(text);
    if (perfJson) perfEvents.push(perfJson);
    const inf = text.match(/\[worker:completion\] ([\d.]+)ms/);
    if (inf) workerInferenceMs.push(Math.round(parseFloat(inf[1])));
  });
}

function resetE2ePerfRound() {
  workerInferenceMs = [];
  perfEvents = [];
}

/**
 * @param {string} phase
 * @param {string} [detail]
 */
function setE2ePhase(phase, detail = '') {
  lastE2ePhase = phase;
  const suffix = detail ? ` ${detail}` : '';
  console.log(`[e2e:phase] ${e2eTs()} ${phase}${suffix}`);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
/**
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeoutMs]
 */
async function waitForScreenshotImage(page, timeoutMs = SCREENSHOT_READY_TIMEOUT_MS) {
  await page.waitForFunction(
    () => {
      const img = document.getElementById('screenshot-img');
      if (!img) return false;
      if (img.tagName === 'CANVAS') return img.width > 100;
      return !!img.complete && img.naturalWidth > 100;
    },
    { timeout: timeoutMs }
  );
}

/**
 * Blackbox layout guard for the snapshot panel.
 *
 * Sibling UI-cluster fix (`5f83fa3c`) targets ~2.26 aspect for SnapDOM capture.
 * A CSS regression that squashes #screenshot-img or hides URL chrome behind it
 * would silently pass current task cases — these asserts catch that.
 *
 *  - Displayed `#screenshot-img` aspect must match the natural bitmap aspect
 *    within `aspectTolerance` (defaults to 8%).
 *  - The displayed aspect must stay within sane bounds (browser viewport ratios).
 *  - `#screenshot-img` must not overlap `.goal-panel` (no Z/Y/X overflow).
 *  - The minimal URL bar (`.browser-url-bar`) must NOT host the secondary
 *    chrome IDs that were moved to the off-screen E2E shelf (bookmark / history
 *    / copy URL / open external / zoom in/out).
 *
 * NOTE: this helper assumes a fresh capture has rendered `#screenshot-img`.
 * Call `waitForScreenshotImage(page)` before invoking.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ aspectTolerance?: number; aspectMin?: number; aspectMax?: number }} [opts]
 */
export async function assertSnapshotLayoutBlackbox(page, opts = {}) {
  const aspectTolerance = opts.aspectTolerance ?? 0.08;
  const aspectMin = opts.aspectMin ?? 1.0;
  const aspectMax = opts.aspectMax ?? 3.0;

  // Wait briefly for layout to settle; rendered size depends on flex sizing
  // inside `.browser-viewport`. We poll up to 5s so we don't paper over a
  // genuine squash by running too early.
  try {
    await page.waitForFunction(
      ({ aspectTolerance, aspectMin, aspectMax }) => {
        const img = document.getElementById('screenshot-img');
        const panel = document.querySelector('.goal-panel');
        if (!img || !img.clientWidth || !img.clientHeight) return false;

        const nw = img.tagName === 'CANVAS' ? img.width : img.naturalWidth;
        const nh = img.tagName === 'CANVAS' ? img.height : img.naturalHeight;
        if (!nw || !nh) return false;

        const naturalAR = nw / nh;
        const displayAR = img.clientWidth / img.clientHeight;
        const ratioOk =
          Math.abs(naturalAR - displayAR) / Math.max(naturalAR, 0.001) <= aspectTolerance;
        const displayAspectOk = displayAR >= aspectMin && displayAR <= aspectMax;

        if (panel) {
          const ir = img.getBoundingClientRect();
          const pr = panel.getBoundingClientRect();
          const overlapHoriz = !(ir.right <= pr.left || ir.left >= pr.right);
          const overlapVert = !(ir.bottom <= pr.top || ir.top >= pr.bottom);
          if (overlapHoriz && overlapVert) return false;
        }

        return ratioOk && displayAspectOk;
      },
      { aspectTolerance, aspectMin, aspectMax },
      { timeout: 5_000 }
    );
  } catch (err) {
    const debug = await page.evaluate(() => {
      const img = document.getElementById('screenshot-img');
      const panel = document.querySelector('.goal-panel');
      if (!img) return { ok: false, reason: 'no #screenshot-img' };
      const nw = img.tagName === 'CANVAS' ? img.width : img.naturalWidth;
      const nh = img.tagName === 'CANVAS' ? img.height : img.naturalHeight;
      const ir = img.getBoundingClientRect();
      const pr = panel?.getBoundingClientRect() ?? null;
      return {
        ok: false,
        natural: { w: nw, h: nh, aspect: nw && nh ? nw / nh : null },
        display: {
          w: img.clientWidth,
          h: img.clientHeight,
          aspect: img.clientWidth && img.clientHeight ? img.clientWidth / img.clientHeight : null,
        },
        imgRect: ir,
        panelRect: pr,
      };
    });
    throw new Error(
      `assertSnapshotLayoutBlackbox: layout did not settle within 5s. ${JSON.stringify(debug)}\n${err}`
    );
  }

  // URL bar must be minimal — bookmarks/history/zoom chrome was removed entirely.
  const urlBar = page.locator('.browser-url-bar');
  await expect(urlBar).toBeVisible();
  await expect(urlBar.locator('#btn-browser-refresh')).toHaveCount(1);
  for (const removedId of [
    '#btn-browser-back',
    '#btn-browser-forward',
    '#btn-browser-bookmark',
    '#btn-browser-history',
    '#btn-browser-zoom-in',
    '#btn-browser-zoom-out',
  ]) {
    await expect(page.locator(removedId)).toHaveCount(0);
  }
}

async function logE2eTimeoutContext(page, label) {
  const status =
    (await page.locator('#model-status').textContent().catch(() => null)) ?? '(no #model-status)';
  const raw =
    (await page.getByTestId('raw-output').textContent().catch(() => null)) ?? '(no #raw-output)';
  const statusSnippet = status.trim().replace(/\s+/g, ' ').slice(0, 200);
  const rawSnippet = raw.trim().replace(/\s+/g, ' ').slice(0, 300);
  console.log(
    `[e2e:phase] ${e2eTs()} TIMEOUT ${label} last=${lastE2ePhase} model-status="${statusSnippet}" raw-output="${rawSnippet}"`
  );
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} phase
 * @param {() => Promise<unknown>} fn
 */
async function e2ePhaseRun(page, phase, fn) {
  const t0 = Date.now();
  setE2ePhase(`${phase}:start`);
  try {
    const result = await fn();
    setE2ePhase(`${phase}:done`, `${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    await logE2eTimeoutContext(page, phase);
    throw err;
  }
}

/** Bottom-right green Submit band on SnapDOM capture (not header nav). */
const SUBMIT_NX_MIN = 0.6;
const SUBMIT_NX_MAX = 0.95;
const SUBMIT_NY_MIN = 0.58;
const SUBMIT_NY_MAX = 0.95;
const CANCEL_SUBMIT_MIN_DISTANCE = 0.08;

/**
 * User-reported false positive: marker on header "Sign in" (~0.86, 0.16) vs green Submit (~0.82, 0.82).
 * Full-viewport screenshot — pixel checks only, no DOM.
 */
const REGRESSION_SIGNIN_NX = 0.86;
const REGRESSION_SIGNIN_NY = 0.16;
const REGRESSION_SUBMIT_NX = 0.82;
const REGRESSION_SUBMIT_NY = 0.82;

/**
 * @param {{ r: number; g: number; b: number }} rgb
 * @returns {boolean}
 */
export function isSubmitGreen(rgb) {
  const { r, g, b } = rgb;
  if (r > g + 15 && r > b + 10) return false;
  return g >= 100 && g > r + 25 && g > b + 25;
}

/**
 * @param {number} nx
 * @param {number} ny
 */
export function isInSubmitNormBand(nx, ny) {
  return (
    nx >= SUBMIT_NX_MIN &&
    nx <= SUBMIT_NX_MAX &&
    ny >= SUBMIT_NY_MIN &&
    ny <= SUBMIT_NY_MAX
  );
}

/**
 * Sample 5×5 mean RGB on a bitmap at normalized coords (browser-only).
 * @param {import('@playwright/test').Page} page
 * @param {number} nx
 * @param {number} ny
 * @param {{ useScreenshotImg?: boolean; imageBase64?: string }} [opts]
 */
export async function sampleNormPixels(page, nx, ny, opts = {}) {
  return page.evaluate(
    async ({ nx, ny, useScreenshotImg, imageBase64 }) => {
      let source;
      if (useScreenshotImg) {
        source = document.getElementById('screenshot-img');
        if (!source) return { ok: false };
      } else if (imageBase64) {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${imageBase64}`;
        await new Promise((resolve, reject) => {
          img.onload = () => resolve(undefined);
          img.onerror = reject;
        });
        source = img;
      } else {
        return { ok: false };
      }

      const canvas = document.createElement('canvas');
      canvas.width = source.tagName === 'CANVAS' ? source.width : source.naturalWidth;
      canvas.height = source.tagName === 'CANVAS' ? source.height : source.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      const sx = Math.min(canvas.width - 1, Math.max(0, Math.floor(nx * canvas.width)));
      const sy = Math.min(canvas.height - 1, Math.max(0, Math.floor(ny * canvas.height)));
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const px = Math.min(canvas.width - 1, Math.max(0, sx + dx));
          const py = Math.min(canvas.height - 1, Math.max(0, sy + dy));
          const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
          rSum += r;
          gSum += g;
          bSum += b;
          n += 1;
        }
      }
      return { ok: true, nx, ny, r: rSum / n, g: gSum / n, b: bSum / n };
    },
    {
      nx,
      ny,
      useScreenshotImg: !!opts.useScreenshotImg,
      imageBase64: opts.imageBase64 ?? null,
    }
  );
}

/**
 * @param {number} parsedX
 * @param {number} parsedY
 * @param {{ nx: number; ny: number; r: number; g: number; b: number }} parsedRgb
 */
export function assertSubmitGrounding(parsedX, parsedY, parsedRgb) {
  expect(isInSubmitNormBand(parsedX, parsedY)).toBe(true);
  expect(isSubmitGreen(parsedRgb)).toBe(true);
}

/**
 * Fixture regression: old weak assertions would not reject Sign-in header placement.
 * @param {import('@playwright/test').Page} page
 */
export async function assertSignInFalsePositiveRegression(page) {
  const fixturePath = path.join(__dirname, 'fixtures', 'signin-marker-regression.png');
  const imageBase64 = fs.readFileSync(fixturePath).toString('base64');

  const signInRgb = await sampleNormPixels(page, REGRESSION_SIGNIN_NX, REGRESSION_SIGNIN_NY, {
    imageBase64,
  });
  const submitRgb = await sampleNormPixels(page, REGRESSION_SUBMIT_NX, REGRESSION_SUBMIT_NY, {
    imageBase64,
  });

  expect(signInRgb.ok).toBe(true);
  expect(submitRgb.ok).toBe(true);
  expect(isSubmitGreen(signInRgb)).toBe(false);
  expect(isSubmitGreen(submitRgb)).toBe(true);
  expect(isInSubmitNormBand(REGRESSION_SIGNIN_NX, REGRESSION_SIGNIN_NY)).toBe(false);
  expect(isInSubmitNormBand(REGRESSION_SUBMIT_NX, REGRESSION_SUBMIT_NY)).toBe(true);

  const dist = Math.hypot(
    REGRESSION_SUBMIT_NX - REGRESSION_SIGNIN_NX,
    REGRESSION_SUBMIT_NY - REGRESSION_SIGNIN_NY
  );
  expect(dist).toBeGreaterThan(CANCEL_SUBMIT_MIN_DISTANCE);
}

/**
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
export function parsePerfJsonLine(text) {
  const m = text.match(/^\[perf\] (\{.+\})$/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>[]} events
 * @param {string} phase
 * @returns {Record<string, unknown> | null}
 */
export function lastPerfEvent(events, phase) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].phase === phase) return events[i];
  }
  return null;
}

/**
 * Wait for a Run task generation to finish and return the first action point
 * from `#raw-output` (`✓ CLICK @ [x, y] — …`). Blackbox: raw output text only.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeoutMs]
 * @returns {Promise<{ normX: number; normY: number; text: string }>}
 */
export async function waitForParsedTask(page, timeoutMs = INFERENCE_TIMEOUT_MS) {
  const raw = page.getByTestId('raw-output');
  await expect
    .poll(
      async () => {
        const t = (await raw.textContent()) ?? '';
        if (/Running .* navigation/i.test(t)) return null;
        if (/Model ready — capture/i.test(t)) return null;
        return DONE_RE.test(t) ? t : null;
      },
      { timeout: timeoutMs }
    )
    .not.toBeNull();

  const text = (await raw.textContent()) ?? '';
  expect(text).toContain('Parsed actions');
  expect(text).not.toMatch(/Error:|timed out|no parsable action/i);
  const pointMatch = text.match(/@ \[([0-9.]+), ([0-9.]+)\]/);
  expect(pointMatch).not.toBeNull();
  return {
    text,
    normX: Number(pointMatch[1]),
    normY: Number(pointMatch[2]),
  };
}

/** Blackbox: whether an (auto-)capture is already encoded and ready. */
function isCaptureReady(page) {
  return page.evaluate(
    () => document.getElementById('model-status')?.dataset.captureReady === '1'
  );
}

/** Blackbox: switch the viewport back to the screenshot panel (task execution flips to live). */
export async function showSnapshotViewport(page) {
  await page.evaluate(() => {
    document.body.dataset.viewport = 'snapshot';
  });
}

/**
 * Fill the Goal input, click Run task, wait for parsed actions, then switch
 * back to the snapshot view so marker/pixel sampling sees the screenshot.
 * @param {import('@playwright/test').Page} page
 * @param {string} goal
 * @param {number} [timeoutMs]
 */
export async function runTaskAndWaitParsed(page, goal, timeoutMs = INFERENCE_TIMEOUT_MS) {
  await page.locator('#prompt').fill(goal);
  await expect(page.getByTestId('btn-task')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
  await page.getByTestId('btn-task').click();
  const parsed = await waitForParsedTask(page, timeoutMs);
  await showSnapshotViewport(page);
  return parsed;
}

/**
 * Open app once and wait for WASM model load (serial E2E shares this across cases).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 * @param {string} [modelId]
 */
/**
 * Model ids with llm entry in `.model-cache/manifest.json` (Node read — no `src/` import).
 * @returns {Set<string>}
 */
export function readManifestCachedModelIds() {
  const manifestPath = path.join(__dirname, '../../.model-cache/manifest.json');
  if (!fs.existsSync(manifestPath)) return new Set();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version === 2 && manifest.models) {
      return new Set(
        Object.entries(manifest.models)
          .filter(([, entry]) => entry?.files?.llm?.size > 0)
          .map(([id]) => id)
      );
    }
    if (manifest.model && manifest.files?.llm?.size > 0) {
      return new Set([manifest.model]);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

/**
 * @param {string} modelId
 * @returns {number}
 */
export function loadTimeoutMsForModel(modelId) {
  return modelId === 'ShowUI-2B' ? LOAD_TIMEOUT_MS : LOAD_TIMEOUT_MS_LARGE;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} modelId
 * @param {number} [timeoutMs]
 */
export async function waitForModelLoaded(page, modelId, timeoutMs = loadTimeoutMsForModel(modelId)) {
  try {
    await page.waitForFunction(
      (id) => {
        const status = document.getElementById('model-status');
        return (
          status?.dataset.modelLoaded === '1' &&
          status?.dataset.modelId === id &&
          /loaded/i.test(status?.textContent ?? '')
        );
      },
      modelId,
      { timeout: timeoutMs }
    );
  } catch {
    const statusText =
      (await page.locator('#model-status').textContent().catch(() => null)) ?? '(no status)';
    throw new Error(
      `Model ${modelId} did not load within ${timeoutMs / 1000}s. Last status: ${statusText.trim()}.`
    );
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} modelId
 */
export async function selectModelInSwitcher(page, modelId) {
  const switcher = page.getByTestId('model-switcher');
  await expect(switcher).toBeEnabled({ timeout: loadTimeoutMsForModel(modelId) });
  await switcher.selectOption(modelId);
}

/** Uncached models are `<option disabled>` — drive change like a programmatic pick. */
export async function pickUncachedModelInSwitcher(page, modelId) {
  const switcher = page.getByTestId('model-switcher');
  await switcher.evaluate((el, id) => {
    el.value = id;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, modelId);
}

/** Playwright locator for the in-app browser iframe. */
export function browseFrame(page) {
  return page.frameLocator('[data-testid="browse-frame"]');
}

/**
 * Blackbox: type a URL/path in the address bar and wait until the browse iframe lands on it.
 * @param {import('@playwright/test').Page} page
 * @param {string} urlOrPath absolute URL or same-origin path (e.g. /eval-snapshot/…)
 * @param {{ timeoutMs?: number; browseChromeTimeoutMs?: number }} [opts]
 */
export async function navigateBrowseTo(page, urlOrPath, opts = {}) {
  const navTimeoutMs = opts.timeoutMs ?? 30_000;
  const browseChromeTimeoutMs = opts.browseChromeTimeoutMs ?? 15_000;
  const address = page.locator('#browser-address');
  const wantPath = urlOrPath.startsWith('http')
    ? new URL(urlOrPath).pathname + new URL(urlOrPath).search
    : urlOrPath.startsWith('/')
      ? urlOrPath
      : `/${urlOrPath}`;

  await address.fill(urlOrPath);
  await address.press('Enter');

  await page.waitForFunction(
    ({ wantPath }) => {
      const loading = document.getElementById('browser-loading');
      const viewport = document.querySelector('[data-testid="browser-viewport"]');
      if (!loading?.hidden || viewport?.classList.contains('is-loading')) return false;
      const style = window.getComputedStyle(loading);
      if (style.display !== 'none' && style.visibility !== 'hidden' && !loading.hidden) return false;

      const frame = document.querySelector('[data-testid="browse-frame"]');
      let href = '';
      try {
        href = frame?.contentWindow?.location?.href ?? '';
      } catch {
        return false;
      }
      if (!href || /about:blank$/i.test(href)) return false;

      let target;
      try {
        target = new URL(wantPath, location.origin);
      } catch {
        return false;
      }
      let current;
      try {
        current = new URL(href);
      } catch {
        return false;
      }
      return current.pathname === target.pathname && current.search === target.search;
    },
    { wantPath },
    { timeout: navTimeoutMs }
  );

  await waitForBrowseChromeReady(page, browseChromeTimeoutMs);
}

/**
 * Blackbox: browse chrome must not block capture (no stuck “Loading page…” overlay).
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeoutMs]
 */
export async function waitForBrowseChromeReady(page, timeoutMs = 15_000) {
  await page.waitForFunction(
    () => {
      const loading = document.getElementById('browser-loading');
      const viewport = document.querySelector('[data-testid="browser-viewport"]');
      if (!loading?.hidden || viewport?.classList.contains('is-loading')) return false;
      const style = window.getComputedStyle(loading);
      return style.display === 'none' || style.visibility === 'hidden';
    },
    { timeout: timeoutMs }
  );
}

export async function waitForBrowseFixtureReady(page) {
  await browseFrame(page)
    .getByTestId('btn-submit')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await waitForBrowseChromeReady(page);
}

/** Blackbox: reload sample page (⌘R / Ctrl+R — works when browser chrome is hidden). */
export async function reloadBrowsePage(page) {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+r`);
}

/** Blackbox: switch to live iframe (snapshot view hides the browse frame). */
export async function showLiveBrowseViewport(page) {
  await page.evaluate(() => {
    document.body.dataset.viewport = 'live';
    document.getElementById('browse-frame')?.removeAttribute('hidden');
  });
}

/** Production first visit — dismiss coach so Load/Capture/Run task are reachable. */
export async function dismissCoachOverlay(page) {
  const coach = page.getByTestId('coach-overlay');
  if (await coach.isVisible().catch(() => false)) {
    await page.locator('[data-coach-dismiss]').click();
    await expect(coach).toBeHidden({ timeout: 5_000 });
  }
}

/**
 * Real user session — no `?e2e=1` (no voice shortcuts, coach shown until dismissed).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 * @param {string} [modelId]
 */
export async function openProductionSession(page, baseURL, modelId = 'ShowUI-2B') {
  installE2eConsole(page);
  const url = new URL('/home/', baseURL || 'http://127.0.0.1:5173');
  url.searchParams.set('model', modelId);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await dismissCoachOverlay(page);
  await page.waitForSelector('[data-testid="browse-frame"]', { timeout: 15_000 });
  await waitForBrowseFixtureReady(page);
  await waitForModelLoaded(page, modelId, loadTimeoutMsForModel(modelId));
}

/**
 * Production path: autoload → capture → Run task `click Submit` (visible primary buttons).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 * @param {string} [modelId]
 */
export async function runE2EProductionJourney(page, baseURL, modelId = 'ShowUI-2B') {
  resetE2ePerfRound();
  await openProductionSession(page, baseURL, modelId);

  await page.locator('#prompt').fill('click Submit');
  await expect(page.getByTestId('btn-capture')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
  // Capture is automatic now — Run task is only blocked while no capture is ready.
  if (!(await isCaptureReady(page))) {
    await expect(page.getByTestId('btn-task')).toBeDisabled();
  }

  await e2ePhaseRun(page, 'production:capture', () => runCaptureUntilReady(page));
  await expect(page.locator('body')).toHaveAttribute('data-viewport', 'snapshot');
  await expect(page.locator('#model-status')).toContainText(/ready to run a task/i);
  await expect(page.getByTestId('btn-task')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
  // Sibling UI-cluster (`5f83fa3c`): snapshot must not be squashed and the URL
  // bar must not host the secondary chrome IDs that now live on the shelf.
  await waitForScreenshotImage(page);
  await assertSnapshotLayoutBlackbox(page);

  const { normX, normY } = await e2ePhaseRun(page, 'production:task', () =>
    runTaskAndWaitParsed(page, 'click Submit')
  );

  await expect(page.getByTestId('raw-output')).toContainText(/Parsed actions/);
  expect(normX).toBeGreaterThanOrEqual(0);
  expect(normY).toBeLessThanOrEqual(1);

  if (modelId === 'ShowUI-2B') {
    const rgb = await sampleNormPixels(page, normX, normY, { useScreenshotImg: true });
    expect(rgb.ok).toBe(true);
    expect(isSubmitGreen(rgb)).toBe(true);
  }

  appendE2eResult(modelId, { status: 'SUCCESS (production journey)' });
  setE2ePhase('done');
}

/**
 * `?model=GUI-G2-3B` without benchmark must fall back to ShowUI-2B so the app works.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function runE2EProductionExperimentalFallback(page, baseURL) {
  installE2eConsole(page);
  const url = new URL('/home/', baseURL || 'http://127.0.0.1:5173');
  url.searchParams.set('model', 'GUI-G2-3B');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await dismissCoachOverlay(page);
  await waitForBrowseFixtureReady(page);
  await waitForModelLoaded(page, 'ShowUI-2B', loadTimeoutMsForModel('ShowUI-2B'));
  await expect(page.getByTestId('model-switcher')).toHaveValue('ShowUI-2B');
  await expect(page.locator('#model-status')).toHaveAttribute('data-model-id', 'ShowUI-2B');
  await expect(page.getByTestId('btn-capture')).toBeEnabled();
  // Sibling fallback fix (`35b5b119`) rewrites the URL with `history.replaceState`
  // so a refresh keeps the validated model. Catch a regression where fallback
  // only swapped the picker but left the stale `?model=GUI-G2-3B`.
  await expect(page).toHaveURL(/[?&]model=ShowUI-2B(\b|&|$)/);
  await expect(page).not.toHaveURL(/[?&]model=GUI-G2-3B/);
  appendE2eResult('ShowUI-2B', { status: 'SUCCESS (experimental URL fallback)' });
  setE2ePhase('done');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} modelId
 * @param {number} timeoutMs
 */
export async function ensureModelLoaded(page, modelId, timeoutMs = loadTimeoutMsForModel(modelId)) {
  const needsLoad = await page.evaluate((id) => {
    const status = document.getElementById('model-status');
    return !(
      status?.dataset.modelLoaded === '1' &&
      status?.dataset.modelId === id &&
      /loaded/i.test(status?.textContent ?? '')
    );
  }, modelId);
  if (needsLoad) {
    const loadBtn = page.getByTestId('btn-load-model');
    const statusBusy = await page
      .locator('#model-status')
      .evaluate((el) => /loading|processing/i.test(el?.textContent ?? ''))
      .catch(() => false);
    if (!statusBusy && (await loadBtn.isEnabled().catch(() => false))) {
      await loadBtn.click();
    }
  }
  await waitForModelLoaded(page, modelId, timeoutMs);
}

/**
 * Fresh session for a model (`?model=`). Experimental models need explicit Load.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 * @param {string} modelId
 */
export async function openE2eSessionForModel(page, baseURL, modelId) {
  installE2eConsole(page);
  const loadTimeoutMs = loadTimeoutMsForModel(modelId);
  lastE2ePhase = 'init';

  const url = new URL('/home/', baseURL || 'http://127.0.0.1:5173');
  url.searchParams.set('model', modelId);
  url.searchParams.set('e2e', '1');
  if (modelId !== 'ShowUI-2B') {
    url.searchParams.set('benchmark', '1');
  }

  setE2ePhase('goto', url.href);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="browse-frame"]', { timeout: 15_000 });
  await waitForBrowseFixtureReady(page);

  await e2ePhaseRun(page, 'load', async () => {
    await ensureModelLoaded(page, modelId, loadTimeoutMs);
  });
}

export async function openE2eSession(page, baseURL, modelId = 'ShowUI-2B') {
  await openE2eSessionForModel(page, baseURL, modelId);
}

/**
 * Benchmark smoke: load → capture → Run task `click Submit` (parsed actions + marker; green band only ShowUI-2B).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 * @param {string} modelId
 */
export async function runE2EModelExpensiveSmoke(page, baseURL, modelId) {
  resetE2ePerfRound();
  await openE2eSessionForModel(page, baseURL, modelId);

  await expect(page.getByTestId('btn-capture')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });

  await e2ePhaseRun(page, 'benchmark:capture', () => runCaptureUntilReady(page));

  const { normX, normY } = await e2ePhaseRun(page, 'benchmark:task', () =>
    runTaskAndWaitParsed(page, 'click Submit')
  );

  await expect(page.getByTestId('raw-output')).toContainText(/Parsed actions/);
  expect(normX).toBeGreaterThanOrEqual(0);
  expect(normX).toBeLessThanOrEqual(1);
  expect(normY).toBeGreaterThanOrEqual(0);
  expect(normY).toBeLessThanOrEqual(1);

  if (modelId === 'ShowUI-2B') {
    const markerRgb = await sampleNormPixels(page, normX, normY, { useScreenshotImg: true });
    expect(markerRgb.ok).toBe(true);
    expect(isSubmitGreen(markerRgb)).toBe(true);
  }

  appendE2eResult(modelId, { status: 'SUCCESS (benchmark load+capture+task)' });
  setE2ePhase('done');
}

/**
 * One green-circle round: capture → task `click Submit` → task `click Cancel` (model already loaded).
 * @param {import('@playwright/test').Page} page
 * @param {{ strictGreen?: boolean; modelId?: string; round?: number }} [opts]
 */
export async function runE2EGreenRound(page, opts = {}) {
  const modelId = opts.modelId ?? 'ShowUI-2B';
  const strictGreen = opts.strictGreen ?? modelId === 'ShowUI-2B';
  resetE2ePerfRound();

  // Each green round gets a fresh page session (serial suite shares one tab).
  if (opts.round != null) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.getElementById('model-status')?.dataset.modelLoaded === '1',
      { timeout: 120_000 }
    );
    await waitForBrowseFixtureReady(page);
    await expect(page.getByTestId('btn-capture')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
  }

  await expect(page.getByTestId('btn-capture')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });

  await e2ePhaseRun(page, 'capture', () => runCaptureUntilReady(page));

  const { normX: submitX, normY: submitY } = await e2ePhaseRun(page, 'task:submit', () =>
    runTaskAndWaitParsed(page, 'click Submit')
  );

  const capturePerf = lastPerfEvent(perfEvents, 'capture');
  const taskPerf = lastPerfEvent(perfEvents, 'task');
  const captureWallMs = capturePerf?.wallMs ?? null;
  const taskInferMs = taskPerf?.inferMs ?? workerInferenceMs[0] ?? null;
  const taskWallMs = taskPerf?.wallMs ?? null;

  expect(taskInferMs).not.toBeNull();
  expect(taskInferMs).toBeLessThanOrEqual(INFERENCE_TIMEOUT_MS);
  console.log(
    `[perf:e2e] task inference: ${taskInferMs}ms wall=${taskWallMs ?? '?'}ms captureWall=${captureWallMs ?? '?'}ms`
  );

  setE2ePhase(
    'perf',
    `taskInfer=${taskInferMs ?? '?'}ms taskWall=${taskWallMs ?? '?'}ms captureWall=${captureWallMs ?? '?'}ms`
  );

  const parsedRgb = await sampleNormPixels(page, submitX, submitY, { useScreenshotImg: true });
  expect(parsedRgb.ok).toBe(true);
  if (strictGreen) {
    assertSubmitGrounding(submitX, submitY, parsedRgb);
  } else {
    expect(submitX).toBeGreaterThanOrEqual(0);
    expect(submitX).toBeLessThanOrEqual(1);
    expect(submitY).toBeGreaterThanOrEqual(0);
    expect(submitY).toBeLessThanOrEqual(1);
    expect(isInSubmitNormBand(submitX, submitY)).toBe(true);
  }

  const { normX: cancelX, normY: cancelY } = await e2ePhaseRun(page, 'task:cancel', () =>
    runTaskAndWaitParsed(page, 'click Cancel')
  );

  const cancelDist = Math.hypot(cancelX - submitX, cancelY - submitY);
  expect(cancelDist).toBeGreaterThan(CANCEL_SUBMIT_MIN_DISTANCE);

  const cancelRgb = await sampleNormPixels(page, cancelX, cancelY, { useScreenshotImg: true });
  expect(cancelRgb.ok).toBe(true);
  expect(isSubmitGreen(cancelRgb)).toBe(false);

  await assertSignInFalsePositiveRegression(page);

  if (workerInferenceMs.length > 1) {
    console.log(`[perf:e2e] worker inference runs: ${workerInferenceMs.join(', ')}ms`);
  }

  appendE2eResult(modelId, {
    status: opts.round ? `SUCCESS (${opts.round}/3)` : 'SUCCESS',
    taskInferMs,
    taskWallMs,
    captureWallMs,
  });

  setE2ePhase('done');
}

/**
 * Full workflow: open session + one green-circle round.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 * @param {string} [modelId]
 * @param {{ strictGreen?: boolean }} [opts]
 */
export async function runE2E(page, baseURL, modelId = 'ShowUI-2B', opts = {}) {
  await openE2eSession(page, baseURL, modelId);
  await runE2EGreenRound(page, { ...opts, modelId });
}

/**
 * @param {import('@playwright/test').Page} page
 */
export async function waitForE2eVoiceApi(page) {
  await page.waitForFunction(
    () => typeof globalThis.__e2eVoiceTool === 'function',
    { timeout: 5_000 }
  );
}

/**
 * SnapDOM capture + JPEG encode ready (blackbox status dataset).
 * @param {import('@playwright/test').Page} page
 * @param {{
 *   captureTimeoutMs?: number;
 *   readyTimeoutMs?: number;
 *   screenshotTimeoutMs?: number;
 *   browseChromeTimeoutMs?: number;
 * }} [opts]
 */
export async function runCaptureUntilReady(page, opts = {}) {
  const captureTimeoutMs = opts.captureTimeoutMs ?? CAPTURE_READY_TIMEOUT_MS;
  const readyTimeoutMs = opts.readyTimeoutMs ?? INFERENCE_TIMEOUT_MS;
  const screenshotTimeoutMs = opts.screenshotTimeoutMs ?? captureTimeoutMs;
  const browseChromeTimeoutMs = opts.browseChromeTimeoutMs ?? 15_000;
  await waitForBrowseChromeReady(page, browseChromeTimeoutMs);
  const genBefore = await page.evaluate(
    () => Number(document.getElementById('model-status')?.dataset.captureGeneration ?? 0)
  );
  await page.getByTestId('btn-capture').click();
  await page.waitForFunction(
    (before) => {
      const el = document.getElementById('model-status');
      const gen = Number(el?.dataset.captureGeneration ?? 0);
      return gen > before && /\d+×\d+px/.test(el?.textContent ?? '');
    },
    genBefore,
    { timeout: captureTimeoutMs }
  );
  await waitForScreenshotImage(page, screenshotTimeoutMs);
  await page.waitForFunction(
    () => document.getElementById('model-status')?.dataset.captureReady === '1',
    { timeout: readyTimeoutMs }
  );
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} phrase
 * @param {RegExp} transcriptRe
 * @param {number} [timeoutMs]
 */
export async function waitForVoiceTranscript(page, phrase, transcriptRe, timeoutMs = VOICE_GROUNDING_WAIT_MS) {
  await expect
    .poll(
      async () => {
        const text = (await page.getByTestId('voice-transcript').textContent()) ?? '';
        if (!transcriptRe.test(text)) return null;
        if (/Error:|Could not/i.test(text)) {
          throw new Error(`Voice failed: ${text.trim()}`);
        }
        if (!/✓/.test(text)) return null;
        return text;
      },
      { timeout: timeoutMs }
    )
    .not.toBeNull();
}

/**
 * Inject a structured browser tool call through the voice controller
 * (no phrase parsing in product code — tests speak tool calls directly).
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string; arguments: Record<string, unknown> }} call
 */
export async function runE2eVoiceTool(page, call) {
  await page.evaluate(async (c) => {
    await globalThis.__e2eVoiceTool(c);
  }, call);
}

/**
 * Wait for voice nav to finish grounding (blackbox transcript only).
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @param {number} [timeoutMs]
 */
async function waitForVoiceGrounded(page, label, timeoutMs = VOICE_GROUNDING_WAIT_MS) {
  await page.waitForFunction(
    (lbl) => {
      const transcript = document.querySelector('[data-testid="voice-transcript"]');
      const text = transcript?.textContent ?? '';
      return /✓/.test(text) && text.includes(lbl);
    },
    label,
    { timeout: timeoutMs }
  );
}

/**
 * Voice → capture page refreshes screenshot panel.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoicePressTab(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  const genBefore = await page.evaluate(
    () => Number(document.getElementById('model-status')?.dataset.captureGeneration ?? 0)
  );

  await e2ePhaseRun(page, 'voice:tab', async () => {
    await runE2eVoiceTool(page, { name: 'press_key', arguments: { key: 'Tab' } });
    await waitForVoiceTranscript(page, 'press Tab', /Tab/i, VOICE_DOM_WAIT_MS);
  });

  await page.waitForFunction(
    (before) => {
      const el = document.getElementById('model-status');
      return Number(el?.dataset.captureGeneration ?? 0) > before;
    },
    genBefore,
    { timeout: CAPTURE_READY_TIMEOUT_MS }
  );

  appendE2eResult(modelId, { status: 'SUCCESS (voice Tab)' });
  setE2ePhase('done');
}

/**
 * UI Help opens modal → voice Escape closes it (blackbox: checkout-modal hidden, no DOM coords).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceModalEscape(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  await e2ePhaseRun(page, 'voice:modal-open', async () => {
    await browseFrame(page).getByTestId('btn-help').click();
    await expect(browseFrame(page).getByTestId('checkout-modal')).not.toHaveAttribute('hidden');
  });

  await e2ePhaseRun(page, 'voice:escape', async () => {
    await runE2eVoiceTool(page, { name: 'press_key', arguments: { key: 'Escape' } });
    await waitForVoiceTranscript(page, 'press Escape', /Escape/i, VOICE_DOM_WAIT_MS);
    await expect(browseFrame(page).getByTestId('checkout-modal')).toHaveAttribute('hidden');
  });

  appendE2eResult(modelId, { status: 'SUCCESS (voice Escape)' });
  setE2ePhase('done');
}

/**
 * Voice → toggle Remember me (blackbox: transcript + checkbox state; coords from VLA only).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceToggleRemember(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  // The checkbox sits below the checkout fold — scroll it into view first so
  // the capture (what the user sees) actually contains it, then ground on it.
  const remember = browseFrame(page).getByTestId('checkout-remember');
  await remember.scrollIntoViewIfNeeded();
  await runCaptureUntilReady(page);

  const wasChecked = await remember.isChecked();

  await e2ePhaseRun(page, 'voice:toggle-remember', async () => {
    await runE2eVoiceTool(page, {
      name: 'toggle_checkbox',
      arguments: { target: 'Remember me' },
    });
    await waitForVoiceTranscript(page, 'toggle remember me', /Remember/i);
  });

  await expect(remember).toBeChecked({ checked: !wasChecked });

  appendE2eResult(modelId, { status: 'SUCCESS (voice toggle remember)' });
  setE2ePhase('done');
}

const E2E_VOICE_EMAIL = 'e2e@test.com';

/**
 * Voice → type into Email field (blackbox: transcript + live input value; coords from VLA only).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceTypeEmail(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  const emailInput = browseFrame(page).locator('#capture-target .checkout-form input[type="email"]');
  // A previous case may have left the checkout form scrolled — bring the email
  // field into view so the capture the model grounds on actually shows it.
  await emailInput.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await runCaptureUntilReady(page);

  await e2ePhaseRun(page, 'voice:type-email', async () => {
    await runE2eVoiceTool(page, {
      name: 'input',
      arguments: { target: 'Email', value: E2E_VOICE_EMAIL },
    });
    await waitForVoiceTranscript(
      page,
      `type ${E2E_VOICE_EMAIL} in email`,
      new RegExp(E2E_VOICE_EMAIL.replace('.', '\\.'))
    );
  });

  await expect(emailInput).toHaveValue(E2E_VOICE_EMAIL);
  await expect(page.getByTestId('voice-transcript')).toContainText(/Email/i);

  appendE2eResult(modelId, { status: 'SUCCESS (voice type email)' });
  setE2ePhase('done');
}

/**
 * Voice → focus_field(Email) on live page (blackbox: transcript + activeElement).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceFocusEmail(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  const emailInput = browseFrame(page).locator('#capture-target .checkout-form input[type="email"]');
  await emailInput.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await runCaptureUntilReady(page);

  await e2ePhaseRun(page, 'voice:focus-email', async () => {
    await runE2eVoiceTool(page, { name: 'focus_field', arguments: { target: 'Email' } });
    await waitForVoiceTranscript(page, 'focus email', /focus_field|Focused/i, VOICE_GROUNDING_WAIT_MS);
  });

  await expect(emailInput).toBeFocused();
  await expect(page.getByTestId('voice-transcript')).toContainText(/Email/i);

  await e2ePhaseRun(page, 'voice:blur-email', async () => {
    await runE2eVoiceTool(page, { name: 'blur_field', arguments: { target: 'Email' } });
    await waitForVoiceTranscript(page, 'blur email', /blur_field|Blurred/i, VOICE_GROUNDING_WAIT_MS);
  });

  await expect(emailInput).not.toBeFocused();

  appendE2eResult(modelId, { status: 'SUCCESS (voice focus + blur email)' });
  setE2ePhase('done');
}

/**
 * Voice → scroll_to_top() resets form scroll (blackbox: scrollTop === 0).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceScrollToTop(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  const checkoutMain = browseFrame(page).locator('.checkout-main');
  await checkoutMain.evaluate((main) => {
    main.scrollTop = 180;
  });

  const scrollBefore = await checkoutMain.evaluate((main) => main.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);

  await e2ePhaseRun(page, 'voice:scroll-top', async () => {
    await runE2eVoiceTool(page, { name: 'scroll_to_top', arguments: {} });
    await waitForVoiceTranscript(page, 'scroll to top', /top/i, VOICE_DOM_WAIT_MS);
  });

  const scrollAfter = await checkoutMain.evaluate((main) => main.scrollTop);
  expect(scrollAfter).toBe(0);

  appendE2eResult(modelId, { status: 'SUCCESS (voice scroll to top)' });
  setE2ePhase('done');
}

/**
 * Blackbox: autoload left model loaded + capture enabled.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EAutoloadSmoke(page, modelId = E2E_MODEL_ID) {
  await e2ePhaseRun(page, 'smoke:autoload', async () => {
    await waitForBrowseChromeReady(page);
    await expect(page.locator('#model-status')).toHaveAttribute('data-model-loaded', '1');
    await expect(page.locator('#model-status')).toHaveAttribute('data-model-id', modelId);

    // Sibling-worker `63fca4d2` restores the visible `#model-switcher`. Catch a
    // regression that leaves it stranded in the off-screen `.e2e-shelf` by
    // requiring it to be in-viewport and enabled, with at least the validated
    // model populated.
    const switcher = page.getByTestId('model-switcher');
    await expect(switcher).toHaveValue(modelId);
    await expect(switcher).toBeVisible();
    await expect(switcher).toBeInViewport();
    await expect(switcher).toBeEnabled();
    const optionCount = await switcher.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
    expect(await switcher.locator(`option[value="${modelId}"]`).count()).toBe(1);

    await expect(page.getByTestId('btn-capture')).toBeEnabled();
    await expect(page.getByTestId('btn-task')).toBeDisabled();
    await expect(page.locator('#model-status')).not.toContainText(/Loading page/i);
  });
  appendE2eResult(modelId, { status: 'SUCCESS (autoload smoke)' });
  setE2ePhase('done');
}

/**
 * Blackbox: browser refresh clears loading overlay and keeps sample page usable.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EBrowseRefreshReady(page, modelId = E2E_MODEL_ID) {
  await e2ePhaseRun(page, 'browse:refresh', async () => {
    await waitForBrowseChromeReady(page);
    await reloadBrowsePage(page);
    await waitForBrowseFixtureReady(page);
    await expect(page.getByTestId('browser-loading')).toBeHidden();
    await expect(page.locator('#model-status')).not.toContainText(/Loading page/i);
    await expect(page.getByTestId('btn-capture')).toBeEnabled();
  });
  appendE2eResult(modelId, { status: 'SUCCESS (browse refresh)' });
  setE2ePhase('done');
}

/**
 * Blackbox: Run task stays disabled until capture is ready.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ETaskBlockedWithoutCapture(page, modelId = E2E_MODEL_ID) {
  await e2ePhaseRun(page, 'workflow:task-blocked', async () => {
    await waitForBrowseChromeReady(page);
    await page.locator('#prompt').fill('click Submit');
    // Capture is automatic now — Run task is only blocked while no capture is ready.
    if (!(await isCaptureReady(page))) {
      await expect(page.getByTestId('btn-task')).toBeDisabled();
    }
    await runCaptureUntilReady(page);
    await expect(page.getByTestId('btn-task')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
    await expect(page.locator('#model-status')).toContainText(/ready to run a task/i);
    await expect(page.getByTestId('screenshot-stage')).toBeVisible();
    // Sibling UI-cluster fix (`5f83fa3c`): displayed screenshot must preserve
    // capture aspect (no CSS squash) and the URL bar must stay minimal.
    await waitForScreenshotImage(page);
    await assertSnapshotLayoutBlackbox(page);
  });
  appendE2eResult(modelId, { status: 'SUCCESS (task blocked until capture)' });
  setE2ePhase('done');
}

/**
 * Blackbox: second capture after a task still grounds Submit on the new screenshot.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ERecaptureAfterTask(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await e2ePhaseRun(page, 'workflow:recapture', async () => {
    await runCaptureUntilReady(page);
    await runTaskAndWaitParsed(page, 'click Submit');

    await runCaptureUntilReady(page);

    const { normX, normY } = await runTaskAndWaitParsed(page, 'click Submit');
    expect(normX).toBeGreaterThanOrEqual(0);
    expect(normX).toBeLessThanOrEqual(1);
    expect(normY).toBeGreaterThanOrEqual(0);
    expect(normY).toBeLessThanOrEqual(1);
  });
  appendE2eResult(modelId, { status: 'SUCCESS (recapture after task)' });
  setE2ePhase('done');
}

/**
 * Blackbox: picking an uncached id reverts picker; prior load + Capture stay enabled.
 * @param {import('@playwright/test').Page} page
 * @param {string} [primaryId]
 * @param {string} [uncachedId]
 */
export async function runE2ESwitchUncachedReverts(page, primaryId = E2E_MODEL_ID, uncachedId) {
  if (!uncachedId) {
    throw new Error('runE2ESwitchUncachedReverts requires an uncached model id');
  }
  await e2ePhaseRun(page, 'switch:uncached', async () => {
    await pickUncachedModelInSwitcher(page, uncachedId);
    await expect(page.getByTestId('model-switcher')).toHaveValue(primaryId);
    await expect(page.locator('#model-status')).toHaveAttribute('data-model-id', primaryId);
    await expect(page.locator('#model-status')).toHaveAttribute('data-model-loaded', '1');
    await expect(page.getByTestId('btn-capture')).toBeEnabled();
    await expect(page.locator('#model-status')).toContainText(/loaded/i);
  });
  appendE2eResult(primaryId, { status: 'SUCCESS (switch uncached reverts)' });
  setE2ePhase('done');
}

/**
 * Blackbox: ShowUI → secondary → capture → back → capture → Submit task on ShowUI.
 * @param {import('@playwright/test').Page} page
 * @param {string} [primaryId]
 * @param {string} [secondaryId]
 */
export async function runE2ESwitchRoundTrip(
  page,
  primaryId = E2E_MODEL_ID,
  secondaryId = E2E_SWITCH_MODEL_ID
) {
  await e2ePhaseRun(page, 'switch:to-secondary', async () => {
    await selectModelInSwitcher(page, secondaryId);
    await waitForModelLoaded(page, secondaryId);
    await expect(page.getByTestId('btn-capture')).toBeEnabled();
    await expect(page.locator('#model-status')).toHaveAttribute('data-model-id', secondaryId);
  });

  await e2ePhaseRun(page, 'switch:capture-secondary', () => runCaptureUntilReady(page));

  await e2ePhaseRun(page, 'switch:back-primary', async () => {
    await selectModelInSwitcher(page, primaryId);
    await waitForModelLoaded(page, primaryId);
    await expect(page.getByTestId('btn-capture')).toBeEnabled();
    await expect(page.locator('#model-status')).toHaveAttribute('data-model-id', primaryId);
  });

  await e2ePhaseRun(page, 'switch:capture-primary', () => runCaptureUntilReady(page));

  if (primaryId === 'ShowUI-2B') {
    const { normX, normY } = await e2ePhaseRun(page, 'switch:task-submit', () =>
      runTaskAndWaitParsed(page, 'click Submit')
    );
    expect(isInSubmitNormBand(normX, normY)).toBe(true);
  }

  appendE2eResult(primaryId, {
    status: `SUCCESS (switch round-trip ${primaryId}↔${secondaryId})`,
  });
  setE2ePhase('done');
}

/**
 * Blackbox: empty prompt keeps Run task disabled.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EPromptEmptyBlocksTask(page, modelId = E2E_MODEL_ID) {
  await e2ePhaseRun(page, 'smoke:empty-prompt', async () => {
    await page.locator('#prompt').fill('');
    await expect(page.getByTestId('btn-task')).toBeDisabled();
    await page.locator('#prompt').fill('click Submit');
    // Run task still requires capture — only assert non-empty prompt does not alone enable it.
    if (!(await page.getByTestId('btn-task').isEnabled())) {
      await expect(page.getByTestId('btn-task')).toBeDisabled();
    }
  });
  appendE2eResult(modelId, { status: 'SUCCESS (empty prompt)' });
  setE2ePhase('done');
}

/**
 * Blackbox: Sign in task lands in header band, not green Submit region.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ETaskSignInNotSubmitBand(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await e2ePhaseRun(page, 'capture:signin', () => runCaptureUntilReady(page));

  const { normX, normY } = await e2ePhaseRun(page, 'task:signin', () =>
    runTaskAndWaitParsed(page, 'click Sign in')
  );

  expect(isInSubmitNormBand(normX, normY)).toBe(false);
  expect(normY).toBeLessThan(0.45);
  const rgb = await sampleNormPixels(page, normX, normY, { useScreenshotImg: true });
  expect(rgb.ok).toBe(true);
  expect(isSubmitGreen(rgb)).toBe(false);

  appendE2eResult(modelId, { status: 'SUCCESS (Sign in not Submit band)' });
  setE2ePhase('done');
}

/**
 * Voice → click Submit on screenshot (parsed coords in submit band).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceClickSubmit(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);

  await e2ePhaseRun(page, 'voice:click-submit', async () => {
    await runE2eVoiceTool(page, {
      name: 'click',
      arguments: { target: 'Submit' },
    });
    await waitForVoiceGrounded(page, 'Submit');
  });

  const transcript = (await page.getByTestId('voice-transcript').textContent()) ?? '';
  const match = transcript.match(/@\s*\(([\d.]+),\s*([\d.]+)\)/);
  expect(match).not.toBeNull();
  const nx = parseFloat(match[1]);
  const ny = parseFloat(match[2]);
  expect(isInSubmitNormBand(nx, ny)).toBe(true);
  const rgb = await sampleNormPixels(page, nx, ny, { useScreenshotImg: true });
  expect(rgb.ok).toBe(true);
  expect(isSubmitGreen(rgb)).toBe(true);

  appendE2eResult(modelId, { status: 'SUCCESS (voice click Submit)' });
  setE2ePhase('done');
}

/**
 * Voice → capture page refreshes screenshot panel.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceCapturePage(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);

  const genBefore = await page.evaluate(
    () => Number(document.getElementById('model-status')?.dataset.captureGeneration ?? 0)
  );

  await e2ePhaseRun(page, 'voice:capture-page', async () => {
    await runE2eVoiceTool(page, { name: 'capture_page', arguments: {} });
    await waitForVoiceTranscript(page, 'capture page', /capture_page|screenshot/i, CAPTURE_READY_TIMEOUT_MS);
  });

  await page.waitForFunction(
    (before) => Number(document.getElementById('model-status')?.dataset.captureGeneration ?? 0) > before,
    genBefore,
    { timeout: CAPTURE_READY_TIMEOUT_MS }
  );
  await waitForScreenshotImage(page);

  appendE2eResult(modelId, { status: 'SUCCESS (voice capture page)' });
  setE2ePhase('done');
}

/**
 * Blackbox: UI task Cancel — not green, far from Submit on same capture.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ETaskCancelNotGreen(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('model-status')?.dataset.modelLoaded === '1',
    { timeout: 120_000 }
  );
  await waitForBrowseFixtureReady(page);
  await expect(page.getByTestId('btn-capture')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
  await e2ePhaseRun(page, 'capture:cancel-ui', () => runCaptureUntilReady(page));

  const submit = await e2ePhaseRun(page, 'task:submit-ref', () =>
    runTaskAndWaitParsed(page, 'click Submit')
  );

  const cancel = await e2ePhaseRun(page, 'task:cancel-ui', () =>
    runTaskAndWaitParsed(page, 'click Cancel')
  );

  expect(Math.hypot(cancel.normX - submit.normX, cancel.normY - submit.normY)).toBeGreaterThan(
    CANCEL_SUBMIT_MIN_DISTANCE
  );
  const cancelRgb = await sampleNormPixels(page, cancel.normX, cancel.normY, {
    useScreenshotImg: true,
  });
  expect(cancelRgb.ok).toBe(true);
  expect(isSubmitGreen(cancelRgb)).toBe(false);

  appendE2eResult(modelId, { status: 'SUCCESS (UI Cancel not green)' });
  setE2ePhase('done');
}

/**
 * Blackbox: second Submit task on same capture (no re-capture between runs).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ESecondTaskSubmit(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await e2ePhaseRun(page, 'capture:warm', () => runCaptureUntilReady(page));

  await e2ePhaseRun(page, 'task:submit-1', () => runTaskAndWaitParsed(page, 'click Submit'));

  const t0 = Date.now();
  await e2ePhaseRun(page, 'task:submit-2', () => runTaskAndWaitParsed(page, 'click Submit'));
  const wallMs = Date.now() - t0;
  expect(wallMs).toBeLessThanOrEqual(INFERENCE_TIMEOUT_MS);
  await expect(page.getByTestId('raw-output')).toContainText(/Parsed actions/);

  appendE2eResult(modelId, { status: 'SUCCESS (second task same capture)', taskWallMs: wallMs });
  setE2ePhase('done');
}

/**
 * Blackbox: Run task `type … in …` exercises the navigation INPUT action —
 * parsed INPUT in `#raw-output` and the live email field receives the value.
 * Coords come from the model on the screenshot only (no DOM grounding).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ETaskTypeEmailInput(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await showLiveBrowseViewport(page);
  const emailInput = browseFrame(page).locator('#capture-target .checkout-form input[type="email"]');
  await emailInput.fill('');
  await emailInput.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await e2ePhaseRun(page, 'capture:type-input', () => runCaptureUntilReady(page));

  const { text } = await e2ePhaseRun(page, 'task:type-input', () =>
    runTaskAndWaitParsed(page, 'type paul in the email field')
  );

  expect(text).toMatch(/INPUT @ \[/);
  expect(text).toMatch(/typed "paul"/i);
  await expect(emailInput).toHaveValue(/paul/i);

  appendE2eResult(modelId, { status: 'SUCCESS (Run task INPUT types email)' });
  setE2ePhase('done');
}

/**
 * Blackbox: pressing Enter in `#prompt` submits the goal form and runs the
 * task — same asserts as the Run task button path (common UX path).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EPromptEnterSubmitsTask(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await e2ePhaseRun(page, 'capture:enter-submit', () => runCaptureUntilReady(page));

  await page.locator('#prompt').fill('click Submit');
  await expect(page.getByTestId('btn-task')).toBeEnabled({ timeout: INFERENCE_TIMEOUT_MS });
  await page.locator('#prompt').press('Enter');
  const { normX, normY } = await e2ePhaseRun(page, 'task:enter-submit', async () => {
    const parsed = await waitForParsedTask(page);
    await showSnapshotViewport(page);
    return parsed;
  });

  expect(isInSubmitNormBand(normX, normY)).toBe(true);
  const rgb = await sampleNormPixels(page, normX, normY, { useScreenshotImg: true });
  expect(rgb.ok).toBe(true);
  if (modelId === 'ShowUI-2B') expect(isSubmitGreen(rgb)).toBe(true);

  appendE2eResult(modelId, { status: 'SUCCESS (prompt Enter submits task)' });
  setE2ePhase('done');
}

/**
 * Blackbox: Cmd/Ctrl+Shift+S toggles `body[data-viewport]` live ↔ snapshot
 * (pure DOM, no inference).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2ESnapshotToggleShortcut(page, modelId = E2E_MODEL_ID) {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await e2ePhaseRun(page, 'ui:snapshot-toggle', async () => {
    // Focus inside the browse iframe — keydown does not bubble to the parent.
    const frameBody = browseFrame(page).locator('body');
    await frameBody.click({ timeout: 5_000 });
    const before = await page.evaluate(() => document.body.dataset.viewport ?? 'live');
    await frameBody.press(`${mod}+Shift+S`);
    const flipped = before === 'snapshot' ? 'live' : 'snapshot';
    await expect(page.locator('body')).toHaveAttribute('data-viewport', flipped);
    await frameBody.press(`${mod}+Shift+S`);
    await expect(page.locator('body')).toHaveAttribute('data-viewport', before);
  });
  appendE2eResult(modelId, { status: 'SUCCESS (snapshot toggle shortcut)' });
  setE2ePhase('done');
}

/**
 * Blackbox: address-bar navigation → fixture re-renders → capture → Submit
 * task still grounds (app works beyond the initially loaded page; generic
 * URL change, not fixture-tuned).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EAddressBarNavigationTask(page, modelId = E2E_MODEL_ID) {
  resetE2ePerfRound();
  await e2ePhaseRun(page, 'nav:address-bar', async () => {
    await navigateBrowseTo(page, '/browse-fixture/index.html?e2enav=1', {
      timeoutMs: CAPTURE_READY_TIMEOUT_MS,
    });
    await waitForBrowseFixtureReady(page);
  });

  await e2ePhaseRun(page, 'nav:capture', () => runCaptureUntilReady(page));
  const { normX, normY } = await e2ePhaseRun(page, 'nav:task-submit', () =>
    runTaskAndWaitParsed(page, 'click Submit')
  );

  expect(isInSubmitNormBand(normX, normY)).toBe(true);
  const rgb = await sampleNormPixels(page, normX, normY, { useScreenshotImg: true });
  expect(rgb.ok).toBe(true);
  if (modelId === 'ShowUI-2B') expect(isSubmitGreen(rgb)).toBe(true);

  appendE2eResult(modelId, { status: 'SUCCESS (address-bar nav + Submit task)' });
  setE2ePhase('done');
}

/**
 * Blackbox: Help button opens live modal (no voice).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EUiHelpOpensModal(page, modelId = E2E_MODEL_ID) {
  await showLiveBrowseViewport(page);
  const frame = browseFrame(page);
  await e2ePhaseRun(page, 'ui:help-modal', async () => {
    await frame.getByTestId('btn-help').click();
    await expect(frame.getByTestId('checkout-modal')).not.toHaveAttribute('hidden');
    await frame.getByTestId('btn-modal-close').click();
    await expect(frame.getByTestId('checkout-modal')).toHaveAttribute('hidden');
  });
  appendE2eResult(modelId, { status: 'SUCCESS (UI Help modal)' });
  setE2ePhase('done');
}

/**
 * Voice → bare "Submit" label grounds a click on the screenshot.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceBareSubmit(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);

  await e2ePhaseRun(page, 'voice:bare-submit', async () => {
    await runE2eVoiceTool(page, {
      name: 'click',
      arguments: { target: 'Submit' },
    });
    await waitForVoiceGrounded(page, 'Submit');
  });

  appendE2eResult(modelId, { status: 'SUCCESS (voice bare Submit)' });
  setE2ePhase('done');
}

/**
 * Voice → hover Cancel on screenshot.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceHoverCancel(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await runCaptureUntilReady(page);

  await e2ePhaseRun(page, 'voice:hover-cancel', async () => {
    await runE2eVoiceTool(page, {
      name: 'hover',
      arguments: { target: 'Cancel' },
    });
    await waitForVoiceGrounded(page, 'Cancel');
  });

  appendE2eResult(modelId, { status: 'SUCCESS (voice hover Cancel)' });
  setE2ePhase('done');
}

/**
 * Voice → scroll down then re-capture.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceScrollDown(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);

  const genBefore = await page.evaluate(
    () => Number(document.getElementById('model-status')?.dataset.captureGeneration ?? 0)
  );

  await e2ePhaseRun(page, 'voice:scroll-down', async () => {
    await runE2eVoiceTool(page, { name: 'scroll', arguments: { value: 'down' } });
    await waitForVoiceTranscript(
      page,
      'scroll down',
      /Scrolled down|scroll\(/i,
      VOICE_DOM_WAIT_MS
    );
  });

  await page.waitForFunction(
    (before) => Number(document.getElementById('model-status')?.dataset.captureGeneration ?? 0) > before,
    genBefore,
    { timeout: CAPTURE_READY_TIMEOUT_MS }
  );

  appendE2eResult(modelId, { status: 'SUCCESS (voice scroll down)' });
  setE2ePhase('done');
}

/**
 * Voice → select Canada in Country (live select value).
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceSelectCountry(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  // Country select is below the checkout fold — scroll it into view (centered)
  // before capturing so the screenshot the model grounds on actually shows it.
  await browseFrame(page)
    .getByTestId('checkout-country')
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await runCaptureUntilReady(page);

  await e2ePhaseRun(page, 'voice:select-country', async () => {
    await runE2eVoiceTool(page, {
      name: 'select',
      arguments: { target: 'Country', value: 'Canada' },
    });
    await waitForVoiceTranscript(page, 'select Canada in Country', /Canada|Country/i);
  });

  await expect(browseFrame(page).getByTestId('checkout-country')).toHaveValue(/Canada/i);

  appendE2eResult(modelId, { status: 'SUCCESS (voice select country)' });
  setE2ePhase('done');
}

/**
 * Voice → clear_field(Email) on live page.
 * @param {import('@playwright/test').Page} page
 * @param {string} [modelId]
 */
export async function runE2EVoiceClearEmail(page, modelId = E2E_MODEL_ID) {
  installE2eConsole(page);
  await waitForE2eVoiceApi(page);
  await showLiveBrowseViewport(page);

  const email = browseFrame(page).locator('#capture-target .checkout-form input[type="email"]');
  await email.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await runCaptureUntilReady(page);

  await email.fill('clear-me@test.com');

  await e2ePhaseRun(page, 'voice:clear-email', async () => {
    await runE2eVoiceTool(page, { name: 'clear_field', arguments: { target: 'Email' } });
    await waitForVoiceTranscript(page, 'clear email', /Cleared|clear_field/i, VOICE_GROUNDING_WAIT_MS);
  });

  await expect(email).toHaveValue('');

  appendE2eResult(modelId, { status: 'SUCCESS (voice clear email)' });
  setE2ePhase('done');
}

/**
 * @param {string} modelId
 * @param {{
 *   status: string;
 *   taskInferMs?: number | null;
 *   taskWallMs?: number | null;
 *   captureWallMs?: number | null;
 *   case?: string;
 *   error?: string;
 * }} row
 */
export function appendE2eResult(modelId, row) {
  const lines = [
    `Model: ${modelId}`,
    row.case ? `Case: ${row.case}` : null,
    `Status: ${row.status}`,
    row.taskInferMs != null ? `Task Inference: ${row.taskInferMs}ms` : null,
    row.taskWallMs != null ? `Task Wall: ${row.taskWallMs}ms` : null,
    row.captureWallMs != null ? `Capture Wall: ${row.captureWallMs}ms` : null,
    row.error ? `Failure:\n  ${formatE2eError(row.error)}` : null,
  ].filter(Boolean);
  fs.appendFileSync(E2E_RESULTS_FILE, `${lines.join('\n')}\n\n`);
}

/** Gemma-nano demo — Prompt API page (not the operator /home gate). */
export const GEMMA_NANO_E2E_PATH = '/gemma-nano/';

/**
 * Open gemma-nano (real page — no ?e2e=1 hooks).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function openGemmaNanoPage(page, baseURL) {
  installE2eConsole(page);
  const url = new URL(GEMMA_NANO_E2E_PATH, baseURL || 'http://127.0.0.1:5173');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
}

/**
 * Open gemma-nano with `?e2e=1` (exposes `__e2ePromptApiTurnShape`).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function openGemmaNanoE2ePage(page, baseURL) {
  installE2eConsole(page);
  const url = new URL(GEMMA_NANO_E2E_PATH, baseURL || 'http://127.0.0.1:5173');
  url.searchParams.set('e2e', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof globalThis.__e2ePromptApiTurnShape === 'function', {
    timeout: 15_000,
  });
}

/**
 * Regression: ShowUI navigation messages → one multimodal Prompt API user turn
 * (system + task + image together). Guards against split-turn grounding bugs.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function runE2EGemmaNanoPromptApiTurnShape(page, baseURL) {
  await openGemmaNanoE2ePage(page, baseURL);
  const shape = await page.evaluate(() => globalThis.__e2ePromptApiTurnShape());
  expect(shape.turnCount).toBe(2);
  expect(shape.userTurnCount).toBe(1);
  expect(shape.userPartCount).toBe(3);
  expect(shape.textPartCount).toBe(2);
  expect(shape.hasImagePart).toBe(true);
  expect(shape.assistantPrefix).toBe(true);
  appendE2eResult('gemma-nano', { status: 'SUCCESS (Prompt API turn shape)' });
}

/**
 * Regression: pixel `position: [200, 165]` → vision-norm using JPEG dims, not ÷1000.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function runE2EGemmaNanoPixelPositionNorm(page, baseURL) {
  await openGemmaNanoE2ePage(page, baseURL);
  await page.waitForFunction(() => typeof globalThis.__e2eNavPositionNorm === 'function', {
    timeout: 15_000,
  });
  const out = await page.evaluate(() => globalThis.__e2eNavPositionNorm());
  expect(out.pixel).toEqual({ x: 0.238, y: 0.453 });
  expect(out.norm).toEqual({ x: 0.2, y: 0.165 });
  expect(out.submit).toEqual({ x: 0.976, y: 0.824 });
  appendE2eResult('gemma-nano', { status: 'SUCCESS (pixel position norm)' });
}

/**
 * Gemma-nano boot smoke — module loads and autoload exits "Starting…"
 * (ready or Prompt API unavailable message; no hung import/boot).
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function runE2EGemmaNanoBootSmoke(page, baseURL) {
  await openGemmaNanoE2ePage(page, baseURL);
  await page.waitForSelector('#browse-frame', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const hero = document.getElementById('hero-status');
      const run = document.getElementById('btn-run');
      if (!hero) return false;
      const label = (hero.textContent || '').trim();
      if (label === 'Starting…') return false;
      if (run && !run.disabled) return true;
      const tech = hero.dataset?.technicalStatus || label;
      return /Prompt API|Built-in AI|Error|ready to run|timed out|failed|Navigation failed/i.test(
        tech
      );
    },
    { timeout: LOAD_TIMEOUT_MS + 5_000 }
  );
  appendE2eResult('gemma-nano', { status: 'SUCCESS (boot smoke)' });
}

/**
 * E2E test for Gemma Nano that shows click Submit works.
 * This test uses the real Prompt API. Ensure flags are enabled in playwright.config.js.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseURL]
 */
export async function runE2EGemmaNanoClickSubmit(page, baseURL) {
  const url = new URL(GEMMA_NANO_E2E_PATH, baseURL || 'http://127.0.0.1:5173');
  // Model benchmark mode often exposes more technical status
  url.searchParams.set('model', 'gemini-nano');
  
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });

  // Wait for the page to boot. If the API is missing, it will show an Error in #hero-status.
  await page.waitForSelector('#browse-frame', { timeout: 15_000 });
  
  await page.waitForFunction(
    () => {
      const hero = document.getElementById('hero-status');
      const run = document.getElementById('btn-run');
      if (!hero) return false;
      const text = hero.textContent || '';
      // If we see "Error", fail early with the descriptive error from the page
      if (text.includes('Error')) return true;
      return text.includes('ready to run') && run && !run.disabled;
    },
    { timeout: 30_000 }
  );

  const heroText = await page.locator('#hero-status').textContent();
  if (heroText?.includes('Error')) {
    throw new Error(`Gemma Nano not available in E2E: ${heroText}`);
  }

  // Fill the prompt and click Run
  await page.locator('#prompt').fill('click Submit');
  await page.getByTestId('btn-run').click();

  // Wait for the task to finish (Gemma Nano is on-device, usually fast but give it time)
  const raw = page.getByTestId('raw-output');
  await expect.poll(
    async () => {
      const t = (await raw.textContent()) ?? '';
      return /Parsed actions/i.test(t) ? t : null;
    },
    { timeout: 30_000 }
  ).not.toBeNull();

  // Verify the action was logged correctly
  const text = await raw.textContent();
  expect(text).toContain('CLICK');

  // Verify the button was ACTUALLY clicked by checking the fixture side-effect
  // The browse-frame is an iframe, so we need to check inside it
  const frame = page.frameLocator('[data-testid="browse-frame"]');
  await expect(frame.locator('h2')).toHaveText('Order Submitted!', { timeout: 5_000 });

  appendE2eResult('gemma-nano', { status: 'SUCCESS (click Submit works)' });
  setE2ePhase('done');
}
