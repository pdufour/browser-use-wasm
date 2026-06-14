import { buildVlWllamaLoadParams } from '../config/vl.ts';
import type { VlLoadParamOverrides } from '../config/vl.ts';
import type { KvCacheType } from '../config/models/types.ts';
import type { PerfSnapshot } from '../util/perf.ts';
import type { EncodeWorkerSuccess } from '../snapdom/encode-worker.ts';
import type { JspiDiagnostics } from './jspi-shim.ts';
import type { ChatCompletionMessage } from '@wllama/wllama';

/**
 * RPC to dedicated workers — model inference never runs on the main thread.
 * This client is model-agnostic: it loads GGUF weights and runs generic chat
 * completions. Prompt building / output parsing live in `src/actions/`.
 */

/** Sampling params forwarded verbatim to `wllama.createChatCompletion`. */
export interface CompletionSampling {
  max_tokens?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  stop?: number[];
}

// --- RPC requests (client → worker). Field names match the runtime payloads exactly. ---

export interface WorkerRequestBase {
  id: string;
  baseURI: string;
}

export interface ProbeRequest extends WorkerRequestBase {
  type: 'probe';
  wasmUrl: string;
}

export interface LoadRequest extends WorkerRequestBase {
  type: 'load';
  wasmUrl: string;
  useCache: boolean;
  modelId?: string;
  nGpuLayers: number;
  nCtx: number;
  nThreads: number;
  jinja: boolean;
  imageMinTokens: number;
  imageMaxTokens: number;
  offloadKqv: boolean;
  flashAttn: boolean;
  cacheTypeK?: KvCacheType;
  cacheTypeV?: KvCacheType;
  logLevel: number;
}

export interface CompletionRequest extends WorkerRequestBase {
  type: 'completion';
  messages: ChatCompletionMessage[];
  sampling: CompletionSampling;
}

export type WorkerRequest = ProbeRequest | LoadRequest | CompletionRequest;

// --- RPC responses (worker → client). ---

export interface WorkerProgressMessage {
  type: 'progress';
  loaded: number;
  total: number;
}

export interface WorkerPerfMessage {
  type: 'perf';
  id: string;
  perf: PerfSnapshot;
  phase?: 'prewarm';
}

interface WorkerReplyBase {
  /** Result replies never carry `type` — only progress/perf stream messages do. */
  type?: never;
  id: string;
}

export interface WorkerFailure extends WorkerReplyBase {
  ok: false;
  message?: string;
}

export interface ProbeResult extends WorkerReplyBase {
  ok: true;
  webgpu: boolean;
  jspi?: JspiDiagnostics;
}

export interface LoadResult extends WorkerReplyBase {
  ok: true;
  webgpu: boolean;
  nGpuLayers?: number;
  imageMaxTokens?: number;
  perf?: PerfSnapshot;
}

/** Raw generation from one generic completion call. */
export interface CompletionResult extends WorkerReplyBase {
  ok: true;
  text: string;
  nGpuLayers?: number;
  inferMs: number;
}

export type WorkerResultMessage =
  | ProbeResult
  | LoadResult
  | CompletionResult
  | WorkerFailure;

export type WorkerResponse = WorkerProgressMessage | WorkerPerfMessage | WorkerResultMessage;

/** Client adds the RPC round-trip wall time to every resolved result. */
export type RpcResult<T> = T & { rpcRoundTripMs: number };

type PerfCallback = (perf: PerfSnapshot) => void;

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  onPerf?: PerfCallback | null;
  postedAt: number;
  type: WorkerRequest['type'];
}

interface PendingEncode {
  resolve: (value: EncodeWorkerSuccess) => void;
  reject: (reason: Error) => void;
}

function rejectPending(
  pending: Map<string, { reject: (reason: Error) => void }>,
  message: string
): void {
  for (const { reject } of pending.values()) {
    reject(new Error(message));
  }
  pending.clear();
}

export class WllamaWorkerClient {
  #worker: Worker;
  #pending = new Map<string, PendingRpc>();
  #seq = 0;
  #onProgress: ((opts: { loaded: number; total: number }) => void) | null = null;
  #onPerf: ((opts: { id: string; perf: PerfSnapshot }) => void) | null = null;

