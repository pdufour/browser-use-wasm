/**
 * Shared capture preview — SnapDOM canvas mount, marker, viewport toggle.
 * Used by operator, voice, forms, models, and embed examples.
 */
import { clearMarker, drawMarker } from 'browser-use-wasm';
import { $ } from './dom.js';
import { openDevDetails } from './dev-details-sync.js';

/** Clear a screenshot stage and remove any click marker. */
export function clearCaptureStage(stageEl) {
  if (!stageEl) return;
  clearMarker();
  stageEl.innerHTML = '';
  stageEl.classList.add('empty');
}

function resolveMountArgs(a, b) {
  if (a && typeof a === 'object' && 'canvas' in a) {
    return { cap: a, stage: b?.stage ?? $('screenshot-stage'), opts: b ?? {} };
  }
  return { stage: a, cap: b, opts: {} };
}

/**
 * Mount a capture canvas. Supports:
 * - `mountCaptureCanvas(cap, { operator, showSnapshot })` — operator / voice
 * - `mountCaptureCanvas(stageEl, cap)` — forms / models / embed panel
 */
export function mountCaptureCanvas(a, b) {
  const { stage, cap, opts } = resolveMountArgs(a, b);
  if (!stage || !cap) return { caption: () => '' };

  clearMarker();
  stage.innerHTML = '';
  stage.classList.remove('empty');

  const inner = document.createElement('div');
  inner.className = 'screenshot-inner';
  cap.canvas.id = 'screenshot-img';
  cap.canvas.className = 'screenshot-img';
  cap.canvas.dataset.testid = 'screenshot-img';
  cap.canvas.style.width = '100%';
  cap.canvas.style.height = 'auto';
  inner.appendChild(cap.canvas);
  stage.appendChild(inner);

  const showSnapshot = opts.showSnapshot ?? false;
  if (showSnapshot) {
    document.body.dataset.viewport = 'snapshot';
    openDevDetails();
  }

  const modelLabel = opts.operator?.model?.label ?? opts.modelLabel ?? 'ShowUI';
  const caption = (tail) =>
    showSnapshot
      ? `Captured ${cap.width}×${cap.height}px — ${tail}`
      : `${modelLabel} loaded — captured ${cap.width}×${cap.height}px, ${tail}`;

  const statusEl = $('model-status');
  if (statusEl) statusEl.dataset.captureGeneration = String(cap.generation);

  return { statusEl, caption, generation: cap.generation };
}

/** Place marker on the capture canvas — does not switch away from live view. */
export function placeMarkerOnCapture(x, y) {
  drawMarker(x, y);
}

/** Refresh screenshot panel from an existing operator capture (agent re-capture). */
export function syncCaptureUi(cap, { operator }) {
  const { caption } = mountCaptureCanvas(cap, { operator, showSnapshot: false });
  const statusEl = $('model-status');
  if (statusEl) statusEl.dataset.captureReady = '1';
  return { status: caption('ready to run a task.') };
}

/** Drop capture UI state after navigation or model switch. */
export function resetCaptureUi(operator) {
  operator.clearCapture();
  const statusEl = $('model-status');
  if (statusEl) delete statusEl.dataset.captureReady;
  clearMarker();
  document.body.dataset.viewport = 'live';
  const stage = $('screenshot-stage');
  if (stage) clearCaptureStage(stage);
}

/** Cmd/Ctrl+Shift+S toggles live ↔ snapshot viewport. Returns true when handled. */
export function handleViewportToggleKeydown(e) {
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 's') {
    e.preventDefault();
    const next = document.body.dataset.viewport === 'snapshot' ? 'live' : 'snapshot';
    document.body.dataset.viewport = next;
    if (next === 'snapshot') openDevDetails();
    return true;
  }
  return false;
}
