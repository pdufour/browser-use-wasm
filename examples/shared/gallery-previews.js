/**
 * Gallery card previews — browser SnapDOM capture via a hidden iframe.
 * Results cached in memory + sessionStorage (keyed by frame src).
 */
import { snapdom } from '@zumer/snapdom';
import { snapdomCaptureToCanvas } from 'browser-use-wasm';

const CACHE_PREFIX = 'gallery-preview:v1:';
const PREVIEW_FRAME_W = 640;
const PREVIEW_FRAME_H = 360;
const PREVIEW_MAX_PX = 480;
const PREVIEW_JPEG_QUALITY = 0.72;
const LOAD_TIMEOUT_MS = 24_000;
const SETTLE_MS = 1_050;
const STAGGER_MS = 2_000;

/** @type {Map<string, string>} */
const memoryCache = new Map();
/** @type {Array<{ visualEl: HTMLElement; frameSrc: string; label: string; static?: boolean }>} */
const queue = [];
let draining = false;

let previewStatusElementId = 'gallery-preview-status';

function updatePreviewStatus() {
  const el = document.getElementById(previewStatusElementId);
  if (!el) return;
  const pending = queue.length + (draining ? 1 : 0);
  if (pending > 0) {
    el.hidden = false;
    el.textContent =
      pending === 1 ? 'Capturing preview…' : `Capturing previews… (${pending} remaining)`;
  } else {
    el.hidden = true;
  }
}

/** @param {string} url */
export function resolveGalleryFrameSrc(url) {
  const t = String(url ?? '').trim();
  return t || '/browse-fixture/index.html';
}

function cacheKey(frameSrc) {
  return `${CACHE_PREFIX}${frameSrc}`;
}

/** @param {string} frameSrc */
function readCache(frameSrc) {
  if (memoryCache.has(frameSrc)) return memoryCache.get(frameSrc);
  try {
    const hit = sessionStorage.getItem(cacheKey(frameSrc));
    if (hit) {
      memoryCache.set(frameSrc, hit);
      return hit;
    }
  } catch {
    /* quota / private mode */
  }
  return null;
}

