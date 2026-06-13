/**
 * Embed API: instruct a webpage to do something and the library does the rest.
 *
 * ```ts
 * import { createWebOperator } from '…';
 *
 * const operator = createWebOperator({ native: true });
 * await operator.load();
 * await operator.instruct('type paul in the email field');
 * ```
 *
 * One instruct = SnapDOM capture → one inference (local WASM or native AI) →
 * execute every parsed action from that generation on the live page.
 */

import { snapdom } from '@zumer/snapdom';
import { WllamaWorkerClient, CaptureWorkerClient } from './wllama/client.ts';
import { snapdomCaptureToCanvas, snapdomCanvasToCssSize } from './snapdom/capture.ts';
import { prepareVisionCapture, remapVisionNormToCaptureNorm } from './snapdom/vision-resize.ts';
import type { VisionCropRect } from './snapdom/vision-resize.ts';
import { runNavigation, prewarmNavigationPrefix } from './actions/navigation.ts';
import type { NavigationAction, CompletionClient } from './actions/navigation.ts';
import { PromptApiCompletionClient, checkPromptApiAvailability } from './actions/prompt-api.ts';
import { executeNavigationAction } from './actions/execute.ts';
import { locateLabel, hasValidNormPoint, withTimeout } from './actions/locate.ts';
import type { GroundingPoint } from './actions/parse-coords.ts';
import {
  resolveWasmUrl,
  CAPTURE_DPR_MAX,
  INFERENCE_TIMEOUT_MS,
  visionEncodeOpts,
  VL_LLAMA_LOG_LEVEL,
} from './config/vl.ts';
import { resolveModelLoadCaps } from './env/model-gating.ts';
import { resolveRegistryModelSourceDetailed } from './wllama/model-sources.ts';
import {
  getModelById,
  BROWSER_VALIDATED_MODEL_IDS,
  DEFAULT_MODEL_ID,
} from './config/models/registry.ts';
import type { ModelCard } from './config/models/types.ts';
import { scrollToElement, setBrowserToolDocument } from './browser-tools/dom-actions.ts';

export interface WebOperatorOptions {
  /** Registry model id (default `ShowUI-2B`). */
  modelId?: string;
  /** Use Chrome built-in AI (Prompt API / Gemini Nano). Bypasses wllama. */
  native?: boolean;
  /** Same-origin wllama WASM URL (default `/wllama/wllama.wasm`). */
  wasmUrl?: string;
  /** Custom completion client. If provided, overrides `native` and wllama. */
  llm?: CompletionClient;
  /** Element to capture and act on (default `document.body`). */
  captureRoot?: () => HTMLElement | null;
  /**
   * Document the DOM tools act on — pass an iframe's contentDocument to drive
   * an embedded page (default: the host document).
   */
  targetDocument?: () => Document | null;
  /** Per-inference timeout (default `INFERENCE_TIMEOUT_MS`). */
  inferenceTimeoutMs?: number;
  /** Capture pipeline stage callback (perf logging). */
  onPerfMark?: (name: string, note?: string) => void;
}

export interface OperatorLoadOptions {
  onProgress?: (info: { loaded: number; total: number }) => void;
  /** Human-readable load lifecycle messages (`Loading X…`, `X loaded — N GPU layers`). */
  onStatus?: (text: string) => void;
  logLevel?: number;
  useCache?: boolean;
}

export interface OperatorLoadResult {
  nGpuLayers?: number;
  imageMaxTokens?: number;
  browserValidated: boolean;
  loadCaps: ReturnType<typeof resolveModelLoadCaps>;
}

