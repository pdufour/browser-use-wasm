/**
 * ShowUI-2B model card (registry entry + HF cache URLs).
 * Shared app / worker defaults: `config/vl.js`.
 */

import type { ModelCard, ModelSource } from './types.ts';
import {
  DEFAULT_MODEL_ID,
  N_CTX,
  VL_N_GPU_LAYERS,
  VL_N_THREADS,
  VL_IMAGE_MIN_TOKENS,
  VL_IMAGE_MAX_TOKENS,
  VL_PATCH_SIZE,
  VL_OFFLOAD_KQV,
  buildVlWllamaLoadParams,
} from '../vl.ts';

export {
  WLLAMA_VERSION,
  WASM_URL,
  DEFAULT_MODEL_ID,
  INFERENCE_TIMEOUT_MS,
  MAX_CAPTURE_WIDTH,
  CAPTURE_DPR_MAX,
  AUTO_LOAD_MODEL,
  N_CTX,
  buildVlWllamaLoadParams,
  VL_PATCH_SIZE,
  VL_MIN_PIXELS,
  VL_MAX_PIXELS,
  VL_N_GPU_LAYERS,
  VL_OFFLOAD_KQV,
  VL_N_THREADS,
  VL_IMAGE_MIN_TOKENS,
  VL_IMAGE_MAX_TOKENS,
} from '../vl.ts';

/** @deprecated Use `DEFAULT_MODEL_ID`. */
export const SHOWUI_MODEL_ID = DEFAULT_MODEL_ID;

export const SHOWUI_MODEL_LABEL = 'ShowUI-2B';
export const SHOWUI_HF_URL = 'https://huggingface.co/showlab/ShowUI-2B';

/** @see https://huggingface.co/showlab/ShowUI-2B */
export const SHOWUI_LLM_FILE_RE = /^showui-2b.*\.gguf$/i;

/** ShowUI-2B requires this vision projector family — not interchangeable with arbitrary VL mmproj. */
export const SHOWUI_MMPROJ_FILE_RE = /mmproj.*vl.*\.gguf$/i;

/** Reject known non-ShowUI VL GGUF filenames (0.0.1 guard). */
export const SHOWUI_FORBIDDEN_WEIGHT_RE =
  /lfm|moondream|llava|smolvlm|minicpm-v|internvl|bakllava|llama-.*-vision|gemma-.*-it.*vl/i;

/**
 * Fallback HF URLs for ShowUI-2B when auto-resolve is unavailable.
 * @see https://huggingface.co/showlab/ShowUI-2B
 */
export const SHOWUI_MODEL_SOURCE: ModelSource = {
  url: 'https://huggingface.co/localattention/ShowUI-2B-Q4_K_M-GGUF/resolve/main/showui-2b-q4_k_m.gguf',
  mmprojUrl:
    'https://huggingface.co/ggml-org/Qwen2-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen2-VL-2B-Instruct-Q8_0.gguf',
};

export function assertShowUIModelSource(source: { url: string; mmprojUrl?: string }): void {
  const llmFile = new URL(source.url).pathname.split('/').pop() ?? '';
  if (!SHOWUI_LLM_FILE_RE.test(llmFile)) {
    throw new Error(
      `Only ${DEFAULT_MODEL_ID} is supported (expected showui-2b*.gguf, got "${llmFile}"). Run: npm run cache:showui`
    );
  }
  if (SHOWUI_FORBIDDEN_WEIGHT_RE.test(llmFile)) {
    throw new Error(`Refusing non-ShowUI weights "${llmFile}".`);
  }
  if (source.mmprojUrl) {
    const mmprojFile = new URL(source.mmprojUrl).pathname.split('/').pop() ?? '';
    if (!SHOWUI_MMPROJ_FILE_RE.test(mmprojFile)) {
      throw new Error(
        `Invalid vision projector for ShowUI-2B (expected mmproj-*vl*.gguf, got "${mmprojFile}").`
      );
    }
    if (SHOWUI_FORBIDDEN_WEIGHT_RE.test(mmprojFile)) {
      throw new Error(`Refusing non-ShowUI mmproj "${mmprojFile}".`);
    }
  }
}

/** @deprecated Use `VL_PATCH_SIZE` from `vl-config.js`. */
export const SHOWUI_PATCH_SIZE = VL_PATCH_SIZE;
/** @deprecated Use `VL_MIN_PIXELS` / `VL_MAX_PIXELS`. */
export const SHOWUI_MIN_PIXELS = 256 * 28 * 28;
export const SHOWUI_MAX_PIXELS = 1344 * 28 * 28;
/** @deprecated Use `VL_N_GPU_LAYERS`. */
export const SHOWUI_N_GPU_LAYERS = VL_N_GPU_LAYERS;
/** @deprecated Use `VL_OFFLOAD_KQV`. */
export const SHOWUI_OFFLOAD_KQV = VL_OFFLOAD_KQV;
/** @deprecated Use `VL_N_THREADS`. */
export const SHOWUI_N_THREADS = VL_N_THREADS;

/** ShowUI-2B ctx — above shared {@link N_CTX} for vision headroom. */
export const SHOWUI_N_CTX = 2048;
/**
 * ShowUI-2B @ 2048 ctx — 672 default; up to 960 on tall captures (wider patch
 * grid, near-full-page band). ~1050-token encodes crash the browser CLIP graph
 * (WASM `unreachable`), so the cap stays below that ceiling.
 */
export const SHOWUI_IMAGE_MIN_TOKENS = 960;
export const SHOWUI_IMAGE_MAX_TOKENS = 960;

/** ShowUI-2B registry card (default model). */
export const CONFIG: ModelCard = {
  id: DEFAULT_MODEL_ID,
  label: SHOWUI_MODEL_LABEL,
  hfUrl: SHOWUI_HF_URL,
  source: SHOWUI_MODEL_SOURCE,
  llmFileRe: SHOWUI_LLM_FILE_RE,
  mmprojFileRe: SHOWUI_MMPROJ_FILE_RE,
  n_ctx: SHOWUI_N_CTX,
  n_gpu_layers: VL_N_GPU_LAYERS,
  image_min_tokens: SHOWUI_IMAGE_MIN_TOKENS,
  image_max_tokens: SHOWUI_IMAGE_MAX_TOKENS,
  patch_size: VL_PATCH_SIZE,
  offload_kqv: VL_OFFLOAD_KQV,
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  flash_attn: false,
  use_jinja: true,
  use_wllama_cache: true,
};

/** @deprecated Use `buildVlWllamaLoadParams`. */
export const buildShowUIWllamaLoadParams = buildVlWllamaLoadParams;
