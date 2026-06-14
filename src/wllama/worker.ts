import './browser-shim.ts';
import { jspiDiagnostics, logJspiSupport } from './jspi-shim.ts';
import { buildVlWllamaLoadParams, DEFAULT_MODEL_ID } from '../config/vl.ts';
import { getCurrentModel } from '../config/models/registry.ts';
import { resolveRegistryModelSourceDetailed } from './model-sources.ts';
import { createPerfTracker } from '../util/perf.ts';
import type { LoadModelParams, DownloadOptions, ChatCompletionMessage } from '@wllama/wllama';

declare const self: DedicatedWorkerGlobalScope & {
  __WLLAMA_DEBUG_TEMPLATE?: boolean;
};

type WllamaInstance = import('@wllama/wllama').Wllama;
type WllamaCtor = typeof import('@wllama/wllama').Wllama;

/** wllama runtime accepts vision-token caps that its published types omit. */
type VlWorkerLoadOptions = LoadModelParams &
  DownloadOptions & {
    useCache?: boolean;
    image_min_tokens?: number;
    image_max_tokens?: number;
  };

let wllama: WllamaInstance | null = null;
let Wllama: WllamaCtor | null = null;
let currentWasmUrl: string | null = null;

function ensureDomPolyfill(baseURI?: string): void {
  if (typeof globalThis.document === 'undefined') {
    (globalThis as { document?: { baseURI: string } }).document = {
      baseURI: baseURI || self.location.href,
    };
  }
}

function reply(id: string, payload: Record<string, unknown>, transfer: Transferable[] = []): void {
  self.postMessage({ id, ...payload }, transfer);
}

function hasWebGpu(): boolean {
  return !!(navigator as Navigator & { gpu?: unknown }).gpu;
}

logJspiSupport('wllama-worker:init');