export interface OperatorCapture {
  /** Vision bitmap dims (what the model sees). */
  width: number;
  height: number;
  /** Full SnapDOM canvas dims (marker + eval coordinate space). */
  captureWidth: number;
  captureHeight: number;
  /** Integer CSS px the canvas maps to on screen. */
  cssWidth: number;
  cssHeight: number;
  visionCrop: VisionCropRect | null;
  tokenTarget: number | null;
  /** Full-resolution SnapDOM canvas — display it however you like. */
  canvas: HTMLCanvasElement;
  generation: number;
  /** Resolves with the inference JPEG/PNG buffer (null if superseded). */
  whenEncoded: Promise<ArrayBuffer | null>;
}

export interface ExecutedStep {
  action: string;
  value: string | null;
  /** Capture-norm point (vision crop already remapped). */
  point: GroundingPoint | null;
  ok: boolean;
  detail: string;
}

/** UI-changing actions that need a fresh screenshot before the next step in one batch. */
const UI_CHANGING_ACTIONS = new Set(['CLICK', 'SELECT', 'INPUT']);

/** One parsed action about to run — capture-normalized point when grounded. */
export interface InstructPendingStep {
  action: string;
  value: string | null;
  point: GroundingPoint | null;
}

export interface InstructOptions {
  /** Called after parsing, before any DOM execution (e.g. flip viewport). */
  onBeforeExecute?: (actions: NavigationAction[]) => void;
  /** Called before each step executes — animate a cursor, etc. */
  onBeforeStep?: (step: InstructPendingStep) => void | Promise<void>;
  /** Called after each executed step. */
  onStep?: (step: ExecutedStep) => void;
  /** Human-readable progress while executing parsed actions. */
  onStatus?: (text: string) => void;
  /** Called after a mid-batch re-capture (CLICK/SELECT before the next action). */
  onRecapture?: (cap: OperatorCapture) => void | Promise<void>;
  timeoutMs?: number;
}

export interface InstructResult {
  ok: boolean;
  degenerate: boolean;
  /** Sealed model generation text. */
  text: string;
  /** e.g. `CLICK → INPUT → ENTER`. */
  summary: string;
  inferMs: number;
  wallMs: number;
  steps: ExecutedStep[];
}

export interface LocateResult {
  ok: boolean;
  point: GroundingPoint | null;
  text: string;
  inferMs: number;
}

interface CaptureState {
  buffer: ArrayBuffer | null;
  bufferPromise: Promise<ArrayBuffer | null> | null;
  width: number;
  height: number;
  visionCrop: VisionCropRect | null;
}

export class WebOperator {
  readonly llm: CompletionClient;
  readonly #encoder: CaptureWorkerClient;
  #model: ModelCard;
  #loaded = false;
  #wasmUrl: string;
  #captureRoot: () => HTMLElement | null;
  #inferenceTimeoutMs: number;
  #onPerfMark: ((name: string, note?: string) => void) | null;
  #capture: CaptureState | null = null;
  #captureGeneration = 0;
  #targetDocument: (() => Document | null) | null;

  constructor(options: WebOperatorOptions = {}) {
    this.#model = getModelById(options.modelId ?? (options.native ? 'gemini-nano' : DEFAULT_MODEL_ID));
    this.#wasmUrl = options.wasmUrl ?? resolveWasmUrl();
    this.#captureRoot =
      options.captureRoot ?? (() => (typeof document !== 'undefined' ? document.body : null));
    this.#inferenceTimeoutMs = options.inferenceTimeoutMs ?? INFERENCE_TIMEOUT_MS;
    this.#onPerfMark = options.onPerfMark ?? null;
    this.#targetDocument = options.targetDocument ?? null;
    this.#syncToolDocument();
    
    // Choose the LLM backend. 
    // If native flag or gemini-nano model id, use Prompt API.
    if (options.llm) {
      this.llm = options.llm;
    } else if (options.native || this.#model.id === 'gemini-nano') {
      this.llm = new PromptApiCompletionClient();
    } else {
      this.llm = new WllamaWorkerClient();
    }
    
    this.#encoder = new CaptureWorkerClient();
  }

  /**
   * Re-point the dom-actions module at this operator's target document.
   */
  #syncToolDocument(): void {
    if (this.#targetDocument) setBrowserToolDocument(this.#targetDocument);
  }

