/**
 * User-facing demo helpers — human status, autoload, hide dev chrome.
 */
import './examples-policy.js';
import {
  getWllamaEnvIssues,
  loadCachedModelIds,
  getModelById,
  canDownloadModelInBrowser,
  isRemoteModelLoadEnabled,
} from 'browser-use-wasm';
import { ensureModelDownloadConsent } from './model-download-gate.js';
import { demoLog, demoWarn } from './demo-log.js';
import { isGitHubPagesHost, waitForCrossOriginIsolation } from './wait-coi.js';

/** Model load ceiling — matches E2E `LOAD_TIMEOUT_MS`. */
export const BOOT_LOAD_TIMEOUT_MS = 60_000;
export const BOOT_FRAME_TIMEOUT_MS = 20_000;
export const BOOT_CAPTURE_TIMEOUT_MS = 20_000;

function withBootTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out (${Math.round(ms / 1000)}s)`)),
        ms
      );
    }),
  ]);
}

/** Strip agent-loop turn prefix (`Step 2: CLICK "foo"` → `CLICK "foo"`). */
function stripStepPrefix(text) {
  return String(text ?? '').replace(/^Step\s+\d+:\s*/i, '').trim();
}

/** Map technical operator status to plain-language UI copy. */
export function humanStatus(text, { goal } = {}) {
  const t = stripStepPrefix(String(text ?? '').trim());
  if (!t) return 'Ready';

  if (/not cached|cache:model/i.test(t)) {
    return 'This model needs a one-time download — confirm in the dialog';
  }
  if (/download cancelled/i.test(t)) {
    return 'Download cancelled — refresh when you are ready';
  }
  if (/Confirm the download dialog/i.test(t)) {
    return 'Confirm the dialog to load the AI model';
  }
  if (/Cross-Origin Isolation starting/i.test(t)) {
    return isGitHubPagesHost()
      ? 'First visit on GitHub Pages — the page will reload once, then you can Run'
      : 'Setting up browser isolation — reload once if this stays stuck';
  }
  if (/COOP|COEP|Chrome|Edge|file:\/\//i.test(t)) {
    return isGitHubPagesHost()
      ? 'Use Chrome or Edge — GitHub Pages reloads once on first visit'
      : 'Open this page in Chrome or Edge via npm run dev';
  }
  if (/failed to load|Navigation failed|frame did not become ready|Browse frame missing/i.test(t)) {
    return 'That page didn’t load — try refreshing';
  }
  if (/timed out/i.test(t)) {
    return 'Startup timed out — refresh the page';
  }
  if (/load failed|Error/i.test(t)) {
    if (/worker error|failed to fetch dynamically imported module|ERR_BLOCKED_BY_RESPONSE/i.test(t)) {
      return 'Model worker failed to start — hard refresh (Cmd+Shift+R) and try again';
    }
    return t.replace(/^Error — /, 'Something went wrong — ');
  }

  if (/^Downloading .*?(\d+)%/i.test(t)) {
    const m = t.match(/(\d+)%/);
    return m ? `Downloading model… ${m[1]}%` : 'Downloading model weights…';
  }
  if (/^Downloading /i.test(t) || /from Hugging Face/i.test(t)) {
    return 'Downloading model weights…';
  }
  if (/^Loading…$/i.test(t) || /^Loading /i.test(t) || /loaded — [\d?]+ GPU/i.test(t)) {
    return 'Loading model into your browser…';
  }
  if (/encoding/i.test(t)) {
    return 'Looking at the page…';
  }
  if (/ready to run a task/i.test(t)) {
    return goal ? `Ready — try “${goal}”` : 'Ready — what should I do next?';
  }
  if (/^Running /i.test(t) || /navigation…/i.test(t)) {
    return goal ? `Working on “${goal}”…` : 'Working on it…';
  }
  if (/^thinking…$/i.test(t)) {
    return goal ? `Figuring out how to “${goal}”…` : 'Figuring out the next step…';
  }
  if (t === 'Observing…' || /Observing/i.test(t)) {
    return 'Watching what changed on the page…';
  }
  if (/^CLICK\b/i.test(t)) {
    return 'Clicking now…';
  }
  if (/^INPUT\b/i.test(t)) {
    const m = t.match(/^INPUT\s+"([^"]+)"/);
    return m ? `Typing “${m[1]}”…` : 'Typing…';
  }
  if (/^SELECT\b/i.test(t)) {
    const m = t.match(/^SELECT\s+"([^"]+)"/);
    return m ? `Choosing “${m[1]}”…` : 'Selecting…';
  }
  if (/^SCROLL\b/i.test(t)) {
    return /up/i.test(t) ? 'Scrolling up…' : 'Scrolling down…';
  }
  if (/^ENTER\b/i.test(t)) {
    return 'Pressing Enter…';
  }
  if (/^Done — /i.test(t)) {
    return humanizeDone(t);
  }
  if (/^Stopped — /i.test(t)) {
    return t.replace(/^Stopped — /, 'Stopped — ');
  }
  if (/No parsable action/i.test(t)) {
    return 'I couldn’t figure out what to do — try phrasing it differently';
  }
  if (/Captured \d+×\d+/i.test(t)) {
    return 'Looking at the page…';
  }

  return t;
}

function humanizeDone(text) {
  const body = text.replace(/^Done — /, '');
  const parts = body.split(/\s*→\s*/);
  const verbs = parts.map((p) => {
    const a = p.trim().toUpperCase();
    if (a.startsWith('CLICK')) return 'clicked';
    if (a.startsWith('INPUT')) return 'filled in the field';
    if (a.startsWith('SELECT')) return 'made your selection';
    if (a.startsWith('SCROLL')) return 'scrolled';
    if (a.startsWith('ENTER')) return 'pressed Enter';
    return p.toLowerCase();
  });
  if (verbs.length === 1) return `Done — ${verbs[0]}`;
  if (verbs.length === 2) return `Done — ${verbs[0]} and ${verbs[1]}`;
  return `Done — ${verbs.slice(0, -1).join(', ')} and ${verbs[verbs.length - 1]}`;
}

/** Off-screen capture stage — keeps #screenshot-img in DOM for markers / E2E. */
export function ensureHiddenCaptureMount() {
  let stage = document.getElementById('screenshot-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'screenshot-stage';
    stage.className = 'screenshot-stage dev-capture-mount';
    stage.dataset.testid = 'screenshot-stage';
    document.body.appendChild(stage);
  }
  stage.classList.add('dev-capture-mount');
  return stage;
}

/** Hide dev panels; tuck optional nodes under a disclosure. */
export function hideDevChrome({ hideIds = [], detailsId } = {}) {
  document.body.classList.add('user-facing-demo');
  for (const id of hideIds) {
    const el = document.getElementById(id);
    if (el) el.classList.add('dev-chrome');
  }
  if (detailsId) {
    const details = document.getElementById(detailsId);
    if (details) details.classList.add('dev-details');
  }
}

/**
 * Autoload model + silent capture — operator-style parallel boot:
 * model load and iframe ready run together; capture after both succeed.
 * @param {{
 *   modelId: string;
 *   waitForFrame: () => Promise<unknown>;
 *   load: () => Promise<void>;
 *   capture: (opts?: { showSnapshot?: boolean }) => Promise<unknown>;
 *   onTechnicalStatus?: (text: string) => void;
 *   onHumanStatus?: (text: string) => void;
 *   goal?: string;
 *   loadTimeoutMs?: number;
 *   frameTimeoutMs?: number;
 *   captureTimeoutMs?: number;
 * }} opts
 */
export async function autoloadAndCapture(opts) {
  const {
    modelId,
    waitForFrame,
    load,
    capture,
    onTechnicalStatus = () => {},
    onHumanStatus = () => {},
    goal,
    loadTimeoutMs = BOOT_LOAD_TIMEOUT_MS,
    frameTimeoutMs = BOOT_FRAME_TIMEOUT_MS,
    captureTimeoutMs = BOOT_CAPTURE_TIMEOUT_MS,
  } = opts;

  const setStatus = (technical) => {
    onTechnicalStatus(technical);
    onHumanStatus(humanStatus(technical, { goal }));
  };

  const fail = (reason, err, technical) => {
    const msg = err instanceof Error ? err.message : String(err ?? reason);
    console.error('[browse:autoload]', reason, err ?? msg);
    setStatus(technical ?? `Error — ${msg}`);
    return { ok: false, reason, error: err ?? new Error(msg) };
  };

  demoLog('autoload', 'start', {
    modelId,
    goal: goal ?? null,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    host: location.hostname,
  });

  const coi = await waitForCrossOriginIsolation();
  demoLog('autoload', 'coi wait', coi);
  if (!coi.ready) {
    if (coi.reason === 'coi-reload-pending') {
      setStatus('Cross-Origin Isolation starting — GitHub Pages reloads once on first visit, then Run works');
      return { ok: false, reason: 'coi' };
    }
  }

  const issues = getWllamaEnvIssues();
  if (issues.length) {
    demoWarn('autoload', 'env blocked', { issues });
    setStatus(issues[0]);
    return { ok: false, reason: 'env' };
  }

  const cached = await loadCachedModelIds().catch((err) => {
    console.error('[browse:autoload] manifest', err);
    return new Set();
  });
  const model = getModelById(modelId);
  demoLog('autoload', 'cache check', {
    modelId,
    cached: cached.has(modelId),
    remoteLoad: isRemoteModelLoadEnabled(),
    canDownload: canDownloadModelInBrowser(model),
  });
  if (!cached.has(modelId)) {
    if (!canDownloadModelInBrowser(model) || !isRemoteModelLoadEnabled()) {
      const technical = `${modelId} not available — pre-cache with npm run cache:model or open /home/ for a downloadable model`;
      demoWarn('autoload', 'cache miss — cannot load', { technical });
      setStatus(technical);
      return { ok: false, reason: 'cache' };
    }
  }

  setStatus('Confirm the download dialog to load the AI model…');
  const ok = await ensureModelDownloadConsent({ model, cachedIds: cached });
  demoLog('autoload', 'download consent', { ok });
  if (!ok) {
    setStatus('Download cancelled — refresh when ready.');
    return { ok: false, reason: 'consent' };
  }

  setStatus('Loading…');
  demoLog('autoload', 'parallel load + frame');

  try {
    await Promise.all([
      withBootTimeout(waitForFrame(), frameTimeoutMs, 'Page load'),
      withBootTimeout(load(), loadTimeoutMs, 'Model load'),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/page load/i.test(msg)) {
      return fail('frame', err, 'Sample page failed to load — refresh the page');
    }
    if (/worker error|ERR_BLOCKED_BY_RESPONSE|dynamically imported module/i.test(msg)) {
      return fail(
        'boot',
        err,
        'Error — model worker blocked (refresh with Cmd+Shift+R; needs npm run dev, not a static file server)'
      );
    }
    return fail('boot', err);
  }

  try {
    await withBootTimeout(capture({ showSnapshot: false }), captureTimeoutMs, 'Capture');
    setStatus('ready to run a task.');
    demoLog('autoload', 'done', { ok: true });
    return { ok: true };
  } catch (err) {
    demoWarn('autoload', 'capture failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return fail('capture', err);
  }
}

/** Wire a status element to show human copy while preserving technical callbacks. */
export function bindHumanStatus(el, { goal } = {}) {
  if (!el) return { setTechnical: () => {}, setHuman: () => {} };
  const setHuman = (text) => {
    el.textContent = humanStatus(text, { goal });
  };
  const setTechnical = (text) => {
    el.dataset.technicalStatus = text;
    setHuman(text);
  };
  return { setTechnical, setHuman };
}
