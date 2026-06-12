#!/usr/bin/env node
/**
 * Mind2Web offline grounding — blackbox against the real app (no src/ hooks).
 * Node fetches dataset rows; Playwright drives Load → browse → Capture → Find
 * like gate E2E. Scoring uses dataset bbox vs #raw-output coords only.
 *
 *   npm run cache:showui
 *   npm run eval:mind2web
 */

import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheModel } from '../../scripts/cache-model.mjs';
import {
  ensureModelLoaded,
  dismissCoachOverlay,
  loadTimeoutMsForModel,
  waitForBrowseFixtureReady,
  navigateBrowseTo,
  runCaptureUntilReady,
  runTaskAndWaitParsed,
  sampleMarkerPixels,
  showLiveBrowseViewport,
  browseFrame,
  waitForE2eVoiceApi,
  runE2eVoiceTool,
  VOICE_GROUNDING_WAIT_MS,
} from '../e2e/e2e.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const RESULTS_FILE = path.join(ROOT, 'mind2web-grounding-results.txt');
const SNAPSHOT_CACHE = path.join(ROOT, 'examples/operator/fixtures/eval-snapshot/cache');

const HF_ROWS = 'https://datasets-server.huggingface.co/rows';
const DATASET = 'osunlp/Multimodal-Mind2Web';
const MIND2WEB_OPS = ['CLICK', 'TYPE', 'SELECT'];

/** Default 3145728 (1048576/op) — honest unfiltered run; use `eval:mind2web:full` for 7864320. */
const LIMIT = Math.max(1, Number(process.env.MIND2WEB_EVAL_LIMIT ?? 3145728) || 3145728);
const SPLIT = process.env.MIND2WEB_EVAL_SPLIT ?? 'test_task';
const MODEL_ID = process.env.E2E_MODEL ?? 'ShowUI-2B';
const EVAL_DEV_PORT = process.env.MIND2WEB_EVAL_PORT ?? '5174';
const BASE_URL = (
  process.env.MIND2WEB_EVAL_BASE ?? `http://127.0.0.1:${EVAL_DEV_PORT}`
).replace(/\/$/, '');
const PER_TYPE =
  Number(process.env.MIND2WEB_EVAL_PER_TYPE) ||
  Math.max(1, Math.ceil(LIMIT / MIND2WEB_OPS.length));
const ENABLED_OPS = (process.env.MIND2WEB_EVAL_OPS ?? MIND2WEB_OPS.join(','))
  .split(/[\s,]+/)
  .map((s) => s.trim().toUpperCase())
  .filter((op) => MIND2WEB_OPS.includes(op));
const OPS = ENABLED_OPS.length ? ENABLED_OPS : [...MIND2WEB_OPS];
/** TYPE/SELECT inject structured voice tool calls (`?e2e=1`, no mic) — same as gate voice cases. */
const NEEDS_VOICE = OPS.some((op) => op === 'TYPE' || op === 'SELECT');
const HEADED = process.env.MIND2WEB_EVAL_HEADED === '1';
const SLOW_MO_MS = Math.max(0, Number(process.env.MIND2WEB_EVAL_SLOW_MO ?? 0) || 0);
/** Red Mind2Web bbox on #screenshot-img — on by default; set MIND2WEB_EVAL_BBOX=0 to disable. */
const SHOW_BBOX = process.env.MIND2WEB_EVAL_BBOX !== '0';
/**
 * Stop when harness FAIL (capture/browse/prewarm/snapshot) reaches this % of scheduled samples.
 * 0 = run all. MISS/NEAR and Find parse failures do not count — bad labels must not abort long runs.
 */
const FAIL_EARLY_PCT = Math.max(0, Number(process.env.MIND2WEB_EVAL_FAIL_EARLY_PCT ?? 0) || 0);

/** @param {string} msg */
function isHarnessFail(msg) {
  return /screenshot HTTP|fetch|browse|navigation|capture|groundingReady|prewarm|dataset\.grounding|screenshot dims|loadSnapshot|SnapDOM/i.test(
    msg
  );
}
/**
 * Exit 0 when strict bbox_acc (inside rect only) meets this bar.
 * NEAR (edge ≤25px but outside bbox) is diagnostic — never counts as pass.
 * @see `.cursor/rules/mind2web-eval.mdc`
 */
const PASS_HIT_PCT = Math.max(
  0,
  Number(process.env.MIND2WEB_EVAL_PASS_HIT_PCT ?? 85) || 85
);
/**
 * Mind2Web tall dataset shots need longer browse/capture/prewarm than gate E2E.
 * Gate `INFERENCE_TIMEOUT_MS` (12s) stays unchanged — these apply only to this harness.
 */
const MIND2WEB_NAV_TIMEOUT_MS =
  Number(process.env.MIND2WEB_EVAL_NAV_TIMEOUT_MS ?? 45_000) || 45_000;
const MIND2WEB_CAPTURE_TIMEOUT_MS =
  Number(process.env.MIND2WEB_EVAL_CAPTURE_TIMEOUT_MS ?? 30_000) || 30_000;
const MIND2WEB_CAPTURE_READY_TIMEOUT_MS =
  Number(process.env.MIND2WEB_EVAL_PREWARM_TIMEOUT_MS ?? 25_000) || 25_000;
/** Per task / waitForParsedTask — tall shots; not gate E2E. */
const MIND2WEB_INFERENCE_TIMEOUT_MS =
  Number(process.env.MIND2WEB_EVAL_INFERENCE_TIMEOUT_MS ?? 15_000) || 15_000;
