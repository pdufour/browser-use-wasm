/**
 * Thin shared runner — autoload model, load a URL in #browse-frame, capture, run goal.
 */
import {
  createWebOperator,
  createPromptApiOperator,
  resolveWasmUrl,
  setBrowseHomePath,
  getBrowseFrame,
  getBrowseDocument,
  getCaptureElement,
  waitForBrowseFrameReady,
  navigateBrowseFrame,
  drawMarker,
  clearMarker,
} from 'browser-use-wasm';
import { $ } from './dom.js';
import { mountCaptureCanvas } from './capture-ui.js';
import { createLiveCursor } from './live-cursor.js';
import {
  autoloadAndCapture,
  bindHumanStatus,
  hideDevChrome,
  humanStatus,
  ensureHiddenCaptureMount,
  BOOT_FRAME_TIMEOUT_MS,
} from './user-facing.js';
import { syncDevChrome } from './dev-details-sync.js';
import { wireClearCacheButton } from './clear-browser-cache.js';
import { BUILTIN_BROWSE_PATH } from './browse-defaults.js';
import { resolveAppPath, withBase } from './app-base.js';
import { demoLog, demoWarn, logGoalBarState } from './demo-log.js';

/**
 * @param {{
 *   initialUrl?: string;
 *   initialGoal?: string;
 *   frameTitle?: string;
 *   hideDevDetails?: boolean;
 *   wireSiteHeader?: boolean;
 * }} [options]
 */
