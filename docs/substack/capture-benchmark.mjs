/**
 * SnapDOM vs html2canvas-pro capture timing (browser).
 * Product-faithful SnapDOM path via src/snapdom/capture.ts.
 */
import html2canvas from 'html2canvas-pro';
import { snapdom } from '@zumer/snapdom';
import { CAPTURE_DPR_MAX } from '../../src/config/vl.ts';
import { snapdomCaptureToCanvas } from '../../src/snapdom/capture.ts';

const DEFAULT_WARMUP = 1;
const DEFAULT_RUNS = 5;

function captureBox(element) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

async function captureSnapdom(element) {
  return snapdomCaptureToCanvas(snapdom, element);
}

async function captureHtml2canvasPro(element) {
  const { width, height } = captureBox(element);
  const dpr = Math.min(CAPTURE_DPR_MAX, globalThis.devicePixelRatio ?? 1);
  return html2canvas(element, {
    width,
    height,
    scale: dpr,
    useCORS: true,
    logging: false,
  });
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(samples) {
  return {
    median: Math.round(median(samples)),
    min: Math.round(Math.min(...samples)),
    max: Math.round(Math.max(...samples)),
    samples: samples.map((n) => Math.round(n)),
  };
}

async function timeCapture(fn) {
  const t0 = performance.now();
  const canvas = await fn();
  return { ms: performance.now() - t0, canvas };
}

async function benchLibrary(label, captureFn, { warmup = DEFAULT_WARMUP, runs = DEFAULT_RUNS } = {}) {
  for (let i = 0; i < warmup; i++) {
    const { canvas } = await timeCapture(captureFn);
    void canvas;
  }

  const samples = [];
  let lastCanvas = null;
  for (let i = 0; i < runs; i++) {
    const { ms, canvas } = await timeCapture(captureFn);
    samples.push(ms);
    lastCanvas = canvas;
    await new Promise((r) => setTimeout(r, 16));
  }

  return {
    library: label,
    ...summarize(samples),
    canvas: {
      width: lastCanvas?.width ?? 0,
      height: lastCanvas?.height ?? 0,
    },
  };
}

/**
 * @param {Element} element - `#capture-target` (or equivalent)
 * @param {{ warmup?: number, runs?: number, fixture?: string }} opts
 */
export async function benchmarkCaptureTarget(element, opts = {}) {
  const { warmup = DEFAULT_WARMUP, runs = DEFAULT_RUNS, fixture = 'target' } = opts;
  if (!element) throw new Error('benchmark target element missing');

  const snapdomResult = await benchLibrary('SnapDOM', () => captureSnapdom(element), { warmup, runs });
  const html2canvasResult = await benchLibrary('html2canvas-pro', () => captureHtml2canvasPro(element), {
    warmup,
    runs,
  });

  const ratio =
    snapdomResult.median > 0
      ? Math.round((html2canvasResult.median / snapdomResult.median) * 10) / 10
      : null;

  return {
    fixture,
    snapdom: snapdomResult,
    html2canvasPro: html2canvasResult,
    snapdomFasterBy: ratio,
  };
}

export async function runCaptureBenchmark(opts = {}) {
  const warmup = opts.warmup ?? DEFAULT_WARMUP;
  const runs = opts.runs ?? DEFAULT_RUNS;
  const results = [];

  const targets = [
    {
      frameId: 'bench-simple-frame',
      fixture: 'Simple webpage',
    },
    {
      frameId: 'bench-fixture-frame',
      fixture: 'Checkout page',
    },
  ];

  for (const { frameId, fixture } of targets) {
    const iframe = document.getElementById(frameId);
    const element = iframe?.contentDocument?.getElementById('capture-target');
    if (element) {
      results.push(await benchmarkCaptureTarget(element, { warmup, runs, fixture }));
    }
  }

  if (!results.length) throw new Error('No benchmark targets found');

  return {
    ranAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    warmup,
    runs,
    results,
  };
}