/** Playwright default action timeout per sample (one query, one Find). */
const MIND2WEB_PAGE_TIMEOUT_MS =
  Number(process.env.MIND2WEB_EVAL_PAGE_TIMEOUT_MS ?? 90_000) || 90_000;
/** Skip dataset PNGs taller than this (`0` = off, default). Opt-in scope only — not default. */
const MAX_SRC_H = Math.max(
  0,
  Number(process.env.MIND2WEB_EVAL_MAX_SRC_H ?? 0) || 0
);
/** Skip when bbox bottom exceeds this fraction of src height (`0` = off, default). Opt-in only. */
const MAX_BBOX_BOTTOM_FRAC = Math.max(
  0,
  Number(process.env.MIND2WEB_EVAL_MAX_BBOX_BOTTOM_FRAC ?? 0) || 0
);

/** @typedef {'CLICK' | 'TYPE' | 'SELECT'} Mind2WebOp */

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {string} s */
function cleanLabel(s) {
  return String(s ?? '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/,(\S)/g, ', $1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} s */
function isUsableLabel(s) {
  return cleanLabel(s).length > 0;
}

/** @param {string} repr */
function queryFromRepr(repr) {
  const s = cleanLabel(repr);
  const tagged = s.match(
    /\[[^\]]+\]\s*(.+?)\s*->\s*(CLICK|HOVER|TYPE|SELECT|ENTER)\b/i
  );
  if (tagged?.[1]?.trim()) return cleanLabel(tagged[1]).slice(0, 120);
  const plain = s.match(/^(.+?)\s*->\s*(CLICK|HOVER|TYPE|SELECT|ENTER)\b/i);
  if (plain?.[1]?.trim() && !plain[1].includes('[')) {
    return cleanLabel(plain[1]).slice(0, 120);
  }
  return '';
}

/** @param {Mind2WebOp} op */
function attributeKeysForOp(op) {
  return op === 'SELECT' || op === 'TYPE'
    ? ['text', 'aria-label', 'label', 'title', 'placeholder', 'alt']
    : ['text', 'aria-label', 'placeholder', 'title', 'label', 'alt', 'value'];
}

/** @param {Record<string, unknown>} attrs @param {Mind2WebOp} op */
function queryFromAttributes(attrs, op) {
  for (const k of attributeKeysForOp(op)) {
    const t = cleanLabel(attrs[k]);
    if (isUsableLabel(t)) return t.slice(0, 120);
  }
  return '';
}

/**
 * Goal label: repr text, else first visible attribute — fixed order, no ranking or sweep.
 * @param {string} repr
 * @param {Record<string, unknown>} attrs
 * @param {Mind2WebOp} op
 */
function primaryEvalQuery(repr, attrs, op) {
  const fromRepr = queryFromRepr(repr);
  if (fromRepr && isUsableLabel(fromRepr)) return fromRepr;
  return queryFromAttributes(attrs, op);
}

/**
 * Voice phrase for TYPE/SELECT (field label + operation value); CLICK uses field label only.
 * @param {{ op: Mind2WebOp; fieldLabel: string; actionValue: string }} sample
 */
function mind2webVoicePhrase(sample) {
  const field = sample.fieldLabel;
  if (sample.op === 'TYPE' && sample.actionValue) {
    return `type ${sample.actionValue} in ${field}`;
  }
  if (sample.op === 'SELECT' && sample.actionValue) {
    return `select ${sample.actionValue} in ${field}`;
  }
  return field;
}

/** Diagnostic label only — clicks within this px of bbox edge still MISS for pass bar. */
const NEAR_DIAG_PX = 25;
/** Inside-bbox tolerance (px on capture bitmap) — fractional scaled bbox + display coords. */
const BBOX_HIT_EPS_PX = 0.5;

/** @param {import('@playwright/test').Page} page */
async function clearMind2WebBboxOverlay(page) {
  await page.evaluate(() => document.getElementById('mind2web-eval-overlay')?.remove());
}

/**
 * Red dashed box = Mind2Web expected bbox on the screenshot panel (#click-marker = model).
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number; y: number; w: number; h: number }} bbox shot pixels
 */
async function showMind2WebBboxOverlay(page, bbox) {
  await page.evaluate((box) => {
    document.getElementById('mind2web-eval-overlay')?.remove();
    const img = document.getElementById('screenshot-img');
    const parent = img?.closest('.screenshot-inner') ?? img?.parentElement;
    if (!parent || !img) return;
    const nw = img.tagName === 'CANVAS' ? img.width : img.naturalWidth;
    const nh = img.tagName === 'CANVAS' ? img.height : img.naturalHeight;
    if (!nw || !nh) return;
    const ir = img.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const sx = ir.width / nw;
    const sy = ir.height / nh;
    const el = document.createElement('div');
    el.id = 'mind2web-eval-overlay';
    el.setAttribute('data-testid', 'mind2web-eval-bbox');
    el.style.cssText =
      'position:absolute;pointer-events:none;box-sizing:border-box;z-index:25;' +
      'border:2px dashed #ef4444;background:rgba(239,68,68,0.1);' +
      'box-shadow:0 0 0 1px rgba(239,68,68,0.35)';
    el.style.left = `${box.x * sx + (ir.left - pr.left)}px`;
    el.style.top = `${box.y * sy + (ir.top - pr.top)}px`;
    el.style.width = `${box.w * sx}px`;
    el.style.height = `${box.h * sy}px`;
    const tag = document.createElement('span');
    tag.textContent = 'Mind2Web';
    tag.style.cssText =
      'position:absolute;left:0;top:0;transform:translateY(-100%);' +
      'font:600 10px/1.2 system-ui,sans-serif;color:#ef4444;' +
      'background:rgba(255,255,255,0.92);padding:1px 4px;border-radius:2px;white-space:nowrap';
    el.appendChild(tag);
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(el);
  }, bbox);
}

