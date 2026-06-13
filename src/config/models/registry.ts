import { DEFAULT_MODEL_ID } from '../vl.ts';
import type { ModelCard } from './types.ts';
import { CONFIG as ShowUI2B } from './ShowUI-2B.ts';
import { CONFIG as GUIG23B } from './GUI-G2-3B.ts';
import { CONFIG as MAIUI2B } from './MAI-UI-2B.ts';
import { CONFIG as UIVenus152B } from './UI-Venus-1-5-2B.ts';
import { CONFIG as KVGroundGuiOwl154B } from './KV-Ground-GuiOwl1.5-4B.ts';
import { CONFIG as KVGroundGuiOwl2B } from './KV-Ground-GuiOwl-2B.ts';
import { CONFIG as KVGroundQwen3VL4B } from './KV-Ground-Qwen3VL-4B.ts';
import { CONFIG as UIAGILE3B } from './UI-AGILE-3B.ts';
import { CONFIG as UIAGILE2B } from './UI-AGILE-2B.ts';
import { CONFIG as Qwen25VL3BInstruct } from './Qwen2.5-VL-3B-Instruct.ts';
import { CONFIG as GeminiNano } from './Gemini-Nano.ts';

export type { ModelCard, ModelSource } from './types.ts';

export const MODELS: ModelCard[] = [
  {
    ...ShowUI2B,
    id: 'ShowUI-2B',
    label: 'ShowUI-2B (Original)',
    ggufRepo: 'localattention/ShowUI-2B-Q4_K_M-GGUF',
    mmprojRepo: 'ggml-org/Qwen2-VL-2B-Instruct-GGUF',
  },
  GeminiNano,
  GUIG23B,
  MAIUI2B,
  UIVenus152B,
  KVGroundGuiOwl154B,
  KVGroundGuiOwl2B,
  KVGroundQwen3VL4B,
  UIAGILE3B,
  UIAGILE2B,
  Qwen25VL3BInstruct,
];

/** All registry ids (GGUF-backed). */
export const MODEL_IDS = MODELS.map((m) => m.id);

export function getModelById(id: string | null | undefined): ModelCard {
  if (!id) return MODELS[0];
  const found = MODELS.find((m) => m.id === id);
  if (!found) {
    console.warn(
      `[models] Unknown model id "${id}" — available: ${MODELS.map((m) => m.id).join(', ')}. Using ${MODELS[0].id}.`
    );
    return MODELS[0];
  }
  return found;
}

export function getCurrentModel(forcedId: string | null = null): ModelCard {
  const params = new URLSearchParams(
    typeof location !== 'undefined' ? location.search : ''
  );
  const id = forcedId || params.get('model');
  return getModelById(id);
}

/** Models that download without HF_TOKEN (see scripts/verify-model-urls.mjs). */
export const PUBLIC_CACHE_MODEL_IDS = MODELS.filter((m) => !m.requiresHfToken).map(
  (m) => m.id
);

export { DEFAULT_MODEL_ID };

/**
 * Production gate model(s) — chosen after `npm run test:benchmark`, not by default E2E.
 * Others stay experimental in the switcher until promoted here.
 */
export const BROWSER_VALIDATED_MODEL_IDS = [DEFAULT_MODEL_ID, 'gemini-nano'];

/** Playwright gate model — must match `BROWSER_VALIDATED_MODEL_IDS[0]` (see `blackbox-e2e.mdc`). */
export const E2E_MODEL_ID = DEFAULT_MODEL_ID;