  constructor() {
    this.#worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    this.#worker.onmessage = (event) => this.#handleMessage(event.data);
    this.#worker.onerror = (event) => {
      for (const { reject } of this.#pending.values()) {
        reject(new Error(event.message || 'Worker error'));
      }
      this.#pending.clear();
    };
  }

  onProgress(cb: (opts: { loaded: number; total: number }) => void): void {
    this.#onProgress = cb;
  }

  onPerf(cb: (opts: { id: string; perf: PerfSnapshot }) => void): void {
    this.#onPerf = cb;
  }

  async probe(wasmUrl: string): Promise<RpcResult<ProbeResult>> {
    return this.#call<RpcResult<ProbeResult>>('probe', { wasmUrl });
  }

  async load(
    wasmUrl: string,
    opts: VlLoadParamOverrides & { useCache?: boolean; modelId?: string } = {}
  ): Promise<RpcResult<LoadResult>> {
    const { useCache = true, modelId, ...overrides } = opts;
    const built = buildVlWllamaLoadParams(overrides);
    return this.#call<RpcResult<LoadResult>>('load', {
      wasmUrl,
      useCache,
      modelId,
      nGpuLayers: built.nGpuLayers,
      nCtx: built.n_ctx,
      nThreads: built.nThreads,
      jinja: built.jinja,
      imageMinTokens: built.image_min_tokens,
      imageMaxTokens: built.image_max_tokens,
      offloadKqv: built.offload_kqv,
      flashAttn: built.flash_attn,
      cacheTypeK: built.cache_type_k,
      cacheTypeV: built.cache_type_v,
      logLevel: built.log_level,
    });
  }

  /**
   * Generic chat completion in the worker. Messages may contain image parts
   * (`{ type: 'image', data: ArrayBuffer }`); buffers are structured-cloned so
   * the caller keeps its copy.
   */
  async completion(
    messages: ChatCompletionMessage[],
    sampling: CompletionSampling = {}
  ): Promise<RpcResult<CompletionResult>> {
    return this.#call<RpcResult<CompletionResult>>('completion', { messages, sampling });
  }

  terminate(): void {
    rejectPending(this.#pending, 'Wllama worker terminated');
    this.#worker.terminate();
  }

  #call<T>(
    type: WorkerRequest['type'],
    data: Record<string, unknown>,
    transfer: Transferable[] = [],
    onPerf: PerfCallback | null = null
  ): Promise<T> {
    const id = String(++this.#seq);
    const tPost = performance.now();
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, onPerf, postedAt: tPost, type });
      this.#worker.postMessage(
        { id, type, baseURI: globalThis.location.href, ...data },
        transfer
      );
    });
  }

  #handleMessage(msg: WorkerResponse): void {
    if (msg.type === 'progress') {
      this.#onProgress?.({ loaded: msg.loaded, total: msg.total });
      return;
    }

    if (msg.type === 'perf') {
      const pending = this.#pending.get(msg.id);
      pending?.onPerf?.(msg.perf);
      this.#onPerf?.({ id: msg.id, perf: msg.perf });
      return;
    }

    const pending = this.#pending.get(msg.id);
    if (!pending) return;
    this.#pending.delete(msg.id);

    if (msg.ok === false) {
      pending.reject(new Error(msg.message || 'Worker request failed'));
      return;
    }

    pending.resolve({
      ...msg,
      rpcRoundTripMs: performance.now() - pending.postedAt,
    });
  }
}

export class CaptureWorkerClient {
  #worker: Worker;
  #pending = new Map<string, PendingEncode>();

  constructor() {
    this.#worker = new Worker(new URL('../snapdom/encode-worker.ts', import.meta.url), {
      type: 'module',
    });
    this.#worker.onmessage = (event) => {
      const msg = event.data;
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      if (msg.ok === false) {
        pending.reject(new Error(msg.message || 'Capture worker failed'));
      } else {
        pending.resolve(msg);
      }
    };
    this.#worker.onerror = (event) => {
      for (const { reject } of this.#pending.values()) {
        reject(new Error(event.message || 'Capture worker error'));
      }
      this.#pending.clear();
    };
  }

  encodeBitmap(
    bitmap: ImageBitmap,
    opts: { encoding?: 'image/png' | 'image/jpeg'; quality?: number } = {}
  ): Promise<EncodeWorkerSuccess> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage(
        { id, bitmap, encoding: opts.encoding ?? 'image/png', quality: opts.quality ?? 0.85 },
        [bitmap]
      );
    });
  }

  terminate(): void {
    rejectPending(this.#pending, 'Capture worker terminated');
    this.#worker.terminate();
  }
}