/**
 * Scale dataset bbox to captured screenshot pixels.
 * @param {string} bboxRaw
 * @param {number} shotW
 * @param {number} shotH
 * @param {number} srcW
 * @param {number} srcH
 */
function bboxOnScreenshot(bboxRaw, shotW, shotH, srcW, srcH) {
  const raw = parseBBox(bboxRaw);
  if (!raw) return null;
  if (srcW > 0 && srcH > 0 && (srcW !== shotW || srcH !== shotH)) {
    return scaleBBoxToShot(raw, srcW, srcH, shotW, shotH);
  }
  return { x: raw.x, y: raw.y, w: raw.w, h: raw.h };
}

/** @param {Buffer} buf */
function readPngDimensions(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Mind2Web screenshots are often JPEG despite .png paths. @param {Buffer} buf */
function readJpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

/** @param {Buffer} buf */
function readImageDimensions(buf) {
  return readPngDimensions(buf) ?? readJpegDimensions(buf);
}

/** @param {string} bbox */
function parseBBox(bbox) {
  const [x, y, w, h] = bbox.split(',').map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Mind2Web bboxes are in dataset screenshot pixels; SnapDOM capture may differ in size.
 * @param {{ x: number; y: number; w: number; h: number }} bbox
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} shotW
 * @param {number} shotH
 */
function scaleBBoxToShot(bbox, srcW, srcH, shotW, shotH) {
  const sx = shotW / srcW;
  const sy = shotH / srcH;
  const x = bbox.x * sx;
  const y = bbox.y * sy;
  const w = bbox.w * sx;
  const h = bbox.h * sy;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, sx, sy };
}

/**
 * @param {number} px
 * @param {number} py
 * @param {{ x: number; y: number; w: number; h: number; cx: number; cy: number }} b
 */
function distToBBoxEdge(px, py, b) {
  const nx = Math.max(b.x, Math.min(px, b.x + b.w));
  const ny = Math.max(b.y, Math.min(py, b.y + b.h));
  return Math.hypot(px - nx, py - ny);
}

/** @param {number} px @param {number} py @param {{ cx: number; cy: number }} b */
function distToBBoxCenter(px, py, b) {
  return Math.hypot(px - b.cx, py - b.cy);
}

/** @param {number} px @param {number} py @param {{ x: number; y: number; w: number; h: number }} b */
function missDirection(px, py, b) {
  const parts = [];
  if (py < b.y) parts.push('above');
  else if (py > b.y + b.h) parts.push('below');
  if (px < b.x) parts.push('left');
  else if (px > b.x + b.w) parts.push('right');
  return parts.length ? parts.join('-') : 'inside';
}

/**
 * @param {{ x: number; y: number }} point norm 0–1 on captured screenshot
 * @param {string} bbox Mind2Web rect in dataset screenshot px
 * @param {number} shotW captured bitmap width
 * @param {number} shotH captured bitmap height
 * @param {number} srcW dataset PNG width
 * @param {number} srcH dataset PNG height
 */
function scoreGrounding(point, bbox, shotW, shotH, srcW, srcH) {
  const raw = parseBBox(bbox);
  if (!raw) throw new Error(`invalid bbox: ${bbox}`);

  const px = point.x * shotW;
  const py = point.y * shotH;
  const scaled =
    srcW > 0 && srcH > 0 && (srcW !== shotW || srcH !== shotH)
      ? scaleBBoxToShot(raw, srcW, srcH, shotW, shotH)
      : { ...raw, sx: 1, sy: 1 };

  const inside =
    px >= scaled.x - BBOX_HIT_EPS_PX &&
    px <= scaled.x + scaled.w + BBOX_HIT_EPS_PX &&
    py >= scaled.y - BBOX_HIT_EPS_PX &&
    py <= scaled.y + scaled.h + BBOX_HIT_EPS_PX;
  const edgePx = inside ? 0 : distToBBoxEdge(px, py, scaled);
  const centerPx = distToBBoxCenter(px, py, scaled);
  const dx = px - scaled.cx;
  const dy = py - scaled.cy;
  const hit = inside;
  const diag = Math.hypot(shotW, shotH);
  const bboxDiag = Math.hypot(scaled.w, scaled.h);

  return {
    hit,
    px,
    py,
    bbox: scaled,
    edgePx,
    centerPx,
    dx,
    dy,
    dir: missDirection(px, py, scaled),
    edgeNorm: edgePx / diag,
    centerNorm: centerPx / diag,
    edgeVsBbox: bboxDiag > 0 ? edgePx / bboxDiag : edgePx,
    scaled: srcW !== shotW || srcH !== shotH,
    srcW,
    srcH,
    shotW,
    shotH,
  };
}

/** @param {number[]} values @param {number} p 0–100 */
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** @param {number[]} values */
function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** @param {number} px */
function fmtPx(px) {
  return `${px.toFixed(1)}px`;
}

