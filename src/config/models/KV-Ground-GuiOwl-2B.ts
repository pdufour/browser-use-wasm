import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'KV-Ground-GuiOwl-2B',
  label: 'GUI-Owl-1.5-2B (KV-Ground 2B has no GGUF)',
  hfUrl: 'https://huggingface.co/KV-Ground/KV-Ground-GuiOwl-2B',
  /** KV-Ground-GuiOwl-2B has no public GGUF — use GUI-Owl-1.5-2B-Instruct quant. */
  ggufRepo: 'mradermacher/GUI-Owl-1.5-2B-Instruct-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/GUI-Owl-1.5-2B-Instruct-GGUF/resolve/main/GUI-Owl-1.5-2B-Instruct.Q4_K_M.gguf',
    mmprojUrl:
      'https://huggingface.co/mradermacher/GUI-Owl-1.5-2B-Instruct-GGUF/resolve/main/GUI-Owl-1.5-2B-Instruct.mmproj-Q8_0.gguf',
  },
  llmFileRe: /^GUI-Owl-1\.5-2B-Instruct\.(IQ4|Q4|Q5|Q8).*\.gguf$/i,
  mmprojFileRe: /^GUI-Owl-1\.5-2B-Instruct\.mmproj.*\.gguf$/i,
  n_ctx: 2048,
  n_gpu_layers: 99999,
  image_min_tokens: 256,
  image_max_tokens: 512,
  patch_size: 28,
  offload_kqv: false,
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  flash_attn: false,
  use_jinja: true,
  use_wllama_cache: true,
};
