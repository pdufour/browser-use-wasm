/**
 * App state + workflows (load / capture / run task / browse), ported 1:1 from
 * the vanilla entry. The SnapDOM canvas, voice DOM, and the
 * `#model-status` datasets are managed imperatively because the E2E suite
 * reads and mutates them outside React.
 */
import { useEffect, useReducer, useRef } from 'react';
import {
  createVoiceNavController,
  createGroundingCursor,
  MODELS,
  canDownloadModelInBrowser,
  setBrowseHomePath,
  getBrowseFrame,
  navigateBrowseFrame,
  waitForBrowseFrameReady,
} from 'browser-use-wasm';
import {
  $,
  createOperatorSession,
  captureReadyStatus,
  markModelLoaded,
  clearModelLoaded,
  bootOperatorModel,
} from '../../shared/operator-session.js';
import {
  mountCaptureCanvas,
  syncCaptureUi,
  resetCaptureUi,
  handleViewportToggleKeydown,
} from '../../shared/capture-ui.js';
import { logCaptureWallPerf, logTaskPerf } from '../../shared/perf-log.js';
import { BUILTIN_BROWSE_PATH } from '../../shared/browse-defaults.js';
import { mountSiteHeader } from '../../shared/site-header.js';
import { syncDevChrome } from '../../shared/dev-details-sync.js';
import { ensureModelDownloadConsent } from '../../shared/model-download-gate.js';
import { MODEL_SWITCHER_ID } from '../../shared/operator-contract.js';
import { CommandBar } from './components/CommandBar.jsx';
import { BrowserPane } from './components/BrowserPane.jsx';
import { DeveloperDetails } from './components/DeveloperDetails.jsx';
import { E2eShelf } from './components/E2eShelf.jsx';

const params = new URLSearchParams(location.search);
const isE2e = params.has('e2e');
const initialGoal = params.get('goal') ?? '';

const operator = createOperatorSession();

/** One fake pointer per screenshot stage (Run task + voice share it). */
let groundingCursor = null;

function getGroundingCursor() {
  const stage = $('screenshot-stage');
  if (!stage) return null;
  if (!groundingCursor) {
    groundingCursor = createGroundingCursor({
      screenshotStage: stage,
      liveInIframe: !!getBrowseFrame(),
    });
  }
  return groundingCursor;
}

/** Stable keydown handler — iframe wiring must remove the same function reference. */
const shortcutActions = { refreshBrowse: () => {} };

function onAppKeydown(e) {
  if (handleViewportToggleKeydown(e)) return;
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && key === 'r') {
    e.preventDefault();
    void shortcutActions.refreshBrowse();
  }
}

/** One listener per iframe window — re-navigation replaces contentWindow. */
let wiredFrameWin = null;

function wireFrameShortcuts() {
  try {
    const win = getBrowseFrame()?.contentWindow;
    if (!win?.document) return;
    if (win === wiredFrameWin) return;
    wiredFrameWin?.removeEventListener('keydown', onAppKeydown, true);
    wiredFrameWin = win;
    win.addEventListener('keydown', onAppKeydown, { capture: true });
  } catch {
    /* cross-origin frame — parent-document shortcut still works */
  }
}

