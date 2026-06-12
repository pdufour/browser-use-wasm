/**
 * Embed API: instruct a webpage to do something and the library does the rest.
 *
 * ```ts
 * import { createWebOperator } from '…';
 *
 * const operator = createWebOperator({ captureRoot: () => document.body });
 * await operator.load();
 * await operator.instruct('type paul in the email field');
 * ```
 *
 * One instruct = SnapDOM capture → one ShowUI navigation inference (browser WASM
 * worker) → execute every parsed action from that generation on the live page.
 * Coordinates come from the model on the screenshot only — never from DOM layout.
 */

import { snapdom } from '@zumer/snapdom';
import { WllamaWorkerClient, CaptureWorkerClient } from './wllama/client.ts';
import { snapdomCaptureToCanvas, snapdomCanvasToCssSize } from './snapdom/capture.ts';
import { prepareVisionCapture, remapVisionNormToCaptureNorm } from './snapdom/vision-resize.ts';
import type { VisionCropRect } from './snapdom/vision-resize.ts';
import { runNavigation, prewarmNavigationPrefix } from './actions/navigation.ts';
import type { NavigationAction } from './actions/navigation.ts';
import { executeNavigationAction } from './actions/execute.ts';
import { locateLabel, hasValidNormPoint, withTimeout } from './actions/locate.ts';
import type { GroundingPoint } from './actions/parse-coords.ts';
import {
  WASM_URL,
  CAPTURE_DPR_MAX,
  INFERENCE_TIMEOUT_MS,
  visionEncodeOpts,
  VL_LLAMA_LOG_LEVEL,
} from './config/vl.ts';
import { resolveModelLoadCaps } from './env/model-gating.ts';
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
  /** Same-origin wllama WASM URL (default `/wllama/wllama.wasm`). */
  wasmUrl?: string;
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
  readonly llm: WllamaWorkerClient;
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
    this.#model = getModelById(options.modelId ?? DEFAULT_MODEL_ID);
    this.#wasmUrl = options.wasmUrl ?? WASM_URL;
    this.#captureRoot =
      options.captureRoot ?? (() => (typeof document !== 'undefined' ? document.body : null));
    this.#inferenceTimeoutMs = options.inferenceTimeoutMs ?? INFERENCE_TIMEOUT_MS;
    this.#onPerfMark = options.onPerfMark ?? null;
    this.#targetDocument = options.targetDocument ?? null;
    this.#syncToolDocument();
    this.llm = new WllamaWorkerClient();
    this.#encoder = new CaptureWorkerClient();
  }

  /**
   * Re-point the dom-actions module at this operator's target document.
   * That module keeps the resolver in module state, which dev-server HMR
   * resets on re-eval while this operator instance is persisted across hot
   * updates — so it is re-applied before every capture / locate / execute.
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

  /** Switch the registry model; the worker must be loaded again. */
  setModel(modelId: string): ModelCard {
    this.#model = getModelById(modelId);
    this.#loaded = false;
    return this.#model;
  }

  /** Terminate and replace the inference worker (e.g. after a corrupt load). */
  recreateWorker(): void {
    this.llm.terminate();
    this.#loaded = false;
    // readonly for callers, swapped on recovery only
    (this as { llm: WllamaWorkerClient }).llm = new WllamaWorkerClient();
  }

  /** Probe the inference worker's environment (WebGPU availability). */
  async probe(): Promise<{ webgpu: boolean }> {
    const result = await this.llm.probe(this.#wasmUrl);
    return { webgpu: !!result.webgpu };
  }

  /** Load GGUF weights in the browser WASM worker (`/model-cache/` or HF download on demand). */
  async load(options: OperatorLoadOptions = {}): Promise<OperatorLoadResult> {
    const model = this.#model;
    const browserValidated = BROWSER_VALIDATED_MODEL_IDS.includes(model.id);
    const loadCaps = resolveModelLoadCaps(model, { browserValidated });
    options.onStatus?.(`Loading ${model.label}…`);
    if (options.onProgress) this.llm.onProgress(options.onProgress);
    try {
      const { nGpuLayers, imageMaxTokens } = await this.llm.load(this.#wasmUrl, {
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
      // Fire-and-forget: prefill the shared navigation system prompt into the
      // worker KV cache so the first task inference skips ~half the text prefill.
      void prewarmNavigationPrefix(this.llm);
      return { nGpuLayers, imageMaxTokens, browserValidated, loadCaps };
    } finally {
      if (options.onProgress) {
        this.llm.onProgress(() => {});
      }
    }
  }

  hasCapture(): boolean {
    const c = this.#capture;
    if (!c) return false;
    return !!c.buffer?.byteLength || !!c.bufferPromise;
  }

  /** Drop the current screenshot (next instruct needs a fresh capture). */
  clearCapture(): void {
    this.#capture = null;
    this.#captureGeneration += 1;
  }

  /**
   * SnapDOM-capture the target root, resize to the model's vision budget, and
   * encode the inference image off the main thread.
   */
  async capture(): Promise<OperatorCapture> {
    this.#syncToolDocument();
    const mark = this.#onPerfMark ?? (() => {});
    const captureRoot = this.#captureRoot();
    if (!captureRoot) throw new Error('Capture root not available');

    // Capture what the user sees: inner scrollers keep their position (SnapDOM
    // preserves scroll state), so below-the-fold targets can be scrolled into
    // view and then grounded on the screenshot. Only the window is aligned so
    // the capture box sits at the viewport origin.
    scrollToElement(captureRoot);
    const captureRect = captureRoot.getBoundingClientRect();
    const dpr = Math.min(CAPTURE_DPR_MAX, globalThis.devicePixelRatio ?? 1);
    mark(
      'prepareCaptureTarget',
      `${Math.round(captureRect.width)}x${Math.round(captureRect.height)}px dpr=${dpr}`
    );

    const snapCanvas = await snapdomCaptureToCanvas(snapdom, captureRoot);
    mark('snapdom.toCanvas', `${snapCanvas.width}×${snapCanvas.height}`);

    const { width: cssWidth, height: cssHeight } = snapdomCanvasToCssSize(snapCanvas, dpr);

    const { canvas: resized, visionCrop, tokenTarget } = await prepareVisionCapture(
      snapCanvas,
      this.#model
    );
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

    // encodeBitmap transfers the bitmap to the encode worker.
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
    mark('captureJpegEncodeQueued');

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

  /** Model coords are on the vision crop; remap to full capture norm space. */
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
    throw new Error('Capture buffer missing — capture the page again, then run the task.');
  }

  #requireCapture(): CaptureState {
    if (!this.#loaded) {
      throw new Error(`Load ${this.#model.label} first.`);
    }
    if (!this.hasCapture() || !this.#capture) {
      throw new Error('Capture the page first.');
    }
    return this.#capture;
  }

  /** Execute one capture-norm navigation action on the live page. */
  executeAction(nav: {
    action: string;
    value: string | null;
    point: GroundingPoint | null;
  }): { ok: boolean; detail: string } {
    this.#syncToolDocument();
    return executeNavigationAction(nav);
  }

  /**
   * One ShowUI navigation inference + execution (model-card UI Navigation mode):
   * the model may emit a comma-separated action sequence in one decode pass
   * (e.g. CLICK → INPUT → ENTER); each step runs on the page in card order.
   */
  async instruct(task: string, options: InstructOptions = {}): Promise<InstructResult> {
    const shot = this.#requireCapture();
    const generation = this.#captureGeneration;
    const timeoutMs = options.timeoutMs ?? this.#inferenceTimeoutMs;
    const t0 = performance.now();
    this.#syncToolDocument();

    const image = await this.#inferenceImage(shot);
    const result = await withTimeout(
      runNavigation(this.llm, image, task),
      timeoutMs,
      `${this.#model.label} navigation timed out after ${timeoutMs / 1000}s.`
    );
    if (this.#capture !== shot || this.#captureGeneration !== generation) {
      throw new Error('Capture changed during inference — run again on the latest screenshot.');
    }

    if (result.degenerate || !result.actions.length) {
      return {
        ok: false,
        degenerate: true,
        text: result.text,
        summary: '',
        inferMs: result.inferMs,
        wallMs: Math.round(performance.now() - t0),
        steps: [],
      };
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

      const more = i < actions.length - 1;
      if (more && UI_CHANGING_ACTIONS.has(action.action)) {
        options.onStatus?.('Observing…');
        const cap = await this.capture();
        const buffer = await cap.whenEncoded;
        if (!buffer) throw new Error('Re-capture failed between actions.');
        await options.onRecapture?.(cap);
      }
    }

    return {
      ok: allOk,
      degenerate: false,
      text: result.text,
      summary: actions.map((a) => a.action).join(' → '),
      inferMs: result.inferMs,
      wallMs: Math.round(performance.now() - t0),
      steps,
    };
  }

  /**
   * Locate a UI element on the current screenshot via one navigation inference
   * (`click <label>`) without executing anything.
   */
  async locate(label: string): Promise<LocateResult> {
    this.#syncToolDocument();
    const shot = this.#requireCapture();
    const image = await this.#inferenceImage(shot);
    const result = await locateLabel(this.llm, image, label, {
      timeoutMs: this.#inferenceTimeoutMs,
      timeoutMessage:
        `${this.#model.label} inference timed out after ${this.#inferenceTimeoutMs / 1000}s. ` +
        'Check WebGPU (Chrome/Edge), reload the model, capture again.',
    });
    if (this.#capture !== shot) {
      throw new Error('Capture changed during inference — run again on the latest screenshot.');
    }
    if (!result.ok) return { ok: false, point: null, text: result.text, inferMs: result.inferMs };
    const point = this.toCaptureNormPoint(result.point);
    return {
      ok: hasValidNormPoint(point),
      point: point ? { x: point.x, y: point.y } : null,
      text: result.text,
      inferMs: result.inferMs,
    };
  }

  /** Terminate both workers. */
  dispose(): void {
    this.llm.terminate();
    this.#encoder.terminate();
    this.#capture = null;
    this.#loaded = false;
  }
}

export function createWebOperator(options: WebOperatorOptions = {}): WebOperator {
  return new WebOperator(options);
}