  get model(): ModelCard {
    return this.#model;
  }

  get loaded(): boolean {
    return this.#loaded;
  }

  get captureGeneration(): number {
    return this.#captureGeneration;
  }

  /** Switch the registry model. */
  setModel(modelId: string): ModelCard {
    this.#model = getModelById(modelId);
    this.#loaded = false;
    
    // Switch LLM backend if needed
    const isNative = modelId === 'gemini-nano';
    if (isNative && this.llm instanceof WllamaWorkerClient) {
      this.llm.terminate();
      (this as { llm: CompletionClient }).llm = new PromptApiCompletionClient();
    } else if (!isNative && this.llm instanceof PromptApiCompletionClient) {
      (this as { llm: CompletionClient }).llm = new WllamaWorkerClient();
    }
    
    return this.#model;
  }

  /** Terminate and replace the inference worker. */
  recreateWorker(): void {
    if (this.llm instanceof WllamaWorkerClient) {
      this.llm.terminate();
      this.#loaded = false;
      (this as { llm: CompletionClient }).llm = new WllamaWorkerClient();
    }
  }

  /** Probe the environment. */
  async probe(): Promise<{ webgpu: boolean }> {
    if (this.llm instanceof WllamaWorkerClient) {
      const result = await this.llm.probe(this.#wasmUrl);
      return { webgpu: !!result.webgpu };
    }
    return { webgpu: true };
  }

  /** Load weights (wllama) or just mark ready (native). */
  async load(options: OperatorLoadOptions = {}): Promise<OperatorLoadResult> {
    const model = this.#model;
    const browserValidated = BROWSER_VALIDATED_MODEL_IDS.includes(model.id);
    const loadCaps = resolveModelLoadCaps(model, { browserValidated });

    if (!(this.llm instanceof WllamaWorkerClient)) {
      const probe = await checkPromptApiAvailability();
      if (!probe.ok) {
        throw new Error(probe.message);
      }
      this.#loaded = true;
      options.onStatus?.(probe.message);
      return { nGpuLayers: 0, imageMaxTokens: loadCaps.imageMaxTokens, browserValidated, loadCaps };
    }

    const baseURI = typeof location !== 'undefined' ? location.href : '';
    const { origin } = await resolveRegistryModelSourceDetailed(baseURI, model.id);
    if (origin === 'remote') {
      options.onStatus?.(`Downloading ${model.label} from Hugging Face…`);
    } else {
      options.onStatus?.(`Loading ${model.label}…`);
    }

    const client = this.llm as WllamaWorkerClient;
    client.onProgress(({ loaded, total }) => {
      options.onProgress?.({ loaded, total });
      if (total > 0 && loaded < total) {
        const pct = Math.min(99, Math.floor((loaded / total) * 100));
        options.onStatus?.(`Downloading ${model.label}… ${pct}%`);
      }
    });

    try {
      const { nGpuLayers, imageMaxTokens } = await client.load(this.#wasmUrl, {
        modelId: model.id,
        nCtx: loadCaps.nCtx,
        nGpuLayers: model.n_gpu_layers,
        imageMinTokens: loadCaps.imageMinTokens,
        imageMaxTokens: loadCaps.imageMaxTokens,
        jinja: model.use_jinja === true,
        offloadKqv: model.offload_kqv ?? false,
        flashAttn: loadCaps.flashAttn,
        cacheTypeK: loadCaps.cacheTypeK,
        cacheTypeV: loadCaps.cacheTypeV,
        logLevel: options.logLevel ?? VL_LLAMA_LOG_LEVEL,
        useCache: options.useCache ?? true,
      });
      this.#loaded = true;
      options.onStatus?.(`${model.label} loaded — ${nGpuLayers ?? '?'} GPU layers`);
      void prewarmNavigationPrefix(this.llm);
      return { nGpuLayers, imageMaxTokens, browserValidated, loadCaps };
    } finally {
      client.onProgress(() => {});
    }
  }

