/**
 * Thin shared runner — autoload model, load a URL in #browse-frame, capture, run goal.
 */
import {
  createWebOperator,
  createPromptApiOperator,
  createGroundingCursor,
  resolveWasmUrl,
  setBrowseHomePath,
  getBrowseFrame,
  getBrowseDocument,
  getCaptureElement,
  waitForBrowseFrameReady,
  navigateBrowseFrame,
  resetScrollForCapture,
} from 'browser-use-wasm';
import { $ } from './dom.js';
import { mountCaptureCanvas } from './capture-ui.js';
import {
  autoloadAndCapture,
  bindHumanStatus,
  hideDevChrome,
  humanStatus,
  ensureHiddenCaptureMount,
  BOOT_FRAME_TIMEOUT_MS,
} from './user-facing.js';
import { syncDevChrome, openDevDetails } from './dev-details-sync.js';
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
 *   useNativeAi?: boolean;
 *   inlineCapturePanel?: boolean;
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
    inlineCapturePanel = false,
  } = options;

  setBrowseHomePath(initialUrl);
  if (hideDevDetails) hideDevChrome({ detailsId: 'dev-details' });
  if (inlineCapturePanel) {
    document.body.dataset.inlineCapture = '1';
    const stage = $('screenshot-stage');
    if (stage) stage.classList.remove('dev-capture-mount');
    openDevDetails();
  } else {
    ensureHiddenCaptureMount();
  }

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
  /** @type {{ cssWidth: number; cssHeight: number } | null} */
  let lastCaptureCss = null;
  let groundingCursor = null;

  function getGroundingCursor() {
    const stage = $('screenshot-stage') ?? ensureHiddenCaptureMount();
    if (!stage) return null;
    if (!groundingCursor) {
      groundingCursor = createGroundingCursor({
        screenshotStage: stage,
        liveInIframe: !!getBrowseFrame(),
      });
    }
    return groundingCursor;
  }

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
  const addressEl = $('address-bar');

  /** Live iframe must show the same #capture-target framing as the SnapDOM bitmap. */
  function lockBrowseFrameToCapture(cap) {
    const cssW = cap?.cssWidth ?? lastCaptureCss?.cssWidth ?? 0;
    const cssH = cap?.cssHeight ?? lastCaptureCss?.cssHeight ?? 0;
    if (cssW > 0 && cssH > 0) lastCaptureCss = { cssWidth: cssW, cssHeight: cssH };

    resetScrollForCapture();
    const frame = getBrowseFrame();
    const wrap = liveWrap;
    if (frame && cssH > 0) {
      frame.style.width = '100%';
      frame.style.height = `${cssH}px`;
      frame.style.minHeight = `${cssH}px`;
      frame.style.maxHeight = `${cssH}px`;
      if (cssW > 0) frame.dataset.captureCssW = String(cssW);
      frame.dataset.captureCssH = String(cssH);
      document.body.dataset.frameLocked = '1';
    }
    if (wrap && cssH > 0) {
      wrap.style.height = 'auto';
      wrap.style.minHeight = `${cssH + 16}px`;
      if (cssW > 0) {
        wrap.style.width = `${cssW + 16}px`;
        wrap.style.maxWidth = '100%';
        wrap.dataset.captureCssW = String(cssW);
        wrap.dataset.captureCssH = String(cssH);
      }
    }
  }

  function syncBrowseFrameToCapture() {
    lockBrowseFrameToCapture(null);
  }

  async function waitForCaptureLayout() {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function applyCaptureUi(cap, { keepGroundingOverlay = false } = {}) {
    const stage = $('screenshot-stage') ?? ensureHiddenCaptureMount();
    if (!keepGroundingOverlay) getGroundingCursor()?.onCaptureClear();
    mountCaptureCanvas(cap, { stage, keepGroundingOverlay });
    if (cap.canvas) {
      cap.canvas.dataset.captureCssW = String(cap.cssWidth);
      cap.canvas.dataset.captureCssH = String(cap.cssHeight);
    }
    lockBrowseFrameToCapture(cap);
  }

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
    frame.addEventListener('load', () => syncBrowseFrameToCapture());
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

  async function capturePage({ showSnapshot = false, keepGroundingOverlay = false } = {}) {
    captureReady = false;
    if (modelStatusEl) delete modelStatusEl.dataset.captureReady;

    const root = getCaptureElement();
    if (!root) {
      throw new Error('Capture target missing in demo iframe — refresh the page');
    }

    await waitForCaptureLayout();
    const cap = await operator.capture();
    applyCaptureUi(cap, { keepGroundingOverlay });
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

  async function whenIdle() {
    while (busy) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  async function whenReady() {
    while (booting) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (!modelLoaded || !frameReady) {
      const boot = await startBoot('wait-ready');
      if (!boot?.ok && (!modelLoaded || !frameReady)) {
        throw new Error('Model or page not ready — check Chrome Prompt API setup');
      }
    }
  }

  async function navigateTo(input) {
    await whenIdle();
    const raw = String(input ?? addressEl?.value ?? '').trim();
    if (!raw) return;
    busy = true;
    syncRun();
    setTechnical('Loading page…');
    try {
      const nav = await navigateBrowseFrame(raw);
      if (addressEl) addressEl.value = nav.external ? nav.addressBar : nav.frameSrc;
      operator.clearCapture();
      captureReady = false;
      getGroundingCursor()?.onCaptureClear();
      await waitForBrowseFrameReady(getBrowseFrame(), BOOT_FRAME_TIMEOUT_MS);
      frameReady = true;
      syncBrowseFrameToCapture();
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
    try {
      await whenReady();
      await whenIdle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTechnical(`Error — ${msg}`);
      return;
    }
    if (busy || booting) {
      setTechnical('Still starting — wait a moment');
      return;
    }
    if (promptEl) promptEl.value = goal;
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
    setRaw(`Running ${operator.model.label} navigation…`);
    heroStatusEl && (heroStatusEl.textContent = humanStatus('Running…', { goal }));

    try {
      const result = await operator.instruct(goal, {
        onBeforeExecute: () => getGroundingCursor()?.onCaptureClear(),
        onBeforeStep: (step) => getGroundingCursor()?.beforeStep(step),
        onStatus: setTechnical,
        onRecapture: (cap) => {
          applyCaptureUi(cap, { keepGroundingOverlay: true });
          captureReady = true;
        },
      });

      if (!result.degenerate && result.steps.length) {
        try {
          // SnapDOM while cursor/marker still live in the iframe; clear overlay after mount.
          await capturePage({ showSnapshot: false, keepGroundingOverlay: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setTechnical(`Error — ${msg}`);
        }
      }

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
    }
  }

  $('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void runTask();
  });

  window.addEventListener('resize', () => getGroundingCursor()?.relayout());

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
          syncBrowseFrameToCapture();
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

  return { operator, runTask, navigateTo, capturePage, startBoot, whenReady, whenIdle };
}
