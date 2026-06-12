import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'KV-Ground-Qwen3VL-4B',
  label: 'KV-Ground-Qwen3VL-4B (ZoomIn)',
  hfUrl: 'https://huggingface.co/KV-Ground/KV-Ground-Qwen3VL-4B',
  /** Public GGUF is the Qwen3-VL base quant, not the fine-tuned HF checkpoint. */
  ggufRepo: 'mradermacher/KV-Ground-4B-BaseQw3vl-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/KV-Ground-4B-BaseQw3vl-GGUF/resolve/main/KV-Ground-4B-BaseQw3vl.IQ4_XS.gguf',
    mmprojUrl:
      'https://huggingface.co/mradermacher/KV-Ground-4B-BaseQw3vl-GGUF/resolve/main/KV-Ground-4B-BaseQw3vl.mmproj-Q8_0.gguf',
  },
  llmFileRe: /^KV-Ground-4B-BaseQw3vl\.(IQ4|Q4|Q5|Q8).*\.gguf$/i,
  mmprojFileRe: /^KV-Ground-4B-BaseQw3vl\.mmproj.*\.gguf$/i,
  n_ctx: 2048,
  n_gpu_layers: 99999,
  image_min_tokens: 256,
  image_max_tokens: 1024,
  patch_size: 14,
  cache_type_k: 'q4_0',
  cache_type_v: 'q4_0',
  flash_attn: true,
};
