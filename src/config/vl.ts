/**
 * Shared browser VL defaults (all registry models).
 * ShowUI-2B card-specific URLs and file patterns live in `models/ShowUI-2B.ts`.
 */

import type { KvCacheType, ModelCard } from './models/types.ts';
import { resolveWasmUrl, withAppBase } from '../util/app-base.ts';

export const WLLAMA_VERSION = '3.1.0';
/** Same-origin wllama WASM (respects Vite `base` on GitHub Pages). */
export const WASM_URL = withAppBase('wllama/wllama.wasm');
export { resolveWasmUrl };

/** Default registry model id (ShowUI-2B product default). */
export const DEFAULT_MODEL_ID = 'ShowUI-2B';

/** Qwen2-VL-style patch size — per-model override via `registry` `patch_size`. */
export const VL_PATCH_SIZE = 28;

/** Vision pixel bounds (256×28² … 1344×28²) when model card omits limits. */
export const VL_MIN_PIXELS = 256 * 28 * 28;
export const VL_MAX_PIXELS = 1344 * 28 * 28;

/** ~290 tokens on E2E capture; 512 halves KV vs 1024. */
export const N_CTX = 2048;

/** Offload all LLM layers to WebGPU (required for fast grounding). */
export const VL_N_GPU_LAYERS = 99_999;

/**
 * Keep K/V on CPU — offloading KQV with some VL stacks on WebGPU yields degenerate output.
 */
export const VL_OFFLOAD_KQV = false;

/** Single thread in nested WASM workers — avoids pthread aborts in browser workers. */
export const VL_N_THREADS = 1;

/**
 * llama.cpp log level for browser load (wllama default 2 = INFO).
 * 4 = ERROR only — hides warmup WARNING spam ("CLIP graph … memory … executed on the CPU").
 * Use `?llamaLog=1` to restore verbose native logs while debugging.
 */
export const VL_LLAMA_LOG_LEVEL = 4;

export function resolveLlamaLogLevel(search: string | URLSearchParams = ''): number {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.has('llamaLog') ? 2 : VL_LLAMA_LOG_LEVEL;
}

/**
 * Default vision token caps for browser WebGPU (registry may override per model).
 * Must stay below `N_CTX` minus system + query + decode (~300 tokens). 1024 vision + text exceeds 1024 ctx.
 * ggml-webgpu aborts when dispatch workgroups X > 65535 at very high token counts.
 */
export const VL_IMAGE_MAX_TOKENS = 672;
export const VL_IMAGE_MIN_TOKENS = 672;

/** 4B+ VL cards with 512+ vision tokens OOM in browser when CLIP graphs reserve on CPU. */
export const VL_HEAVY_IMAGE_MAX_TOKENS = 128;
export const VL_HEAVY_IMAGE_MIN_TOKENS = 128;

/** SnapDOM width cap — full iframe CSS width for sharp 1:1 screenshot display (vision resize is separate). */
export const MAX_CAPTURE_WIDTH = 1280;
export const CAPTURE_JPEG_QUALITY = 0.99;
/** Lossless vision handoff — sharper small CLICK labels on form snapshots. */
export const VISION_ENCODING: 'image/png' | 'image/jpeg' = 'image/png';

/** Worker/encode-worker options for the model vision bitmap. */
export function visionEncodeOpts() {
  return VISION_ENCODING === 'image/jpeg'
    ? { encoding: VISION_ENCODING, quality: CAPTURE_JPEG_QUALITY }
    : { encoding: VISION_ENCODING };
}
/** DPR cap for capture sizing. */
export const CAPTURE_DPR_MAX = 2;

export const AUTO_LOAD_MODEL = true;

/** One navigation inference must finish within this wall time (browser VL + WebGPU). */
export const INFERENCE_TIMEOUT_MS = 12_000;

export interface VlLoadParamOverrides {
  nGpuLayers?: number;
  nCtx?: number;
  nThreads?: number;
  jinja?: boolean;
  imageMinTokens?: number;
  imageMaxTokens?: number;
  offloadKqv?: boolean;
  flashAttn?: boolean;
  logLevel?: number;
  cacheTypeK?: KvCacheType;
  cacheTypeV?: KvCacheType;
}

/**
 * Shared wllama load params for GUI/VL grounding in the browser (WebGPU + stable KQV defaults).
 * Registry `src/config/models/*.ts` entries override `n_ctx`, vision tokens, etc.
 */
export function buildVlWllamaLoadParams(overrides: VlLoadParamOverrides = {}) {
  const nGpuLayers =
    typeof overrides.nGpuLayers === 'number' ? overrides.nGpuLayers : VL_N_GPU_LAYERS;
  if (nGpuLayers <= 0) {
    throw new Error(
      `n_gpu_layers=${nGpuLayers} — browser ShowUI requires WebGPU offload (use ${VL_N_GPU_LAYERS})`
    );
  }
  const offloadKqv = overrides.offloadKqv ?? (nGpuLayers > 0 ? VL_OFFLOAD_KQV : false);

  return {
    n_ctx: overrides.nCtx ?? N_CTX,
    n_gpu_layers: nGpuLayers,
    n_threads: overrides.nThreads ?? VL_N_THREADS,
    jinja: overrides.jinja !== false,
    image_min_tokens: overrides.imageMinTokens ?? VL_IMAGE_MIN_TOKENS,
    image_max_tokens: overrides.imageMaxTokens ?? VL_IMAGE_MAX_TOKENS,
    offload_kqv: offloadKqv,
    log_level: overrides.logLevel ?? VL_LLAMA_LOG_LEVEL,
    // Flash Attention requires KV offload on most backends (including WebGPU).
    flash_attn: (overrides.flashAttn ?? false) && offloadKqv,
    // KV f16 when LLM is on GPU — matches 0.0.1 (ShowUI keeps offload_kqv=false but still uses f16 KV).
    cache_type_k: overrides.cacheTypeK ?? (nGpuLayers > 0 ? 'f16' : undefined),
    cache_type_v: overrides.cacheTypeV ?? (nGpuLayers > 0 ? 'f16' : undefined),
    nGpuLayers,
    nThreads: overrides.nThreads ?? VL_N_THREADS,
  };
}
