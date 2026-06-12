import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'UI-AGILE-3B',
  label: 'UI-AGILE-3B',
  hfUrl: 'https://huggingface.co/AGILE/UI-AGILE-3B',
  ggufRepo: 'mradermacher/UI-AGILE-3B-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/UI-AGILE-3B-GGUF/resolve/main/UI-AGILE-3B.Q4_K_M.gguf',
    mmprojUrl: 'https://huggingface.co/mradermacher/UI-AGILE-3B-GGUF/resolve/main/UI-AGILE-3B.mmproj-Q8_0.gguf',
  },
  llmFileRe: /^UI-AGILE-3B.*\.gguf$/i,
  mmprojFileRe: /mmproj.*\.gguf$/i,
  n_ctx: 2048,
  n_gpu_layers: 99999,
  image_min_tokens: 256,
  image_max_tokens: 512,
  patch_size: 28,
  cache_type_k: 'q4_0',
  cache_type_v: 'q4_0',
  flash_attn: true,
};
