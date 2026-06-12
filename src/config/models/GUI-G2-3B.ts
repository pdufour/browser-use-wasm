import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'GUI-G2-3B',
  label: 'GUI-G²-3B (Gaussian Reward)',
  hfUrl: 'https://huggingface.co/inclusionAI/GUI-G2-3B',
  ggufRepo: 'mradermacher/GUI-G2-3B-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/GUI-G2-3B-GGUF/resolve/main/GUI-G2-3B.Q4_K_M.gguf',
    mmprojUrl: 'https://huggingface.co/mradermacher/GUI-G2-3B-GGUF/resolve/main/GUI-G2-3B.mmproj-Q8_0.gguf',
  },
  llmFileRe: /^GUI-G2-3B.*\.gguf$/i,
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