/** @param {string} split @param {number} offset @param {number} pageSize */
async function fetchHfPage(split, offset, pageSize) {
  const params = new URLSearchParams({
    dataset: DATASET,
    config: 'default',
    split,
    offset: String(offset),
    length: String(pageSize),
  });
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${HF_ROWS}?${params}`);
    if (res.status === 429 || res.status === 502 || res.status === 503) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HF rows API ${res.status}`);
    return res.json();
  }
  throw new Error('HF rows API unavailable (rate limit or 5xx)');
}

/**
 * @param {string} split
 * @param {Mind2WebOp[]} ops
 * @param {number} perType
 */
async function fetchMind2WebSamples(split, ops, perType) {
  /** @type {Array<{
   *   action_uid: string;
   *   op: Mind2WebOp;
   *   originalOp: string;
   *   query: string;
   *   actionValue: string;
   *   bbox: string;
   *   screenshotUrl: string;
   *   website: string;
   * }>} */
  const samples = [];
  const counts = Object.fromEntries(ops.map((op) => [op, 0]));
  let offset = 0;
  const pageSize = 100;
  const need = ops.reduce((n, op) => n + perType, 0);
  let skippedTall = 0;
  let skippedLow = 0;

  while (samples.length < need) {
    const data = await fetchHfPage(split, offset, pageSize);
    if (!data.rows?.length) break;

    for (const { row } of data.rows) {
      let operation;
      try {
        operation = JSON.parse(row.operation);
      } catch {
        continue;
      }
      const op = String(operation.op ?? '').toUpperCase();
      if (!ops.includes(op) || counts[op] >= perType) continue;

      const repr = row.target_action_reprs || row.action_reprs?.at(-1);
      if (!repr) continue;

      const pos = (row.pos_candidates ?? [])
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const target = pos.find((c) => c.is_original_target) || pos[0];
      if (!target?.attributes) continue;

      let attrs;
      try {
        attrs = JSON.parse(target.attributes);
      } catch {
        continue;
      }
      if (!attrs.bounding_box_rect || !row.screenshot?.src) continue;

      const query = primaryEvalQuery(String(repr), attrs, op);
      if (!query) continue;

      let srcH = 0;
      if (MAX_SRC_H > 0 || MAX_BBOX_BOTTOM_FRAC > 0) {
        try {
          const dims = await cacheSnapshotPng(row.action_uid, row.screenshot.src);
          srcH = dims.srcH;
          if (MAX_SRC_H > 0 && srcH > MAX_SRC_H) {
            skippedTall += 1;
            continue;
          }
          if (MAX_BBOX_BOTTOM_FRAC > 0 && srcH > 0) {
            const box = parseBBox(attrs.bounding_box_rect);
            if (box && (box.y + box.h) / srcH > MAX_BBOX_BOTTOM_FRAC) {
              skippedLow += 1;
              continue;
            }
          }
        } catch {
          continue;
        }
      }

      samples.push({
        action_uid: row.action_uid,
        op,
        originalOp: String(operation.original_op ?? operation.op ?? ''),
        fieldLabel: query,
        query,
        actionValue: String(operation.value ?? '').trim(),
        bbox: attrs.bounding_box_rect,
        screenshotUrl: row.screenshot.src,
        website: row.website ?? '',
      });
      counts[op] += 1;
      if (samples.length >= need) return samples;
      if (ops.every((k) => counts[k] >= perType)) return samples;
    }
    offset += pageSize;
    if (data.rows.length < pageSize) break;
  }
  if (skippedTall > 0) {
    console.info(
      `[mind2web-eval] skipped ${skippedTall} rows with src height > ${MAX_SRC_H}px (MIND2WEB_EVAL_MAX_SRC_H)`
    );
  }
  if (skippedLow > 0) {
    console.info(
      `[mind2web-eval] skipped ${skippedLow} rows with bbox bottom > ${MAX_BBOX_BOTTOM_FRAC * 100}% of src (MIND2WEB_EVAL_MAX_BBOX_BOTTOM_FRAC)`
    );
  }
  return samples;
}

/** @returns {Promise<import('node:child_process').ChildProcess | null>} */
async function ensureDevServer() {
  try {
    const r = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    if (r.ok) return null;
  } catch {
    /* start vite */
  }
  const port = new URL(BASE_URL).port || EVAL_DEV_PORT;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return child;
    } catch {
      await sleep(500);
    }
  }
  child.kill();
  throw new Error(`Dev server did not start at ${BASE_URL}`);
}

/**
 * @param {string} uid
 * @param {string} screenshotUrl
 * @returns {Promise<{ path: string; srcW: number; srcH: number }>}
 */
async function cacheSnapshotPng(uid, screenshotUrl) {
  fs.mkdirSync(SNAPSHOT_CACHE, { recursive: true });
  const file = path.join(SNAPSHOT_CACHE, `${uid}.png`);
  if (!fs.existsSync(file)) {
    /** @type {Error | null} */
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch(screenshotUrl);
        if (res.status === 429 || res.status === 502 || res.status === 503) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new Error(`screenshot HTTP ${res.status}`);
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        await sleep(1000 * (attempt + 1));
      }
    }
    if (lastErr) throw lastErr;
  }
  const buf = fs.readFileSync(file);
  const dims = readImageDimensions(buf);
  if (!dims?.w || !dims?.h) throw new Error(`image dimensions unreadable: ${file}`);
  return { path: `/eval-snapshot/cache/${uid}.png`, srcW: dims.w, srcH: dims.h };
}