/** @param {string} frameSrc @param {string} dataUrl */
function writeCache(frameSrc, dataUrl) {
  memoryCache.set(frameSrc, dataUrl);
  try {
    sessionStorage.setItem(cacheKey(frameSrc), dataUrl);
  } catch {
    /* session quota — memory cache only */
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @returns {HTMLIFrameElement} */
function ensurePreviewFrame() {
  let host = document.getElementById('gallery-preview-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'gallery-preview-host';
    host.setAttribute('aria-hidden', 'true');
    // Off-screen only — `hidden`/`display:none` blocks iframe load + layout.
    host.style.cssText =
      `position:fixed;left:-9999px;top:0;width:${PREVIEW_FRAME_W}px;height:${PREVIEW_FRAME_H}px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;`;
    const iframe = document.createElement('iframe');
    iframe.id = 'gallery-preview-frame';
    iframe.title = 'Gallery preview capture';
    iframe.width = String(PREVIEW_FRAME_W);
    iframe.height = String(PREVIEW_FRAME_H);
    iframe.style.border = '0';
    host.appendChild(iframe);
    document.body.appendChild(host);
  }
  return /** @type {HTMLIFrameElement} */ (host.querySelector('iframe'));
}

/**
 * @param {HTMLIFrameElement} frame
 * @returns {Promise<HTMLElement>}
 */
function waitForCaptureRoot(frame) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const doc = frame.contentDocument;
      const root =
        (doc?.getElementById('capture-target') ?? doc?.body) || null;
      if (doc?.readyState === 'complete' && root && root.offsetWidth > 0) {
        resolve(root);
        return;
      }
      if (performance.now() - t0 > LOAD_TIMEOUT_MS) {
        reject(new Error('Preview frame did not become ready'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * @param {HTMLIFrameElement} frame
 * @param {string} frameSrc
 * @param {{ static?: boolean }} [opts]
 */
function loadPreviewFrame(frame, frameSrc, opts = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      frame.removeEventListener('load', onLoad);
      frame.removeEventListener('error', onErr);
      fn(arg);
    };

    const settleRoot = async () => {
      try {
        const root = await waitForCaptureRoot(frame);
        if (!opts.static) await delay(SETTLE_MS);
        finish(resolve, root);
      } catch (err) {
        finish(reject, err);
      }
    };

    const onLoad = () => void settleRoot();
    const onErr = () => finish(reject, new Error('Preview iframe failed to load'));

    const timer = setTimeout(
      () => finish(reject, new Error('Preview load timed out')),
      LOAD_TIMEOUT_MS
    );
    frame.addEventListener('load', onLoad);
    frame.addEventListener('error', onErr);

    const current = frame.getAttribute('src');
    if (current === frameSrc) {
      void settleRoot();
      return;
    }
    frame.src = frameSrc;
  });
}

/** @param {HTMLCanvasElement} canvas */
function canvasToPreviewDataUrl(canvas) {
  const scale = Math.min(1, PREVIEW_MAX_PX / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const thumb = document.createElement('canvas');
  thumb.width = w;
  thumb.height = h;
  const ctx = thumb.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/jpeg', PREVIEW_JPEG_QUALITY);
  ctx.drawImage(canvas, 0, 0, w, h);
  return thumb.toDataURL('image/jpeg', PREVIEW_JPEG_QUALITY);
}

/**
 * Clip iframe document to the preview viewport so tall pages capture quickly.
 * @param {HTMLElement} root
 * @returns {() => void}
 */
function clipPreviewViewport(root) {
  const doc = root.ownerDocument;
  const html = doc.documentElement;
  const body = doc.body;
  const prev = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body?.style.overflow ?? '',
    bodyHeight: body?.style.height ?? '',
    bodyMaxHeight: body?.style.maxHeight ?? '',
    rootHeight: root.style.height,
    rootMaxHeight: root.style.maxHeight,
    rootOverflow: root.style.overflow,
  };
  html.style.overflow = 'hidden';
  if (body) {
    body.style.overflow = 'hidden';
    body.style.height = `${PREVIEW_FRAME_H}px`;
    body.style.maxHeight = `${PREVIEW_FRAME_H}px`;
  }
  root.style.overflow = 'hidden';
  root.style.height = `${PREVIEW_FRAME_H}px`;
  root.style.maxHeight = `${PREVIEW_FRAME_H}px`;
  return () => {
    html.style.overflow = prev.htmlOverflow;
    if (body) {
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.maxHeight = prev.bodyMaxHeight;
    }
    root.style.overflow = prev.rootOverflow;
    root.style.height = prev.rootHeight;
    root.style.maxHeight = prev.rootMaxHeight;
  };
}

/**
 * @param {HTMLElement} root
 * @returns {Promise<string>}
 */
async function captureRootPreview(root) {
  const restore = clipPreviewViewport(root);
  try {
    const canvas = await snapdomCaptureToCanvas(snapdom, root);
    return canvasToPreviewDataUrl(canvas);
  } finally {
    restore();
  }
}

/**
 * @param {HTMLElement} visualEl
 * @param {string} dataUrl
 */
function applyPreview(visualEl, dataUrl) {
  const img = visualEl.querySelector('.task-card__preview-img, .home-card__preview-img');
  const skeleton = visualEl.querySelector(
    '.task-card__preview-skeleton, .home-card__preview-skeleton'
  );
  if (!(img instanceof HTMLImageElement)) return;
  img.src = dataUrl;
  img.hidden = false;
  img.removeAttribute('hidden');
  visualEl.classList.add('has-preview');
  visualEl.classList.remove('is-preview-loading');
  if (skeleton) skeleton.hidden = true;
}

/**
 * @param {HTMLElement} visualEl
 * @param {string} frameSrc
 * @param {{ static?: boolean; label?: string }} [opts]
 */
async function capturePreviewForUrl(visualEl, frameSrc, opts = {}) {
  const cached = readCache(frameSrc);
  if (cached) {
    applyPreview(visualEl, cached);
    return;
  }

  visualEl.classList.add('is-preview-loading');
  const frame = ensurePreviewFrame();
  const root = await loadPreviewFrame(frame, frameSrc, opts);
  const dataUrl = await captureRootPreview(root);
  writeCache(frameSrc, dataUrl);
  applyPreview(visualEl, dataUrl);
}

async function drainPreviewQueue() {
  if (draining) return;
  draining = true;
  updatePreviewStatus();
  while (queue.length) {
    const job = queue.shift();
    updatePreviewStatus();
    if (!job?.visualEl?.isConnected) continue;
    try {
      await capturePreviewForUrl(job.visualEl, job.frameSrc, {
        static: job.static,
        label: job.label,
      });
    } catch (err) {
      console.warn('[gallery-preview]', job.frameSrc, err);
      job.visualEl.classList.remove('is-preview-loading');
      job.visualEl.classList.add('is-preview-failed');
    }
    await delay(STAGGER_MS);
  }
  draining = false;
  updatePreviewStatus();
}

/**
 * Queue SnapDOM previews for card visual elements (staggered, one iframe).
 *
 * @param {Array<{ visualEl: HTMLElement; url: string; label?: string; static?: boolean }>} jobs
 * @param {{ statusId?: string }} [opts]
 */
export function scheduleGalleryPreviews(jobs, opts = {}) {
  previewStatusElementId = opts.statusId ?? 'gallery-preview-status';
  for (const job of jobs) {
    if (!job.visualEl) continue;
    const frameSrc = resolveGalleryFrameSrc(job.url);
    const cached = readCache(frameSrc);
    if (cached) {
      applyPreview(job.visualEl, cached);
      continue;
    }
    job.visualEl.classList.add('is-preview-loading');
    queue.push({
      visualEl: job.visualEl,
      frameSrc,
      label: job.label ?? '',
      static: job.static,
    });
  }
  updatePreviewStatus();
  void drainPreviewQueue();
}
