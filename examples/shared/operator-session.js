/**
 * Operator session helpers — browse-frame singleton for the gate app, plus a
 * thin embed wrapper for minimal / embed examples.
 */
import './examples-policy.js';
import {
  createWebOperator,
  drawMarker,
  clearMarker,
  getWllamaEnvIssues,
  loadCachedModelIds,
  canDownloadModelInBrowser,
  isRemoteModelLoadEnabled,
  BROWSER_VALIDATED_MODEL_IDS,
  DEFAULT_MODEL_ID,
  MODELS,
  getCaptureElement,
  getBrowseDocument,
} from 'browser-use-wasm';
import { clearCaptureStage, mountCaptureCanvas } from './capture-ui.js';
import { ensureModelDownloadConsent } from './model-download-gate.js';

export { $ } from './dom.js';

const params = new URLSearchParams(location.search);
const allowExperimental = params.has('benchmark') || params.get('allowExperimental') === '1';

/** ?model= fallback: experimental ids without benchmark=1 fall back to the validated default. */
export function resolveStartupModelId() {
  const want = params.get('model');
  if (!want || want === DEFAULT_MODEL_ID) return DEFAULT_MODEL_ID;
  const known = MODELS.some((m) => m.id === want);
  if (known && (BROWSER_VALIDATED_MODEL_IDS.includes(want) || allowExperimental)) return want;
  const url = new URL(location.href);
  url.searchParams.set('model', DEFAULT_MODEL_ID);
  history.replaceState(null, '', url);
  return DEFAULT_MODEL_ID;
}

function createBrowseOperator() {
  return createWebOperator({
    modelId: resolveStartupModelId(),
    captureRoot: () => getCaptureElement(),
    targetDocument: () => getBrowseDocument(),
  });
}

/**
 * No-args: configured {@link WebOperator} for `examples/operator` (HMR-persisted).
 * With options: embed session `{ operator, load, capture, runTask, … }`.
 */
export function createOperatorSession(options) {
  if (options && Object.keys(options).length > 0) {
    return createEmbedSession(options);
  }
  const operator =
    import.meta.hot?.data.operator ?? createBrowseOperator();
  if (import.meta.hot) import.meta.hot.data.operator = operator;
  return operator;
}

/**
 * @param {import('../../src/operator.ts').WebOperatorOptions & {
 *   captureStageEl?: HTMLElement | null;
 *   onStatus?: (text: string) => void;
 *   onRaw?: (text: string) => void;
 * }} options
 */