export function App() {
  const [, redraw] = useReducer((n) => n + 1, 0);
  // Mutable snapshot read by async workflows (never stale) and by render.
  const ui = useRef({
    busy: false,
    modelLoaded: false,
    captureReady: false,
    captureEnabled: false,
    frameReady: false,
    loadDisabled: false,
    navigating: false,
    taskRunning: false,
    orbitPulse: false,
    cachedIds: new Set(),
    status: 'Processing…',
    raw: 'Model output will appear here.',
    prompt: initialGoal,
    address: `${location.origin}${BUILTIN_BROWSE_PATH}`,
  }).current;
  const set = (patch) => {
    Object.assign(ui, patch);
    redraw();
  };
  const orbitPulseTimer = useRef(null);

  function clearOrbitPulse() {
    if (orbitPulseTimer.current) {
      clearTimeout(orbitPulseTimer.current);
      orbitPulseTimer.current = null;
    }
    set({ orbitPulse: false });
  }

  function pulseOrbitBriefly() {
    clearOrbitPulse();
    set({ orbitPulse: true });
    orbitPulseTimer.current = setTimeout(() => set({ orbitPulse: false }), 2000);
  }

  async function loadModel() {
    if (ui.busy) return;
    const ok = await ensureModelDownloadConsent({
      model: operator.model,
      cachedIds: ui.cachedIds,
    });
    if (!ok) {
      set({ status: 'Download cancelled — tap Load to try again.' });
      return;
    }
    set({ busy: true, loadDisabled: true });
    try {
      await operator.load({ onStatus: (text) => set({ status: text }) });
      markModelLoaded($('model-status'), operator);
      set({ modelLoaded: true });
    } catch (err) {
      set({
        status: `${operator.model.label} load failed: ${err instanceof Error ? err.message : err}`,
      });
    } finally {
      set({ busy: false, loadDisabled: false });
    }
    if (ui.modelLoaded) void autoCapture();
  }

  function onSwitchModel(pickedId) {
    if (!isE2e) return;
    const picked = MODELS.find((m) => m.id === pickedId);
    if (!picked || picked.id === operator.model.id) return;
    const preCached = ui.cachedIds.has(picked.id);
    const remoteOk = canDownloadModelInBrowser(picked);
    if (!preCached && !remoteOk) {
      $(MODEL_SWITCHER_ID).value = operator.model.id;
      set({
        status: `${picked.label} needs npm run cache:model — ${operator.model.label} still loaded.`,
      });
      return;
    }
    operator.setModel(picked.id);
    clearModelLoaded();
    set({ modelLoaded: false });
    resetCaptureUi(operator);
    if (!preCached && remoteOk) {
      set({
        status: `Downloading ${picked.label} from Hugging Face… (first load; wllama caches in the browser)`,
      });
    }
    void loadModel();
  }

  function refreshSyncedCapture(cap) {
    const { status } = syncCaptureUi(cap, { operator });
    set({ captureReady: true, status });
  }

  /**
   * Explicit capture (`#btn-capture`) shows the snapshot viewport; auto-capture
   * (`showSnapshot: false`) is silent — datasets/status update, viewport stays
   * live. `busy` spans capture + encode, so concurrent triggers no-op.
   */
  async function capturePage({ showSnapshot = true, keepGroundingOverlay = false } = {}) {
    if (ui.busy) return;
    const stage = $('screenshot-stage');
    const statusEl = $('model-status');
    set({ busy: true, captureEnabled: false });
    stage.classList.add('is-capturing');
    const t0 = performance.now();
    try {
      delete statusEl.dataset.captureReady;
      set({ captureReady: false });
      const cap = await operator.capture();
      if (!keepGroundingOverlay) getGroundingCursor()?.onCaptureClear();
      const { caption } = mountCaptureCanvas(cap, { operator, showSnapshot });
      set({ status: caption('encoding…') });
      logCaptureWallPerf(t0);

      const buffer = await cap.whenEncoded;
      if (buffer && operator.captureGeneration === cap.generation) {
        statusEl.dataset.captureReady = '1';
        set({ captureReady: true, status: caption('ready to run a task.') });
      }
    } catch (err) {
      set({ status: `Capture failed: ${err instanceof Error ? err.message : err}` });
    } finally {
      stage.classList.remove('is-capturing');
      set({ busy: false, captureEnabled: true });
    }
  }

  /** Auto-capture: single-flight via the `busy` guard inside `capturePage`. */
  async function autoCapture() {
    if (ui.busy || !ui.modelLoaded || !ui.frameReady) return;
    await capturePage({ showSnapshot: false });
  }

  async function runTask(task) {
    const goal = String(task ?? '').trim();
    if (!goal || ui.busy || !ui.modelLoaded) return { ok: false, summary: 'not ready' };
    if (!ui.captureReady) {
      await capturePage({ showSnapshot: false });
      if (!ui.captureReady) return { ok: false, summary: 'capture not ready' };
    }
    pulseOrbitBriefly();
    set({ busy: true, taskRunning: true, raw: `Running ${operator.model.label} navigation…` });
    try {
      // One ShowUI inference → execute the parsed action sequence (card style).
      const result = await operator.instruct(goal, {
        onBeforeExecute: () => {
          getGroundingCursor()?.onCaptureClear();
        },
        onBeforeStep: (step) => getGroundingCursor()?.beforeStep(step),
        onStatus: (text) => set({ status: text }),
        onRecapture: (cap) => refreshSyncedCapture(cap),
      });
      logTaskPerf(result);
      if (result.degenerate || !result.steps.length) {
        set({
          raw: `no parsable action — model said:\n${result.text}`,
          status: 'No parsable action — ready to try again.',
        });
        return { ok: false, summary: 'no parsable action' };
      }
      if (!result.degenerate && result.steps.length) {
        await capturePage({ showSnapshot: !getBrowseFrame(), keepGroundingOverlay: true });
      }
      const summary = result.summary;
      const lines = result.steps.map(
        (s) =>
          `${s.ok ? '✓' : '✗'} ${s.action}` +
          (s.point ? ` @ [${s.point.x.toFixed(2)}, ${s.point.y.toFixed(2)}]` : '') +
          ` — ${s.detail}`
      );
      set({
        raw: `Parsed actions: ${summary}\n${lines.join('\n')}\n\n${result.text}`,
        status: result.ok ? `Done — ${summary}` : `Stopped — ${summary}`,
      });
      return { ok: result.ok, summary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ raw: `Error: ${msg}`, status: `Error — ${msg}` });
      return { ok: false, summary: msg };
    } finally {
      clearOrbitPulse();
      const idleStatus =
        ui.status === 'Done.' || /^Step \d+:/.test(ui.status) || ui.status?.includes('observing')
          ? captureReadyStatus(operator, { captureReady: ui.captureReady })
          : ui.status;
      set({ busy: false, taskRunning: false, status: idleStatus });
    }
  }

  async function browseTo(input, opts = {}) {
    set({ navigating: true, captureEnabled: false });
    let navigated = false;
    try {
      const nav = await navigateBrowseFrame(input, opts);
      set({ address: nav.addressBar, frameReady: true });
      wireFrameShortcuts();
      resetCaptureUi(operator);
      getGroundingCursor()?.onCaptureClear();
      navigated = true;
    } catch (err) {
      set({ status: `Navigation failed: ${err instanceof Error ? err.message : err}` });
    } finally {
      set({ navigating: false, captureEnabled: true });
    }
    if (navigated) void autoCapture();
  }

  const refreshBrowse = () => browseTo(ui.address || BUILTIN_BROWSE_PATH, { reload: true });
  shortcutActions.refreshBrowse = refreshBrowse;

  async function boot() {
    await bootOperatorModel({
      operator,
      loadModel,
      onBootState: (patch) => set(patch),
    });
  }

  const siteHeaderRef = useRef(null);
  const wired = useRef(false);

  useEffect(() => {
    mountSiteHeader(siteHeaderRef.current);
  }, []);

  useEffect(() => {
    syncDevChrome(ui.status, { busy: ui.busy });
  }, [ui.status, ui.busy]);

  useEffect(() => {
    if (wired.current) return;
    wired.current = true;
    setBrowseHomePath(BUILTIN_BROWSE_PATH);
    // Any in-frame navigation (links, reloads) swaps the iframe document.
    getBrowseFrame()?.addEventListener('load', wireFrameShortcuts);
    waitForBrowseFrameReady(getBrowseFrame()).then(
      () => {
        set({ captureEnabled: true, frameReady: true });
        wireFrameShortcuts();
        void autoCapture();
      },
      () => set({ status: 'Sample page failed to load — refresh the page.' })
    );
    // Voice disabled for normal use — E2E only (?e2e=1).
    if (isE2e) {
      const voice = createVoiceNavController({
        screenshotStage: $('screenshot-stage'),
        transcriptEl: $('voice-transcript'),
        statusEl: $('voice-status'),
        toggleBtn: $('btn-voice-toggle'),
        isAppReady: () => ui.modelLoaded,
        hasCapture: () => operator.hasCapture(),
        setPrompt: (label) => set({ prompt: label }),
        locateTarget: (label) => operator.locate(label),
        runTask: (task) => runTask(task),
        requestCapture: () => capturePage({ showSnapshot: false }),
        groundingCursor: getGroundingCursor() ?? undefined,
      });
      globalThis.__e2eVoiceTool = (call) => voice.simulateToolCallForE2e(call);
    }
    document.addEventListener('keydown', onAppKeydown, { capture: true });
    const onRelayout = () => getGroundingCursor()?.relayout();
    window.addEventListener('resize', onRelayout);
    void boot();
    return () => {
      getBrowseFrame()?.removeEventListener('load', wireFrameShortcuts);
      document.removeEventListener('keydown', onAppKeydown, { capture: true });
      window.removeEventListener('resize', onRelayout);
      wiredFrameWin?.removeEventListener('keydown', onAppKeydown, true);
      wiredFrameWin = null;
      groundingCursor?.destroy();
      groundingCursor = null;
    };
  }, []);

  return (
    <>
      <header ref={siteHeaderRef} id="site-header" />
      <div className="operator-page">
        <section className="workspace" aria-label="Browser preview">
          <BrowserPane
            address={ui.address}
            onAddressChange={(value) => set({ address: value })}
            onNavigate={() => void browseTo(ui.address)}
            onRefresh={() => void refreshBrowse()}
            loading={ui.navigating}
            orbitPulse={ui.orbitPulse}
          />
        </section>
        <DeveloperDetails status={ui.status} raw={ui.raw} />
      </div>
      <CommandBar
        modelId={operator.model.id}
        cachedIds={ui.cachedIds}
        onSwitchModel={onSwitchModel}
        prompt={ui.prompt}
        onPromptChange={(value) => set({ prompt: value })}
        promptDisabled={!ui.modelLoaded}
        status={ui.status}
        taskDisabled={ui.busy || !(ui.modelLoaded && ui.captureReady && ui.prompt.trim())}
        onRunTask={() => void runTask(ui.prompt)}
        busy={ui.busy}
        isE2e={isE2e}
      />
      <E2eShelf
        loadDisabled={ui.loadDisabled}
        onLoadModel={() => void loadModel()}
        captureDisabled={!ui.captureEnabled}
        onCapture={() => void capturePage()}
      />
    </>
  );
}
