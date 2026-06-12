import type { ModelCard } from './types.ts';

export const CONFIG: ModelCard = {
  id: 'UI-AGILE-2B',
  label: 'UI-AGILE-2B',
  hfUrl: 'https://huggingface.co/AGILE/UI-AGILE-2B',
  /** mradermacher quantizes as `UI-AGILE` (not `UI-AGILE-2B` filename). */
  ggufRepo: 'mradermacher/UI-AGILE-GGUF',
  source: {
    url: 'https://huggingface.co/mradermacher/UI-AGILE-GGUF/resolve/main/UI-AGILE.IQ4_XS.gguf',
    mmprojUrl: 'https://huggingface.co/mradermacher/UI-AGILE-GGUF/resolve/main/UI-AGILE.mmproj-Q8_0.gguf',
  },
  llmFileRe: /^UI-AGILE\.(IQ4|Q4|Q5|Q8).*\.gguf$/i,
  mmprojFileRe: /^UI-AGILE\.mmproj.*\.gguf$/i,
  n_ctx: 2048,
  n_gpu_layers: 99999,
  image_min_tokens: 256,
  image_max_tokens: 512,
  patch_size: 28,
};