  hasCapture(): boolean {
    const c = this.#capture;
    if (!c) return false;
    return !!c.buffer?.byteLength || !!c.bufferPromise;
  }

  /** Drop the current screenshot. */
  clearCapture(): void {
    this.#capture = null;
    this.#captureGeneration += 1;
  }

  /** SnapDOM-capture the target root. */
  async capture(): Promise<OperatorCapture> {
    this.#syncToolDocument();
    const mark = this.#onPerfMark ?? (() => {});
    const captureRoot = this.#captureRoot();
    if (!captureRoot) throw new Error('Capture root not available');

    scrollToElement(captureRoot);
    const captureRect = captureRoot.getBoundingClientRect();
    const dpr = Math.min(CAPTURE_DPR_MAX, globalThis.devicePixelRatio ?? 1);
    mark('prepareCaptureTarget', `${Math.round(captureRect.width)}x${Math.round(captureRect.height)}px dpr=${dpr}`);

    const snapCanvas = await snapdomCaptureToCanvas(snapdom, captureRoot);
    mark('snapdom.toCanvas', `${snapCanvas.width}×${snapCanvas.height}`);

    const { width: cssWidth, height: cssHeight } = snapdomCanvasToCssSize(snapCanvas, dpr);
    const { canvas: resized, visionCrop, tokenTarget } = await prepareVisionCapture(snapCanvas, this.#model);
    mark('canvasToShowUISize', `${resized.width}×${resized.height}`);

    const bitmap = resized instanceof ImageBitmap ? resized : await createImageBitmap(resized);
    if (resized instanceof HTMLCanvasElement || resized instanceof OffscreenCanvas) {
      if (resized !== snapCanvas) {
        resized.width = 0;
        resized.height = 0;
      }
    } else if (resized instanceof ImageBitmap && resized !== bitmap) {
      resized.close();
    }
    mark('createImageBitmap', `${bitmap.width}×${bitmap.height}`);

    this.#captureGeneration += 1;
    const generation = this.#captureGeneration;
    const state: CaptureState = {
      buffer: null,
      bufferPromise: null,
      width: bitmap.width,
      height: bitmap.height,
      visionCrop: visionCrop ?? null,
    };
    this.#capture = state;

    state.bufferPromise = this.#encoder
      .encodeBitmap(bitmap, visionEncodeOpts())
      .then((encoded) => {
        if (!encoded?.ok || this.#capture !== state) return null;
        const ms = Math.round(encoded.perf?.totalMs ?? 0);
        mark('captureJpegEncodeDone', `${(encoded.buffer.byteLength / 1024).toFixed(0)} KiB ${ms}ms`);
        state.buffer = encoded.buffer;
        return encoded.buffer;
      })
      .catch(() => null);

    return {
      width: state.width,
      height: state.height,
      captureWidth: snapCanvas.width,
      captureHeight: snapCanvas.height,
      cssWidth,
      cssHeight,
      visionCrop: state.visionCrop,
      tokenTarget: tokenTarget ?? null,
      canvas: snapCanvas,
      generation,
      whenEncoded: state.bufferPromise,
    };
  }

  /** Remap vision-norm to capture-norm. */
  toCaptureNormPoint(point: GroundingPoint | null): GroundingPoint | null {
    if (!hasValidNormPoint(point)) return point ?? null;
    return remapVisionNormToCaptureNorm(point, this.#capture?.visionCrop) ?? point;
  }

  async #inferenceImage(shot: CaptureState): Promise<ArrayBuffer> {
    if (shot.buffer?.byteLength) return shot.buffer.slice(0);
    if (shot.bufferPromise) {
      await shot.bufferPromise;
      if (this.#capture === shot && shot.buffer?.byteLength) return shot.buffer.slice(0);
    }
    throw new Error('Capture buffer missing');
  }

  #requireCapture(): CaptureState {
    if (!this.#loaded) throw new Error(`Load ${this.#model.label} first.`);
    if (!this.hasCapture() || !this.#capture) throw new Error('Capture the page first.');
    return this.#capture;
  }

  /** Execute one action. */
  executeAction(nav: { action: string; value: string | null; point: GroundingPoint | null }): { ok: boolean; detail: string } {
    this.#syncToolDocument();
    return executeNavigationAction(nav);
  }

  /** Full instruct loop. */
  async instruct(task: string, options: InstructOptions = {}): Promise<InstructResult> {
    const shot = this.#requireCapture();
    const generation = this.#captureGeneration;
    const timeoutMs = options.timeoutMs ?? this.#inferenceTimeoutMs;
    const t0 = performance.now();
    this.#syncToolDocument();

    const image = await this.#inferenceImage(shot);
    const result = await withTimeout(
      runNavigation(this.llm, image, task, [], {
        width: shot.width,
        height: shot.height,
      }),
      timeoutMs,
      `${this.#model.label} navigation timed out after ${timeoutMs / 1000}s.`
    );
    if (this.#capture !== shot || this.#captureGeneration !== generation) {
      throw new Error('Capture changed during inference');
    }

    if (result.degenerate || !result.actions.length) {
      return { ok: false, degenerate: true, text: result.text, summary: '', inferMs: result.inferMs, wallMs: Math.round(performance.now() - t0), steps: [] };
    }

    const actions = result.actions;
    options.onBeforeExecute?.(actions);
    const steps: ExecutedStep[] = [];
    let allOk = true;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const nav = {
        action: action.action,
        value: action.value,
        point: action.point ? this.toCaptureNormPoint(action.point) : null,
      };
      options.onStatus?.(`${nav.action}${nav.value ? ` "${nav.value}"` : ''}`);
      await options.onBeforeStep?.(nav);
      const exec = this.executeAction(nav);
      allOk &&= exec.ok;
      const step: ExecutedStep = { ...nav, ok: exec.ok, detail: exec.detail };
      steps.push(step);
      options.onStep?.(step);
      if (!exec.ok) break;

      if (i < actions.length - 1 && UI_CHANGING_ACTIONS.has(action.action)) {
        options.onStatus?.('Observing…');
        const cap = await this.capture();
        await cap.whenEncoded;
        await options.onRecapture?.(cap);
      }
    }

    return { ok: allOk, degenerate: false, text: result.text, summary: actions.map((a) => a.action).join(' → '), inferMs: result.inferMs, wallMs: Math.round(performance.now() - t0), steps };
  }

  /** Locate element without execution. */
  async locate(label: string): Promise<LocateResult> {
    this.#syncToolDocument();
    const shot = this.#requireCapture();
    const image = await this.#inferenceImage(shot);
    const result = await locateLabel(this.llm, image, label, {
      timeoutMs: this.#inferenceTimeoutMs,
      visionSize: { width: shot.width, height: shot.height },
    });
    if (this.#capture !== shot) throw new Error('Capture changed during inference');
    if (!result.ok) return { ok: false, point: null, text: result.text, inferMs: result.inferMs };
    const point = this.toCaptureNormPoint(result.point);
    return { ok: hasValidNormPoint(point), point: point ? { x: point.x, y: point.y } : null, text: result.text, inferMs: result.inferMs };
  }

  /** Terminate workers. */
  dispose(): void {
    if (this.llm instanceof WllamaWorkerClient) this.llm.terminate();
    this.#encoder.terminate();
    this.#capture = null;
    this.#loaded = false;
  }
}

export function createWebOperator(options: WebOperatorOptions = {}): WebOperator {
  return new WebOperator(options);
}

export function createPromptApiOperator(options: WebOperatorOptions = {}): WebOperator {
  return new WebOperator({ ...options, native: true });
}
