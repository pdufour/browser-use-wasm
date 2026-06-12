import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'UI-Venus-1-5-2B',
  label: 'UI-Venus-1.5-2B',
  hfUrl: 'https://huggingface.co/VenusAI/UI-Venus-1-5-2B',
  ggufRepo: 'noctrex/UI-Venus-1.5-2B-GGUF',
  source: {
    url: 'https://huggingface.co/noctrex/UI-Venus-1.5-2B-GGUF/resolve/main/UI-Venus-1.5-2B-Q4_K_M.gguf',
    mmprojUrl: 'https://huggingface.co/noctrex/UI-Venus-1.5-2B-GGUF/resolve/main/mmproj-F16.gguf',
  },
  llmFileRe: /^UI-Venus-1[.-]5-2B.*\.gguf$/i,
  mmprojFileRe: /mmproj.*\.gguf$/i,
  /** Card defaults for CLI; browser load clamps to vl-config N_CTX / 256 tokens. */
  n_ctx: 2048,
  n_gpu_layers: 99999,
  image_min_tokens: 256,
  image_max_tokens: 512,
  patch_size: 28,
  offload_kqv: false,
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  flash_attn: false,
  use_wllama_cache: true,
};