// llama.cpp's chat-template self-test prints rendered template dumps to stdout on every load
// (`parser generation prompt:`, `--- Reasoning & Content Structure ---`, `--- Tool Call Structure ---`,
// `Sequence(Literal[<|im_start|>…`). These are baked into wllama.wasm and surface via Emscripten
// `print` -> wllama worker -> WllamaConfig.logger.log. Filter only those known-noise lines; keep
// debug/warn/error untouched so genuine llama.cpp issues still surface. Set `self.__WLLAMA_DEBUG_TEMPLATE = true`
// (in the worker scope) to disable the filter when actively debugging template work.
const CHAT_TEMPLATE_NOISE_RE =
  /<\|im_(?:start|end)\|>|^\s*parser generation prompt:|^\s*---\s*(?:Reasoning|Tool Call|Content Structure)|^\s*Sequence\(Literal\[/;

function isChatTemplateNoise(args: unknown[]): boolean {
  if (!Array.isArray(args) || args.length === 0) return false;
  const first = args[0];
  if (typeof first !== 'string') return false;
  return CHAT_TEMPLATE_NOISE_RE.test(first);
}

const quietWllamaLogger = {
  debug: (...args: unknown[]) => {
    if (!self.__WLLAMA_DEBUG_TEMPLATE && isChatTemplateNoise(args)) return;
    console.debug(...args);
  },
  log: (...args: unknown[]) => {
    if (!self.__WLLAMA_DEBUG_TEMPLATE && isChatTemplateNoise(args)) return;
    console.log(...args);
  },
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let wllamaModuleImportMs = 0;

async function getWllamaModule(): Promise<WllamaCtor> {
  if (!Wllama) {
    const t0 = performance.now();
    ({ Wllama } = await import('@wllama/wllama'));
    wllamaModuleImportMs = performance.now() - t0;
  }
  return Wllama;
}

/** Create or reuse the WASM runtime (model weights loaded separately via loadModelFromUrl). */
async function ensureWllama(wasmUrl: string, baseURI?: string): Promise<WllamaInstance> {
  ensureDomPolyfill(baseURI);
  const WllamaClass = await getWllamaModule();

  if (wllama && currentWasmUrl === wasmUrl) {
    return wllama;
  }

  if (wllama) {
    try {
      await wllama.exit();
    } catch {
      /* ignore */
    }
    wllama = null;
    loadedModelId = null;
    loadedNGpuLayers = undefined;
  }

  wllama = new WllamaClass({ default: wasmUrl }, { logger: quietWllamaLogger });
  currentWasmUrl = wasmUrl;

  if (!wllama.isSupportWebGPU()) {
    throw new Error(
      'WebGPU is required (Chrome/Edge). Enable GPU acceleration and use a browser with WebGPU + JSPI support.'
    );
  }
  return wllama;
}

/** Drop loaded GGUF + vision state; keep WASM runtime for a faster model switch. */
async function unloadCurrentModel(): Promise<void> {
  if (!wllama) return;
  try {
    await wllama.exit();
  } catch {
    /* ignore */
  }
  wllama = null;
  loadedModelId = null;
  loadedNGpuLayers = undefined;
}

let loadedNGpuLayers: number | undefined;
let loadedModelId: string | null = null;

let isProcessing = false;
self.onmessage = async (event: MessageEvent) => {
  if (isProcessing) {
    console.warn('[wllama-worker] Concurrent message received, waiting...');
    const tStart = Date.now();
    while (isProcessing) {
      if (Date.now() - tStart > 30000) {
        console.error('[wllama-worker] Lock timeout, forcing release');
        isProcessing = false;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  isProcessing = true;
  const { id, type, baseURI, ...data } = event.data;

  try {
    ensureDomPolyfill(baseURI);

    if (type === 'probe') {
      logJspiSupport('wllama-worker:probe');
      reply(id, { ok: true, webgpu: hasWebGpu(), jspi: jspiDiagnostics() });
      return;
    }

    if (type === 'load') {
      const modelId = data.modelId || DEFAULT_MODEL_ID;

      const perf = createPerfTracker('Model load (worker)');

      perf.mark('ensureWllama');
      let instance = await ensureWllama(data.wasmUrl, baseURI);
      perf.mark('ensureWllama done', `import ${wllamaModuleImportMs.toFixed(0)} ms`);

      const model = getCurrentModel(modelId);
      if (loadedModelId === modelId) {
        perf.mark('skipReload', 'already loaded');
        reply(id, {
          ok: true,
          webgpu: true,
          nGpuLayers: loadedNGpuLayers,
          imageMaxTokens: model.image_max_tokens,
          perf: perf.toJSON(),
        });
        return;
      }
      if (loadedModelId && loadedModelId !== modelId) {
        perf.mark('unloadPreviousModel');
        await unloadCurrentModel();
        instance = await ensureWllama(data.wasmUrl, baseURI);
        perf.mark('unloadPreviousModel done');
      }
      perf.mark('resolveModelSource');
      const { source, origin } = await resolveRegistryModelSourceDetailed(baseURI, modelId);
      const llmFile = source.url.split('/').pop() ?? source.url;
      const mmprojFile = source.mmprojUrl?.split('/').pop() ?? 'none';
      perf.mark('resolveModelSource done', `${modelId} origin=${origin} llm=${llmFile}`);
      console.info(
        `[worker:load] origin=${origin} llm=${llmFile} mmproj=${mmprojFile}`
      );

      // Pre-cached same-origin GGUFs must use wllama cache/OPFS — copying 1GB+ into heapfs hits offset OOB.
      const useCache = data.useCache !== false;
      if (!useCache) {
        try {
          await instance.modelManager.clear();
          perf.mark('clearModelCache');
        } catch {
          /* ignore */
        }
      }

      const useJinja = model.use_jinja === true && data.jinja !== false;
      const loadParams = buildVlWllamaLoadParams({
        nGpuLayers: data.nGpuLayers,
        nCtx: data.nCtx,
        nThreads: data.nThreads,
        jinja: useJinja,
        imageMinTokens: data.imageMinTokens,
        imageMaxTokens: data.imageMaxTokens,
        offloadKqv: data.offloadKqv,
        flashAttn: data.flashAttn,
        cacheTypeK: data.cacheTypeK,
        cacheTypeV: data.cacheTypeV,
        logLevel: data.logLevel,
      });
      loadedNGpuLayers = loadParams.nGpuLayers;
      perf.mark('loadModelFromUrl', `n_gpu_layers=${loadParams.n_gpu_layers}`);
      const deviceMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      console.info(
        `[worker:load] ${modelId} n_ctx=${loadParams.n_ctx} vision_tokens=${loadParams.image_min_tokens}-${loadParams.image_max_tokens} n_gpu_layers=${loadParams.n_gpu_layers} crossOriginIsolated=${globalThis.crossOriginIsolated} deviceMemory=${deviceMem ?? '?'}GB`
      );
      if (loadParams.n_gpu_layers <= 0) {
        throw new Error(
          'n_gpu_layers=0 — check src/config/vl.js VL_N_GPU_LAYERS (must be 99999, not 0)'
        );
      }

      const loadOptions: VlWorkerLoadOptions = {
        n_ctx: loadParams.n_ctx,
        n_gpu_layers: loadParams.n_gpu_layers,
        n_threads: loadParams.n_threads,
        jinja: loadParams.jinja,
        image_min_tokens: loadParams.image_min_tokens,
        image_max_tokens: loadParams.image_max_tokens,
        offload_kqv: loadParams.offload_kqv,
        flash_attn: loadParams.flash_attn,
        cache_type_k: loadParams.cache_type_k,
        cache_type_v: loadParams.cache_type_v,
        log_level: loadParams.log_level as LoadModelParams['log_level'],
        useCache,
        progressCallback: ({ loaded, total }) => {
          self.postMessage({ type: 'progress', loaded, total });
        },
      };
      await instance.loadModelFromUrl(source, loadOptions);
      perf.mark('loadModelFromUrl done');
      loadedModelId = modelId;
      logJspiSupport('wllama-worker:load');

      reply(id, {
        ok: true,
        webgpu: true,
        nGpuLayers: loadedNGpuLayers,
        imageMaxTokens: loadParams.image_max_tokens,
        perf: perf.toJSON(),
      });
      return;
    }

    // Generic chat completion: the caller builds the full message array (text +
    // image parts) and sampling params; this worker only runs wllama. Prompt
    // construction and output parsing live in `src/actions/`.
    if (type === 'completion') {
      if (!wllama) {
        throw new Error('Model not loaded');
      }
      const messages = data.messages as ChatCompletionMessage[];
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('completion requires a non-empty messages array');
      }
      const sampling = (data.sampling ?? {}) as Record<string, unknown>;

      const t0 = performance.now();
      const response = await wllama.createChatCompletion({
        messages,
        ...sampling,
        stream: false,
      });
      const inferMs = performance.now() - t0;
      const text = response.choices[0]?.message?.content ?? '';
      console.log(`[worker:completion] ${inferMs.toFixed(1)}ms text=${JSON.stringify(text)}`);
      reply(id, {
        ok: true,
        text,
        nGpuLayers: loadedNGpuLayers,
        inferMs,
      });
      return;
    }

    reply(id, { ok: false, message: `Unknown message type: ${type}` });
  } catch (err) {
    console.error('[wllama-worker]', err);
    const msg = err instanceof Error ? err.message : String(err);
    const oom = /insufficient memory|failed to allocate buffer|gallocr_reserve/i.test(msg);
    const fatal =
      oom ||
      /abort|unreachable|workgroup|65535|ggml_webgpu|insufficient memory|alloc|offset is out of bounds|corrupt|invalid.*gguf/i.test(
        msg
      );
    if (fatal) {
      try {
        await wllama?.modelManager?.clear();
      } catch {
        /* ignore */
      }
      if (!oom) {
        try {
          await wllama?.exit();
        } catch {
          /* poisoned WebGPU context */
        }
      }
      wllama = null;
      loadedModelId = null;
      loadedNGpuLayers = undefined;
    }
    reply(id, {
      ok: false,
      message: oom
        ? 'Vision warmup ran out of RAM (~5GB reserve). Use ShowUI-2B, or ?benchmark=1 with 8GB+ free tabs closed.'
        : /workgroup|65535/i.test(msg)
          ? 'WebGPU vision limit exceeded — capture again, then reload the model if needed.'
          : msg,
    });
  } finally {
    isProcessing = false;
  }
};
