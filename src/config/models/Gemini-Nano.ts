import type { ModelCard } from './types.ts';
import { SHOWUI_IMAGE_MIN_TOKENS, SHOWUI_IMAGE_MAX_TOKENS } from './ShowUI-2B.ts';
import { VL_PATCH_SIZE } from '../vl.ts';

/**
 * Gemini Nano (via Chrome Prompt API).
 * Virtual card — vision sizing matches ShowUI nav so capture prep is identical.
 */
export const CONFIG: ModelCard = {
  id: 'gemini-nano',
  label: 'Gemini Nano (Built-in)',
  hfUrl: 'native',
  source: {
    url: 'native',
  },
  n_ctx: 32768,
  n_gpu_layers: 0,
  image_min_tokens: SHOWUI_IMAGE_MIN_TOKENS,
  image_max_tokens: SHOWUI_IMAGE_MAX_TOKENS,
  patch_size: VL_PATCH_SIZE,
};