export function initTaskRunner(options = {}) {
  const {
    initialUrl = BUILTIN_BROWSE_PATH,
    initialGoal = '',
    frameTitle = 'Website',
    hideDevDetails = true,
    wireSiteHeader = false,
    useNativeAi = false,
  } = options;

  setBrowseHomePath(initialUrl);
  if (hideDevDetails) hideDevChrome({ detailsId: 'dev-details' });
  ensureHiddenCaptureMount();

  const operator = useNativeAi
    ? createPromptApiOperator({
        captureRoot: () => getCaptureElement(),
        targetDocument: () => getBrowseDocument(),
      })
    : createWebOperator({
        captureRoot: () => getCaptureElement(),
        targetDocument: () => getBrowseDocument(),
      });

  let busy = false;
  let booting = true;
  let modelLoaded = false;
  let frameReady = false;
  let captureReady = false;
  let bootGeneration = 0;

  if (wireSiteHeader) {
    const aside = document.querySelector('[data-site-header-aside]');
    const statusRow =
      document.querySelector('.browse-status-row--floating') ??
      document.querySelector('.browse-status-row');
    if (aside && statusRow) aside.appendChild(statusRow);
  }

  const statusRow =
    document.querySelector('.browse-status-row--floating') ??
    document.querySelector('.browse-status-row');
  wireClearCacheButton(statusRow, { compact: true });
  wireClearCacheButton(document.querySelector('#dev-details .dev-details__body'));

  const heroStatusEl = $('hero-status');
  const heroStatus = bindHumanStatus(heroStatusEl);
  const modelStatusEl = $('model-status');
  const promptEl = $('prompt');
  const runBtn = $('btn-run');
  const liveWrap = $('live-wrap');
  const liveCursor = createLiveCursor(liveWrap, getBrowseFrame, getCaptureElement);
  const addressEl = $('address-bar');

  demoLog('task-runner', 'init', {
    initialUrl,
    initialGoal,
    wireSiteHeader,
    wasmUrl: resolveWasmUrl(),
    hasRunBtn: !!runBtn,
    hasGoalForm: !!$('goal-form'),
    hasPrompt: !!promptEl,
    hasFrame: !!getBrowseFrame(),
  });
  if (!runBtn) demoWarn('task-runner', '#btn-run missing from DOM');
  logGoalBarState('task-runner:init');

  if (promptEl && initialGoal) promptEl.value = initialGoal;
  if (addressEl && initialUrl) addressEl.value = initialUrl;

  const frame = getBrowseFrame();
  if (frame) {
    frame.title = frameTitle;
    frame.src = initialUrl.startsWith('http')
      ? withBase(`browse/?u=${encodeURIComponent(initialUrl)}`)
      : resolveAppPath(initialUrl);
  } else {
    demoWarn('task-runner', '#browse-frame missing — cannot load demo page');
  }

  if (frame) {
    demoLog('task-runner', 'iframe src', { src: frame.src });
  }

  function setTechnical(text) {
    if (modelStatusEl) modelStatusEl.textContent = text;
    syncDevChrome(text, { busy });
    heroStatus.setTechnical(text);
    heroStatusEl?.classList.toggle('is-busy', busy);
  }

  function setRaw(text) {
    const raw = $('raw-output');
    if (raw) raw.textContent = text;
  }

  function syncRun(reason = 'sync') {
    const canRun = !busy && !booting;
    if (runBtn) runBtn.disabled = !canRun;
    if (promptEl) promptEl.disabled = busy || booting;
    demoLog('task-runner', `syncRun (${reason})`, {
      canRun,
      busy,
      booting,
      modelLoaded,
      frameReady,
      captureReady,
      runDisabled: runBtn?.disabled ?? null,
    });
    for (const btn of document.querySelectorAll('.preset-chips .chip-btn')) {
      btn.disabled = !canRun;
    }
    if (addressEl) addressEl.disabled = busy || booting;
    const goBtn = $('btn-navigate');
    if (goBtn) goBtn.disabled = busy || booting;
  }

  async function loadModel() {
    await operator.load({ onStatus: setTechnical });
    modelLoaded = true;
    if (modelStatusEl) {
      modelStatusEl.dataset.modelLoaded = '1';
      modelStatusEl.dataset.modelId = operator.model.id;
    }
  }

  async function capturePage({ showSnapshot = false } = {}) {
    captureReady = false;
    if (modelStatusEl) delete modelStatusEl.dataset.captureReady;

    const root = getCaptureElement();
    if (!root) {
      throw new Error('Capture target missing in demo iframe — refresh the page');
    }

    const cap = await operator.capture();
    const stage = $('screenshot-stage') ?? ensureHiddenCaptureMount();
    mountCaptureCanvas(stage, cap);
    if (showSnapshot) document.body.dataset.viewport = 'snapshot';
    setTechnical(`Captured ${cap.width}×${cap.height}px — encoding…`);
    const buf = await cap.whenEncoded;
    if (!buf || operator.captureGeneration !== cap.generation) {
      throw new Error('Capture encode failed — refresh the page');
    }
    captureReady = true;
    if (modelStatusEl) modelStatusEl.dataset.captureReady = '1';
    setTechnical('ready to run a task.');
    return cap;
  }

  async function navigateTo(input) {
    const raw = String(input ?? addressEl?.value ?? '').trim();
    if (!raw || busy) return;
    busy = true;
    syncRun();
    setTechnical('Loading page…');
    try {
      const nav = await navigateBrowseFrame(raw);
      if (addressEl) addressEl.value = nav.external ? nav.addressBar : nav.frameSrc;
      operator.clearCapture();
      captureReady = false;
      clearMarker();
      await waitForBrowseFrameReady(getBrowseFrame(), BOOT_FRAME_TIMEOUT_MS);
      frameReady = true;
      if (modelLoaded) await capturePage({ showSnapshot: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[browse:navigate]', err);
      setTechnical(`Navigation failed — ${msg}`);
    } finally {
      busy = false;
      syncRun();
    }
  }

  async function runTask(task) {
    const goal = String(task ?? promptEl?.value ?? '').trim();
    if (!goal) {
      setTechnical('Enter a goal first.');
      return;
    }
    if (busy || booting) {
      setTechnical('Still starting — wait a moment');
      return;
    }
    if (promptEl) promptEl.value = goal;
    if (!modelLoaded || !frameReady) {
      demoLog('task-runner', 'runTask booting first', { modelLoaded, frameReady });
      const boot = await startBoot('run-click');
      if (!boot?.ok && (!modelLoaded || !frameReady)) {
        demoWarn('task-runner', 'runTask aborted — boot incomplete', {
          bootOk: boot?.ok ?? false,
          bootReason: boot?.reason ?? null,
          modelLoaded,
          frameReady,
        });
        return;
      }
    }
    if (!captureReady) {
      try {
        await capturePage({ showSnapshot: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTechnical(`Error — ${msg}`);
        return;
      }
    }
    if (!captureReady) {
      setTechnical('Error — screenshot not ready');
      return;
    }

    busy = true;
    syncRun();
    document.body.dataset.viewport = 'live';
    liveCursor.show();
    liveCursor.setThinking(true);
    setRaw(`Running ${operator.model.label} navigation…`);
    heroStatusEl && (heroStatusEl.textContent = humanStatus('Running…', { goal }));

    try {
      const result = await operator.instruct(goal, {
        onStatus: setTechnical,
        onBeforeExecute: () => {
          document.body.dataset.viewport = 'live';
          liveCursor.setThinking(false);
        },
        onBeforeStep: async (step) => {
          await liveCursor.performStep(step);
        },
        onRecapture: (cap) => {
          const stage = $('screenshot-stage') ?? ensureHiddenCaptureMount();
          mountCaptureCanvas(stage, cap);
          captureReady = true;
        },
      });

      const grounded = [...result.steps].reverse().find((s) => s.point);
      if (grounded?.point) drawMarker(grounded.point.x, grounded.point.y);
      else clearMarker();

      const lines = result.steps.map(
        (s) =>
          `${s.ok ? '✓' : '✗'} ${s.action}` +
          (s.point ? ` @ [${s.point.x.toFixed(2)}, ${s.point.y.toFixed(2)}]` : '') +
          ` — ${s.detail}`
      );
      setRaw(`Parsed actions: ${result.summary}\n${lines.join('\n')}\n\n${result.text}`);
      setTechnical(result.ok ? `Done — ${result.summary}` : `Stopped — ${result.summary}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRaw(`Error: ${msg}`);
      setTechnical(`Error — ${msg}`);
    } finally {
      busy = false;
      syncRun();
      liveCursor.setThinking(false);
    }
  }

  $('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void runTask();
  });

  $('nav-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void navigateTo();
  });

  for (const btn of document.querySelectorAll('[data-goal]')) {
    btn.addEventListener('click', () => {
      const goal = btn.dataset.goal ?? '';
      if (promptEl) promptEl.value = goal;
      void runTask(goal);
    });
  }

  async function startBoot(trigger = 'autoload') {
    const gen = ++bootGeneration;
    demoLog('task-runner', 'startBoot', { trigger, generation: gen });
    booting = true;
    frameReady = false;
    modelLoaded = false;
    captureReady = false;
    if (modelStatusEl) {
      delete modelStatusEl.dataset.modelLoaded;
      delete modelStatusEl.dataset.captureReady;
    }
    syncRun('boot-start');

    let result;
    try {
      result = await autoloadAndCapture({
        modelId: operator.model.id,
        waitForFrame: async () => {
          await waitForBrowseFrameReady(getBrowseFrame(), BOOT_FRAME_TIMEOUT_MS);
          frameReady = true;
        },
        load: loadModel,
        capture: capturePage,
        onTechnicalStatus: setTechnical,
        onHumanStatus: (t) => {
          if (heroStatusEl) heroStatusEl.textContent = humanStatus(t, { goal: promptEl?.value });
        },
        goal: initialGoal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      demoWarn('task-runner', 'startBoot error', { message: msg });
      setTechnical(`Error — ${msg}`);
      result = { ok: false, reason: 'boot' };
    } finally {
      if (gen === bootGeneration) {
        booting = false;
        syncRun('boot-finally');
      }
    }

    if (gen !== bootGeneration) return result;

    demoLog('task-runner', 'startBoot done', {
      ok: result?.ok ?? false,
      reason: result?.reason ?? null,
      modelLoaded,
      frameReady,
      captureReady,
    });
    logGoalBarState('task-runner:boot-done');
    syncRun('boot-done');
    return result;
  }

  void startBoot('page-load');

  return { operator, runTask, navigateTo, capturePage, startBoot };
}