/**
 * Host page fills the iframe (width 100%, body height = image) — not raw /cache/*.png,
 * which renders tiny in a huge viewport and breaks SnapDOM + bbox scaling.
 * @param {import('@playwright/test').Page} page
 * @param {string} imgPath
 * @param {string} uid unique per sample (navigation + sanity)
 */
async function waitEvalSnapshotReady(page) {
  await browseFrame(page)
    .getByTestId('eval-shot')
    .waitFor({ state: 'attached', timeout: MIND2WEB_NAV_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const frame = document.querySelector('[data-testid="browse-frame"]');
      const img = frame?.contentDocument?.getElementById('eval-shot');
      const root = frame?.contentDocument?.getElementById('capture-target');
      if (!root || !img?.complete || !img.naturalWidth || !img.naturalHeight) return false;
      const w = root.getBoundingClientRect().width;
      if (w <= 0) return false;
      const expectedH = Math.round((w * img.naturalHeight) / img.naturalWidth);
      return Math.abs(root.offsetHeight - expectedH) <= 1;
    },
    undefined,
    { timeout: MIND2WEB_NAV_TIMEOUT_MS }
  );
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} imgPath
 * @param {string} uid unique per sample (navigation + sanity)
 */
async function loadSnapshotInBrowse(page, imgPath, uid) {
  await showLiveBrowseViewport(page);
  const browsePath =
    `/eval-snapshot/index.html?src=${encodeURIComponent(imgPath)}&v=${encodeURIComponent(uid)}`;
  /** @type {unknown} */
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navigateBrowseTo(page, browsePath, {
        timeoutMs: MIND2WEB_NAV_TIMEOUT_MS,
        browseChromeTimeoutMs: MIND2WEB_NAV_TIMEOUT_MS,
      });
      await waitEvalSnapshotReady(page);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await sleep(800);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`eval snapshot not ready (${browsePath}): ${msg}`);
}

/**
 * Marker uses full-precision norms; #raw-output rounds — score the marker.
 * @param {import('@playwright/test').Page} page
 * @param {{ normX: number; normY: number }} parsed from waitForParsedTask
 */
async function groundingNormForScore(page, parsed) {
  const marker = await sampleMarkerPixels(page);
  if (!marker.ok) return { normX: parsed.normX, normY: parsed.normY, source: 'parsed' };
  const dNorm = Math.hypot(marker.nx - parsed.normX, marker.ny - parsed.normY);
  return {
    normX: marker.nx,
    normY: marker.ny,
    source: 'marker',
    parsedNormX: parsed.normX,
    parsedNormY: parsed.normY,
    parseRoundDelta: dNorm,
  };
}

/** @param {import('@playwright/test').Page} page */
async function screenshotDims(page) {
  return page.evaluate(() => {
    const el = document.getElementById('screenshot-img');
    if (!el) return { w: 0, h: 0 };
    const w = el.tagName === 'CANVAS' ? el.width : el.naturalWidth;
    const h = el.tagName === 'CANVAS' ? el.height : el.naturalHeight;
    return { w: w ?? 0, h: h ?? 0 };
  });
}

/**
 * Run task after capture — `click <label>` via the production Run task button.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function blackboxTaskClick(page, label) {
  await page.waitForFunction(() => !document.body.classList.contains('loading'));
  const parsed = await runTaskAndWaitParsed(page, `click ${label}`, MIND2WEB_INFERENCE_TIMEOUT_MS);
  await expect(page.locator('#click-marker')).toBeVisible();
  const scored = await groundingNormForScore(page, parsed);
  const query = (await page.locator('#prompt').inputValue()).trim();
  return {
    normX: scored.normX,
    normY: scored.normY,
    query,
    parseRoundDelta: scored.parseRoundDelta,
  };
}

/**
 * TYPE/SELECT — structured voice tool call → ShowUI grounds field, then DOM tool
 * (frozen shot may skip DOM). No phrase parsing — harness builds the call.
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string; fieldLabel: string; actionValue: string }} sample
 * @param {string} phrase display/Goal phrase for reporting only
 */
async function blackboxVoiceGround(page, sample, phrase) {
  await waitForE2eVoiceApi(page);
  const call =
    sample.op === 'SELECT'
      ? { name: 'select', arguments: { target: sample.fieldLabel, value: sample.actionValue } }
      : { name: 'input', arguments: { target: sample.fieldLabel, value: sample.actionValue } };
  await runE2eVoiceTool(page, call);
  const timeoutMs = Math.max(MIND2WEB_INFERENCE_TIMEOUT_MS, VOICE_GROUNDING_WAIT_MS);
  await page.waitForFunction(
    () => {
      const marker = document.getElementById('click-marker');
      const t = document.querySelector('[data-testid="voice-transcript"]')?.textContent ?? '';
      // Marker = grounding produced a point (scored from the model only).
      // Frozen dataset snapshots cannot apply live DOM type/select, so an
      // "Error: could not apply…" transcript with a visible marker still
      // counts as a completed grounding; no marker (locate failure) keeps
      // waiting and times out to FAIL.
      return marker && marker.style.display !== 'none' && /✓|Error:/.test(t);
    },
    undefined,
    { timeout: timeoutMs }
  );
  const marker = await sampleMarkerPixels(page);
  if (!marker.ok) throw new Error('voice grounding marker missing');
  return {
    normX: marker.nx,
    normY: marker.ny,
    query: phrase,
    parseRoundDelta: null,
  };
}

