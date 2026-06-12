import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'Qwen2.5-VL-3B-Instruct',
  label: 'Qwen2.5-VL-3B-Instruct',
  hfUrl: 'https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct',
  ggufRepo: 'mradermacher/Qwen2.5-VL-3B-Instruct-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct.Q4_K_M.gguf',
    mmprojUrl: 'https://huggingface.co/mradermacher/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct.mmproj-fp16.gguf',
  },
  llmFileRe: /^Qwen2.5-VL-3B-Instruct.*\.gguf$/i,
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