function createEmbedSession(options) {
  const {
    captureStageEl = null,
    onStatus = () => {},
    onRaw = () => {},
    ...operatorOpts
  } = options;

  const operator = createWebOperator({
    modelId: DEFAULT_MODEL_ID,
    ...operatorOpts,
  });

  let busy = false;
  let modelLoaded = false;
  let captureReady = false;

  async function load() {
    if (busy) return;
    const cachedIds = await loadCachedModelIds().catch(() => new Set());
    const ok = await ensureModelDownloadConsent({
      model: operator.model,
      cachedIds,
    });
    if (!ok) {
      onStatus('Download cancelled — try Load again when ready.');
      return;
    }
    busy = true;
    try {
      await operator.load({ onStatus });
      modelLoaded = true;
      onStatus(`${operator.model.label} loaded — capture the page to run a task.`);
    } catch (err) {
      onStatus(
        `${operator.model.label} load failed: ${err instanceof Error ? err.message : err}`
      );
      throw err;
    } finally {
      busy = false;
    }
  }

  async function capture() {
    if (busy || !modelLoaded) return;
    busy = true;
    captureReady = false;
    try {
      const cap = await operator.capture();
      if (captureStageEl) {
        const { caption } = mountCaptureCanvas(captureStageEl, cap);
        onStatus(caption('encoding…'));
      } else {
        onStatus(`Captured ${cap.width}×${cap.height}px — encoding…`);
      }
      const buffer = await cap.whenEncoded;
      if (buffer && operator.captureGeneration === cap.generation) {
        captureReady = true;
        onStatus(
          captureStageEl
            ? `Captured ${cap.width}×${cap.height}px — ready to run a task.`
            : `${operator.model.label} — ready to run a task.`
        );
      }
      return cap;
    } catch (err) {
      onStatus(`Capture failed: ${err instanceof Error ? err.message : err}`);
      throw err;
    } finally {
      busy = false;
    }
  }

  async function runTask(task) {
    const goal = String(task ?? '').trim();
    if (!goal || busy || !modelLoaded) return { ok: false, summary: 'not ready' };
    if (!captureReady) {
      await capture();
      if (!captureReady) return { ok: false, summary: 'capture not ready' };
    }
    busy = true;
    onRaw(`Running ${operator.model.label} navigation…`);
    try {
      const result = await operator.instruct(goal, {
        onStatus,
        onRecapture: (cap) => {
          if (captureStageEl) mountCaptureCanvas(captureStageEl, cap);
        },
      });
      if (result.degenerate || !result.steps.length) {
        onRaw(`no parsable action — model said:\n${result.text}`);
        onStatus('No parsable action — ready to try again.');
        return { ok: false, summary: 'no parsable action' };
      }
      const grounded = [...result.steps].reverse().find((s) => s.point);
      if (grounded?.point) {
        drawMarker(grounded.point.x, grounded.point.y);
      } else {
        clearMarker();
      }
      const lines = result.steps.map(
        (s) =>
          `${s.ok ? '✓' : '✗'} ${s.action}` +
          (s.point ? ` @ [${s.point.x.toFixed(2)}, ${s.point.y.toFixed(2)}]` : '') +
          ` — ${s.detail}`
      );
      onRaw(`Parsed actions: ${result.summary}\n${lines.join('\n')}\n\n${result.text}`);
      onStatus(result.ok ? `Done — ${result.summary}` : `Stopped — ${result.summary}`);
      return { ok: result.ok, summary: result.summary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onRaw(`Error: ${msg}`);
      onStatus(`Error — ${msg}`);
      return { ok: false, summary: msg };
    } finally {
      busy = false;
    }
  }

  function resetCapture() {
    operator.clearCapture();
    captureReady = false;
    if (captureStageEl) clearCaptureStage(captureStageEl);
    clearMarker();
  }

  return {
    operator,
    get modelLoaded() {
      return modelLoaded;
    },
    get captureReady() {
      return captureReady;
    },
    get busy() {
      return busy;
    },
    load,
    capture,
    runTask,
    resetCapture,
  };
}

export function markModelLoaded(statusEl = $('model-status'), operator) {
  statusEl.dataset.modelLoaded = '1';
  statusEl.dataset.modelId = operator.model.id;
}

export function clearModelLoaded() {
  const el = document.getElementById('model-status');
  if (el) delete el.dataset.modelLoaded;
}

export function captureReadyStatus(operator, { captureReady }) {
  const img = document.getElementById('screenshot-img');
  const w = img?.width;
  const h = img?.height;
  if (captureReady && w && h) {
    return `${operator.model.label} loaded — captured ${w}×${h}px, ready to run a task.`;
  }
  return `${operator.model.label} — ready to run a task.`;
}

export async function bootOperatorModel({ operator, loadModel, onBootState }) {
  const cachedIds = await loadCachedModelIds().catch(() => new Set());
  onBootState({ cachedIds });
  const envIssues = getWllamaEnvIssues();
  if (envIssues.length) {
    onBootState({ status: envIssues[0], raw: envIssues.join('\n'), loadDisabled: true });
  } else if (
    cachedIds.has(operator.model.id) ||
    (canDownloadModelInBrowser(operator.model) && isRemoteModelLoadEnabled())
  ) {
    await loadModel();
  } else {
    onBootState({
      status: `${operator.model.label} is not available — pick a downloadable model in the switcher.`,
    });
  }
}