/**
 * Production session — no `?e2e=1` (gate `openProductionSession` + Load if needed).
 * @param {import('@playwright/test').Page} page
 * @param {string} baseURL
 * @param {string} modelId
 */
async function openMind2WebSession(page, baseURL, modelId) {
  const url = new URL('/home/', baseURL);
  url.searchParams.set('model', modelId);
  if (modelId !== 'ShowUI-2B') url.searchParams.set('benchmark', '1');
  if (NEEDS_VOICE) url.searchParams.set('e2e', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await dismissCoachOverlay(page);
  await page.waitForSelector('[data-testid="browse-frame"]', { timeout: 15_000 });
  await waitForBrowseFixtureReady(page);
  await ensureModelLoaded(page, modelId, loadTimeoutMsForModel(modelId));
}

/** @param {Mind2WebOp} op */
function plannedTool(op) {
  if (op === 'TYPE') return 'input';
  if (op === 'SELECT') return 'select';
  return 'click';
}

async function main() {
  console.info(
    `[mind2web-eval] blackbox — ${MODEL_ID} — ${SPLIT} — ops=${OPS.join('+')} per_type=${PER_TYPE} — ` +
      `CLICK=Run task TYPE/SELECT=voice`
  );
  await cacheModel({ modelId: MODEL_ID });

  const samples = await fetchMind2WebSamples(SPLIT, OPS, PER_TYPE);
  if (!samples.length) throw new Error(`No samples in split "${SPLIT}"`);

  const mix = Object.fromEntries(OPS.map((op) => [op, samples.filter((s) => s.op === op).length]));
  const failEarlyThreshold =
    FAIL_EARLY_PCT > 0 ? Math.max(1, Math.ceil((samples.length * FAIL_EARLY_PCT) / 100)) : 0;
  console.info(`[mind2web-eval] ${samples.length} samples — ${JSON.stringify(mix)}`);
  if (failEarlyThreshold > 0) {
    console.info(
      `[mind2web-eval] early exit at ${failEarlyThreshold} harness FAILs (${FAIL_EARLY_PCT}% of ${samples.length}); ` +
        `MISS/NEAR and Find parse failures do not count`
    );
  }
  console.info(`[mind2web-eval] pass bar: strict bbox_acc ≥ ${PASS_HIT_PCT}% (NEAR ≤${NEAR_DIAG_PX}px does not pass)`);

  fs.writeFileSync(
    RESULTS_FILE,
    `Mind2Web blackbox eval — ${MODEL_ID} — ${SPLIT} — ${new Date().toISOString()} — ` +
      `CLICK=Run task TYPE/SELECT=voice phrase\n`
  );

  const vite = await ensureDevServer();
  const launchBrowser = () =>
    chromium.launch({
      channel: 'chrome',
      headless: !HEADED,
      slowMo: SLOW_MO_MS,
      args: ['--enable-unsafe-webgpu'],
    });
  let browser = await launchBrowser();
  if (HEADED) {
    console.info('[mind2web-eval] headed Chrome — watch Load → browse → Capture → Find');
  }

  const byOp = Object.fromEntries(
    OPS.map((op) => [
      op,
      { parsed: 0, hits: 0, inferFail: 0, fetchFail: 0, edgePx: [], centerPx: [] },
    ])
  );
  /** @type {number[]} */
  const allEdgePx = [];
  /** @type {number[]} */
  const allCenterPx = [];
  let parsed = 0;
  let hits = 0;
  let nearHits = 0;
  let missCount = 0;
  let hardFail = 0;
  /** Capture/browse/prewarm only — never incremented on HIT/NEAR/MISS or Find parse timeout. */
  let failEarlyCount = 0;
  let earlyExit = false;

  /** Tab/browser/dev-server crash — recoverable harness state, not a scoring change. */
  const isDeadSession = (msg) =>
    /Target page, context or browser has been closed|browser has been closed|Execution context was destroyed|ERR_CONNECTION_REFUSED/i.test(
      String(msg)
    );

  try {
    const attachDebug = (p) => {
      if (process.env.MIND2WEB_EVAL_DEBUG !== '1') return;
      p.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error' || /\[(worker|main|capture|perf):/i.test(text)) {
          console.info(`\n[browser:${msg.type()}] ${text.slice(0, 400)}`);
        }
      });
      p.on('pageerror', (err) => console.info(`\n[pageerror] ${String(err).slice(0, 400)}`));
    };
    const openFreshPage = async () => {
      const p = await browser.newPage();
      p.setDefaultTimeout(MIND2WEB_PAGE_TIMEOUT_MS);
      p.setDefaultNavigationTimeout(MIND2WEB_PAGE_TIMEOUT_MS);
      attachDebug(p);
      await openMind2WebSession(p, BASE_URL, MODEL_ID);
      return p;
    };
    /** Replace a crashed tab (and browser, if needed) with a fresh session. */
    const recoverSession = async () => {
      try {
        await page.close();
      } catch {
        /* already gone */
      }
      const relaunch = async () => {
        try {
          await browser.close();
        } catch {
          /* already gone */
        }
        browser = await launchBrowser();
      };
      await ensureDevServer();
      if (!browser.isConnected()) await relaunch();
      try {
        page = await openFreshPage();
      } catch (err) {
        // Browser can report connected while its target is gone — full relaunch.
        console.info(
          `[mind2web-eval] fresh tab failed (${err instanceof Error ? err.message.split('\n')[0] : err}) — relaunching Chrome`
        );
        await relaunch();
        page = await openFreshPage();
      }
    };
    let page = await openFreshPage();

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const tag = `${i + 1}/${samples.length}`;
      const phrase =
        sample.op === 'CLICK' ? sample.fieldLabel : mind2webVoicePhrase(sample);
      const label =
        sample.op === 'CLICK'
          ? `${sample.op} "${phrase.slice(0, 40)}"`
          : `${sample.op} voice="${phrase.slice(0, 36)}" ground="${sample.fieldLabel.slice(0, 28)}"`;
      process.stdout.write(`[mind2web-eval] ${tag} ${label} `);

      // Fresh session every 12 samples — clears worker/UI stalls without reloading every few shots.
      if (i > 0 && i % 12 === 0) {
        try {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await openMind2WebSession(page, BASE_URL, MODEL_ID);
        } catch (err) {
          if (!isDeadSession(err instanceof Error ? err.message : String(err))) throw err;
          console.info('\n[mind2web-eval] session crashed on reload — recovering with a fresh tab');
          await recoverSession();
        }
      }

      try {
        const { path: imgPath, srcW, srcH } = await cacheSnapshotPng(
          sample.action_uid,
          sample.screenshotUrl
        );
        process.stdout.write('browse ');
        await page.locator('#prompt').fill('');
        await loadSnapshotInBrowse(page, imgPath, sample.action_uid);
        await expect(page.getByTestId('btn-capture')).toBeEnabled({
          timeout: MIND2WEB_INFERENCE_TIMEOUT_MS,
        });
        process.stdout.write('capture ');
        await runCaptureUntilReady(page, {
          captureTimeoutMs: MIND2WEB_CAPTURE_TIMEOUT_MS,
          screenshotTimeoutMs: MIND2WEB_CAPTURE_TIMEOUT_MS,
          readyTimeoutMs: MIND2WEB_CAPTURE_READY_TIMEOUT_MS,
          browseChromeTimeoutMs: MIND2WEB_NAV_TIMEOUT_MS,
        });
        process.stdout.write(sample.op === 'CLICK' ? 'task ' : 'voice ');

        const dims = await screenshotDims(page);
        if (!dims.w || !dims.h) throw new Error('screenshot dims missing');

        if (SHOW_BBOX) {
          await clearMind2WebBboxOverlay(page);
          const expected = bboxOnScreenshot(sample.bbox, dims.w, dims.h, srcW, srcH);
          if (expected) await showMind2WebBboxOverlay(page, expected);
        }

        const findResult =
          sample.op === 'CLICK'
            ? await blackboxTaskClick(page, sample.fieldLabel)
            : await blackboxVoiceGround(page, sample, phrase);
        const { normX, normY, query } = findResult;
        const goalAfter =
          sample.op === 'CLICK'
            ? query
            : (await page.locator('#prompt').inputValue()).trim() || phrase;

        const score = scoreGrounding(
          { x: normX, y: normY },
          sample.bbox,
          dims.w,
          dims.h,
          srcW,
          srcH
        );

        parsed += 1;
        byOp[sample.op].parsed += 1;
        byOp[sample.op].edgePx.push(score.edgePx);
        byOp[sample.op].centerPx.push(score.centerPx);
        allEdgePx.push(score.edgePx);
        allCenterPx.push(score.centerPx);
        if (score.hit) {
          hits += 1;
          byOp[sample.op].hits += 1;
        } else if (score.edgePx <= NEAR_DIAG_PX) {
          nearHits += 1;
        }

        if (SHOW_BBOX) {
          await showMind2WebBboxOverlay(page, score.bbox);
        }
        if (HEADED) {
          await page.waitForTimeout(Math.max(800, SLOW_MO_MS * 2));
        }

        const status = score.hit ? 'HIT' : score.edgePx <= NEAR_DIAG_PX ? 'NEAR' : 'MISS';
        const valueBit =
          sample.actionValue && sample.op !== 'CLICK' ? ` expected="${sample.actionValue}"` : '';
        const scaleBit = score.scaled ? ` src=${srcW}x${srcH}` : '';
        const roundBit =
          findResult.parseRoundDelta != null && findResult.parseRoundDelta > 0.0005
            ? ` parse_Δnorm=${findResult.parseRoundDelta.toFixed(4)}`
            : '';
        const offsetLine =
          `click=(${fmtPx(score.px)},${fmtPx(score.py)}) ` +
          `bbox_center=(${fmtPx(score.bbox.cx)},${fmtPx(score.bbox.cy)}) ` +
          `Δ=(${score.dx >= 0 ? '+' : ''}${fmtPx(score.dx)},${score.dy >= 0 ? '+' : ''}${fmtPx(score.dy)}) ` +
          `edge=${fmtPx(score.edgePx)} center=${fmtPx(score.centerPx)} ` +
          `dir=${score.dir}`;
        console.info(
          `${status} @ (${normX.toFixed(3)}, ${normY.toFixed(3)}) ` +
            `edge=${fmtPx(score.edgePx)} ${score.dir} ` +
            (sample.op === 'CLICK'
              ? `query="${query}"`
              : `voice="${query}" groundLabel="${goalAfter}"`)
        );
        fs.appendFileSync(
          RESULTS_FILE,
          `${status} ${sample.op} ${sample.action_uid} tool=${plannedTool(sample.op)} ` +
            (sample.op === 'CLICK'
              ? `query="${query}"${valueBit} `
              : `voice="${query}" groundLabel="${goalAfter}"${valueBit} `) +
            `norm=(${normX.toFixed(4)},${normY.toFixed(4)}) score=marker${roundBit} ${offsetLine} ` +
            `bbox_raw=${sample.bbox} shot=${dims.w}x${dims.h}${scaleBit} site=${sample.website}\n`
        );

        if (status === 'MISS') missCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const phase = /waitForFunction|navigation|browse|capture|Find|screenshot/i.test(msg)
          ? msg.split('\n')[0]
          : msg;
        if (/screenshot HTTP|fetch/i.test(msg)) byOp[sample.op].fetchFail += 1;
        else byOp[sample.op].inferFail += 1;
        hardFail += 1;
        if (isHarnessFail(msg)) failEarlyCount += 1;
        console.info(`FAIL ${phase}`);
        fs.appendFileSync(RESULTS_FILE, `FAIL ${sample.op} ${sample.action_uid} — ${msg}\n`);
        if (isDeadSession(msg)) {
          console.info('[mind2web-eval] session crashed — recovering with a fresh tab');
          await recoverSession();
        }
      }

      if (failEarlyThreshold > 0 && failEarlyCount >= failEarlyThreshold) {
        earlyExit = true;
        const ran = i + 1;
        const line =
          `\nEARLY_EXIT harness_fail=${failEarlyCount} hard_fail=${hardFail} threshold=${failEarlyThreshold} ` +
          `(${FAIL_EARLY_PCT}% of ${samples.length}) ran=${ran}/${samples.length} ` +
          `(MISS/NEAR and infer FAIL do not trigger early exit)\n`;
        console.info(
          `[mind2web-eval] early exit — ${failEarlyCount} harness failures (≥${FAIL_EARLY_PCT}% of ${samples.length})`
        );
        fs.appendFileSync(RESULTS_FILE, line);
        break;
      }
    }

    const acc = parsed ? ((100 * hits) / parsed).toFixed(1) : '0.0';
    const nearAcc = parsed ? ((100 * (hits + nearHits)) / parsed).toFixed(1) : '0.0';
    const within = (arr, maxPx) => arr.filter((d) => d <= maxPx).length;
    const offsetSummary = (label, edgeArr, centerArr) => {
      if (!edgeArr.length) return `${label}: (no parsed samples)`;
      return (
        `${label}: mean_edge=${fmtPx(mean(edgeArr))} med_edge=${fmtPx(percentile(edgeArr, 50))} ` +
        `p90_edge=${fmtPx(percentile(edgeArr, 90))} ` +
        `mean_center=${fmtPx(mean(centerArr))} med_center=${fmtPx(percentile(centerArr, 50))} ` +
        `≤25px=${within(edgeArr, 25)} ≤50px=${within(edgeArr, 50)} ≤100px=${within(edgeArr, 100)}`
      );
    };
    const passHit = parsed && Number(acc) >= PASS_HIT_PCT;
    const passLine = passHit ? 'PASS' : 'FAIL';
    const earlyBit = earlyExit ? ` early_exit_harness_fail=${failEarlyCount}` : '';
    const summary =
      `\nOverall: ${passLine} (bbox_acc≥${PASS_HIT_PCT}%=${passHit}) ` +
      `parsed=${parsed}/${samples.length} bbox_hits=${hits} bbox_acc=${acc}% ` +
      `near_≤${NEAR_DIAG_PX}px=${nearHits} near_acc=${nearAcc}% (diagnostic only) ` +
      `miss=${missCount} hard_fail=${hardFail}${earlyBit}\n` +
      offsetSummary(
        'Offset (edge distance = px from nearest bbox edge; 0 = HIT)',
        allEdgePx,
        allCenterPx
      ) +
      '\n' +
      OPS.map((op) => {
        const s = byOp[op];
        const a = s.parsed ? ((100 * s.hits) / s.parsed).toFixed(1) : '0.0';
        const off =
          s.edgePx.length > 0
            ? ` med_edge=${fmtPx(percentile(s.edgePx, 50))} mean_edge=${fmtPx(mean(s.edgePx))}`
            : '';
        return `${op}: ${s.hits}/${s.parsed} (${a}%)${off} infer_fail=${s.inferFail} fetch_fail=${s.fetchFail}`;
      }).join('\n') +
      '\n';
    fs.appendFileSync(RESULTS_FILE, summary);
    console.info(
      `[mind2web-eval] ${passLine} — strict bbox_acc ${acc}% (${hits}/${parsed}) ` +
        `near_acc ${nearAcc}% diagnostic (${nearHits} within ${NEAR_DIAG_PX}px, not pass) ` +
        `(bar≥${PASS_HIT_PCT}%)`
    );
    if (allEdgePx.length) {
      console.info(
        `[mind2web-eval] offset — med_edge=${fmtPx(percentile(allEdgePx, 50))} ` +
          `mean_edge=${fmtPx(mean(allEdgePx))} p90=${fmtPx(percentile(allEdgePx, 90))} ` +
          `≤25px=${within(allEdgePx, 25)}/${allEdgePx.length} ≤50px=${within(allEdgePx, 50)}/${allEdgePx.length}`
      );
    }
    console.info(`[mind2web-eval] → ${RESULTS_FILE}`);
    if (parsed === 0 || earlyExit || !passHit) process.exitCode = 1;
  } finally {
    await browser.close();
    vite?.kill();
  }
}

main().catch((err) => {
  console.error('[mind2web-eval] fatal:', err);
  process.exit(1);
});
