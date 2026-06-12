import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'MAI-UI-2B',
  label: 'MAI-UI-2B (Zoom In)',
  hfUrl: 'https://huggingface.co/Alibaba-Tongyi/MAI-UI-2B',
  ggufRepo: 'mradermacher/MAI-UI-2B-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/MAI-UI-2B-GGUF/resolve/main/MAI-UI-2B.Q4_K_M.gguf',
    mmprojUrl: 'https://huggingface.co/mradermacher/MAI-UI-2B-GGUF/resolve/main/MAI-UI-2B.mmproj-Q8_0.gguf',
  },
  llmFileRe: /^MAI-UI-2B.*\.gguf$/i,
  mmprojFileRe: /mmproj.*\.gguf$/i,
  n_ctx: 2048,
  n_gpu_layers: 99999,
  image_min_tokens: 256,
  image_max_tokens: 512,
  patch_size: 28,
  cache_type_k: 'q4_0',
  cache_type_v: 'q4_0',
  flash_attn: true,
  use_wllama_cache: true,
};
