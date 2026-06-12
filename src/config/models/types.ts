/** GGUF URLs — pre-cached under `/model-cache/` or registry HF fallback when downloading on demand. */
export interface ModelSource {
  url: string;
  mmprojUrl?: string;
}

export type KvCacheType = 'f32' | 'f16' | 'q8_0' | 'q5_1' | 'q5_0' | 'q4_1' | 'q4_0';

/** Registry model card — one GGUF-backed VL model (see src/config/models/*.ts). */
export interface ModelCard {
  id: string;
  label: string;
  hfUrl: string;
  source: ModelSource;
  /** HF repo for auto-resolve (scripts/cache-model.mjs). */
  ggufRepo?: string;
  mmprojRepo?: string;
  llmFileRe?: RegExp;
  mmprojFileRe?: RegExp;
  requiresHfToken?: boolean;
  n_ctx: number;
  n_gpu_layers: number;
  image_min_tokens: number;
  image_max_tokens: number;
  patch_size: number;
  offload_kqv?: boolean;
  cache_type_k?: KvCacheType;
  cache_type_v?: KvCacheType;
  flash_attn?: boolean;
  use_jinja?: boolean;
  use_wllama_cache?: boolean;
}
