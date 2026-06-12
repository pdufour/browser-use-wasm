import { SCREENSHOT_TOOL_NAMES } from '../browser-tools/catalog.ts';
import {
  toolCallSummary,
  executeBrowserTool,
  validateToolCall,
} from '../browser-tools/execute.ts';
import {
  toolCallKey,
  targetLabelForToolCall,
  goalPromptForToolCall,
} from '../browser-tools/tool-spec.ts';
import type {
  BrowserToolCall,
  PointerAction,
  ToolExecutorContext,
} from '../browser-tools/tool-spec.ts';
import { triggerActionAtNorm } from '../browser-tools/dom-actions.ts';
import { createSpeechSession, isSpeechRecognitionAvailable } from './speech-session.ts';
import { createFakeCursor } from './fake-cursor.ts';
import { tourMoveDurationMs, tourSleep } from './cursor-tour.ts';
import type { CursorTourStep } from './cursor-tour.ts';

export interface VoiceNavDeps {
  screenshotStage: HTMLElement;
  transcriptEl: HTMLElement;
  statusEl: HTMLElement;
  toggleBtn: HTMLButtonElement;
  isAppReady: () => boolean;
  hasCapture: () => boolean;
  setPrompt: (label: string) => void;
  /** Locate a label on the screenshot via ShowUI navigation (no live action). */
  locateTarget: (
    label: string
  ) => Promise<{ ok: boolean; point?: { x: number; y: number }; text?: string }>;
  runTask: (task: string) => Promise<{ ok: boolean; summary: string }>;
  requestCapture: () => void | Promise<void>;

  onStatus?: (message: string) => void;
  drawMarker?: (x: number, y: number) => void;
  defaultCursorTour?: CursorTourStep[];
}

/**
 * Voice → ShowUI navigation → fake cursor on screenshot (structured orchestrator).
 */
