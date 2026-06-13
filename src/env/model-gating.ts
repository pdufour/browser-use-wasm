/**
 * Model load gating — which registry models can load in this browser and with
 * what caps. Experimental cards default to Node-scale settings; browser loads
 * are capped to avoid multi-GB vision graph allocations (OOM).
 */

import {
  DEFAULT_MODEL_ID,
  N_CTX,
  VL_IMAGE_MAX_TOKENS,
  VL_IMAGE_MIN_TOKENS,
  VL_HEAVY_IMAGE_MAX_TOKENS,
  VL_HEAVY_IMAGE_MIN_TOKENS,
} from '../config/vl.ts';
import type { KvCacheType, ModelCard } from '../config/models/types.ts';

/** Registry models that need the heavy browser vision cap (load + capture). */
export function isBrowserHeavyVlModel(
  model: Partial<Pick<ModelCard, 'id' | 'image_max_tokens' | 'source'>> | null | undefined
): boolean {
  if (!model?.id) return false;
  if (model.source?.url === 'native') return false;
  const cardMax = model.image_max_tokens ?? 0;
  return cardMax >= 512 || /(?:^|-)(3B|4B|8B|13B|14B|35B)(?:$|-)/i.test(model.id);
}

/**
 * `?benchmark=1` (or `?allowExperimental=1`) signals "user explicitly opted in"
 * and suppresses the experimental advisory toast. Loading itself is no longer gated.
 */
export function allowExperimentalVlLoadInBrowser(
  search: string | URLSearchParams = ''
): boolean {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.has('benchmark') || params.get('allowExperimental') === '1';
}

/**
 * Any registry model with an id may load in the browser. The hard gate that
 * required `?benchmark=1` for non-default models is gone; non-validated models
 * surface a non-blocking advisory via `experimentalLoadAdvisory`. The Playwright
 * gate (`BROWSER_VALIDATED_MODEL_IDS` in `models/registry.ts`) is unchanged.
 */
export function canLoadVlModelInBrowser(
  model: { id?: string } | null | undefined,
  _search: string | URLSearchParams = ''
): boolean {
  return !!model?.id;
}

/**
 * Retained for compatibility — the runtime no longer hard-blocks experimental
 * loads, so this always returns `null`. Callers should use
 * `experimentalLoadAdvisory` for the non-blocking warning.
 */
export function browserLoadBlockReason(
  _model: { id?: string; label?: string } | null | undefined,
  _search: string | URLSearchParams = ''
): string | null {
  return null;
}

/**
 * Non-blocking advisory shown when loading a model that is not in
 * `BROWSER_VALIDATED_MODEL_IDS`. Returns `null` for the validated default or
 * when the user has explicitly opted in via `?benchmark=1`.
 */
export function experimentalLoadAdvisory(
  model: { id?: string; label?: string } | null | undefined,
  search: string | URLSearchParams = ''
): string | null {
  if (!model?.id || model.id === DEFAULT_MODEL_ID) return null;
  if (allowExperimentalVlLoadInBrowser(search)) return null;
  return `${model.label ?? model.id} is experimental — ~5GB RAM. Loading anyway.`;
}

export interface ModelLoadCaps {
  nCtx: number;
  imageMinTokens: number;
  imageMaxTokens: number;
  flashAttn: boolean;
  cacheTypeK: KvCacheType | undefined;
  cacheTypeV: KvCacheType | undefined;
}

/**
 * Experimental registry models default to 1024 ctx / 512 vision tokens (Node-scale).
 * Browser loads use ShowUI-2B caps to avoid multi-GB vision graph alloc (OOM).
 */
export function resolveModelLoadCaps(
  model: ModelCard,
  { browserValidated = false }: { browserValidated?: boolean } = {}
): ModelLoadCaps {
  if (browserValidated) {
    return {
      nCtx: model.n_ctx,
      imageMinTokens: model.image_min_tokens,
      imageMaxTokens: model.image_max_tokens,
      flashAttn: model.flash_attn === true,
      cacheTypeK: model.cache_type_k,
      cacheTypeV: model.cache_type_v,
    };
  }
  const heavy = isBrowserHeavyVlModel(model);
  return {
    nCtx: N_CTX,
    imageMinTokens: heavy ? VL_HEAVY_IMAGE_MIN_TOKENS : VL_IMAGE_MIN_TOKENS,
    imageMaxTokens: heavy ? VL_HEAVY_IMAGE_MAX_TOKENS : VL_IMAGE_MAX_TOKENS,
    flashAttn: false,
    cacheTypeK: 'f16',
    cacheTypeV: 'f16',
  };
}