export function createVoiceNavController(deps: VoiceNavDeps) {
  let defaultCursorTour: CursorTourStep[] = deps.defaultCursorTour ?? [];
  const fakeCursor = createFakeCursor(deps.screenshotStage);
  let speech: ReturnType<typeof createSpeechSession> = null;
  let enabled = false;
  let lastHandledPhrase = '';
  let inferChain = Promise.resolve();
  let lastTarget: string | null = null;
  let tourRunning = false;

  function setTranscript(text: string, kind = '') {
    deps.transcriptEl.textContent = text;
    deps.transcriptEl.dataset.kind = kind;
  }

  function setVoiceStatus(text: string) {
    deps.statusEl.textContent = text;
    deps.onStatus?.(text);
  }

  function toolContext(): ToolExecutorContext {
    return {
      isAppReady: deps.isAppReady,
      hasCapture: deps.hasCapture,
      requestCapture: () => deps.requestCapture(),
      locateTarget: (label) => deps.locateTarget(label),
      setPrompt: (label) => deps.setPrompt(label),
      groundTarget: (target, action) => navigateToTarget(target, action),
    };
  }

  async function navigateToTarget(
    target: string,
    action: PointerAction,
    moveFrom?: { fromX: number; fromY: number }
  ) {
    deps.setPrompt(target);
    fakeCursor.setState('thinking');
    setVoiceStatus(`Finding "${target}"…`);

    const result = await deps.locateTarget(target);
    console.info(`[voice-nav] locate result target="${target}" ok=${result.ok} point=${JSON.stringify(result.point)}`);
    if (!result.ok || !result.point) {
      throw new Error(`Could not locate "${target}"`);
    }

    const durationMs = moveFrom
      ? tourMoveDurationMs(moveFrom.fromX, moveFrom.fromY, result.point.x, result.point.y)
      : undefined;

    lastTarget = target;
    await fakeCursor.moveTo(result.point.x, result.point.y, { action, durationMs });
    if (action === 'doubleclick') {
      fakeCursor.pulseDoubleClick();
      triggerActionAtNorm(result.point.x, result.point.y, 'doubleclick');
    } else if (action === 'click') {
      fakeCursor.pulseClick();
      triggerActionAtNorm(result.point.x, result.point.y, 'click');
    } else if (action === 'rightclick') {
      triggerActionAtNorm(result.point.x, result.point.y, 'rightclick');
    }
    deps.drawMarker?.(result.point.x, result.point.y);
    if (action === 'rightclick') fakeCursor.setState('hover');
    else fakeCursor.setState(action === 'click' || action === 'doubleclick' ? 'click' : 'hover');

    return { ...result.point, durationMs: durationMs ?? 0 };
  }

  async function handleToolCall(call: BrowserToolCall, source: string) {
    const phraseKey = toolCallKey(call);
    if (phraseKey === lastHandledPhrase && source === 'final') {
      setVoiceStatus('Voice: listening');
      return;
    }
    lastHandledPhrase = phraseKey;

    if (call.name === 'stop_voice') {
      stop();
      return;
    }

    if (call.name === 'play_cursor_tour') {
      void playTour();
      return;
    }

    if (call.name === 'capture_page') {
      setTranscript('Capturing page…', 'system');
      setVoiceStatus('Voice: capturing…');
      await executeBrowserTool(call, toolContext());
      setVoiceStatus('Voice: listening');
      setTranscript('✓ capture_page() — screenshot updated', 'ok');
      return;
    }

    const isScreenshotTool = SCREENSHOT_TOOL_NAMES.has(call.name);

    if (isScreenshotTool) {
      if (!deps.isAppReady()) {
        setTranscript('Load the model first, then capture the page.', 'error');
        setVoiceStatus('Voice: listening');
        return;
      }
      if (!deps.hasCapture()) {
        setTranscript('Capture the page first, then say where to go.', 'error');
        setVoiceStatus('Voice: listening');
        return;
      }
    } else {
      if (!deps.isAppReady()) {
        setTranscript('Load the model first.', 'error');
        setVoiceStatus('Voice: listening');
        return;
      }
    }

    if (isScreenshotTool) {
      const statusQuery =
        call.name === 'input' || call.name === 'select'
          ? goalPromptForToolCall(call)
          : targetLabelForToolCall(call);
      setTranscript(`${source === 'interim' ? '…' : ''}${toolCallSummary(call)}`, 'pending');
      setVoiceStatus(`Voice: finding "${statusQuery}"…`);
      try {
        const result = await executeBrowserTool(call, toolContext());
        // Grounding succeeded but the live-DOM apply failed (e.g. static or
        // frozen page): still show where grounding landed, then report the error.
        if (!result.ok && result.point) {
          deps.drawMarker?.(result.point.x, result.point.y);
        }
        if (!result.ok) throw new Error(result.error ?? 'tool failed');
        const pt = result.point!;
        // Pointer tools draw via navigateToTarget; locateTarget-based form
        // tools (input/select/toggle) must surface the grounded point too.
        deps.drawMarker?.(pt.x, pt.y);
        setTranscript(
          `✓ ${toolCallSummary(call)} @ (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,
          'ok'
        );
        setVoiceStatus('Voice: listening');
      } catch (err) {
        fakeCursor.setState('listening');
        setTranscript(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        setVoiceStatus('Voice: listening');
      }
      return;
    }

    // DOM-only tools
    if (call.name === 'scroll') {
      setTranscript(`✓ ${toolCallSummary(call)} — refreshing capture…`, 'system');
    }

    const result = await executeBrowserTool(call, toolContext());
    console.info(`[voice-nav] tool result name="${call.name}" ok=${result.ok} detail="${result.detail}"`);
    if (!result.ok) {
      setTranscript(`Error: ${result.error ?? 'tool failed'}`, 'error');
      setVoiceStatus('Voice: listening');
      return;
    }

    if (call.name === 'press_key') {
      setTranscript(`✓ ${call.arguments.key} — ${result.detail}`, 'ok');
    } else if (call.name === 'scroll') {
      setTranscript(`✓ Scrolled ${result.detail} and re-captured`, 'ok');
    } else if (call.name === 'scroll_to_top') {
      setTranscript('✓ Scrolled to top and re-captured', 'ok');
    } else {
      setTranscript(`✓ ${toolCallSummary(call)}`, 'ok');
    }
    setVoiceStatus('Voice: listening');
  }

  /**
   * Visual tour: glide the fake cursor across several labels on the screenshot.
   */
  async function playTour(steps: CursorTourStep[] = defaultCursorTour) {
    if (!steps.length) {
      setTranscript('No cursor tour for this page.', 'error');
      return;
    }
    if (tourRunning) return;
    if (!deps.isAppReady()) {
      setTranscript('Load the model first.', 'error');
      return;
    }
    if (!deps.hasCapture()) {
      setTranscript('Capture the page first, then play the tour.', 'error');
      return;
    }

    tourRunning = true;
    const wasEnabled = enabled;
    enabled = true;
    fakeCursor.showAt(0.12, 0.12);
    fakeCursor.setState('listening');
    setVoiceStatus('Tour: running…');
    setTranscript(`Tour: ${steps.map((s) => s.target).join(' → ')}`, 'pending');

    let from: { x: number; y: number } = { x: 0.12, y: 0.12 };

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setTranscript(`Tour ${i + 1}/${steps.length}: ${step.target}…`, 'pending');
        const action = step.action ?? 'hover';
        const point = await navigateToTarget(step.target, action, {
          fromX: from.x,
          fromY: from.y,
        });
        from = { x: point.x, y: point.y };
        if (step.recaptureAfter) {
          setTranscript('Tour: refresh capture after UI change…', 'system');
          await deps.requestCapture();
        }
        await tourSleep(step.pauseMs ?? 500);
      }
      setTranscript('✓ Tour complete — say another target or stop.', 'ok');
      setVoiceStatus(wasEnabled ? 'Voice: listening' : 'Voice: tour done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTranscript(`Tour stopped: ${msg}`, 'error');
      setVoiceStatus('Voice: tour error');
    } finally {
      tourRunning = false;
      if (!wasEnabled) enabled = false;
    }
  }

  async function onSpeechChunk(text: string, isFinal: boolean) {
    if (!enabled || !text) return;

    if (!isFinal) {
      setTranscript(`… ${text}`, 'interim');
      return;
    }

    setTranscript(text, 'heard');
    setVoiceStatus('Voice: thinking…');

    inferChain = inferChain.then(async () => {
      if (!enabled) return;
      try {
        // ShowUI navigation mode (model card): transcript is the Task, the
        // screenshot is the observation — same path as the Run task button.
        console.info(`[voice-nav] navigation task: "${text}"`);
        setVoiceStatus('Voice: running task…');
        const result = await deps.runTask(text);
        if (result?.ok) {
          setTranscript(`✓ ${result.summary}`, 'ok');
        } else {
          setTranscript(result?.summary ? `Task failed: ${result.summary}` : `Task failed: "${text}"`, 'error');
        }
        setVoiceStatus('Voice: listening');
      } catch (err) {
        console.error('[voice-nav] Task error', err);
        setTranscript(`Task error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        setVoiceStatus('Voice: listening');
      }
    });
    await inferChain;
  }

  function start() {
    if (!isSpeechRecognitionAvailable()) {
      setTranscript('Speech recognition not supported — use Chrome or Edge.', 'error');
      deps.toggleBtn.disabled = true;
      return;
    }
    if (enabled) return;

    speech =
      speech ??
      createSpeechSession({
        onInterim: (t) => onSpeechChunk(t, false),
        onFinal: (t) => onSpeechChunk(t, true),
        onError: (msg) => {
          setTranscript(msg, 'error');
          setVoiceStatus('Voice: error');
        },
        onState: (state) => {
          if (state === 'listening') fakeCursor.setState('listening');
          if (state === 'idle' && enabled) fakeCursor.setState('idle');
        },
      });

    if (!speech) return;

    enabled = true;
    lastHandledPhrase = '';
    deps.toggleBtn.textContent = 'Stop voice navigation';
    deps.toggleBtn.setAttribute('aria-pressed', 'true');
    setVoiceStatus('Voice: listening…');
    setTranscript(
      'Try: "click Submit" · "type paul in the email field" · "scroll down"',
      'hint'
    );
    speech.start();
    fakeCursor.setState('listening');
  }

  function stop() {
    enabled = false;
    speech?.stop();
    deps.toggleBtn.textContent = 'Start voice navigation';
    deps.toggleBtn.setAttribute('aria-pressed', 'false');
    setVoiceStatus('Voice: off');
    setTranscript('Voice navigation stopped.', 'system');
    fakeCursor.setState('idle');
    fakeCursor.hide();
  }

  function toggle() {
    if (enabled) stop();
    else start();
  }

  deps.toggleBtn.addEventListener('click', () => toggle());

  if (!isSpeechRecognitionAvailable()) {
    deps.toggleBtn.disabled = true;
    setVoiceStatus('Voice: unavailable (use Chrome / Edge)');
    setTranscript('Web Speech API is not available in this browser.', 'error');
  } else {
    setVoiceStatus('Voice: off');
    setTranscript(
      'Start voice navigation, capture the page, then say where to move the cursor.',
      'hint'
    );
  }

  return {
    start,
    stop,
    toggle,
    isEnabled: () => enabled,
    /** Re-layout cursor after screenshot resize. */
    relayout() {
      if (lastTarget) fakeCursor.setState('hover');
    },
    /**
     * E2E harness (`?e2e=1`): run a structured tool call (no microphone, no
     * phrase parsing) through the same handleToolCall path as scripted tours.
     */
    async simulateToolCallForE2e(call: BrowserToolCall) {
      if (!enabled) {
        enabled = true;
        deps.toggleBtn.textContent = 'Stop voice navigation';
        deps.toggleBtn.setAttribute('aria-pressed', 'true');
        setVoiceStatus('Voice: listening (e2e)');
        fakeCursor.setState('listening');
      }
      let valid: BrowserToolCall;
      try {
        valid = validateToolCall(call);
      } catch (err) {
        setTranscript(`Invalid tool call: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return;
      }
      setTranscript(toolCallSummary(valid), 'final');
      lastHandledPhrase = '';
      inferChain = inferChain.then(() => handleToolCall(valid, 'final'));
      await inferChain;
    },
    playTour,
    setDefaultCursorTour(steps: CursorTourStep[]) {
      defaultCursorTour = steps;
    },
    isTourRunning: () => tourRunning,
    destroy() {
      stop();
      speech?.abort();
      fakeCursor.destroy();
    },
  };
}
